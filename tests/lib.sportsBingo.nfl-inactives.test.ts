import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 4 of docs/prop-bingo-nfl-activation-plan.md — inactives and late scratches.
//
// MLB has `autoSwapLateScratchedStarSquares`; NFL had nothing, so a Sunday board generated
// Saturday could hand eight prop squares to a player who is inactive. Three things are proven
// here:
//   1. pre-generation — a player on the injury report as Out / Doubtful / IR / season-reserve
//      never becomes a prop square (and Phase 1 finding #2: an off-roster market is dropped too);
//   2. post-lock — inside the kickoff window, a prop square whose player is now inactive is
//      planned for a swap to a live whole-game square;
//   3. the settlement-time safety net still holds: a DNP player at Final voids, never misses.

// --------------------------------------------------------------------------------------------
// 1. Pre-generation injury filter — driven through the real board-template path with a mocked
//    balldontlie feed, the same style as tests/lib.sportsBingo.nfl-prop-mix.test.ts.
// --------------------------------------------------------------------------------------------

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

// id 11 Hurts (healthy), id 12 Barkley (will be ruled Out), id 13 A.J. Brown (healthy but the
// profile feed will place him on a third team — Phase 1 finding #2).
const PLAYERS = [
  { id: 11, first_name: "Jalen", last_name: "Hurts", team: { id: 1, full_name: "Philadelphia Eagles" } },
  { id: 12, first_name: "Saquon", last_name: "Barkley", team: { id: 1, full_name: "Philadelphia Eagles" } },
  { id: 13, first_name: "A.J.", last_name: "Brown", team: { id: 9, full_name: "Tennessee Titans" } },
  { id: 21, first_name: "Dak", last_name: "Prescott", team: { id: 2, full_name: "Dallas Cowboys" } },
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
  ...overUnder(11, "rushing_yards", 40.5),
  ...overUnder(12, "rushing_yards", 89.5),
  ...overUnder(12, "receptions", 3.5),
  ...milestone(12, "anytime_td", -140),
  ...overUnder(13, "receiving_yards", 74.5),
  ...overUnder(13, "receptions", 5.5),
  ...overUnder(21, "passing_yards", 262.5),
];

// The `/nfl/v1/player_injuries` shape probed live 2026-09-05.
function injuryRow(playerId: number, first: string, last: string, status: string) {
  return { player: { id: playerId, first_name: first, last_name: last }, status };
}

