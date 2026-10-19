import "server-only";

import { isSquaresEnabled, SEASONAL_GAME_WINDOWS, seasonalWindowState } from "@/lib/seasonalGames";
import { getSquaresBoardView } from "@/lib/squaresBoard";
import { buildSquaresTvPayload, type SquaresTvPayload } from "@/lib/squaresTv";

// The venue TV's Squares read. Cost rules (plan §6): ZERO I/O unless the flag is on and today is inside
// the Squares window; inside it, one board read (≈5 small queries) per venue per 15 s no matter how
// many TVs poll, because the state route is also CDN-cached 15 s for this mode. Failures hide Squares
// (the TV falls back to its idle screen) and are never thrown.

const TV_CACHE_MS = 15_000;
const cache = new Map<string, { atMs: number; payload: SquaresTvPayload | null }>();

export async function getSquaresTvPayload(venueId: string, nowMs: number = Date.now()): Promise<SquaresTvPayload | null> {
  if (!isSquaresEnabled()) return null;
  if (seasonalWindowState(SEASONAL_GAME_WINDOWS.squares, new Date(nowMs)) !== "open") return null;

  const hit = cache.get(venueId);
  if (hit && nowMs - hit.atMs < TV_CACHE_MS && nowMs >= hit.atMs) return hit.payload;

  const result = await getSquaresBoardView({ venueId, userId: null, nowMs }).catch(() => null);
  if (!result || !result.ok) {
    console.error("[SquaresTv] board-read-failed", { message: result && !result.ok ? result.error : "threw" });
    return null;
  }
  const payload = buildSquaresTvPayload(result.view, nowMs);
  cache.set(venueId, { atMs: nowMs, payload });
  return payload;
}
