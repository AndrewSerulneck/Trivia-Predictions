import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeCampaign } from "@/types";

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): lib/ownerHistory.ts reads ONE venue's
// history (its own schedules, ledger rows with venue_id = that venue), names players by username only,
// and names no winner for a game still being played.

type Call = { table: string; method: string; args: unknown[] };

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  tables: {} as Record<string, unknown[]>,
  rpc: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  rpcArgs: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

const fns = vi.hoisted(() => ({
  listChallengeCampaignsByIds: vi.fn(async (_ids: readonly string[]): Promise<unknown[]> => []),
  loadLiveTriviaSchedulesForVenues: vi.fn(async (_ids: string[]): Promise<unknown[]> => []),
  enumerateScheduleOccurrences: vi.fn((_row: unknown, _now: number): Array<{ occurrenceDate: string; endMs: number }> => []),
  loadLiveTriviaWeekTotals: vi.fn(async (_games: unknown[]): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ listChallengeCampaignsByIds: fns.listChallengeCampaignsByIds }));
vi.mock("@/lib/liveShowdownEngine", () => ({
  loadLiveTriviaSchedulesForVenues: fns.loadLiveTriviaSchedulesForVenues,
  enumerateScheduleOccurrences: fns.enumerateScheduleOccurrences,
}));
vi.mock("@/lib/liveTriviaWeekTotals", () => ({
  LiveTriviaWeekTotalsMissingError: class LiveTriviaWeekTotalsMissingError extends Error {},
  loadLiveTriviaWeekTotals: fns.loadLiveTriviaWeekTotals,
}));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: async () => "America/New_York" }));
vi.mock("@/lib/supabaseAdmin", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "gt", "gte", "or", "order", "limit", "returns"]) {
      self[method] = (...args: unknown[]) => {
        state.calls.push({ table, method, args });
        return self;
      };
    }
    self.then = (resolve: (value: unknown) => unknown) => resolve({ data: state.tables[table] ?? [], error: null });
    return self;
  };
  return {
    supabaseAdmin: {
      from: (table: string) => builder(table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcArgs.push({ name, args });
        return state.rpc[name] ?? { data: [], error: null };
      },
    },
  };
});

import {
  OwnerHistoryNotFoundError,
  OwnerHistoryUnavailableError,
  getOwnerGameDetail,
  getOwnerRewardDetail,
  listOwnerGameHistory,
  listOwnerRewardHistory,
} from "@/lib/ownerHistory";

const PLAYER_A = "11111111-1111-1111-1111-111111111111";
const PLAYER_B = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-10-14T16:00:00Z");

const schedule = (id: string, venueId: string) => ({
  id,
  title: "Weekday Trivia",
  start_time: "2026-08-05T23:00:00Z",
  timezone: "America/New_York",
  recurring_type: "weekly",
  recurring_days: ["wed", "thu", "fri"],
  num_rounds: 14,
  venue_id: venueId,
  intermission_ad_delay_seconds: 0,
  lobby_ad_enabled: false,
});

const giftPlace = (place: number, dollars: number) => ({
  place,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: dollars,
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizePosValueCents: null,
  prizePosDelivery: null,
});

const rankedCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Weekly Trivia Champions",
    winCondition: "ranked_places",
    rewardDefinitionId: "live_trivia_challenge",
    pointsRequiredToWin: 0,
    winnerQuota: 3,
    recurringType: "weekly",
    isActive: true,
    winnerUserId: null,
    venueIds: ["venue-1"],
    placePrizes: [
      giftPlace(1, 30),
      giftPlace(2, 20),
      giftPlace(3, 10),
    ],
    ...overrides,
  }) as unknown as ChallengeCampaign;

const callsOn = (table: string): Call[] => state.calls.filter((call) => call.table === table);

beforeEach(() => {
  state.calls = [];
  state.tables = {};
  state.rpc = {};
  state.rpcArgs = [];
  for (const fn of Object.values(fns)) fn.mockReset();
  fns.listChallengeCampaignsByIds.mockResolvedValue([]);
  fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([]);
  fns.enumerateScheduleOccurrences.mockReturnValue([]);
  fns.loadLiveTriviaWeekTotals.mockResolvedValue([]);
});

