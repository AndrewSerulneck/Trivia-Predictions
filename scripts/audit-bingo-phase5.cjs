#!/usr/bin/env node

/**
 * Offline, deterministic Phase 5 audit over the checked-in real 2025 NFL fixtures.
 * No environment file, network, database, or production state is read.
 */

const fs = require("node:fs");
const path = require("node:path");

const games = require("../tests/fixtures/nfl-completed-games-2025.json");
const teamStats = require("../tests/fixtures/nfl-team-stats-2025.json");
const playerStats = require("../tests/fixtures/nfl-player-stats-2025.json");

const SEED = 0x5eed2026;
const BOARDS_PER_GAME = 25;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function range(values) {
  return values.length ? { min: Math.min(...values), mean: mean(values), max: Math.max(...values) } : null;
}

function wilson(successes, trials, z = 1.96) {
  if (!trials) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return { low: center - spread, high: center + spread };
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function runAudit({ sportsBingo, qualityModule, oddsModule, qualityMode }) {
  Math.random = seededRandom(SEED);
  const predicted = [];
  const quality = [];
  const outcomeCounts = {};
  const unknownByFamilyAndReason = {};
  const bucketCounts = {};
  let wins = 0;
  let totalSquares = 0;
  let unknownSquares = 0;
  let sample = null;

  for (const game of games) {
    const marketModel = oddsModule.buildNFLMarketModel({
      homeSpread: game._market.homeSpread,
      total: game._market.total,
      homeWinProb: null,
      vendorCount: game._market.vendorCount,
    });

    for (let boardIndex = 0; boardIndex < BOARDS_PER_GAME; boardIndex += 1) {
      const board = sportsBingo.buildSportsBingoBoardFromBallDontLieGame({
        sportKey: "americanfootball_nfl",
        row: game,
        marketModel,
        qualityMode,
      });
      if (!board) throw new Error(`Game ${game.id} did not produce a ${qualityMode} board.`);

      const playable = board.squares.filter((square) => !square.isFree);
      const boardBuckets = {};
      for (const square of playable) increment(boardBuckets, square.bucket ?? "unknown");
      for (const bucket of ["moneyline", "spread", "total", "team-total", "player-prop", "special", "achievement", "unknown"]) {
        const values = bucketCounts[bucket] ?? [];
        values.push(boardBuckets[bucket] ?? 0);
        bucketCounts[bucket] = values;
      }
      const boardQuality = qualityModule.auditSportsBingoBoardQuality({
        sportKey: "americanfootball_nfl",
        squares: board.squares,
      });
      if (qualityMode === "enforced" && !boardQuality.eligible) {
        throw new Error(`Game ${game.id} produced an ineligible board: ${boardQuality.issues.join(",")}`);
      }
      quality.push(boardQuality);
      predicted.push(board.boardProbability);

      const outcomes = sportsBingo.gradeResolversAgainstCompletedNFLGame({
        game,
        homeTeam: game.home_team.full_name,
        awayTeam: game.visitor_team.full_name,
        statRows: playerStats[String(game.id)] ?? [],
        teamStatRows: teamStats[String(game.id)] ?? [],
        resolvers: playable.map((square) => square.resolver),
      });
      const marks = playable.map((square, index) => {
        const outcome = outcomes[index];
        increment(outcomeCounts, outcome.status);
        totalSquares += 1;
        if (outcome.status === "pending" || outcome.status === "void") {
          unknownSquares += 1;
          increment(
            unknownByFamilyAndReason,
            `${square.resolver.kind}:${outcome.reason ?? "required_evidence_unavailable"}`
          );
        }
        return { index: square.index, hit: outcome.status === "hit" };
      });
      if (sportsBingo.boardStatusesMakeALine(marks)) wins += 1;

      if (!sample) {
        sample = {
          gameId: String(game.id),
          matchup: `${game.visitor_team.full_name} at ${game.home_team.full_name}`,
          predictedWinProbability: board.boardProbability,
          quality: boardQuality,
          labels: board.squares.map((square) => square.label),
        };
      }
    }
  }

  const boards = games.length * BOARDS_PER_GAME;
  return {
    qualityMode,
    boards,
    predictedWinProbability: range(predicted),
    realizedWins: wins,
    realizedWinRate: wins / boards,
    realizedWinRateWilson95: wilson(wins, boards),
    estimatorAbsoluteError: Math.abs(wins / boards - mean(predicted)),
    outcomes: outcomeCounts,
    unknownSquares,
    totalSquares,
    unknownRate: unknownSquares / totalSquares,
    unknownByFamilyAndReason,
    bucketMixPerBoard: Object.fromEntries(
      Object.entries(bucketCounts).map(([bucket, counts]) => [bucket, range(counts)])
    ),
    quality: {
      eligibleBoards: quality.filter((entry) => entry.eligible).length,
      earlyProgressOpportunities: range(quality.map((entry) => entry.earlyProgressOpportunities)),
      maxSquaresForOnePlayer: Math.max(...quality.map((entry) => entry.maxSquaresForOnePlayer)),
      maxLabelLength: Math.max(...quality.map((entry) => entry.maxLabelLength)),
      duplicateResolverKeyBoards: quality.filter((entry) => entry.duplicateResolverKeys.length > 0).length,
      duplicateDiversityAxisBoards: quality.filter((entry) => entry.duplicateDiversityAxes.length > 0).length,
      unsupportedCandidateBoards: quality.filter((entry) => entry.unsupportedCount > 0).length,
    },
    readableSample: sample,
  };
}

async function main() {
  process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED = "false";
  const originalRandom = Math.random;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  try {
    const sportsBingo = await import("../lib/sportsBingo.ts");
    const qualityModule = await import("../lib/sportsBingoQuality.ts");
    const oddsModule = await import("../lib/sportsBingoOdds.ts");
    const before = runAudit({ sportsBingo, qualityModule, oddsModule, qualityMode: "legacy-audit" });
    const after = runAudit({ sportsBingo, qualityModule, oddsModule, qualityMode: "enforced" });
    const result = {
      generatedAt: "2026-09-19",
      mode: "offline_checked_in_real_provider_shapes",
      seed: SEED,
      games: games.length,
      boardsPerGame: BOARDS_PER_GAME,
      limitations: [
        "The checked-in 2025 player-stat fixture drops all-zero rows.",
        "Historical player-prop odds and complete designation evidence are unavailable, so these are prop-free boards.",
        "Unknown final inputs remain unknown; this audit never fills absent fields with zero.",
        "Predicted estimates and realized outcomes are separate measurements; this slate cannot certify current-season live timing.",
      ],
      before,
      after,
      delta: {
        predictedMean: after.predictedWinProbability.mean - before.predictedWinProbability.mean,
        realizedWinRate: after.realizedWinRate - before.realizedWinRate,
        unknownRate: after.unknownRate - before.unknownRate,
        eligibleBoards: after.quality.eligibleBoards - before.quality.eligibleBoards,
      },
    };

    const outputFlag = process.argv.indexOf("--output");
    if (outputFlag >= 0) {
      const requested = process.argv[outputFlag + 1];
      if (!requested) throw new Error("--output requires a path");
      const outputPath = path.resolve(process.cwd(), requested);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    Math.random = originalRandom;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
