#!/usr/bin/env node
/* One-time tagging run (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a, step 4).
 * Gives every existing question an area, era and subject from the variety map.
 *
 *   node --env-file=.env.local scripts/tag-questions.cjs --game speed                  # dry run: counts, no model calls
 *   ... --game speed --sample 40                                                      # one batch through ChatGPT, printed, no writes
 *   ... --game speed --apply [--limit 400] [--batch 40] [--concurrency 2]              # tag and save (ChatGPT, free)
 *   ... --game speed --apply --provider openai --max-dollars 2.5                       # OpenAI API, capped (Phase 4f.2; was Gemini)
 *   ... --game live ...                                                               # Live: reads the canonical JSON, read-only
 *   ... --game speed --unmapped --category "General Knowledge" [--apply]                # Phase 4a.1: re-tag rows with no area
 *
 * ChatGPT runs through OpenAI's Codex CLI (`codex exec`) signed in on this Mac (D9's login, no extra cost). It runs in an
 * empty folder with a read-only sandbox, no user config and a fixed output schema. Question text and model output are
 * DATA: tags are only matched against the map (lib/question-variety/map.cjs validateTag). A tag that doesn't match is
 * skipped and left untagged for a later run. Only untagged questions are sent; existing tags are never overwritten.
 * --unmapped (Phase 4a.1, D20) is the one exception: it sends only tagged rows with no area (after new areas are added)
 * and writes just the area and era the model now picks. The row's subject and subject_key are kept, so the star-cap
 * counts don't move; a row that still fits no area stays as it was.
 */
const fs = require('node:fs');
const path = require('node:path');
const map = require('../lib/question-variety/map.cjs');
const { RATES, claimFor } = require('../lib/openai/responses.cjs');
const ledger = require('../lib/openai/ledger.cjs');
const { OUTPUT_SCHEMA, TAG_MODEL, buildPrompt, toTags, runOpenAI } = require('../lib/question-variety/tagging.cjs');
const codexExec = require('./lib/codexExec.cjs');
const liveCats = require('../lib/live-trivia-quality/categories.cjs');

const PAGE = 1000;
const LIVE_DIR = path.resolve(__dirname, '../data/live-trivia/categories');
const DEFAULT_MODEL = { codex: 'gpt-6.1-sol', openai: TAG_MODEL };
const MAX_API_DOLLARS = 2.5; // plan cap for the paid API
const VERSION = 'tagging-v1';
const RETAG_SUFFIX = 'area-retag-v2';

const parseArgs = argv => {
  const args = { game: '', apply: false, sample: 0, limit: Infinity, batch: 40, concurrency: 2, provider: 'codex', model: '', effort: 'medium', maxDollars: 0, category: '', unmapped: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => String(argv[++i] ?? '');
    if (arg === '--game') args.game = next();
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--sample') args.sample = Number(next());
    else if (arg === '--limit') args.limit = Number(next());
    else if (arg === '--batch') args.batch = Number(next());
    else if (arg === '--concurrency') args.concurrency = Number(next());
    else if (arg === '--provider') args.provider = next();
    else if (arg === '--model') args.model = next();
    else if (arg === '--effort') args.effort = next();
    else if (arg === '--max-dollars') args.maxDollars = Number(next());
    else if (arg === '--category') args.category = next();
    else if (arg === '--unmapped') args.unmapped = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!map.isGame(args.game)) throw new Error('--game must be speed or live.');
  if (!['codex', 'openai'].includes(args.provider)) throw new Error('--provider must be codex or openai.');
  if (!Number.isInteger(args.batch) || args.batch < 1 || args.batch > 100) throw new Error('--batch must be 1-100.');
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 4) throw new Error('--concurrency must be 1-4.');
  if (args.limit !== Infinity && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive whole number.');
  if (!Number.isInteger(args.sample) || args.sample < 0 || args.sample > 100) throw new Error('--sample must be 0-100.');
  if (args.sample && args.apply) throw new Error('--sample never writes; drop --apply.');
  if (!['low', 'medium', 'high'].includes(args.effort)) throw new Error('--effort must be low, medium or high.');
  if (args.provider === 'openai' && (args.apply || args.sample)) {
    if (!(args.maxDollars > 0) || args.maxDollars > MAX_API_DOLLARS) throw new Error(`--provider openai needs --max-dollars above 0 and at most ${MAX_API_DOLLARS}.`);
  }
  if (args.unmapped && args.game !== 'speed') throw new Error('--unmapped is for Speed only.');
  args.model ||= DEFAULT_MODEL[args.provider];
  if (args.provider === 'openai' && !RATES[args.model]) throw new Error('OpenAI model has no price configuration.');
  return args;
};

