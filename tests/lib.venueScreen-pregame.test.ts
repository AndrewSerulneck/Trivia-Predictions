import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/categoryBlitz", () => ({
  driveVenueCategoryBlitz: vi.fn(),
  getRoundResults: vi.fn(),
  peekCategoryBlitz: vi.fn(),
}));
vi.mock("@/lib/liveShowdownEngine", () => ({ getLiveShowdownState: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/venues", () => ({ getVenueById: vi.fn() }));

import {
  getLiveTriviaPregame,
  selectVenueScreenState,
  type VenueScreenSelectionInput,
  type VenueScreenState,
} from "@/lib/venueScreen";
import { applyVenueScreenDebugMode } from "@/lib/venueScreenDebug";
import {
  getVenueScreenPollIntervalMs,
  isGoLiveTransition,
  LIVE_TRIVIA_PREGAME_LEAD_MS,
  parseVenueScreenDebugMode,
} from "@/lib/venueScreenTiming";
import type { CategoryBlitzRound, CategoryBlitzSession } from "@/types";

// Live Trivia at 8:00 PM New York = 2026-07-03T00:00:00Z.
const START_ISO = "2026-07-03T00:00:00.000Z";
const startMs = Date.parse(START_ISO);
const venue = {
  id: "venue-1",
  name: "Hightop Pub",
  displayName: null,
  screenBrandImageUrl: null,
  screenBrandPrimary: null,
  screenBrandSecondary: null,
};

type NextSchedule = Record<string, unknown> | null;
const nextSchedule = (overrides: Record<string, unknown> = {}): NextSchedule => ({
  id: "sched-1",
  title: "Thursday Live Trivia",
  timezone: "America/New_York",
  startTime: START_ISO,
  occurrenceDate: "2026-07-02",
  numRounds: 4,
  intermissionAdDelaySeconds: 10,
  lobbyAdEnabled: true,
  firstRoundCategory: "History",
  recurringType: "weekly",
  recurringDays: ["thu"],
  ...overrides,
});

const inactiveLive = (schedule: NextSchedule = nextSchedule()): VenueScreenSelectionInput["liveTrivia"] =>
  ({
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
    nextSchedule: schedule,
  }) as VenueScreenSelectionInput["liveTrivia"];

const activeLive = (overrides: Record<string, unknown> = {}): VenueScreenSelectionInput["liveTrivia"] =>
  ({
    isGameActive: true,
    scheduleId: "sched-1",
    occurrenceDate: "2026-07-02",
    venueName: null,
    totalRounds: 4,
    currentRound: 1,
    activePhase: "answering",
    secondsRemaining: 30,
    activeQuestion: null,
    revealedAnswer: null,
    isFinalResultsWindow: false,
    currentRoundCategory: "History",
    leaderboard: null,
    ...overrides,
  }) as VenueScreenSelectionInput["liveTrivia"];

const session: CategoryBlitzSession = {
  id: "cb-session",
  venueId: "venue-1",
  status: "active",
  source: "auto",
  sessionType: "continuous",
  scheduledEndAt: null,
  startsAt: null,
  testMode: false,
  createdAt: "2026-07-02T23:40:00.000Z",
  completedAt: null,
} as CategoryBlitzSession;
const round = (endsAt: string): CategoryBlitzRound => ({
  id: "cb-round",
  sessionId: "cb-session",
  venueId: "venue-1",
  letter: "M",
  categorySetIndex: 1,
  categories: ["Movies"],
  startedAt: "2026-07-02T23:40:00.000Z",
  endsAt,
  status: "active",
  createdAt: "2026-07-02T23:40:00.000Z",
  scoredAt: null,
  mode: "standard",
});
const noBlitz = { session: null, round: null, leaderboard: null, nextRoundStartsAt: null };
const awakeBlitz = (nowMs: number) => ({
  session,
  round: round(new Date(nowMs + 45_000).toISOString()),
  leaderboard: null,
  nextRoundStartsAt: null,
});

const select = (nowMs: number, liveTrivia = inactiveLive(), categoryBlitz: VenueScreenSelectionInput["categoryBlitz"] = noBlitz) =>
  selectVenueScreenState({ venue, liveTrivia, categoryBlitz, updatedAt: nowMs });

describe("Live Trivia pre-game window", () => {
  it("is 15 minutes", () => {
    expect(LIVE_TRIVIA_PREGAME_LEAD_MS).toBe(15 * 60_000);
  });

  it("opens exactly 15:00 before the start, not a millisecond earlier", () => {
    expect(select(startMs - LIVE_TRIVIA_PREGAME_LEAD_MS - 1).mode).toBe("idle");
    const state = select(startMs - LIVE_TRIVIA_PREGAME_LEAD_MS);
    expect(state.mode).toBe("live-trivia-pregame");
    expect(state.mode === "live-trivia-pregame" && state.pregame).toEqual({
      gameId: "sched-1:2026-07-02",
      title: "Thursday Live Trivia",
      startsAt: START_ISO,
      firstRoundCategory: "History",
    });
  });

  it("holds through 0:01 and ends at the start time", () => {
    expect(select(startMs - 1_000).mode).toBe("live-trivia-pregame");
    expect(select(startMs).mode).toBe("idle");
  });

  it("gives way to the live game, including final standings", () => {
    expect(select(startMs - 60_000, activeLive()).mode).toBe("live-trivia");
    expect(select(startMs - 60_000, activeLive({ isFinalResultsWindow: true })).mode).toBe("live-trivia");
    expect(getLiveTriviaPregame(activeLive(), startMs - 60_000)).toBeNull();
  });

  it("carries no category when the host hasn't set Round 1", () => {
    const state = select(startMs - 60_000, inactiveLive(nextSchedule({ firstRoundCategory: "  " })));
    expect(state.mode === "live-trivia-pregame" && state.pregame.firstRoundCategory).toBeNull();
  });

  it("ignores a missing or unparseable schedule", () => {
    expect(select(startMs - 60_000, inactiveLive(null)).mode).toBe("idle");
    expect(select(startMs - 60_000, inactiveLive(nextSchedule({ startTime: "nope" }))).mode).toBe("idle");
  });
});

describe("display precedence", () => {
  it("pre-game beats a Category Blitz round someone started (their phone game is unaffected)", () => {
    const now = startMs - 5 * 60_000;
    const state = select(now, inactiveLive(), awakeBlitz(now));
    expect(state.mode).toBe("live-trivia-pregame");
    expect(state.categoryBlitz).toBeNull();
  });

  it("shows Category Blitz while someone plays and no Live Trivia is near", () => {
    const now = startMs - LIVE_TRIVIA_PREGAME_LEAD_MS - 60_000;
    expect(select(now, inactiveLive(), awakeBlitz(now)).mode).toBe("category-blitz");
    expect(select(now, inactiveLive(null), awakeBlitz(now)).mode).toBe("category-blitz");
  });

  it("pre-game beats Squares and March Madness", () => {
    const now = startMs - 60_000;
    const state = selectVenueScreenState({
      venue,
      liveTrivia: inactiveLive(),
      categoryBlitz: noBlitz,
      squares: { phase: "live" } as unknown as VenueScreenSelectionInput["squares"],
      bracket: { key: "x" } as unknown as VenueScreenSelectionInput["bracket"],
      updatedAt: now,
    });
    expect(state.mode).toBe("live-trivia-pregame");
  });

  it("never offers Category Blitz on the idle screen", () => {
    const state = select(startMs - 2 * 60 * 60_000);
    expect(state.mode).toBe("idle");
    expect(Object.keys(state.idle ?? {})).toEqual(["nextLiveTrivia", "sponsorSlots"]);
  });
});

describe("go-live takeover", () => {
  it("fires on pre-game → live and idle → live", () => {
    expect(isGoLiveTransition("live-trivia-pregame", "live-trivia")).toBe(true);
    expect(isGoLiveTransition("idle", "live-trivia")).toBe(true);
    expect(isGoLiveTransition("idle", "category-blitz")).toBe(true);
  });

  it("never fires on idle → pre-game, a repeat poll, or leaving a game", () => {
    expect(isGoLiveTransition("idle", "live-trivia-pregame")).toBe(false);
    expect(isGoLiveTransition("live-trivia-pregame", "live-trivia-pregame")).toBe(false);
    expect(isGoLiveTransition("live-trivia", "live-trivia")).toBe(false);
    expect(isGoLiveTransition("live-trivia", "idle")).toBe(false);
  });

  it("is the client's only takeover trigger and seeds from the first render (no fire on reload)", () => {
    const client = readFileSync("components/venue-screen/VenueScreenClient.tsx", "utf8");
    expect(client).toContain("const flippedLive = isGoLiveTransition(previousMode, json.mode);");
    expect(client).toContain("let previousMode: VenueScreenState[\"mode\"] = initialState.mode;");
    expect(client).not.toMatch(/previousMode === "idle"/);
  });
});

describe("poll pace", () => {
  const pregameAt = (nowMs: number) => select(nowMs) as VenueScreenState;

  it("polls every 10 s in pre-game and every 2 s in the last minute", () => {
    expect(getVenueScreenPollIntervalMs(pregameAt(startMs - 10 * 60_000))).toBe(10_000);
    expect(getVenueScreenPollIntervalMs(pregameAt(startMs - 60_001))).toBe(10_000);
    expect(getVenueScreenPollIntervalMs(pregameAt(startMs - 60_000))).toBe(2_000);
    expect(getVenueScreenPollIntervalMs(pregameAt(startMs - 1_000))).toBe(2_000);
  });

  it("idle wakes exactly when the pre-game window opens", () => {
    const opensAt = startMs - LIVE_TRIVIA_PREGAME_LEAD_MS;
    expect(getVenueScreenPollIntervalMs(select(opensAt - 7_000))).toBe(7_000);
    expect(getVenueScreenPollIntervalMs(select(opensAt - 300))).toBe(1_000);
    expect(getVenueScreenPollIntervalMs(select(opensAt - 60_000))).toBe(20_000);
    expect(getVenueScreenPollIntervalMs(select(opensAt - 60_000, inactiveLive(null)))).toBe(20_000);
  });
});

describe("debug mode", () => {
  it("renders a pre-game state", () => {
    expect(parseVenueScreenDebugMode("live-trivia-pregame")).toBe("live-trivia-pregame");
    const state = applyVenueScreenDebugMode(select(startMs - 3 * 60 * 60_000), "live-trivia-pregame", startMs);
    expect(state.mode).toBe("live-trivia-pregame");
    expect(state.mode === "live-trivia-pregame" && state.pregame.firstRoundCategory).toBe("History");
  });
});
