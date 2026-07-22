import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChallengeCampaign } from "@/types";

// Game-winner reward resolution (the "winner of the game, regardless of points"
// win condition). These tests pin the three behaviors that are easy to regress:
// tie handling, idempotency across sweeps, and the guard that keeps
// points-threshold rewards out of this path.

type LedgerRow = { challengeId: string; cycleStart: string; userId: string };

const store = vi.hoisted(() => ({
  ledger: [] as LedgerRow[],
  deactivated: [] as string[],
  occurrences: [] as Array<{
    scheduleId: string;
    occurrenceDate: string;
    venueId: string;
    numRounds: number;
    startMs: number;
    endMs: number;
  }>,
  standings: new Map<string, Array<{ userId: string; totalPoints: number }>>(),
  campaigns: [] as ChallengeCampaign[],
}));

// Faithful-enough stand-in for awardCycleWinner: the ledger is unique on
// (challenge_id, cycle_start, winner_user_id) and capped at the passed quota.
const awardCycleWinner = vi.hoisted(() =>
  vi.fn(
    async (params: {
      campaign: ChallengeCampaign;
      userId: string;
      cycleStart: Date;
      winnerQuota: number;
    }) => {
      const cycleStart = params.cycleStart.toISOString();
      const rows = store.ledger.filter(
        (r) => r.challengeId === params.campaign.id && r.cycleStart === cycleStart
      );
      const quota = Math.max(1, Math.round(params.winnerQuota));
      if (rows.length >= quota) return { won: false, exhausted: true };
      if (rows.some((r) => r.userId === params.userId)) {
        return { won: false, exhausted: rows.length >= quota };
      }
      store.ledger.push({
        challengeId: params.campaign.id,
        cycleStart,
        userId: params.userId,
      });
      return { won: true, exhausted: rows.length + 1 >= quota };
    }
  )
);

vi.mock("@/lib/challengeCampaigns", () => ({
  awardCycleWinner,
  listChallengeCampaigns: vi.fn(async () => store.campaigns),
}));

vi.mock("@/lib/liveShowdownEngine", () => ({
  findEndedOccurrences: vi.fn(async () => store.occurrences),
  loadOccurrenceFinalStandings: vi.fn(
    async (scheduleId: string, occurrenceDate: string) =>
      store.standings.get(`${scheduleId}@${occurrenceDate}`) ?? []
  ),
}));

vi.mock("@/lib/rewardsFlags", () => ({ isRewardsEnabled: () => true }));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (payload.is_active === false) store.deactivated.push(id);
          return { error: null };
        },
      }),
    }),
  },
}));

import { resolveGameWinnerRewards } from "@/lib/liveTriviaWinnerRewards";

const GAME_START = Date.parse("2026-07-20T23:00:00.000Z");
const GAME_END = Date.parse("2026-07-21T00:00:00.000Z");
const NOW = Date.parse("2026-07-21T00:05:00.000Z");

