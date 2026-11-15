#!/usr/bin/env node
/* Speed Trivia "bar test" for the waiting backlog (docs/speed-trivia-backlog-and-quality-plan.md, Phase 2).
 *
 *   node --env-file=.env.local scripts/score-speed-trivia-backlog.cjs
 *       dry run: how many waiting questions need a score, and the estimated cost. Free.
 *   ... --calibrate --max-dollars 0.25 [--model gemini-2.5-flash-lite]
 *       PAID (cents): scores a fixed labelled set (approved = keep, recent rows Andrew deleted = reject) and prints
 *       agreement at each threshold. Writes docs/<plan>_PHASE_2_CALIBRATION_[<version>_]<model>_<date>.json.
 *   ... --score --max-dollars 2 --out <file.json> [--model ...] [--limit N]
 *       PAID: scores every waiting question not already in <file.json>, appending as it goes (resumable).
 *   ... --write <file.json> [--apply]
 *       Free: stores the scores via speed_trivia_review_set_audience (dry run without --apply). A score is stored
 *       only while the question is still waiting with the same content it was scored on.
 *
 * Never rejects or approves anything. Speed Trivia only (anytime_blitz + multiple_choice).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const { createBudget } = require('../lib/speed-trivia-uniqueness/runtime.cjs');
const { RATES } = require('../lib/speed-trivia-uniqueness/gemini.cjs');
const audience = require('../lib/speed-trivia-quality/audience.cjs');

const POOL = 'anytime_blitz';
const FORMAT = 'multiple_choice';
const PAGE = 1000;
const BATCH = 40;
const WRITE_CHUNK = 200;
const CONCURRENCY = 4;
const PLAN = 'docs/speed-trivia-backlog-and-quality-plan';
const COLUMNS = 'id,question,options,correct_answer,category,difficulty,status,question_pool,answer_format,image_url,image_context,created_at,speed_generation_metadata';

const parseArgs = argv => {
  const args = { mode: 'dry', model: 'gemini-2.5-flash', maxDollars: 0, out: '', write: '', apply: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--calibrate') args.mode = 'calibrate';
    else if (arg === '--score') args.mode = 'score';
    else if (arg === '--write') { args.mode = 'write'; args.write = String(argv[++i] ?? ''); }
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--model') args.model = String(argv[++i] ?? '');
    else if (arg === '--max-dollars') args.maxDollars = Number(argv[++i]);
    else if (arg === '--out') args.out = String(argv[++i] ?? '');
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!RATES[args.model]) throw new Error(`--model must be one of ${Object.keys(RATES).join(', ')}.`);
  if ((args.mode === 'calibrate' || args.mode === 'score') && !(args.maxDollars > 0 && args.maxDollars <= 5)) {
    throw new Error('Paid modes need --max-dollars (0 < n ≤ 5).');
  }
  if (args.mode === 'score' && !args.out) throw new Error('--score needs --out <file.json>.');
  if (args.mode === 'write' && !args.write) throw new Error('--write needs a file.');
  if (!(args.limit > 0)) throw new Error('--limit must be positive.');
  return args;
};

const readRows = async (client, status, filter = query => query) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(client.from('trivia_questions').select(COLUMNS)
      .eq('question_pool', POOL).eq('answer_format', FORMAT).eq('status', status).neq('category', 'Literary Landscapes'))
      .order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
};

/** Stable pseudo-random order, so the calibration sample is the same on every run. */
const sample = (rows, seed, count) => rows
  .map(row => [crypto.createHash('sha256').update(`${seed}:${row.id}`).digest('hex'), row])
  .sort((a, b) => a[0].localeCompare(b[0])).slice(0, count).map(([, row]) => row);

