import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the missing Monday Night Football bug.
//
// A week's stored window is Thu→Mon (week_end_date = week_start_date + 4,
// enforced by a DB CHECK constraint), but MNF kicks off ~8:15pm ET Monday —
// already TUESDAY in UTC. Fetching a week's games by iterating that stored date
// range therefore dropped the last game of nearly every week: 15 of 16 rendered
// for 2026 Week 1. listNFLPickEmGames now asks balldontlie for the season+week
// directly, which has no date window to fall outside of.
//
// See docs/nfl-pickem-week1-early-access-plan.md.

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn(),
}));

type MockRow = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (table: string) => {
    const rows = db.tables[table] ?? [];
    let result = [...rows];
    let pendingUpdate: MockRow | null = null;
    let updateTargets: MockRow[] | null = null;

    const applyPendingUpdate = () => {
      if (!pendingUpdate || !updateTargets) return;
      for (const row of updateTargets) {
        Object.assign(row, pendingUpdate);
      }
      result = [...updateTargets];
      pendingUpdate = null;
      updateTargets = null;
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (pendingUpdate) {
          updateTargets = (updateTargets ?? db.tables[table] ?? []).filter((row) => row[column] === value);
        } else {
          result = result.filter((row) => row[column] === value);
        }
        return builder;
      },
      is: (column: string, value: unknown) => {
        if (pendingUpdate) {
          updateTargets = (updateTargets ?? db.tables[table] ?? []).filter((row) => row[column] === value);
        } else {
          result = result.filter((row) => row[column] === value);
        }
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        result = result.filter((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      update: (patch: MockRow) => {
        pendingUpdate = patch;
        updateTargets = db.tables[table] ?? [];
        return builder;
      },
      upsert: (payload: MockRow | MockRow[], options?: { onConflict?: string }) => {
        const tableRows = db.tables[table] ?? [];
        db.tables[table] = tableRows;
        const payloadRows = Array.isArray(payload) ? payload : [payload];
        const conflictColumns = (options?.onConflict ?? "id").split(",").map((column) => column.trim());

        result = payloadRows.map((payloadRow) => {
          const existing = tableRows.find((row) =>
            conflictColumns.every((column) => row[column] === payloadRow[column])
          );
          if (existing) {
            Object.assign(existing, payloadRow);
            return existing;
          }
          const inserted = { ...payloadRow };
          tableRows.push(inserted);
          return inserted;
        });
        return builder;
      },
      returns: () => {
        applyPendingUpdate();
        return Promise.resolve({ data: result, error: null });
      },
      single: () =>
        Promise.resolve(
          (() => {
            applyPendingUpdate();
            return result.length > 0
              ? { data: result[0], error: null }
              : { data: null, error: { message: "not found" } };
          })()
        ),
      maybeSingle: () => Promise.resolve({ data: result[0] ?? null, error: null }),
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

import { listNFLPickEmGames } from "@/lib/nflPickEm";
import { fetchBallDontLieList } from "@/lib/balldontlie";

const WEEK_ROW: MockRow = {
  id: "week-1",
  season: 2026,
  week_number: 1,
  week_start_date: "2026-09-10",
  week_end_date: "2026-09-14",
  thursday_kickoff: "2026-09-10T00:20:00.000Z",
  status: "upcoming",
  games_count: 16,
  synced_at: null,
};

// The two real 2026 Week 1 bookends: the opener, and the Monday-nighter that
// lands on 2026-09-15 in UTC — outside the stored Thu→Mon window.
const bdlGame = (id: number, date: string, home: string, away: string) => ({
  id,
  date,
  week: 1,
  status: "scheduled",
  home_team: { id: id * 10 + 1, full_name: home },
  visitor_team: { id: id * 10 + 2, full_name: away },
  home_team_score: null,
  visitor_team_score: null,
  winner_team: null,
});

const WEEK_1_GAMES = [
  bdlGame(1, "2026-09-10T00:20:00.000Z", "Seattle Seahawks", "New England Patriots"),
  bdlGame(2, "2026-09-13T17:00:00.000Z", "Buffalo Bills", "Miami Dolphins"),
  bdlGame(3, "2026-09-15T00:15:00.000Z", "Kansas City Chiefs", "Denver Broncos"),
];

beforeEach(() => {
  vi.clearAllMocks();
  db.tables = { nfl_pickem_weeks: [WEEK_ROW], nfl_pickem_game_lines: [] };

  // Behave like the real endpoint rather than returning everything regardless:
  // a `dates[]` query returns only games on that UTC date, which is precisely
  // how the Monday-nighter used to go missing. Without this the MNF assertion
  // below would pass even against the old date-range implementation.
  vi.mocked(fetchBallDontLieList).mockImplementation(async (path, query) => {
    if (path === "/nfl/v1/odds") {
      return WEEK_1_GAMES.map((game, index) => ({
        id: 1000 + index,
        game_id: game.id,
        vendor: "fanduel",
        spread_home_value: index % 2 === 0 ? "-3.5" : "2.5",
        spread_away_value: index % 2 === 0 ? "3.5" : "-2.5",
        updated_at: "2026-09-09T12:00:00.000Z",
      }));
    }

    const date = query.get("dates[]");
    if (date) return WEEK_1_GAMES.filter((game) => game.date.slice(0, 10) === date);

    const week = query.get("weeks[]");
    if (week) return WEEK_1_GAMES.filter((game) => String(game.week) === week);

    return WEEK_1_GAMES;
  });
});

describe("listNFLPickEmGames game fetching", () => {
  it("asks balldontlie for the season+week, not a date range", async () => {
    await listNFLPickEmGames({ weekId: "week-1" });

    const gameCalls = vi.mocked(fetchBallDontLieList).mock.calls.filter(([path]) => path === "/nfl/v1/games");
    expect(gameCalls).toHaveLength(1);
    const query = gameCalls[0][1];

    expect(query.get("seasons[]")).toBe("2026");
    expect(query.get("weeks[]")).toBe("1");
    // A date-range fetch is what dropped MNF — it must not come back.
    expect(query.has("dates[]")).toBe(false);
  });

  it("uses bracket-style array params, which is what balldontlie actually matches on", async () => {
    await listNFLPickEmGames({ weekId: "week-1" });

    const gameCalls = vi.mocked(fetchBallDontLieList).mock.calls.filter(([path]) => path === "/nfl/v1/games");
    const query = gameCalls[0][1];
    // The unbracketed keys silently match zero games — the same class of bug
    // that left nfl_pickem_weeks empty in production.
    expect(query.has("seasons")).toBe(false);
    expect(query.has("weeks")).toBe(false);
  });

  it("returns the Monday-night game that falls outside the stored Thu-Mon window", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-1" });

    expect(games).toHaveLength(3);
    const mnf = games.find((game) => game.startsAt === "2026-09-15T00:15:00.000Z");
    expect(mnf).toBeDefined();
    expect(mnf?.homeTeam).toBe("Kansas City Chiefs");
  });

  it("issues exactly one request per week instead of one per calendar day", async () => {
    await listNFLPickEmGames({ weekId: "week-1" });

    // The old date-range path made five calls for a Thu-Mon week.
    const gameCalls = vi.mocked(fetchBallDontLieList).mock.calls.filter(([path]) => path === "/nfl/v1/games");
    expect(gameCalls).toHaveLength(1);
  });

  it("fetches BallDontLie NFL spreads by season and week", async () => {
    await listNFLPickEmGames({ weekId: "week-1" });

    const oddsCalls = vi.mocked(fetchBallDontLieList).mock.calls.filter(([path]) => path === "/nfl/v1/odds");
    expect(oddsCalls).toHaveLength(1);
    expect(oddsCalls[0][1].get("season")).toBe("2026");
    expect(oddsCalls[0][1].get("week")).toBe("1");
  });

  it("upserts unlocked spread lines using the stored Pick 'Em game id", async () => {
    await listNFLPickEmGames({ weekId: "week-1" });

    expect(db.tables.nfl_pickem_game_lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game_id:
            "2__2026-09-13T17:00:00.000Z__Miami Dolphins__Buffalo Bills",
          home_spread: 2.5,
          away_spread: -2.5,
          provider: "balldontlie:fanduel",
          locked_at: null,
        }),
      ])
    );
  });

  it("locks existing lines at kickoff without overwriting the stored spread", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-16T12:00:00.000Z"));
    db.tables.nfl_pickem_game_lines = [
      {
        game_id: "1__2026-09-10T00:20:00.000Z__New England Patriots__Seattle Seahawks",
        starts_at: "2026-09-10T00:20:00.000Z",
        home_team: "Seattle Seahawks",
        away_team: "New England Patriots",
        home_spread: -7,
        away_spread: 7,
        provider: "balldontlie:draftkings",
        fetched_at: "2026-09-09T09:00:00.000Z",
        locked_at: null,
      },
    ];

    await listNFLPickEmGames({ weekId: "week-1" });

    expect(db.tables.nfl_pickem_game_lines[0]).toMatchObject({
      home_spread: -7,
      away_spread: 7,
      provider: "balldontlie:draftkings",
      locked_at: "2026-09-10T00:20:00.000Z",
    });
    nowSpy.mockRestore();
  });

  it("does not create a brand-new locked line after kickoff", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-16T12:00:00.000Z"));

    await listNFLPickEmGames({ weekId: "week-1" });

    expect(db.tables.nfl_pickem_game_lines).toEqual([]);
    const oddsCalls = vi.mocked(fetchBallDontLieList).mock.calls.filter(([path]) => path === "/nfl/v1/odds");
    expect(oddsCalls).toHaveLength(0);
    nowSpy.mockRestore();
  });

  it("does not overwrite an already locked line", async () => {
    db.tables.nfl_pickem_game_lines = [
      {
        game_id: "1__2026-09-10T00:20:00.000Z__New England Patriots__Seattle Seahawks",
        starts_at: "2026-09-10T00:20:00.000Z",
        home_team: "Seattle Seahawks",
        away_team: "New England Patriots",
        home_spread: -10,
        away_spread: 10,
        provider: "balldontlie:draftkings",
        fetched_at: "2026-09-09T09:00:00.000Z",
        locked_at: "2026-09-10T00:20:00.000Z",
      },
    ];

    await listNFLPickEmGames({ weekId: "week-1" });

    expect(db.tables.nfl_pickem_game_lines[0]).toMatchObject({
      home_spread: -10,
      away_spread: 10,
      provider: "balldontlie:draftkings",
      locked_at: "2026-09-10T00:20:00.000Z",
    });
  });
});

