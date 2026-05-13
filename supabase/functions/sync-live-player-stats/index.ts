// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApiSportsGameRow = Record<string, unknown>;
type ApiSportsPlayerRow = Record<string, unknown>;

type SyncResult = {
  ok: boolean;
  scannedGames: number;
  activeGames: number;
  scannedPlayers: number;
  upsertedPlayers: number;
  errors: string[];
};

type LoopSyncResult = SyncResult & {
  cycles: number;
  pollMs: number;
  loopMs: number;
};
type DiscoveryMode = "live_only" | "date_scan" | "live_then_date";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const APISPORTS_PROVIDER = (Deno.env.get("APISPORTS_PROVIDER")?.trim().toLowerCase() ?? "direct");
const APISPORTS_KEY = Deno.env.get("APISPORTS_API_KEY")?.trim() ?? "";
const APISPORTS_RAPIDAPI_KEY = Deno.env.get("APISPORTS_RAPIDAPI_KEY")?.trim() ?? APISPORTS_KEY;
const APISPORTS_NBA_RAPIDAPI_HOST = Deno.env.get("APISPORTS_NBA_RAPIDAPI_HOST")?.trim() ?? "api-nba-v1.p.rapidapi.com";
const APISPORTS_BASE_URL = (Deno.env.get("APISPORTS_NBA_BASE_URL")?.trim() ?? "https://v2.nba.api-sports.io").replace(/\/+$/, "");
const APISPORTS_REQUEST_DELAY_MS = Math.max(0, Number.parseInt(Deno.env.get("APISPORTS_REQUEST_DELAY_MS") ?? "25", 10) || 25);
const APISPORTS_MAX_GAMES_PER_RUN = Math.max(1, Number.parseInt(Deno.env.get("APISPORTS_MAX_GAMES_PER_RUN") ?? "24", 10) || 24);
const APISPORTS_TARGET_LEAGUE_ID = Number.parseInt(Deno.env.get("APISPORTS_TARGET_LEAGUE_ID") ?? "", 10) || 0;
const APISPORTS_FINAL_REPLAY_WINDOW_MS = Math.max(
  0,
  Number.parseInt(Deno.env.get("APISPORTS_FINAL_REPLAY_WINDOW_MS") ?? String(6 * 60 * 60 * 1000), 10) || 6 * 60 * 60 * 1000
);
const APISPORTS_ACTIVE_POLL_MS = Math.max(20000, Number.parseInt(Deno.env.get("FANTASY_LIVE_SYNC_ACTIVE_POLL_MS") ?? "20000", 10) || 20000);
const APISPORTS_INACTIVE_POLL_MS = Math.max(
  30 * 60 * 1000,
  Number.parseInt(Deno.env.get("FANTASY_LIVE_SYNC_INACTIVE_POLL_MS") ?? String(30 * 60 * 1000), 10) || 30 * 60 * 1000
);
const APISPORTS_DEFAULT_POLL_MS = APISPORTS_ACTIVE_POLL_MS;
const APISPORTS_DEFAULT_LOOP_MS = Math.max(15000, Number.parseInt(Deno.env.get("FANTASY_LIVE_SYNC_LOOP_MS") ?? "60000", 10) || 60000);
const APISPORTS_FINAL_REPLAY_EVERY_CYCLE = Math.max(
  0,
  Number.parseInt(Deno.env.get("FANTASY_LIVE_SYNC_FINAL_REPLAY_EVERY_CYCLE") ?? "6", 10) || 6
);
const FANTASY_TRACK_ONLY_ROSTERED_PLAYERS =
  String(Deno.env.get("FANTASY_TRACK_ONLY_ROSTERED_PLAYERS") ?? "true").trim().toLowerCase() !== "false";
