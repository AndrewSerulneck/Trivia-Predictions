import { describe, expect, it, vi } from "vitest";
import nflFixture from "@/tests/fixtures/bingo-brunswick-grove-2026-09-09.json";
import nbaFixture from "@/tests/fixtures/bingo-capability-nba-2026.json";
import wnbaFixture from "@/tests/fixtures/bingo-capability-wnba-2026.json";
import mlbFixture from "@/tests/fixtures/bingo-capability-mlb-2026.json";
import { bingoResolverCapability, BINGO_NFL_PROP_MARKETS, BINGO_MLB_PROP_MARKETS, BINGO_BASKETBALL_METRICS } from "@/lib/sportsBingoCapabilities";
import { buildNBAGamePlayerStatsSnapshot, buildMLBGamePlayerStatsSnapshot, evaluateResolver, gradeResolversAgainstCompletedNFLGame, normalizeBallDontLieScoreRow, type SportsBingoResolver } from "@/lib/sportsBingo";
import { NFL_TEAM_STAT_FIELDS, NFL_PLAYER_STAT_FIELDS } from "@/lib/sportsBingoNflFlavor";
vi.mock("server-only", () => ({}));

type Raw = Record<string, unknown>;
const nflInput = () => ({ game: structuredClone(nflFixture.provider.game.rows[0]) as Raw, homeTeam: nflFixture.card.home_team, awayTeam: nflFixture.card.away_team, statRows: structuredClone(nflFixture.provider.stats.rows) as Raw[], teamStatRows: structuredClone(nflFixture.provider.teamStats.rows) as Raw[], designationRows: structuredClone(nflFixture.provider.designations.rows) as Raw[] });
const nflGrade = (resolver: SportsBingoResolver, input = nflInput()) => gradeResolversAgainstCompletedNFLGame({ ...input, resolvers: [resolver] })[0];
const ref = (row: Raw) => { const player = row.player as Raw; return `${player.first_name} ${player.last_name}::${player.id}`; };
const eligible = (sport: string, resolver: SportsBingoResolver) => expect(bingoResolverCapability(sport, resolver).supported).toBe(true);

const coreFixtures = [
  ["basketball_nba", nbaFixture.feeds["selected-game"]], ["basketball_wnba", wnbaFixture.feeds["selected-game"]],
  ["baseball_mlb", mlbFixture.feeds["selected-game"]], ["americanfootball_nfl", nflFixture.provider.game.rows[0]],
] as const;
describe.each(coreFixtures)("%s real final core evidence", (sport, game) => {
  const score = normalizeBallDontLieScoreRow(game, sport)!;
  it("grades every core family, strict boundary, missing score, and live/final scope", () => {
    const home = score.homeScore!; const away = score.awayScore!;
    const cases: Array<[SportsBingoResolver, string]> = [
      [{ kind: "free" }, "hit"], [{ kind: "moneyline", team: "home" }, home > away ? "hit" : "miss"],
      [{ kind: "spread_more_than", team: "home", line: home - away - .5 }, "hit"],
      [{ kind: "spread_keep_close", team: "away", line: home - away + .5 }, "hit"],
      [{ kind: "game_total_over", line: home + away - .5 }, "hit"], [{ kind: "game_total_under", line: home + away + .5 }, "hit"],
      [{ kind: "team_total_over", team: "home", line: home - .5 }, "hit"], [{ kind: "team_total_under", team: "home", line: home + .5 }, "hit"],
    ];
    for (const [resolver, expected] of cases) {
      eligible(sport, resolver); expect(evaluateResolver(resolver, score).status).toBe(expected);
      if (resolver.kind === "free") continue;
      expect(evaluateResolver(resolver, { ...score, homeScore: null }).status).toBe("pending");
      if ("line" in resolver) {
        const opposite = { ...resolver, line: resolver.line + (resolver.kind.endsWith("under") || resolver.kind === "spread_keep_close" ? -1 : 1) };
        expect(evaluateResolver(opposite, score).status).toBe("miss");
        expect(evaluateResolver({ ...resolver, line: Math.round(resolver.line) }, score).status).not.toBe("pending");
      }
    }
    expect(evaluateResolver({ kind: "moneyline", team: "home" }, { ...score, awayScore: home }).status).toBe("void");
    expect(evaluateResolver({ kind: "moneyline", team: "home" }, { ...score, completed: false }).status).toBe("pending");
    // A large win still satisfies the original one-sided keep-close rule.
    expect(evaluateResolver({ kind: "spread_keep_close", team: "home", line: 3.5 }, { ...score, homeScore: 50, awayScore: 0 }).status).toBe("hit");
  });
});

