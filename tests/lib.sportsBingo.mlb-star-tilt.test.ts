import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 9d of docs/prop-bingo-nfl-plan.md — MLB star-tilted prop selection, end to end through real
// board generation. The MLB twin of tests/lib.sportsBingo.nfl-star-tilt.test.ts, and it exists for
// the same two-sided ask: names people recognise should be likelier to land on a board, and a board
// of six famous names with no unknowns is as much of a failure as a board of six unknowns.
//
// What this file replaces: before Phase 9d, MLB's only star signal was
// `MLB_STAR_BRANDED_PLAYER_KEYS` — eleven hardcoded names carrying a flat 1.45x draw boost, with no
// test anywhere. That is the thing being retired, so it is the thing that now needs coverage.
//
// Two fixtures, mirroring the NFL file:
//   - REALISTIC — stars carry every posted market, role players carry one or two, as a live book
//     slate does. This is where the reservation, the ceiling and the diversity caps interact.
//   - FLAT — every hitter carries the same five markets and the only separator is the home-run
//     price, so "chance" is exactly 1 / number of players and the tilt can be stated as a number.

type BoardSquare = { key: string; label: string; probability: number; isFree: boolean };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

const GAME_ID = 5900001;
const FIRST_PITCH = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
const HOME_TEAM = "Cincinnati Reds";
const AWAY_TEAM = "St. Louis Cardinals";
const DAY_MS = 24 * 60 * 60 * 1000;

const mlbGame = (id: string | number, date: string, status: string) => ({
  id,
  date,
  datetime: date,
  status,
  home_team: { id: 1, display_name: HOME_TEAM, full_name: HOME_TEAM },
  away_team: { id: 2, display_name: AWAY_TEAM, full_name: AWAY_TEAM },
  visitor_team: { id: 2, display_name: AWAY_TEAM, full_name: AWAY_TEAM },
});

const UPCOMING_GAME = mlbGame(GAME_ID, FIRST_PITCH, "STATUS_SCHEDULED");

/**
 * Trailing history for the same two clubs. Both are required: `relatedGameIds` in
 * `buildMLBPlayerPropCandidatesFromRecentStats` filters history to games involving one of the two
 * teams in the matchup, and with none the whole team-event block — most of an MLB board — is never
 * built and generation cannot reach 24 squares.
 */
const HISTORY_GAMES = Array.from({ length: 10 }, (_, index) =>
  mlbGame(`hist-${index}`, new Date(Date.now() - (index + 2) * DAY_MS).toISOString(), "STATUS_FINAL")
);

const ODDS_ROWS = ["fanduel", "draftkings", "betmgm"].map((vendor) => ({
  game_id: GAME_ID,
  vendor,
  spread_home_value: -1.5,
  total_value: 8.5,
  moneyline_home_odds: -140,
  moneyline_away_odds: 120,
}));

// Invented names on purpose: none is in `MLB_BRAND_NAME_BONUS`, so every tier below is earned by
// the market signal and no assertion here is secretly measuring the brand list.
const PLAYER_NAMES: Array<[number, string, string]> = [
  [201, "Marcus", "Ellwood"],
  [202, "Tobias", "Rannick"],
  [203, "Desmond", "Vail"],
  [204, "Corbin", "Reyes"],
  [205, "Elias", "Thorne"],
  [206, "Nolan", "Braddock"],
  [207, "Silas", "Ferren"],
  [208, "Oren", "Kastle"],
  [209, "Rhys", "Calloway"],
  [210, "Jonah", "Pike"],
  [211, "Amos", "Winter"],
  [212, "Gideon", "Hale"],
];

const NAME_BY_ID = new Map(PLAYER_NAMES.map(([id, first, last]) => [id, `${first} ${last}`]));
const PLAYERS = PLAYER_NAMES.map(([id, first_name, last_name], index) => ({
  id,
  first_name,
  last_name,
  position: "LF",
  team: { display_name: index % 2 === 0 ? HOME_TEAM : AWAY_TEAM },
}));

const STAR_IDS = [201, 202, 203];
const KNOWN_IDS = [204, 205, 206, 207];
const DEEP_IDS = [208, 209, 210, 211, 212];

/** The five gradeable batting markets, at the half-point lines the books really post. */
const BATTING_MARKETS: Array<[string, number]> = [
  ["hits", 0.5],
  ["home_runs", 0.5],
  ["rbis", 0.5],
  ["runs_scored", 0.5],
  ["stolen_bases", 0.5],
];

