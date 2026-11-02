import "server-only";

// Spread lines for regular Pick 'Em (plan Phase 3: College Football only). The NFL contract
// (docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md) applies:
//  - the games list is the ONLY place that reads the provider, and only for games not yet started;
//  - a line is written only before kickoff, and never changed once locked or started
//    (upsert_pickem_game_lines enforces both on the database clock);
//  - settlement locks an existing row at kickoff and never fetches or creates one
//    (lock_pickem_game_lines).
//
// Cost: one bounded read of the day's rows per games-list view. The provider is asked at most once
// per PICKEM_LINE_REFRESH_MS per day's games per server instance, and not at all while every game
// still to start has a row saved in the last PICKEM_LINE_REFRESH_MS (the stamp is shared by every
// instance). One fetch = the day's ≈45 FBS game ids, ≈3 pages of odds, then one RPC write.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { bestSpreadLinesByGame, type BDLSpreadOddsRow } from "@/lib/spreadLines";
import { COLLEGE_FOOTBALL_SPORT_KEY } from "@/lib/pickemCollegeFootball";

export const PICKEM_LINE_REFRESH_MS = 10 * 60 * 1000;

const ODDS_PATH_BY_SPORT_KEY: Record<string, string> = {
  [COLLEGE_FOOTBALL_SPORT_KEY]: "/ncaaf/v1/odds",
};
// ≈45 games × ≤ 6 sportsbooks = ≈270 rows on a full Saturday (221 measured 2026-10-31): 3 pages.
const ODDS_MAX_PAGES = 5;

const LINE_COLUMNS =
  "sport_key, game_id, provider_game_id, starts_at, home_team, away_team, home_spread, away_spread, source_vendor, fetched_at, locked_at, updated_at";

export type PickEmGameLine = {
  sportKey: string;
  gameId: string;
  providerGameId: string;
  startsAt: string;
  homeSpread: number;
  awaySpread: number;
  sourceVendor: string;
  lockedAt: string | null;
  updatedAt: string | null;
};

/** The game facts the lines need (a subset of a regular Pick 'Em game). */
export type PickEmLineGame = {
  id: string;
  providerEventId: string;
  sportKey: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
};

type PickEmGameLineRow = {
  sport_key: string;
  game_id: string;
  provider_game_id: string;
  starts_at: string;
  home_team: string;
  away_team: string;
  home_spread: number | string;
  away_spread: number | string;
  source_vendor: string;
  fetched_at: string | null;
  locked_at: string | null;
  updated_at: string | null;
};

export function isSpreadLineSportKey(sportKey: string): boolean {
  return sportKey in ODDS_PATH_BY_SPORT_KEY;
}

function mapLineRow(row: PickEmGameLineRow): PickEmGameLine {
  return {
    sportKey: row.sport_key,
    gameId: row.game_id,
    providerGameId: row.provider_game_id,
    startsAt: row.starts_at,
    homeSpread: Number(row.home_spread),
    awaySpread: Number(row.away_spread),
    sourceVendor: row.source_vendor,
    lockedAt: row.locked_at,
    updatedAt: row.updated_at,
  };
}

function requireAdmin() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabaseAdmin;
}

/** The saved lines for one sport's games starting in [fromIso, toIso], keyed by game id. */
export async function readPickEmGameLines(
  sportKey: string,
  fromIso: string,
  toIso: string
): Promise<Map<string, PickEmGameLine>> {
  const { data, error } = await requireAdmin()
    .from("pickem_game_lines")
    .select(LINE_COLUMNS)
    .eq("sport_key", sportKey)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .returns<PickEmGameLineRow[]>();
  if (error) {
    throw new Error(error.message ?? "Failed to load Pick 'Em game lines.");
  }
  return new Map((data ?? []).map((row) => [row.game_id, mapLineRow(row)]));
}

/** The saved line for one game (the pick check). Never asks the provider. */
export async function readPickEmGameLine(sportKey: string, gameId: string): Promise<PickEmGameLine | null> {
  const { data, error } = await requireAdmin()
    .from("pickem_game_lines")
    .select(LINE_COLUMNS)
    .eq("sport_key", sportKey)
    .eq("game_id", gameId)
    .maybeSingle<PickEmGameLineRow>();
  if (error) {
    throw new Error(error.message ?? "Failed to load the Pick 'Em game line.");
  }
  return data ? mapLineRow(data) : null;
}

// Per-instance memo: when this instance last asked the provider for a given set of games.
const lastOddsFetchAtMs = new Map<string, number>();

/** Test hook: forget the per-instance memo. */
export function resetPickEmLineFetchMemo(): void {
  lastOddsFetchAtMs.clear();
}

/** Games whose line may still change: not started, not locked. */
export function gamesNeedingLineRefresh(
  games: PickEmLineGame[],
  saved: Map<string, PickEmGameLine>,
  nowMs: number
): PickEmLineGame[] {
  return games.filter((game) => {
    const startsAtMs = Date.parse(game.startsAt);
    if (!Number.isFinite(startsAtMs) || startsAtMs <= nowMs) return false;
    return !saved.get(game.id)?.lockedAt;
  });
}