describe.each([["basketball_nba", nbaFixture], ["basketball_wnba", wnbaFixture]] as const)("%s captured cumulative stats", (sport, fixture) => {
  const game = fixture.feeds["selected-game"];
  const card = { home_team: game.home_team.full_name, away_team: game.visitor_team.full_name } as Parameters<typeof buildNBAGamePlayerStatsSnapshot>[0];
  const raw = fixture.feeds.stats.rows as unknown as Parameters<typeof buildNBAGamePlayerStatsSnapshot>[2];
  const score = normalizeBallDontLieScoreRow(game, sport)!;
  const keys = { points: "pts", rebounds: "reb", assists: "ast", steals: "stl", blocks: "blk", threes: "fg3m", offensive_rebounds: "oreb", defensive_rebounds: "dreb", minutes_played: "min" } as const;
  for (const metric of BINGO_BASKETBALL_METRICS) it(`${metric}: hit/miss/equality, missing/null and ID isolation`, () => {
    const row = raw[0]; const player = ref(row as Raw); const key = keys[metric];
    const value = Number(row[key] ?? 0);
    const snapshot = buildNBAGamePlayerStatsSnapshot(card, game, raw);
    const resolver: SportsBingoResolver = { kind: "nba_player_stat_at_least", player, metric, threshold: value };
    eligible(sport, resolver); expect(evaluateResolver(resolver, score, snapshot).status).toBe("hit");
    expect(evaluateResolver({ ...resolver, threshold: value + 1 }, score, snapshot).status).toBe("miss");
    const missing = structuredClone(raw) as Raw[]; delete missing[0][key];
    expect(evaluateResolver(resolver, score, buildNBAGamePlayerStatsSnapshot(card, game, missing)).status).toBe("void");
    expect(evaluateResolver({ ...resolver, player: `${row.player?.first_name} ${row.player?.last_name}::99999999999` }, score, snapshot).status).toBe("void");
    expect(evaluateResolver(resolver, { ...score, completed: false }, null).status).toBe("pending");
  });
  for (const [metric, field] of [["made_threes", "fg3m"], ["total_assists", "ast"], ["total_rebounds", "reb"]] as const) it(`${metric}: both teams reconciled, partial rows and absent fields`, () => {
    const value = raw.filter(row => row.team?.id === game.home_team.id).reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
    const resolver: SportsBingoResolver = { kind: "nba_team_stat_at_least", team: "home", metric, threshold: value };
    eligible(sport, resolver); const snapshot = buildNBAGamePlayerStatsSnapshot(card, game, raw);
    expect(evaluateResolver(resolver, score, snapshot).status).toBe("hit");
    expect(evaluateResolver({ ...resolver, threshold: value + 1 }, score, snapshot).status).toBe("miss");
    expect(evaluateResolver(resolver, score, buildNBAGamePlayerStatsSnapshot(card, game, raw.slice(1))).status).toBe("void");
    const missing = structuredClone(raw) as Raw[]; delete missing[0][field];
    expect(evaluateResolver(resolver, score, buildNBAGamePlayerStatsSnapshot(card, game, missing)).status).toBe("void");
  });
});

