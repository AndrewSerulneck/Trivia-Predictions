import "server-only";
import type Stripe from "stripe";

import { settleStaleBillPriceChangesForBill } from "@/lib/billingCustomPrice";
import { effectiveAmountCents } from "@/lib/billingDisplay";
import {
  VENUE_CHANGE_MESSAGES,
  type BillAccount,
  type BillAccountVenue,
  type VenueBillChangeAction,
  type VenueBillChangeResult,
  type VenueChangeFailureCode,
} from "@/lib/multiVenueBilling";
import type { RateLimitResult } from "@/lib/rateLimit";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import { getStripeGraduatedPriceId, stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  asStripeError,
  discountOf,
  errorText,
  billRateOfItem,
  isDefinitiveStripeRejection,
  isValidClientKey,
  isoFromUnix,
  itemQuantity,
  soleItem,
  VENUE_ADDITION_LEASE_MS,
} from "@/lib/venueAddition";
import {
  BILLING_MEMBERSHIP_TABLE,
  billMemberships,
  hasLeftBill,
  isBilledMembership,
  loadBillingForVenue,
  loadBillingForVenues,
} from "@/lib/venueBilling";
import { billRateFromMirror, rateBreakdown, rateMonthlyTotalCents } from "@/lib/venuePricing";

/**
 * Partner self-serve "Remove a venue" (at the end of the month) and its "Undo" — the server half
 * (docs/multi-venue-volume-billing-plan.md §4.4, Phase 5). The ONE home of both; the route
 * (`app/api/owner/venues/remove/route.ts`), the daily `/api/cron/billing` and the Billing page's
 * account read all call into this file.
 *
 * MONEY RULES (Andrew, plan §2 decision 2: "self-serve, end of month, no refunds, no credits"):
 *   - Remove = Stripe quantity n → n − 1 with `proration_behavior: "none"`: no credit now, and the
 *     next renewal bills one venue fewer. Our side keeps the venue live until the paid period ends
 *     (`remove_at` on its membership row); the daily cron then stamps `removed_at` and hides it.
 *   - Undo (before `remove_at`) = n → n + 1, also `"none"`: that month was already paid in full, so
 *     nothing is charged; the next renewal simply bills it again.
 *   - After `remove_at` the period has renewed without the venue, so putting it back is a PAID
 *     "Add back" through lib/venueAddition.ts (`readdVenueId`), never a free Undo.
 *   - The last billed venue can't be removed: cancelling the subscription is that path.
 *   - Removing the bill's ANCHOR venue moves the anchor to another billed venue in the same
 *     database transaction (and Stripe's `metadata.venueId` in the same Stripe call), because
 *     `billing_subscriptions.venue_id` is ON DELETE CASCADE (plan §7 trap 2).
 *
 * CONCURRENCY. Every quantity write is ABSOLUTE, and any `items` update discards an add's pending
 * 3-D Secure payment. So a change is claimed through `claim_venue_bill_change`, under the SAME
 * advisory lock as `claim_venue_addition`, and each refuses while the other is in flight. The
 * ledger (`billing_venue_changes`) is written BEFORE the Stripe call; its key is Stripe's
 * idempotency key; `finish_venue_bill_change` applies the membership change only once Stripe has
 * accepted the new quantity. An ambiguous Stripe error leaves the row `pending`; it is settled from
 * Stripe's real quantity after a 10-minute lease (by the next change, the next add/quote on the
 * bill, or the daily cron). The same ledger also holds the admin's price swaps (action `price`,
 * Phase 6.1, lib/billingCustomPrice.ts): they lock the bill exactly like a change, but they are
 * never settled or finished as a Remove / Undo here — the reconcilers below read only
 * `remove` / `undo` rows, and a bill's stale price rows are handed to `settleStaleBillPriceChangesForBill`.
 *
 * NOT FLAG-GATED here. The route checks `isMultiVenueBillingEnabled()`; settling and the daily
 * removal job must finish what a partner already started whatever the flag says.
 */

const LOG = "[VenueRemoval]";
const CHANGES = "billing_venue_changes";

/** Due removals the daily cron applies per run. Each is two small writes; normally zero rows. */
export const VENUE_REMOVAL_APPLY_LIMIT = 50;
/** Stale pending changes the daily cron settles per run. Each costs one Stripe read. */
export const VENUE_CHANGE_RECONCILE_LIMIT = 20;

type ChangeStatus = "pending" | "done" | "failed";

