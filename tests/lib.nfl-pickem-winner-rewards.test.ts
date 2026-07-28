import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChallengeCampaign, NFLWeekScope } from "@/types";

/**
 * Phase 7 of the NFL Pick 'Em reward: the week-winner resolver.
 *
 * Every behavior pinned here spends real money if it regresses — a duplicate
 * cycle key mints a second coupon for the same week, an unbroken tie either
 * over-awards or awards the wrong guest, and the 3-picker minimum is a promise
 * made to both partners and players.
 */

type LedgerRow = { challengeId: string; cycleStart: string; userId: string; quota: number };
type StandingsEntry = { userId: string; correctPicks: number };
type WeekFixture = {
  id: string;
  season: number;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
};
type GameFixture = { startsAt: string; status: string; homeScore: number | null; awayScore: number | null };

const store = vi.hoisted(() => ({
  ledger: [] as LedgerRow[],
  deactivated: [] as string[],
  campaigns: [] as ChallengeCampaign[],
  weeks: [] as WeekFixture[],
  /** weekId -> games. */
  games: new Map<string, GameFixture[]>(),
  /** `week:<venueId>:<weekId>` or `season:<venueId>:<season>` -> standings. */
  standings: new Map<string, StandingsEntry[]>(),
  /** pickem_picks rows, used for venue discovery. */
  picks: [] as Array<{ venue_id: string; starts_at: string; sport_slug: string }>,
  tiebreakerActualTotal: null as number | null,
  /** venueId -> guesses for the tiebreaker week. */
  guesses: new Map<string, Array<{ userId: string; predictedTotal: number }>>(),
  settleCalls: [] as string[],
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
        (row) => row.challengeId === params.campaign.id && row.cycleStart === cycleStart
      );
      const quota = Math.max(1, Math.round(params.winnerQuota));
      if (rows.length >= quota) return { won: false, exhausted: true };
      if (rows.some((row) => row.userId === params.userId)) {
        return { won: false, exhausted: rows.length >= quota };
      }
      store.ledger.push({
        challengeId: params.campaign.id,
        cycleStart,
        userId: params.userId,
        quota,
      });
      return { won: true, exhausted: rows.length + 1 >= quota };
    }
  )
);

// Mirrors the real contract closely enough to exercise the resolver's per-venue
// fan-out: an unscoped call simulates the 200-row global cap, a venue-scoped one
// simulates the SQL-level venue_ids overlap push-down (unbounded per venue).
const listChallengeCampaigns = vi.hoisted(() =>
  vi.fn(async (params: { venueId?: string } = {}) => {
    if (!params.venueId) return store.campaigns.slice(0, 200);
    return store.campaigns.filter(
      (campaign) =>
        campaign.venueIds.length === 0 || campaign.venueIds.includes(params.venueId as string)
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

// The REAL computeCycleStart / getCampaignCloseTimestampMs: cycle identity has to
// match the engine's, so it is asserted against the engine's own function rather
// than a re-implementation that could agree with a wrong resolver.
vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return {
    ...actual,
    awardCycleWinner,
    listChallengeCampaigns,
    updateChallengeCampaign,
  };
});

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const listNFLWeeks = vi.hoisted(() =>
  vi.fn(async (season: number) =>
    store.weeks
      .filter((week) => week.season === season)
      .map((week) => ({
        ...week,
        weekType: "regular" as const,
        displayLabel: null,
        thursdayKickoff: null,
        status: "complete" as const,
        gamesCount: store.games.get(week.id)?.length ?? 0,
        syncedAt: null,
      }))
  )
);

const listNFLPickEmGames = vi.hoisted(() =>
  vi.fn(async (params: { weekId: string }) => ({
    week: store.weeks.find((week) => week.id === params.weekId),
    games: (store.games.get(params.weekId) ?? []).map((game, index) => ({
      id: `game-${params.weekId}-${index}`,
      ...game,
    })),
  }))
);

const getNFLPickEmLeaderboard = vi.hoisted(() =>
  vi.fn(
    async (params: {
      venueId: string;
      mode: "week" | "season";
      weekId?: string | null;
      season?: number | null;
    }) => {
      const key =
        params.mode === "week"
          ? `week:${params.venueId}:${params.weekId}`
          : `season:${params.venueId}:${params.season}`;
      const entries = (store.standings.get(key) ?? []).map((entry, index) => ({
        userId: entry.userId,
        username: entry.userId,
        picksCount: 10,
        correctPicks: entry.correctPicks,
        incorrectPicks: 10 - entry.correctPicks,
        totalPoints: entry.correctPicks * 10,
        rank: index + 1,
        isCurrentUser: false,
        picks: [],
      }));
      return { mode: params.mode, weekId: params.weekId ?? null, season: params.season ?? null, entries };
    }
  )
);

// nflWeekSpanMs comes from the REAL module: the week window under test is
// exactly what it computes, and a hand-written stub here would let a wrong
// window pass. Everything else is stubbed.
vi.mock("@/lib/nflPickEm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nflPickEm")>();
  return {
    NFL_PICKEM_SPORT_SLUG: "nfl",
    nflWeekSpanMs: actual.nflWeekSpanMs,
    listNFLWeeks,
    listNFLPickEmGames,
    getNFLPickEmLeaderboard,
  };
});

