import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripePriceId, stripe } from "@/lib/stripe";

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
 *
 * The negotiated Price used to be created by hand in the Stripe Dashboard and
 * its id pasted into the admin form. That scope call was reversed (see
 * docs/billing-dollar-rate-plan.md): an admin mid-conversation with a bar owner,
 * on a phone, does not have the Dashboard open and has no way to know a
 * `price_…` id exists. So setCustomPrice now also takes a whole dollar amount
 * and resolves it to a Price itself.
 *
 * What makes that safe is `lookup_key`. Every minted Price carries
 * `custom_monthly_<cents>`, which is unique per Stripe account, so the resolver
 * finds and REUSES an existing Price for an amount instead of minting a new one
 * per admin action. Accumulation is therefore bounded by the number of distinct
 * dollar amounts ever negotiated — a small, self-labeling set — not by how many
 * times anyone touches the form. The same uniqueness doubles as the race guard:
 * two admins setting $75 at once means one create wins, the other gets a
 * duplicate-key error, re-resolves, and lands on the same Price.
 *
 * The pasted-id path stays. It costs nothing and it is the escape hatch for what
 * dollars-only cannot express — a legacy non-round rate, or a Price built by
 * hand at Stripe. Both entry points converge on the same validation block below,
 * which is why that block is not duplicated into the minting path.
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

/**
 * A loose sanity band on a typed dollar amount. It exists to catch $750 fat-
 * fingered for $75, not to police pricing policy — so it is deliberately wider
 * than any rate anyone would actually negotiate. Named exports so a future
 * policy change is one constant, not a grep.
 *
 * There is no confirmation step behind these. Whole-dollars-only already makes
 * the dangerous typo ($7.50 for $75, wrong by 10x and plausible-looking)
 * unrepresentable rather than merely detectable, and
 * CUSTOM_PRICE_PRORATION_BEHAVIOR means a wrong rate caught before the cycle
 * ends never reaches an invoice. That is one less tap on a phone.
 */
export const MIN_CUSTOM_PRICE_DOLLARS = 10;
export const MAX_CUSTOM_PRICE_DOLLARS = 1000;

/**
 * The Price's unique handle at Stripe, and the whole reason minting is bounded:
 * one Price per distinct amount, ever. Keyed on cents rather than dollars
 * because cents is the storage unit everywhere else in billing — a dollars-based
 * key would be the one place the unit flips.
 */
export const customPriceLookupKey = (cents: number): string => `custom_monthly_${cents}`;

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

/**
 * Shared because both entry points reach it: the dollar path checks it before
 * resolving, so a refused partner never causes a Price to be minted.
 */
const OFFLINE_ROW_ERROR =
  "This partner is billed offline — there is no Stripe subscription to move. Set their rate with Grant offline / Extend instead.";

/** Cheap shape check so an obvious paste error (a product or coupon id) 400s. */
export function isStripePriceId(value: string): boolean {
  return /^price_[A-Za-z0-9_]+$/.test(value);
}

const stripeErrorCode = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error
    ? ((error as { code?: unknown }).code as string) ?? null
    : null;

/** The error arm of SetCustomPriceResult, so callers handle exactly one shape. */
type CustomPriceFailure = Extract<SetCustomPriceResult, { ok: false }>;

export type ResolvePriceResult = { ok: true; priceId: string } | CustomPriceFailure;

/**
 * Find — or mint once — the monthly Price for a whole-dollar amount.
 *
 * The lookup is `prices.list({ lookup_keys })`, an exact match on one key.
 * Deliberately NOT a scan of `prices.list({ product })` for a matching
 * unit_amount: that paginates at 10, so a Product accumulating prices would
 * silently miss an existing match and mint a duplicate — defeating the reuse
 * property this whole design rests on.
 */