type PropRow = {
  game_id: number;
  player_id: number;
  vendor: string;
  prop_type: string;
  line_value: string;
  market: { type: string; over_odds?: number; under_odds?: number; odds?: number };
};

function overUnder(playerId: number, propType: string, line: number): PropRow[] {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: GAME_ID,
    player_id: playerId,
    vendor,
    prop_type: propType,
    line_value: String(line),
    // -110 / -110 de-vigs to an exact coin flip, so nothing is dropped by the 0.25 liveness filter
    // and difficulty plays no part in which player gets drawn.
    market: { type: "over_under", over_odds: -110, under_odds: -110 },
  }));
}

function homeRunMilestone(playerId: number, odds: number): PropRow[] {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: GAME_ID,
    player_id: playerId,
    vendor,
    prop_type: "home_runs",
    line_value: "0.5",
    market: { type: "milestone", odds },
  }));
}

/**
 * FLAT: the same four two-way markets for everybody, plus a home-run price that is the *only*
 * thing separating the tiers. Every player contributes the same number of candidate squares, so
 * "chance" is exactly 1-in-12.
 *
 * The four two-way markets deliberately exclude `home_runs`. `computePlayerPropMarkets` groups by
 * (player, prop type) and prefers a real two-way de-vig over a one-sided milestone, so posting both
 * on `home_runs` would collapse them into one market at the -110/-110 price and silently discard
 * the only signal this fixture varies — every player would score identically and no tier would
 * exist. Learned the hard way; do not add `home_runs` to `FLAT_OU_MARKETS`.
 */
const FLAT_OU_MARKETS = BATTING_MARKETS.filter(([propType]) => propType !== "home_runs");
const FLAT_PROP_ROWS = PLAYER_NAMES.flatMap(([id]) => [
  ...FLAT_OU_MARKETS.flatMap(([propType, line]) => overUnder(id, propType, line)),
  ...homeRunMilestone(id, STAR_IDS.includes(id) ? 210 : KNOWN_IDS.includes(id) ? 420 : 900),
]);

/** REALISTIC: full coverage on a star, one or two markets on a bench bat. */
const REALISTIC_PROP_ROWS = PLAYER_NAMES.flatMap(([id]) => {
  const count = STAR_IDS.includes(id) ? 5 : KNOWN_IDS.includes(id) ? 3 : 1;
  return BATTING_MARKETS.slice(0, count).flatMap(([propType, line]) =>
    propType === "home_runs"
      ? homeRunMilestone(id, STAR_IDS.includes(id) ? 210 : 700)
      : overUnder(id, propType, line)
  );
});

/** One synthetic batter row per team per history game, carrying that team's whole box-score line. */
function statRowsFor(gameId: string) {
  return (["home", "away"] as const).map((side) => ({
    player: { id: side === "home" ? 990001 : 990002, first_name: "Team", last_name: side === "home" ? "Home" : "Away" },
    game_id: gameId,
    team: { display_name: side === "home" ? HOME_TEAM : AWAY_TEAM },
    team_name: side === "home" ? HOME_TEAM : AWAY_TEAM,
    hits: 8,
    bb: 3,
    hit_by_pitch: 0,
    k: 9,
    ground_outs: 8,
    fly_outs: 7,
    plate_appearances: 38,
  }));
}

/**
 * Season-stats rows so `resolveMLBStarIndex` returns a populated index rather than the empty-maps
 * degradation path. **Identical for every player on purpose**: the season half then contributes the
 * same constant to all twelve scores and cannot create, destroy or reorder the tilt, so every
 * assertion below is measuring the market signal and the draw — which is the part this phase wrote.
 *
 * An earlier draft made these adversarial (best season lines to the deep tier) to prove the tilt
 * was not riding on them. It proved something else instead: with twelve players in two identical
 * blocks, the season half both out-voted the market half *and* produced exact ties, and
 * `assignMLBStarTiers` correctly resolves a tie by giving nobody a star. Uniform rows are the
 * control that actually isolates the variable.
 */
const SEASON_ROWS = PLAYER_NAMES.map(([id]) => ({
  player: { id, position: "LF" },
  batting_gp: 120,
  batting_ab: 400,
  batting_bb: 45,
  batting_r: 60,
  batting_hr: 18,
  batting_rbi: 65,
  batting_tb: 200,
}));

