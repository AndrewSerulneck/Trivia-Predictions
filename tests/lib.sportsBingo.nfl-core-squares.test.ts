import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 2 of docs/prop-bingo-nfl-plan.md, end to end: an NFL game's core squares must come off the
// real market consensus, and a game the books haven't priced must NOT fall back to the fictional
// homeWinProb=0.55 / total=45 constants and quietly ship a board built on them.

type SquarePreview = { key: string; label: string; probability: number };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

const NFL_GAME = {
  id: 987654,
  date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  datetime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  home_team: { id: 1, full_name: "Kansas City Chiefs" },
  visitor_team: { id: 2, full_name: "Buffalo Bills" },
  status: "Scheduled",
  week: 1,
  season: 2026,
  postseason: false,
};

// Home favored by 6.5 in a 51-point game — deliberately nothing like the old -3.5 / 45 constants,
// so any square still built on those stands out.
const ODDS_ROWS = [
  { game_id: 987654, vendor: "fanduel", spread_home_value: -6.5, total_value: 51, moneyline_home_odds: -280, moneyline_away_odds: 230 },
  { game_id: 987654, vendor: "draftkings", spread_home_value: -6.5, total_value: 51.5, moneyline_home_odds: -275, moneyline_away_odds: 225 },
  { game_id: 987654, vendor: "betmgm", spread_home_value: -7, total_value: 50.5, moneyline_home_odds: -285, moneyline_away_odds: 235 },
];

