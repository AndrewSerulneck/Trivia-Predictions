import { LIVE_TRIVIA_QUESTIONS_PER_ROUND } from "@/lib/liveTriviaShared";
import { toQuestionMedia } from "@/lib/questionMedia";
import type { VenueScreenState } from "@/lib/venueScreen";
import type { VenueScreenDebugMode } from "@/lib/venueScreenTiming";

export function applyVenueScreenDebugMode(
  state: VenueScreenState,
  mode: VenueScreenDebugMode | null,
  nowMs: number = Date.now(),
): VenueScreenState {
  if (!mode || state.mode === mode) return state;

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

  if (mode === "live-trivia-pregame") {
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
        startsAt: new Date(nowMs + 14 * 60_000 + 59_000).toISOString(),
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

  return {
    ok: true,
    mode: "idle",
    venue: state.venue,
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      nextLiveTrivia: {
        startsAt: new Date(nowMs + 45 * 60_000).toISOString(),
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
