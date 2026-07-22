// Phase 3 regression guard for docs/venue-tv-display-content-fit-plan.md.
//
// Walks every venue-screen state (the same fixture-interception technique
// Phases 0-2 used to measure and fix the original clipping bug) and fails if
// the rendered canvas ever overflows itself. This is the test that would have
// caught the original bug and is what stops it silently coming back the next
// time a panel's copy grows.
//
// What "overflow" means here: `main` (components/venue-screen/VenueScreenClient.tsx)
// is the canvas's own `overflow-hidden` clipping boundary — a flex item further
// down the tree that grows past its slot (e.g. a `min-h-0` class removed, or a
// panel added without <AutoScaleToFit>) pushes `main.scrollHeight`/`scrollWidth`
// past `main.clientHeight`/`clientWidth` exactly the way it did before Phase 1/2.
// Decorative absolute overhang (TvAnswerReveal's bloom, TvFinalStandings'
// confetti) is deliberately excluded from AutoScaleToFit's measured subtree and
// clipped one level down at the PANEL root, so it never reaches `main` and can't
// produce a false positive here (see Phase 2 Finding 3 in the plan doc).
//
// Prereqs: dev server on :3000, and the `venue-pacific-street` venue seeded
// (same venue Phases 0-2 measured against). No auth needed — the TV screen
// route is unauthenticated by design.
//
//   node scripts/verify-venue-screen-overflow.mjs
//   BASE_URL=http://localhost:3000 VENUE_ID=venue-pacific-street node scripts/verify-venue-screen-overflow.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const VENUE_ID = process.env.VENUE_ID || "venue-pacific-street";
const CANVAS_WIDTH = 2304;
const CANVAS_HEIGHT = 1296;
// scrollWidth/scrollHeight round to integers, so an exact fit routinely reads
// back a pixel or two over — same slack constant AutoScaleToFit itself uses.
const OVERFLOW_SLACK_PX = 2;
// Idle mode intentionally shifts content by up to +/-6px per axis
// (getVenueScreenBurnInTransform in lib/venueScreenTiming.ts) to avoid TV
// screen burn-in — this is deliberate jitter, not overflow. Phase 1 of the
// content-fit plan already identified and accepted this as a measurement
// artifact of TvIdleAttract's full-bleed background wrapper, not a real bug.
const IDLE_OVERFLOW_SLACK_PX = 20;

const VENUE = {
  id: VENUE_ID,
  name: "Hightop Pub",
  displayName: "Hightop Pub TV",
  screenBrandImageUrl: null,
  screenBrandPrimary: null,
  screenBrandSecondary: null,
};

const LONGEST_CATEGORIES = [
  "A type of government or political system",
  "A dish you would order at a restaurant",
  "An item sold in an office supply store",
  "An item sold in a sporting goods store",
  "A figure from Greek or Roman mythology",
  "A body of water such as a lake or sea",
  "A fictional character from literature",
  "A fictional superhero or supervillain",
  "A country in the Southern Hemisphere",
  "A profession that requires a license",
  "An item found in a medicine cabinet",
  "A substance found in the human body",
];

const NEAR_WORST_CATEGORIES = [
  "A character from a Shakespeare play",
  "An automobile brand or manufacturer",
  "An annoying customer service phrase",
  "An animal that burrows underground",
  "A part of a standard motor vehicle",
  "A weather condition or phenomenon",
  "An ancient civilization or empire",
  "An animal commonly found in a zoo",
  "An item sold in a hardware store",
  "An item sold in a clothing store",
  "A geographic feature or landform",
  "An element on the periodic table",
];

const TYPICAL_CATEGORIES = [
  "An item sold in a pet store",
  "An item sold in a toy store",
  "An item found in a bathroom",
  "An item found in a hospital",
  "An item sold in a bookstore",
  "A piece of sports equipment",
  "An occupation or profession",
  "An animal native to Africa",
  "A muscle in the human body",
  "An organ in the human body",
  "An item sold in a pharmacy",
  "An item found in a kitchen",
];

