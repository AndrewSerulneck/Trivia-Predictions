#!/usr/bin/env node

/**
 * Phase 4 validator for docs/prop-bingo-nfl-plan.md — NFL grading against real archived games.
 *
 * Replays completed balldontlie games through the **shipped** grading substrate
 * (`buildNFLPlayDerivedFacts` and `buildNFLQuarterScores` from lib/sportsBingo.ts, imported, not
 * re-implemented) and checks the two things that can silently be wrong in production:
 *
 *   1. **Does the play walk reconstruct the real final score?** The live `/nfl/v1/plays` feed
 *      contains corrupt rows — a mid-game play reporting 0-0 in a 21-14 game, stray duplicated
 *      rows appended after `end-of-game` carrying a first-quarter score. `buildNFLPlayDerivedFacts`
 *      guards against them; if that guard ever regresses, this reports a score mismatch.
 *   2. **Does the first-touchdown scorer parse?** BDL puts no `player_id` on plays, so the
 *      `nfl_player_first_td` square is graded off `short_text` prose. An unparsed scorer voids the
 *      square, so the parse rate is a direct measure of how often that square degrades.
 *
 * It also reports the **realized** rate of every Optional-3b square next to the base rate currently
 * shipping for it. Treat that column as a smoke test only: 43 games is worth about ±0.07 on a
 * single square, so it can flag a badly wrong price but cannot set a right one. The instrument for
 * that is `npm run bingo:calibrate:nfl`, which replays a full season through the shipped graders
 * and reports assigned-vs-realized per resolver family (Phase 8c).
 *
 * Follows the baseline-bingo-win-rates.cjs convention — "server-only" is aliased away by
 * --conditions react-server:
 *   npm run bingo:validate:nfl -- --seasons 2025 --weeks 6,9,14
 */