const pageAll = async build => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
};

const readAreas = async (client, game) => {
  const rows = await pageAll(() => client.from('question_coverage_areas').select('id, category, name, eras, note, active, position').eq('game', game).order('id'));
  const byCategory = new Map();
  for (const row of rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
  for (const list of byCategory.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return byCategory;
};

const readTagged = async (client, game) =>
  new Set((await pageAll(() => client.from('question_tags').select('question_ref').eq('game', game).order('question_ref'))).map(r => r.question_ref));

/** --unmapped: existing tags with no area, by question_ref. */
const readUnmappedTags = async (client, game) =>
  new Map((await pageAll(() => client.from('question_tags').select('game, question_ref, category, area_id, era, subject, subject_key, written_at, tagged_by')
    .eq('game', game).is('area_id', null).order('question_ref'))).map(r => [r.question_ref, r]));

/** --unmapped: keep the old tag's subject; take only the new area and era. Rows that still fit no area are dropped. */
const toRetags = (rows, existing, taggedBy) => rows.flatMap(r => {
  const old = existing.get(r.question_ref);
  if (!old || old.area_id !== null || r.area_id === null) return [];
  return [{ ...old, area_id: r.area_id, era: r.era, tagged_by: taggedBy }];
});

/** Speed: active + waiting rows. Live: the canonical JSON (read-only), one entry per slug. */
const readQuestions = async (client, game) => {
  if (game === 'speed') {
    const rows = await pageAll(() => client.from('trivia_questions').select('id, question, options, correct_answer, category, created_at')
      .eq('question_pool', 'anytime_blitz').eq('answer_format', 'multiple_choice').in('status', ['active', 'pending_review']).order('id'));
    return rows.map(r => ({ ref: r.id, category: r.category, question: r.question, answer: Array.isArray(r.options) ? r.options[r.correct_answer] : null, writtenAt: r.created_at }));
  }
  const out = new Map();
  for (const file of fs.readdirSync(LIVE_DIR).filter(f => f.endsWith('.json')).sort()) {
    const json = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, file), 'utf8'));
    for (const q of json.questions ?? []) {
      // The importer's slug (lowercased; falls back to the question), so a tag's ref matches trivia_questions.slug.
      const ref = liveCats.slugify(String(q.slug ?? '') || String(q.question ?? ''));
      if (!ref || out.has(ref)) continue;
      out.set(ref, { ref, category: json.categoryName, question: q.question, answer: q.answer, writtenAt: null });
    }
  }
  return [...out.values()];
};

const runCodex = ({ prompt, model, effort }) => codexExec.runCodex({ prompt, model, effort, schema: OUTPUT_SCHEMA });

/** Worst-case price of one OpenAI API call, reserved before it's made. */
// Phase 7e (R2 #29.7): the same reservation as every other OpenAI caller (prompt, schema and request framing).
const API_MAX_OUTPUT_TOKENS = 8192;
const apiCeiling = (prompt, model) => claimFor({ model, prompt, maxOutputTokens: API_MAX_OUTPUT_TOKENS }).dollars;

const isStarCap = error => /\bstar-cap\b/.test(error?.message ?? '');

