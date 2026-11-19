/* Daily slot choice and the star cap (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a, steps 5-6; D15).
 * Pure functions: the caller passes one bounded read (question_variety_stats) and today's date.
 *
 * Slots: Current Events gets ~5 asked (3 delivered); the rest ~11 asked (7 delivered) rotate evenly through the other
 * categories. Within a category the least-covered cells go first, ties broken by least recently written. At least a
 * third of regular slots fall in 2000-present. A category with no areas still gets its slots (category only).
 */
const map = require('./map.cjs');

const ASK = Object.freeze({ regular: 11, currentEvents: 5 });
const DELIVER = Object.freeze({ regular: 7, currentEvents: 3 });
// Live (Andrew, 2026-11-16): one full round a night. A Live round is 15 questions from one category
// (QUESTIONS_PER_ROUND, lib/liveShowdownEngine.ts), so each night writes one category, rotating through all of them
// (Current Events included); ~1.6x asked as Speed, for rejects.
const LIVE_ROUND = 15;
const LIVE_ASK = 24;
const LIVE_DELIVER = Object.freeze({ regular: LIVE_ROUND, currentEvents: LIVE_ROUND });
const STAR_CAP = 5; // D15: at most 5 questions per subject in a game's bank (active + waiting)
const GAP_DAYS = 30; // D15: nothing new about a subject written in the last 30 days
const DAY_MS = 86_400_000;

const cellKey = (areaId, era) => `${areaId}|${era}`;
const time = value => (value ? Date.parse(value) : Number.NEGATIVE_INFINITY);

/** Cells for one category: every active area x each of its eras (Current Events: x each writing month). */
const cellsFor = (category, areas, stats, today) => {
  const months = category === map.CURRENT_EVENTS ? map.writingMonths(today) : null;
  const out = [];
  for (const area of areas) {
    if (area.category !== category || area.active === false) continue;
    for (const era of months ?? area.eras) {
      const stat = stats.get(cellKey(area.id, era));
      out.push({ category, areaId: area.id, area: area.name, era, count: stat?.count ?? 0, lastWritten: stat?.lastWritten ?? null });
    }
  }
  if (!out.length) return out;
  const share = out.reduce((n, c) => n + c.count, 0) / out.length;
  const eraOrder = new Map((months ?? []).map((m, i) => [m, i]));
  return out
    .map(c => ({ ...c, deficit: Number((c.count - share).toFixed(2)) }))
    .sort((a, b) => a.count - b.count || time(a.lastWritten) - time(b.lastWritten)
      || a.area.localeCompare(b.area) || (eraOrder.get(a.era) ?? 0) - (eraOrder.get(b.era) ?? 0) || a.era.localeCompare(b.era));
};

/**
 * Take k cells from a sorted list, spreading across areas (and, when `spreadEra`, eras) before reusing one.
 * Falls back to plain order once every area has been used.
 */
const spread = (cells, k, { spreadEra = false } = {}) => {
  const picked = [], used = new Set();
  const usedAreas = new Set(), usedEras = new Set();
  const pass = test => {
    for (const cell of cells) {
      if (picked.length >= k) return;
      const key = cellKey(cell.areaId, cell.era);
      if (used.has(key) || !test(cell)) continue;
      picked.push(cell); used.add(key); usedAreas.add(cell.areaId); usedEras.add(cell.era);
    }
  };
  if (spreadEra) pass(c => !usedAreas.has(c.areaId) && !usedEras.has(c.era));
  pass(c => !usedAreas.has(c.areaId));
  if (spreadEra) pass(c => !usedEras.has(c.era));
  pass(() => true);
  return picked;
};

const fallbackSlot = (category, era = null) => ({ category, areaId: null, area: null, era, count: 0, lastWritten: null, deficit: 0 });

