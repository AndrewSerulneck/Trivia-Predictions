import { createClient } from "@supabase/supabase-js";

type SportSlug = "nba" | "nfl";

type SportConfig = {
  slug: SportSlug;
  sportKey: string;
  baseUrl: string;
  gameStatusLive: Set<string>;
  gameStatusFinal: Set<string>;
  buildLiveGamesPath: () => string;
  buildGameStatsPath: (gameId: string) => string;
  toFantasyPoints: (row: Record<string, unknown>) => number;
};

type CycleMetrics = {
  liveGames: number;
  scannedPlayers: number;
  upsertedRows: number;
  queuedChangedRows: number;
  skippedUnchangedRows: number;
  changedRows: number;
  staleRows: number;
  maxSourceLagMs: number;
  avgSourceLagMs: number;
  apiCalls: number;
};

const ACTIVE_SPORT = String(process.env.ACTIVE_SPORT ?? "nba").trim().toLowerCase() as SportSlug;
const APISPORTS_PROVIDER = String(process.env.APISPORTS_PROVIDER ?? "direct").trim().toLowerCase();
const APISPORTS_API_KEY = String(process.env.APISPORTS_API_KEY ?? "").trim();
const APISPORTS_NBA_BASE_URL = String(process.env.APISPORTS_NBA_BASE_URL ?? "https://v2.nba.api-sports.io").trim().replace(/\/+$/, "");
const APISPORTS_NFL_BASE_URL = String(process.env.APISPORTS_NFL_BASE_URL ?? "https://v1.american-football.api-sports.io").trim().replace(/\/+$/, "");
const APISPORTS_RAPIDAPI_KEY = String(process.env.APISPORTS_RAPIDAPI_KEY ?? APISPORTS_API_KEY).trim();
const APISPORTS_NBA_RAPIDAPI_HOST = String(process.env.APISPORTS_NBA_RAPIDAPI_HOST ?? "api-nba-v1.p.rapidapi.com").trim();
const HEARTBEAT_POLL_MS = Math.max(2500, Number.parseInt(String(process.env.HEARTBEAT_POLL_MS ?? "2500"), 10) || 2500);
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const SHADOW_MISMATCH_WINDOW_MS = 5 * 60 * 1000;
const processStartedAtMs = Date.now();

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

function normalizeName(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const headers: Record<string, string> = { accept: "application/json" };
  if (APISPORTS_PROVIDER === "rapidapi") {
    headers["x-rapidapi-key"] = APISPORTS_RAPIDAPI_KEY;
    headers["x-rapidapi-host"] = APISPORTS_NBA_RAPIDAPI_HOST;
  } else {
    headers["x-apisports-key"] = APISPORTS_API_KEY;
  }
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`API-Sports request failed (${response.status}) for ${url}`);
  }
  return parseRows(json);
}

function parseIsoMs(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
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
    sportKey: "nba",
    baseUrl: APISPORTS_NBA_BASE_URL,
    gameStatusLive: new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HT", "BT", "LIVE", "IN PLAY"]),
    gameStatusFinal: new Set(["FT", "AOT", "FINAL"]),
    buildLiveGamesPath: () => "/games?live=all",
    buildGameStatsPath: (gameId: string) => `/games/statistics/players?id=${encodeURIComponent(gameId)}`,
    toFantasyPoints: nbaFantasyPoints,
  },
  nfl: {
    slug: "nfl",
    sportKey: "nfl",
    baseUrl: APISPORTS_NFL_BASE_URL,
    gameStatusLive: new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HALFTIME", "LIVE", "IN PLAY"]),
    gameStatusFinal: new Set(["FT", "AOT", "FINAL"]),
    buildLiveGamesPath: () => `/games?date=${encodeURIComponent(isoDateFromOffset(0))}`,
    buildGameStatsPath: (gameId: string) => `/players/statistics?game=${encodeURIComponent(gameId)}`,
    toFantasyPoints: nflFantasyPoints,
  },
};

function isLiveGame(row: Record<string, unknown>, config: SportConfig): boolean {
  const status = String(getPath(row, ["status", "short"]) ?? getPath(row, ["status", "long"]) ?? "").trim().toUpperCase();
  return config.gameStatusLive.has(status);
}

