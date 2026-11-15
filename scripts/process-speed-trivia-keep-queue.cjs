#!/usr/bin/env node
/* Speed Trivia overnight Keep queue (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3).
 *
 *   node --env-file=.env.local scripts/process-speed-trivia-keep-queue.cjs
 *       Free: how many Keeps are waiting for the overnight check.
 *   ... --estimate 50
 *       Free: pairs each of 50 likely keeps (older, score 5) would need, minus cached pairs, and the estimated cost.
 *   ... --measure 50 --max-dollars 1.5 [--out <file.json>]
 *       PAID: checks those rows against approved questions WITHOUT approving anything. Every pair is checked; the old
 *       (one at a time) and new (6 at once, same answer first) schedules are then simulated from the same verdicts.
 *       Verdicts go to the signed pair cache, so a later queue run reuses them for free.
 *   ... --apply [--precheck] [--min-score 3] [--max-dollars N] [--total-dollars N] [--minutes 50] [--limit 2000]
 *       PAID: processes queued Keeps oldest first.
 *       Unique -> approved (signed admission, approved-only scope). Repeat -> retired with its match (D8).
 *       Uncertain, or edited after Keep -> left waiting under "Needs a look".
 *       --precheck (D17): then, with what's left of the run, checks older undecided waiting questions (score ≥
 *       --min-score, best first) the same way WITHOUT approving. Repeat -> retired with its match (Repeats, Restore);
 *       unique / uncertain -> left waiting, noted so they aren't checked again.
 *       Dollars: per run --max-dollars (else SPEED_TRIVIA_QUEUE_MAX_DOLLARS), never past --total-dollars (else
 *       SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS) across all runs, reserved first in speed_trivia_queue_runs. Either unset:
 *       nothing is checked.
 *
 *       Every --apply run first clears queued Keeps whose question is no longer waiting (speed_trivia_queue_prepare).
 *       One question never stops the run (Phase 3a): a problem that will recur with that question sends it to
 *       "Needs a look" (pre-check: noted 'uncertain'); a passing failure leaves it for the next night. The run stops
 *       only at the budget, the deadline, or after 3 passing failures in a row or 20 failures in all.
 *
 * Speed Trivia only (anytime_blitz + multiple_choice). Never rejects anything for quality.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime = require('../lib/speed-trivia-uniqueness/runtime.cjs');
const gemini = require('../lib/speed-trivia-uniqueness/gemini.cjs');
const approval = require('../lib/speed-trivia-uniqueness/approval.cjs');

const PLAN = 'docs/speed-trivia-backlog-and-quality-plan';
const MODEL = 'gemini-2.5-flash';
const MARK_PAGE = 500;
const ROW_CHUNK = 100;
const NOTE_MAX = 600;
const MAX_CAP = 100;
const MAX_TOTAL = 1000;
const PRECHECK_PAGE = 5000;
const MAX_ERRORS_KEPT = 50;
const BREAK_IN_A_ROW = 3;
const BREAK_IN_RUN = 20;

const parseArgs = argv => {
  const args = { mode: 'count', precheck: false, minScore: 3, maxDollars: null, totalDollars: null, minutes: 50, limit: 2000, sample: 0, out: '', reportDir: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.mode = 'apply';
    else if (arg === '--precheck') { args.mode = 'apply'; args.precheck = true; }
    else if (arg === '--min-score') args.minScore = Number(argv[++i]);
    else if (arg === '--total-dollars') args.totalDollars = Number(argv[++i]);
    else if (arg === '--estimate') { args.mode = 'estimate'; args.sample = Number(argv[++i]); }
    else if (arg === '--measure') { args.mode = 'measure'; args.sample = Number(argv[++i]); }
    else if (arg === '--max-dollars') args.maxDollars = Number(argv[++i]);
    else if (arg === '--minutes') args.minutes = Number(argv[++i]);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out') args.out = String(argv[++i] ?? '');
    else if (arg === '--report-dir') args.reportDir = String(argv[++i] ?? '');
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (['estimate', 'measure'].includes(args.mode) && !(Number.isInteger(args.sample) && args.sample > 0 && args.sample <= 200)) {
    throw new Error('--estimate/--measure need a sample size from 1 to 200.');
  }
  if (args.mode === 'measure' && !(args.maxDollars > 0 && args.maxDollars <= 5)) throw new Error('--measure needs --max-dollars (0 < n ≤ 5).');
  if (args.maxDollars != null && !(args.maxDollars > 0 && args.maxDollars <= MAX_CAP)) throw new Error(`--max-dollars must be 0 < n ≤ ${MAX_CAP}.`);
  if (args.totalDollars != null && !(args.totalDollars > 0 && args.totalDollars <= MAX_TOTAL)) throw new Error(`--total-dollars must be 0 < n ≤ ${MAX_TOTAL}.`);
  if (!(Number.isInteger(args.minScore) && args.minScore >= 1 && args.minScore <= 5)) throw new Error('--min-score must be 1–5.');
  if (!(args.minutes > 0 && args.minutes <= 55)) throw new Error('--minutes must be 0 < n ≤ 55.');
  if (!(Number.isInteger(args.limit) && args.limit > 0 && args.limit <= 20000)) throw new Error('--limit must be 1–20000.');
  return args;
};

const clientFromEnv = () => {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

// The budget caps dollars and time; token/request ceilings scale with dollars so dollars bind first.
const queueBudget = ({ dollars, minutes }) => runtime.createBudget({
  dollars, elapsedMs: Math.round(minutes * 60_000), retries: 50,
  requests: Math.ceil(dollars * 4000), inputTokens: Math.ceil(dollars * 8e6), outputTokens: Math.ceil(dollars * 1e6),
});

/** Counts queued Keeps on waiting questions. With apply, first clears Keeps whose question is no longer waiting and
 * records ones approved elsewhere (speed_trivia_queue_prepare). Returns {queued, stale, settled}. */
