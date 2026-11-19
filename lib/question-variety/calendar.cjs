/* Seasonal writer slots (docs/speed-trivia-backlog-and-quality-plan.md Phase 7, D34). Pure functions over the dated
 * list in data/question-variety/calendar.json: when an event starts within WINDOW_DAYS, one regular slot a day per game
 * is about it (slots.chooseSlots `seasonal`). Evergreen facts only: no news, no web search, no expiry.
 */
const map = require('./map.cjs');
const CALENDAR = require('../../data/question-variety/calendar.json');

const WINDOW_DAYS = 10;
const GAMES = Object.freeze(['speed', 'live']);
const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const DAY_MS = 86_400_000;

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const utc = day => Date.parse(`${day}T00:00:00Z`);
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(utc(day))
  && new Date(utc(day)).toISOString().slice(0, 10) === day;

/** The event's date in `year` (YYYY-MM-DD), or null if the rule doesn't parse. */
const dateFor = (rule, year) => {
  if (!rule || typeof rule !== 'object') return null;
  const exact = rule.exact?.[String(year)];
  if (exact !== undefined) return validDay(exact) && exact.startsWith(`${year}-`) ? exact : null;
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
    for (const [y, day] of Object.entries(event?.date?.exact ?? {})) if (!dateFor(event.date, Number(y))) problems.push(`${label}: exact ${y} ${day}`);
    for (const game of GAMES) {
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
 * The game's seasonal event for `today`, or null: the soonest event starting 0..WINDOW_DAYS days ahead whose
 * category is being written tonight (`categories`), ties in list order. Returns { id, name, date, days, category, area }.
 */
const seasonalFor = ({ game, categories, today = new Date(), calendar = CALENDAR, windowDays = WINDOW_DAYS }) => {
  if (!GAMES.includes(game) || !Array.isArray(calendar?.events)) return null;
  const todayDay = map.isoDay(today);
  const start = utc(todayDay);
  const year = Number(todayDay.slice(0, 4));
  let best = null;
  for (const event of calendar.events) {
    const target = event?.[game];
    if (!target || target.category === map.CURRENT_EVENTS || !categories.includes(target.category)) continue;
    for (const y of [year, year + 1]) {
      const date = dateFor(event.date, y);
      if (!date) continue;
      const days = Math.round((utc(date) - start) / DAY_MS);
      if (days < 0 || days > windowDays) continue;
      if (!best || days < best.days) best = { id: event.id, name: event.name, date, days, category: target.category, area: target.area };
    }
  }
  return best;
};

module.exports = { CALENDAR, WINDOW_DAYS, WEEKDAYS, dateFor, validateCalendar, seasonalFor };
