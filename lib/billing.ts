import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

/**
 * Shared subscription-cancellation logic used by both the owner self-serve
 * cancel (app/api/owner/billing/subscription) and the admin revoke
 * (app/api/admin/billing). Extracted so the two paths stay in lockstep — a
 * live Stripe subscription must be cancelled through Stripe (not just flipped
 * in our DB), otherwise Stripe keeps charging the customer while the dashboard
 * shows no access.
 *
 * Policy: schedule `cancel_at_period_end` (parity with the owner flow) so the
 * venue keeps access through the already-paid period and there is no mid-period
 * refund exposure — status stays 'active' in Stripe (and here) until the period
 * actually ends, then the sync-back webhook flips it. We mirror the flag locally
 * immediately so the dashboard reflects "cancellation scheduled" on the very
 * next fetch instead of waiting on webhook latency.
 *
 * For a tokenless offline/legacy row (no stripe_subscription_id) there is
 * nothing to cancel at the processor, so we set status='cancelled' directly.
 */

export type CancelableSubscriptionRow = {
  id: string;
  stripe_subscription_id: string | null;
};

export type BillingRowState =
  | { live: true; reason: "active" | "past_due" }
  | { live: false; reason: "cancelled" | "no_stripe_object" };

export type ClassifiableBillingRow = {
  status: string;
  stripe_subscription_id: string | null;
};

/**
 * Every existing billing guard was written against `status === "active"`, but
 * `past_due` (card declined, Stripe still retrying) is ALSO live at Stripe and
 * slips through those guards. This is the one place that predicate is defined
 * so later call sites share it instead of re-deriving it and drifting.
 */
export function classifyBillingRow(row: ClassifiableBillingRow): BillingRowState {
  if (!row.stripe_subscription_id) {
    return { live: false, reason: "no_stripe_object" };
  }

  if (row.status === "active") {
    return { live: true, reason: "active" };
  }

  if (row.status === "past_due") {
    return { live: true, reason: "past_due" };
  }

  return { live: false, reason: "cancelled" };
}

/**
 * Stripe statuses that mean the subscription object is genuinely finished and
 * can never bill again. Everything else — including `paused`, which
 * `mapStripeSubscriptionStatus` folds into our local `cancelled` — is still a
 * live object on the customer and would be duplicated by a new Checkout.
 */
const DEAD_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** Stripe throws this code for a deleted object OR a wrong-mode id (test id vs. live key). */
const isResourceMissing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "resource_missing";

/**
 * What Stripe itself says about a subscription id, kept deliberately five-way
 * because the answers carry different amounts of authority:
 *
 * - `live`       — the object exists and can still bill.
 * - `incomplete` — the object exists but its FIRST payment never completed.
 *                  Deliberately NOT folded into either `live` or `dead`: it is
 *                  not dead (Stripe can still complete it inside its ~23h
 *                  window, so treating it as dead invites a genuine double
 *                  subscription), but it is also not something the partner can
 *                  act on — there is no card on file to "update". A caller that
 *                  wants to let the partner start over must first void it
 *                  (`subscriptions.cancel`) so it can never complete later.
 * - `dead`       — the object exists and is terminally finished. Authoritative:
 *                  safe to write back to our mirror.
 * - `missing`    — `resource_missing`, which Stripe throws for a genuinely
 *                  deleted object AND for a wrong-mode id (a test id read with a
 *                  live key, or vice versa). NOT authoritative: it may only mean
 *                  "this key can't see that object", so it must never overwrite
 *                  the mirror.
 * - `unknown`    — Stripe was unreachable. Keep whatever the mirror said.
 */
export type StripeTruth = "live" | "incomplete" | "dead" | "missing" | "unknown";

/**
 * Our billing_subscriptions row is only a MIRROR of Stripe, kept current by the
 * webhook. When a webhook is missed — or someone acts in the Stripe dashboard —
 * the mirror can be wrong in either direction, so ask Stripe before a wrong
 * answer costs money (a duplicate subscription) or wrongly locks an owner out
 * of Checkout.
 */
export async function readStripeTruth(subscriptionId: string): Promise<StripeTruth> {
  if (!stripe) {
    return "unknown";
  }
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (DEAD_STRIPE_STATUSES.has(subscription.status)) {
      return "dead";
    }
    // `incomplete` is reported separately rather than as `live` — see StripeTruth.
    // Note it is NOT added to DEAD_STRIPE_STATUSES: that set means "authoritatively
    // finished, safe to overwrite the mirror", and an incomplete subscription can
    // still succeed on its own.
    if (subscription.status === "incomplete") {
      return "incomplete";
    }
    return "live";
  } catch (error) {
    return isResourceMissing(error) ? "missing" : "unknown";
  }
}

export type CancelResult =
  | { ok: true; mode: "stripe" | "db" }
  | { ok: false; status: number; error: string };

export async function cancelSubscription(
  subscription: CancelableSubscriptionRow
): Promise<CancelResult> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  // Live Stripe subscription: cancel through Stripe (source of truth) at period
  // end, then mirror the flag locally. Never a bare DB status flip — that would
  // leave Stripe charging the customer.
  if (subscription.stripe_subscription_id && stripe) {
    try {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      return {
        ok: false,
        status: 502,
        error: error instanceof Error ? error.message : "Failed to cancel subscription.",
      };
    }

    await supabaseAdmin
      .from("billing_subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("id", subscription.id);
    // Stripe is already authoritative and scheduled; the sync-back webhook will
    // catch up the mirror write. Don't fail the request over the local write.

    return { ok: true, mode: "stripe" };
  }

  // Tokenless offline/legacy row — nothing to cancel at a processor.
  const { error: updateError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ status: "cancelled" })
    .eq("id", subscription.id);

  if (updateError) {
    return { ok: false, status: 500, error: "Failed to cancel subscription." };
  }

  return { ok: true, mode: "db" };
}

/**
 * Reverses a scheduled cancel_at_period_end before the current paid period
 * ends — the "still active, just not renewing" case. This must never create a
 * new Stripe subscription: the existing one is still live, so the only correct
 * action is to un-schedule its cancellation. A tokenless offline/legacy row has
 * no `cancel_at_period_end` concept at the processor and is not resumable here
 * (an admin re-grant is what reactivates it).
 */
export async function resumeSubscription(
  subscription: CancelableSubscriptionRow
): Promise<CancelResult> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  if (!subscription.stripe_subscription_id || !stripe) {
    return {
      ok: false,
      status: 400,
      error: "This subscription can't be resumed here. Please contact support.",
    };
  }

  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to resume subscription.",
    };
  }

  await supabaseAdmin
    .from("billing_subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", subscription.id);
  // Stripe is already authoritative; the sync-back webhook will catch up the
  // mirror write. Don't fail the request over the local write.

  return { ok: true, mode: "stripe" };
}