export type VenueChangeRow = {
  id: string;
  idempotency_key: string;
  owner_id: string | null;
  subscription_id: string | null;
  venue_id: string | null;
  action: VenueBillChangeAction;
  status: ChangeStatus;
  quantity_before: number | null;
  quantity_after: number | null;
  remove_at: string | null;
  new_anchor_venue_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

const CHANGE_COLUMNS =
  "id, idempotency_key, owner_id, subscription_id, venue_id, action, status, quantity_before, quantity_after, " +
  "remove_at, new_anchor_venue_id, failure_reason, created_at, updated_at";

type BillRow = {
  id: string;
  venue_id: string;
  owner_id: string | null;
  status: string;
  billing_method: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
};

const BILL_COLUMNS = "id, venue_id, owner_id, status, billing_method, stripe_subscription_id, cancel_at_period_end";

export type VenueChangeRefusal = {
  ok: false;
  httpStatus: number;
  code: VenueChangeFailureCode;
  error: string;
};

export type VenueChangeOutcome = { ok: true; httpStatus: 200; change: VenueBillChangeResult } | VenueChangeRefusal;

const refuse = (code: VenueChangeFailureCode, httpStatus: number, error?: string): VenueChangeRefusal => ({
  ok: false,
  httpStatus,
  code,
  error: error ?? VENUE_CHANGE_MESSAGES[code],
});

/** A denied rate-limit claim: 429, or 503 when the limiter itself is down (it fails closed). */
export const changeRateLimitRefusal = (result: RateLimitResult): VenueChangeRefusal =>
  result.unavailable ? refuse("stripe_unavailable", 503) : refuse("rate_limited", 429);

/** JSON answer. `no-store`: billing state, never cached. */
export const venueChangeResponse = (outcome: VenueChangeOutcome, headers: Record<string, string> = {}): Response => {
  const { httpStatus, ...body } = outcome;
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
};

/** The ledger key. Scoped to the owner so two partners' client keys can never collide. */
export const changeIdempotencyKey = (ownerId: string, clientKey: string): string => `venue-change:${ownerId}:${clientKey}`;

const errorOf = (e: unknown): string => errorText(e);

/**
 * DEPLOY-SKEW SAFE: this code can reach production before 20261011210033_venue_bill_changes.sql is
 * applied. Then there are no changes to settle — the readers below treat a missing ledger as empty
 * (logged once) instead of erroring on every cron run and every add. The Remove route itself still
 * fails closed (its claim RPC is missing → "temporarily unavailable"), and it is flag-gated anyway.
 */
let warnedMissingLedger = false;
const isMissingLedger = (error: { code?: string; message?: string }): boolean => {
  if (error.code === "42P01" || error.code === "PGRST205") {
    if (!warnedMissingLedger) {
      warnedMissingLedger = true;
      console.warn(`${LOG} change-ledger-missing — apply supabase/migrations/20261011210033_venue_bill_changes.sql`);
    }
    return true;
  }
  return false;
};

// --- Ledger I/O ------------------------------------------------------------------------------------

const readChangeByKey = async (key: string): Promise<VenueChangeRow | null> => {
  const { data, error } = await supabaseAdmin!.from(CHANGES).select(CHANGE_COLUMNS).eq("idempotency_key", key).maybeSingle<VenueChangeRow>();
  if (error) throw new Error(`change-read-failed: ${error.message}`);
  return data ?? null;
};

const readChangeById = async (id: string): Promise<VenueChangeRow | null> => {
  const { data, error } = await supabaseAdmin!.from(CHANGES).select(CHANGE_COLUMNS).eq("id", id).maybeSingle<VenueChangeRow>();
  if (error) throw new Error(`change-read-failed: ${error.message}`);
  return data ?? null;
};

const readBill = async (billId: string): Promise<BillRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from("billing_subscriptions")
    .select(BILL_COLUMNS)
    .eq("id", billId)
    .maybeSingle<BillRow>();
  if (error) throw new Error(`bill-read-failed: ${error.message}`);
  return data ?? null;
};

type FinishRpcRow = {
  outcome: "done" | "failed" | "already" | "drift" | "wrong_action" | "not_found" | "invalid";
  change_status: ChangeStatus | null;
};

/** The ledger's two venue actions (it also holds `price` swaps, which this file never settles). */
const VENUE_CHANGE_ACTIONS: VenueBillChangeAction[] = ["remove", "undo"];
const isVenueChangeAction = (action: string): action is VenueBillChangeAction =>
  (VENUE_CHANGE_ACTIONS as string[]).includes(action);

const isMissingFunction = (error: { code?: string; message?: string }, name: string): boolean =>
  error.code === "PGRST202" || error.code === "42883" || (error.message ?? "").includes(name);

/**
 * Close a claimed change: `done` applies the membership change (+ the re-anchor) in one database
 * transaction; `failed` only marks the row. Throws on a database error — the row stays `pending`
 * and is settled later from Stripe's real state.
 */
