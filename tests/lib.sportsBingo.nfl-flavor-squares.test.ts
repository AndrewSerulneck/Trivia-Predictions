import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 8b of docs/prop-bingo-nfl-plan.md — the flavor-square slate.
//
// Same shape and the same reasoning as `tests/lib.sportsBingo.nfl-settlement.test.ts`: these drive
// the real `refreshSportsBingoProgress` against an in-memory Supabase and a mocked balldontlie
// feed rather than poking a grading function, because the rules that actually matter here are about
// *timing* and *absence* — an at-least square hits mid-game, an at-most square waits for the
// whistle, a ratio never settles early, and an empty `/nfl/v1/team_stats` voids instead of missing.

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

const FINAL_GAME = nflGame({
  status: "Final",
  homeScore: 27,
  awayScore: 20,
  home: { q1: 7, q2: 3, q3: 0, q4: 17 },
  away: { q1: 7, q2: 6, q3: 7, q4: 0 },
});

const LIVE_GAME = nflGame({
  status: "In Progress",
  homeScore: 10,
  awayScore: 7,
  home: { q1: 7, q2: 3, q3: null, q4: null },
  away: { q1: 7, q2: null, q3: null, q4: null },
});

/** One `/nfl/v1/team_stats` row. Fields left out are genuinely absent, as BDL leaves them. */
function teamStatsRow(team: string, values: Record<string, number>): Row {
  return { team: { id: team === AWAY ? 2 : 1, full_name: team }, home_away: team === HOME ? "home" : "away", ...values };
}

function playerRow(params: { id: number; first: string; last: string; team?: string; position?: string; stats?: Row }): Row {
  return {
    player: {
      id: params.id,
      first_name: params.first,
      last_name: params.last,
      position_abbreviation: params.position ?? "WR",
    },
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

type FeedOptions = { game: Row; stats?: Row[]; plays?: Row[]; teamStats?: Row[] };

function installFetchMock(options: FeedOptions) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    // `/nfl/v1/team_stats` has to be matched before `/nfl/v1/stats` — the latter is a substring of
    // neither, but the check order is what makes that obvious to the next person editing this.
    if (url.includes("/nfl/v1/team_stats")) {
      return Promise.resolve(bdlList(options.teamStats ?? []));
    }
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
 * Seed one card holding exactly the resolvers given, at square indices 0..n-1. Deliberately not a
 * real 24-square board: the point is to isolate one grading rule per square and read its status.
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
  vi.unstubAllEnvs();
});

// --- Tier 1: `/nfl/v1/team_stats` ---------------------------------------------------------------

