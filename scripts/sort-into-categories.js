/**
 * Script to sort New-questions.json questions into proper Live Trivia categories,
 * matching existing category names and subcategories exactly.
 * 
 * Steps:
 * 1. Read all existing category files to understand exact names, subcategories, and existing slugs
 * 2. Map each new question to the correct existing category/subcategory
 * 3. Check for duplicates (by slug and by question text)
 * 4. Merge non-duplicate questions into the existing files
 * 5. Report old/new counts
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES_DIR = path.join(__dirname, '..', 'data', 'live-trivia', 'categories');
const NEW_FILE = path.join(__dirname, '..', 'data', 'live-trivia', 'New-questions.json');

// ============================================================
// STEP 1: Load all existing category files
// ============================================================

const categoryFiles = fs.readdirSync(CATEGORIES_DIR).filter(f => f.endsWith('.json'));

const existingCategories = {};
const allExistingSlugs = new Set();
const allExistingQuestions = new Set();

categoryFiles.forEach(file => {
  const filePath = path.join(CATEGORIES_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  existingCategories[data.categoryName] = {
    file: file,
    filePath: filePath,
    questions: data.questions,
    subcategories: [...new Set(data.questions.map(q => q.subcategory))],
  };
  
  data.questions.forEach(q => {
    allExistingSlugs.add(q.slug);
    // Normalize question text for comparison
    allExistingQuestions.add(q.question.toLowerCase().replace(/[^a-z0-9]/g, ''));
  });
});

console.log('=== EXISTING CATEGORIES ===');
Object.entries(existingCategories).forEach(([name, info]) => {
  console.log(`${name}: ${info.questions.length} questions, subcategories: ${info.subcategories.join(', ')}`);
});

// ============================================================
// STEP 2: Load new questions
// ============================================================

const newData = JSON.parse(fs.readFileSync(NEW_FILE, 'utf-8'));
const newQuestions = newData.questions;

console.log(`\n=== NEW QUESTIONS: ${newQuestions.length} total ===`);

// ============================================================
// STEP 3: Map each new question to proper category + subcategory
// ============================================================

/**
 * Mapping from a question to its target existing category and subcategory.
 * Questions with category Animals, General Knowledge, and Pop Culture need
 * to be distributed to existing categories based on their content.
 */
