#!/usr/bin/env node

/**
 * Phase 5c of docs/prop-bingo-nfl-plan.md — does the win-rate target actually land?
 *
 * Two modes, and only the second one answers the real question.
 *
 *   **forward** (default) — generate boards for the upcoming slate and report what the estimator
 *   predicts. Fast, needs no completed games, and tells you whether the generator can *find* boards
 *   at the target. It is the estimator agreeing with itself, so it proves nothing on its own.
 *
 *   **backtest** (`--backtest`) — generate boards for **completed** games and settle every square
 *   with the shipped Phase 4 graders. The realized win rate this produces is the number the plan's
 *   ask #4 is actually about.
 *
 * Both modes drive the shipped pipeline through narrow exports
 * (`buildSportsBingoBoardFromBallDontLieGame`, `gradeResolversAgainstCompletedNFLGame`,
 * `boardStatusesMakeALine`) rather than re-implementing it — same discipline as
 * scripts/validate-nfl-bingo-grading.cjs, for the same reason.
 *
 * ## Two honest limitations of backtest mode
 *
 * 1. **Player props cannot be backtested at all.** `/nfl/v1/odds/player_props` is live-only, so a
 *    historical board is core markets plus team/game/quarter/play squares. The plan says this.
 * 2. **balldontlie retains no historical *game* odds either** — verified 2026-08-16:
 *    `/nfl/v1/odds?season=2025&week=6` returns `200 OK` with **zero rows**, exactly like props.
 *    So a backtest cannot use the real closing market. Instead this script builds a **retrodictive
 *    market** for each game out of both teams' scoring through the *previous* weeks of that season
 *    (shrunk toward the league mean so early weeks behave), which is leak-free and gives boards a
 *    realistic spread/total dispersion. It is softer than a real closing line, so the resulting
 *    boards are slightly less sharply priced than production's — read the realized rate as a
 *    close estimate, not a Vegas-grade replay.
 *
 * Usage:
 *   npm run bingo:simulate
 *   npm run bingo:simulate -- --sports basketball_wnba,baseball_mlb --boards 5
 *   npm run bingo:simulate -- --backtest --seasons 2025 --weeks 6,9,14 --boards 4
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

/** League scoring priors used to shrink thin early-season samples. */
const NFL_LEAGUE_AVG_TEAM_POINTS = 22.5;
const NFL_SHRINKAGE_GAMES = 3;
const NFL_HOME_FIELD_POINTS = 1.5;

