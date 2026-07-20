import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/categoryBlitz", () => ({
  driveVenueCategoryBlitz: vi.fn(),
  getRoundResults: vi.fn(),
}));
vi.mock("@/lib/categoryBlitzSchedules", () => ({
  getNextScheduleOccurrence: vi.fn(),
  listSchedules: vi.fn(),
}));
vi.mock("@/lib/liveShowdownEngine", () => ({
  getLiveShowdownState: vi.fn(),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: null,
}));
vi.mock("@/lib/venues", () => ({
  getVenueById: vi.fn(),
}));

import {
  mapVenueScreenSponsorRows,
  selectVenueScreenState,
  type VenueScreenSelectionInput,
} from "@/lib/venueScreen";
import type { CategoryBlitzRound, CategoryBlitzSession } from "@/types";

const updatedAt = Date.parse("2026-07-02T20:00:00.000Z");
const venue = {
  id: "venue-1",
  name: "Hightop Pub",
  displayName: "Hightop Pub TV",
  screenBrandImageUrl: "https://cdn.example.com/venue.png",
  screenBrandPrimary: "#14b8a6",
  screenBrandSecondary: "#f59e0b",
};

function makeInactiveLive(overrides: Record<string, unknown> = {}): VenueScreenSelectionInput["liveTrivia"] {
  return {
    isGameActive: false,
    activePhase: "mid_game_break",
    secondsRemaining: 0,
    totalRounds: 0,
    currentRound: null,
    currentQuestionIndex: null,
    activeQuestion: null,
    revealedAnswer: null,
    emceeAnnouncement: null,
    viewerResult: null,
    nextSchedule: null,
    ...overrides,
  } as VenueScreenSelectionInput["liveTrivia"];
}

function makeLiveQuestion(overrides: Record<string, unknown> = {}): VenueScreenSelectionInput["liveTrivia"] {
  return {
    isGameActive: true,
    scheduleId: "schedule-1",
    scheduleTitle: "Thursday Trivia",
    scheduleTimezone: "America/New_York",
    scheduleStartTime: "2026-07-02T20:00:00.000Z",
    occurrenceDate: "2026-07-02",
    intermissionAdDelaySeconds: 10,
    lobbyAdEnabled: true,
    venueName: "Live Venue Name",
    totalRounds: 4,
    currentRound: 2,
    currentQuestionIndex: 7,
    activePhase: "answering",
    secondsRemaining: 42,
    activeQuestion: {
      id: "question-1",
      questionId: "slug-1",
      question: "Which city hosted the 1996 Summer Olympics?",
      options: ["Atlanta", "Sydney"],
      category: "Sports",
      difficulty: null,
      roundNumber: 2,
      questionIndex: 7,
      isClosestGuess: false,
      imageUrl: null,
    },
    revealedAnswer: null,
    emceeAnnouncement: null,
    viewerResult: null,
    isFinalResultsWindow: false,
    currentRoundCategory: "Sports",
    upcomingRoundNumber: null,
    upcomingRoundCategory: null,
    leaderboard: null,
    viewerRank: null,
    viewerRoundByRound: null,
    ...overrides,
  } as VenueScreenSelectionInput["liveTrivia"];
}