async function loadTrackedFantasyIdentityMap(): Promise<Map<string, { playerId: number; playerName: string; entryId: string }>> {
  const map = new Map<string, { playerId: number; playerName: string; entryId: string }>();
  const nowMs = Date.now();
  const fromIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(nowMs + 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("fantasy_entries")
    .select("id,lineup,status,sport_key,starts_at")
    .in("status", ["pending", "live"])
    .in("sport_key", ["basketball_nba", "nba"])
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .limit(5000);
  if (error) {
    throw new Error(`Failed to load fantasy identity map: ${error.message}`);
  }
  for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
    const entryId = String(row.id ?? "").trim();
    const lineup = row.lineup;
    if (!Array.isArray(lineup)) continue;
    for (const player of lineup) {
      if (!player || typeof player !== "object" || Array.isArray(player)) continue;
      const raw = player as Record<string, unknown>;
      const playerId = Math.trunc(num(raw.player_id, raw.playerId));
      const playerName = String(raw.player_name ?? raw.playerName ?? "").trim();
      if (!playerName || !Number.isFinite(playerId) || playerId <= 0) continue;
      const key = normalizeName(playerName);
      if (!key || map.has(key)) continue;
      map.set(key, { playerId, playerName, entryId });
    }
  }
  return map;
}