describe("listOwnerGameHistory", () => {
  it("asks only for this venue's schedules and names the top scorers by username", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1"), schedule("sched-x", "venue-2")]);
    state.rpc.live_trivia_occurrence_summaries = {
      data: [{ schedule_id: "sched-1", occurrence_date: "2026-10-09", player_count: 5, top_points: 90, top_user_ids: [PLAYER_A, PLAYER_B] }],
      error: null,
    };
    state.tables.users = [
      { id: PLAYER_A, username: "murph" },
      { id: PLAYER_B, username: "kellygurl" },
    ];
    const page = await listOwnerGameHistory({ venueId: "venue-1", before: "2026-10-14", nowMs: NOW });
    expect(state.rpcArgs[0]).toEqual({
      name: "live_trivia_occurrence_summaries",
      args: { p_schedule_ids: ["sched-1"], p_before: "2026-10-14", p_limit: 20 },
    });
    expect(page.games).toEqual([
      {
        scheduleId: "sched-1",
        occurrenceDate: "2026-10-09",
        scheduleName: "Weekday Trivia",
        playerCount: 5,
        inProgress: false,
        topPoints: 90,
        winners: ["murph", "kellygurl"],
      },
    ]);
    expect(page.nextBefore).toBeNull();
    // No player id ever reaches the browser.
    expect(JSON.stringify(page)).not.toContain(PLAYER_A);
  });

  it("names no winner for a game still being played", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1")]);
    fns.enumerateScheduleOccurrences.mockReturnValue([{ occurrenceDate: "2026-10-14", endMs: NOW + 60_000 }]);
    state.rpc.live_trivia_occurrence_summaries = {
      data: [{ schedule_id: "sched-1", occurrence_date: "2026-10-14", player_count: 3, top_points: 40, top_user_ids: [PLAYER_A] }],
      error: null,
    };
    const page = await listOwnerGameHistory({ venueId: "venue-1", nowMs: NOW });
    expect(page.games[0]).toEqual(expect.objectContaining({ inProgress: true, winners: [], topPoints: 0 }));
  });

  it("sends the venue's first game date with the first page only, probing each schedule past the 1970 sentinel", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1")]);
    state.tables.live_showdown_answers = [{ occurrence_date: "2026-08-05" }];
    const first = await listOwnerGameHistory({ venueId: "venue-1", nowMs: NOW });
    expect(first.firstGameDate).toBe("2026-08-05");
    const probe = callsOn("live_showdown_answers");
    expect(probe).toContainEqual({ table: "live_showdown_answers", method: "eq", args: ["schedule_id", "sched-1"] });
    expect(probe).toContainEqual({ table: "live_showdown_answers", method: "gt", args: ["occurrence_date", "1970-01-01"] });
    expect(probe).toContainEqual({ table: "live_showdown_answers", method: "limit", args: [1] });

    state.calls = [];
    const later = await listOwnerGameHistory({ venueId: "venue-1", before: "2026-10-01", nowMs: NOW });
    expect(later).not.toHaveProperty("firstGameDate");
    expect(callsOn("live_showdown_answers")).toEqual([]);
  });

  it("returns an empty page without calling the RPC when the venue has no games", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-x", "venue-2")]);
    expect(await listOwnerGameHistory({ venueId: "venue-1", nowMs: NOW })).toEqual({ games: [], nextBefore: null });
    expect(state.rpcArgs).toEqual([]);
  });

  it("throws Unavailable while the RPC isn't deployed", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1")]);
    state.rpc.live_trivia_occurrence_summaries = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.live_trivia_occurrence_summaries" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listOwnerGameHistory({ venueId: "venue-1", nowMs: NOW })).rejects.toBeInstanceOf(OwnerHistoryUnavailableError);
    spy.mockRestore();
  });
});

describe("getOwnerGameDetail", () => {
  it("refuses a schedule that isn't this venue's (404), without reading scores", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-x", "venue-2")]);
    await expect(
      getOwnerGameDetail({ venueId: "venue-1", scheduleId: "sched-x", occurrenceDate: "2026-10-09", nowMs: NOW }),
    ).rejects.toBeInstanceOf(OwnerHistoryNotFoundError);
    expect(fns.loadLiveTriviaWeekTotals).not.toHaveBeenCalled();
  });

  it("answers 'not available yet' while the totals RPC isn't deployed", async () => {
    const { LiveTriviaWeekTotalsMissingError } = await import("@/lib/liveTriviaWeekTotals");
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1")]);
    fns.loadLiveTriviaWeekTotals.mockRejectedValue(new LiveTriviaWeekTotalsMissingError("missing"));
    await expect(
      getOwnerGameDetail({ venueId: "venue-1", scheduleId: "sched-1", occurrenceDate: "2026-10-09", nowMs: NOW }),
    ).rejects.toBeInstanceOf(OwnerHistoryUnavailableError);
  });

  it("refuses a malformed date (404)", async () => {
    await expect(
      getOwnerGameDetail({ venueId: "venue-1", scheduleId: "sched-1", occurrenceDate: "yesterday", nowMs: NOW }),
    ).rejects.toBeInstanceOf(OwnerHistoryNotFoundError);
  });

  it("ranks scorers by username, counting 0-point players only in the total", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule("sched-1", "venue-1")]);
    fns.loadLiveTriviaWeekTotals.mockResolvedValue([
      { userId: PLAYER_A, totalPoints: 90, reachedAt: "2026-10-10T01:00:00Z" },
      { userId: PLAYER_B, totalPoints: 0, reachedAt: null },
    ]);
    state.tables.users = [{ id: PLAYER_A, username: "murph" }];
    const detail = await getOwnerGameDetail({ venueId: "venue-1", scheduleId: "sched-1", occurrenceDate: "2026-10-09", nowMs: NOW });
    expect(fns.loadLiveTriviaWeekTotals).toHaveBeenCalledWith([{ scheduleId: "sched-1", occurrenceDate: "2026-10-09" }]);
    expect(detail.playerCount).toBe(2);
    expect(detail.standings).toEqual([{ rank: 1, username: "murph", points: 90 }]);
    expect(JSON.stringify(detail)).not.toContain(PLAYER_A);
  });
});

