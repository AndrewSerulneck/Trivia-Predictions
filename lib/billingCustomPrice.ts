import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeGraduatedPriceId, getStripePriceId, stripe } from "@/lib/stripe";
import { isDefinitiveStripeRejection, VENUE_ADDITION_LEASE_MS } from "@/lib/venueAddition";
import { monthlyTotalCents } from "@/lib/venuePricing";

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
 *
 * MULTI-VENUE (docs/multi-venue-volume-billing-plan.md Phase 6; Andrew, 2026-10-11:
 * "per-venue rate"). The rate is PER VENUE: the swap keeps the item's quantity
 * (= venues on the bill), so the bill becomes rate × venues with no volume bands,
 * and a venue the partner adds or removes later is billed at the same rate
 * (lib/venuePricing.ts `BillRate`). A coupon still applies on top of the whole
 * bill. On a 1-venue bill this is exactly the custom rate that existed before.
 * `setStandardPrice` moves the bill back onto the graduated bands.
 *
 * Both swaps write the item's quantity explicitly, and both are a CLAIMED change
 * on the bill (Phase 6.1, `claim_bill_price_change` — migration 20261011224839):
 * the same per-bill advisory lock as "Add a venue" and Remove / Undo, so the
 * swap refuses while either is in flight and neither can start while it is.
 * Any `items` update discards an add's pending 3-D Secure payment, and an
 * absolute quantity written next to a quantity change could undo it. A swap
 * that dies mid-way stays `pending` (the bill stays locked) until its lease
 * runs out; `settleBillPriceChange` then decides it from Stripe's real Price.
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
  /** The bill's owner as the caller read it; the claim refuses if it has changed since. */
  owner_id: string | null;
  stripe_subscription_id: string | null;
  amount_cents: number;
};

export type SetCustomPriceResult =
  | {
      ok: true;
      priceId: string;
      /** The per-venue monthly rate (the Price's unit amount). */
      amountCents: number;
      /** Venues on the bill (the item's quantity), and the whole bill's monthly list total. */
      quantity: number;
      monthlyTotalCents: number;
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
    // number every surface shows — would be a lie. (The graduated bands have their
    // own entry point, setStandardPrice.)
    return { ok: false, status: 400, error: "That price has no flat per-cycle amount." };
  }

  const unitAmount = price.unit_amount;
  return swapSubscriptionPrice(row, row.stripe_subscription_id, priceId, (quantity) => unitAmount * quantity, unitAmount);
}

/**
 * Put a bill back on the standard graduated bands ($100 / $75 / $60 / $45),
 * keeping its venue count — the undo of a negotiated per-venue rate. Same
 * next-cycle, no-proration rule as setCustomPrice.
 */
export async function setStandardPrice(row: CustomPriceRow): Promise<SetCustomPriceResult> {
  if (!supabaseAdmin || !stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }
  if (!row.stripe_subscription_id) {
    return { ok: false, status: 400, error: OFFLINE_ROW_ERROR };
  }
  const graduatedPriceId = getStripeGraduatedPriceId();
  if (!isStripePriceId(graduatedPriceId)) {
    return { ok: false, status: 500, error: "The standard price isn't configured (STRIPE_GRADUATED_PRICE_ID)." };
  }
  return swapSubscriptionPrice(row, row.stripe_subscription_id, graduatedPriceId, (quantity) => monthlyTotalCents(quantity), null);
}

// --- The bill's lock (multi-venue billing Phase 6.1) ---------------------------------------------

const LOG = "[CustomPrice]";

/** Stale price swaps the daily cron settles per run. Each costs one Stripe read; normally zero rows. */
export const BILL_PRICE_CHANGE_RECONCILE_LIMIT = 20;

const VENUE_CHANGE_BUSY_ERROR =
  "A venue is being added to or removed from this bill right now (possibly waiting for the partner's card check). Try again once it has finished.";
