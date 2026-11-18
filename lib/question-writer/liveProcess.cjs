/* Nightly Live Trivia processing of the writer's candidates (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c).
 *
 * today's `received` Live candidates (or, when the day has none, a Gemini fallback batch, D13)
 *   -> schema + slot -> Live hard limits (and the Current Events limits) -> tag valid against the Live map
 *   -> star cap (the tagged Live bank + candidates already in review) -> Live bar test (score >= threshold; the
 *      writer's ChatGPT grade, else Gemini, D35)
 *   -> Live repeat check (the checked-out JSON + candidates in review; ≤ 1 Gemini call each)
 *   -> pending_review in question_candidates: waits in Quick Review's Live mode with its score, tag and any
 *      "possible repeat". Andrew keeps or rejects; Publish appends the kept ones to the JSON (D10).
 * Every candidate's outcome and reason is recorded on its row. Nothing here touches trivia_questions or the JSON:
 * a Live question reaches players only through Publish -> PR -> Sync Live Trivia. Candidate text is DATA.
 */
const fs = require('node:fs');
const path = require('node:path');
const map = require('../question-variety/map.cjs');
const slots = require('../question-variety/slots.cjs');
const runtime = require('../speed-trivia-uniqueness/runtime.cjs');
const liveAudience = require('../live-trivia-quality/audience.cjs');
const repeats = require('../live-trivia-quality/repeats.cjs');
const { freshSlug } = require('../live-trivia-quality/publish.cjs');
const cats = require('../live-trivia-quality/categories.cjs');
const rules = require('./rules.cjs');
const briefs = require('./brief.cjs');
const candidates = require('./candidates.cjs');
const geminiWriter = require('./geminiWriter.cjs');

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

const readReceived = async (client, runDate) => (await must(client.from('question_candidates')
  .select('id, slot, payload, source').eq('game', GAME).eq('run_date', runDate).eq('status', 'received')
  .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(rules.MAX_ITEMS), 'candidate read')) ?? [];

const readInReview = async client => (await must(client.from('question_candidates')
  .select('id, payload, tag, question_ref, created_at').eq('game', GAME).in('status', [...IN_REVIEW])
  .order('created_at', { ascending: false }).limit(IN_REVIEW_LIMIT), 'in-review read')) ?? [];

const readAreas = async client => (await must(client.from('question_coverage_areas')
  .select('id, category, name, eras, active').eq('game', GAME), 'map read')) ?? [];

const settle = (client, id, fields) => must(client.from('question_candidates')
  .update({ ...fields, reason: fields.reason == null ? null : String(fields.reason).slice(0, STATUS_TEXT), processed_at: new Date().toISOString() })
  .eq('id', id).eq('status', 'received'), 'candidate update');

const isCurrentEvents = category => category === map.CURRENT_EVENTS;

