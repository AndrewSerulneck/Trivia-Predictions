import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 9b of docs/prop-bingo-nfl-plan.md — star-tilted prop selection, end to end through real
// board generation.
//
// The ask has two halves that pull against each other: names people recognise should be likelier
// to land on a board, and a board of six famous names with no unknowns is as much of a failure as
// a board of six unknowns. Every test below is about one of those two halves, or about the line
// between them: **selection only, never pricing.**
//
// Two fixtures, deliberately:
//   - REALISTIC — stars carry many more posted markets than role players, exactly as a real book
//     slate does. This is where the reservation, the ceiling and the diversity caps actually
//     interact, so it is what the mix tests run against.
//   - FLAT — every player carries the same number of markets, and the only thing separating them
//     is the anytime-TD price. Chance is then exactly "1 / number of players", which is the only
//     way to state "stars appear materially more often than chance" as a number rather than a
//     feeling.

type BoardSquare = { key: string; label: string; probability: number; isFree: boolean };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

const GAME_ID = 552001;
const KICKOFF = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

const NFL_GAME = {
  id: GAME_ID,
  date: KICKOFF,
  datetime: KICKOFF,
  home_team: { id: 1, full_name: "Seattle Seahawks" },
  visitor_team: { id: 2, full_name: "Arizona Cardinals" },
  status: "Scheduled",
  week: 5,
  season: 2026,
  postseason: false,
};

const ODDS_ROWS = ["fanduel", "draftkings", "betmgm"].map((vendor) => ({
  game_id: GAME_ID,
  vendor,
  spread_home_value: -4.5,
  total_value: 45.5,
  moneyline_home_odds: -210,
  moneyline_away_odds: 175,
}));

// Invented names on purpose: none of them is in `NFL_BRAND_NAME_BONUS`, so every tier below is
// earned by the market signal alone and no assertion here is secretly measuring the brand list.
const PLAYER_NAMES: Array<[number, string, string]> = [
  [101, "Marcus", "Ellwood"],
  [102, "Tobias", "Rannick"],
  [103, "Desmond", "Vail"],
  [104, "Corbin", "Reyes"],
  [105, "Elias", "Thorne"],
  [106, "Nolan", "Braddock"],
  [107, "Silas", "Ferren"],
  [108, "Oren", "Kastle"],
  [109, "Rhys", "Calloway"],
  [110, "Jonah", "Pike"],
  [111, "Amos", "Winter"],
  [112, "Gideon", "Hale"],
];

const PLAYERS = PLAYER_NAMES.map(([id, first_name, last_name]) => ({ id, first_name, last_name }));
const NAME_BY_ID = new Map(PLAYER_NAMES.map(([id, first, last]) => [id, `${first} ${last}`]));

const STAR_IDS = [101, 102, 103];
const KNOWN_IDS = [104, 105, 106, 107];
const DEEP_IDS = [108, 109, 110, 111, 112];

/** Every over/under prop type Prop Bingo can grade, and a half-point line for each. */
const OU_LINES: Record<string, number> = {
  passing_yards: 245.5,
  passing_tds: 1.5,
  passing_attempts: 32.5,
  passing_completions: 21.5,
  interceptions: 0.5,
  rushing_yards: 58.5,
  rushing_attempts: 12.5,
  receptions: 4.5,
  receiving_yards: 54.5,
  rushing_receiving_yards: 71.5,
  longest_rush: 15.5,
  longest_reception: 21.5,
  fg_made: 1.5,
  kicking_points: 7.5,
};
const OU_TYPES = Object.keys(OU_LINES);

function overUnder(playerId: number, propType: string) {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: GAME_ID,
    player_id: playerId,
    vendor,
    prop_type: propType,
    line_value: String(OU_LINES[propType]),
    // -110 / -110 de-vigs to an exact coin flip, so no square in either fixture is dropped by the
    // 0.15 / 0.90 liveness filter and difficulty plays no part in which player gets drawn.
    market: { type: "over_under", over_odds: -110, under_odds: -110 },
  }));
}

function anytimeTd(playerId: number, odds: number) {
  return ["fanduel", "draftkings"].map((vendor) => ({
    game_id: GAME_ID,
    player_id: playerId,
    vendor,
    prop_type: "anytime_td",
    line_value: "0.5",
    market: { type: "milestone", odds },
  }));
}

/** Rotate through the allowlist so no single prop type is shared by more than three players. */
function typesFor(playerIndex: number, count: number): string[] {
  return Array.from({ length: count }, (_, offset) => OU_TYPES[(playerIndex * 3 + offset) % OU_TYPES.length]);
}

