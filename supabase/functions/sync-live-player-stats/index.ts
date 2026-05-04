// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApiSportsGameRow = Record<string, unknown>;
type ApiSportsPlayerRow = Record<string, unknown>;

type SyncResult = {
  ok: boolean;
  scannedGames: number;
  scannedPlayers: number;
  upsertedPlayers: number;
  errors: string[];
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const APISPORTS_KEY = Deno.env.get("APISPORTS_API_KEY")?.trim() ?? "";
const APISPORTS_BASE_URL = (Deno.env.get("APISPORTS_NBA_BASE_URL")?.trim() ?? "https://v1.basketball.api-sports.io").replace(/\/+$/, "");
const APISPORTS_REQUEST_DELAY_MS = Math.max(0, Number.parseInt(Deno.env.get("APISPORTS_REQUEST_DELAY_MS") ?? "180", 10) || 180);
const APISPORTS_MAX_GAMES_PER_RUN = Math.max(1, Number.parseInt(Deno.env.get("APISPORTS_MAX_GAMES_PER_RUN") ?? "24", 10) || 24);
const APISPORTS_TARGET_LEAGUE_ID = Number.parseInt(Deno.env.get("APISPORTS_TARGET_LEAGUE_ID") ?? "", 10) || 0;

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

function toFantasyPoints(pts: number, reb: number, ast: number, stl: number, blk: number, turnovers: number): number {
  const total = pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 - turnovers;
  return Number(Math.max(0, total).toFixed(2));
}

async function fetchApiSports(pathWithQuery: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  if (!APISPORTS_BASE_URL || !APISPORTS_KEY) {
    return { rows: [], error: "Missing APISPORTS_NBA_BASE_URL or APISPORTS_API_KEY." };
  }
  const url = `${APISPORTS_BASE_URL}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": APISPORTS_KEY,
      accept: "application/json",
    },
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

function isLiveOrFinal(statusShort: string): boolean {
  const key = statusShort.trim().toUpperCase();
  if (!key) return false;
  const liveKeys = new Set(["Q1", "Q2", "Q3", "Q4", "HT", "OT", "AOT", "LIVE", "IN PLAY"]);
  const finalKeys = new Set(["FT", "AOT", "FINAL"]);
  return liveKeys.has(key) || finalKeys.has(key);
}

function formatDateUTC(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function syncLivePlayerStats(): Promise<SyncResult> {
  const result: SyncResult = {
    ok: true,
    scannedGames: 0,
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

  const candidateDates = [formatDateUTC(-1), formatDateUTC(0), formatDateUTC(1)];
  const gameRowsByDate = await Promise.all(
    candidateDates.map((date) => fetchApiSports(`/games?date=${encodeURIComponent(date)}`))
  );
  const combinedRows: Record<string, unknown>[] = [];
  for (const batch of gameRowsByDate) {
    if (batch.error) {
      result.errors.push(batch.error);
      continue;
    }
    combinedRows.push(...batch.rows);
  }
  if (combinedRows.length === 0) {
    result.ok = result.errors.length === 0;
    return result;
  }

  let games = combinedRows.filter((game) => {
    const short = String(getPath(game, ["status", "short"]) ?? "");
    return isLiveOrFinal(short);
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

  for (const game of games) {
    const gameId = String(getPath(game, ["id"]) ?? "").trim();
    if (!gameId) {
      continue;
    }

    const playersResponse = await fetchApiSports(`/games/statistics/players?id=${encodeURIComponent(gameId)}`);
    if (playersResponse.error) {
      result.errors.push(`game ${gameId}: ${playersResponse.error}`);
      await sleep(APISPORTS_REQUEST_DELAY_MS);
      continue;
    }

    const leagueId = parseNumber(getPath(game, ["league", "id"])) || null;
    const leagueName = String(getPath(game, ["league", "name"]) ?? "").trim();
    const statusShort = String(getPath(game, ["status", "short"]) ?? "").trim();
    const nowIso = new Date().toISOString();

    const upsertRows: Array<Record<string, unknown>> = [];

    for (const playerRaw of playersResponse.rows as ApiSportsPlayerRow[]) {
      const player = asRecord(playerRaw);
      const playerId = parseNumber(getPath(player, ["player", "id"]));
      if (!Number.isFinite(playerId) || playerId <= 0) {
        continue;
      }
      const playerName = String(getPath(player, ["player", "name"]) ?? "").trim();
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
        player_id: Math.round(playerId),
        player_name: playerName,
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
      });
    }

    result.scannedPlayers += upsertRows.length;

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

async function syncBurst(iterations: number, intervalMs: number): Promise<SyncResult> {
  const merged: SyncResult = {
    ok: true,
    scannedGames: 0,
    scannedPlayers: 0,
    upsertedPlayers: 0,
    errors: [],
  };
  for (let i = 0; i < iterations; i += 1) {
    const result = await syncLivePlayerStats();
    merged.ok = merged.ok && result.ok;
    merged.scannedGames += result.scannedGames;
    merged.scannedPlayers += result.scannedPlayers;
    merged.upsertedPlayers += result.upsertedPlayers;
    merged.errors.push(...result.errors);

    if (i < iterations - 1) {
      await sleep(intervalMs);
    }
  }
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
    const iterations = clampInt(Number.parseInt(url.searchParams.get("burst") ?? "1", 10), 1, 8);
    const intervalMs = clampInt(Number.parseInt(url.searchParams.get("intervalMs") ?? "15000", 10), 1000, 60000);
    const data = await syncBurst(iterations, intervalMs);
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
