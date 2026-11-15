#!/usr/bin/env node
/* Retire every Speed Trivia question in one category (docs/speed-trivia-backlog-and-quality-plan.md Phase 0).
 *
 *   node --env-file=.env.local scripts/retire-speed-trivia-category.cjs --category "Literary Landscapes" \
 *     --status pending_review,active            # dry run: counts only, no writes
 *   ... --apply                                 # writes the before-state undo log, then status='deleted'
 *   ... --undo docs/<log>.json                  # dry run: how many logged rows are still retired
 *   ... --undo docs/<log>.json --apply --max-dollars 10   # PAID: restores them to pending_review
 *
 * Retire = the same plain status='deleted' update Question Review's Delete makes (the database guard allows a
 * status-only retirement). Speed Trivia only (anytime_blitz + multiple_choice).
 * Un-retiring is guarded: it must pass signed admission (restore), a full-bank repeat check at ~$0.03 per row.
 * Undo therefore restores to pending_review only; formerly active rows are re-approved in Question Review.
 */
const fs = require('node:fs');
const path = require('node:path');
const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
const { createSession, createBudget } = require('../lib/speed-trivia-uniqueness/runtime.cjs');

const POOL = 'anytime_blitz';
const FORMAT = 'multiple_choice';
const ALLOWED_STATUSES = new Set(['pending_review', 'active']);
const PAGE = 1000;
const CHUNK = 100;

const parseArgs = argv => {
  const args = { category: '', statuses: ['pending_review'], apply: false, undo: '', maxDollars: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--category') args.category = String(argv[++i] ?? '').trim();
    else if (arg === '--status') args.statuses = String(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--undo') args.undo = String(argv[++i] ?? '').trim();
    else if (arg === '--max-dollars') args.maxDollars = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.undo && !args.category) throw new Error('--category is required.');
  if (args.undo && args.apply && !(args.maxDollars > 0)) throw new Error('--undo --apply needs --max-dollars (paid repeat check).');
  if (!args.statuses.length || args.statuses.some(s => !ALLOWED_STATUSES.has(s))) throw new Error('--status must be pending_review and/or active.');
  return args;
};

const readCategory = async (client, category, statuses) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from('trivia_questions').select('*')
      .eq('question_pool', POOL).eq('answer_format', FORMAT).eq('category', category).in('status', statuses)
      .order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
};

const countByStatus = rows => rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});

const chunks = list => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

// Only rows still in their logged status change; anything edited since is left alone and reported.
const retireIds = async (client, ids, fromStatus) => {
  let changed = 0;
  for (const part of chunks(ids)) {
    const { data, error } = await client.from('trivia_questions').update({ status: 'deleted' })
      .in('id', part).eq('status', fromStatus).eq('question_pool', POOL).eq('answer_format', FORMAT).select('id');
    if (error) throw new Error(error.message);
    changed += data.length;
  }
  return changed;
};

const logPathFor = date => path.resolve(`docs/speed-trivia-backlog-and-quality-plan_PHASE_0_RETIRE_LOG_${date}.json`);

const retire = async ({ client, category, statuses, apply, now = new Date() }) => {
  const rows = await readCategory(client, category, statuses);
  const before = countByStatus(rows);
  if (!apply) return { mode: 'dry-run', category, statuses, matched: rows.length, before };
  if (!rows.length) return { mode: 'apply', category, statuses, matched: 0, before, retired: 0 };
  const logPath = logPathFor(now.toISOString().slice(0, 10));
  if (fs.existsSync(logPath)) throw new Error(`Undo log already exists: ${logPath}`);
  // The before-state log is written before any row changes.
  fs.writeFileSync(logPath, JSON.stringify({ version: 'speed-trivia-category-retire-v1', createdAt: now.toISOString(), category, statuses, before, rows }, null, 2) + '\n', { flag: 'wx' });
  let retired = 0;
  for (const status of statuses) retired += await retireIds(client, rows.filter(r => r.status === status).map(r => r.id), status);
  const after = countByStatus(await readCategory(client, category, [...ALLOWED_STATUSES, 'deleted']));
  return { mode: 'apply', category, statuses, matched: rows.length, before, retired, after, logPath };
};

const undo = async ({ client, logFile, apply, maxDollars, sessionFactory = createSession }) => {
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  if (log.version !== 'speed-trivia-category-retire-v1' || !Array.isArray(log.rows)) throw new Error('Not a category retire log.');
  const ids = log.rows.map(r => r.id);
  const current = [];
  for (const part of chunks(ids)) {
    const { data, error } = await client.from('trivia_questions').select('*').in('id', part).eq('status', 'deleted').eq('question_pool', POOL);
    if (error) throw new Error(error.message);
    current.push(...data);
  }
  const summary = { category: log.category, logged: ids.length, stillRetired: current.length, reapproveInQuestionReview: log.rows.filter(r => r.status === 'active').length };
  if (!apply) return { mode: 'undo-dry-run', ...summary };
  // Restore = signed admission against the whole bank. A repeat or uncertain row stays retired.
  const session = await sessionFactory({ client, budget: createBudget({ dollars: maxDollars }) });
  const restored = [], refused = [];
  for (const row of current) {
    try { await session.write({ status: 'pending_review' }, { existing: row, restore: true }); restored.push(row.id); }
    catch (error) {
      refused.push({ id: row.id, code: error?.code ?? 'error' });
      if (error?.code === 'budget_exhausted') break;
    }
  }
  return { mode: 'undo', ...summary, restored: restored.length, refused, budget: session.budget.summary() };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const client = clientFromEnv();
  const result = args.undo ? await undo({ client, logFile: args.undo, apply: args.apply, maxDollars: args.maxDollars }) : await retire({ client, ...args });
  console.log(JSON.stringify(result, null, 2));
};

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

module.exports = { parseArgs, retire, undo };
