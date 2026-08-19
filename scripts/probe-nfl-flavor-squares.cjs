#!/usr/bin/env node

/**
 * Phase 8a of docs/prop-bingo-nfl-plan.md — probe and measure before designing a single flavor
 * square.
 *
 * Answers the five unknowns the plan lists (team_stats mid-game population, sacks orientation,
 * red_zone_scores semantics, whether /nfl/v1/stats carries defensive rows, and whether
 * home_win_probability is populated) against the live API, then measures a realized base rate for
 * every Tier 1/2/3 candidate square over a full completed season plus the archived postseason.
 *
 * Usage (same convention as scripts/measure-mlb-event-rates.cjs):
 *   npm run bingo:probe:nfl-flavor
 *   npm run bingo:probe:nfl-flavor -- --season 2025 --json > docs/phase0-artifacts/phase8a-nfl-flavor-squares-2026-08-17.json
 *
 * Phase 8b added three things to it, all opt-in so an 8a re-run still reproduces 8a's numbers:
 *   --sweep          a measured rate curve per field instead of one hand-picked threshold. 8a
 *                    measured `penalties >= 3` at 0.941 and could only *guess* that ">=7 or so"
 *                    would be a coin flip; the sweep removes the guess, which is the whole reason
 *                    the plan forbids hand-picking a second unvalidated number.
 *   --tier4          reconstructs drives (maximal run of plays sharing a possessing team) and
 *                    reconciles the count against the independently-published
 *                    `team_stats.total_drives`. This is the plan's own ≥98% ship gate for Tier 4.
 *   --tier3-sample N already existed; 8b ran it at the full 272 to lock Tier-3 thresholds.
 *
 *   npm run bingo:probe:nfl-flavor -- --season 2025 --sweep --tier4 --tier3-sample 272 --json
 *
 * Phase E of docs/prop-bingo-out-of-scope-followup-plan.md added one more, also opt-in:
 *   --tier3-only     skip the /nfl/v1/team_stats and /nfl/v1/stats fetches (Tier 1/2/4 only) and
 *                    walk plays alone. Re-measuring a Tier-3 base rate over the full 272-game
 *                    season otherwise pays ~450 requests that cannot affect the answer.
 *
 *   npm run bingo:probe:nfl-flavor -- --season 2025 --tier3-only --tier3-sample 272 --json
 *
 * It also stopped mirroring the shipped safety/two-point attribution and started importing it —
 * see `tabulateTier3`. That is why this script now runs under `--import tsx`.
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

function parseArgs(argv) {
  const args = { season: "2025", json: false, tier3Sample: 100, plays: true, sweep: false, tier4: false, tier3Only: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--season") {
      args.season = String(argv[i + 1] ?? "2025");
      i += 1;
    } else if (argv[i] === "--json") {
      args.json = true;
    } else if (argv[i] === "--tier3-sample") {
      args.tier3Sample = Number(argv[i + 1] ?? 100);
      i += 1;
    } else if (argv[i] === "--no-plays") {
      args.plays = false;
    } else if (argv[i] === "--sweep") {
      args.sweep = true;
    } else if (argv[i] === "--tier4") {
      args.tier4 = true;
    } else if (argv[i] === "--tier3-only") {
      // Phase E: re-measuring a Tier-3 base rate needs the plays walk and nothing else. The
      // /nfl/v1/stats and /nfl/v1/team_stats fetches are ~450 requests that feed Tier 1/2/4 only,
      // and skipping them cannot move a Tier-3 number: the game list (and therefore the Tier-3
      // stride sample) is built from /nfl/v1/games alone. Tier 1/2/4 report `null` in this mode.
      args.tier3Only = true;
      args.tier4 = false;
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request, with a bounded backoff on 429. The full-season Tier-3/Tier-4 pass issues ~1,100
 * `/nfl/v1/plays` calls in a row, which 8a's 90-game run never came close to — a single throttled
 * response silently truncating a game's plays would corrupt a base rate rather than fail loudly.
 */
async function fetchJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: API_KEY } });
    if (response.status !== 429) {
      return response;
    }
    await sleep(1000 * 2 ** attempt);
  }
  return fetch(url, { headers: { Authorization: API_KEY } });
}

async function fetchAll(path, params, maxPages = 40) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetchJson(`${BASE_URL}${path}?${query}`);
    if (!response.ok) {
      console.error(`[probe] ${path} -> ${response.status} ${await response.text().catch(() => "")}`);
      return rows;
    }
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") {
      return rows;
    }
    cursor = payload.meta.next_cursor;
  }
  console.error(`[probe] truncated at ${maxPages} pages: ${path}`);
  return rows;
}

async function fetchPlays(gameId) {
  // Cursor-based, exactly like every other balldontlie list endpoint (lib/sportsBingo.ts's own
  // /nfl/v1/plays call uses the same `cursor`/`next_cursor` pair) — NOT `page`/`next_page`, which
  // this endpoint does not return, so a page-based loop silently stops after page 1 every time.
  const rows = [];
  let cursor = null;
  for (let i = 0; i < 4; i += 1) {
    const query = new URLSearchParams({ per_page: "100", game_id: String(gameId) });
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetchJson(`${BASE_URL}/nfl/v1/plays?${query}`);
    if (!response.ok) return rows;
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") break;
    cursor = payload.meta.next_cursor;
  }
  return rows;
}

function isFinal(game) {
  return String(game.status ?? "").toLowerCase().startsWith("final");
}

