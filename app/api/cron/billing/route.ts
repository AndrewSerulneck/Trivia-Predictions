import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";
import {
  reconcileLapsedVenues,
  repairMissedVenueReveals,
  type LapsedVenueReconcileResult,
  type VenueRevealRepairResult,
} from "@/lib/venueVisibilitySync";

/**
 * Daily billing cron. Three jobs: expiring lapsed offline/check grants,
 * repairing a missed self-serve venue reveal, and reconciling lapsed self-serve
 * venues (re-hide / restore / report).
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
 *
 * Phase 3 of docs/self-serve-signup-review-fixes-plan.md gave it a SECOND job:
 * venue-visibility reconciliation. The Stripe webhook's `maybeRevealVenue` is a
 * best-effort follower that fires once and swallows its errors by design, so a
 * single transient failure left a paying self-serve partner permanently hidden
 * from every player with no repair path. This cron is that repair path — it is
 * already daily, already `isCronAuthorized`, and already owns the one lapse path
 * that has no webhook at all. Do not fix a visibility bug by making the webhook
 * follower throw; fix it here.
 *
 * Phase 9 (docs/lapsed-venue-rehide-plan.md Phases 3–5) added a THIRD job:
 * `reconcileLapsedVenues` — restore a venue we hid once its billing is live
 * again, re-hide a self-serve venue whose subscription lapsed, and report (never
 * touch) lapsed admin-activated venues. Its restore + re-hide halves are gated
 * on `VENUE_REHIDE_ENABLED` (server-side, no redeploy) and ship LOG-ONLY: with
 * the flag unset they run and log what they would do, writing nothing.
 *
 * `?dryRun=1` forces BOTH reconcilers to report without writing. The offline
 * expiry sweep above is unaffected by it — that job has been live for months and
 * is not what the flag is for. Neither reconciler is ever allowed to fail the
 * cron: the offline-expiry sweep has already committed by the time they run, and
 * a reconciler fault must not make Vercel's retry re-run it.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

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

  // Phase 9 — lapsed-venue reconcile: restore a venue we hid once billing is
  // live again, re-hide a self-serve venue whose subscription lapsed, and report
  // (never touch) lapsed admin-activated venues. Restore + re-hide are gated on
  // VENUE_REHIDE_ENABLED and ship LOG-ONLY (they run and log, writing nothing,
  // until the flag flips). `?dryRun=1` forces the same.
  //
  // Runs BEFORE the reveal repair on purpose: the restore job is the
  // intent-specific path for "a resubscriber's venue comes back" (correct
  // logging, `rehidden_at` cleared, abort-over-cap). The reveal repair that
  // follows is a strict superset for the *paying + hidden + self-serve* case and
  // mops up anything restore did not — an initial reveal the webhook dropped,
  // never `rehidden_at`-stamped. Re-hide (acts only on NOT-live billing) and the
  // reveal repair (acts only on live billing) are disjoint.
  //
  // Never allowed to fail the cron: the offline-expiry sweep above has already
  // committed, and a reconciler fault must not make Vercel's retry re-run it.
  let venueRehide: LapsedVenueReconcileResult | { threw: string };
  try {
    venueRehide = await reconcileLapsedVenues({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueVisibility] rehide-reconcile-threw: ${message}`);
    venueRehide = { threw: message };
  }

  // Reveal-repair for self-serve venues the Stripe webhook missed. Deliberately
  // NOT behind VENUE_REHIDE_ENABLED: it only ever un-hides a venue that is
  // self-serve-created AND currently paying, which is exactly what the webhook
  // was already supposed to do — it is the repair for a bug, not new behavior.
  let venueReveal: VenueRevealRepairResult | { threw: string };
  try {
    venueReveal = await repairMissedVenueReveals({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueVisibility] reveal-repair-threw: ${message}`);
    venueReveal = { threw: message };
  }

  return NextResponse.json({ ok: true, offlineExpired, venueReveal, venueRehide });
}

export async function GET(request: Request) {
  return POST(request);
}
