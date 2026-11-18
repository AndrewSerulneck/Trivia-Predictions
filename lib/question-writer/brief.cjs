/* The writer's daily brief (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b, step 3).
 * Served by GET /api/question-writer/brief to the private writer repo, and built the same way by the nightly's
 * Gemini fallback (D13). Two bounded reads: one question_variety_stats call and one page of recently approved rows.
 */
const map = require('../question-variety/map.cjs');
const slots = require('../question-variety/slots.cjs');
const rules = require('./rules.cjs');
const { GENERATOR_CATEGORIES } = require('../speed-trivia-uniqueness/generation.cjs');
const { LIVE_CATEGORIES } = require('../live-trivia-quality/categories.cjs');
const speedAudience = require('../speed-trivia-quality/audience.cjs');
const liveAudience = require('../live-trivia-quality/audience.cjs');

// Writer games served today (Live joined in Phase 4c).
const WRITER_GAMES = Object.freeze(['speed', 'live']);
const GAME_CATEGORIES = Object.freeze({ speed: [...GENERATOR_CATEGORIES], live: [...LIVE_CATEGORIES] });
const EXAMPLE_POOL = 120;
const EXAMPLE_COUNT = 8;
const DAY_MS = 86_400_000;

class BriefError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  if (error || data == null) throw new BriefError('unavailable', `Brief read failed (${name}).`);
  return data;
};

/** 6-8 good examples rotated daily from recently approved rows, spread across categories. */
const pickExamples = (rows, today, count = EXAMPLE_COUNT) => {
  const byCategory = new Map();
  for (const row of rows) {
    const answer = Array.isArray(row.options) ? row.options[row.correct_answer] : null;
    if (typeof row.question !== 'string' || typeof answer !== 'string' || !row.category) continue;
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push({ category: row.category, question: row.question, answer });
  }
  const categories = [...byCategory.keys()].sort();
  if (!categories.length) return [];
  const day = Math.floor(Date.parse(map.isoDay(today)) / DAY_MS);
  const out = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const list = byCategory.get(categories[(day + i) % categories.length]);
    const pick = list[(day + Math.floor(i / categories.length)) % list.length];
    if (!out.includes(pick)) out.push(pick);
  }
  return out;
};

// Speed: recently approved rows. Live: recently imported Live Trivia rows (the importer stores the answer first).
const readExamples = async (client, game) => {
  const query = client.from('trivia_questions').select('question, options, correct_answer, category')
    .eq('question_pool', game === 'live' ? 'live_showdown' : 'anytime_blitz').eq('status', 'active');
  const { data, error } = await (game === 'live' ? query.order('created_at', { ascending: false }) : query.order('speed_revision', { ascending: false }))
    .limit(EXAMPLE_POOL);
  if (error) throw new BriefError('unavailable', 'Brief read failed (examples).');
  return (data ?? []).filter(row => row.category !== map.CURRENT_EVENTS);
};

const slotView = (slot, n) => ({ n, category: slot.category, area: slot.area, era: slot.era });

/**
 * buildBrief({ client, game, today }) -> { game, runDate, writerVersion, deliver, prompts:[{kind, webSearch, slots,
 * prompt, schema, grade}] }. Slot numbers are unique across the day's prompts; the writer echoes them back. `grade` is
 * the bar test the writer runs on that prompt's finished items in a separate ChatGPT session (D35, Phase 4d.1).
 */
const buildBrief = async ({ client, game, today = new Date() }) => {
  if (!WRITER_GAMES.includes(game)) throw new BriefError('game_not_ready', 'Writer game not available.');
  const stats = await rpc(client, 'question_variety_stats', { p_game: game, p_cap: slots.STAR_CAP, p_gap_days: slots.GAP_DAYS });
  const night = slots.nightPlan(game, GAME_CATEGORIES[game], today);
  const chosen = slots.chooseSlots({ areas: stats.areas ?? [], cells: stats.cells ?? [], categories: night.categories, ask: night.ask, today });
  const examples = pickExamples(await readExamples(client, game), today);
  const buildPrompt = game === 'live' ? rules.buildLivePrompt : rules.buildSpeedPrompt;
  const schema = game === 'live' ? rules.LIVE_OUTPUT_SCHEMA : rules.SPEED_OUTPUT_SCHEMA;
  const gradeBlock = game === 'live' ? liveAudience.gradeBlock : speedAudience.gradeBlock;
  const avoidFor = list => Object.fromEntries([...new Set(list.map(s => s.category))]
    .map(category => [category, slots.avoidList(stats.subjects ?? [], category, today)]));
  const regular = chosen.regular.map((slot, i) => slotView(slot, i + 1));
  const currentEvents = chosen.currentEvents.map((slot, i) => slotView(slot, regular.length + i + 1));
  const prompts = [];
  if (regular.length) {
    prompts.push({ kind: 'regular', webSearch: false, slots: regular, schema,
      prompt: buildPrompt({ kind: 'regular', slots: regular, avoid: avoidFor(regular), examples, today }),
      grade: gradeBlock({ kind: 'regular', today }) });
  }
  if (currentEvents.length) {
    prompts.push({ kind: 'currentEvents', webSearch: true, slots: currentEvents, schema,
      prompt: buildPrompt({ kind: 'currentEvents', slots: currentEvents, avoid: avoidFor(currentEvents), examples, today }),
      grade: gradeBlock({ kind: 'currentEvents', today }) });
  }
  return { game, runDate: map.isoDay(today), writerVersion: rules.WRITER_VERSION, deliver: { ...night.deliver }, prompts };
};

module.exports = { WRITER_GAMES, GAME_CATEGORIES, BriefError, buildBrief, pickExamples };
