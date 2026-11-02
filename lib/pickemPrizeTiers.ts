// A Pick 'Em Prize's "X out of N" tiers as stored in challenge_campaigns.pickem_tiers
// (docs/pickem-college-football-and-prize-plan.md Phase 4a). Pure and client-safe. Kept out of
// lib/pickemPrizes.ts, which must stay a leaf: the reward registry imports that file, and
// lib/rankedPlaceRewards.ts (the place-prize shape reused here) imports the registry.
//
// Each stored tier is one place_prizes element (place = tier number, 1 = the lowest) plus `correct`
// and `quantity`, so the Phase 4b award can copy a tier's prize the way award_ranked_cycle_places
// copies a place's.

import { PICKEM_PRIZE_MAX_PICK_LIMIT, PICKEM_PRIZE_MAX_QUANTITY, PICKEM_PRIZE_MAX_TIERS } from "@/lib/pickemPrizes";
import { normalizePlacePrizes, serializePlacePrizes, type StoredPlacePrize } from "@/lib/rankedPlaceRewards";
import type { PickEmPrizeTier } from "@/types";

export type StoredPickEmPrizeTier = StoredPlacePrize & { correct: number; quantity: number };

const wholeIn = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Stored tiers → typed tiers, lowest first. Null when absent or not a valid ladder (1–3 tiers numbered
 * 1..n, each with a known prize, `correct` strictly rising, `quantity` 1–100) — a caller must treat
 * null as "this prize cannot pay tiers", never as "no tiers".
 */
export const normalizePickEmPrizeTiers = (raw: unknown): PickEmPrizeTier[] | null => {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PICKEM_PRIZE_MAX_TIERS) return null;
  const prizes = normalizePlacePrizes(raw);
  if (!prizes) return null;
  const tiers: PickEmPrizeTier[] = [];
  for (const prize of prizes) {
    const row = raw.find((entry) => Number((entry as { place?: unknown } | null)?.place) === prize.place) as
      | Record<string, unknown>
      | undefined;
    const correct = wholeIn(row?.correct, 1, PICKEM_PRIZE_MAX_PICK_LIMIT);
    const quantity = wholeIn(row?.quantity, 1, PICKEM_PRIZE_MAX_QUANTITY);
    if (correct === null || quantity === null) return null;
    if (tiers.length > 0 && correct <= tiers[tiers.length - 1].correct) return null;
    tiers.push({ ...prize, correct, quantity });
  }
  return tiers;
};

/** Typed tiers → the stored jsonb array. The terms are validated by createReward first. */
export const serializePickEmPrizeTiers = (tiers: readonly PickEmPrizeTier[]): StoredPickEmPrizeTier[] => {
  const byPlace = new Map(tiers.map((tier) => [tier.place, tier]));
  return serializePlacePrizes(tiers).map((stored) => ({
    ...stored,
    correct: byPlace.get(stored.place)?.correct ?? 0,
    quantity: byPlace.get(stored.place)?.quantity ?? 0,
  }));
};
