import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import type { LiveTriviaGameRef } from "@/lib/liveTriviaWeekTotals";
import type { WeekPlayerTotal } from "@/lib/rankedPlaceRewards";
import type { ChallengeCampaign } from "@/types";

// The Rewards card's data for a weekly places reward (docs/live-trivia-weekly-places-reward-plan.md
// §5e/§6, Phase 4). Week planning runs on the REAL computeCycleStart / enumerateScheduleOccurrences /
// rankWeekPlaces (so the card's rank is the resolver's rank); only the database edges are faked: the
// schedules, the settlement + winners reads and the week-totals RPC.

type SettlementRow = {
  challengeId: string;
  cycleStart: string;
  venueId: string;
  outcome: "awarded" | "no_scorers" | "below_minimum";
  participantCount: number;
  winnerCount: number;
  minPlayers: number | null;
  settledAt: string;
};

const store = vi.hoisted(() => ({
  schedules: [] as TriviaScheduleRow[],
  settlements: [] as SettlementRow[],
  winners: [] as Array<{ place: number; winnerUserId: string | null; username: string | null }>,
  totals: [] as WeekPlayerTotal[],
  failTotals: false,
}));

const listChallengeCycleSettlements = vi.hoisted(() =>
  vi.fn(async (params: { challengeIds: readonly string[]; cycleStartFrom: Date }) =>
    store.settlements.filter(
      (r) => params.challengeIds.includes(r.challengeId) && Date.parse(r.cycleStart) >= params.cycleStartFrom.getTime(),
    ),
  ),
);
const listRankedCycleWinners = vi.hoisted(() => vi.fn(async () => store.winners));
const loadLiveTriviaWeekTotals = vi.hoisted(() =>
  vi.fn(async (_games: readonly LiveTriviaGameRef[]) => {
    if (store.failTotals) throw new Error("totals RPC failed");
    return store.totals;
  }),
);
const loadLiveTriviaSchedulesForVenues = vi.hoisted(() =>
  vi.fn(async (venueIds: readonly string[]) =>
    store.schedules.filter((row) => venueIds.includes(String(row.venue_id))),
  ),
);

vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return { ...actual, listChallengeCycleSettlements, listRankedCycleWinners };
});
vi.mock("@/lib/liveShowdownEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/liveShowdownEngine")>();
  return { ...actual, loadLiveTriviaSchedulesForVenues };
});
vi.mock("@/lib/liveTriviaWeekTotals", () => ({ loadLiveTriviaWeekTotals }));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));

import {
  attachRankedPlaceCards,
  clearRankedPlaceBoardCache,
  LIVE_BOARD_TTL_MS,
  SETTLED_BOARD_TTL_MS,
} from "@/lib/rankedPlaceCardData";
import type { RankedPlaceCardState } from "@/lib/rankedPlaceCard";

const TZ = "America/New_York";

// Garden State Bar's shape: Wed/Thu/Fri at 7pm EDT (23:00Z), 2 rounds = 55 minutes.
const makeSchedule = (): TriviaScheduleRow => ({
  id: "sched-1",
  title: "Weekday Trivia",
  start_time: "2026-08-05T23:00:00.000Z",
  timezone: TZ,
  recurring_type: "weekly",
  recurring_days: ["wed", "thu", "fri"],
  num_rounds: 2,
  venue_id: "venue-1",
  intermission_ad_delay_seconds: null,
  lobby_ad_enabled: null,
});

const makeCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "camp-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    name: "Weekly Trivia Champions",
    rules: "",
    venueIds: ["venue-1"],
    activeDays: ["wed", "thu", "fri"],
    recurringType: "weekly",
    winCondition: "ranked_places",
    winnerQuota: 3,
    winnerUserId: null,
    gameWinnerSlots: null,
    minPlayers: null,
    placePrizes: [1, 2, 3].map((place) => ({ place, prizeKind: "gift_card" as const, prizeGiftCertificateAmount: 40 - place * 10 })),
    rewardDefinitionId: "live_trivia_challenge",
    isActive: true,
    ...overrides,
  }) as ChallengeCampaign;

