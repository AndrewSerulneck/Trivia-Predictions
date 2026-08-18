#!/usr/bin/env node

/**
 * Phase 9d of docs/prop-bingo-nfl-plan.md — the generated MLB star-index snapshot.
 *
 * The MLB twin of scripts/refresh-nfl-star-index.cjs, and deliberately the same script with three
 * substitutions (module, endpoint, `position` -> `group`) rather than a re-derivation — the Phase 9c
 * handoff's instruction to 9d was "reuse the shape, don't reimplement the diff/print logic."
 *
 * `resolveMLBStarIndex` (lib/sportsBingoMlbStars.ts) is the live, automatic layer: it re-pulls
 * `/mlb/v1/season_stats` on its own 24h cache, so a hitter who breaks out this week is in the star
 * tier within a day, with no deploy and no human. This script is the other three layers:
 *
 *   - a **generated, never hand-edited** snapshot (`data/sports-bingo/mlb-star-index.json`) — the
 *     human-readable artifact and the diff baseline below. Same generated-file/generating-script
 *     convention as `category-blitz:build` — see CLAUDE.md. It is **not** a runtime fallback: a feed
 *     failure degrades to no tilt, decided once for both sports (see `resolveMLBStarIndex`'s docs).
 *   - **the diff is the check-in**: entrants, drop-offs and biggest movers vs. the committed
 *     snapshot, so running this weekly during the season is a two-minute "are we ignoring anyone?"
 *     read instead of a re-derivation from scratch.
 *   - `--dry-run` computes and prints the diff without writing, for previewing before a commit.
 *
 * Usage:
 *   npm run bingo:stars:mlb              # compute + write + print the diff vs. the committed file
 *   npm run bingo:stars:mlb:dry-run      # compute + print the diff only, don't write
 */

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "data", "sports-bingo");
const SNAPSHOT_PATH = path.join(DIR, "mlb-star-index.json");
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

function printSlateDiff(label, previousPlayers, nextPlayers) {
  console.log(`\n[bingo:stars:mlb] ${label}: ${nextPlayers.length} players scored.`);
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
    console.log(`    + ${row.name ?? row.playerId} (${row.group}) usage=${row.usagePercentile} production=${row.productionPercentile}`);
  }

  console.log(`  Drop-offs (${dropoffs.length} total, first ${DIFF_PREVIEW_COUNT}):`);
  for (const row of dropoffs.slice(0, DIFF_PREVIEW_COUNT)) {
    console.log(`    - ${row.name ?? row.playerId} (${row.group})`);
  }

  console.log(`  Biggest movers (top ${movers.length} by |delta|):`);
  for (const row of movers) {
    const sign = row.delta >= 0 ? "+" : "";
    console.log(`    ${sign}${row.delta.toFixed(3)}  ${row.name ?? row.playerId} (${row.group})`);
  }
}

function printDiff(previous, next) {
  printSlateDiff(`current (season ${next.season})`, previous?.current?.players ?? null, next.current.players);
  printSlateDiff(`prior (season ${next.priorSeason})`, previous?.prior?.players ?? null, next.prior.players);
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const {
    fetchMLBSeasonStats,
    computeMLBSeasonStarIndex,
    resolveCurrentMLBSeasonYear,
    resolvePriorMLBSeasonYear,
  } = await import("../lib/sportsBingoMlbStars.ts");

  const now = new Date();
  const season = resolveCurrentMLBSeasonYear(now);
  const priorSeason = resolvePriorMLBSeasonYear(now);

  console.log(`[bingo:stars:mlb] Pulling /mlb/v1/season_stats for season=${season} and season=${priorSeason}...`);
  const [currentRows, priorRows] = await Promise.all([fetchMLBSeasonStats(season), fetchMLBSeasonStats(priorSeason)]);
  console.log(`[bingo:stars:mlb] current: ${currentRows.length} rows, prior: ${priorRows.length} rows`);

  // `computeMLBSeasonStarIndex` only sees playerId (it's a pure function over the percentile math),
  // so names are joined back from the raw rows here, for a human-readable snapshot and diff only —
  // nothing downstream of the index keys off a name.
  function buildPlayerRows(rows) {
    const nameById = new Map();
    for (const row of rows) {
      const id = Number.parseInt(String(row.player?.id ?? ""), 10);
      if (Number.isFinite(id) && row.player) {
        const name =
          String(row.player.full_name ?? "").trim() ||
          [row.player.first_name, row.player.last_name].filter(Boolean).join(" ").trim();
        if (name) nameById.set(id, name);
      }
    }
    return [...computeMLBSeasonStarIndex(rows).values()]
      .map((entry) => ({
        playerId: entry.playerId,
        name: nameById.get(entry.playerId) ?? null,
        group: entry.group,
        gamesPlayed: entry.gamesPlayed,
        usagePercentile: Number(entry.usagePercentile.toFixed(4)),
        productionPercentile: Number(entry.productionPercentile.toFixed(4)),
      }))
      .sort((a, b) => combinedScore(b) - combinedScore(a) || a.playerId - b.playerId);
  }

  // Both slates recorded, same reasoning as the NFL snapshot: in the off-season `current` collapses
  // to whatever the last completed season held, and `prior` is what the shrinkage blend leans on.
  // Unlike NFL, MLB's `current` is normally populated — the season runs March-November — so the
  // interesting slate to diff week over week is `current`.
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
  console.error("[bingo:stars:mlb] failed:", error);
  process.exitCode = 1;
});
