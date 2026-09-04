#!/usr/bin/env node

// One-off live re-probe for Phase 3 of docs/bingo-correctness-and-wnba-repair-plan.md.
// Re-verifies, in this session, every endpoint/field-name claim the phase is about to write code
// against: box-score endpoint naming (NBA /stats vs WNBA /player_stats), the plays endpoint's
// game_id vs game_ids[] behavior for BOTH leagues, and the actual field name for the scoring-play
// flag in each league's plays payload. Run with: node --env-file=.env.local scripts/probe-wnba-bingo-settlement.cjs

const baseUrl = String(process.env.BALLDONTLIE_API_BASE_URL || "https://api.balldontlie.io").trim().replace(/\/+$/, "");
const key = String(process.env.BALLDONTLIE_API_KEY || "").trim();

if (!key) {
  console.error("Missing BALLDONTLIE_API_KEY");
  process.exit(1);
}

async function hit(path, params) {
  const query = new URLSearchParams(params);
  const url = `${baseUrl}${path}?${query.toString()}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  const json = await res.json().catch(() => ({}));
  return { url, status: res.status, json };
}

function rows(result) {
  return Array.isArray(result.json?.data) ? result.json.data : [];
}

async function findRecentFinalGame(prefix, statusStateField) {
  // Walk back a few days looking for a completed game; balldontlie serves history freely.
  for (let daysAgo = 1; daysAgo <= 21; daysAgo += 1) {
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    const result = await hit(`${prefix}/games`, { "dates[]": iso, per_page: "100" });
    const gameRows = rows(result);
    const final = gameRows.find((g) => String(g[statusStateField] ?? g.status ?? "").toLowerCase().includes("final") || String(g[statusStateField] ?? "").toLowerCase() === "final");
    if (final) {
      return { date: iso, game: final, probeStatus: result.status };
    }
  }
  return null;
}

(async () => {
  const report = {};

  // --- WNBA ---
  const wnbaFound = await findRecentFinalGame("/wnba/v1", "status_state");
  report.wnba = { foundGame: wnbaFound ? { id: wnbaFound.game.id, date: wnbaFound.date, status: wnbaFound.game.status, status_state: wnbaFound.game.status_state } : null };

  if (wnbaFound) {
    const gid = wnbaFound.game.id;

    const wnbaStatsOld = await hit("/wnba/v1/stats", { "game_ids[]": String(gid), per_page: "5" });
    report.wnba.legacyStatsEndpoint = { status: wnbaStatsOld.status };

    const wnbaPlayerStats = await hit("/wnba/v1/player_stats", { "game_ids[]": String(gid), per_page: "5" });
    report.wnba.playerStatsEndpoint = {
      status: wnbaPlayerStats.status,
      rowCount: rows(wnbaPlayerStats).length,
      firstRowKeys: rows(wnbaPlayerStats)[0] ? Object.keys(rows(wnbaPlayerStats)[0]) : [],
    };

    const wnbaPlaysGameIds = await hit("/wnba/v1/plays", { "game_ids[]": String(gid), per_page: "5" });
    report.wnba.playsGameIdsPlural = { status: wnbaPlaysGameIds.status };

    const wnbaPlaysSingular = await hit("/wnba/v1/plays", { game_id: String(gid), per_page: "100" });
    const wnbaPlayRows = rows(wnbaPlaysSingular);
    report.wnba.playsGameIdSingular = {
      status: wnbaPlaysSingular.status,
      rowCount: wnbaPlayRows.length,
      hasNextCursor: wnbaPlaysSingular.json?.meta?.next_cursor ?? null,
      firstRowKeys: wnbaPlayRows[0] ? Object.keys(wnbaPlayRows[0]) : [],
      hasIsScoringPlay: wnbaPlayRows.some((r) => "is_scoring_play" in r),
      hasScoringPlay: wnbaPlayRows.some((r) => "scoring_play" in r),
      sampleScoringRow: wnbaPlayRows.find((r) => r.is_scoring_play === true || r.scoring_play === true) ?? null,
    };

    const wnbaPlayerStatsPeriod = await hit("/wnba/v1/player_stats", { "game_ids[]": String(gid), period: "1", per_page: "3" });
    const wnbaPlayerStatsPeriod0 = await hit("/wnba/v1/player_stats", { "game_ids[]": String(gid), period: "0", per_page: "3" });
    report.wnba.periodParamIgnored = {
      period1Rows: rows(wnbaPlayerStatsPeriod).length,
      period0Rows: rows(wnbaPlayerStatsPeriod0).length,
      samePtsForFirstRow:
        rows(wnbaPlayerStatsPeriod)[0]?.pts === rows(wnbaPlayerStatsPeriod0)[0]?.pts &&
        rows(wnbaPlayerStatsPeriod)[0]?.player?.id === rows(wnbaPlayerStatsPeriod0)[0]?.player?.id,
    };

    const wnbaLineups = await hit("/wnba/v1/lineups", { "game_ids[]": String(gid), per_page: "5" });
    report.wnba.lineupsEndpoint = { status: wnbaLineups.status };
  }

  // --- NBA ---
  const nbaFound = await findRecentFinalGame("/nba/v1", "status_state");
  report.nba = { foundGame: nbaFound ? { id: nbaFound.game.id, date: nbaFound.date, status: nbaFound.game.status, status_state: nbaFound.game.status_state } : null };

  if (nbaFound) {
    const gid = nbaFound.game.id;

    const nbaStats = await hit("/nba/v1/stats", { "game_ids[]": String(gid), per_page: "5" });
    report.nba.statsEndpoint = { status: nbaStats.status, rowCount: rows(nbaStats).length };

    const nbaPlayerStats = await hit("/nba/v1/player_stats", { "game_ids[]": String(gid), per_page: "5" });
    report.nba.playerStatsEndpoint = { status: nbaPlayerStats.status };

    const nbaPlaysGameIds = await hit("/nba/v1/plays", { "game_ids[]": String(gid), per_page: "5" });
    report.nba.playsGameIdsPlural = { status: nbaPlaysGameIds.status };

    const nbaPlaysSingular = await hit("/nba/v1/plays", { game_id: String(gid), per_page: "100" });
    const nbaPlayRows = rows(nbaPlaysSingular);
    report.nba.playsGameIdSingular = {
      status: nbaPlaysSingular.status,
      rowCount: nbaPlayRows.length,
      hasNextCursor: nbaPlaysSingular.json?.meta?.next_cursor ?? null,
      firstRowKeys: nbaPlayRows[0] ? Object.keys(nbaPlayRows[0]) : [],
      hasIsScoringPlay: nbaPlayRows.some((r) => "is_scoring_play" in r),
      hasScoringPlay: nbaPlayRows.some((r) => "scoring_play" in r),
      sampleScoringRow: nbaPlayRows.find((r) => r.is_scoring_play === true || r.scoring_play === true) ?? null,
    };
  }

  console.log(JSON.stringify(report, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