// Synthetic — designed to wrap ~4 lines each, well past any real category in
// the pool, to prove AutoScaleToFit keeps engaging as content grows rather
// than only ever being sized for today's worst real-world case.
const FOUR_LINE_SYNTHETIC_CATEGORIES = Array.from({ length: 12 }, (_, i) =>
  `A thing you would find described at extraordinary and unreasonable length in category number ${i + 1}`
);

function categoryBlitzState({ phase, letter, categories, leaderboard = null, venue = VENUE }) {
  return {
    ok: true,
    mode: "category-blitz",
    venue,
    liveTrivia: null,
    categoryBlitz: {
      phase,
      roundId: "verify-round-1",
      letter,
      categories,
      secondsRemaining: 59,
      leaderboard,
    },
    idle: null,
    updatedAt: Date.now(),
  };
}

function liveTriviaState(overrides = {}) {
  return {
    ok: true,
    mode: "live-trivia",
    venue: VENUE,
    liveTrivia: {
      phase: "question",
      gameId: "verify-game-1",
      roundNumber: 2,
      totalRounds: 4,
      category: "Sports",
      question: "Which city hosted the 1996 Summer Olympics?",
      correctAnswer: null,
      secondsRemaining: 42,
      revealEndsAt: null,
      leaderboard: null,
      ...overrides,
    },
    categoryBlitz: null,
    idle: null,
    updatedAt: Date.now(),
  };
}

const FINAL_LEADERBOARD = [
  { rank: 1, username: "casey", points: 90 },
  { rank: 2, username: "AnotherLongUsernameHere", points: 70 },
  { rank: 3, username: "morgan", points: 55 },
  { rank: 4, username: "jamie", points: 40 },
  { rank: 5, username: "avery", points: 25 },
  { rank: 6, username: "Riley", points: 10 },
];