const settleWeekTiebreaker = vi.hoisted(() =>
  vi.fn(async (weekId: string) => {
    store.settleCalls.push(weekId);
    return {
      settled: store.tiebreakerActualTotal !== null,
      gameId: "tiebreaker-game",
      actualTotal: store.tiebreakerActualTotal,
      updatedCount: 0,
    };
  })
);

const listTiebreakerGuesses = vi.hoisted(() =>
  vi.fn(async (params: { venueId: string; weekId: string }) =>
    (store.guesses.get(params.venueId) ?? []).map((guess) => ({
      userId: guess.userId,
      weekId: params.weekId,
      gameId: "tiebreaker-game",
      isHidden: false,
      predictedTotal: guess.predictedTotal,
      actualTotal: store.tiebreakerActualTotal,
      updatedAt: "2026-11-10T00:00:00.000Z",
    }))
  )
);

// rankByTiebreakerProximity is pure and is the actual tiebreak contract (Phase 1),
// so the real one runs here; only the two I/O helpers are stubbed.
vi.mock("@/lib/nflPickEmTiebreaker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nflPickEmTiebreaker")>();
  return { ...actual, settleWeekTiebreaker, listTiebreakerGuesses };
});

vi.mock("@/lib/timezone", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/timezone")>();
  return { ...actual, getVenueTimezone: vi.fn(async () => "America/New_York") };
});

// Minimal chainable stand-in for the ONE query the resolver runs directly: a
// paged `select("venue_id")` over pickem_picks inside a week/season window.
vi.mock("@/lib/supabaseAdmin", () => {
  const makeBuilder = () => {
    let gte = "";
    let lt = "";
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = vi.fn(self);
    builder.eq = vi.fn(self);
    builder.order = vi.fn(self);
    builder.range = vi.fn(self);
    builder.gte = vi.fn((_col: string, value: string) => {
      gte = value;
      return builder;
    });
    builder.lt = vi.fn((_col: string, value: string) => {
      lt = value;
      return builder;
    });
    builder.returns = vi.fn(() =>
      Promise.resolve({
        data: store.picks
          .filter((row) => row.sport_slug === "nfl" && row.starts_at >= gte && row.starts_at < lt)
          .map((row) => ({ venue_id: row.venue_id })),
        error: null,
      })
    );
    return builder;
  };
  return { supabaseAdmin: { from: vi.fn(() => makeBuilder()) } };
});

