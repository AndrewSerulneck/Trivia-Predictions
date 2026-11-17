/* Variety map rules shared by the seed, the tagging run, the Variety page and the Phase 4b writer
 * (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a). Pure functions: no I/O.
 *
 * A map lists, per game and category, well-known AREAS and the ERAS each applies to. One area x one era is a CELL.
 * Every question carries a tag: area, era and subject (the main person, band, team, work or event).
 * Tag text from a model is untrusted DATA; it is only ever matched against the map, never interpreted.
 */

const GAMES = Object.freeze(['speed', 'live']);
const CURRENT_EVENTS = 'Current Events';
// Stored on Current Events areas; their real tag eras are months ("2026-03").
const CURRENT_EVENTS_ERA = 'Past 12 months';
const CURRENT_EVENTS_MONTHS = 12; // D16
const CURRENT_EVENTS_MIN_AGE_DAYS = 7; // no still-developing stories
// A month is only offered to the writer while its questions would live this long before they expire.
const CURRENT_EVENTS_MIN_LIFE_DAYS = 30;
const MODERN_ERAS = new Set(['2000s', '2010s', '2020s', '2000-present']);
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December']);
const MAX_SUBJECT_CHARS = 120;
const MAX_AREA_CHARS = 80;
const MAX_NOTE_CHARS = 200;
const DAY_MS = 86_400_000;

const isGame = value => GAMES.includes(value);
const isMonthEra = era => typeof era === 'string' && MONTH.test(era);
const isModernEra = era => MODERN_ERAS.has(era) || isMonthEra(era);

/** Dashes and spacing vary in model output ("1900–1945"); the map stores ASCII hyphens. */
const canonicalEra = value => typeof value === 'string'
  ? value.normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim()
  : '';

const fold = value => String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Area names match case- and spacing-insensitively. */
const areaKey = name => fold(name).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * One canonical key per subject (D15): lower-cased, accents and punctuation removed, a leading "the" dropped.
 * "The Beatles" = "Beatles"; "Guns N' Roses" = "guns n roses"; "Beyoncé" = "beyonce".
 */