function makeCampaign(overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign {
  return {
    id: "camp-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    name: "Live Trivia Challenge",
    rules: "Win the Live Trivia game",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: [],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "earliest",
    pointMultiplier: 1,
    pointsRequiredToWin: 1,
    recurringType: "none",
    winCondition: "game_winner",
    winnerQuota: 1,
    rewardDefinitionId: "live_trivia_challenge",
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    prizeDiscountKind: "percent",
    prizeDiscountValue: 50,
    isActive: true,
    ...overrides,
  } as ChallengeCampaign;
}

beforeEach(() => {
  store.ledger = [];
  store.deactivated = [];
  store.campaigns = [makeCampaign()];
  store.occurrences = [
    {
      scheduleId: "sched-1",
      occurrenceDate: "2026-07-20",
      venueId: "venue-1",
      numRounds: 4,
      startMs: GAME_START,
      endMs: GAME_END,
    },
  ];
  store.standings = new Map([
    [
      "sched-1@2026-07-20",
      [
        { userId: "user-win", totalPoints: 120 },
        { userId: "user-2", totalPoints: 90 },
        { userId: "user-3", totalPoints: 40 },
      ],
    ],
  ]);
  awardCycleWinner.mockClear();
});

describe("resolveGameWinnerRewards", () => {
  it("awards the single top scorer of a finished game", async () => {
    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-win"]);
    expect(report.resolutions[0].topPoints).toBe(120);
    expect(report.resolutions[0].tiedCount).toBe(1);
    expect(report.errors).toEqual([]);
  });

  it("keys the award on the occurrence start, so a repeat sweep awards nobody", async () => {
    const first = await resolveGameWinnerRewards(NOW);
    expect(first.resolutions).toHaveLength(1);

    // Same game, swept again a minute later (cron overlap / retry / redeploy).
    const second = await resolveGameWinnerRewards(NOW + 60_000);
    expect(second.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(1);
  });

  it("awards every player tied for first rather than picking one arbitrarily", async () => {
    store.standings.set("sched-1@2026-07-20", [
      { userId: "user-a", totalPoints: 100 },
      { userId: "user-b", totalPoints: 100 },
      { userId: "user-c", totalPoints: 100 },
      { userId: "user-d", totalPoints: 70 },
    ]);

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions[0].awardedUserIds.sort()).toEqual(["user-a", "user-b", "user-c"]);
    expect(report.resolutions[0].tiedCount).toBe(3);
    // The quota handed to the RPC is widened to the tie count, never left at 1.
    expect(awardCycleWinner.mock.calls.every((call) => call[0].winnerQuota === 3)).toBe(true);
  });

  it("awards nobody when the game had no scorers", async () => {
    store.standings.set("sched-1@2026-07-20", []);
    const report = await resolveGameWinnerRewards(NOW);
    expect(report.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
  });

  it("awards nobody when every score is zero", async () => {
    store.standings.set("sched-1@2026-07-20", [
      { userId: "user-a", totalPoints: 0 },
      { userId: "user-b", totalPoints: 0 },
    ]);
    const report = await resolveGameWinnerRewards(NOW);
    expect(report.resolutions).toHaveLength(0);
  });

  it("ignores points-threshold rewards entirely", async () => {
    store.campaigns = [makeCampaign({ winCondition: "points_threshold" })];
    const report = await resolveGameWinnerRewards(NOW);
    expect(report.campaignsExamined).toBe(0);
    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("ignores rewards belonging to a different venue", async () => {
    store.campaigns = [makeCampaign({ venueIds: ["venue-999"] })];
    const report = await resolveGameWinnerRewards(NOW);
    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("never fires a venue-less (global) game-winner reward", async () => {
    store.campaigns = [makeCampaign({ venueIds: [] })];
    const report = await resolveGameWinnerRewards(NOW);
    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("deactivates a one-off reward once its game has produced a winner", async () => {
    await resolveGameWinnerRewards(NOW);
    expect(store.deactivated).toEqual(["camp-1"]);
  });

  it("leaves a recurring reward active so it resolves again next game", async () => {
    store.campaigns = [makeCampaign({ recurringType: "weekly" })];
    await resolveGameWinnerRewards(NOW);
    expect(store.deactivated).toEqual([]);
  });

  it("resolves a recurring reward separately for each occurrence", async () => {
    store.campaigns = [makeCampaign({ recurringType: "weekly" })];
    const secondStart = GAME_START + 7 * 24 * 60 * 60 * 1000;
    store.occurrences.push({
      scheduleId: "sched-1",
      occurrenceDate: "2026-07-27",
      venueId: "venue-1",
      numRounds: 4,
      startMs: secondStart,
      endMs: secondStart + 60 * 60 * 1000,
    });
    store.standings.set("sched-1@2026-07-27", [{ userId: "user-win", totalPoints: 80 }]);

    const report = await resolveGameWinnerRewards(secondStart + 2 * 60 * 60 * 1000);

    // The SAME user wins both games — distinct cycle keys mean the second win
    // is a fresh award, not a duplicate suppressed by the ledger.
    expect(report.resolutions).toHaveLength(2);
    expect(store.ledger).toHaveLength(2);
    expect(new Set(store.ledger.map((r) => r.cycleStart)).size).toBe(2);
  });
});
