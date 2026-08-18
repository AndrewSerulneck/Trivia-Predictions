#!/usr/bin/env node

/**
 * Phase 8c of docs/prop-bingo-nfl-plan.md — the measurement behind the recalibrated Phase 2
 * quarter/halftime constants in `lib/sportsBingoOdds.ts`.
 *
 * Phase 8b measured every *flavor* square off a curve and shipped thresholds read from it. The
 * squares Phase 2 built — "scores in every quarter", "held scoreless in a quarter", "14+ in a
 * quarter", "any quarter ends 0-0" — were never measured at all: they come out of a normal
 * approximation with hand-set dependence fudges. The Phase 8c calibration replay
 * (`npm run bingo:calibrate:nfl`) found them to be the four worst-priced families on an NFL board,
 * the largest by a wide margin being "14+ in a quarter" at a modelled 0.189 against a realized
 * 0.371. This script is where the replacement numbers come from.
 *
 * ## The one methodological point that matters
 *
 * Every rate here is bucketed by a **pre-game implied team total**, not by the team's realized
 * score. Bucketing on the realized score is the obvious thing to do and it is the wrong function:
 * the realized score is the outcome being predicted, and it ranges over ground the model's input
 * never occupies. The `realized_basis_contrast` block at the bottom of the output shows it — 2025
 * team scores span 9.6 to 33.3 points per bucket where implied totals span 18.8 to 25.4, so
 * "14+ in a quarter" runs 0.000 to 0.758 on the realized basis against 0.216 to 0.510 on the
 * implied one. Fitting the first and pricing with the second extrapolates a curve far outside its
 * support, in the direction that makes favorites look like sure things.
 *
 * The implied total is rebuilt exactly the way `scripts/simulate-bingo-boards.cjs` builds its
 * retrodictive market — shrunk prior-weeks scoring, no knowledge of the game itself — so a slope
 * fitted here is one the shipped model can actually act on. Weeks 1-4 are dropped because the
 * power ratings have no signal yet.
 *
 * Usage:
 *   npm run bingo:measure:nfl-quarters
 *   npm run bingo:measure:nfl-quarters -- --season 2025 > docs/phase0-artifacts/phase8c-nfl-quarter-rates-2026-08-17.json
 *
 * Costs ~3 calls for the quarter work (every quarter score is on `/nfl/v1/games`) plus one
 * `/nfl/v1/team_stats` call per game for the fourth-down number, which is skippable with
 * `--no-team-stats`.
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

/** Mirrors scripts/simulate-bingo-boards.cjs — the same retrodictive market, for the same reason. */
const NFL_LEAGUE_AVG_TEAM_POINTS = 22.5;
const NFL_SHRINKAGE_GAMES = 3;
const NFL_HOME_FIELD_POINTS = 1.5;
/** Where the fitted intercepts are reported, and the anchor `NFL_QUARTER_POINTS_MEASURED` uses. */
const ANCHOR_TEAM_TOTAL = 23;
/** Power ratings need a few weeks before an implied total means anything. */
const FIRST_RATED_WEEK = 5;

function parseArgs(argv) {
  const args = { season: "2025", teamStats: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--season") {
      args.season = String(argv[i + 1] ?? "2025");
      i += 1;
    } else if (argv[i] === "--no-team-stats") {
      args.teamStats = false;
    }
  }
  return args;
}