const subjectKey = subject => fold(subject)
  .replace(/['’.]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/^the\s+/, '');

const utcDay = date => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('invalid-date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const isoDay = date => utcDay(date).toISOString().slice(0, 10);
const monthOf = date => utcDay(date).toISOString().slice(0, 7);
const addMonths = (era, n) => {
  const [, y, m] = MONTH.exec(era);
  const d = new Date(Date.UTC(Number(y), Number(m) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** D16: a Current Events question retires 12 months after its event month: "2026-03" -> "2027-03-01". */
const expiresOnFor = era => {
  if (!isMonthEra(era)) throw new Error('invalid-current-events-month');
  return `${addMonths(era, CURRENT_EVENTS_MONTHS)}-01`;
};

const isExpired = (era, today) => expiresOnFor(era) <= isoDay(today);

/**
 * Months the writer may use today, newest first: the event is at least 7 days old, and its questions still have
 * 30+ days before they expire (so nothing is written only to retire next week).
 */
const writingMonths = today => {
  const day = utcDay(today);
  const newest = monthOf(new Date(day.getTime() - CURRENT_EVENTS_MIN_AGE_DAYS * DAY_MS));
  const lifeCutoff = isoDay(new Date(day.getTime() + CURRENT_EVENTS_MIN_LIFE_DAYS * DAY_MS));
  const months = [];
  for (let era = newest; months.length < CURRENT_EVENTS_MONTHS; era = addMonths(era, -1)) {
    if (expiresOnFor(era) <= lifeCutoff) break;
    months.push(era);
  }
  return months;
};

/** "In March 2026, ..." — the month and year must be in the wording (D16). */
const mentionsMonthYear = (question, era) => {
  if (!isMonthEra(era)) return false;
  const [, y, m] = MONTH.exec(era);
  const name = MONTH_NAMES[Number(m) - 1];
  return new RegExp(`\\b(?:${name}|${name.slice(0, 3)}\\.?)\\s*(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s*)?${y}\\b`, 'i').test(String(question));
};

const cleanText = (value, max) => {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text && text.length <= max ? text : null;
};

/**
 * Check one tag against a category's areas. Returns { ok:true, areaId, area, era, subject, subjectKey } or
 * { ok:false, reason }.
 *   areas          the map's areas for this game + category: [{ id, name, eras, active }]
 *   allowUnmapped  the one-time tagging run may say no area fits (area null); the writer may not
 *   requireActive  the writer must use an area that is switched on; existing questions may sit in an "off" area
 *   today          for Current Events months
 *   forWriting     Current Events month must be one writingMonths(today) offers
 */
const validateTag = (tag, { category, areas, today = new Date(), allowUnmapped = false, requireActive = false, forWriting = false } = {}) => {
  const subject = cleanText(tag?.subject, MAX_SUBJECT_CHARS);
  if (!subject) return { ok: false, reason: 'invalid-subject' };
  const key = subjectKey(subject);
  if (!key) return { ok: false, reason: 'invalid-subject' };
  const currentEvents = category === CURRENT_EVENTS;
  const era = tag?.era == null ? null : canonicalEra(tag.era);

  if (tag?.area == null || tag.area === '') {
    if (!allowUnmapped) return { ok: false, reason: 'missing-area' };
    return { ok: true, areaId: null, area: null, era: null, subject, subjectKey: key };
  }
  const wanted = areaKey(tag.area);
  const area = (areas ?? []).find(a => areaKey(a.name) === wanted);
  if (!area) return { ok: false, reason: 'unknown-area' };
  if (requireActive && area.active === false) return { ok: false, reason: 'inactive-area' };

  if (currentEvents) {
    if (!isMonthEra(era)) return { ok: false, reason: 'invalid-era' };
    if (era > monthOf(today)) return { ok: false, reason: 'invalid-era' };
    if (forWriting && !writingMonths(today).includes(era)) return { ok: false, reason: 'invalid-era' };
  } else {
    const match = (area.eras ?? []).find(e => canonicalEra(e).toLowerCase() === String(era ?? '').toLowerCase());
    if (!match) return { ok: false, reason: 'invalid-era' };
    return { ok: true, areaId: area.id ?? null, area: area.name, era: match, subject, subjectKey: key };
  }
  return { ok: true, areaId: area.id ?? null, area: area.name, era, subject, subjectKey: key };
};

/** Validate the Variety page's "Add area" input against a category's era set. */
const validateNewArea = ({ name, eras, note }, eraSet) => {
  const cleanName = cleanText(name, MAX_AREA_CHARS);
  if (!cleanName) return { ok: false, reason: 'invalid-name' };
  const allowed = new Map((eraSet ?? []).map(e => [canonicalEra(e).toLowerCase(), e]));
  const picked = [...new Set((Array.isArray(eras) ? eras : []).map(e => allowed.get(canonicalEra(e).toLowerCase())).filter(Boolean))];
  if (!picked.length || picked.length !== (Array.isArray(eras) ? new Set(eras).size : 0)) return { ok: false, reason: 'invalid-eras' };
  // Keep the era set's order.
  const ordered = eraSet.filter(e => picked.includes(e));
  const cleanNote = note == null || note === '' ? null : cleanText(note, MAX_NOTE_CHARS);
  if (note != null && note !== '' && !cleanNote) return { ok: false, reason: 'invalid-note' };
  return { ok: true, name: cleanName, eras: ordered, note: cleanNote };
};

/**
 * Flatten the draft map file into area rows. Throws on anything malformed so a bad draft never reaches the seed.
 * Era sets are referenced by name; an area may narrow them with its own "eras" (each must be in the set).
 */
const draftAreas = draft => {
  if (!draft || typeof draft !== 'object' || !draft.eraSets || !draft.games) throw new Error('invalid-draft-map');
  const out = [];
  for (const [game, categories] of Object.entries(draft.games)) {
    if (!isGame(game)) throw new Error(`invalid-draft-map: game ${game}`);
    for (const [category, spec] of Object.entries(categories)) {
      const set = draft.eraSets[spec.eraSet];
      if (!Array.isArray(set) || !set.length) throw new Error(`invalid-draft-map: era set ${spec.eraSet}`);
      if ((category === CURRENT_EVENTS) !== (spec.eraSet === 'currentEvents')) throw new Error(`invalid-draft-map: ${category} era set`);
      const seen = new Set();
      for (const area of spec.areas ?? []) {
        const checked = validateNewArea({ name: area.name, eras: area.eras ?? set, note: area.note }, set);
        if (!checked.ok) throw new Error(`invalid-draft-map: ${game}/${category}/${area.name}: ${checked.reason}`);
        const key = areaKey(checked.name);
        if (seen.has(key)) throw new Error(`invalid-draft-map: duplicate area ${game}/${category}/${checked.name}`);
        seen.add(key);
        out.push({ game, category, name: checked.name, eras: checked.eras, note: checked.note });
      }
    }
  }
  return out;
};

/** The era set a category uses, from the draft file (the Variety page offers these when adding an area). */
const eraSetFor = (draft, game, category) => {
  const spec = draft?.games?.[game]?.[category];
  return spec ? [...(draft.eraSets[spec.eraSet] ?? [])] : null;
};

module.exports = {
  GAMES, CURRENT_EVENTS, CURRENT_EVENTS_ERA, CURRENT_EVENTS_MONTHS, MODERN_ERAS, MONTH_NAMES,
  MAX_SUBJECT_CHARS, MAX_AREA_CHARS, MAX_NOTE_CHARS,
  isGame, isMonthEra, isModernEra, canonicalEra, areaKey, subjectKey, isoDay, monthOf, addMonths,
  expiresOnFor, isExpired, writingMonths, mentionsMonthYear, validateTag, validateNewArea, draftAreas, eraSetFor,
};