const estimate = (rows, model) => {
  const rate = RATES[model];
  const calls = Math.ceil(rows.length / BATCH);
  const systemBytes = Buffer.byteLength(audience.SYSTEM);
  const itemBytes = rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify({ id: '40', category: row.category, q: row.question, options: row.options, answer: row.options[row.correct_answer] })), 0);
  // ~4 bytes per token for English JSON; ~45 output tokens per graded question.
  const input = (calls * systemBytes + itemBytes) / 4;
  const output = rows.length * 45;
  return { calls, inputTokens: Math.round(input), outputTokens: output, dollars: (input * rate.input + output * rate.output) / 1e6 };
};

/** Scores rows in batches with bounded concurrency. A failed batch is retried once, then skipped (rerun to fill). */
const scoreAll = async (rows, { model, maxDollars, onBatch = () => {} }) => {
  const budget = createBudget({ dollars: maxDollars, inputTokens: 4_000_000, outputTokens: 2_000_000, requests: 1000, elapsedMs: 50 * 60_000 });
  const scorer = audience.createAudienceScorer({ model, apiKey: process.env.GEMINI_API_KEY, budget });
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
  const results = [];
  const failures = [];
  let next = 0;
  let stopped = null;
  const worker = async () => {
    while (next < batches.length && !stopped) {
      const batch = batches[next++];
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const scored = await scorer.scoreBatch(batch);
          results.push(...scored);
          onBatch(scored, budget.summary());
          break;
        } catch (error) {
          if (error?.code === 'budget_exhausted') { stopped = error.message; return; }
          if (attempt === 2) failures.push({ ids: batch.map(row => row.id), error: String(error?.message ?? error) });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { results, failures, stopped, usage: budget.summary(), modelVersion: scorer.modelVersion };
};

const CALIBRATION_THRESHOLDS = [2, 3, 4];

/** "Reject at or below t": how many keeps it would lose and how many rejects it would catch. */
const confusion = (scored, labels) => CALIBRATION_THRESHOLDS.map(t => {
  const cell = { threshold: `score <= ${t}`, keepLost: 0, keepTotal: 0, rejectCaught: 0, rejectTotal: 0 };
  for (const { id, audience: a } of scored) {
    const label = labels.get(id);
    if (label === 'keep') { cell.keepTotal++; if (a.score <= t) cell.keepLost++; }
    if (label === 'reject') { cell.rejectTotal++; if (a.score <= t) cell.rejectCaught++; }
  }
  return cell;
});

const distribution = (scored, ids) => {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { id, audience: a } of scored) if (ids.has(id)) counts[a.score]++;
  return counts;
};

const calibrate = async (client, args) => {
  const exampleQuestions = new Set(audience.EXAMPLES.map(e => core.exactKey(e.q)));
  const notExample = row => !exampleQuestions.has(core.exactKey(row.question));
  const active = (await readRows(client, 'active')).filter(notExample);
  const deleted = await readRows(client, 'deleted');
  const olderActive = active.filter(row => !row.speed_generation_metadata);
  const keep = [];
  for (const category of [...new Set(olderActive.map(row => row.category))].sort()) {
    keep.push(...sample(olderActive.filter(row => row.category === category), 'calibration-keep', 25));
  }
  const reject = deleted.filter(row => row.speed_generation_metadata);
  const recentApproved = active.filter(row => row.speed_generation_metadata);
  const olderDeleted = sample(deleted.filter(row => !row.speed_generation_metadata), 'calibration-older-deleted', 80);
  const labels = new Map([
    ...keep.map(row => [row.id, 'keep']), ...reject.map(row => [row.id, 'reject']),
    ...recentApproved.map(row => [row.id, 'recent-approved']), ...olderDeleted.map(row => [row.id, 'older-deleted']),
  ]);
  const rows = [...keep, ...reject, ...recentApproved, ...olderDeleted];
  console.log(`Calibration set: ${keep.length} keep, ${reject.length} reject, ${recentApproved.length} recent approved, ${olderDeleted.length} older deleted.`);
  console.log(`Estimate: ${JSON.stringify(estimate(rows, args.model))}`);
  const run = await scoreAll(rows, args);
  const table = confusion(run.results, labels);
  const groups = ['keep', 'reject', 'recent-approved', 'older-deleted'];
  const byGroup = Object.fromEntries(groups.map(g => [g, distribution(run.results, new Set([...labels].filter(([, l]) => l === g).map(([id]) => id)))]));
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const detail = run.results.map(({ id, audience: a }) => ({ id, label: labels.get(id), question: rowsById.get(id).question, answer: rowsById.get(id).options[rowsById.get(id).correct_answer], ...a }));
  // v1 files keep their original name; later versions carry the version so they never overwrite it.
  const tag = audience.AUDIENCE_VERSION === 'bar-test-v1' ? '' : `${audience.AUDIENCE_VERSION}_`;
  const file = `${PLAN}_PHASE_2_CALIBRATION_${tag}${args.model}_${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(path.resolve(file), `${JSON.stringify({ modelVersion: run.modelVersion, usage: run.usage, failures: run.failures, stopped: run.stopped, confusion: table, byGroup, detail }, null, 1)}\n`);
  console.log(JSON.stringify({ usage: { dollars: run.usage.dollars, requests: run.usage.requests }, failures: run.failures.length, stopped: run.stopped, confusion: table, byGroup }, null, 1));
  console.log(`Wrote ${file}`);
};

const readScoreFile = file => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
};

const score = async (client, args) => {
  const done = new Map(readScoreFile(args.out).map(entry => [entry.id, entry]));
  const pending = await readRows(client, 'pending_review');
  const todo = pending.filter(row => {
    const entry = done.get(row.id);
    return !entry || entry.contentHash !== core.contentHash(row);
  }).slice(0, args.limit);
  console.log(`Waiting: ${pending.length}. Already scored: ${pending.length - todo.length}. To score: ${todo.length}.`);
  console.log(`Estimate: ${JSON.stringify(estimate(todo, args.model))}`);
  const byId = new Map(todo.map(row => [row.id, row]));
  const run = await scoreAll(todo, {
    ...args,
    onBatch: (scored, usage) => {
      // One JSON line per question, so an interrupted run keeps everything it paid for.
      fs.appendFileSync(args.out, scored.map(({ id, audience: a }) => JSON.stringify({ id, contentHash: core.contentHash(byId.get(id)), audience: a })).join('\n') + '\n');
      process.stdout.write(`\r${usage.requests} calls, $${usage.dollars.toFixed(4)}`);
    },
  });
  process.stdout.write('\n');
  console.log(JSON.stringify({ scored: run.results.length, failures: run.failures.length, stopped: run.stopped, usage: run.usage }, null, 1));
};

const write = async (client, args) => {
  const entries = [...new Map(readScoreFile(args.write).map(entry => [entry.id, entry])).values()];
  console.log(`${entries.length} scores in ${args.write}.`);
  if (!args.apply) { console.log('Dry run. Add --apply to store them.'); return; }
  const totals = { written: 0, skipped: 0 };
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    const chunk = entries.slice(i, i + WRITE_CHUNK).map(({ id, contentHash, audience: a }) => ({ id, contentHash, audience: a }));
    const { data, error } = await client.rpc('speed_trivia_review_set_audience', { p_rows: chunk });
    if (error) throw new Error(error.message);
    totals.written += Number(data.written) || 0;
    totals.skipped += Number(data.skipped) || 0;
  }
  console.log(JSON.stringify(totals));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const client = clientFromEnv();
  if (args.mode === 'calibrate') return calibrate(client, args);
  if (args.mode === 'score') return score(client, args);
  if (args.mode === 'write') return write(client, args);
  const pending = await readRows(client, 'pending_review');
  console.log(`Waiting: ${pending.length}.`);
  for (const model of Object.keys(RATES)) console.log(`${model}: ${JSON.stringify(estimate(pending, model))}`);
};

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parseArgs, sample, estimate, confusion, distribution, scoreAll, readScoreFile };