describe("listNFLPickEmGames day-of-week classification (Eastern, not UTC)", () => {
  // Regression guard for the day-grouping bug: kickoffs cross midnight UTC on
  // almost every slot, so classifying off getUTCDay() mislabels TNF/SNF/MNF.
  // See docs/nfl-pickem-day-grouping-fix-plan.md.
  //
  // Dedicated fixtures (not reusing WEEK_1_GAMES above, whose timestamps were
  // chosen only to test the fetch-window bug, not real ET kickoff times):
  // Thu Sept 10, 2026 8:20pm ET -> Fri Sept 11 00:20 UTC.
  // Sun Sept 13, 2026 8:20pm ET -> Mon Sept 14 00:20 UTC.
  // Mon Sept 14, 2026 8:15pm ET -> Tue Sept 15 00:15 UTC.
  const CLASSIFICATION_WEEK_ROW: MockRow = {
    ...WEEK_ROW,
    id: "week-classify",
  };
  const CLASSIFICATION_GAMES = [
    bdlGame(10, "2026-09-11T00:20:00.000Z", "Kansas City Chiefs", "Baltimore Ravens"),
    bdlGame(11, "2026-09-14T00:20:00.000Z", "San Francisco 49ers", "Arizona Cardinals"),
    bdlGame(12, "2026-09-15T00:15:00.000Z", "Green Bay Packers", "Chicago Bears"),
  ];

  beforeEach(() => {
    db.tables = { nfl_pickem_weeks: [CLASSIFICATION_WEEK_ROW], nfl_pickem_game_lines: [] };
    vi.mocked(fetchBallDontLieList).mockImplementation(async (path, query) => {
      if (path === "/nfl/v1/odds") return [];
      const week = query.get("weeks[]");
      if (week) return CLASSIFICATION_GAMES.filter((game) => String(game.week) === week);
      return CLASSIFICATION_GAMES;
    });
  });

  it("classifies Thursday Night Football as Thursday despite landing on UTC-Friday", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-classify" });
    const tnf = games.find((game) => game.startsAt === "2026-09-11T00:20:00.000Z");
    expect(tnf?.isThursdayGame).toBe(true);
    expect(tnf?.isSundayGame).toBe(false);
    expect(tnf?.isMondayGame).toBe(false);
  });

  it("classifies Sunday Night Football as Sunday despite landing on UTC-Monday", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-classify" });
    const snf = games.find((game) => game.startsAt === "2026-09-14T00:20:00.000Z");
    expect(snf?.isSundayGame).toBe(true);
    expect(snf?.isThursdayGame).toBe(false);
    expect(snf?.isMondayGame).toBe(false);
  });

  it("classifies Monday Night Football as Monday despite landing on UTC-Tuesday", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-classify" });
    const mnf = games.find((game) => game.startsAt === "2026-09-15T00:15:00.000Z");
    expect(mnf?.isMondayGame).toBe(true);
    expect(mnf?.isThursdayGame).toBe(false);
    expect(mnf?.isSundayGame).toBe(false);
  });
});

