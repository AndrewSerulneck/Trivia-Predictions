import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import type { WeekPlayerTotal } from "@/lib/rankedPlaceRewards";

// Per-player Live Trivia totals over a set of games — the input to rankWeekPlaces
// (lib/rankedPlaceRewards.ts). One call to the `live_trivia_week_totals` RPC
// (20261014010000_live_trivia_ranked_places.sql): an indexed aggregate that returns one row per
// player who answered, never the answer rows themselves. Shared by the weekly resolver (Phase 2),
// the backfill (Phase 5) and the Rewards card (Phase 4, which must cache it — plan §6).

/** One game: a schedule and its venue-local occurrence date (YYYY-MM-DD). Never re-convert the date. */
export type LiveTriviaGameRef = { scheduleId: string; occurrenceDate: string };

type WeekTotalsRpcRow = { user_id: string; total_points: number | string; reached_at: string | null };

/** Fails closed: any RPC error throws (a missing function logs `[RankedReward] week-totals-rpc-missing`). */
export const loadLiveTriviaWeekTotals = async (
  games: readonly LiveTriviaGameRef[],
): Promise<WeekPlayerTotal[]> => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const unique = new Map<string, LiveTriviaGameRef>();
  for (const game of games) {
    const scheduleId = String(game.scheduleId ?? "").trim();
    const occurrenceDate = String(game.occurrenceDate ?? "").trim();
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) continue;
    unique.set(`${scheduleId}|${occurrenceDate}`, { scheduleId, occurrenceDate });
  }
  if (unique.size === 0) return [];

  const refs = [...unique.values()];
  const { data, error } = await supabaseAdmin.rpc("live_trivia_week_totals", {
    p_schedule_ids: refs.map((g) => g.scheduleId),
    p_dates: refs.map((g) => g.occurrenceDate),
  });
  if (error) {
    if (isMissingFunction(error, "live_trivia_week_totals")) {
      console.error("[RankedReward] week-totals-rpc-missing");
    }
    throw new Error(`live_trivia_week_totals RPC failed: ${error.message}`);
  }

  return ((data ?? []) as WeekTotalsRpcRow[]).map((row) => ({
    userId: row.user_id,
    totalPoints: Number(row.total_points) || 0,
    reachedAt: row.reached_at ?? null,
  }));
};