const prepare = async (client, apply) => {
  const { data, error } = await client.rpc('speed_trivia_queue_prepare', { p_apply: apply });
  if (error) throw new Error(error.message);
  if (!data || !['queued', 'stale', 'settled'].every(key => Number.isInteger(data[key]))) throw new Error('Missing result (speed_trivia_queue_prepare).');
  return { queued: data.queued, stale: data.stale, settled: data.settled };
};

const readQueued = async (client, limit) => {
  const marks = [];
  for (let from = 0; marks.length < limit; from += MARK_PAGE) {
    const { data, error } = await client.from('speed_trivia_review_marks').select('row_id,content_hash,decided_at')
      .eq('decision', 'keep').eq('outcome', 'queued').order('decided_at').order('row_id')
      .range(from, from + Math.min(MARK_PAGE, limit - marks.length) - 1);
    if (error) throw new Error(error.message);
    marks.push(...data);
    if (data.length < MARK_PAGE) break;
  }
  return marks;
};

const readRows = async (client, ids) => {
  const rows = new Map();
  for (let i = 0; i < ids.length; i += ROW_CHUNK) {
    const { data, error } = await client.from('trivia_questions').select('*').in('id', ids.slice(i, i + ROW_CHUNK));
    if (error) throw new Error(error.message);
    for (const row of data) rows.set(row.id, row);
  }
  return rows;
};

// A refused settle is that row's problem (it will be refused again); anything else may pass.
const settleError = (prefix, error) => Object.assign(new Error(`${prefix}: ${error.message}`),
  { code: /invalid-quick-review-request/.test(String(error.message)) ? 'invalid-quick-review-request' : 'settle_failed' });

const settle = async (client, rowId, contentHash, outcome, matched = null, note = null) => {
  const { data, error } = await client.rpc('speed_trivia_queue_settle', {
    p_row_id: rowId, p_content_hash: contentHash, p_outcome: outcome, p_matched_row_id: matched,
    p_note: note ? note.slice(0, NOTE_MAX) : null,
  });
  if (error) throw settleError(`settle failed for ${rowId}`, error);
  return data.outcome;
};

