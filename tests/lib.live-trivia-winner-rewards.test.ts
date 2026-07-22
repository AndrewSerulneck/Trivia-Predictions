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

// Mirrors the real listChallengeCampaigns contract closely enough to exercise the
// resolver's per-venue fan-out: an unscoped call simulates the 200-row global cap
// (so a campaign appended after row 200 is truncated), while a venueId-scoped call
// simulates the SQL-level venue_ids overlap push-down (unbounded per venue).
const listChallengeCampaigns = vi.hoisted(() =>
  vi.fn(async (params: { venueId?: string } = {}) => {
    if (!params.venueId) return store.campaigns.slice(0, 200);
    return store.campaigns.filter(
      (c) => c.venueIds.length === 0 || c.venueIds.includes(params.venueId as string),
    );
  })
);

const updateChallengeCampaign = vi.hoisted(() =>
  vi.fn(async (input: { id: string; isActive?: boolean; winnerUserId?: string | null }) => {
    if (input.isActive === false) store.deactivated.push(input.id);
    const campaign = store.campaigns.find((c) => c.id === input.id);
    return { ...campaign, ...input } as ChallengeCampaign;
  })
);

vi.mock("@/lib/challengeCampaigns", () => ({
  awardCycleWinner,
  listChallengeCampaigns,
  updateChallengeCampaign,
  // Mirrors the real helper's single-day branch closely enough for these tests:
  // null when the campaign has no end date, else the end-of-day boundary.
  getCampaignCloseTimestampMs: (campaign: ChallengeCampaign) => {
    if (!campaign.endDate) return null;
    const parsed = Date.parse(`${campaign.endDate}T23:59:59.999Z`);
    return Number.isFinite(parsed) ? parsed : null;
  },
}));

vi.mock("@/lib/liveShowdownEngine", () => ({
  findEndedOccurrences: vi.fn(async () => store.occurrences),
  loadOccurrenceFinalStandings: vi.fn(
    async (scheduleId: string, occurrenceDate: string) =>
      store.standings.get(`${scheduleId}@${occurrenceDate}`) ?? []
  ),
}));

vi.mock("@/lib/rewardsFlags", () => ({ isRewardsEnabled: () => true }));

import {
  GAME_WINNER_TIE_QUOTA_CAP,
  resolveGameWinnerRewards,
} from "@/lib/liveTriviaWinnerRewards";

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
  updateChallengeCampaign.mockClear();
});

