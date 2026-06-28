import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

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
    .select("id")
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string }>();

  if (!subscription) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  // Cancel stops future charges but does not refund. The venue keeps access
  // through the end of the already-paid current period.
  const { error: updateError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ status: "cancelled" })
    .eq("id", subscription.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Failed to cancel subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