function determineTargetCategory(q) {
  const slug = q.slug;
  const question = q.question;
  const answer = q.answer;
  const origCategory = q.category;

  // --- Geography questions ---
  const geographySlugs = [
    'the-city-of-venice-is-built-on-an-archipelago-of-islands-in-which-country',
    'the-deccan-plateau-is-a-large-plateau-in-which-country',
    'the-golden-gate-bridge-is-a-famous-landmark-in-which-us-city',
    'the-serengeti-national-park-known-for-its-annual-wildlife-migration-is-primarily-located-in-which-country',
    'the-worlds-highest-uninterrupted-waterfall-angel-falls-is-located-in-which-south-american-country',
    'the-ring-of-fire-is-primarily-located-in-the-basin-of-which-ocean',
    'the-danube-river-which-flows-through-the-most-countries-in-the-world-is-primarily-located-on-which-continent',
    'the-nile-river-empties-into-the-mediterranean-sea-after-flowing-primarily-through-which-country',
    'the-sahara-desert-spans-across-much-of-which-continent',
    'which-continent-is-also-a-country',
    'which-country-is-both-an-island-and-a-continent',
    'which-country-is-home-to-the-largest-portion-of-the-amazon-rainforest',
    'which-european-capital-city-is-renowned-for-its-numerous-bridges-and-canals-often-called-the-venice-of-the-north',
    'which-imaginary-line-circles-the-earth-at-0-degrees-latitude-dividing-it-into-the-northern-and-southern-hemispheres',
    'which-landlocked-country-in-south-america-is-named-after-a-prominent-south-american-independence-leader',
    'which-major-mountain-range-forms-a-traditional-geographical-boundary-between-europe-and-asia',
    'which-mountain-range-forms-a-natural-boundary-between-europe-and-asia',
    'which-ocean-borders-the-western-coast-of-the-united-states',
    'which-of-the-following-is-an-archipelagic-country-in-southeast-asia-consisting-of-over-7000-islands',
    'which-sea-is-landlocked-and-known-for-its-extremely-high-salt-content-allowing-people-to-float-effortlessly',
    'which-sea-is-located-between-the-balkan-peninsula-and-anatolia',
    // General Knowledge -> Geography
    'from-which-country-do-croissants-originate',
    'from-which-country-does-the-popular-culinary-dish-sushi-originate',
    'which-country-is-famous-for-the-taj-mahal',
    'which-is-the-smallest-independent-state-in-the-world-by-land-area',
    'what-is-the-name-of-the-imaginary-line-that-divides-the-earth-into-northern-and-southern-hemispheres',
    // Animals -> Geography
    'which-continent-is-the-only-natural-habitat-for-kangaroos',
  ];

  const historySlugs = [
    'the-term-iron-curtain-symbolizing-the-ideological-division-of-europe-during-the-cold-war-was-popularized-by-which-leader',
    'what-significant-event-occurred-on-december-7-1941-leading-to-the-united-states-entry-into-world-war-ii',
    'which-ancient-civilization-is-credited-with-inventing-democracy',
    'which-famous-queen-of-england-reigned-for-over-60-years-and-had-an-era-named-after-her',
    'which-us-president-delivered-the-gettysburg-address-during-the-american-civil-war',
    'who-formulated-the-theory-of-evolution-by-natural-selection',
    'who-led-the-soviet-union-during-the-majority-of-world-war-ii',
    'who-served-as-the-first-president-of-the-united-states',
    'who-was-the-first-emperor-of-the-roman-empire-effectively-ending-the-roman-republic',
    // General Knowledge -> History
    'the-byzantine-empire-was-a-continuation-of-which-ancient-empire',
  ];

  // Art, Literature and Comics slugs (from GK questions)
  const artSlugs = [
    'which-painter-is-famous-for-cutting-off-part-of-his-own-ear',
    'who-is-traditionally-credited-with-writing-the-epic-poems-the-iliad-and-the-odyssey',
  ];

  // Build quick lookup maps
  const geoSet = new Set(geographySlugs);
  const histSet = new Set(historySlugs);
  const artSet = new Set(artSlugs);

  if (geoSet.has(slug)) {
    return { category: 'Geography', subcategory: determineGeoSubcategory(slug) };
  }
  if (histSet.has(slug)) {
    return { category: 'History & Government', subcategory: determineHistorySubcategory(slug) };
  }
  if (artSet.has(slug)) {
    return { category: 'Art, Literature and Comics', subcategory: determineArtSubcategory(slug) };
  }
  
  // Music questions (all from original Music category + some from Pop Culture)
  if (origCategory === 'Music') {
    return { category: 'Music', subcategory: determineMusicSubcategory(slug, question) };
  }

  // Pop Culture questions - distribute to Music, Movies, Television, etc.
  if (origCategory === 'Pop Culture') {
    return determinePopCultureTarget(slug, question);
  }

  // General Knowledge remaining questions
  if (origCategory === 'General Knowledge') {
    return determineGKTarget(slug, question, answer);
  }

  // Science questions
  if (origCategory === 'Science') {
    return { category: 'Science & Tech', subcategory: determineScienceSubcategory(slug, question) };
  }

  // Sports questions
  if (origCategory === 'Sports') {
    return { category: 'Sports', subcategory: determineSportsSubcategory(slug, question) };
  }

  // Fallback
  console.log(`  UNMAPPED: "${question}" (slug: ${slug}, category: ${origCategory})`);
  return { category: origCategory, subcategory: 'general-knowledge' };
}

