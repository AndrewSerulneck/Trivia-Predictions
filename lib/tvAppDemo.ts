// Try demo for the Hightop Challenge TV app (docs/fire-tv-app-plan.md Phase 3, D21, D23).
//
// Fake states for a fake venue, so Amazon's reviewers (and anyone without a venue) can see the TV screens. No
// database, no real venue, no request: /tv-app/demo hands these to VenueScreenClient with `poll={false}`.
// Launch content only (D21): the five idle carousel slides (Phase 11) and Live Trivia; reserved phase R2 adds
// Category Blitz, Squares and Bracket. Each screen stays 15 s (D23).

import { LIVE_TRIVIA_QUESTIONS_PER_ROUND } from "@/lib/liveTriviaShared";
import { toQuestionMedia } from "@/lib/questionMedia";
import type { ScreenLeaderboardEntry, VenueScreenState, VenueScreenVenue } from "@/lib/venueScreen";
import { TV_CAROUSEL_ORDER, type TvCarouselSlideId } from "@/lib/tvCarousel";
import { debugCarousel } from "@/lib/venueScreenCarouselShared";

export const TV_DEMO_STEP_MS = 15_000;

export const TV_DEMO_VENUE: VenueScreenVenue = { id: "demo", name: "Demo Bar", displayName: "Demo Bar" };

const GAME_ID = "demo:live-trivia";

const LEADERBOARD: ScreenLeaderboardEntry[] = [
  { rank: 1, username: "Maya R.", points: 1840 },
  { rank: 2, username: "Dre T.", points: 1625 },
  { rank: 3, username: "Sam K.", points: 1510 },
  { rank: 4, username: "Jordan P.", points: 1290 },
  { rank: 5, username: "Lee W.", points: 1105 },
];

type LiveTrivia = Extract<VenueScreenState, { mode: "live-trivia" }>["liveTrivia"];

const liveTrivia = (nowMs: number, live: Partial<LiveTrivia> & Pick<LiveTrivia, "phase">): VenueScreenState => ({
  ok: true,
  mode: "live-trivia",
  venue: TV_DEMO_VENUE,
  liveTrivia: {
    gameId: GAME_ID,
    roundNumber: 2,
    totalRounds: 4,
    category: "U.S. Geography",
    question: null,
    media: null,
    questionIndex: 3,
    questionsPerRound: LIVE_TRIVIA_QUESTIONS_PER_ROUND,
    correctAnswer: null,
    secondsRemaining: 0,
    revealEndsAt: null,
    leaderboard: null,
    ...live,
  },
  categoryBlitz: null,
  idle: null,
  updatedAt: nowMs,
});

/** The next Thursday, 8:00 PM on the TV's own clock (at least a day away), so the idle line reads like a real schedule. */
const nextThursdayEvening = (nowMs: number): string => {
  const date = new Date(nowMs);
  date.setHours(20, 0, 0, 0);
  const daysAhead = ((4 - date.getDay() + 7) % 7) || 7;
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString();
};

const idleState = (nowMs: number): VenueScreenState => ({
  ok: true,
  mode: "idle",
  venue: TV_DEMO_VENUE,
  liveTrivia: null,
  categoryBlitz: null,
  idle: {
    nextLiveTrivia: {
      startsAt: nextThursdayEvening(nowMs),
      title: "Live Trivia",
      firstRoundCategory: null,
      recurringDays: ["thu"],
    },
    sponsorSlots: [],
    ...debugCarousel("sunday", nowMs),
  },
  updatedAt: nowMs,
});

type DemoStep = {
  id: string;
  build: (nowMs: number) => VenueScreenState;
  /** The carousel slide this step pins (the demo shows each for its own 15 s, instead of rotating). */
  slide?: TvCarouselSlideId;
};

/** The demo's screens, in order. Each builder takes the moment its step starts, so every countdown is fresh. */
export const TV_DEMO_STEPS: ReadonlyArray<DemoStep> = [
  ...TV_CAROUSEL_ORDER.map((slide): DemoStep => ({ id: `slide-${slide}`, build: idleState, slide })),
  {
    id: "pregame",
    build: (nowMs) => ({
      ok: true,
      mode: "live-trivia-pregame",
      venue: TV_DEMO_VENUE,
      liveTrivia: null,
      categoryBlitz: null,
      idle: null,
      pregame: {
        gameId: GAME_ID,
        title: "Live Trivia",
        startsAt: new Date(nowMs + 9 * 60_000 + 59_000).toISOString(),
        firstRoundCategory: "U.S. Geography",
      },
      updatedAt: nowMs,
    }),
  },
  {
    id: "question",
    build: (nowMs) =>
      liveTrivia(nowMs, {
        phase: "question",
        question: "Which U.S. state is shown on the map?",
        media: toQuestionMedia("/maps/geography-map-texas.png"),
        secondsRemaining: 20,
      }),
  },
  {
    id: "reveal",
    build: (nowMs) =>
      liveTrivia(nowMs, {
        phase: "reveal",
        question: "Which U.S. state is shown on the map?",
        media: toQuestionMedia("/maps/geography-map-texas.png"),
        correctAnswer: "Texas",
        secondsRemaining: TV_DEMO_STEP_MS / 1000,
        revealEndsAt: new Date(nowMs + TV_DEMO_STEP_MS).toISOString(),
      }),
  },
  {
    id: "round-break",
    build: (nowMs) =>
      liveTrivia(nowMs, {
        phase: "intermission",
        category: null,
        questionIndex: null,
        secondsRemaining: TV_DEMO_STEP_MS / 1000,
        leaderboard: LEADERBOARD,
      }),
  },
  {
    id: "final",
    build: (nowMs) =>
      liveTrivia(nowMs, {
        phase: "final",
        roundNumber: 4,
        category: null,
        questionIndex: null,
        leaderboard: LEADERBOARD,
      }),
  },
];

/** Step index after moving `delta` steps, wrapping around. */
export const tvDemoStepAfter = (index: number, delta: number): number => {
  const count = TV_DEMO_STEPS.length;
  return (((index + delta) % count) + count) % count;
};
