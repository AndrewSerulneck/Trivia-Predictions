import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { cancelSubscription } from "@/lib/billing";

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
