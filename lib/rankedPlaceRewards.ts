// Ranking rules for "ranked_places" rewards — 1st / 2nd / 3rd over a week of Live Trivia
// (docs/live-trivia-weekly-places-reward-plan.md §5b).
//
// THE one home of who places where. The weekly resolver (Phase 2), the backfill script
// (Phase 5) and the Rewards card's live standing (Phase 4) all import rankWeekPlaces, so they
// can never disagree. Also the one home of the stored `place_prizes` shape.
//
// Pure and client-safe: no Supabase, no "server-only".
//
// Rules (Andrew, 2026-10-14):
//   - Only a player with MORE than 0 points can place (D2).
//   - Higher total wins. A tie goes to whoever reached their total first, i.e. whose last
//     point-scoring answer of the week came earlier (D1). Each place has exactly one winner.
//   - If two tied players also reached their totals at the same instant, user id decides and
//     the result is flagged `tiebreakUnresolved` so a person can look at it.
//   - Fewer scorers than places: every filled place is paid, the rest stay empty (D2).
//   - The partner's optional minimum: if fewer than `minPlayers` players took part (answered at
//     least one question, scored or not), nobody wins that week.

import { normalizePrizePosDelivery } from "@/lib/pos/prizeDelivery";
import type { RewardDiscountKind, RewardMenuItem, RewardPlacePrize, RewardPrizeKind } from "@/types";

/** Most places a ranked reward can pay (matches the database checks). */
export const MAX_RANKED_PLACES = 3;

/** One player's week, as the live_trivia_week_totals RPC returns it. */
export type WeekPlayerTotal = {
  userId: string;
  totalPoints: number;
  /** ISO time of the player's last point-scoring answer; null when they scored nothing. */
  reachedAt: string | null;
};

export type RankedPlace = {
  place: number;
  userId: string;
  totalPoints: number;
  /** Null only on malformed input (a scorer always has a last scoring answer); ranks last in a tie. */
  reachedAt: string | null;
};

export type RankedWeekOutcome = "awarded" | "no_scorers" | "below_minimum";

export type RankedWeekResult = {
  /** Places in order (1st first); empty when nobody wins. */
  places: RankedPlace[];
  /** Players who answered at least one question this week. */
  participantCount: number;
  outcome: RankedWeekOutcome;
  /** True when user id had to break a tie that decided a paid place. */
  tiebreakUnresolved: boolean;
};

const reachedMs = (iso: string | null): number => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/** Merge duplicate rows for one player (the RPC groups by user, so this is only a safeguard). */
const mergeTotals = (totals: readonly WeekPlayerTotal[]): WeekPlayerTotal[] => {
  const byUser = new Map<string, WeekPlayerTotal>();
  for (const row of totals) {
    const userId = String(row.userId ?? "").trim();
    if (!userId) continue;
    const points = Number(row.totalPoints);
    const totalPoints = Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0;
    const reachedAt = totalPoints > 0 ? row.reachedAt ?? null : null;
    const prev = byUser.get(userId);
    if (!prev) {
      byUser.set(userId, { userId, totalPoints, reachedAt });
      continue;
    }
    // The merged total was reached at the LATER of the two last-scoring answers.
    const later =
      prev.reachedAt === null ? reachedAt
        : reachedAt === null ? prev.reachedAt
          : reachedMs(reachedAt) > reachedMs(prev.reachedAt) ? reachedAt : prev.reachedAt;
    byUser.set(userId, { userId, totalPoints: prev.totalPoints + totalPoints, reachedAt: later });
  }
  return [...byUser.values()];
};

const compareStanding = (a: WeekPlayerTotal, b: WeekPlayerTotal): number => {
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  const ra = reachedMs(a.reachedAt);
  const rb = reachedMs(b.reachedAt);
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
};

const sameStanding = (a: WeekPlayerTotal, b: WeekPlayerTotal): boolean =>
  a.totalPoints === b.totalPoints && reachedMs(a.reachedAt) === reachedMs(b.reachedAt);

/**
 * Every scorer in standing order (D1 tiebreak applied). The Rewards card uses this to find a
 * player's own rank; rankWeekPlaces takes the first `placeCount` of it.
 */
export const orderWeekStandings = (totals: readonly WeekPlayerTotal[]): WeekPlayerTotal[] =>
  mergeTotals(totals)
    .filter((row) => row.totalPoints > 0)
    .sort(compareStanding);