const PRICE_CHANGE_BUSY_ERROR = "Another price change on this bill is still going through. Try again in a minute.";
const PRICE_LOCK_UNAVAILABLE_ERROR = "Price changes are temporarily unavailable. Try again in a moment.";
const PRICE_CHANGE_UNCONFIRMED_ERROR =
  "Stripe didn't confirm the price change. It is checked automatically within about 10 minutes — look at the subscription in Stripe before trying again.";

/**
 * One admin swap's ledger key — and Stripe's idempotency key for its update. Fresh per admin action:
 * a repeated "Set rate" is a new decision (and harmless — the same Price lands again), while a
 * concurrent one is refused by the claim as `busy_change`.
 */
const priceChangeKey = (billId: string): string => `bill-price:${billId}:${randomUUID()}`;

type ClaimPriceRpcRow = {
  outcome: "claimed" | "existing" | "key_conflict" | "busy_addition" | "busy_change" | "not_owner" | "no_bill" | "invalid";
  change_id: string | null;
  change_action: string | null;
};

type FinishPriceRpcRow = {
  outcome: "done" | "failed" | "already" | "wrong_action" | "not_found" | "invalid";
  change_status: "pending" | "done" | "failed" | null;
};

const isMissingFunction = (error: { code?: string; message?: string }, name: string): boolean =>
  error.code === "PGRST202" || error.code === "42883" || (error.message ?? "").includes(name);

/**
 * Claim the bill for one price swap (`claim_bill_price_change`, migration 20261011224839): the SAME
 * per-bill advisory lock as "Add a venue" and Remove / Undo, so a swap, an add and a change are
 * mutually exclusive inside Postgres — never a TypeScript read-then-write. FAILS CLOSED: a missing
 * RPC (the app deployed before the migration) refuses the swap; it never falls back to an unlocked one.
 */
async function claimPriceChange(
  key: string,
  ownerId: string | null,
  billId: string,
  priceId: string
): Promise<{ ok: true; changeId: string } | CustomPriceFailure> {
  const { data, error } = await supabaseAdmin!.rpc("claim_bill_price_change", {
    p_idempotency_key: key,
    p_owner_id: ownerId,
    p_subscription_id: billId,
    p_price_id: priceId,
  });
  if (error) {
    if (isMissingFunction(error, "claim_bill_price_change")) {
      console.error(`${LOG} claim-rpc-missing — apply supabase/migrations/20261011224839_bill_price_change_lock.sql`);
    } else {
      console.error(`${LOG} claim-failed bill=${billId}: ${error.message}`);
    }
    return { ok: false, status: 503, error: PRICE_LOCK_UNAVAILABLE_ERROR };
  }
  const claim = (Array.isArray(data) ? data[0] : data) as ClaimPriceRpcRow | null;
  if (!claim || typeof claim.outcome !== "string") {
    console.error(`${LOG} claim-malformed-response bill=${billId}`);
    return { ok: false, status: 503, error: PRICE_LOCK_UNAVAILABLE_ERROR };
  }
  switch (claim.outcome) {
    case "claimed":
      if (claim.change_id) return { ok: true, changeId: claim.change_id };
      console.error(`${LOG} claim-malformed-response bill=${billId}`);
      return { ok: false, status: 503, error: PRICE_LOCK_UNAVAILABLE_ERROR };
    case "busy_addition":
      return { ok: false, status: 409, error: VENUE_CHANGE_BUSY_ERROR };
    case "busy_change":
      return { ok: false, status: 409, error: claim.change_action === "price" ? PRICE_CHANGE_BUSY_ERROR : VENUE_CHANGE_BUSY_ERROR };
    case "not_owner":
      return { ok: false, status: 409, error: "This bill changed hands while you were looking at it. Reload and try again." };
    case "no_bill":
      return { ok: false, status: 404, error: "No subscription found for this venue." };
    default:
      // `existing` / `key_conflict` cannot happen with a fresh key per action; `invalid` is a bug here.
      console.error(`${LOG} claim-unexpected outcome=${claim.outcome} bill=${billId}`);
      return { ok: false, status: 500, error: "Couldn't start the price change. Try again." };
  }
}

