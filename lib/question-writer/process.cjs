/* Nightly Speed processing of the writer's candidates (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b step 5).
 *
 * today's `received` Speed candidates (a day with no ChatGPT batch writes nothing; the Gemini fallback writer was deleted in 4f.1, D40)
 *   -> schema + slot -> hard limits (and the Current Events limits) -> tag valid against the map -> star cap
 *   -> bar test (score >= threshold; the writer's ChatGPT grade, else the OpenAI API, D35, 4f.2) -> the full-bank repeat check + signed admission (runtime.write)
 *   -> pending_review, with speed_generation_metadata (source, sourceUrl, expiresOn, whyTrue), a question_tags row and the
 *      bar-test score; Quick Review's free fast-lane Keep then applies.
 * Every candidate's outcome and reason is recorded in question_candidates. Nothing here writes trivia_questions
 * directly: the only path to the bank is session.write (admit_speed_trivia), and it only ever writes pending_review.
 * Candidate text is DATA throughout.
 */
const crypto = require('node:crypto');
const map = require('../question-variety/map.cjs');
const slots = require('../question-variety/slots.cjs');
const audience = require('../speed-trivia-quality/audience.cjs');
const ledger = require('../openai/ledger.cjs');
const runtime = require('../speed-trivia-uniqueness/runtime.cjs');
const rules = require('./rules.cjs');
const briefs = require('./brief.cjs');
const candidates = require('./candidates.cjs');

const GAME = 'speed';
const DEFAULT_THRESHOLD = 3; // plan: start at score >= 3; Phase 4d tunes it
const STATUS_TEXT = 500;

