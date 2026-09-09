import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { pruneSignupAttempts } from "@/lib/rateLimit";
import {
  isOrphanAuthDeleteEnabled,
  isVenueSweepDeleteEnabled,
  reconcileOrphanedAuthUsers,
  sweepAbandonedSignupVenues,
} from "@/lib/signupSweep";

/**
 * Partner Self-Serve Signup — Phase 6 housekeeping cron.
 * docs/partner-self-serve-signup-plan.md §4 Phase 6.
 *
 * Three jobs, run daily:
 *
 *   1. Prune `signup_attempts`. The rate limiter never prunes inline (an
 *      un-awaited delete is not reliable in serverless), so that ledger grows
 *      without bound until this runs. Always on — it deletes only expired
 *      rate-limit rows, which nothing reads.
 *   2. Sweep abandoned self-serve venues (hidden, stamped, stale, unpaid). Two
 *      retention tiers since Phase 4 of docs/abandoned-signup-cleanup-plan.md:
 *      a venue that never reached Stripe (`checkout_started_at IS NULL`) is
 *      abandoned after PENDING_SIGNUP_TTL_MINUTES (default 60), one that did
 *      keeps the 7-day window because a card can still be settling. The summary
 *      line below carries the per-tier split — that is what a day of dry-run
 *      logs is read for before SIGNUP_SWEEP_DELETE_ENABLED is set.
 *   3. Reconcile orphaned `auth.users` rows left by a failed signup unwind.
 *
 * Jobs 2 and 3 SHIP LOG-ONLY. Each reports what it would delete until its own
 * env flag is set — `SIGNUP_SWEEP_DELETE_ENABLED` and
 * `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`, neither of which is set anywhere. Deploying
 * this route deletes nothing but expired rate-limit rows.
 *
 * NOT gated on NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED, unlike every /api/signup/*
 * route. Debris outlives a flag: if the wizard is switched on, used, and switched
 * back off, the hidden venues and stale attempts it created still need collecting.
 * The predicates are what scope this job, not the feature flag.
 *
 * `?dryRun=1` forces report-only on both sweeps regardless of the flags, so the
 * job can be exercised by hand against production without deleting anything.
 *
 * CRON IS REGISTERED. `vercel.json` carries
 *     { "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }
 * added 2026-09-07 on Andrew's explicit instruction, so CLAUDE.md's "do not
 * alter vercel.json unasked" boundary was satisfied (and is recorded there so
 * the next review does not re-flag it). Nothing to add — the boundary otherwise
 * still stands.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  const forceDryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const attemptsPruned = await pruneSignupAttempts();

    const venues = await sweepAbandonedSignupVenues(
      forceDryRun ? { dryRun: true } : {}
    );
    const orphans = await reconcileOrphanedAuthUsers(forceDryRun ? { dryRun: true } : {});

    // One greppable summary line per run, so a week of log-only mode can be read
    // back without reconstructing it from the JSON responses.
    console.log(
      `[SignupSweep] run attemptsPruned=${attemptsPruned} ` +
        `venueScanned=${venues.scanned} venueCandidates=${venues.candidates} ` +
        `venueTierA=${venues.tierA} venueTierB=${venues.tierB} ` +
        `tierSplit=${venues.tierSplitActive} ttlMinutes=${venues.ttlMinutes} ` +
        `venuesDeleted=${venues.deleted} venueDryRun=${venues.dryRun} ` +
        `orphanCandidates=${orphans.candidates} orphansDeleted=${orphans.deleted} orphanDryRun=${orphans.dryRun} ` +
        `errors=${venues.errors.length + orphans.errors.length}`
    );
    for (const message of [...venues.errors, ...orphans.errors]) {
      console.error(`[SignupSweep] ${message}`);
    }

    return NextResponse.json({
      ok: true,
      attemptsPruned,
      venues,
      orphans,
      flags: {
        venueDeleteEnabled: isVenueSweepDeleteEnabled(),
        orphanAuthDeleteEnabled: isOrphanAuthDeleteEnabled(),
        forceDryRun,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Signup sweep cron failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
