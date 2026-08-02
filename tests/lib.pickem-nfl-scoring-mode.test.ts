import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NFLPickEmScoringMode } from "@/lib/venueGameSettings";

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  modes: new Map<string, NFLPickEmScoringMode>(),
  fetchBallDontLieList: vi.fn(),
}));

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: store.fetchBallDontLieList,
}));

vi.mock("@/lib/venueGameSettings", () => ({
  getVenueNFLPickEmScoringMode: vi.fn((venueId: string) =>
    Promise.resolve(store.modes.get(venueId) ?? "standard")
  ),
}));

vi.mock("@/lib/nflPickEm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nflPickEm")>();
  return {
    ...actual,
    getLockedNFLPickEmGameLineForSettlement: vi.fn(actual.getLockedNFLPickEmGameLineForSettlement),
  };
});

vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let patch: MockRow | null = null;
    let insertRows: MockRow[] | null = null;
    let limitCount: number | null = null;

    const currentRows = () => store.tables[table] ?? [];
    const filteredRows = () => {
      const rows = currentRows().filter((row) => filters.every((filter) => filter(row)));
      return limitCount === null ? rows : rows.slice(0, limitCount);
    };
    const resolve = () => {
      if (insertRows) {
        store.tables[table] = [...currentRows(), ...insertRows];
        return Promise.resolve({ data: insertRows, error: null });
      }
      if (patch) {
        const rows = filteredRows();
        for (const row of rows) {
          Object.assign(row, patch);
        }
        return Promise.resolve({ data: rows, error: null });
      }
      return Promise.resolve({ data: filteredRows(), error: null });
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? "") <= String(value ?? ""));
        return builder;
      },
      order: () => builder,
      limit: (count: number) => {
        limitCount = count;
        return builder;
      },
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      insert: (value: MockRow | MockRow[]) => {
        insertRows = Array.isArray(value) ? value : [value];
        return builder;
      },
      then: (
        onfulfilled?: ((value: { data: MockRow[]; error: null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => resolve().then(onfulfilled, onrejected),
      maybeSingle: () =>
        resolve().then(({ data }) => ({
          data: data[0] ?? null,
          error: null,
        })),
      single: () =>
        resolve().then(({ data }) => ({
          data: data[0] ?? null,
          error: data[0] ? null : { message: "not found" },
        })),
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc: vi.fn(),
    },
  };
});

import { settlePendingPickEmPicks } from "@/lib/pickem";
import { getLockedNFLPickEmGameLineForSettlement } from "@/lib/nflPickEm";

const startsAt = "2026-01-01T18:00:00.000Z";
const gameId = `nfl-game-1__${startsAt}__Away Team__Home Team`;

const makePick = (overrides: MockRow = {}): MockRow => ({
  id: "pick-1",
  user_id: "user-1",
  venue_id: "venue-1",
  sport_slug: "nfl",
  sport_key: "americanfootball_nfl",
  league: "NFL",
  game_id: gameId,
  home_team_id: "home-id",
  away_team_id: "away-id",
  selected_team_id: "away-id",
  winning_team_id: null,
  game_label: "Away Team at Home Team",
  home_team: "Home Team",
  away_team: "Away Team",
  starts_at: startsAt,
  selected_team: "Away Team",
  selected_side: "away",
  status: "pending",
  home_score: null,
  away_score: null,
  created_at: "2026-01-01T12:00:00.000Z",
  updated_at: "2026-01-01T12:00:00.000Z",
  resolved_at: null,
  reward_points: 10,
  reward_claimed_at: null,
  scoring_mode: null,
  home_spread: null,
  away_spread: null,
  ...overrides,
});

const mockFinalScore = (homeScore: number, awayScore: number) => {
  store.fetchBallDontLieList.mockResolvedValue([
    {
      id: "nfl-game-1",
      status: "final",
      date: startsAt,
      home_team: { id: "home-id", full_name: "Home Team" },
      visitor_team: { id: "away-id", full_name: "Away Team" },
      home_team_score: homeScore,
      visitor_team_score: awayScore,
    },
  ]);
};

