import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminAuth";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";
import { cancelSubscription } from "@/lib/billing";

/**
 * Admin-only manual billing controls (Phase 1 of the check/offline-payment plan).
 *
 * Entitlement in this app is a `billing_subscriptions` row with status='active'
 * — the Stripe flow just automates writing that row. For a partner who pays by
 * check (or any offline method), an admin grants the same active row directly,
 * with an explicit admin-set paid-through date and no Stripe/SlimCD token.
 *
 * A tokenless row is inert to every automated billing job: the Stripe webhook is
 * keyed on stripe_subscription_id (null here) and the renewal cron skips rows
 * with no recurring token. Access simply stays active until current_period_end,
 * after which the admin re-grants when the next check clears.
 *
 * billing_method is set to OFFLINE_BILLING_METHOD (see lib/stripe.ts) so the row
 * is identifiable as offline and excluded from billing automation.
 */

type OwnerLinkRow = {
  owner_id: string;
  venue_id: string;
  venue_owners: { email: string; name: string } | null;
  venues: { id: string; name: string; display_name: string | null } | null;
};

type SubscriptionRow = {
  venue_id: string;
  plan_type: string;
  billing_method: string;
  status: string;
  amount_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  slimcd_recurring_token: string | null;
  cancel_at_period_end: boolean | null;
};