const speedRow = row => row?.question_pool === 'anytime_blitz' && row?.answer_format === 'multiple_choice';
// A plain Error from the engine (e.g. 'malformed-answer', 'approved-only-requires-unchanged-pending-approval') carries
// its code as the message.
const errorCode = error => typeof error?.code === 'string' ? error.code
  : /^[a-z][a-z0-9_-]{2,80}$/.test(String(error?.message ?? '')) ? error.message : 'failed';

// ---------- one shared error classifier (Phase 3a) ----------
// stop: ends the run. row: this question's own problem, which every run would hit again. transient: anything else
// (provider errors, verification_unavailable, stale_revision), retried next night.
const STOP_CODES = new Set(['budget_exhausted', 'cancelled', 'budget_configuration']);
const ROW_CODES = new Set(['invalid_pool', 'retired', 'approved-only-requires-unchanged-pending-approval', 'invalid-quick-review-request']);
const classify = error => {
  const code = errorCode(error);
  return STOP_CODES.has(code) ? 'stop' : error?.malformed === true || ROW_CODES.has(code) ? 'row' : 'transient';
};
const stopReason = error => (errorCode(error) === 'budget_exhausted' ? 'budget' : errorCode(error));
// core.content() failing means the question itself is malformed: always a row problem.
const contentProblem = row => { try { core.content(row); return null; } catch (error) { return Object.assign(new Error(error.message), { code: errorCode(error), malformed: true }); } };

/** Error breaker shared by both passes of one run: trips after BREAK_IN_A_ROW transient errors in a row or
 * BREAK_IN_RUN errors in all, so an outage can't mark rows or burn the night. */
const createBreaker = () => {
  let inARow = 0, total = 0;
  return {
    ok: () => { inARow = 0; },
    // Returns true when the run must stop.
    fail: kind => { total++; inARow = kind === 'transient' ? inARow + 1 : 0; return inARow >= BREAK_IN_A_ROW || total >= BREAK_IN_RUN; },
  };
};
const recordError = (report, id, error, kind) => {
  if (kind !== 'stop') report[kind === 'row' ? 'rowErrors' : 'transientErrors']++;
  if (report.errors.length < MAX_ERRORS_KEPT) report.errors.push({ id, code: errorCode(error), kind, message: String(error?.message ?? error).slice(0, 300) });
};
const CHECK_NOTE = code => `Couldn't check (${code}). Keep it again or reject it.`;
// The approved question a duplicate verdict matched, if it's still approved.
const approvedMatch = (session, error) =>
  (error.evidence?.matchedRowIds ?? []).map(id => session.index().byId.get(id)?.row).find(r => r?.status === 'active') ?? null;

/** One pass over queued marks. Returns a report; stops (without failing) at the budget or deadline, and with
 * stopped='errors' at the breaker. A row's own problem sends it to Needs a look; a passing one leaves it queued. */
