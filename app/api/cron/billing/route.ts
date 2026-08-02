import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";

/**
 * Daily billing cron. Its ONLY job is expiring lapsed offline/check grants.
 *
 * It used to also rebill card subscriptions through SlimCD, which was abandoned
 * before launch and removed wholesale (lib/slimcd.ts and the hosted-page session/
 * return routes are gone). Card renewals are Stripe's own recurring billing —
 * nothing here drives them; the webhook (/api/webhooks/stripe) mirrors the
 * result. Do not reintroduce a charge loop here.
 *
 * `billing_subscriptions.slimcd_recurring_token` and
 * `billing_invoices.slimcd_ticket` remain in the schema as dead columns: nothing
 * reads or writes them, and dropping a column is irreversible for no gain.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // Expire offline/check grants whose paid-through date has passed. These rows
  // carry no processor token, so nothing else ever flips them: they are billed by
  // an admin re-granting access and the Stripe webhook never fires for a
  // tokenless row. Without this sweep an offline grant would stay
  // status='active' forever, contradicting the admin copy "then reverts to no
  // access." Setting status='cancelled' is already handled by the owner UI
  // (shows "Access ends {date}", offers Resubscribe) and the dashboard tile;
  // re-granting from the admin panel reactivates the row.
  // The discount mirror is cleared in the same write because nothing else can:
  // the Stripe webhook never fires for a tokenless row, and the admin's Discount
  // control is hidden once a row is cancelled — so a stale "25% off" would sit on
  // the partner's billing page next to a Cancelled badge with no way to remove it.
  const { data: expired, error: expiredError } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      status: "cancelled",
      stripe_coupon_id: null,
      discount_label: null,
      discount_percent_off: null,
      discount_amount_off_cents: null,
      discount_ends_at: null,
    })
    .eq("billing_method", OFFLINE_BILLING_METHOD)
    .eq("status", "active")
    .lte("current_period_end", nowIso)
    .select("id")
    .returns<{ id: string }[]>();

  if (expiredError) {
    return NextResponse.json({ ok: false, error: expiredError.message }, { status: 500 });
  }

  const offlineExpired = expired?.length ?? 0;

  return NextResponse.json({ ok: true, offlineExpired });
}

export async function GET(request: Request) {
  return POST(request);
}