const mockLockedLine = (homeSpread: number, awaySpread: number) => {
  store.tables.nfl_pickem_game_lines = [
    {
      game_id: gameId,
      starts_at: startsAt,
      home_team: "Home Team",
      away_team: "Away Team",
      home_spread: homeSpread,
      away_spread: awaySpread,
      provider: "test",
      fetched_at: "2026-01-01T12:00:00.000Z",
      locked_at: startsAt,
    },
  ];
};

const mockUnlockedLine = (homeSpread: number, awaySpread: number) => {
  store.tables.nfl_pickem_game_lines = [
    {
      game_id: gameId,
      starts_at: startsAt,
      home_team: "Home Team",
      away_team: "Away Team",
      home_spread: homeSpread,
      away_spread: awaySpread,
      provider: "test",
      fetched_at: "2026-01-01T12:00:00.000Z",
      locked_at: null,
    },
  ];
};

const expectStoredLine = (overrides: MockRow) => {
  expect(store.tables.nfl_pickem_game_lines[0]).toMatchObject({
    game_id: gameId,
    starts_at: startsAt,
    home_team: "Home Team",
    away_team: "Away Team",
    provider: "test",
    fetched_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  store.tables = { pickem_picks: [], notifications: [], nfl_pickem_game_lines: [] };
  store.modes = new Map([["venue-1", "standard"]]);
});

describe("settlePendingPickEmPicks NFL scoring modes", () => {
  it("keeps standard NFL settlement on outright winner logic", async () => {
    store.tables.pickem_picks = [makePick()];
    mockFinalScore(21, 24);

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 1, won: 1, lost: 0, push: 0 });
    expect(store.tables.pickem_picks[0]).toMatchObject({
      status: "won",
      winning_team_id: "away-id",
      scoring_mode: "standard",
      home_spread: null,
      away_spread: null,
    });
  });

  it("locks an existing pre-kickoff line and settles spread NFL picks by the stored adjusted score", async () => {
    store.tables.pickem_picks = [makePick()];
    store.modes.set("venue-1", "spread");
    mockFinalScore(21, 20);
    mockUnlockedLine(-2.5, 2.5);

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 1, won: 1, lost: 0, push: 0 });
    expect(getLockedNFLPickEmGameLineForSettlement).toHaveBeenCalledWith(gameId);
    expectStoredLine({
      home_spread: -2.5,
      away_spread: 2.5,
      locked_at: startsAt,
    });
    expect(store.tables.pickem_picks[0]).toMatchObject({
      status: "won",
      winning_team_id: "home-id",
      scoring_mode: "spread",
      home_spread: -2.5,
      away_spread: 2.5,
    });
  });

  it("keeps spread NFL picks pending when no pre-existing line row exists", async () => {
    store.tables.pickem_picks = [makePick()];
    store.modes.set("venue-1", "spread");
    mockFinalScore(21, 20);

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 0, won: 0, lost: 0, push: 0 });
    expect(store.tables.nfl_pickem_game_lines).toEqual([]);
    expect(store.tables.pickem_picks[0]).toMatchObject({
      status: "pending",
      scoring_mode: null,
      home_spread: null,
      away_spread: null,
      resolved_at: null,
    });
  });

  it("settles spread NFL adjusted ties as push", async () => {
    store.tables.pickem_picks = [makePick()];
    store.modes.set("venue-1", "spread");
    mockFinalScore(24, 21);
    mockLockedLine(-1.5, 1.5);

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 1, won: 0, lost: 0, push: 1 });
    expect(store.tables.pickem_picks[0]).toMatchObject({
      status: "push",
      winning_team_id: "home-id",
      scoring_mode: "spread",
      home_spread: -1.5,
      away_spread: 1.5,
    });
  });

  it("does not recalculate already settled NFL picks after a mode toggle", async () => {
    store.tables.pickem_picks = [
      makePick({
        status: "won",
        winning_team_id: "away-id",
        resolved_at: "2026-01-01T22:00:00.000Z",
        scoring_mode: "standard",
      }),
    ];
    store.modes.set("venue-1", "spread");
    mockFinalScore(24, 21);
    mockLockedLine(-3, 3);

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ pendingScanned: 0, settledCount: 0 });
    expect(store.tables.pickem_picks[0]).toMatchObject({
      status: "won",
      scoring_mode: "standard",
      home_spread: null,
      away_spread: null,
    });
  });
});