function makeCategorySession(overrides: Partial<CategoryBlitzSession> = {}): CategoryBlitzSession {
  return {
    id: "session-1",
    venueId: "venue-1",
    status: "active",
    source: "auto",
    sessionType: "scheduled",
    scheduledEndAt: "2026-07-02T21:00:00.000Z",
    startsAt: null,
    testMode: false,
    createdAt: "2026-07-02T19:55:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function makeCategoryRound(overrides: Partial<CategoryBlitzRound> = {}): CategoryBlitzRound {
  return {
    id: "round-1",
    sessionId: "session-1",
    venueId: "venue-1",
    letter: "M",
    categorySetIndex: 1,
    categories: ["Movies", "Music", "Mountains"],
    startedAt: "2026-07-02T19:58:00.000Z",
    endsAt: "2026-07-02T20:01:00.000Z",
    status: "active",
    createdAt: "2026-07-02T19:58:00.000Z",
    scoredAt: null,
    mode: "standard",
    ...overrides,
  };
}

describe("selectVenueScreenState", () => {
  it("normalizes an active Live Trivia question without answer options", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion(),
      categoryBlitz: { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null },
      updatedAt,
    });

    expect(state.mode).toBe("live-trivia");
    expect(state.venue.name).toBe("Live Venue Name");
    expect(state.liveTrivia?.phase).toBe("question");
    expect(state.liveTrivia?.category).toBe("Sports");
    expect(state.liveTrivia?.question).toBe("Which city hosted the 1996 Summer Olympics?");
    expect(state.liveTrivia?.correctAnswer).toBeNull();
    expect(state.liveTrivia?.revealEndsAt).toBeNull();
    expect(state.liveTrivia?.gameId).toBe("schedule-1:2026-07-02");
    expect(JSON.stringify(state)).not.toContain("Atlanta");
  });

  it("derives a per-game gameId that differs across occurrences with the same round/champion", () => {
    // Two back-to-back final windows: identical roundNumber (the collision-prone
    // key), but different occurrenceDate. The gameId must differ so the TV
    // replays the final-standings celebration instead of deduping the second.
    const base = {
      activePhase: "mid_game_break" as const,
      isFinalResultsWindow: true,
      currentRound: 4,
      leaderboard: [{ rank: 1, userId: "u1", username: "casey", roundPoints: {}, totalPoints: 100, pointsThisRound: 0 }],
    };
    const first = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion({ ...base, occurrenceDate: "2026-07-02" }),
      categoryBlitz: { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null },
      updatedAt,
    });
    const second = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion({ ...base, occurrenceDate: "2026-07-09" }),
      categoryBlitz: { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null },
      updatedAt,
    });

    expect(first.liveTrivia?.phase).toBe("final");
    expect(second.liveTrivia?.phase).toBe("final");
    expect(first.liveTrivia?.roundNumber).toBe(second.liveTrivia?.roundNumber);
    expect(first.liveTrivia?.gameId).not.toBe(second.liveTrivia?.gameId);
    expect(first.liveTrivia?.gameId).toBe("schedule-1:2026-07-02");
    expect(second.liveTrivia?.gameId).toBe("schedule-1:2026-07-09");
  });

  it("surfaces the correct answer and a reveal deadline during the reveal beat", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion({
        activePhase: "rest_warning",
        secondsRemaining: 12,
        revealedAnswer: "Atlanta",
      }),
      categoryBlitz: { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null },
      updatedAt,
    });

    expect(state.mode).toBe("live-trivia");
    expect(state.liveTrivia?.phase).toBe("reveal");
    expect(state.liveTrivia?.correctAnswer).toBe("Atlanta");
    // revealEndsAt = updatedAt (20:00:00) + secondsRemaining (12s).
    expect(state.liveTrivia?.revealEndsAt).toBe("2026-07-02T20:00:12.000Z");
  });

  it("never leaks the answer on a question payload even if the engine set revealedAnswer", () => {
    // Defense in depth: the engine already withholds revealedAnswer while
    // answering, but selectVenueScreenState must ALSO drop it for any non-reveal
    // phase so a devtools-open venue TV can't read the answer early.
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion({
        activePhase: "answering",
        revealedAnswer: "LEAKED_ANSWER",
      }),
      categoryBlitz: { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null },
      updatedAt,
    });

    expect(state.liveTrivia?.phase).toBe("question");
    expect(state.liveTrivia?.correctAnswer).toBeNull();
    expect(JSON.stringify(state)).not.toContain("LEAKED_ANSWER");
  });

  it("prioritizes Live Trivia when Category Blitz overlaps", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeLiveQuestion(),
      categoryBlitz: {
        session: makeCategorySession(),
        round: makeCategoryRound(),
        leaderboard: [{ rank: 1, username: "casey", points: 12 }],
        nextStartsAt: null,
        nextRoundStartsAt: null,
      },
      updatedAt,
    });

    expect(state.mode).toBe("live-trivia");
    expect(state.categoryBlitz).toBeNull();
  });

  it("normalizes an active Category Blitz round when Live Trivia is inactive", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeInactiveLive(),
      categoryBlitz: {
        session: makeCategorySession(),
        round: makeCategoryRound(),
        leaderboard: null,
        nextStartsAt: null,
        nextRoundStartsAt: null,
      },
      updatedAt,
    });

    expect(state.mode).toBe("category-blitz");
    expect(state.categoryBlitz?.phase).toBe("round");
    expect(state.categoryBlitz?.letter).toBe("M");
    expect(state.categoryBlitz?.categories).toEqual(["Movies", "Music", "Mountains"]);
    expect(state.categoryBlitz?.secondsRemaining).toBe(60);
  });

  it("maps a completed Category Blitz round to results mode", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeInactiveLive(),
      categoryBlitz: {
        session: makeCategorySession({ status: "scoring" }),
        round: makeCategoryRound({
          status: "complete",
          endsAt: "2026-07-02T19:59:00.000Z",
        }),
        leaderboard: [{ rank: 1, username: "casey", points: 32 }],
        nextStartsAt: null,
        // Next round three minutes out; the results countdown should reflect it
        // rather than the old hardcoded 0.
        nextRoundStartsAt: "2026-07-02T20:03:00.000Z",
      },
      updatedAt,
    });

    expect(state.mode).toBe("category-blitz");
    expect(state.categoryBlitz?.phase).toBe("results");
    expect(state.categoryBlitz?.leaderboard).toEqual([{ rank: 1, username: "casey", points: 32 }]);
    expect(state.categoryBlitz?.secondsRemaining).toBe(180);
  });

  it("maps a non-active incomplete Category Blitz round to intermission mode", () => {
    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeInactiveLive(),
      categoryBlitz: {
        session: makeCategorySession({ status: "active" }),
        round: makeCategoryRound({
          status: "scoring",
          letter: "R",
          categories: ["Rivers"],
          endsAt: "2026-07-02T19:59:00.000Z",
        }),
        leaderboard: null,
        nextStartsAt: null,
        // Next round two minutes out; intermission countdown reflects it.
        nextRoundStartsAt: "2026-07-02T20:02:00.000Z",
      },
      updatedAt,
    });

    expect(state.mode).toBe("category-blitz");
    expect(state.categoryBlitz?.phase).toBe("intermission");
    expect(state.categoryBlitz?.letter).toBe("R");
    expect(state.categoryBlitz?.categories).toEqual(["Rivers"]);
    expect(state.categoryBlitz?.secondsRemaining).toBe(120);
  });

  it("falls back to idle with upcoming schedule data when no game is active", () => {
    const sponsorSlots = [
      {
        title: "High Noon",
        imageUrl: "https://cdn.example.com/high-noon.png",
        linkUrl: "https://example.com/high-noon",
      },
    ];

    const state = selectVenueScreenState({
      venue,
      liveTrivia: makeInactiveLive({
        nextSchedule: {
          id: "live-next",
          title: "Friday Live Trivia",
          timezone: "America/New_York",
          startTime: "2026-07-03T00:00:00.000Z",
          numRounds: 4,
          intermissionAdDelaySeconds: 10,
          lobbyAdEnabled: true,
          firstRoundCategory: "History",
          recurringType: "weekly",
          recurringDays: ["fri"],
        },
      }),
      categoryBlitz: {
        session: null,
        round: null,
        leaderboard: null,
        nextStartsAt: "2026-07-03T01:00:00.000Z",
        nextRecurringDays: ["thu", "sat"],
        nextRoundStartsAt: null,
      },
      idle: { sponsorSlots },
      updatedAt,
    });

    expect(state.mode).toBe("idle");
    expect(state.venue.screenBrandImageUrl).toBe("https://cdn.example.com/venue.png");
    expect(state.venue.screenBrandPrimary).toBe("#14b8a6");
    expect(state.venue.screenBrandSecondary).toBe("#f59e0b");
    expect(state.idle?.nextLiveTrivia).toEqual({
      startsAt: "2026-07-03T00:00:00.000Z",
      title: "Friday Live Trivia",
      firstRoundCategory: "History",
      recurringDays: ["fri"],
    });
    expect(state.idle?.nextCategoryBlitz).toEqual({
      startsAt: "2026-07-03T01:00:00.000Z",
      recurringDays: ["thu", "sat"],
    });
    expect(state.idle?.sponsorSlots).toEqual(sponsorSlots);
  });

  it("maps active sponsor rows and filters sponsors outside their date window", () => {
    const sponsors = mapVenueScreenSponsorRows(
      [
        {
          title: "Future Sponsor",
          image_url: "https://cdn.example.com/future.png",
          link_url: null,
          display_order: 1,
          starts_at: "2026-07-03T20:00:00.000Z",
          ends_at: null,
        },
        {
          title: "Current Sponsor",
          image_url: "https://cdn.example.com/current.png",
          link_url: "https://example.com/current",
          display_order: 2,
          starts_at: "2026-07-02T19:00:00.000Z",
          ends_at: "2026-07-02T21:00:00.000Z",
        },
        {
          title: "Missing Creative",
          image_url: "",
          link_url: null,
          display_order: 3,
          starts_at: null,
          ends_at: null,
        },
      ],
      updatedAt,
    );

    expect(sponsors).toEqual([
      {
        title: "Current Sponsor",
        imageUrl: "https://cdn.example.com/current.png",
        linkUrl: "https://example.com/current",
      },
    ]);
  });
});
