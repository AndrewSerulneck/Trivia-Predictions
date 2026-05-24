import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockResponsePayload = {
  status?: number;
  ok?: boolean;
  body: unknown;
};

function jsonResponse(payload: MockResponsePayload): Response {
  const { status = 200, ok = true, body } = payload;
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ body: { data, meta: { next_cursor: null } } });
}

describe("sports bingo player props ingestion", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ODDS_API_KEY = "test-odds-key";
    process.env.ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
    process.env.BINGO_BOARD_SIM_TRIALS = "600";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds NBA board using BallDontLie player profiles", async () => {
    const nbaGame = {
      id: "nba-evt-1",
      date: "2030-01-01T22:00:00Z",
      home_team: { id: 2, full_name: "Boston Celtics" },
      visitor_team: { id: 20, full_name: "New York Knicks" },
      status: "Final",
    };

    const nbaPlayers = [
      { id: 101, first_name: "Jayson", last_name: "Tatum", team: { id: 2 } },
      { id: 102, first_name: "Jalen", last_name: "Brunson", team: { id: 20 } },
      { id: 103, first_name: "Kristaps", last_name: "Porzingis", team: { id: 2 } },
    ];

    const nbaSeasonAverages = [
      { player: { id: 101 }, stats: { pts: 26.9, reb: 8.1, ast: 4.9, stl: 1.1, blk: 0.6, fg3m: 3.2, fg3a: 8.1, fgm: 9.8, fga: 21.2, ftm: 4.3, fta: 5.1, oreb: 1.2, dreb: 6.9, min: 36.2, plus_minus: 5.1 } },
      { player: { id: 102 }, stats: { pts: 27.5, reb: 3.5, ast: 6.8, stl: 0.8, blk: 0.2, fg3m: 2.5, fg3a: 6.2, fgm: 9.7, fga: 20.5, ftm: 5.6, fta: 6.3, oreb: 0.4, dreb: 3.1, min: 33.8, plus_minus: 2.3 } },
      { player: { id: 103 }, stats: { pts: 20.1, reb: 7.2, ast: 1.9, stl: 0.7, blk: 1.9, fg3m: 1.8, fg3a: 4.5, fgm: 7.4, fga: 14.8, ftm: 3.6, fta: 4.5, oreb: 1.7, dreb: 5.5, min: 28.5, plus_minus: 3.2 } },
    ];

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/nba/v1/games")) {
        return Promise.resolve(bdlList([nbaGame]));
      }
      if (url.includes("/nba/v1/players")) {
        return Promise.resolve(bdlList(nbaPlayers));
      }
      if (url.includes("/nba/v1/season_averages")) {
        return Promise.resolve(bdlList(nbaSeasonAverages));
      }
      // /nba/v1/stats (historical) and /nba/v1/lineups — return empty
      return Promise.resolve(bdlList([]));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    const board = await generateSportsBingoBoard({
      gameId: "nba-evt-1",
      sportKey: "basketball_nba",
    });

    expect(board.squares).toHaveLength(25);
    expect(board.squares.some((sq) => sq.label.toLowerCase().includes("triple-double"))).toBe(true);
    expect(board.squares.some((sq) => sq.label.includes("Jayson Tatum"))).toBe(true);
    expect(
      board.squares.some((sq) =>
        /points \+ rebounds|points \+ assists|rebounds \+ assists|points \+ rebounds \+ assists/i.test(sq.label)
      )
    ).toBe(false);
  });

  it("builds NFL board using spread and total markets", async () => {
    const nflGame = {
      id: "nfl-evt-1",
      date: "2030-01-02T18:00:00Z",
      home_team: { id: 4, full_name: "Buffalo Bills" },
      visitor_team: { id: 19, full_name: "New York Jets" },
      status: "Final",
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/nfl/v1/games")) {
        return Promise.resolve(bdlList([nflGame]));
      }
      return Promise.resolve(bdlList([]));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    const board = await generateSportsBingoBoard({
      gameId: "nfl-evt-1",
      sportKey: "americanfootball_nfl",
    });

    expect(board.squares).toHaveLength(25);
    expect(
      board.squares.some((sq) => sq.key.startsWith("spread_") || sq.key.startsWith("game_total_"))
    ).toBe(true);
  });
});