function determineGeoSubcategory(slug) {
  const countriesSlugs = [
    'the-city-of-venice-is-built-on-an-archipelago-of-islands-in-which-country',
    'the-deccan-plateau-is-a-large-plateau-in-which-country',
    'which-continent-is-also-a-country',
    'which-country-is-both-an-island-and-a-continent',
    'which-country-is-home-to-the-largest-portion-of-the-amazon-rainforest',
    'which-european-capital-city-is-renowned-for-its-numerous-bridges-and-canals-often-called-the-venice-of-the-north',
    'which-landlocked-country-in-south-america-is-named-after-a-prominent-south-american-independence-leader',
    'which-of-the-following-is-an-archipelagic-country-in-southeast-asia-consisting-of-over-7000-islands',
    'from-which-country-do-croissants-originate',
    'from-which-country-does-the-popular-culinary-dish-sushi-originate',
    'which-is-the-smallest-independent-state-in-the-world-by-land-area',
    'which-continent-is-the-only-natural-habitat-for-kangaroos',
  ];
  const landmarksSlugs = [
    'the-golden-gate-bridge-is-a-famous-landmark-in-which-us-city',
    'which-country-is-famous-for-the-taj-mahal',
    'the-worlds-highest-uninterrupted-waterfall-angel-falls-is-located-in-which-south-american-country',
  ];
  const physicalSlugs = [
    'the-serengeti-national-park-known-for-its-annual-wildlife-migration-is-primarily-located-in-which-country',
    'the-ring-of-fire-is-primarily-located-in-the-basin-of-which-ocean',
    'the-danube-river-which-flows-through-the-most-countries-in-the-world-is-primarily-located-on-which-continent',
    'the-nile-river-empties-into-the-mediterranean-sea-after-flowing-primarily-through-which-country',
    'the-sahara-desert-spans-across-much-of-which-continent',
    'which-imaginary-line-circles-the-earth-at-0-degrees-latitude-dividing-it-into-the-northern-and-southern-hemispheres',
    'what-is-the-name-of-the-imaginary-line-that-divides-the-earth-into-northern-and-southern-hemispheres',
    'which-major-mountain-range-forms-a-traditional-geographical-boundary-between-europe-and-asia',
    'which-mountain-range-forms-a-natural-boundary-between-europe-and-asia',
    'which-ocean-borders-the-western-coast-of-the-united-states',
    'which-sea-is-landlocked-and-known-for-its-extremely-high-salt-content-allowing-people-to-float-effortlessly',
    'which-sea-is-located-between-the-balkan-peninsula-and-anatolia',
  ];

  if (countriesSlugs.includes(slug)) return 'countries-capitals-borders';
  if (landmarksSlugs.includes(slug)) return 'landmarks-wonders';
  if (physicalSlugs.includes(slug)) return 'physical-geography';
  return 'physical-geography';
}

function determineHistorySubcategory(slug) {
  const ancientSlugs = [
    'which-ancient-civilization-is-credited-with-inventing-democracy',
    'who-was-the-first-emperor-of-the-roman-empire-effectively-ending-the-roman-republic',
    'the-byzantine-empire-was-a-continuation-of-which-ancient-empire',
  ];
  const usSlugs = [
    'which-us-president-delivered-the-gettysburg-address-during-the-american-civil-war',
    'who-served-as-the-first-president-of-the-united-states',
  ];
  const warsSlugs = [
    'what-significant-event-occurred-on-december-7-1941-leading-to-the-united-states-entry-into-world-war-ii',
    'the-term-iron-curtain-symbolizing-the-ideological-division-of-europe-during-the-cold-war-was-popularized-by-which-leader',
    'who-led-the-soviet-union-during-the-majority-of-world-war-ii',
  ];
  const figuresSlugs = [
    'which-famous-queen-of-england-reigned-for-over-60-years-and-had-an-era-named-after-her',
    'who-formulated-the-theory-of-evolution-by-natural-selection',
  ];

  if (ancientSlugs.includes(slug)) return 'ancient-medieval';
  if (usSlugs.includes(slug)) return 'us-history-government';
  if (warsSlugs.includes(slug)) return 'wars-battles-conflicts';
  if (figuresSlugs.includes(slug)) return 'famous-figures-quotes';
  return 'cultural-social-history';
}

function determineArtSubcategory(slug) {
  if (slug.includes('painter') || slug.includes('cutting-off')) {
    return 'art-history-artists';
  }
  if (slug.includes('iliad') || slug.includes('odyssey') || slug.includes('homer')) {
    return 'classic-literature';
  }
  return 'art-history-artists';
}

