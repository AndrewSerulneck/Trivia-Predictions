/* The writer's post: parse, then store through question_writer_receive (docs/speed-trivia-backlog-and-quality-plan.md
 * Phase 4b, step 3). Used by POST /api/question-writer/candidates.
 * Posted content is untrusted DATA: it is shape-checked here and fully gated by the nightly before anyone sees it.
 */
const crypto = require('node:crypto');
const rules = require('./rules.cjs');
const { SPEED_CATEGORIES } = require('./speedCategories.cjs');
const { LIVE_CATEGORIES } = require('../live-trivia-quality/categories.cjs');
const speedAudience = require('../speed-trivia-quality/audience.cjs');
const liveAudience = require('../live-trivia-quality/audience.cjs');

const SOURCES = Object.freeze(['chatgpt']); // old rows may carry 'gemini-fallback'; they are read, never written (4f.1)
const CATEGORIES = Object.freeze({ speed: [...SPEED_CATEGORIES], live: [...LIVE_CATEGORIES] });
const VALIDATORS = Object.freeze({ speed: rules.validateSpeedPayload, live: rules.validateLivePayload });
// The writer's bar-test grade per item (D35): checked like a model reply, for the game's current prompt version.
const GRADERS = Object.freeze({ speed: speedAudience.writerGrade, live: liveAudience.writerGrade });

class CandidateError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const shortText = (value, max) => value == null ? null : typeof value === 'string' && value.length <= max ? value : undefined;

const parseSlot = (slot, categories) => {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null;
  const area = shortText(slot.area, 80), era = shortText(slot.era, 40);
  if (!Number.isInteger(slot.n) || slot.n < 1 || slot.n > rules.MAX_ITEMS || !categories.includes(slot.category)
    || area === undefined || era === undefined) return null;
  return { n: slot.n, category: slot.category, area, era };
};

const MODEL = /^[A-Za-z0-9._:-]{1,80}$/;
/** The writer's model name as reported, or null when absent or malformed (it is only a label). */
const cleanModel = value => typeof value === 'string' && MODEL.test(value) ? value : null;

/**
 * parsePost(body, game) -> { items:[{slot, payload}], invalid, graded }. Throws CandidateError for a malformed
 * envelope (400), too many items (413) or nothing usable (422). Items that fail the schema are dropped and counted.
 * A valid grade (with `graderModel`) is stored as `payload.grade`; an invalid or missing one is dropped, never the
 * item, and the nightly grades that item through the OpenAI API (4f.2). The token already trusts the writer with the questions, so
 * trusting its grades adds no authority; the free checks and the repeat check still run on the server.
 */
const parsePost = (body, game) => {
  const categories = CATEGORIES[game];
  if (!categories) throw new CandidateError('game_not_ready', 'Writer game not available.', 404);
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) throw new CandidateError('invalid', 'Invalid post.', 400);
  if (body.items.length > rules.MAX_ITEMS) throw new CandidateError('too_many', `At most ${rules.MAX_ITEMS} items.`, 413);
  const graderModel = cleanModel(body.graderModel);
  const items = [];
  let invalid = 0, graded = 0;
  for (const entry of body.items) {
    const slot = parseSlot(entry?.slot, categories);
    const checked = slot ? VALIDATORS[game](entry?.payload, { categories }) : { ok: false };
    if (!checked.ok) { invalid++; continue; }
    const grade = graderModel && entry.grade && typeof entry.grade === 'object' && !Array.isArray(entry.grade)
      ? GRADERS[game]({ ...entry.grade, model: graderModel }) : null;
    if (grade) graded++;
    items.push({ slot, payload: grade ? { ...checked.item, grade } : checked.item });
  }
  if (!items.length) throw new CandidateError('empty', 'No valid items.', 422);
  return { items, invalid, graded };
};

const batchHash = items => crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');