describe("NFL real stat and participation contracts", () => {
  const fields: Record<string, string[]> = { passing_yards: ["passing_yards"], passing_tds: ["passing_touchdowns"], passing_attempts: ["passing_attempts"], passing_completions: ["passing_completions"], interceptions: ["passing_interceptions"], rushing_yards: ["rushing_yards"], rushing_attempts: ["rushing_attempts"], receptions: ["receptions"], receiving_yards: ["receiving_yards"], rushing_receiving_yards: ["rushing_yards", "receiving_yards"], longest_rush: ["long_rushing"], longest_reception: ["long_reception"], fg_made: ["field_goals_made"], kicking_points: ["field_goals_made", "extra_points_made"] };
  for (const market of BINGO_NFL_PROP_MARKETS) it(`${market}: hit/miss, exact boundary, missing and partial`, () => {
    const input = nflInput(); const row = input.statRows.find(row => typeof row[fields[market][0]] === "number")!;
    const value = market === "kicking_points" ? 3 * Number(row.field_goals_made ?? 0) + Number(row.extra_points_made ?? 0) : fields[market].reduce((sum, field) => sum + Number(row[field] ?? 0), 0);
    const resolver: SportsBingoResolver = { kind: "player_prop", player: ref(row), marketKey: market, direction: "over", line: value - .5 };
    eligible("nfl", resolver);
    expect(nflGrade(resolver, input).status).toBe("hit"); expect(nflGrade({ ...resolver, line: value + .5 }, input).status).toBe("miss");
    expect(nflGrade({ ...resolver, direction: "under", line: value + .5 }, input).status).toBe("hit");
    expect(nflGrade({ ...resolver, direction: "under", line: value }, input).status).toBe("miss");
    delete row[fields[market][0]]; expect(nflGrade(resolver, input).status).toBe("void");
    expect(gradeResolversAgainstCompletedNFLGame({ ...nflInput(), statsComplete: false, resolvers: [resolver] })[0].status).toBe("void");
  });
  it("zero inference needs did_not_play=false, the exact game/team and complete reconciled offenses", () => {
    const resolver = nflFixture.squares[17].resolver as SportsBingoResolver;
    expect(nflGrade(resolver).status).toBe("hit");
    for (const change of ["unknown", "dnp", "wrong_game", "wrong_team", "partial"] as const) {
      const input = nflInput(); const designation = input.designationRows.find(row => row.player_id === 13874289)!;
      if (change === "unknown") designation.did_not_play = null;
      if (change === "dnp") designation.did_not_play = true;
      if (change === "wrong_game") designation.game_id = 999;
      if (change === "wrong_team") designation.team_id = 999;
      if (change === "partial") input.statRows = input.statRows.filter(row => (row.player as Raw).id !== 60);
      expect(nflGrade(resolver, input).status, change).toBe("void");
    }
  });
  it("duplicate IDs, foreign games and duplicate team rows cannot prove complete statistics", () => {
    const input = nflInput(); const resolver = nflFixture.squares[17].resolver as SportsBingoResolver;
    input.statRows.push(structuredClone(input.statRows[0])); expect(nflGrade(resolver, input).status).toBe("void");
    input.statRows = nflInput().statRows; input.statRows[0].game_id = 999;
    expect(nflGrade(resolver, input).status).toBe("void");
    input.statRows = nflInput().statRows; input.teamStatRows.push(structuredClone(input.teamStatRows[0]));
    expect(nflGrade(resolver, input).status).toBe("void");
  });
  it("anytime touchdown credits the scorer, excludes passing TDs and guards all six fields", () => {
    const scorer = nflInput().statRows.find(row => (row.player as Raw).id === 33934883)!;
    const passer = nflInput().statRows.find(row => (row.player as Raw).id === 279866)!;
    const resolver: SportsBingoResolver = { kind: "nfl_player_anytime_td", player: ref(scorer) }; eligible("nfl", resolver);
    expect(nflGrade(resolver).status).toBe("hit"); expect(nflGrade({ ...resolver, player: ref(passer) }).status).toBe("miss");
    const input = nflInput(); delete input.statRows.find(row => (row.player as Raw).id === 33934883)!.receiving_touchdowns;
    expect(nflGrade(resolver, input).status).toBe("void");
  });
  for (const field of NFL_TEAM_STAT_FIELDS) it(`team ${field}: threshold/equality/missing/one-team`, () => {
    const input = nflInput(); const row = input.teamStatRows.find(row => (row.team as Raw).id === 31)!; const value = Number(row[field]);
    for (const kind of ["nfl_team_stat_at_least", "nfl_team_stat_at_most"] as const) {
      const resolver = { kind, team: "home" as const, field, threshold: value } as Extract<SportsBingoResolver, { kind: "nfl_team_stat_at_least" | "nfl_team_stat_at_most" }>; eligible("nfl", resolver);
      expect(nflGrade(resolver, input).status).toBe("hit");
      expect(nflGrade({ ...resolver, threshold: value + (kind.endsWith("at_least") ? 1 : -1) }, input).status).toBe("miss");
      const missing = nflInput(); delete missing.teamStatRows.find(row => (row.team as Raw).id === 31)![field]; expect(nflGrade(resolver, missing).status).toBe("void");
      expect(nflGrade(resolver, { ...input, teamStatRows: [row] }).status).toBe("void");
    }
  });
  for (const field of ["penalties", "penalty_yards", "turnovers"] as const) it(`combined ${field}: both sides required`, () => {
    const input = nflInput(); const total = input.teamStatRows.reduce((sum, row) => sum + Number(row[field]), 0);
    for (const kind of ["nfl_combined_team_stat_at_least", "nfl_combined_team_stat_at_most"] as const) {
      const resolver = { kind, field, threshold: total } as Extract<SportsBingoResolver, { kind: "nfl_combined_team_stat_at_least" | "nfl_combined_team_stat_at_most" }>; eligible("nfl", resolver);
      expect(nflGrade(resolver).status).toBe("hit"); expect(nflGrade({ ...resolver, threshold: total + (kind.endsWith("at_least") ? 1 : -1) }).status).toBe("miss");
      delete input.teamStatRows[0][field]; expect(nflGrade(resolver, input).status).toBe("void");
      input.teamStatRows = nflInput().teamStatRows;
    }
  });
  for (const field of NFL_PLAYER_STAT_FIELDS) it(`game player ${field}: complete maximum/total boundaries`, () => {
    const input = nflInput(); const val = (row: Raw) => field === "touchdowns" ? ["rushing_touchdowns", "receiving_touchdowns", "kick_return_touchdowns", "punt_return_touchdowns", "interception_touchdowns", "fumbles_touchdowns"].reduce((sum, key) => sum + Number(row[key] ?? 0), 0) : Number(row[field] ?? 0);
    for (const kind of ["nfl_game_max_stat_at_least", "nfl_game_total_stat_at_least"] as const) {
      const threshold = kind === "nfl_game_max_stat_at_least" ? Math.max(...input.statRows.map(val)) : input.statRows.reduce((sum, row) => sum + val(row), 0);
      const resolver: SportsBingoResolver = kind === "nfl_game_max_stat_at_least" ? { kind, field, scope: "any_player", threshold } : { kind, field, threshold };
      eligible("nfl", resolver); expect(nflGrade(resolver).status).toBe("hit"); expect(nflGrade({ ...resolver, threshold: threshold + 1 }).status).toBe("miss");
      delete input.statRows[0][field === "touchdowns" ? "rushing_touchdowns" : field]; expect(nflGrade(resolver, input).status).toBe("void"); input.statRows = nflInput().statRows;
    }
    const threshold = Math.min(...[1, 31].map(id => Math.max(...input.statRows.filter(row => (row.team as Raw).id === id).map(val))));
    const both: SportsBingoResolver = { kind: "nfl_game_max_stat_at_least", field, scope: "both_teams", threshold };
    eligible("nfl", both); expect(nflGrade(both).status).toBe("hit"); expect(nflGrade({ ...both, threshold: threshold + 1 }).status).toBe("miss");
    expect(nflGrade(both, { ...input, statRows: input.statRows.filter(row => (row.team as Raw).id === 31) }).status).toBe("void");
  });
});