async function finishChange(row: VenueChangeRow, outcome: "done" | "failed", reason: string | null): Promise<FinishRpcRow> {
  const { data, error } = await supabaseAdmin!.rpc("finish_venue_bill_change", {
    p_change_id: row.id,
    p_outcome: outcome,
    p_failure_reason: reason,
  });
  if (error) {
    if (isMissingFunction(error, "finish_venue_bill_change")) {
      console.error(`${LOG} finish_venue_bill_change-missing — apply supabase/migrations/20261011210033_venue_bill_changes.sql`);
    }
    throw new Error(`finish-failed: ${error.message}`);
  }
  const result = (Array.isArray(data) ? data[0] : data) as FinishRpcRow | null;
  if (!result || typeof result.outcome !== "string") throw new Error("finish-malformed-response");
  if (result.outcome === "wrong_action") {
    // Not a Remove / Undo (a price swap) — finish_venue_bill_change wrote nothing. A bug if reached.
    console.error(`${LOG} finish-wrong-action change=${row.id}`);
  }
  if (result.outcome === "drift") {
    // Stripe moved but the membership was not in the state the claim saw. Recorded on the row
    // (failure_reason); Phase 6's Stripe-vs-DB drift check is the backstop. Needs an admin's eye.
    console.error(`${LOG} change-drift change=${row.id} venue=${row.venue_id ?? "?"} bill=${row.subscription_id ?? "?"}`);
  }
  return result;
}

// --- Context: which bill, and can it change? -----------------------------------------------------

export type VenueChangeContext = {
  ownerId: string;
  venueId: string;
  bill: BillRow;
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
};

/**
 * The bill covering this venue and its live Stripe subscription, or why its venues can't change
 * right now. Looser than "Add a venue" on one point: a `past_due` bill may still shrink (removing a
 * venue only lowers the next invoice) — but it may not grow by Undo either way, see below.
 */
export async function loadVenueChangeContext(
  auth: OwnerAuthContext,
  venueId: string,
  action: VenueBillChangeAction
): Promise<{ ok: true; context: VenueChangeContext } | VenueChangeRefusal> {
  if (!supabaseAdmin || !stripe) return refuse("stripe_unavailable", 503, "Server configuration error.");
  const id = venueId.trim();
  if (!id || !auth.venueIds.includes(id)) return refuse("forbidden", 403);

  // The bill this venue is ON (active membership). A venue already taken off has none.
  const billing = await loadBillingForVenue<BillRow>(id, BILL_COLUMNS);
  if (!billing.ok) {
    console.error(`${LOG} bill-read-failed venue=${id}: ${billing.error}`);
    return refuse("stripe_unavailable", 503, "Something went wrong. Please try again.");
  }
  const bill = billing.row;
  if (!bill) return refuse("not_on_bill", 409);
  if (bill.owner_id !== auth.ownerId) return refuse("not_bill_owner", 403);
  if (bill.billing_method === "offline") return refuse("offline_bill", 409);
  if (bill.status === "cancelled") return refuse("bill_not_active", 409);
  // Undo raises the next renewal; it waits for a healthy card like an add does.
  if (action === "undo" && bill.status !== "active") return refuse("bill_not_active", 409);
  if (bill.cancel_at_period_end) return refuse("cancel_scheduled", 409);
  if (!bill.stripe_subscription_id) return refuse("billing_state", 409);

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
  } catch (error) {
    console.error(`${LOG} subscription-read-failed bill=${bill.id}: ${errorOf(error)}`);
    return refuse("stripe_unavailable", 503);
  }

  const checked = checkChangeableSubscription(subscription, action);
  if (!checked.ok) return refuse(checked.code, 409);

  return { ok: true, context: { ownerId: auth.ownerId, venueId: id, bill, subscription, item: checked.item } };
}

/**
 * The Stripe half of "can this bill's venues change?" — run on the context's read, and again on the
 * read `startVenueChange` takes after its claim.
 */
const checkChangeableSubscription = (
  subscription: Stripe.Subscription,
  action: VenueBillChangeAction
): { ok: true; item: Stripe.SubscriptionItem } | { ok: false; code: VenueChangeFailureCode } => {
  if (subscription.status !== "active" && subscription.status !== "past_due") return { ok: false, code: "bill_not_active" };
  if (action === "undo" && subscription.status !== "active") return { ok: false, code: "bill_not_active" };
  if (subscription.cancel_at_period_end || subscription.cancel_at) return { ok: false, code: "cancel_scheduled" };
  // A schedule phase change would override our quantity.
  if (subscription.schedule) return { ok: false, code: "billing_state" };

  const item = soleItem(subscription);
  if (!item) return { ok: false, code: "billing_state" };
  // Graduated bands, or an admin's per-venue rate (Phase 6): either way the quantity is the venues.
  if (!billRateOfItem(item)) return { ok: false, code: "billing_state" };
  if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1) {
    return { ok: false, code: "billing_state" };
  }
  if (typeof item.current_period_end !== "number") return { ok: false, code: "billing_state" };
  return { ok: true, item };
};

