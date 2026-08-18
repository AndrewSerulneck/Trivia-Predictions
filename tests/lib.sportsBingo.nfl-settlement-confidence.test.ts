import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 3 of docs/prop-bingo-code-review-fix-plan.md — truncation and settlement confidence.
//
// Four findings, one class of bug: a confident `hit`/`miss` settled on data that is absent, partial
// or ambiguous. Settled squares are **never reopened by the regrade path**, so a wrong settle is
// permanent. The rule these tests pin down: *when the source signal is incomplete, `void`, never
// grade.*
//
//   1. a truncated `/nfl/v1/plays` walk used to grade its misses off a game it had only half seen
//   2. a quarter breakdown with a hole read the missing columns as real zeros → phantom shutout,
//      and read the same shortfall as points beyond regulation → phantom overtime
//   3. a bare +2 was called a safety, so a touchdown row of +6 followed by a separate +2 graded the
//      safety square as a hit
//   4. `nfl_team_perfect_red_zone` settled an early miss on `attempts > scores`, a signal its own
//      declared complement documents as unreliable mid-game
//
// The play rows and the game row below are **real captured balldontlie output**
// (`tests/fixtures/nfl-settlement-confidence.json`, 2025 regular season) — hand-authored doubles
// agree with the code instead of with the provider, which is how this whole class of bug survived
// 200 green tests. Only the `home_score`/`away_score` columns are re-chained, so that rows captured
// from four different games can sit in one walk; every slug, `type_text` and `short_text` is
// verbatim.

import fixture from "./fixtures/nfl-settlement-confidence.json";

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  db: { sports_bingo_cards: [] as Row[], sports_bingo_squares: [] as Row[], notifications: [] as Row[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const { createSupabaseAdminDouble } = await import("./helpers/bingoSupabaseDouble");
  return { supabaseAdmin: createSupabaseAdminDouble(store.db as unknown as Record<string, Record<string, unknown>[]>) };
});

// --- the real game --------------------------------------------------------------------------

/**
 * Bengals 24, Lions 37 (2025 week 5) exactly as `/nfl/v1/games` served it. Note `home_team_q1` and
 * `home_team_q3` are `null` for quarters Cincinnati was genuinely held scoreless in — that is BDL's
 * shutout encoding, not a hole, and the row proves it by adding up: 0+3+0+21 = 24.
 */
const REAL_GAME = fixture.games["424019"] as unknown as Row;
const GAME_ID = String(REAL_GAME.id);
const HOME = String((REAL_GAME.home_team as Row).full_name);
const AWAY = String((REAL_GAME.visitor_team as Row).full_name);
const KICKOFF = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

/** The same row with `starts_at` moved to today, so the card's date window finds it. */
function gameRow(overrides: Row = {}): Row {
  return { ...REAL_GAME, date: KICKOFF, ...overrides };
}

// --- the real plays -------------------------------------------------------------------------

const PLAY_FIXTURES = fixture.plays as unknown as Record<string, Row>;

/** A captured row with its running score re-chained to `home`/`away`. Everything else is verbatim. */
function at(name: keyof typeof PLAY_FIXTURES, home: number, away: number, overrides: Row = {}): Row {
  const play = PLAY_FIXTURES[name];
  if (!play) {
    throw new Error(`Missing captured play fixture: ${String(name)}`);
  }
  return { ...play, home_score: home, away_score: away, ...overrides };
}

// --- the provider double --------------------------------------------------------------------

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

type FeedOptions = {
  game: Row;
  stats?: Row[];
  plays?: Row[];
  teamStats?: Row[];
  /** Serve the plays walk as an endless cursor, which is what a truncated walk looks like. */
  playsNeverEnd?: boolean;
};

/**
 * Paginates like the real client does — `fetchBallDontLieList` follows `meta.next_cursor` and gives
 * up at `maxPages`, which is the only way to exercise the truncation flag.
 */
