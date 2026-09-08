import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSelfServeVenueRow } from "@/lib/venueClaim";
import {
  isBillingCancelled,
  isBillingLive,
  isVenueRehideEnabled,
  shouldRehideVenue,
  shouldRestoreVenue,
  shouldRevealVenue,
  type VisibilityBillingRow,
  type VisibilityVenueRow,
} from "@/lib/venueVisibility";

// Venue visibility reconciler — the daily repair / reconcile path.
// docs/self-serve-signup-review-fixes-plan.md §3 Phase 3 (reveal repair) and
// docs/lapsed-venue-rehide-plan.md Phases 3–5 (re-hide / restore / report).
//
// The Stripe webhook's followers (`maybeRevealVenue`, `maybeRehideVenue`) are
// best-effort BY DESIGN: each fires on one event, swallows its error, and never
// throws, because throwing would make Stripe retry the whole event and re-drive
// billing sync over a cosmetic failure. That design is sound and must not be
// changed. What it lacked was a second chance — and one lapse path
// (an offline grant expiring) has no webhook at all. This module is that second
// chance. It runs daily from /api/cron/billing, which is already daily, already
// `isCronAuthorized`, and already owns the offline-grant expiry that happens two
// statements earlier in the same handler. It is NOT a public signup surface, so
// it takes no rateLimit() call.
//
// FOUR jobs, run from two entry points:
//   - repairMissedVenueReveals()  — un-hide a paying self-serve venue the
//     webhook forgot. NOT flag-gated: it only ever un-hides a venue that is
//     self-serve-created AND currently paying, which is exactly what the webhook
//     was already supposed to have done. It is the repair for a bug.
//   - reconcileLapsedVenues()     — restore, then re-hide, then report.
//     The re-hide and restore jobs are gated on VENUE_REHIDE_ENABLED and ship
//     LOG-ONLY (they run in dry-run mode until the flag flips). The report job
//     always runs and never writes.
//
// Every un-hide in this module (reveal repair AND restore) writes
// `rehidden_at: null` in the same statement, exactly as `maybeRevealVenue`
// does. Rule with no exceptions: whatever un-hides a venue clears the stamp, or
// a visible venue is left marked "we hid this" and the reconciler / admin badge
// read stale provenance.

/**
 * How many candidate venues one scan will look at. The candidate sets here
 * ("hidden + stamped", "visible + stamped", "hidden + rehidden_at") all grow
 * with the business, so unlike `sweepAbandonedSignupVenues` a large SCAN is
 * NORMAL and must not abort the run — it truncates, reports, and drains on
 * successive runs (the scans are ordered oldest-first). The abort-over-cap rail
 * is on the ACTIONABLE set instead (see REHIDE_MAX_PER_RUN / RESTORE_MAX_PER_RUN).
 */
export const VISIBILITY_SCAN_LIMIT = 500;

/**
 * Safety rail on the reveal-repair write half. Repairing a webhook miss is
 * inherently a handful of rows; dozens at once means something systemic (a
 * webhook outage, a bad deploy) and the extra rows are better looked at than
 * acted on. Anything over the cap is DEFERRED, not dropped — a revealed venue
 * leaves the candidate set, so successive runs drain it.
 */
export const REVEAL_MAX_PER_RUN = 25;

/**
 * Abort-over-cap rail on the re-hide write half. A set this size is a
 * billing-sync fault, not that many real cancellations — hiding is destructive
 * enough that the run does NOTHING and logs loudly rather than acting on an
 * unexpected pile. (Contrast the reveal repair, which defers: un-hiding a
 * paying venue is always safe.)
 */
export const REHIDE_MAX_PER_RUN = 25;

/** Same rail on restore, for symmetry and the same "something is wrong" signal. */
export const RESTORE_MAX_PER_RUN = 25;

/** Bound on the read-only lapsed-admin report's billing scan. */
export const LAPSED_ADMIN_REPORT_LIMIT = 1000;

