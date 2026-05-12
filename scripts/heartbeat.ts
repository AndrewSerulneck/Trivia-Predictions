import { createClient } from "@supabase/supabase-js";

type SportSlug = "nba" | "nfl";

type SportConfig = {
  slug: SportSlug;
  sportKey: string;
  baseUrl: string;
  gameStatusLive: Set<string>;
  gameStatusFinal: Set<string>;
  buildGameStatsPath: (gameId: string) => string;
  toFantasyPoints: (row: Record<string, unknown>) => number;
};

const ACTIVE_SPORT = String(process.env.ACTIVE_SPORT ?? "nba").trim().toLowerCase() as SportSlug;
const APISPORTS_API_KEY = String(process.env.APISPORTS_API_KEY ?? "").trim();
const APISPORTS_NBA_BASE_URL = String(process.env.APISPORTS_NBA_BASE_URL ?? "https://v1.basketball.api-sports.io").trim().replace(/\/+$/, "");
const APISPORTS_NFL_BASE_URL = String(process.env.APISPORTS_NFL_BASE_URL ?? "https://v1.american-football.api-sports.io").trim().replace(/\/+$/, "");
const HEARTBEAT_POLL_MS = Math.max(2500, Number.parseInt(String(process.env.HEARTBEAT_POLL_MS ?? "2500"), 10) || 2500);
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function parseRows(payload: unknown): Record<string, unknown>[] {
  const rows = toRecord(payload).response;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => toRecord(row));
}

function num(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function isoDateFromOffset(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function apiSportsGet(baseUrl: string, path: string): Promise<Record<string, unknown>[]> {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": APISPORTS_API_KEY,
      accept: "application/json",
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`API-Sports request failed (${response.status}) for ${url}`);
  }
  return parseRows(json);
}

function buildPlayerName(row: Record<string, unknown>, playerId: number): string {
  const first = String(getPath(row, ["player", "firstname"]) ?? getPath(row, ["player", "first_name"]) ?? "").trim();
  const last = String(getPath(row, ["player", "lastname"]) ?? getPath(row, ["player", "last_name"]) ?? "").trim();
  const full = String(getPath(row, ["player", "name"]) ?? "").trim();
  const combined = `${first} ${last}`.trim();
  return combined || full || `Player ${playerId}`;
}

function nbaFantasyPoints(row: Record<string, unknown>): number {
  const pts = num(row.points, getPath(row, ["statistics", "points"]), row.pts);
  const reb = num(row.rebounds, getPath(row, ["rebounds", "total"]), row.totReb, row.reb);
  const ast = num(row.assists, row.ast);
  const stl = num(row.steals, row.stl);
  const blk = num(row.blocks, row.blk);
  const tov = num(row.turnovers, row.ball_losses, row.to);
  return Number((pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 - tov).toFixed(2));
}

function nflFantasyPoints(row: Record<string, unknown>): number {
  const passYds = num(getPath(row, ["passing", "yards"]), row.pass_yds);
  const passTd = num(getPath(row, ["passing", "touchdowns"]), row.pass_td);
  const rushYds = num(getPath(row, ["rushing", "yards"]), row.rush_yds);
  const rushTd = num(getPath(row, ["rushing", "touchdowns"]), row.rush_td);
  const recYds = num(getPath(row, ["receiving", "yards"]), row.rec_yds);
  const recTd = num(getPath(row, ["receiving", "touchdowns"]), row.rec_td);
  const receptions = num(getPath(row, ["receiving", "receptions"]), row.rec);
  const interceptions = num(getPath(row, ["passing", "interceptions"]), row.int);
  const fumblesLost = num(getPath(row, ["fumbles", "lost"]), row.fum_lost);
  const tackles = num(getPath(row, ["defense", "tackles_total"]), row.tackles);
  const sacks = num(getPath(row, ["defense", "sacks"]), row.sacks);
  const defInt = num(getPath(row, ["defense", "interceptions"]), row.def_int);

  const score =
    passYds / 25 +
    passTd * 4 +
    rushYds / 10 +
    rushTd * 6 +
    recYds / 10 +
    recTd * 6 +
    receptions +
    tackles +
    sacks * 2 +
    defInt * 2 -
    interceptions * 2 -
    fumblesLost * 2;

  return Number(Math.max(0, score).toFixed(2));
}