function determineMusicSubcategory(slug, question) {
  const artistSlugs = [
    'what-instrument-is-louis-armstrong-famously-associated-with',
    'which-artist-is-known-for-her-powerful-vocals-and-hit-songs-like-rolling-in-the-deep-and-someone-like-you',
    'which-band-is-known-for-hits-like-dont-stop-believin-and-separate-ways',
    'which-jazz-legend-is-famous-for-his-trumpet-playing-and-distinctive-gravelly-voice-with-hits-like-what-a-wonderful-world',
    'which-pop-and-rb-icon-released-the-2008-hit-song-single-ladies-put-a-ring-on-it',
    'which-pop-icon-is-widely-credited-with-popularizing-the-moonwalk-dance-move',
    'which-pop-star-is-known-for-hits-like-like-a-prayer-and-vogue',
    'which-singer-is-famously-known-as-the-queen-of-pop',
    'which-singer-is-known-for-hits-like-single-ladies-put-a-ring-on-it',
    'who-was-the-charismatic-lead-singer-of-the-british-rock-band-queen',
  ];
  // Check if question mentions a specific artist/person
  const artistKeywords = ['adele', 'journey', 'fleetwood mac', 'louis armstrong', 'beyoncé', 'beyonce', 'michael jackson', 'madonna', 'freddie mercury', 'jimi hendrix', 'taylor swift'];
  const hasArtist = artistKeywords.some(k => question.toLowerCase().includes(k));

  if (artistSlugs.includes(slug) || hasArtist) return 'artist-identity';

  const albumSlugs = [
    'taylor-swifts-2008-album-featuring-love-story-and-you-belong-with-me-is-titled-what',
    'the-album-sgt-peppers-lonely-hearts-club-band-is-famously-associated-with-which-band',
    'which-band-is-known-for-the-album-rumours-featuring-hits-like-go-your-own-way-and-dreams',
  ];
  if (albumSlugs.includes(slug)) return 'albums-songs-lyrics';

  const genreSlugs = [
    'what-is-the-musical-term-for-a-composition-for-a-solo-instrument-or-voice-usually-with-orchestral-accompaniment-in-several-movements',
    'what-is-the-smallest-interval-in-western-tonal-music',
    'which-classical-music-term-means-fast-or-lively',
  ];
  if (genreSlugs.includes(slug)) return 'genres-instruments-terminology';

  const historySlugs = [
    'what-award-is-given-annually-by-the-recording-academy-to-recognize-outstanding-achievements-in-the-music-industry',
    'which-city-is-famously-associated-with-the-formation-and-early-career-of-the-beatles',
    'which-legendary-guitarist-famously-played-a-white-fender-stratocaster-at-woodstock',
    'which-legendary-guitarist-is-known-for-his-performance-at-woodstock-including-his-rendition-of-the-star-spangled-banner',
  ];
  if (historySlugs.includes(slug)) return 'music-history-events';

  return 'contemporary-pop-culture';
}