const processQueue = async ({ client, session, marks, rows, breaker = createBreaker() }) => {
  const report = { examined: 0, approved: 0, repeat: 0, needsLook: 0, skipped: 0, stopped: null, errors: [], rowErrors: 0, transientErrors: 0 };
  const count = outcome => { report[outcome === 'repeat' ? 'repeat' : outcome === 'needs_look' ? 'needsLook' : outcome === 'approved' ? 'approved' : 'skipped']++; };
  for (const mark of marks) {
    const row = rows.get(mark.row_id);
    let checking = false;
    try {
      if (!speedRow(row)) { report.skipped++; continue; }
      if (row.status === 'active') {
        // A previous run approved it but stopped before recording the result.
        count(await settle(client, row.id, mark.content_hash, 'approved'));
        breaker.ok(); continue;
      }
      if (row.status !== 'pending_review') { report.skipped++; continue; }
      const malformed = contentProblem(row);
      if (malformed) throw malformed;
      if (core.contentHash(row) !== mark.content_hash) {
        count(await settle(client, row.id, mark.content_hash, 'needs_look', null, 'Edited after Keep. Keep it again or reject it.'));
        breaker.ok(); continue;
      }
      report.examined++; checking = true;
      let outcome;
      try {
        await session.write({ status: 'active' }, { existing: row, approvedOnly: true });
        outcome = await settle(client, row.id, mark.content_hash, 'approved');
      } catch (error) {
        const code = errorCode(error);
        if (code === 'duplicate') {
          const match = approvedMatch(session, error);
          outcome = match
            ? await settle(client, row.id, mark.content_hash, 'repeat', match.id, error.message)
            : await settle(client, row.id, mark.content_hash, 'needs_look', null, error.message);
        } else if (code === 'uncertain') {
          outcome = await settle(client, row.id, mark.content_hash, 'needs_look', null, error.message);
        } else throw error;
      }
      count(outcome);
      breaker.ok();
    } catch (error) {
      const kind = classify(error);
      if (kind === 'stop') {
        if (checking) report.examined--;
        report.stopped = stopReason(error);
        if (report.stopped !== 'budget') recordError(report, mark.row_id, error, 'stop');
        break;
      }
      if (kind === 'transient' && checking) report.examined--;
      recordError(report, mark.row_id, error, kind);
      if (kind === 'row') {
        // It would fail the same way every night: hand it to Andrew instead.
        try { count(await settle(client, mark.row_id, mark.content_hash, 'needs_look', null, CHECK_NOTE(errorCode(error)))); }
        catch (settleFailure) { recordError(report, mark.row_id, settleFailure, classify(settleFailure) === 'row' ? 'row' : 'transient'); }
      }
      if (breaker.fail(kind)) { report.stopped = 'errors'; break; }
    }
  }
  return report;
};

// ---------- D17 pre-check (no approvals) ----------

const precheckCandidates = async (client, minScore, limit) => {
  const { data, error } = await client.rpc('speed_trivia_precheck_candidates', { p_min_score: minScore, p_limit: Math.min(limit, PRECHECK_PAGE) });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.some(id => typeof id !== 'string')) throw new Error('Missing result (speed_trivia_precheck_candidates).');
  return data;
};

const precheckSettle = async (client, rowId, contentHash, outcome, matched = null, note = null) => {
  const { data, error } = await client.rpc('speed_trivia_precheck_settle', {
    p_row_id: rowId, p_content_hash: contentHash, p_outcome: outcome, p_matched_row_id: matched,
    p_note: note ? note.slice(0, NOTE_MAX) : null,
  });
  if (error) throw settleError(`pre-check settle failed for ${rowId}`, error);
  return data.outcome;
};

/** Older undecided waiting questions, in the given order, checked against approved questions only. Never approves.
 * Reads rows ROW_CHUNK at a time; stops (without failing) at the budget or deadline, and with stopped='errors' at the
 * breaker. A row's own problem is noted 'uncertain' so it isn't retried; a passing one is retried next night. */
