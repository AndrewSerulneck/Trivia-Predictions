import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4 of docs/prop-bingo-nfl-plan.md — NFL grading and settlement.
//
// These run the real `refreshSportsBingoProgress` against an in-memory Supabase and a mocked
// balldontlie feed, rather than poking a grading function directly, because the rules that matter
// are about *timing*: an over hits mid-game, an under waits for Final, a DNP voids instead of
// missing, and a `null` quarter column is a shutout only once that quarter is over.

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

// --- fixtures --------------------------------------------------------------------------------

const GAME_ID = "424129";
const HOME = "Philadelphia Eagles";
const AWAY = "Dallas Cowboys";
const KICKOFF = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

type QuarterLine = { q1: number | null; q2: number | null; q3: number | null; q4: number | null; ot?: number | null };

function nflGame(params: {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  home: QuarterLine;
  away: QuarterLine;
}): Row {
  return {
    id: Number(GAME_ID),
    date: KICKOFF,
    datetime: KICKOFF,
    status: params.status,
    home_team: { id: 1, full_name: HOME },
    visitor_team: { id: 2, full_name: AWAY },
    home_team_score: params.homeScore,
    visitor_team_score: params.awayScore,
    home_team_q1: params.home.q1,
    home_team_q2: params.home.q2,
    home_team_q3: params.home.q3,
    home_team_q4: params.home.q4,
    home_team_ot: params.home.ot ?? null,
    visitor_team_q1: params.away.q1,
    visitor_team_q2: params.away.q2,
    visitor_team_q3: params.away.q3,
    visitor_team_q4: params.away.q4,
    visitor_team_ot: params.away.ot ?? null,
  };
}

