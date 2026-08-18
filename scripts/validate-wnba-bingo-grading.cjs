#!/usr/bin/env node

/**
 * Phase 3 of docs/bingo-correctness-and-wnba-repair-plan.md — the WNBA counterpart of
 * `npm run bingo:validate:mlb`. WNBA settlement has never had an end-to-end validator; that is
 * exactly how MLB's four defects (and this phase's five WNBA + one NBA defect) survived
 * undetected, so shipping the repair without one repeats the mistake.
 *
 * Imports the **shipped** graders — `pickBestMatchingBallDontLieGame`,
 * `buildNBAGamePlayerStatsSnapshot`, `evaluateResolver`, all exported from lib/sportsBingo.ts —
 * rather than mirroring any of that logic here. A mirrored implementation would validate the
 * mirror, not the grader.
 *
 * This script reimplements only the fetch/play-walk *orchestration* that
 * `getNBAGamePlayerStatsSnapshot` (private, not exported) performs internally, using the same
 * endpoint choices the Phase 3 fix ships with (`/wnba/v1/player_stats`, `/wnba/v1/plays?game_id=`
 * singular, the `scoring_play` field) — hardcoded here rather than imported, matching the MLB
 * validator's own pattern of hardcoding its endpoint strings independently of the lib file it is
 * checking.
 *
 * Reports, per game and in aggregate:
 *   1. match rate            - does pickBestMatchingBallDontLieGame find the right game?
 *   2. score reconciliation  - snapshot homeScore/awayScore vs the game row's own flat scores
 *   3. finalized rate        - must be 100% on completed games (status_state, not status)
 *   4. team-side resolution  - stat lines with a non-null teamSide, out of all lines
 *   5. play-walk yield       - firstScoringTeam / halftime scores / max quarter points populated
 *   6. per-family settled status - a battery of resolvers built from each game's real snapshot
 *      data, graded through evaluateResolver, tallied by status
 *   7. suppressed-family diagnostic - the four families 3d stops generating for WNBA (bench
 *      scores, first-half points, any-quarter assists, first-half steals) still evaluate without
 *      crashing if one is built against a real snapshot; not a pass/fail gate, just visibility
 *      into what "gate generation, not settlement" actually leaves behind
 *
 * A second section replays one real NBA game through the same play-walk fix (3b is "a live NBA
 * fix riding along in a WNBA phase" per the plan) and reports firstScoringTeam / halftime scores
 * / max quarter points — these have been null/0 in production for the life of the feature, so
 * "non-null / non-zero" is the pass condition, not a specific value.
 *
 *   npm run bingo:validate:wnba -- --days 10 --limit 25
 */