/**
 * Why the subscription as Stripe has it NOW — read after the claim — can't take this claimed change,
 * or its item. The claim itself was sized from our membership count, and a Remove's `remove_at`
 * from the context's period end, so both must still match Stripe.
 */
const postClaimCheck = (
  context: VenueChangeContext,
  live: Stripe.Subscription,
  row: VenueChangeRow
): { ok: true; item: Stripe.SubscriptionItem } | { ok: false; issue: string } => {
  const checked = checkChangeableSubscription(live, row.action);
  if (!checked.ok) return { ok: false, issue: checked.code };
  const { item } = checked;
  if (item.id !== context.item.id) return { ok: false, issue: "item-changed" };
  if (live.pending_update) return { ok: false, issue: "pending-update" };
  if (item.quantity !== row.quantity_before) return { ok: false, issue: "quantity-drift" };
  if (row.action === "remove" && Date.parse(row.remove_at ?? "") !== (item.current_period_end as number) * 1000) {
    return { ok: false, issue: "period-changed" };
  }
  return { ok: true, item };
};

// --- Reconciliation ------------------------------------------------------------------------------

type SettleState =
  | { state: "done"; row: VenueChangeRow }
  | { state: "failed"; row: VenueChangeRow }
  | { state: "in_flight"; row: VenueChangeRow }
  | { state: "unknown"; row: VenueChangeRow; detail: string };

/**
 * Bring a ledger row up to date with Stripe. A `pending` row inside its lease is left to the request
 * that owns it. Otherwise Stripe's quantity decides: the new quantity (and no pending update) → it
 * landed → done; the old one → it never did → failed; anything else → failed as drift, logged.
 */
export async function reconcileVenueChange(row: VenueChangeRow, nowMs: number = Date.now()): Promise<SettleState> {
  if (row.status === "done") return { state: "done", row };
  if (row.status === "failed") return { state: "failed", row };
  // A price swap is never settled from the quantity (lib/billingCustomPrice.ts settles it from the Price).
  if (!isVenueChangeAction(row.action)) return { state: "unknown", row, detail: "not-a-venue-change" };
  if (nowMs - Date.parse(row.updated_at) < VENUE_ADDITION_LEASE_MS) return { state: "in_flight", row };
  if (!stripe) return { state: "unknown", row, detail: "stripe-unconfigured" };

  const reread = async (): Promise<VenueChangeRow> => (await readChangeById(row.id)) ?? row;

  if (!row.subscription_id) {
    await finishChange(row, "failed", "no-bill");
    return { state: "failed", row: await reread() };
  }
  const bill = await readBill(row.subscription_id);
  if (!bill?.stripe_subscription_id) {
    await finishChange(row, "failed", "bill-has-no-subscription");
    return { state: "failed", row: await reread() };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
  } catch (error) {
    return { state: "unknown", row, detail: `subscription-read-failed: ${errorOf(error)}` };
  }
  const quantity = itemQuantity(subscription);
  if (!subscription.pending_update && quantity === row.quantity_after) {
    const finished = await finishChange(row, "done", null);
    return { state: finished.change_status === "failed" ? "failed" : "done", row: await reread() };
  }
  if (quantity === row.quantity_before) {
    await finishChange(row, "failed", "stripe-update-not-applied");
    return { state: "failed", row: await reread() };
  }
  console.error(
    `${LOG} reconcile-quantity-drift change=${row.id} stripeQuantity=${quantity ?? "?"} ` +
      `expected=${row.quantity_before ?? "?"}→${row.quantity_after ?? "?"}`
  );
  await finishChange(row, "failed", "reconcile-quantity-drift");
  return { state: "failed", row: await reread() };
}

/**
 * Settle this bill's Remove / Undo rows — and (Phase 6.1) its admin price swaps — stuck past their
 * lease, so a request that died mid-change doesn't keep the bill "busy" (adds included) until the
 * daily cron. Never throws: the callers are routes that must carry on (a still-pending row just
 * answers "try again in a minute").
 */
export async function settleStaleVenueChangesForBill(billId: string, nowMs: number = Date.now()): Promise<void> {
  if (!supabaseAdmin) return;
  await settleStaleBillPriceChangesForBill(billId, nowMs);
  try {
    const { data, error } = await supabaseAdmin
      .from(CHANGES)
      .select(CHANGE_COLUMNS)
      .eq("subscription_id", billId)
      .in("action", VENUE_CHANGE_ACTIONS)
      .eq("status", "pending")
      .lt("updated_at", new Date(nowMs - VENUE_ADDITION_LEASE_MS).toISOString())
      .limit(5)
      .returns<VenueChangeRow[]>();
    if (error) {
      if (isMissingLedger(error)) return;
      throw new Error(error.message);
    }
    for (const row of data ?? []) await reconcileVenueChange(row, nowMs);
  } catch (error) {
    console.error(`${LOG} settle-failed bill=${billId}: ${errorOf(error)}`);
  }
}

