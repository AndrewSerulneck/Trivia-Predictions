#!/usr/bin/env node

/**
 * Phase 1 of docs/mlb-prop-bingo-validation-plan.md — the harness that should have existed.
 *
 * MLB has never had an end-to-end validator. NFL has had one since
 * `scripts/validate-nfl-bingo-grading.cjs`; this is its MLB counterpart, built to the same
 * discipline: it imports the **shipped** graders — `pickBestMatchingBallDontLieGame`,
 * `buildMLBGamePlayerStatsSnapshot`, `evaluateResolver`, `findMLBPlayerStatLine`,
 * `isBallDontLieLineupStarter`, all exported from lib/sportsBingo.ts as of 2026-08-18 — rather
 * than mirroring any of that logic here. A mirrored implementation would validate the mirror, not
 * the grader, which is exactly how four defects (0% match rate, 0% finalized rate, an inverted
 * starter check, and a wrong pitcher-strikeouts field) survived undetected until 2026-08-18.
 *
 * Replays completed MLB games through that substrate and reports, per game and in aggregate:
 *
 *   1. match rate            - does pickBestMatchingBallDontLieGame find the right game?
 *   2. score reconciliation  - snapshot homeScore/awayScore vs the game row's own runs
 *   3. finalized rate        - must be 100% on completed games
 *   4. team-side resolution  - stat lines with a non-null teamSide, out of all lines
 *   5. starter detection     - starters found per game (expect 20: 18 batters + 2 pitchers)
 *   6. player-name lookup    - how often findMLBPlayerStatLine resolves a synthetic prop's player ref
 *   7. realized rate         - hit rate per player_prop market, smoke-test only (a few dozen games
 *                              flags a badly wrong price, it cannot set a right one; that is
 *                              npm run bingo:calibrate:mlb's job, Phase 5)
 *
 * Scope note: this validates the `player_prop` resolver path only. The `mlb_webhook_*` kinds read
 * only `resolver.currentCount` from a live webhook stream and never touch this snapshot at all —
 * Phase 6 of the plan is the instrument for those, not this script.
 *
 * `/mlb/v1/lineups` returns **starters only** (20 rows/game, no `starter` boolean key). "Player not
 * in the lineup map" therefore means bench-or-scratched, not "lineup unavailable" — this script
 * distinguishes an empty lineup response (endpoint down, real outage) from a populated one where a
 * specific player is absent (bench, expected) by reporting raw lineup row counts per game rather
 * than assuming a fixed 20.
 *
 *   npm run bingo:validate:mlb -- --days 5 --limit 25
 */

function parseArgs(argv) {
  const args = { days: 5, limit: 25 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--days") {
      args.days = Number.parseInt(argv[i + 1], 10) || args.days;
      i += 1;
    } else if (argv[i] === "--limit") {
      args.limit = Number.parseInt(argv[i + 1], 10) || args.limit;
      i += 1;
    }
  }
  return args;
}

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

async function fetchAll(path, params, maxPages = 8) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetch(`${BASE_URL}${path}?${query}`, { headers: { Authorization: API_KEY } });
    if (!response.ok) {
      console.error(`[validate] ${path} -> ${response.status}`);
      return rows;
    }
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") {
      return rows;
    }
    cursor = payload.meta.next_cursor;
  }
  console.error(`[validate] truncated at ${maxPages} pages: ${path}`);
  return rows;
}

/** `dates[]` is the only param `/mlb/v1/games` actually honours — see buildBallDontLieDatesQuery's
 * comment in lib/sportsBingo.ts. `start_date`/`end_date` are silently ignored and return year-2000
 * spring training instead. Verified live 2026-08-17, re-derived here rather than imported because
 * it is query-string boilerplate, not grading logic. */
