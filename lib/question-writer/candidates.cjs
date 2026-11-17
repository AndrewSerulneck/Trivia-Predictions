/* The writer's post: parse, then store through question_writer_receive (docs/speed-trivia-backlog-and-quality-plan.md
 * Phase 4b, step 3). Shared by POST /api/question-writer/candidates and the nightly's Gemini fallback.
 * Posted content is untrusted DATA: it is shape-checked here and fully gated by the nightly before anyone sees it.
 */
const crypto = require('node:crypto');
const rules = require('./rules.cjs');
const { GENERATOR_CATEGORIES } = require('../speed-trivia-uniqueness/generation.cjs');
const { LIVE_CATEGORIES } = require('../live-trivia-quality/categories.cjs');

const SOURCES = Object.freeze(['chatgpt', 'gemini-fallback']);
const CATEGORIES = Object.freeze({ speed: [...GENERATOR_CATEGORIES], live: [...LIVE_CATEGORIES] });
const VALIDATORS = Object.freeze({ speed: rules.validateSpeedPayload, live: rules.validateLivePayload });

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

/**
 * parsePost(body, game) -> { items:[{slot, payload}], invalid }. Throws CandidateError for a malformed envelope
 * (400), too many items (413) or nothing usable (422). Items that fail the schema are dropped and counted.
 */
const parsePost = (body, game) => {
  const categories = CATEGORIES[game];
  if (!categories) throw new CandidateError('game_not_ready', 'Writer game not available.', 404);
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) throw new CandidateError('invalid', 'Invalid post.', 400);
  if (body.items.length > rules.MAX_ITEMS) throw new CandidateError('too_many', `At most ${rules.MAX_ITEMS} items.`, 413);
  const items = [];
  let invalid = 0;
  for (const entry of body.items) {
    const slot = parseSlot(entry?.slot, categories);
    const checked = slot ? VALIDATORS[game](entry?.payload, { categories }) : { ok: false };
    if (!checked.ok) { invalid++; continue; }
    items.push({ slot, payload: checked.item });
  }
  if (!items.length) throw new CandidateError('empty', 'No valid items.', 422);
  return { items, invalid };
};

const batchHash = items => crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');

const MODEL = /^[A-Za-z0-9._:-]{1,80}$/;
/** The writer's model name as reported, or null when absent or malformed (it is only a label). */
const cleanModel = value => typeof value === 'string' && MODEL.test(value) ? value : null;

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

module.exports = { SOURCES, CATEGORIES, CandidateError, parsePost, batchHash, cleanModel, receive };