function determinePopCultureTarget(slug, question) {
  const q = question.toLowerCase();
  
  // ====== SLUG-BASED MATCHING (most reliable) ======
  
  // --- Television: drama-cable ---
  const tvDramaSlugs = [
    'before-starring-in-oppenheimer-cillian-murphy-gained-widespread-fame-as-tommy-shelby-in-which-british-crime-drama',
    'in-the-tv-show-game-of-thrones-what-is-the-name-of-the-continent-where-most-of-the-story-takes-place',
    'the-fantasy-novel-series-a-song-of-ice-and-fire-by-george-rr-martin-was-adapted-into-which-hbo-phenomenon',
  ];
  if (tvDramaSlugs.includes(slug))
    return { category: 'Television', subcategory: 'drama-cable' };
  
  // --- Television: animated-series ---
  const tvAnimatedSlugs = [
    'what-is-the-name-of-the-yellow-animated-family-created-by-matt-groening',
    'what-is-the-name-of-the-yellow-anthropomorphic-sea-sponge-who-lives-in-a-pineapple-under-the-sea',
  ];
  if (tvAnimatedSlugs.includes(slug))
    return { category: 'Television', subcategory: 'animated-series' };

  // --- Movies: actors-performers ---
  const movieActorSlugs = [
    'which-actor-is-known-for-his-roles-as-jack-sparrow-in-pirates-of-the-caribbean-and-willy-wonka-in-charlie-and-the-chocolate-factory',
  ];
  if (movieActorSlugs.includes(slug))
    return { category: 'Movies', subcategory: 'actors-performers' };

  // --- Movies: awards-history-industry ---
  const movieIndustrySlugs = [
    'which-animated-movie-studio-is-known-for-films-like-toy-story-finding-nemo-and-coco',
  ];
  if (movieIndustrySlugs.includes(slug))
    return { category: 'Movies', subcategory: 'awards-history-industry' };

  // --- Music: artist-identity ---
  const musicArtistSlugs = [
    'which-singer-is-widely-known-by-the-nickname-queen-of-pop',
  ];
  if (musicArtistSlugs.includes(slug))
    return { category: 'Music', subcategory: 'artist-identity' };

  // --- Music: contemporary-pop-culture ---
  const musicPopSlugs = [
    'what-is-the-stage-name-of-the-artist-known-for-hits-like-bad-romance-and-poker-face',
    'which-artist-achieved-massive-internet-fame-with-hits-like-old-town-road-blending-country-and-hip-hop-genres',
    'which-singer-is-known-for-hits-like-bad-guy-and-therefore-i-am',
  ];
  if (musicPopSlugs.includes(slug))
    return { category: 'Music', subcategory: 'contemporary-pop-culture' };

  // ====== KEYWORD-BASED MATCHING (for questions that name their subject) ======
  
  // TV shows
  if (q.includes('peaky blinders') || slug.includes('peaky-blinders'))
    return { category: 'Television', subcategory: 'drama-cable' };
  if ((slug.includes('game-of-thrones') && slug.includes('westeros')) || (q.includes('game of thrones') && q.includes('westeros')))
    return { category: 'Television', subcategory: 'drama-cable' };
  if ((slug.includes('game-of-thrones') && slug.includes('song-of-ice-and-fire')) || (q.includes('game of thrones') && q.includes('song of ice and fire')))
    return { category: 'Television', subcategory: 'drama-cable' };
  if (q.includes('simpsons') || slug.includes('simpsons'))
    return { category: 'Television', subcategory: 'animated-series' };
  if (q.includes('spongebob') || slug.includes('spongebob'))
    return { category: 'Television', subcategory: 'animated-series' };
  if ((q.includes('friends') || slug.includes('friends')) && (q.includes('theme song') || q.includes("i'll be there") || q.includes('ill be there')))
    return { category: 'Television', subcategory: 'sitcoms-comedy' };
  if (q.includes('family guy') || slug.includes('family-guy'))
    return { category: 'Television', subcategory: 'animated-series' };

  // Movies
  if (q.includes('johnny depp') || slug.includes('johnny-depp'))
    return { category: 'Movies', subcategory: 'actors-performers' };
  if (q.includes('ryan reynolds') || slug.includes('ryan-reynolds') || q.includes('deadpool'))
    return { category: 'Movies', subcategory: 'actors-performers' };
  if (q.includes('pixar') || slug.includes('pixar'))
    return { category: 'Movies', subcategory: 'awards-history-industry' };
  if (q.includes('toy story') || slug.includes('toy-story'))
    return { category: 'Movies', subcategory: 'characters-lore' };

  // Music artists
  if (q.includes('lady gaga') || slug.includes('lady-gaga'))
    return { category: 'Music', subcategory: 'contemporary-pop-culture' };
  if (q.includes('lil nas x') || slug.includes('lil-nas-x'))
    return { category: 'Music', subcategory: 'contemporary-pop-culture' };
  if (q.includes('billie eilish') || slug.includes('billie-eilish'))
    return { category: 'Music', subcategory: 'contemporary-pop-culture' };
  if (q.includes('bono') || slug.includes('bono') || q.includes('u2'))
    return { category: 'Music', subcategory: 'artist-identity' };
  if ((q.includes('madonna') || slug.includes('madonna')) && q.includes('queen of pop'))
    return { category: 'Music', subcategory: 'artist-identity' };

  // Tech/Social Media
  if (q.includes('twitter') || q.includes('rebranding') || q.includes("elon musk"))
    return { category: 'Science & Tech', subcategory: 'medicine-technology' };

  console.log(`  UNMAPPED POP CULTURE: "${question}"`);
  return { category: 'Music', subcategory: 'contemporary-pop-culture' };
}