function statLine(params: {
  id: number;
  first: string;
  last: string;
  team?: string;
  stats?: Row;
}): Row {
  return {
    player: { id: params.id, first_name: params.first, last_name: params.last },
    team: { id: params.team === AWAY ? 2 : 1, full_name: params.team ?? HOME },
    ...params.stats,
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

type FeedOptions = { game: Row; stats?: Row[]; plays?: Row[] };

function installFetchMock(options: FeedOptions) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/nfl/v1/plays")) {
      return Promise.resolve(bdlList(options.plays ?? []));
    }
    if (url.includes("/nfl/v1/stats")) {
      return Promise.resolve(bdlList(options.stats ?? []));
    }
    if (url.includes("/nfl/v1/games")) {
      return Promise.resolve(bdlList([options.game]));
    }
    return Promise.resolve(bdlList([]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let squareSequence = 0;

/**
 * Seed one card holding exactly the resolvers given, at square indices 0..n-1. These are
 * deliberately *not* real 24-square boards — the point is to isolate one grading rule per square
 * and read its status back — so no FREE square is seeded and no line can accidentally complete.
 */
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

function squareStatus(index: number, cardId = "card-1"): string {
  const row = store.db.sports_bingo_squares.find(
    (square) => square.card_id === cardId && square.square_index === index
  );
  return String(row?.status ?? "missing");
}

async function runRefresh(): Promise<void> {
  const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
  await refreshSportsBingoProgress({ sportKey: "americanfootball_nfl", gameId: GAME_ID, bypassCache: true });
}

// A realistic settled box score: Eagles 27, Cowboys 20.
const FINAL_GAME = nflGame({
  status: "Final",
  homeScore: 27,
  awayScore: 20,
  home: { q1: 7, q2: 3, q3: null, q4: 17 },
  away: { q1: 7, q2: 6, q3: 7, q4: null },
});

const FINAL_STATS: Row[] = [
  statLine({
    id: 11,
    first: "Jalen",
    last: "Hurts",
    stats: {
      passing_yards: 264,
      passing_touchdowns: 2,
      passing_attempts: 31,
      passing_completions: 22,
      passing_interceptions: 1,
      rushing_yards: 41,
      rushing_attempts: 8,
      rushing_touchdowns: 1,
      long_rushing: 14,
    },
  }),
  statLine({
    id: 12,
    first: "Saquon",
    last: "Barkley",
    stats: {
      rushing_yards: 95,
      rushing_attempts: 19,
      rushing_touchdowns: 0,
      long_rushing: 22,
      receptions: 3,
      receiving_yards: 28,
      long_reception: 14,
    },
  }),
  statLine({
    id: 24,
    first: "Jake",
    last: "Elliott",
    stats: { field_goals_made: 2, extra_points_made: 3 },
  }),
  statLine({
    id: 22,
    first: "CeeDee",
    last: "Lamb",
    team: AWAY,
    stats: { receptions: 6, receiving_yards: 88, receiving_touchdowns: 1, long_reception: 31 },
  }),
];

beforeEach(() => {
  vi.resetModules();
  squareSequence = 0;
  store.db.sports_bingo_cards = [];
  store.db.sports_bingo_squares = [];
  store.db.notifications = [];
  process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NFL player props (Phase 4 settlement)", () => {
  it("hits an over the moment the box score clears it, mid-game", async () => {
    installFetchMock({
      game: nflGame({
        status: "3rd Quarter",
        homeScore: 17,
        awayScore: 13,
        home: { q1: 7, q2: 3, q3: 7, q4: null },
        away: { q1: 7, q2: 6, q3: null, q4: null },
      }),
      stats: [statLine({ id: 12, first: "Saquon", last: "Barkley", stats: { rushing_yards: 95, rushing_attempts: 17 } })],
    });
    seedCard([
      { kind: "player_prop", marketKey: "rushing_yards", player: "Saquon Barkley::12", line: 89.5, direction: "over" },
      { kind: "player_prop", marketKey: "rushing_attempts", player: "Saquon Barkley::12", line: 21.5, direction: "over" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    // Still short of the line with a quarter and a half to play — nothing is decided yet.
    expect(squareStatus(1)).toBe("pending");
  });

  it("holds an under open until Final, but misses the moment the line is cleared", async () => {
    installFetchMock({
      game: nflGame({
        status: "2nd Quarter",
        homeScore: 10,
        awayScore: 7,
        home: { q1: 7, q2: 3, q3: null, q4: null },
        away: { q1: 7, q2: null, q3: null, q4: null },
      }),
      stats: [statLine({ id: 22, first: "CeeDee", last: "Lamb", team: AWAY, stats: { receptions: 6 } })],
    });
    seedCard([
      // Already over the line: an under can be *lost* early, because the total only grows.
      { kind: "player_prop", marketKey: "receptions", player: "CeeDee Lamb::22", line: 5.5, direction: "under" },
      // Comfortably under, but two quarters of football could change that.
      { kind: "player_prop", marketKey: "receptions", player: "CeeDee Lamb::22", line: 8.5, direction: "under" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("miss");
    expect(squareStatus(1)).toBe("pending");
  });

  it("settles a surviving under once the game is Final", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      { kind: "player_prop", marketKey: "receptions", player: "CeeDee Lamb::22", line: 8.5, direction: "under" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
  });

  it("derives kicking_points as 3×FGM + XPM", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      // Jake Elliott: 2 FG + 3 XP = 9 points.
      { kind: "player_prop", marketKey: "kicking_points", player: "Jake Elliott::24", line: 8.5, direction: "over" },
      { kind: "player_prop", marketKey: "kicking_points", player: "Jake Elliott::24", line: 9.5, direction: "over" },
      { kind: "player_prop", marketKey: "fg_made", player: "Jake Elliott::24", line: 1.5, direction: "over" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("hit");
  });

  it("sums rushing_receiving_yards across both stat groups", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      // Barkley: 95 rushing + 28 receiving = 123.
      { kind: "player_prop", marketKey: "rushing_receiving_yards", player: "Saquon Barkley::12", line: 119.5, direction: "over" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
  });

  it("voids — never misses — a player who never reaches the box score", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      { kind: "player_prop", marketKey: "receptions", player: "A.J. Brown::13", line: 4.5, direction: "over" },
      { kind: "nfl_player_anytime_td", player: "A.J. Brown::13" },
      // A player who did appear and simply did not score is a real miss.
      { kind: "nfl_player_anytime_td", player: "Saquon Barkley::12" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("void");
    expect(squareStatus(1)).toBe("void");
    expect(squareStatus(2)).toBe("miss");
  });

  it("counts return and defensive scores toward anytime TD, and hits mid-game", async () => {
    installFetchMock({
      game: nflGame({
        status: "1st Quarter",
        homeScore: 7,
        awayScore: 0,
        home: { q1: 7, q2: null, q3: null, q4: null },
        away: { q1: null, q2: null, q3: null, q4: null },
      }),
      stats: [
        statLine({ id: 31, first: "Cooper", last: "DeJean", stats: { punt_return_touchdowns: 1 } }),
        statLine({ id: 22, first: "CeeDee", last: "Lamb", team: AWAY, stats: { receptions: 1, receiving_yards: 9 } }),
      ],
    });
    seedCard([
      { kind: "nfl_player_anytime_td", player: "Cooper DeJean::31" },
      { kind: "nfl_player_anytime_td", player: "CeeDee Lamb::22" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("pending");
  });
});

describe("NFL quarter squares (Phase 4 settlement)", () => {
  it("reads a null quarter as a shutout only once that quarter has been played", async () => {
    installFetchMock({
      game: nflGame({
        // Q3 is in progress and the Eagles have not scored in it *yet* — that is not a shutout.
        status: "3rd Quarter",
        homeScore: 10,
        awayScore: 20,
        home: { q1: 7, q2: 3, q3: null, q4: null },
        away: { q1: 7, q2: 6, q3: 7, q4: null },
      }),
    });
    seedCard([
      { kind: "nfl_team_shutout_quarter", team: "home" },
      { kind: "nfl_team_scores_every_quarter", team: "home" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("pending");
    expect(squareStatus(1)).toBe("pending");
  });

  it("settles the same squares once the quarter is over", async () => {
    installFetchMock({ game: FINAL_GAME });
    seedCard([
      // Eagles Q3 is null on a Final game — a real shutout quarter.
      { kind: "nfl_team_shutout_quarter", team: "home" },
      { kind: "nfl_team_scores_every_quarter", team: "home" },
      // Cowboys Q4 is null on a Final game, so no quarter was scoreless for *both* teams.
      { kind: "nfl_any_quarter_scoreless" },
      // Eagles put up 17 in the fourth.
      { kind: "nfl_team_quarter_points_at_least", team: "home", threshold: 14 },
      { kind: "nfl_team_quarter_points_at_least", team: "away", threshold: 14 },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("miss");
    expect(squareStatus(3)).toBe("hit");
    expect(squareStatus(4)).toBe("miss");
  });

  it("hits a quarter-points square from a quarter still in progress", async () => {
    installFetchMock({
      game: nflGame({
        status: "4th Quarter",
        homeScore: 24,
        awayScore: 20,
        home: { q1: 7, q2: 3, q3: null, q4: 14 },
        away: { q1: 7, q2: 6, q3: 7, q4: null },
      }),
    });
    seedCard([{ kind: "nfl_team_quarter_points_at_least", team: "home", threshold: 14 }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
  });

  it("grades halftime squares as soon as the half is over", async () => {
    installFetchMock({
      game: nflGame({
        status: "Halftime",
        homeScore: 10,
        awayScore: 13,
        home: { q1: 7, q2: 3, q3: null, q4: null },
        away: { q1: 7, q2: 6, q3: null, q4: null },
      }),
    });
    seedCard([
      { kind: "nfl_team_leads_at_halftime", team: "away" },
      { kind: "nfl_team_leads_at_halftime", team: "home" },
      // Needs the final result as well, so it stays open.
      { kind: "nfl_halftime_leader_loses" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("pending");
  });

  it("hits halftime-leader-loses when the trailing team comes back", async () => {
    installFetchMock({ game: FINAL_GAME });
    // Cowboys led 13-10 at half, Eagles won 27-20.
    seedCard([{ kind: "nfl_halftime_leader_loses" }, { kind: "nfl_second_half_higher_scoring" }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    // First half 10 + 13 = 23; second half 17 + 7 = 24.
    expect(squareStatus(1)).toBe("hit");
  });

  it("voids halftime-leader-loses when the game was tied at the half", async () => {
    installFetchMock({
      game: nflGame({
        status: "Final",
        homeScore: 24,
        awayScore: 14,
        home: { q1: 7, q2: 7, q3: 10, q4: null },
        away: { q1: 14, q2: null, q3: null, q4: null },
      }),
    });
    seedCard([{ kind: "nfl_halftime_leader_loses" }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("void");
  });

  it("detects overtime from the overtime columns", async () => {
    installFetchMock({
      game: nflGame({
        status: "Final/OT",
        homeScore: 30,
        awayScore: 27,
        home: { q1: 7, q2: 3, q3: 7, q4: 10, ot: 3 },
        away: { q1: 7, q2: 6, q3: 7, q4: 7, ot: null },
      }),
    });
    seedCard([{ kind: "nfl_overtime" }, { kind: "nfl_margin_at_most", line: 3.5 }, { kind: "nfl_margin_at_least", line: 16.5 }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("hit");
    expect(squareStatus(2)).toBe("miss");
  });

  it("keeps final-only margin squares pending while the game is live", async () => {
    installFetchMock({
      game: nflGame({
        status: "4th Quarter",
        homeScore: 27,
        awayScore: 3,
        home: { q1: 7, q2: 3, q3: 7, q4: 10 },
        away: { q1: 3, q2: null, q3: null, q4: null },
      }),
    });
    seedCard([
      { kind: "nfl_margin_at_least", line: 16.5 },
      { kind: "nfl_margin_at_most", line: 3.5 },
      // Monotone, so this one does settle early.
      { kind: "nfl_both_teams_score_at_least", threshold: 20 },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("pending");
    expect(squareStatus(1)).toBe("pending");
    expect(squareStatus(2)).toBe("pending");
  });
});

// --- play-by-play (Optional 3b) --------------------------------------------------------------

function play(params: {
  slug: string;
  shortText?: string;
  home: number;
  away: number;
  yardage?: number;
  startDown?: number | null;
  startDistance?: number | null;
}): Row {
  return {
    type_slug: params.slug,
    type_text: params.slug.replace(/-/g, " "),
    short_text: params.shortText ?? "",
    text: params.shortText ?? "",
    home_score: params.home,
    away_score: params.away,
    scoring_play: false,
    period: 1,
    stat_yardage: params.yardage ?? 0,
    start_down: params.startDown ?? null,
    start_distance: params.startDistance ?? null,
  };
}

describe("NFL play-by-play squares (Phase 4 settlement)", () => {
  // `short_text` values copied from the shapes the live feed actually returns (2025 Week 9):
  // the scorer leads, the yardage follows, and the kick is parenthesised. A passing touchdown
  // names the **receiver** first and the passer after `from`.
  const PLAYS: Row[] = [
    play({ slug: "kickoff", home: 0, away: 0 }),
    // 4th & 2, converted for 9 yards.
    play({ slug: "pass-reception", home: 0, away: 0, yardage: 9, startDown: 4, startDistance: 2 }),
    play({ slug: "field-goal-good", shortText: "Jake Elliott 41 Yd Field Goal", home: 3, away: 0, yardage: 41 }),
    play({
      slug: "passing-touchdown",
      shortText: "CeeDee Lamb 31 Yd pass from Dak Prescott (Brandon Aubrey Kick)",
      home: 3,
      away: 7,
      yardage: 31,
    }),
    play({
      slug: "interception-return-touchdown",
      shortText: "Cooper DeJean 52 Yd Interception Return (Jake Elliott Kick)",
      home: 10,
      away: 7,
      yardage: 52,
    }),
  ];

  it("grades the first-score, first-scorer, non-offensive TD, 4th-down and long-TD squares", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: PLAYS });
    seedCard([
      { kind: "nfl_first_score_is_field_goal" },
      // The Eagles scored first (a field goal) and won 27-20.
      { kind: "nfl_first_scorer_wins" },
      { kind: "nfl_non_offensive_touchdown" },
      { kind: "nfl_fourth_down_conversion" },
      { kind: "nfl_long_touchdown", yards: 50 },
      { kind: "nfl_long_touchdown", yards: 60 },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("hit");
    expect(squareStatus(2)).toBe("hit");
    expect(squareStatus(3)).toBe("hit");
    expect(squareStatus(4)).toBe("hit");
    expect(squareStatus(5)).toBe("miss");
  });

  it("credits a passing touchdown to the receiver, not the quarterback", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: PLAYS });
    seedCard([
      { kind: "nfl_player_first_td", player: "CeeDee Lamb::22" },
      { kind: "nfl_player_first_td", player: "Dak Prescott::21" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
  });

  it("discards corrupt score rows instead of reading them as scoring plays", async () => {
    // Both defects observed in the live feed on 2026-08-16: a mid-game row reporting 0-0 in a
    // game that is already 10-7, and a stray row appended after the game carrying an early score.
    // Neither may create a phantom touchdown, and neither may reset the running total.
    installFetchMock({
      game: FINAL_GAME,
      stats: FINAL_STATS,
      plays: [
        ...PLAYS,
        play({ slug: "kickoff", shortText: "Brandon Aubrey 65 Yd Kickoff", home: 0, away: 0 }),
        play({ slug: "rush", shortText: "Saquon Barkley 1 Yd Rush", home: 10, away: 7, yardage: -1 }),
        play({ slug: "penalty", shortText: "DAL 15 Yd Pnlty", home: 3, away: 0 }),
      ],
    });
    seedCard([
      { kind: "nfl_player_first_td", player: "CeeDee Lamb::22" },
      // A phantom +10 delta would look like a touchdown and hand this square a wrong hit.
      { kind: "nfl_long_touchdown", yards: 50 },
      { kind: "nfl_first_score_is_field_goal" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("hit");
    expect(squareStatus(2)).toBe("hit");
  });

  it("voids a first-TD square rather than guessing when the play prose does not parse", async () => {
    installFetchMock({
      game: FINAL_GAME,
      stats: FINAL_STATS,
      plays: [play({ slug: "rushing-touchdown", shortText: "", home: 6, away: 0, yardage: 3 })],
    });
    seedCard([{ kind: "nfl_player_first_td", player: "Saquon Barkley::12" }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("void");
  });

  it("voids play-by-play squares when the plays walk comes back empty at Final", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: [] });
    seedCard([{ kind: "nfl_non_offensive_touchdown" }, { kind: "nfl_first_score_is_field_goal" }]);

    await runRefresh();

    expect(squareStatus(0)).toBe("void");
    expect(squareStatus(1)).toBe("void");
  });

  it("never asks for plays when the board has no play-by-play square", async () => {
    const fetchMock = installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: PLAYS });
    seedCard([
      { kind: "player_prop", marketKey: "rushing_yards", player: "Saquon Barkley::12", line: 89.5, direction: "over" },
      { kind: "nfl_overtime" },
    ]);

    await runRefresh();

    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/nfl/v1/plays"))).toBe(false);
    expect(calls.filter((url) => url.includes("/nfl/v1/stats")).length).toBe(1);
  });
});

describe("NFL board settlement (Phase 4)", () => {
  it("grades a full board against an archived box score and settles the card", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: [] });
    // A losing board: every square resolves, none of them line up.
    seedCard([
      { kind: "moneyline", team: "away" },
      { kind: "nfl_margin_at_most", line: 3.5 },
      { kind: "nfl_team_scores_every_quarter", team: "home" },
      { kind: "player_prop", marketKey: "passing_yards", player: "Jalen Hurts::11", line: 289.5, direction: "over" },
      { kind: "nfl_player_anytime_td", player: "Saquon Barkley::12" },
    ]);

    await runRefresh();

    expect([0, 1, 2, 3, 4].map((index) => squareStatus(index))).toEqual([
      "miss",
      "miss",
      "miss",
      "miss",
      "miss",
    ]);
    const card = store.db.sports_bingo_cards[0];
    expect(card.status).toBe("lost");
    expect(store.db.notifications).toHaveLength(1);
  });

  it("still settles a card whose only unresolved squares voided", async () => {
    // Regression guard for the `summarizeCard` split: a voided square used to count as pending
    // forever, leaving a Final card stuck `active` and its owner never told.
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: [] });
    seedCard([
      { kind: "moneyline", team: "away" },
      { kind: "player_prop", marketKey: "receptions", player: "A.J. Brown::13", line: 4.5, direction: "over" },
    ]);

    await runRefresh();

    expect(squareStatus(0)).toBe("miss");
    expect(squareStatus(1)).toBe("void");
    expect(store.db.sports_bingo_cards[0].status).toBe("lost");
  });

  it("makes one stats call per game, memoized across every card holding it", async () => {
    const fetchMock = installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS, plays: [] });
    seedCard([{ kind: "nfl_overtime" }], "card-1");
    seedCard([{ kind: "nfl_overtime" }], "card-2");
    seedCard([{ kind: "nfl_overtime" }], "card-3");

    await runRefresh();

    const statsCalls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("/nfl/v1/stats"));
    expect(statsCalls).toHaveLength(1);
  });
});

describe("NFL quarter data integrity (Phase 4)", () => {
  it("voids quarter squares rather than settling them when the feed carries no quarter breakdown", async () => {
    installFetchMock({
      game: nflGame({
        status: "Final",
        homeScore: 27,
        awayScore: 20,
        home: { q1: null, q2: null, q3: null, q4: null },
        away: { q1: null, q2: null, q3: null, q4: null },
      }),
    });
    seedCard([
      { kind: "nfl_team_scores_every_quarter", team: "home" },
      { kind: "nfl_team_shutout_quarter", team: "home" },
      { kind: "nfl_any_quarter_scoreless" },
      { kind: "nfl_team_leads_at_halftime", team: "home" },
      { kind: "nfl_second_half_higher_scoring" },
      // Score-only squares are unaffected — they never needed the quarter columns.
      { kind: "moneyline", team: "home" },
    ]);

    await runRefresh();

    expect([0, 1, 2, 3, 4].map((index) => squareStatus(index))).toEqual([
      "void",
      "void",
      "void",
      "void",
      "void",
    ]);
    expect(squareStatus(5)).toBe("hit");
  });
});
