import "server-only";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { billMembershipsForBills, billedVenueCountFromRows, type BillMembership } from "@/lib/venueBilling";

/**
 * Daily Stripe-quantity drift check (docs/multi-venue-volume-billing-plan.md Phase 6), run by
 * `/api/cron/billing`. REPORT-ONLY: it compares each live card bill's Stripe quantity with the number
 * of venues we bill on it (`billedVenueCountFromRows` — the same count the add/remove RPCs use) and
 * logs `[MultiVenueBilling] quantity-drift` for every mismatch. It never charges, credits or writes
 * anything; an admin fixes drift by hand.
 *
 * COST: per run, three bounded database reads (live card bills, their memberships, in-flight ledger
 * rows) and ONE Stripe list call (100 subscriptions a page; more pages only past 100 live
 * subscriptions, capped at `DRIFT_CHECK_MAX_PAGES`). No per-bill Stripe call.
 *
 * A bill with a venue add or Remove/Undo in flight (either ledger, or a Stripe `pending_update`) is
 * skipped: its quantities legitimately disagree for a moment.
 */

const LOG = "[MultiVenueBilling]";

/** Stripe list pages per run (100 subscriptions each). Past this the result says `truncated`. */
export const DRIFT_CHECK_MAX_PAGES = 10;

/** Live card bills read per run. */
const BILL_READ_LIMIT = 1000;

export type QuantityDriftItem = {
  billId: string;
  stripeSubscriptionId: string;
  stripeQuantity: number | null;
  billedVenueCount: number;
};

export type QuantityDriftResult = {
  checked: number;
  drift: QuantityDriftItem[];
  /** Live in our records but not among Stripe's non-cancelled subscriptions (a missed webhook?). */
  missingAtStripe: string[];
  /** Bills whose subscription has other than exactly one item — not ours to count. */
  unexpectedItems: string[];
  skippedInFlight: number;
  /** True when Stripe had more subscriptions than the page cap — some bills went unchecked. */
  truncated: boolean;
};

type LiveBillRow = { id: string; venue_id: string; stripe_subscription_id: string };

/** What one Stripe subscription says, for the comparison. */
export type StripeQuantityView = { quantity: number | null; itemCount: number; pendingUpdate: boolean };

/**
 * The comparison itself — pure, so every rule is unit-tested without a database or Stripe.
 */
export const compareBillQuantities = (
  bills: readonly LiveBillRow[],
  membershipsByBill: ReadonlyMap<string, readonly BillMembership[]>,
  stripeBySubscription: ReadonlyMap<string, StripeQuantityView>,
  inFlightBillIds: ReadonlySet<string>,
  truncated: boolean
): QuantityDriftResult => {
  const result: QuantityDriftResult = {
    checked: 0,
    drift: [],
    missingAtStripe: [],
    unexpectedItems: [],
    skippedInFlight: 0,
    truncated,
  };
  for (const bill of bills) {
    const view = stripeBySubscription.get(bill.stripe_subscription_id);
    if (inFlightBillIds.has(bill.id) || view?.pendingUpdate) {
      result.skippedInFlight += 1;
      continue;
    }
    if (!view) {
      // With a truncated listing, "not seen" proves nothing.
      if (!truncated) result.missingAtStripe.push(bill.id);
      continue;
    }
    result.checked += 1;
    if (view.itemCount !== 1) {
      result.unexpectedItems.push(bill.id);
      continue;
    }
    const billed = billedVenueCountFromRows(bill.venue_id, membershipsByBill.get(bill.id) ?? []);
    if (view.quantity !== billed) {
      result.drift.push({
        billId: bill.id,
        stripeSubscriptionId: bill.stripe_subscription_id,
        stripeQuantity: view.quantity,
        billedVenueCount: billed,
      });
    }
  }
  return result;
};

const isMissingTable = (error: { code?: string } | null): boolean =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));