describe("NFL captured score/quarter/special contracts", () => {
  const cases: Array<[SportsBingoResolver, "hit" | "miss"]> = [
    [{ kind: "nfl_team_scores_every_quarter", team: "home" }, "miss"],
    [{ kind: "nfl_team_shutout_quarter", team: "home" }, "hit"],
    [{ kind: "nfl_team_quarter_points_at_least", team: "home", threshold: 10 }, "hit"],
    [{ kind: "nfl_any_quarter_scoreless" }, "hit"],
    [{ kind: "nfl_team_leads_at_halftime", team: "home" }, "miss"],
    [{ kind: "nfl_halftime_leader_loses" }, "hit"],
    [{ kind: "nfl_overtime" }, "miss"],
    [{ kind: "nfl_both_teams_score_at_least", threshold: 10 }, "hit"],
    [{ kind: "nfl_margin_at_most", line: 3.5 }, "hit"],
    [{ kind: "nfl_margin_at_least", line: 3.5 }, "miss"],
    [{ kind: "nfl_second_half_higher_scoring" }, "hit"],
    [{ kind: "nfl_team_perfect_red_zone", team: "away", minTrips: 1 }, "miss"],
    [{ kind: "nfl_team_red_zone_trip_without_touchdown", team: "away" }, "hit"],
    [{ kind: "nfl_team_possession_advantage", team: "away", seconds: 514 }, "hit"],
    [{ kind: "nfl_game_missed_field_goal" }, "miss"],
    [{ kind: "nfl_non_quarterback_pass_attempt" }, "miss"],
  ];
  for (const [resolver, expected] of cases) it(`${resolver.kind}: observed final and absent inputs`, () => {
    eligible("nfl", resolver); expect(nflGrade(resolver).status).toBe(expected);
    const input = nflInput(); input.game = { id: input.game.id, status: "Final" }; input.statRows = []; input.teamStatRows = []; input.designationRows = [];
    expect(["pending", "void"]).toContain(nflGrade(resolver, input).status);
  });
  for (const [resolver, expected] of cases) it(`${resolver.kind}: opposite result on an explicit fixture variant`, () => {
    const input = nflInput(); let variant = resolver;
    switch (resolver.kind) {
      case "nfl_team_scores_every_quarter": Object.assign(input.game, { home_team_q1: 1, home_team_q2: 1, home_team_q4: 8 }); break;
      case "nfl_team_shutout_quarter": Object.assign(input.game, { home_team_q1: 1, home_team_q2: 1, home_team_q4: 8 }); break;
      case "nfl_team_quarter_points_at_least": variant = { ...resolver, threshold: 11 }; break;
      case "nfl_any_quarter_scoreless": Object.assign(input.game, { home_team_q1: 1, home_team_q4: 9 }); break;
      case "nfl_team_leads_at_halftime": Object.assign(input.game, { home_team_q1: 10, home_team_q4: 0 }); break;
      case "nfl_halftime_leader_loses": Object.assign(input.game, { home_team_q1: 10, home_team_q4: 0 }); break;
      case "nfl_overtime": Object.assign(input.game, { home_team_ot: 3, home_team_score: 16 }); break;
      case "nfl_both_teams_score_at_least": variant = { ...resolver, threshold: 11 }; break;
      case "nfl_margin_at_most": variant = { ...resolver, line: 2.5 }; break;
      case "nfl_margin_at_least": variant = { ...resolver, line: 2.5 }; break;
      case "nfl_second_half_higher_scoring": Object.assign(input.game, { home_team_q1: 10, home_team_q4: 0 }); break;
      case "nfl_team_perfect_red_zone": input.teamStatRows[0].red_zone_scores = input.teamStatRows[0].red_zone_attempts; break;
      case "nfl_team_red_zone_trip_without_touchdown": input.teamStatRows[0].red_zone_scores = input.teamStatRows[0].red_zone_attempts; break;
      case "nfl_team_possession_advantage": variant = { ...resolver, seconds: 515 }; break;
      case "nfl_game_missed_field_goal": input.statRows.find(row => Number(row.field_goal_attempts) > 0)!.field_goal_attempts = 10; break;
      case "nfl_non_quarterback_pass_attempt": (input.statRows.find(row => Number(row.passing_attempts) > 0)!.player as Raw).position_abbreviation = "WR"; break;
    }
    expect(nflGrade(variant, input).status).toBe(expected === "hit" ? "miss" : "hit");
  });
  it("quarter/OT closure and missing columns never use current scores as a finished period", () => {
    const input = nflInput(); input.game.status = "1st Qtr";
    input.game.home_team_score = 0; input.game.visitor_team_score = 0;
    for (const side of ["home", "visitor"]) for (const q of [1, 2, 3, 4]) input.game[`${side}_team_q${q}`] = null;
    expect(nflGrade({ kind: "nfl_team_shutout_quarter", team: "home" }, input).status).toBe("pending");
    const missing = nflInput(); delete missing.game.home_team_q1; delete missing.game.visitor_team_q1;
    expect(nflGrade({ kind: "nfl_any_quarter_scoreless" }, missing).status).toBe("void");
    const ot = nflInput(); ot.game.home_team_ot = 3; ot.game.home_team_score = 16;
    expect(nflGrade({ kind: "nfl_overtime" }, ot).status).toBe("hit");
    // Regulation-half rule excludes overtime.
    expect(nflGrade({ kind: "nfl_second_half_higher_scoring" }, ot).status).toBe("hit");
  });
  it("negative yardage, plus/minus, and corrected scores stay revisable", () => {
    const input = nflInput(); input.game.status = "In Progress";
    const resolver: SportsBingoResolver = { kind: "nfl_team_stat_at_least", team: "away", field: "net_passing_yards", threshold: 100 };
    expect(nflGrade(resolver, input).status).toBe("pending");
    input.game.status = "Final"; input.teamStatRows[0].net_passing_yards = 99;
    expect(nflGrade(resolver, input).status).toBe("miss");
  });
  it("legacy first touchdown uses receiver IDs and rejects incomplete/corrected play evidence", () => {
    const resolver: SportsBingoResolver = { kind: "nfl_player_first_td", player: "Eli Raridon::33934883" };
    const plays = structuredClone(nflFixture.provider.plays.rows) as Raw[];
    const grade = (rows: Raw[]) => gradeResolversAgainstCompletedNFLGame({ ...nflInput(), resolvers: [resolver], plays: rows })[0].status;
    expect(grade(plays)).toBe("hit"); expect(grade(plays.slice(0, 10))).toBe("void");
    expect(grade(plays.slice(1))).toBe("void"); expect(grade([plays[0], plays[plays.length - 1]])).toBe("void"); expect(grade([...plays, ...plays])).toBe("hit");
    const corrected = structuredClone(plays); corrected.find(play => play.scoring_play)!.text = "Touchdown reversed. No play.";
    expect(grade(corrected)).toBe("void");
    expect(bingoResolverCapability("nfl", resolver).supported).toBe(false);
  });
});