/**
 * Upsert a batch. Phase 4c.8: the tag trigger (guard_speed_question_tag) refuses moving an APPROVED question into a
 * subject that already has 5 other approved questions ('star-cap'), and one refusal fails the whole batch. Then the
 * batch is retried row by row: the rest are written and the refused rows reported (they keep their old tag, if any).
 */
const writeTags = async (client, rows, { overwrite = false } = {}) => {
  if (!rows.length) return { written: 0, refused: [] };
  const upsert = list => client.from('question_tags').upsert(list, { onConflict: 'game,question_ref', ignoreDuplicates: !overwrite }).select('question_ref');
  const { data, error } = await upsert(rows);
  if (!error) return { written: data.length, refused: [] };
  if (!isStarCap(error)) throw new Error(error.message);
  let written = 0;
  const refused = [];
  for (const row of rows) {
    const one = await upsert([row]);
    if (!one.error) written += one.data.length;
    else if (isStarCap(one.error)) refused.push(row.question_ref);
    else throw new Error(one.error.message);
  }
  return { written, refused };
};

const batchesOf = (questions, size) => {
  const byCategory = new Map();
  for (const q of questions) byCategory.set(q.category, [...(byCategory.get(q.category) ?? []), q]);
  const out = [];
  for (const [category, list] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (let i = 0; i < list.length; i += size) out.push({ category, batch: list.slice(i, i + size) });
  }
  return out;
};