/**
 * FLAT: four posted markets for everybody (three over/unders plus an anytime TD). The only signal
 * separating the tiers is the anytime-TD price, so every player contributes an identical number of
 * candidate squares and "chance" is exactly 1-in-12.
 */
const FLAT_PROP_ROWS = PLAYER_NAMES.flatMap(([id], index) => [
  ...typesFor(index, 3).flatMap((propType) => overUnder(id, propType)),
  ...anytimeTd(id, STAR_IDS.includes(id) ? -190 : KNOWN_IDS.includes(id) ? 160 : 420),
]);

/**
 * REALISTIC: a book posts eight markets on a star and one on a role player. This is the shape the
 * live feed actually has, and the one where the diversity caps, the star ceiling and the non-star
 * reservation all bind at once.
 */
const REALISTIC_PROP_ROWS = PLAYER_NAMES.flatMap(([id], index) => {
  const ouCount = STAR_IDS.includes(id) ? 7 : KNOWN_IDS.includes(id) ? 3 : 1;
  const rows = typesFor(index, ouCount).flatMap((propType) => overUnder(id, propType));
  return STAR_IDS.includes(id) || KNOWN_IDS.includes(id)
    ? [...rows, ...anytimeTd(id, STAR_IDS.includes(id) ? -190 : 160)]
    : rows;
});

function installFetchMock(propRows: unknown[]) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/nfl/v1/odds/player_props")) {
      return Promise.resolve(bdlList(propRows));
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

async function generateBoards(count: number): Promise<BoardSquare[][]> {
  const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");
  const boards: BoardSquare[][] = [];
  for (let index = 0; index < count; index += 1) {
    const board = await generateSportsBingoBoard({
      gameId: String(GAME_ID),
      sportKey: "americanfootball_nfl",
      generationMode: "preview",
    });
    boards.push(board.squares as BoardSquare[]);
  }
  return boards;
}