describe("MLB captured box-score contracts", () => {
  const game = mlbFixture.feeds["selected-game"];
  const raw = mlbFixture.feeds.stats.rows as Raw[];
  const card = { home_team: game.home_team.display_name, away_team: game.away_team.display_name } as Parameters<typeof buildMLBGamePlayerStatsSnapshot>[0];
  const score = normalizeBallDontLieScoreRow(game, "baseball_mlb")!;
  const grade = (resolver: SportsBingoResolver, rows = raw) => evaluateResolver(resolver, score, null, buildMLBGamePlayerStatsSnapshot(card, game, rows)).status;
  const fields = ["hits", "hr", "rbi", "runs", "stolen_bases", "p_k", "er", "pitching_outs"];
  BINGO_MLB_PROP_MARKETS.forEach((market, index) => it(`${market}: actual stats, hitter/pitcher identity and missing field`, () => {
    const field = fields[index]; const row = raw.find(row => typeof row[field] === "number")!; const value = Number(row[field]);
    const resolver: SportsBingoResolver = { kind: "player_prop", marketKey: market, player: ref(row), direction: "over", line: value - .5 };
    eligible("baseball_mlb", resolver); expect(grade(resolver)).toBe("hit"); expect(grade({ ...resolver, line: value + .5 })).toBe("miss"); expect(grade({ ...resolver, direction: "under", line: value + .5 })).toBe("hit");
    expect(grade({ ...resolver, line: value })).toBe("miss");
    const missing = structuredClone(raw); const target = missing.find(item => ref(item) === ref(row))!; delete target[field]; if (field === "pitching_outs") delete target.ip;
    expect(grade(resolver, missing)).toBe("void");
    expect(grade({ ...resolver, player: `${(row.player as Raw).first_name} ${(row.player as Raw).last_name}::99999999` })).toBe("void");
  }));
  for (const [event, field] of [["hit", "hits"], ["home_run", "hr"], ["strikeout", "k"], ["walk", "bb"], ["hit_by_pitch", "hit_by_pitch"], ["rbi", "rbi"], ["stolen_base", "stolen_bases"], ["pitcher_out", "pitching_outs"]] as const) it(`player event ${event}: ignores duplicated webhook counts`, () => {
    const row = raw.find(row => typeof row[field] === "number")!; const value = Number(row[field]);
    const resolver: SportsBingoResolver = { kind: "mlb_webhook_player_event_at_least", player: ref(row), event, threshold: Math.max(1, value), currentCount: 999 };
    eligible("baseball_mlb", resolver); expect(grade(resolver)).toBe(value >= 1 ? "hit" : "miss");
    expect(grade({ ...resolver, threshold: value + 1 })).toBe("miss");
    const missing = structuredClone(raw); const target = missing.find(item => ref(item) === ref(row))!; delete target[field]; if (event === "pitcher_out") delete target.ip;
    expect(grade(resolver, missing)).toBe("void");
  });
  for (const [event, field] of [["earned_run", "er"], ["hit_allowed", "p_hits"]] as const) it(`pitcher ${event}: complete snapshot corrects zero/missing counters`, () => {
    const row = raw.find(row => Number(row[field]) > 0)!; const value = Number(row[field]);
    const resolver: SportsBingoResolver = { kind: "mlb_webhook_player_event_at_most", player: ref(row), event, threshold: value, currentCount: 0 };
    eligible("baseball_mlb", resolver); expect(grade(resolver)).toBe("hit"); expect(grade({ ...resolver, threshold: value - 1 })).toBe("miss");
    const missing = structuredClone(raw); delete missing.find(item => ref(item) === ref(row))![field]; expect(grade(resolver, missing)).toBe("void");
  });
  for (const [event, field] of [["groundout", "ground_outs"], ["flyout", "fly_outs"], ["strikeout", "k"], ["walk", "bb"], ["hit_by_pitch", "hit_by_pitch"], ["hit", "hits"]] as const) it(`team ${event}: reconciles runs/hits and rejects partial input`, () => {
    const total = raw.filter(row => (row.team as Raw).id === game.home_team.id && Number(row.plate_appearances) > 0).reduce((sum, row) => sum + Number(row[field]), 0);
    const resolver: SportsBingoResolver = { kind: "mlb_webhook_team_event_at_least", team: "home", event, threshold: Math.max(1, total), currentCount: 999 };
    eligible("baseball_mlb", resolver); expect(grade(resolver)).toBe(total >= 1 ? "hit" : "miss");
    expect(grade({ ...resolver, threshold: total + 1 })).toBe("miss"); expect(grade(resolver, raw.slice(1))).toBe("void");
  });
  it("converts baseball 5.2 innings to 17 outs and preserves explicit zero", () => {
    const rows = structuredClone(raw); const row = rows.find(row => typeof row.pitching_outs === "number")!;
    delete row.pitching_outs; row.ip = "5.2";
    const resolver: SportsBingoResolver = { kind: "player_prop", player: ref(row), marketKey: "player_pitcher_outs", direction: "over", line: 16.5 };
    expect(grade(resolver, rows)).toBe("hit"); row.pitching_outs = 0; expect(grade(resolver, rows)).toBe("miss");
  });
});

it("rejects new rules without verified evidence or player IDs regardless of possible-square flags", () => {
  const rejected: Array<[string, SportsBingoResolver]> = [
    ["nfl", { kind: "nfl_fourth_down_conversion" }], ["nfl", { kind: "nfl_player_first_td", player: "Player::1" }],
    ["baseball_mlb", { kind: "mlb_webhook_team_event_at_least", team: "home", event: "quick_out_under_3_pitches", threshold: 1 }],
    ["basketball_nba", { kind: "nba_player_bench_scores", player: "Player::1", threshold: 10 }],
    ["basketball_wnba", { kind: "nba_player_points_first_half_at_least", player: "Player::1", threshold: 10 }],
    ["nfl", { kind: "player_prop", player: "Name only", marketKey: "receptions", direction: "over", line: .5 }],
    ["nfl", { kind: "game_total_over", line: 40 }],
  ];
  for (const [sport, resolver] of rejected) expect(bingoResolverCapability(sport, resolver).supported).toBe(false);
});