const precheckPass = async ({ client, session, ids, read = readRows, breaker = createBreaker() }) => {
  const report = { examined: 0, repeat: 0, unique: 0, uncertain: 0, skipped: 0, stopped: null, errors: [], rowErrors: 0, transientErrors: 0 };
  const failed = (rowId, error, kind) => { recordError(report, rowId, error, kind); if (breaker.fail(kind)) report.stopped = 'errors'; };
  for (let i = 0; i < ids.length && !report.stopped; i += ROW_CHUNK) {
    const chunk = ids.slice(i, i + ROW_CHUNK);
    const rows = await read(client, chunk);
    for (const rowId of chunk) {
      const row = rows.get(rowId);
      if (!speedRow(row) || row.status !== 'pending_review' || row.speed_generation_metadata != null) { report.skipped++; continue; }
      // Without valid content there's no content hash to record a result against; nothing was paid for. Reported.
      const malformed = contentProblem(row);
      if (malformed) { failed(rowId, malformed, 'row'); if (report.stopped) break; continue; }
      report.examined++;
      let outcome = 'unique', matched = null, note = null, rowProblem = false;
      try {
        await session.checkApproved(row);
      } catch (error) {
        const code = errorCode(error);
        if (code === 'duplicate') {
          matched = approvedMatch(session, error)?.id ?? null;
          outcome = matched ? 'repeat' : 'uncertain';
          note = String(error.message);
        } else if (code === 'uncertain') {
          outcome = 'uncertain'; note = String(error.message);
        } else {
          const kind = classify(error);
          if (kind === 'stop') {
            report.examined--;
            report.stopped = stopReason(error);
            if (report.stopped !== 'budget') recordError(report, rowId, error, 'stop');
            break;
          }
          if (kind === 'transient') { report.examined--; failed(rowId, error, kind); if (report.stopped) break; continue; }
          failed(rowId, error, kind);
          if (report.stopped) break;
          outcome = 'uncertain'; note = `Couldn't check (${code}).`; rowProblem = true;
        }
      }
      try {
        const settled = await precheckSettle(client, rowId, core.contentHash(row), outcome, matched, note);
        report[settled === 'skipped' ? 'skipped' : outcome]++;
        if (!rowProblem) breaker.ok();
      } catch (error) {
        failed(rowId, error, classify(error) === 'row' ? 'row' : 'transient');
        if (report.stopped) break;
      }
    }
  }
  return report;
};

// ---------- run dollars (D4) ----------

const reserveRun = async (client, perRun, total) => {
  const { data, error } = await client.rpc('speed_trivia_queue_reserve', { p_per_run: perRun, p_total: total });
  if (error) throw new Error(error.message);
  return { id: data.id ?? null, dollars: Number(data.dollars) || 0, used: Number(data.used) || 0, total: Number(data.total) };
};

const finishRun = async (client, id, spent, report) => {
  const { error } = await client.rpc('speed_trivia_queue_finish', { p_id: id, p_spent: spent, p_report: report });
  if (error) throw new Error(`Could not record run spend: ${error.message}`);
};

/** One paid run: Keep queue first, then (optionally) the D17 pre-check with what's left. */
const runPaid = async ({ client, queued, candidates, perRun, total, minutes, limit, createSession = runtime.createSession, read = readRows, readMarks = readQueued }) => {
  const reservation = await reserveRun(client, perRun, total);
  if (!reservation.id) return { queued, prechecks: candidates.length, checked: 0, note: `Total budget used ($${reservation.used} of $${reservation.total}); nothing checked.` };
  const started = Date.now();
  let session = null, queue = null, precheck = null, failure = null;
  // One breaker for the whole run: 20 errors in all stops both passes.
  const breaker = createBreaker();
  try {
    session = await createSession({ client, budget: queueBudget({ dollars: reservation.dollars, minutes }) });
    if (queued) {
      const marks = await readMarks(client, limit);
      queue = await processQueue({ client, session, marks, rows: await read(client, marks.map(m => m.row_id)), breaker });
    }
    // Skipped when the queue stopped: at the budget, the deadline or the breaker.
    if (candidates.length && !queue?.stopped) precheck = await precheckPass({ client, session, ids: candidates, read, breaker });
  } catch (error) {
    failure = String(error?.message ?? error).slice(0, 300);
  }
  const spent = session ? session.budget.summary().dollars : 0;
  const summary = { queued, queue, prechecks: candidates.length, precheck, failure, seconds: Math.round((Date.now() - started) / 1000),
    dollars: { reserved: reservation.dollars, spent, usedBefore: reservation.used, total: reservation.total } };
  await finishRun(client, reservation.id, spent, summary);
  return summary;
};

// ---------- measurement (no approvals) ----------

