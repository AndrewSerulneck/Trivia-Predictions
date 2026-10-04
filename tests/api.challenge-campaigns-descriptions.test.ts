import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeCampaign, ChallengeCampaignWin, ChallengeCampaignWinTerms } from "@/types";

// Reward descriptions are composed at READ time and attached server-side
// (attachRewardDescriptions, lib/rewards.ts — docs/reward-descriptions-plan.md
// Phase 2). Two things are pinned here:
//  1. the GET /api/challenge-campaigns payload carries `description` in BOTH
//     response branches (viewer snapshot and anonymous list);
//  2. the cost rule — at most ONE trivia_schedules read (venue-filtered) and ONE
//     nfl_pickem_weeks read per request however many rewards there are, none at
//     all when no reward needs them, and no per-campaign queries.
// Supabase is faked at the client so the REAL readers (listVenueLiveShowdownSchedules,
// listNFLSeasonWeekDates, getVenueTimezone) run and every table read is counted.

type Row = Record<string, unknown>;
type QueryLog = { table: string; ops: Array<[string, unknown[]]> };

const fake = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    errors: {} as Record<string, { message: string } | undefined>,
    log: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  };

  const matches = (row: Record<string, unknown>, ops: Array<[string, unknown[]]>): boolean =>
    ops.every(([op, args]) => {
      if (op === "eq") return row[String(args[0])] === args[1];
      if (op === "in") return (args[1] as unknown[]).includes(row[String(args[0])]);
      return true;
    });

  const from = (table: string) => {
    const entry = { table, ops: [] as Array<[string, unknown[]]> };
    state.log.push(entry);
    const result = () => {
      const error = state.errors[table];
      if (error) return { data: null, error };
      return { data: (state.rows[table] ?? []).filter((row) => matches(row, entry.ops)), error: null };
    };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "in", "eq", "neq", "or", "order", "limit", "returns", "gte", "lt"]) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push([op, args]);
        return builder;
      };
    }
    builder.maybeSingle = () => {
      const { data, error } = result();
      return Promise.resolve({ data: data?.[0] ?? null, error });
    };
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return builder;
  };

  return { state, client: { from, rpc: () => Promise.resolve({ data: null, error: null }) } };
});

const routeMocks = vi.hoisted(() => ({
  listChallengeCampaigns: vi.fn(),
  getChallengeCampaignSnapshotForUser: vi.fn(),
  attachLeaderboardSnapshotsToCampaigns: vi.fn(),
  listChallengeCampaignWinsForUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: fake.client }));
vi.mock("@/lib/challengeCampaigns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/challengeCampaigns")>()),
  listChallengeCampaigns: routeMocks.listChallengeCampaigns,
  getChallengeCampaignSnapshotForUser: routeMocks.getChallengeCampaignSnapshotForUser,
  attachLeaderboardSnapshotsToCampaigns: routeMocks.attachLeaderboardSnapshotsToCampaigns,
  listChallengeCampaignWinsForUser: routeMocks.listChallengeCampaignWinsForUser,
}));

import { GET } from "@/app/api/challenge-campaigns/route";
import { GET as GET_WINS } from "@/app/api/challenge-campaigns/redeem/route";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import {
  REWARD_NFL_WEEKS_CACHE_TTL_MS,
  REWARD_SCHEDULE_CACHE_TTL_MS,
  attachRewardDescriptions,
  clearRewardDescriptionCaches,
} from "@/lib/rewards";
import { clearVenueTimezoneCache } from "@/lib/timezone";

// ── Fixtures ────────────────────────────────────────────────────────────────

// Saturday 2026-10-03, 10:00 in Chicago — in season.
const NOW = new Date("2026-10-03T15:00:00.000Z");