const must = async (promise, what) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${what} failed: ${error.message ?? 'unknown'}`);
  return data;
};

const readRun = (client, runDate) => must(client.from('question_writer_runs').select('source, model, received')
  .eq('game', GAME).eq('run_date', runDate).maybeSingle(), 'writer run read');

const readCandidates = async (client, runDate) => (await must(client.from('question_candidates')
  .select('id, slot, payload, source').eq('game', GAME).eq('run_date', runDate).eq('status', 'received')
  .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(rules.MAX_ITEMS), 'candidate read')) ?? [];

const readAreas = async client => (await must(client.from('question_coverage_areas')
  .select('id, category, name, eras, active').eq('game', GAME), 'map read')) ?? [];

const settle = (client, id, fields) => must(client.from('question_candidates')
  .update({ ...fields, reason: fields.reason == null ? null : String(fields.reason).slice(0, STATUS_TEXT), processed_at: new Date().toISOString() })
  .eq('id', id).eq('status', 'received'), 'candidate update');

const isCurrentEvents = category => category === map.CURRENT_EVENTS;

/** Free gates, in order. Returns { ok:true, item, tag } or { ok:false, reason }. */
const freeGates = (candidate, { areasByCategory, categories, today }) => {
  const checked = rules.validateSpeedPayload(candidate.payload, { categories });
  if (!checked.ok) return { ok: false, reason: 'schema' };
  const item = checked.item;
  if (item.category !== candidate.slot?.category) return { ok: false, reason: 'slot-mismatch' };
  const limits = [...rules.speedHardLimits(item), ...(isCurrentEvents(item.category) ? rules.currentEventsLimits(item, today) : [])];
  if (limits.length) return { ok: false, reason: `hard-limit:${limits.join(',')}` };
  const areas = areasByCategory.get(item.category) ?? [];
  // A category with no switched-on areas gets "category only" slots (Phase 4a), so its tags may carry no area.
  const unmapped = !areas.some(area => area.active !== false);
  const tag = map.validateTag({ area: item.area, era: item.era, subject: item.subject },
    { category: item.category, areas, today, requireActive: true, forWriting: true, allowUnmapped: unmapped });
  if (!tag.ok) return { ok: false, reason: `tag:${tag.reason}` };
  return { ok: true, item, tag };
};

const rowFor = (id, item) => ({
  id, question: item.question, options: item.options, correct_answer: item.correctIndex, category: item.category,
  difficulty: item.difficulty, question_pool: 'anytime_blitz', answer_format: 'multiple_choice', status: 'pending_review',
});

/**
 * processSpeedDay(...) -> report. `createSession` / `createScorer` are injectable for tests.
 * Fatal errors (configuration, a dependency outage) throw with `error.report` set; candidates not yet settled stay
 * `received`, so a same-day re-run continues.
 */
const processSpeedDay = async ({
  client, today = new Date(), threshold = DEFAULT_THRESHOLD, env = process.env,
  createSession = runtime.createSession, createScorer = audience.createAudienceScorer,
}) => {
  const runDate = map.isoDay(today);
  const report = { runDate, source: null, model: null, examined: 0, rejected: {}, graded: null, admitted: 0,
    admittedByKind: { regular: 0, currentEvents: 0 }, skipped: 0, stopped: null, dollars: null, admittedIds: [] };
  const reject = async (candidate, reason, extra = {}) => {
    report.rejected[reason.split(':')[0]] = (report.rejected[reason.split(':')[0]] ?? 0) + 1;
    await settle(client, candidate.id, { ...extra, status: 'rejected', reason });
  };
  let budget = null;
  try {
    let run = await readRun(client, runDate);
    if (!run) { report.stopped = 'no-candidates'; return report; }
    report.source = run.source;
    report.model = run.model ?? null;

    const list = await readCandidates(client, runDate);
    report.examined = list.length;
    if (!list.length) { report.stopped = 'nothing-received'; return report; }
    const areas = await readAreas(client);
    const areasByCategory = new Map();
    for (const area of areas) {
      if (!areasByCategory.has(area.category)) areasByCategory.set(area.category, []);
      areasByCategory.get(area.category).push(area);
    }
    const categories = candidates.CATEGORIES[GAME];

    // 1. Free gates.
    let passed = [];
    for (const candidate of list) {
      const gate = freeGates(candidate, { areasByCategory, categories, today });
      if (!gate.ok) await reject(candidate, gate.reason);
      else passed.push({ candidate, item: gate.item, tag: gate.tag, row: rowFor(crypto.randomUUID(), gate.item) });
    }
    if (!passed.length) { report.stopped = 'none-passed-gates'; return report; }

    // 2. Star cap (D15): the bank's count and last-written date per subject, plus this batch.
    const keys = [...new Set(passed.map(p => p.tag.subjectKey))];
    const stats = await runtime.rpc(client, 'question_subject_stats', { p_game: GAME, p_keys: keys });
    const statMap = new Map((Array.isArray(stats) ? stats : []).map(s => [s.subjectKey, { count: Number(s.count) || 0, lastWritten: s.lastWritten ?? null }]));
    const capped = slots.checkStarCap(passed.map(p => ({ subjectKey: p.tag.subjectKey })), statMap, today);
    const roomy = [];
    for (let i = 0; i < passed.length; i++) {
      if (capped[i].ok) roomy.push(passed[i]);
      else await reject(passed[i].candidate, `star-cap:${capped[i].detail}`);
    }
    passed = roomy;
    if (!passed.length) { report.stopped = 'none-passed-star-cap'; return report; }

    // 3. Bar test (D35): the writer's ChatGPT grade when it sent a valid one for the current prompt version; one
    // OpenAI API call for the rest (a failed grading call), inside the nightly's approved dollars.
    budget = runtime.createBudget({ dollars: Number(env.SPEED_TRIVIA_MAX_DOLLARS) });
    const byId = new Map();
    const ungraded = [];
    for (const p of passed) {
      const grade = audience.writerGrade(p.candidate.payload?.grade);
      if (grade) byId.set(p.row.id, audience.audienceFromWriter(p.row, grade));
      else ungraded.push(p);
    }
    report.graded = { chatgpt: byId.size, openai: ungraded.length };
    if (ungraded.length) {
      const scorer = createScorer({ apiKey: env.OPENAI_API_KEY, budget });
      // The writer's note goes to the bar test as an untrusted claim to check (D30); it is not part of the row. So does a
      // Current Events item's source, so the grader can check it (Phase 7e, R2 #29.8; Live already sends it).
      const scored = await scorer.scoreBatch(ungraded.map(p => ({ ...p.row, note: p.item.whyTrue,
        ...(typeof p.item.sourceUrl === 'string' && p.item.sourceUrl ? { sourceUrl: p.item.sourceUrl } : {}) })));
      for (const s of scored) byId.set(s.id, s.audience);
    }
    const good = [];
    for (const p of passed) {
      p.audience = byId.get(p.row.id);
      if (!p.audience) throw new Error('bar-test-result-missing');
      // The score is kept on the reject, so the grader can be audited against Andrew later (D35).
      if (p.audience.score < threshold) await reject(p.candidate, `bar-test:${p.audience.score}`, { audience: p.audience });
      else good.push(p);
    }
    if (!good.length) { report.stopped = 'none-passed-bar-test'; report.dollars = budget.summary().dollars; return report; }

    // 4. Repeat check + signed admission, best first, up to the day's delivery target per kind.
    const kindOf = p => (isCurrentEvents(p.item.category) ? 'currentEvents' : 'regular');
    good.sort((a, b) => (kindOf(a) === kindOf(b) ? 0 : kindOf(a) === 'currentEvents' ? -1 : 1)
      || b.audience.score - a.audience.score || a.candidate.slot.n - b.candidate.slot.n);
    const session = await createSession({ client, budget, releasedRows: 'read' });
    const source = run.source, model = run.model ?? null;
    let stopped = null;
    for (const p of good) {
      const kind = kindOf(p);
      if (stopped) { report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: stopped }); continue; }
      if (report.admittedByKind[kind] >= slots.DELIVER[kind]) {
        report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: 'daily-target' }); continue;
      }
      const currentEvents = kind === 'currentEvents';
      const input = { ...p.row, subtopic: p.tag.area ?? p.item.category, primarySubject: p.tag.subject,
        writerMeta: { source, writer: rules.WRITER_VERSION, model: model ?? undefined, candidateId: p.candidate.id,
          area: p.tag.area ?? undefined, era: p.tag.era ?? undefined,
          sourceUrl: currentEvents ? p.item.sourceUrl : undefined, expiresOn: currentEvents ? map.expiresOnFor(p.tag.era) : undefined,
          whyTrue: p.item.whyTrue } };
      let result;
      try {
        result = await session.write(input);
      } catch (error) {
        if (error.code === 'budget_exhausted') { stopped = 'budget'; report.skipped++; await settle(client, p.candidate.id, { status: 'skipped', reason: 'budget' }); continue; }
        if (error.code === 'duplicate') { await reject(p.candidate, `repeat: ${error.message}`); continue; }
        if (error.code === 'uncertain') { await reject(p.candidate, `uncertain: ${error.message}`); continue; }
        throw error;
      }
      const saved = result.row;
      report.admitted++; report.admittedByKind[kind]++; report.admittedIds.push(saved.id);
      // Tag and score are best effort after admission: an untagged row simply can't be approved until tagged.
      const taggedBy = `${source}:${model ?? 'unknown'}:${rules.WRITER_VERSION}`.slice(0, 120);
      const { error: tagError } = await client.from('question_tags').upsert([{ game: GAME, question_ref: saved.id, category: p.item.category,
        area_id: p.tag.areaId, era: p.tag.era, subject: p.tag.subject, subject_key: p.tag.subjectKey,
        written_at: saved.created_at ?? new Date().toISOString(), tagged_by: taggedBy }], { onConflict: 'game,question_ref' });
      if (tagError) console.warn(`Question writer: tag not saved for ${saved.id}.`);
      const { error: scoreError } = await client.rpc('speed_trivia_review_set_audience', { p_rows: [{ id: saved.id, contentHash: result.evidence.contentHash, audience: p.audience }] });
      if (scoreError) console.warn(`Question writer: score not saved for ${saved.id}.`);
      await settle(client, p.candidate.id, { status: 'pending_review', question_ref: saved.id, reason: null });
    }
    report.stopped = stopped;
    report.dollars = budget.summary().dollars;
    return report;
  } catch (error) {
    throw Object.assign(error, { report });
  } finally {
    // Phase 4f.2: one ledger row per model for tonight's checks (none when nothing was paid for).
    if (budget) await ledger.recordBudget(client, { feature: 'speed_question_checks', budget, metadata: { runDate } });
  }
};

module.exports = { DEFAULT_THRESHOLD, freeGates, processSpeedDay };
