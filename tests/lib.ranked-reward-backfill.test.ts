import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import type { LiveTriviaGameRef } from "@/lib/liveTriviaWeekTotals";
import type { RankedPlace, WeekPlayerTotal } from "@/lib/rankedPlaceRewards";
import type { ChallengeCampaign } from "@/types";

// The Phase 5 backfill (lib/rankedRewardBackfill.ts, scripts/backfill-ranked-reward.cjs).
// Week planning and ranking run on the real code; only the database edges are faked.

type Settlement = { challengeId: string; cycleStart: string };

const store = vi.hoisted(() => ({
  campaigns: [] as ChallengeCampaign[],
  schedules: [] as TriviaScheduleRow[],
  settlements: [] as Settlement[],
  totalsByDate: new Map<string, WeekPlayerTotal[]>(),
  usernames: new Map<string, string>(),
}));

const awardRankedCyclePlaces = vi.hoisted(() =>
  vi.fn(
    async (params: {
      campaign: { id: string };
      cycleStart: Date;
      places: readonly RankedPlace[];
      participantCount: number;
      prizeExpiresAt?: Date;
    }) => {
      const cycleStart = params.cycleStart.toISOString();
      if (store.settlements.some((r) => r.challengeId === params.campaign.id && r.cycleStart === cycleStart)) {
        return { status: "already_resolved" as const, winnersAwarded: 0 };
      }
      store.settlements.push({ challengeId: params.campaign.id, cycleStart });
      return {
        status: params.places.length > 0 ? ("awarded" as const) : ("no_scorers" as const),
        winnersAwarded: params.places.length,
      };
    },
  ),
);

const loadLiveTriviaWeekTotals = vi.hoisted(() =>
  vi.fn(async (games: readonly LiveTriviaGameRef[]) =>
    games.flatMap((game) => store.totalsByDate.get(game.occurrenceDate) ?? []),
  ),
);

vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return {
    ...actual,
    listActiveRankedPlaceCampaigns: vi.fn(async () => store.campaigns),
    listChallengeCycleSettlements: vi.fn(async () =>
      store.settlements.map((row) => ({
        ...row,
        venueId: "venue-1",
        outcome: "awarded" as const,
        participantCount: 1,
        winnerCount: 1,
        minPlayers: null,
        settledAt: "2026-10-15T00:00:00.000Z",
      })),
    ),
    awardRankedCyclePlaces,
  };
});

vi.mock("@/lib/liveShowdownEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/liveShowdownEngine")>();
  return { ...actual, loadLiveTriviaSchedulesForVenues: vi.fn(async () => store.schedules) };
});