describe("listOwnerRewardHistory", () => {
  const OLDER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const summary = (id: string, at: string, winners: unknown[] = []) => ({
    challenge_id: id,
    last_cycle_start: "2026-10-07T04:00:00+00:00",
    last_activity_at: at,
    cycle_count: 10,
    last_winners: winners,
  });

  it("pages in SQL for this venue, reads only that page's rewards by id, and names winners by username", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([rankedCampaign(), rankedCampaign({ id: OLDER_ID, name: "Older" })]);
    state.rpc.challenge_reward_history_summaries = {
      data: [
        summary("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "2026-10-10 02:00:00.123456+00", [
          { user_id: PLAYER_A, place: 1, points: 90 },
          { user_id: null, place: 2, points: 10 },
        ]),
        summary(OLDER_ID, "2026-09-05 02:00:00+00"),
      ],
      error: null,
    };
    state.tables.users = [{ id: PLAYER_A, username: "murph" }];
    const page = await listOwnerRewardHistory({ venueId: "venue-1", nowMs: NOW });
    expect(state.rpcArgs[0]).toEqual({
      name: "challenge_reward_history_summaries",
      args: { p_venue_id: "venue-1", p_before_at: null, p_before_id: null, p_limit: 20 },
    });
    expect(fns.listChallengeCampaignsByIds).toHaveBeenCalledWith(["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", OLDER_ID]);
    expect(page.rewards.map((row) => row.name)).toEqual(["Weekly Trivia Champions", "Older"]);
    expect(page.rewards[0]).toEqual(
      expect.objectContaining({
        howWon: "Top 3 players each week",
        cycleCount: 10,
        lastCycleLabel: "Week of Wed, Oct 7",
        lastWinners: [
          { place: 1, username: "murph", points: 90 },
          { place: 2, username: null, points: 10 },
        ],
      }),
    );
    expect(page.nextBefore).toBeNull();
    expect(JSON.stringify(page)).not.toContain(PLAYER_A);
  });

  it("returns a cursor with the RPC's exact timestamp when an extra row says more exist, and passes it back", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, "0")}`);
    fns.listChallengeCampaignsByIds.mockImplementation(async (wanted: readonly string[]) => wanted.map((id) => rankedCampaign({ id })));
    state.rpc.challenge_reward_history_summaries = {
      data: ids.map((id, i) => summary(id, `2026-10-${String(30 - i).padStart(2, "0")} 02:00:00.123456+00`)),
      error: null,
    };
    const page = await listOwnerRewardHistory({ venueId: "venue-1", nowMs: NOW });
    expect(page.rewards).toHaveLength(20);
    expect(fns.listChallengeCampaignsByIds.mock.calls[0]?.[0]).toHaveLength(20);
    expect(page.nextBefore).toBe(`2026-10-11 02:00:00.123456+00_${ids[19]}`);

    state.rpcArgs = [];
    state.rpc.challenge_reward_history_summaries = { data: [], error: null };
    await listOwnerRewardHistory({ venueId: "venue-1", before: page.nextBefore, nowMs: NOW });
    expect(state.rpcArgs[0]?.args).toEqual(
      expect.objectContaining({ p_before_at: "2026-10-11 02:00:00.123456+00", p_before_id: ids[19] }),
    );
  });
});

describe("getOwnerRewardDetail", () => {
  it("refuses an unknown reward (404) without reading any history", async () => {
    await expect(
      getOwnerRewardDetail({ venueId: "venue-1", rewardId: "cccccccc-cccc-cccc-cccc-cccccccccccc", nowMs: NOW }),
    ).rejects.toBeInstanceOf(OwnerHistoryNotFoundError);
    expect(state.calls).toEqual([]);
  });

  it("refuses another venue's reward that never paid here (404)", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([rankedCampaign({ venueIds: ["venue-2"] } as Partial<ChallengeCampaign>)]);
    await expect(
      getOwnerRewardDetail({ venueId: "venue-1", rewardId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", nowMs: NOW }),
    ).rejects.toBeInstanceOf(OwnerHistoryNotFoundError);
  });

  it("drops a ledger cycle that may be only partly read when the read hits its limit", async () => {
    // A points-target reward with quota 1 reads 52 × 1 + 1 = 53 ledger rows at most.
    fns.listChallengeCampaignsByIds.mockResolvedValue([
      rankedCampaign({ winCondition: "points_threshold", winnerQuota: 1, placePrizes: null } as Partial<ChallengeCampaign>),
    ]);
    const week = (i: number) => new Date(Date.parse("2026-10-07T04:00:00Z") - i * 7 * 86_400_000).toISOString();
    state.tables.challenge_cycle_winners = Array.from({ length: 53 }, (_, i) => ({
      cycle_start: week(Math.min(i, 51)), // the last two rows share the oldest cycle read
      winner_user_id: PLAYER_A,
      points_earned: 500,
      finalized_at: week(Math.min(i, 51)),
      place: null,
    }));
    const detail = await getOwnerRewardDetail({ venueId: "venue-1", rewardId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", nowMs: NOW });
    expect(detail.cycles).toHaveLength(51);
    expect(detail.cycles.every((cycle) => cycle.winners.length === 1)).toBe(true);
    expect(detail.truncated).toBe(true);
  });

  it("says nothing about redemption for a player who deleted their account", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([rankedCampaign()]);
    state.tables.challenge_cycle_winners = [
      { cycle_start: "2026-10-07T04:00:00Z", winner_user_id: null, points_earned: 90, finalized_at: "2026-10-10T02:00:00Z", place: 1 },
    ];
    const detail = await getOwnerRewardDetail({ venueId: "venue-1", rewardId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", nowMs: NOW });
    expect(detail.cycles[0]?.winners[0]).toEqual(expect.objectContaining({ username: null, redeemed: null }));
  });

  it("reads only this venue's ledger and weeks, with prize, redemption and why a week paid nobody", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([rankedCampaign({ minPlayers: 4 } as Partial<ChallengeCampaign>)]);
    state.tables.challenge_cycle_winners = [
      { cycle_start: "2026-10-07T04:00:00Z", winner_user_id: PLAYER_A, points_earned: 90, finalized_at: "2026-10-10T02:00:00Z", place: 1 },
      { cycle_start: "2026-10-07T04:00:00Z", winner_user_id: PLAYER_B, points_earned: 10, finalized_at: "2026-10-10T02:00:00Z", place: 2 },
    ];
    state.tables.challenge_cycle_settlements = [
      { cycle_start: "2026-10-07T04:00:00Z", outcome: "awarded", participant_count: 5, min_players: null, settled_at: "2026-10-10T02:00:00Z" },
      { cycle_start: "2026-09-30T04:00:00Z", outcome: "below_minimum", participant_count: 2, min_players: 4, settled_at: "2026-10-03T02:00:00Z" },
    ];
    state.tables.challenge_campaign_redemptions = [
      { winner_user_id: PLAYER_A, cycle_start: "2026-10-07T04:00:00Z", prize_redeemed_at: "2026-10-11T00:00:00Z" },
      { winner_user_id: PLAYER_B, cycle_start: "2026-10-07T04:00:00Z", prize_redeemed_at: null },
    ];
    state.tables.users = [
      { id: PLAYER_A, username: "murph" },
      { id: PLAYER_B, username: "kellygurl" },
    ];
    const detail = await getOwnerRewardDetail({ venueId: "venue-1", rewardId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", nowMs: NOW });

    for (const table of ["challenge_cycle_winners", "challenge_cycle_settlements", "challenge_campaign_redemptions"]) {
      expect(callsOn(table).filter((call) => call.method === "eq").map((call) => call.args)).toContainEqual(["venue_id", "venue-1"]);
    }
    expect(detail.cycles).toHaveLength(2);
    expect(detail.cycles[0]).toEqual(
      expect.objectContaining({
        label: "Week of Wed, Oct 7",
        winners: [
          expect.objectContaining({ place: 1, username: "murph", points: 90, redeemed: true }),
          expect.objectContaining({ place: 2, username: "kellygurl", points: 10, redeemed: false }),
        ],
      }),
    );
    expect(detail.cycles[0]?.winners[0]?.prize).toMatch(/\$30/);
    expect(detail.cycles[1]?.winners).toEqual([]);
    expect(detail.cycles[1]?.note).toMatch(/2/);
    expect(detail.truncated).toBe(false);
    expect(JSON.stringify(detail)).not.toContain(PLAYER_A);
  });
});