const FIXTURES = [
  {
    name: "idle",
    debugMode: "idle",
    marker: "ThursdayLiveTrivia",
    state: {
      ok: true,
      mode: "idle",
      venue: VENUE,
      liveTrivia: null,
      categoryBlitz: null,
      idle: {
        nextLiveTrivia: {
          startsAt: new Date(Date.now() + 3_600_000).toISOString(),
          title: "Thursday Live Trivia",
          firstRoundCategory: "History",
          recurringDays: ["thu"],
        },
        nextCategoryBlitz: {
          startsAt: new Date(Date.now() + 1_800_000).toISOString(),
          recurringDays: ["thu"],
        },
        sponsorSlots: [],
      },
      updatedAt: Date.now(),
    },
  },
  {
    name: "live-trivia:question",
    debugMode: "live-trivia",
    marker: "Sports",
    state: liveTriviaState(),
  },
  {
    name: "live-trivia:reveal",
    debugMode: "live-trivia",
    marker: "Atlanta",
    state: liveTriviaState({
      phase: "reveal",
      secondsRemaining: 12,
      correctAnswer: "Atlanta",
      revealEndsAt: new Date(Date.now() + 12_000).toISOString(),
    }),
  },
  {
    name: "live-trivia:reveal-long-answer",
    debugMode: "live-trivia",
    marker: "AVeryLongCorrectAnswerThatMightWrapAcrossMultipleLinesOnTheRevealPanel",
    state: liveTriviaState({
      phase: "reveal",
      secondsRemaining: 12,
      correctAnswer: "A Very Long Correct Answer That Might Wrap Across Multiple Lines On The Reveal Panel",
      revealEndsAt: new Date(Date.now() + 12_000).toISOString(),
    }),
  },
  {
    name: "live-trivia:intermission",
    debugMode: "live-trivia",
    marker: "morgan",
    state: liveTriviaState({
      phase: "intermission",
      secondsRemaining: 195,
      leaderboard: [
        { rank: 1, username: "casey", points: 90 },
        { rank: 2, username: "morgan", points: 70 },
      ],
    }),
  },
  {
    name: "live-trivia:final",
    debugMode: "live-trivia",
    marker: "AnotherLongUsernameHere",
    state: liveTriviaState({
      phase: "final",
      secondsRemaining: 0,
      leaderboard: FINAL_LEADERBOARD,
    }),
  },
  {
    name: "category-blitz:round",
    debugMode: "category-blitz",
    marker: "Pharmacy",
    state: categoryBlitzState({ phase: "round", letter: "P", categories: TYPICAL_CATEGORIES }),
  },
  {
    name: "category-blitz:round-longest-real-categories",
    debugMode: "category-blitz",
    marker: "SubstanceFoundInTheHumanBody",
    state: categoryBlitzState({ phase: "round", letter: "S", categories: LONGEST_CATEGORIES }),
  },
  {
    name: "category-blitz:round-near-worst-categories",
    debugMode: "category-blitz",
    marker: "ElementOnThePeriodicTable",
    state: categoryBlitzState({ phase: "round", letter: "E", categories: NEAR_WORST_CATEGORIES }),
  },
  {
    name: "category-blitz:round-four-line-synthetic",
    debugMode: "category-blitz",
    marker: "categorynumber1",
    state: categoryBlitzState({
      phase: "round",
      letter: "T",
      categories: FOUR_LINE_SYNTHETIC_CATEGORIES,
    }),
  },
  {
    name: "category-blitz:round-long-venue-name",
    debugMode: "category-blitz",
    marker: "Kitchen",
    state: categoryBlitzState({
      phase: "round",
      letter: "K",
      categories: TYPICAL_CATEGORIES,
      venue: {
        ...VENUE,
        displayName: "The Extraordinarily Long Establishment Name Sports Bar & Grill TV",
      },
    }),
  },
  {
    name: "category-blitz:intermission",
    debugMode: "category-blitz",
    marker: "Startingin",
    state: categoryBlitzState({
      phase: "intermission",
      letter: "M",
      categories: TYPICAL_CATEGORIES,
      leaderboard: [
        { rank: 1, username: "casey", points: 30 },
        { rank: 2, username: "morgan", points: 24 },
      ],
    }),
  },
  {
    name: "category-blitz:results",
    debugMode: "category-blitz",
    marker: "Roundresults",
    state: categoryBlitzState({
      phase: "results",
      letter: "M",
      categories: TYPICAL_CATEGORIES,
      leaderboard: [{ rank: 1, username: "casey", points: 44 }],
    }),
  },
];