function determineGKTarget(slug, question, answer) {
  const q = question.toLowerCase();
  
  // Sports-related GK
  if (q.includes('soccer') || q.includes('football team') && q.includes('players') && q.includes('starting lineup'))
    return { category: 'Sports', subcategory: 'rules-terminology' };
  if (q.includes('basketball') && q.includes('originate'))
    return { category: 'Sports', subcategory: 'historical-moments' };
  if (q.includes('golf') && q.includes('originate'))
    return { category: 'Sports', subcategory: 'historical-moments' };

  // Science-related GK
  if (q.includes('www') || q.includes('web addresses'))
    return { category: 'Science & Tech', subcategory: 'medicine-technology' };
  if (q.includes('claustrophobia') || q.includes('confined spaces'))
    return { category: 'Science & Tech', subcategory: 'medicine-technology' };
  if (q.includes('smallest prime number'))
    return { category: 'Science & Tech', subcategory: 'physics-concepts' };

  // Fallback for remaining GK questions (shouldn't get here since we mapped all)
  console.log(`  UNMAPPED GK: "${question}"`);
  return { category: 'Geography', subcategory: 'physical-geography' };
}

function determineScienceSubcategory(slug, question) {
  const q = question.toLowerCase();
  if (q.includes('electrical resistance') || q.includes('ohm'))
    return 'physics-concepts';
  if (q.includes('unit of force') || q.includes('newton'))
    return 'physics-concepts';
  if (q.includes('pangea') || q.includes('supercontinent'))
    return 'astronomy-earth-science';
  if (q.includes('artery') || q.includes('aorta') || q.includes('blood'))
    return 'biology-human-body';
  if (q.includes('electron') || q.includes('subatomic'))
    return 'physics-concepts';
  return 'physics-concepts';
}

function determineSportsSubcategory(slug, question) {
  const q = question.toLowerCase();
  const s = slug;

  const recordsSlugs = [
    'how-many-grand-slam-tournaments-are-held-annually-in-professional-tennis',
    'how-many-players-are-on-a-water-polo-team-in-the-water-at-one-time',
    'how-many-points-is-a-touchdown-worth-in-american-football-excluding-extra-points',
    'how-many-squares-are-there-on-a-standard-chessboard',
    'how-many-yards-must-an-american-football-team-advance-to-get-a-first-down',
    'as-of-2024-which-nba-franchise-holds-the-record-for-the-most-nba-championships',
    'what-is-the-only-city-to-have-hosted-the-summer-olympics-three-times',
    'which-country-has-won-the-most-fifa-world-cup-titles-in-mens-football-history',
    'which-female-athlete-holds-the-record-for-the-most-olympic-gold-medals-in-track-and-field',
    'how-many-sets-must-a-male-player-win-to-claim-a-grand-slam-tennis-match',
  ];
  if (recordsSlugs.includes(s)) return 'records-statistics';

  const rulesSlugs = [
    'in-which-sport-would-you-find-terms-like-scrum-lineout-and-try',
    'in-which-team-sport-must-a-team-win-a-set-by-at-least-two-points',
    'what-does-scoring-a-birdie-mean-in-golf',
    'what-is-the-maximum-number-of-points-a-player-can-score-in-a-single-frame-of-ten-pin-bowling-without-any-strikes-or-spares',
    'what-is-the-name-of-the-competition-combining-ten-different-track-and-field-events',
    'what-is-the-term-for-a-score-of-40-40-in-a-tennis-game',
    'which-racket-sport-uses-scoring-terms-such-as-love-deuce-and-advantage',
    'which-sport-uses-terms-like-spiker-blocker-and-libero',
  ];
  if (rulesSlugs.includes(s)) return 'rules-terminology';

  const momentsSlugs = [
    'which-nfl-team-won-the-first-super-bowl-in-1967',
    'how-many-players-are-there-in-a-standard-starting-lineup-for-a-soccer-football-team',
    'in-which-country-did-the-sport-of-basketball-originate',
    'in-which-country-did-the-sport-of-golf-originate',
  ];
  if (momentsSlugs.includes(s)) return 'historical-moments';

  if (q.includes('fenway park'))
    return 'teams-franchises';

  // Notable figures
  if (q.includes('jack nicklaus') || q.includes('allyson felix'))
    return 'notable-figures';

  // Default
  if (q.includes('fifa') || q.includes('international organization') || q.includes('vince lombardi'))
    return 'records-statistics';

  return 'rules-terminology';
}

