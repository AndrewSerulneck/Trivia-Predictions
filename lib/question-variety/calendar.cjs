/* Seasonal writer slots (docs/speed-trivia-backlog-and-quality-plan.md Phase 7, D34; 7b, D43/D44). Pure functions over
 * the dated list in data/question-variety/calendar.json: from WINDOW_DAYS to LEAD_DAYS days before an event, one regular
 * slot a night per game is about it (slots.chooseSlots `seasonal`); events in the window take turns night by night.
 * LEAD_DAYS leaves time for Quick Review before the event. Evergreen facts only: no news, no web search, no expiry.
 */
const map = require('./map.cjs');
const CALENDAR = require('../../data/question-variety/calendar.json');

const WINDOW_DAYS = 14;
const LEAD_DAYS = 3;
const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const DAY_MS = 86_400_000;

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const utc = day => map.utcDay(day).getTime();
const validDay = day => {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  try { return map.isoDay(day) === day; } catch { return false; }
};
/** An `exact` override is used only when it is a real day in its own year. */
const validExact = (value, year) => validDay(value) && value.startsWith(`${year}-`);

/** The event's date in `year` (YYYY-MM-DD), or null if the rule doesn't parse. A bad `exact` falls back to the rule. */
const dateFor = (rule, year) => {
  if (!rule || typeof rule !== 'object') return null;
  const exact = rule.exact?.[String(year)];
  if (validExact(exact, year)) return exact;
  let day = null;
  if (typeof rule.on === 'string') {
    const m = /^(\d{2})-(\d{2})$/.exec(rule.on);
    day = m ? iso(year, Number(m[1]), Number(m[2])) : null;
    if (day && !validDay(day)) return null;
  } else if (Number.isInteger(rule.month) && rule.month >= 1 && rule.month <= 12 && WEEKDAYS.includes(rule.weekday)
    && Number.isInteger(rule.nth) && rule.nth !== 0 && rule.nth >= -1 && rule.nth <= 5) {
    const want = WEEKDAYS.indexOf(rule.weekday);
    const days = new Date(Date.UTC(year, rule.month, 0)).getUTCDate();
    const matches = [];
    for (let d = 1; d <= days; d++) if (new Date(Date.UTC(year, rule.month - 1, d)).getUTCDay() === want) matches.push(d);
    const d = rule.nth === -1 ? matches[matches.length - 1] : matches[rule.nth - 1];
    day = d ? iso(year, rule.month, d) : null;
  }
  if (!day) return null;
  if (rule.offset !== undefined) {
    if (!Number.isInteger(rule.offset) || Math.abs(rule.offset) > 14) return null;
    day = new Date(utc(day) + rule.offset * DAY_MS).toISOString().slice(0, 10);
  }
  return day;
};

/**
 * validateCalendar(calendar, categories, areas?) -> problems[] (empty = valid).
 *   categories  { speed: string[], live: string[] }; Current Events is never seasonal.
 *   areas       optional [{ game, category, name }]: each target area must exist on the map.
 */
const validateCalendar = (calendar, categories, areas = null) => {
  const problems = [];
  const events = calendar?.events;
  if (!Array.isArray(events) || !events.length) return ['no-events'];
  const ids = new Set();
  const year = new Date().getUTCFullYear();
  for (const event of events) {
    const id = typeof event?.id === 'string' && /^[a-z0-9-]+$/.test(event.id) ? event.id : null;
    const label = id ?? JSON.stringify(event?.id);
    if (!id) problems.push(`${label}: id`);
    else if (ids.has(id)) problems.push(`${id}: duplicate id`);
    ids.add(id);
    if (typeof event?.name !== 'string' || !event.name.trim() || event.name.length > 60) problems.push(`${label}: name`);
    for (const y of [year, year + 1, year + 2]) if (!dateFor(event?.date, y)) problems.push(`${label}: date ${y}`);
    const exact = event?.date?.exact;
    if (exact !== undefined && (exact === null || typeof exact !== 'object' || Array.isArray(exact))) problems.push(`${label}: exact`);
    else for (const [y, day] of Object.entries(exact ?? {})) if (!validExact(day, y)) problems.push(`${label}: exact ${y} ${day}`);
    for (const game of map.GAMES) {
      const target = event?.[game];
      if (!target) { problems.push(`${label}: ${game} missing`); continue; }
      if (!(categories?.[game] ?? []).includes(target.category) || target.category === map.CURRENT_EVENTS) {
        problems.push(`${label}: ${game} category ${target.category}`);
      }
      if (typeof target.area !== 'string' || !target.area.trim()) problems.push(`${label}: ${game} area`);
      else if (areas && !areas.some(a => a.game === game && a.category === target.category && map.areaKey(a.name) === map.areaKey(target.area))) {
        problems.push(`${label}: ${game} area ${target.area} not on the map`);
      }
    }
  }
  return problems;
};

/**
 * The game's seasonal event for `today`, or null. Candidates: events starting leadDays..windowDays days ahead whose
 * category is being written tonight (`categories`), sorted by date then list order. They take turns (D43):
 * candidates[dayNumber % length], dayNumber = whole UTC days since 1970 (as slots.nightPlan). Stateless.
 * Returns { id, name, date, days, category, area }.
 */
const seasonalFor = ({ game, categories, today = new Date(), calendar = CALENDAR, windowDays = WINDOW_DAYS, leadDays = LEAD_DAYS }) => {
  if (!map.isGame(game) || !Array.isArray(calendar?.events)) return null;
  const todayDay = map.isoDay(today);
  const start = utc(todayDay);
  const year = Number(todayDay.slice(0, 4));
  const candidates = [];
  calendar.events.forEach((event, index) => {
    const target = event?.[game];
    if (!target || target.category === map.CURRENT_EVENTS || !categories.includes(target.category)) return;
    for (const y of [year, year + 1]) {
      const date = dateFor(event.date, y);
      if (!date) continue;
      const days = Math.round((utc(date) - start) / DAY_MS);
      if (days < leadDays || days > windowDays) continue;
      candidates.push({ index, pick: { id: event.id, name: event.name, date, days, category: target.category, area: target.area } });
    }
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.pick.days - b.pick.days || a.index - b.index);
  return candidates[Math.floor(start / DAY_MS) % candidates.length].pick;
};

module.exports = { CALENDAR, WINDOW_DAYS, LEAD_DAYS, WEEKDAYS, dateFor, validateCalendar, seasonalFor };