import { computeCycleStart } from "@/lib/challengeCampaigns";
import {
  NFL_WINNER_MIN_PARTICIPANTS,
  resolveNFLPickEmWinnerRewards,
} from "@/lib/nflPickEmWinnerRewards";

const SEASON = 2026;
// Week A: Thu 2026-11-05 → Mon 2026-11-09, every game final.
const WEEK_A: WeekFixture = {
  id: "week-a",
  season: SEASON,
  weekNumber: 10,
  weekStartDate: "2026-11-05",
  weekEndDate: "2026-11-09",
};
// Week B: Thu 2026-11-12 → Mon 2026-11-16, still in progress by default (so the
// season-long contest, which the LAST week decides, does not resolve yet).
const WEEK_B: WeekFixture = {
  id: "week-b",
  season: SEASON,
  weekNumber: 11,
  weekStartDate: "2026-11-12",
  weekEndDate: "2026-11-16",
};

const WEEK_A_FIRST_KICKOFF = "2026-11-05T20:20:00.000Z";
const NOW = Date.parse("2026-11-17T13:00:00.000Z");

const finalGames = (weekStartDate: string): GameFixture[] => [
  { startsAt: `${weekStartDate}T20:20:00.000Z`, status: "final", homeScore: 24, awayScore: 17 },
  { startsAt: `${weekStartDate}T18:00:00.000Z`, status: "final", homeScore: 20, awayScore: 13 },
  { startsAt: `${weekStartDate}T23:00:00.000Z`, status: "final", homeScore: 27, awayScore: 17 },
];

const makeCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "camp-nfl",
    createdAt: "2026-10-01T00:00:00.000Z",
    name: "NFL Pick 'Em Challenge",
    rules: "Get the most NFL picks right",
    venueIds: ["venue-1"],
    scheduleType: "recurring",
    // Thursday-first, all seven days — what createReward derives for an NFL
    // reward (NFL_REWARD_ACTIVE_DAYS).
    activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
    gameTypes: ["nfl-pickem"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "latest_activity",
    pointMultiplier: 1,
    pointsRequiredToWin: 1,
    recurringType: "weekly",
    winCondition: "game_winner",
    winnerQuota: 1,
    rewardDefinitionId: "nfl_pickem_challenge",
    nflWeekScope: { kind: "weekly", season: SEASON } as NFLWeekScope,
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    prizeDiscountKind: "percent",
    prizeDiscountValue: 50,
    isActive: true,
    ...overrides,
  }) as ChallengeCampaign;

const seasonCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  makeCampaign({
    id: "camp-nfl-season",
    recurringType: "none",
    startDate: "2026-11-05",
    endDate: "2026-11-16",
    nflWeekScope: { kind: "season", season: SEASON, fromWeek: 10 } as NFLWeekScope,
    ...overrides,
  });

const setStandings = (
  key: string,
  entries: Array<[string, number]>,
) => store.standings.set(key, entries.map(([userId, correctPicks]) => ({ userId, correctPicks })));

beforeEach(() => {
  store.ledger = [];
  store.deactivated = [];
  store.campaigns = [makeCampaign()];
  store.weeks = [WEEK_A, WEEK_B];
  store.games = new Map([
    [WEEK_A.id, finalGames(WEEK_A.weekStartDate)],
    [
      WEEK_B.id,
      [
        ...finalGames(WEEK_B.weekStartDate).slice(0, 2),
        { startsAt: "2026-11-16T23:00:00.000Z", status: "scheduled", homeScore: null, awayScore: null },
      ],
    ],
  ]);
  store.standings = new Map();
  setStandings(`week:venue-1:${WEEK_A.id}`, [
    ["user-ace", 9],
    ["user-fox", 6],
    ["user-rex", 4],
  ]);
  store.picks = [
    { venue_id: "venue-1", starts_at: WEEK_A_FIRST_KICKOFF, sport_slug: "nfl" },
    { venue_id: "venue-1", starts_at: "2026-11-12T20:20:00.000Z", sport_slug: "nfl" },
  ];
  store.tiebreakerActualTotal = 44;
  store.guesses = new Map();
  store.settleCalls = [];
  awardCycleWinner.mockClear();
  updateChallengeCampaign.mockClear();
});

