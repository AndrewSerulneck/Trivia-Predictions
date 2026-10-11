import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import { loadBillingForVenue } from "@/lib/venueBilling";

type PortalBody = {
  venueId?: string;
};

/**
 * POST /api/owner/billing/portal — open the Stripe Billing Portal for the caller's
 * venue so they can update their payment method, view invoices, or cancel.
 * Replaces the SlimCD "update_card" session flow.
 */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as PortalBody;
  const venueId = (body.venueId ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  // The bill covering this venue — its own, or the multi-venue bill it is on.
  const billing = await loadBillingForVenue<{
    id: string;
    venue_id: string;
    status: string;
    stripe_customer_id: string | null;
  }>(venueId, "stripe_customer_id");
  const sub = billing.ok ? billing.row : null;

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ ok: false, error: "Please subsribe to update payment method. " }, { status: 404 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/owner/billing`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not open billing portal." },
      { status: 502 }
    );
  }
}