export async function resolveMonthlyPriceForAmount(
  amountDollars: number
): Promise<ResolvePriceResult> {
  if (!stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }
  if (!Number.isInteger(amountDollars)) {
    return {
      ok: false,
      status: 400,
      error: "Enter a whole dollar amount — no cents.",
    };
  }
  if (amountDollars < MIN_CUSTOM_PRICE_DOLLARS || amountDollars > MAX_CUSTOM_PRICE_DOLLARS) {
    return {
      ok: false,
      status: 400,
      error: `Enter a monthly rate between $${MIN_CUSTOM_PRICE_DOLLARS} and $${MAX_CUSTOM_PRICE_DOLLARS.toLocaleString(
        "en-US"
      )}.`,
    };
  }

  const unitAmount = amountDollars * 100;
  const lookupKey = customPriceLookupKey(unitAmount);

  const existing = await findPriceByLookupKey(lookupKey);
  if (!existing.ok) return existing;
  if (existing.priceId) return { ok: true, priceId: existing.priceId };

  // Custom prices must hang off the same Product as the list price, or Stripe's
  // own reporting splits this product line in two.
  const listPriceId = getStripePriceId();
  if (!isStripePriceId(listPriceId)) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  let productId: string;
  try {
    const listPrice = await stripe.prices.retrieve(listPriceId);
    productId = typeof listPrice.product === "string" ? listPrice.product : listPrice.product.id;
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to read the list price.",
    };
  }

  try {
    const created = await stripe.prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency: PRICE_CURRENCY,
      recurring: { interval: PRICE_INTERVAL, interval_count: PRICE_INTERVAL_COUNT },
      lookup_key: lookupKey,
    });
    return { ok: true, priceId: created.id };
  } catch (error) {
    // The concurrent-create path: another admin set the same amount between our
    // lookup and our create, and lookup_key uniqueness rejected ours. The race
    // winner already minted exactly the Price we wanted, so re-resolve onto it
    // rather than surfacing an error for something that in fact succeeded.
    const raced = await findPriceByLookupKey(lookupKey);
    if (raced.ok && raced.priceId) return { ok: true, priceId: raced.priceId };
    // A re-resolve that finds nothing is the archived-Price case ONLY when
    // Stripe actually rejected the create for a duplicate lookup_key: archiving
    // a Price does NOT free its key, so the key is taken by an object our
    // active-only lookup can't see and can't reuse. Say so, because the fix is a
    // human one in the Dashboard. Gating on the code matters — a rate limit, a
    // network blip, a restricted key or a bad product id would otherwise be
    // reported as an archived price that does not exist, sending the admin
    // hunting in the Dashboard while Stripe's real message is discarded.
    if (raced.ok && stripeErrorCode(error) === "resource_already_exists") {
      return {
        ok: false,
        status: 409,
        error: `An archived Stripe price already holds the key ${lookupKey} — unarchive it, or move the key, to use this amount.`,
      };
    }
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to create that price at Stripe.",
    };
  }
}

/**
 * One exact lookup. `priceId: null` means "no active price with that key", which
 * is not an error — it is the mint path's precondition.
 *
 * Active-only on purpose: an archived Price fails setCustomPrice's `!price.active`
 * guard anyway, so reusing one would only trade a clear refusal for a confusing
 * one further downstream.
 */
async function findPriceByLookupKey(
  lookupKey: string
): Promise<{ ok: true; priceId: string | null } | CustomPriceFailure> {
  if (!stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }
  try {
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    return { ok: true, priceId: found.data[0]?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to look up that price.",
    };
  }
}

/**
 * How the caller names the rate: a pasted Stripe price id, or a typed whole
 * dollar amount. A union rather than two optional fields, so "both supplied" is
 * unrepresentable here and the route's 400 for it is about the request body,
 * not about this function's contract.
 */
export type CustomPriceInput = { priceId: string } | { amountDollars: number };

/**
 * Swap the resolved Price onto the venue's subscription item and mirror the new
 * rate onto billing_subscriptions, so the admin list, the partner billing page
 * and the invoices display all report the real number. Reporting the real number
 * is the entire reason this uses a Price instead of a coupon.
 */
export async function setCustomPrice(
  row: CustomPriceRow,
  input: CustomPriceInput | string
): Promise<SetCustomPriceResult> {
  if (!supabaseAdmin || !stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  let priceId: string;
  if (typeof input === "string" || "priceId" in input) {
    priceId = typeof input === "string" ? input : input.priceId;
    if (!isStripePriceId(priceId)) {
      return { ok: false, status: 400, error: "A Stripe price id (price_…) is required." };
    }
  } else {
    // Resolving before the offline check would mint a Price for a partner whose
    // subscription we are about to refuse to touch. Refuse first.
    if (!row.stripe_subscription_id) {
      return { ok: false, status: 400, error: OFFLINE_ROW_ERROR };
    }
    const resolved = await resolveMonthlyPriceForAmount(input.amountDollars);
    if (!resolved.ok) return resolved;
    priceId = resolved.priceId;
  }

  if (!row.stripe_subscription_id) {
    return { ok: false, status: 400, error: OFFLINE_ROW_ERROR };
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
