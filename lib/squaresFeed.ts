import "server-only";

import { fetchBallDontLieJson, fetchBallDontLieList, isBallDontLieConfigured } from "@/lib/ballDontLieClient";
import { findSuperBowl, type NflFeedGame } from "@/lib/squares";

// Super Bowl Squares' only reads of the NFL feed (balldontlie). One request per call. The
// settlement makes at most one per cron run, and only inside the game window (lib/squaresSettlement.ts).
// Failures come back as { ok: false } — never as an empty game, which would read as "no score".

export type SquaresFeedResult<T> = { ok: true; value: T } | { ok: false; reason: "not_configured" | "unavailable" | "not_found" };

const isGame = (value: unknown): value is NflFeedGame =>
  Boolean(value) && typeof value === "object" && typeof (value as { id?: unknown }).id === "number";

/** One game by id (`/nfl/v1/games/{id}` — `/games` ignores id filters, plan §8). */
export async function fetchSquaresGame(gameId: number): Promise<SquaresFeedResult<NflFeedGame>> {
  if (!isBallDontLieConfigured()) return { ok: false, reason: "not_configured" };
  const failure = { failed: false };
  const payload = (await fetchBallDontLieJson(`/nfl/v1/games/${gameId}`, new URLSearchParams(), { failure })) as {
    data?: unknown;
  };
  if (failure.failed) return { ok: false, reason: "unavailable" };
  return isGame(payload?.data) ? { ok: true, value: payload.data } : { ok: false, reason: "not_found" };
}

/** The season's Super Bowl, once the feed lists both teams. `value: null` = not in the feed yet. */
export async function fetchSuperBowlGame(season: number): Promise<SquaresFeedResult<NflFeedGame | null>> {
  if (!isBallDontLieConfigured()) return { ok: false, reason: "not_configured" };
  const failure = { failed: false };
  const query = new URLSearchParams();
  query.append("seasons[]", String(season));
  query.set("postseason", "true");
  query.set("per_page", "100");
  const games = await fetchBallDontLieList<NflFeedGame>("/nfl/v1/games", query, { maxPages: 2, failure });
  if (failure.failed) return { ok: false, reason: "unavailable" };
  return { ok: true, value: findSuperBowl(games) };
}
