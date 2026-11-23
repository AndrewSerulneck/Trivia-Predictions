import "server-only";

// Data for the venue TV's idle carousel (docs/fire-tv-app-plan.md D20, Phase 9 step 5): the Pick 'Em board and
// ticker, the All-Time Leaderboard and Prizes. Slide 1 (Next Live Trivia) rides on the engine state already, and
// slide 5 (Get the app) needs no data. Bounded reads only, run in parallel, once per idle state request (and that
// response is shared-cached 15 s per venue, so TVs at one venue share them):
//   1. tv_sports_games: the shared copy of today's games (≤ 300 rows, indexed on starts_at)
//   2. pickem_picks at this venue for those games, with usernames (indexed on venue_id, starts_at)
//   3. users: the venue's top 10 by all-time points
//   4. challenge_campaigns: the venue's active prizes (≤ 12 rows)
// A failed read is unknown, never zero: that part comes back null and its slide is skipped.

import { pickEmFeedGameKey } from "@/lib/pickem";
import { resolveRewardPrize } from "@/lib/challengeCampaigns";
import { discountLabel, formatPrizeDollars, menuItemLabel } from "@/lib/prizeCardFace";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";
import {
  localPartsOf,
  rankTvPickEmLeaders,
  rankTvSportsGames,
  type TvVenuePickCount,
} from "@/lib/tvSportsRelevance";
import { readTvSportsGames, scheduleTvSportsRefresh } from "@/lib/tvSportsSnapshot";
import { BRACKET_PRIZE_DEFINITION_ID } from "@/lib/bracketPrizes";
import { SQUARES_PRIZE_DEFINITION_ID } from "@/lib/squaresPrizes";
import { VENUE_SCREEN_RESERVED_GAMES_ENABLED } from "@/lib/venueScreenTiming";
import {
  EMPTY_CAROUSEL,
  type TvAllTimeEntry,
  type TvPrize,
  type VenueScreenCarouselData,
} from "@/lib/venueScreenCarouselShared";

export { EMPTY_CAROUSEL, type VenueScreenCarouselData };

/**
 * Off until the carousel screens exist (Phase 11 turns it on). While off, an idle state request does none of the
 * reads above and never refreshes the sports copy, so nothing is spent before a TV can show it. Debug modes and
 * Try demo use fixtures and work either way.
 */
export const TV_CAROUSEL_DATA_ENABLED = false;

const ALL_TIME_MIN_PLAYERS = 3;
const ALL_TIME_SIZE = 10;
const PRIZES_SHOWN = 3;
const HOUR_MS = 60 * 60 * 1000;

/** The venue's local midnight at the start and end of today, as epoch ms (DST-safe: probes hour by hour). */
const localDayBounds = (nowMs: number, timeZone: string): { startMs: number; endMs: number } => {
  const today = localPartsOf(nowMs, timeZone).dayKey;
  let startMs = nowMs - (nowMs % HOUR_MS);
  while (localPartsOf(startMs - HOUR_MS, timeZone).dayKey === today) startMs -= HOUR_MS;
  let endMs = startMs + HOUR_MS;
  while (localPartsOf(endMs, timeZone).dayKey === today) endMs += HOUR_MS;
  return { startMs, endMs };
};

type PickRow = {
  user_id: string;
  sport_key: string;
  game_id: string;
  selected_side: "home" | "away";
  status: string;
  starts_at: string;
  users: { username: string | null } | Array<{ username: string | null }> | null;
};

async function readVenuePicks(venueId: string, fromMs: number, toMs: number): Promise<PickRow[] | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .select("user_id, sport_key, game_id, selected_side, status, starts_at, users(username)")
    .eq("venue_id", venueId)
    .gte("starts_at", new Date(fromMs).toISOString())
    .lt("starts_at", new Date(toMs).toISOString())
    .neq("status", "canceled")
    .limit(2000)
    .returns<PickRow[]>();
  return error || !data ? null : data;
}

async function readAllTimeLeaderboard(venueId: string): Promise<TvAllTimeEntry[] | null> {
  if (!supabaseAdmin) return null;
  // The same users.points the players' all-time leaderboard reads (getLeaderboardForVenue), without its fallback rows.
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("username, points")
    .eq("venue_id", venueId)
    .gt("points", 0)
    .order("points", { ascending: false })
    .order("username", { ascending: true })
    .limit(ALL_TIME_SIZE)
    .returns<Array<{ username: string | null; points: number | null }>>();
  if (error || !data || data.length < ALL_TIME_MIN_PLAYERS) return null;
  return data.map((row, index) => ({
    rank: index + 1,
    username: String(row.username ?? "").trim() || "Player",
    points: Math.max(0, Math.floor(Number(row.points ?? 0))),
  }));
}

type PrizeRow = {
  id: string;
  name: string | null;
  reward_definition_id: string | null;
  venue_ids: string[] | null;
  prize_type: string | null;
  prize_kind: string | null;
  prize_menu_item: string | null;
  prize_menu_item_name: string | null;
  prize_discount_kind: string | null;
  prize_discount_value: number | null;
  prize_gift_certificate_amount: number | null;
  points_required_to_win: number | null;
};

