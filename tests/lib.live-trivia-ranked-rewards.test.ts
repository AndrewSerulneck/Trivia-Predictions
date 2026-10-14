import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import type { LiveTriviaGameRef } from "@/lib/liveTriviaWeekTotals";
import type { RankedPlace, WeekPlayerTotal } from "@/lib/rankedPlaceRewards";
import type { ChallengeCampaign } from "@/types";

// The weekly ranked-places resolver (docs/live-trivia-weekly-places-reward-plan.md
// §5c, Phase 2). Week planning runs on the REAL computeCycleStart and
// enumerateScheduleOccurrences — the cycle key and the game list are exactly what
// would double-pay if they drifted — and only the database edges are faked: the
// settlement table, the week-totals RPC and the award RPC.

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
  campaigns: [] as ChallengeCampaign[],
  schedules: [] as TriviaScheduleRow[],
  settlements: [] as SettlementRow[],
  totalsBySchedule: new Map<string, WeekPlayerTotal[]>(),
  failTotalsForSchedule: null as string | null,
  failSettlementsRead: false,
}));

// Stand-in for award_ranked_cycle_places: refuses an exact key it already settled,
// otherwise writes one settlement with the outcome the real RPC would report.
const awardRankedCyclePlaces = vi.hoisted(() =>
  vi.fn(
    async (params: {
      campaign: { id: string; minPlayers?: number | null };
      venueId: string;
      cycleStart: Date;
      places: readonly RankedPlace[];
      participantCount: number;
    }) => {
      const cycleStart = params.cycleStart.toISOString();
      if (store.settlements.some((r) => r.challengeId === params.campaign.id && r.cycleStart === cycleStart)) {
        return { status: "already_resolved" as const, winnersAwarded: 0 };
      }
      const minPlayers = params.campaign.minPlayers ?? null;
      const outcome =
        params.places.length > 0
          ? ("awarded" as const)
          : minPlayers !== null && params.participantCount < minPlayers
            ? ("below_minimum" as const)
            : ("no_scorers" as const);
      store.settlements.push({
        challengeId: params.campaign.id,
        cycleStart,
        venueId: params.venueId,
        outcome,
        participantCount: params.participantCount,
        winnerCount: params.places.length,
        minPlayers,
        settledAt: new Date().toISOString(),
      });
      return { status: outcome, winnersAwarded: params.places.length };
    },
  ),
);

const listChallengeCycleSettlements = vi.hoisted(() =>
  vi.fn(async (params: { challengeIds: readonly string[]; cycleStartFrom: Date }) => {
    if (store.failSettlementsRead) throw new Error("settlements read failed");
    return store.settlements.filter(
      (r) => params.challengeIds.includes(r.challengeId) && Date.parse(r.cycleStart) >= params.cycleStartFrom.getTime(),
    );
  }),
);

const loadLiveTriviaWeekTotals = vi.hoisted(() =>
  vi.fn(async (games: readonly LiveTriviaGameRef[]) => {
    // The fixture holds a whole week's totals per schedule, so each schedule counts once.
    const rows: WeekPlayerTotal[] = [];
    for (const scheduleId of new Set(games.map((game) => game.scheduleId))) {
      if (store.failTotalsForSchedule === scheduleId) throw new Error("totals RPC failed");
      rows.push(...(store.totalsBySchedule.get(scheduleId) ?? []));
    }
    return rows;
  }),
);

vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return {
    ...actual,
    listActiveRankedPlaceCampaigns: vi.fn(async () => store.campaigns),
    listChallengeCycleSettlements,
    awardRankedCyclePlaces,
  };
});

vi.mock("@/lib/liveShowdownEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/liveShowdownEngine")>();
  return {
    ...actual,
    loadLiveTriviaSchedulesForVenues: vi.fn(async (venueIds: readonly string[]) =>
      store.schedules.filter((row) => venueIds.includes(String(row.venue_id))),
    ),
  };
});

vi.mock("@/lib/liveTriviaWeekTotals", () => ({ loadLiveTriviaWeekTotals }));

vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));