function installFetchMock(injuries: unknown[]) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/nfl/v1/player_injuries")) {
      return Promise.resolve(bdlList(injuries));
    }
    if (url.includes("/nfl/v1/odds/player_props")) {
      return Promise.resolve(bdlList(PROP_ROWS));
    }
    if (url.includes("/nfl/v1/odds")) {
      return Promise.resolve(bdlList(ODDS_ROWS));
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

describe("NFL pre-generation injury filter (Phase 4)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_ALLOW_POSSIBLE_SQUARES;
    delete process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every posted player when the injury feed is empty", async () => {
    installFetchMock([]);
    const squares = await loadSquares();
    expect(squares.some((square) => square.key.startsWith("player_prop:rushing_yards:saquon barkley::12"))).toBe(true);
    expect(squares.some((square) => square.key === "nfl_player_anytime_td:saquon barkley::12")).toBe(true);
    expect(squares.some((square) => square.key.startsWith("player_prop:passing_yards:jalen hurts::11"))).toBe(true);
  });

  it("drops every square for a player ruled Out, and keeps the rest of the board", async () => {
    installFetchMock([injuryRow(12, "Saquon", "Barkley", "Out")]);
    const squares = await loadSquares();
    expect(squares.some((square) => square.key.includes("saquon barkley::12"))).toBe(false);
    expect(squares.some((square) => square.key.includes("::12"))).toBe(false);
    // Healthy team-mate is untouched.
    expect(squares.some((square) => square.key.startsWith("player_prop:passing_yards:jalen hurts::11"))).toBe(true);
  });

  it("treats IR and Doubtful as inactive but leaves Questionable alone", async () => {
    installFetchMock([
      injuryRow(12, "Saquon", "Barkley", "IR"),
      injuryRow(11, "Jalen", "Hurts", "Questionable"),
    ]);
    const squares = await loadSquares();
    expect(squares.some((square) => square.key.includes("::12"))).toBe(false);
    expect(squares.some((square) => square.key.startsWith("player_prop:passing_yards:jalen hurts::11"))).toBe(true);
  });

  it("drops a market whose resolved team is neither side of this game (Phase 1 finding #2)", async () => {
    installFetchMock([]);
    const squares = await loadSquares();
    // A.J. Brown's profile put him on the Titans; this game is Eagles @ Cowboys.
    expect(squares.some((square) => square.key.includes("a j brown::13"))).toBe(false);
    expect(squares.some((square) => square.key.includes("::13"))).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------
// 2. Post-lock swap decision — the pure planner, no Supabase.
// --------------------------------------------------------------------------------------------

describe("planNFLInactivePropSwaps (Phase 4 post-lock swap)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  type PlanParams = Parameters<typeof import("@/lib/sportsBingo")["planNFLInactivePropSwaps"]>[0];

  function card(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
      id: "card-1",
      game_id: "424129",
      game_label: "Eagles @ Cowboys",
      sport_key: "americanfootball_nfl",
      home_team: "Philadelphia Eagles",
      away_team: "Dallas Cowboys",
      // kickoff 30 minutes out → inside the 150-minute swap window.
      starts_at: new Date(now + 30 * 60_000).toISOString(),
      created_at: new Date(now - 60 * 60_000).toISOString(),
      ...overrides,
    };
  }

  function square(overrides: Record<string, unknown>) {
    return {
      id: "sq-x",
      card_id: "card-1",
      square_index: 7,
      label: "",
      probability: 0.5,
      is_free: false,
      status: "pending",
      created_at: new Date().toISOString(),
      resolved_at: null,
      ...overrides,
    };
  }

  async function plan(params: {
    squares: unknown[];
    injuries: Array<{ id: number; first: string; last: string; status: string }>;
    cardOverrides?: Record<string, unknown>;
    nowMs?: number;
  }) {
    const mod = await import("@/lib/sportsBingo");
    const { buildNFLInjuryIndex } = await import("@/lib/sportsBingoNflInjuries");
    const injuryIndex = buildNFLInjuryIndex(
      params.injuries.map((row) => ({
        player: { id: row.id, first_name: row.first, last_name: row.last },
        status: row.status,
      })),
      false
    );
    return mod.planNFLInactivePropSwaps({
      card: card(params.cardOverrides),
      squares: params.squares,
      injuryIndex,
      nowMs: params.nowMs,
    } as unknown as PlanParams);
  }

  it("swaps a player-prop square whose player is now Out for a whole-game square", async () => {
    const swaps = await plan({
      squares: [
        square({
          id: "sq-1",
          square_index: 4,
          probability: 0.44,
          resolver: { kind: "player_prop", marketKey: "rushing_yards", player: "Saquon Barkley::12", line: 89.5, direction: "over" },
        }),
      ],
      injuries: [{ id: 12, first: "Saquon", last: "Barkley", status: "Out" }],
    });
    expect(swaps).toHaveLength(1);
    expect(swaps[0].squareId).toBe("sq-1");
    expect(swaps[0].replacementResolver).toEqual({ kind: "nfl_both_teams_score_at_least", threshold: 17 });
    expect(swaps[0].replacementLabel.length).toBeGreaterThan(0);
    // Keeps its own priced probability (clamped), not re-modelled.
    expect(swaps[0].probability).toBeCloseTo(0.44, 5);
  });

  it("also swaps anytime-TD and first-TD squares for an inactive player", async () => {
    const swaps = await plan({
      squares: [
        square({ id: "td-a", resolver: { kind: "nfl_player_anytime_td", player: "Saquon Barkley::12" } }),
        square({ id: "td-f", resolver: { kind: "nfl_player_first_td", player: "Saquon Barkley::12" } }),
      ],
      injuries: [{ id: 12, first: "Saquon", last: "Barkley", status: "Doubtful" }],
    });
    expect(swaps.map((swap) => swap.squareId).sort()).toEqual(["td-a", "td-f"]);
  });

  it("leaves healthy players, non-player squares, and already-resolved squares alone", async () => {
    const swaps = await plan({
      squares: [
        square({ id: "healthy", resolver: { kind: "nfl_player_anytime_td", player: "Jalen Hurts::11" } }),
        square({ id: "team", resolver: { kind: "nfl_both_teams_score_at_least", threshold: 20 } }),
        square({
          id: "resolved",
          status: "hit",
          resolver: { kind: "player_prop", marketKey: "rushing_yards", player: "Saquon Barkley::12", line: 89.5, direction: "over" },
        }),
      ],
      injuries: [{ id: 12, first: "Saquon", last: "Barkley", status: "Out" }],
    });
    expect(swaps).toHaveLength(0);
  });

  it("matches an inactive player by name when the resolver ref carries no id", async () => {
    const swaps = await plan({
      squares: [
        square({ id: "noid", resolver: { kind: "nfl_player_anytime_td", player: "Saquon Barkley" } }),
      ],
      injuries: [{ id: 12, first: "Saquon", last: "Barkley", status: "Out" }],
    });
    expect(swaps).toHaveLength(1);
  });

  it("does nothing outside the kickoff window", async () => {
    const swaps = await plan({
      squares: [
        square({ id: "sq-1", resolver: { kind: "nfl_player_anytime_td", player: "Saquon Barkley::12" } }),
      ],
      injuries: [{ id: 12, first: "Saquon", last: "Barkley", status: "Out" }],
      // kickoff 10 hours out, card created 10 hours ago → outside both windows.
      cardOverrides: {
        starts_at: new Date(Date.now() + 10 * 60 * 60_000).toISOString(),
        created_at: new Date(Date.now() - 10 * 60 * 60_000).toISOString(),
      },
    });
    expect(swaps).toHaveLength(0);
  });

  it("does nothing when the injury pull failed (no signal, never 'everyone healthy')", async () => {
    const mod = await import("@/lib/sportsBingo");
    const { buildNFLInjuryIndex } = await import("@/lib/sportsBingoNflInjuries");
    const failedIndex = buildNFLInjuryIndex(
      [{ player: { id: 12, first_name: "Saquon", last_name: "Barkley" }, status: "Out" }],
      true
    );
    const swaps = mod.planNFLInactivePropSwaps({
      card: card(),
      squares: [square({ id: "sq-1", resolver: { kind: "nfl_player_anytime_td", player: "Saquon Barkley::12" } })],
      injuryIndex: failedIndex,
      nowMs: Date.now(),
    } as unknown as PlanParams);
    expect(swaps).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------------------------
// 3. Settlement safety net — a DNP player at Final voids, never misses. Mirrors
//    tests/lib.sportsBingo.missing-data-voids.test.ts for the NFL prop path.
// --------------------------------------------------------------------------------------------

describe("NFL DNP player voids at Final (Phase 4 safety net)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const NFL_PROP_RESOLVER = {
    kind: "player_prop",
    marketKey: "rushing_yards",
    player: "Saquon Barkley::12",
    line: 89.5,
    direction: "over",
  } as const;

  const FINAL_NO_SNAPSHOT = {
    gameId: "424129",
    sportKey: "americanfootball_nfl",
    homeTeam: "Philadelphia Eagles",
    awayTeam: "Dallas Cowboys",
    homeScore: 24,
    awayScore: 20,
    completed: true,
  } as const;

  it("voids (not misses) when the box score has no row for the player at Final", async () => {
    const { evaluateResolver } = await import("@/lib/sportsBingo");
    const result = evaluateResolver(NFL_PROP_RESOLVER, FINAL_NO_SNAPSHOT, null, null, null);
    expect(result).toEqual({ status: "void", resolved: true });
  });

  it("stays pending, not miss, while the game is still in progress", async () => {
    const { evaluateResolver } = await import("@/lib/sportsBingo");
    const result = evaluateResolver(
      NFL_PROP_RESOLVER,
      { ...FINAL_NO_SNAPSHOT, completed: false },
      null,
      null,
      null
    );
    expect(result).toEqual({ status: "pending", resolved: false });
  });
});
