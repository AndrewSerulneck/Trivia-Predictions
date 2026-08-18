import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 3 of docs/prop-bingo-nfl-plan.md, end to end: an NFL board must read like a sports-bar
// argument — some named players, some team/game/quarter squares, some play-by-play squares — not
// like a spread ladder with a total bolted on.

type SquarePreview = { key: string; label: string; probability: number; bucket: string; resolverKind: string };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

const KICKOFF = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

const NFL_GAME = {
  id: 424129,
  date: KICKOFF,
  datetime: KICKOFF,
  home_team: { id: 1, full_name: "Philadelphia Eagles" },
  visitor_team: { id: 2, full_name: "Dallas Cowboys" },
  status: "Scheduled",
  week: 3,
  season: 2026,
  postseason: false,
};

const ODDS_ROWS = ["fanduel", "draftkings", "betmgm"].map((vendor) => ({
  game_id: 424129,
  vendor,
  spread_home_value: -5.5,
  total_value: 47.5,
  moneyline_home_odds: -240,
  moneyline_away_odds: 195,
}));

const PLAYERS = [
  { id: 11, first_name: "Jalen", last_name: "Hurts" },
  { id: 12, first_name: "Saquon", last_name: "Barkley" },
  { id: 13, first_name: "A.J.", last_name: "Brown" },
  { id: 14, first_name: "DeVonta", last_name: "Smith" },
  { id: 21, first_name: "Dak", last_name: "Prescott" },
  { id: 22, first_name: "CeeDee", last_name: "Lamb" },
  { id: 23, first_name: "Jake", last_name: "Ferguson" },
  { id: 24, first_name: "Brandon", last_name: "Aubrey" },
];

function overUnder(playerId: number, propType: string, line: number, overOdds = -110, underOdds = -110) {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: 424129,
    player_id: playerId,
    vendor,
    prop_type: propType,
    line_value: String(line),
    market: { type: "over_under", over_odds: overOdds, under_odds: underOdds },
  }));
}

function milestone(playerId: number, propType: string, odds: number) {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: 424129,
    player_id: playerId,
    vendor,
    prop_type: propType,
    line_value: "0.5",
    market: { type: "milestone", odds },
  }));
}

const PROP_ROWS = [
  ...overUnder(11, "passing_yards", 245.5),
  ...overUnder(11, "passing_tds", 1.5, -135, 110),
  ...overUnder(11, "rushing_yards", 40.5),
  ...overUnder(11, "interceptions", 0.5, 105, -130),
  ...overUnder(12, "rushing_yards", 89.5),
  ...overUnder(12, "rushing_attempts", 17.5),
  ...overUnder(12, "longest_rush", 18.5),
  ...overUnder(13, "receptions", 5.5),
  ...overUnder(13, "receiving_yards", 74.5),
  ...overUnder(14, "receptions", 4.5),
  ...overUnder(21, "passing_yards", 262.5),
  ...overUnder(21, "passing_completions", 22.5),
  ...overUnder(22, "receiving_yards", 82.5),
  ...overUnder(22, "longest_reception", 24.5),
  ...overUnder(23, "receptions", 3.5),
  ...overUnder(24, "kicking_points", 7.5),
  ...overUnder(24, "fg_made", 1.5),
  ...milestone(12, "anytime_td", -140),
  ...milestone(13, "anytime_td", 130),
  ...milestone(22, "anytime_td", 115),
  ...milestone(12, "first_td", 550),
  // Outside the Phase 0 allowlist: no box-score field, and a half-split that needs play-by-play.
  ...overUnder(11, "longest_pass", 41.5),
  ...overUnder(11, "passing_yards_1h", 120.5),
];