function installFetchMock(propRows: unknown[], options: { seasonRows?: unknown[] } = {}) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/mlb/v1/odds/player_props")) {
      return Promise.resolve(bdlList(propRows));
    }
    if (url.includes("/mlb/v1/odds")) {
      return Promise.resolve(bdlList(ODDS_ROWS));
    }
    if (url.includes("/mlb/v1/players")) {
      return Promise.resolve(bdlList(PLAYERS));
    }
    if (url.includes("/mlb/v1/season_stats")) {
      return Promise.resolve(bdlList(options.seasonRows ?? SEASON_ROWS));
    }
    if (url.includes("/mlb/v1/stats")) {
      const query = new URL(url).searchParams;
      return Promise.resolve(bdlList(query.getAll("game_ids[]").flatMap((id) => statRowsFor(id))));
    }
    if (url.includes("/mlb/v1/games")) {
      return Promise.resolve(bdlList([UPCOMING_GAME, ...HISTORY_GAMES]));
    }
    return Promise.resolve(bdlList([]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function generateBoards(count: number): Promise<BoardSquare[][]> {
  const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
  const boards: BoardSquare[][] = [];
  for (let index = 0; index < count; index += 1) {
    const board = await generateSportsBingoBoard({
      gameId: String(GAME_ID),
      sportKey: "baseball_mlb",
      generationMode: "preview",
    });
    boards.push(board.squares as BoardSquare[]);
  }
  return boards;
}

/** Which of the twelve fixture players a square belongs to, or null for a team/game square. */
function playerIdOf(square: BoardSquare): number | null {
  const haystack = `${square.key} ${square.label}`.toLowerCase();
  for (const [id, name] of NAME_BY_ID) {
    if (haystack.includes(name.toLowerCase())) {
      return id;
    }
  }
  return null;
}

function countPropsByTier(board: BoardSquare[]): { star: number; known: number; deep: number; total: number } {
  const counts = { star: 0, known: 0, deep: 0, total: 0 };
  for (const square of board) {
    const playerId = playerIdOf(square);
    if (playerId === null) continue;
    counts.total += 1;
    if (STAR_IDS.includes(playerId)) counts.star += 1;
    else if (KNOWN_IDS.includes(playerId)) counts.known += 1;
    else counts.deep += 1;
  }
  return counts;
}

describe("MLB star tiering (Phase 9d)", () => {
  it("splits a game's own pool by percentile, not by absolute score", async () => {
    const { assignMLBStarTiers } = await import("@/lib/sportsBingoMlbStars");
    for (const scale of [0.01, 0.5]) {
      const tiers = assignMLBStarTiers(
        new Map(Array.from({ length: 12 }, (_, index) => [`p${index}`, (index + 1) * scale]))
      );
      expect(tiers).not.toBeNull();
      const byTier = (tier: string) => [...tiers!.entries()].filter(([, value]) => value === tier).map(([key]) => key);
      expect(byTier("star").sort()).toEqual(["p10", "p11", "p9"]);
      expect(byTier("known").sort()).toEqual(["p5", "p6", "p7", "p8"]);
      expect(byTier("deep")).toHaveLength(5);
    }
  });

  it("gives a thin slate its own star rather than importing a league-wide bar", async () => {
    const { assignMLBStarTiers } = await import("@/lib/sportsBingoMlbStars");
    const tiers = assignMLBStarTiers(new Map([["a", 0.03], ["b", 0.05], ["c", 0.06], ["d", 0.09]]));
    expect(tiers?.get("d")).toBe("star");
    expect(tiers?.get("a")).toBe("deep");
  });

  it("makes nobody a star when every player scores the same", async () => {
    const { assignMLBStarTiers } = await import("@/lib/sportsBingoMlbStars");
    const tiers = assignMLBStarTiers(new Map([["a", 0.2], ["b", 0.2], ["c", 0.2], ["d", 0.2]]));
    expect([...tiers!.values()]).toEqual(["deep", "deep", "deep", "deep"]);
  });

  it("returns null when nothing carries a score — the no-index, no-tilt fallback", async () => {
    const { assignMLBStarTiers } = await import("@/lib/sportsBingoMlbStars");
    // This null is what `pickCandidateSet` keys off to skip the MLB star block entirely and run the
    // original ordered fill. A provider outage must degrade to today's board, not a broken one.
    expect(assignMLBStarTiers(new Map())).toBeNull();
    expect(assignMLBStarTiers(new Map([["a", Number.NaN]]))).toBeNull();
  });

  it("orders the draw weights star > known > deep, and never removes a deep player", async () => {
    const { MLB_STAR_TIER_BOOST } = await import("@/lib/sportsBingoMlbStars");
    expect(MLB_STAR_TIER_BOOST.star).toBeGreaterThan(MLB_STAR_TIER_BOOST.known);
    expect(MLB_STAR_TIER_BOOST.known).toBeGreaterThan(MLB_STAR_TIER_BOOST.deep);
    // Zero stars is a failure state too, and it is ruled out by drawing rather than filtering.
    expect(MLB_STAR_TIER_BOOST.deep).toBeGreaterThan(0);
  });
});

/**
 * A deterministic replacement for `Math.random` — a 32-bit xorshift, seeded per test. The board
 * generator's only entropy source, so pinning it pins the whole pipeline.
 */
function installSeededRandom(seed: number): void {
  let state = seed >>> 0 || 1;
  vi.spyOn(Math, "random").mockImplementation(() => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  });
}

/**
 * How many batched `/mlb/v1/stats` requests one run of `buildMLBPlayerPropCandidatesFromRecentStats`
 * makes against this fixture: the builder chunks the game ids it found 8 at a time, and the
 * fixture's `/mlb/v1/games` window answers with 11 (the upcoming game plus ten history rows), so
 * `ceil(11 / 8)` = 2. It is here so the test below can say "one build's worth" rather than "some
 * number of requests"; before the fix it was double this.
 */
const MLB_HISTORICAL_STATS_CALLS_PER_BUILD = 2;

/** Captured against the pre-hoist code. See "the star-tier hoist is a pure refactor" below. */
const MLB_HOIST_SNAPSHOT: string[] = [
  "player_prop:player_home_runs:desmond vail::203:over:0.5|team_total_over:away:4.5|moneyline:home|team_total_under:home:6.5|spread_more_than:home:4.5|player_prop:player_rbis:marcus ellwood::201:under:0.5|moneyline:away|mlb_webhook_team_event_at_least:away:hit:8.0|player_prop:player_runs:marcus ellwood::201:over:0.5|game_total_over:9.5|mlb_webhook_team_event_at_least:home:hit_by_pitch:1.0|player_prop:player_hits:gideon hale::212:under:0.5|free|spread_more_than:home:3.5|team_total_under:home:4.5|team_total_over:away:3.5|mlb_webhook_team_event_at_least:home:walk:4.0|spread_keep_close:away:5.5|player_prop:player_rbis:nolan braddock::206:over:0.5|player_prop:player_stolen_bases:tobias rannick::202:under:0.5|player_prop:player_hits:desmond vail::203:under:0.5|spread_keep_close:away:3.5|game_total_under:6.5|game_total_over:5.5|mlb_webhook_team_event_at_least:home:strikeout:10.0",
  "team_total_over:home:4.5|mlb_webhook_team_event_at_least:away:strikeout:8.0|spread_keep_close:away:4.5|player_prop:player_rbis:tobias rannick::202:over:0.5|game_total_under:10.5|spread_keep_close:away:3.5|player_prop:player_hits:tobias rannick::202:over:0.5|game_total_under:5.5|team_total_under:away:0.5|moneyline:away|mlb_webhook_team_event_at_least:away:hit:9.0|player_prop:player_hits:nolan braddock::206:under:0.5|free|mlb_webhook_team_event_at_least:home:hit:10.0|mlb_webhook_team_event_at_least:away:walk:3.0|mlb_webhook_team_event_at_least:away:flyout:6.0|spread_keep_close:away:5.5|spread_more_than:home:3.5|team_total_under:away:1.5|game_total_over:8.5|moneyline:home|player_prop:player_runs:desmond vail::203:over:0.5|team_total_under:home:5.5|player_prop:player_rbis:desmond vail::203:over:0.5|player_prop:player_home_runs:desmond vail::203:over:0.5",
  "player_prop:player_hits:marcus ellwood::201:under:0.5|spread_keep_close:away:5.5|moneyline:home|mlb_webhook_team_event_at_least:away:quick_out_under_3_pitches:1.0|team_total_over:home:4.5|spread_more_than:home:5.5|team_total_over:away:4.5|player_prop:player_home_runs:marcus ellwood::201:over:0.5|player_prop:player_hits:nolan braddock::206:under:0.5|game_total_over:11.5|mlb_webhook_team_event_at_least:away:walk:3.0|player_prop:player_rbis:tobias rannick::202:under:0.5|free|player_prop:player_home_runs:desmond vail::203:over:0.5|moneyline:away|mlb_webhook_team_event_at_least:away:groundout:9.0|game_total_over:8.5|team_total_over:home:6.5|game_total_under:11.5|team_total_under:away:3.5|player_prop:player_runs:tobias rannick::202:under:0.5|mlb_webhook_team_event_at_least:home:walk:3.0|spread_keep_close:away:4.5|spread_more_than:home:3.5|player_prop:player_rbis:nolan braddock::206:over:0.5",
];

describe("MLB star-tilted prop selection, through real board generation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_MLB_STAR_TIER_BOOST_STAR;
    delete process.env.BINGO_MLB_STAR_TIER_BOOST_KNOWN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BINGO_MLB_STAR_TIER_BOOST_STAR;
    delete process.env.BINGO_MLB_STAR_TIER_BOOST_KNOWN;
  });

  /**
   * Phase 5 of docs/prop-bingo-code-review-fix-plan.md — the star-tier hoist's "output must be
   * identical" gate, MLB half. `buildMLBStarTiers` ran inside `pickCandidateSet` (up to 180 times
   * per board) on an O(n^2) percentile walk; hoisting it into `generateBoardForGame` must not move
   * a single square. `Math.random` is the generator's only entropy source, so a seeded stream makes
   * the whole pipeline deterministic and the boards below were captured against the pre-hoist code.
   */
  it("deals byte-identical boards off a seeded random stream (pre-hoist snapshot)", async () => {
    installFetchMock(REALISTIC_PROP_ROWS);
    installSeededRandom(0x5eed2);
    const boards = await generateBoards(3);
    const signatures = boards.map((board) => board.map((square) => square.key).join("|"));
    expect(signatures).toEqual(MLB_HOIST_SNAPSHOT);
  }, 60_000);

  /**
   * Phase 5 of docs/prop-bingo-code-review-fix-plan.md — the duplicate historical-stats fetch.
   *
   * `buildMLBPlayerPropCandidates` falls back to `buildMLBPlayerPropCandidatesFromRecentStats` when
   * the books posted nothing, and `getGameEntryWithCandidates` then called that same builder a
   * *second* time to harvest its achievement-bucket half — re-running a `/mlb/v1/games` history
   * window plus a batched `/mlb/v1/stats` walk, 10-20 uncached provider requests, for a pool it was
   * already holding. It now reuses the one the fallback returned.
   */
  it("builds the historical-stats pool once per game, not twice", async () => {
    const fetchMock = installFetchMock([]); // no posted props -> the historical fallback path
    await generateBoards(1);
    const statsCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/mlb/v1/stats"));
    const historyCalls = fetchMock.mock.calls.filter((call) => {
      const url = String(call[0]);
      // The 21-day history window the recent-stats builder opens, as opposed to the catalog's own
      // narrow `/mlb/v1/games` lookup.
      return url.includes("/mlb/v1/games") && new URL(url).searchParams.getAll("dates[]").length > 5;
    });
    expect(historyCalls).toHaveLength(1);
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls).toHaveLength(MLB_HISTORICAL_STATS_CALLS_PER_BUILD);
  }, 30_000);

  it("builds a real MLB board off the repaired prop feed at all", async () => {
    // The regression this whole phase exists for: before it, `/mlb/v1/player_props` 404'd, this
    // pool was empty on every board, and no named-player square ever reached a card.
    installFetchMock(REALISTIC_PROP_ROWS);
    const [board] = await generateBoards(1);
    expect(board).toHaveLength(25);
    expect(countPropsByTier(board).total).toBeGreaterThan(0);
  }, 30_000);

  it("never seats more than the star ceiling and always seats the non-star reservation", async () => {
    installFetchMock(REALISTIC_PROP_ROWS);
    const { MLB_STAR_MAX_STAR_SLOTS, MLB_STAR_MIN_NON_STAR_SLOTS } = await import("@/lib/sportsBingoMlbStars");
    const boards = await generateBoards(25);

    for (const board of boards) {
      const counts = countPropsByTier(board);
      expect(counts.star).toBeLessThanOrEqual(MLB_STAR_MAX_STAR_SLOTS);
      // A hard reservation, not a soft weight, so Phase 5's escalating difficulty bias cannot
      // erode it. Only asserted when the board seated enough player squares for it to bind.
      if (counts.total >= MLB_STAR_MAX_STAR_SLOTS + MLB_STAR_MIN_NON_STAR_SLOTS) {
        expect(counts.known + counts.deep).toBeGreaterThanOrEqual(MLB_STAR_MIN_NON_STAR_SLOTS);
      }
      expect(board).toHaveLength(25);
    }
  }, 120_000);

  it("still fills a board when the pool is nothing but stars", async () => {
    // The reservation has nothing non-star to reserve; the plan's instruction is that it degrades
    // to "take what exists" rather than failing generation.
    const starsOnly = STAR_IDS.flatMap((id) =>
      BATTING_MARKETS.flatMap(([propType, line]) =>
        propType === "home_runs" ? homeRunMilestone(id, 210) : overUnder(id, propType, line)
      )
    );
    installFetchMock(starsOnly);
    const boards = await generateBoards(3);
    for (const board of boards) {
      expect(board).toHaveLength(25);
    }
  }, 60_000);

  it("puts stars on boards materially more often than chance", async () => {
    // FLAT fixture: twelve players, five posted markets each. An untilted draw would seat the
    // three stars in 3/12 = 25% of player slots; anything meaningfully above that is the tilt.
    // The season rows are stacked in the deep tier's favour, so this cannot be the season half.
    installFetchMock(FLAT_PROP_ROWS);
    const boards = await generateBoards(30);
    const totals = boards.reduce(
      (accumulator, board) => {
        const counts = countPropsByTier(board);
        return { star: accumulator.star + counts.star, total: accumulator.total + counts.total };
      },
      { star: 0, total: 0 }
    );

    expect(totals.total).toBeGreaterThan(60);
    expect(totals.star / totals.total).toBeGreaterThan(0.3);
  }, 120_000);

  it("stops tilting when the tier boosts are turned off — the effect is the boost, not the fixture", async () => {
    const runStarShare = async (): Promise<number> => {
      vi.resetModules();
      installFetchMock(FLAT_PROP_ROWS);
      const boards = await generateBoards(30);
      const totals = boards.reduce(
        (accumulator, board) => {
          const counts = countPropsByTier(board);
          return { star: accumulator.star + counts.star, total: accumulator.total + counts.total };
        },
        { star: 0, total: 0 }
      );
      vi.unstubAllGlobals();
      return totals.star / totals.total;
    };

    const boosted = await runStarShare();
    process.env.BINGO_MLB_STAR_TIER_BOOST_STAR = "1";
    process.env.BINGO_MLB_STAR_TIER_BOOST_KNOWN = "1";
    const flatWeights = await runStarShare();

    expect(flatWeights).toBeLessThan(boosted - 0.05);
  }, 240_000);

  it("does not deal the same star set twice — the draw is a draw, not a top-N sort", async () => {
    installFetchMock(REALISTIC_PROP_ROWS);
    const boards = await generateBoards(8);
    const signatures = new Set(
      boards.map((board) =>
        board
          .map(playerIdOf)
          .filter((id): id is number => id !== null)
          .sort((left, right) => left - right)
          .join(",")
      )
    );
    // Two players at the same bar comparing cards is half the fun; a deterministic sort would hand
    // them the same names every time.
    expect(signatures.size).toBeGreaterThan(1);
  }, 60_000);

  it("still builds a board when the season feed is empty — market attention only", async () => {
    // The documented degradation path: no season index means no usage/production half, the tilt
    // falls back to market attention plus the capped brand bonus, and the board is unaffected.
    installFetchMock(REALISTIC_PROP_ROWS, { seasonRows: [] });
    const boards = await generateBoards(3);
    for (const board of boards) {
      expect(board).toHaveLength(25);
    }
  }, 60_000);
});

describe("MLB star tilt — selection only, never pricing", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves every prop square priced exactly as the market priced it", async () => {
    installFetchMock(REALISTIC_PROP_ROWS);
    const { listSportsBingoSquareTemplates } = await import("@/lib/sportsBingo");
    const templates = await listSportsBingoSquareTemplates({
      gameId: String(GAME_ID),
      sportKey: "baseball_mlb",
    });
    const priceByKey = new Map(templates.squares.map((square) => [square.key, square.probability]));

    const boards = await generateBoards(5);
    let checked = 0;
    for (const board of boards) {
      for (const square of board) {
        if (square.isFree || playerIdOf(square) === null) continue;
        expect(priceByKey.has(square.key), `unpriced square ${square.key}`).toBe(true);
        // A star square is likelier to be *chosen*. It is never made easier or harder to win,
        // which is the line that keeps every win-rate number from Phases 5, 7 and 8c valid.
        expect(square.probability).toBeCloseTo(priceByKey.get(square.key)!, 10);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  }, 60_000);
});
