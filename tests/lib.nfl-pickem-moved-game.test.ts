import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dedicated NFL Pick 'Em CR1.2.1 (docs/bingo-pickem-reliability-plan.md, F44): a game id embeds the feed's
// start time, so a moved kickoff gets a new id. The week list must still show the player's pick, and a
// submit must switch that one row's side, never insert a second pick.

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  fetchBallDontLieList: vi.fn(),
}));

vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: db.fetchBallDontLieList }));

vi.mock("@/lib/pickemPickWindowGate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickemPickWindowGate")>()),
  readVenueGameSettingsForPick: vi.fn(() =>
    Promise.resolve({ nflPickEmScoringMode: "standard", cfbPickEmScoringMode: "spread", pickWindows: {} })
  ),
}));

vi.mock("@/lib/venueGameSettings", () => ({
  getVenueNFLPickEmScoringMode: vi.fn(() => Promise.resolve("standard")),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let patch: MockRow | null = null;
    let insertRows: MockRow[] | null = null;
    const at = (value: unknown) => Date.parse(String(value ?? ""));
    const rows = () => (db.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
    const resolve = () => {
      if (insertRows) {
        const added = insertRows.map((row, index) => ({ id: `inserted-${(db.tables[table] ?? []).length + index}`, ...row }));
        db.tables[table] = [...(db.tables[table] ?? []), ...added];
        return Promise.resolve({ data: added, error: null });
      }
      if (patch) {
        const matched = rows();
        for (const row of matched) Object.assign(row, patch);
        return Promise.resolve({ data: matched.map((row) => ({ ...row })), error: null });
      }
      return Promise.resolve({ data: rows(), error: null });
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) >= at(value));
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) <= at(value));
        return builder;
      },
      lt: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) < at(value));
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      range: () => builder,
      returns: () => builder,
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      insert: (value: MockRow | MockRow[]) => {
        insertRows = Array.isArray(value) ? value : [value];
        return builder;
      },
      maybeSingle: () => resolve().then(({ data, error }) => ({ data: data?.[0] ?? null, error })),
      single: () =>
        resolve().then(({ data, error }) =>
          data?.[0] ? { data: data[0], error } : { data: null, error: { message: "not found" } }
        ),
      then: (
        onfulfilled?: ((value: { data: MockRow[] | null; error: { message: string } | null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => resolve().then(onfulfilled, onrejected),
    };
    return builder;
  };
  return { supabaseAdmin: { from: (table: string) => createBuilder(table), rpc: () => Promise.resolve({ data: null, error: null }) } };
});

import { listNFLPickEmGames, submitNFLPickEmPick } from "@/lib/nflPickEm";

const OLD_START = "2027-09-12T17:00:00.000Z";
const NEW_START = "2027-09-12T20:25:00.000Z";
const OLD_ID = `9001__${OLD_START}__Kansas City Chiefs__Buffalo Bills`;
const NEW_ID = `9001__${NEW_START}__Kansas City Chiefs__Buffalo Bills`;

const bdlGame = (date: string) => ({
  id: 9001,
  date,
  status: "scheduled",
  home_team: { id: 2, full_name: "Buffalo Bills" },
  visitor_team: { id: 1, full_name: "Kansas City Chiefs" },
  home_team_score: null,
  visitor_team_score: null,
  winner_team: null,
});

const storedPick = (overrides: MockRow = {}): MockRow => ({
  id: "pick-1",
  user_id: "user-1",
  venue_id: "venue-1",
  sport_slug: "nfl",
  sport_key: "americanfootball_nfl",
  league: "NFL",
  game_id: OLD_ID,
  home_team_id: "2",
  away_team_id: "1",
  selected_team_id: "2",
  winning_team_id: null,
  game_label: "Kansas City Chiefs vs Buffalo Bills",
  home_team: "Buffalo Bills",
  away_team: "Kansas City Chiefs",
  starts_at: OLD_START,
  selected_team: "Buffalo Bills",
  selected_side: "home",
  status: "pending",
  home_score: null,
  away_score: null,
  created_at: "2027-09-08T12:00:00.000Z",
  updated_at: "2027-09-08T12:00:00.000Z",
  resolved_at: null,
  reward_points: 10,
  reward_claimed_at: null,
  ...overrides,
});

const params = { userId: "user-1", venueId: "venue-1", weekId: "week-1" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-09-10T12:00:00.000Z"));
  db.tables = {
    nfl_pickem_weeks: [
      {
        id: "week-1",
        season: 2027,
        week_number: 1,
        week_type: "regular",
        display_label: null,
        week_start_date: "2027-09-09",
        week_end_date: "2027-09-13",
        thursday_kickoff: "2027-09-10T00:20:00.000Z",
        status: "upcoming",
        games_count: 1,
        synced_at: null,
      },
    ],
    pickem_picks: [storedPick()],
  };
  db.fetchBallDontLieList.mockResolvedValue([bdlGame(NEW_START)]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dedicated NFL Pick 'Em: a moved game keeps its pick (CR1.2.1)", () => {
  it("shows the player's pick on the game under its new id", async () => {
    const { games } = await listNFLPickEmGames(params);
    expect(games[0].id).toBe(NEW_ID);
    expect(games[0].userPickId).toBe("pick-1");
    expect(games[0].userPickTeam).toBe("Buffalo Bills");
  });

  it("does not show a canceled pick on a moved game", async () => {
    db.tables.pickem_picks = [storedPick({ status: "canceled" })];
    const { games } = await listNFLPickEmGames(params);
    expect(games[0].userPickId).toBeUndefined();
  });

  it("switches the one row's side on the new id instead of inserting a second pick", async () => {
    const pick = await submitNFLPickEmPick({ ...params, gameId: NEW_ID, pickTeam: "Kansas City Chiefs" });
    expect(db.tables.pickem_picks).toHaveLength(1);
    expect(pick.id).toBe("pick-1");
    expect(db.tables.pickem_picks[0].selected_team).toBe("Kansas City Chiefs");
    expect(db.tables.pickem_picks[0].selected_side).toBe("away");
  });

  it("refuses when another venue holds the pick on the same game", async () => {
    db.tables.pickem_picks = [storedPick({ venue_id: "venue-2" })];
    await expect(submitNFLPickEmPick({ ...params, gameId: NEW_ID, pickTeam: "Kansas City Chiefs" })).rejects.toThrow(
      "You already made a pick for this game."
    );
    expect(db.tables.pickem_picks).toHaveLength(1);
  });

  it("still inserts a first pick on a game the player has not picked", async () => {
    db.tables.pickem_picks = [];
    await submitNFLPickEmPick({ ...params, gameId: NEW_ID, pickTeam: "Kansas City Chiefs" });
    expect(db.tables.pickem_picks).toHaveLength(1);
    expect(db.tables.pickem_picks[0].game_id).toBe(NEW_ID);
  });
});