/** Tuesdays at 8:00 PM Chicago (2026-09-01 is a Tuesday; 20:00 CDT = 01:00Z next day). */
const tuesdaySchedule = (overrides: Row = {}): Row => ({
  id: "sched-tue",
  title: "Tuesday Trivia",
  start_time: "2026-09-02T01:00:00.000Z",
  timezone: "America/Chicago",
  recurring_type: "weekly",
  recurring_days: ["tue"],
  num_rounds: 3,
  venue_id: "venue-1",
  intermission_ad_delay_seconds: 10,
  lobby_ad_enabled: true,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const NFL_2026_WEEKS: Row[] = [
  { season: 2026, week_number: 1, week_start_date: "2026-09-10", week_end_date: "2026-09-16" },
  { season: 2026, week_number: 2, week_start_date: "2026-09-17", week_end_date: "2026-09-23" },
  { season: 2026, week_number: 18, week_start_date: "2027-01-07", week_end_date: "2027-01-13" },
];

const campaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign & { progressPoints: number } => ({
  id: "camp-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  name: "Live Trivia Challenge",
  rules: "Win the Live Trivia game",
  venueIds: ["venue-1"],
  scheduleType: "single_day",
  activeDays: ["tue"],
  gameTypes: ["live-trivia"],
  challengeMode: "progress",
  leaderboardDisplayLimit: 10,
  leaderboardTiebreaker: "first_to_score",
  pointMultiplier: 1,
  pointsRequiredToWin: 1,
  recurringType: "weekly",
  winCondition: "game_winner",
  winnerQuota: 1,
  gameWinnerSlots: [{ scheduleId: "sched-tue", weekday: "tue" }],
  rewardDefinitionId: "live_trivia_challenge",
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 100,
  isActive: true,
  progressPoints: 0,
  ...overrides,
});

const nflWeekly = (overrides: Partial<ChallengeCampaign> = {}) =>
  campaign({
    id: "camp-nfl",
    name: "NFL Pick 'Em Challenge",
    rules: "Get the most NFL picks right at this venue",
    gameTypes: ["nfl-pickem"],
    activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
    gameWinnerSlots: null,
    rewardDefinitionId: "nfl_pickem_challenge",
    nflWeekScope: { kind: "weekly", season: 2026 },
    ...overrides,
  });

const legacy = () =>
  campaign({
    id: "camp-legacy",
    name: "Saturday Showdown",
    rules: "Earn the most points before last call on Saturday. Winner gets a $20 gift card.",
    rewardDefinitionId: null,
    gameWinnerSlots: null,
    winCondition: "points_threshold",
  });

const readsOf = (table: string): QueryLog[] => fake.state.log.filter((entry) => entry.table === table);

const getJson = async (query: string) => {
  const response = await GET(new Request(`http://localhost/api/challenge-campaigns?${query}`));
  return (await response.json()) as {
    ok: boolean;
    campaigns: Array<ChallengeCampaign & { upcomingStartDate?: string }>;
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // The guest route reuses schedule / NFL-week reads (F3); every test starts cold
  // so its read counts are its own.
  clearRewardDescriptionCaches();
  fake.state.rows = {
    trivia_schedules: [tuesdaySchedule(), tuesdaySchedule({ id: "sched-other", venue_id: "venue-2" })],
    nfl_pickem_weeks: NFL_2026_WEEKS,
    venues: [
      { id: "venue-1", timezone: "America/Chicago" },
      { id: "venue-2", timezone: "America/Denver" },
    ],
  };
  fake.state.errors = {};
  fake.state.log = [];
  routeMocks.attachLeaderboardSnapshotsToCampaigns.mockImplementation(
    async ({ campaigns }: { campaigns: unknown[] }) => campaigns,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Route payload ───────────────────────────────────────────────────────────

describe("GET /api/challenge-campaigns — description in the payload", () => {
  it("attaches a description on the viewer-snapshot branch", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign(), legacy()]);

    const body = await getJson("venueId=venue-1&userId=user-1");

    expect(body.ok).toBe(true);
    expect(body.campaigns[0].description).toEqual({
      summary: "Win Live Trivia on Tuesday night and win a $100 gift card.",
      when: "Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts.",
      fineprint: "One winner per game.",
      isCustom: false,
    });
    // A legacy, hand-written campaign keeps its own words, flagged as custom.
    expect(body.campaigns[1].description).toEqual({
      summary: "Earn the most points before last call on Saturday. Winner gets a $20 gift card.",
      when: null,
      fineprint: null,
      isCustom: true,
    });
  });

  it("attaches a description on the anonymous list branch", async () => {
    routeMocks.listChallengeCampaigns.mockResolvedValue([campaign(), nflWeekly()]);

    const body = await getJson("venueId=venue-1");

    expect(body.campaigns.map((entry) => entry.description?.summary)).toEqual([
      "Win Live Trivia on Tuesday night and win a $100 gift card.",
      "Get the most NFL picks right this week and win a $100 gift card.",
    ]);
    expect(body.campaigns[1].description?.when).toBe(
      "A new contest starts every Thursday of the NFL season. Make your picks before each game kicks off.",
    );
  });

  it("still carries an NFL reward's upcomingStartDate, from the same single read", async () => {
    vi.setSystemTime(new Date("2026-08-01T15:00:00.000Z")); // preseason
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([nflWeekly()]);

    const body = await getJson("venueId=venue-1&userId=user-1");

    expect(body.campaigns[0].upcomingStartDate).toBe("2026-09-10");
    expect(body.campaigns[0].description?.when).toBe("Starts Thu, Sep 10. Get your picks in early.");
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);
  });
});

// ── Cost rule ───────────────────────────────────────────────────────────────

describe("attachRewardDescriptions — query budget", () => {
  it("reads trivia_schedules once, venue-filtered, however many Live Trivia rewards there are", async () => {
    const many = Array.from({ length: 6 }, (_, index) => campaign({ id: `camp-${index}` }));

    const described = await attachRewardDescriptions(many, "venue-1", NOW);

    const reads = readsOf("trivia_schedules");
    expect(reads).toHaveLength(1);
    expect(reads[0].ops).toContainEqual(["in", ["venue_id", ["venue-1"]]]);
    // Long-ended one-offs are dropped in SQL so years of past games can never push
    // a venue's recurring schedule out of the row limit (cutoff = NOW − 24 h).
    expect(reads[0].ops).toContainEqual(["or", ["recurring_type.neq.none,start_time.gte.2026-10-02T15:00:00.000Z"]]);
    expect(described.every((entry) => entry.description.summary.startsWith("Win Live Trivia on Tuesday"))).toBe(true);
    // Nothing else was needed: no NFL reward, no quota filled.
    expect(fake.state.log.map((entry) => entry.table)).toEqual(["trivia_schedules"]);
  });

  it("reads nfl_pickem_weeks once for any number of rewards in the same season", async () => {
    await attachRewardDescriptions(
      [
        nflWeekly({ id: "a" }),
        nflWeekly({ id: "b" }),
        nflWeekly({ id: "c", recurringType: "none", nflWeekScope: { kind: "season", season: 2026, fromWeek: 5 } }),
      ],
      "venue-1",
      NOW,
    );

    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);
    expect(readsOf("trivia_schedules")).toHaveLength(0);
  });

  it("does no reads at all for legacy campaigns", async () => {
    const described = await attachRewardDescriptions([legacy(), legacy()], "venue-1", NOW);

    expect(fake.state.log).toEqual([]);
    expect(described[0].description.isCustom).toBe(true);
  });

  it("returns an empty list without touching the database", async () => {
    expect(await attachRewardDescriptions([], "venue-1", NOW)).toEqual([]);
    expect(fake.state.log).toEqual([]);
  });

  it("describes a cross-venue (admin) list from one read covering every venue", async () => {
    const described = await attachRewardDescriptions(
      [campaign({ id: "v1" }), campaign({ id: "v2", venueIds: ["venue-2"], gameWinnerSlots: [{ scheduleId: "sched-other", weekday: "tue" }] })],
      null,
      NOW,
    );

    const reads = readsOf("trivia_schedules");
    expect(reads).toHaveLength(1);
    expect(reads[0].ops).toContainEqual(["in", ["venue_id", ["venue-1", "venue-2"]]]);
    // Each reward resolved against its OWN venue's games.
    expect(described.map((entry) => entry.description.when)).toEqual([
      "Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts.",
      "Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts.",
    ]);
  });
});

