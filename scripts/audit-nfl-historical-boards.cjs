#!/usr/bin/env node

/**
 * Phase 1 follow-up of docs/prop-bingo-nfl-activation-plan.md — audit NFL board **composition and
 * settlement** on completed 2025 games, so we are not blind on realism while the 2026 prop markets
 * are still filling in.
 *
 * HARD LIMIT (documented in lib/sportsBingo.ts:7959): `/nfl/v1/odds/player_props` is live-only, so a
 * historical board is **core markets + special/quarter/team-stat squares only — no player props.**
 * This script therefore audits the ~16 non-prop live squares of every board: bucket mix, label
 * length, early-resolvability, out-of-band rungs, special variety — and then GRADES every square
 * against the real completed game to confirm the settlement path is clean (hit / miss / void share).
 *
 * It builds boards through the shipped generator (`buildSportsBingoBoardFromBallDontLieGame` ->
 * `generateBoardForGame`) with a retrodictive market model (prior weeks' scoring, shrunk to the
 * league mean — the same stand-in `scripts/simulate-bingo-boards.cjs` uses), so the board is the
 * one the real generator would build, minus props.
 *
 *   node --env-file=.env.local --conditions react-server --import tsx \
 *     scripts/audit-nfl-historical-boards.cjs --season 2025 --weeks 1,9,18 --boards 4 --out /tmp/hist.json
 */

const fs = require("node:fs");

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

const CORE_MIN = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MIN_PROBABILITY ?? "0.18");
const CORE_MAX = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MAX_PROBABILITY ?? "0.82");

// Non-prop target mix: the 2/3/3/2/6 core+special slate, with the 8 prop slots removed.
const TARGET_MIX_NO_PROP = { moneyline: 2, spread: 3, total: 3, "team-total": 2, special: 6 };

const NFL_LEAGUE_AVG_TEAM_POINTS = 22.5;
const NFL_SHRINKAGE_GAMES = 3;
const NFL_HOME_FIELD_POINTS = 1.5;

function parseArgs(argv) {
  const args = { season: 2025, weeks: [1, 9, 18], boards: 4, maxGames: 6, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === "--season") args.season = Number.parseInt(argv[++i], 10) || args.season;
    else if (f === "--weeks") args.weeks = String(argv[++i] ?? "").split(",").map((s) => Number.parseInt(s, 10)).filter(Number.isFinite);
    else if (f === "--boards") args.boards = Number.parseInt(argv[++i], 10) || args.boards;
    else if (f === "--max-games") args.maxGames = Number.parseInt(argv[++i], 10) || args.maxGames;
    else if (f === "--out") args.out = argv[++i];
  }
  return args;
}

async function fetchAll(path, params, maxPages = 8) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const q = new URLSearchParams(params);
    if (cursor != null) q.set("cursor", String(cursor));
    const res = await fetch(`${BASE_URL}${path}?${q}`, { headers: API_KEY ? { Authorization: API_KEY } : {} });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    const body = await res.json();
    out.push(...(body.data ?? []));
    cursor = body.meta?.next_cursor ?? null;
    if (cursor == null) break;
  }
  return out;
}