async function measureOverflow(page, slack) {
  return page.evaluate(
    ({ width, height, slack }) => {
      // AppShell (components/ui/AppShell.tsx) wraps the whole app in its own
      // unrelated `<main className="flex-1 pb-24">`, so a bare `main` selector
      // grabs that one (document order) instead of VenueScreenClient's fixed
      // 2304x1296 canvas `<main>` — scope to its distinguishing classes.
      const main = document.querySelector("main.bg-slate-950");
      if (!main) return { found: false };
      const mainRect = main.getBoundingClientRect();

      // Deliberately NOT gated on main.scrollWidth/scrollHeight: a panel that
      // overflows into an INTERMEDIATE overflow-hidden ancestor (e.g. a Tv*
      // panel root losing its <AutoScaleToFit> wrapper, or losing a `min-h-0`
      // partway down the flex chain) gets absorbed by that ancestor and never
      // propagates up to `main` at all (same "nearest clipping ancestor" rule
      // AutoScaleToFit itself works around — see Phase 2 Finding 2 in the plan
      // doc). getBoundingClientRect ignores ancestor overflow-hidden entirely
      // (it reports the element's true layout box, clipped or not), so walking
      // every in-flow descendant and comparing straight to the canvas bounds
      // catches overflow at ANY depth, not just at the outermost canvas.
      //
      // Decorative absolute/fixed overhang (TvAnswerReveal's bloom,
      // TvFinalStandings' confetti) is excluded by design — see Phase 2
      // Finding 3 — so this walk skips those subtrees entirely rather than
      // just the element itself, since decorative pieces nest further
      // absolutely-positioned children.
      let worst = null;
      // Worst measured on the single largest axis overrun, not the summed
      // area — an element that's slightly over on BOTH axes (e.g. idle's
      // deliberate anti-burn-in pixel jitter, see IDLE_OVERFLOW_SLACK_PX)
      // should compare the same as one that's over by that amount on a
      // single axis, not double-count against slack.
      let worstOverrun = 0;

      const visit = (el) => {
        const style = getComputedStyle(el);
        if (style.position === "absolute" || style.position === "fixed") return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const overRight = rect.right - mainRect.left - width;
          const overBottom = rect.bottom - mainRect.top - height;
          const overrun = Math.max(overRight, overBottom);
          if (overrun > worstOverrun) {
            worstOverrun = overrun;
            worst = {
              tag: el.tagName,
              className: typeof el.className === "string" ? el.className.slice(0, 120) : "",
              text: (el.textContent || "").trim().slice(0, 60),
              overRight: Math.round(overRight),
              overBottom: Math.round(overBottom),
            };
          }
        }
        for (const child of el.children) visit(child);
      };
      for (const child of main.children) visit(child);

      if (worstOverrun <= slack) return { found: false };
      return {
        found: true,
        overflowX: Math.max(0, worst?.overRight ?? 0),
        overflowY: Math.max(0, worst?.overBottom ?? 0),
        worst,
      };
    },
    { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, slack }
  );
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } });
  const page = await ctx.newPage();

  let failures = 0;

  for (const fixture of FIXTURES) {
    await page.route("**/api/venue-screen/state**", (route) =>
      route.fulfill({ json: fixture.state })
    );

    await page.goto(`${BASE}/venue/${VENUE_ID}/screen?mode=${fixture.debugMode}`, {
      waitUntil: "networkidle",
    });

    // Wait for the fixture's marker to actually land (guards against measuring
    // stale server-rendered debug content instead of the intercepted fixture —
    // the exact false negative that cost the most time in Phase 0).
    try {
      await page.waitForFunction(
        (marker) => {
          // innerText reflects CSS text-transform (many panels render labels
          // uppercase), so compare case-insensitively as well as whitespace-
          // insensitively (TvQuestionReveal splits text into per-word spans).
          const text = (document.body?.innerText ?? "").replace(/\s+/g, "").toLowerCase();
          return text.includes(marker.toLowerCase());
        },
        fixture.marker,
        // Idle polls every 20s (see getVenueScreenPollIntervalMs) — everything
        // else polls every 1-4s.
        { timeout: fixture.debugMode === "idle" ? 30_000 : 10_000 }
      );
    } catch {
      console.error(`[FAIL] ${fixture.name}: marker "${fixture.marker}" never appeared — fixture didn't render.`);
      failures += 1;
      await page.unroute("**/api/venue-screen/state**");
      continue;
    }

    // Settle past any in-flight entrance animation (TvLetterReveal's hero-letter
    // "slam" runs ~1.7s and transiently fills the screen) before measuring —
    // otherwise a mid-flight frame reads as overflow that was never really there.
    await page.waitForTimeout(2_500);

    const result = await measureOverflow(
      page,
      fixture.debugMode === "idle" ? IDLE_OVERFLOW_SLACK_PX : OVERFLOW_SLACK_PX
    );
    if (result.found) {
      failures += 1;
      console.error(
        `[FAIL] ${fixture.name}: canvas overflow X=${result.overflowX}px Y=${result.overflowY}px` +
          (result.worst
            ? ` — worst offender <${result.worst.tag} class="${result.worst.className}"> "${result.worst.text}" (overRight=${result.worst.overRight}px overBottom=${result.worst.overBottom}px)`
            : "")
      );
    } else {
      console.log(`[OK] ${fixture.name}`);
    }

    await page.unroute("**/api/venue-screen/state**");
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures}/${FIXTURES.length} fixture(s) overflowed the canvas.`);
    process.exit(1);
  }
  console.log(`\nAll ${FIXTURES.length} fixtures fit the canvas.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