// ── Degradation + state lines ───────────────────────────────────────────────

describe("attachRewardDescriptions — facts and fallbacks", () => {
  it("never shows a time when the schedule can't be read, and still answers", async () => {
    fake.state.errors.trivia_schedules = { message: "boom" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const [described] = await attachRewardDescriptions([campaign()], "venue-1", NOW);

    expect(described.description.summary).toBe("Win Live Trivia on Tuesday night and win a $100 gift card.");
    expect(described.description.when).toBe("Check the Live Trivia schedule for the next game.");
    expect(consoleError).toHaveBeenCalledWith("[RewardDescriptions] schedule-read-failed", expect.any(Error));
    consoleError.mockRestore();
  });

  it("drops the time when the pinned game no longer exists on the schedule", async () => {
    const [described] = await attachRewardDescriptions(
      [campaign({ gameWinnerSlots: [{ scheduleId: "sched-deleted", weekday: "tue" }] })],
      "venue-1",
      NOW,
    );

    expect(described.description.when).toBe("Check the Live Trivia schedule for the next game.");
  });

  it("ignores a one-off game that has already ended", async () => {
    fake.state.rows.trivia_schedules = [
      tuesdaySchedule({ id: "sched-past", recurring_type: "none", recurring_days: [], start_time: "2026-09-02T01:00:00.000Z" }),
    ];

    const [described] = await attachRewardDescriptions(
      [campaign({ recurringType: "none", activeDays: [], gameWinnerSlots: [{ scheduleId: "sched-past", weekday: "tue" }] })],
      "venue-1",
      NOW,
    );

    expect(described.description.when).toBe("Check the Live Trivia schedule for the next game.");
  });

  it("says when the next contest starts once this cycle's quota is filled, in the venue's zone", async () => {
    const [described] = await attachRewardDescriptions(
      [
        campaign({
          winCondition: "points_threshold",
          pointsRequiredToWin: 500,
          gameWinnerSlots: null,
          quotaRemaining: 0,
        }),
      ],
      "venue-1",
      NOW,
    );

    // Weekly cycle anchored Tuesday 00:00 Chicago; Sat Oct 3 → next is Tue Oct 6.
    expect(described.description.when).toBe("Next contest starts Tue, Oct 6.");
    expect(readsOf("venues")).toHaveLength(1);
  });

  it("does not read the venue timezone while quota remains", async () => {
    await attachRewardDescriptions(
      [campaign({ id: "tz-check", venueIds: ["venue-2"], quotaRemaining: 1 })],
      "venue-2",
      NOW,
    );

    expect(readsOf("venues")).toHaveLength(0);
  });

  it("says the season is over for a weekly NFL reward after the last week ends", async () => {
    const [described] = await attachRewardDescriptions(
      [nflWeekly()],
      "venue-1",
      new Date("2027-02-20T15:00:00.000Z"),
    );

    expect(described.description.when).toBe("Back when the NFL season starts.");
  });

  it("never says 'this venue' or 'Awarded to the winner' in any attached description", async () => {
    const described = await attachRewardDescriptions(
      [campaign(), nflWeekly(), nflWeekly({ id: "t", winCondition: "points_threshold", pointsRequiredToWin: 25, winnerQuota: 3 })],
      "venue-1",
      NOW,
    );

    for (const { description } of described) {
      const text = [description.summary, description.when, description.fineprint].join(" ");
      expect(text).not.toMatch(/this venue|Awarded to the winner/i);
    }
  });
});

// ── Polling cost (review-fixes plan F3 / D2) ────────────────────────────────

describe("F3 — the 30-second venue poll reuses recent schedule / NFL-week reads", () => {
  const atSeconds = (seconds: number) => vi.setSystemTime(new Date(NOW.getTime() + seconds * 1000));

  it("one player polling for an hour costs 12 schedule reads and 6 NFL-week reads, not 120 + 120", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign(), nflWeekly()]);

    for (let poll = 0; poll < 120; poll += 1) {
      atSeconds(poll * 30);
      const body = await getJson("venueId=venue-1&userId=user-1");
      expect(body.campaigns[0].description?.when).toBe(
        "Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts.",
      );
    }

    expect(readsOf("trivia_schedules")).toHaveLength(12);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(6);
  });

  it("serves both caches within their TTLs on both route branches, and re-reads after", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign(), nflWeekly()]);
    routeMocks.listChallengeCampaigns.mockResolvedValue([campaign(), nflWeekly()]);

    await getJson("venueId=venue-1&userId=user-1");
    atSeconds(REWARD_SCHEDULE_CACHE_TTL_MS / 1000 - 1);
    await getJson("venueId=venue-1");
    expect(readsOf("trivia_schedules")).toHaveLength(1);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);

    atSeconds(REWARD_SCHEDULE_CACHE_TTL_MS / 1000);
    await getJson("venueId=venue-1&userId=user-1");
    expect(readsOf("trivia_schedules")).toHaveLength(2);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);

    atSeconds(REWARD_NFL_WEEKS_CACHE_TTL_MS / 1000);
    await getJson("venueId=venue-1&userId=user-1");
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(2);
  });

  it("picks up a partner's new game time once the schedule entry expires", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign()]);

    await getJson("venueId=venue-1&userId=user-1");
    // 9:00 PM Chicago instead of 8:00 PM.
    fake.state.rows.trivia_schedules = [tuesdaySchedule({ start_time: "2026-09-02T02:00:00.000Z" })];

    atSeconds(60);
    const stale = await getJson("venueId=venue-1&userId=user-1");
    expect(stale.campaigns[0].description?.when).toContain("8:00 PM");

    atSeconds(REWARD_SCHEDULE_CACHE_TTL_MS / 1000);
    const fresh = await getJson("venueId=venue-1&userId=user-1");
    expect(fresh.campaigns[0].description?.when).toContain("9:00 PM");
  });

  it("never caches a failed schedule read: the next poll retries, and the wording recovers", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign()]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.state.errors.trivia_schedules = { message: "boom" };

    const failed = await getJson("venueId=venue-1&userId=user-1");
    expect(failed.campaigns[0].description?.when).toBe("Check the Live Trivia schedule for the next game.");

    fake.state.errors = {};
    atSeconds(30);
    const recovered = await getJson("venueId=venue-1&userId=user-1");
    expect(recovered.campaigns[0].description?.when).toContain("8:00 PM every Tuesday");
    expect(readsOf("trivia_schedules")).toHaveLength(2);

    atSeconds(60);
    await getJson("venueId=venue-1&userId=user-1");
    expect(readsOf("trivia_schedules")).toHaveLength(2);
    consoleError.mockRestore();
  });

  it("never caches an empty NFL season (a failed weeks read looks the same)", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([nflWeekly()]);
    fake.state.errors.nfl_pickem_weeks = { message: "boom" };

    await getJson("venueId=venue-1&userId=user-1");
    fake.state.errors = {};
    atSeconds(30);
    await getJson("venueId=venue-1&userId=user-1");
    atSeconds(60);
    await getJson("venueId=venue-1&userId=user-1");

    expect(readsOf("nfl_pickem_weeks")).toHaveLength(2);
  });

  it("keys the schedule cache by the sorted venue ids", async () => {
    const pair = (first: string, second: string) => [
      campaign({ id: "a", venueIds: [first] }),
      campaign({ id: "b", venueIds: [second], gameWinnerSlots: null }),
    ];

    await attachRewardDescriptions(pair("venue-2", "venue-1"), null, NOW, { cachedReads: true });
    await attachRewardDescriptions(pair("venue-1", "venue-2"), null, NOW, { cachedReads: true });
    expect(readsOf("trivia_schedules")).toHaveLength(1);
    expect(readsOf("trivia_schedules")[0].ops).toContainEqual(["in", ["venue_id", ["venue-1", "venue-2"]]]);

    await attachRewardDescriptions([campaign()], "venue-1", NOW, { cachedReads: true });
    expect(readsOf("trivia_schedules")).toHaveLength(2);
  });

  it("admin / partner lists (no cachedReads) always read fresh, and refresh what the poll reuses", async () => {
    await attachRewardDescriptions([campaign(), nflWeekly()], "venue-1", NOW);
    await attachRewardDescriptions([campaign(), nflWeekly()], "venue-1", NOW);
    expect(readsOf("trivia_schedules")).toHaveLength(2);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(2);

    await attachRewardDescriptions([campaign(), nflWeekly()], "venue-1", NOW, { cachedReads: true });
    expect(readsOf("trivia_schedules")).toHaveLength(2);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(2);
  });

  it("shares one in-flight read between concurrent polls", async () => {
    routeMocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([campaign(), nflWeekly()]);

    await Promise.all(Array.from({ length: 5 }, () => getJson("venueId=venue-1&userId=user-1")));

    expect(readsOf("trivia_schedules")).toHaveLength(1);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);
  });

  it("drops a cached one-off game the moment it ends, without a re-read", async () => {
    const durationMs = liveTriviaDurationMinutes(3) * 60_000;
    // Started so that it ends 2 minutes after NOW — inside the 5-minute schedule TTL.
    const startTime = new Date(NOW.getTime() - durationMs + 2 * 60_000).toISOString();
    fake.state.rows.trivia_schedules = [
      tuesdaySchedule({ id: "sched-once", recurring_type: "none", recurring_days: [], start_time: startTime }),
    ];
    const oneOff = campaign({
      recurringType: "none",
      activeDays: [],
      gameWinnerSlots: [{ scheduleId: "sched-once", weekday: "sat" }],
    });

    const [during] = await attachRewardDescriptions([oneOff], "venue-1", NOW, { cachedReads: true });
    expect(during.description.when).not.toBe("Check the Live Trivia schedule for the next game.");

    const later = new Date(NOW.getTime() + 3 * 60_000);
    vi.setSystemTime(later);
    const [after] = await attachRewardDescriptions([oneOff], "venue-1", later, { cachedReads: true });
    expect(after.description.when).toBe("Check the Live Trivia schedule for the next game.");
    expect(readsOf("trivia_schedules")).toHaveLength(1);
  });
});