/** `finish_bill_price_change`. Throws on a database error (the row then stays pending and is settled later). */
async function finishPriceChange(changeId: string, outcome: "done" | "failed", reason: string | null): Promise<FinishPriceRpcRow> {
  const { data, error } = await supabaseAdmin!.rpc("finish_bill_price_change", {
    p_change_id: changeId,
    p_outcome: outcome,
    p_failure_reason: reason,
  });
  if (error) {
    if (isMissingFunction(error, "finish_bill_price_change")) {
      console.error(`${LOG} finish-rpc-missing — apply supabase/migrations/20261011224839_bill_price_change_lock.sql`);
    }
    throw new Error(`finish-failed: ${error.message}`);
  }
  const result = (Array.isArray(data) ? data[0] : data) as FinishPriceRpcRow | null;
  if (!result || typeof result.outcome !== "string") throw new Error("finish-malformed-response");
  return result;
}

/**
 * Close a claimed swap, best effort: a row this fails to close stays `pending` and is settled from
 * Stripe's real Price once its lease runs out (`settleBillPriceChange`). Returns whether it closed.
 */
async function closePriceChange(changeId: string, outcome: "done" | "failed", reason: string | null): Promise<boolean> {
  try {
    await finishPriceChange(changeId, outcome, reason);
    return true;
  } catch (error) {
    console.error(`${LOG} finish-failed change=${changeId} outcome=${outcome}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * The swap both entry points share: claim the bill, read the subscription, one item, quantity kept
 * (written explicitly), proration "none", close the claim, then the mirror. `unitAmountCents` is the
 * per-venue rate for a flat Price, null for the graduated bands.
 *
 * Claim FIRST, read SECOND: once claimed, no add, Remove / Undo or other swap can move this bill
 * until the row is closed, so the quantity read here is still the quantity when the update lands.
 */
async function swapSubscriptionPrice(
  bill: Pick<CustomPriceRow, "id" | "owner_id">,
  subscriptionId: string,
  priceId: string,
  monthlyTotalFor: (quantity: number) => number,
  unitAmountCents: number | null
): Promise<SetCustomPriceResult> {
  const key = priceChangeKey(bill.id);
  const claimed = await claimPriceChange(key, bill.owner_id, bill.id, priceId);
  if (!claimed.ok) return claimed;
  const { changeId } = claimed;

  // Nothing reached Stripe: close the claim as failed so it never blocks the bill.
  const abandon = async (reason: string, failure: CustomPriceFailure): Promise<CustomPriceFailure> => {
    await closePriceChange(changeId, "failed", reason);
    return failure;
  };

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe!.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    return abandon("subscription-read-failed", {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to read the subscription.",
    });
  }

  const items = subscription.items.data;
  if (items.length !== 1) {
    // Swapping "the" item is only unambiguous with exactly one. Everything this
    // app creates is single-item; anything else was built by hand at Stripe and
    // should be edited there.
    return abandon("refused:multiple-items", {
      ok: false,
      status: 409,
      error: "This subscription has multiple items — change the price in the Stripe Dashboard.",
    });
  }
  if (subscription.pending_update) {
    // An update Stripe is still holding (an add's unpaid 3-D Secure) — an items update would void it.
    return abandon("refused:pending-update", { ok: false, status: 409, error: VENUE_CHANGE_BUSY_ERROR });
  }

  const quantity =
    typeof items[0].quantity === "number" && Number.isInteger(items[0].quantity) && items[0].quantity >= 1
      ? items[0].quantity
      : 1;

  try {
    await stripe!.subscriptions.update(
      subscriptionId,
      {
        items: [{ id: items[0].id, price: priceId, quantity }],
        proration_behavior: CUSTOM_PRICE_PRORATION_BEHAVIOR,
      },
      { idempotencyKey: key }
    );
  } catch (error) {
    if (isDefinitiveStripeRejection(error)) {
      return abandon(`stripe-rejected: ${stripeErrorCode(error) ?? "unknown"}`, {
        ok: false,
        status: 502,
        error: error instanceof Error ? error.message : "Failed to change the price.",
      });
    }
    // Ambiguous (5xx / connection) — it may have landed. The claim stays pending, so the bill stays
    // locked, until its lease runs out and settleBillPriceChange reads Stripe's real Price.
    console.error(`${LOG} stripe-update-ambiguous change=${changeId}: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: 503, error: PRICE_CHANGE_UNCONFIRMED_ERROR };
  }

  const closed = await closePriceChange(changeId, "done", null);

  const total = monthlyTotalFor(quantity);
  const { error: mirrorError } = await supabaseAdmin!
    .from("billing_subscriptions")
    .update({ stripe_price_id: priceId, amount_cents: total, quantity })
    .eq("id", bill.id);

  // Stripe is authoritative and the swap is already live there; the
  // customer.subscription.updated webhook re-derives amount_cents from the
  // price × quantity, so a failed mirror write self-heals. Report it, don't fail the swap.
  // An unclosed claim also heals (settled as done after its lease) but keeps the bill busy until then.
  const warning = mirrorError
    ? "Price changed at Stripe, but the local rate failed to update."
    : !closed
      ? "Price changed at Stripe. Venue changes on this bill stay paused for about 10 minutes."
      : undefined;
  return {
    ok: true,
    priceId,
    amountCents: unitAmountCents ?? total,
    quantity,
    monthlyTotalCents: total,
    effective: "next_cycle",
    ...(warning ? { warning } : {}),
  };
}