/**
 * chooseSlots({ areas, cells, categories, today, ask })
 *   areas       [{ id, category, name, eras, active }] for one game
 *   cells       [{ areaId, era, count, lastWritten }] from question_variety_stats
 *   categories  the game's categories in a fixed order (Current Events may be among them)
 *   seasonal    optional { id, name, date, category, area } (calendar.seasonalFor): one of that category's slots
 *               becomes the event's slot, in that area's least-covered cell, chosen before the others so no slot
 *               reuses its cell and the modern rule still holds (Phase 7, D34; 7a). Same total. Skipped when the
 *               category has no slot tonight or the area isn't switched on.
 * Returns { regular: Slot[], currentEvents: Slot[], modern: { required, actual }, seasonal: event | null }.
 */
const chooseSlots = ({ areas = [], cells = [], categories, today = new Date(), ask = ASK, seasonal = null }) => {
  if (!Array.isArray(categories) || !categories.length) throw new Error('categories-required');
  const stats = new Map(cells.map(c => [cellKey(c.areaId, c.era), c]));
  const regularCategories = categories.filter(c => c !== map.CURRENT_EVENTS);
  const day = Math.floor(Date.parse(map.isoDay(today)) / DAY_MS);

  // Even rotation: consecutive categories starting at a different one each day.
  const perCategory = new Map(regularCategories.map(c => [c, 0]));
  for (let i = 0; i < ask.regular && regularCategories.length; i++) {
    const category = regularCategories[(day + i) % regularCategories.length];
    perCategory.set(category, perCategory.get(category) + 1);
  }
  const sorted = new Map(regularCategories.map(c => [c, cellsFor(c, areas, stats, today)]));

  // Phase 7 (D34), 7a: the seasonal cell is chosen first, so the spread and the modern rule below still hold and no
  // other slot reuses it. It is the event area's least-covered cell, and it replaces one of the category's regular
  // slots, so the day's total is unchanged. No slot in that category tonight, or no active area: no seasonal slot.
  let seasonalCell = null;
  if (seasonal && typeof seasonal.name === 'string' && (perCategory.get(seasonal.category) ?? 0) > 0) {
    const area = areas.find(a => a.category === seasonal.category && a.active !== false && map.areaKey(a.name) === map.areaKey(seasonal.area));
    const cell = area ? (sorted.get(seasonal.category) ?? []).find(c => c.areaId === area.id) : undefined;
    if (cell) seasonalCell = { ...cell, event: { id: seasonal.id, name: seasonal.name, date: seasonal.date } };
  }
  const seasonalKey = seasonalCell ? cellKey(seasonalCell.areaId, seasonalCell.era) : null;

  const regular = [];
  for (const [category, k] of perCategory) {
    if (!k) continue;
    const isSeasonal = seasonalCell?.category === category;
    const n = isSeasonal ? k - 1 : k;
    const cellList = isSeasonal ? sorted.get(category).filter(c => cellKey(c.areaId, c.era) !== seasonalKey) : sorted.get(category);
    const picked = cellList.length ? spread(cellList, n) : [];
    regular.push(...picked);
    for (let i = picked.length; i < n; i++) regular.push(fallbackSlot(category));
    if (isSeasonal) regular.push(seasonalCell); // the category's last slot; fallback slots go before it
  }

  // At least a third of regular slots in 2000-present: swap the lowest-priority older slots for the best unused
  // modern cell in the same category. The seasonal slot may swap only within its event's area, and keeps its event.
  const required = Math.ceil(regular.length / 3);
  const taken = new Set(regular.map(s => cellKey(s.areaId, s.era)));
  let actual = regular.filter(s => s.era && map.isModernEra(s.era)).length;
  for (let i = regular.length - 1; i >= 0 && actual < required; i--) {
    const slot = regular[i];
    if (slot.era && map.isModernEra(slot.era)) continue;
    const swap = (sorted.get(slot.category) ?? []).find(c => map.isModernEra(c.era) && !taken.has(cellKey(c.areaId, c.era))
      && (!slot.event || c.areaId === slot.areaId));
    if (!swap) continue;
    taken.delete(cellKey(slot.areaId, slot.era));
    taken.add(cellKey(swap.areaId, swap.era));
    regular[i] = slot.event ? { ...swap, event: slot.event } : swap;
    actual++;
  }

  const event = seasonalCell?.event ?? null;

  // Current Events: spread across areas and months.
  let currentEvents = [];
  if (categories.includes(map.CURRENT_EVENTS) && ask.currentEvents > 0) {
    const ce = cellsFor(map.CURRENT_EVENTS, areas, stats, today);
    if (ce.length) currentEvents = spread(ce, ask.currentEvents, { spreadEra: true });
    const months = map.writingMonths(today);
    for (let n = currentEvents.length; n < ask.currentEvents && months.length; n++) {
      currentEvents.push(fallbackSlot(map.CURRENT_EVENTS, months[n % months.length]));
    }
  }

  const strip = s => ({ category: s.category, areaId: s.areaId, area: s.area, era: s.era, count: s.count, deficit: s.deficit,
    ...(s.event ? { event: s.event } : {}) });
  return { regular: regular.map(strip), currentEvents: currentEvents.map(strip), modern: { required, actual }, seasonal: event };
};