describe("listNFLPickEmGames day-of-week classification across the DST boundary", () => {
  const DST_WEEK_ROW: MockRow = {
    id: "week-dst",
    season: 2026,
    week_number: 1,
    week_start_date: "2026-10-29",
    week_end_date: "2026-11-02",
    thursday_kickoff: "2026-10-30T00:20:00.000Z",
    status: "upcoming",
    games_count: 3,
    synced_at: null,
  };

  // DST ends 2am ET on Nov 1, 2026: ET is UTC-4 (EDT) before, UTC-5 (EST) after.
  // A fixed-offset shift would get one side of this boundary wrong; a real
  // timezone lookup won't.
  const DST_WEEK_GAMES = [
    // Before the boundary: SNF Oct 25 (EDT), 8:20pm ET = UTC-4 -> UTC Oct 26, 00:20.
    bdlGame(4, "2026-10-26T00:20:00.000Z", "San Francisco 49ers", "Arizona Cardinals"),
    // After the boundary: SNF Nov 1 (already EST), 8:20pm ET = UTC-5 -> UTC Nov 2, 01:20.
    bdlGame(5, "2026-11-02T01:20:00.000Z", "Green Bay Packers", "Chicago Bears"),
  ];

  beforeEach(() => {
    db.tables = { nfl_pickem_weeks: [DST_WEEK_ROW], nfl_pickem_game_lines: [] };
    vi.mocked(fetchBallDontLieList).mockImplementation(async (path, query) => {
      if (path === "/nfl/v1/odds") return [];
      const week = query.get("weeks[]");
      if (week) return DST_WEEK_GAMES.filter((game) => String(game.week) === week);
      return DST_WEEK_GAMES;
    });
  });

  it("classifies Sunday Night Football correctly the week before DST ends", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-dst" });
    const snf = games.find((game) => game.startsAt === "2026-10-26T00:20:00.000Z");
    expect(snf?.isSundayGame).toBe(true);
    expect(snf?.isMondayGame).toBe(false);
  });

  it("classifies Sunday Night Football correctly the week DST ends", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-dst" });
    const snf = games.find((game) => game.startsAt === "2026-11-02T01:20:00.000Z");
    expect(snf?.isSundayGame).toBe(true);
    expect(snf?.isMondayGame).toBe(false);
  });
});