/** True when every game still to start has a row saved within the refresh window. */
export function linesAreFresh(
  pending: PickEmLineGame[],
  saved: Map<string, PickEmGameLine>,
  nowMs: number
): boolean {
  return pending.every((game) => {
    const updatedAtMs = Date.parse(saved.get(game.id)?.updatedAt ?? "");
    return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs < PICKEM_LINE_REFRESH_MS;
  });
}

/**
 * The lines for a games list: saved rows, refreshed from the provider for games not yet started
 * when they are stale. A provider or write failure leaves the saved rows (never throws past the
 * read), reported as `refreshFailed` so the screen can say lines may be missing.
 */
export async function loadPickEmGameLines(params: {
  sportKey: string;
  games: PickEmLineGame[];
  fromIso: string;
  toIso: string;
  nowMs?: number;
}): Promise<{ lines: Map<string, PickEmGameLine>; refreshFailed: boolean }> {
  const oddsPath = ODDS_PATH_BY_SPORT_KEY[params.sportKey];
  const lines = await readPickEmGameLines(params.sportKey, params.fromIso, params.toIso);
  if (!oddsPath) return { lines, refreshFailed: false };

  const nowMs = params.nowMs ?? Date.now();
  const pending = gamesNeedingLineRefresh(params.games, lines, nowMs);
  if (pending.length === 0 || linesAreFresh(pending, lines, nowMs)) {
    return { lines, refreshFailed: false };
  }

  // Ask for every game of the list (a stable set, so a repeat view hits the provider cache),
  // but only the not-yet-started ones are written.
  const providerIds = Array.from(new Set(params.games.map((game) => game.providerEventId).filter(Boolean))).sort();
  const memoKey = `${params.sportKey}:${providerIds.join(",")}`;
  const lastAtMs = lastOddsFetchAtMs.get(memoKey);
  if (lastAtMs !== undefined && nowMs - lastAtMs < PICKEM_LINE_REFRESH_MS) {
    return { lines, refreshFailed: false };
  }
  for (const [key, atMs] of lastOddsFetchAtMs) {
    if (nowMs - atMs >= PICKEM_LINE_REFRESH_MS) lastOddsFetchAtMs.delete(key);
  }
  lastOddsFetchAtMs.set(memoKey, nowMs);

  try {
    const query = new URLSearchParams({ per_page: "100" });
    for (const id of providerIds) query.append("game_ids[]", id);
    const truncation = { truncated: false };
    const rows = await fetchBallDontLieList<BDLSpreadOddsRow>(oddsPath, query, ODDS_MAX_PAGES, truncation);
    if (truncation.truncated) {
      console.warn(`[Pick 'Em] Odds fetch for ${params.sportKey} hit the ${ODDS_MAX_PAGES}-page cap; some lines may be missing.`);
    }
    const best = bestSpreadLinesByGame(rows, pending.map((game) => game.providerEventId));
    const writes = pending.flatMap((game) => {
      const line = best.get(game.providerEventId);
      if (!line) return [];
      return [
        {
          sport_key: params.sportKey,
          game_id: game.id,
          provider_game_id: game.providerEventId,
          starts_at: game.startsAt,
          home_team: game.homeTeam,
          away_team: game.awayTeam,
          home_spread: line.homeSpread,
          away_spread: line.awaySpread,
          source_vendor: line.vendor,
          fetched_at: line.fetchedAt,
        },
      ];
    });
    if (writes.length === 0) return { lines, refreshFailed: false };

    const { data, error } = await requireAdmin().rpc("upsert_pickem_game_lines", { p_rows: writes });
    if (error) throw new Error(error.message ?? "Failed to save Pick 'Em game lines.");
    for (const row of (data ?? []) as PickEmGameLineRow[]) lines.set(row.game_id, mapLineRow(row));
    return { lines, refreshFailed: false };
  } catch (error) {
    console.warn(`[Pick 'Em] Spread-line refresh failed for ${params.sportKey}; showing saved lines only.`, error);
    return { lines, refreshFailed: true };
  }
}

/**
 * Settlement: lock the listed games' lines whose game has started and return them (locked rows
 * only). One RPC per sport per run. Never fetches odds, never creates a row.
 */
export async function lockPickEmGameLinesForSettlement(
  sportKey: string,
  gameIds: string[]
): Promise<Map<string, PickEmGameLine>> {
  const ids = Array.from(new Set(gameIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data, error } = await requireAdmin().rpc("lock_pickem_game_lines", { p_sport_key: sportKey, p_game_ids: ids });
  if (error) {
    throw new Error(error.message ?? "Failed to lock Pick 'Em game lines.");
  }
  const locked = new Map<string, PickEmGameLine>();
  for (const row of (data ?? []) as PickEmGameLineRow[]) {
    if (row.locked_at) locked.set(row.game_id, mapLineRow(row));
  }
  return locked;
}