const sampleLikelyKeeps = async (client, size) => {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('speed_trivia_review_marks').select('row_id').is('decision', null)
      .eq('audience->>score', '5').order('row_id').range(from, from + 999);
    if (error) throw new Error(error.message);
    ids.push(...data.map(r => r.row_id));
    if (data.length < 1000) break;
  }
  const rows = [...(await readRows(client, ids)).values()]
    .filter(r => speedRow(r) && r.status === 'pending_review' && r.speed_generation_metadata == null);
  return rows.sort((a, b) => core.hash(a.id).localeCompare(core.hash(b.id))).slice(0, size);
};

const priorityOf = task => {
  try { return core.answerKey(core.content(task.a).answer) === core.answerKey(core.content(task.b).answer); } catch { return false; }
};

/** Simulate the old (sequential, retrieval order) and new (same answer first; `probe` pairs alone, then K workers)
 * schedules. Mirrors runtime.cjs. */
const simulate = (calls, concurrency, probe = runtime.PROBE) => {
  const blocks = call => call.decision !== 'unique' || call.qualityA !== 'sound';
  const verdict = examined => examined.some(c => c.decision === 'duplicate') ? 'duplicate' : examined.some(blocks) ? 'uncertain' : 'unique';
  const old = { ms: 0, dollars: 0, calls: 0 }, oldExamined = [];
  for (const call of calls) {
    oldExamined.push(call);
    if (!call.cached) { old.ms += call.ms; old.dollars += call.dollars; old.calls++; }
    if (blocks(call)) break;
  }
  const order = calls.map((c, i) => ({ ...c, i })).sort((x, y) => (Number(y.first) - Number(x.first)) || (x.i - y.i));
  const free = Array.from({ length: concurrency }, () => 0), started = [];
  let stopAt = Infinity, probeEnd = 0;
  for (const [n, call] of order.entries()) {
    // The probe runs one at a time; the pool starts when it ends.
    if (n === probe) free.fill(probeEnd);
    const w = n < probe ? 0 : free.indexOf(Math.min(...free));
    const start = n < probe ? probeEnd : free[w];
    if (start >= stopAt) break;
    const end = start + (call.cached ? 0 : call.ms);
    if (n < probe) probeEnd = end; else free[w] = end;
    started.push({ ...call, end });
    // A worker takes a new pair only while no blocking result has arrived.
    if (blocks(call)) stopAt = Math.min(stopAt, end);
  }
  const fresh = { ms: started.length ? Math.max(...started.map(c => c.end)) : 0, dollars: started.reduce((s, c) => s + (c.cached ? 0 : c.dollars), 0), calls: started.filter(c => !c.cached).length };
  return { old: { ...old, decision: verdict(oldExamined) }, new: { ...fresh, decision: verdict(started) } };
};