export type VenueRevealRepairResult = {
  dryRun: boolean;
  /** Hidden, self-serve-stamped venues examined. */
  scanned: number;
  /** True when more than VISIBILITY_SCAN_LIMIT matched; the rest wait for tomorrow. */
  scanTruncated: boolean;
  /** Of those, the ones `shouldRevealVenue` holds for. */
  candidates: number;
  revealed: number;
  /** The venue ids revealed (or, in a dry run, that would have been). */
  venueIds: string[];
  /** Candidates left for the next run because of REVEAL_MAX_PER_RUN. */
  deferred: number;
  errors: string[];
};

/** Per-job outcome for the re-hide and restore halves of reconcileLapsedVenues. */
export type LapsedJobOutcome = {
  /** Candidate venues the scan returned (post scan-limit truncation). */
  scanned: number;
  /** True when the scan hit VISIBILITY_SCAN_LIMIT; the rest wait for the next run. */
  scanTruncated: boolean;
  /** Of those, the ones the job's predicate holds for. */
  candidates: number;
  /** Rows actually changed this run (0 in a dry run or when aborted over cap). */
  changed: number;
  /** Venue ids changed, or (dry run) that would have been. */
  venueIds: string[];
  /** True when `candidates` blew past the per-run cap and the job wrote nothing. */
  abortedOverCap: boolean;
  errors: string[];
};

export type LapsedAdminReport = {
  /** billing_subscriptions rows examined. */
  scanned: number;
  scanTruncated: boolean;
  /** Admin-activated (stamp-null), still-visible venues whose billing is cancelled. */
  lapsed: number;
  venueIds: string[];
  errors: string[];
};

export type LapsedVenueReconcileResult = {
  /** `?dryRun=1` on the cron route — forces report-only regardless of the flag. */
  dryRun: boolean;
  /** VENUE_REHIDE_ENABLED. When false, restore + re-hide run in dry-run mode. */
  enabled: boolean;
  /** True iff the restore + re-hide jobs actually wrote (`enabled && !dryRun`). */
  wrote: boolean;
  restore: LapsedJobOutcome;
  rehide: LapsedJobOutcome;
  report: LapsedAdminReport;
  /** Setup-level failures only (e.g. supabase unconfigured); job errors live per-job. */
  errors: string[];
};

type CandidateVenueRow = Pick<
  VisibilityVenueRow,
  "id" | "hidden" | "latitude" | "longitude" | "self_serve_created_at" | "rehidden_at"
>;

type BillingRow = VisibilityBillingRow & { venue_id: string };

const emptyOutcome = (): LapsedJobOutcome => ({
  scanned: 0,
  scanTruncated: false,
  candidates: 0,
  changed: 0,
  venueIds: [],
  abortedOverCap: false,
  errors: [],
});

/**
 * Read `billing_subscriptions` for a set of venue ids into a `venue_id → row`
 * map, resolving a duplicate pair to the LIVE row rather than to whichever came
 * back first. Returns `null` on a read error — every caller fails CLOSED on
 * that, because without this answer a payer and a lapse look identical.
 *
 * Shared by the reveal-repair, re-hide and restore jobs precisely so the "pick
 * the live one" tie-break is written once (§2's root cause is a rule written
 * twice).
 */
async function loadBillingByVenue(
  venueIds: string[],
  errors: string[]
): Promise<Map<string, BillingRow> | null> {
  if (!supabaseAdmin) {
    errors.push("supabase-admin-unconfigured");
    return null;
  }

  const query = await supabaseAdmin
    .from("billing_subscriptions")
    .select("venue_id, status, stripe_subscription_id, billing_method")
    .in("venue_id", venueIds)
    .returns<BillingRow[]>();

  if (query.error) {
    errors.push(`billing-read-failed: ${query.error.message}`);
    return null;
  }

  const billingByVenue = new Map<string, BillingRow>();
  for (const row of query.data ?? []) {
    const existing = billingByVenue.get(row.venue_id);
    if (!existing || isBillingLive(row)) billingByVenue.set(row.venue_id, row);
  }
  return billingByVenue;
}

