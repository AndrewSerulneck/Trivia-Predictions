/**
 * Pure display arithmetic for partner billing, shared by the owner billing page
 * and its tests. No server-only imports — this runs in the browser.
 *
 * THE CONTRACT THIS MODULE DEPENDS ON: `billing_subscriptions.amount_cents` is
 * always the LIST rate, before any discount, for BOTH card and offline/check
 * rows. The discount lives only in the mirror columns, never folded into the
 * rate. Two things uphold that, and both have been broken before:
 *
 *   - lib/billingDiscounts.ts's offline path is mirror-only. An earlier version
 *     wrote the net back into amount_cents, which made this recompute
 *     double-count it.
 *   - the admin grant-manual field is labeled "Monthly rate before discount".
 *     It used to say "Amount received", which had the same effect: $100
 *     collected on a 25%-off deal rendered here as "$75 was $100". What was
 *     actually collected goes to the invoice record instead.
 *
 * Changing either one without the other reintroduces a double discount.
 */

/** Only the discount fields the arithmetic reads. */
export type DisplayDiscount = {
  percentOff: number | null;
  amountOffCents: number | null;
};

/** Only the subscription fields the arithmetic reads. */
export type DisplaySubscription = {
  amountCents: number;
  discount: DisplayDiscount | null;
};

/**
 * Applies one discount to a list rate. Percent wins when both are somehow set;
 * Stripe coupons are one or the other, never both.
 */
export const discountedAmountCents = (amountCents: number, discount: DisplayDiscount): number =>
  discount.percentOff != null
    ? Math.round(amountCents * (1 - discount.percentOff / 100))
    : discount.amountOffCents != null
      ? Math.max(0, amountCents - discount.amountOffCents)
      : amountCents;

/**
 * What this partner actually pays per cycle. Offline and card rows compute the
 * same way on purpose — see the contract note above.
 */
export const effectiveAmountCents = (subscription: DisplaySubscription): number =>
  subscription.discount
    ? discountedAmountCents(subscription.amountCents, subscription.discount)
    : subscription.amountCents;