/** Which of the twelve fixture players a square belongs to, or null for a team/game square. */
function playerIdOf(square: BoardSquare): number | null {
  for (const [id, name] of NAME_BY_ID) {
    if (square.key.includes(name.toLowerCase())) {
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

/** Captured against the pre-hoist code. See "the star-tier hoist is a pure refactor" below. */
const NFL_HOIST_SNAPSHOT: string[] = [
  "nfl_player_anytime_td:tobias rannick::102|spread_keep_close:away:8.5|game_total_under:39.5|moneyline:away|nfl_team_stat_at_most:away:turnovers:0.0|player_prop:passing_completions:marcus ellwood::101:under:21.5|nfl_game_max_stat_at_least:any_player:touchdowns:2.0|team_total_under:away:14.5|player_prop:interceptions:silas ferren::107:over:0.5|nfl_game_max_stat_at_least:any_player:total_tackles:12.0|game_total_under:35.5|nfl_non_quarterback_pass_attempt|free|nfl_team_stat_at_least:home:net_passing_yards:210.0|spread_keep_close:away:10.5|player_prop:rushing_attempts:marcus ellwood::101:over:12.5|game_total_over:51.5|nfl_second_half_higher_scoring|player_prop:receiving_yards:tobias rannick::102:under:54.5|team_total_under:away:20.5|player_prop:longest_rush:desmond vail::103:under:15.5|nfl_player_anytime_td:elias thorne::105|moneyline:home|player_prop:longest_rush:corbin reyes::104:under:15.5|spread_more_than:home:4.5",
  "moneyline:home|spread_keep_close:away:0.5|team_total_over:home:19.5|player_prop:receiving_yards:tobias rannick::102:under:54.5|team_total_under:away:23.5|player_prop:rushing_yards:tobias rannick::102:under:58.5|nfl_game_total_stat_at_least:punts_inside_20:3.0|nfl_team_stat_at_least:away:net_passing_yards:210.0|nfl_player_anytime_td:corbin reyes::104|player_prop:fg_made:elias thorne::105:under:1.5|nfl_team_stat_at_least:away:defensive_touchdowns:1.0|player_prop:rushing_attempts:desmond vail::103:over:12.5|free|nfl_team_stat_at_least:home:defensive_touchdowns:1.0|spread_keep_close:away:6.5|nfl_team_quarter_points_at_least:away:14.0|game_total_under:48.5|player_prop:passing_yards:marcus ellwood::101:under:245.5|game_total_under:45.5|player_prop:kicking_points:elias thorne::105:over:7.5|spread_keep_close:away:8.5|nfl_score_in_final_minutes:fourth_quarter:2.0|player_prop:passing_tds:marcus ellwood::101:under:1.5|moneyline:away|game_total_over:35.5",
  "game_total_under:45.5|player_prop:rushing_receiving_yards:desmond vail::103:under:71.5|team_total_over:away:26.5|spread_more_than:home:6.5|nfl_team_shutout_quarter:away|team_total_over:home:25.5|player_prop:interceptions:tobias rannick::102:under:0.5|nfl_team_stat_at_least:home:penalties:7.0|player_prop:rushing_attempts:marcus ellwood::101:over:12.5|moneyline:away|player_prop:longest_reception:corbin reyes::104:under:21.5|game_total_over:51.5|free|spread_more_than:home:10.5|game_total_under:55.5|nfl_game_max_stat_at_least:any_player:rushing_yards:85.0|player_prop:longest_reception:desmond vail::103:under:21.5|nfl_game_max_stat_at_least:any_player:field_goals_made:3.0|moneyline:home|nfl_team_scores_every_quarter:home|spread_more_than:home:4.5|player_prop:rushing_yards:silas ferren::107:over:58.5|player_prop:passing_yards:marcus ellwood::101:under:245.5|nfl_team_stat_at_least:home:defensive_touchdowns:1.0|player_prop:rushing_receiving_yards:corbin reyes::104:under:71.5",
];

describe("NFL star-tilted prop selection (Phase 9b)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_ALLOW_POSSIBLE_SQUARES;
    delete process.env.BINGO_NFL_STAR_TIER_BOOST_STAR;
    delete process.env.BINGO_NFL_STAR_TIER_BOOST_KNOWN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BINGO_NFL_STAR_TIER_BOOST_STAR;
    delete process.env.BINGO_NFL_STAR_TIER_BOOST_KNOWN;
  });

  describe("the tier split", () => {
    it("splits a game's own pool into star / known / deep by percentile, not by absolute score", async () => {
      const { assignNFLStarTiers } = await import("@/lib/sportsBingoNflStars");
      // Twelve players, evenly spread. The top 25% are stars, the next 35% known, the rest deep —
      // and the same shape holds whether the scores run 0.01-0.12 or 0.5-6.0, because the split is
      // a ranking inside this pool and nothing else.
      for (const scale of [0.01, 0.5]) {
        const tiers = assignNFLStarTiers(
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
      const { assignNFLStarTiers } = await import("@/lib/sportsBingoNflStars");
      // Nobody in this pool would rate as a star league-wide. One of them is still the star of
      // this game, which is the whole point of ranking inside the game's own pool.
      const tiers = assignNFLStarTiers(new Map([["a", 0.03], ["b", 0.05], ["c", 0.06], ["d", 0.09]]));
      expect(tiers?.get("d")).toBe("star");
      expect(tiers?.get("a")).toBe("deep");
    });

    it("makes nobody a star when every player scores the same", async () => {
      const { assignNFLStarTiers } = await import("@/lib/sportsBingoNflStars");
      const tiers = assignNFLStarTiers(new Map([["a", 0.2], ["b", 0.2], ["c", 0.2], ["d", 0.2]]));
      // Ties share a percentile, so a flat pool produces no star by accident of iteration order.
      expect([...tiers!.values()]).toEqual(["deep", "deep", "deep", "deep"]);
    });

    it("returns null when nothing in the pool carries a score — the no-index fallback", async () => {
      const { assignNFLStarTiers } = await import("@/lib/sportsBingoNflStars");
      // This null is what `pickCandidateSet` keys off to skip the star block entirely and run its
      // original `orderByDifficulty` fill. A provider outage must degrade to today's board, not to
      // a broken one.
      expect(assignNFLStarTiers(new Map())).toBeNull();
      expect(assignNFLStarTiers(new Map([["a", Number.NaN]]))).toBeNull();
    });

    it("orders the draw weights star > known > deep, and never removes a deep player", async () => {
      const { NFL_STAR_TIER_BOOST } = await import("@/lib/sportsBingoNflStars");
      expect(NFL_STAR_TIER_BOOST.star).toBeGreaterThan(NFL_STAR_TIER_BOOST.known);
      expect(NFL_STAR_TIER_BOOST.known).toBeGreaterThan(NFL_STAR_TIER_BOOST.deep);
      // Zero stars is a failure state too, and it is ruled out by drawing rather than filtering:
      // a deep player keeps a real, non-zero weight.
      expect(NFL_STAR_TIER_BOOST.deep).toBeGreaterThan(0);
    });
  });

  describe("the reservation, over 25 generated boards", () => {
    it("never seats more than 5 star props and always seats at least 2 non-star ones", async () => {
      installFetchMock(REALISTIC_PROP_ROWS);
      const { NFL_STAR_MAX_STAR_SLOTS, NFL_STAR_MIN_NON_STAR_SLOTS } = await import("@/lib/sportsBingoNflStars");
      const boards = await generateBoards(25);

      for (const board of boards) {
        const counts = countPropsByTier(board);
        // The ceiling: even on a slate where the three stars carry nearly every posted market,
        // they cannot own the whole prop block.
        expect(counts.star).toBeLessThanOrEqual(NFL_STAR_MAX_STAR_SLOTS);
        // The floor: a hard reservation, not a soft weight, so Phase 5's escalating difficulty
        // bias cannot erode it.
        expect(counts.known + counts.deep).toBeGreaterThanOrEqual(NFL_STAR_MIN_NON_STAR_SLOTS);
        // And the board still filled: a mix rule must never cost a player their card.
        expect(board).toHaveLength(25);
      }
    }, 60_000);

    it("still fills a board when the pool is nothing but stars", async () => {
      // Three players, all equally covered — the reservation has nothing non-star to reserve. The
      // plan's instruction is that it degrades to "take what exists" rather than failing
      // generation, the same preference-not-requirement discipline the correlation cap uses.
      const starsOnly = STAR_IDS.flatMap((id, index) => [
        ...typesFor(index, 6).flatMap((propType) => overUnder(id, propType)),
        ...anytimeTd(id, -190),
      ]);
      installFetchMock(starsOnly);
      const boards = await generateBoards(3);
      for (const board of boards) {
        expect(board).toHaveLength(25);
      }
    }, 30_000);
  });

  describe("the tilt itself", () => {
    it("puts stars on boards materially more often than chance", async () => {
      // FLAT fixture: twelve players, four posted markets each, identical -110 prices. Every
      // player contributes the same number of candidate squares, so an untilted draw would seat
      // the three stars in 3/12 = 25% of prop slots. Anything meaningfully above that is the tilt.
      installFetchMock(FLAT_PROP_ROWS);
      const boards = await generateBoards(30);
      const totals = boards.reduce(
        (accumulator, board) => {
          const counts = countPropsByTier(board);
          return {
            star: accumulator.star + counts.star,
            total: accumulator.total + counts.total,
          };
        },
        { star: 0, total: 0 }
      );

      expect(totals.total).toBeGreaterThan(150);
      const starShare = totals.star / totals.total;
      expect(starShare).toBeGreaterThan(0.3);
    }, 60_000);

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
      process.env.BINGO_NFL_STAR_TIER_BOOST_STAR = "1";
      process.env.BINGO_NFL_STAR_TIER_BOOST_KNOWN = "1";
      const flatWeights = await runStarShare();

      // With every tier weighted the same and every player carrying the same number of markets,
      // the draw is back to chance. The gap between the two runs is the phase.
      expect(flatWeights).toBeLessThan(boosted - 0.08);
    }, 120_000);

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
      // Two players sitting at the same bar comparing cards is half the fun; a deterministic sort
      // would hand them the same six names.
      expect(signatures.size).toBeGreaterThan(1);
    }, 60_000);
  });

  /**
   * Phase 5 of docs/prop-bingo-code-review-fix-plan.md — the star-tier hoist's "output must be
   * identical" gate.
   *
   * `buildNFLStarTiers` used to run inside `pickCandidateSet`, i.e. up to 180 times per board, on
   * an O(n^2) percentile walk. Hoisting it into `generateBoardForGame` is a pure refactor, so the
   * only honest way to land it is to pin the exact boards the generator deals off a fixed random
   * stream and prove not one square moved.
   *
   * `Math.random` is the generator's only entropy source, so a seeded stream makes the whole
   * pipeline (attempt loop, difficulty escalation, weighted draws, star reservation, line
   * arrangement, Monte-Carlo preview) deterministic. The expected keys below were captured against
   * the **pre-hoist** code and must not change.
   *
   * If a future phase deliberately changes selection, this test fails by design: re-capture the
   * snapshot in the same commit that makes the change, and say so in the commit message.
   */
  describe("the star-tier hoist is a pure refactor", () => {
    it("deals byte-identical boards off a seeded random stream (pre-hoist snapshot)", async () => {
      installFetchMock(REALISTIC_PROP_ROWS);
      installSeededRandom(0x5eed1);
      const boards = await generateBoards(3);
      const signatures = boards.map((board) => board.map((square) => square.key).join("|"));
      expect(signatures).toEqual(NFL_HOIST_SNAPSHOT);
    }, 60_000);
  });

  describe("selection only, never pricing", () => {
    it("leaves every prop square priced exactly as the market priced it", async () => {
      installFetchMock(REALISTIC_PROP_ROWS);
      const { listSportsBingoSquareTemplates } = await import("@/lib/sportsBingo");
      const templates = await listSportsBingoSquareTemplates({
        gameId: String(GAME_ID),
        sportKey: "americanfootball_nfl",
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
      expect(checked).toBeGreaterThan(20);
    }, 60_000);
  });
});