import { computeCycleStart } from "@/lib/challengeCampaigns";
import {
  planDueRankedWeeks,
  rankedRewardConfigError,
  resolveRankedPlaceRewards,
} from "@/lib/liveTriviaRankedRewards";

const TZ = "America/New_York";

// Garden State Bar's shape: Wed/Thu/Fri at 7pm EDT, here 2 rounds (55 minutes) long.
const makeSchedule = (overrides: Partial<TriviaScheduleRow> = {}): TriviaScheduleRow => ({
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
  ...overrides,
});

const makeCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "camp-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    name: "Weekly Trivia Champions",
    rules: "",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: ["wed", "thu", "fri"],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "earliest",
    pointMultiplier: 1,
    pointsRequiredToWin: 1,
    recurringType: "weekly",
    winCondition: "ranked_places",
    winnerQuota: 3,
    gameWinnerSlots: null,
    minPlayers: null,
    placePrizes: [1, 2, 3].map((place) => ({
      place,
      prizeKind: "gift_card" as const,
      prizeGiftCertificateAmount: 40 - place * 10,
    })),
    rewardDefinitionId: "live_trivia_challenge",
    isActive: true,
    ...overrides,
  }) as ChallengeCampaign;

// The week of Wed 2026-10-07: games Wed 10-07, Thu 10-08, Fri 10-09, each 23:00Z–23:55Z.
const OCT7_WEEK_KEY = "2026-10-07T04:00:00.000Z"; // Wed 00:00 EDT
const SEP30_WEEK_KEY = "2026-09-30T04:00:00.000Z";
const FRI_GAME_END = Date.parse("2026-10-09T23:55:00.000Z");
const AFTER_FRIDAY = FRI_GAME_END + 5 * 60 * 1000;

const total = (userId: string, totalPoints: number, reachedAt: string | null): WeekPlayerTotal => ({
  userId,
  totalPoints,
  reachedAt,
});

const plan = (campaign: ChallengeCampaign, nowMs: number, schedules = [makeSchedule()]) =>
  planDueRankedWeeks({ campaign, venueId: "venue-1", schedules, timezone: TZ, nowMs });

beforeEach(() => {
  store.campaigns = [makeCampaign()];
  store.schedules = [makeSchedule()];
  store.settlements = [];
  store.totalsBySchedule = new Map([
    [
      "sched-1",
      [
        total("u-snooker", 410, "2026-10-09T23:40:00.000Z"),
        total("u-kuch", 140, "2026-10-08T23:30:00.000Z"),
        total("u-fast", 50, "2026-10-07T23:10:00.000Z"),
        total("u-zero", 0, null),
      ],
    ],
  ]);
  store.failTotalsForSchedule = null;
  store.failSettlementsRead = false;
  awardRankedCyclePlaces.mockClear();
  loadLiveTriviaWeekTotals.mockClear();
  listChallengeCycleSettlements.mockClear();
});

