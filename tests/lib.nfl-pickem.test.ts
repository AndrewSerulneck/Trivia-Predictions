import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NFLWeek } from "@/lib/nflPickEm";
import {
  buildNFLGameWeekOptions,
  buildNFLLeaderboardWeekOptions,
  getNFLPickEmLeaderboard,
  getNFLWeekDisplayLabel,
  isNFLWeekLocked,
  isNFLWeekStarted,
  isPreseasonPreviewWeek,
  getLockStatus,
  determineWeekLockTime,
} from "@/lib/nflPickEm";

// Mock the BDL fetch
vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn(),
}));

type MockRow = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
}));

// Minimal PostgREST-shaped query builder: enough of the chain the leaderboard
// reads use (select/eq/in/gte/lt/order/range/returns/single).
vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (rows: MockRow[]) => {
    let result = [...rows];
    const time = (value: unknown): number => Date.parse(String(value));
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        result = result.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        result = result.filter((row) => values.includes(row[column]));
        return builder;
      },
      gte: (column: string, value: string) => {
        result = result.filter((row) => time(row[column]) >= time(value));
        return builder;
      },
      lt: (column: string, value: string) => {
        result = result.filter((row) => time(row[column]) < time(value));
        return builder;
      },
      order: (column: string) => {
        result = [...result].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
        return builder;
      },
      range: (from: number, to: number) => {
        result = result.slice(from, to + 1);
        return builder;
      },
      returns: () => Promise.resolve({ data: result, error: null }),
      single: () =>
        Promise.resolve(
          result.length > 0 ? { data: result[0], error: null } : { data: null, error: { message: "not found" } }
        ),
      maybeSingle: () => Promise.resolve({ data: result[0] ?? null, error: null }),
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(db.tables[table] ?? []),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

function createMockWeek(overrides: Partial<NFLWeek> = {}): NFLWeek {
  return {
    id: "test-week-id",
    season: 2024,
    weekNumber: 1,
    weekType: "regular",
    displayLabel: null,
    weekStartDate: "2024-09-05",
    weekEndDate: "2024-09-09",
    thursdayKickoff: null,
    status: "open",
    gamesCount: 16,
    syncedAt: null,
    ...overrides,
  };
}