function parseArgs(argv) {
  const args = { days: 10, limit: 25 };
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
      if (response.status !== 404) {
        console.error(`[validate] ${path} -> ${response.status}`);
      }
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

function toRef(name, id) {
  return Number.isFinite(id) && id > 0 ? `${name}::${Math.trunc(id)}` : name;
}

/** Mirrors the play-walk in getNBAGamePlayerStatsSnapshot (lib/sportsBingo.ts) exactly, so this
 * script exercises the same shape of logic the shipped fix does — but independently re-derived,
 * not imported, per this validator's whole reason for existing. */
function walkPlays(plays, card) {
  let firstScoringTeam = null;
  let homeHalftimeScore = null;
  let awayHalftimeScore = null;
  const quarterStarts = new Map();
  const quarterMax = new Map();
  const ordered = [...plays].sort((a, b) => {
    const pa = Number(a.period ?? 0);
    const pb = Number(b.period ?? 0);
    if (pa !== pb) return pa - pb;
    return (Number(a.home_score ?? 0) + Number(a.away_score ?? 0)) - (Number(b.home_score ?? 0) + Number(b.away_score ?? 0));
  });
  const teamSideOf = (team) => {
    const name = team?.full_name || team?.name || "";
    if (name === card.home_team) return "home";
    if (name === card.away_team) return "away";
    return null;
  };
  for (const play of ordered) {
    const period = Number(play.period ?? 0);
    const homeScore = Number(play.home_score ?? 0);
    const awayScore = Number(play.away_score ?? 0);
    if (period >= 1 && period <= 4) {
      if (!quarterStarts.has(period)) {
        const previous = quarterMax.get(period - 1) ?? { home: 0, away: 0 };
        quarterStarts.set(period, { home: previous.home, away: previous.away });
      }
      const currentMax = quarterMax.get(period) ?? { home: 0, away: 0 };
      quarterMax.set(period, { home: Math.max(currentMax.home, homeScore), away: Math.max(currentMax.away, awayScore) });
    }
    const scoringFlag = play.scoring_play ?? play.is_scoring_play;
    if (firstScoringTeam === null && scoringFlag === true) {
      const side = teamSideOf(play.team);
      if (side) {
        firstScoringTeam = side;
      } else if (homeScore > 0 || awayScore > 0) {
        firstScoringTeam = homeScore > awayScore ? "home" : "away";
      }
    }
    if (period <= 2) {
      homeHalftimeScore = homeScore;
      awayHalftimeScore = awayScore;
    }
  }
  let homeMaxQuarterPoints = 0;
  let awayMaxQuarterPoints = 0;
  for (let period = 1; period <= 4; period += 1) {
    const start = quarterStarts.get(period) ?? { home: 0, away: 0 };
    const end = quarterMax.get(period) ?? { home: 0, away: 0 };
    homeMaxQuarterPoints = Math.max(homeMaxQuarterPoints, Math.max(0, end.home - start.home));
    awayMaxQuarterPoints = Math.max(awayMaxQuarterPoints, Math.max(0, end.away - start.away));
  }
  return { firstScoringTeam, homeHalftimeScore, awayHalftimeScore, homeMaxQuarterPoints, awayMaxQuarterPoints };
}

function newFamilyTally() {
  return { hit: 0, miss: 0, void: 0, pending: 0 };
}

async function validateLeague(label, prefix, { days, limit }, evaluateResolver, buildNBAGamePlayerStatsSnapshot, pickBestMatchingBallDontLieGame) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startDate = new Date(now - days * dayMs).toISOString().slice(0, 10);
  const endDate = new Date(now).toISOString().slice(0, 10);
  const gamesQuery = new URLSearchParams({ per_page: "100", start_date: startDate, end_date: endDate });
  const allGames = await fetchAll(`${prefix}/games`, gamesQuery);

  const finals = allGames.filter((g) => String(g.status_state ?? "").toLowerCase() === "final").slice(0, limit);
  console.log(`\n[validate:${label}] ${finals.length} completed games (last ${days} days, capped at ${limit})`);

  let matched = 0;
  let scoreReconciled = 0;
  let finalizedCount = 0;
  let teamSideLines = 0;
  let totalLines = 0;
  let playWalkPopulated = 0;
  const familyTally = {};
  const suppressedFamilyObserved = {};
  const failures = [];
  const mascotOnlyGames = [];

  for (const game of finals) {
    const homeTeam = game.home_team?.full_name || game.home_team?.name || "";
    const awayTeam = game.visitor_team?.full_name || game.visitor_team?.name || "";
    if ((game.home_team?.city ?? "") === "" || (game.visitor_team?.city ?? "") === "") {
      mascotOnlyGames.push(`${game.id}: "${homeTeam}" / "${awayTeam}"`);
    }
    const card = {
      game_id: String(game.id),
      sport_key: label === "wnba" ? "basketball_wnba" : "basketball_nba",
      home_team: homeTeam,
      away_team: awayTeam,
      starts_at: String(game.date ?? new Date().toISOString()),
    };

    const matchedGame = pickBestMatchingBallDontLieGame(card, allGames);
    if (matchedGame && matchedGame.id === game.id) {
      matched += 1;
    } else {
      failures.push(`match miss game ${game.id}: matcher returned ${matchedGame?.id ?? "null"}`);
      continue;
    }

    const statsPath = label === "wnba" ? "player_stats" : "stats";
    const statsQuery = new URLSearchParams({ per_page: "100" });
    statsQuery.append("game_ids[]", String(game.id));
    const stats = await fetchAll(`${prefix}/${statsPath}`, statsQuery, 4);

    const playsQuery = new URLSearchParams({ per_page: "100", game_id: String(game.id) });
    const plays = await fetchAll(`${prefix}/plays`, playsQuery, 4);
    const extras = walkPlays(plays, card);
    if (extras.firstScoringTeam !== null && extras.homeHalftimeScore !== null && (extras.homeMaxQuarterPoints > 0 || extras.awayMaxQuarterPoints > 0)) {
      playWalkPopulated += 1;
    } else {
      failures.push(`play-walk underfilled game ${game.id}: ${JSON.stringify(extras)}`);
    }

    const snapshot = buildNBAGamePlayerStatsSnapshot(card, matchedGame, stats, extras);

    const rawHome = Number(game.home_team_score ?? game.home_score);
    const rawAway = Number(game.visitor_team_score ?? game.away_score);
    if (Number.isFinite(rawHome) && Number.isFinite(rawAway) && snapshot.homeScore === rawHome && snapshot.awayScore === rawAway) {
      scoreReconciled += 1;
    } else {
      failures.push(`score mismatch game ${game.id}: snapshot ${snapshot.homeScore}-${snapshot.awayScore} vs feed ${rawHome}-${rawAway}`);
    }

    if (snapshot.finalized) finalizedCount += 1;
    else failures.push(`not finalized: game ${game.id}`);

    totalLines += snapshot.lines.length;
    teamSideLines += snapshot.lines.filter((line) => line.teamSide !== null).length;

    const scoreSnapshot = {
      gameId: card.game_id,
      sportKey: card.sport_key,
      homeTeam,
      awayTeam,
      homeScore: snapshot.homeScore,
      awayScore: snapshot.awayScore,
      completed: true,
    };

    const homeLines = snapshot.lines.filter((l) => l.teamSide === "home");
    const topScorer = [...snapshot.lines].sort((a, b) => b.pts - a.pts)[0];
    const topRebounder = [...snapshot.lines].sort((a, b) => b.reb - a.reb)[0];

    const battery = [
      { kind: "moneyline", team: "home" },
      { kind: "nba_team_scores_first", team: "home" },
      { kind: "nba_team_leads_at_halftime", team: "home" },
      { kind: "nba_team_points_in_any_quarter_at_least", team: "home", threshold: 15 },
      { kind: "nba_team_has_double_double", team: "home" },
      { kind: "nba_team_stat_at_least", team: "home", metric: "points", threshold: 60 },
      { kind: "team_triple_double", team: "home" },
      { kind: "any_triple_double" },
    ];
    if (topScorer) {
      battery.push({ kind: "nba_player_stat_at_least", player: toRef(topScorer.playerName, topScorer.playerId), metric: "points", threshold: 10 });
    }
    if (topRebounder) {
      battery.push({ kind: "nba_player_double_double", player: toRef(topRebounder.playerName, topRebounder.playerId) });
    }

    for (const resolver of battery) {
      const result = evaluateResolver(resolver, scoreSnapshot, snapshot, null, null);
      const key = resolver.kind;
      familyTally[key] = familyTally[key] ?? newFamilyTally();
      familyTally[key][result.status] += 1;
    }

    // 3d diagnostic only — not part of the pass/fail gate. These kinds are no longer generated
    // for WNBA (buildNBAAchievementCandidates), but evaluateResolver's arms are intentionally
    // untouched, so this shows what they actually do against a real, populated snapshot.
    if (label === "wnba" && homeLines[0]) {
      const ref = toRef(homeLines[0].playerName, homeLines[0].playerId);
      const suppressed = [
        { kind: "nba_player_bench_scores", player: ref, threshold: 8 },
        { kind: "nba_player_points_first_half_at_least", player: ref, threshold: 10 },
        { kind: "nba_player_assists_in_any_quarter_at_least", player: ref, threshold: 3 },
        { kind: "nba_player_steals_first_half_at_least", player: ref, threshold: 2 },
      ];
      for (const resolver of suppressed) {
        const result = evaluateResolver(resolver, scoreSnapshot, snapshot, null, null);
        suppressedFamilyObserved[resolver.kind] = suppressedFamilyObserved[resolver.kind] ?? newFamilyTally();
        suppressedFamilyObserved[resolver.kind][result.status] += 1;
      }
    }
  }

  const total = finals.length || 1;
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;

  console.log(`  match rate                : ${matched}/${finals.length} (${pct(matched)})`);
  console.log(`  score reconciliation       : ${scoreReconciled}/${finals.length} (${pct(scoreReconciled)})`);
  console.log(`  finalized rate             : ${finalizedCount}/${finals.length} (${pct(finalizedCount)})`);
  console.log(`  team-side resolution       : ${teamSideLines}/${totalLines} (${totalLines ? ((teamSideLines / totalLines) * 100).toFixed(1) : "0.0"}%)`);
  console.log(`  play-walk populated        : ${playWalkPopulated}/${finals.length} (${pct(playWalkPopulated)})`);
  if (mascotOnlyGames.length > 0) {
    console.log(`  mascot-only team names seen: ${mascotOnlyGames.join(", ")}`);
  }

  console.log(`\n  === per-family settled status (${label}) ===`);
  for (const [kind, t] of Object.entries(familyTally)) {
    console.log(`    ${kind.padEnd(38)} hit ${t.hit}  miss ${t.miss}  void ${t.void}  pending ${t.pending}`);
  }
  if (Object.keys(suppressedFamilyObserved).length > 0) {
    console.log(`\n  === suppressed-family diagnostic, WNBA only (not a pass/fail gate) ===`);
    for (const [kind, t] of Object.entries(suppressedFamilyObserved)) {
      console.log(`    ${kind.padEnd(38)} hit ${t.hit}  miss ${t.miss}  void ${t.void}  pending ${t.pending}`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n  === failures (${label}) ===`);
    for (const failure of failures.slice(0, 30)) console.log(`    ${failure}`);
    if (failures.length > 30) console.log(`    ... and ${failures.length - 30} more`);
  }

  const ok = matched === finals.length && finalizedCount === finals.length && scoreReconciled === finals.length && playWalkPopulated === finals.length;
  return { ok, gamesChecked: finals.length };
}

async function main() {
  if (!API_KEY) {
    console.error("BALLDONTLIE_API_KEY is not set. Run via `npm run bingo:validate:wnba`.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const { pickBestMatchingBallDontLieGame, buildNBAGamePlayerStatsSnapshot, evaluateResolver } = await import("../lib/sportsBingo.ts");

  const wnbaResult = await validateLeague("wnba", "/wnba/v1", args, evaluateResolver, buildNBAGamePlayerStatsSnapshot, pickBestMatchingBallDontLieGame);

  // NBA plays fix confirmation (item 2 of the plan's verification order) — same play-walk fix,
  // riding on the same games/plays fetch shape, small enough to fold into this run rather than a
  // separate throwaway script. NBA's off-season in August, so widen the window generously.
  const nbaResult = await validateLeague("nba", "/nba/v1", { days: Math.max(args.days, 200), limit: args.limit }, evaluateResolver, buildNBAGamePlayerStatsSnapshot, pickBestMatchingBallDontLieGame);

  const ok = wnbaResult.ok && nbaResult.ok && wnbaResult.gamesChecked > 0 && nbaResult.gamesChecked > 0;
  console.log(`\n${ok ? "PASS" : "FAIL"} — WNBA settlement (and the riding-along NBA plays fix) ${ok ? "match" : "disagree with"} the live feed.`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
