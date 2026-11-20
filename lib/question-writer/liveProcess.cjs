/* Nightly Live Trivia processing of the writer's candidates (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c).
 *
 * today's `received` Live candidates (a day with no ChatGPT batch writes nothing; the Gemini fallback writer was deleted in 4f.1, D40),
 * plus Speed -> Live conversions still `received` from today or earlier (Phase 7f), after live_conversion_sweep
 *   -> schema + slot -> Live hard limits (and the Current Events limits) -> tag valid against the Live map
 *   -> star cap (the tagged Live bank + candidates already in review) -> Live bar test (score >= threshold; the
 *      writer's ChatGPT grade, else the OpenAI API, D35, 4f.2)
 *   -> Live repeat check (the checked-out JSON + candidates in review; ≤ 1 OpenAI call each)
 *   -> pending_review in question_candidates: waits in Quick Review's Live mode with its score, tag and any
 *      "possible repeat". Andrew keeps or rejects; Publish appends the kept ones to the JSON (D10).
 * Every candidate's outcome and reason is recorded on its row. Nothing here touches trivia_questions or the JSON:
 * a Live question reaches players only through Publish -> PR -> Sync Live Trivia. Candidate text is DATA.
 */
const fs = require('node:fs');
const path = require('node:path');
const map = require('../question-variety/map.cjs');
const slots = require('../question-variety/slots.cjs');
const ledger = require('../openai/ledger.cjs');
const runtime = require('../speed-trivia-uniqueness/runtime.cjs');
const liveAudience = require('../live-trivia-quality/audience.cjs');
const repeats = require('../live-trivia-quality/repeats.cjs');
const { freshSlug } = require('../live-trivia-quality/publish.cjs');
const cats = require('../live-trivia-quality/categories.cjs');
const rules = require('./rules.cjs');
const briefs = require('./brief.cjs');
const candidates = require('./candidates.cjs');
const { scoreBarTest } = require('./barTest.cjs');

const GAME = 'live';
const DEFAULT_THRESHOLD = 3;
const DEFAULT_MAX_DOLLARS = 0.25; // plan: Live repeat check cap $0.25/day (bar test included)
// pr_open: in a Publish PR that isn't merged, so not yet in the checked-out JSON (Phase 4c.2). published rows are.
const IN_REVIEW = Object.freeze(['pending_review', 'keep', 'publishing', 'pr_open']);
const IN_REVIEW_LIMIT = 1000;
const STATUS_TEXT = 500;