function installFetchMock(options: { odds: unknown[] }) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/nfl/v1/odds")) {
      return Promise.resolve(bdlList(options.odds));
    }
    if (url.includes("/nfl/v1/games")) {
      return Promise.resolve(bdlList([NFL_GAME]));
    }
    return Promise.resolve(bdlList([]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadSquares(): Promise<{ squares: SquarePreview[]; fetchMock: ReturnType<typeof vi.fn> }> {
  const { listSportsBingoSquareTemplates } = await import("@/lib/sportsBingo");
  const result = await listSportsBingoSquareTemplates({
    gameId: "987654",
    sportKey: "americanfootball_nfl",
    includePlayerProps: false,
  });
  return { squares: result.squares, fetchMock: global.fetch as unknown as ReturnType<typeof vi.fn> };
}

describe("NFL core squares from market consensus", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_ALLOW_POSSIBLE_SQUARES;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches slate odds once and centers the spread ladder on the market number", async () => {
    const fetchMock = installFetchMock({ odds: ODDS_ROWS });
    const { squares } = await loadSquares();

    const oddsCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/nfl/v1/odds"));
    expect(oddsCalls).toHaveLength(1);
    expect(String(oddsCalls[0][0])).toContain("game_ids%5B%5D=987654");

    // Consensus home spread is -6.5, so the ladder is built around 6.5 and the 6.5 rung sits near
    // a coin flip. Under the old hardcoded -3.5 there would have been no 6.5-and-up rung at all
    // priced this way.
    const chiefsBy6 = squares.find((s) => s.key === "spread_more_than:home:6.5");
    expect(chiefsBy6).toBeDefined();
    expect(chiefsBy6!.probability).toBeGreaterThan(0.44);
    expect(chiefsBy6!.probability).toBeLessThan(0.56);

    // Laying more points must be strictly harder.
    const chiefsBy10 = squares.find((s) => s.key === "spread_more_than:home:10.5");
    expect(chiefsBy10!.probability).toBeLessThan(chiefsBy6!.probability);

    // "Bills stay within 6.5" is the exact complement (half-point line, no push).
    const billsClose = squares.find((s) => s.key === "spread_keep_close:away:6.5");
    expect(billsClose!.probability).toBeCloseTo(1 - chiefsBy6!.probability, 6);
  });

  it("prices the moneyline off the de-vigged market rather than the old 0.55 constant", async () => {
    installFetchMock({ odds: ODDS_ROWS });
    const { squares } = await loadSquares();

    const homeMl = squares.find((s) => s.key === "moneyline:home")!;
    const awayMl = squares.find((s) => s.key === "moneyline:away")!;
    // -280/+230 de-vigs to ~0.73 — nowhere near the hardcoded 0.55 this phase replaces.
    expect(homeMl.probability).toBeGreaterThan(0.7);
    expect(homeMl.probability).toBeLessThan(0.78);
    expect(homeMl.probability + awayMl.probability).toBeCloseTo(1, 6);
  });

  it("centers totals and team totals on the market, not on the league average", async () => {
    installFetchMock({ odds: ODDS_ROWS });
    const { squares } = await loadSquares();

    // Consensus total is 51 -> implied 28.75 / 22.25.
    const over51 = squares.find((s) => s.key === "game_total_over:51.5");
    expect(over51).toBeDefined();
    expect(over51!.probability).toBeGreaterThan(0.44);
    expect(over51!.probability).toBeLessThan(0.52);

    // The old constant would have made 45 the centerpoint; at a 51-point market the over there is
    // a heavy favorite instead of a coin flip.
    const over45 = squares.find((s) => s.key === "game_total_over:45.5");
    if (over45) {
      expect(over45.probability).toBeGreaterThan(0.6);
    }

    // The favorite's implied team total is the higher one.
    const homeTeamTotals = squares.filter((s) => s.key.startsWith("team_total_over:home:"));
    const awayTeamTotals = squares.filter((s) => s.key.startsWith("team_total_over:away:"));
    expect(homeTeamTotals.length).toBeGreaterThan(0);
    expect(awayTeamTotals.length).toBeGreaterThan(0);
    const sharedLine = "team_total_over:home:25.5";
    const homeAt25 = squares.find((s) => s.key === sharedLine);
    const awayAt25 = squares.find((s) => s.key === "team_total_over:away:25.5");
    if (homeAt25 && awayAt25) {
      expect(homeAt25.probability).toBeGreaterThan(awayAt25.probability);
    }
  });

  it("still produces a full 24-square board", async () => {
    installFetchMock({ odds: ODDS_ROWS });
    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
    const board = await generateSportsBingoBoard({
      gameId: "987654",
      sportKey: "americanfootball_nfl",
      generationMode: "preview",
    });
    expect(board.squares).toHaveLength(25);
    expect(board.squares.filter((square) => square.isFree)).toHaveLength(1);
    // Every non-free square is market-derived, so none of them may be flagged `possible`.
    expect(board.squares.every((square) => square.isFree || square.supportLevel !== "possible")).toBe(true);
    expect(board.boardProbability).toBeGreaterThan(0);
  });

  it("withholds a board for a game no sportsbook has priced instead of inventing numbers", async () => {
    installFetchMock({ odds: [] });
    const { squares } = await loadSquares();

    // Every core square is demoted to `possible`, which BINGO_ALLOW_POSSIBLE_SQUARES=false filters
    // out — so an unpriced NFL game yields nothing rather than a board built on fiction.
    expect(squares).toHaveLength(0);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
    await expect(
      generateSportsBingoBoard({ gameId: "987654", sportKey: "americanfootball_nfl", generationMode: "preview" })
    ).rejects.toThrow();
  });

  it("leaves NBA on its untouched league-average path and never asks for NFL odds", async () => {
    const nbaGame = {
      id: 555,
      date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      datetime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      home_team: { id: 2, full_name: "Boston Celtics" },
      visitor_team: { id: 20, full_name: "New York Knicks" },
      status: "Scheduled",
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/nba/v1/games")) return Promise.resolve(bdlList([nbaGame]));
      return Promise.resolve(bdlList([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { listSportsBingoSquareTemplates } = await import("@/lib/sportsBingo");
    const result = await listSportsBingoSquareTemplates({
      gameId: "555",
      sportKey: "basketball_nba",
      includePlayerProps: false,
    });

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/odds"))).toBe(false);
    // The legacy 0.55 home-win constant is still exactly what NBA gets.
    expect(result.squares.find((s) => s.key === "moneyline:home")?.probability).toBeCloseTo(0.55, 6);
  });
});
