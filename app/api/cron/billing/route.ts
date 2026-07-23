import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chargeRecurring } from "@/lib/slimcd";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";

type DueSubscription = {
  id: string;
  venue_id: string;
  plan_type: string;
  amount_cents: number;
  slimcd_recurring_token: string | null;
  current_period_end: string | null;
};

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // Active subscriptions whose paid period has ended are due for rebilling.
  // Offline/check subscriptions are explicitly excluded: they carry no recurring
  // token and are billed by an admin re-granting access, never charged
  // automatically. The tokenless guard below would already skip them, but the
  // billing_method filter makes it impossible for a stray token to trigger a charge.
  const { data: due, error: dueError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id, plan_type, amount_cents, slimcd_recurring_token, current_period_end")
    .eq("status", "active")
    .neq("billing_method", OFFLINE_BILLING_METHOD)
    .lte("current_period_end", nowIso)
    .returns<DueSubscription[]>();

  if (dueError) {
    return NextResponse.json({ ok: false, error: dueError.message }, { status: 500 });
  }

  const results = { charged: 0, failed: 0, skipped: 0 };

  for (const sub of due ?? []) {
    if (!sub.slimcd_recurring_token) {
      results.skipped += 1;
      continue;
    }

    const clientRef = `rb-${Date.now().toString(36)}`;
    let charge;
    try {
      charge = await chargeRecurring(sub.slimcd_recurring_token, sub.amount_cents, clientRef);
    } catch {
      // Network/system error — mark past_due so it's retried/flagged, record a failed invoice.
      await supabaseAdmin.from("billing_subscriptions").update({ status: "past_due" }).eq("id", sub.id);
      await supabaseAdmin.from("billing_invoices").insert({
        subscription_id: sub.id,
        venue_id: sub.venue_id,
        description: `Hightop Challenge ${sub.plan_type} — monthly charge (error)`,
        amount_cents: sub.amount_cents,
        status: "failed",
      });
      results.failed += 1;
      continue;
    }

    if (charge.approved) {
      // Advance the billing period by one month from the prior period end.
      const priorEnd = sub.current_period_end ? new Date(sub.current_period_end) : new Date();
      const newStart = new Date(priorEnd);
      const newEnd = new Date(priorEnd);
      newEnd.setMonth(newEnd.getMonth() + 1);

      await supabaseAdmin
        .from("billing_subscriptions")
        .update({
          current_period_start: newStart.toISOString(),
          current_period_end: newEnd.toISOString(),
          status: "active",
        })
        .eq("id", sub.id);

      await supabaseAdmin.from("billing_invoices").insert({
        subscription_id: sub.id,
        venue_id: sub.venue_id,
        description: `Hightop Challenge ${sub.plan_type} — monthly charge`,
        amount_cents: sub.amount_cents,
        status: "paid",
        slimcd_ticket: charge.gateid,
      });
      results.charged += 1;
    } else {
      // Card declined — mark past_due and record the failed invoice.
      await supabaseAdmin.from("billing_subscriptions").update({ status: "past_due" }).eq("id", sub.id);
      await supabaseAdmin.from("billing_invoices").insert({
        subscription_id: sub.id,
        venue_id: sub.venue_id,
        description: `Hightop Challenge ${sub.plan_type} — monthly charge (declined: ${charge.description})`,
        amount_cents: sub.amount_cents,
        status: "failed",
      });
      results.failed += 1;
    }
  }

  // Expire offline/check grants whose paid-through date has passed. These rows
  // carry no processor token, so nothing else ever flips them: the renewal loop
  // above excludes billing_method='offline', and the Stripe webhook never fires
  // for tokenless rows. Without this sweep an offline grant would stay
  // status='active' forever, contradicting the admin copy "then reverts to no
  // access." Setting status='cancelled' is already handled by the owner UI
  // (shows "Access ends {date}", offers Resubscribe) and the dashboard tile;
  // re-granting from the admin panel reactivates the row.
  const { data: expired, error: expiredError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ status: "cancelled" })
    .eq("billing_method", OFFLINE_BILLING_METHOD)
    .eq("status", "active")
    .lte("current_period_end", nowIso)
    .select("id")
    .returns<{ id: string }[]>();

  if (expiredError) {
    return NextResponse.json({ ok: false, error: expiredError.message }, { status: 500 });
  }

  const offlineExpired = expired?.length ?? 0;

  return NextResponse.json({
    ok: true,
    processed: (due ?? []).length,
    results,
    offlineExpired,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
