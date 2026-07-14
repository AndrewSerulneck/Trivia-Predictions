import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe, getStripePriceId } from "@/lib/stripe";

type CheckoutBody = {
  venueId?: string;
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
  const priceId = getStripePriceId();
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

  // Guard against a duplicate active subscription for this venue.
  const { data: existing } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("status, stripe_customer_id")
    .eq("venue_id", venueId)
    .maybeSingle<{ status: string; stripe_customer_id: string | null }>();

  if (existing?.status === "active") {
    return NextResponse.json(
      { ok: false, error: "This venue already has an active subscription." },
      { status: 409 }
    );
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  try {
    // Reuse an existing Stripe customer if we have one for this venue; otherwise
    // let Checkout create one. The webhook persists the customer id on completion.
    const customerId = existing?.stripe_customer_id ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
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

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Stripe checkout failed." },
      { status: 502 }
    );
  }
}
