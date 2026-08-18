#!/usr/bin/env node

/**
 * Phase 9c of docs/prop-bingo-nfl-plan.md — the generated NFL star-index snapshot.
 *
 * `resolveNFLStarIndex` (lib/sportsBingoNflStars.ts) is the live, automatic layer: it re-pulls
 * `/nfl/v1/season_stats` on its own 24h cache, so a player who breaks out on Sunday is in the star
 * tier by Tuesday with no deploy and no human. This script is the other three layers the plan asks
 * for on top of that:
 *
 *   - a **generated, never hand-edited** snapshot (`data/sports-bingo/nfl-star-index.json`) — the
 *     cold-start fallback for anyone reading this by eye, and the diff baseline below. Same
 *     generated-file/generating-script convention as `category-blitz:build` — see CLAUDE.md.
 *   - **the diff is the check-in**: entrants, drop-offs and biggest movers vs. the committed
 *     snapshot, so running this weekly during the season is a two-minute "are we ignoring anyone?"
 *     read instead of a re-derivation from scratch.
 *   - `--dry-run` computes and prints the diff without writing, for previewing before a commit.
 *
 * Reuses `fetchNFLSeasonStats` + `computeNFLSeasonStarIndex` directly from lib/sportsBingoNflStars.ts
 * (both already exported and season-stats fetching needs no board/game context) rather than
 * reimplementing either — this script is a thin wrapper, per the Phase 9a handoff notes.
 *
 * Usage:
 *   npm run bingo:stars:nfl              # compute + write + print the diff vs. the committed file
 *   npm run bingo:stars:nfl:dry-run      # compute + print the diff only, don't write
 */

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "data", "sports-bingo");
const SNAPSHOT_PATH = path.join(DIR, "nfl-star-index.json");
const DIFF_PREVIEW_COUNT = 15;

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

// Single number a player's season standing can be diffed on: the mean of the two percentiles the
// snapshot carries. Not `starScore` itself — that also needs a live game's market signal, which
// this script (no board, no game) never has.
function combinedScore(entry) {
  return (entry.usagePercentile + entry.productionPercentile) / 2;
}

// Diffs one slate (either `current` or `prior`) against its counterpart in the previous snapshot.
// Named so the report reads clearly when both slates are printed one after another.
function printSlateDiff(label, previousPlayers, nextPlayers) {
  console.log(`\n[bingo:stars:nfl] ${label}: ${nextPlayers.length} players scored.`);
  if (!previousPlayers) {
    console.log("  No prior snapshot on disk — nothing to diff against (first run).");
    return;
  }
  if (nextPlayers.length === 0) {
    console.log("  Empty (season not underway yet) — nothing to diff.");
    return;
  }

  const prevById = new Map(previousPlayers.map((row) => [row.playerId, row]));
  const nextById = new Map(nextPlayers.map((row) => [row.playerId, row]));

  const entrants = nextPlayers.filter((row) => !prevById.has(row.playerId));
  const dropoffs = previousPlayers.filter((row) => !nextById.has(row.playerId));
  const movers = nextPlayers
    .filter((row) => prevById.has(row.playerId))
    .map((row) => ({ ...row, delta: combinedScore(row) - combinedScore(prevById.get(row.playerId)) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, DIFF_PREVIEW_COUNT);

  console.log(`  Entrants (${entrants.length} total, first ${DIFF_PREVIEW_COUNT}):`);
  for (const row of entrants.slice(0, DIFF_PREVIEW_COUNT)) {
    console.log(`    + ${row.name ?? row.playerId} (${row.position}) usage=${row.usagePercentile} production=${row.productionPercentile}`);
  }

  console.log(`  Drop-offs (${dropoffs.length} total, first ${DIFF_PREVIEW_COUNT}):`);
  for (const row of dropoffs.slice(0, DIFF_PREVIEW_COUNT)) {
    console.log(`    - ${row.name ?? row.playerId} (${row.position})`);
  }

  console.log(`  Biggest movers (top ${movers.length} by |delta|):`);
  for (const row of movers) {
    const sign = row.delta >= 0 ? "+" : "";
    console.log(`    ${sign}${row.delta.toFixed(3)}  ${row.name ?? row.playerId} (${row.position})`);
  }
}

function printDiff(previous, next) {
  printSlateDiff(`current (season ${next.season})`, previous?.current?.players ?? null, next.current.players);
  printSlateDiff(`prior (season ${next.priorSeason})`, previous?.prior?.players ?? null, next.prior.players);
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const {
    fetchNFLSeasonStats,
    computeNFLSeasonStarIndex,
    resolveCurrentNFLSeasonYear,
    resolvePriorNFLSeasonYear,
  } = await import("../lib/sportsBingoNflStars.ts");

  const now = new Date();
  const season = resolveCurrentNFLSeasonYear(now);
  const priorSeason = resolvePriorNFLSeasonYear(now);

  console.log(`[bingo:stars:nfl] Pulling /nfl/v1/season_stats for season=${season} and season=${priorSeason}...`);
  const [currentRows, priorRows] = await Promise.all([fetchNFLSeasonStats(season), fetchNFLSeasonStats(priorSeason)]);
  console.log(`[bingo:stars:nfl] current: ${currentRows.length} rows, prior: ${priorRows.length} rows`);

  // `computeNFLSeasonStarIndex` only sees playerId (it's a pure function over the percentile math),
  // so names are joined back from the raw rows here, for a human-readable snapshot and diff only —
  // nothing downstream of the index keys off a name.
  function buildPlayerRows(rows) {
    const nameById = new Map();
    for (const row of rows) {
      const id = Number.parseInt(String(row.player?.id ?? ""), 10);
      if (Number.isFinite(id) && row.player) {
        const name = [row.player.first_name, row.player.last_name].filter(Boolean).join(" ").trim();
        if (name) nameById.set(id, name);
      }
    }
    return [...computeNFLSeasonStarIndex(rows).values()]
      .map((entry) => ({
        playerId: entry.playerId,
        name: nameById.get(entry.playerId) ?? null,
        position: entry.position,
        gamesPlayed: entry.gamesPlayed,
        usagePercentile: Number(entry.usagePercentile.toFixed(4)),
        productionPercentile: Number(entry.productionPercentile.toFixed(4)),
      }))
      .sort((a, b) => combinedScore(b) - combinedScore(a) || a.playerId - b.playerId);
  }

  // Both slates are recorded, not just `current`: pre-season and early-season, `current` is empty
  // by design (the plan's own early-season shrinkage rationale — there's no real signal yet), and
  // an all-empty snapshot would be a poor "artifact a human can actually read." `prior` is what
  // `resolveNFLStarIndex` blends toward in exactly that situation, so it's what's actually
  // informative to read right now.
  const snapshot = {
    generatedAt: now.toISOString(),
    season,
    priorSeason,
    current: { players: buildPlayerRows(currentRows) },
    prior: { players: buildPlayerRows(priorRows) },
  };

  const previous = fs.existsSync(SNAPSHOT_PATH) ? JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) : null;
  printDiff(previous, snapshot);

  if (dryRun) {
    console.log("\n--dry-run: not writing.");
    return;
  }

  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${SNAPSHOT_PATH}`);
}

main().catch((error) => {
  console.error("[bingo:stars:nfl] failed:", error);
  process.exitCode = 1;
});