// The week of Wed 2026-10-07: games Wed 10-07, Thu 10-08, Fri 10-09, each 23:00Z-23:55Z.
const WEEK_KEY = "2026-10-07T04:00:00.000Z";
const THU_NOON = Date.parse("2026-10-08T16:00:00.000Z"); // Wed's game is over, Thu's hasn't started
const AFTER_FRIDAY = Date.parse("2026-10-10T00:05:00.000Z");
const NEXT_WEEK_WED_MORNING = Date.parse("2026-10-14T08:00:00.000Z");

const total = (userId: string, totalPoints: number, reachedAt: string | null): WeekPlayerTotal => ({ userId, totalPoints, reachedAt });

const cardFor = async (
  campaign: ChallengeCampaign,
  viewer: string | null,
  nowMs: number,
): Promise<RankedPlaceCardState | undefined> => {
  const [attached] = await attachRankedPlaceCards([campaign], "venue-1", viewer, nowMs);
  return (attached as { rankedPlaces?: RankedPlaceCardState }).rankedPlaces;
};

beforeEach(() => {
  clearRankedPlaceBoardCache();
  store.schedules = [makeSchedule()];
  store.settlements = [];
  store.winners = [];
  store.totals = [
    total("u-snooker", 200, "2026-10-07T23:40:00.000Z"),
    total("u-kuch", 140, "2026-10-07T23:30:00.000Z"),
    total("u-fast", 50, "2026-10-07T23:10:00.000Z"),
    total("u-zero", 0, null),
  ];
  store.failTotals = false;
  listChallengeCycleSettlements.mockClear();
  listRankedCycleWinners.mockClear();
  loadLiveTriviaWeekTotals.mockClear();
  loadLiveTriviaSchedulesForVenues.mockClear();
});

describe("live week", () => {
  it("gives the viewer their own rank and points, the games left and the last game's day", async () => {
    const state = await cardFor(makeCampaign(), "u-kuch", THU_NOON);
    expect(state).toMatchObject({
      weekStart: WEEK_KEY,
      phase: "live",
      placeCount: 3,
      minPlayers: null,
      participantCount: 4, // the 0-point player took part
      gamesLeft: 2,
      lastGameDay: "Friday",
      viewer: { rank: 2, points: 140 },
      outcome: null,
      winners: [],
      viewerPlace: null,
    });
  });

  it("a viewer with no points has no rank; a signed-out viewer has no viewer block", async () => {
    expect((await cardFor(makeCampaign(), "u-zero", THU_NOON))?.viewer).toEqual({ rank: null, points: 0 });
    expect((await cardFor(makeCampaign(), "u-unknown", THU_NOON))?.viewer).toEqual({ rank: null, points: 0 });
    expect((await cardFor(makeCampaign(), null, THU_NOON))?.viewer).toBeNull();
  });

  it("reads only the games that have started", async () => {
    await cardFor(makeCampaign(), "u-kuch", THU_NOON);
    const games = loadLiveTriviaWeekTotals.mock.calls[0][0];
    expect(games.map((g) => g.occurrenceDate)).toEqual(["2026-10-07"]);
  });

  it("does not read scores at all before the week's first game", async () => {
    const beforeWed = Date.parse("2026-10-07T12:00:00.000Z");
    const state = await cardFor(makeCampaign(), "u-kuch", beforeWed);
    expect(loadLiveTriviaWeekTotals).not.toHaveBeenCalled();
    expect(state).toMatchObject({ phase: "live", participantCount: 0, gamesLeft: 3, viewer: { rank: null, points: 0 } });
  });

  it("ranks ties by who reached the total first, exactly as the resolver does", async () => {
    store.totals = [
      total("u-late", 100, "2026-10-07T23:50:00.000Z"),
      total("u-early", 100, "2026-10-07T23:20:00.000Z"),
    ];
    expect((await cardFor(makeCampaign(), "u-early", THU_NOON))?.viewer).toEqual({ rank: 1, points: 100 });
    expect((await cardFor(makeCampaign(), "u-late", THU_NOON))?.viewer).toEqual({ rank: 2, points: 100 });
  });

  it("after the last game but before the resolver settles: no games left", async () => {
    const state = await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY);
    expect(state).toMatchObject({ phase: "live", gamesLeft: 0 });
  });

  it("never puts a player id in the state", async () => {
    const state = await cardFor(makeCampaign(), "u-kuch", THU_NOON);
    expect(JSON.stringify(state)).not.toMatch(/u-snooker|u-kuch|u-fast|u-zero/);
  });
});