// --- Remove / Undo -------------------------------------------------------------------------------

type ClaimRpcRow = {
  outcome:
    | "claimed"
    | "existing"
    | "key_conflict"
    | "busy_addition"
    | "busy_change"
    | "not_owner"
    | "no_bill"
    | "not_on_bill"
    | "already_leaving"
    | "not_leaving"
    | "too_late"
    | "last_venue"
    | "no_new_anchor"
    | "invalid";
  change_id: string | null;
};

/** A finished row as the answer (also the answer to a retry of the same request). */
const outcomeFromRow = (row: VenueChangeRow, state: SettleState["state"]): VenueChangeOutcome => {
  switch (state) {
    case "done":
      return {
        ok: true,
        httpStatus: 200,
        change: {
          action: row.action,
          venueId: row.venue_id ?? "",
          removeAt: row.action === "remove" ? row.remove_at : null,
          billedVenueCount: row.quantity_after ?? 0,
        },
      };
    case "failed":
      return refuseForFailedRow(row);
    default:
      return refuse("change_unconfirmed", 503);
  }
};

/** Refusals recorded on the row (`refused:<code>`) after the claim, replayed for a retry. */
const refuseForFailedRow = (row: VenueChangeRow): VenueChangeRefusal => {
  const reason = row.failure_reason ?? "";
  if (reason === "refused:billing_state") return refuse("billing_state", 409);
  return refuse("change_failed", 409);
};

export type StartVenueChangeArgs = {
  auth: OwnerAuthContext;
  context: VenueChangeContext;
  action: VenueBillChangeAction;
  clientKey: string;
  nowMs?: number;
};

/**
 * Remove a venue at the end of the paid period, or Undo that (plan §4.4). The caller has checked
 * the flag, the session, the rate limit and the bill (`loadVenueChangeContext`).
 */
