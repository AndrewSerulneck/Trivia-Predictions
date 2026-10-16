import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeCampaign } from "@/types";

// docs/partner-results-page-plan.md §5a/§5b: the two server sources of the Results timeline.
// The Live Trivia adapter reads only the venue's own schedules; the reward source reads only ledger
// and settlement rows with venue_id = the venue, in a bounded date window. Neither ever returns a
// player id.

type Call = { table: string; method: string; args: unknown[] };

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  tables: {} as Record<string, unknown[]>,
  rpc: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
}));

const fns = vi.hoisted(() => ({
  listChallengeCampaignsByIds: vi.fn(async (_ids: readonly string[]): Promise<unknown[]> => []),
  listScheduleTimezones: vi.fn(async (_ids: readonly string[]): Promise<Map<string, string>> => new Map()),
  loadLiveTriviaSchedulesForVenues: vi.fn(async (_ids: string[]): Promise<unknown[]> => []),
  enumerateScheduleOccurrences: vi.fn(
    (_row: unknown, _now: number): Array<{ occurrenceDate: string; startMs: number; endMs: number }> => [],
  ),
  loadLiveTriviaWeekTotals: vi.fn(async (_games: unknown[]): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ listChallengeCampaignsByIds: fns.listChallengeCampaignsByIds }));
vi.mock("@/lib/liveShowdownAdmin", () => ({ listScheduleTimezones: fns.listScheduleTimezones }));
vi.mock("@/lib/liveShowdownEngine", () => ({
  loadLiveTriviaSchedulesForVenues: fns.loadLiveTriviaSchedulesForVenues,
  enumerateScheduleOccurrences: fns.enumerateScheduleOccurrences,
}));
vi.mock("@/lib/liveTriviaWeekTotals", () => ({
  LiveTriviaWeekTotalsMissingError: class LiveTriviaWeekTotalsMissingError extends Error {},
  loadLiveTriviaWeekTotals: fns.loadLiveTriviaWeekTotals,
}));
vi.mock("@/lib/supabaseAdmin", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "gt", "lt", "gte", "or", "order", "limit", "returns"]) {
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
      rpc: async (name: string) => state.rpc[name] ?? { data: [], error: null },
    },
  };
});

import { liveTriviaResultsAdapter, parseLiveTriviaGameKey } from "@/lib/results/adapters/liveTrivia";
import { ResultsNotFoundError } from "@/lib/results/errors";
import { createVenueRewardSource } from "@/lib/results/rewardSource";

const PLAYER_A = "11111111-1111-1111-1111-111111111111";
const PLAYER_B = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-10-16T16:00:00Z");
const SCHED = "78a0e374-f3f1-4605-af35-89deb8040660";

const schedule = (id: string, venueId: string) => ({
  id,
  title: "Weekday Trivia",
  start_time: "2026-08-05T23:00:00Z",
  timezone: "America/New_York",
  recurring_type: "weekly",
  recurring_days: ["wed", "thu", "fri"],
  num_rounds: 14,
  venue_id: venueId,
});

const callsOn = (table: string): Call[] => state.calls.filter((call) => call.table === table);

beforeEach(() => {
  state.calls = [];
  state.tables = {};
  state.rpc = {};
  for (const fn of Object.values(fns)) fn.mockReset();
  fns.listChallengeCampaignsByIds.mockResolvedValue([]);
  fns.listScheduleTimezones.mockResolvedValue(new Map());
  fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([]);
  fns.enumerateScheduleOccurrences.mockReturnValue([]);
  fns.loadLiveTriviaWeekTotals.mockResolvedValue([]);
});