// --- Settling a swap that never closed ------------------------------------------------------------

export type BillPriceChangeRow = {
  id: string;
  idempotency_key: string;
  owner_id: string | null;
  subscription_id: string | null;
  action: string;
  status: "pending" | "done" | "failed";
  price_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

const PRICE_CHANGE_COLUMNS =
  "id, idempotency_key, owner_id, subscription_id, action, status, price_id, failure_reason, created_at, updated_at";

export type PriceChangeSettleState = "done" | "failed" | "in_flight" | "unknown";

/**
 * DEPLOY-SKEW SAFE: before 20261011224839 is applied there is no `price_id` column (42703) and so no
 * price rows to settle. The settlers then do nothing (logged once) instead of erroring on every add,
 * remove and cron run. The swap itself still fails closed (its claim RPC is missing).
 */
let warnedMissingPriceLedger = false;
const isMissingPriceLedger = (error: { code?: string }): boolean => {
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") {
    if (!warnedMissingPriceLedger) {
      warnedMissingPriceLedger = true;
      console.warn(`${LOG} price-ledger-missing — apply supabase/migrations/20261011224839_bill_price_change_lock.sql`);
    }
    return true;
  }
  return false;
};

/**
 * Bring one price swap up to date with Stripe once its lease has run out — the request that claimed
 * it died, or Stripe's answer was ambiguous. The subscription's sole item is on the target Price →
 * `done` (it landed; the webhook mirrors the bill); otherwise → `failed`. A Stripe read that fails
 * leaves it pending for the next pass. Throws on a database error.
 */