function installFetchMock(options: FeedOptions) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path === "/nfl/v1/plays") {
      const plays = options.plays ?? [];
      if (options.playsNeverEnd) {
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        return Promise.resolve(jsonResponse({ data: plays, meta: { next_cursor: cursor + 100 } }));
      }
      return Promise.resolve(jsonResponse({ data: plays, meta: { next_cursor: null } }));
    }
    if (path === "/nfl/v1/team_stats") {
      return Promise.resolve(jsonResponse({ data: options.teamStats ?? [], meta: { next_cursor: null } }));
    }
    if (path === "/nfl/v1/stats") {
      return Promise.resolve(jsonResponse({ data: options.stats ?? [], meta: { next_cursor: null } }));
    }
    if (path === "/nfl/v1/games") {
      return Promise.resolve(jsonResponse({ data: [options.game], meta: { next_cursor: null } }));
    }
    return Promise.resolve(jsonResponse({ data: [], meta: { next_cursor: null } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// --- card seeding ---------------------------------------------------------------------------

let squareSequence = 0;

function seedCard(resolvers: unknown[], cardId = "card-1"): void {
  store.db.sports_bingo_cards.push({
    id: cardId,
    user_id: "user-1",
    venue_id: "venue-1",
    game_id: GAME_ID,
    game_label: `${AWAY} @ ${HOME}`,
    sport_key: "americanfootball_nfl",
    home_team: HOME,
    away_team: AWAY,
    starts_at: KICKOFF,
    status: "active",
    board_probability: 0.25,
    reward_points: 50,
    reward_claimed_at: null,
    near_win_notified_at: null,
    won_notified_at: null,
    won_line: null,
    settled_at: null,
    created_at: KICKOFF,
    updated_at: null,
    last_cron_processed_at: null,
  });

  resolvers.forEach((resolver, position) => {
    squareSequence += 1;
    store.db.sports_bingo_squares.push({
      id: `square-${squareSequence}`,
      card_id: cardId,
      square_index: position,
      label: "square",
      resolver,
      probability: 0.4,
      is_free: false,
      status: "pending",
      created_at: KICKOFF,
      resolved_at: null,
    });
  });
}

function statuses(count: number, cardId = "card-1"): string[] {
  return Array.from({ length: count }, (_, index) => {
    const row = store.db.sports_bingo_squares.find(
      (square) => square.card_id === cardId && square.square_index === index
    );
    return String(row?.status ?? "missing");
  });
}

async function runRefresh(): Promise<void> {
  const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
  await refreshSportsBingoProgress({ sportKey: "americanfootball_nfl", gameId: GAME_ID, bypassCache: true });
}

beforeEach(() => {
  vi.resetModules();
  squareSequence = 0;
  store.db.sports_bingo_cards = [];
  store.db.sports_bingo_squares = [];
  store.db.notifications = [];
  process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
});

// --- 1. the captured fixture is what it claims to be -----------------------------------------

describe("the captured fixture", () => {
  it("is a real Final row whose null quarters are genuine shutout quarters", () => {
    expect(REAL_GAME.status).toBe("Final");
    expect(REAL_GAME.home_team_q1).toBeNull();
    expect(REAL_GAME.home_team_q3).toBeNull();
    const homeSum = [REAL_GAME.home_team_q1, REAL_GAME.home_team_q2, REAL_GAME.home_team_q3, REAL_GAME.home_team_q4]
      .reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
    expect(homeSum).toBe(Number(REAL_GAME.home_team_score));
  });

  it("holds the three real safety-typed rows, one of which scored nothing", () => {
    expect(PLAY_FIXTURES.scoringSafety?.type_slug).toBe("safety");
    expect(PLAY_FIXTURES.penaltySafety?.type_slug).toBe("penalty");
    expect(String(PLAY_FIXTURES.penaltySafety?.short_text)).toMatch(/for a Safety/i);
    // Typed `safety`, prose says the points were taken back off the board.
    expect(PLAY_FIXTURES.nullifiedSafety?.type_slug).toBe("safety");
    expect(String(PLAY_FIXTURES.nullifiedSafety?.text)).toMatch(/NULLIFIED/i);
  });
});

// --- 2. partial quarter breakdown -------------------------------------------------------------

describe("a quarter breakdown with a hole in it", () => {
  const QUARTER_SQUARES = [
    { kind: "nfl_team_shutout_quarter", team: "home" },
    { kind: "nfl_team_scores_every_quarter", team: "away" },
    { kind: "nfl_any_quarter_scoreless" },
    { kind: "nfl_second_half_higher_scoring" },
    { kind: "nfl_overtime" },
  ];

  it("still grades the real row, whose null quarters are real zeros", async () => {
    installFetchMock({ game: gameRow() });
    seedCard(QUARTER_SQUARES);

    await runRefresh();

    // Cincinnati was shut out in Q1 and Q3; Detroit scored in all four; so some quarter was
    // scoreless for Cincinnati but none was scoreless for both. 24 in the second half beats 17.
    expect(statuses(5)).toEqual(["hit", "hit", "miss", "hit", "miss"]);
  });

  it("voids rather than manufacturing a shutout and an overtime out of a missing column", async () => {
    // The same real row with Q4 dropped: home now reads 3 of its 24 points, so the other 21 are
    // somewhere the breakdown does not say. Before the fix the nulls read as zeros (a phantom
    // Cincinnati shutout quarter, and a phantom scoreless quarter for both sides) and the 21-point
    // shortfall read as scoring beyond regulation (a phantom overtime hit).
    installFetchMock({ game: gameRow({ home_team_q4: null }) });
    seedCard(QUARTER_SQUARES);

    await runRefresh();

    expect(statuses(5)).toEqual([
      "void", // home's nulls are no longer readable as zeros
      "hit", // away's own columns still add up, so its square is unaffected
      "void",
      "void",
      "void", // the shortfall is not evidence of overtime
    ]);
  });

  it("keeps grading a genuine overtime, which is published as an ot column", async () => {
    installFetchMock({
      game: gameRow({ status: "Final/OT", home_team_score: 27, home_team_ot: 3 }),
    });
    seedCard([{ kind: "nfl_overtime" }]);

    await runRefresh();

    expect(statuses(1)).toEqual(["hit"]);
  });
});

// --- 3. truncated plays walk ------------------------------------------------------------------

describe("a truncated plays walk", () => {
  // One quiet drive: nothing here is a safety, a two-point try or a lead change.
  const QUIET_PLAYS = [at("ordinaryRush", 0, 0), at("ordinaryRush", 0, 0)];

  it("grades play squares normally when the walk completes", async () => {
    installFetchMock({ game: gameRow(), plays: QUIET_PLAYS });
    seedCard([{ kind: "nfl_safety" }, { kind: "nfl_two_point_conversion" }, { kind: "nfl_both_teams_lead" }]);

    await runRefresh();

    expect(statuses(3)).toEqual(["miss", "miss", "miss"]);
  });

  it("voids them when the walk hit its page cap, because a partial walk cannot say 'never'", async () => {
    installFetchMock({ game: gameRow(), plays: QUIET_PLAYS, playsNeverEnd: true });
    seedCard([{ kind: "nfl_safety" }, { kind: "nfl_two_point_conversion" }, { kind: "nfl_both_teams_lead" }]);

    await runRefresh();

    expect(statuses(3)).toEqual(["void", "void", "void"]);
  });
});

// --- 4. safety vs two-point conversion --------------------------------------------------------

describe("attributing a +2", () => {
  it("hits the safety square on a real safety-typed scoring play", async () => {
    installFetchMock({
      game: gameRow(),
      plays: [at("ordinaryRush", 0, 0), at("scoringSafety", 2, 0)],
    });
    seedCard([{ kind: "nfl_safety" }, { kind: "nfl_two_point_conversion" }]);

    await runRefresh();

    expect(statuses(2)).toEqual(["hit", "miss"]);
  });

  it("hits it on the penalty-typed safety too, which only the prose identifies", async () => {
    installFetchMock({
      game: gameRow(),
      plays: [at("ordinaryRush", 0, 0), at("penaltySafety", 0, 2)],
    });
    seedCard([{ kind: "nfl_safety" }]);

    await runRefresh();

    expect(statuses(1)).toEqual(["hit"]);
  });

  it("ignores a safety-typed row the feed says was nullified, because it never scored", async () => {
    installFetchMock({
      game: gameRow(),
      plays: [at("ordinaryRush", 0, 14), at("nullifiedSafety", 0, 14)],
    });
    seedCard([{ kind: "nfl_safety" }]);

    await runRefresh();

    expect(statuses(1)).toEqual(["miss"]);
  });

  it("voids both squares on a touchdown followed by a separate +2 nothing types", async () => {
    // The finding: +6 then +2 used to grade the safety square as a hit. The two points are a
    // two-point try booked on its own row at least as plausibly as they are a safety, and the walk
    // cannot tell — so neither square may settle.
    installFetchMock({
      game: gameRow(),
      plays: [
        at("touchdownWithFailedTwoPoint", 6, 0),
        at("ordinaryRush", 8, 0, { type_slug: "rush", type_text: "Rush", short_text: "" }),
      ],
    });
    seedCard([{ kind: "nfl_safety" }, { kind: "nfl_two_point_conversion" }]);

    await runRefresh();

    expect(statuses(2)).toEqual(["void", "void"]);
  });

  it("still reads a real +8 touchdown row as the two-point conversion it is", async () => {
    installFetchMock({
      game: gameRow(),
      plays: [at("ordinaryRush", 0, 0), at("touchdownWithTwoPoint", 8, 0)],
    });
    seedCard([{ kind: "nfl_two_point_conversion" }, { kind: "nfl_safety" }]);

    await runRefresh();

    expect(statuses(2)).toEqual(["hit", "miss"]);
  });

  it("does not read a failed two-point try as a successful one", async () => {
    installFetchMock({
      game: gameRow(),
      plays: [at("ordinaryRush", 0, 0), at("touchdownWithFailedTwoPoint", 6, 0)],
    });
    seedCard([{ kind: "nfl_two_point_conversion" }]);

    await runRefresh();

    expect(statuses(1)).toEqual(["miss"]);
  });
});

// --- 5. red zone ------------------------------------------------------------------------------

describe("nfl_team_perfect_red_zone", () => {
  function teamStatsRow(team: string, stats: Row): Row {
    return { team: { id: team === HOME ? 1 : 2, full_name: team }, ...stats };
  }

  it("stays pending mid-drive, where a trip counted but has not resolved yet", async () => {
    // `red_zone_attempts` increments on *entering* the red zone — the reading its declared
    // complement `nfl_team_red_zone_trip_without_touchdown` is built on. A live 2-of-1 is a drive
    // in progress, so the miss it used to settle here was unreopenable and wrong.
    installFetchMock({
      game: gameRow({ status: "In Progress", status_state: "in" }),
      teamStats: [
        teamStatsRow(HOME, { red_zone_attempts: 2, red_zone_scores: 1 }),
        teamStatsRow(AWAY, { red_zone_attempts: 1, red_zone_scores: 1 }),
      ],
    });
    seedCard([
      { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 2 },
      // The complement, on the same numbers, for the same team: both wait for Final.
      { kind: "nfl_team_red_zone_trip_without_touchdown", team: "home" },
    ]);

    await runRefresh();

    expect(statuses(2)).toEqual(["pending", "pending"]);
  });

  it("settles both directions at Final", async () => {
    installFetchMock({
      game: gameRow(),
      teamStats: [
        teamStatsRow(HOME, { red_zone_attempts: 3, red_zone_scores: 3 }),
        teamStatsRow(AWAY, { red_zone_attempts: 3, red_zone_scores: 1 }),
      ],
    });
    seedCard([
      { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 2 },
      { kind: "nfl_team_perfect_red_zone", team: "away", minTrips: 2 },
      { kind: "nfl_team_red_zone_trip_without_touchdown", team: "away" },
    ]);

    await runRefresh();

    expect(statuses(3)).toEqual(["hit", "miss", "hit"]);
  });
});