const FANTASY_TRACKED_LOOKBACK_HOURS = Math.max(
  1,
  Number.parseInt(Deno.env.get("FANTASY_TRACKED_LOOKBACK_HOURS") ?? "24", 10) || 24
);
const FANTASY_TRACKED_LOOKAHEAD_HOURS = Math.max(
  1,
  Number.parseInt(Deno.env.get("FANTASY_TRACKED_LOOKAHEAD_HOURS") ?? "36", 10) || 36
);
const SHADOW_MISMATCH_WINDOW_MS = 5 * 60 * 1000;
const processStartedAtMs = Date.now();
const NBA_DISCOVERY_MODE = (String(Deno.env.get("NBA_DISCOVERY_MODE") ?? "live_then_date").trim().toLowerCase() ||
  "live_then_date") as DiscoveryMode;
const NBA_FORCE_GAME_IDS = String(Deno.env.get("NBA_FORCE_GAME_IDS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> {
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
function pickPath(source: unknown, pathOptions: string[][]): unknown {
  for (const path of pathOptions) {
    const value = getPath(source, path);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function pickNumber(row: Record<string, unknown>, pathOptions: string[][]): number {
  for (const path of pathOptions) {
    const parsed = parseNumber(getPath(row, path));
    if (Number.isFinite(parsed) && parsed !== 0) {
      return parsed;
    }
  }
  return 0;
}

function parseRows(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json);
  const response = root.response;
  if (!Array.isArray(response)) {
    return [];
  }
  return response.map((row) => asRecord(row));
}

function parseStatisticsPlayersRows(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json);
  const response = root.response;
  if (!Array.isArray(response)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const teamBlock of response) {
    const teamRecord = asRecord(teamBlock);
    const team = asRecord(teamRecord.team);
    const statsContainer = teamRecord.statistics;
    const candidateStats = Array.isArray(statsContainer) ? statsContainer.map((item) => asRecord(item)) : [asRecord(statsContainer)];
    for (const statsRecord of candidateStats) {
      const players = statsRecord.players;
      if (!Array.isArray(players)) {
        continue;
      }
      for (const player of players) {
        const playerRow = asRecord(player);
        const playerStats = asRecord(playerRow.statistics);
        rows.push({
          player: asRecord(playerRow.player),
          team,
          points: getPath(playerStats, ["points"]) ?? getPath(playerStats, ["pts"]) ?? playerRow.points ?? playerRow.pts,
          rebounds:
            getPath(playerStats, ["rebounds", "total"]) ??
            getPath(playerStats, ["rebounds"]) ??
            playerRow.rebounds ??
            playerRow.reb,
          assists: getPath(playerStats, ["assists"]) ?? playerRow.assists ?? playerRow.ast,
          steals: getPath(playerStats, ["steals"]) ?? playerRow.steals ?? playerRow.stl,
          blocks: getPath(playerStats, ["blocks"]) ?? playerRow.blocks ?? playerRow.blk,
          turnovers:
            getPath(playerStats, ["turnovers"]) ?? getPath(playerStats, ["ball_losses"]) ?? playerRow.turnovers ?? playerRow.to,
        });
      }
    }
  }
  return rows;
}
function parseGameId(row: Record<string, unknown>): string {
  return String(pickPath(row, [["id"], ["game", "id"], ["fixture", "id"]]) ?? "").trim();
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

function buildNameKeys(value: string): string[] {
  const normalized = normalizeName(value);
  if (!normalized) {
    return [];
  }
  const keys = new Set<string>([normalized]);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 2) {
    keys.add(`${tokens[1]} ${tokens[0]}`);
  }
  return Array.from(keys);
}

function buildPlayerName(player: Record<string, unknown>, playerId: number): string {
  const first = String(getPath(player, ["player", "firstname"]) ?? getPath(player, ["player", "first_name"]) ?? "").trim();
  const last = String(getPath(player, ["player", "lastname"]) ?? getPath(player, ["player", "last_name"]) ?? "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) {
    return combined;
  }
  const direct = String(getPath(player, ["player", "name"]) ?? "").trim();
  if (direct) {
    return direct;
  }
  return `Player ${Math.round(playerId)}`;
}

function normalizePlayerRow(raw: Record<string, unknown>): Record<string, unknown> {
  const player = asRecord(raw.player);
  const team = asRecord(raw.team);
  const stats = asRecord(raw.statistics);
  if (Object.keys(player).length > 0 || Object.keys(team).length > 0 || Object.keys(stats).length > 0) {
    return raw;
  }
  return {
    player: {
      id: raw.player_id ?? raw.playerId ?? getPath(raw, ["player", "id"]),
      firstname: raw.firstname ?? raw.first_name ?? raw.player_first_name,
      lastname: raw.lastname ?? raw.last_name ?? raw.player_last_name,
      name: raw.player_name ?? raw.name,
    },
    team: {
      id: raw.team_id ?? raw.teamId ?? getPath(raw, ["team", "id"]),
      name: raw.team_name ?? raw.teamName ?? getPath(raw, ["team", "name"]),
    },
    points: raw.points ?? raw.pts ?? getPath(raw, ["statistics", "points"]),
    rebounds: raw.rebounds ?? raw.reb ?? getPath(raw, ["statistics", "rebounds", "total"]),
    assists: raw.assists ?? raw.ast ?? getPath(raw, ["statistics", "assists"]),
    steals: raw.steals ?? raw.stl ?? getPath(raw, ["statistics", "steals"]),
    blocks: raw.blocks ?? raw.blk ?? getPath(raw, ["statistics", "blocks"]),
    turnovers: raw.turnovers ?? raw.to ?? getPath(raw, ["statistics", "turnovers"]),
  };
}

function toFantasyPoints(pts: number, reb: number, ast: number, stl: number, blk: number, turnovers: number): number {
  const total = pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 - turnovers;
  return Number(Math.max(0, total).toFixed(2));
}

async function fetchApiSports(pathWithQuery: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  if (!APISPORTS_BASE_URL || !APISPORTS_KEY) {
    return { rows: [], error: "Missing APISPORTS_NBA_BASE_URL or APISPORTS_API_KEY." };
  }
  const url = `${APISPORTS_BASE_URL}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (APISPORTS_PROVIDER === "rapidapi") {
    headers["x-rapidapi-key"] = APISPORTS_RAPIDAPI_KEY;
    headers["x-rapidapi-host"] = APISPORTS_NBA_RAPIDAPI_HOST;
  } else {
    headers["x-apisports-key"] = APISPORTS_KEY;
  }
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  const json = await response.json().catch(() => null);
  const rows = parseRows(json);
  const errors = asRecord(json).errors;
  if (!response.ok) {
    return { rows, error: `HTTP ${response.status}` };
  }
  if (errors && Object.keys(asRecord(errors)).length > 0 && rows.length === 0) {
    const detail = JSON.stringify(errors);
    return { rows, error: `API errors: ${detail}` };
  }
  return { rows };
}

async function fetchGameStatsViaPath(gameId: string, path: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const url = `${APISPORTS_BASE_URL}${path}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (APISPORTS_PROVIDER === "rapidapi") {
    headers["x-rapidapi-key"] = APISPORTS_RAPIDAPI_KEY;
    headers["x-rapidapi-host"] = APISPORTS_NBA_RAPIDAPI_HOST;
  } else {
    headers["x-apisports-key"] = APISPORTS_KEY;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { method: "GET", headers });
    const json = await response.json().catch(() => null);
    const rows =
      path.startsWith("/games/statistics?")
        ? parseStatisticsPlayersRows(json)
        : parseRows(json).map((row) => normalizePlayerRow(asRecord(row)));
    if (response.status === 429 && attempt === 0) {
      await sleep(5000);
      continue;
    }
    if (!response.ok) {
      return { rows, error: `HTTP ${response.status}` };
    }
    const errors = asRecord(asRecord(json).errors);
    if (Object.keys(errors).length > 0 && rows.length === 0) {
      return { rows, error: `API errors: ${JSON.stringify(errors)}` };
    }
    return { rows };
  }

  return { rows: [], error: `HTTP 429 retry exhausted for ${path}` };
}

async function fetchGameStats(gameId: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const paths = [
    `/games/statistics?id=${encodeURIComponent(gameId)}`,
    `/games/statistics/players?id=${encodeURIComponent(gameId)}`,
    `/players/statistics?game=${encodeURIComponent(gameId)}`,
  ];

  const attemptedErrors: string[] = [];
  for (const path of paths) {
    const result = await fetchGameStatsViaPath(gameId, path);
    if (!result.error && result.rows.length > 0) {
      if (path !== paths[0]) {
        console.log(`[sync] game=${gameId} using stats fallback endpoint ${path}`);
      }
      return result;
    }
    if (!result.error && result.rows.length === 0) {
      attemptedErrors.push(`${path}: empty response`);
      continue;
    }
    attemptedErrors.push(`${path}: ${result.error}`);
  }

  return { rows: [], error: attemptedErrors.join(" | ") || "No supported stats endpoint returned data." };
}

function isFinalStatus(statusShort: string): boolean {
  const key = statusShort.trim().toUpperCase();
  if (!key) return false;
  const finalKeys = new Set(["FT", "AOT", "FINAL"]);
  return finalKeys.has(key);
}

function isLiveStatus(statusShort: string): boolean {
  const key = statusShort.trim().toUpperCase();
  if (!key) return false;
  const liveKeys = new Set(["1C", "2C", "3C", "4C", "Q1", "Q2", "Q3", "Q4", "HT", "BT", "OT", "LIVE", "IN PLAY"]);
  return liveKeys.has(key);
}
function isLiveGameStatus(game: Record<string, unknown>): boolean {
  const short = parseGameStatusShort(game);
  if (isLiveStatus(short)) {
    return true;
  }
  const longStatus = String(getPath(game, ["status", "long"]) ?? "").trim().toUpperCase();
  if (
    ["IN PLAY", "LIVE", "HALFTIME", "Q1", "Q2", "Q3", "Q4", "OVERTIME"].includes(longStatus)
  ) {
    return true;
  }
  const clock = getPath(game, ["status", "clock"]);
  if (clock !== null && clock !== undefined && String(clock).trim() !== "") {
    return true;
  }
  // NBA v2 numeric in-play state.
  if (short === "2") {
    return true;
  }
  return false;
}
function parseGameStatusShort(game: Record<string, unknown>): string {
  return String(pickPath(game, [["status", "short"], ["status", "long"], ["game", "status", "short"], ["fixture", "status", "short"]]) ?? "")
    .trim()
    .toUpperCase();
}

function parseGameStartMs(game: Record<string, unknown>): number | null {
  const iso = String(getPath(game, ["date", "start"]) ?? "").trim();
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatDateUTC(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mergeSyncResults(target: SyncResult, source: SyncResult): void {
  target.ok = target.ok && source.ok;
  target.scannedGames += source.scannedGames;
  target.activeGames += source.activeGames;
  target.scannedPlayers += source.scannedPlayers;
  target.upsertedPlayers += source.upsertedPlayers;
  target.errors.push(...source.errors);
}

function extractLineupPlayerIds(lineup: unknown): number[] {
  if (!Array.isArray(lineup)) {
    return [];
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of lineup) {
    let parsed = Number.NaN;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      parsed = Number.parseInt(String(row.player_id ?? row.playerId ?? ""), 10);
    } else {
      parsed = Number.parseInt(String(item ?? ""), 10);
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      continue;
    }
    const normalized = Math.trunc(parsed);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

async function loadTrackedRosterPlayerIds(
  supabase: ReturnType<typeof createClient>
): Promise<{ ids: Set<number>; names: Map<string, { playerId: number; playerName: string; entryId: string }>; error?: string }> {
  const nowMs = Date.now();
  const fromIso = new Date(nowMs - FANTASY_TRACKED_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const toIso = new Date(nowMs + FANTASY_TRACKED_LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("fantasy_entries")
    .select("id, lineup, starts_at, status, sport_key")
    .in("sport_key", ["basketball_nba", "nba"])
    .in("status", ["pending", "live"])
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .limit(5000);

  if (error) {
    return { ids: new Set<number>(), names: new Map(), error: `Failed to load tracked fantasy roster players: ${error.message}` };
  }

  const ids = new Set<number>();
  const names = new Map<string, { playerId: number; playerName: string; entryId: string }>();
  for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
    const entryId = String(row.id ?? "").trim();
    for (const id of extractLineupPlayerIds(row.lineup)) {
      ids.add(id);
    }
    if (Array.isArray(row.lineup)) {
      for (const player of row.lineup) {
        if (!player || typeof player !== "object" || Array.isArray(player)) continue;
        const raw = player as Record<string, unknown>;
        const playerId = Number.parseInt(String(raw.player_id ?? raw.playerId ?? ""), 10);
        const playerName = String(raw.player_name ?? raw.playerName ?? "").trim();
        if (!Number.isFinite(playerId) || playerId <= 0 || !playerName) continue;
        for (const key of buildNameKeys(playerName)) {
          if (!key || names.has(key)) continue;
          names.set(key, { playerId, playerName, entryId });
        }
      }
    }
  }
  return { ids, names };
}

async function syncLivePlayerStatsCycle(options?: { includeRecentFinals?: boolean }): Promise<SyncResult> {
  const result: SyncResult = {
    ok: true,
    scannedGames: 0,
    activeGames: 0,
    scannedPlayers: 0,
    upsertedPlayers: 0,
    errors: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ...result, ok: false, errors: ["Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."] };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let combinedRows: Record<string, unknown>[] = [];
  if (NBA_FORCE_GAME_IDS.length > 0) {
    combinedRows = NBA_FORCE_GAME_IDS.map((id) => ({ id, status: { short: "LIVE" } }));
    console.log(`[sync] using NBA_FORCE_GAME_IDS (${NBA_FORCE_GAME_IDS.length})`);
  } else if (NBA_DISCOVERY_MODE !== "date_scan") {
    const liveGamesResponse = await fetchApiSports("/games?live=all");
    if (liveGamesResponse.error) {
      result.errors.push(liveGamesResponse.error);
    }
    combinedRows = liveGamesResponse.rows;
    console.log(`[sync] discovery live endpoint rows=${combinedRows.length}`);
  }
  if (combinedRows.length === 0 && NBA_DISCOVERY_MODE !== "live_only") {
    const candidateDates = [formatDateUTC(-1), formatDateUTC(0), formatDateUTC(1)];
    const gameRowsByDate = await Promise.all(
      candidateDates.map((date) => fetchApiSports(`/games?date=${encodeURIComponent(date)}`))
    );
    const fallbackRows: Record<string, unknown>[] = [];
    for (const batch of gameRowsByDate) {
      if (batch.error) {
        result.errors.push(batch.error);
        continue;
      }
      fallbackRows.push(...batch.rows);
    }
    combinedRows = fallbackRows;
    console.log(`[sync] discovery date-scan rows=${combinedRows.length}`);
  }
  if (combinedRows.length === 0) {
    result.ok = result.errors.length === 0;
    return result;
  }

  const includeRecentFinals = options?.includeRecentFinals === true;

  let games = combinedRows.filter((game) => {
    if (isLiveGameStatus(game)) {
      return true;
    }
    const short = parseGameStatusShort(game);
    if (!includeRecentFinals || !isFinalStatus(short)) {
      return false;
    }
    const startMs = parseGameStartMs(game);
    if (!Number.isFinite(startMs)) {
      return false;
    }
    // Do not keep replaying stale finals from prior days; only keep recent finals for end-of-game reconciliation.
    return Date.now() - startMs <= APISPORTS_FINAL_REPLAY_WINDOW_MS;
  }) as ApiSportsGameRow[];

  if (APISPORTS_TARGET_LEAGUE_ID > 0) {
    games = games.filter((game) => Number(getPath(game, ["league", "id"]) ?? 0) === APISPORTS_TARGET_LEAGUE_ID);
  } else {
    const nbaGames = games.filter((game) => String(getPath(game, ["league", "name"]) ?? "").toLowerCase().includes("nba"));
    if (nbaGames.length > 0) {
      games = nbaGames;
    }
  }

  games = games.slice(0, APISPORTS_MAX_GAMES_PER_RUN);

  result.scannedGames = games.length;
  result.activeGames = games.filter((game) => isLiveGameStatus(game)).length;

  let trackedRosterPlayerIds: Set<number> | null = null;
  let trackedRosterPlayersByName: Map<string, { playerId: number; playerName: string; entryId: string }> = new Map();
  if (FANTASY_TRACK_ONLY_ROSTERED_PLAYERS) {
    const tracked = await loadTrackedRosterPlayerIds(supabase);
    if (tracked.error) {
      result.errors.push(tracked.error);
    } else {
      trackedRosterPlayerIds = tracked.ids;
      trackedRosterPlayersByName = tracked.names;
      if (trackedRosterPlayerIds.size === 0) {
        result.ok = result.errors.length === 0;
        return result;
      }
    }
  }

  for (const game of games) {
    const gameId = parseGameId(game);
    if (!gameId) {
      continue;
    }

    const playersResponse = await fetchGameStats(gameId);
    if (playersResponse.error) {
      result.errors.push(`game ${gameId}: ${playersResponse.error}`);
      await sleep(APISPORTS_REQUEST_DELAY_MS);
      continue;
    }

    const leagueId = parseNumber(getPath(game, ["league", "id"])) || null;
    const leagueName = String(getPath(game, ["league", "name"]) ?? "").trim();
    const statusShort = parseGameStatusShort(game);
    const nowIso = new Date().toISOString();

    const upsertRows: Array<Record<string, unknown>> = [];

    for (const playerRaw of playersResponse.rows as ApiSportsPlayerRow[]) {
      const player = normalizePlayerRow(asRecord(playerRaw));
      const playerId = parseNumber(getPath(player, ["player", "id"]));
      if (!Number.isFinite(playerId) || playerId <= 0) {
        continue;
      }
      const normalizedPlayerId = Math.round(playerId);
      const playerName = buildPlayerName(player, playerId);
      const normalizedPlayerName = normalizeName(playerName);
      const candidateNameKeys = buildNameKeys(playerName);
      let resolvedPlayerId = normalizedPlayerId;
      const trackedByName = candidateNameKeys
        .map((key) => trackedRosterPlayersByName.get(key))
        .find((value): value is { playerId: number; playerName: string; entryId: string } => Boolean(value));
      if (trackedByName && trackedByName.playerId > 0 && trackedByName.playerId !== normalizedPlayerId) {
        if (Date.now() - processStartedAtMs <= SHADOW_MISMATCH_WINDOW_MS) {
          console.log(
            `[sync-shadow] id_mismatch_resolved name="${playerName}" incoming_player_id=${normalizedPlayerId} mapped_player_id=${trackedByName.playerId} entry_id=${trackedByName.entryId}`
          );
        }
        resolvedPlayerId = trackedByName.playerId;
      }
      if (trackedRosterPlayerIds && !trackedRosterPlayerIds.has(resolvedPlayerId)) {
        continue;
      }
      const teamId = parseNumber(getPath(player, ["team", "id"])) || null;
      const teamName = String(getPath(player, ["team", "name"]) ?? "").trim();

      const pts = pickNumber(player, [["points"], ["statistics", "points"], ["stats", "points"], ["pts"]]);
      const ast = pickNumber(player, [["assists"], ["statistics", "assists"], ["stats", "assists"], ["ast"]]);
      const reb = pickNumber(player, [["rebounds", "total"], ["rebounds"], ["statistics", "rebounds", "total"], ["statistics", "rebounds"], ["totReb"], ["reb"]]);
      const stl = pickNumber(player, [["steals"], ["statistics", "steals"], ["stats", "steals"], ["stl"]]);
      const blk = pickNumber(player, [["blocks"], ["statistics", "blocks"], ["stats", "blocks"], ["blk"]]);
      const turnovers = pickNumber(player, [["turnovers"], ["ball_losses"], ["statistics", "turnovers"], ["statistics", "ball_losses"], ["to"]]);
      const totalFantasyPoints = toFantasyPoints(pts, reb, ast, stl, blk, turnovers);

      upsertRows.push({
        game_id: gameId,
        player_id: resolvedPlayerId,
        player_name: playerName,
        normalized_player_name: normalizedPlayerName,
        team_id: teamId ? Math.round(teamId) : null,
        team_name: teamName,
        league_id: leagueId ? Math.round(leagueId) : null,
        league_name: leagueName,
        game_status: statusShort,
        pts,
        ast,
        reb,
        stl,
        blk,
        turnovers,
        total_fantasy_points: totalFantasyPoints,
        source_updated_at: nowIso,
        sport_key: "nba",
        stat_type: "fantasy_points_total",
        value: totalFantasyPoints,
      });
    }

    result.scannedPlayers += upsertRows.length;
    console.log(`[sync] game=${gameId} player_rows=${upsertRows.length} status=${statusShort}`);

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("live_player_stats")
        .upsert(upsertRows, { onConflict: "game_id,player_id" });
      if (error) {
        result.errors.push(`game ${gameId}: supabase upsert failed: ${error.message}`);
      } else {
        result.upsertedPlayers += upsertRows.length;
      }
    }

    await sleep(APISPORTS_REQUEST_DELAY_MS);
  }

  result.ok = result.errors.length === 0;
  return result;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

async function runHighVelocityLoop(options: { pollMs: number; loopMs: number; finalReplayEveryCycle: number }): Promise<LoopSyncResult> {
  const merged: LoopSyncResult = {
    ok: true,
    scannedGames: 0,
    scannedPlayers: 0,
    upsertedPlayers: 0,
    errors: [],
    cycles: 0,
    pollMs: options.pollMs,
    loopMs: options.loopMs,
  };

  const startedAt = Date.now();
  while (Date.now() - startedAt < options.loopMs) {
    const cycleStartedAt = Date.now();
    const includeRecentFinals =
      options.finalReplayEveryCycle > 0 && (merged.cycles + 1) % options.finalReplayEveryCycle === 0;
    const cycle = await syncLivePlayerStatsCycle({ includeRecentFinals });
    mergeSyncResults(merged, cycle);
    merged.cycles += 1;

    const elapsed = Date.now() - cycleStartedAt;
    const targetPollMs = cycle.activeGames > 0 ? APISPORTS_ACTIVE_POLL_MS : APISPORTS_INACTIVE_POLL_MS;
    const delay = targetPollMs - elapsed;
    if (delay > 0) {
      await sleep(delay);
    }
  }

  merged.ok = merged.errors.length === 0;
  return merged;
}

Deno.serve(async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const burst = clampInt(Number.parseInt(url.searchParams.get("burst") ?? "0", 10), 0, 200);
    const explicitPollMs = Number.parseInt(url.searchParams.get("pollMs") ?? "", 10);
    const legacyIntervalMs = Number.parseInt(url.searchParams.get("intervalMs") ?? "", 10);
    const explicitLoopMs = Number.parseInt(url.searchParams.get("loopMs") ?? "", 10);
    const pollMs = clampInt(
      Number.isFinite(explicitPollMs) && explicitPollMs > 0
        ? explicitPollMs
        : Number.isFinite(legacyIntervalMs) && legacyIntervalMs > 0
        ? legacyIntervalMs
        : APISPORTS_DEFAULT_POLL_MS,
      20000,
      60000
    );
    const loopMsFromBurst = burst > 0 ? burst * pollMs : 0;
    const loopMs = clampInt(
      Number.isFinite(explicitLoopMs) && explicitLoopMs > 0
        ? explicitLoopMs
        : loopMsFromBurst > 0
        ? loopMsFromBurst
        : APISPORTS_DEFAULT_LOOP_MS,
      15000,
      300000
    );
    const finalReplayEveryCycle = clampInt(
      Number.parseInt(url.searchParams.get("finalReplayEveryCycle") ?? String(APISPORTS_FINAL_REPLAY_EVERY_CYCLE), 10),
      0,
      200
    );
    const data = await runHighVelocityLoop({
      pollMs,
      loopMs,
      finalReplayEveryCycle,
    });
    return new Response(JSON.stringify(data), {
      status: data.ok ? 200 : 207,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown sync error.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