async function runCycle(config: SportConfig): Promise<CycleMetrics> {
  const metrics: CycleMetrics = {
    liveGames: 0,
    scannedPlayers: 0,
    upsertedRows: 0,
    queuedChangedRows: 0,
    skippedUnchangedRows: 0,
    changedRows: 0,
    staleRows: 0,
    maxSourceLagMs: 0,
    avgSourceLagMs: 0,
    apiCalls: 0,
  };
  metrics.apiCalls += 1;
  const gameRows = await apiSportsGet(config.baseUrl, config.buildLiveGamesPath());

  const liveGames = gameRows.filter((row) => isLiveGame(row, config));
  metrics.liveGames = liveGames.length;
  if (liveGames.length === 0) {
    return metrics;
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const sourceLagSamples: number[] = [];
  const trackedIdentityByName = config.slug === "nba" ? await loadTrackedFantasyIdentityMap() : new Map<string, { playerId: number; playerName: string; entryId: string }>();
  const matchedTrackedNames = new Set<string>();
  for (const game of liveGames) {
    const gameId = String(getPath(game, ["id"]) ?? "").trim();
    if (!gameId) {
      continue;
    }
    const leagueName = String(getPath(game, ["league", "name"]) ?? "").trim();
    const leagueId = Math.round(num(getPath(game, ["league", "id"]))) || null;
    const gameStatus = String(getPath(game, ["status", "short"]) ?? "").trim();
    metrics.apiCalls += 1;
    const playerRows = await apiSportsGet(config.baseUrl, config.buildGameStatsPath(gameId));

    const allRows: Array<Record<string, unknown>> = [];
    const playerIds: number[] = [];
    for (const row of playerRows) {
      const playerId = Math.round(num(getPath(row, ["player", "id"])));
      if (!Number.isFinite(playerId) || playerId <= 0) {
        continue;
      }
      const totalFantasyPoints = config.toFantasyPoints(row);
      const rawPlayerName = buildPlayerName(row, playerId);
      const normalizedPlayerName = normalizeName(rawPlayerName);
      let resolvedPlayerId = playerId;
      const trackedIdentity = trackedIdentityByName.get(normalizedPlayerName);
      if (trackedIdentity && trackedIdentity.playerId > 0 && trackedIdentity.playerId !== playerId) {
        if (Date.now() - processStartedAtMs <= SHADOW_MISMATCH_WINDOW_MS) {
          console.log(
            `[heartbeat-shadow] id_mismatch_resolved name="${rawPlayerName}" incoming_player_id=${playerId} mapped_player_id=${trackedIdentity.playerId} entry_id=${trackedIdentity.entryId}`
          );
        }
        resolvedPlayerId = trackedIdentity.playerId;
      }
      if (trackedIdentity) {
        matchedTrackedNames.add(normalizedPlayerName);
      }
      playerIds.push(resolvedPlayerId);
      const teamId = Math.round(num(getPath(row, ["team", "id"]))) || null;
      const teamName = String(getPath(row, ["team", "name"]) ?? "").trim();
      allRows.push({
        game_id: gameId,
        player_id: resolvedPlayerId,
        player_name: rawPlayerName,
        normalized_player_name: normalizedPlayerName,
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
    metrics.scannedPlayers += allRows.length;

    if (allRows.length > 0) {
      const { data: previousRows, error: previousError } = await supabase
        .from("live_player_stats")
        .select("player_id,total_fantasy_points,game_status,source_updated_at")
        .eq("game_id", gameId)
        .in("player_id", playerIds);
      if (previousError) {
        throw new Error(`Supabase pre-read failed for game ${gameId}: ${previousError.message}`);
      }
      const previousByPlayer = new Map<number, Record<string, unknown>>();
      for (const row of (previousRows as Array<Record<string, unknown>> | null) ?? []) {
        const id = Math.round(num(row.player_id));
        if (id > 0) previousByPlayer.set(id, row);
      }
      const upsertRows: Array<Record<string, unknown>> = [];
      for (const row of allRows) {
        const id = Math.round(num(row.player_id));
        const prev = previousByPlayer.get(id);
        const nextPoints = Number(num(row.total_fantasy_points).toFixed(2));
        const prevPoints = Number(num(prev?.total_fantasy_points).toFixed(2));
        const nextStatus = String(row.game_status ?? "");
        const prevStatus = String(prev?.game_status ?? "");
        const prevTs = parseIsoMs(prev?.source_updated_at);
        const lagMs = prevTs ? Math.max(0, nowMs - prevTs) : 0;
        sourceLagSamples.push(lagMs);
        if (!prev || Math.abs(nextPoints - prevPoints) >= 0.01 || nextStatus !== prevStatus) {
          metrics.changedRows += 1;
          upsertRows.push(row);
        } else {
          metrics.staleRows += 1;
        }
      }
      metrics.queuedChangedRows += upsertRows.length;
      metrics.skippedUnchangedRows += allRows.length - upsertRows.length;

      if (upsertRows.length > 0) {
        const { error } = await supabase.from("live_player_stats").upsert(upsertRows, { onConflict: "game_id,player_id" });
        if (error) {
          throw new Error(`Supabase upsert failed for game ${gameId}: ${error.message}`);
        }
        metrics.upsertedRows += upsertRows.length;
      }
    }
  }
  if (sourceLagSamples.length > 0) {
    const total = sourceLagSamples.reduce((sum, value) => sum + value, 0);
    metrics.avgSourceLagMs = Math.round(total / sourceLagSamples.length);
    metrics.maxSourceLagMs = Math.max(...sourceLagSamples);
  }
  if (config.slug === "nba" && Date.now() - processStartedAtMs <= SHADOW_MISMATCH_WINDOW_MS && trackedIdentityByName.size > 0) {
    const unresolved: string[] = [];
    for (const [nameKey, identity] of trackedIdentityByName) {
      if (!matchedTrackedNames.has(nameKey)) {
        unresolved.push(`${identity.playerName}#${identity.playerId}`);
      }
      if (unresolved.length >= 10) break;
    }
    if (unresolved.length > 0) {
      console.log(`[heartbeat-shadow] unresolved_tracked_players sample=${JSON.stringify(unresolved)}`);
    }
  }
  return metrics;
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
      const metrics = await runCycle(config);
      const now = new Date().toISOString();
      console.log(
        `[heartbeat] ${now} cycle complete live_games=${metrics.liveGames} api_calls=${metrics.apiCalls} scanned=${metrics.scannedPlayers} queued_changed=${metrics.queuedChangedRows} upserted=${metrics.upsertedRows} skipped_unchanged=${metrics.skippedUnchangedRows} changed=${metrics.changedRows} stale=${metrics.staleRows} avg_source_lag_ms=${metrics.avgSourceLagMs} max_source_lag_ms=${metrics.maxSourceLagMs}`
      );
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