async function fetchSeason(season) {
  const regular = [];
  for (let week = 1; week <= 18; week += 1) {
    regular.push(...(await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": season, "weeks[]": String(week), postseason: "false" })));
  }
  const postseason = await fetchAll("/nfl/v1/games", { per_page: "100", "seasons[]": season, postseason: "true" });
  return [...regular, ...postseason].filter(isFinal);
}

async function fetchTeamStatsForGames(gameIds) {
  const rows = [];
  const CHUNK = 20;
  for (let i = 0; i < gameIds.length; i += CHUNK) {
    const chunk = gameIds.slice(i, i + CHUNK);
    const query = new URLSearchParams({ per_page: "100" });
    chunk.forEach((id) => query.append("game_ids[]", String(id)));
    rows.push(...(await fetchAll("/nfl/v1/team_stats", query, 2)));
  }
  return rows;
}

async function fetchPlayerStatsForGames(gameIds) {
  const rows = [];
  const CHUNK = 20;
  for (let i = 0; i < gameIds.length; i += CHUNK) {
    const chunk = gameIds.slice(i, i + CHUNK);
    const query = new URLSearchParams({ per_page: "100" });
    chunk.forEach((id) => query.append("game_ids[]", String(id)));
    rows.push(...(await fetchAll("/nfl/v1/stats", query, 30)));
  }
  return rows;
}

// --- Q2: sack orientation -------------------------------------------------
function checkSackOrientation(teamStatsRows, playerStatsRows) {
  const defSacksByGameTeam = new Map();
  for (const row of playerStatsRows) {
    const key = `${row.game.id}:${row.team.abbreviation}`;
    defSacksByGameTeam.set(key, (defSacksByGameTeam.get(key) ?? 0) + (row.defensive_sacks ?? 0));
  }

  let matchesOffenseTaken = 0;
  let matchesDefenseMade = 0;
  let ambiguous = 0;
  let checked = 0;
  const examples = [];

  for (const row of teamStatsRows) {
    if (row.sacks === null || row.sacks === undefined) continue;
    const gameId = row.game.id;
    const opponentAbbr = row.home_away === "home" ? row.game.visitor_team.abbreviation : row.game.home_team.abbreviation;
    const ownDefSacks = defSacksByGameTeam.get(`${gameId}:${row.team.abbreviation}`) ?? 0;
    const opponentDefSacks = defSacksByGameTeam.get(`${gameId}:${opponentAbbr}`) ?? 0;
    if (ownDefSacks === opponentDefSacks) {
      ambiguous += 1;
      continue;
    }
    checked += 1;
    if (row.sacks === opponentDefSacks) matchesOffenseTaken += 1;
    if (row.sacks === ownDefSacks) matchesDefenseMade += 1;
    if (examples.length < 5) {
      examples.push({ gameId, team: row.team.abbreviation, teamStatsSacks: row.sacks, ownDefSacks, opponentDefSacks });
    }
  }

  return { checked, ambiguous, matchesOffenseTaken, matchesDefenseMade, examples };
}

// --- Q3: red_zone_scores semantics -----------------------------------------
function checkRedZoneSemantics(teamStatsRows, playerStatsRows) {
  const tdsByGameTeam = new Map();
  for (const row of playerStatsRows) {
    const key = `${row.game.id}:${row.team.abbreviation}`;
    const tds = (row.rushing_touchdowns ?? 0) + (row.receiving_touchdowns ?? 0) + (row.kick_return_touchdowns ?? 0) + (row.punt_return_touchdowns ?? 0) + (row.interception_touchdowns ?? 0) + (row.fumbles_touchdowns ?? 0);
    tdsByGameTeam.set(key, (tdsByGameTeam.get(key) ?? 0) + tds);
  }

  let redZoneScoresNeverExceedsTotalTds = true;
  let violations = 0;
  let sawFgAttemptWithLowerScoresThanAttempts = 0;
  let checked = 0;
  const violationExamples = [];

  for (const row of teamStatsRows) {
    if (row.red_zone_scores === null || row.red_zone_scores === undefined) continue;
    checked += 1;
    const totalTds = tdsByGameTeam.get(`${row.game.id}:${row.team.abbreviation}`) ?? 0;
    if (row.red_zone_scores > totalTds) {
      redZoneScoresNeverExceedsTotalTds = false;
      violations += 1;
      if (violationExamples.length < 5) {
        violationExamples.push({ gameId: row.game.id, team: row.team.abbreviation, redZoneScores: row.red_zone_scores, totalTds });
      }
    }
    if (row.red_zone_attempts > row.red_zone_scores) sawFgAttemptWithLowerScoresThanAttempts += 1;
  }

  return { checked, redZoneScoresNeverExceedsTotalTds, violations, violationExamples, sawFgAttemptWithLowerScoresThanAttempts };
}

// --- Q4: are defensive rows populated? --------------------------------------
function checkDefensiveRows(playerStatsRows) {
  const fields = ["total_tackles", "defensive_sacks", "solo_tackles", "tackles_for_loss", "passes_defended", "defensive_interceptions", "interception_yards", "interception_touchdowns"];
  const report = {};
  for (const field of fields) {
    const nonNull = playerStatsRows.filter((r) => r[field] !== null && r[field] !== undefined);
    const nonZero = nonNull.filter((r) => r[field] > 0);
    report[field] = { nonNullRows: nonNull.length, nonZeroRows: nonZero.length, sample: nonZero.slice(0, 2).map((r) => ({ player: `${r.player.first_name} ${r.player.last_name}`, pos: r.player.position_abbreviation, value: r[field] })) };
  }
  return report;
}

// --- Q5 / Tier 3: are the plays-walk fields populated on archived games? ---
function checkPlaysFields(allPlays) {
  const total = allPlays.length;
  const hwp = allPlays.filter((p) => p.home_win_probability !== null && p.home_win_probability !== undefined);
  const clock = allPlays.filter((p) => p.clock_display);
  const yte = allPlays.filter((p) => p.start_yards_to_endzone !== null && p.start_yards_to_endzone !== undefined);
  return {
    totalPlaysSampled: total,
    home_win_probability: { populated: hwp.length, rate: total ? hwp.length / total : 0 },
    clock_display: { populated: clock.length, rate: total ? clock.length / total : 0 },
    start_yards_to_endzone: { populated: yte.length, rate: total ? yte.length / total : 0 },
    note: "These rates are measured on ARCHIVED (Final) games only. They show the fields persist in the historical record, which is necessary but not sufficient evidence they are populated mid-game live — see Q1/Q5 in the findings doc for why that needs a live probe during Week 1 2026.",
  };
}

// --- Base rate tabulation: Tier 1 (team_stats) ------------------------------
function tabulateTier1(teamStatsRows) {
  const n = (v) => (typeof v === "number" ? v : 0);
  const results = {};
  const record = (name, predicate) => {
    const applicable = teamStatsRows.filter((r) => r.red_zone_attempts !== null || name.indexOf("red_zone") === -1 ? true : true);
    const hits = teamStatsRows.filter(predicate).length;
    results[name] = { n: teamStatsRows.length, rate: teamStatsRows.length ? hits / teamStatsRows.length : 0 };
  };

  record("penalties_gte_3", (r) => n(r.penalties) >= 3);
  record("penalties_gte_5", (r) => n(r.penalties) >= 5);
  record("penalties_gte_7", (r) => n(r.penalties) >= 7);
  record("penalty_yards_gte_75", (r) => n(r.penalty_yards) >= 75);
  record("turnovers_gte_2", (r) => n(r.turnovers) >= 2);
  record("turnovers_eq_0", (r) => n(r.turnovers) === 0);
  record("third_down_conv_gte_6", (r) => n(r.third_down_conversions) >= 6);
  record("third_down_conv_gte_8", (r) => n(r.third_down_conversions) >= 8);
  record("fourth_down_conv_gte_1", (r) => n(r.fourth_down_conversions) >= 1);
  record("fourth_down_attempted", (r) => n(r.fourth_down_attempts) >= 1);
  record(
    "perfect_red_zone_3plus",
    (r) => r.red_zone_attempts !== null && r.red_zone_attempts >= 3 && r.red_zone_scores === r.red_zone_attempts,
  );
  record("settled_for_fg_in_red_zone", (r) => r.red_zone_attempts !== null && r.red_zone_scores !== null && r.red_zone_attempts > r.red_zone_scores);
  record("top_gte_2100s_35min", (r) => n(r.possession_time_seconds) >= 2100);
  record("total_yards_gte_400", (r) => n(r.total_yards) >= 400);
  record("total_yards_lt_250", (r) => r.total_yards !== null && r.total_yards < 250);
  record("yards_per_play_gte_6", (r) => n(r.yards_per_play) >= 6.0);
  record("first_downs_gte_25", (r) => n(r.first_downs) >= 25);
  record("rushing_yards_gte_150", (r) => n(r.rushing_yards) >= 150);
  record("passing_yards_gte_300", (r) => n(r.net_passing_yards) >= 300);
  record("defensive_touchdown_gte_1", (r) => n(r.defensive_touchdowns) >= 1);
  record("offensive_plays_gte_70", (r) => n(r.total_offensive_plays) >= 70);
  record("sacked_gte_4", (r) => n(r.sacks) >= 4);

  // Game-level (pairs), computed by grouping team rows by game id.
  const byGame = new Map();
  for (const row of teamStatsRows) {
    if (!byGame.has(row.game.id)) byGame.set(row.game.id, []);
    byGame.get(row.game.id).push(row);
  }
  let combinedPenaltyGte12 = 0;
  let combinedTurnoversGte3 = 0;
  let topDiffGte300 = 0;
  let neitherTeamTurnover = 0;
  let games = 0;
  for (const [, rows] of byGame) {
    if (rows.length !== 2) continue;
    games += 1;
    const [a, b] = rows;
    if (n(a.penalty_yards) + n(b.penalty_yards) >= 120) combinedPenaltyGte12 += 1;
    if (n(a.turnovers) + n(b.turnovers) >= 3) combinedTurnoversGte3 += 1;
    if (Math.abs(n(a.possession_time_seconds) - n(b.possession_time_seconds)) >= 300) topDiffGte300 += 1;
    if (n(a.turnovers) === 0 && n(b.turnovers) === 0) neitherTeamTurnover += 1;
  }
  results.combined_penalty_yards_gte_120 = { n: games, rate: games ? combinedPenaltyGte12 / games : 0 };
  results.combined_turnovers_gte_3 = { n: games, rate: games ? combinedTurnoversGte3 / games : 0 };
  results.top_advantage_gte_5min_either_team = { n: games, rate: games ? topDiffGte300 / games : 0 };
  results.neither_team_turnover_game_level = { n: games, rate: games ? neitherTeamTurnover / games : 0 };

  return results;
}

// --- Base rate tabulation: Tier 2 (player stats, game-level max) -----------
function tabulateTier2(playerStatsRows) {
  const byGame = new Map();
  for (const row of playerStatsRows) {
    if (!byGame.has(row.game.id)) byGame.set(row.game.id, []);
    byGame.get(row.game.id).push(row);
  }
  const n = (v) => (typeof v === "number" ? v : 0);
  const counters = {
    rusher_100: 0,
    receiver_100: 0,
    passer_300: 0,
    both_qbs_250: 0,
    receiver_10rec: 0,
    player_2plus_td: 0,
    fg_50plus: 0,
    kicker_3fg: 0,
    missed_fg_or_xp: 0,
    punt_inside_20: 0,
    non_qb_pass_attempt: 0,
    defender_2sacks: 0,
    defender_10tackles: 0,
    defender_int: 0,
  };
  let games = 0;
  for (const [, rows] of byGame) {
    games += 1;
    if (rows.some((r) => n(r.rushing_yards) >= 100)) counters.rusher_100 += 1;
    if (rows.some((r) => n(r.receiving_yards) >= 100)) counters.receiver_100 += 1;
    if (rows.some((r) => n(r.passing_yards) >= 300)) counters.passer_300 += 1;
    const byTeamPassing = new Map();
    for (const r of rows) {
      const key = r.team.abbreviation;
      byTeamPassing.set(key, Math.max(byTeamPassing.get(key) ?? 0, n(r.passing_yards)));
    }
    if ([...byTeamPassing.values()].filter((v) => v >= 250).length >= 2) counters.both_qbs_250 += 1;
    if (rows.some((r) => n(r.receptions) >= 10)) counters.receiver_10rec += 1;
    if (rows.some((r) => n(r.rushing_touchdowns) + n(r.receiving_touchdowns) >= 2)) counters.player_2plus_td += 1;
    if (rows.some((r) => n(r.long_field_goal_made) >= 50)) counters.fg_50plus += 1;
    if (rows.some((r) => n(r.field_goals_made) >= 3)) counters.kicker_3fg += 1;
    if (
      rows.some(
        (r) =>
          (r.field_goal_attempts !== null && r.field_goal_attempts !== undefined && n(r.field_goal_attempts) > n(r.field_goals_made)) ||
          (r.extra_points_made !== null && r.extra_points_made !== undefined && n(r.extra_points_made) < n(r.rushing_touchdowns) + n(r.receiving_touchdowns)),
      )
    ) {
      counters.missed_fg_or_xp += 1;
    }
    if (rows.some((r) => n(r.punts_inside_20) >= 1)) counters.punt_inside_20 += 1;
    if (rows.some((r) => n(r.passing_attempts) >= 1 && r.player.position_abbreviation !== "QB")) counters.non_qb_pass_attempt += 1;
    if (rows.some((r) => n(r.defensive_sacks) >= 2)) counters.defender_2sacks += 1;
    if (rows.some((r) => n(r.total_tackles) >= 10)) counters.defender_10tackles += 1;
    if (rows.some((r) => n(r.defensive_interceptions) >= 1)) counters.defender_int += 1;
  }
  const results = {};
  for (const [key, hits] of Object.entries(counters)) {
    results[key] = { n: games, rate: games ? hits / games : 0 };
  }
  return results;
}

// --- Phase 8b: threshold sweeps --------------------------------------------
//
// 8a measured one hand-picked threshold per field and, where it missed, wrote a guess into the
// findings doc ("~7", "~50 yards", "~340-350"). Those guesses are exactly the "second unvalidated
// number" the plan forbids shipping, so 8b measures the whole curve instead and reads the shipped
// threshold off it. Each entry reports every threshold's rate plus the one closest to a stated
// target feel, so the choice is auditable rather than asserted.

const FEEL_TARGETS = { "coin-flip": 0.5, "lean-lock": 0.72, "long-shot": 0.15 };

function sweepRates(rows, extractor, thresholds, comparison = "gte") {
  const points = [];
  for (const threshold of thresholds) {
    let hits = 0;
    let applicable = 0;
    for (const row of rows) {
      const value = extractor(row);
      if (value === null || value === undefined) continue;
      applicable += 1;
      if (comparison === "gte" ? value >= threshold : value <= threshold) hits += 1;
    }
    points.push({ threshold, n: applicable, rate: applicable ? hits / applicable : 0 });
  }
  const nearest = {};
  for (const [feel, target] of Object.entries(FEEL_TARGETS)) {
    let best = null;
    for (const point of points) {
      if (best === null || Math.abs(point.rate - target) < Math.abs(best.rate - target)) best = point;
    }
    nearest[feel] = best;
  }
  return { comparison, points, nearest };
}

function range(start, end, step) {
  const out = [];
  for (let value = start; value <= end + 1e-9; value += step) out.push(Number(value.toFixed(4)));
  return out;
}

function sweepTier1(teamStatsRows) {
  const num = (field) => (row) => (typeof row[field] === "number" ? row[field] : null);
  const byGame = new Map();
  for (const row of teamStatsRows) {
    if (!byGame.has(row.game.id)) byGame.set(row.game.id, []);
    byGame.get(row.game.id).push(row);
  }
  const gamePairs = [...byGame.values()].filter((rows) => rows.length === 2);
  const pairSum = (field) => (rows) => {
    const [a, b] = rows;
    if (typeof a[field] !== "number" || typeof b[field] !== "number") return null;
    return a[field] + b[field];
  };

  return {
    penalties: sweepRates(teamStatsRows, num("penalties"), range(3, 12, 1)),
    penalty_yards: sweepRates(teamStatsRows, num("penalty_yards"), range(30, 110, 5)),
    turnovers: sweepRates(teamStatsRows, num("turnovers"), range(1, 4, 1)),
    third_down_conversions: sweepRates(teamStatsRows, num("third_down_conversions"), range(3, 10, 1)),
    fourth_down_conversions: sweepRates(teamStatsRows, num("fourth_down_conversions"), range(1, 3, 1)),
    possession_time_seconds: sweepRates(teamStatsRows, num("possession_time_seconds"), range(1620, 2160, 60)),
    total_yards_at_least: sweepRates(teamStatsRows, num("total_yards"), range(250, 450, 10)),
    total_yards_at_most: sweepRates(teamStatsRows, num("total_yards"), range(220, 400, 10), "lte"),
    yards_per_play: sweepRates(teamStatsRows, num("yards_per_play"), range(4, 7, 0.1)),
    first_downs: sweepRates(teamStatsRows, num("first_downs"), range(14, 26, 1)),
    rushing_yards: sweepRates(teamStatsRows, num("rushing_yards"), range(70, 180, 5)),
    net_passing_yards: sweepRates(teamStatsRows, num("net_passing_yards"), range(140, 320, 10)),
    total_offensive_plays: sweepRates(teamStatsRows, num("total_offensive_plays"), range(55, 75, 1)),
    sacks_taken: sweepRates(teamStatsRows, num("sacks"), range(1, 6, 1)),
    red_zone_attempts: sweepRates(teamStatsRows, num("red_zone_attempts"), range(1, 6, 1)),
    red_zone_scores: sweepRates(teamStatsRows, num("red_zone_scores"), range(1, 5, 1)),
    // Game-level pairs.
    combined_penalty_yards: sweepRates(gamePairs, pairSum("penalty_yards"), range(60, 180, 5)),
    combined_turnovers: sweepRates(gamePairs, pairSum("turnovers"), range(1, 6, 1)),
    combined_penalties: sweepRates(gamePairs, pairSum("penalties"), range(8, 20, 1)),
    possession_time_gap: sweepRates(
      gamePairs,
      (rows) => {
        const [a, b] = rows;
        if (typeof a.possession_time_seconds !== "number" || typeof b.possession_time_seconds !== "number") return null;
        return Math.abs(a.possession_time_seconds - b.possession_time_seconds);
      },
      range(120, 480, 30),
    ),
    // Not a threshold curve, but the same "what does the data actually say" question: how often is
    // a red-zone trip left without a touchdown, split by how it is phrased.
    red_zone_shapes: {
      any_trip_without_td: sweepRates(
        teamStatsRows,
        (r) =>
          typeof r.red_zone_attempts === "number" && typeof r.red_zone_scores === "number"
            ? r.red_zone_attempts - r.red_zone_scores
            : null,
        range(1, 4, 1),
      ),
      perfect_red_zone_by_min_trips: range(2, 5, 1).map((minTrips) => {
        const applicable = teamStatsRows.filter((r) => typeof r.red_zone_attempts === "number");
        const hits = applicable.filter(
          (r) => r.red_zone_attempts >= minTrips && r.red_zone_scores === r.red_zone_attempts,
        ).length;
        return { minTrips, n: applicable.length, rate: applicable.length ? hits / applicable.length : 0 };
      }),
    },
  };
}

function sweepTier2(playerStatsRows) {
  const byGame = new Map();
  for (const row of playerStatsRows) {
    if (!byGame.has(row.game.id)) byGame.set(row.game.id, []);
    byGame.get(row.game.id).push(row);
  }
  const games = [...byGame.values()];
  const n = (v) => (typeof v === "number" ? v : 0);
  const gameMax = (field) => (rows) => rows.reduce((best, row) => Math.max(best, n(row[field])), 0);
  const gameSum = (field) => (rows) => rows.reduce((total, row) => total + n(row[field]), 0);

  return {
    max_rushing_yards: sweepRates(games, gameMax("rushing_yards"), range(60, 130, 5)),
    max_receiving_yards: sweepRates(games, gameMax("receiving_yards"), range(60, 130, 5)),
    max_passing_yards: sweepRates(games, gameMax("passing_yards"), range(200, 330, 10)),
    max_receptions: sweepRates(games, gameMax("receptions"), range(5, 12, 1)),
    max_player_touchdowns: sweepRates(
      games,
      (rows) => rows.reduce((best, row) => Math.max(best, n(row.rushing_touchdowns) + n(row.receiving_touchdowns)), 0),
      range(1, 4, 1),
    ),
    max_long_field_goal: sweepRates(games, gameMax("long_field_goal_made"), range(40, 58, 1)),
    max_field_goals_made: sweepRates(games, gameMax("field_goals_made"), range(2, 5, 1)),
    game_field_goals_made: sweepRates(games, gameSum("field_goals_made"), range(2, 7, 1)),
    game_punts_inside_20: sweepRates(games, gameSum("punts_inside_20"), range(1, 8, 1)),
    max_defensive_sacks: sweepRates(games, gameMax("defensive_sacks"), range(1, 4, 1)),
    game_defensive_sacks: sweepRates(games, gameSum("defensive_sacks"), range(2, 10, 1)),
    max_total_tackles: sweepRates(games, gameMax("total_tackles"), range(8, 18, 1)),
    game_interceptions: sweepRates(games, gameSum("defensive_interceptions"), range(1, 5, 1)),
    game_sacks_taken: sweepRates(games, gameSum("sacks"), range(2, 10, 1)),
    // The "both quarterbacks" shape needs a per-team max, so it is its own curve.
    both_qbs_passing_yards: sweepRates(
      games,
      (rows) => {
        const byTeam = new Map();
        for (const row of rows) {
          byTeam.set(row.team.abbreviation, Math.max(byTeam.get(row.team.abbreviation) ?? 0, n(row.passing_yards)));
        }
        const values = [...byTeam.values()].sort((a, b) => b - a);
        return values.length >= 2 ? values[1] : null;
      },
      range(150, 300, 10),
    ),
  };
}

// --- Base rate tabulation: Tier 3 (plays walk, sampled) ---------------------
function parseScoreValue(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

/**
 * `graders` carries the two **shipped** predicates (`isNFLSafetyPlay`,
 * `isNFLTwoPointConversionPlay`, imported from `lib/sportsBingo.ts` in `main`) rather than copies.
 *
 * Phase E of docs/prop-bingo-out-of-scope-followup-plan.md: this function used to score a bare
 * `delta === 2` as a safety, full stop. Shipped grading stopped doing that in Phase 3 of the
 * parent fix plan — a +2 is now attributed **by play type**, and a +2 that nothing types makes
 * *both* `safety` and `two_point_conversion` unknown rather than picking one. The probe kept the
 * old rule, so the committed `nfl_safety` base rate counted every separately-booked two-point try
 * as a safety and over-stated the square, while `nfl_two_point_conversion` (old rule: `delta === 8`
 * only) under-stated it by the same plays. The walk below is now a line-for-line mirror of
 * `buildNFLPlayDerivedFacts`'s tri-state branch.
 */
function tabulateTier3(gamesWithPlays, graders) {
  const { isNFLSafetyPlay, isNFLTwoPointConversionPlay } = graders;
  const MAX_POINTS_PER_PLAY = 8;
  const counters = {
    first_score_within_5min: 0,
    score_final_minute_first_half: 0,
    score_last_2min_fourth: 0,
    both_teams_lead: 0,
    lead_change_second_half: 0,
    winner_trailed_in_fourth: 0,
    tied_after_halftime: 0,
    two_point_conversion: 0,
    safety: 0,
    // Games where an unattributable +2 left the fact `null` — which the shipped grader settles as
    // `void`, neither hit nor miss. Reported so the two rates above can be read as "hit out of all
    // games" (what the board simulator prices) without hiding how much of the denominator is
    // actually unresolvable.
    two_point_conversion_ambiguous: 0,
    safety_ambiguous: 0,
    td_from_inside_2yd: 0,
  };
  const n = gamesWithPlays.length;

  for (const { plays, game } of gamesWithPlays) {
    let runningHome = 0;
    let runningAway = 0;
    let homeLed = false;
    let awayLed = false;
    let firstScoreSeen = false;
    let leadChangeAfterHalftimeSeen = false;
    let tiedAfterHalftimeSeen = false;
    let priorSign = 0;
    const finalHomeScore = game.home_team_score;
    const finalAwayScore = game.visitor_team_score;
    const winnerIsHome = finalHomeScore > finalAwayScore;
    let winnerTrailedAtAnyFourthQPoint = false;
    let sawScoreInFinalMinuteFirstHalf = false;
    let sawScoreInLast2MinFourth = false;
    let sawSafety = false;
    let sawTwoPointConversion = false;
    let sawTdFromInside2yd = false;

    for (const play of plays) {
      const home = parseScoreValue(play.home_score);
      const away = parseScoreValue(play.away_score);
      const homeDelta = home === null ? 0 : home - runningHome;
      const awayDelta = away === null ? 0 : away - runningAway;
      const plausible = home !== null && away !== null && homeDelta >= 0 && awayDelta >= 0 && homeDelta + awayDelta <= MAX_POINTS_PER_PLAY;
      if (!plausible) continue;
      const delta = Math.max(homeDelta, awayDelta);
      const scoringSide = homeDelta > 0 ? "home" : awayDelta > 0 ? "away" : null;
      runningHome = home;
      runningAway = away;

      if (scoringSide && !firstScoreSeen) {
        firstScoreSeen = true;
        if (play.period === 1 && typeof play.clock_display === "string") {
          const [mm] = play.clock_display.split(":").map(Number);
          if (mm > 10) counters.first_score_within_5min += 1;
        }
      }

      if (scoringSide && play.period === 2 && typeof play.clock_display === "string") {
        const [mm] = play.clock_display.split(":").map(Number);
        if (mm < 1) sawScoreInFinalMinuteFirstHalf = true;
      }
      if (scoringSide && play.period === 4 && typeof play.clock_display === "string") {
        const [mm] = play.clock_display.split(":").map(Number);
        if (mm < 2) sawScoreInLast2MinFourth = true;
      }

      // Mirrors lib/sportsBingo.ts `buildNFLPlayDerivedFacts`. `false` -> not seen, `true` -> seen,
      // `null` -> a +2 landed that neither predicate could attribute, so neither fact is knowable.
      if (delta === 8) sawTwoPointConversion = true;
      if (delta === 2 && isNFLSafetyPlay(play)) {
        sawSafety = true;
      } else if (delta === 2) {
        if (isNFLTwoPointConversionPlay(play)) {
          sawTwoPointConversion = true;
        } else {
          if (sawSafety !== true) sawSafety = null;
          if (sawTwoPointConversion !== true) sawTwoPointConversion = null;
        }
      }
      if (
        delta >= 6 &&
        typeof play.start_yards_to_endzone === "number" &&
        play.start_yards_to_endzone <= 2
      ) {
        sawTdFromInside2yd = true;
      }

      if (runningHome > runningAway) homeLed = true;
      if (runningAway > runningHome) awayLed = true;

      const sign = Math.sign(runningHome - runningAway);
      if (play.period >= 3 && sign !== 0 && priorSign !== 0 && sign !== priorSign) {
        leadChangeAfterHalftimeSeen = true;
      }
      if (play.period >= 3 && runningHome === runningAway) tiedAfterHalftimeSeen = true;
      if (sign !== 0) priorSign = sign;

      if (play.period === 4) {
        const trailing = winnerIsHome ? runningHome < runningAway : runningAway < runningHome;
        if (trailing) winnerTrailedAtAnyFourthQPoint = true;
      }
    }

    if (homeLed && awayLed) counters.both_teams_lead += 1;
    if (leadChangeAfterHalftimeSeen) counters.lead_change_second_half += 1;
    if (tiedAfterHalftimeSeen) counters.tied_after_halftime += 1;
    if (winnerTrailedAtAnyFourthQPoint) counters.winner_trailed_in_fourth += 1;
    if (sawScoreInFinalMinuteFirstHalf) counters.score_final_minute_first_half += 1;
    if (sawScoreInLast2MinFourth) counters.score_last_2min_fourth += 1;
    if (sawSafety === true) counters.safety += 1;
    else if (sawSafety === null) counters.safety_ambiguous += 1;
    if (sawTwoPointConversion === true) counters.two_point_conversion += 1;
    else if (sawTwoPointConversion === null) counters.two_point_conversion_ambiguous += 1;
    if (sawTdFromInside2yd) counters.td_from_inside_2yd += 1;
  }

  const results = {};
  for (const [key, hits] of Object.entries(counters)) {
    results[key] = { n, rate: n ? hits / n : 0 };
  }
  return results;
}

// --- Phase 8b: Tier 3 threshold sweeps -------------------------------------
function clockSecondsRemaining(play) {
  if (typeof play.clock_display !== "string") return null;
  const [mm, ss] = play.clock_display.split(":").map(Number);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return mm * 60 + ss;
}

function sweepTier3(gamesWithPlays) {
  const MAX_POINTS_PER_PLAY = 8;
  const perGame = [];

  for (const { plays } of gamesWithPlays) {
    let runningHome = 0;
    let runningAway = 0;
    const record = {
      firstScoreElapsedSeconds: null,
      lastSecondsRemainingFirstHalfScore: null,
      lastSecondsRemainingFourthScore: null,
      shortestTouchdownYardsToEndzone: null,
    };
    for (const play of plays) {
      const home = parseScoreValue(play.home_score);
      const away = parseScoreValue(play.away_score);
      const homeDelta = home === null ? 0 : home - runningHome;
      const awayDelta = away === null ? 0 : away - runningAway;
      const plausible =
        home !== null && away !== null && homeDelta >= 0 && awayDelta >= 0 && homeDelta + awayDelta <= MAX_POINTS_PER_PLAY;
      if (!plausible) continue;
      runningHome = home;
      runningAway = away;
      const delta = Math.max(homeDelta, awayDelta);
      if (delta <= 0) continue;
      const remaining = clockSecondsRemaining(play);

      if (record.firstScoreElapsedSeconds === null && play.period === 1 && remaining !== null) {
        record.firstScoreElapsedSeconds = 15 * 60 - remaining;
      }
      if (play.period === 2 && remaining !== null) {
        record.lastSecondsRemainingFirstHalfScore = Math.min(
          record.lastSecondsRemainingFirstHalfScore ?? Number.POSITIVE_INFINITY,
          remaining,
        );
      }
      if (play.period === 4 && remaining !== null) {
        record.lastSecondsRemainingFourthScore = Math.min(
          record.lastSecondsRemainingFourthScore ?? Number.POSITIVE_INFINITY,
          remaining,
        );
      }
      if (delta >= 6 && typeof play.start_yards_to_endzone === "number") {
        record.shortestTouchdownYardsToEndzone = Math.min(
          record.shortestTouchdownYardsToEndzone ?? Number.POSITIVE_INFINITY,
          play.start_yards_to_endzone,
        );
      }
    }
    perGame.push(record);
  }

  return {
    first_score_within_minutes: sweepRates(
      perGame,
      (r) => (r.firstScoreElapsedSeconds === null ? null : r.firstScoreElapsedSeconds / 60),
      range(2, 10, 1),
      "lte",
    ),
    score_in_final_minutes_of_first_half: sweepRates(
      perGame,
      (r) => (r.lastSecondsRemainingFirstHalfScore === null ? Number.POSITIVE_INFINITY : r.lastSecondsRemainingFirstHalfScore / 60),
      range(0.5, 4, 0.5),
      "lte",
    ),
    score_in_final_minutes_of_fourth: sweepRates(
      perGame,
      (r) => (r.lastSecondsRemainingFourthScore === null ? Number.POSITIVE_INFINITY : r.lastSecondsRemainingFourthScore / 60),
      range(1, 6, 1),
      "lte",
    ),
    touchdown_from_inside_yards: sweepRates(
      perGame,
      (r) => (r.shortestTouchdownYardsToEndzone === null ? Number.POSITIVE_INFINITY : r.shortestTouchdownYardsToEndzone),
      range(1, 10, 1),
      "lte",
    ),
  };
}

// --- Phase 8b: Tier 4 drive reconstruction and its ship gate ----------------
//
// The plan's gate, verbatim: reconstruct drives over >=200 archived games and reconcile the count
// against `team_stats.total_drives`, an independently published number. Ship Tier 4 only if it
// reconciles on >=98% of games. A "drive" here is a maximal run of consecutive plays sharing the
// same possessing `team`, which is the only reconstruction BDL's feed permits (there is no drive id).

const NON_SCRIMMAGE_SLUG = /kickoff|extra-point|two-point|end-|timeout|coin-toss|official|penalty-only/;

function reconstructDrives(plays) {
  const drives = [];
  let current = null;
  for (const play of plays) {
    const abbreviation = play.team?.abbreviation;
    if (!abbreviation) continue;
    if (!current || current.team !== abbreviation) {
      current = { team: abbreviation, plays: [] };
      drives.push(current);
    }
    current.plays.push(play);
  }
  return drives.map((drive) => {
    const scrimmage = drive.plays.filter((play) => !NON_SCRIMMAGE_SLUG.test(String(play.type_slug ?? "")));
    const last = scrimmage[scrimmage.length - 1] ?? null;
    const first = scrimmage[0] ?? null;
    const slug = String(last?.type_slug ?? "");
    return {
      team: drive.team,
      scrimmagePlays: scrimmage.length,
      startYardsToEndzone: typeof first?.start_yards_to_endzone === "number" ? first.start_yards_to_endzone : null,
      endedInPunt: /punt/.test(slug),
      endedInTouchdown: /touchdown/.test(slug),
      endedInTurnover: /interception|fumble/.test(slug),
      endYardsToEndzone: typeof last?.start_yards_to_endzone === "number" ? last.start_yards_to_endzone : null,
      scoringPlay: drive.plays.some((play) => play.scoring_play === true),
    };
  });
}

function tabulateTier4(gamesWithPlays, teamStatsRows) {
  const totalDrivesByGameTeam = new Map();
  for (const row of teamStatsRows) {
    if (typeof row.total_drives === "number") {
      totalDrivesByGameTeam.set(`${row.game.id}:${row.team.abbreviation}`, row.total_drives);
    }
  }

  let gamesChecked = 0;
  let exactMatches = 0;
  let withinOne = 0;
  const deltas = [];
  const counters = {
    both_teams_score_opening_drive: 0,
    either_team_scores_opening_drive: 0,
    opens_with_three_and_out: 0,
    touchdown_drive_75plus: 0,
    turnover_inside_red_zone: 0,
    team_punts_first_two_drives: 0,
  };
  let ratedGames = 0;

  for (const { plays, game } of gamesWithPlays) {
    const drives = reconstructDrives(plays);
    if (drives.length === 0) continue;

    const byTeam = new Map();
    for (const drive of drives) {
      byTeam.set(drive.team, (byTeam.get(drive.team) ?? 0) + 1);
    }
    const homeAbbr = game.home_team?.abbreviation;
    const awayAbbr = game.visitor_team?.abbreviation;
    const published = [homeAbbr, awayAbbr].map((abbr) => totalDrivesByGameTeam.get(`${game.id}:${abbr}`));
    if (published.every((value) => typeof value === "number")) {
      gamesChecked += 1;
      const reconstructed = [homeAbbr, awayAbbr].map((abbr) => byTeam.get(abbr) ?? 0);
      const gameDelta = Math.max(
        Math.abs(reconstructed[0] - published[0]),
        Math.abs(reconstructed[1] - published[1]),
      );
      deltas.push(gameDelta);
      if (gameDelta === 0) exactMatches += 1;
      if (gameDelta <= 1) withinOne += 1;
    }

    ratedGames += 1;
    const firstDriveByTeam = new Map();
    const drivesByTeam = new Map();
    for (const drive of drives) {
      if (!drivesByTeam.has(drive.team)) drivesByTeam.set(drive.team, []);
      drivesByTeam.get(drive.team).push(drive);
      if (!firstDriveByTeam.has(drive.team)) firstDriveByTeam.set(drive.team, drive);
    }
    const openingScorers = [...firstDriveByTeam.values()].filter((drive) => drive.scoringPlay).length;
    if (openingScorers >= 2) counters.both_teams_score_opening_drive += 1;
    if (openingScorers >= 1) counters.either_team_scores_opening_drive += 1;
    const opening = drives.find((drive) => drive.scrimmagePlays > 0);
    if (opening && opening.scrimmagePlays <= 3 && opening.endedInPunt) counters.opens_with_three_and_out += 1;
    if (drives.some((drive) => drive.endedInTouchdown && (drive.startYardsToEndzone ?? 0) >= 75)) {
      counters.touchdown_drive_75plus += 1;
    }
    if (drives.some((drive) => drive.endedInTurnover && (drive.endYardsToEndzone ?? 100) <= 20)) {
      counters.turnover_inside_red_zone += 1;
    }
    if (
      [...drivesByTeam.values()].some(
        (teamDrives) => teamDrives.length >= 2 && teamDrives[0].endedInPunt && teamDrives[1].endedInPunt,
      )
    ) {
      counters.team_punts_first_two_drives += 1;
    }
  }

  const rates = {};
  for (const [key, hits] of Object.entries(counters)) {
    rates[key] = { n: ratedGames, rate: ratedGames ? hits / ratedGames : 0 };
  }

  return {
    reconciliation: {
      gamesChecked,
      exactMatchRate: gamesChecked ? exactMatches / gamesChecked : 0,
      withinOneRate: gamesChecked ? withinOne / gamesChecked : 0,
      meanAbsoluteDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
      shipGate: "Ship Tier 4 only if exactMatchRate >= 0.98 (docs/prop-bingo-nfl-plan.md, Phase 8 'Ship gate for Tier 4').",
    },
    candidateRates: rates,
  };
}

async function main() {
  if (!API_KEY) {
    console.error("BALLDONTLIE_API_KEY is not set. Run via `npm run bingo:probe:nfl-flavor`.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));

  console.error(`[probe] fetching ${args.season} season game list...`);
  const allGames = await fetchSeason(args.season);
  console.error(`[probe] ${allGames.length} completed games`);

  // Discovered live 2026-08-17, unrelated to any of the plan's five questions: BDL's
  // /nfl/v1/stats and /nfl/v1/team_stats return zero rows for every 2025 postseason game,
  // despite those games showing `status: "Final"` with real scores on /nfl/v1/games. Regular
  // season games are unaffected. Excluded from the base-rate denominators below (a 0-row game
  // would silently read as "never hits") and reported separately.
  const postseasonGameIds = new Set(allGames.filter((g) => g.postseason).map((g) => g.id));
  const postseasonStatsProbe = await fetchTeamStatsForGames([...postseasonGameIds].slice(0, 3));
  const postseasonStatsGap = {
    postseasonGamesInSeason: postseasonGameIds.size,
    sampledForProbe: Math.min(3, postseasonGameIds.size),
    teamStatsRowsReturned: postseasonStatsProbe.length,
    note:
      postseasonStatsProbe.length === 0
        ? "CONFIRMED GAP: /nfl/v1/team_stats and /nfl/v1/stats return zero rows for 2025 postseason games. Postseason excluded from every base-rate measurement below; only the 272-game regular season is measured. This also means Tier 1/2/4 flavor squares (and, pre-existing, the Phase-3/4 player-prop and settlement paths) cannot grade postseason NFL boards today. Not one of the plan's five questions — found while fetching the season list for base rates."
        : "Postseason stats appear present for at least one sampled game — re-verify before trusting this note; it contradicts what was found during this run.",
  };
  const games = allGames.filter((g) => !postseasonGameIds.has(g.id));
  const gameIds = games.map((g) => g.id);

  let teamStatsRows = [];
  let playerStatsRows = [];
  if (args.tier3Only) {
    console.error("[probe] --tier3-only: skipping team_stats and player stats (Tier 1/2/4 and Q2-Q4 report null)");
  } else {
    console.error(`[probe] fetching team_stats for ${gameIds.length} regular-season games...`);
    teamStatsRows = await fetchTeamStatsForGames(gameIds);
    console.error(`[probe] ${teamStatsRows.length} team_stats rows`);

    console.error(`[probe] fetching player stats for ${gameIds.length} games (this is the slow part)...`);
    playerStatsRows = await fetchPlayerStatsForGames(gameIds);
    console.error(`[probe] ${playerStatsRows.length} player stat rows`);
  }

  const q2 = args.tier3Only ? null : checkSackOrientation(teamStatsRows, playerStatsRows);
  const q3 = args.tier3Only ? null : checkRedZoneSemantics(teamStatsRows, playerStatsRows);
  const q4 = args.tier3Only ? null : checkDefensiveRows(playerStatsRows);

  let q5 = null;
  let tier3 = null;
  let tier3Sweep = null;
  let tier4 = null;
  if (args.plays) {
    const sampleSize = Math.min(args.tier3Sample, games.length);
    const stride = Math.max(1, Math.floor(games.length / sampleSize));
    const sampleGames = games.filter((_, i) => i % stride === 0).slice(0, sampleSize);
    console.error(`[probe] fetching /nfl/v1/plays for a ${sampleGames.length}-game sample (Tier 3)...`);
    const gamesWithPlays = [];
    let allPlays = [];
    let fetched = 0;
    for (const game of sampleGames) {
      const plays = await fetchPlays(game.id);
      fetched += 1;
      if (fetched % 25 === 0) console.error(`[probe]   ...${fetched}/${sampleGames.length} games walked`);
      if (plays.length > 0) {
        gamesWithPlays.push({ plays, game });
        allPlays = allPlays.concat(plays);
      }
    }
    console.error(`[probe] ${gamesWithPlays.length} games with plays data, ${allPlays.length} total plays sampled`);
    q5 = checkPlaysFields(allPlays);
    // The shipped predicates, not a copy of them — a mirrored implementation here would measure
    // the mirror rather than the grader that settles real squares (same discipline as
    // scripts/validate-nfl-bingo-grading.cjs).
    const { isNFLSafetyPlay, isNFLTwoPointConversionPlay } = await import("../lib/sportsBingo.ts");
    tier3 = tabulateTier3(gamesWithPlays, { isNFLSafetyPlay, isNFLTwoPointConversionPlay });
    if (args.sweep) tier3Sweep = sweepTier3(gamesWithPlays);
    if (args.tier4) tier4 = tabulateTier4(gamesWithPlays, teamStatsRows);
  }

  const tier1 = args.tier3Only ? null : tabulateTier1(teamStatsRows);
  const tier2 = args.tier3Only ? null : tabulateTier2(playerStatsRows);
  const tier1Sweep = args.sweep && !args.tier3Only ? sweepTier1(teamStatsRows) : null;
  const tier2Sweep = args.sweep && !args.tier3Only ? sweepTier2(playerStatsRows) : null;

  const report = {
    season: args.season,
    gamesConsidered: games.length,
    postseasonStatsGap,
    generatedAt: new Date().toISOString(),
    q1_team_stats_mid_game: {
      answered: false,
      note: "Cannot be determined from archived Final games — BDL only exposes team_stats for games that have already ended in this dataset, and there is no historical mid-game snapshot to replay. Requires a live probe during an actual in-progress NFL game (earliest opportunity: 2026 Week 1, ~2026-09-10). See findings doc for the exact live-check recipe.",
    },
    q2_sack_orientation: q2,
    q3_red_zone_semantics: q3,
    q4_defensive_rows_populated: q4,
    q5_plays_fields_archived: q5,
    tier1BaseRates: tier1,
    tier2BaseRates: tier2,
    tier3BaseRates: tier3,
    // Phase 8b (`--sweep` / `--tier4`). Null when the flags were not passed, so an 8a-shaped run
    // produces an 8a-shaped report.
    tier1ThresholdSweep: tier1Sweep,
    tier2ThresholdSweep: tier2Sweep,
    tier3ThresholdSweep: tier3Sweep,
    tier4DriveReconstruction: tier4,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Phase 8a probe — ${args.season} season, ${games.length} completed games ===\n`);
    if (q2) {
      console.log("Q2 — sack orientation (team_stats.sacks vs summed player defensive_sacks):");
      console.log(`  checked=${q2.checked} ambiguous=${q2.ambiguous} matchesOffenseTaken=${q2.matchesOffenseTaken} matchesDefenseMade=${q2.matchesDefenseMade}`);
    }
    if (q3) {
      console.log("Q3 — red_zone_scores semantics:");
      console.log(`  checked=${q3.checked} neverExceedsTotalTds=${q3.redZoneScoresNeverExceedsTotalTds} violations=${q3.violations} attemptsGtScores=${q3.sawFgAttemptWithLowerScoresThanAttempts}`);
    }
    if (q4) {
      console.log("Q4 — defensive row population:");
      console.log(JSON.stringify(q4, null, 2));
    }
    if (q5) {
      console.log("Q5 — plays fields on archived games:");
      console.log(JSON.stringify(q5, null, 2));
    }
    if (tier1) {
      console.log("\nTier 1 base rates:");
      console.log(JSON.stringify(tier1, null, 2));
    }
    if (tier2) {
      console.log("\nTier 2 base rates:");
      console.log(JSON.stringify(tier2, null, 2));
    }
    if (tier3) {
      console.log("\nTier 3 base rates (sampled):");
      console.log(JSON.stringify(tier3, null, 2));
    }
    if (tier1Sweep || tier2Sweep || tier3Sweep) {
      console.log("\nThreshold sweeps — the threshold nearest each intended feel, per field:");
      for (const [group, sweep] of [
        ["tier1", tier1Sweep],
        ["tier2", tier2Sweep],
        ["tier3", tier3Sweep],
      ]) {
        if (!sweep) continue;
        for (const [field, curve] of Object.entries(sweep)) {
          if (!curve || !curve.nearest) continue;
          const parts = Object.entries(curve.nearest).map(
            ([feel, point]) => `${feel}=${point.threshold} (${point.rate.toFixed(3)})`,
          );
          console.log(`  ${group}.${field} [${curve.comparison}]: ${parts.join("  ")}`);
        }
      }
    }
    if (tier4) {
      console.log("\nTier 4 drive reconstruction:");
      console.log(JSON.stringify(tier4, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