function buildNFLPowerRatings(priorGames) {
  const scored = new Map();
  const allowed = new Map();
  const played = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  for (const g of priorGames) {
    const h = g.home_team?.id;
    const a = g.visitor_team?.id;
    const hs = Number(g.home_team_score);
    const as = Number(g.visitor_team_score);
    if (!h || !a || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
    add(scored, h, hs); add(allowed, h, as); add(played, h, 1);
    add(scored, a, as); add(allowed, a, hs); add(played, a, 1);
  }
  const shrink = (t, c) => (t + NFL_SHRINKAGE_GAMES * NFL_LEAGUE_AVG_TEAM_POINTS) / (c + NFL_SHRINKAGE_GAMES);
  return {
    scoredAvg: (id) => shrink(scored.get(id) ?? 0, played.get(id) ?? 0),
    allowedAvg: (id) => shrink(allowed.get(id) ?? 0, played.get(id) ?? 0),
  };
}

function nflRetrodictiveConsensus(game, ratings) {
  const h = game.home_team?.id;
  const a = game.visitor_team?.id;
  if (!h || !a) return null;
  const homeExpected = (ratings.scoredAvg(h) + ratings.allowedAvg(a)) / 2 + NFL_HOME_FIELD_POINTS / 2;
  const awayExpected = (ratings.scoredAvg(a) + ratings.allowedAvg(h)) / 2 - NFL_HOME_FIELD_POINTS / 2;
  return { homeSpread: -(homeExpected - awayExpected), total: homeExpected + awayExpected, homeWinProb: null, vendorCount: 0 };
}

function bucketFromKey(key) {
  const prefix = String(key).split(":")[0];
  if (["moneyline", "spread", "total", "team-total", "player-prop", "special", "achievement"].includes(prefix)) return prefix;
  return "special"; // NFL flavor squares are namespaced variously; treat unknown as special for the mix count
}

function canResolveEarly(key, label) {
  const k = `${key} ${label}`.toLowerCase();
  if (/first touchdown|first td|scores first|first score|1q|2q|3q|first quarter|second quarter|third quarter|halftime|1st half|first half|leads at halftime|by halftime|first field goal/.test(k)) return true;
  if (/every quarter|quarter ends with neither|scoreless quarter|shutout quarter|non-quarterback throws|safety is scored|defensive touchdown/.test(k)) return "mid";
  return false;
}

const PLAY_DERIVED_KINDS = new Set([
  "nfl_player_first_td", "nfl_first_score_is_field_goal", "nfl_first_scorer_wins", "nfl_non_offensive_touchdown",
  "nfl_fourth_down_conversion", "nfl_long_touchdown", "nfl_non_quarterback_pass_attempt", "nfl_first_score_within_minutes",
  "nfl_score_in_final_minutes", "nfl_non_quarterback_pass_attempt",
]);
const TEAM_STATS_KINDS = new Set([
  "nfl_team_stat_at_least", "nfl_team_stat_at_most", "nfl_combined_team_stat_at_least", "nfl_combined_team_stat_at_most",
  "nfl_team_perfect_red_zone", "nfl_team_red_zone_trip_without_touchdown", "nfl_team_possession_advantage",
  "nfl_game_max_stat_at_least", "nfl_game_total_stat_at_least", "nfl_game_missed_field_goal",
]);

function tally(arr) { const o = {}; for (const v of arr) o[v] = (o[v] ?? 0) + 1; return o; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sportsBingo = await import("../lib/sportsBingo.ts");
  const sportsBingoOdds = await import("../lib/sportsBingoOdds.ts");

  const seasonGames = await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": String(args.season) });

  const report = {
    ranAtUtc: new Date().toISOString(),
    season: args.season,
    weeks: args.weeks,
    note: "Historical boards have NO player-prop squares (feed is live-only). This audits the ~16 non-prop live squares + settlement.",
    coreBand: [CORE_MIN, CORE_MAX],
    targetMixNoProp: TARGET_MIX_NO_PROP,
    games: [],
    aggregate: null,
  };

  const allProbs = [], allLabelLens = [], allMixes = [], gradeTotals = { hit: 0, miss: 0, void: 0, pending: 0 };
  const earlyPerBoard = [];

  for (const week of args.weeks) {
    const priorGames = seasonGames.filter((g) => Number.isFinite(Number(g.week)) && Number(g.week) < week);
    const ratings = buildNFLPowerRatings(priorGames);
    const games = seasonGames.filter((g) => Number(g.week) === week && /final/i.test(String(g.status ?? ""))).slice(0, args.maxGames);

    for (const game of games) {
      const consensus = nflRetrodictiveConsensus(game, ratings);
      if (!consensus) continue;
      const marketModel = sportsBingoOdds.buildNFLMarketModel(consensus);
      const homeTeam = game.home_team?.full_name ?? "";
      const awayTeam = game.visitor_team?.full_name ?? "";

      const gEntry = { week, gameId: String(game.id), matchup: `${awayTeam} @ ${homeTeam}`, finalScore: `${game.visitor_team_score}-${game.home_team_score}`, boards: [] };

      for (let trial = 0; trial < args.boards; trial += 1) {
        let board;
        try {
          board = sportsBingo.buildSportsBingoBoardFromBallDontLieGame({ sportKey: "americanfootball_nfl", row: game, marketModel });
        } catch (e) {
          gEntry.boards.push({ trial, error: e instanceof Error ? e.message : String(e) });
          continue;
        }
        if (!board) { gEntry.boards.push({ trial, error: "null board (candidate pool < 24)" }); continue; }

        const live = board.squares.filter((s) => !s.isFree);
        const enriched = live.map((s) => ({
          key: s.key, label: s.label, labelLen: s.label.length,
          probability: Number(s.probability.toFixed(4)),
          bucket: bucketFromKey(s.key),
          resolverKind: s.resolver?.kind ?? null,
          early: canResolveEarly(s.key, s.label),
        }));
        const mix = tally(enriched.map((s) => s.bucket));
        allMixes.push(mix);
        for (const s of enriched) { allProbs.push(s.probability); allLabelLens.push(s.labelLen); }

        // Settlement sanity: grade every live square against the real completed game.
        const needsPlays = live.some((s) => PLAY_DERIVED_KINDS.has(s.resolver?.kind));
        const needsTeamStats = live.some((s) => TEAM_STATS_KINDS.has(s.resolver?.kind));
        const statRows = await fetchAll("/nfl/v1/stats", { per_page: "100", "game_ids[]": String(game.id) });
        const plays = needsPlays ? await fetchAll("/nfl/v1/plays", { per_page: "100", game_id: String(game.id) }, 4) : [];
        const teamStatRows = needsTeamStats ? await fetchAll("/nfl/v1/team_stats", { per_page: "100", "game_ids[]": String(game.id) }) : [];
        const graded = sportsBingo.gradeResolversAgainstCompletedNFLGame({
          game, homeTeam, awayTeam, statRows, plays, teamStatRows,
          resolvers: live.map((s) => s.resolver),
        });
        const gradeTally = tally(graded.map((g) => g.status));
        for (const k of Object.keys(gradeTotals)) gradeTotals[k] += gradeTally[k] ?? 0;

        const oob = enriched.filter((s) => s.probability < CORE_MIN || s.probability > CORE_MAX);
        const sortedLen = [...enriched].sort((a, b) => b.labelLen - a.labelLen);
        const early = enriched.filter((s) => s.early === true).length;
        const mid = enriched.filter((s) => s.early === "mid").length;
        earlyPerBoard.push(`${early}/${mid}`);

        gEntry.boards.push({
          trial,
          boardProbability: Number(board.boardProbability.toFixed(4)),
          liveCount: live.length,
          bucketMix: mix,
          specialResolverVariety: [...new Set(enriched.filter((s) => s.bucket === "special").map((s) => s.resolverKind))].length,
          outOfBand: oob.map((s) => ({ label: s.label, p: s.probability })),
          labelMax: sortedLen[0]?.labelLen ?? 0,
          longestLabels: sortedLen.slice(0, 6).map((s) => `[${s.labelLen}] ${s.label}`),
          earlyResolvable: { definite: early, mid },
          gradeTally,
          squares: enriched,
        });
      }
      report.games.push(gEntry);
    }
  }

  const nBoards = allMixes.length;
  const sum = (o, k) => allMixes.reduce((a, m) => a + (m[k] ?? 0), 0);
  report.aggregate = {
    boards: nBoards,
    avgBucketMix: Object.fromEntries(
      [...new Set(allMixes.flatMap((m) => Object.keys(m)))].map((k) => [k, Number((sum(allMixes, k) / nBoards).toFixed(2))])
    ),
    boardProbability: {
      min: Math.min(...report.games.flatMap((g) => g.boards.filter((b) => !b.error).map((b) => b.boardProbability))),
      max: Math.max(...report.games.flatMap((g) => g.boards.filter((b) => !b.error).map((b) => b.boardProbability))),
    },
    squareProbabilityRange: [Math.min(...allProbs), Math.max(...allProbs)],
    labelLength: {
      max: Math.max(...allLabelLens),
      p90: allLabelLens.sort((a, b) => a - b)[Math.floor(allLabelLens.length * 0.9)],
      median: allLabelLens[Math.floor(allLabelLens.length / 2)],
    },
    earlyResolvablePerBoard: earlyPerBoard,
    settlement: {
      ...gradeTotals,
      voidShare: Number((gradeTotals.void / (gradeTotals.hit + gradeTotals.miss + gradeTotals.void + gradeTotals.pending)).toFixed(4)),
      pendingShare: Number((gradeTotals.pending / (gradeTotals.hit + gradeTotals.miss + gradeTotals.void + gradeTotals.pending)).toFixed(4)),
    },
  };

  const json = JSON.stringify(report, null, 2);
  if (args.out) { fs.writeFileSync(args.out, json); console.error(`wrote ${args.out}`); }
  else console.log(json);
}

main().catch((e) => { console.error(e); process.exit(1); });
