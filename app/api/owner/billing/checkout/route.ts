import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCheckoutPriceId, OFFLINE_BILLING_METHOD, stripe } from "@/lib/stripe";
import { sweepAbandonedIncompleteSubscriptions } from "@/lib/stripeIncomplete";
import { CLEARED_MIRROR } from "@/lib/billingDiscounts";
import {
  classifyBillingRow,
  readStripeTruth,
  type BillingRowState,
  type ClassifiableBillingRow,
} from "@/lib/billing";
import {
  loadBillingForVenue,
  otherLiveBillOfOwner,
  refusesOwnBill,
  unbilledVenueStates,
  type UnbilledVenueState,
} from "@/lib/venueBilling";
import { ON_PARTNER_BILL_CODE, ON_PARTNER_BILL_MESSAGES, onPartnerBillMessageKey } from "@/lib/multiVenueBilling";

/**
 * Multi-venue billing Phase 6.3 (review #4): one subscription per partner. NOT flag-gated — comped
 * links (admin "Free (comped)") exist while the multi-venue flag is off. Copy: lib/multiVenueBilling.ts.
 */
const onPartnerBillResponse = (venueId: string, state: UnbilledVenueState): NextResponse => {
  const key = onPartnerBillMessageKey(state.kind);
  console.warn(`[OwnerCheckout] on-partner-bill venue=${venueId} state=${state.kind} ownerBill=${state.ownerBillId ?? "none"}`);
  return NextResponse.json(
    { ok: false, error: ON_PARTNER_BILL_MESSAGES[key], code: ON_PARTNER_BILL_CODE },
    { status: 409 }
  );
};

type CheckoutBody = {
  venueId?: string;
};

type ExistingBillingRow = ClassifiableBillingRow & {
  id: string;
  venue_id: string;
  stripe_customer_id: string | null;
  cancel_at_period_end: boolean;
  billing_method: string;
};