/**
 * GET /api/admin/billing — list every venue-owner link with its current
 * subscription state, so an admin can see who is billed how and grant/revoke
 * offline access. Optional ?search= filters by venue name or owner email.
 */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();

  const { data: links, error: linkError } = await supabaseAdmin
    .from("venue_owner_venues")
    .select(
      "owner_id, venue_id, venue_owners ( email, name ), venues ( id, name, display_name )"
    )
    .returns<OwnerLinkRow[]>();

  if (linkError) {
    return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 });
  }

  const venueIds = (links ?? []).map((l) => l.venue_id);
  const subByVenue = new Map<string, SubscriptionRow>();
  if (venueIds.length > 0) {
    const { data: subs, error: subError } = await supabaseAdmin
      .from("billing_subscriptions")
      .select(
        "venue_id, plan_type, billing_method, status, amount_cents, current_period_start, current_period_end, stripe_subscription_id, slimcd_recurring_token, cancel_at_period_end"
      )
      .in("venue_id", venueIds)
      .returns<SubscriptionRow[]>();
    if (subError) {
      return NextResponse.json({ ok: false, error: subError.message }, { status: 500 });
    }
    for (const s of subs ?? []) subByVenue.set(s.venue_id, s);
  }

  const partners = (links ?? [])
    .map((link) => {
      const sub = subByVenue.get(link.venue_id) ?? null;
      const venueName = link.venues?.display_name ?? link.venues?.name ?? link.venue_id;
      return {
        venueId: link.venue_id,
        venueName,
        ownerId: link.owner_id,
        ownerEmail: link.venue_owners?.email ?? "",
        ownerName: link.venue_owners?.name ?? "",
        subscription: sub
          ? {
              status: sub.status,
              planType: sub.plan_type,
              amountCents: sub.amount_cents,
              currentPeriodStart: sub.current_period_start,
              currentPeriodEnd: sub.current_period_end,
              isManual: sub.billing_method === OFFLINE_BILLING_METHOD,
              isStripe: Boolean(sub.stripe_subscription_id) || Boolean(sub.slimcd_recurring_token),
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            }
          : null,
      };
    })
    .filter((p) => {
      if (!search) return true;
      return (
        p.venueName.toLowerCase().includes(search) ||
        p.ownerEmail.toLowerCase().includes(search) ||
        p.ownerName.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => a.venueName.localeCompare(b.venueName));

  return NextResponse.json({ ok: true, partners });
}

type PostBody = {
  action?: "grant-manual" | "revoke";
  venueId?: string;
  paidThroughDate?: string; // YYYY-MM-DD, inclusive; access ends end-of-day
  amountDollars?: number;
  memo?: string;
  force?: boolean;
};

/**
 * POST /api/admin/billing — grant or revoke offline/manual access for a venue.
 *
 *   action: "grant-manual" — upsert an active manual subscription (paid through
 *            the given date) and record a paid invoice for the audit trail.
 *   action: "revoke"       — mark the subscription cancelled.
 */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const venueId = (body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }

  if (body.action === "revoke") {
    const { data: existing } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id, stripe_subscription_id")
      .eq("venue_id", venueId)
      .maybeSingle<{ id: string; stripe_subscription_id: string | null }>();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
    }
    // Revoke through the shared helper: a card-billed venue's live Stripe
    // subscription must be cancelled at Stripe (cancel_at_period_end), not just
    // flipped in our DB — otherwise Stripe keeps charging the customer monthly
    // while the dashboard shows no access. A tokenless offline row flips
    // status='cancelled' directly (today's behavior).
    const result = await cancelSubscription(existing);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "grant-manual") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  // Resolve the owner linked to this venue — billing_subscriptions.owner_id is
  // NOT NULL, so the venue must already have a registered owner account. If it
  // doesn't, the partner needs to complete /owner/register first.
  const { data: link } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("owner_id")
    .eq("venue_id", venueId)
    .limit(1)
    .maybeSingle<{ owner_id: string }>();

  if (!link) {
    return NextResponse.json(
      { ok: false, error: "This venue has no owner account yet. The partner must register first." },
      { status: 409 }
    );
  }

  // Guard against orphaning a live Stripe subscription: the client only disables
  // "Grant offline" for an active card ("hasActiveCard"), so a past_due card sub
  // can still reach this endpoint. Converting it to offline would null out
  // stripe_subscription_id/customer_id/price_id below, orphaning a subscription
  // that's still in dunning — Stripe would keep collecting and the app could no
  // longer cancel or reconcile it. Require the admin to cancel it first (or pass
  // force:true to cancel-then-convert in one call).
  const { data: existingSub } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string; stripe_subscription_id: string | null; status: string }>();

  if (
    existingSub?.stripe_subscription_id &&
    (existingSub.status === "active" || existingSub.status === "past_due")
  ) {
    if (!body.force) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This venue has a live Stripe subscription. Cancel it first (Revoke), then grant offline access.",
        },
        { status: 409 }
      );
    }
    const cancelResult = await cancelSubscription(existingSub);
    if (!cancelResult.ok) {
      return NextResponse.json({ ok: false, error: cancelResult.error }, { status: cancelResult.status });
    }
  }

  // Paid-through date → end of that day (local-agnostic: 23:59:59 UTC keeps the
  // partner active for the entire calendar day they've paid through).
  const dateStr = (body.paidThroughDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ ok: false, error: "A valid paid-through date is required." }, { status: 400 });
  }
  const periodEnd = new Date(`${dateStr}T23:59:59.000Z`);
  if (Number.isNaN(periodEnd.getTime()) || periodEnd.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "Paid-through date must be in the future." }, { status: 400 });
  }

  const amountCents = Math.round(Math.max(0, Number(body.amountDollars ?? 0)) * 100);
  const memo = (body.memo ?? "").trim() || "Manual/check payment";
  const now = new Date();

  const { data: subscription, error: subError } = await supabaseAdmin
    .from("billing_subscriptions")
    .upsert(
      {
        venue_id: venueId,
        owner_id: link.owner_id,
        plan_type: "subscription",
        billing_method: OFFLINE_BILLING_METHOD,
        amount_cents: amountCents,
        status: "active" as const,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        // Explicitly clear any processor tokens so this row stays inert to the
        // Stripe webhook and the renewal cron even if it previously had them.
        slimcd_recurring_token: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
      },
      { onConflict: "venue_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (subError || !subscription) {
    return NextResponse.json({ ok: false, error: subError?.message ?? "Failed to grant access." }, { status: 500 });
  }

  const { error: invoiceError } = await supabaseAdmin.from("billing_invoices").insert({
    subscription_id: subscription.id,
    venue_id: venueId,
    description: `Offline payment — ${memo} (paid through ${dateStr})`,
    amount_cents: amountCents,
    status: "paid",
  });
  if (invoiceError) {
    // The access grant succeeded; the invoice is only an audit record. Report
    // success but note the bookkeeping gap so support can reconcile.
    return NextResponse.json({ ok: true, warning: "Access granted, but the invoice record failed to save." });
  }

  return NextResponse.json({ ok: true });
}