/**
 * Reveal every self-serve venue that is paying and still hidden.
 *
 * Fails CLOSED at every step: if the venue read or the billing read errors, the
 * run reveals nothing and reports the error. Revealing a venue we cannot prove
 * is paying is the one mistake worth more than another day of invisibility.
 *
 * Idempotent twice over: the UPDATE re-asserts `hidden = true` in its predicate
 * (so a concurrent webhook reveal is a no-op here, not a double write), and a
 * revealed venue no longer matches the candidate scan.
 *
 * The write clears `rehidden_at` — a resubscribing partner whose venue we hid
 * arrives here (via the webhook restore path OR this repair) and must not be
 * left visible-but-still-stamped. See the module header.
 */
export async function repairMissedVenueReveals(
  options: { dryRun?: boolean } = {}
): Promise<VenueRevealRepairResult> {
  const dryRun = options.dryRun ?? false;
  const result: VenueRevealRepairResult = {
    dryRun,
    scanned: 0,
    scanTruncated: false,
    candidates: 0,
    revealed: 0,
    venueIds: [],
    deferred: 0,
    errors: [],
  };

  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  // Hidden + self-serve-stamped. The stamp clause is load-bearing: without it
  // this scan picks up the two Category Blitz global rooms (hidden, stamp-null)
  // and every admin-hidden venue.
  const venueQuery = await supabaseAdmin
    .from("venues")
    .select("id, hidden, latitude, longitude, self_serve_created_at, rehidden_at")
    .eq("hidden", true)
    .not("self_serve_created_at", "is", null)
    .order("self_serve_created_at", { ascending: true })
    .limit(VISIBILITY_SCAN_LIMIT + 1)
    .returns<CandidateVenueRow[]>();

  if (venueQuery.error) {
    result.errors.push(`venues-read-failed: ${venueQuery.error.message}`);
    return result;
  }

  let venues = venueQuery.data ?? [];
  if (venues.length > VISIBILITY_SCAN_LIMIT) {
    result.scanTruncated = true;
    venues = venues.slice(0, VISIBILITY_SCAN_LIMIT);
  }
  result.scanned = venues.length;
  if (venues.length === 0) return result;

  const billingByVenue = await loadBillingByVenue(
    venues.map((venue) => venue.id),
    result.errors
  );
  if (billingByVenue === null) return result; // fail closed — error already pushed

  const candidates = venues.filter((venue) => shouldRevealVenue(venue, billingByVenue.get(venue.id)));
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const actionable = candidates.slice(0, REVEAL_MAX_PER_RUN);
  result.deferred = candidates.length - actionable.length;
  if (result.deferred > 0) {
    console.warn(
      `[VenueVisibility] reveal-repair over per-run cap: ${candidates.length} candidates, ` +
        `${REVEAL_MAX_PER_RUN} this run, ${result.deferred} deferred to the next run`
    );
  }

  for (const venue of actionable) {
    if (dryRun) {
      result.venueIds.push(venue.id);
      console.log(`[VenueVisibility] reveal-repair DRY RUN would reveal venue=${venue.id}`);
      continue;
    }

    const update = await supabaseAdmin
      .from("venues")
      .update({ hidden: false, rehidden_at: null })
      .eq("id", venue.id)
      .eq("hidden", true)
      .select("id")
      .returns<{ id: string }[]>();

    if (update.error) {
      result.errors.push(`venue-reveal-failed venue=${venue.id}: ${update.error.message}`);
      continue;
    }
    if ((update.data ?? []).length === 0) {
      // The webhook won the race between our read and this write. Nothing wrong.
      continue;
    }

    result.revealed += 1;
    result.venueIds.push(venue.id);
    // Loud on purpose: every line here is a reveal the Stripe webhook should have
    // done and did not. A steady trickle is the signal that the follower is
    // failing, not that the reconciler is working.
    console.warn(
      `[VenueVisibility] reveal-repair revealed venue=${venue.id} — the Stripe webhook's ` +
        `maybeRevealVenue missed this paying self-serve venue`
    );
  }

  return result;
}