export async function startVenueChange(args: StartVenueChangeArgs): Promise<VenueChangeOutcome> {
  const { auth, context, action } = args;
  const nowMs = args.nowMs ?? Date.now();
  if (!supabaseAdmin || !stripe) return refuse("stripe_unavailable", 503, "Server configuration error.");
  if (!isValidClientKey(args.clientKey)) return refuse("invalid_request", 400);
  const key = changeIdempotencyKey(auth.ownerId, args.clientKey);

  try {
    // 1. This exact request again (double-tap, retry): answer with the row it already started.
    const previous = await readChangeByKey(key);
    if (previous) {
      if (previous.owner_id !== auth.ownerId || previous.venue_id !== context.venueId || previous.action !== action) {
        return refuse("invalid_request", 400);
      }
      const settled = await reconcileVenueChange(previous, nowMs);
      return outcomeFromRow(settled.row, settled.state);
    }

    // 2. Clear this bill's dead changes so they never block this one.
    await settleStaleVenueChangesForBill(context.bill.id, nowMs);

    // 3. Claim (same advisory lock as "Add a venue").
    const removeAt = isoFromUnix(context.item.current_period_end);
    const { data, error } = await supabaseAdmin.rpc("claim_venue_bill_change", {
      p_idempotency_key: key,
      p_owner_id: auth.ownerId,
      p_subscription_id: context.bill.id,
      p_venue_id: context.venueId,
      p_action: action,
      p_remove_at: action === "remove" ? removeAt : null,
    });
    if (error) {
      if (isMissingFunction(error, "claim_venue_bill_change")) {
        console.error(`${LOG} claim_venue_bill_change-missing — apply supabase/migrations/20261011210033_venue_bill_changes.sql`);
      } else {
        console.error(`${LOG} claim-failed bill=${context.bill.id}: ${error.message}`);
      }
      return refuse("stripe_unavailable", 503, "Something went wrong. Please try again.");
    }
    const claim = (Array.isArray(data) ? data[0] : data) as ClaimRpcRow | null;
    if (!claim || typeof claim.outcome !== "string") return refuse("stripe_unavailable", 503, "Something went wrong. Please try again.");

    switch (claim.outcome) {
      case "claimed":
        break;
      case "existing": {
        const existing = claim.change_id ? await readChangeById(claim.change_id) : null;
        if (!existing) return refuse("change_failed", 409);
        const settled = await reconcileVenueChange(existing, nowMs);
        return outcomeFromRow(settled.row, settled.state);
      }
      case "busy_addition":
        return refuse("addition_in_progress", 409);
      case "busy_change":
        return refuse("change_in_progress", 409);
      case "not_owner":
        return refuse("not_bill_owner", 403);
      case "not_on_bill":
      case "already_leaving":
      case "not_leaving":
      case "too_late":
      case "last_venue":
        return refuse(claim.outcome, 409);
      case "no_new_anchor":
        console.error(`${LOG} no-new-anchor bill=${context.bill.id} venue=${context.venueId} — needs an admin`);
        return refuse("needs_support", 409);
      case "no_bill":
        return refuse("no_bill", 409);
      default:
        return refuse("invalid_request", 400);
    }

    const row = claim.change_id ? await readChangeById(claim.change_id) : null;
    if (!row || row.quantity_before === null || row.quantity_after === null) return refuse("change_failed", 409);

    // 4. Re-read Stripe now that the bill is claimed (Phase 6.1). An add, another change and the
    //    admin's price swap all claim under the same lock, so nothing else can move this
    //    subscription until this row is closed: this read — not the pre-claim context — is what the
    //    update is checked against. Stripe must still allow the change, agree on how many venues are
    //    billed, be in the same period, and carry no pending update (an items update would void it).
    //    Refuse rather than "fix".
    let live: Stripe.Subscription;
    try {
      live = await stripe.subscriptions.retrieve(context.subscription.id);
    } catch (error) {
      console.error(`${LOG} subscription-reread-failed change=${row.id}: ${errorOf(error)}`);
      await finishChange(row, "failed", "subscription-read-failed");
      return refuse("stripe_unavailable", 503);
    }
    const checked = postClaimCheck(context, live, row);
    if (!checked.ok) {
      console.error(
        `${LOG} refused-billing-state change=${row.id} issue=${checked.issue} stripe=${itemQuantity(live) ?? "?"} ` +
          `billed=${row.quantity_before} pendingUpdate=${Boolean(live.pending_update)}`
      );
      await finishChange(row, "failed", "refused:billing_state");
      return refuse("billing_state", 409);
    }

    // 5. Stripe: the new quantity, no proration either way (no credit for a Remove, no charge for an
    //    Undo — the month is already paid). When the anchor leaves, Stripe's metadata follows it.
    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(
        context.subscription.id,
        {
          items: [{ id: checked.item.id, quantity: row.quantity_after }],
          proration_behavior: "none",
          ...(row.new_anchor_venue_id ? { metadata: { venueId: row.new_anchor_venue_id } } : {}),
        },
        { idempotencyKey: row.idempotency_key }
      );
    } catch (error) {
      if (isDefinitiveStripeRejection(error)) {
        const shape = asStripeError(error);
        console.error(`${LOG} stripe-update-rejected change=${row.id}: ${shape.code ?? shape.type ?? ""} ${shape.message ?? ""}`);
        await finishChange(row, "failed", `stripe-rejected: ${shape.code ?? shape.type ?? "unknown"}`);
        return refuse("change_failed", 502);
      }
      // Ambiguous — it may have gone through. Settled from Stripe's quantity once the lease ends.
      console.error(`${LOG} stripe-update-ambiguous change=${row.id}: ${errorOf(error)}`);
      return refuse("change_unconfirmed", 503);
    }

    if (updated.pending_update || itemQuantity(updated) !== row.quantity_after) {
      console.error(
        `${LOG} stripe-update-unexpected change=${row.id} quantity=${itemQuantity(updated) ?? "?"} pendingUpdate=${Boolean(updated.pending_update)}`
      );
      return refuse("change_unconfirmed", 503);
    }

    // 6. Apply it on our side (membership + re-anchor, one transaction).
    try {
      await finishChange(row, "done", null);
    } catch (error) {
      // Stripe has the new quantity; the row stays pending and is settled as "done" later.
      console.error(`${LOG} finish-after-stripe-failed change=${row.id}: ${errorOf(error)}`);
      return refuse("change_unconfirmed", 503);
    }
    console.log(
      `${LOG} ${action === "remove" ? "venue-leaving" : "removal-undone"} change=${row.id} venue=${context.venueId} ` +
        `bill=${context.bill.id} quantity=${row.quantity_before}→${row.quantity_after}` +
        (row.new_anchor_venue_id ? ` newAnchor=${row.new_anchor_venue_id}` : "")
    );
    const finalRow = (await readChangeById(row.id)) ?? { ...row, status: "done" as const };
    return outcomeFromRow(finalRow, "done");
  } catch (error) {
    console.error(`${LOG} change-failed owner=${auth.ownerId}: ${errorOf(error)}`);
    return refuse("change_failed", 500, "Something went wrong. Please try again.");
  }
}

// --- Daily cron ----------------------------------------------------------------------------------