async function fetchAll(path, params) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 12; page += 1) {
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

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

function buildPowerRatings(priorGames) {
  const scored = new Map();
  const allowed = new Map();
  const played = new Map();
  const add = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
  for (const game of priorGames) {
    const homeId = game.home_team?.id;
    const awayId = game.visitor_team?.id;
    const homeScore = num(game.home_team_score);
    const awayScore = num(game.visitor_team_score);
    if (!homeId || !awayId || homeScore === null || awayScore === null) continue;
    add(scored, homeId, homeScore); add(allowed, homeId, awayScore); add(played, homeId, 1);
    add(scored, awayId, awayScore); add(allowed, awayId, homeScore); add(played, awayId, 1);
  }
  const shrink = (total, count) =>
    (total + NFL_SHRINKAGE_GAMES * NFL_LEAGUE_AVG_TEAM_POINTS) / (count + NFL_SHRINKAGE_GAMES);
  return {
    scoredAvg: (id) => shrink(scored.get(id) ?? 0, played.get(id) ?? 0),
    allowedAvg: (id) => shrink(allowed.get(id) ?? 0, played.get(id) ?? 0),
  };
}

/** Weighted least squares, reported at ANCHOR_TEAM_TOTAL so the output drops straight into a constant. */
function fitAtAnchor(points) {
  const n = points.reduce((sum, p) => sum + p.n, 0);
  if (n === 0) return null;
  const meanX = points.reduce((sum, p) => sum + p.n * p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.n * p.y, 0) / n;
  const sxy = points.reduce((sum, p) => sum + p.n * (p.x - meanX) * (p.y - meanY), 0);
  const sxx = points.reduce((sum, p) => sum + p.n * (p.x - meanX) ** 2, 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return {
    rateAtAnchor: Number((meanY + slope * (ANCHOR_TEAM_TOTAL - meanX)).toFixed(4)),
    slopePerImpliedPoint: Number(slope.toFixed(4)),
    leagueRate: Number(meanY.toFixed(4)),
    n,
  };
}

function bucketize(rows, buckets, predicate) {
  return buckets.map(([low, high]) => {
    const selected = rows.filter((row) => row.x >= low && row.x < high);
    const hits = selected.filter(predicate).length;
    return {
      impliedBucket: `${low}-${high}`,
      meanImplied: selected.length ? Number((selected.reduce((s, r) => s + r.x, 0) / selected.length).toFixed(2)) : null,
      n: selected.length,
      rate: selected.length ? Number((hits / selected.length).toFixed(4)) : null,
    };
  });
}

/** A bucketed table plus the weighted fit through it — the shape every square below reports in. */
function measure(rows, buckets, predicate) {
  const table = bucketize(rows, buckets, predicate);
  const fit = fitAtAnchor(
    table.filter((b) => b.n > 0).map((b) => ({ x: b.meanImplied, y: b.rate, n: b.n }))
  );
  return { fit, byImplied: table };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!API_KEY) throw new Error("BALLDONTLIE_API_KEY is required.");

  const games = (await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": args.season })).filter(
    (game) => /final/i.test(String(game.status ?? "")) && !game.postseason
  );

  /** One row per team-game (`x` = implied team total) and one per game (`x` = implied game total). */
  const teamRows = [];
  const gameRows = [];
  /** Every completed game, implied total or not — the flat league rates below want the full season. */
  const allGameRows = [];
  let skippedForMissingQuarters = 0;

  for (const game of games) {
    const home = [1, 2, 3, 4].map((q) => num(game[`home_team_q${q}`]));
    const away = [1, 2, 3, 4].map((q) => num(game[`visitor_team_q${q}`]));
    if (home.some((v) => v === null) || away.some((v) => v === null)) {
      skippedForMissingQuarters += 1;
      continue;
    }
    const row = {
      home,
      away,
      homeOt: num(game.home_team_ot) ?? 0,
      awayOt: num(game.visitor_team_ot) ?? 0,
      homeFinal: num(game.home_team_score),
      awayFinal: num(game.visitor_team_score),
    };
    allGameRows.push(row);

    const week = num(game.week);
    if (week === null || week < FIRST_RATED_WEEK) continue;
    const ratings = buildPowerRatings(games.filter((prior) => num(prior.week) !== null && num(prior.week) < week));
    const homeId = game.home_team?.id;
    const awayId = game.visitor_team?.id;
    if (!homeId || !awayId) continue;
    const impliedHome = (ratings.scoredAvg(homeId) + ratings.allowedAvg(awayId)) / 2 + NFL_HOME_FIELD_POINTS / 2;
    const impliedAway = (ratings.scoredAvg(awayId) + ratings.allowedAvg(homeId)) / 2 - NFL_HOME_FIELD_POINTS / 2;
    teamRows.push({ x: impliedHome, quarters: home });
    teamRows.push({ x: impliedAway, quarters: away });
    gameRows.push({ ...row, x: impliedHome + impliedAway });
  }

  const teamBuckets = [[0, 20], [20, 22], [22, 24], [24, 99]];
  const gameBuckets = [[0, 42], [42, 46], [46, 50], [50, 99]];

  // The primitive `quarterScoreRate()` models: one row per team-quarter.
  const quarterRows = teamRows.flatMap((team) => team.quarters.map((points) => ({ x: team.x, points })));

  const flat = (rows, predicate) => ({
    n: rows.length,
    rate: rows.length ? Number((rows.filter(predicate).length / rows.length).toFixed(4)) : null,
  });

  const payload = {
    season: Number(args.season),
    ranAtUtc: new Date().toISOString(),
    scope: `regular season; implied-total tables use weeks ${FIRST_RATED_WEEK}+ only`,
    anchorTeamTotal: ANCHOR_TEAM_TOTAL,
    games: allGameRows.length,
    ratedGames: gameRows.length,
    ratedTeamGames: teamRows.length,
    skippedForMissingQuarters,
    meanImpliedTeamTotal: teamRows.length
      ? Number((teamRows.reduce((s, r) => s + r.x, 0) / teamRows.length).toFixed(2))
      : null,

    /** Feeds NFL_QUARTER_SCORE_BASE / NFL_QUARTER_SCORE_SLOPE. */
    per_team_quarter_scores: measure(quarterRows, teamBuckets, (row) => row.points > 0),

    /** Feeds NFL_EVERY_QUARTER_DEPENDENCE_BOOST, via the ratio to p^4 below. */
    scores_every_quarter: measure(teamRows, teamBuckets, (row) => row.quarters.every((v) => v > 0)),
    /** The exact complement, and the square the board actually shows more often. */
    shutout_in_a_quarter: flat(teamRows, (row) => row.quarters.some((v) => v === 0)),

    /** Feeds NFL_QUARTER_POINTS_MEASURED. Only 14 is emitted today; the rest are for future rungs. */
    quarter_points: Object.fromEntries(
      [7, 10, 14, 17, 21].map((threshold) => [
        `gte_${threshold}`,
        measure(teamRows, teamBuckets, (row) => row.quarters.some((v) => v >= threshold)),
      ])
    ),

    /** Feeds NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS. Bucketed on the implied *game* total. */
    any_quarter_scoreless: {
      league: flat(allGameRows, (row) => [0, 1, 2, 3].some((i) => row.home[i] === 0 && row.away[i] === 0)),
      byImpliedGameTotal: bucketize(gameRows, gameBuckets, (row) =>
        [0, 1, 2, 3].some((i) => row.home[i] === 0 && row.away[i] === 0)
      ),
    },

    /**
     * Feeds NFL_SECOND_HALF_HIGHER_BASE. Regulation halves only, matching the grader; an exact tie
     * is a miss, which is most of why this sits below a coin flip.
     */
    second_half_higher_scoring: {
      excludingOvertime: flat(
        allGameRows,
        (row) =>
          row.home[2] + row.home[3] + row.away[2] + row.away[3] > row.home[0] + row.home[1] + row.away[0] + row.away[1]
      ),
      exactTies: flat(
        allGameRows,
        (row) =>
          row.home[2] + row.home[3] + row.away[2] + row.away[3] === row.home[0] + row.home[1] + row.away[0] + row.away[1]
      ),
      overtimeGames: allGameRows.filter((row) => row.homeOt > 0 || row.awayOt > 0).length,
    },

    /** Sanity checks on constants Phase 8c measured and deliberately left alone. */
    unchanged_but_measured: {
      /** One row per team-game: a halftime tie is a miss for both sides, as the square grades it. */
      leads_at_halftime: (() => {
        let leads = 0;
        for (const row of allGameRows) {
          const homeHalf = row.home[0] + row.home[1];
          const awayHalf = row.away[0] + row.away[1];
          if (homeHalf > awayHalf) leads += 1;
          if (awayHalf > homeHalf) leads += 1;
        }
        const n = allGameRows.length * 2;
        return { n, rate: n ? Number((leads / n).toFixed(4)) : null };
      })(),
      halftime_leader_loses_or_draws: flat(allGameRows, (row) => {
        const homeHalf = row.home[0] + row.home[1];
        const awayHalf = row.away[0] + row.away[1];
        if (homeHalf === awayHalf) return false;
        const leaderWon = homeHalf > awayHalf ? row.homeFinal > row.awayFinal : row.awayFinal > row.homeFinal;
        return !leaderWon;
      }),
      halftime_tie: flat(allGameRows, (row) => row.home[0] + row.home[1] === row.away[0] + row.away[1]),
      overtime: flat(allGameRows, (row) => row.homeOt > 0 || row.awayOt > 0),
    },
  };

  /**
   * Feeds NFL_FOURTH_DOWN_CONVERSION_BASE. Measured off `team_stats`, which is an independently
   * published number rather than the plays walk the square actually grades from — the same
   * cross-check discipline Phase 8b used for the (failed) Tier 4 gate.
   */
  if (args.teamStats) {
    let eitherConverted = 0;
    let gamesWithRows = 0;
    let teamsConverted = 0;
    let teamStatRows = 0;
    for (const game of games) {
      const rows = await fetchAll("/nfl/v1/team_stats", { per_page: "100", "game_ids[]": String(game.id) });
      if (rows.length < 2) continue;
      gamesWithRows += 1;
      const conversions = rows.map((row) => num(row.fourth_down_conversions) ?? 0);
      teamStatRows += conversions.length;
      teamsConverted += conversions.filter((count) => count >= 1).length;
      if (conversions.some((count) => count >= 1)) eitherConverted += 1;
    }
    payload.fourth_down_conversion = {
      games: gamesWithRows,
      eitherTeamConvertsAtLeastOne: gamesWithRows ? Number((eitherConverted / gamesWithRows).toFixed(4)) : null,
      perTeamGame: teamStatRows ? Number((teamsConverted / teamStatRows).toFixed(4)) : null,
      teamStatRows,
    };
  }

  /**
   * The contrast case: the same squares bucketed on the REALIZED team total. Kept in the output on
   * purpose — its slopes run roughly double the implied-basis ones, and that gap is the whole
   * reason the constants above are fitted the other way.
   */
  const realizedRows = allGameRows.flatMap((row) => [
    { x: row.homeFinal, quarters: row.home },
    { x: row.awayFinal, quarters: row.away },
  ]);
  payload.realized_basis_contrast = {
    note:
      "Bucketed on the realized team score, which is the outcome being predicted and which ranges " +
      "well outside where implied totals live. Do NOT fit constants off this — compare bucket " +
      "endpoints against the implied-basis tables above to see the difference.",
    scores_every_quarter: measure(realizedRows, [[0, 16], [16, 21], [21, 27], [27, 99]], (row) =>
      row.quarters.every((v) => v > 0)
    ),
    quarter_points_gte_14: measure(realizedRows, [[0, 16], [16, 21], [21, 27], [27, 99]], (row) =>
      row.quarters.some((v) => v >= 14)
    ),
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