/**
 * Restore every venue WE hid whose billing has gone live again.
 *
 * `shouldRestoreVenue` carries no provenance or placeholder clause — "we only
 * restore what we hid" (`rehidden_at !== null`) stands in for both, and that is
 * only safe because every WRITER of `rehidden_at` refused a stamp-null / (0,0)
 * row. This scan and the UPDATE re-assert the stamp guard and the placeholder
 * guard anyway. Do NOT "simplify" by trusting `rehidden_at` alone.
 *
 * The write clears `rehidden_at` in the same statement.
 */
async function runRestoreJob(write: boolean): Promise<LapsedJobOutcome> {
  const out = emptyOutcome();
  if (!supabaseAdmin) {
    out.errors.push("supabase-admin-unconfigured");
    return out;
  }

  const scan = await supabaseAdmin
    .from("venues")
    .select("id, hidden, latitude, longitude, self_serve_created_at, rehidden_at")
    .eq("hidden", true)
    .not("rehidden_at", "is", null)
    .not("self_serve_created_at", "is", null)
    .or("latitude.neq.0,longitude.neq.0")
    .order("rehidden_at", { ascending: true })
    .limit(VISIBILITY_SCAN_LIMIT + 1)
    .returns<CandidateVenueRow[]>();

  if (scan.error) {
    out.errors.push(`venues-read-failed: ${scan.error.message}`);
    return out;
  }

  let venues = scan.data ?? [];
  if (venues.length > VISIBILITY_SCAN_LIMIT) {
    out.scanTruncated = true;
    venues = venues.slice(0, VISIBILITY_SCAN_LIMIT);
  }
  out.scanned = venues.length;
  if (venues.length === 0) return out;

  const billingByVenue = await loadBillingByVenue(
    venues.map((venue) => venue.id),
    out.errors
  );
  if (billingByVenue === null) return out; // fail closed

  const candidates = venues.filter((venue) => shouldRestoreVenue(venue, billingByVenue.get(venue.id)));
  out.candidates = candidates.length;
  if (candidates.length === 0) return out;

  if (candidates.length > RESTORE_MAX_PER_RUN) {
    out.abortedOverCap = true;
    out.errors.push(
      `restore-candidates-over-cap: ${candidates.length} exceeds ${RESTORE_MAX_PER_RUN}; nothing restored`
    );
    console.error(
      `[VenueVisibility] restore over per-run cap: ${candidates.length} candidates, cap ${RESTORE_MAX_PER_RUN}. ` +
        "Refusing to act — investigate the billing sync before raising the cap."
    );
    return out;
  }

  for (const venue of candidates) {
    if (!write) {
      out.venueIds.push(venue.id);
      console.log(`[VenueVisibility] restore DRY RUN would restore venue=${venue.id} (billing live again)`);
      continue;
    }

    const update = await supabaseAdmin
      .from("venues")
      .update({ hidden: false, rehidden_at: null })
      .eq("id", venue.id)
      .eq("hidden", true)
      .not("self_serve_created_at", "is", null)
      .or("latitude.neq.0,longitude.neq.0")
      .select("id")
      .returns<{ id: string }[]>();

    if (update.error) {
      out.errors.push(`restore-failed venue=${venue.id}: ${update.error.message}`);
      continue;
    }
    if ((update.data ?? []).length === 0) continue; // webhook or admin won the race

    out.changed += 1;
    out.venueIds.push(venue.id);
    console.log(`[VenueVisibility] restored venue=${venue.id} — subscription is live again`);
  }

  return out;
}

