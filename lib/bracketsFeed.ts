import "server-only";

import { fetchBallDontLieList, isBallDontLieConfigured } from "@/lib/ballDontLieClient";
import { isBracketFeedGame, type BracketFeedGame } from "@/lib/brackets/games";
import type { BracketGender } from "@/lib/brackets/tree";

// March Madness brackets' only read of the feed (balldontlie): ONE bracket request per tournament
// per call — the bracket endpoint already carries teams, seeds, scores and status (plan §8), so the
// sync never needs /games. Paces itself in lib/bracketsSync.ts. Failures come back as
// { ok: false } — never as an empty list, which would read as "no bracket yet".

export type BracketFeedResult = { ok: true; games: BracketFeedGame[] } | { ok: false; reason: "not_configured" | "unavailable" };

const PATH: Record<BracketGender, string> = { men: "/ncaab/v1/bracket", women: "/ncaaw/v1/bracket" };

/** `season` = the year the season started (the March 2027 tournament is 2026). */
export async function fetchBracketFeed(gender: BracketGender, season: number): Promise<BracketFeedResult> {
  if (!isBallDontLieConfigured()) return { ok: false, reason: "not_configured" };
  const failure = { failed: false };
  const query = new URLSearchParams();
  query.set("season", String(season));
  // The endpoint pages at 25 without this (plan §8); 79 games in 2027 fit one page.
  query.set("per_page", "100");
  const rows = await fetchBallDontLieList<unknown>(PATH[gender], query, { maxPages: 2, failure });
  if (failure.failed) return { ok: false, reason: "unavailable" };
  return { ok: true, games: rows.filter(isBracketFeedGame) };
}
