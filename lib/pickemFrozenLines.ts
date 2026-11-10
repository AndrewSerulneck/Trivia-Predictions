import "server-only";

// Frozen spread lines per bar (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B3, D3, Q1).
//
// At a bar with a pick window and spreads on, every player sees ONE line per game and is graded by it.
// The line freezes for that bar the first time the game is shown inside its open window: the games
// list copies the global line (College Football `pickem_game_lines`, NFL `nfl_pickem_game_lines`) into
// `pickem_venue_frozen_lines` once, through the insert-once RPC `freeze_pickem_venue_lines`. A pick at a
// windowed spread bar freezes the line first if the list didn't (`frozenLineForPick`), so every such
// pick has a frozen row from before it was saved, and the row never changes. The pick also RECORDS that
// line (its own `home_spread` / `away_spread`, written while pending only by a windowed pick), and
// settlement grades a spread pick by its recorded line, else by the global line locked at kickoff.
// Recording it on the pick (not looking the bar up at grading) keeps a pick made after a partner turns
// the window off on the line it was shown.
//
// Bars without a window never reach this file. Cost: one indexed range read per games-list view at a
// windowed spread bar, one RPC per (bar, game) the first time it freezes, and one RPC per windowed pick.
// Settlement reads nothing extra (the line rides the pick row it already reads).

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pickWindowStatusForGame, type PickEmPickWindow } from "@/lib/pickemPickWindow";

const FROZEN_COLUMNS = "venue_id, sport_key, game_id, starts_at, home_spread, away_spread, source_vendor, frozen_at";

export type PickEmFrozenLine = {
  venueId: string;
  sportKey: string;
  gameId: string;
  startsAt: string;
  homeSpread: number;
  awaySpread: number;
  sourceVendor: string;
  frozenAt: string;
};

/** A global line as the games list holds it, ready to be frozen for one bar. */
export type PickEmFreezableLine = {
  gameId: string;
  startsAt: string;
  homeSpread: number;
  awaySpread: number;
  sourceVendor: string;
};

type FrozenLineRow = {
  venue_id: string;
  sport_key: string;
  game_id: string;
  starts_at: string;
  home_spread: number | string;
  away_spread: number | string;
  source_vendor: string;
  frozen_at: string;
};

type SupabaseErrorLike = { code?: string | null; message?: string | null } | null | undefined;

const mapRow = (row: FrozenLineRow): PickEmFrozenLine => ({
  venueId: row.venue_id,
  sportKey: row.sport_key,
  gameId: row.game_id,
  startsAt: row.starts_at,
  homeSpread: Number(row.home_spread),
  awaySpread: Number(row.away_spread),
  sourceVendor: row.source_vendor,
  frozenAt: row.frozen_at,
});

const requireAdmin = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

/** A pick refused because its bar's line couldn't be frozen (B3); the player tries again. */
export const PICKEM_FROZEN_LINE_FAILED_MESSAGE = "We couldn't load this game's line. Please try again.";

type GlobalLine = Omit<PickEmFreezableLine, "gameId" | "startsAt">;

// Only the line's own fields: a global line row also carries its own ids and kickoff.
const freezableLine = (game: { id: string; startsAt: string }, line: GlobalLine): PickEmFreezableLine => ({
  gameId: game.id,
  startsAt: game.startsAt,
  homeSpread: line.homeSpread,
  awaySpread: line.awaySpread,
  sourceVendor: line.sourceVendor,
});

/** The table isn't there yet (migration 20261110014242 not applied): no bar has a frozen line. */
export const isFrozenLinesTableMissing = (error: SupabaseErrorLike): boolean =>
  error?.code === "42P01" || error?.code === "PGRST205";

/**
 * Pure: the lines a games list freezes now. A game qualifies when it has not started, its pick window
 * instance is open now, it has a global line, and this bar has no frozen line for it yet. A game whose
 * window hasn't opened keeps showing the global line (it can't be picked yet) and freezes once it opens.
 */
