#!/usr/bin/env node

/**
 * Phase 8c of docs/prop-bingo-nfl-plan.md — per-resolver-family calibration on the backtest slate.
 *
 * `npm run bingo:simulate -- --backtest` answers "does a board win about a quarter of the time?"
 * and nothing else. A board can land dead on 25% while half its squares are individually
 * mispriced, because errors in opposite directions cancel at the board level — which is exactly
 * what was happening when this script was written.
 *
 * So: same board-generation and grading path as scripts/simulate-bingo-boards.cjs (it reuses the
 * same three exports, deliberately, rather than re-implementing either half), but instead of only
 * counting board wins it records, per resolver kind and per square key, the probability the
 * generator ASSIGNED against the rate the shipped graders REALIZED. Sort by the gap and the
 * mispriced families fall out of the top and bottom of the table.
 *
 * ## Reading the output without fooling yourself
 *
 * - **`realized` counts an ungraded square as a non-hit.** Divide by `1 - ungraded` before
 *   comparing a family with a meaningful void share (Tier 1 voids whenever `team_stats` is absent,
 *   which is every postseason game).
 * - **Boards for one game share that game's outcome**, so the effective sample size is closer to
 *   the game count than the square count. A family appearing ~1x per board over 272 games is
 *   worth about ±0.03; anything read off a three-week slate is worth about ±0.07, which is wide
 *   enough to invent a mispricing that isn't there. Run the full season before changing a number.
 * - **A flat, market-independent base rate can show a gap it does not deserve.** Board selection is
 *   difficulty-biased, so a constant-priced square lands disproportionately in the games where the
 *   generator needed that difficulty — and if its true rate moves with the spread or the total, the
 *   games it lands in are not average games. Confirm against a direct season measurement
 *   (`npm run bingo:measure:nfl-quarters`) before treating a gap here as a price error.
 *
 * Usage:
 *   npm run bingo:calibrate:nfl
 *   npm run bingo:calibrate:nfl -- --weeks 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18 --boards 4
 *
 * The full-season run above is ~25 minutes and several hundred API calls; the default three-week
 * slate is a smoke test, not a measurement.
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

const NFL_LEAGUE_AVG_TEAM_POINTS = 22.5;
const NFL_SHRINKAGE_GAMES = 3;
const NFL_HOME_FIELD_POINTS = 1.5;

const PLAY_DERIVED_KINDS = new Set([
  "nfl_first_score_is_field_goal",
  "nfl_first_scorer_wins",
  "nfl_non_offensive_touchdown",
  "nfl_fourth_down_conversion",
  "nfl_long_touchdown",
  "nfl_player_first_td",
  "nfl_first_score_within_minutes",
  "nfl_score_in_final_minutes",
  "nfl_both_teams_lead",
  "nfl_lead_change_second_half",
  "nfl_tied_after_halftime",
  "nfl_winner_trailed_in_fourth",
  "nfl_two_point_conversion",
  "nfl_safety",
  "nfl_goal_line_touchdown",
]);

const TEAM_STATS_KINDS = new Set([
  "nfl_team_stat_at_least",
  "nfl_team_stat_at_most",
  "nfl_combined_team_stat_at_least",
  "nfl_combined_team_stat_at_most",
  "nfl_team_perfect_red_zone",
  "nfl_team_red_zone_trip_without_touchdown",
  "nfl_team_possession_advantage",
]);

function parseArgs(argv) {
  const args = { seasons: ["2025"], weeks: ["2", "6", "9", "14", "17"], boards: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seasons") { args.seasons = String(argv[i + 1] ?? "").split(",").filter(Boolean); i += 1; }
    else if (argv[i] === "--weeks") { args.weeks = String(argv[i + 1] ?? "").split(",").filter(Boolean); i += 1; }
    else if (argv[i] === "--boards") { args.boards = Number.parseInt(argv[i + 1], 10) || args.boards; i += 1; }
  }
  return args;
}

async function fetchAll(path, params, maxPages = 8) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetch(`${BASE_URL}${path}?${query}`, { headers: { Authorization: API_KEY } });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    cursor = payload.meta?.next_cursor ?? null;
    if (cursor === null || cursor === undefined) break;
  }
  return rows;
}

function buildPowerRatings(priorGames) {
  const scored = new Map();
  const allowed = new Map();
  const played = new Map();
  const add = (map, teamId, value) => map.set(teamId, (map.get(teamId) ?? 0) + value);
  for (const game of priorGames) {
    const homeId = game.home_team?.id;
    const awayId = game.visitor_team?.id;
    const homeScore = Number(game.home_team_score);
    const awayScore = Number(game.visitor_team_score);
    if (!homeId || !awayId || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    add(scored, homeId, homeScore); add(allowed, homeId, awayScore); add(played, homeId, 1);
    add(scored, awayId, awayScore); add(allowed, awayId, homeScore); add(played, awayId, 1);
  }
  const shrink = (total, count) =>
    (total + NFL_SHRINKAGE_GAMES * NFL_LEAGUE_AVG_TEAM_POINTS) / (count + NFL_SHRINKAGE_GAMES);
  return {
    scoredAvg: (teamId) => shrink(scored.get(teamId) ?? 0, played.get(teamId) ?? 0),
    allowedAvg: (teamId) => shrink(allowed.get(teamId) ?? 0, played.get(teamId) ?? 0),
  };
}

function retrodictiveConsensus(game, ratings) {
  const homeId = game.home_team?.id;
  const awayId = game.visitor_team?.id;
  if (!homeId || !awayId) return null;
  const homeExpected = (ratings.scoredAvg(homeId) + ratings.allowedAvg(awayId)) / 2 + NFL_HOME_FIELD_POINTS / 2;
  const awayExpected = (ratings.scoredAvg(awayId) + ratings.allowedAvg(homeId)) / 2 - NFL_HOME_FIELD_POINTS / 2;
  return {
    homeSpread: -(homeExpected - awayExpected),
    total: homeExpected + awayExpected,
    homeWinProb: null,
    vendorCount: 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  const sportsBingo = await import("../lib/sportsBingo.ts");
  const sportsBingoOdds = await import("../lib/sportsBingoOdds.ts");

  /** kind -> {n, assigned, hits, pending, void} ; key -> same */
  const byKind = new Map();
  const byKey = new Map();
  const bucket = (map, id) => {
    if (!map.has(id)) map.set(id, { n: 0, assigned: 0, hits: 0, pending: 0, voided: 0 });
    return map.get(id);
  };

  let boardsSeen = 0;
  let boardsWon = 0;

  for (const season of args.seasons) {
    const weeks = args.weeks.map((w) => Number.parseInt(w, 10)).filter(Number.isFinite);
    const seasonGames = await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": season });
    const priorGames = seasonGames.filter((row) => Number(row.week) < Math.max(...weeks));

    for (const week of weeks) {
      const ratings = buildPowerRatings(priorGames.filter((row) => Number(row.week) < week));
      for (const game of seasonGames.filter((row) => Number(row.week) === week)) {
        if (!/final/i.test(String(game.status ?? ""))) continue;
        const consensus = retrodictiveConsensus(game, ratings);
        if (!consensus) continue;
        const marketModel = sportsBingoOdds.buildNFLMarketModel(consensus);

        const boards = [];
        for (let trial = 0; trial < args.boards; trial += 1) {
          const built = sportsBingo.buildSportsBingoBoardFromBallDontLieGame({
            sportKey: "americanfootball_nfl",
            row: game,
            marketModel,
          });
          if (built) boards.push(built);
        }
        if (boards.length === 0) continue;

        const needsPlays = boards.some((b) => b.squares.some((s) => PLAY_DERIVED_KINDS.has(s.resolver.kind)));
        const needsTeamStats = boards.some((b) => b.squares.some((s) => TEAM_STATS_KINDS.has(s.resolver.kind)));

        const statRows = await fetchAll("/nfl/v1/stats", { per_page: "100", "game_ids[]": String(game.id) });
        const plays = needsPlays
          ? await fetchAll("/nfl/v1/plays", { per_page: "100", game_id: String(game.id) }, 4)
          : [];
        const teamStatRows = needsTeamStats
          ? await fetchAll("/nfl/v1/team_stats", { per_page: "100", "game_ids[]": String(game.id) })
          : [];

        const homeTeam = game.home_team?.full_name ?? "";
        const awayTeam = game.visitor_team?.full_name ?? "";

        for (const board of boards) {
          const playable = board.squares.filter((s) => !s.isFree);
          const graded = sportsBingo.gradeResolversAgainstCompletedNFLGame({
            game, homeTeam, awayTeam, statRows, plays, teamStatRows,
            resolvers: playable.map((s) => s.resolver),
          });
          boardsSeen += 1;
          const marks = playable.map((square, index) => {
            const outcome = graded[index];
            for (const b of [bucket(byKind, square.resolver.kind), bucket(byKey, square.key)]) {
              b.n += 1;
              b.assigned += square.probability;
              if (outcome.status === "hit") b.hits += 1;
              else if (outcome.status === "pending") b.pending += 1;
              else if (outcome.status === "void") b.voided += 1;
            }
            return { index: square.index, hit: outcome.status === "hit" };
          });
          if (sportsBingo.boardStatusesMakeALine(marks)) boardsWon += 1;
        }
      }
    }
  }

  const table = (map, minN) =>
    [...map.entries()]
      .filter(([, v]) => v.n >= minN)
      .map(([id, v]) => ({
        id,
        n: v.n,
        assigned: Number((v.assigned / v.n).toFixed(3)),
        realized: Number((v.hits / v.n).toFixed(3)),
        gap: Number((v.hits / v.n - v.assigned / v.n).toFixed(3)),
        ungraded: Number(((v.pending + v.voided) / v.n).toFixed(3)),
      }))
      .sort((a, b) => a.gap - b.gap);

  console.info = originalInfo;
  console.warn = originalWarn;
  process.stdout.write(
    `${JSON.stringify(
      {
        ranAtUtc: new Date().toISOString(),
        seasons: args.seasons,
        weeks: args.weeks,
        boardsPerGame: args.boards,
        boards: boardsSeen,
        realizedWinRate: boardsSeen ? Number((boardsWon / boardsSeen).toFixed(4)) : null,
        byKind: table(byKind, 20),
        bySquare: table(byKey, 40),
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