/** Store one day's batch. Returns { runDate, received, idempotent }. */
const receive = async ({ client, game, source, model = null, items }) => {
  if (!SOURCES.includes(source)) throw new Error('invalid-writer-source');
  const { data, error } = await client.rpc('question_writer_receive', {
    p_game: game, p_source: source, p_model: cleanModel(model), p_batch_hash: batchHash(items), p_items: items,
  });
  if (error) {
    const message = error.message ?? '';
    if (/writer-already-received/.test(message)) throw new CandidateError('already_received', 'Today already has a batch.', 409);
    if (/writer-post-limit/.test(message)) throw new CandidateError('post_limit', 'Daily post limit reached.', 429);
    if (/invalid-writer-post/.test(message)) throw new CandidateError('invalid', 'Invalid post.', 400);
    throw new CandidateError('unavailable', 'Could not save. Try again.', 503);
  }
  return { runDate: data.runDate, received: Number(data.received) || 0, idempotent: data.idempotent === true };
};

// ---- Speed -> Live conversions (Phase 4e, D37) ----

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * parseConversions(body) -> { items:[{requestId, declined:true, reason} | {requestId, slot, payload}], invalid, graded }.
 * body = { graderModel?, items:[{ requestId, declined, reason, payload, grade? }] }, ≤ 20 items, one per request.
 * A rewrite must pass the Live schema (else it is dropped and counted); its slot is built here ({ n, kind:
 * 'conversion', category, area, era }), never taken from the writer. The Speed question and request id are added to
 * the payload by the database, not here. Throws CandidateError for a malformed envelope (400), too many (413) or
 * nothing usable (422).
 */
const parseConversions = body => {
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) throw new CandidateError('invalid', 'Invalid post.', 400);
  if (body.items.length > rules.MAX_CONVERSIONS) throw new CandidateError('too_many', `At most ${rules.MAX_CONVERSIONS} items.`, 413);
  const graderModel = cleanModel(body.graderModel);
  const seen = new Set();
  const items = [];
  let invalid = 0, graded = 0;
  for (const entry of body.items) {
    const requestId = typeof entry?.requestId === 'string' && REQUEST_ID.test(entry.requestId) ? entry.requestId : null;
    if (!requestId || seen.has(requestId)) { invalid++; continue; }
    if (entry.declined === true) {
      seen.add(requestId);
      items.push({ requestId, declined: true, reason: rules.declineReason(entry.reason) ?? 'Declined.' });
      continue;
    }
    const checked = rules.validateLivePayload(entry.payload, { categories: CATEGORIES.live });
    if (!checked.ok) { invalid++; continue; }
    seen.add(requestId);
    const grade = graderModel && entry.grade && typeof entry.grade === 'object' && !Array.isArray(entry.grade)
      ? GRADERS.live({ ...entry.grade, model: graderModel }) : null;
    if (grade) graded++;
    const { category, area, era } = checked.item;
    items.push({ requestId, slot: { n: items.length + 1, kind: 'conversion', category, area, era },
      payload: grade ? { ...checked.item, grade } : checked.item });
  }
  if (!items.length) throw new CandidateError('empty', 'No valid items.', 422);
  return { items, invalid, graded };
};

/** Store the conversions (live_conversion_receive). Returns { runDate, received, declined, already }. */
const receiveConversions = async ({ client, items }) => {
  const { data, error } = await client.rpc('live_conversion_receive', { p_items: items });
  if (error) {
    if (/invalid-conversion-post/.test(error.message ?? '')) throw new CandidateError('invalid', 'Invalid post.', 400);
    throw new CandidateError('unavailable', 'Could not save. Try again.', 503);
  }
  return { runDate: data.runDate, received: Number(data.received) || 0, declined: Number(data.declined) || 0, already: Number(data.already) || 0 };
};

module.exports = { SOURCES, CATEGORIES, CandidateError, parsePost, batchHash, cleanModel, receive, parseConversions, receiveConversions };
