// The March Madness prize's terms, restated for the partner (wizard Confirm, the Prizes list).
// Pure and client-safe. Kept out of lib/bracketPrizes.ts, which must stay a leaf: the reward registry
// imports that file, and lib/rankedPlaceRewards.ts (the ladder sentence) imports the registry.

import { describeBracketPrizeKeys, normalizeBracketPrizeKeys, type BracketPrizeKey } from "@/lib/bracketPrizes";
import { describePlacePrizeLadder } from "@/lib/rankedPlaceRewards";
import type { RewardPlacePrize } from "@/types";

/**
 * The terms the partner agreed to, restated (wizard Confirm, the partner's Prizes list): "Top 3 in
 * the men's bracket and the women's bracket, each paid separately. 1st place wins … At least 4
 * players need to fill out that bracket." Without the brackets (an unreadable row), the ladder alone.
 */
export const describeBracketPrizeTerms = (
  keys: readonly BracketPrizeKey[] | null | undefined,
  placePrizes: readonly RewardPlacePrize[] | null | undefined,
  minPlayers: number | null | undefined,
): string => {
  const known = normalizeBracketPrizeKeys(keys ?? null);
  const places = placePrizes?.length ?? 0;
  const top = places <= 1 ? "Winner" : `Top ${places}`;
  const where = known
    ? ` in ${describeBracketPrizeKeys(known, "and")}${known.length > 1 ? ", each paid separately" : ""}`
    : "";
  const ladder = describePlacePrizeLadder(placePrizes);
  const min = minPlayers ? ` At least ${minPlayers} players need to fill out that bracket.` : "";
  return `${top}${where}.${ladder ? ` ${ladder}` : ""}${min}`;
};