// ============================================================
// STEP 4: Execute mapping, check duplicates, merge
// ============================================================

const targetCategories = {}; // categoryName -> array of questions to add
const duplicateQuestions = [];
const slugDuplicates = [];

newQuestions.forEach((q, idx) => {
  // Check slug duplicate
  if (allExistingSlugs.has(q.slug)) {
    slugDuplicates.push({ question: q, reason: `Slug "${q.slug}" already exists in a category file` });
    return;
  }

  // Check question text duplicate (normalized)
  const normalized = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (allExistingQuestions.has(normalized)) {
    duplicateQuestions.push({ question: q, reason: `Question text already exists in a category file` });
    return;
  }

  // Determine target category
  const target = determineTargetCategory(q);
  
  if (!targetCategories[target.category]) {
    targetCategories[target.category] = [];
  }
  
  // Update the question's category and subcategory to match existing
  const updatedQ = { ...q, category: target.category, subcategory: target.subcategory };
  targetCategories[target.category].push(updatedQ);
});

// ============================================================
// STEP 5: Merge into existing files
// ============================================================

console.log('\n========================================');
console.log('DISTRIBUTION PLAN');
console.log('========================================\n');

const oldCounts = {};
Object.entries(existingCategories).forEach(([name, info]) => {
  oldCounts[name] = info.questions.length;
});

Object.entries(targetCategories).forEach(([cat, qs]) => {
  console.log(`${cat}: +${qs.length} new questions`);
});

console.log('\n=== DUPLICATES FOUND ===');
console.log(`Slug duplicates: ${slugDuplicates.length}`);
slugDuplicates.forEach(d => console.log(`  [SLUG] "${d.question.question}" - ${d.reason}`));
console.log(`Text duplicates: ${duplicateQuestions.length}`);
duplicateQuestions.forEach(d => console.log(`  [TEXT] "${d.question.question}" - ${d.reason}`));

// Write updated files
console.log('\n=== MERGING INTO CATEGORY FILES ===');

Object.entries(targetCategories).forEach(([cat, newQs]) => {
  const info = existingCategories[cat];
  if (!info) {
    console.log(`  ERROR: Category "${cat}" not found in existing categories!`);
    return;
  }
  
  const oldCount = info.questions.length;
  const merged = [...info.questions, ...newQs];
  
  const output = {
    categoryName: cat,
    questions: merged,
  };
  
  fs.writeFileSync(info.filePath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  ${cat}: ${oldCount} → ${merged.length} (+${newQs.length} new)`);
});

// ============================================================
// STEP 6: Final Report
// ============================================================

console.log('\n========================================');
console.log('FINAL SUMMARY');
console.log('========================================\n');

// Reload to verify
console.log('Old → New question counts:');
categoryFiles.forEach(file => {
  const filePath = path.join(CATEGORIES_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const catName = data.categoryName;
  const oldCount = oldCounts[catName] || 0;
  const added = targetCategories[catName] ? targetCategories[catName].length : 0;
  console.log(`  ${catName}: ${oldCount} → ${data.questions.length} (added ${added})`);
});

console.log(`\nTotal new questions: ${newQuestions.length}`);
console.log(`Questions added to categories: ${newQuestions.length - slugDuplicates.length - duplicateQuestions.length}`);
console.log(`Slug duplicates skipped: ${slugDuplicates.length}`);
console.log(`Text duplicates skipped: ${duplicateQuestions.length}`);

// Check for within-new-questions duplicates
console.log('\n=== INTRA-NEW-QUESTION DUPLICATE CHECK ===');
const newSlugs = newQuestions.map(q => q.slug);
const newQuestionsTexts = newQuestions.map(q => q.question.toLowerCase().replace(/[^a-z0-9]/g, ''));
const seen = {};
newQuestions.forEach((q, i) => {
  const key = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen[key] !== undefined) {
    console.log(`  DUPLICATE within new questions: Q${seen[key]} and Q${i}: "${q.question}"`);
  }
  seen[key] = i;
});
