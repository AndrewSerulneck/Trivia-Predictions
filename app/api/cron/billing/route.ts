import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chargeRecurring } from "@/lib/slimcd";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) {
      return true;
    }
    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }
  // No secret configured: allow Vercel's automatic cron header
  return Boolean(request.headers.get("x-vercel-cron"));
}

type DueSubscription = {
  id: string;
  venue_id: string;
  plan_type: string;
  amount_cents: number;
  slimcd_recurring_token: string | null;
  current_period_end: string | null;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // Active subscriptions whose paid period has ended are due for rebilling.
  const { data: due, error: dueError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id, plan_type, amount_cents, slimcd_recurring_token, current_period_end")
    .eq("status", "active")
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

  return NextResponse.json({ ok: true, processed: (due ?? []).length, results });
}