describe("listNFLPickEmGames chronological ordering + day-group labels", () => {
  // Regression guard for the "Other Games" bucket always sorting last: a real
  // Wednesday opener (2026 Week 1) must lead the list, not trail it. See
  // docs/nfl-pickem-chronological-order-plan.md.
  const ORDER_WEEK_ROW: MockRow = {
    ...WEEK_ROW,
    id: "week-order",
  };
  const ORDER_GAMES = [
    // Deliberately NOT inserted in chronological order, so a passing test
    // proves the sort, not fixture order.
    bdlGame(24, "2026-09-15T00:15:00.000Z", "Chicago Bears", "Green Bay Packers"), // Mon MNF
    bdlGame(20, "2026-09-10T00:20:00.000Z", "Seattle Seahawks", "New England Patriots"), // Wed opener
    bdlGame(22, "2026-09-13T17:00:00.000Z", "Buffalo Bills", "Miami Dolphins"), // Sun 1pm
    bdlGame(23, "2026-09-14T00:20:00.000Z", "Dallas Cowboys", "New York Giants"), // Sunday Night Football
    bdlGame(21, "2026-09-11T00:35:00.000Z", "Los Angeles Rams", "San Francisco 49ers"), // Thu TNF
  ];

  beforeEach(() => {
    db.tables = { nfl_pickem_weeks: [ORDER_WEEK_ROW], nfl_pickem_game_lines: [] };
    vi.mocked(fetchBallDontLieList).mockImplementation(async (path, query) => {
      if (path === "/nfl/v1/odds") return [];
      const week = query.get("weeks[]");
      if (week) return ORDER_GAMES.filter((game) => String(game.week) === week);
      return ORDER_GAMES;
    });
  });

  it("sorts strictly by kickoff time, with the Wednesday opener first", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });

    expect(games.map((game) => game.startsAt)).toEqual([
      "2026-09-10T00:20:00.000Z", // Wed
      "2026-09-11T00:35:00.000Z", // Thu
      "2026-09-13T17:00:00.000Z", // Sun 1pm
      "2026-09-14T00:20:00.000Z", // Sun night
      "2026-09-15T00:15:00.000Z", // Mon night
    ]);
  });

  it("labels a lone Thursday game as Thursday Night Football with its date, and flags it as the primetime section", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });
    const tnf = games.find((game) => game.startsAt === "2026-09-11T00:35:00.000Z");
    expect(tnf?.dayGroupLabel).toBe("Thursday Night Football · Sep 10");
    expect(tnf?.isThursdayNightSection).toBe(true);
  });

  it("does not flag non-Thursday-night games as the primetime section", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });
    for (const game of games) {
      if (game.startsAt !== "2026-09-11T00:35:00.000Z") {
        expect(game.isThursdayNightSection).toBe(false);
      }
    }
  });

  it("labels a lone Monday game as Monday Night Football with its date", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });
    const mnf = games.find((game) => game.startsAt === "2026-09-15T00:15:00.000Z");
    expect(mnf?.dayGroupLabel).toBe("Monday Night Football · Sep 14");
  });

  it("labels the Wednesday opener with its weekday and date, not as Other", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });
    const opener = games.find((game) => game.startsAt === "2026-09-10T00:20:00.000Z");
    expect(opener?.dayGroupLabel).toBe("Wednesday, Sep 9");
  });

  it("groups Sunday Night Football under the same Sunday label as the 1pm slate, not its own section", async () => {
    const { games } = await listNFLPickEmGames({ weekId: "week-order" });
    const sun1pm = games.find((game) => game.startsAt === "2026-09-13T17:00:00.000Z");
    const snf = games.find((game) => game.startsAt === "2026-09-14T00:20:00.000Z");
    expect(sun1pm?.dayGroupLabel).toBe("Sunday, Sep 13");
    expect(snf?.dayGroupLabel).toBe("Sunday, Sep 13");
    expect(snf?.dayGroupKey).toBe(sun1pm?.dayGroupKey);
  });

  it("does not label a multi-game Thursday (e.g. Thanksgiving) as the primetime slot", async () => {
    const THANKSGIVING_WEEK_ROW: MockRow = {
      ...WEEK_ROW,
      id: "week-thanksgiving",
      week_start_date: "2026-11-26",
      week_end_date: "2026-11-30",
    };
    const THANKSGIVING_GAMES = [
      bdlGame(30, "2026-11-26T17:30:00.000Z", "Detroit Lions", "Kansas City Chiefs"), // 12:30pm ET
      bdlGame(31, "2026-11-26T21:30:00.000Z", "Dallas Cowboys", "Cincinnati Bengals"), // 4:30pm ET
      bdlGame(32, "2026-11-27T01:20:00.000Z", "Baltimore Ravens", "Green Bay Packers"), // 8:20pm ET, still Thu in ET
    ];
    db.tables = { nfl_pickem_weeks: [THANKSGIVING_WEEK_ROW], nfl_pickem_game_lines: [] };
    vi.mocked(fetchBallDontLieList).mockImplementation(async (path, query) => {
      if (path === "/nfl/v1/odds") return [];
      const week = query.get("weeks[]");
      if (week) return THANKSGIVING_GAMES.filter((game) => String(game.week) === week);
      return THANKSGIVING_GAMES;
    });

    const { games } = await listNFLPickEmGames({ weekId: "week-thanksgiving" });
    for (const game of games) {
      expect(game.dayGroupLabel).toBe("Thursday, Nov 26");
      expect(game.isThursdayNightSection).toBe(false);
    }
  });
});