// ── Prize-wallet coupons: what the guest won it FOR ─────────────────────────

describe("GET /api/challenge-campaigns/redeem — winDescription", () => {
  const terms = (overrides: Partial<ChallengeCampaignWinTerms> = {}): ChallengeCampaignWinTerms => ({
    rewardDefinitionId: "live_trivia_challenge",
    winCondition: "game_winner",
    recurringType: "weekly",
    pointsRequiredToWin: 1,
    activeDays: ["tue"],
    winnerQuota: 1,
    nflWeekScope: null,
    ...overrides,
  });

  const win = (overrides: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
    challengeId: "camp-1",
    venueId: "venue-1",
    challengeName: "Live Trivia Challenge",
    challengeRules: "Win the Live Trivia game",
    winnerUserId: "user-1",
    // Tuesday Sep 29 2026, 8:00 PM Chicago — the game's own start instant.
    cycleStart: "2026-09-30T01:00:00.000Z",
    rewardTerms: terms(),
    ...overrides,
  });

  const getWins = async () => {
    const response = await GET_WINS(
      new Request("http://localhost/api/challenge-campaigns/redeem?userId=user-1&venueId=venue-1"),
    );
    return ((await response.json()) as { wins: ChallengeCampaignWin[] }).wins;
  };

  it("dates a Live Trivia game win in the venue's zone", async () => {
    routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([win()]);

    const [coupon] = await getWins();

    expect(coupon.winDescription).toBe("You won Live Trivia on Tue, Sep 29");
    // At most the venue's timezone (cached per server instance, so an earlier
    // test in this file may already have paid for it) — nothing per coupon.
    expect(fake.state.log.every((entry) => entry.table === "venues")).toBe(true);
    expect(fake.state.log.length).toBeLessThanOrEqual(1);
  });

  it("names the NFL week a weekly win belongs to, from one weeks read", async () => {
    const nfl = terms({
      rewardDefinitionId: "nfl_pickem_challenge",
      activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
      nflWeekScope: { kind: "weekly", season: 2026 },
    });
    routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([
      // Thu Sep 17 2026 00:00 Chicago — the start of Week 2's cycle.
      win({ challengeId: "camp-nfl", cycleStart: "2026-09-17T05:00:00.000Z", rewardTerms: nfl }),
      win({ challengeId: "camp-nfl", cycleStart: "2026-09-10T05:00:00.000Z", rewardTerms: nfl }),
    ]);

    const coupons = await getWins();

    expect(coupons.map((coupon) => coupon.winDescription)).toEqual([
      "You got the most NFL picks right in Week 2",
      "You got the most NFL picks right in Week 1",
    ]);
    expect(readsOf("nfl_pickem_weeks")).toHaveLength(1);
  });

  describe("F7 — a Live Trivia game win is dated in its schedule's zone", () => {
    // Wed Oct 7 2026, 11:30 PM Central = Thu 04:30Z: Thursday in the venue's
    // New York zone, Wednesday where the game was actually played.
    const lateCentralWin = (overrides: Partial<ChallengeCampaignWin> = {}) =>
      win({
        cycleStart: "2026-10-08T04:30:00.000Z",
        rewardTerms: terms({ gameWinnerSlots: [{ scheduleId: "sched-late", weekday: "wed" }] }),
        ...overrides,
      });

    beforeEach(() => {
      clearVenueTimezoneCache();
      fake.state.rows.venues = [{ id: "venue-1", timezone: "America/New_York" }];
      fake.state.rows.trivia_schedules = [
        tuesdaySchedule({ id: "sched-late", timezone: "America/Chicago" }),
        tuesdaySchedule({ id: "sched-east", timezone: "America/New_York" }),
      ];
    });
    afterEach(() => clearVenueTimezoneCache());

    it("uses the pinned game's schedule zone, from ONE trivia_schedules read for every coupon", async () => {
      routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([
        lateCentralWin(),
        lateCentralWin({ challengeId: "camp-2" }),
        lateCentralWin({ challengeId: "camp-3" }),
      ]);

      const coupons = await getWins();

      expect(coupons.map((coupon) => coupon.winDescription)).toEqual([
        "You won Live Trivia on Wed, Oct 7",
        "You won Live Trivia on Wed, Oct 7",
        "You won Live Trivia on Wed, Oct 7",
      ]);
      const reads = readsOf("trivia_schedules");
      expect(reads).toHaveLength(1);
      expect(reads[0].ops).toContainEqual(["in", ["id", ["sched-late"]]]);
    });

    it("falls back to the venue's zone when the schedule read fails", async () => {
      fake.state.errors.trivia_schedules = { message: "boom" };
      routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([lateCentralWin()]);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const [coupon] = await getWins();

      expect(coupon.winDescription).toBe("You won Live Trivia on Thu, Oct 8");
      expect(errorSpy).toHaveBeenCalledWith("[RewardDescriptions] schedule-timezone-read-failed", expect.any(Error));
      errorSpy.mockRestore();
    });

    it("falls back to the venue's zone when the pinned games' schedules disagree", async () => {
      routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([
        lateCentralWin({
          rewardTerms: terms({
            gameWinnerSlots: [
              { scheduleId: "sched-late", weekday: "wed" },
              { scheduleId: "sched-east", weekday: "wed" },
            ],
          }),
        }),
      ]);

      const [coupon] = await getWins();

      expect(coupon.winDescription).toBe("You won Live Trivia on Thu, Oct 8");
    });

    it("reads no schedule for an unpinned game-winner, a points reward or an NFL reward", async () => {
      routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([
        lateCentralWin({ rewardTerms: terms({ gameWinnerSlots: null }) }),
        lateCentralWin({
          rewardTerms: terms({ winCondition: "points_threshold", recurringType: "daily", pointsRequiredToWin: 500 }),
        }),
        lateCentralWin({
          rewardTerms: terms({
            rewardDefinitionId: "nfl_pickem_challenge",
            // Keeps the inherited pinned slot: an NFL reward must still not read schedules.
            nflWeekScope: { kind: "season", season: 2026, fromWeek: 1 },
          }),
        }),
      ]);

      const coupons = await getWins();

      expect(coupons.map((coupon) => coupon.winDescription)).toEqual([
        "You won Live Trivia on Thu, Oct 8",
        "You earned 500 points in Live Trivia on Thu, Oct 8",
        "You got the most NFL picks right in the 2026 season",
      ]);
      expect(readsOf("trivia_schedules")).toHaveLength(0);
    });
  });

  it("leaves a deleted or legacy reward's coupon on 'Won from' with no reads", async () => {
    routeMocks.listChallengeCampaignWinsForUser.mockResolvedValue([
      win({ challengeId: null, rewardTerms: null }),
      win({ rewardTerms: terms({ rewardDefinitionId: null }) }),
    ]);

    const coupons = await getWins();

    expect(coupons.map((coupon) => coupon.winDescription)).toEqual([null, null]);
    expect(fake.state.log).toEqual([]);
  });
});