describe("NFL leaderboard week options", () => {
  it("uses display labels when available and falls back to Week N", () => {
    expect(getNFLWeekDisplayLabel(createMockWeek({ weekNumber: 2, displayLabel: "Week 2" }))).toBe("Week 2");
    expect(getNFLWeekDisplayLabel(createMockWeek({ weekNumber: 3, displayLabel: "" }))).toBe("Week 3");
  });

  it("only treats weeks as started once their local start date has arrived", () => {
    const week = createMockWeek({ weekStartDate: "2024-09-05" });
    expect(isNFLWeekStarted(week, { now: new Date("2024-09-04T23:59:00Z"), timeZone: "UTC" })).toBe(false);
    expect(isNFLWeekStarted(week, { now: new Date("2024-09-05T00:00:00Z"), timeZone: "UTC" })).toBe(true);
  });

  it("filters out future weeks and defaults to the current started week", () => {
    const weeks = [
      createMockWeek({
        id: "week-1",
        weekNumber: 1,
        displayLabel: "Week 1",
        weekStartDate: "2024-09-05",
        weekEndDate: "2024-09-09",
      }),
      createMockWeek({
        id: "week-2",
        weekNumber: 2,
        displayLabel: "Week 2",
        weekStartDate: "2024-09-12",
        weekEndDate: "2024-09-16",
      }),
      createMockWeek({
        id: "week-3",
        weekNumber: 3,
        displayLabel: "Week 3",
        weekStartDate: "2024-09-19",
        weekEndDate: "2024-09-23",
      }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-13T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.weeks.map((week) => week.id)).toEqual(["week-1", "week-2"]);
    expect(options.currentWeekId).toBe("week-2");
    expect(options.defaultWeekId).toBe("week-2");
  });

  it("defaults to the most recent started week when no week is current", () => {
    const weeks = [
      createMockWeek({ id: "week-1", weekNumber: 1, weekStartDate: "2024-09-05", weekEndDate: "2024-09-09" }),
      createMockWeek({ id: "week-2", weekNumber: 2, weekStartDate: "2024-09-12", weekEndDate: "2024-09-16" }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-18T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.currentWeekId).toBeNull();
    expect(options.defaultWeekId).toBe("week-2");
  });

  it("returns an empty option set before the season starts", () => {
    const weeks = [
      createMockWeek({ id: "week-1", weekNumber: 1, weekStartDate: "2024-09-05", weekEndDate: "2024-09-09" }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-04T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.weeks).toEqual([]);
    expect(options.currentWeekId).toBeNull();
    expect(options.defaultWeekId).toBeNull();
  });
});

describe("buildNFLGameWeekOptions", () => {
  const weeks = [
    createMockWeek({
      id: "week-1",
      weekNumber: 1,
      displayLabel: "Week 1",
      weekStartDate: "2024-09-05",
      weekEndDate: "2024-09-09",
    }),
    createMockWeek({
      id: "week-2",
      weekNumber: 2,
      displayLabel: "Week 2",
      weekStartDate: "2024-09-12",
      weekEndDate: "2024-09-16",
    }),
    createMockWeek({
      id: "week-3",
      weekNumber: 3,
      displayLabel: "Week 3",
      weekStartDate: "2024-09-19",
      weekEndDate: "2024-09-23",
    }),
  ];

  it("excludes future weeks and includes past + current only", () => {
    const options = buildNFLGameWeekOptions(weeks, {
      now: new Date("2024-09-13T12:00:00Z"),
    });

    expect(options.weeks.map((week) => week.id)).toEqual(["week-1", "week-2"]);
    expect(options.currentWeekId).toBe("week-2");
    expect(options.weeks.every((week) => week.isUpcomingPreview === false)).toBe(true);
  });

  it("hands over to the next week at its Tuesday 05:00 UTC rollover", () => {
    // Week 3's span opens Tue 2024-09-17 05:00Z — there is no Tue/Wed limbo
    // where the finished week is still the current one.
    const before = buildNFLGameWeekOptions(weeks, { now: new Date("2024-09-17T04:59:59Z") });
    expect(before.weeks.map((week) => week.id)).toEqual(["week-1", "week-2"]);
    expect(before.currentWeekId).toBe("week-2");

    const after = buildNFLGameWeekOptions(weeks, { now: new Date("2024-09-17T05:00:00Z") });
    expect(after.weeks.map((week) => week.id)).toEqual(["week-1", "week-2", "week-3"]);
    expect(after.currentWeekId).toBe("week-3");
  });

  // Preseason exception: before any week is open for picks, the ordinary
  // past+current rule would return nothing to show for months. Instead the
  // single earliest upcoming week is surfaced as a read-only preview.
  describe("preseason preview exception", () => {
    it("surfaces the earliest upcoming week as a single preview entry, marked current", () => {
      const options = buildNFLGameWeekOptions(weeks, {
        now: new Date("2024-08-20T12:00:00Z"),
      });

      expect(options.weeks).toHaveLength(1);
      expect(options.weeks[0]).toMatchObject({
        id: "week-1",
        isCurrent: true,
        isUpcomingPreview: true,
      });
      expect(options.currentWeekId).toBe("week-1");
    });

    it("picks the earliest upcoming week regardless of input order", () => {
      const shuffled = [weeks[2], weeks[0], weeks[1]];
      const options = buildNFLGameWeekOptions(shuffled, {
        now: new Date("2024-08-20T12:00:00Z"),
      });

      expect(options.weeks.map((week) => week.id)).toEqual(["week-1"]);
    });

    it("self-expires the instant that week's span opens", () => {
      // Week 1 is Thu 2024-09-05, so its span opens Tue 2024-09-03 05:00Z.
      const options = buildNFLGameWeekOptions(weeks, {
        now: new Date("2024-09-03T05:00:00Z"),
      });

      expect(options.weeks.map((week) => week.id)).toEqual(["week-1"]);
      expect(options.weeks[0].isUpcomingPreview).toBe(false);
      expect(options.weeks[0].isCurrent).toBe(true);
    });

    it("returns an empty option set when there are no weeks at all", () => {
      const options = buildNFLGameWeekOptions([], {
        now: new Date("2024-08-20T12:00:00Z"),
      });

      expect(options.weeks).toEqual([]);
      expect(options.currentWeekId).toBeNull();
    });
  });
});

// Server-side re-derivation of the same preview rule buildNFLGameWeekOptions
// uses — a route must not trust "the client's week list included this one"
// alone, since weekId is user-controllable. See app/api/nfl-pickem/games/route.ts.
describe("isPreseasonPreviewWeek", () => {
  const weeks = [
    createMockWeek({ id: "week-1", weekNumber: 1, weekStartDate: "2024-09-05", weekEndDate: "2024-09-09" }),
    createMockWeek({ id: "week-2", weekNumber: 2, weekStartDate: "2024-09-12", weekEndDate: "2024-09-16" }),
  ];

  it("allows the single earliest upcoming week before any week is open", () => {
    const now = new Date("2024-08-20T12:00:00Z");
    expect(isPreseasonPreviewWeek(weeks[0], weeks, { now })).toBe(true);
  });

  it("rejects every other week, even though none is open either", () => {
    const now = new Date("2024-08-20T12:00:00Z");
    expect(isPreseasonPreviewWeek(weeks[1], weeks, { now })).toBe(false);
  });

  it("rejects the same week once any week in the season has opened — the exception self-expires", () => {
    const now = new Date("2024-09-03T05:00:00Z");
    expect(isPreseasonPreviewWeek(weeks[0], weeks, { now })).toBe(false);
  });

  it("rejects when the season has no weeks at all", () => {
    const now = new Date("2024-08-20T12:00:00Z");
    expect(isPreseasonPreviewWeek({ id: "week-1" }, [], { now })).toBe(false);
  });
});

describe("isNFLWeekLocked", () => {
  it("returns true when lock time has passed", () => {
    const pastWeek = createMockWeek({
      thursdayKickoff: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isNFLWeekLocked(pastWeek)).toBe(true);
  });

  it("returns false when lock time is in future", () => {
    const futureWeek = createMockWeek({
      thursdayKickoff: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isNFLWeekLocked(futureWeek)).toBe(false);
  });

  it("returns false when no lock time set", () => {
    const week = createMockWeek({ thursdayKickoff: null });
    expect(isNFLWeekLocked(week)).toBe(false);
  });
});

describe("getLockStatus", () => {
  it("returns locked status when time has passed", () => {
    const pastWeek = {
      thursdayKickoff: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    const status = getLockStatus(pastWeek);
    expect(status.isLocked).toBe(true);
    expect(status.timeUntilLock).toBe(0);
  });

  it("returns unlocked status with time remaining", () => {
    const futureWeek = {
      thursdayKickoff: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const status = getLockStatus(futureWeek);
    expect(status.isLocked).toBe(false);
    expect(status.timeUntilLock).toBeGreaterThan(0);
    expect(status.lockTimeFormatted).not.toBeNull();
  });

  it("returns null values when no lock time set", () => {
    const week = { thursdayKickoff: null as string | null };
    const status = getLockStatus(week);
    expect(status.isLocked).toBe(false);
    expect(status.timeUntilLock).toBeNull();
    expect(status.lockTimeFormatted).toBeNull();
  });
});

describe("Lock Time Determination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns earliest Thursday game kickoff", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    (fetchBallDontLieList as any).mockResolvedValue([
      { id: "1", date: "2024-09-05T20:20:00-04:00", home_team: {}, visitor_team: {} },
      { id: "2", date: "2024-09-05T20:15:00-04:00", home_team: {}, visitor_team: {} }, // Earlier
    ]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-05T20:15:00-04:00");
  });

  it("returns first game of week when no Thursday game", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    // First call (Thursday) returns empty
    // Second call (full week) returns Sunday games
    (fetchBallDontLieList as any)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: "1", date: "2024-09-08T13:00:00-04:00", home_team: {}, visitor_team: {} },
        { id: "2", date: "2024-09-08T16:25:00-04:00", home_team: {}, visitor_team: {} },
      ]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-08T13:00:00-04:00");
  });

  it("returns null when no games found", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    (fetchBallDontLieList as any).mockResolvedValue([]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBeNull();
  });
});

describe("getNFLPickEmLeaderboard", () => {
  // Week 1 = Thu 2024-09-05 .. Mon 2024-09-09, Week 2 = Thu 2024-09-12 .. Mon 2024-09-16.
  const WEEK1_NOW = new Date("2024-09-08T18:00:00.000Z"); // gm-a + gm-b kicked off, gm-c has not
  const SEASON_NOW = new Date("2024-09-20T00:00:00.000Z"); // everything kicked off

  const GAME_A = { id: "gm-a", startsAt: "2024-09-05T20:20:00.000Z", home: "Kansas City Chiefs", away: "Baltimore Ravens" };
  const GAME_B = { id: "gm-b", startsAt: "2024-09-08T13:00:00.000Z", home: "San Francisco 49ers", away: "Dallas Cowboys" };
  const GAME_C = { id: "gm-c", startsAt: "2024-09-09T20:15:00.000Z", home: "Buffalo Bills", away: "Miami Dolphins" };
  const GAME_D = { id: "gm-d", startsAt: "2024-09-12T20:20:00.000Z", home: "Detroit Lions", away: "Green Bay Packers" };
  // Wednesday — earlier than week 2's Thursday start date, but inside week 2's
  // Tue→Tue span, so it counts (Christmas-week Wednesday games are real).
  const GAME_WED = { id: "gm-wed", startsAt: "2024-09-11T20:00:00.000Z", home: "New York Jets", away: "New York Giants" };
  // Preseason — outside every week's span, so it must never be counted.
  const GAME_OUT = { id: "gm-out", startsAt: "2024-08-15T20:00:00.000Z", home: "Las Vegas Raiders", away: "Carolina Panthers" };

  type MockGame = { id: string; startsAt: string; home: string; away: string };

  const makePick = (params: {
    userId: string;
    game: MockGame;
    side: "home" | "away";
    status: "pending" | "won" | "lost" | "push";
    venueId?: string;
  }): MockRow => ({
    user_id: params.userId,
    venue_id: params.venueId ?? "venue-1",
    sport_slug: "nfl",
    game_id: params.game.id,
    game_label: `${params.game.away} vs ${params.game.home}`,
    home_team: params.game.home,
    away_team: params.game.away,
    starts_at: params.game.startsAt,
    selected_team: params.side === "home" ? params.game.home : params.game.away,
    selected_side: params.side,
    status: params.status,
    home_score: params.status === "pending" ? null : 24,
    away_score: params.status === "pending" ? null : 17,
    reward_points: 10,
  });

  beforeEach(() => {
    db.tables = {
      nfl_pickem_weeks: [
        {
          id: "week-1",
          season: 2024,
          week_number: 1,
          week_start_date: "2024-09-05",
          week_end_date: "2024-09-09",
          thursday_kickoff: "2024-09-05T20:20:00.000Z",
          status: "open",
          games_count: 14,
          synced_at: null,
        },
        {
          id: "week-2",
          season: 2024,
          week_number: 2,
          week_start_date: "2024-09-12",
          week_end_date: "2024-09-16",
          thursday_kickoff: "2024-09-12T20:20:00.000Z",
          status: "upcoming",
          games_count: 14,
          synced_at: null,
        },
      ],
      users: [
        { id: "alice-id", username: "alice" },
        { id: "bob-id", username: "bob" },
        { id: "zed-id", username: null },
        { id: "carol-id", username: "carol" },
        { id: "dave-id", username: "dave" },
      ],
      pickem_picks: [
        makePick({ userId: "alice-id", game: GAME_A, side: "home", status: "won" }),
        makePick({ userId: "alice-id", game: GAME_C, side: "away", status: "pending" }),
        makePick({ userId: "alice-id", game: GAME_D, side: "home", status: "won" }),
        makePick({ userId: "bob-id", game: GAME_A, side: "away", status: "lost" }),
        makePick({ userId: "bob-id", game: GAME_B, side: "home", status: "won" }),
        makePick({ userId: "bob-id", game: GAME_WED, side: "home", status: "won" }),
        makePick({ userId: "bob-id", game: GAME_OUT, side: "home", status: "won" }),
        makePick({ userId: "zed-id", game: GAME_B, side: "away", status: "lost" }),
        // Same games, different venue — must never appear in venue-1 standings.
        makePick({ userId: "carol-id", game: GAME_A, side: "home", status: "won", venueId: "venue-2" }),
        makePick({ userId: "carol-id", game: GAME_C, side: "home", status: "pending", venueId: "venue-2" }),
      ],
    };
  });

  it("hides another user's pick for a game that has not kicked off, by omitting the field", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "bob-id",
      now: WEEK1_NOW,
    });

    const alice = result.entries.find((entry) => entry.userId === "alice-id");
    const hidden = alice?.picks.find((pick) => pick.gameId === "gm-c");

    expect(hidden).toBeDefined();
    expect(hidden?.isHidden).toBe(true);
    expect("selectedTeam" in (hidden ?? {})).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain("selectedTeam");
    // The pick still counts toward the aggregate — only the selection is withheld.
    expect(alice?.picksCount).toBe(2);
  });

  it("reveals the requesting user's own pick even before kickoff", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "alice-id",
      now: WEEK1_NOW,
    });

    const alice = result.entries.find((entry) => entry.userId === "alice-id");
    const own = alice?.picks.find((pick) => pick.gameId === "gm-c");

    expect(alice?.isCurrentUser).toBe(true);
    expect(own?.isHidden).toBe(false);
    expect(own?.selectedTeam).toBe("Miami Dolphins");
  });

  it("reveals every user's pick once that game has started", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "zed-id",
      now: WEEK1_NOW,
    });

    const alice = result.entries.find((entry) => entry.userId === "alice-id");
    const started = alice?.picks.find((pick) => pick.gameId === "gm-a");

    expect(started?.isHidden).toBe(false);
    expect(started?.selectedTeam).toBe("Kansas City Chiefs");
    expect(started?.winnerTeam).toBe("Kansas City Chiefs");

    const bob = result.entries.find((entry) => entry.userId === "bob-id");
    const lost = bob?.picks.find((pick) => pick.gameId === "gm-a");
    expect(lost?.selectedTeam).toBe("Baltimore Ravens");
    expect(lost?.winnerTeam).toBe("Kansas City Chiefs");
  });

  it("excludes users with no picks and ranks with shared ranks on ties", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "alice-id",
      now: WEEK1_NOW,
    });

    expect(result.entries.map((entry) => entry.userId)).toEqual(["alice-id", "bob-id", "zed-id"]);
    expect(result.entries.some((entry) => entry.userId === "dave-id")).toBe(false);

    // alice and bob are both 1 correct / 10 points, so they share rank 1 and
    // are ordered by username; zed skips to rank 3.
    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(result.entries[0]).toMatchObject({ username: "alice", correctPicks: 1, incorrectPicks: 0, totalPoints: 10 });
    expect(result.entries[1]).toMatchObject({ username: "bob", correctPicks: 1, incorrectPicks: 1, totalPoints: 10 });
    expect(result.entries[2]).toMatchObject({ correctPicks: 0, incorrectPicks: 1, totalPoints: 0 });
    // Missing username falls back to a readable placeholder, not an empty row.
    expect(result.entries[2].username).toMatch(/^Player /);
  });

  it("scopes strictly to the requested venue", async () => {
    const venueOne = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "alice-id",
      now: WEEK1_NOW,
    });
    expect(venueOne.entries.some((entry) => entry.userId === "carol-id")).toBe(false);

    const venueTwo = await getNFLPickEmLeaderboard({
      venueId: "venue-2",
      mode: "week",
      weekId: "week-1",
      userId: "alice-id",
      now: WEEK1_NOW,
    });
    expect(venueTwo.entries.map((entry) => entry.userId)).toEqual(["carol-id"]);
  });

  it("limits week mode to that week's picks", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "week-1",
      userId: "alice-id",
      now: WEEK1_NOW,
    });

    const alice = result.entries.find((entry) => entry.userId === "alice-id");
    expect(alice?.picks.map((pick) => pick.gameId)).toEqual(["gm-a", "gm-c"]);
  });

  it("sums across weeks in season mode, counts Wednesday games, and ignores picks outside every week span", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "season",
      season: 2024,
      userId: "alice-id",
      now: SEASON_NOW,
    });

    const alice = result.entries.find((entry) => entry.userId === "alice-id");
    const bob = result.entries.find((entry) => entry.userId === "bob-id");

    expect(alice).toMatchObject({ rank: 1, picksCount: 3, correctPicks: 2, totalPoints: 20 });
    expect(alice?.picks.map((pick) => pick.gameId)).toEqual(["gm-a", "gm-c", "gm-d"]);
    // The Wednesday pick is inside week 2's span and counts; the preseason one
    // is outside every span and does not.
    expect(bob).toMatchObject({ picksCount: 3, correctPicks: 2, totalPoints: 20 });
    expect(bob?.picks.some((pick) => pick.gameId === "gm-wed")).toBe(true);
    expect(bob?.picks.some((pick) => pick.gameId === "gm-out")).toBe(false);
  });

  it("rejects missing identifiers", async () => {
    await expect(
      getNFLPickEmLeaderboard({ venueId: "", mode: "week", weekId: "week-1" })
    ).rejects.toThrow(/venueId is required/);

    await expect(
      getNFLPickEmLeaderboard({ venueId: "venue-1", mode: "week", weekId: "" })
    ).rejects.toThrow(/weekId is required/);

    await expect(
      getNFLPickEmLeaderboard({ venueId: "venue-1", mode: "season" })
    ).rejects.toThrow(/season is required/);

    await expect(
      getNFLPickEmLeaderboard({ venueId: "venue-1", mode: "week", weekId: "nope" })
    ).rejects.toThrow(/not found/i);
  });
});

