import type { RewardDiscountKind, RewardPrizeKind } from "@/types";

// What a prize is worth at the register, in integer cents
// (docs/pos-rewards-integration-plan.md §1 "dollar cap", Phase 1).
//
// Registers discount money, not menu ideas:
//   - gift card            → its amount;
//   - "$5 off an entrée"   → $5 (the dollar discount IS the value);
//   - "50% off appetizer"  → unknown until the partner says what it's worth. That figure is
//                            `prize_pos_value_cents`, asked by the reward wizard only when the
//                            venue has a POS connected. Null here = this prize can't go on a
//                            POS; the guest keeps the normal coupon.
//
// Pure and client-safe: the wizard and the Phase 2/3 apply services share it. Phase 3 still
// caps the result by the open check's total.

/** Upper bound for the cap, matching the column's check constraint ($10,000). */
export const POS_VALUE_MAX_CENTS = 1_000_000;

export type PosValuePrize = {
  prizeKind: RewardPrizeKind | null;
  prizeDiscountKind: RewardDiscountKind | null;
  prizeDiscountValue: number | null;
  prizeGiftCertificateAmount: number | null;
  prizePosValueCents: number | null;
};

const dollarsToCents = (dollars: number | null): number | null => {
  if (dollars === null || !Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.min(POS_VALUE_MAX_CENTS, Math.round(dollars * 100));
};

const validCents = (cents: number | null): number | null =>
  cents !== null && Number.isInteger(cents) && cents >= 1 && cents <= POS_VALUE_MAX_CENTS ? cents : null;

export const prizePosValueCents = (prize: PosValuePrize): number | null => {
  if (prize.prizeKind === "gift_card") return dollarsToCents(prize.prizeGiftCertificateAmount);
  if (prize.prizeKind === "menu_item") {
    if (prize.prizeDiscountKind === "dollar") return dollarsToCents(prize.prizeDiscountValue);
    if (prize.prizeDiscountKind === "percent") return validCents(prize.prizePosValueCents);
  }
  return null;
};

/** Does the wizard need to ask "value at the register?" for this prize? */
export const prizeNeedsPosValue = (prizeKind: RewardPrizeKind | null, discountKind: RewardDiscountKind | null): boolean =>
  prizeKind === "menu_item" && discountKind === "percent";

/**
 * Parse the wizard's "$" text box into cents. Null for blank, non-numeric, zero, negative
 * or over the cap — the caller turns null into its own "enter a value" message.
 */
export const parsePosValueDollars = (text: string): number | null => {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return validCents(Math.round(Number(trimmed) * 100));
};