export type VenueChangeReconcileResult = {
  dryRun: boolean;
  scanned: number;
  done: number;
  failed: number;
  waiting: number;
  errors: string[];
};

/**
 * Daily: settle every Remove / Undo stuck `pending` past its lease. Normally zero rows. Price swaps
 * on the same ledger are the cron's separate `reconcileStaleBillPriceChanges` job.
 */
export async function reconcileStaleVenueChanges(
  options: { dryRun?: boolean; nowMs?: number } = {}
): Promise<VenueChangeReconcileResult> {
  const dryRun = options.dryRun ?? false;
  const nowMs = options.nowMs ?? Date.now();
  const result: VenueChangeReconcileResult = { dryRun, scanned: 0, done: 0, failed: 0, waiting: 0, errors: [] };
  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }
  const { data, error } = await supabaseAdmin
    .from(CHANGES)
    .select(CHANGE_COLUMNS)
    .in("action", VENUE_CHANGE_ACTIONS)
    .eq("status", "pending")
    .lt("updated_at", new Date(nowMs - VENUE_ADDITION_LEASE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(VENUE_CHANGE_RECONCILE_LIMIT)
    .returns<VenueChangeRow[]>();
  if (error) {
    if (!isMissingLedger(error)) result.errors.push(`change-read-failed: ${error.message}`);
    return result;
  }
  for (const row of data ?? []) {
    result.scanned += 1;
    if (dryRun) {
      console.log(`${LOG} reconcile DRY RUN change=${row.id} action=${row.action} updated=${row.updated_at}`);
      continue;
    }
    try {
      const settled = await reconcileVenueChange(row, nowMs);
      if (settled.state === "done") result.done += 1;
      else if (settled.state === "failed") result.failed += 1;
      else {
        result.waiting += 1;
        if (settled.state === "unknown") result.errors.push(`change=${row.id}: ${settled.detail}`);
      }
    } catch (rowError) {
      result.errors.push(`change=${row.id}: ${errorOf(rowError)}`);
    }
  }
  return result;
}

export type VenueRemovalApplyResult = {
  dryRun: boolean;
  due: number;
  removed: number;
  hidden: number;
  skipped: number;
  errors: string[];
};

type DueMembership = { id: string; venue_id: string; subscription_id: string; remove_at: string };

/**
 * Daily (`/api/cron/billing`): take off every venue whose `remove_at` has passed — the paid period
 * it was left on has ended and Stripe has renewed without it. Per venue: HIDE it from the join list
 * (stamping `rehidden_at` = "we hid this", so a later paid Add back can un-hide it, and an admin
 * sees it as lapsed), then stamp `removed_at`. In that order: if the stamp then fails to match
 * (an Add back put the venue back on the bill a moment ago), the hide is undone. One bounded read.
 *
 * Never hides a venue that is still the anchor of a live bill (a failed re-anchor — drift): that is
 * logged and left for an admin.
 */
export async function applyDueVenueRemovals(
  options: { dryRun?: boolean; nowMs?: number } = {}
): Promise<VenueRemovalApplyResult> {
  const dryRun = options.dryRun ?? false;
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const result: VenueRemovalApplyResult = { dryRun, due: 0, removed: 0, hidden: 0, skipped: 0, errors: [] };
  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("id, venue_id, subscription_id, remove_at")
    .not("remove_at", "is", null)
    .is("removed_at", null)
    .lte("remove_at", nowIso)
    .order("remove_at", { ascending: true })
    .limit(VENUE_REMOVAL_APPLY_LIMIT)
    .returns<DueMembership[]>();
  if (error) {
    result.errors.push(`due-read-failed: ${error.message}`);
    return result;
  }
  const due = data ?? [];
  result.due = due.length;
  if (due.length === 0) return result;

  const billing = await loadBillingForVenues<{ id: string; venue_id: string; status: string }>(
    due.map((row) => row.venue_id),
    "id, venue_id, status"
  );
  if (!billing.ok) {
    result.errors.push(`bill-read-failed: ${billing.error}`);
    return result;
  }

  for (const row of due) {
    const covering = billing.byVenue.get(row.venue_id);
    if (covering && covering.venue_id === row.venue_id && covering.status !== "cancelled") {
      console.error(`${LOG} removal-blocked-anchor venue=${row.venue_id} bill=${covering.id} — still a live bill's anchor; needs an admin`);
      result.skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`${LOG} removal DRY RUN venue=${row.venue_id} bill=${row.subscription_id} removeAt=${row.remove_at}`);
      continue;
    }
    try {
      const hid = await supabaseAdmin
        .from("venues")
        .update({ hidden: true, rehidden_at: nowIso })
        .eq("id", row.venue_id)
        .eq("hidden", false)
        .select("id")
        .returns<{ id: string }[]>();
      if (hid.error) throw new Error(`hide-failed: ${hid.error.message}`);
      const hidByUs = (hid.data ?? []).length > 0;

      const stamped = await supabaseAdmin
        .from(BILLING_MEMBERSHIP_TABLE)
        .update({ removed_at: nowIso })
        .eq("id", row.id)
        .is("removed_at", null)
        .lte("remove_at", nowIso)
        .select("id")
        .returns<{ id: string }[]>();
      if (stamped.error) throw new Error(`stamp-failed: ${stamped.error.message}`);

      if ((stamped.data ?? []).length === 0) {
        // Put back on the bill since we read it (a paid Add back): undo our hide.
        if (hidByUs) {
          await supabaseAdmin.from("venues").update({ hidden: false, rehidden_at: null }).eq("id", row.venue_id).eq("rehidden_at", nowIso);
        }
        result.skipped += 1;
        continue;
      }
      result.removed += 1;
      if (hidByUs) result.hidden += 1;
      console.log(`${LOG} venue-removed venue=${row.venue_id} bill=${row.subscription_id} hidden=${hidByUs}`);
    } catch (rowError) {
      result.errors.push(`venue=${row.venue_id}: ${errorOf(rowError)}`);
    }
  }
  return result;
}

