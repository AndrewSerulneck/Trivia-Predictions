import "server-only";

import type Stripe from "stripe";

// Abandoned-signup cleanup — Phase 1 (docs/abandoned-signup-cleanup-plan.md §Phase 1).
//
// EXTRACTED, NOT REWRITTEN. This is `sweepAbandonedIncompleteSubscriptions` as it
// lived inside app/api/owner/billing/checkout/route.ts, moved here verbatim in
// behaviour so a SECOND caller — `purgePendingSignup` in lib/pendingSignup.ts —
// can reuse it instead of writing a second copy. The checkout route now imports
// it; the logic below is the same object, in one place.
//
// The one thing that changed is the RETURN TYPE: it was `Promise<void>`, and the
// two callers need opposite failure policies, so it now reports what happened and
// each caller decides. See `IncompleteSweepResult`.

/**
 * What the sweep managed to do.
 *
 * `ok: false` means "I could not prove this venue has no live-able abandoned
 * subscription" — the list call failed, or a cancel was refused. It does NOT
 * mean nothing was cancelled; `cancelledSubscriptionIds` is still accurate.
 *
 * The two callers read this differently, ON PURPOSE:
 *
 *   - POST /api/owner/billing/checkout IGNORES it and proceeds. There, this is a
 *     safety net on top of Stripe's own ~23h expiry of an `incomplete`
 *     subscription; blocking a paying partner because a sweep call failed would
 *     trade a certain harm for an unlikely one. (The genuinely dangerous case in
 *     that route — the abandoned object is the SAME subscription we are about to
 *     replace — is handled separately by `voidIncompleteSubscription`, which
 *     does refuse the request.)
 *   - `purgePendingSignup` ABORTS on it and deletes nothing. There, the venue
 *     carrying `metadata.venueId` is about to be deleted, so an uncancelled
 *     `incomplete` subscription that later completes would write a
 *     billing_subscriptions row against a venue that no longer exists and fire
 *     `maybeRevealVenue` on nothing. Proceeding blind is not an option.
 */
export type IncompleteSweepResult = {
  ok: boolean;
  /** Subscriptions this call actually cancelled at Stripe. */
  cancelledSubscriptionIds: string[];
  /** Greppable failure tags for the caller's log; never partner-facing. */
  errors: string[];
};

/**
 * Cancel any `incomplete` Stripe subscription still carrying this venueId in its
 * metadata.
 *
 * Since Phase 8 of the signup build an unfinished signup writes NO
 * billing_subscriptions row (see app/api/webhooks/stripe/route.ts), so there is
 * no stored id to void the way the mirrored branches in the checkout route do.
 * Stripe expires an `incomplete` subscription by itself in ~23h, but inside that
 * window a partner could return to a stale Checkout tab and complete it AFTER
 * paying through a fresh one — billed twice. Every subscription this app creates
 * sets subscription_data.metadata.venueId, so the abandoned object is findable
 * with nothing stored on our side.
 *
 * `subscriptions.search` does support `metadata['venueId']`, but its index lags up
 * to a minute and Stripe documents it as unsafe for read-after-write flows — which
 * is exactly this one (abandon, then immediately retry). `list` is strongly
 * consistent, and `incomplete` subscriptions are a small, self-expiring population
 * account-wide.
 */
export async function sweepAbandonedIncompleteSubscriptions(
  client: Stripe,
  venueId: string
): Promise<IncompleteSweepResult> {
  const result: IncompleteSweepResult = { ok: true, cancelledSubscriptionIds: [], errors: [] };

  let incomplete: Stripe.Subscription[];
  try {
    // Auto-paged rather than a flat limit: this venue's abandoned subscription
    // could sit past the first 100 account-wide incompletes and be missed,
    // reopening the double-bill window this sweep exists to close. Mirrors
    // app/api/admin/billing/promo-codes/route.ts's GET. The cap is a runaway
    // guard, not an expected boundary — hitting it is logged below.
    incomplete = await client.subscriptions
      .list({ status: "incomplete", limit: 100 })
      .autoPagingToArray({ limit: 1000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn("Could not list incomplete subscriptions before checkout.", { venueId, error: message });
    result.ok = false;
    result.errors.push(`list-failed: ${message}`);
    return result;
  }

  if (incomplete.length === 1000) {
    console.warn("Abandoned-subscription sweep hit its paging cap; some incompletes may be unswept.", {
      venueId,
    });
    // Not an `ok: false`: the cap is a runaway guard on a population that is
    // self-expiring and, in this product, three orders of magnitude smaller.
    // Failing the purge on it would wedge every retry behind an unrelated
    // account-wide condition.
    result.errors.push("paging-cap-hit");
  }

  for (const sub of incomplete) {
    if (sub.metadata?.venueId?.trim() !== venueId) continue;
    try {
      await client.subscriptions.cancel(sub.id);
      result.cancelledSubscriptionIds.push(sub.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.warn("Could not cancel an abandoned incomplete subscription before checkout.", {
        venueId,
        subscriptionId: sub.id,
        error: message,
      });
      result.ok = false;
      result.errors.push(`cancel-failed sub=${sub.id}: ${message}`);
    }
  }

  return result;
}
