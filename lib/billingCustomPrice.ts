import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

/**
 * Phase 8 of docs/billing-discounts-plan.md — the permanent negotiated rate.
 *
 * THIS IS NOT A DISCOUNT, which is why it lives here and not in
 * lib/billingDiscounts.ts (see that file's header). A partner locked in at
 * $75/mo forever is not "$100 with $25 off": they are simply on a different
 * Stripe **Price**. Modeling it as a `forever` coupon would misreport their real
 * rate on every invoice, in the admin list, and on their own billing page, and
 * would make a future list-price change ambiguous.
 *
 * The mechanism is a price swap on the subscription's existing item:
 *   stripe.subscriptions.update(id, {
 *     items: [{ id: itemId, price: newPriceId }], proration_behavior: ...
 *   })
 * The negotiated Price itself is created once in the Stripe Dashboard and its id
 * pasted into the admin form — a full self-service "enter any dollar amount"
 * price-minting UI is heavier than this feature needs, and Prices are permanent
 * objects that would accumulate in the dashboard forever.
 *
 * Offline/check-billed rows have no Stripe objects to swap a Price onto; they
 * are refused here and set their rate through the existing offline grant flow,
 * which already takes an explicit dollar amount.
 */

/**
 * Deliberately "none": the new rate takes effect at the next billing cycle with
 * no immediate credit or charge. Prorating a negotiated deal silently would hit
 * the partner with an unexpected mid-cycle charge (or refund) they never agreed
 * to. Exported so the test can assert the choice is enforced in code — never
 * rely on Stripe's account-level default, which can be changed out from under us.
 */
export const CUSTOM_PRICE_PRORATION_BEHAVIOR: Stripe.SubscriptionUpdateParams.ProrationBehavior =
  "none";

/** The currency every amount_cents in this app is denominated in. */
const PRICE_CURRENCY = "usd";

/**
 * The billing cadence the whole product assumes, kept next to PRICE_CURRENCY
 * because they are the same kind of assumption: both are baked into
 * `amount_cents`, which every surface renders as the per-cycle rate.
 *
 * Monthly is not a preference — the offline path's paidThroughDate, the
 * free_months discount mechanism and the welcome email's planAmountCents all
 * compute in months.
 */
const PRICE_INTERVAL: Stripe.Price.Recurring.Interval = "month";
const PRICE_INTERVAL_COUNT = 1;

/** "monthly", "yearly", "every 3 months" — for an error the admin can act on. */
const describeCadence = (interval: string, count: number): string => {
  if (count !== 1) return `every ${count} ${interval}s`;
  const named: Record<string, string> = {
    day: "daily",
    week: "weekly",
    month: "monthly",
    year: "yearly",
  };
  return named[interval] ?? `every ${interval}`;
};

/** Only the columns this helper reads. */
export type CustomPriceRow = {
  id: string;
  stripe_subscription_id: string | null;
  amount_cents: number;
};

export type SetCustomPriceResult =
  | {
      ok: true;
      priceId: string;
      amountCents: number;
      /** Always next-cycle; see CUSTOM_PRICE_PRORATION_BEHAVIOR. */
      effective: "next_cycle";
      /** Set when the swap succeeded at Stripe but our mirror write didn't. */
      warning?: string;
    }
  | { ok: false; status: number; error: string };

/** Cheap shape check so an obvious paste error (a product or coupon id) 400s. */
export function isStripePriceId(value: string): boolean {
  return /^price_[A-Za-z0-9_]+$/.test(value);
}

const stripeErrorCode = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error
    ? ((error as { code?: unknown }).code as string) ?? null
    : null;

/**
 * Swap `priceId` onto the venue's subscription item and mirror the new rate onto
 * billing_subscriptions, so the admin list, the partner billing page and the
 * invoices display all report the real number. Reporting the real number is the
 * entire reason this uses a Price instead of a coupon.
 */
export async function setCustomPrice(
  row: CustomPriceRow,
  priceId: string
): Promise<SetCustomPriceResult> {
  if (!isStripePriceId(priceId)) {
    return { ok: false, status: 400, error: "A Stripe price id (price_…) is required." };
  }
  if (!supabaseAdmin || !stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }
  if (!row.stripe_subscription_id) {
    return {
      ok: false,
      status: 400,
      error:
        "This partner is billed offline — there is no Stripe subscription to move. Set their rate with Grant offline / Extend instead.",
    };
  }

  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (error) {
    if (stripeErrorCode(error) === "resource_missing") {
      return { ok: false, status: 404, error: "No Stripe price with that id exists." };
    }
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to read that price.",
    };
  }

  // Every check below is a way the swap could "succeed" and leave the partner on
  // a rate we cannot represent (or cannot bill monthly), so they run before the
  // update rather than after.
  if (!price.active) {
    return { ok: false, status: 400, error: "That price is archived at Stripe." };
  }
  if (price.type !== "recurring" || !price.recurring) {
    return { ok: false, status: 400, error: "A subscription needs a recurring price." };
  }
  if (price.currency !== PRICE_CURRENCY) {
    return { ok: false, status: 400, error: "That price is not in USD." };
  }
  if (
    price.recurring.interval !== PRICE_INTERVAL ||
    (price.recurring.interval_count ?? 1) !== PRICE_INTERVAL_COUNT
  ) {
    // A yearly price passes every other check, flips the subscription to yearly
    // at Stripe, and writes the yearly figure into amount_cents — which the
    // owner page and the admin partner list both render as the MONTHLY rate.
    // interval_count matters just as much: "every 3 months" is a month-interval
    // price that would slip past an interval-only check and mis-state the rate
    // by 3x. See PRICE_INTERVAL above for why monthly is load-bearing.
    const cadence = describeCadence(price.recurring.interval, price.recurring.interval_count ?? 1);
    return {
      ok: false,
      status: 400,
      error: `That price bills ${cadence} — the Partner Dashboard is monthly-only.`,
    };
  }
  if (typeof price.unit_amount !== "number") {
    // Tiered/metered prices have no single unit_amount, so amount_cents — the
    // number every surface shows — would be a lie.
    return { ok: false, status: 400, error: "That price has no flat per-cycle amount." };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to read the subscription.",
    };
  }

  const items = subscription.items.data;
  if (items.length !== 1) {
    // Swapping "the" item is only unambiguous with exactly one. Everything this
    // app creates is single-item; anything else was built by hand at Stripe and
    // should be edited there.
    return {
      ok: false,
      status: 409,
      error: "This subscription has multiple items — change the price in the Stripe Dashboard.",
    };
  }

  try {
    await stripe.subscriptions.update(row.stripe_subscription_id, {
      items: [{ id: items[0].id, price: priceId }],
      proration_behavior: CUSTOM_PRICE_PRORATION_BEHAVIOR,
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to change the price.",
    };
  }

  const { error: mirrorError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ stripe_price_id: priceId, amount_cents: price.unit_amount })
    .eq("id", row.id);

  // Stripe is authoritative and the swap is already live there; the
  // customer.subscription.updated webhook re-derives amount_cents from the
  // price, so a failed mirror write self-heals. Report it, don't fail the swap.
  return {
    ok: true,
    priceId,
    amountCents: price.unit_amount,
    effective: "next_cycle",
    ...(mirrorError ? { warning: "Price changed at Stripe, but the local rate failed to update." } : {}),
  };
}