export async function settleBillPriceChange(row: BillPriceChangeRow, nowMs: number = Date.now()): Promise<PriceChangeSettleState> {
  if (row.status === "done" || row.status === "failed") return row.status;
  if (row.action !== "price") return "unknown";
  if (nowMs - Date.parse(row.updated_at) < VENUE_ADDITION_LEASE_MS) return "in_flight";
  if (!supabaseAdmin || !stripe) return "unknown";

  const close = async (outcome: "done" | "failed", reason: string | null): Promise<PriceChangeSettleState> => {
    const finished = await finishPriceChange(row.id, outcome, reason);
    return finished.change_status === "done" || finished.change_status === "failed" ? finished.change_status : "unknown";
  };

  if (!row.subscription_id) return close("failed", "no-bill");
  const { data: bill, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id")
    .eq("id", row.subscription_id)
    .maybeSingle<{ id: string; stripe_subscription_id: string | null }>();
  if (error) throw new Error(`bill-read-failed: ${error.message}`);
  if (!bill?.stripe_subscription_id) return close("failed", "bill-has-no-subscription");

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
  } catch (readError) {
    if (stripeErrorCode(readError) === "resource_missing") return close("failed", "subscription-missing");
    console.error(
      `${LOG} settle-read-failed change=${row.id}: ${readError instanceof Error ? readError.message : String(readError)}`
    );
    return "unknown";
  }
  const items = subscription.items?.data ?? [];
  if (items.length === 1 && items[0].price?.id === row.price_id) {
    console.log(`${LOG} settled-landed change=${row.id} bill=${row.subscription_id} price=${row.price_id}`);
    return close("done", null);
  }
  console.warn(`${LOG} settled-not-applied change=${row.id} bill=${row.subscription_id} price=${row.price_id}`);
  return close("failed", "stripe-price-not-applied");
}

/**
 * Settle this bill's price swaps stuck past their lease, so a swap that died mid-way doesn't keep the
 * bill busy (adds and removes included) until the daily cron. Called through
 * lib/venueRemoval.ts `settleStaleVenueChangesForBill`, which every add / quote / remove route and the
 * admin price routes run first. Never throws.
 */
export async function settleStaleBillPriceChangesForBill(billId: string, nowMs: number = Date.now()): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("billing_venue_changes")
      .select(PRICE_CHANGE_COLUMNS)
      .eq("subscription_id", billId)
      .eq("action", "price")
      .eq("status", "pending")
      .lt("updated_at", new Date(nowMs - VENUE_ADDITION_LEASE_MS).toISOString())
      .limit(5)
      .returns<BillPriceChangeRow[]>();
    if (error) {
      if (isMissingPriceLedger(error)) return;
      throw new Error(error.message);
    }
    for (const row of data ?? []) await settleBillPriceChange(row, nowMs);
  } catch (error) {
    console.error(`${LOG} settle-failed bill=${billId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type BillPriceChangeReconcileResult = {
  dryRun: boolean;
  scanned: number;
  done: number;
  failed: number;
  waiting: number;
  errors: string[];
};

/** Daily (`/api/cron/billing`): settle every price swap stuck `pending` past its lease. Normally zero rows. */
export async function reconcileStaleBillPriceChanges(
  options: { dryRun?: boolean; nowMs?: number } = {}
): Promise<BillPriceChangeReconcileResult> {
  const dryRun = options.dryRun ?? false;
  const nowMs = options.nowMs ?? Date.now();
  const result: BillPriceChangeReconcileResult = { dryRun, scanned: 0, done: 0, failed: 0, waiting: 0, errors: [] };
  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }
  const { data, error } = await supabaseAdmin
    .from("billing_venue_changes")
    .select(PRICE_CHANGE_COLUMNS)
    .eq("action", "price")
    .eq("status", "pending")
    .lt("updated_at", new Date(nowMs - VENUE_ADDITION_LEASE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(BILL_PRICE_CHANGE_RECONCILE_LIMIT)
    .returns<BillPriceChangeRow[]>();
  if (error) {
    if (!isMissingPriceLedger(error)) result.errors.push(`price-change-read-failed: ${error.message}`);
    return result;
  }
  for (const row of data ?? []) {
    result.scanned += 1;
    if (dryRun) {
      console.log(`${LOG} reconcile DRY RUN change=${row.id} bill=${row.subscription_id ?? "?"} updated=${row.updated_at}`);
      continue;
    }
    try {
      const state = await settleBillPriceChange(row, nowMs);
      if (state === "done") result.done += 1;
      else if (state === "failed") result.failed += 1;
      else result.waiting += 1;
    } catch (rowError) {
      result.errors.push(`change=${row.id}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
    }
  }
  return result;
}