describe("resolveNFLPickEmWinnerRewards", () => {
  it("awards the guest with the most correct picks, one winner, quota 1", async () => {
    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-ace"]);
    expect(report.resolutions[0].topCorrectPicks).toBe(9);
    expect(report.resolutions[0].tiedCount).toBe(1);
    expect(report.resolutions[0].kind).toBe("weekly");
    expect(report.errors).toEqual([]);
    expect(awardCycleWinner).toHaveBeenCalledWith(expect.objectContaining({ winnerQuota: 1 }));
    // No tie, so the tiebreaker is never settled.
    expect(store.settleCalls).toEqual([]);
  });

  it("reads campaigns per venue, never through one unscoped (200-capped) call", async () => {
    const noise = Array.from({ length: 200 }, (_, i) =>
      makeCampaign({ id: `noise-${i}`, venueIds: [`other-venue-${i}`] })
    );
    store.campaigns = [...noise, makeCampaign()];

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(1);
    expect(listChallengeCampaigns).toHaveBeenCalledWith({ venueId: "venue-1" });
  });

  it("keys the award on the engine's own cycle start for that NFL week", async () => {
    await resolveNFLPickEmWinnerRewards(NOW);

    // The instant a pick made during week A accrues under: the week's Thursday at
    // local midnight (activeDays[0] === "thu"), America/New_York.
    const engineCycleStart = computeCycleStart(
      makeCampaign(),
      new Date("2026-11-07T12:00:00.000Z"),
      "America/New_York"
    );
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0].cycleStart).toBe(engineCycleStart.toISOString());
    expect(store.ledger[0].cycleStart).toBe("2026-11-05T05:00:00.000Z");
  });

  it("awards nobody a second time when the sweep runs again", async () => {
    const first = await resolveNFLPickEmWinnerRewards(NOW);
    expect(first.resolutions).toHaveLength(1);

    const second = await resolveNFLPickEmWinnerRewards(NOW + 24 * 60 * 60 * 1000);

    expect(second.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(1);
  });

  it("resolves a weekly reward again for the next week", async () => {
    // Week B finishes too: the same reward pays out a second, separate contest.
    store.games.set(WEEK_B.id, finalGames(WEEK_B.weekStartDate));
    setStandings(`week:venue-1:${WEEK_B.id}`, [
      ["user-ace", 8],
      ["user-fox", 5],
      ["user-rex", 3],
    ]);
    setStandings(`season:venue-1:${SEASON}`, [
      ["user-ace", 17],
      ["user-fox", 11],
      ["user-rex", 7],
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(2);
    // The same guest won both weeks — distinct cycle keys, not a suppressed dupe.
    expect(new Set(store.ledger.map((row) => row.cycleStart)).size).toBe(2);
    expect(store.deactivated).toEqual([]);
  });

  // ── The tiebreaker ────────────────────────────────────────────────────────

  it("breaks a tie with the tiebreaker question — the closest guess wins", async () => {
    setStandings(`week:venue-1:${WEEK_A.id}`, [
      ["user-ace", 9],
      ["user-fox", 9],
      ["user-rex", 4],
    ]);
    // Actual total 44: fox guessed 45 (off by 1), ace guessed 30 (off by 14).
    store.guesses.set("venue-1", [
      { userId: "user-ace", predictedTotal: 30 },
      { userId: "user-fox", predictedTotal: 45 },
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(store.settleCalls).toEqual([WEEK_A.id]);
    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-fox"]);
    expect(report.resolutions[0].tiedCount).toBe(2);
    expect(report.resolutions[0].tiebreakerUnresolved).toBe(false);
    // Exactly one prize: the tie is NOT co-awarded (unlike Live Trivia).
    expect(store.ledger).toHaveLength(1);
  });

  it("awards nobody while the tiebreaker game is unfinished, then awards on a later sweep", async () => {
    setStandings(`week:venue-1:${WEEK_A.id}`, [
      ["user-ace", 9],
      ["user-fox", 9],
      ["user-rex", 4],
    ]);
    store.guesses.set("venue-1", [
      { userId: "user-ace", predictedTotal: 30 },
      { userId: "user-fox", predictedTotal: 45 },
    ]);
    store.tiebreakerActualTotal = null;

    const pending = await resolveNFLPickEmWinnerRewards(NOW);

    expect(pending.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(pending.pendingTiebreaker).toHaveLength(1);
    expect(pending.pendingTiebreaker[0].tiedUserIds).toEqual(["user-ace", "user-fox"]);

    // The final score lands; the next sweep resolves the same contest.
    store.tiebreakerActualTotal = 44;
    const resolved = await resolveNFLPickEmWinnerRewards(NOW + 60 * 60 * 1000);

    expect(resolved.resolutions).toHaveLength(1);
    expect(resolved.resolutions[0].awardedUserIds).toEqual(["user-fox"]);
  });

  it("still awards a single winner when the tiebreaker cannot separate them, and flags it", async () => {
    setStandings(`week:venue-1:${WEEK_A.id}`, [
      ["user-ace", 9],
      ["user-fox", 9],
      ["user-rex", 4],
    ]);
    // Nobody guessed: rankByTiebreakerProximity falls back to userId ascending.
    store.guesses.set("venue-1", []);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-ace"]);
    expect(report.resolutions[0].tiebreakerUnresolved).toBe(true);
  });

  // ── Gates ─────────────────────────────────────────────────────────────────

  it("awards nobody, and reports it, below the minimum participation gate", async () => {
    setStandings(`week:venue-1:${WEEK_A.id}`, [
      ["user-ace", 9],
      ["user-fox", 6],
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(report.skippedBelowMinimum).toHaveLength(1);
    expect(report.skippedBelowMinimum[0]).toMatchObject({
      venueId: "venue-1",
      weekId: WEEK_A.id,
      participants: 2,
      campaignIds: ["camp-nfl"],
    });
    expect(NFL_WINNER_MIN_PARTICIPANTS).toBe(3);
  });

  it("awards nobody when no guest got a single pick right", async () => {
    setStandings(`week:venue-1:${WEEK_A.id}`, [
      ["user-ace", 0],
      ["user-fox", 0],
      ["user-rex", 0],
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(report.skippedBelowMinimum).toHaveLength(0);
  });

  it("never awards a week that was already underway when the reward was created", async () => {
    store.campaigns = [
      makeCampaign({ createdAt: new Date(Date.parse(WEEK_A_FIRST_KICKOFF) + 60_000).toISOString() }),
    ];

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("ignores rewards from another definition, win condition, or scope", async () => {
    store.campaigns = [
      makeCampaign({ id: "camp-points", winCondition: "points_threshold" }),
      makeCampaign({ id: "camp-live-trivia", rewardDefinitionId: "live_trivia_challenge" }),
      makeCampaign({ id: "camp-no-scope", nflWeekScope: null }),
      makeCampaign({ id: "camp-other-season", nflWeekScope: { kind: "weekly", season: 2019 } }),
    ];

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(awardCycleWinner).not.toHaveBeenCalled();
  });

  it("never awards a venue's reward from another venue's standings", async () => {
    // venue-2 has picks (so it is swept) and a runaway leader, but the only
    // reward belongs to venue-1 — whose own standings must decide it.
    store.picks.push({ venue_id: "venue-2", starts_at: WEEK_A_FIRST_KICKOFF, sport_slug: "nfl" });
    setStandings(`week:venue-2:${WEEK_A.id}`, [
      ["user-other-1", 14],
      ["user-other-2", 12],
      ["user-other-3", 11],
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].venueId).toBe("venue-1");
    expect(store.ledger.map((row) => row.userId)).toEqual(["user-ace"]);
  });

  it("does not resolve a week whose games are still being played", async () => {
    // Week A becomes incomplete; nothing else changes.
    store.games.set(WEEK_A.id, [
      ...finalGames(WEEK_A.weekStartDate).slice(0, 2),
      { startsAt: "2026-11-09T23:00:00.000Z", status: "live", homeScore: null, awayScore: null },
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.contestsExamined).toBe(0);
    expect(report.resolutions).toHaveLength(0);
  });

  // ── Season scope ──────────────────────────────────────────────────────────

  it("resolves a season-long reward on the season's last week and deactivates it", async () => {
    store.campaigns = [seasonCampaign()];
    store.games.set(WEEK_B.id, finalGames(WEEK_B.weekStartDate));
    setStandings(`week:venue-1:${WEEK_B.id}`, [
      ["user-ace", 8],
      ["user-fox", 5],
      ["user-rex", 3],
    ]);
    setStandings(`season:venue-1:${SEASON}`, [
      ["user-fox", 20],
      ["user-ace", 17],
      ["user-rex", 7],
    ]);

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    // One contest only — the season one, decided by cumulative standings.
    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].kind).toBe("season");
    expect(report.resolutions[0].awardedUserIds).toEqual(["user-fox"]);
    expect(report.resolutions[0].topCorrectPicks).toBe(20);
    // Non-recurring: the cycle key is the campaign's own start instant.
    expect(store.ledger[0].cycleStart).toBe("2026-11-05T05:00:00.000Z");
    expect(store.deactivated).toEqual(["camp-nfl-season"]);
  });

  it("spends a season reward only once even when two weeks complete in one sweep", async () => {
    // A season reward could be claimed by the final week's contest only, but the
    // in-sweep spent set is what guarantees it — assert the ledger, not luck.
    store.campaigns = [seasonCampaign()];
    store.games.set(WEEK_B.id, finalGames(WEEK_B.weekStartDate));
    setStandings(`week:venue-1:${WEEK_B.id}`, [
      ["user-ace", 8],
      ["user-fox", 5],
      ["user-rex", 3],
    ]);
    setStandings(`season:venue-1:${SEASON}`, [
      ["user-fox", 20],
      ["user-ace", 17],
      ["user-rex", 7],
    ]);

    await resolveNFLPickEmWinnerRewards(NOW);

    expect(store.ledger).toHaveLength(1);
    expect(store.deactivated).toEqual(["camp-nfl-season"]);
  });

  it("does not resolve a season reward while the season's last week is unfinished", async () => {
    store.campaigns = [seasonCampaign()];

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.resolutions).toHaveLength(0);
    expect(store.deactivated).toEqual([]);
  });

  // ── Error isolation ───────────────────────────────────────────────────────

  it("keeps sweeping when one venue's standings fail to load", async () => {
    store.picks.push({ venue_id: "venue-2", starts_at: WEEK_A_FIRST_KICKOFF, sport_slug: "nfl" });
    store.campaigns = [makeCampaign(), makeCampaign({ id: "camp-nfl-2", venueIds: ["venue-2"] })];
    setStandings(`week:venue-2:${WEEK_A.id}`, [
      ["user-b1", 7],
      ["user-b2", 5],
      ["user-b3", 2],
    ]);
    getNFLPickEmLeaderboard.mockImplementationOnce(async () => {
      throw new Error("standings exploded");
    });

    const report = await resolveNFLPickEmWinnerRewards(NOW);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].message).toBe("standings exploded");
    // venue-2 still resolved.
    expect(report.resolutions).toHaveLength(1);
    expect(report.resolutions[0].venueId).toBe("venue-2");
  });
});