// Regression: a Monday Night Football pick. MNF kicks off 8:15pm ET Monday,
// which is TUESDAY in UTC — outside the old [week_start .. week_end + 1 day)
// window, so those picks silently vanished from every leaderboard. The Tue
// 05:00 UTC → Tue 05:00 UTC span contains them. Real 2026 Week 1 dates.
describe("getNFLPickEmLeaderboard — Monday Night Football window", () => {
  const MNF = {
    id: "gm-mnf",
    startsAt: "2026-09-15T00:15:00.000Z",
    home: "Chicago Bears",
    away: "Minnesota Vikings",
  };

  beforeEach(() => {
    db.tables = {
      nfl_pickem_weeks: [
        {
          id: "w1",
          season: 2026,
          week_number: 1,
          week_start_date: "2026-09-10",
          week_end_date: "2026-09-14",
          thursday_kickoff: "2026-09-11T00:20:00.000Z",
          status: "open",
          games_count: 16,
          synced_at: null,
        },
      ],
      users: [{ id: "alice-id", username: "alice" }],
      pickem_picks: [
        {
          user_id: "alice-id",
          venue_id: "venue-1",
          sport_slug: "nfl",
          game_id: MNF.id,
          game_label: `${MNF.away} vs ${MNF.home}`,
          home_team: MNF.home,
          away_team: MNF.away,
          starts_at: MNF.startsAt,
          selected_team: MNF.home,
          selected_side: "home",
          status: "won",
          home_score: 24,
          away_score: 17,
          reward_points: 10,
        },
      ],
    };
  });

  it("counts a Monday-night pick whose UTC kickoff falls on Tuesday (week mode)", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "week",
      weekId: "w1",
      userId: "alice-id",
      now: new Date("2026-09-15T06:00:00.000Z"),
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ userId: "alice-id", picksCount: 1, correctPicks: 1, totalPoints: 10 });
  });

  it("counts it in season mode too", async () => {
    const result = await getNFLPickEmLeaderboard({
      venueId: "venue-1",
      mode: "season",
      season: 2026,
      userId: "alice-id",
      now: new Date("2026-09-15T06:00:00.000Z"),
    });

    expect(result.entries[0]).toMatchObject({ picksCount: 1, correctPicks: 1, totalPoints: 10 });
  });
});