export const rankWeekPlaces = (params: {
  totals: readonly WeekPlayerTotal[];
  placeCount: number;
  minPlayers?: number | null;
}): RankedWeekResult => {
  const merged = mergeTotals(params.totals);
  const participantCount = merged.length;
  const placeCount = Math.min(MAX_RANKED_PLACES, Math.max(0, Math.trunc(Number(params.placeCount) || 0)));
  const minPlayers =
    params.minPlayers === null || params.minPlayers === undefined || !Number.isFinite(params.minPlayers)
      ? null
      : Math.trunc(params.minPlayers);

  if (minPlayers !== null && participantCount < minPlayers) {
    return { places: [], participantCount, outcome: "below_minimum", tiebreakUnresolved: false };
  }

  const standings = merged.filter((row) => row.totalPoints > 0).sort(compareStanding);
  const placed = standings.slice(0, placeCount);
  if (placed.length === 0) {
    return { places: [], participantCount, outcome: "no_scorers", tiebreakUnresolved: false };
  }

  // A user-id fallback matters only where it decided a paid place: between two placed players,
  // or between the last placed player and the first one left out.
  let tiebreakUnresolved = false;
  for (let i = 0; i < placed.length; i += 1) {
    const next = standings[i + 1];
    if (next && sameStanding(standings[i], next)) tiebreakUnresolved = true;
  }

  return {
    places: placed.map((row, index) => ({
      place: index + 1,
      userId: row.userId,
      totalPoints: row.totalPoints,
      reachedAt: row.reachedAt,
    })),
    participantCount,
    outcome: "awarded",
    tiebreakUnresolved,
  };
};

// ── place_prizes: stored shape ↔ RewardPlacePrize ───────────────────────────────────────

const PRIZE_KINDS: readonly RewardPrizeKind[] = ["menu_item", "gift_card"];
const MENU_ITEMS: readonly RewardMenuItem[] = [
  "whole_order",
  "appetizer",
  "entree",
  "dessert",
  "wine_bottle",
  "other",
];
const DISCOUNT_KINDS: readonly RewardDiscountKind[] = ["dollar", "percent"];

/** The jsonb element stored in `challenge_campaigns.place_prizes` (read by the award RPC). */
export type StoredPlacePrize = {
  place: number;
  prize_kind: RewardPrizeKind;
  prize_gift_certificate_amount: number | null;
  prize_menu_item: RewardMenuItem | null;
  prize_menu_item_name: string | null;
  prize_discount_kind: RewardDiscountKind | null;
  prize_discount_value: number | null;
  prize_pos_value_cents: number | null;
  prize_pos_delivery: "gift_card" | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  allowed.includes(value as T) ? (value as T) : null;

/**
 * Stored `place_prizes` → typed prizes, 1st first. Null when absent or not a valid ladder
 * (not an array, 1-3 entries, places exactly 1..n, each with a known prize kind) — a caller
 * must treat null as "this reward cannot pay places", never as "no prize".
 */
export const normalizePlacePrizes = (raw: unknown): RewardPlacePrize[] | null => {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_RANKED_PLACES) return null;
  const prizes: RewardPlacePrize[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) return null;
    const place = Number(row.place);
    const prizeKind = pick(row.prize_kind, PRIZE_KINDS);
    if (!Number.isInteger(place) || !prizeKind) return null;
    prizes.push({
      place,
      prizeKind,
      prizeGiftCertificateAmount: finiteOrNull(row.prize_gift_certificate_amount),
      prizeMenuItem: pick(row.prize_menu_item, MENU_ITEMS),
      prizeMenuItemName: typeof row.prize_menu_item_name === "string" ? row.prize_menu_item_name : null,
      prizeDiscountKind: pick(row.prize_discount_kind, DISCOUNT_KINDS),
      prizeDiscountValue: finiteOrNull(row.prize_discount_value),
      prizePosValueCents: finiteOrNull(row.prize_pos_value_cents),
      prizePosDelivery: normalizePrizePosDelivery(row.prize_pos_delivery),
    });
  }
  prizes.sort((a, b) => a.place - b.place);
  if (prizes.some((prize, index) => prize.place !== index + 1)) return null;
  return prizes;
};

/** Typed prizes → the stored jsonb array. Validation of the prize itself is the caller's (Phase 3). */
export const serializePlacePrizes = (prizes: readonly RewardPlacePrize[]): StoredPlacePrize[] =>
  [...prizes]
    .sort((a, b) => a.place - b.place)
    .map((prize) => ({
      place: prize.place,
      prize_kind: prize.prizeKind,
      prize_gift_certificate_amount: prize.prizeGiftCertificateAmount ?? null,
      prize_menu_item: prize.prizeMenuItem ?? null,
      prize_menu_item_name: prize.prizeMenuItemName ?? null,
      prize_discount_kind: prize.prizeDiscountKind ?? null,
      prize_discount_value: prize.prizeDiscountValue ?? null,
      prize_pos_value_cents: prize.prizePosValueCents ?? null,
      prize_pos_delivery: prize.prizePosDelivery === "gift_card" ? "gift_card" : null,
    }));

/** Ranked places → the award_ranked_cycle_places `p_winners` payload. */
export const rankedPlacesRpcPayload = (
  places: readonly RankedPlace[],
): Array<{ user_id: string; place: number; points: number }> =>
  places.map((p) => ({ user_id: p.userId, place: p.place, points: p.totalPoints }));