const measure = async ({ client, sample, maxDollars, estimateOnly, apiKey = process.env.GEMINI_API_KEY, secret = process.env.SPEED_TRIVIA_ADMISSION_SECRET }) => {
  if (!secret || secret.length < 32) throw new Error('Missing SPEED_TRIVIA_ADMISSION_SECRET.');
  if (!estimateOnly && !apiKey) throw new Error('Missing GEMINI_API_KEY.');
  const budget = queueBudget({ dollars: estimateOnly ? 0.01 : maxDollars, minutes: 55 });
  const loading = Date.now();
  const session = await runtime.createSession({ client, secret, budget, judge: { modelVersion: gemini.modelVersion(MODEL), adjudicate: async () => { throw new Error('unused'); } } });
  const loadMs = Date.now() - loading;
  const view = approval.approvedIndex(session.index());
  const rows = await sampleLikelyKeeps(client, sample);
  const version = gemini.modelVersion(MODEL), rate = gemini.RATES[MODEL];
  const memory = new Map();
  const results = [];
  for (const row of rows) {
    const candidate = { ...row, status: 'active' };
    const retrieval = core.retrieve(view, candidate, { excludeId: row.id });
    const all = retrieval.matches.map(hit => ({ id: hit.id, a: candidate, b: view.byId.get(hit.id).row }));
    const deterministic = all.map(task => core.deterministicPair(task.a, task.b)).filter(Boolean);
    if (deterministic.some(d => d.decision === 'duplicate')) {
      // An exact repeat needs no paid call in either checker.
      const none = { ms: 0, dollars: 0, calls: 0, decision: 'duplicate' };
      results.push({ id: row.id, question: row.question, pairs: 0, cached: 0, complete: retrieval.complete, sim: { old: none, new: none }, exact: true });
      continue;
    }
    let tasks = all.filter(task => !core.deterministicPair(task.a, task.b));
    // Even a question with no competitor gets one soundness check.
    if (!tasks.length) tasks = [{ id: 'candidate-soundness', a: candidate, b: candidate }];
    const keys = tasks.map(t => core.pairKey(t.a, t.b, version));
    const cached = keys.length ? await runtime.rpc(client, 'speed_trivia_cached_pairs', { p_keys: keys }) : {};
    if (estimateOnly) {
      const uncached = keys.filter(k => !cached[k]).length;
      results.push({ id: row.id, pairs: tasks.length || 1, uncached: tasks.length ? uncached : 1, complete: retrieval.complete });
      continue;
    }
    const calls = [];
    const one = async (task, i) => {
      const key = keys[i], first = priorityOf(task);
      const hit = cached[key];
      if (hit && hit.modelVersion === version && core.validDecision(hit.result)) {
        calls[i] = { id: task.id, cached: true, first, ms: 0, dollars: 0, ...hit.result };
        return;
      }
      let actual = null;
      const judge = gemini.createJudge({ model: MODEL, apiKey, cache: memory, budget: { reserve: budget.reserve, settle: (r, a) => { actual = a; budget.settle(r, a); } } });
      const started = Date.now();
      const [verdict] = await budget.limit(judge.adjudicate([{ ...task, id: 'comparison' }]));
      calls[i] = { ...verdict, id: task.id, cached: false, first, ms: Date.now() - started, dollars: actual?.dollars ?? 0 };
    };
    let next = 0, failure = null;
    const worker = async () => { while (!failure && next < tasks.length) { const i = next++; try { await one(tasks[i], i); } catch (e) { failure = e; } } };
    const wall = Date.now();
    await Promise.allSettled(Array.from({ length: Math.min(runtime.DEFAULT_CONCURRENCY, tasks.length) }, worker));
    const wallMs = Date.now() - wall;
    // Persist new verdicts (signed), ≤ 128 per call, like the runtime does.
    const entries = Object.fromEntries(keys.filter(k => memory.has(k)).map(k => [k, memory.get(k)]));
    if (Object.keys(entries).length) {
      const payload = runtime.canonicalText(entries);
      await runtime.rpc(client, 'speed_trivia_cache_pairs', { p_entries: payload, p_signature: runtime.signText(secret, payload) });
    }
    if (failure) {
      const exhausted = /budget/i.test(String(failure.message));
      results.push({ id: row.id, question: row.question, stopped: exhausted ? 'budget' : String(failure.message).slice(0, 200) });
      break;
    }
    const sim = simulate(calls, runtime.DEFAULT_CONCURRENCY);
    // A held contradiction found without a paid call keeps both checkers from admitting.
    if (deterministic.length) for (const side of ['old', 'new']) if (sim[side].decision === 'unique') sim[side].decision = 'uncertain';
    results.push({ id: row.id, question: row.question, answer: row.options[row.correct_answer], pairs: tasks.length, cached: calls.filter(c => c.cached).length,
      complete: retrieval.complete, measuredWallMsAllPairs: wallMs, sim,
      // Raw verdicts in retrieval order, so other schedules can be simulated later for free.
      calls: calls.map(c => ({ first: c.first, cached: c.cached, ms: c.ms, dollars: c.dollars, decision: c.decision, qualityA: c.qualityA })),
      duplicates: calls.filter(c => c.decision === 'duplicate').map(c => ({ id: c.id, question: view.byId.get(c.id)?.row.question ?? null })) });
  }
  const done = results.filter(r => r.sim);
  const sum = (key, side) => done.reduce((s, r) => s + r.sim[side][key], 0);
  const summary = estimateOnly ? {
    rows: results.length, pairs: results.reduce((s, r) => s + r.pairs, 0), uncached: results.reduce((s, r) => s + r.uncached, 0),
    incomplete: results.filter(r => !r.complete).length,
    estDollarsPerUncachedPair: 'see --measure', loadMs,
  } : {
    rows: done.length, stopped: results.find(r => r.stopped)?.stopped ?? null, loadMs,
    spentDollars: budget.summary().dollars,
    old: { secondsPerQuestion: sum('ms', 'old') / 1000 / (done.length || 1), dollarsPerQuestion: sum('dollars', 'old') / (done.length || 1), calls: sum('calls', 'old') },
    new: { secondsPerQuestion: sum('ms', 'new') / 1000 / (done.length || 1), dollarsPerQuestion: sum('dollars', 'new') / (done.length || 1), calls: sum('calls', 'new') },
    sameAdmission: done.every(r => (r.sim.old.decision === 'unique') === (r.sim.new.decision === 'unique')),
    labelAgreement: done.filter(r => r.sim.old.decision === r.sim.new.decision).length,
    decisions: Object.fromEntries(['unique', 'duplicate', 'uncertain'].map(d => [d, done.filter(r => r.sim.old.decision === d).length])),
    rate,
  };
  return { summary, results };
};

