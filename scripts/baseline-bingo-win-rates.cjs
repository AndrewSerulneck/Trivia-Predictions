#!/usr/bin/env node

/**
 * Phase 0 baseline for docs/prop-bingo-nfl-plan.md.
 *
 * Generates N Prop Bingo boards for today's real NBA/WNBA/MLB games and
 * records the estimator's own `boardProbability` (from
 * generateSportsBingoBoard() in lib/sportsBingo.ts), so Phase 5's retune has
 * a documented "before" number. This does NOT prove the realized win rate —
 * it's the independent-coin-flip estimator's opinion of itself, which is
 * exactly the number Phase 5 replaces. That's the point: capture it before
 * anything changes.
 *
 * Follows the simulate-category-blitz.cjs convention (real project libs, not
 * a bundler) — "server-only" is aliased away by --conditions react-server:
 *   node --env-file=.env.local --conditions react-server --import tsx \
 *     scripts/baseline-bingo-win-rates.cjs [--trials-per-game 5]
 */

function parseArgs(argv) {
  const args = { trialsPerGame: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--trials-per-game") {
      args.trialsPerGame = Number.parseInt(argv[i + 1], 10) || args.trialsPerGame;
      i += 1;
    }
  }
  return args;
}

function summarizeDistribution(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Number(mean.toFixed(4)),
    median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(4)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // lib/sportsBingo.ts emits console.info/console.warn telemetry on every
  // candidate-selection call, which lands on stdout and corrupts the single
  // JSON blob this script prints at the end. Silence it for the run.
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  const sportsBingo = await import("../lib/sportsBingo.ts");

  const sportKeys = ["basketball_nba", "basketball_wnba", "baseball_mlb"];
  const results = {};

  for (const sportKey of sportKeys) {
    const games = await sportsBingo.listSportsBingoGames({ sportKey, includeLocked: true });
    const boardProbabilities = [];
    const perGame = [];

    for (const game of games) {
      for (let i = 0; i < args.trialsPerGame; i += 1) {
        try {
          const board = await sportsBingo.generateSportsBingoBoard({ gameId: game.id, sportKey, generationMode: "preview" });
          boardProbabilities.push(board.boardProbability);
          perGame.push({ gameId: game.id, gameLabel: game.gameLabel, trial: i, boardProbability: board.boardProbability });
        } catch (error) {
          perGame.push({ gameId: game.id, gameLabel: game.gameLabel, trial: i, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    results[sportKey] = {
      gamesFoundToday: games.length,
      distribution: summarizeDistribution(boardProbabilities),
      perGame,
    };
  }

  console.info = originalInfo;
  console.warn = originalWarn;

  console.log(
    JSON.stringify(
      {
        baselinedAtUtc: new Date().toISOString(),
        note: "boardProbability is the estimator's own independent-coin-flip Monte Carlo output (lib/sportsBingo.ts estimateBoardWinProbabilityWithTrials), targeting BINGO_BOARD_TARGET_WIN_RATE (today's default 0.42). Phase 5 replaces this estimator; this file is the pre-change baseline for that diff.",
        currentTargetWinRate: Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.42"),
        results,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