function dayKeysForWindow(fromMs, toMs) {
  const days = [];
  const cursor = new Date(fromMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const PLAYER_PROP_MARKETS = [
  { key: "player_hits", field: "hits", line: 0.5, pool: "batter" },
  { key: "player_home_runs", field: "homeRuns", line: 0.5, pool: "batter" },
  { key: "player_rbis", field: "rbis", line: 0.5, pool: "batter" },
  { key: "player_runs", field: "runs", line: 0.5, pool: "batter" },
  { key: "player_stolen_bases", field: "stolenBases", line: 0.5, pool: "batter" },
  { key: "player_strikeouts_pitcher", field: "strikeoutsPitcher", line: 3.5, pool: "pitcher" },
  { key: "player_pitcher_outs", field: "pitcherOuts", line: 14.5, pool: "pitcher" },
];

async function main() {
  if (!API_KEY) {
    console.error("BALLDONTLIE_API_KEY is not set. Run via `npm run bingo:validate:mlb`.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const {
    pickBestMatchingBallDontLieGame,
    buildMLBGamePlayerStatsSnapshot,
    evaluateResolver,
    findMLBPlayerStatLine,
    isBallDontLieLineupStarter,
  } = await import("../lib/sportsBingo.ts");

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const dateKeys = dayKeysForWindow(now - args.days * dayMs, now);
  const gamesQuery = new URLSearchParams({ per_page: "100" });
  for (const day of dateKeys) gamesQuery.append("dates[]", day);
  const allGames = await fetchAll("/mlb/v1/games", gamesQuery);

  const finals = allGames.filter((game) => String(game.status ?? "") === "STATUS_FINAL").slice(0, args.limit);
  console.log(`[validate] ${finals.length} completed MLB games (last ${args.days} days, capped at ${args.limit})`);

  let matched = 0;
  let scoreReconciled = 0;
  let finalizedCount = 0;
  let teamSideLines = 0;
  let totalLines = 0;
  let starterRowsTotal = 0;
  let starterTrueTotal = 0;
  let emptyLineupGames = 0;
  let lookupResolved = 0;
  let lookupAttempted = 0;
  const marketTally = Object.fromEntries(PLAYER_PROP_MARKETS.map((m) => [m.key, { hit: 0, miss: 0, void: 0, pending: 0 }]));
  const failures = [];

  for (const game of finals) {
    const homeTeam = game.home_team?.display_name ?? "";
    const awayTeam = game.away_team?.display_name ?? "";
    const card = {
      game_id: String(game.id),
      sport_key: "baseball_mlb",
      home_team: homeTeam,
      away_team: awayTeam,
      starts_at: String(game.date ?? new Date().toISOString()),
    };

    // 1. Match rate — the same candidate pool a live lookup would have gotten (the window fetch above).
    const matchedGame = pickBestMatchingBallDontLieGame(card, allGames);
    if (matchedGame && matchedGame.id === game.id) {
      matched += 1;
    } else {
      failures.push(`match miss game ${game.id}: matcher returned ${matchedGame?.id ?? "null"}`);
      continue;
    }

    const statsQuery = new URLSearchParams({ per_page: "100" });
    statsQuery.append("game_ids[]", String(game.id));
    const stats = await fetchAll("/mlb/v1/stats", statsQuery, 4);

    const lineupQuery = new URLSearchParams({ per_page: "100" });
    lineupQuery.append("game_ids[]", String(game.id));
    const lineups = await fetchAll("/mlb/v1/lineups", lineupQuery, 2);

    if (lineups.length === 0) {
      emptyLineupGames += 1;
      failures.push(`empty lineup response for game ${game.id} (possible outage, not a bench read)`);
    }

    const lineupByPlayerId = new Map();
    const lineupByPlayerKey = new Map();
    for (const row of lineups) {
      const playerId = Number(row.player?.id ?? 0);
      const teamName = row.team?.display_name ?? "";
      const teamSide = teamName === homeTeam ? "home" : teamName === awayTeam ? "away" : null;
      const starter = isBallDontLieLineupStarter(row);
      const payload = { starter, teamSide };
      if (Number.isFinite(playerId) && playerId > 0) lineupByPlayerId.set(playerId, payload);
      const name = `${String(row.player?.first_name ?? "").trim()} ${String(row.player?.last_name ?? "").trim()}`.trim();
      if (name) lineupByPlayerKey.set(name.toLowerCase(), payload);
      starterRowsTotal += 1;
      if (starter) starterTrueTotal += 1;
    }

    const snapshot = buildMLBGamePlayerStatsSnapshot(card, matchedGame, stats, { lineupByPlayerId, lineupByPlayerKey });

    // 2. Score reconciliation against the game row's own runs fields (not the snapshot's own read
    //    of them — that would validate the snapshot against itself).
    const rawHome = Number(game.home_team_data?.runs);
    const rawAway = Number(game.away_team_data?.runs);
    if (Number.isFinite(rawHome) && Number.isFinite(rawAway) && snapshot.homeScore === rawHome && snapshot.awayScore === rawAway) {
      scoreReconciled += 1;
    } else {
      failures.push(
        `score mismatch game ${game.id}: snapshot ${snapshot.homeScore}-${snapshot.awayScore} vs feed ${rawHome}-${rawAway}`
      );
    }

    // 3. Finalized rate.
    if (snapshot.finalized) finalizedCount += 1;
    else failures.push(`not finalized: game ${game.id}`);

    // 4. Team-side resolution.
    totalLines += snapshot.lines.length;
    teamSideLines += snapshot.lines.filter((line) => line.teamSide !== null).length;

    if (lineups.length === 0) continue;

    // 6 & 7. Player-name lookup rate and realized rate per market — one synthetic resolver per
    // starter, built the same way a real card's `player` ref is built (`Name::id`).
    const scoreSnapshot = {
      gameId: card.game_id,
      sportKey: "baseball_mlb",
      homeTeam,
      awayTeam,
      homeScore: snapshot.homeScore,
      awayScore: snapshot.awayScore,
      completed: true,
    };

    for (const row of lineups) {
      if (!isBallDontLieLineupStarter(row)) continue;
      const playerId = Number(row.player?.id ?? 0);
      const name = `${String(row.player?.first_name ?? "").trim()} ${String(row.player?.last_name ?? "").trim()}`.trim();
      if (!name) continue;
      const ref = Number.isFinite(playerId) && playerId > 0 ? `${name}::${playerId}` : name;
      const isPitcher = row.is_probable_pitcher === true;

      const line = findMLBPlayerStatLine(snapshot, ref);
      lookupAttempted += 1;
      if (line) lookupResolved += 1;
      else failures.push(`unresolved player ref "${ref}" in game ${game.id}`);

      for (const market of PLAYER_PROP_MARKETS) {
        if ((market.pool === "pitcher") !== isPitcher) continue;
        const resolver = { kind: "player_prop", marketKey: market.key, player: ref, line: market.line, direction: "over" };
        const result = evaluateResolver(resolver, scoreSnapshot, null, snapshot, null);
        marketTally[market.key][result.status] += 1;
      }
    }
  }

  const total = finals.length || 1;
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;

  console.log("\n=== grading integrity ===");
  console.log(`  match rate                       : ${matched}/${finals.length} (${pct(matched)})`);
  console.log(`  score reconciliation              : ${scoreReconciled}/${finals.length} (${pct(scoreReconciled)})`);
  console.log(`  finalized rate                    : ${finalizedCount}/${finals.length} (${pct(finalizedCount)})`);
  console.log(
    `  team-side resolution              : ${teamSideLines}/${totalLines} (${totalLines ? ((teamSideLines / totalLines) * 100).toFixed(1) : "0.0"}%)`
  );
  console.log(`  starter rows (raw / flagged true)  : ${starterRowsTotal} / ${starterTrueTotal} across ${finals.length - emptyLineupGames} games with a populated lineup response`);
  console.log(`  empty lineup responses            : ${emptyLineupGames}/${finals.length} (possible outage, not bench reads)`);
  console.log(
    `  player-name lookup rate           : ${lookupResolved}/${lookupAttempted} (${lookupAttempted ? ((lookupResolved / lookupAttempted) * 100).toFixed(1) : "0.0"}%)`
  );

  console.log("\n=== realized rate per player_prop market (smoke test only) ===");
  for (const market of PLAYER_PROP_MARKETS) {
    const t = marketTally[market.key];
    const resolved = t.hit + t.miss;
    const rate = resolved ? ((t.hit / resolved) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${market.key.padEnd(24)} over ${String(market.line).padStart(5)}  hit ${t.hit}  miss ${t.miss}  void ${t.void}  pending ${t.pending}   realized ${rate}%`
    );
  }

  if (failures.length > 0) {
    console.log("\n=== failures ===");
    for (const failure of failures.slice(0, 50)) console.log(`  ${failure}`);
    if (failures.length > 50) console.log(`  ... and ${failures.length - 50} more`);
  }

  const ok = matched === finals.length && finalizedCount === finals.length && scoreReconciled === finals.length;
  console.log(`\n${ok ? "PASS" : "FAIL"} — MLB grading substrate ${ok ? "matches" : "disagrees with"} the archived feed.`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