describe("resolveGameWinnerRewards", () => {
  it("finds a venue's game-winner campaign even with >200 active campaigns systemwide", async () => {
    // 200 noise campaigns (other venues) fill the simulated global cap, then the
    // venue-1 game-winner campaign is appended after it — an unscoped
    // listChallengeCampaigns() call would truncate it away.
    const noise = Array.from({ length: 200 }, (_, i) =>
      makeCampaign({ id: `noise-${i}`, venueIds: [`other-venue-${i}`], winCondition: "points_threshold" }),
    );
    store.campaigns = [...noise, makeCampaign({ id: "camp-1", venueIds: ["venue-1"] })];

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.campaignsExamined).toBe(1);
    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-win"]);
    expect(listChallengeCampaigns).toHaveBeenCalledWith({ venueId: "venue-1" });
  });

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

  // ── Review fixes: retroactive awards, one-off double-award, unbounded ties ──

  it("never awards a game that finished before the reward was created", async () => {
    // Partner creates the reward AFTER the 11pm game already ended.
    store.campaigns = [makeCampaign({ createdAt: new Date(GAME_END + 60_000).toISOString() })];

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("never awards a game that was already underway when the reward was created", async () => {
    // Created one minute into the game: the players already playing were never
    // told about this prize, so the game does not count.
    store.campaigns = [makeCampaign({ createdAt: new Date(GAME_START + 60_000).toISOString() })];

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("never awards a game that ran after the campaign's end date", async () => {
    store.campaigns = [makeCampaign({ endDate: "2026-07-19" })];

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("never awards an already-resolved reward", async () => {
    store.campaigns = [makeCampaign({ winnerUserId: "user-previous" })];

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("awards a one-off reward only ONCE when two games end inside the same sweep", async () => {
    // A venue with an early and a late game: both land in the 6h lookback on the
    // first sweep after a deploy. The reward is one-off — exactly one may pay out.
    const lateStart = GAME_START + 2 * 60 * 60 * 1000;
    store.occurrences.push({
      scheduleId: "sched-2",
      occurrenceDate: "2026-07-20",
      venueId: "venue-1",
      numRounds: 4,
      startMs: lateStart,
      endMs: lateStart + 60 * 60 * 1000,
    });
    store.standings.set("sched-2@2026-07-20", [{ userId: "user-late", totalPoints: 200 }]);

    const report = await resolveGameWinnerRewards(lateStart + 3 * 60 * 60 * 1000);

    expect(report.resolutions).toHaveLength(1);
    expect(store.ledger).toHaveLength(1);
    // Earliest eligible game claims it — deterministic, not row-order dependent.
    expect(store.ledger[0].userId).toBe("user-win");
    expect(store.deactivated).toEqual(["camp-1"]);
  });

  it("still resolves each occurrence for a RECURRING reward when two games end in one sweep", async () => {
    store.campaigns = [makeCampaign({ recurringType: "weekly" })];
    const lateStart = GAME_START + 2 * 60 * 60 * 1000;
    store.occurrences.push({
      scheduleId: "sched-2",
      occurrenceDate: "2026-07-20",
      venueId: "venue-1",
      numRounds: 4,
      startMs: lateStart,
      endMs: lateStart + 60 * 60 * 1000,
    });
    store.standings.set("sched-2@2026-07-20", [{ userId: "user-late", totalPoints: 200 }]);

    const report = await resolveGameWinnerRewards(lateStart + 3 * 60 * 60 * 1000);

    expect(report.resolutions).toHaveLength(2);
    expect(store.ledger).toHaveLength(2);
    expect(store.deactivated).toEqual([]);
  });

  it("caps a runaway tie and flags that it did so", async () => {
    // An unusually easy game: 12 players all answer everything correctly.
    store.standings.set(
      "sched-1@2026-07-20",
      Array.from({ length: 12 }, (_, i) => ({
        userId: `user-${String(i).padStart(2, "0")}`,
        totalPoints: 100,
      }))
    );

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions[0].awardedUserIds).toHaveLength(GAME_WINNER_TIE_QUOTA_CAP);
    expect(report.resolutions[0].tiedCount).toBe(12);
    expect(report.resolutions[0].tieCapApplied).toBe(true);
    expect(store.ledger).toHaveLength(GAME_WINNER_TIE_QUOTA_CAP);
  });

  it("picks the same capped subset on a re-sweep even if standings come back reordered", async () => {
    const tied = Array.from({ length: 12 }, (_, i) => ({
      userId: `user-${String(i).padStart(2, "0")}`,
      totalPoints: 100,
    }));
    store.standings.set("sched-1@2026-07-20", tied);
    await resolveGameWinnerRewards(NOW);
    const firstAwarded = store.ledger.map((r) => r.userId).sort();

    // Same game re-swept, but the DB hands back the tied rows in a different
    // order — an unstable selection would award a fresh set and blow the cap.
    store.standings.set("sched-1@2026-07-20", [...tied].reverse());
    await resolveGameWinnerRewards(NOW + 60_000);

    expect(store.ledger).toHaveLength(GAME_WINNER_TIE_QUOTA_CAP);
    expect(store.ledger.map((r) => r.userId).sort()).toEqual(firstAwarded);
  });

  it("leaves a tie at or under the cap fully intact", async () => {
    store.standings.set("sched-1@2026-07-20", [
      { userId: "user-a", totalPoints: 100 },
      { userId: "user-b", totalPoints: 100 },
      { userId: "user-c", totalPoints: 60 },
    ]);

    const report = await resolveGameWinnerRewards(NOW);

    expect(report.resolutions[0].awardedUserIds).toEqual(["user-a", "user-b"]);
    expect(report.resolutions[0].tieCapApplied).toBe(false);
  });
});