describe("planDueRankedWeeks", () => {
  it("makes a week due only once its LAST game has ended", () => {
    const duringFriday = plan(makeCampaign(), FRI_GAME_END - 60_000);
    expect(duringFriday.map((w) => w.cycleStart.toISOString())).toEqual([SEP30_WEEK_KEY]);

    const afterFriday = plan(makeCampaign(), FRI_GAME_END);
    expect(afterFriday.map((w) => w.cycleStart.toISOString())).toEqual([SEP30_WEEK_KEY, OCT7_WEEK_KEY]);
    const week = afterFriday[1];
    expect(week.games.map((g) => g.occurrenceDate)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(week.lastGameEndMs).toBe(FRI_GAME_END);
  });

  it("keys the week on computeCycleStart, the key the Rewards panel reads", () => {
    const campaign = makeCampaign();
    const [, week] = plan(campaign, AFTER_FRIDAY);
    for (const instant of ["2026-10-07T05:00:00Z", "2026-10-08T12:00:00Z", "2026-10-09T23:30:00Z"]) {
      expect(week.cycleStart.getTime()).toBe(computeCycleStart(campaign, new Date(instant), TZ).getTime());
    }
    expect(week.cycleStart.toISOString()).toBe(OCT7_WEEK_KEY);
  });

  it("looks back two weeks only", () => {
    // Monday after the Oct 7 week: the current cycle is still Oct 7 (Wed-anchored),
    // the previous is Sep 30; Sep 23 is outside the lookback.
    const weeks = plan(makeCampaign(), Date.parse("2026-10-12T15:00:00Z"));
    expect(weeks.map((w) => w.cycleStart.toISOString())).toEqual([SEP30_WEEK_KEY, OCT7_WEEK_KEY]);
    const nextWed = plan(makeCampaign(), Date.parse("2026-10-14T12:00:00Z"));
    expect(nextWed.map((w) => w.cycleStart.toISOString())).toEqual([OCT7_WEEK_KEY]);
  });

  it("D8: a reward created mid-week covers that whole week, nights already played included", () => {
    const campaign = makeCampaign({ createdAt: "2026-10-08T12:00:00.000Z" }); // Thursday noon
    const weeks = plan(campaign, AFTER_FRIDAY);
    expect(weeks.map((w) => w.cycleStart.toISOString())).toEqual([OCT7_WEEK_KEY]);
    expect(weeks[0].games.map((g) => g.occurrenceDate)).toContain("2026-10-07");
  });

  it("D8: a reward created after the week's last game ended starts the next week", () => {
    const campaign = makeCampaign({ createdAt: new Date(FRI_GAME_END + 60_000).toISOString() });
    expect(plan(campaign, FRI_GAME_END + 10 * 60_000)).toEqual([]);
  });

  it("fails closed on an unreadable created_at", () => {
    expect(plan(makeCampaign({ createdAt: "not a date" }), AFTER_FRIDAY)).toEqual([]);
  });

  it("honors pinned games: a Wednesday-only reward is due after Wednesday's game", () => {
    const campaign = makeCampaign({ gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "wed" }] });
    const weeks = plan(campaign, Date.parse("2026-10-08T00:00:00Z"));
    const week = weeks.find((w) => w.cycleStart.toISOString() === OCT7_WEEK_KEY);
    expect(week?.games.map((g) => g.occurrenceDate)).toEqual(["2026-10-07"]);
  });

  it("ignores other venues' schedules and adds up every schedule at the venue", () => {
    const schedules = [
      makeSchedule(),
      makeSchedule({ id: "sched-sat", recurring_days: ["sat"] }),
      makeSchedule({ id: "sched-elsewhere", venue_id: "venue-2" }),
    ];
    const weeks = plan(makeCampaign(), Date.parse("2026-10-11T12:00:00Z"), schedules);
    const week = weeks.find((w) => w.cycleStart.toISOString() === OCT7_WEEK_KEY);
    expect(week?.games.map((g) => `${g.scheduleId}@${g.occurrenceDate}`)).toEqual([
      "sched-1@2026-10-07",
      "sched-1@2026-10-08",
      "sched-1@2026-10-09",
      "sched-sat@2026-10-10",
    ]);
  });

  it("keeps both weeks whole across the end of daylight saving time (Nov 1)", () => {
    // Fri Nov 6's 7pm EST game runs 00:00Z–00:55Z on Nov 7.
    const weeks = plan(makeCampaign(), Date.parse("2026-11-07T01:00:00Z"));
    expect(weeks.map((w) => w.cycleStart.toISOString())).toEqual([
      "2026-10-28T04:00:00.000Z", // Wed 00:00 EDT
      "2026-11-04T05:00:00.000Z", // Wed 00:00 EST
    ]);
    expect(weeks.map((w) => w.games.map((g) => g.occurrenceDate))).toEqual([
      ["2026-10-28", "2026-10-29", "2026-10-30"],
      ["2026-11-04", "2026-11-05", "2026-11-06"],
    ]);
  });

  it("throws when the reward's week can't be anchored", () => {
    expect(() => plan(makeCampaign({ activeDays: [] }), AFTER_FRIDAY)).toThrow(/week start/);
  });
});