vi.mock("@/lib/liveTriviaWeekTotals", () => ({ loadLiveTriviaWeekTotals }));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => ({
          returns: async () => ({
            data: ids.map((id) => ({ id, username: store.usernames.get(id) ?? null })),
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import { applyRankedRewardBackfill, planRankedRewardBackfill } from "@/lib/rankedRewardBackfill";

const NOW = Date.parse("2026-10-14T23:45:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const campaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "camp-1",
    createdAt: "2026-10-14T23:30:00.000Z",
    name: "Live Trivia Challenge",
    rules: "",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: ["wed", "thu", "fri"],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    pointsRequiredToWin: 1,
    recurringType: "weekly",
    winCondition: "ranked_places",
    winnerQuota: 3,
    gameWinnerSlots: null,
    minPlayers: null,
    placePrizes: [30, 20, 10].map((amount, index) => ({
      place: index + 1,
      prizeKind: "gift_card" as const,
      prizeGiftCertificateAmount: amount,
      prizeMenuItem: null,
      prizeMenuItemName: null,
      prizeDiscountKind: null,
      prizeDiscountValue: null,
      prizePosValueCents: null,
      prizePosDelivery: null,
    })),
    rewardDefinitionId: "live_trivia_challenge",
    isActive: true,
    ...overrides,
  }) as ChallengeCampaign;

const total = (userId: string, totalPoints: number, reachedAt: string | null): WeekPlayerTotal => ({
  userId,
  totalPoints,
  reachedAt,
});

beforeEach(() => {
  store.campaigns = [campaign()];
  store.schedules = [
    {
      id: "sched-1",
      title: "Weekday Trivia",
      start_time: "2026-09-23T23:00:00.000Z",
      timezone: "America/New_York",
      recurring_type: "weekly",
      recurring_days: ["wed", "thu", "fri"],
      num_rounds: 2,
      venue_id: "venue-1",
      intermission_ad_delay_seconds: null,
      lobby_ad_enabled: null,
    },
  ];
  store.settlements = [];
  // Week of Sep 23: three players. Sep 30: nobody. Oct 7: one scorer and one 0-point player.
  store.totalsByDate = new Map([
    ["2026-09-23", [total("u-a", 100, "2026-09-23T23:30:00Z"), total("u-b", 60, "2026-09-23T23:20:00Z")]],
    ["2026-09-25", [total("u-c", 40, "2026-09-25T23:10:00Z"), total("u-b", 50, "2026-09-25T23:40:00Z")]],
    ["2026-10-09", [total("u-d", 90, "2026-10-09T23:30:00Z"), total("u-zero", 0, null)]],
  ]);
  store.usernames = new Map([
    ["u-a", "Snooker"],
    ["u-b", "Kuch"],
    ["u-c", "fast76"],
    ["u-d", "murph"],
  ]);
  awardRankedCyclePlaces.mockClear();
  loadLiveTriviaWeekTotals.mockClear();
});

const planNow = () => planRankedRewardBackfill({ campaignId: "camp-1", fromDate: "2026-09-23", nowMs: NOW });

describe("planRankedRewardBackfill", () => {
  it("ranks each owned week with usernames and that place's prize, and totals what an apply issues", async () => {
    const plan = await planNow();
    expect(plan.weeks.map((w) => [w.cycleStart.toISOString(), w.outcome])).toEqual([
      ["2026-09-23T04:00:00.000Z", "awarded"],
      ["2026-09-30T04:00:00.000Z", "no_scorers"],
      ["2026-10-07T04:00:00.000Z", "awarded"],
    ]);
    // Kuch's two nights add up (110) and beat Snooker's 100.
    expect(plan.weeks[0].places.map((p) => [p.place, p.username, p.totalPoints, p.prize?.prizeGiftCertificateAmount])).toEqual([
      [1, "Kuch", 110, 30],
      [2, "Snooker", 100, 20],
      [3, "fast76", 40, 10],
    ]);
    expect(plan.weeks[2].participantCount).toBe(2); // the 0-point player took part
    expect(plan.weeks[2].places.map((p) => p.username)).toEqual(["murph"]);
    expect(plan.couponCount).toBe(4);
    expect(plan.giftCardDollars).toBe(90);
  });

  it("writes nothing", async () => {
    await planNow();
    expect(awardRankedCyclePlaces).not.toHaveBeenCalled();
  });

  it("refuses an unknown or non-active reward", async () => {
    store.campaigns = [];
    await expect(planNow()).rejects.toThrow(/No active, unresolved weekly places reward/);
  });

  it("refuses another game's ranked_places reward (plan 6.1)", async () => {
    store.campaigns = [campaign({ rewardDefinitionId: "nfl_pickem_challenge" })];
    await expect(planNow()).rejects.toThrow(/No active, unresolved weekly places reward/);
  });

  it("refuses a reward the resolver couldn't sweep either", async () => {
    store.campaigns = [campaign({ venueIds: ["venue-1", "venue-2"] })];
    await expect(planNow()).rejects.toThrow(/one venue/);
  });

  it("marks settled weeks and never re-reads their scores", async () => {
    store.settlements = [{ challengeId: "camp-1", cycleStart: "2026-09-23T04:00:00.000Z" }];
    const plan = await planNow();
    expect(plan.weeks[0].alreadySettled).toBe(true);
    expect(plan.weeks[0].places).toEqual([]);
    expect(loadLiveTriviaWeekTotals).toHaveBeenCalledTimes(2);
    expect(plan.couponCount).toBe(1);
  });
});

describe("applyRankedRewardBackfill", () => {
  it("refuses, writing nothing, unless the expected coupon count matches the plan", async () => {
    const plan = await planNow();
    await expect(applyRankedRewardBackfill({ plan, expectCoupons: 3, nowMs: NOW })).rejects.toThrow(/Refusing/);
    expect(awardRankedCyclePlaces).not.toHaveBeenCalled();
  });

  it("pays every unsettled week through the award RPC with a 30-day expiry, empty weeks included", async () => {
    const plan = await planNow();
    const results = await applyRankedRewardBackfill({ plan, expectCoupons: 4, nowMs: NOW });
    expect(results.map((r) => r.status)).toEqual(["awarded", "no_scorers", "awarded"]);
    expect(awardRankedCyclePlaces).toHaveBeenCalledTimes(3);
    for (const [params] of awardRankedCyclePlaces.mock.calls) {
      expect(params.prizeExpiresAt?.getTime()).toBe(NOW + 30 * DAY_MS);
    }
    const [first] = awardRankedCyclePlaces.mock.calls[0];
    expect(first.cycleStart.toISOString()).toBe("2026-09-23T04:00:00.000Z");
    expect(first.places.map((p) => [p.place, p.userId])).toEqual([
      [1, "u-b"],
      [2, "u-a"],
      [3, "u-c"],
    ]);
    expect(first.participantCount).toBe(3);
  });

  it("is a no-op on a re-run: every week is settled, nothing is paid again", async () => {
    await applyRankedRewardBackfill({ plan: await planNow(), expectCoupons: 4, nowMs: NOW });
    awardRankedCyclePlaces.mockClear();

    const again = await planNow();
    expect(again.couponCount).toBe(0);
    const results = await applyRankedRewardBackfill({ plan: again, expectCoupons: 0, nowMs: NOW });
    expect(results.map((r) => r.status)).toEqual(["skipped_settled", "skipped_settled", "skipped_settled"]);
    expect(awardRankedCyclePlaces).not.toHaveBeenCalled();
  });

  it("honors a custom expiry and refuses a nonsense one", async () => {
    const plan = await planNow();
    await expect(applyRankedRewardBackfill({ plan, expectCoupons: 4, expiryDays: 0, nowMs: NOW })).rejects.toThrow(
      /expiry/,
    );
    await applyRankedRewardBackfill({ plan, expectCoupons: 4, expiryDays: 14, nowMs: NOW });
    expect(awardRankedCyclePlaces.mock.calls[0][0].prizeExpiresAt?.getTime()).toBe(NOW + 14 * DAY_MS);
  });
});