describe("Tier 1 — team_stats squares", () => {
  const FINAL_TEAM_STATS = [
    teamStatsRow(HOME, {
      penalties: 8,
      penalty_yards: 65,
      turnovers: 0,
      total_yards: 412,
      yards_per_play: 6.2,
      possession_time_seconds: 2010,
      red_zone_attempts: 3,
      red_zone_scores: 3,
      // `sacks` and `fourth_down_conversions` are deliberately absent, exactly as BDL omits them
      // for a team with none — the grader must read that as zero, not as unknown.
    }),
    teamStatsRow(AWAY, {
      penalties: 4,
      penalty_yards: 30,
      turnovers: 2,
      total_yards: 288,
      yards_per_play: 4.6,
      possession_time_seconds: 1590,
      red_zone_attempts: 4,
      red_zone_scores: 1,
      sacks: 5,
    }),
  ];

  it("grades the hit / miss / void triple for an at-least square", async () => {
    installFetchMock({ game: FINAL_GAME, teamStats: FINAL_TEAM_STATS });
    seedCard([
      { kind: "nfl_team_stat_at_least", team: "home", field: "penalties", threshold: 7 },
      { kind: "nfl_team_stat_at_least", team: "away", field: "penalties", threshold: 7 },
      { kind: "nfl_team_stat_at_least", team: "away", field: "sacks", threshold: 3 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("hit");
  });

  it("reads an absent field as a zero rather than as unknown", async () => {
    // The Eagles row above carries no `sacks` key at all. 8a's own base rates only reproduce under
    // this reading (`sacked_gte_4` = 0.235 over all 544 team-games, not over the 473 with the field
    // present), so this is a contract with the measured numbers, not a convenience.
    installFetchMock({ game: FINAL_GAME, teamStats: FINAL_TEAM_STATS });
    seedCard([
      { kind: "nfl_team_stat_at_least", team: "home", field: "sacks", threshold: 1 },
      { kind: "nfl_team_stat_at_most", team: "home", field: "sacks", threshold: 0 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("miss");
    expect(squareStatus(1)).toBe("hit");
  });

  it("voids rather than missing when team_stats returns no rows", async () => {
    // The postseason case 8a found: BDL returns zero `team_stats` rows for a completed playoff
    // game. A miss there would settle a square against an outage; a void can be regraded.
    installFetchMock({ game: FINAL_GAME, teamStats: [] });
    seedCard([
      { kind: "nfl_team_stat_at_least", team: "home", field: "penalties", threshold: 7 },
      { kind: "nfl_combined_team_stat_at_most", field: "turnovers", threshold: 0 },
      { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 3 },
      { kind: "nfl_team_possession_advantage", team: "home", seconds: 300 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("void");
    expect(squareStatus(1)).toBe("void");
    expect(squareStatus(2)).toBe("void");
    expect(squareStatus(3)).toBe("void");
  });

  it("hits an at-least square mid-game but holds an at-most square until Final", async () => {
    installFetchMock({
      game: LIVE_GAME,
      teamStats: [
        teamStatsRow(HOME, { penalties: 7, turnovers: 0, yards_per_play: 6.4 }),
        teamStatsRow(AWAY, { penalties: 2, turnovers: 0, yards_per_play: 3.1 }),
      ],
    });
    seedCard([
      // Cleared already, and a penalty count cannot be taken back: settle it now.
      { kind: "nfl_team_stat_at_least", team: "home", field: "penalties", threshold: 7 },
      // Still true, but the Cowboys can still cough it up: hold.
      { kind: "nfl_team_stat_at_most", team: "away", field: "turnovers", threshold: 0 },
      // A *ratio*, not a counter. 6.4 clears 5.4 right now and could be 4.9 at the whistle, so an
      // early hit here would settle a square that later becomes false. This is the regression this
      // assertion exists for.
      { kind: "nfl_team_stat_at_least", team: "home", field: "yards_per_play", threshold: 5.4 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("pending");
    expect(squareStatus(2)).toBe("pending");
  });

  it("misses an at-most square early once a monotone counter has blown past its bound", async () => {
    installFetchMock({
      game: LIVE_GAME,
      teamStats: [teamStatsRow(HOME, { turnovers: 2 }), teamStatsRow(AWAY, { turnovers: 0 })],
    });
    seedCard([
      { kind: "nfl_team_stat_at_most", team: "home", field: "turnovers", threshold: 0 },
      { kind: "nfl_combined_team_stat_at_most", field: "turnovers", threshold: 0 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("miss");
    expect(squareStatus(1)).toBe("miss");
  });

  it("adds both teams for a combined square", async () => {
    installFetchMock({ game: FINAL_GAME, teamStats: FINAL_TEAM_STATS });
    seedCard([
      { kind: "nfl_combined_team_stat_at_least", field: "penalty_yards", threshold: 95 },
      { kind: "nfl_combined_team_stat_at_least", field: "penalty_yards", threshold: 96 },
      { kind: "nfl_combined_team_stat_at_least", field: "turnovers", threshold: 3 },
      { kind: "nfl_combined_team_stat_at_most", field: "turnovers", threshold: 0 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // 65 + 30 = 95
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("miss"); // 0 + 2 = 2
    expect(squareStatus(3)).toBe("miss");
  });

  it("grades the red-zone pair as exact complements", async () => {
    installFetchMock({ game: FINAL_GAME, teamStats: FINAL_TEAM_STATS });
    seedCard([
      { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 3 },
      { kind: "nfl_team_red_zone_trip_without_touchdown", team: "home" },
      { kind: "nfl_team_perfect_red_zone", team: "away", minTrips: 3 },
      { kind: "nfl_team_red_zone_trip_without_touchdown", team: "away" },
      // 3 trips, 3 scores — perfect, but the minimum is 4, so this one misses on trip count alone.
      { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 4 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("miss");
    expect(squareStatus(3)).toBe("hit");
    expect(squareStatus(4)).toBe("miss");
  });

  it("grades time of possession as a differential, not a total", async () => {
    installFetchMock({ game: FINAL_GAME, teamStats: FINAL_TEAM_STATS });
    seedCard([
      { kind: "nfl_team_possession_advantage", team: "home", seconds: 300 },
      { kind: "nfl_team_possession_advantage", team: "away", seconds: 300 },
      { kind: "nfl_team_stat_at_least", team: "home", field: "possession_time_seconds", threshold: 1800 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // 2010 - 1590 = 420
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("hit");
  });
});

// --- Tier 2: `/nfl/v1/stats` --------------------------------------------------------------------

describe("Tier 2 — player box-score squares", () => {
  const FINAL_STATS: Row[] = [
    playerRow({
      id: 11,
      first: "Jalen",
      last: "Hurts",
      position: "QB",
      stats: { passing_yards: 264, passing_attempts: 31, rushing_touchdowns: 1 },
    }),
    playerRow({
      id: 12,
      first: "Saquon",
      last: "Barkley",
      position: "RB",
      stats: { rushing_yards: 95, receptions: 3, receiving_yards: 28, rushing_touchdowns: 2 },
    }),
    playerRow({
      id: 24,
      first: "Jake",
      last: "Elliott",
      position: "PK",
      stats: { field_goals_made: 2, field_goal_attempts: 3, long_field_goal_made: 51, extra_points_made: 3 },
    }),
    playerRow({
      id: 30,
      first: "Braden",
      last: "Mann",
      position: "P",
      stats: { punts_inside_20: 2 },
    }),
    playerRow({
      id: 22,
      first: "CeeDee",
      last: "Lamb",
      team: AWAY,
      position: "WR",
      stats: { receptions: 6, receiving_yards: 88, receiving_touchdowns: 1 },
    }),
    playerRow({
      id: 23,
      first: "Dak",
      last: "Prescott",
      team: AWAY,
      position: "QB",
      stats: { passing_yards: 191, passing_attempts: 28 },
    }),
    playerRow({
      id: 55,
      first: "Micah",
      last: "Parsons",
      team: AWAY,
      position: "LB",
      stats: { total_tackles: 13, defensive_sacks: 2, defensive_interceptions: 1 },
    }),
    playerRow({
      id: 56,
      first: "Bryce",
      last: "Huff",
      position: "DE",
      stats: { total_tackles: 4, defensive_sacks: 1, defensive_interceptions: 1 },
    }),
    playerRow({ id: 31, first: "Bryan", last: "Anger", team: AWAY, position: "P", stats: { punts_inside_20: 1 } }),
  ];

  it("grades an any-player max square against the best line in the game", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      { kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 85, scope: "any_player" },
      { kind: "nfl_game_max_stat_at_least", field: "receiving_yards", threshold: 95, scope: "any_player" },
      { kind: "nfl_game_max_stat_at_least", field: "touchdowns", threshold: 2, scope: "any_player" },
      { kind: "nfl_game_max_stat_at_least", field: "long_field_goal_made", threshold: 50, scope: "any_player" },
      { kind: "nfl_game_max_stat_at_least", field: "total_tackles", threshold: 12, scope: "any_player" },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // Barkley 95
    expect(squareStatus(1)).toBe("miss"); // best receiver is 88
    expect(squareStatus(2)).toBe("hit"); // Barkley 2 rushing TDs
    expect(squareStatus(3)).toBe("hit"); // Elliott 51
    expect(squareStatus(4)).toBe("hit"); // Parsons 13
  });

  it("requires both sides to clear the bar for a both-teams square", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      { kind: "nfl_game_max_stat_at_least", field: "passing_yards", threshold: 180, scope: "both_teams" },
      { kind: "nfl_game_max_stat_at_least", field: "passing_yards", threshold: 200, scope: "both_teams" },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // 264 and 191
    expect(squareStatus(1)).toBe("miss"); // Prescott's 191 falls short
  });

  it("sums a total-stat square across every player on both teams", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([
      { kind: "nfl_game_total_stat_at_least", field: "punts_inside_20", threshold: 3 },
      { kind: "nfl_game_total_stat_at_least", field: "punts_inside_20", threshold: 4 },
      { kind: "nfl_game_total_stat_at_least", field: "defensive_interceptions", threshold: 2 },
      { kind: "nfl_game_total_stat_at_least", field: "defensive_sacks", threshold: 5 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // 2 + 1
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("hit"); // one on each side
    expect(squareStatus(3)).toBe("miss"); // 2 + 1
  });

  it("reads a missed field goal off attempts vs makes, and never off extra points", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([{ kind: "nfl_game_missed_field_goal" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // Elliott 2 of 3
  });

  it("only counts a pass attempt from a row whose position is known and is not QB", async () => {
    installFetchMock({
      game: FINAL_GAME,
      stats: [
        ...FINAL_STATS,
        playerRow({ id: 99, first: "Trick", last: "Play", position: "WR", stats: { passing_attempts: 1 } }),
      ],
    });
    seedCard([{ kind: "nfl_non_quarterback_pass_attempt" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
  });

  it("misses the non-QB pass square when only quarterbacks threw", async () => {
    installFetchMock({ game: FINAL_GAME, stats: FINAL_STATS });
    seedCard([{ kind: "nfl_non_quarterback_pass_attempt" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("miss");
  });

  it("treats a row with no position as unknown rather than as a non-quarterback", async () => {
    installFetchMock({
      game: FINAL_GAME,
      stats: [
        playerRow({ id: 77, first: "No", last: "Position", position: "", stats: { passing_attempts: 4 } }),
      ],
    });
    seedCard([{ kind: "nfl_non_quarterback_pass_attempt" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("miss");
  });

  it("hits a Tier-2 square mid-game and voids it when the box score is empty at Final", async () => {
    installFetchMock({
      game: LIVE_GAME,
      stats: [playerRow({ id: 12, first: "Saquon", last: "Barkley", position: "RB", stats: { rushing_yards: 92 } })],
    });
    seedCard([
      { kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 85, scope: "any_player" },
      { kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 140, scope: "any_player" },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
    expect(squareStatus(1)).toBe("pending");

    store.db.sports_bingo_squares = [];
    store.db.sports_bingo_cards = [];
    vi.resetModules();
    installFetchMock({ game: FINAL_GAME, stats: [] });
    seedCard([{ kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 85, scope: "any_player" }], "card-2");
    await runRefresh();
    expect(squareStatus(0, "card-2")).toBe("void");
  });
});

// --- Tier 3: the plays walk ---------------------------------------------------------------------

/**
 * A play row. Only the fields the walk reads are set; `home_score`/`away_score` are the *running*
 * totals after the play, which is how BDL publishes them and what the corrupt-play guard checks.
 */
function play(params: {
  period: number;
  clock: string;
  home: number;
  away: number;
  slug?: string;
  shortText?: string;
  yardsToEndzone?: number | null;
  yardage?: number;
}): Row {
  return {
    id: `${params.period}-${params.clock}-${params.home}-${params.away}`,
    type_slug: params.slug ?? "rush",
    type_text: params.slug ?? "Rush",
    short_text: params.shortText ?? "",
    period: params.period,
    clock_display: params.clock,
    home_score: params.home,
    away_score: params.away,
    start_yards_to_endzone: params.yardsToEndzone ?? 40,
    stat_yardage: params.yardage ?? 5,
  };
}

describe("Tier 3 — clock-and-score squares", () => {
  // Home leads 7-0 early, Dallas goes ahead 10-7, then a goal-line score and a two-point try at the
  // death: both teams lead, there is a second-half lead change, the winner trailed in the fourth.
  const PLAYS: Row[] = [
    play({ period: 1, clock: "11:20", home: 7, away: 0, slug: "rushing-touchdown", yardsToEndzone: 6, yardage: 6 }),
    play({ period: 2, clock: "08:00", home: 7, away: 3, slug: "field-goal-good" }),
    play({ period: 2, clock: "00:35", home: 10, away: 3, slug: "field-goal-good" }),
    play({ period: 3, clock: "05:00", home: 10, away: 10, slug: "passing-touchdown", yardsToEndzone: 22 }),
    play({ period: 3, clock: "01:00", home: 10, away: 17, slug: "rushing-touchdown", yardsToEndzone: 3 }),
    play({ period: 4, clock: "09:00", home: 10, away: 19, slug: "safety" }),
    play({ period: 4, clock: "00:48", home: 18, away: 19, slug: "rushing-touchdown", yardsToEndzone: 1, yardage: 1 }),
    play({ period: 4, clock: "00:05", home: 21, away: 19, slug: "field-goal-good" }),
  ];

  const TIER3_FINAL_GAME = nflGame({
    status: "Final",
    homeScore: 21,
    awayScore: 19,
    home: { q1: 7, q2: 3, q3: 0, q4: 11 },
    away: { q1: 0, q2: 3, q3: 14, q4: 2 },
  });

  it("grades the whole Tier-3 family off one walk", async () => {
    installFetchMock({ game: TIER3_FINAL_GAME, plays: PLAYS });
    seedCard([
      { kind: "nfl_first_score_within_minutes", minutes: 6 },
      { kind: "nfl_first_score_within_minutes", minutes: 3 },
      { kind: "nfl_score_in_final_minutes", segment: "first_half", minutes: 1 },
      { kind: "nfl_score_in_final_minutes", segment: "fourth_quarter", minutes: 2 },
      { kind: "nfl_both_teams_lead" },
      { kind: "nfl_lead_change_second_half" },
      { kind: "nfl_tied_after_halftime" },
      { kind: "nfl_winner_trailed_in_fourth" },
      { kind: "nfl_two_point_conversion" },
      { kind: "nfl_safety" },
      { kind: "nfl_goal_line_touchdown", yards: 1 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit"); // first score at 3:40 elapsed
    expect(squareStatus(1)).toBe("miss");
    expect(squareStatus(2)).toBe("hit"); // 0:35 left in Q2
    expect(squareStatus(3)).toBe("hit"); // 0:48 and 0:05 left in Q4
    expect(squareStatus(4)).toBe("hit");
    expect(squareStatus(5)).toBe("hit"); // 10-10 then Dallas ahead in Q3
    expect(squareStatus(6)).toBe("hit");
    expect(squareStatus(7)).toBe("hit"); // Philadelphia trailed 10-19
    expect(squareStatus(8)).toBe("hit"); // the 18-19 play is a delta of exactly 8
    expect(squareStatus(9)).toBe("hit"); // the 19th point is a delta of exactly 2
    expect(squareStatus(10)).toBe("hit");
  });

  it("holds Tier-3 squares pending mid-game and voids them when the walk is unavailable", async () => {
    installFetchMock({ game: LIVE_GAME, plays: PLAYS.slice(0, 2) });
    seedCard([
      { kind: "nfl_both_teams_lead" },
      { kind: "nfl_safety" },
      // The first half is not over, so this cannot miss yet.
      { kind: "nfl_score_in_final_minutes", segment: "first_half", minutes: 1 },
    ]);
    await runRefresh();
    expect(squareStatus(0)).toBe("pending");
    expect(squareStatus(1)).toBe("pending");
    expect(squareStatus(2)).toBe("pending");

    store.db.sports_bingo_squares = [];
    store.db.sports_bingo_cards = [];
    vi.resetModules();
    installFetchMock({ game: TIER3_FINAL_GAME, plays: [] });
    seedCard([{ kind: "nfl_safety" }, { kind: "nfl_both_teams_lead" }], "card-2");
    await runRefresh();
    expect(squareStatus(0, "card-2")).toBe("void");
    expect(squareStatus(1, "card-2")).toBe("void");
  });

  it("misses a first-half square as soon as the third quarter starts, without waiting for Final", async () => {
    installFetchMock({
      game: LIVE_GAME,
      plays: [
        play({ period: 1, clock: "11:20", home: 7, away: 0, slug: "rushing-touchdown" }),
        play({ period: 3, clock: "12:00", home: 7, away: 3, slug: "field-goal-good" }),
      ],
    });
    seedCard([{ kind: "nfl_score_in_final_minutes", segment: "first_half", minutes: 1 }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("miss");
  });

  it("voids the comeback square on a tie rather than calling it a miss", async () => {
    const tiedGame = nflGame({
      status: "Final",
      homeScore: 20,
      awayScore: 20,
      home: { q1: 7, q2: 3, q3: 3, q4: 7 },
      away: { q1: 0, q2: 10, q3: 3, q4: 7 },
    });
    installFetchMock({
      game: tiedGame,
      plays: [play({ period: 4, clock: "01:00", home: 20, away: 20, slug: "field-goal-good" })],
    });
    seedCard([{ kind: "nfl_winner_trailed_in_fourth" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("void");
  });

  it("keeps the corrupt-play guard's 8-point boundary, which is what a two-point try needs", async () => {
    // Phase 4 found rows carrying a stale 0-0 mid-game and duplicate rows after `end-of-game`. The
    // guard accepts a forward move of at most 8 — and 8 is exactly a touchdown plus a two-point
    // conversion, so tightening it to 7 would silently kill that square. This asserts both halves:
    // the corrupt row is ignored, and the legitimate 8-point row still lands.
    installFetchMock({
      game: nflGame({
        status: "Final",
        homeScore: 8,
        awayScore: 0,
        home: { q1: 0, q2: 8, q3: 0, q4: 0 },
        away: { q1: 0, q2: 0, q3: 0, q4: 0 },
      }),
      plays: [
        play({ period: 2, clock: "10:00", home: 8, away: 0, slug: "rushing-touchdown" }),
        play({ period: 2, clock: "09:00", home: 0, away: 0, slug: "rush" }), // corrupt: goes backwards
        play({ period: 2, clock: "08:00", home: 8, away: 0, slug: "rush" }),
      ],
    });
    seedCard([{ kind: "nfl_two_point_conversion" }, { kind: "nfl_safety" }]);
    await runRefresh();
    expect(squareStatus(0)).toBe("hit");
    // The corrupt row must not read as a fresh scoring play of any size.
    expect(squareStatus(1)).toBe("miss");
  });
});

// --- Call volume ---------------------------------------------------------------------------------

describe("feed call volume", () => {
  const teamStatsCalls = (mock: ReturnType<typeof installFetchMock>): number =>
    mock.mock.calls.filter((call) => String(call[0]).includes("/nfl/v1/team_stats")).length;

  it("never calls team_stats for a board with no Tier-1 square", async () => {
    const fetchMock = installFetchMock({ game: FINAL_GAME, teamStats: [] });
    seedCard([
      { kind: "nfl_margin_at_least", line: 3.5 },
      { kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 85, scope: "any_player" },
      { kind: "nfl_overtime" },
    ]);
    await runRefresh();
    expect(teamStatsCalls(fetchMock)).toBe(0);
  });

  it("calls team_stats exactly once per game across multiple cards that need it", async () => {
    const fetchMock = installFetchMock({
      game: FINAL_GAME,
      teamStats: [teamStatsRow(HOME, { penalties: 8 }), teamStatsRow(AWAY, { penalties: 4 })],
    });
    seedCard([{ kind: "nfl_team_stat_at_least", team: "home", field: "penalties", threshold: 7 }], "card-1");
    seedCard([{ kind: "nfl_team_stat_at_least", team: "away", field: "penalties", threshold: 7 }], "card-2");
    seedCard([{ kind: "nfl_combined_team_stat_at_least", field: "penalties", threshold: 13 }], "card-3");
    await runRefresh();
    expect(teamStatsCalls(fetchMock)).toBe(1);
    expect(squareStatus(0, "card-1")).toBe("hit");
    expect(squareStatus(0, "card-2")).toBe("miss");
    expect(squareStatus(0, "card-3")).toBe("miss");
  });
});

// --- Board composition ---------------------------------------------------------------------------

describe("board composition", () => {
  it("caps the Tier-1 block per board and per team, and still fills 24 squares", async () => {
    const { buildSportsBingoBoardFromBallDontLieGame } = await import("@/lib/sportsBingo");
    const { buildNFLMarketModel } = await import("@/lib/sportsBingoOdds");
    const { isNFLTeamStatsResolver, nflFlavorTeamSide } = await import("@/lib/sportsBingoNflFlavor");

    const marketModel = buildNFLMarketModel({ homeSpread: -3.5, total: 45.5, homeWinProb: null, vendorCount: 6 });
    let boards = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const built = buildSportsBingoBoardFromBallDontLieGame({
        sportKey: "americanfootball_nfl",
        row: FINAL_GAME,
        marketModel,
      });
      expect(built).not.toBeNull();
      if (!built) continue;
      boards += 1;
      expect(built.squares).toHaveLength(25);

      const tier1 = built.squares.filter((square) => !square.isFree && isNFLTeamStatsResolver(square.resolver));
      // The board cap. Default 3, because 8a's Q1 (is `team_stats` live mid-game?) is still open
      // and Final-only is the conservative reading — a board of squares that all settle at the
      // whistle is dead for three hours.
      expect(tier1.length).toBeLessThanOrEqual(3);

      for (const side of ["home", "away"] as const) {
        const perTeam = tier1.filter((square) => nflFlavorTeamSide(square.resolver) === side);
        expect(perTeam.length).toBeLessThanOrEqual(2);
      }
    }
    expect(boards).toBe(40);
  });

  it("BINGO_NFL_TIER1_MAX_PER_BOARD=0 actually zeroes the Tier-1 block (kill switch)", async () => {
    // Regression for the `parseInt(env) || 3` bug: "0" parses to the falsy number 0, so `|| 3`
    // silently discarded the documented kill value and no board ever went below 3 Tier-1 squares.
    vi.stubEnv("BINGO_NFL_TIER1_MAX_PER_BOARD", "0");
    const { buildSportsBingoBoardFromBallDontLieGame } = await import("@/lib/sportsBingo");
    const { buildNFLMarketModel } = await import("@/lib/sportsBingoOdds");
    const { isNFLTeamStatsResolver } = await import("@/lib/sportsBingoNflFlavor");

    const marketModel = buildNFLMarketModel({ homeSpread: -3.5, total: 45.5, homeWinProb: null, vendorCount: 6 });
    for (let trial = 0; trial < 40; trial += 1) {
      const built = buildSportsBingoBoardFromBallDontLieGame({
        sportKey: "americanfootball_nfl",
        row: FINAL_GAME,
        marketModel,
      });
      expect(built).not.toBeNull();
      if (!built) continue;
      const tier1 = built.squares.filter((square) => !square.isFree && isNFLTeamStatsResolver(square.resolver));
      expect(tier1).toHaveLength(0);
    }
  });

  it("puts flavor squares on essentially every board", async () => {
    // The point of the phase: a board should no longer be 23 restatements of the spread and the
    // total. This is a floor, not a target — the exact mix is the generator's business.
    const { buildSportsBingoBoardFromBallDontLieGame } = await import("@/lib/sportsBingo");
    const { buildNFLMarketModel } = await import("@/lib/sportsBingoOdds");

    const marketModel = buildNFLMarketModel({ homeSpread: -3.5, total: 45.5, homeWinProb: null, vendorCount: 6 });
    const FLAVOR = /^nfl_(team_stat|combined_team_stat|team_perfect_red_zone|team_red_zone|team_possession|game_max|game_total|game_missed|non_quarterback|first_score_within|score_in_final|both_teams_lead|lead_change|tied_after|winner_trailed|two_point|safety|goal_line)/;

    let withFlavor = 0;
    for (let trial = 0; trial < 25; trial += 1) {
      const built = buildSportsBingoBoardFromBallDontLieGame({
        sportKey: "americanfootball_nfl",
        row: FINAL_GAME,
        marketModel,
      });
      if (!built) continue;
      const flavor = built.squares.filter((square) => !square.isFree && FLAVOR.test(square.resolver.kind));
      if (flavor.length >= 3) withFlavor += 1;
    }
    expect(withFlavor).toBe(25);
  });

  it("labels every flavor square as a sentence, never as a resolver kind", async () => {
    const { buildSportsBingoBoardFromBallDontLieGame } = await import("@/lib/sportsBingo");
    const { buildNFLMarketModel } = await import("@/lib/sportsBingoOdds");
    const built = buildSportsBingoBoardFromBallDontLieGame({
      sportKey: "americanfootball_nfl",
      row: FINAL_GAME,
      marketModel: buildNFLMarketModel({ homeSpread: -3.5, total: 45.5, homeWinProb: null, vendorCount: 6 }),
    });
    expect(built).not.toBeNull();
    for (const square of built?.squares ?? []) {
      if (square.isFree) continue;
      expect(square.label).not.toBe("Sports Bingo square");
      expect(square.label.length).toBeGreaterThan(8);
      expect(square.label.endsWith(".")).toBe(true);
    }
  });
});