describe("Live Trivia adapter", () => {
  it("round-trips its game key and refuses a malformed one", () => {
    expect(parseLiveTriviaGameKey(`${SCHED}:2026-10-09`)).toEqual({ scheduleId: SCHED, occurrenceDate: "2026-10-09" });
    for (const bad of ["", SCHED, `${SCHED}:yesterday`, ":2026-10-09", "a b:2026-10-09"]) expect(parseLiveTriviaGameKey(bad)).toBeNull();
  });

  it("lists this venue's games with their start instant, and says when there are no more", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule(SCHED, "venue-1"), schedule("other", "venue-2")]);
    fns.enumerateScheduleOccurrences.mockImplementation((_row, probe) =>
      probe === Date.UTC(2026, 9, 9, 12) ? [{ occurrenceDate: "2026-10-09", startMs: Date.parse("2026-10-09T23:00:00Z"), endMs: 0 }] : [],
    );
    state.rpc.live_trivia_occurrence_summaries = {
      data: [
        { schedule_id: SCHED, occurrence_date: "2026-10-09", player_count: 2, top_points: 90, top_user_ids: [PLAYER_A] },
        { schedule_id: "other", occurrence_date: "2026-10-09", player_count: 9, top_points: 900, top_user_ids: [PLAYER_B] },
      ],
      error: null,
    };
    state.tables.users = [{ id: PLAYER_A, username: "murph" }];
    const page = await liveTriviaResultsAdapter.listGames({ venueId: "venue-1", before: null, limit: 20, nowMs: NOW });
    expect(page).toEqual({
      exhausted: true,
      games: [
        {
          competitionId: "live_trivia",
          gameKey: `${SCHED}:2026-10-09`,
          date: "2026-10-09",
          startsAt: "2026-10-09T23:00:00.000Z",
          title: "Weekday Trivia",
          playerCount: 2,
          inProgress: false,
          winners: ["murph"],
          topScore: 90,
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain(PLAYER_A);
  });

  it("returns every scorer's standing when no limit is given (the old route keeps its top 10)", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule(SCHED, "venue-1")]);
    const ids = Array.from({ length: 14 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    fns.loadLiveTriviaWeekTotals.mockResolvedValue(ids.map((id, i) => ({ userId: id, totalPoints: 200 - i * 10, reachedAt: null })));
    state.tables.users = ids.map((id, i) => ({ id, username: `p${i}` }));
    const all = await liveTriviaResultsAdapter.getStandings({ venueId: "venue-1", gameKey: `${SCHED}:2026-10-09`, nowMs: NOW });
    expect(all.standings).toHaveLength(14);
    expect(all.standings[0]).toEqual({ rank: 1, username: "p0", score: 200, entry: null });
    expect(all.game).toEqual(expect.objectContaining({ winners: ["p0"], topScore: 200, playerCount: 14 }));
    const top = await liveTriviaResultsAdapter.getStandings({ venueId: "venue-1", gameKey: `${SCHED}:2026-10-09`, nowMs: NOW, limit: 10 });
    expect(top.standings).toHaveLength(10);
    for (const id of ids) expect(JSON.stringify(all)).not.toContain(id);
  });

  it("reads a long standings list's usernames in chunks (a single in() would pass the URL limit)", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule(SCHED, "venue-1")]);
    const ids = Array.from({ length: 250 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    fns.loadLiveTriviaWeekTotals.mockResolvedValue(ids.map((id, i) => ({ userId: id, totalPoints: 1000 - i, reachedAt: null })));
    state.tables.users = ids.map((id, i) => ({ id, username: `p${i}` }));
    const all = await liveTriviaResultsAdapter.getStandings({ venueId: "venue-1", gameKey: `${SCHED}:2026-10-09`, nowMs: NOW });
    expect(all.standings).toHaveLength(250);
    const userReads = callsOn("users").filter((call) => call.method === "in");
    expect(userReads.map((call) => (call.args[1] as string[]).length)).toEqual([100, 100, 50]);
  });

  it("refuses another venue's game (404) without reading scores", async () => {
    fns.loadLiveTriviaSchedulesForVenues.mockResolvedValue([schedule(SCHED, "venue-2")]);
    await expect(
      liveTriviaResultsAdapter.getStandings({ venueId: "venue-1", gameKey: `${SCHED}:2026-10-09`, nowMs: NOW }),
    ).rejects.toBeInstanceOf(ResultsNotFoundError);
    expect(fns.loadLiveTriviaWeekTotals).not.toHaveBeenCalled();
  });
});

