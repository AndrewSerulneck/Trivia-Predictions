// Pure rules shared by the guest's gift-card tap (lib/pos/squareGiftCards.ts), the prize wallet
// badge, and the admin stuck-claim list (lib/pos/squareStuckClaims.ts). No I/O, no server-only:
// one home so the three can't drift apart again (docs/square-review-fixes-plan.md R1).

/** The Square gift card ledger row's idempotency key for one coupon. */
export const squareApplyKey = (redemptionId: string): string => `${redemptionId}:square:apply`;

/**
 * Did OUR claim win this coupon? True when the coupon was redeemed with method `pos_square`
 * and the ledger row holds the card we prepared. Such a coupon must always be resumable to a
 * funded card — whatever the ledger row's status says.
 *
 * Why status doesn't matter: every writer of a terminal `failed` either runs BEFORE the claim
 * (the currency check — the coupon is still unredeemed then) or only when ANOTHER method won
 * (`lost_to_guest_confirm` — redeemed_method isn't pos_square). A `failed` row on a coupon we
 * claimed can only be a mis-recorded claim error (an RPC that committed, then threw), and
 * refusing it would leave the guest with neither a coupon nor a card.
 */
export const isOurSquareClaim = (
  row: { external_ref: string | null } | null | undefined,
  coupon: { prize_redeemed_at: string | null; redeemed_method: string | null } | null | undefined,
): boolean => Boolean(coupon?.prize_redeemed_at && coupon.redeemed_method === "pos_square" && row?.external_ref);