/**
 * Re-hide every visible self-serve venue whose subscription lapsed.
 *
 * The venue half is a scan + `shouldRehideVenue`; the UPDATE re-asserts the same
 * guards as the webhook follower (`hidden = false`, the stamp guard, the (0,0)
 * clause) so it is idempotent against a webhook that wins the race, and so it
 * can never stamp `rehidden_at` on a placeholder — which `shouldRestoreVenue`
 * would then happily publish.
 *
 * Aborts over cap (see REHIDE_MAX_PER_RUN): a large lapsed set is a billing
 * fault, not real churn.
 */
async function runRehideJob(write: boolean): Promise<LapsedJobOutcome> {
  const out = emptyOutcome();
  if (!supabaseAdmin) {
    out.errors.push("supabase-admin-unconfigured");
    return out;
  }

  const scan = await supabaseAdmin
    .from("venues")
    .select("id, hidden, latitude, longitude, self_serve_created_at, rehidden_at")
    .eq("hidden", false)
    .not("self_serve_created_at", "is", null)
    .or("latitude.neq.0,longitude.neq.0")
    .order("self_serve_created_at", { ascending: true })
    .limit(VISIBILITY_SCAN_LIMIT + 1)
    .returns<CandidateVenueRow[]>();

  if (scan.error) {
    out.errors.push(`venues-read-failed: ${scan.error.message}`);
    return out;
  }

  let venues = scan.data ?? [];
  if (venues.length > VISIBILITY_SCAN_LIMIT) {
    out.scanTruncated = true;
    venues = venues.slice(0, VISIBILITY_SCAN_LIMIT);
  }
  out.scanned = venues.length;
  if (venues.length === 0) return out;

  const billingByVenue = await loadBillingByVenue(
    venues.map((venue) => venue.id),
    out.errors
  );
  if (billingByVenue === null) return out; // fail closed

  const candidates = venues.filter((venue) => shouldRehideVenue(venue, billingByVenue.get(venue.id)));
  out.candidates = candidates.length;
  if (candidates.length === 0) return out;

  if (candidates.length > REHIDE_MAX_PER_RUN) {
    out.abortedOverCap = true;
    out.errors.push(
      `rehide-candidates-over-cap: ${candidates.length} lapsed self-serve venues exceeds ${REHIDE_MAX_PER_RUN}; nothing hidden`
    );
    console.error(
      `[VenueVisibility] rehide over per-run cap: ${candidates.length} candidates, cap ${REHIDE_MAX_PER_RUN}. ` +
        "Refusing to hide — a set this size is a billing-sync fault, not that many real cancellations. " +
        "Investigate before raising the cap."
    );
    return out;
  }

  for (const venue of candidates) {
    if (!write) {
      out.venueIds.push(venue.id);
      console.log(`[VenueVisibility] rehide DRY RUN would hide venue=${venue.id} (subscription lapsed)`);
      continue;
    }

    const update = await supabaseAdmin
      .from("venues")
      .update({ hidden: true, rehidden_at: new Date().toISOString() })
      .eq("id", venue.id)
      .eq("hidden", false)
      .not("self_serve_created_at", "is", null)
      .or("latitude.neq.0,longitude.neq.0")
      .select("id")
      .returns<{ id: string }[]>();

    if (update.error) {
      out.errors.push(`rehide-failed venue=${venue.id}: ${update.error.message}`);
      continue;
    }
    if ((update.data ?? []).length === 0) continue; // webhook or admin won the race

    out.changed += 1;
    out.venueIds.push(venue.id);
    console.log(`[VenueVisibility] re-hid lapsed self-serve venue=${venue.id}`);
  }

  return out;
}

/**
 * Count and log lapsed ADMIN-ACTIVATED venues that are still visible — and do
 * nothing else. Admin-managed venues are ops-managed; an automatic hide on a
 * venue nobody promised this behavior for has a blast radius the self-serve half
 * does not. If this report is consistently boring for a month, widening the
 * re-hide job to cover them is a one-clause change behind its own flag
 * (docs/lapsed-venue-rehide-plan.md §4 Phase 3).
 *
 * Driven off `billing_subscriptions` (one small row per venue that ever
 * subscribed), not off `venues` (every normal venue is stamp-null). A row our
 * mirror calls `cancelled` (`isBillingCancelled`) is the honest "money stopped"
 * signal — it folds every finished Stripe status and every expired offline
 * grant, and unlike `!isBillingLive` it does not fire for an *active* offline
 * grant.
 */