function parseArgs(argv) {
  const args = { seasons: ["2025"], weeks: ["6", "9", "14"] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seasons") {
      args.seasons = String(argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (argv[i] === "--weeks") {
      args.weeks = String(argv[i + 1] ?? "").split(",").filter(Boolean);
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

// The base rates lib/sportsBingoOdds.ts currently prices these squares at. Kept here as plain
// numbers so the report reads as "priced vs realized" without importing the odds module's
// env-tunable knobs — which means **this table has to be updated by hand whenever one of those
// constants moves**, or the delta column silently reports against a price that no longer ships.
// Phase 8c moved `fourthDownConversion` (0.75 → 0.83) after measuring it at 0.8272 over a full
// season; the 43-game sample below reads it at 0.837.
const SHIPPED_BASE_RATES = {
  fgFirst: 0.38,
  firstScorerWins: 0.65,
  nonOffensiveTd: 0.26,
  fourthDownConversion: 0.83,
  longTouchdown: 0.34,
};

async function main() {
  if (!API_KEY) {
    console.error("BALLDONTLIE_API_KEY is not set. Run via `npm run bingo:validate:nfl`.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const { buildNFLPlayDerivedFacts, buildNFLQuarterScores } = await import("../lib/sportsBingo.ts");

  const games = [];
  for (const season of args.seasons) {
    for (const week of args.weeks) {
      games.push(...(await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": season, "weeks[]": week })));
    }
  }
  const finals = games.filter((game) => String(game.status ?? "").toLowerCase().startsWith("final"));
  console.log(`[validate] ${finals.length} completed games (seasons ${args.seasons.join(",")}, weeks ${args.weeks.join(",")})`);

  const tally = {
    fgFirst: 0,
    firstScorerWins: 0,
    nonOffensiveTd: 0,
    fourthDownConversion: 0,
    longTouchdown: 0,
    scoresEveryQuarterHome: 0,
    anyQuarterScoreless: 0,
    overtime: 0,
  };
  let touchdownGames = 0;
  let scorerParsed = 0;
  let scoreMismatches = 0;
  let quarterSumMismatches = 0;
  const failures = [];

  for (const game of finals) {
    const plays = await fetchAll("/nfl/v1/plays", { per_page: "100", game_id: String(game.id) }, 4);
    const facts = buildNFLPlayDerivedFacts(plays);
    const quarters = buildNFLQuarterScores(game, true);

    // 1. The play walk must reconstruct the real final score.
    let walkHome = 0;
    let walkAway = 0;
    for (const play of plays) {
      const home = Number(play.home_score);
      const away = Number(play.away_score);
      if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
      const deltaHome = home - walkHome;
      const deltaAway = away - walkAway;
      if (deltaHome < 0 || deltaAway < 0 || deltaHome + deltaAway > 8) continue;
      walkHome = home;
      walkAway = away;
    }
    if (walkHome !== game.home_team_score || walkAway !== game.visitor_team_score) {
      scoreMismatches += 1;
      failures.push(
        `score mismatch game ${game.id}: plays ${walkHome}-${walkAway} vs feed ${game.home_team_score}-${game.visitor_team_score}`
      );
    }

    // 2. Quarter columns (with `null` read as zero) must sum to the final score.
    const quarterSum = (side, ot) => side.reduce((sum, value) => sum + (value ?? 0), 0) + (ot ?? 0);
    if (
      quarterSum(quarters.home, quarters.homeOt) !== game.home_team_score ||
      quarterSum(quarters.away, quarters.awayOt) !== game.visitor_team_score
    ) {
      quarterSumMismatches += 1;
      failures.push(`quarter sum mismatch game ${game.id}`);
    }

    if (facts.firstScoreKind === "field_goal") tally.fgFirst += 1;
    const winner =
      game.home_team_score > game.visitor_team_score
        ? "home"
        : game.visitor_team_score > game.home_team_score
        ? "away"
        : null;
    if (facts.firstScoringTeam && winner === facts.firstScoringTeam) tally.firstScorerWins += 1;
    if (facts.sawNonOffensiveTouchdown) tally.nonOffensiveTd += 1;
    if (facts.sawFourthDownConversion) tally.fourthDownConversion += 1;
    if (facts.longestTouchdownYards >= 50) tally.longTouchdown += 1;
    if (facts.firstTouchdown) {
      touchdownGames += 1;
      if (facts.firstTouchdown.scorerName) scorerParsed += 1;
      else failures.push(`unparsed first-TD scorer in game ${game.id}`);
    }

    const homeQuarters = [0, 1, 2, 3].map((index) => quarters.home[index] ?? 0);
    const awayQuarters = [0, 1, 2, 3].map((index) => quarters.away[index] ?? 0);
    if (homeQuarters.every((value) => value > 0)) tally.scoresEveryQuarterHome += 1;
    if (homeQuarters.some((value, index) => value === 0 && awayQuarters[index] === 0)) tally.anyQuarterScoreless += 1;
    if (quarters.wentToOvertime) tally.overtime += 1;
  }

  const total = finals.length || 1;
  const rate = (key) => tally[key] / total;
  const row = (label, key) => {
    const priced = SHIPPED_BASE_RATES[key];
    const realized = rate(key);
    const suffix = priced === undefined ? "" : `   (priced ${priced.toFixed(2)}, delta ${(realized - priced >= 0 ? "+" : "")}${(realized - priced).toFixed(2)})`;
    console.log(`  ${label.padEnd(30)} ${(realized * 100).toFixed(1).padStart(5)}%${suffix}`);
  };

  console.log("\n=== realized rates ===");
  row("first score is a field goal", "fgFirst");
  row("first scorer wins", "firstScorerWins");
  row("non-offensive touchdown", "nonOffensiveTd");
  row("fourth-down conversion", "fourthDownConversion");
  row("50+ yard touchdown", "longTouchdown");
  row("home scores every quarter", "scoresEveryQuarterHome");
  row("a quarter scoreless for both", "anyQuarterScoreless");
  row("overtime", "overtime");

  console.log("\n=== grading integrity ===");
  console.log(`  play walk reproduces final score : ${finals.length - scoreMismatches}/${finals.length}`);
  console.log(`  quarter columns sum to final     : ${finals.length - quarterSumMismatches}/${finals.length}`);
  console.log(`  first-TD scorer parsed           : ${scorerParsed}/${touchdownGames}`);

  if (failures.length > 0) {
    console.log("\n=== failures ===");
    for (const failure of failures) console.log(`  ${failure}`);
  }

  const ok = scoreMismatches === 0 && quarterSumMismatches === 0 && scorerParsed === touchdownGames;
  console.log(`\n${ok ? "PASS" : "FAIL"} — grading substrate ${ok ? "matches" : "disagrees with"} the archived feed.`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