/**
 * The night's writing plan for one game. Speed: every category, ASK / DELIVER. Live: one category (rotating by day),
 * LIVE_ASK asked and LIVE_ROUND delivered in total. Returns { categories, ask, deliver, deliverTotal }.
 */
const nightPlan = (game, categories, today = new Date()) => {
  if (game !== 'live') return { categories: [...categories], ask: ASK, deliver: DELIVER, deliverTotal: DELIVER.regular + DELIVER.currentEvents };
  const day = Math.floor(Date.parse(map.isoDay(today)) / DAY_MS);
  const category = categories[((day % categories.length) + categories.length) % categories.length];
  const ce = category === map.CURRENT_EVENTS;
  return { categories: [category], ask: { regular: ce ? 0 : LIVE_ASK, currentEvents: ce ? LIVE_ASK : 0 },
    deliver: LIVE_DELIVER, deliverTotal: LIVE_ROUND };
};

/**
 * Star cap (D15). `stats` maps subjectKey -> { count, lastWritten } for the game's bank (active + waiting).
 * Candidates are checked in order; an accepted one counts against later ones in the same batch.
 * Returns one result per candidate: { ok:true } or { ok:false, reason:'star-cap', detail:'cap'|'gap' }.
 */
const checkStarCap = (candidates, stats, now = new Date(), { cap = STAR_CAP, gapDays = GAP_DAYS } = {}) => {
  const cutoff = new Date(now).getTime() - gapDays * DAY_MS;
  const accepted = new Map();
  return candidates.map(candidate => {
    const key = candidate?.subjectKey;
    if (!key) return { ok: false, reason: 'star-cap', detail: 'missing-subject' };
    const stat = stats.get(key);
    const count = (stat?.count ?? 0) + (accepted.get(key) ?? 0);
    if (count >= cap) return { ok: false, reason: 'star-cap', detail: 'cap' };
    if (accepted.has(key) || (stat?.lastWritten && Date.parse(stat.lastWritten) > cutoff)) return { ok: false, reason: 'star-cap', detail: 'gap' };
    accepted.set(key, (accepted.get(key) ?? 0) + 1);
    return { ok: true };
  });
};

/**
 * The brief's avoid list for one category: subjects at the cap or inside the gap, most used first.
 * `subjects` rows come from question_variety_stats: { subjectKey, subject, categories, count, lastWritten }.
 */
const avoidList = (subjects, category, now = new Date(), { cap = STAR_CAP, gapDays = GAP_DAYS, limit = 80 } = {}) => {
  const cutoff = new Date(now).getTime() - gapDays * DAY_MS;
  return subjects
    .filter(s => (s.categories ?? []).includes(category) && (s.count >= cap || (s.lastWritten && Date.parse(s.lastWritten) > cutoff)))
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject))
    .slice(0, limit)
    .map(s => s.subject);
};

module.exports = { ASK, DELIVER, LIVE_ROUND, LIVE_ASK, LIVE_DELIVER, nightPlan, STAR_CAP, GAP_DAYS, chooseSlots, checkStarCap, avoidList, cellsFor };