/** --apply: clear stale Keeps, then (only with work and an approved budget) one paid run. */
const runApply = async ({ client, args, env = process.env, ...inject }) => {
  const { queued, stale, settled } = await prepare(client, true);
  const candidates = args.precheck ? await precheckCandidates(client, args.minScore, args.limit) : [];
  // Nothing to do: exit before loading the bank or reserving dollars.
  if (queued === 0 && candidates.length === 0) return { queued, stale, settled, prechecks: 0, checked: 0 };
  const perRun = args.maxDollars ?? Number(env.SPEED_TRIVIA_QUEUE_MAX_DOLLARS);
  const total = args.totalDollars ?? Number(env.SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS);
  if (!(perRun > 0 && perRun <= MAX_CAP) || !(total > 0 && total <= MAX_TOTAL)) {
    return { queued, stale, settled, prechecks: candidates.length, checked: 0,
      note: 'No approved budget (SPEED_TRIVIA_QUEUE_MAX_DOLLARS and SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS); nothing checked.' };
  }
  return { stale, settled, ...(await runPaid({ client, queued, candidates, perRun, total, minutes: args.minutes, limit: args.limit, ...inject })) };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const client = clientFromEnv();
  if (args.mode === 'count') { console.log(JSON.stringify(await prepare(client, false))); return; }
  if (args.mode === 'estimate' || args.mode === 'measure') {
    const { summary, results } = await measure({ client, sample: args.sample, maxDollars: args.maxDollars, estimateOnly: args.mode === 'estimate' });
    console.log(JSON.stringify(summary, null, 2));
    if (args.mode === 'measure') {
      const out = args.out || `${PLAN}_PHASE_3_MEASUREMENT_${new Date().toISOString().slice(0, 10)}.json`;
      fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, concurrency: runtime.DEFAULT_CONCURRENCY, summary, results }, null, 2) + '\n');
      console.log(`Wrote ${out}`);
    }
    return;
  }
  const summary = await runApply({ client, args });
  console.log(JSON.stringify(summary));
  if (args.reportDir) {
    fs.mkdirSync(args.reportDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(args.reportDir, 'keep-queue-report.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  }
  const bad = [summary.queue?.stopped, summary.precheck?.stopped].some(stop => stop && stop !== 'budget');
  if (summary.failure || bad) process.exitCode = 1;
};

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, prepare, processQueue, precheckPass, runPaid, runApply, simulate, queueBudget, classify };
