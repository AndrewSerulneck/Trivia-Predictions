/* Live Trivia categories for the daily writer and Publish (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c).
 * The canonical Live Trivia bank is data/live-trivia/categories/*.json (D10). Pure data and helpers: no I/O.
 *
 * Each writer category appends to exactly one file. Current Events is the only new category (D11) and the only file
 * Publish may create. A file's existing entries are never changed, reordered or rebuilt.
 */
const LIVE_DIR = 'data/live-trivia/categories';
const CURRENT_EVENTS = 'Current Events';
// D11: a Current Events round is offered only once it has this many unexpired questions (three rounds of 15).
const CURRENT_EVENTS_MIN_QUESTIONS = 45;

// categoryName -> the file Publish appends to. Sports has two files; new questions go to sports.v1.json.
const LIVE_CATEGORY_FILES = Object.freeze({
  'Art, Literature and Comics': 'art-literature.json',
  Geography: 'geography.v1.json',
  'History & Government': 'history.v1.json',
  Movies: 'movies.json',
  Music: 'music.v1.json',
  'Science & Tech': 'science.v1.json',
  Sports: 'sports.v1.json',
  Television: 'television.json',
  [CURRENT_EVENTS]: 'current-events.json',
});
const LIVE_CATEGORIES = Object.freeze(Object.keys(LIVE_CATEGORY_FILES));
const NEW_FILES = Object.freeze(new Set([LIVE_CATEGORY_FILES[CURRENT_EVENTS]]));

// Map area -> the file's existing `subcategory` value (the areas were seeded from these; Phase 4a). An area added later
// on the Variety page falls back to a slug of its name.
const AREA_SUBCATEGORIES = Object.freeze({
  'Art, Literature and Comics': { 'Classic literature': 'classic-literature', 'Comics and graphic novels': 'comics-graphic-novels',
    'Art history and artists': 'art-history-artists', 'Language and grammar': 'language-grammar',
    'Adaptations and theater': 'adaptations-theater', 'Literary quotes and lines': 'literary-quotes-and-lines' },
  Geography: { 'Countries, capitals and borders': 'countries-capitals-borders', 'Map identification': 'map-identification',
    'Physical geography': 'physical-geography', 'US states': 'us-states-quirky', 'Landmarks and wonders': 'landmarks-wonders' },
  'History & Government': { 'Cultural and social history': 'cultural-social-history', 'US history and government': 'us-history-government',
    'Ancient and medieval': 'ancient-medieval', 'Famous figures and quotes': 'famous-figures-quotes',
    'Wars, battles and conflicts': 'wars-battles-conflicts' },
  Movies: { 'Plots, quotes and trivia': 'plot-quotes-trivia', 'Actors and performers': 'actors-performers',
    'Biographical films': 'biographical-films', 'Characters and lore': 'characters-lore', 'Awards and the industry': 'awards-history-industry' },
  Music: { 'Albums, songs and lyrics': 'albums-songs-lyrics', 'Band lineups': 'band-lineups', 'Artist identity': 'artist-identity',
    'Classic rock': 'classic-rock', 'Genres, instruments and terms': 'genres-instruments-terminology',
    'Music history and events': 'music-history-events', 'Contemporary pop': 'contemporary-pop-culture' },
  'Science & Tech': { 'Physics concepts': 'physics-concepts', 'Biology and the human body': 'biology-human-body',
    'Astronomy and earth science': 'astronomy-earth-science', 'Medicine and technology': 'medicine-technology',
    'Chemistry and the periodic table': 'chemistry-periodic-table' },
  Sports: { 'Teams and franchises': 'teams-franchises', 'Historical moments': 'historical-moments', 'Rules and terminology': 'rules-terminology',
    'Records and statistics': 'records-statistics', 'Notable figures': 'notable-figures' },
  Television: { 'Sitcoms and comedy': 'sitcoms-comedy', 'Drama and cable': 'drama-cable', 'Television history': 'television-history',
    'Animated series': 'animated-series', 'SNL and late night': 'snl-late-night-recent', 'Reality and competition': 'reality-competition' },
});

/** The importer's slug rule (scripts/import-trivia-questions.cjs slugify), so a published slug imports unchanged. */
const slugify = value => String(value || '').toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const subcategoryFor = (category, area) => {
  if (!area) return 'general';
  return AREA_SUBCATEGORIES[category]?.[area] ?? (slugify(area.replace(/&/g, ' and ')) || 'general');
};

/**
 * D16: a Live entry is expired once its `expires_on` (YYYY-MM-DD) is today or earlier, UTC. The one rule for the
 * importer (expired entries are absent and pruned) and Publish (an expired entry's question can be written again).
 * `today` is a Date or a YYYY-MM-DD string.
 */
const isExpiredLiveEntry = (entry, today = new Date()) => {
  const expiresOn = entry?.expires_on ?? entry?.expiresOn;
  const day = typeof today === 'string' ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return typeof expiresOn === 'string' && expiresOn !== '' && expiresOn <= day;
};

const fileFor = category => {
  const file = LIVE_CATEGORY_FILES[category];
  if (!file) throw new Error('unknown-live-category');
  return `${LIVE_DIR}/${file}`;
};

module.exports = {
  LIVE_DIR, CURRENT_EVENTS, CURRENT_EVENTS_MIN_QUESTIONS, LIVE_CATEGORY_FILES, LIVE_CATEGORIES, NEW_FILES,
  AREA_SUBCATEGORIES, slugify, subcategoryFor, fileFor, isExpiredLiveEntry,
};