describe("rankedRewardConfigError", () => {
  it("refuses a reward for more than one venue, a non-weekly one, or one with no ladder", () => {
    expect(rankedRewardConfigError(makeCampaign())).toBeNull();
    expect(rankedRewardConfigError(makeCampaign({ venueIds: ["venue-1", "venue-2"] }))).toMatch(/one venue/);
    expect(rankedRewardConfigError(makeCampaign({ venueIds: [] }))).toMatch(/one venue/);
    expect(rankedRewardConfigError(makeCampaign({ recurringType: "monthly" }))).toMatch(/weekly/);
    expect(rankedRewardConfigError(makeCampaign({ placePrizes: null }))).toMatch(/ladder/);
  });
});

describe("resolveRankedPlaceRewards", () => {
  it("pays 1st/2nd/3rd once the week's last game ends, keyed on computeCycleStart", async () => {
    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);

    const oct7 = report.settlements.find((s) => s.cycleStart === OCT7_WEEK_KEY);
    expect(oct7?.status).toBe("awarded");
    expect(oct7?.winners).toEqual([
      { place: 1, userId: "u-snooker", totalPoints: 410 },
      { place: 2, userId: "u-kuch", totalPoints: 140 },
      { place: 3, userId: "u-fast", totalPoints: 50 },
    ]);
    expect(oct7?.participantCount).toBe(4);
    expect(oct7?.gameCount).toBe(3);
    const call = awardRankedCyclePlaces.mock.calls.find(([p]) => p.cycleStart.toISOString() === OCT7_WEEK_KEY);
    expect(call?.[0].venueId).toBe("venue-1");
    expect(call?.[0].participantCount).toBe(4);
    expect(report.errors).toEqual([]);
  });

  it("is idempotent: a re-sweep reads settlements, never scores, and pays nobody again", async () => {
    const first = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(first.weeksSettled).toBe(2); // Sep 30 (same fixture totals) and Oct 7
    const totalsCalls = loadLiveTriviaWeekTotals.mock.calls.length;
    const awardCalls = awardRankedCyclePlaces.mock.calls.length;

    const second = await resolveRankedPlaceRewards(AFTER_FRIDAY + 5 * 60_000);
    expect(second.weeksDue).toBe(2);
    expect(second.weeksAlreadySettled).toBe(2);
    expect(second.weeksSettled).toBe(0);
    expect(loadLiveTriviaWeekTotals.mock.calls.length).toBe(totalsCalls);
    expect(awardRankedCyclePlaces.mock.calls.length).toBe(awardCalls);
    expect(store.settlements).toHaveLength(2);
    // One settlements read per sweep, for every due week at once.
    expect(listChallengeCycleSettlements).toHaveBeenCalledTimes(2);
  });

  it("records a below-minimum week once and never re-reads its scores", async () => {
    store.campaigns = [makeCampaign({ minPlayers: 5 })];

    const first = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(first.belowMinimum).toBe(2);
    const oct7Call = awardRankedCyclePlaces.mock.calls.find(([p]) => p.cycleStart.toISOString() === OCT7_WEEK_KEY);
    expect(oct7Call?.[0].places).toEqual([]);
    expect(oct7Call?.[0].participantCount).toBe(4);
    const totalsCalls = loadLiveTriviaWeekTotals.mock.calls.length;

    const second = await resolveRankedPlaceRewards(AFTER_FRIDAY + 60 * 60_000);
    expect(second.weeksAlreadySettled).toBe(2);
    expect(loadLiveTriviaWeekTotals.mock.calls.length).toBe(totalsCalls);
  });

  it("records a week nobody scored in once and never re-reads it", async () => {
    store.totalsBySchedule.set("sched-1", [total("u-zero", 0, null)]);

    const first = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(first.noScorers).toBe(2);
    expect(store.settlements.every((s) => s.outcome === "no_scorers")).toBe(true);

    const second = await resolveRankedPlaceRewards(AFTER_FRIDAY + 60_000);
    expect(second.weeksSettled).toBe(0);
    expect(second.weeksAlreadySettled).toBe(2);
  });

  it("treats a settlement a few hours off the key as the same week (wrong-timezone guard)", async () => {
    store.settlements.push({
      challengeId: "camp-1",
      cycleStart: new Date(Date.parse(OCT7_WEEK_KEY) + 3 * 60 * 60 * 1000).toISOString(),
      venueId: "venue-1",
      outcome: "awarded",
      participantCount: 4,
      winnerCount: 3,
      minPlayers: null,
      settledAt: "2026-10-10T00:00:00.000Z",
    });

    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(report.settlements.map((s) => s.cycleStart)).toEqual([SEP30_WEEK_KEY]);
    expect(report.weeksAlreadySettled).toBe(1);
  });

  it("awards nothing when the settlements read fails (fail closed)", async () => {
    store.failSettlementsRead = true;

    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(awardRankedCyclePlaces).not.toHaveBeenCalled();
    expect(loadLiveTriviaWeekTotals).not.toHaveBeenCalled();
    expect(report.errors.map((e) => e.scope)).toEqual(["settlements"]);
  });

  it("one failing reward doesn't stop the others", async () => {
    store.campaigns = [
      makeCampaign({ id: "camp-broken", venueIds: ["venue-1"] }),
      makeCampaign({ id: "camp-ok", venueIds: ["venue-2"] }),
      makeCampaign({ id: "camp-multi", venueIds: ["venue-1", "venue-2"] }),
    ];
    store.schedules = [makeSchedule(), makeSchedule({ id: "sched-2", venue_id: "venue-2" })];
    store.totalsBySchedule.set("sched-2", [total("u-other", 70, "2026-10-09T23:30:00.000Z")]);
    store.failTotalsForSchedule = "sched-1";

    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);

    expect(report.settlements.map((s) => s.campaignId)).toEqual(["camp-ok", "camp-ok"]);
    const scopes = report.errors.map((e) => e.scope);
    expect(scopes).toContain("camp-multi");
    expect(scopes).toContain(`camp-broken@${OCT7_WEEK_KEY}`);
    expect(scopes).toContain(`camp-broken@${SEP30_WEEK_KEY}`);
    expect(store.settlements.some((s) => s.challengeId === "camp-broken")).toBe(false);
  });

  it("does nothing (and reads nothing) with no ranked rewards", async () => {
    store.campaigns = [];
    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(report.campaignsExamined).toBe(0);
    expect(listChallengeCycleSettlements).not.toHaveBeenCalled();
  });

  it("counts an RPC already_resolved (a concurrent sweep) without counting it as settled", async () => {
    // The exact key is already in the fake RPC's store, but the settlements read
    // misses it (as if it committed between the read and the award).
    listChallengeCycleSettlements.mockImplementationOnce(async () => []);
    store.settlements.push({
      challengeId: "camp-1",
      cycleStart: OCT7_WEEK_KEY,
      venueId: "venue-1",
      outcome: "awarded",
      participantCount: 4,
      winnerCount: 3,
      minPlayers: null,
      settledAt: "2026-10-10T00:00:00.000Z",
    });

    const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);
    expect(report.alreadyResolved).toBe(1);
    expect(report.weeksSettled).toBe(1); // only Sep 30
  });

  it("flags a paid place decided by user id, not by who got there first", async () => {
    store.totalsBySchedule.set("sched-1", [
      total("u-b", 200, "2026-10-07T23:40:00.000Z"),
      total("u-a", 200, "2026-10-07T23:40:00.000Z"),
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const report = await resolveRankedPlaceRewards(AFTER_FRIDAY);
      const oct7 = report.settlements.find((s) => s.cycleStart === OCT7_WEEK_KEY);
      expect(oct7?.winners.map((w) => w.userId)).toEqual(["u-a", "u-b"]);
      expect(oct7?.tiebreakUnresolved).toBe(true);
      expect(warn).toHaveBeenCalledWith("[RankedReward] tiebreak-unresolved", expect.any(Object));
    } finally {
      warn.mockRestore();
    }
  });
});