export const linesToFreeze = (params: {
  window: PickEmPickWindow;
  games: ReadonlyArray<{ id: string; startsAt: string }>;
  globalLines: ReadonlyMap<string, GlobalLine>;
  frozen: ReadonlyMap<string, PickEmFrozenLine>;
  nowMs: number;
  timeZone: string;
}): PickEmFreezableLine[] =>
  params.games.flatMap((game) => {
    const kickoffMs = Date.parse(game.startsAt);
    if (!Number.isFinite(kickoffMs) || kickoffMs <= params.nowMs || params.frozen.has(game.id)) return [];
    const line = params.globalLines.get(game.id);
    if (!line) return [];
    const status = pickWindowStatusForGame({ window: params.window, kickoffMs, nowMs: params.nowMs, timeZone: params.timeZone });
    return status.isOpen ? [freezableLine(game, line)] : [];
  });

/** This bar's frozen lines for one sport's games starting in [fromIso, toIso], keyed by game id. */
export const readVenueFrozenLines = async (params: {
  venueId: string;
  sportKey: string;
  fromIso: string;
  toIso: string;
}): Promise<Map<string, PickEmFrozenLine>> => {
  const { data, error } = await requireAdmin()
    .from("pickem_venue_frozen_lines")
    .select(FROZEN_COLUMNS)
    .eq("venue_id", params.venueId)
    .eq("sport_key", params.sportKey)
    .gte("starts_at", params.fromIso)
    .lte("starts_at", params.toIso)
    .returns<FrozenLineRow[]>();
  if (error) {
    if (isFrozenLinesTableMissing(error)) return new Map();
    throw new Error(error.message ?? "Failed to load frozen Pick 'Em lines.");
  }
  return new Map((data ?? []).map((row) => [row.game_id, mapRow(row)]));
};

/**
 * Freeze lines for one bar (insert once, before kickoff by the database clock). Returns the bar's
 * frozen row for every listed game that has one, whether it was frozen now or earlier: an earlier row
 * always wins over the line passed in.
 */
export const freezeVenueLines = async (params: {
  venueId: string;
  sportKey: string;
  lines: PickEmFreezableLine[];
}): Promise<Map<string, PickEmFrozenLine>> => {
  if (params.lines.length === 0) return new Map();
  const rows = params.lines.map((line) => ({
    sport_key: params.sportKey,
    game_id: line.gameId,
    starts_at: line.startsAt,
    home_spread: line.homeSpread,
    away_spread: line.awaySpread,
    source_vendor: line.sourceVendor,
  }));
  const { data, error } = await requireAdmin().rpc("freeze_pickem_venue_lines", {
    p_venue_id: params.venueId,
    p_rows: rows,
  });
  if (error) throw new Error(error.message ?? "Failed to freeze Pick 'Em lines.");
  return new Map(((data ?? []) as FrozenLineRow[]).map((row) => [row.game_id, mapRow(row)]));
};

/**
 * A windowed spread bar's games list: its frozen lines for these games, freezing those shown inside an
 * open window for the first time. Throws on a read or write failure; the caller keeps the global lines
 * on screen and reports lines unavailable (the pick itself freezes or refuses).
 */
export const applyVenueFrozenLines = async (params: {
  venueId: string;
  sportKey: string;
  window: PickEmPickWindow;
  timeZone: string;
  games: ReadonlyArray<{ id: string; startsAt: string }>;
  globalLines: ReadonlyMap<string, GlobalLine>;
  nowMs?: number;
}): Promise<Map<string, PickEmFrozenLine>> => {
  const kickoffs = params.games.map((game) => Date.parse(game.startsAt)).filter(Number.isFinite);
  if (kickoffs.length === 0) return new Map();
  const frozen = await readVenueFrozenLines({
    venueId: params.venueId,
    sportKey: params.sportKey,
    fromIso: new Date(Math.min(...kickoffs)).toISOString(),
    toIso: new Date(Math.max(...kickoffs)).toISOString(),
  });
  const fresh = linesToFreeze({
    window: params.window,
    games: params.games,
    globalLines: params.globalLines,
    frozen,
    nowMs: params.nowMs ?? Date.now(),
    timeZone: params.timeZone,
  });
  if (fresh.length > 0) {
    for (const [gameId, line] of await freezeVenueLines({ venueId: params.venueId, sportKey: params.sportKey, lines: fresh })) {
      frozen.set(gameId, line);
    }
  }
  return frozen;
};

