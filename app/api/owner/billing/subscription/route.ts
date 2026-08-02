import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { cancelSubscription, resumeSubscription, classifyBillingRow, readStripeTruth } from "@/lib/billing";

type CancelBody = {
  venueId?: string;
};

type ResumeBody = {
  venueId?: string;
};

export async function DELETE(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as CancelBody;
  const venueId = (body.venueId ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }

  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  const { data: subscription } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id")
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string; stripe_subscription_id: string | null }>();

  if (!subscription) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  // Cancellation is driven through the shared helper: for a live Stripe
  // subscription it schedules cancel_at_period_end (venue keeps access through
  // the already-paid period, no refund) and mirrors the flag locally so the
  // dashboard reflects "cancellation scheduled" immediately; for a tokenless
  // legacy/offline row it flips status='cancelled' directly.
  const result = await cancelSubscription(subscription);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as ResumeBody;
  const venueId = (body.venueId ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }

  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  const { data: subscription } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string; stripe_subscription_id: string | null; status: string }>();

  if (!subscription) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  // Mirror image of the checkout route's "resume_instead" guard: once the paid
  // period has actually elapsed there is no live Stripe subscription left to
  // un-schedule, so the only correct action is a fresh Checkout. Without this we
  // would hand a cancelled subscription id to Stripe and surface its error as a
  // 502. `past_due` is also live at Stripe (card declined but still retrying)
  // and must be resumable — see classifyBillingRow in lib/billing.ts.
  const endedResponse = () =>
    NextResponse.json(
      {
        ok: false,
        error: "This subscription has already ended. Start a new subscription instead.",
        code: "checkout_instead",
      },
      { status: 409 }
    );

  if (!classifyBillingRow(subscription).live) {
    return endedResponse();
  }

  // Same self-heal the checkout route does, in the other direction: the row is
  // only a mirror, so a stale 'active'/'past_due' whose Stripe object is
  // actually gone would hand a dead id to Stripe and surface a raw 502. Ask
  // Stripe and route the owner to Checkout with the friendly message instead.
  // `unknown` (Stripe unreachable) falls through and fails naturally — there is
  // nothing safe to conclude, and no DB write happens on any of these paths.
  // `incomplete` deliberately falls through too, i.e. it is treated like `live`:
  // the object still exists at Stripe, so routing the owner to a fresh Checkout
  // from HERE would be the double-billing move. Voiding an incomplete
  // subscription is the checkout route's job (it cancels first, then allows) —
  // resume must stay fail-closed.
  if (subscription.stripe_subscription_id) {
    const truth = await readStripeTruth(subscription.stripe_subscription_id);
    if (truth === "dead" || truth === "missing") {
      return endedResponse();
    }
  }

  // Resume un-schedules cancel_at_period_end on the existing Stripe subscription —
  // never creates a new one. See lib/billing.ts for why this must be distinct
  // from the Checkout ("subscribe") flow.
  const result = await resumeSubscription(subscription);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
