import "server-only";

// The "X out of N" pick limit (docs/pickem-college-football-and-prize-plan.md D5, Phase 4a). A venue's
// "out of N" Pick 'Em Prize gives each player N picks in its games per period; a NEW pick past N is
// refused with a message naming the prize. Changing sides on an existing pick never counts.
//
// Fails OPEN on a read error (logged), on purpose: the prize counts only a player's FIRST N picks in
// its scope and period, by when they were made (Phase 4b), so a pick that slips past the limit can
// never help that player — while refusing every pick at a bar because one read failed would stop
// Pick 'Em there outright. The same rule covers two picks racing past N at once.
//
// Cost: the venue's active Pick 'Em Prizes, one read per venue per PICKEM_PRIZE_LIMIT_CACHE_TTL_MS per
// server instance (only on a new pick); then, only when an "out of N" prize covers the game's league
// that day, the venue's time zone (cached) and ONE indexed count of the player's picks in the period.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listActivePickEmPrizeCampaigns, type PickEmPrizeTerms } from "@/lib/challengeCampaigns";
import { formatZonedDate } from "@/lib/categoryBlitzScheduleTime";
import {
  pickemPickLimitMessage,
  pickemPrizePeriodForDate,
  pickemScopeCovers,
  type PickEmPrizePeriod,
} from "@/lib/pickemPrizes";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign, PickEmPrizeScope } from "@/types";

export const PICKEM_PRIZE_LIMIT_CACHE_TTL_MS = 60_000;

type PrizeList = Array<ChallengeCampaign & PickEmPrizeTerms>;
const prizeCache = new Map<string, { value: Promise<PrizeList>; expiresAtMs: number }>();

/** Test hook. */
export function clearPickEmPrizeLimitCache(): void {
  prizeCache.clear();
}

/** The venue's active Pick 'Em Prizes, read at most once a minute per server instance (shared by the limit and the games list). */
export function activePickEmPrizes(venueId: string): Promise<PrizeList> {
  const nowMs = Date.now();
  const cached = prizeCache.get(venueId);
  if (cached && cached.expiresAtMs > nowMs) return cached.value;
  for (const [key, entry] of prizeCache) if (entry.expiresAtMs <= nowMs) prizeCache.delete(key);
  const value = listActivePickEmPrizeCampaigns(venueId);
  prizeCache.set(venueId, { value, expiresAtMs: nowMs + PICKEM_PRIZE_LIMIT_CACHE_TTL_MS });
  // A failed read is not kept: the next pick asks again.
  value.catch(() => prizeCache.delete(venueId));
  return value;
}

const inList = (values: readonly string[]): string => `(${values.map((value) => `"${value}"`).join(",")})`;

/**
 * How many picks (not cancelled) the player has in a prize's scope whose game starts in `period` at
 * this venue — ONE indexed count. Null when the read failed (logged): the caller decides what that means.
 */
export async function countPickEmPicksInPrizePeriod(params: {
  userId: string;
  venueId: string;
  campaignId: string;
  scope: PickEmPrizeScope;
  period: Pick<PickEmPrizePeriod, "startMs" | "endMsExclusive">;
}): Promise<number | null> {
  if (!supabaseAdmin) return null;
  const { scope, period } = params;
  const ors = [
    scope.sports.length > 0 ? `sport_slug.in.${inList(scope.sports)}` : "",
    scope.leagues.length > 0 ? `sport_key.in.${inList(scope.leagues)}` : "",
  ].filter(Boolean);
  const { count, error } = await supabaseAdmin
    .from("pickem_picks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("venue_id", params.venueId)
    .gte("starts_at", new Date(period.startMs).toISOString())
    .lt("starts_at", new Date(period.endMsExclusive).toISOString())
    .neq("status", "canceled")
    .or(ors.join(","));
  if (error) {
    console.error("[PickEmPrize] limit-count-failed", { venueId: params.venueId, campaignId: params.campaignId, message: error.message });
    return null;
  }
  return count ?? 0;
}

/**
 * May this player make a NEW pick on this game at this venue? Refused only when an active "out of N"
 * prize covers the game's league on the game's (venue-local) day and the player already has N picks
 * in that prize's games in that period (cancelled picks don't count).
 */
export async function checkPickEmPrizePickLimit(params: {
  userId: string;
  venueId: string;
  game: { sportSlug: string; sportKey: string; startsAt: string };
  now?: Date;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { userId, venueId, game } = params;
  const startsAtMs = Date.parse(game.startsAt);
  if (!supabaseAdmin || !Number.isFinite(startsAtMs)) return { ok: true };

  let prizes: PrizeList;
  try {
    prizes = await activePickEmPrizes(venueId);
  } catch (error) {
    console.error("[PickEmPrize] limit-prizes-read-failed", { venueId, message: error instanceof Error ? error.message : String(error) });
    return { ok: true };
  }
  const limiting = prizes.filter(
    (prize) => prize.pickemPickLimit !== null && pickemScopeCovers(prize.pickemScope, game),
  );
  if (limiting.length === 0) return { ok: true };

  const timeZone = await getVenueTimezone(venueId);
  const gameDate = formatZonedDate(startsAtMs, timeZone);
  const today = formatZonedDate((params.now ?? new Date()).getTime(), timeZone);

  for (const prize of limiting) {
    const limit = prize.pickemPickLimit as number;
    const period = pickemPrizePeriodForDate(prize.pickemWindow, gameDate, timeZone);
    if (!period) continue;
    const count = await countPickEmPicksInPrizePeriod({
      userId,
      venueId,
      campaignId: prize.id,
      scope: prize.pickemScope,
      period,
    });
    if (count === null) continue;
    if (count >= limit) {
      return {
        ok: false,
        message: pickemPickLimitMessage({ limit, scope: prize.pickemScope, window: prize.pickemWindow, period, today }),
      };
    }
  }
  return { ok: true };
}
