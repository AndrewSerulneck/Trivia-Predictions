#!/usr/bin/env node
/* Free re-score of the "multi-answer" check (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3d).
 *
 *   node --env-file=.env.local scripts/rescore-speed-trivia-checks.cjs            dry run
 *   node --env-file=.env.local scripts/rescore-speed-trivia-checks.cjs --apply    writes the undo log, then the scores
 *   node --env-file=.env.local scripts/rescore-speed-trivia-checks.cjs --undo <log.json> [--apply]
 *
 * Reads the stored scores that carry the multi-answer flag (one bounded query), recomputes only that flag and the
 * composite score from the stored grades (familiar, fun, estCorrect, model flags). No provider call. Writes through
 * speed_trivia_review_set_audience, which accepts only waiting questions whose content still matches. A score whose
 * question changed since it was graded is skipped.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const audience = require('../lib/speed-trivia-quality/audience.cjs');

const COLUMNS = 'id,question,options,correct_answer,category,difficulty,status,question_pool,answer_format,image_url,image_context,created_at,speed_generation_metadata';
const FLAG = 'multi-answer';
const IN_CHUNK = 100;
const WRITE_CHUNK = 200;
const PLAN = 'docs/speed-trivia-backlog-and-quality-plan';

const parseArgs = argv => {
  const args = { apply: false, undo: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--undo') args.undo = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (argv.includes('--undo') && !args.undo) throw new Error('--undo needs a log file.');
  return args;
};

/** Mirrors speed_trivia_audience_key() in SQL. Only exact for string-array options; anything else returns null. */
const audienceKey = row => {
  if (!Array.isArray(row.options) || row.options.some(option => typeof option !== 'string')) return null;
  const options = `[${row.options.map(option => JSON.stringify(option)).join(', ')}]`;
  return crypto.createHash('md5').update([row.question, options, String(row.correct_answer), row.category ?? '', row.image_url ?? '',
    row.image_context == null ? '' : JSON.stringify(row.image_context)].join('\u001f')).digest('hex');
};

// The version this free re-score produces: the Phase 3d list-check fix. Later scorer versions (bar-test-v3, D26) change
// the model prompt, which a free re-score can't apply, so it never stamps them.
const RESCORE_VERSION = 'bar-test-v2.1';

/** The score as it would read today, or null when nothing changes. Only the multi-answer flag is re-derived. */
const rescored = (row, stored) => {
  const flags = new Set(stored.flags.filter(flag => flag !== FLAG));
  if (audience.preChecks(row).includes(FLAG)) flags.add(FLAG);
  const next = { ...stored, flags: [...flags].sort() };
  next.score = audience.compositeScore({ familiar: stored.familiar, fun: stored.fun, estCorrect: stored.estCorrect, flags: next.flags });
  if (next.score === stored.score && next.flags.join() === stored.flags.join()) return null;
  // Only older scores take the 2.1 stamp; a v3/v4 score keeps its version (4c.4, review #6).
  if (/^bar-test-v[012](\.\d+)?$/.test(String(stored.version ?? 'bar-test-v2'))) next.version = RESCORE_VERSION;
  return next;
};

const readMarks = async client => {
  const { data, error } = await client.from('speed_trivia_review_marks').select('row_id,audience').contains('audience', { flags: [FLAG] });
  if (error) throw new Error(error.message);
  return data;
};

const readRows = async (client, ids) => {
  const rows = new Map();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await client.from('trivia_questions').select(COLUMNS).in('id', ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    for (const row of data) rows.set(row.id, row);
  }
  return rows;
};

const writeScores = async (client, entries) => {
  const totals = { written: 0, skipped: 0 };
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    const { data, error } = await client.rpc('speed_trivia_review_set_audience', { p_rows: entries.slice(i, i + WRITE_CHUNK) });
    if (error) throw new Error(error.message);
    totals.written += Number(data.written) || 0;
    totals.skipped += Number(data.skipped) || 0;
  }
  return totals;
};

const plan = async client => {
  const marks = await readMarks(client);
  const rows = await readRows(client, marks.map(mark => mark.row_id));
  const changes = [], kept = [], skipped = [];
  for (const { row_id: id, audience: stored } of marks) {
    const row = rows.get(id);
    if (!row || row.status !== 'pending_review') { skipped.push({ id, why: 'not waiting' }); continue; }
    const key = audienceKey(row);
    if (!key || key !== stored.key) { skipped.push({ id, why: 'changed since graded' }); continue; }
    const next = rescored(row, stored);
    const entry = { id, question: row.question, answer: Array.isArray(row.options) ? row.options[row.correct_answer] ?? row.correct_answer : row.correct_answer, contentHash: core.contentHash(row), before: stored, after: next };
    (next ? changes : kept).push(entry);
  }
  return { checked: marks.length, changes, kept, skipped };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const client = clientFromEnv();
  if (args.undo) {
    const log = JSON.parse(fs.readFileSync(args.undo, 'utf8'));
    const entries = log.changes.map(({ id, contentHash, before }) => ({ id, contentHash, audience: before }));
    console.log(`${entries.length} scores to put back from ${args.undo}.`);
    if (!args.apply) { console.log('Dry run. Add --apply.'); return; }
    console.log(JSON.stringify(await writeScores(client, entries)));
    return;
  }
  const result = await plan(client);
  for (const c of result.changes) console.log(`${c.before.score}→${c.after.score} ${c.after.flags.includes(FLAG) ? 'still flagged' : 'unflagged'} | ${c.question} => ${c.answer}`);
  console.log(JSON.stringify({ checked: result.checked, change: result.changes.length, unchanged: result.kept.length, skipped: result.skipped }));
  if (!args.apply || !result.changes.length) { if (!args.apply) console.log('Dry run. Add --apply.'); return; }
  const date = new Date().toISOString().slice(0, 10);
  const logPath = `${PLAN}_PHASE_3D_RESCORE_LOG_${date}.json`;
  fs.writeFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), version: RESCORE_VERSION, undo: `node --env-file=.env.local scripts/rescore-speed-trivia-checks.cjs --undo ${logPath} --apply`, changes: result.changes }, null, 1));
  console.log(`Undo log: ${logPath}`);
  console.log(JSON.stringify(await writeScores(client, result.changes.map(({ id, contentHash, after }) => ({ id, contentHash, audience: after })))));
};

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parseArgs, audienceKey, rescored };
