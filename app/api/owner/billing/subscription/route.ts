import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { stripe } from "@/lib/stripe";

type CancelBody = {
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

  // Cancellation is driven through Stripe: schedule cancel at period end so the
  // venue keeps access through the already-paid period (no refund) — status
  // stays 'active' in Stripe (and here) until the period actually ends. We also
  // write cancel_at_period_end here directly (not just via the later Stripe
  // webhook) so the dashboard reflects "cancellation scheduled" on the very next
  // fetch instead of waiting on webhook round-trip latency. If there is no
  // Stripe subscription (legacy SlimCD row), fall back to a direct DB status update.
  if (subscription.stripe_subscription_id && stripe) {
    try {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Failed to cancel subscription." },
        { status: 502 }
      );
    }

    const { error: flagError } = await supabaseAdmin
      .from("billing_subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("id", subscription.id);
    if (flagError) {
      // Stripe is already authoritative and scheduled; the sync-back webhook will
      // still catch this up. Don't fail the request over the local mirror write.
    }

    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ status: "cancelled" })
    .eq("id", subscription.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Failed to cancel subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