export async function reportLapsedAdminVenues(): Promise<LapsedAdminReport> {
  const out: LapsedAdminReport = {
    scanned: 0,
    scanTruncated: false,
    lapsed: 0,
    venueIds: [],
    errors: [],
  };
  if (!supabaseAdmin) {
    out.errors.push("supabase-admin-unconfigured");
    return out;
  }

  const billing = await supabaseAdmin
    .from("billing_subscriptions")
    .select("venue_id, status, stripe_subscription_id, billing_method")
    .limit(LAPSED_ADMIN_REPORT_LIMIT + 1)
    .returns<BillingRow[]>();

  if (billing.error) {
    out.errors.push(`billing-read-failed: ${billing.error.message}`);
    return out;
  }

  let rows = billing.data ?? [];
  if (rows.length > LAPSED_ADMIN_REPORT_LIMIT) {
    out.scanTruncated = true;
    rows = rows.slice(0, LAPSED_ADMIN_REPORT_LIMIT);
  }
  out.scanned = rows.length;

  const lapsedVenueIds = Array.from(
    new Set(rows.filter((row) => isBillingCancelled(row)).map((row) => row.venue_id))
  );
  if (lapsedVenueIds.length === 0) return out;

  const venues = await supabaseAdmin
    .from("venues")
    .select("id, hidden, self_serve_created_at")
    .in("id", lapsedVenueIds)
    .returns<Array<Pick<VisibilityVenueRow, "id" | "hidden" | "self_serve_created_at">>>();

  if (venues.error) {
    out.errors.push(`venues-read-failed: ${venues.error.message}`);
    return out;
  }

  for (const venue of venues.data ?? []) {
    if (isSelfServeVenueRow(venue)) continue; // the re-hide job's, not the report's
    if (venue.hidden === true) continue; // already hidden — nothing to report
    out.lapsed += 1;
    out.venueIds.push(venue.id);
    console.log(
      `[VenueVisibility] lapsed admin-activated venue=${venue.id} still visible — reported only, no automatic hide ` +
        "(docs/lapsed-venue-rehide-plan.md §4 Phase 3)"
    );
  }

  return out;
}

/**
 * The lapsed-venue reconciler: restore, then re-hide, then report.
 *
 * Restore runs before re-hide so a single run's log is coherent (a venue can
 * never match both predicates — one wants `hidden = true`, the other
 * `hidden = false` — but a fixed order still reads better). The report is
 * read-only and last.
 *
 * `dryRun` (the cron route's `?dryRun=1`) forces report-only for restore + hide.
 * VENUE_REHIDE_ENABLED off ALSO forces report-only — the jobs run, log what they
 * would do, and write nothing. Ship log-only first; read a week of
 * `[VenueVisibility]` lines before setting the flag.
 */
export async function reconcileLapsedVenues(
  options: { dryRun?: boolean } = {}
): Promise<LapsedVenueReconcileResult> {
  const dryRun = options.dryRun ?? false;
  const enabled = isVenueRehideEnabled();
  const wrote = enabled && !dryRun;

  const result: LapsedVenueReconcileResult = {
    dryRun,
    enabled,
    wrote,
    restore: emptyOutcome(),
    rehide: emptyOutcome(),
    report: { scanned: 0, scanTruncated: false, lapsed: 0, venueIds: [], errors: [] },
    errors: [],
  };

  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  result.restore = await runRestoreJob(wrote);
  result.rehide = await runRehideJob(wrote);
  result.report = await reportLapsedAdminVenues();

  return result;
}