/** The prize's headline, as its gift card says it ("Free Appetizer", "$25 Gift Card"); null without a prize. */
export const tvPrizeHeadline = (row: PrizeRow): string | null => {
  const resolved = resolveRewardPrize(row as Parameters<typeof resolveRewardPrize>[0]);
  if (resolved.prizeKind === "gift_card") {
    const dollars = Number(row.prize_gift_certificate_amount);
    return Number.isFinite(dollars) && dollars > 0 ? `${formatPrizeDollars(dollars)} Gift Card` : "Gift Card";
  }
  if (resolved.prizeKind === "menu_item") {
    const item = menuItemLabel(resolved);
    const discount = discountLabel(resolved);
    return discount ? `${discount} ${item}` : item;
  }
  return null;
};

const RESERVED_PRIZE_DEFINITIONS = new Set([SQUARES_PRIZE_DEFINITION_ID, BRACKET_PRIZE_DEFINITION_ID]);

async function readPrizes(venueId: string): Promise<TvPrize[] | null> {
  if (!supabaseAdmin) return null;
  // Read only: listChallengeCampaigns also finalizes closed cycles, which a TV poll must never do.
  const { data, error } = await supabaseAdmin
    .from("challenge_campaigns")
    .select(
      "id, name, reward_definition_id, venue_ids, prize_type, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value, prize_gift_certificate_amount, points_required_to_win",
    )
    .eq("is_active", true)
    .is("winner_user_id", null)
    .or(`venue_ids.ov.{${venueId}},venue_ids.eq.{}`)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<PrizeRow[]>();
  if (error || !data) return null;
  const prizes: TvPrize[] = [];
  for (const row of data) {
    // A prize for a game the TV doesn't show yet (D21) isn't advertised on it either.
    if (!VENUE_SCREEN_RESERVED_GAMES_ENABLED && RESERVED_PRIZE_DEFINITIONS.has(String(row.reward_definition_id ?? ""))) continue;
    const prize = tvPrizeHeadline(row);
    if (!prize) continue;
    const points = Math.floor(Number(row.points_required_to_win ?? 0));
    prizes.push({
      id: row.id,
      prize,
      name: String(row.name ?? "").trim() || prize,
      pointsRequired: points > 0 ? points : null,
    });
    if (prizes.length === PRIZES_SHOWN) break;
  }
  return prizes;
}

/** Venue pick counts per game (keyed like tv_sports_games) and today's picks for the top 5. Pure; exported for tests. */
export const summarizeVenuePicks = (
  rows: readonly PickRow[],
  today: { startMs: number; endMs: number },
): { counts: Map<string, TvVenuePickCount>; todaysPicks: Array<{ userId: string; username: string | null; status: string }> } => {
  const counts = new Map<string, TvVenuePickCount>();
  const todaysPicks: Array<{ userId: string; username: string | null; status: string }> = [];
  for (const row of rows) {
    const key = pickEmFeedGameKey(row.sport_key, row.game_id);
    if (key) {
      const count = counts.get(key) ?? { home: 0, away: 0 };
      if (row.selected_side === "home") count.home += 1;
      else if (row.selected_side === "away") count.away += 1;
      counts.set(key, count);
    }
    const startMs = Date.parse(row.starts_at);
    if (Number.isFinite(startMs) && startMs >= today.startMs && startMs < today.endMs) {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      todaysPicks.push({ userId: row.user_id, username: user?.username ?? null, status: row.status });
    }
  }
  return { counts, todaysPicks };
};

/** Everything the carousel needs for one venue, or EMPTY_CAROUSEL while the carousel is off. */
export async function getVenueScreenCarousel(venueId: string, nowMs: number): Promise<VenueScreenCarouselData> {
  if (!TV_CAROUSEL_DATA_ENABLED) return EMPTY_CAROUSEL;

  const timeZone = await getVenueTimezone(venueId);
  const today = localDayBounds(nowMs, timeZone);
  // Live games may have started last night; finals stay an hour.
  const fromMs = Math.min(today.startMs, nowMs - 8 * HOUR_MS);
  const [games, picks, allTimeLeaderboard, prizes] = await Promise.all([
    readTvSportsGames(nowMs, today.endMs),
    readVenuePicks(venueId, fromMs, today.endMs),
    readAllTimeLeaderboard(venueId),
    readPrizes(venueId),
  ]);
  // A TV is showing the carousel: keep the shared sports copy fresh (after this response; no-op when nothing is due).
  scheduleTvSportsRefresh(nowMs);

  const summary = picks ? summarizeVenuePicks(picks, today) : null;
  const ranked = games ? rankTvSportsGames({ games, pickCounts: summary?.counts ?? null, timeZone, nowMs }) : [];
  return {
    pickEm: ranked.length > 0 ? { games: ranked, leaders: summary ? rankTvPickEmLeaders(summary.todaysPicks) : null } : null,
    allTimeLeaderboard,
    prizes,
  };
}