describe("settled week", () => {
  const settle = (outcome: SettlementRow["outcome"], participantCount: number, minPlayers: number | null = null) => {
    store.settlements = [
      { challengeId: "camp-1", cycleStart: WEEK_KEY, venueId: "venue-1", outcome, participantCount, winnerCount: 2, minPlayers, settledAt: "2026-10-10T00:00:00Z" },
    ];
  };

  it("awarded: names the winners by place and tells a winner their own place", async () => {
    settle("awarded", 4);
    store.winners = [
      { place: 1, winnerUserId: "u-snooker", username: "Snooker" },
      { place: 2, winnerUserId: "u-kuch", username: "Kuch" },
    ];
    const asKuch = await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY);
    expect(asKuch).toMatchObject({
      phase: "settled",
      outcome: "awarded",
      winners: [{ place: 1, username: "Snooker" }, { place: 2, username: "Kuch" }],
      viewerPlace: 2,
    });
    expect((await cardFor(makeCampaign(), "u-fast", AFTER_FRIDAY))?.viewerPlace).toBeNull();
    expect(JSON.stringify(asKuch)).not.toMatch(/u-snooker|u-kuch/);
    expect(loadLiveTriviaWeekTotals).not.toHaveBeenCalled(); // settled weeks never re-read scores
  });

  it("records a week nobody scored and a week below the minimum, with the minimum in force then", async () => {
    settle("no_scorers", 2);
    expect(await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY)).toMatchObject({ phase: "settled", outcome: "no_scorers", winners: [] });
    expect(listRankedCycleWinners).not.toHaveBeenCalled();

    clearRankedPlaceBoardCache();
    settle("below_minimum", 3, 4);
    expect(await cardFor(makeCampaign({ minPlayers: 5 }), "u-kuch", AFTER_FRIDAY)).toMatchObject({
      phase: "settled",
      outcome: "below_minimum",
      participantCount: 3,
      settledMinPlayers: 4,
      minPlayers: 5,
    });
  });

  it("matches a settlement whose key is a few hours off (the resolver's timezone-fallback tolerance)", async () => {
    store.settlements = [
      { challengeId: "camp-1", cycleStart: "2026-10-07T01:00:00.000Z", venueId: "venue-1", outcome: "no_scorers", participantCount: 0, winnerCount: 0, minPlayers: null, settledAt: "x" },
    ];
    expect((await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY))?.phase).toBe("settled");
  });
});

describe("other states", () => {
  it("not_live: a reward created after the week's last game ended starts next week (D8)", async () => {
    const campaign = makeCampaign({ createdAt: "2026-10-10T12:00:00.000Z" });
    expect(await cardFor(campaign, "u-kuch", Date.parse("2026-10-10T13:00:00.000Z"))).toMatchObject({ phase: "not_live" });
    expect(loadLiveTriviaWeekTotals).not.toHaveBeenCalled();
  });

  it("a reward created mid-week counts that week (D8)", async () => {
    const campaign = makeCampaign({ createdAt: "2026-10-08T12:00:00.000Z" });
    expect((await cardFor(campaign, "u-kuch", THU_NOON))?.phase).toBe("live");
  });

  it("no_games: the venue has no Live Trivia this week", async () => {
    store.schedules = [];
    expect((await cardFor(makeCampaign(), "u-kuch", THU_NOON))?.phase).toBe("no_games");
  });
});