/** Resolver kinds that need a `/nfl/v1/plays` walk to settle (Optional 3b). */
const PLAY_DERIVED_KINDS = new Set([
  "nfl_first_score_is_field_goal",
  "nfl_first_scorer_wins",
  "nfl_non_offensive_touchdown",
  "nfl_fourth_down_conversion",
  "nfl_long_touchdown",
  "nfl_player_first_td",
  // Phase 8b Tier 3 rides the same plays walk.
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

/**
 * Phase 8b Tier 1 — the kinds that read `/nfl/v1/team_stats`. Kept as a literal set rather than
 * imported so this script stays a plain `.cjs` harness; the tripwire is that a board holding one of
 * these grades every Tier-1 square `void` if the rows are not fetched, which shows up immediately
 * as a jump in `ungradedSquares`.
 */
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
  const args = {
    backtest: false,
    sports: ["basketball_nba", "basketball_wnba", "baseball_mlb", "americanfootball_nfl"],
    seasons: ["2025"],
    weeks: ["6", "9", "14"],
    boards: 4,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--backtest") {
      args.backtest = true;
    } else if (flag === "--sports") {
      args.sports = String(argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (flag === "--seasons") {
      args.seasons = String(argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (flag === "--weeks") {
      args.weeks = String(argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (flag === "--boards") {
      args.boards = Number.parseInt(argv[i + 1], 10) || args.boards;
      i += 1;
    }
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
    if (!response.ok) {
      console.error(`[simulate] ${path} -> ${response.status}`);
      return rows;
    }
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") {
      return rows;
    }
    cursor = payload.meta.next_cursor;
  }
  console.error(`[simulate] truncated at ${maxPages} pages: ${path}`);
  return rows;
}

const LINE_PATTERNS = (() => {
  const lines = [];
  for (let row = 0; row < 5; row += 1) lines.push([0, 1, 2, 3, 4].map((col) => row * 5 + col));
  for (let col = 0; col < 5; col += 1) lines.push([0, 1, 2, 3, 4].map((row) => row * 5 + col));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/**
 * What the **pre-Phase-5** estimator would have said about this exact board: 24 independent coin
 * flips. Kept here, in the harness rather than in `lib/`, purely as a diagnostic — it is the number
 * Phase 5b exists to replace, and printing it next to the realized rate is how you tell whether the
 * new estimator earned its keep on a given slate.
 *
 * A local re-implementation is correct *here* (unlike the graders, which are imported) because the
 * thing being reproduced is deliberately no longer in the codebase.
 */
function legacyIndependentEstimate(squares, trials = 8000) {
  let wins = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const hits = new Array(25).fill(false);
    for (const square of squares) {
      hits[square.index] = square.isFree || Math.random() < square.probability;
    }
    if (LINE_PATTERNS.some((line) => line.every((index) => hits[index]))) wins += 1;
  }
  return wins / trials;
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    min: Number(sorted[0].toFixed(4)),
    p25: Number(at(0.25).toFixed(4)),
    median: Number(at(0.5).toFixed(4)),
    p75: Number(at(0.75).toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4)),
    mean: Number(mean.toFixed(4)),
    /** Share of boards the estimator places inside the plan's 20-30% band. */
    inTargetBand: Number((sorted.filter((v) => v >= 0.2 && v <= 0.3).length / sorted.length).toFixed(4)),
  };
}

// --- forward mode --------------------------------------------------------------------------------

async function runForward(args, sportsBingo) {
  const results = {};

  for (const sportKey of args.sports) {
    let games = [];
    try {
      games = await sportsBingo.listSportsBingoGames({ sportKey, includeLocked: true });
    } catch (error) {
      results[sportKey] = { error: error instanceof Error ? error.message : String(error) };
      continue;
    }

    const probabilities = [];
    const legacyProbabilities = [];
    const errors = [];
    for (const game of games) {
      for (let trial = 0; trial < args.boards; trial += 1) {
        try {
          const board = await sportsBingo.generateSportsBingoBoard({
            gameId: game.id,
            sportKey,
            generationMode: "final",
          });
          probabilities.push(board.boardProbability);
          legacyProbabilities.push(legacyIndependentEstimate(board.squares));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    results[sportKey] = {
      games: games.length,
      boards: probabilities.length,
      predicted: summarize(probabilities),
      legacyIndependentPredicted: summarize(legacyProbabilities),
      errors: errors.slice(0, 5),
    };
  }

  return results;
}

// --- backtest mode -------------------------------------------------------------------------------

/**
 * Both teams' scoring through the weeks *before* the one being backtested, shrunk toward the league
 * mean. This is the stand-in for a closing line; see the header note on why a real one is not
 * available. Nothing here reads the game being priced.
 */
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
    add(scored, homeId, homeScore);
    add(allowed, homeId, awayScore);
    add(played, homeId, 1);
    add(scored, awayId, awayScore);
    add(allowed, awayId, homeScore);
    add(played, awayId, 1);
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
    // balldontlie's convention: negative means the home team is favored.
    homeSpread: -(homeExpected - awayExpected),
    total: homeExpected + awayExpected,
    homeWinProb: null,
    vendorCount: 0,
  };
}

async function runBacktest(args, sportsBingo, sportsBingoOdds) {
  const perGame = [];
  const realizedFlags = [];
  const predicted = [];
  const legacyPredicted = [];
  let ungradedSquares = 0;
  let gradedSquares = 0;

  for (const season of args.seasons) {
    const weeks = args.weeks.map((week) => Number.parseInt(week, 10)).filter(Number.isFinite);
    // One pull of the whole season; each backtested week then reads only the weeks before it, so no
    // game is ever priced with knowledge of itself or of anything that happened after it.
    const seasonGames = await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": season });
    const priorGames = seasonGames.filter((row) => Number(row.week) < Math.max(...weeks));
    const ratingsByWeek = new Map();

    for (const week of weeks) {
      const games = seasonGames.filter((row) => Number(row.week) === week);

      if (!ratingsByWeek.has(week)) {
        ratingsByWeek.set(week, buildPowerRatings(priorGames.filter((row) => Number(row.week) < week)));
      }
      const ratings = ratingsByWeek.get(week);

      for (const game of games) {
        const status = String(game.status ?? "");
        if (!/final/i.test(status)) continue;

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

        const needsPlays = boards.some((board) =>
          board.squares.some((square) => PLAY_DERIVED_KINDS.has(square.resolver.kind))
        );

        const needsTeamStats = boards.some((board) =>
          board.squares.some((square) => TEAM_STATS_KINDS.has(square.resolver.kind))
        );

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
          const playable = board.squares.filter((square) => !square.isFree);
          const graded = sportsBingo.gradeResolversAgainstCompletedNFLGame({
            game,
            homeTeam,
            awayTeam,
            statRows,
            plays,
            teamStatRows,
            resolvers: playable.map((square) => square.resolver),
          });

          const marks = playable.map((square, index) => {
            const outcome = graded[index];
            if (outcome.status === "pending" || outcome.status === "void") ungradedSquares += 1;
            else gradedSquares += 1;
            return { index: square.index, hit: outcome.status === "hit" };
          });

          const won = sportsBingo.boardStatusesMakeALine(marks);
          const legacy = legacyIndependentEstimate(board.squares);
          realizedFlags.push(won ? 1 : 0);
          predicted.push(board.boardProbability);
          legacyPredicted.push(legacy);
          perGame.push({
            gameId: String(game.id),
            label: `${awayTeam} @ ${homeTeam}`,
            week,
            predicted: Number(board.boardProbability.toFixed(4)),
            legacyPredicted: Number(legacy.toFixed(4)),
            won,
            hits: marks.filter((mark) => mark.hit).length,
          });
        }
      }
    }
  }

  const realizedRate = realizedFlags.length > 0 ? realizedFlags.reduce((a, b) => a + b, 0) / realizedFlags.length : null;

  return {
    boards: realizedFlags.length,
    realizedWinRate: realizedRate === null ? null : Number(realizedRate.toFixed(4)),
    predicted: summarize(predicted),
    /**
     * The pre-Phase-5 independent-coin-flip estimate of the very same boards. Compare it against
     * `realizedWinRate`: the gap is the modelling error Phase 5b removed, and it always points the
     * same way — independence *understates* how often a board wins.
     */
    legacyIndependentPredicted: summarize(legacyPredicted),
    /**
     * Squares the graders left `pending` or `void` on a completed game. A nonzero share is not
     * automatically a bug — a player absent from the box score voids by design — but a large one
     * means the realized rate below is being suppressed by grading gaps, not by board difficulty.
     */
    ungradedSquareShare:
      gradedSquares + ungradedSquares > 0
        ? Number((ungradedSquares / (gradedSquares + ungradedSquares)).toFixed(4))
        : null,
    perGame,
  };
}

// --- entry ---------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // lib/sportsBingo.ts emits console.info/console.warn telemetry on every candidate-selection call,
  // which would corrupt the single JSON blob this script prints at the end.
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  const sportsBingo = await import("../lib/sportsBingo.ts");
  const sportsBingoOdds = await import("../lib/sportsBingoOdds.ts");

  const payload = {
    ranAtUtc: new Date().toISOString(),
    mode: args.backtest ? "backtest" : "forward",
    targetWinRate: Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.25"),
    targetBand: [0.2, 0.3],
    boardsPerGame: args.boards,
  };

  if (args.backtest) {
    if (!API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY is required for backtest mode.");
    }
    payload.seasons = args.seasons;
    payload.weeks = args.weeks;
    payload.result = await runBacktest(args, sportsBingo, sportsBingoOdds);
  } else {
    payload.sports = args.sports;
    payload.result = await runForward(args, sportsBingo);
  }

  console.info = originalInfo;
  console.warn = originalWarn;
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
