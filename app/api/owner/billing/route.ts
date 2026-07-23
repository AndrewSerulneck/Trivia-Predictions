import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";

type SubscriptionRow = {
  id: string;
  venue_id: string;
  plan_type: string;
  billing_method: string;
  amount_cents: number;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  slimcd_recurring_token: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  subscription_id: string;
  venue_id: string;
  description: string;
  amount_cents: number;
  status: string;
  charged_at: string;
};

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  if (auth.venueIds.length === 0) {
    return NextResponse.json({ ok: true, subscriptions: [], invoices: [] });
  }

  const { data: subscriptions, error: subError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select(
      "id, venue_id, plan_type, billing_method, amount_cents, status, current_period_start, current_period_end, cancel_at_period_end, slimcd_recurring_token, created_at"
    )
    .in("venue_id", auth.venueIds)
    .returns<SubscriptionRow[]>();

  if (subError) {
    return NextResponse.json({ ok: false, error: subError.message }, { status: 500 });
  }

  const { data: invoices, error: invError } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, subscription_id, venue_id, description, amount_cents, status, charged_at")
    .in("venue_id", auth.venueIds)
    .order("charged_at", { ascending: false })
    .limit(12)
    .returns<InvoiceRow[]>();

  if (invError) {
    return NextResponse.json({ ok: false, error: invError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    venueIds: auth.venueIds,
    subscriptions: (subscriptions ?? []).map((s) => ({
      id: s.id,
      venueId: s.venue_id,
      planType: s.plan_type,
      amountCents: s.amount_cents,
      status: s.status,
      currentPeriodStart: s.current_period_start,
      currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      hasPaymentMethod: Boolean(s.slimcd_recurring_token),
      isManual: s.billing_method === OFFLINE_BILLING_METHOD,
      createdAt: s.created_at,
    })),
    invoices: (invoices ?? []).map((i) => ({
      id: i.id,
      subscriptionId: i.subscription_id,
      venueId: i.venue_id,
      description: i.description,
      amountCents: i.amount_cents,
      status: i.status,
      chargedAt: i.charged_at,
    })),
  });
}