/**
 * The line a pick at a windowed spread bar is made against: the bar's frozen line, frozen now from
 * `globalLine` if the list hadn't. Null when the game has no line at all (or started meanwhile). Throws
 * on a failure, and the pick is refused, so no windowed pick is ever saved without its frozen line.
 */
export const frozenLineForPick = async (params: {
  venueId: string;
  sportKey: string;
  game: { id: string; startsAt: string };
  globalLine: GlobalLine | null;
}): Promise<PickEmFrozenLine | null> => {
  if (params.globalLine) {
    const frozen = await freezeVenueLines({
      venueId: params.venueId,
      sportKey: params.sportKey,
      lines: [freezableLine(params.game, params.globalLine)],
    });
    return frozen.get(params.game.id) ?? null;
  }
  const existing = await readVenueFrozenLines({
    venueId: params.venueId,
    sportKey: params.sportKey,
    fromIso: params.game.startsAt,
    toIso: params.game.startsAt,
  });
  return existing.get(params.game.id) ?? null;
};

/** The columns a windowed pick saves: the frozen line it is made against (graded by it, see below). */
export const frozenLinePickColumns = (line: Pick<PickEmFrozenLine, "homeSpread" | "awaySpread">) => ({
  home_spread: line.homeSpread,
  away_spread: line.awaySpread,
});

type PickLineRow = {
  status: string;
  home_spread: number | string | null;
  away_spread: number | string | null;
};

type SpreadLine = { homeSpread: number; awaySpread: number };

// The line on a pick's own row, whatever its status: recorded while pending, or the line it was graded by.
const pickRowLine = (row: PickLineRow): SpreadLine | null => {
  if (row.home_spread === null || row.home_spread === undefined || row.away_spread === null || row.away_spread === undefined) {
    return null;
  }
  const homeSpread = Number(row.home_spread);
  const awaySpread = Number(row.away_spread);
  return Number.isFinite(homeSpread) && Number.isFinite(awaySpread) ? { homeSpread, awaySpread } : null;
};

/**
 * Settlement: the line a PENDING pick recorded when it was made at a windowed spread bar, or null (then
 * the global line locked at kickoff grades it, as before B3). Only a windowed pick writes these columns
 * before grading (checked 2026-11-09: no pending pick had them); grading overwrites them with the line used.
 */
export const recordedPickLine = (row: PickLineRow): SpreadLine | null =>
  row.status === "pending" ? pickRowLine(row) : null;

/**
 * The line a games list shows for one spread game (away-mode plan R2): the line settlement grades the
 * player's pick by, so the screen never promises one number and grades by another.
 * - The player's pick has a line on its row (recorded while pending, or the line it was graded by) → that line.
 * - The player has a pick with no line (made before the bar had a window) → the global line, which
 *   settlement locks at kickoff and grades it by. Never the bar's frozen line.
 * - No pick → the bar's frozen line if it has one, else the global line.
 * Both lists (`applyCollegeFootballLines`, `listNFLPickEmGames`) choose only through this.
 */
export const lineShownForGame = (params: {
  pick: PickLineRow | null | undefined;
  frozen: SpreadLine | null | undefined;
  global: SpreadLine | null | undefined;
}): SpreadLine | null => {
  const global = params.global ? { homeSpread: params.global.homeSpread, awaySpread: params.global.awaySpread } : null;
  if (params.pick) return pickRowLine(params.pick) ?? global;
  if (params.frozen) return { homeSpread: params.frozen.homeSpread, awaySpread: params.frozen.awaySpread };
  return global;
};
