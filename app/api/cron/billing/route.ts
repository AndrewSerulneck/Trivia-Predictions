import { NextResponse } from "next/server";
import { reconcileStaleBillPriceChanges, type BillPriceChangeReconcileResult } from "@/lib/billingCustomPrice";
import { checkBillingQuantityDrift, type QuantityDriftResult } from "@/lib/billingQuantityDrift";
import { isCronAuthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { reconcileStaleVenueAdditions, type VenueAdditionReconcileResult } from "@/lib/venueAddition";
import {
  applyDueVenueRemovals,
  reconcileStaleVenueChanges,
  type VenueChangeReconcileResult,
  type VenueRemovalApplyResult,
} from "@/lib/venueRemoval";
import { repairAnchorMemberships, type AnchorRepairResult } from "@/lib/venueBilling";
import {
  reconcileLapsedVenues,
  repairMissedVenueReveals,
  type LapsedVenueReconcileResult,
  type VenueRevealRepairResult,
} from "@/lib/venueVisibilitySync";

/**
 * Daily billing cron. Jobs: repairing a missed self-serve venue reveal,
 * reconciling lapsed self-serve venues (re-hide / restore / report), (multi-venue
 * billing Phase 3) settling "Add a venue" attempts stuck past their lease, (Phase 5)
 * settling stuck Remove / Undo changes and taking off venues whose paid month has ended,
 * (Phase 6.1) settling stuck admin price swaps, and (Phase 6.6) bringing a live bill's anchor
 * membership row home from a cancelled bill. It used to
 * have a third — expiring offline/check grants past their paid-through date — which
 * was removed 2026-10-11 (offline accounts never lapse automatically; see below).
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
 * `?dryRun=1` forces BOTH reconcilers to report without writing. Neither
 * reconciler is ever allowed to fail the cron: a fault in one is logged and
 * reported in the response, and the other still runs.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // Offline/check grants are NEVER expired here (Andrew, 2026-10-11: "check-paying accounts
  // never lapse automatically"). This cron used to flip an active offline row to 'cancelled'
  // once its paid-through date passed — that is how Garden State showed "cancelled" on
  // 2026-08-26 while still paying by check. An offline row now stays active until an admin
  // revokes it (Admin → Billing → Revoke, via cancelSubscription in lib/billing.ts); its
  // current_period_end is a record of what the latest check covered, not a deadline.
  // Do not reintroduce an expiry sweep without Andrew.

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
  // Never allowed to fail the cron: a reconciler fault is logged and reported,
  // and the reveal repair below still runs.
  let venueRehide: LapsedVenueReconcileResult | { threw: string };
  try {
    venueRehide = await reconcileLapsedVenues({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueVisibility] rehide-reconcile-threw: ${message}`);
    venueRehide = { threw: message };
  }

  // Multi-venue billing Phase 3 — settle any "Add a venue" stuck past its lease: a 3-D Secure the
  // partner never finished (Stripe voids it within 23 h; we then delete the hidden venue), a
  // request that died mid-charge, an `invoice.paid` webhook that never came. One bounded ledger
  // read; Stripe reads only for rows it finds (normally none). Runs BEFORE the reveal repair so an
  // add it completes is revealed in this same run if its own reveal failed. Not flag-gated: it
  // only finishes adds already under way. Never allowed to fail the cron.
  let venueAdditions: VenueAdditionReconcileResult | { threw: string };
  try {
    venueAdditions = await reconcileStaleVenueAdditions({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueAddition] reconcile-threw: ${message}`);
    venueAdditions = { threw: message };
  }

  // Multi-venue billing Phase 5 — (a) settle any Remove / Undo stuck past its lease (from Stripe's
  // real quantity), then (b) take off every venue whose paid period has ended since its partner
  // pressed Remove: hide it from the join list and stamp `removed_at`. Both are one bounded read
  // (normally zero rows); (a) costs one Stripe read per stuck row. Not flag-gated: they only finish
  // what a partner already started. Never allowed to fail the cron. Runs BEFORE the reveal repair,
  // which only reveals venues on a live bill — a removed venue is on none.
  let venueChanges: VenueChangeReconcileResult | { threw: string };
  try {
    venueChanges = await reconcileStaleVenueChanges({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueRemoval] reconcile-threw: ${message}`);
    venueChanges = { threw: message };
  }
  // Multi-venue billing Phase 6.1 — settle any admin price swap stuck `pending` past its lease (the
  // request died, or Stripe's answer was ambiguous): Stripe's item on the target Price → done,
  // otherwise → failed. Without it a crash mid-swap would keep the bill locked out of adds and
  // removes. One bounded read (normally zero rows); one Stripe read per stuck row. Never fails the cron.
  let priceChanges: BillPriceChangeReconcileResult | { threw: string };
  try {
    priceChanges = await reconcileStaleBillPriceChanges({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[CustomPrice] reconcile-threw: ${message}`);
    priceChanges = { threw: message };
  }
  let venueRemovals: VenueRemovalApplyResult | { threw: string };
  try {
    venueRemovals = await applyDueVenueRemovals({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueRemoval] apply-threw: ${message}`);
    venueRemovals = { threw: message };
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

  // Multi-venue billing Phase 6.6 — repair: a live bill whose anchor venue's membership row is on
  // another (dead) bill gets it back (`bringAnchorHome`; the webhook and Grant offline try first).
  // Two bounded reads; normally nothing to move. Runs before the drift check so the check sees it.
  let anchorRepair: AnchorRepairResult | { threw: string };
  try {
    anchorRepair = await repairAnchorMemberships({ dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VenueBilling] anchor-repair-threw: ${message}`);
    anchorRepair = { threw: message };
  }

  // Multi-venue billing Phase 6 — REPORT-ONLY drift check: each live card bill's Stripe quantity vs
  // the venues we bill on it (`[MultiVenueBilling] quantity-drift`). Never charges, credits or
  // writes; an admin fixes drift. Runs LAST so it sees what the settle/removal jobs above just did.
  // Three bounded reads + one Stripe list call (per 100 live subscriptions). Never fails the cron.
  let quantityDrift: QuantityDriftResult | { threw: string };
  try {
    quantityDrift = await checkBillingQuantityDrift();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MultiVenueBilling] drift-check-threw: ${message}`);
    quantityDrift = { threw: message };
  }

  return NextResponse.json({
    ok: true,
    venueReveal,
    venueRehide,
    venueAdditions,
    venueChanges,
    priceChanges,
    venueRemovals,
    anchorRepair,
    quantityDrift,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