describe("venue reward source", () => {
  const rankedCampaign = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Live Trivia Challenge",
    winCondition: "ranked_places",
    rewardDefinitionId: "live_trivia_challenge",
    recurringType: "weekly",
    scheduleType: "recurring",
    activeDays: ["wed", "thu", "fri"],
    pointsRequiredToWin: 0,
    placePrizes: null,
    winnerQuota: 3,
    gameWinnerSlots: null,
  } as unknown as ChallengeCampaign;

  const source = () => createVenueRewardSource({ venueId: "venue-1", timeZone: "America/New_York", currentYear: 2026 });

  it("reads only this venue's rows, in the window's cycle and finalized ranges, and keeps the window's items", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([rankedCampaign]);
    state.tables.challenge_cycle_winners = [
      { challenge_id: rankedCampaign.id, cycle_start: "2026-10-07T04:00:00+00:00", winner_user_id: PLAYER_A, points_earned: 90, finalized_at: "2026-10-14T23:09:05Z", place: 1 },
      // Week of Sep 16 → dated Fri Sep 18, outside the window below.
      { challenge_id: rankedCampaign.id, cycle_start: "2026-09-16T04:00:00+00:00", winner_user_id: PLAYER_B, points_earned: 80, finalized_at: "2026-10-14T23:09:05Z", place: 1 },
    ];
    state.tables.users = [{ id: PLAYER_A, username: "murph" }, { id: PLAYER_B, username: "shrimpsalaad" }];
    const items = await source().read({ lo: "2026-10-01", hi: "2026-10-18", games: [] });

    expect(items.map((item) => [item.date, item.winners])).toEqual([["2026-10-09", [{ place: 1, username: "murph", points: 90 }]]]);
    for (const table of ["challenge_cycle_winners", "challenge_cycle_settlements"]) {
      expect(callsOn(table)).toContainEqual({ table, method: "eq", args: ["venue_id", "venue-1"] });
    }
    expect(callsOn("challenge_cycle_winners")).toContainEqual({
      table: "challenge_cycle_winners",
      method: "or",
      args: ["and(cycle_start.gte.2026-09-23,cycle_start.lt.2026-10-20),and(finalized_at.gte.2026-09-30,finalized_at.lt.2026-10-20)"],
    });
    expect(callsOn("challenge_cycle_settlements")).toContainEqual({
      table: "challenge_cycle_settlements",
      method: "or",
      args: ["and(cycle_start.gte.2026-09-23,cycle_start.lt.2026-10-20),and(settled_at.gte.2026-09-30,settled_at.lt.2026-10-20)"],
    });
    expect(fns.listScheduleTimezones).not.toHaveBeenCalled();
    expect(JSON.stringify(items)).not.toContain(PLAYER_A);
    expect(JSON.stringify(items)).not.toContain(PLAYER_B);
  });

  it("reads nothing more when the window has no rows", async () => {
    expect(await source().read({ lo: "2026-10-01", hi: "2026-10-18", games: [] })).toEqual([]);
    expect(fns.listChallengeCampaignsByIds).not.toHaveBeenCalled();
    expect(callsOn("users")).toEqual([]);
  });

  it("reads schedule zones only for a pinned game-winner reward", async () => {
    fns.listChallengeCampaignsByIds.mockResolvedValue([
      { ...rankedCampaign, id: "gw", winCondition: "game_winner", gameWinnerSlots: [{ scheduleId: SCHED, weekday: "fri" }] },
    ]);
    fns.listScheduleTimezones.mockResolvedValue(new Map([[SCHED, "America/New_York"]]));
    state.tables.challenge_cycle_winners = [
      { challenge_id: "gw", cycle_start: "2026-10-09T23:00:00+00:00", winner_user_id: PLAYER_A, points_earned: 90, finalized_at: "2026-10-10T04:00:00Z", place: null },
    ];
    const items = await source().read({ lo: "2026-10-01", hi: "2026-10-18", games: [] });
    expect(fns.listScheduleTimezones).toHaveBeenCalledWith([SCHED]);
    expect(items[0]).toEqual(expect.objectContaining({ date: "2026-10-09", attach: { kind: "day", date: "2026-10-09" } }));
  });

  it("bounds older items from the newest older timestamps, never past lo, and null when there are none", async () => {
    expect(await source().boundBefore("2026-09-01")).toBeNull();
    state.tables.challenge_cycle_winners = [{ cycle_start: "2026-06-03T04:00:00+00:00", finalized_at: "2026-06-06T02:00:00Z" }];
    // cycle Jun 3 → dated at most Jun 3 + 7 local; finalized Jun 6 UTC → dated at most Jun 6 local.
    expect(await source().boundBefore("2026-09-01")).toBe("2026-06-12");
    expect(await source().boundBefore("2026-06-05")).toBe("2026-06-05");
    const probes = callsOn("challenge_cycle_winners");
    expect(probes).toContainEqual({ table: "challenge_cycle_winners", method: "eq", args: ["venue_id", "venue-1"] });
    expect(probes).toContainEqual({ table: "challenge_cycle_winners", method: "gt", args: ["cycle_start", "1970-01-02"] });
    expect(probes).toContainEqual({ table: "challenge_cycle_winners", method: "limit", args: [1] });
  });
});