/** Bills with an add (pending / awaiting 3-D Secure) or a Remove/Undo (pending) under way. */
async function inFlightBillIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const [additions, changes] = await Promise.all([
    supabaseAdmin!
      .from("billing_venue_additions")
      .select("subscription_id")
      .in("status", ["pending", "requires_action"])
      .limit(500)
      .returns<{ subscription_id: string | null }[]>(),
    supabaseAdmin!
      .from("billing_venue_changes")
      .select("subscription_id")
      .eq("status", "pending")
      .limit(500)
      .returns<{ subscription_id: string | null }[]>(),
  ]);
  for (const read of [additions, changes]) {
    if (read.error) {
      if (isMissingTable(read.error as { code?: string })) continue;
      throw new Error(`ledger-read-failed: ${read.error.message}`);
    }
    for (const row of read.data ?? []) if (row.subscription_id) ids.add(row.subscription_id);
  }
  return ids;
}

const viewOf = (subscription: Stripe.Subscription): StripeQuantityView => {
  const items = subscription.items?.data ?? [];
  const quantity = items.length === 1 && typeof items[0].quantity === "number" ? items[0].quantity : null;
  return { quantity, itemCount: items.length, pendingUpdate: Boolean(subscription.pending_update) };
};

/** Every non-cancelled Stripe subscription (Stripe's default listing), up to the page cap. */
async function listStripeSubscriptions(): Promise<{ bySubscription: Map<string, StripeQuantityView>; truncated: boolean }> {
  const bySubscription = new Map<string, StripeQuantityView>();
  let startingAfter: string | undefined;
  for (let page = 0; page < DRIFT_CHECK_MAX_PAGES; page += 1) {
    const listed = await stripe!.subscriptions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const subscription of listed.data) bySubscription.set(subscription.id, viewOf(subscription));
    if (!listed.has_more || listed.data.length === 0) return { bySubscription, truncated: false };
    startingAfter = listed.data[listed.data.length - 1].id;
  }
  return { bySubscription, truncated: true };
}

/**
 * Run the check and log what it finds. Throws on a read failure (the cron catches it and reports it
 * without failing its other jobs).
 */
export async function checkBillingQuantityDrift(): Promise<QuantityDriftResult> {
  if (!supabaseAdmin || !stripe) throw new Error("billing-not-configured");

  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id, stripe_subscription_id")
    .in("status", ["active", "past_due"])
    .not("stripe_subscription_id", "is", null)
    .limit(BILL_READ_LIMIT)
    .returns<LiveBillRow[]>();
  if (error) throw new Error(`bill-read-failed: ${error.message}`);
  const bills = (data ?? []).filter((row) => typeof row.stripe_subscription_id === "string" && row.stripe_subscription_id);

  const empty: QuantityDriftResult = {
    checked: 0,
    drift: [],
    missingAtStripe: [],
    unexpectedItems: [],
    skippedInFlight: 0,
    truncated: false,
  };
  if (bills.length === 0) return empty;

  const memberships = await billMembershipsForBills(bills.map((bill) => bill.id));
  if (!memberships.ok) throw new Error(memberships.error);
  const inFlight = await inFlightBillIds();
  const listed = await listStripeSubscriptions();

  const result = compareBillQuantities(bills, memberships.byBill, listed.bySubscription, inFlight, listed.truncated);
  for (const item of result.drift) {
    console.warn(
      `${LOG} quantity-drift bill=${item.billId} subscription=${item.stripeSubscriptionId} ` +
        `stripe=${item.stripeQuantity ?? "?"} billed=${item.billedVenueCount} — report only; an admin must fix it`
    );
  }
  for (const billId of result.missingAtStripe) {
    console.warn(`${LOG} subscription-missing-at-stripe bill=${billId} — live in our records, not among Stripe's non-cancelled subscriptions`);
  }
  for (const billId of result.unexpectedItems) {
    console.warn(`${LOG} unexpected-subscription-items bill=${billId} — not exactly one item`);
  }
  console.log(
    `${LOG} drift-check checked=${result.checked} drift=${result.drift.length} missing=${result.missingAtStripe.length} ` +
      `skippedInFlight=${result.skippedInFlight} truncated=${result.truncated}`
  );
  return result;
}
