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
