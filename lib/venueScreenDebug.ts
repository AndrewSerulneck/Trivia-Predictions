import { LIVE_TRIVIA_QUESTIONS_PER_ROUND } from "@/lib/liveTriviaShared";
import { toQuestionMedia } from "@/lib/questionMedia";
import type { VenueScreenState } from "@/lib/venueScreen";
import { debugCarousel, EMPTY_CAROUSEL } from "@/lib/venueScreenCarouselShared";
import type { VenueScreenDebugMode } from "@/lib/venueScreenTiming";

export function applyVenueScreenDebugMode(
  state: VenueScreenState,
  mode: VenueScreenDebugMode | null,
  nowMs: number = Date.now(),
): VenueScreenState {
  if (!mode || state.mode === mode) return state;
  // `carousel-empty` is idle with nothing but "Get the app": no next game, no sponsors.
  if (mode === "carousel-empty") {
    return {
      ok: true,
      mode: "idle",
      venue: state.venue,
      liveTrivia: null,
      categoryBlitz: null,
      idle: { nextLiveTrivia: null, sponsorSlots: [], ...EMPTY_CAROUSEL },
      updatedAt: nowMs,
    };
  }

  if (mode === "live-trivia") {
    return {
      ok: true,
      mode: "live-trivia",
      venue: state.venue,
      liveTrivia: {
        phase: "question",
        gameId: "debug-schedule:2026-07-02",
        roundNumber: 2,
        totalRounds: 4,
        category: "Venue Screen QA",
        question: "This is a debug Live Trivia question for checking the public TV layout.",
        // A real map, so `?mode=live-trivia` also checks the picture frame on a TV.
        media: toQuestionMedia("/maps/geography-map-texas.png"),
        questionIndex: 3,
        questionsPerRound: LIVE_TRIVIA_QUESTIONS_PER_ROUND,
        correctAnswer: null,
        secondsRemaining: 45,
        revealEndsAt: null,
        leaderboard: null,
      },
      categoryBlitz: null,
      idle: null,
      updatedAt: nowMs,
    };
  }

  if (mode === "live-trivia-pregame" || mode === "pregame-hour") {
    // `live-trivia-pregame`: the last 15 minutes. `pregame-hour`: the start of the D13 hour (59:30 to go).
    const leadMs = mode === "pregame-hour" ? 59 * 60_000 + 30_000 : 14 * 60_000 + 59_000;
    return {
      ok: true,
      mode: "live-trivia-pregame",
      venue: state.venue,
      liveTrivia: null,
      categoryBlitz: null,
      idle: null,
      pregame: {
        gameId: "debug-schedule:2026-07-02",
        title: "Debug Live Trivia",
        startsAt: new Date(nowMs + leadMs).toISOString(),
        firstRoundCategory: "History",
      },
      updatedAt: nowMs,
    };
  }

  if (mode === "category-blitz") {
    return {
      ok: true,
      mode: "category-blitz",
      venue: state.venue,
      liveTrivia: null,
      categoryBlitz: {
        phase: "round",
        roundId: "debug-round",
        letter: "M",
        categories: ["Movies", "Music", "Mountains", "Mascots"],
        secondsRemaining: 59,
        leaderboard: null,
      },
      idle: null,
      updatedAt: nowMs,
    };
  }

  // `idle` keeps its old look (no carousel data); the carousel modes fill slides 2–4 (docs/fire-tv-app-plan.md
  // Phase 9 step 7). The next game is 26 hours out, outside the 60-minute pre-game window.
  const carousel =
    mode === "carousel"
      ? debugCarousel("sunday", nowMs)
      : mode === "carousel-weeknight"
        ? debugCarousel("weeknight", nowMs)
        : EMPTY_CAROUSEL;
  return {
    ok: true,
    mode: "idle",
    venue: state.venue,
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      ...carousel,
      nextLiveTrivia: {
        startsAt: new Date(nowMs + 26 * 60 * 60_000).toISOString(),
        title: "Debug Live Trivia",
        firstRoundCategory: "History",
        recurringDays: ["thu"],
      },
      sponsorSlots: [
        {
          title: "Sample Sponsor",
          imageUrl: "/brand/htc-logo.png",
          linkUrl: null,
        },
      ],
    },
    updatedAt: nowMs,
  };
}