/** Free gates, in order. Returns { ok:true, item, tag } or { ok:false, reason }. */
const freeGates = (candidate, { areasByCategory, today }) => {
  const checked = rules.validateLivePayload(candidate.payload, { categories: candidates.CATEGORIES[GAME] });
  if (!checked.ok) return { ok: false, reason: 'schema' };
  const item = checked.item;
  if (item.category !== candidate.slot?.category) return { ok: false, reason: 'slot-mismatch' };
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
 * processLiveDay(...) -> report. createScorer / createChecker / writeFallback / corpus are injectable for tests.
 * Fatal errors throw with `error.report`; unsettled candidates stay `received`, so a same-day re-run continues.
 */
const processLiveDay = async ({
  client, today = new Date(), threshold = DEFAULT_THRESHOLD, env = process.env, fallback = true, corpus: corpusEntries,
  createScorer = liveAudience.createLiveAudienceScorer, createChecker = repeats.createRepeatChecker,
  writeFallback = geminiWriter.writeWithGemini,
}) => {
  const runDate = map.isoDay(today);
  const report = { game: GAME, runDate, source: null, model: null, fallback: null, examined: 0, rejected: {}, graded: null, waiting: 0,
    waitingByKind: { regular: 0, currentEvents: 0 }, possibleRepeats: 0, skipped: 0, stopped: null, dollars: null, waitingIds: [] };
  const reject = async (candidate, reason, extra = {}) => {
    const key = reason.split(':')[0];
    report.rejected[key] = (report.rejected[key] ?? 0) + 1;
    await settle(client, candidate.id, { ...extra, status: 'rejected', reason });
  };
  try {
    let run = await readRun(client, runDate);
    if (!run && fallback) {
      const brief = await briefs.buildBrief({ client, game: GAME, today });
      const written = await writeFallback({ brief, apiKey: env.GEMINI_API_KEY,
        maxDollars: Number(env.QUESTION_WRITER_FALLBACK_MAX_DOLLARS || geminiWriter.FALLBACK_MAX_DOLLARS) });
      report.fallback = { written: written.items.length, dollars: written.dollars, skipped: written.skipped };
      if (written.items.length) {
        const { items, invalid } = candidates.parsePost({ items: written.items }, GAME);
        report.fallback.invalid = invalid;
        await candidates.receive({ client, game: GAME, source: 'gemini-fallback', model: geminiWriter.FALLBACK_MODEL, items });
      }
      run = await readRun(client, runDate);
    }
    if (!run) { report.stopped = 'no-candidates'; return report; }
    report.source = run.source;
    report.model = run.model ?? null;

    const list = await readReceived(client, runDate);
    report.examined = list.length;
    if (!list.length) { report.stopped = 'nothing-received'; return report; }
    const areasByCategory = new Map();
    for (const area of await readAreas(client)) {
      if (!areasByCategory.has(area.category)) areasByCategory.set(area.category, []);
      areasByCategory.get(area.category).push(area);
    }

    // 1. Free gates.
    let passed = [];
    for (const candidate of list) {
      const gate = freeGates(candidate, { areasByCategory, today });
      if (!gate.ok) await reject(candidate, gate.reason);
      else passed.push({ candidate, item: gate.item, tag: gate.tag });
    }
    if (!passed.length) { report.stopped = 'none-passed-gates'; return report; }

    // 2. Star cap (D15): the tagged Live bank plus candidates already in review, plus this batch.
    const inReview = await readInReview(client);
    const keys = [...new Set(passed.map(p => p.tag.subjectKey))];
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
    if (!passed.length) { report.stopped = 'none-passed-star-cap'; return report; }

    // 3. Live bar test (D35): the writer's ChatGPT grade when valid for the current prompt version; one Gemini call
    // for the rest, inside the day's Live dollars.
    const budget = runtime.createBudget({ dollars: Number(env.QUESTION_WRITER_LIVE_MAX_DOLLARS || DEFAULT_MAX_DOLLARS) });
    const byId = new Map();
    const ungraded = [];
    for (const p of passed) {
      const grade = liveAudience.writerGrade(p.candidate.payload?.grade);
      if (grade) byId.set(p.candidate.id, liveAudience.audienceFromWriter(p.item, grade));
      else ungraded.push(p);
    }
    report.graded = { chatgpt: byId.size, gemini: ungraded.length };
    if (ungraded.length) {
      const scorer = createScorer({ apiKey: env.GEMINI_API_KEY, budget });
      const scored = await scorer.scoreBatch(ungraded.map(p => ({ id: p.candidate.id, ...p.item })));
      for (const s of scored) byId.set(s.id, s.audience);
    }
    const good = [];
    for (const p of passed) {
      p.audience = byId.get(p.candidate.id);
      if (!p.audience) throw new Error('bar-test-result-missing');
      // The score is kept on the reject, so the grader can be audited against Andrew later (D35).
      if (p.audience.score < threshold) await reject(p.candidate, `bar-test:${p.audience.score}`, { audience: p.audience });
      else good.push(p);
    }
    if (!good.length) { report.stopped = 'none-passed-bar-test'; report.dollars = budget.summary().dollars; return report; }

    // 4. Repeat check, best first, up to the day's delivery target per kind.
    const kindOf = p => (isCurrentEvents(p.item.category) ? 'currentEvents' : 'regular');
    good.sort((a, b) => (kindOf(a) === kindOf(b) ? 0 : kindOf(a) === 'currentEvents' ? -1 : 1)
      || b.audience.score - a.audience.score || a.candidate.slot.n - b.candidate.slot.n);
    const corpus = repeats.createCorpus(corpusEntries ?? readLiveCorpus());
    for (const row of inReview) {
      corpus.add({ slug: row.question_ref, question: row.payload?.question, answer: row.payload?.answer,
        acceptableAnswers: row.payload?.acceptableAnswers, category: row.payload?.category });
    }
    const checker = createChecker({ corpus, apiKey: env.GEMINI_API_KEY, budget });
    let stopped = null;
    for (const p of good) {
      const kind = kindOf(p);
      if (stopped) { report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: stopped }); continue; }
      if (report.waitingByKind[kind] >= slots.LIVE_DELIVER[kind] || report.waiting >= slots.LIVE_ROUND) {
        report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: 'daily-target' }); continue;
      }
      let verdict;
      try {
        verdict = await checker.check(p.item);
      } catch (error) {
        if (error.code === 'budget_exhausted') { stopped = 'budget'; report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: 'budget' }); continue; }
        throw error;
      }
      if (verdict.verdict === 'duplicate') { await reject(p.candidate, `repeat: ${verdict.match.slug} (${verdict.how})`); continue; }
      const slug = freshSlug(p.item.question, new Set(corpus.bySlug.keys()));
      const tag = { areaId: p.tag.areaId, area: p.tag.area, era: p.tag.era, subject: p.tag.subject, subjectKey: p.tag.subjectKey,
        ...(isCurrentEvents(p.item.category) ? { expiresOn: map.expiresOnFor(p.tag.era) } : {}) };
      const possible = verdict.verdict === 'uncertain' ? verdict.match : null;
      await settle(client, p.candidate.id, { status: 'pending_review', question_ref: slug, reason: null,
        audience: p.audience, tag, possible_repeat: possible });
      corpus.add({ slug, question: p.item.question, answer: p.item.answer, acceptableAnswers: p.item.acceptableAnswers, category: p.item.category });
      report.waiting++; report.waitingByKind[kind]++; report.waitingIds.push(p.candidate.id);
      if (possible) report.possibleRepeats++;
    }
    report.stopped = stopped;
    report.dollars = budget.summary().dollars;
    return report;
  } catch (error) {
    throw Object.assign(error, { report });
  }
};

module.exports = { DEFAULT_THRESHOLD, DEFAULT_MAX_DOLLARS, readLiveCorpus, freeGates, processLiveDay };