/**
 * POST /api/owner/billing/checkout — start a Stripe Checkout Session (subscription
 * mode) for the caller's venue. Replaces the SlimCD `POST /api/owner/billing/session`
 * (intent: "subscribe") flow. The webhook (checkout.session.completed) is what
 * actually writes the billing_subscriptions row once payment succeeds.
 */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }
  const priceId = getCheckoutPriceId();
  if (!priceId) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as CheckoutBody;
  const venueId = (body.venueId ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  // Guard against minting a SECOND Stripe subscription on the same customer.
  // The question is not "is our status 'active'?" but "is anything live at
  // Stripe right now?" — `past_due` is live too (card declined, Stripe still
  // retrying), so it must refuse Checkout as well. See classifyBillingRow.
  //
  // Asked through the one resolver (lib/venueBilling.ts): a venue that sits on another venue's
  // multi-venue bill is covered by THAT bill, and must be refused here exactly like a venue with
  // its own live subscription — a second Checkout would bill it twice. A read error is refused
  // too (fail closed): without the answer we cannot rule out a live subscription.
  const billing = await loadBillingForVenue<ExistingBillingRow>(
    venueId,
    "id, venue_id, status, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, billing_method"
  );
  if (!billing.ok) {
    console.error(`[OwnerCheckout] billing-read-failed venue=${venueId}: ${billing.error}`);
    return NextResponse.json(
      { ok: false, error: "We couldn't check this venue's billing. Please try again in a few minutes." },
      { status: 503 }
    );
  }
  const existing = billing.row;

  // Phase 6.3: is this venue comped, removed, or a second venue of a partner who already pays?
  // Answered for a venue no live bill covers — before any Stripe call and before the
  // abandoned-Checkout sweep. Fails CLOSED on a read error, like the billing read above.
  const states = await unbilledVenueStates([venueId], new Map([[venueId, auth.ownerId]]));
  if (!states.ok) {
    console.error(`[OwnerCheckout] billing-read-failed venue=${venueId}: ${states.error}`);
    return NextResponse.json(
      { ok: false, error: "We couldn't check this venue's billing. Please try again in a few minutes." },
      { status: 503 }
    );
  }
  const unbilledState = states.byVenue.get(venueId);
  if (refusesOwnBill(unbilledState)) return onPartnerBillResponse(venueId, unbilledState);

  if (existing) {
    // Offline/check-payer rows are tokenless by design (grant-manual nulls every
    // processor id), so classifyBillingRow reads them as `no_stripe_object` —
    // "nothing at Stripe, safe to check out" — and would let a partner who is
    // already paying by check open a SECOND, card-billed subscription on top of
    // the admin grant. Nothing at Stripe can catch that: there is no customer to
    // collide with. So this is decided on billing_method alone, ahead of the
    // Stripe-truth logic below, which has no bearing on a tokenless row.
    //
    // Only a still-billing offline row is blocked. `cancelled` falls through on
    // purpose: that is what the cron expiry sweep sets once the paid-through date
    // lapses, and converting to self-serve card billing is exactly the right move
    // then (it is the same Resubscribe path the owner UI already offers).
    if (existing.billing_method === OFFLINE_BILLING_METHOD && existing.status !== "cancelled") {
      return NextResponse.json(
        {
          ok: false,
          error: "This venue is billed offline. Contact support to switch to card billing.",
          code: "offline_billing",
        },
        { status: 409 }
      );
    }

    let rowState: BillingRowState = classifyBillingRow(existing);

    // Re-bound as consts: the null checks above don't survive into a closure.
    const stripeClient = stripe;
    const db = supabaseAdmin;
    // Mirror corrections below are keyed by the bill's own id — on a multi-venue bill the
    // venue in the request is not necessarily the bill's anchor venue.
    const existingRowId = existing.id;

    /**
     * Void an abandoned first Checkout (Stripe status `incomplete`) so this
     * request can start a clean one. Cancelling is what makes it safe to allow:
     * an untouched incomplete subscription can still complete inside Stripe's
     * ~23h window, which would leave the partner paying twice. Returns false if
     * Stripe refused — the caller must then refuse the request rather than
     * proceed on an assumption.
     */
    const voidIncompleteSubscription = async (subscriptionId: string): Promise<boolean> => {
      try {
        await stripeClient.subscriptions.cancel(subscriptionId);
      } catch {
        return false;
      }
      // Now authoritatively dead — same mirror correction the `dead` branch makes.
      await db
        .from("billing_subscriptions")
        .update({ status: "cancelled", cancel_at_period_end: false, ...CLEARED_MIRROR })
        .eq("id", existingRowId);
      return true;
    };

    const incompleteRetryResponse = () =>
      NextResponse.json(
        {
          ok: false,
          error: "Your previous payment didn't finish. Please try again in a few minutes.",
          code: "incomplete_retry",
        },
        { status: 409 }
      );

    if (rowState.live && existing.stripe_subscription_id) {
      // About to refuse. If the mirror is stale and the subscription is really
      // dead at Stripe, refusing would lock a paying-again owner out forever.
      const truth = await readStripeTruth(existing.stripe_subscription_id);

      if (truth === "dead") {
        // Authoritative: Stripe handed back a terminal status, so correct the
        // mirror. Also clear cancel_at_period_end — nothing is left to schedule
        // against once the subscription is truly dead at Stripe, and leaving a
        // stale `true` here would make a cancelled row masquerade as
        // "cancellation scheduled" in the owner UI (Phase 5's Part A guard).
        // The discount mirror dies with the subscription for the same reason:
        // the owner UI renders the discount block whenever it is populated, so
        // a leftover coupon would price a dead subscription next to
        // "Resubscribe". Same clear the deleted-subscription webhook does.
        await supabaseAdmin
          .from("billing_subscriptions")
          .update({ status: "cancelled", cancel_at_period_end: false, ...CLEARED_MIRROR })
          .eq("id", existingRowId);
        rowState = { live: false, reason: "cancelled" };
      } else if (truth === "missing") {
        // `resource_missing` also fires on a wrong-mode id (a test id read with
        // a live key), so it is NOT proof the subscription is gone. Let it
        // unblock this one request — the owner would otherwise be locked out —
        // but never write it back: overwriting a genuinely live row to
        // 'cancelled' would then invite a real duplicate-billing resubscribe.
        rowState = { live: false, reason: "cancelled" };
      } else if (truth === "incomplete") {
        // A first Checkout whose payment never completed: Stripe says
        // `incomplete`, which mapStripeSubscriptionStatus mirrors as `past_due`.
        // Refusing here (the `fix_payment` branch below) would tell the partner
        // to "update your card" for ~23h when there is no card on file and no
        // action behind the message. Instead void the abandoned subscription and
        // let them start over — the cancel is what rules out a double bill.
        if (!(await voidIncompleteSubscription(existing.stripe_subscription_id))) {
          return incompleteRetryResponse();
        }
        rowState = { live: false, reason: "cancelled" };
      }
    } else if (rowState.reason === "cancelled" && existing.stripe_subscription_id) {
      // About to allow, but a Stripe object is on record. This is the `paused`
      // case: alive at Stripe, `cancelled` here. Allowing would double-bill.
      const truth = await readStripeTruth(existing.stripe_subscription_id);

      // Mirror says cancelled, Stripe says incomplete — the same abandoned-first-
      // payment object, reached from the other direction. Allowing without
      // cancelling would let it complete later on top of the new subscription.
      if (truth === "incomplete") {
        if (!(await voidIncompleteSubscription(existing.stripe_subscription_id))) {
          return incompleteRetryResponse();
        }
      }

      // Fail CLOSED on `unknown`: during a Stripe outage we cannot rule out
      // that this subscription is still live, and the cost of guessing wrong
      // here is a second real subscription on the same customer.
      if (truth === "live" || truth === "unknown") {
        return NextResponse.json(
          {
            ok: false,
            error:
              truth === "live"
                ? "This venue's subscription is still live at Stripe. Please contact support before starting a new one."
                : "We couldn't reach Stripe to confirm this venue has no live subscription. Please try again in a few minutes.",
            code: truth === "live" ? "stripe_live" : "stripe_unreachable",
          },
          { status: 409 }
        );
      }
    }

    if (rowState.live && existing.cancel_at_period_end) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This venue has an active subscription scheduled to cancel. Resume it instead of starting a new checkout.",
          code: "resume_instead",
        },
        { status: 409 }
      );
    }

    if (rowState.live && rowState.reason === "past_due") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Your last payment failed. Update your card to keep this subscription — starting a new one would bill you twice.",
          code: "fix_payment",
        },
        { status: 409 }
      );
    }

    if (rowState.live) {
      return NextResponse.json(
        { ok: false, error: "This venue already has an active subscription." },
        { status: 409 }
      );
    }
  }

  // The rare path above where this venue's own bill LOOKED live but Stripe said it is dead: the
  // classifier counted the venue as covered, so ask the same "second bill?" question here.
  if (existing && existing.status !== "cancelled") {
    const other = await otherLiveBillOfOwner(auth.ownerId, existing.id);
    if (!other.ok) {
      console.error(`[OwnerCheckout] billing-read-failed venue=${venueId}: ${other.error}`);
      return NextResponse.json(
        { ok: false, error: "We couldn't check this venue's billing. Please try again in a few minutes." },
        { status: 503 }
      );
    }
    if (other.billId) return onPartnerBillResponse(venueId, { kind: "unbilled", ownerBillId: other.billId });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  // No row is written for an unfinished signup any more, so an abandoned attempt
  // can only be found at Stripe. Close it before opening a new one.
  //
  // The result is deliberately ignored: this is a safety net on top of Stripe's
  // own ~23h expiry, and blocking a paying partner because a sweep call failed
  // would trade a certain harm for an unlikely one. `purgePendingSignup`, the
  // other caller of the same helper, aborts on failure instead — see the policy
  // note in lib/stripeIncomplete.ts.
  await sweepAbandonedIncompleteSubscriptions(stripe, venueId);

  try {
    // Reuse an existing Stripe customer if we have one for this venue; otherwise
    // let Checkout create one. The webhook persists the customer id on completion.
    const customerId = existing?.stripe_customer_id ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Lets a partner redeem a Stripe Promotion Code (e.g. LAUNCH50) right in
      // Checkout's own UI at signup — Stripe matches it to its coupon and
      // applies it; no redemption code path needed on our side. New signups
      // only (docs/billing-discount-phase7.md) — applying a discount to an
      // existing subscriber is the admin-grant path (lib/billingDiscounts.ts).
      allow_promotion_codes: true,
      customer: customerId,
      client_reference_id: venueId,
      subscription_data: {
        metadata: { venueId, ownerId: auth.ownerId },
      },
      metadata: { venueId, ownerId: auth.ownerId },
      success_url: `${origin}/owner/billing?success=subscribed`,
      cancel_url: `${origin}/owner/billing?error=incomplete`,
    });

    if (!session.url) {
      return NextResponse.json({ ok: false, error: "Could not create checkout session." }, { status: 502 });
    }

    // Stamp `venues.checkout_started_at` now — AFTER `session.url` is confirmed,
    // BEFORE the URL is handed back. Placement is a correctness constraint, not
    // style: the abandoned-signup sweep (lib/signupSweep.ts) and
    // purgePendingSignup (docs/abandoned-signup-cleanup-plan.md §4.1a) both read
    // a null value as "this partner never reached Stripe — nothing to wait for,
    // nothing to cancel". That is only true because the stamp is written before
    // the partner can act on the URL. Stamping earlier would mark a failed Stripe
    // call as "reached checkout" (harmless, just a slower sweep); stamping later,
    // from the client, or on the success webhook makes both readers wrong.
    //
    // Best-effort, same policy as sweepAbandonedIncompleteSubscriptions above: a
    // partner holding a live Checkout URL must get it. A missed stamp costs one
    // venue an early sweep; a refused Checkout costs a subscription. Re-stamped
    // on every Checkout start (including a re-checkout) so Tier B's clock
    // restarts for a partner who is trying again.
    try {
      const { error: stampError } = await supabaseAdmin
        .from("venues")
        .update({ checkout_started_at: new Date().toISOString() })
        .eq("id", venueId);
      if (stampError) {
        console.error(`[OwnerCheckout] checkout-stamp-failed venue=${venueId}`, stampError.message);
      }
    } catch (stampError) {
      console.error(
        `[OwnerCheckout] checkout-stamp-failed venue=${venueId}`,
        stampError instanceof Error ? stampError.message : stampError
      );
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Stripe checkout failed." },
      { status: 502 }
    );
  }
}