function installFetchMock(options: { odds?: unknown[]; props?: unknown[] } = {}) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/nfl/v1/odds/player_props")) {
      return Promise.resolve(bdlList(options.props ?? PROP_ROWS));
    }
    if (url.includes("/nfl/v1/odds")) {
      return Promise.resolve(bdlList(options.odds ?? ODDS_ROWS));
    }
    if (url.includes("/nfl/v1/players")) {
      return Promise.resolve(bdlList(PLAYERS));
    }
    if (url.includes("/nfl/v1/games")) {
      return Promise.resolve(bdlList([NFL_GAME]));
    }
    return Promise.resolve(bdlList([]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadSquares(): Promise<SquarePreview[]> {
  const { listSportsBingoSquareTemplates } = await import("@/lib/sportsBingo");
  const result = await listSportsBingoSquareTemplates({
    gameId: "424129",
    sportKey: "americanfootball_nfl",
  });
  return result.squares;
}

describe("NFL prop mix (Phase 3)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_ALLOW_POSSIBLE_SQUARES;
    delete process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds player-prop squares off the book's lines, with real names", async () => {
    installFetchMock();
    const squares = await loadSquares();

    const barkleyRushing = squares.find((square) => square.key === "player_prop:rushing_yards:saquon barkley::12:over:89.5");
    expect(barkleyRushing).toBeDefined();
    // House style: a half-point "over" is phrased as the threshold a player has to clear.
    expect(barkleyRushing!.label).toBe("Saquon Barkley: at least 90 rushing yards.");
    expect(barkleyRushing!.bucket).toBe("player-prop");
    // -110/-110 de-vigs to exactly a coin flip.
    expect(barkleyRushing!.probability).toBeCloseTo(0.5, 4);

    // Both sides of the same line are offered; the board picker chooses between them.
    expect(squares.some((square) => square.key === "player_prop:rushing_yards:saquon barkley::12:under:89.5")).toBe(true);

    // A half-point "over" reads as a threshold, not as a decimal.
    const hurtsTds = squares.find((square) => square.key.startsWith("player_prop:passing_tds:jalen hurts::11:over"));
    expect(hurtsTds!.label).toBe("Jalen Hurts: at least 2 passing touchdowns.");
  });

  it("phrases longest-rush and longest-reception squares as plays, not as unit counts", async () => {
    installFetchMock();
    const squares = await loadSquares();

    const longRush = squares.find((square) => square.key === "player_prop:longest_rush:saquon barkley::12:over:18.5");
    expect(longRush!.label).toBe("Saquon Barkley breaks off a run of 19+ yards.");
    const longCatch = squares.find((square) => square.key === "player_prop:longest_reception:ceedee lamb::22:over:24.5");
    expect(longCatch!.label).toBe("CeeDee Lamb hauls in a catch of 25+ yards.");
  });

  it("carries anytime-TD and first-TD milestone squares", async () => {
    installFetchMock();
    const squares = await loadSquares();

    const anytime = squares.find((square) => square.key === "nfl_player_anytime_td:saquon barkley::12");
    expect(anytime).toBeDefined();
    expect(anytime!.label).toBe("Saquon Barkley scores a touchdown.");
    expect(anytime!.probability).toBeGreaterThan(0.45);
    expect(anytime!.probability).toBeLessThan(0.6);

    const first = squares.find((square) => square.key === "nfl_player_first_td:saquon barkley::12");
    expect(first).toBeDefined();
    expect(first!.label).toBe("Saquon Barkley scores the game's first touchdown.");
    // A first-TD price is a real long shot and must stay one — not get inflated to look fair.
    expect(first!.probability).toBeLessThan(0.2);
  });

  it("drops prop types the box score cannot grade", async () => {
    installFetchMock();
    const squares = await loadSquares();
    expect(squares.some((square) => square.key.includes("longest_pass"))).toBe(false);
    expect(squares.some((square) => square.key.includes("passing_yards_1h"))).toBe(false);
  });

  it("offers team, game and quarter squares that exist without any player prop", async () => {
    installFetchMock({ props: [] });
    const squares = await loadSquares();

    for (const key of [
      "nfl_team_scores_every_quarter:home",
      "nfl_team_shutout_quarter:away",
      "nfl_team_quarter_points_at_least:home:14.0",
      "nfl_any_quarter_scoreless",
      "nfl_team_leads_at_halftime:away",
      "nfl_halftime_leader_loses",
      "nfl_overtime",
      "nfl_both_teams_score_at_least:20.0",
      "nfl_margin_at_most:3.5",
      "nfl_margin_at_least:16.5",
      "nfl_second_half_higher_scoring",
      // Optional 3b.
      "nfl_first_score_is_field_goal",
      "nfl_first_scorer_wins",
      "nfl_non_offensive_touchdown",
      "nfl_fourth_down_conversion",
      "nfl_long_touchdown:50",
    ]) {
      expect(squares.find((square) => square.key === key), `missing ${key}`).toBeDefined();
    }

    expect(squares.some((square) => square.bucket === "player-prop")).toBe(false);
    // The board still builds: this is the whole point of team/game squares.
    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
    const board = await generateSportsBingoBoard({
      gameId: "424129",
      sportKey: "americanfootball_nfl",
      generationMode: "preview",
    });
    expect(board.squares).toHaveLength(25);
  });

  it("drops the play-by-play family when its kill switch is off", async () => {
    process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED = "false";
    installFetchMock();
    const squares = await loadSquares();
    expect(squares.some((square) => square.key === "nfl_long_touchdown:50")).toBe(false);
    expect(squares.some((square) => square.key === "nfl_first_score_is_field_goal")).toBe(false);
    expect(squares.some((square) => square.key.startsWith("nfl_player_first_td"))).toBe(false);
    // The box-score core is untouched.
    expect(squares.some((square) => square.key.startsWith("nfl_player_anytime_td"))).toBe(true);
    expect(squares.some((square) => square.key === "nfl_margin_at_most:3.5")).toBe(true);
    delete process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED;
  });

  it("assembles a mixed board and never lets one player own it", async () => {
    installFetchMock();
    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const board = await generateSportsBingoBoard({
        gameId: "424129",
        sportKey: "americanfootball_nfl",
        generationMode: "preview",
      });
      const keys = board.squares.filter((square) => !square.isFree).map((square) => square.key);
      expect(keys).toHaveLength(24);

      const playerSquares = keys.filter(
        (key) => key.startsWith("player_prop:") || key.startsWith("nfl_player_")
      );
      const specialSquares = keys.filter((key) => key.startsWith("nfl_") && !key.startsWith("nfl_player_"));
      expect(playerSquares.length).toBeGreaterThanOrEqual(6);
      expect(specialSquares.length).toBeGreaterThanOrEqual(4);

      // Per-player cap: no quarterback may quietly become half the board's outcome.
      const perPlayer = new Map<string, number>();
      for (const key of playerSquares) {
        // Resolver player refs are stored as `Display Name::<balldontlie id>`.
        const player = /::(\d+)/.exec(key)?.[1] ?? key;
        perPlayer.set(player, (perPlayer.get(player) ?? 0) + 1);
      }
      for (const [player, count] of perPlayer) {
        expect(count, `${player} owns ${count} squares`).toBeLessThanOrEqual(2);
      }

      // Per-prop-type cap: not six receiving-yards squares.
      const perMarket = new Map<string, number>();
      for (const key of playerSquares) {
        const market = key.startsWith("player_prop:") ? key.split(":")[1] : key.split(":")[0];
        perMarket.set(market, (perMarket.get(market) ?? 0) + 1);
      }
      for (const [market, count] of perMarket) {
        expect(count, `${market} appears ${count} times`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("never puts two contradictory NFL squares on the same line", async () => {
    installFetchMock();
    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
    const LINES = [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19],
      [20, 21, 22, 23, 24],
      [0, 5, 10, 15, 20],
      [1, 6, 11, 16, 21],
      [2, 7, 12, 17, 22],
      [3, 8, 13, 18, 23],
      [4, 9, 14, 19, 24],
      [0, 6, 12, 18, 24],
      [4, 8, 12, 16, 20],
    ];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const board = await generateSportsBingoBoard({
        gameId: "424129",
        sportKey: "americanfootball_nfl",
        generationMode: "preview",
      });
      const keyByIndex = new Map(board.squares.map((square) => [square.index, square.key]));
      for (const line of LINES) {
        const keys = line.map((index) => keyByIndex.get(index) ?? "");
        // Both teams cannot lead at halftime.
        expect(
          keys.includes("nfl_team_leads_at_halftime:home") && keys.includes("nfl_team_leads_at_halftime:away")
        ).toBe(false);
        // A margin cannot be both 3-or-fewer and 17-or-more.
        expect(keys.includes("nfl_margin_at_most:3.5") && keys.includes("nfl_margin_at_least:16.5")).toBe(false);
        // Overtime caps the margin at 8, so it cannot coexist with a 17+ margin square.
        expect(keys.includes("nfl_overtime") && keys.includes("nfl_margin_at_least:16.5")).toBe(false);
        // A team either scores in all four quarters or is shut out in one — not both.
        for (const team of ["home", "away"]) {
          expect(
            keys.includes(`nfl_team_scores_every_quarter:${team}`) &&
              keys.includes(`nfl_team_shutout_quarter:${team}`)
          ).toBe(false);
          expect(
            keys.includes(`nfl_team_scores_every_quarter:${team}`) && keys.includes("nfl_any_quarter_scoreless")
          ).toBe(false);
        }
      }
    }
  });

  it("hides a game the books never priced instead of listing it and then erroring", async () => {
    installFetchMock({ odds: [] });
    const { listSportsBingoGames, generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    const games = await listSportsBingoGames({
      sportKey: "americanfootball_nfl",
      includeLocked: true,
      tzOffsetMinutes: new Date(KICKOFF).getTimezoneOffset(),
    });
    expect(games.some((game) => game.id === "424129")).toBe(false);

    // And the deep-link path reads as an absence, not as an internal shortfall.
    await expect(
      generateSportsBingoBoard({ gameId: "424129", sportKey: "americanfootball_nfl", generationMode: "preview" })
    ).rejects.toThrow(/No bingo board is available/);
  });

  it("leaves NBA untouched — no NFL props call, no NFL squares", async () => {
    const nbaGame = {
      id: 555,
      date: KICKOFF,
      datetime: KICKOFF,
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
    const result = await listSportsBingoSquareTemplates({ gameId: "555", sportKey: "basketball_nba" });

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("player_props"))).toBe(false);
    expect(result.squares.some((square) => square.key.startsWith("nfl_"))).toBe(false);
    expect(result.squares.find((square) => square.key === "moneyline:home")?.probability).toBeCloseTo(0.55, 6);
  });
});
