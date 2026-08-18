#!/usr/bin/env node

/**
 * Phase 0 probe for docs/prop-bingo-nfl-plan.md.
 *
 * Self-contained (no project TS imports — "server-only" throws under plain
 * node), following the probe-apisports-nba.cjs convention:
 *   node --env-file=.env.local scripts/probe-nfl-bingo.cjs
 *
 * Reports, against the real balldontlie NFL surface:
 *   - /nfl/v1/games for the next 10 days: week/season/postseason/status →
 *     the preseason detection rule.
 *   - /nfl/v1/odds?game_ids[]= for those games: vendor count, whether
 *     preseason games have lines at all.
 *   - /nfl/v1/odds/player_props?game_id= for those games: prop count,
 *     distinct prop_type/players/vendors, preseason-vs-regular delta.
 *   - /nfl/v1/stats?game_ids[]= on a completed 2025 regular-season game:
 *     which fields are populated (in particular kicking).
 *   - /nfl/v1/plays?game_id= on both a preseason game and the completed
 *     game: GOAT-tier confirmation (odds/props/plays are all GOAT-gated
 *     per the BDL docs, so this doubles as the tier verdict).
 *   - HTTP status per endpoint family → the tier verdict.
 */

const BASE_URL = String(process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io").trim().replace(/\/+$/, "");
const API_KEY = String(process.env.BALLDONTLIE_API_KEY ?? "").trim();

if (!API_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY.");
  process.exit(1);
}

function utcDateKey(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function request(path, query) {
  const qs = query ? query.toString() : "";
  const url = qs ? `${BASE_URL}${path}?${qs}` : `${BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: API_KEY, Accept: "application/json" },
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, path, url, json };
  } catch (error) {
    return { ok: false, status: 0, path, url, error: error instanceof Error ? error.message : String(error), json: null };
  }
}

async function requestAllPages(path, baseQuery, maxPages = 4) {
  const rows = [];
  let cursor = null;
  let lastResult = null;
  let truncated = false;
  for (let i = 0; i < maxPages; i += 1) {
    const query = new URLSearchParams(baseQuery);
    if (cursor) query.set("cursor", cursor);
    const result = await request(path, query);
    lastResult = result;
    if (!result.ok) break;
    const data = Array.isArray(result.json?.data) ? result.json.data : [];
    rows.push(...data);
    const nextCursor = result.json?.meta?.next_cursor;
    if (nextCursor === null || nextCursor === undefined || String(nextCursor).trim() === "") {
      cursor = null;
      break;
    }
    cursor = String(nextCursor).trim();
    if (i === maxPages - 1) truncated = true;
  }
  return { rows, lastResult, truncated };
}

function distinct(values) {
  return [...new Set(values)];
}

function fieldPresenceReport(rows, fields) {
  const presence = {};
  for (const field of fields) {
    const withValue = rows.filter((row) => row[field] !== null && row[field] !== undefined).length;
    presence[field] = { populatedIn: withValue, ofRows: rows.length };
  }
  return presence;
}

async function main() {
  const nextTenDays = Array.from({ length: 10 }, (_, i) => utcDateKey(i));

  // ── 1. /nfl/v1/games for the next 10 days ────────────────────────────────
  const gamesQuery = new URLSearchParams();
  for (const date of nextTenDays) gamesQuery.append("dates[]", date);
  gamesQuery.set("per_page", "100");
  const { rows: upcomingGames, lastResult: gamesResult } = await requestAllPages("/nfl/v1/games", gamesQuery);

  const upcomingGamesSummary = upcomingGames.map((g) => ({
    id: g.id,
    date: g.date,
    week: g.week,
    season: g.season,
    postseason: g.postseason,
    status: g.status,
    matchup: `${g.visitor_team?.abbreviation ?? "?"} @ ${g.home_team?.abbreviation ?? "?"}`,
  }));

  // Off-season: the 10-day window can legitimately be empty (BDL carries no
  // preseason games at all — see findings doc). Fall back to the nearest
  // scheduled games of any date so odds/props/plays/tier probes still run.
  let usedFallbackWindow = false;
  let probeGameIds = upcomingGamesSummary.slice(0, 6).map((g) => g.id);
  if (probeGameIds.length === 0) {
    usedFallbackWindow = true;
    const now = new Date();
    const nextSeasonGuess = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const fallback = await request(
      "/nfl/v1/games",
      new URLSearchParams({ "seasons[]": String(nextSeasonGuess), per_page: "100" })
    );
    const fallbackRows = Array.isArray(fallback.json?.data) ? fallback.json.data : [];
    const upcomingFallback = fallbackRows
      .filter((g) => new Date(g.date).getTime() > Date.now())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    probeGameIds = upcomingFallback.slice(0, 6).map((g) => g.id);
  }

  // ── 2. /nfl/v1/odds for those games ──────────────────────────────────────
  let oddsResult = { ok: false, status: 0 };
  let oddsRows = [];
  if (probeGameIds.length > 0) {
    const oddsQuery = new URLSearchParams({ per_page: "100" });
    for (const id of probeGameIds) oddsQuery.append("game_ids[]", String(id));
    const paged = await requestAllPages("/nfl/v1/odds", oddsQuery);
    oddsRows = paged.rows;
    oddsResult = paged.lastResult;
  }
  const oddsByGame = {};
  for (const row of oddsRows) {
    const gid = String(row.game_id);
    oddsByGame[gid] = oddsByGame[gid] ?? { vendors: new Set(), hasSpread: false, hasTotal: false, hasMoneyline: false };
    if (row.vendor) oddsByGame[gid].vendors.add(row.vendor);
    if (row.spread_home_value !== null && row.spread_home_value !== undefined) oddsByGame[gid].hasSpread = true;
    if (row.total_value !== null && row.total_value !== undefined) oddsByGame[gid].hasTotal = true;
    if (row.moneyline_home_odds !== null && row.moneyline_home_odds !== undefined) oddsByGame[gid].hasMoneyline = true;
  }
  const oddsByGameSummary = Object.fromEntries(
    Object.entries(oddsByGame).map(([gid, v]) => [
      gid,
      { vendorCount: v.vendors.size, vendors: [...v.vendors], hasSpread: v.hasSpread, hasTotal: v.hasTotal, hasMoneyline: v.hasMoneyline },
    ])
  );

  // ── 3. /nfl/v1/odds/player_props per game (no bulk endpoint — one call/game) ──
  const playerPropsByGame = {};
  let anyPropsRequestFailedWithStatus = null;
  for (const gid of probeGameIds) {
    const result = await request("/nfl/v1/odds/player_props", new URLSearchParams({ game_id: String(gid) }));
    if (!result.ok && anyPropsRequestFailedWithStatus === null) {
      anyPropsRequestFailedWithStatus = result.status;
    }
    const rows = Array.isArray(result.json?.data) ? result.json.data : [];
    playerPropsByGame[gid] = {
      ok: result.ok,
      status: result.status,
      propCount: rows.length,
      distinctPropTypes: distinct(rows.map((r) => r.prop_type)),
      distinctPlayers: distinct(rows.map((r) => r.player_id)).length,
      distinctVendors: distinct(rows.map((r) => r.vendor)),
    };
  }

  // ── 3b. Does BDL carry ANY preseason games? Pull the full 2025 season and
  // look at the earliest date — if it starts at Week 1 in September with no
  // August entries, BDL's games catalog has no preseason coverage at all,
  // which is a different (harder) finding than "preseason games exist but
  // are thin."
  const { rows: fullSeason2025 } = await requestAllPages(
    "/nfl/v1/games",
    new URLSearchParams({ "seasons[]": "2025", per_page: "100" }),
    5
  );
  const sortedSeason2025 = [...fullSeason2025].sort((a, b) => new Date(a.date) - new Date(b.date));
  const earliestSeason2025Game = sortedSeason2025[0] ?? null;
  const augustDatedGames2025 = fullSeason2025.filter((g) => {
    const d = new Date(g.date);
    return Number.isFinite(d.getTime()) && d.getUTCMonth() === 7; // August
  });
  const preseasonCatalogCoverage = {
    totalGamesInSeason2025: fullSeason2025.length,
    earliestGame: earliestSeason2025Game
      ? { id: earliestSeason2025Game.id, date: earliestSeason2025Game.date, week: earliestSeason2025Game.week, postseason: earliestSeason2025Game.postseason }
      : null,
    augustDatedGameCount: augustDatedGames2025.length,
    verdict:
      augustDatedGames2025.length === 0
        ? "NO PRESEASON COVERAGE — /nfl/v1/games has zero August-dated (preseason-window) games for season 2025; the catalog starts at Week 1."
        : `${augustDatedGames2025.length} August-dated games found — inspect week/status fields to derive the preseason rule.`,
  };

  // ── 4. A completed 2025 regular-season game, for /nfl/v1/stats field coverage ──
  const completedGames = fullSeason2025.filter((g) => g.postseason === false);
  const finalGames = completedGames.filter((g) => String(g.status).toLowerCase() === "final");
  const sampleCompletedGame = finalGames[0] ?? completedGames[0] ?? null;

  let statsResult = { ok: false, status: 0 };
  let statsRows = [];
  if (sampleCompletedGame) {
    const statsQuery = new URLSearchParams({ per_page: "100" });
    statsQuery.append("game_ids[]", String(sampleCompletedGame.id));
    const paged = await requestAllPages("/nfl/v1/stats", statsQuery);
    statsRows = paged.rows;
    statsResult = paged.lastResult;
  }

  const statFieldsOfInterest = [
    "passing_yards",
    "passing_touchdowns",
    "passing_attempts",
    "passing_completions",
    "passing_interceptions",
    "rushing_yards",
    "rushing_attempts",
    "rushing_touchdowns",
    "long_rushing",
    "receptions",
    "receiving_yards",
    "receiving_touchdowns",
    "long_reception",
    "field_goal_attempts",
    "field_goals_made",
    "long_field_goal_made",
    "extra_points_made",
    "total_points",
  ];
  const statFieldPresence = fieldPresenceReport(statsRows, statFieldsOfInterest);
  const hasKickingFields =
    statFieldPresence.field_goals_made.populatedIn > 0 || statFieldPresence.extra_points_made.populatedIn > 0;
  const hasLongestPassField = false; // confirmed absent from BDL-API docs/NFL API .html — no long_passing / longest completion field on /nfl/v1/stats

  // ── 5. /nfl/v1/plays on a preseason game and the completed game (tier check) ──
  const playsProbes = {};
  if (probeGameIds[0]) {
    playsProbes.upcoming = await request("/nfl/v1/plays", new URLSearchParams({ game_id: String(probeGameIds[0]) }));
  }
  if (sampleCompletedGame) {
    playsProbes.completed = await request("/nfl/v1/plays", new URLSearchParams({ game_id: String(sampleCompletedGame.id) }));
  }

  const tierVerdict = {
    gamesStatus: gamesResult?.status ?? null,
    oddsStatus: oddsResult?.status ?? null,
    playerPropsStatus: probeGameIds.length > 0 ? Object.values(playerPropsByGame)[0]?.status ?? null : null,
    statsStatus: statsResult?.status ?? null,
    playsStatusUpcoming: playsProbes.upcoming?.status ?? null,
    playsStatusCompleted: playsProbes.completed?.status ?? null,
    likelyTier:
      (oddsResult?.ok && (Object.values(playerPropsByGame)[0]?.ok ?? false))
        ? (playsProbes.upcoming?.ok || playsProbes.completed?.ok ? "GOAT (odds+props+plays all 2xx)" : "GOAT for odds/props, plays unconfirmed/blocked")
        : "NOT GOAT — odds or player_props returned non-2xx, see statuses above",
  };

  const payload = {
    probedAtUtc: new Date().toISOString(),
    config: { baseUrl: BASE_URL, hasApiKey: Boolean(API_KEY) },
    upcomingGames: {
      windowDays: nextTenDays,
      count: upcomingGamesSummary.length,
      games: upcomingGamesSummary,
      requestStatus: gamesResult?.status ?? null,
    },
    usedFallbackWindow,
    fallbackProbeGameIds: usedFallbackWindow ? probeGameIds : undefined,
    preseasonCatalogCoverage,
    oddsByGame: oddsByGameSummary,
    oddsRequestStatus: oddsResult?.status ?? null,
    playerPropsByGame,
    sampleCompletedGame: sampleCompletedGame
      ? { id: sampleCompletedGame.id, date: sampleCompletedGame.date, week: sampleCompletedGame.week, status: sampleCompletedGame.status }
      : null,
    statsFieldPresence: statFieldPresence,
    statsSampleRowCount: statsRows.length,
    hasKickingFields,
    hasLongestPassField,
    playsProbes: {
      upcoming: playsProbes.upcoming ? { status: playsProbes.upcoming.status, ok: playsProbes.upcoming.ok } : null,
      completed: playsProbes.completed ? { status: playsProbes.completed.status, ok: playsProbes.completed.ok } : null,
    },
    tierVerdict,
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