// --- Billing page account view -------------------------------------------------------------------

type AccountBillRow = {
  id: string;
  venue_id: string;
  discount_percent_off: number | string | null;
  discount_amount_off_cents: number | null;
  /** Mirror columns: which rate the bill is on (graduated bands or a per-venue rate, Phase 6). */
  stripe_price_id?: string | null;
  amount_cents?: number | null;
  quantity?: number | null;
};

/**
 * The venues on a bill and what its next renewal costs, for the Billing page (plan §4.5). Only the
 * caller's own venues are listed (by name). A venue taken off stays listed as `removed` while it is
 * still linked to the partner — that is where "Add back" lives. All money is computed here from
 * lib/venuePricing.ts; the page never prices anything.
 */
export async function loadBillAccount(
  bill: AccountBillRow,
  ownerVenueIds: readonly string[],
  nowMs: number = Date.now()
): Promise<{ ok: true; account: BillAccount } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const memberships = await billMemberships(bill.id);
  if (!memberships.ok) return memberships;

  const mine = new Set(ownerVenueIds);
  const rows = memberships.rows.filter((row) => mine.has(row.venue_id));
  // A bill with no membership rows (table missing — deploy skew) still covers its anchor.
  if (rows.length === 0 && mine.has(bill.venue_id)) {
    rows.push({ venue_id: bill.venue_id, subscription_id: bill.id, role: "anchor", added_at: null, remove_at: null, removed_at: null });
  }

  const names = new Map<string, string>();
  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("id, name")
      .in(
        "id",
        rows.map((row) => row.venue_id)
      )
      .returns<{ id: string; name: string | null }[]>();
    if (error) return { ok: false, error: `venue-read-failed: ${error.message}` };
    for (const venue of data ?? []) names.set(venue.id, (venue.name ?? "").trim() || venue.id);
  }

  const order: Record<BillAccountVenue["state"], number> = { billed: 0, leaving: 1, removed: 2 };
  const venues: BillAccountVenue[] = rows
    .map((row) => ({
      id: row.venue_id,
      name: names.get(row.venue_id) ?? row.venue_id,
      state: isBilledMembership(row) ? ("billed" as const) : hasLeftBill(row, nowMs) ? ("removed" as const) : ("leaving" as const),
      isAnchor: row.venue_id === bill.venue_id,
      removeAt: row.remove_at,
    }))
    .sort((a, b) => order[a.state] - order[b.state] || Number(b.isAnchor) - Number(a.isAnchor) || a.name.localeCompare(b.name));

  const billedVenueCount = Math.max(
    1,
    memberships.rows.length > 0 ? memberships.rows.filter((row) => isBilledMembership(row)).length : 1
  );
  const discount = discountOf({
    discount_percent_off: bill.discount_percent_off == null ? null : Number(bill.discount_percent_off),
    discount_amount_off_cents: bill.discount_amount_off_cents,
  });
  const rate = billRateFromMirror(bill, getStripeGraduatedPriceId());
  const nextMonthlyListCents = rateMonthlyTotalCents(rate, billedVenueCount);
  return {
    ok: true,
    account: {
      venues,
      billedVenueCount,
      breakdown: rateBreakdown(rate, billedVenueCount).map((line) => ({
        venues: line.venues,
        unitAmountCents: line.unitAmountCents,
        subtotalCents: line.subtotalCents,
      })),
      nextMonthlyListCents,
      nextMonthlyTotalCents: effectiveAmountCents({ amountCents: nextMonthlyListCents, discount }),
    },
  };
}
