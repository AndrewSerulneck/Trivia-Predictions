import { prizePosValueCents } from "@/lib/pos/prizeValue";
import type { PrizePosDelivery, RewardDiscountKind, RewardPrizeKind } from "@/types";

// How a dollar-off menu-item prize is taken at a Square register
// (docs/square-scannable-prizes-plan.md). The partner picks per prize:
//   "discount"  — staff apply the ready-made "Hightop prize: …" discount (default; null = this).
//   "gift_card" — the coupon becomes a real Square gift card for the dollar amount, which staff
//                 scan or type as payment (lib/pos/squareGiftCards.ts).
//
// Percent-off and free-item prizes have no fixed dollar value, so they are discount-only.
// The database enforces the same rule on challenge_campaigns
// (challenge_campaigns_prize_pos_delivery_shape_check, 20261007030714_square_scannable_prizes.sql).
//
// Pure and client-safe: the wizard, the reward save path and the Square money path share it.

/**
 * A stored or submitted value → the type, or null. Null covers absent, "discount" stays
 * "discount", and anything unknown is null (= discount) — never a gift card.
 */
export const normalizePrizePosDelivery = (value: unknown): PrizePosDelivery | null =>
  value === "discount" || value === "gift_card" ? value : null;

/** Can this prize be a scannable Square gift card? Only a dollar-off menu-item prize. */
export const prizeCanBeScannableGiftCard = (
  prizeKind: RewardPrizeKind | string | null | undefined,
  discountKind: RewardDiscountKind | string | null | undefined,
): boolean => prizeKind === "menu_item" && discountKind === "dollar";

/**
 * THE predicate for "this menu prize is delivered as a Square gift card". A forged or stale
 * "gift_card" on any other prize shape is ignored (the prize stays a discount).
 */
export const isScannableGiftCardPrize = (prize: {
  prizeKind?: RewardPrizeKind | string | null | undefined;
  prizeDiscountKind?: RewardDiscountKind | string | null | undefined;
  prizePosDelivery?: PrizePosDelivery | string | null | undefined;
}): boolean =>
  normalizePrizePosDelivery(prize.prizePosDelivery) === "gift_card" &&
  prizeCanBeScannableGiftCard(prize.prizeKind, prize.prizeDiscountKind);

/**
 * THE "does this coupon become a Square gift card?" rule (lib/pos/squareGiftCards.ts — both the
 * guest's tap and the wallet list): a gift-card prize, a legacy gift certificate (no prize_kind),
 * or a scannable dollar-off menu prize. The discount path (lib/pos/squareDiscounts.ts) skips
 * scannable prizes with isScannableGiftCardPrize, so a coupon never offers both.
 */
export const isSquareGiftCardPrize = (prize: {
  prizeKind?: RewardPrizeKind | string | null | undefined;
  prizeType?: string | null | undefined;
  prizeDiscountKind?: RewardDiscountKind | string | null | undefined;
  prizePosDelivery?: PrizePosDelivery | string | null | undefined;
}): boolean =>
  prize.prizeKind === "gift_card" ||
  (!prize.prizeKind && prize.prizeType === "gift_certificate") ||
  isScannableGiftCardPrize(prize);

/**
 * Dollars on the Square gift card a coupon becomes: a gift-card prize's amount, or a scannable
 * dollar-off prize's discount. Null when the coupon isn't a Square gift card or has no amount.
 * Client-safe (the wallet's offer text); the money path prices from the coupon row in
 * lib/pos/squareGiftCards.ts, never from this.
 */
export const squareGiftCardDollars = (win: {
  prizeKind?: RewardPrizeKind | string | null | undefined;
  prizeType?: string | null | undefined;
  prizeDiscountKind?: RewardDiscountKind | string | null | undefined;
  prizePosDelivery?: PrizePosDelivery | string | null | undefined;
  prizeDiscountValue?: number | null | undefined;
  prizeGiftCertificateAmount?: number | null | undefined;
}): number | null => {
  if (!isSquareGiftCardPrize(win)) return null;
  // Valued by THE one home (lib/pos/prizeValue.ts) so the offer shows what the card is funded at.
  const scannable = isScannableGiftCardPrize(win);
  const cents = prizePosValueCents({
    prizeKind: scannable ? "menu_item" : "gift_card",
    prizeDiscountKind: scannable ? "dollar" : null,
    prizeDiscountValue: scannable ? (win.prizeDiscountValue ?? null) : null,
    prizeGiftCertificateAmount: scannable ? null : (win.prizeGiftCertificateAmount ?? null),
    prizePosValueCents: null,
  });
  return cents === null ? null : cents / 100;
};
