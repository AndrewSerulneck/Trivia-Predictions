// DEPRECATED (SlimCD): superseded by the Stripe billing flow — POST /api/owner/billing/checkout,
// POST /api/owner/billing/portal, and the webhook /api/webhooks/stripe. Retained only
// for any legacy subscriptions created before the Stripe cutover; no new code should
// call this route. Slated for removal once no active SlimCD subscriptions remain.
import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { createSession } from "@/lib/slimcd";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SessionBody = {
  venueId?: string;
  intent?: string;
  amountCents?: number;
};

const VALID_INTENTS = ["subscribe", "update_card"] as const;
type Intent = (typeof VALID_INTENTS)[number];

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

  const body = (await request.json().catch(() => ({}))) as SessionBody;
  const venueId = (body.venueId ?? "").trim();
  const intentRaw = (body.intent ?? "subscribe").trim();
  const amountCents = Number(body.amountCents ?? 14000);

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (!(VALID_INTENTS as readonly string[]).includes(intentRaw)) {
    return NextResponse.json({ ok: false, error: "Invalid intent." }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return NextResponse.json({ ok: false, error: "Invalid amountCents." }, { status: 400 });
  }

  const intent = intentRaw as Intent;

  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  // For subscribe intent, ensure there isn't already an active subscription.
  if (intent === "subscribe") {
    const { data: existing } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id, status")
      .eq("venue_id", venueId)
      .maybeSingle<{ id: string; status: string }>();

    if (existing?.status === "active") {
      return NextResponse.json(
        { ok: false, error: "This venue already has an active subscription." },
        { status: 409 }
      );
    }
  }

  // For update_card intent, ensure a subscription exists to update.
  if (intent === "update_card") {
    const { data: sub } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id")
      .eq("venue_id", venueId)
      .maybeSingle<{ id: string }>();

    if (!sub) {
      return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
    }
  }

  // Note: the post-payment Redirect URL is configured on the Hosted Payment Page
  // form in the SlimCD portal (it must point at /api/owner/billing/return), not
  // passed here — SlimCD's CreateSession does not accept a return URL field.
  const session = await createSession({
    amountCents,
    venueId,
    ownerId: auth.ownerId,
    intent,
  });

  if (!session.ok || !session.sessionId || !session.sessionUrl) {
    return NextResponse.json(
      { ok: false, error: session.error ?? "Could not create payment session." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sessionId: session.sessionId, sessionUrl: session.sessionUrl });
}