const must = async (promise, what) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${what} failed: ${error.message ?? 'unknown'}`);
  return data;
};

/** The canonical Live bank from the checkout (read-only): [{ slug, question, answer, acceptableAnswers, category }]. */
const readLiveCorpus = (dir = path.resolve(__dirname, '../..', cats.LIVE_DIR)) => {
  const out = [];
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const categoryName = String(parsed?.categoryName ?? '').trim();
    for (const q of Array.isArray(parsed?.questions) ? parsed.questions : []) {
      out.push({ slug: cats.slugify(String(q.slug ?? '') || String(q.question ?? '')), question: String(q.question ?? ''),
        answer: String(q.answer ?? ''), acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [],
        category: categoryName || String(q.category ?? '') });
    }
  }
  return out;
};

const readRun = (client, runDate) => must(client.from('question_writer_runs').select('source, model, received')
  .eq('game', GAME).eq('run_date', runDate).maybeSingle(), 'writer run read');

// The day's batch: regular and Current Events items (their slot has no `kind`), ≤ MAX_ITEMS.
const readReceived = async (client, runDate) => (await must(client.from('question_candidates')
  .select('id, slot, payload, source').eq('game', GAME).eq('run_date', runDate).eq('status', 'received').is('slot->>kind', null)
  .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(rules.MAX_ITEMS), 'candidate read')) ?? [];

// Phase 7f (R2 #27.2, #27.5): conversions get their own bounded read, oldest first, and it reaches back to earlier run
// dates, so one posted after its day's nightly, or left over from a crash or a busy day, is still processed.
const readConversionCandidates = async (client, runDate) => (await must(client.from('question_candidates')
  .select('id, slot, payload, source').eq('game', GAME).eq('status', 'received').eq('slot->>kind', 'conversion').lte('run_date', runDate)
  .order('run_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
  .limit(rules.MAX_CONVERSIONS), 'conversion read')) ?? [];

const readInReview = async client => (await must(client.from('question_candidates')
  .select('id, payload, tag, question_ref, created_at').eq('game', GAME).in('status', [...IN_REVIEW])
  .order('created_at', { ascending: false }).limit(IN_REVIEW_LIMIT), 'in-review read')) ?? [];

const readAreas = async client => (await must(client.from('question_coverage_areas')
  .select('id, category, name, eras, active').eq('game', GAME), 'map read')) ?? [];

const settle = (client, id, fields) => must(client.from('question_candidates')
  .update({ ...fields, reason: fields.reason == null ? null : String(fields.reason).slice(0, STATUS_TEXT), processed_at: new Date().toISOString() })
  .eq('id', id).eq('status', 'received'), 'candidate update');

const isCurrentEvents = category => category === map.CURRENT_EVENTS;

// Phase 4e (D37): a Speed -> Live rewrite. The slot is built by the site and conversionOf by the database on receive.
const isConversion = candidate => candidate?.slot?.kind === 'conversion' && typeof candidate?.payload?.conversionOf === 'string';

/** The request's outcome, once its candidate is settled. Only a `sent` request for this candidate changes. */
const settleRequest = (client, candidate, status, reason) => must(client.from('live_conversion_requests')
  .update({ status, reason: reason == null ? null : String(reason).slice(0, STATUS_TEXT), updated_at: new Date().toISOString() })
  .eq('id', candidate.payload.conversionOf).eq('candidate_id', candidate.id).eq('status', 'sent'), 'conversion update');

/**
 * Phase 7f (R2 #27.6): a conversion the repeat-check budget didn't reach goes back to the queue (re-sent next night),
 * rather than reading as a failure.
 */
const requeueRequest = (client, candidate) => must(client.from('live_conversion_requests')
  .update({ status: 'queued', candidate_id: null, reason: null, updated_at: new Date().toISOString() })
  .eq('id', candidate.payload.conversionOf).eq('candidate_id', candidate.id).eq('status', 'sent'), 'conversion requeue');

/** Why a conversion failed, in a few words for the question list. */
const conversionFailure = (reason, match) => {
  const [code, detail = ''] = reason.split(':');
  if (code === 'repeat') return match?.question ? `Already in Live: ${match.question}` : 'Already in Live.';
  if (code === 'hard-limit') return `Breaks a Live rule (${detail.trim()}).`;
  if (code === 'tag') return 'Couldn\'t tag it.';
  return 'The rewrite was unusable.';
};

/** Free gates, in order. Returns { ok:true, item, tag } or { ok:false, reason }. */
const freeGates = (candidate, { areasByCategory, today, conversion = false }) => {
  const checked = rules.validateLivePayload(candidate.payload, { categories: candidates.CATEGORIES[GAME] });
  if (!checked.ok) return { ok: false, reason: 'schema' };
  const item = checked.item;
  if (!conversion && item.category !== candidate.slot?.category) return { ok: false, reason: 'slot-mismatch' };
  const limits = [...rules.liveHardLimits(item), ...(isCurrentEvents(item.category) ? rules.currentEventsLimits(item, today) : [])];
  if (limits.length) return { ok: false, reason: `hard-limit:${limits.join(',')}` };
  const areas = areasByCategory.get(item.category) ?? [];
  const unmapped = !areas.some(area => area.active !== false);
  const tag = map.validateTag({ area: item.area, era: item.era, subject: item.subject },
    { category: item.category, areas, today, requireActive: true, forWriting: true, allowUnmapped: unmapped });
  if (!tag.ok) return { ok: false, reason: `tag:${tag.reason}` };
  return { ok: true, item, tag };
};

/**
 * processLiveDay(...) -> report. createScorer / createChecker / corpus are injectable for tests.
 * Fatal errors throw with `error.report`; unsettled candidates stay `received`, so a same-day re-run continues.
 */
const processLiveDay = async ({
  client, today = new Date(), threshold = DEFAULT_THRESHOLD, env = process.env, corpus: corpusEntries,
  createScorer = liveAudience.createLiveAudienceScorer, createChecker = repeats.createRepeatChecker, warn = console.warn,
}) => {
  const runDate = map.isoDay(today);
  const report = { game: GAME, runDate, source: null, model: null, examined: 0, rejected: {}, graded: null, waiting: 0,
    waitingByKind: { regular: 0, currentEvents: 0 }, possibleRepeats: 0, skipped: 0, stopped: null, dollars: null, waitingIds: [],
    conversions: { examined: 0, waiting: 0, rejected: 0, requeued: 0 }, sweep: null };
  const reject = async (candidate, reason, extra = {}, match = null) => {
    const key = reason.split(':')[0];
    report.rejected[key] = (report.rejected[key] ?? 0) + 1;
    await settle(client, candidate.id, { ...extra, status: 'rejected', reason });
    if (isConversion(candidate)) { report.conversions.rejected++; await settleRequest(client, candidate, 'failed', conversionFailure(reason, match)); }
  };
  // Only the repeat-check budget skips a candidate.
  const skip = async (candidate, reason) => {
    await settle(client, candidate.id, { status: 'skipped', reason });
    if (isConversion(candidate)) { report.conversions.requeued++; await requeueRequest(client, candidate); }
  };
  let budget = null;
  try {
    // Phase 7f: tidy the conversion queue first (stranded `sent` requests, Speed questions no longer kept). Optional:
    // a failure is logged and the night goes on.
    try {
      report.sweep = await runtime.rpc(client, 'live_conversion_sweep', {});
    } catch (error) {
      warn(`[question-writer] live: conversion sweep skipped (${error instanceof Error ? error.message : 'failed'})`);
    }
    // R2 #27.1: conversions have no run row of their own, so a day without the regular batch still processes them.
    const run = await readRun(client, runDate);
    report.source = run?.source ?? null;
    report.model = run?.model ?? null;

    const list = [...(run ? await readReceived(client, runDate) : []), ...await readConversionCandidates(client, runDate)];
    report.examined = list.length;
    if (!list.length) { report.stopped = run ? 'nothing-received' : 'no-candidates'; return report; }
    const areasByCategory = new Map();
    for (const area of await readAreas(client)) {
      if (!areasByCategory.has(area.category)) areasByCategory.set(area.category, []);
      areasByCategory.get(area.category).push(area);
    }

    // 1. Free gates. Conversions (Phase 4e) skip the slot match: they have no slot to match.
    let passed = [];
    const conversions = [];
    for (const candidate of list) {
      const conversion = isConversion(candidate);
      const gate = freeGates(candidate, { areasByCategory, today, conversion });
      if (!gate.ok) await reject(candidate, gate.reason);
      else (conversion ? conversions : passed).push({ candidate, item: gate.item, tag: gate.tag });
    }
    report.conversions.examined = list.filter(isConversion).length;
    if (!passed.length && !conversions.length) { report.stopped = 'none-passed-gates'; return report; }

    // 2. Star cap (D15): the tagged Live bank plus candidates already in review, plus this batch. A conversion is
    // hand-picked, so it is never rejected for the cap; it only carries a note (D37).
    const inReview = await readInReview(client);
    const keys = [...new Set([...passed, ...conversions].map(p => p.tag.subjectKey))];
    const stats = await runtime.rpc(client, 'question_subject_stats', { p_game: GAME, p_keys: keys });
    const statMap = new Map((Array.isArray(stats) ? stats : []).map(s => [s.subjectKey, { count: Number(s.count) || 0, lastWritten: s.lastWritten ?? null }]));
    for (const row of inReview) {
      const key = row.tag?.subjectKey;
      if (!key || !keys.includes(key)) continue;
      const stat = statMap.get(key) ?? { count: 0, lastWritten: null };
      stat.count++;
      if (!stat.lastWritten || Date.parse(row.created_at) > Date.parse(stat.lastWritten)) stat.lastWritten = row.created_at;
      statMap.set(key, stat);
    }
    const capped = slots.checkStarCap(passed.map(p => ({ subjectKey: p.tag.subjectKey })), statMap, today);
    passed = (await Promise.all(passed.map(async (p, i) => {
      if (capped[i].ok) return p;
      await reject(p.candidate, `star-cap:${capped[i].detail}`);
      return null;
    }))).filter(Boolean);
    const convCapped = slots.checkStarCap(conversions.map(p => ({ subjectKey: p.tag.subjectKey })), statMap, today);
    conversions.forEach((p, i) => { p.overStarCap = !convCapped[i].ok; });
    if (!passed.length && !conversions.length) { report.stopped = 'none-passed-star-cap'; return report; }

    // 3. Live bar test (D35): the writer's ChatGPT grade when valid for the current prompt version; one OpenAI call
    // for the rest, inside the day's Live dollars. A conversion's grade is shown, never gating, and an ungraded
    // conversion is not sent for grading (D36; still so on OpenAI, 4f.2).
    budget = runtime.createBudget({ dollars: Number(env.QUESTION_WRITER_LIVE_MAX_DOLLARS || DEFAULT_MAX_DOLLARS) });
    for (const p of conversions) {
      const grade = liveAudience.writerGrade(p.candidate.payload?.grade);
      p.audience = grade ? liveAudience.audienceFromWriter(p.item, grade) : null;
    }
    const bar = await scoreBarTest({
      audience: liveAudience,
      items: passed.map(p => ({ id: p.candidate.id, grade: p.candidate.payload?.grade, row: p.item, apiRow: { id: p.candidate.id, ...p.item } })),
      scoreUngraded: rows => createScorer({ apiKey: env.OPENAI_API_KEY, budget }).scoreBatch(rows),
    });
    report.graded = bar.graded;
    const good = [];
    for (const [i, p] of passed.entries()) {
      p.audience = bar.audiences[i];
      // The score is kept on the reject, so the grader can be audited against Andrew later (D35).
      if (p.audience.score < threshold) await reject(p.candidate, `bar-test:${p.audience.score}`, { audience: p.audience });
      else good.push(p);
    }
    if (!good.length && !conversions.length) { report.stopped = 'none-passed-bar-test'; report.dollars = budget.summary().dollars; return report; }

    // 4. Repeat check, best first, up to the day's delivery target per kind; then the conversions (no target).
    const kindOf = p => (isCurrentEvents(p.item.category) ? 'currentEvents' : 'regular');
    good.sort((a, b) => (kindOf(a) === kindOf(b) ? 0 : kindOf(a) === 'currentEvents' ? -1 : 1)
      || b.audience.score - a.audience.score || a.candidate.slot.n - b.candidate.slot.n);
    const corpus = repeats.createCorpus(corpusEntries ?? readLiveCorpus());
    for (const row of inReview) {
      corpus.add({ slug: row.question_ref, question: row.payload?.question, answer: row.payload?.answer,
        acceptableAnswers: row.payload?.acceptableAnswers, category: row.payload?.category });
    }
    const checker = createChecker({ corpus, apiKey: env.OPENAI_API_KEY, budget });
    let stopped = null;
    // Returns 'waiting', 'repeat' or 'budget'; settles the candidate (and a conversion's request).
    const admit = async (p, extraTag = {}) => {
      if (stopped) { await skip(p.candidate, stopped); return 'budget'; }
      let verdict;
      try {
        verdict = await checker.check(p.item);
      } catch (error) {
        if (error.code === 'budget_exhausted') { stopped = 'budget'; await skip(p.candidate, 'budget'); return 'budget'; }
        throw error;
      }
      if (verdict.verdict === 'duplicate') { await reject(p.candidate, `repeat: ${verdict.match.slug} (${verdict.how})`, {}, verdict.match); return 'repeat'; }
      const slug = freshSlug(p.item.question, new Set(corpus.bySlug.keys()));
      const tag = { areaId: p.tag.areaId, area: p.tag.area, era: p.tag.era, subject: p.tag.subject, subjectKey: p.tag.subjectKey,
        ...(isCurrentEvents(p.item.category) ? { expiresOn: map.expiresOnFor(p.tag.era) } : {}), ...extraTag };
      const possible = verdict.verdict === 'uncertain' ? verdict.match : null;
      await settle(client, p.candidate.id, { status: 'pending_review', question_ref: slug, reason: null,
        audience: p.audience ?? null, tag, possible_repeat: possible });
      if (isConversion(p.candidate)) await settleRequest(client, p.candidate, 'done', null);
      corpus.add({ slug, question: p.item.question, answer: p.item.answer, acceptableAnswers: p.item.acceptableAnswers, category: p.item.category });
      if (possible) report.possibleRepeats++;
      return 'waiting';
    };
    for (const p of good) {
      const kind = kindOf(p);
      if (!stopped && (report.waitingByKind[kind] >= slots.LIVE_DELIVER[kind] || report.waiting >= slots.LIVE_ROUND)) {
        report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: 'daily-target' }); continue;
      }
      const outcome = await admit(p);
      if (outcome === 'budget') report.skipped++;
      if (outcome !== 'waiting') continue;
      report.waiting++; report.waitingByKind[kind]++; report.waitingIds.push(p.candidate.id);
    }
    for (const p of conversions) {
      const outcome = await admit(p, p.overStarCap ? { overStarCap: true } : {});
      if (outcome === 'budget') report.skipped++;
      if (outcome !== 'waiting') continue;
      report.conversions.waiting++; report.waitingIds.push(p.candidate.id);
    }
    report.stopped = stopped;
    report.dollars = budget.summary().dollars;
    return report;
  } catch (error) {
    throw Object.assign(error, { report });
  } finally {
    // Phase 4f.2: one ledger row per model for tonight's checks (none when nothing was paid for).
    if (budget) await ledger.recordBudget(client, { feature: 'live_question_checks', budget, metadata: { runDate } });
  }
};

module.exports = { DEFAULT_THRESHOLD, DEFAULT_MAX_DOLLARS, readLiveCorpus, freeGates, processLiveDay, isConversion, conversionFailure };
