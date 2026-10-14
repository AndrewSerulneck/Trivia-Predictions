// What the Create Reward wizard's prize step holds for ONE prize, and how that becomes the
// prize the server validates. A weekly places reward has up to three of them (one per place);
// every other reward has exactly one (index 0). Pure and client-safe: no React, no Supabase.
//
// Moved out of components/rewards/CreateRewardWizard.tsx in Phase 6 of
// docs/live-trivia-weekly-places-reward-plan.md so the one-prize and the per-place paths
// derive a prize the same way. The rules here are the wizard's original ones, unchanged.

import { prizeCanBeScannableGiftCard } from "@/lib/pos/prizeDelivery";
import { parsePosValueDollars, prizeNeedsPosValue } from "@/lib/pos/prizeValue";
import { REWARD_MIN_PLAYERS_MAX, REWARD_MIN_PLAYERS_MIN } from "@/lib/rankedPlaceRewards";
import type { RewardPrizeInput } from "@/lib/rewards";
import type { RewardDiscountKind, RewardMenuItem, RewardPlacePrize } from "@/types";

export type PrizeChoice = "menu_item" | "gift_card";

/** One prize as the partner is typing it. Numbers stay text so a half-typed value isn't lost. */
export type PrizeDraft = {
  choice: PrizeChoice;
  menuItem: RewardMenuItem;
  menuItemName: string;
  discountKind: RewardDiscountKind;
  discountValue: string;
  giftCardAmount: string;
  posValue: string;
  scannableGiftCard: boolean;
};

export const DEFAULT_PRIZE_DRAFT: PrizeDraft = {
  choice: "menu_item",
  menuItem: "appetizer",
  menuItemName: "",
  discountKind: "percent",
  discountValue: "50",
  giftCardAmount: "25",
  posValue: "",
  scannableGiftCard: false,
};

/** What the venue allows, from the wizard's context and switches. */
export type PrizeDraftEnvironment = {
  /** The venue has a live POS connection (a percent-off prize may carry a register limit). */
  posConnected: boolean;
  /** NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED (`isPosIntegrationsEnabled()`). */
  posIntegrations: boolean;
};

export type DerivedPrize = {
  prize: RewardPrizeInput;
  asksPosValue: boolean;
  asksPosDelivery: boolean;
  posValueCents: number | null;
  /** Something is typed in the register-limit box that isn't a dollar amount. */
  posValueInvalid: boolean;
};

export const derivePrizeFromDraft = (draft: PrizeDraft, env: PrizeDraftEnvironment): DerivedPrize => {
  const asksPosValue = env.posConnected && prizeNeedsPosValue(draft.choice, draft.discountKind);
  // Dollar-off prizes only, for everyone while the POS switch is on (Andrew, 2026-10-06).
  const asksPosDelivery =
    env.posIntegrations && draft.choice === "menu_item" && prizeCanBeScannableGiftCard("menu_item", draft.discountKind);
  const posDeliveryGiftCard = asksPosDelivery && draft.scannableGiftCard;
  const posValueCents = asksPosValue ? parsePosValueDollars(draft.posValue) : null;
  // The register limit is OPTIONAL (Andrew, POS plan §6 item 3, 2026-10-06): blank = no limit.
  const posValueInvalid = asksPosValue && draft.posValue.trim() !== "" && posValueCents === null;

  const prize: RewardPrizeInput =
    draft.choice === "gift_card"
      ? { prizeKind: "gift_card", amount: Math.max(0.01, Number(draft.giftCardAmount) || 0) }
      : {
          prizeKind: "menu_item",
          menuItem: draft.menuItem,
          menuItemName: draft.menuItem === "other" ? draft.menuItemName.trim() : null,
          discountKind: draft.discountKind,
          discountValue: Math.max(0.01, Number(draft.discountValue) || 0),
          // Sent only when asked, so a venue without a POS submits exactly what it did before.
          ...(posValueCents !== null ? { posValueCents } : {}),
          // Same rule: only when chosen, so every other submission is byte-for-byte what it was.
          ...(posDeliveryGiftCard ? { posDelivery: "gift_card" as const } : {}),
        };
  return { prize, asksPosValue, asksPosDelivery, posValueCents, posValueInvalid };
};

/** The wizard's prize input as the stored place prize the guest wording is composed from. */
export const placePrizeFromInput = (place: number, prize: RewardPrizeInput): RewardPlacePrize =>
  prize.prizeKind === "gift_card"
    ? {
        place,
        prizeKind: "gift_card",
        prizeGiftCertificateAmount: prize.amount,
        prizeMenuItem: null,
        prizeMenuItemName: null,
        prizeDiscountKind: null,
        prizeDiscountValue: null,
        prizePosValueCents: null,
        prizePosDelivery: null,
      }
    : {
        place,
        prizeKind: "menu_item",
        prizeGiftCertificateAmount: null,
        prizeMenuItem: prize.menuItem,
        prizeMenuItemName: prize.menuItemName ?? null,
        prizeDiscountKind: prize.discountKind,
        prizeDiscountValue: prize.discountValue,
        prizePosValueCents: prize.posValueCents ?? null,
        prizePosDelivery: prize.posDelivery ?? null,
      };

export const MIN_PLAYERS_RANGE_MESSAGE = `Minimum players must be a whole number from ${REWARD_MIN_PLAYERS_MIN} to ${REWARD_MIN_PLAYERS_MAX}.`;

/** The minimum-players box → a number, or the sentence to show when it isn't one. */
export const parseMinPlayersInput = (text: string): { ok: true; value: number } | { ok: false; message: string } => {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || value < REWARD_MIN_PLAYERS_MIN || value > REWARD_MIN_PLAYERS_MAX) {
    return { ok: false, message: MIN_PLAYERS_RANGE_MESSAGE };
  }
  return { ok: true, value };
};