const SPORT_CONFIG: Record<SportSlug, SportConfig> = {
  nba: {
    slug: "nba",
    sportKey: "basketball_nba",
    baseUrl: APISPORTS_NBA_BASE_URL,
    gameStatusLive: new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HT", "BT", "LIVE", "IN PLAY"]),
    gameStatusFinal: new Set(["FT", "AOT", "FINAL"]),
    buildGameStatsPath: (gameId: string) => `/games/statistics/players?id=${encodeURIComponent(gameId)}`,
    toFantasyPoints: nbaFantasyPoints,
  },
  nfl: {
    slug: "nfl",
    sportKey: "americanfootball_nfl",
    baseUrl: APISPORTS_NFL_BASE_URL,
    gameStatusLive: new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HALFTIME", "LIVE", "IN PLAY"]),
    gameStatusFinal: new Set(["FT", "AOT", "FINAL"]),
    buildGameStatsPath: (gameId: string) => `/players/statistics?game=${encodeURIComponent(gameId)}`,
    toFantasyPoints: nflFantasyPoints,
  },
};

function isLiveGame(row: Record<string, unknown>, config: SportConfig): boolean {
  const status = String(getPath(row, ["status", "short"]) ?? getPath(row, ["status", "long"]) ?? "").trim().toUpperCase();
  return config.gameStatusLive.has(status);
}

async function runCycle(config: SportConfig): Promise<void> {
  const candidateDates = [isoDateFromOffset(-1), isoDateFromOffset(0), isoDateFromOffset(1)];
  const gameRows = (
    await Promise.all(candidateDates.map((date) => apiSportsGet(config.baseUrl, `/games?date=${encodeURIComponent(date)}`)))
  ).flat();

  const liveGames = gameRows.filter((row) => isLiveGame(row, config));
  if (liveGames.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();
  for (const game of liveGames) {
    const gameId = String(getPath(game, ["id"]) ?? "").trim();
    if (!gameId) {
      continue;
    }
    const leagueName = String(getPath(game, ["league", "name"]) ?? "").trim();
    const leagueId = Math.round(num(getPath(game, ["league", "id"]))) || null;
    const gameStatus = String(getPath(game, ["status", "short"]) ?? "").trim();
    const playerRows = await apiSportsGet(config.baseUrl, config.buildGameStatsPath(gameId));

    const upsertRows: Array<Record<string, unknown>> = [];
    for (const row of playerRows) {
      const playerId = Math.round(num(getPath(row, ["player", "id"])));
      if (!Number.isFinite(playerId) || playerId <= 0) {
        continue;
      }
      const totalFantasyPoints = config.toFantasyPoints(row);
      const teamId = Math.round(num(getPath(row, ["team", "id"]))) || null;
      const teamName = String(getPath(row, ["team", "name"]) ?? "").trim();
      upsertRows.push({
        game_id: gameId,
        player_id: playerId,
        player_name: buildPlayerName(row, playerId),
        team_id: teamId,
        team_name: teamName,
        league_id: leagueId,
        league_name: leagueName,
        game_status: gameStatus,
        total_fantasy_points: totalFantasyPoints,
        source_updated_at: nowIso,
        sport_key: config.sportKey,
        stat_type: "fantasy_points_total",
        value: totalFantasyPoints,
      });
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase.from("live_player_stats").upsert(upsertRows, { onConflict: "game_id,player_id" });
      if (error) {
        throw new Error(`Supabase upsert failed for game ${gameId}: ${error.message}`);
      }
    }
  }
}

async function runHeartbeat(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!APISPORTS_API_KEY) {
    throw new Error("Missing APISPORTS_API_KEY.");
  }
  const config = SPORT_CONFIG[ACTIVE_SPORT] ?? SPORT_CONFIG.nba;
  console.log(`[heartbeat] Starting stat heartbeat for ${config.slug.toUpperCase()} (${config.sportKey}) every ${HEARTBEAT_POLL_MS}ms.`);

  // Persistent process intended for Railway/background worker.
  while (true) {
    const started = Date.now();
    try {
      await runCycle(config);
      console.log(`[heartbeat] ${new Date().toISOString()} cycle complete.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown heartbeat failure.";
      console.error(`[heartbeat] ${new Date().toISOString()} ${message}`);
    }
    const elapsed = Date.now() - started;
    const delay = Math.max(0, HEARTBEAT_POLL_MS - elapsed);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

void runHeartbeat();