const run = async ({ client, args, call = null, log = () => {} }) => {
  const areasByCategory = await readAreas(client, args.game);
  if (!areasByCategory.size) throw new Error('The variety map is empty. Seed it first (scripts/seed-question-variety-map.cjs --apply).');
  const tagged = await readTagged(client, args.game);
  const unmappedTags = args.unmapped ? await readUnmappedTags(client, args.game) : null;
  let pending = (await readQuestions(client, args.game)).filter(q => (unmappedTags
    ? unmappedTags.get(q.ref)?.category === q.category
    : !tagged.has(q.ref)) && (!args.category || q.category === args.category));
  const noMap = pending.filter(q => !areasByCategory.has(q.category));
  pending = pending.filter(q => areasByCategory.has(q.category));
  const plannedCount = Math.min(pending.length, args.sample || args.limit);
  const work = batchesOf(pending, args.batch);
  const summary = { mode: args.sample ? 'sample' : args.apply ? 'apply' : 'dry-run', version: VERSION, unmapped: args.unmapped, game: args.game, provider: args.provider, model: args.model,
    alreadyTagged: tagged.size, untagged: pending.length, categoryNotInMap: noMap.length, planned: plannedCount, batches: Math.ceil(plannedCount / args.batch) };
  if (!args.apply && !args.sample) return summary;

  const taggedBy = `${args.provider}:${args.model}:${VERSION}${args.unmapped ? `:${RETAG_SUFFIX}` : ''}`;
  const apiKey = process.env.OPENAI_API_KEY;
  if (args.provider === 'openai' && !apiKey && !call) throw new Error('Missing OPENAI_API_KEY.');
  const caller = call ?? (args.provider === 'codex'
    ? prompt => runCodex({ prompt, model: args.model, effort: args.effort })
    : prompt => runOpenAI({ prompt, model: args.model, apiKey, maxOutputTokens: API_MAX_OUTPUT_TOKENS }));

  let remaining = plannedCount, written = 0, dollars = 0, tokens = 0, calls = 0, stopped = null, stillUnmapped = 0;
  // Phase 7e (R2 #29.7): the API's settled usage, for one ledger row per run.
  const billed = { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, dollars: 0 };
  const bill = usage => {
    if (!usage) return;
    billed.calls++; billed.inputTokens += usage.inputTokens ?? 0; billed.outputTokens += usage.outputTokens ?? 0;
    billed.reasoningTokens += usage.reasoningTokens ?? 0; billed.dollars += usage.dollars ?? 0;
  };
  const skipped = [], failures = [], sample = [], refusedSubjectFull = [];
  const queue = [];
  for (const unit of work) {
    if (remaining <= 0) break;
    const batch = unit.batch.slice(0, remaining);
    remaining -= batch.length;
    queue.push({ ...unit, batch });
  }
  let consecutiveFailures = 0;
  const worker = async () => {
    while (queue.length && !stopped) {
      const { category, batch } = queue.shift();
      const areas = areasByCategory.get(category);
      const prompt = buildPrompt(category, areas, batch);
      if (args.provider === 'openai') {
        const ceiling = apiCeiling(prompt, args.model);
        if (dollars + ceiling > args.maxDollars) { stopped = 'budget'; return; }
        dollars += ceiling; // reserved; settled below
        try {
          const result = await caller(prompt);
          dollars += (result.dollars ?? ceiling) - ceiling;
          bill(result.usage);
          handle(result, category, areas, batch);
        } catch (error) {
          // A billed reply that couldn't be used carries its usage (R2 #29.6); anything else keeps the full reservation.
          if (Number.isFinite(error?.dollars)) { dollars += error.dollars - ceiling; bill(error.usage); }
          fail(error, category, batch);
        }
      } else {
        try { handle(await caller(prompt), category, areas, batch); } catch (error) { fail(error, category, batch); }
      }
    }
  };
  const pendingWrites = [];
  function handle(result, category, areas, batch) {
    calls++; consecutiveFailures = 0; tokens += result.tokens ?? 0;
    const { rows, skipped: bad } = toTags({ game: args.game, category, areas, batch, output: result.output, taggedBy });
    skipped.push(...bad);
    if (args.sample) { sample.push(...rows.map(r => ({ category, question: batch.find(q => q.ref === r.question_ref)?.question, area: areas.find(a => a.id === r.area_id)?.name ?? null, era: r.era, subject: r.subject }))); return; }
    const out = unmappedTags ? toRetags(rows, unmappedTags, taggedBy) : rows;
    if (unmappedTags) stillUnmapped += rows.length - out.length;
    pendingWrites.push(writeTags(client, out, { overwrite: Boolean(unmappedTags) }).then(({ written: n, refused: no }) => {
      written += n; refusedSubjectFull.push(...no);
      log({ category, written: n, skipped: bad.length, ...(no.length ? { subjectFull: no.length } : {}), total: written });
    }));
  }
  function fail(error, category, batch) {
    calls++; consecutiveFailures++;
    failures.push({ category, size: batch.length, error: String(error?.message ?? error).slice(0, 300) });
    if (codexExec.isLimitOrLogin(error)) stopped = 'login';
    else if (consecutiveFailures >= 3) stopped = 'errors';
  }
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  await Promise.all(pendingWrites);
  if (args.provider === 'openai' && billed.calls) {
    await ledger.recordUsage(client, { feature: 'question_tagging', byModel: { [args.model]: billed }, metadata: { taggedBy, source: 'tag-questions' } });
  }
  return { ...summary, calls, written, ...(unmappedTags ? { stillUnmapped } : {}), refusedSubjectFull, skipped: skipped.length, skippedByReason: skipped.reduce((a, s) => ({ ...a, [s.reason]: (a[s.reason] ?? 0) + 1 }), {}),
    failures, stopped, codexTokens: args.provider === 'codex' ? tokens : undefined, apiDollars: args.provider === 'openai' ? Number(dollars.toFixed(4)) : undefined,
    ...(args.sample ? { sample } : {}) };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
  const result = await run({ client: clientFromEnv(), args, log: line => console.error(JSON.stringify(line)) });
  console.log(JSON.stringify(result, null, 2));
  if (result.stopped === 'login') process.exitCode = 2;
};

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

module.exports = { OUTPUT_SCHEMA, VERSION, RETAG_SUFFIX, parseArgs, buildPrompt, toTags, toRetags, batchesOf, apiCeiling, readQuestions, writeTags, run };