describe("cost: the board is cached per reward", () => {
  it("shares one build between players and between polls inside the live window", async () => {
    await cardFor(makeCampaign(), "u-kuch", THU_NOON);
    await cardFor(makeCampaign(), "u-fast", THU_NOON + 30_000);
    await cardFor(makeCampaign(), null, THU_NOON + LIVE_BOARD_TTL_MS - 1);
    expect(loadLiveTriviaWeekTotals).toHaveBeenCalledTimes(1);
    expect(listChallengeCycleSettlements).toHaveBeenCalledTimes(1);
    expect(loadLiveTriviaSchedulesForVenues).toHaveBeenCalledTimes(1);

    await cardFor(makeCampaign(), "u-kuch", THU_NOON + LIVE_BOARD_TTL_MS + 1);
    expect(loadLiveTriviaWeekTotals).toHaveBeenCalledTimes(2);
  });

  it("concurrent requests share one in-flight build", async () => {
    await Promise.all([
      cardFor(makeCampaign(), "u-kuch", THU_NOON),
      cardFor(makeCampaign(), "u-fast", THU_NOON),
      cardFor(makeCampaign(), null, THU_NOON),
    ]);
    expect(loadLiveTriviaWeekTotals).toHaveBeenCalledTimes(1);
  });

  it("keeps a settled week much longer, because it can never change", async () => {
    store.settlements = [
      { challengeId: "camp-1", cycleStart: WEEK_KEY, venueId: "venue-1", outcome: "no_scorers", participantCount: 0, winnerCount: 0, minPlayers: null, settledAt: "x" },
    ];
    await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY);
    await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY + SETTLED_BOARD_TTL_MS - 1);
    expect(listChallengeCycleSettlements).toHaveBeenCalledTimes(1);
    await cardFor(makeCampaign(), "u-kuch", AFTER_FRIDAY + SETTLED_BOARD_TTL_MS + 1);
    expect(listChallengeCycleSettlements).toHaveBeenCalledTimes(2);
  });

  it("never serves last week's settled board into the new week", async () => {
    store.settlements = [
      { challengeId: "camp-1", cycleStart: WEEK_KEY, venueId: "venue-1", outcome: "no_scorers", participantCount: 0, winnerCount: 0, minPlayers: null, settledAt: "x" },
    ];
    await cardFor(makeCampaign(), "u-kuch", Date.parse("2026-10-13T20:00:00.000Z")); // Tue evening, still the Oct 7 week
    const next = await cardFor(makeCampaign(), "u-kuch", NEXT_WEEK_WED_MORNING);
    expect(next).toMatchObject({ weekStart: "2026-10-14T04:00:00.000Z", phase: "live", participantCount: 0 });
  });
});

describe("failure and scope", () => {
  it("a failed read leaves the card without rankedPlaces (the panel falls back to the description) and retries next time", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.failTotals = true;
    expect(await cardFor(makeCampaign(), "u-kuch", THU_NOON)).toBeUndefined();
    expect(errors).toHaveBeenCalledWith("[RankedCard] state-failed", expect.objectContaining({ campaignId: "camp-1" }));

    store.failTotals = false;
    expect((await cardFor(makeCampaign(), "u-kuch", THU_NOON + 1_000))?.phase).toBe("live");
    errors.mockRestore();
  });

  it("touches nothing else: other rewards, other venues, ended and misconfigured ranked rewards", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const campaigns = [
      makeCampaign({ id: "points", winCondition: "points_threshold" }),
      makeCampaign({ id: "other-venue", venueIds: ["venue-2"] }),
      makeCampaign({ id: "ended", isActive: false }),
      makeCampaign({ id: "broken", recurringType: "none" }),
    ];
    const attached = await attachRankedPlaceCards(campaigns, "venue-1", "u-kuch", THU_NOON);
    expect(attached.every((c) => !("rankedPlaces" in c))).toBe(true);
    expect(loadLiveTriviaSchedulesForVenues).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("a venue with no ranked reward costs no reads", async () => {
    await attachRankedPlaceCards([makeCampaign({ id: "points", winCondition: "points_threshold" })], "venue-1", "u-kuch", THU_NOON);
    expect(loadLiveTriviaSchedulesForVenues).not.toHaveBeenCalled();
    expect(listChallengeCycleSettlements).not.toHaveBeenCalled();
  });
});
