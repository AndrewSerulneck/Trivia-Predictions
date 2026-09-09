import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Partner Self-Serve Signup — Phase 6 sweep.
// docs/partner-self-serve-signup-plan.md §4 Phase 6.
//
// Two jobs, both driven by /api/cron/signup-sweep, both DISABLED BY DEFAULT:
//
//   1. sweepAbandonedSignupVenues()   — delete the hidden, unpaid venue rows a
//      partner leaves behind when they abandon Stripe Checkout, plus the owner
//      row and auth user created alongside them.
//   2. reconcileOrphanedAuthUsers()   — delete an `auth.users` row that POST
//      /api/owner/signup created and then failed to unwind (Phase 5a §1).
//
// Both ship LOG-ONLY. Each has its own env flag and neither is set anywhere, so
// a deploy of this file changes nothing until Andrew opts in — deliberately two
// flags and not one, because job 2 touches a table shared with players and job 1
// does not.

// --- Flags -------------------------------------------------------------------

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Job 1 actually deletes. Off (default) = report what it would have deleted. */
export const isVenueSweepDeleteEnabled = (): boolean =>
  truthy(process.env.SIGNUP_SWEEP_DELETE_ENABLED);

/**
 * Job 2 actually deletes. Off (default) = report only. Separate from the flag
 * above on purpose: `auth.users` is shared with SIX player tables (see
 * AUTH_USER_FK_CONSUMERS), so this one must be opted into on its own evidence,
 * not carried in on the venue sweep's.
 */
export const isOrphanAuthDeleteEnabled = (): boolean =>
  truthy(process.env.SIGNUP_SWEEP_AUTH_DELETE_ENABLED);

// --- Constants ---------------------------------------------------------------

/**
 * TIER B — the partner reached Stripe (`venues.checkout_started_at` is stamped).
 *
 * A hidden, unpaid, STAMPED self-serve venue older than this is abandoned. DO NOT
 * SHORTEN IT (docs/abandoned-signup-cleanup-plan.md Phase 4): a card can settle
 * late, 3-D Secure can take a while, and a bank can hold a charge overnight. The
 * money can still arrive days after the tab was closed, and the webhook that
 * receives it needs the venue to still exist.
 *
 * This was the ONLY tier before Phase 4, which is why the fallback path below —
 * the one taken while `checkout_started_at` is not deployed yet — is exactly this
 * window applied to everything.
 */
export const SWEEP_ABANDON_AFTER_DAYS = 7;

/**
 * TIER A — the partner never reached Stripe (`checkout_started_at IS NULL`).
 *
 * Nothing can settle late for a venue that never opened a Checkout Session:
 * Stripe has no Subscription and no PaymentIntent for it, so there is no money in
 * flight and no webhook that could arrive. One hour is generous for "they are
 * still reading /owner/billing/setup", and after Phase 2 nothing user-facing
 * depends on this row surviving — a partner who comes back retries from scratch
 * and their own abandoned signup is superseded, not collided with.
 *
 * The safety net for the partner who IS still on that page at minute 61 is Phase
 * 3.1: `requireOwnerAuth` answers `401 { code: "no_venue" }` and
 * /owner/billing/setup routes them into a fresh signup rather than a login page
 * for an account that no longer exists. If that ever regresses, this tier becomes
 * a dead end and the TTL must go back up until it is fixed.
 */
export const PENDING_SIGNUP_TTL_MINUTES_DEFAULT = 60;

/**
 * Floor on the env override. `PENDING_SIGNUP_TTL_MINUTES=1` would reap a venue
 * while its partner is still reading the page that pays for it; nothing about
 * this job is urgent enough to be worth that, so a too-small value is clamped and
 * logged rather than honoured.
 */
export const PENDING_SIGNUP_TTL_MINUTES_FLOOR = 15;

/**
 * Tier A's window, in minutes. Server-side env var (no `NEXT_PUBLIC_`), so it
 * moves without a redeploy — same convention as SIGNUP_SWEEP_DELETE_ENABLED.
 * Unset, unparseable, or non-positive all fall back to the default; anything
 * below the floor is clamped up to it.
 */
export const pendingSignupTtlMinutes = (): number => {
  const raw = (process.env.PENDING_SIGNUP_TTL_MINUTES ?? "").trim();
  if (!raw) return PENDING_SIGNUP_TTL_MINUTES_DEFAULT;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[SignupSweep] ttl-invalid value=${raw} — using default ${PENDING_SIGNUP_TTL_MINUTES_DEFAULT}m`
    );
    return PENDING_SIGNUP_TTL_MINUTES_DEFAULT;
  }
  if (parsed < PENDING_SIGNUP_TTL_MINUTES_FLOOR) {
    console.warn(
      `[SignupSweep] ttl-below-floor value=${parsed} floor=${PENDING_SIGNUP_TTL_MINUTES_FLOOR}m — clamped`
    );
    return PENDING_SIGNUP_TTL_MINUTES_FLOOR;
  }
  return parsed;
};

/** Safety rail on job 1. More candidates than this means something is wrong. */
export const SWEEP_MAX_VENUES_PER_RUN = 50;

/** An auth user younger than this may still be mid-signup. */
export const ORPHAN_MIN_AGE_HOURS = 24;

/**
 * Circuit breaker on job 2. If more than this many orphan candidates appear in
 * one run, the job deletes NOTHING and logs loudly instead. The whole premise of
 * the job is that owner-signup debris is rare — a large candidate set means some
 * code path we do not know about is minting emailed auth users, and mass-deleting
 * them would be destructive. Fail loud, not clever.
 */
export const ORPHAN_MAX_DELETES_PER_RUN = 25;

/** listUsers page size, and a hard cap so this can never become an unbounded scan. */
const AUTH_PAGE_SIZE = 200;
const AUTH_MAX_PAGES = 100;

/** Chunk size for the `.in(...)` reference checks. */
const IN_CHUNK = 100;

/**
 * Every table carrying a foreign key to `auth.users(id)`, and its on-delete rule.
 * `tests/lib.auth-users-fk-guard.test.ts` is the SOURCE OF TRUTH for this set and
 * fails if an eighth consumer appears; this list must be updated in the same
 * commit as that test.
 *
 * Six of the seven are PLAYER tables. Four are `set null` — deleting the auth row
 * does not error, it silently detaches a player from their identity — and two are
 * `cascade`, which deletes that player's Category Blitz gameplay outright. That
 * is why `authUserIsUnreferenced` checks ALL of them and not just `venue_owners`.
 */
export const AUTH_USER_FK_CONSUMERS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "venue_owners", column: "auth_id" },
  { table: "accounts", column: "auth_id" },
  { table: "users", column: "auth_id" },
  { table: "username_change_attempts", column: "requester_auth_id" },
  { table: "username_change_audit", column: "changed_by_auth_id" },
  { table: "category_blitz_submissions", column: "auth_id" },
  { table: "category_blitz_session_participants", column: "auth_id" },
];

/**
 * Reserved, non-routable domains (RFC 2606 / RFC 6761). An owner signup email is
 * a real deliverable address, so an auth user on one of these is a fixture or a
 * backfill artifact and is not ours to reap. Production carries three today
 * (`sim-cb-legacy-*@example.invalid` and two `backfill_*@tp-auth-backfill.internal`,
 * verified 2026-09-07) and every one of them would otherwise be a candidate.
 */
const RESERVED_EMAIL_DOMAIN_SUFFIXES = [".invalid", ".internal", ".test", ".example", ".localhost"];

const hasReservedEmailDomain = (email: string): boolean => {
  const lower = email.trim().toLowerCase();
  return RESERVED_EMAIL_DOMAIN_SUFFIXES.some((suffix) => lower.endsWith(suffix));
};

// --- Result shapes -----------------------------------------------------------

/**
 * Which retention tier a candidate was judged under — the honest question *did
 * this partner ever reach Stripe?*, answered by `venues.checkout_started_at`.
 *
 * `stamp-column-missing` is not a tier; it is the fallback state before the
 * column is deployed, in which every row is judged under Tier B's 7 days (i.e.
 * exactly the pre-Phase-4 behaviour).
 */
export type SweepTier = "never-started-checkout" | "reached-checkout" | "stamp-column-missing";

export type SweptVenue = {
  venueId: string;
  venueName: string;
  /** The tier whose window this venue was found abandoned under. */
  tier: SweepTier;
  /**
   * Owners deleted alongside the venue (live run) or that WOULD be deleted (dry
   * run). The dry-run projection is real, not a placeholder — it comes from the
   * same `classifyOwnerForSweep` the live run acts on (Finding #8).
   */
  ownerIdsDeleted: string[];
  /** Auth users deleted, or (dry run) that would be deleted — same source. */
  authUserIdsDeleted: string[];
  /**
   * Owners left in place (live run) or that would be kept (dry run) because they
   * still hold another venue or a subscription of their own.
   */
  ownerIdsKept: string[];
};

export type VenueSweepResult = {
  dryRun: boolean;
  candidates: number;
  deleted: number;
  venues: SweptVenue[];
  errors: string[];
  /** True when the candidate set blew past SWEEP_MAX_VENUES_PER_RUN and nothing ran. */
  abortedOverCap: boolean;
  /**
   * Rows the candidate scan fetched, BEFORE the per-tier cutoffs were applied.
   * `scanned - candidates` is mostly Tier B venues that reached Stripe recently
   * and are correctly being left alone — which is the number to watch when
   * reading a day of dry-run lines.
   */
  scanned: number;
  /** Eligible candidates that never reached Stripe (Tier A, `PENDING_SIGNUP_TTL_MINUTES`). */
  tierA: number;
  /** Eligible candidates that did reach Stripe (Tier B, SWEEP_ABANDON_AFTER_DAYS). */
  tierB: number;
  /**
   * False when `venues.checkout_started_at` is not deployed yet: the scan fell
   * back to the single pre-Phase-4 7-day window and `tierA`/`tierB` are both 0.
   * Watch for this staying false after the migration ships — it means the sweep
   * is running a week behind what the plan intends, silently.
   */
  tierSplitActive: boolean;
  /** Tier A's window as actually resolved this run (env override included). */
  ttlMinutes: number;
};

export type OrphanSweepResult = {
  dryRun: boolean;
  authUsersScanned: boolean;
  /** Emailed, aged, non-reserved auth users unreferenced by all seven tables. */
  candidates: number;
  deleted: number;
  candidateEmails: string[];
  errors: string[];
  abortedOverCap: boolean;
};

// --- Job 1: abandoned self-serve venues --------------------------------------

/**
 * `checkout_started_at` is optional on the TYPE, not merely nullable, because the
 * fallback scan does not select it at all. `undefined` (column absent from the
 * projection) and `null` (column present, never stamped) are deliberately treated
 * the same by `tierOf` — but only the tiered scan's rows are ever tiered, so an
 * absent column can never be mistaken for "never reached Stripe".
 */
type CandidateVenueRow = {
  id: string;
  name: string;
  self_serve_created_at: string | null;
  checkout_started_at?: string | null;
};

const CANDIDATE_COLUMNS_TIERED = "id, name, self_serve_created_at, checkout_started_at";
const CANDIDATE_COLUMNS_LEGACY = "id, name, self_serve_created_at";

/**
 * Is this read error "the `checkout_started_at` column does not exist yet"?
 *
 * The column arrives in its own migration, applied by hand to the LINKED
 * PRODUCTION database, so there is a window — however short — in which this code
 * is deployed and the column is not. PostgREST answers a select on an unknown
 * column with SQLSTATE 42703; a stale schema cache answers PGRST204 with the
 * column name in the message. Both mean the same thing here.
 *
 * Narrow on purpose: it must match ONLY this column. Any other read failure is a
 * real failure and must keep failing closed — silently degrading a timeout into
 * "run the legacy scan" is how a broken sweep looks healthy for a week.
 */
const isMissingCheckoutStampColumn = (error: { message?: string; code?: string }): boolean => {
  const code = String(error.code ?? "");
  if (code === "42703") return true;
  const message = String(error.message ?? "").toLowerCase();
  if (!message.includes("checkout_started_at")) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

/** Tier A iff the venue has no Checkout stamp. See SweepTier. */
const tierOf = (row: CandidateVenueRow): SweepTier =>
  row.checkout_started_at ? "reached-checkout" : "never-started-checkout";

/**
 * Delete the venues a partner created and never paid for.
 *
 * Predicate — and every clause of it is load-bearing:
 *   hidden = true                                  (never touch a live venue)
 *   self_serve_created_at IS NOT NULL              (only rows THIS flow stamped)
 *   older than its TIER's window                   (see below)
 *   no billing_subscriptions row for the venue     (never touch a payer, past or
 *                                                   present — a cancelled
 *                                                   subscriber keeps its row)
 *
 * The stamp clause is what keeps this off the two Category Blitz global rooms,
 * which are hidden and stamp-null. It must NOT be relaxed to plain `hidden = true`.
 * Deliberately absent: any filter on `venue_owner_venues`. Every venue this flow
 * creates has a link row, so filtering on it would mean the sweep reaps nothing,
 * ever. The stamp is the clock (and a claim refreshes it — Phase 5 §5a).
 *
 * ── The two tiers (Phase 4) ─────────────────────────────────────────────────
 *
 * One window for everything was wrong in both directions: a week is far too long
 * to hold the details of somebody who never got near a payment page, and it is
 * exactly right for somebody whose card may still be settling. So the set is
 * split on `venues.checkout_started_at`, stamped by POST /api/owner/billing/checkout
 * immediately before it hands back a Checkout URL:
 *
 *   TIER A  checkout_started_at IS NULL  → pendingSignupTtlMinutes(), default 60m
 *   TIER B  checkout_started_at IS SET   → SWEEP_ABANDON_AFTER_DAYS (7d), and BOTH
 *                                          timestamps must be past it
 *
 * Tier B measures the LATER of the two stamps, which is stricter than the
 * pre-Phase-4 behaviour it replaces. A venue created ten days ago whose partner
 * came back and reached Stripe an hour ago has a payment in flight; sweeping it
 * on the strength of `self_serve_created_at` alone would delete the venue the
 * webhook is about to write a subscription against. Every widening of this
 * function has to survive that question: *could money still be moving?*
 *
 * The tier split degrades to the legacy single 7-day window whenever
 * `venues.checkout_started_at` is not deployed (see `isMissingCheckoutStampColumn`).
 * That is the conservative direction — it sweeps LATER, never sooner — and it is
 * what makes this file safe to deploy before, after, or without the migration.
 *
 * Deletion order matches `unwind()` in app/api/owner/signup/route.ts, which is the
 * tested reference teardown: venue → venue_owners → auth user. Deleting the venue
 * cascades every venue_id FK (`tests/lib.venue-fk-cascade-guard.test.ts` proves
 * none is RESTRICT), including the venue_owner_venues link rows read just before.
 */
export async function sweepAbandonedSignupVenues(
  options: { dryRun?: boolean } = {}
): Promise<VenueSweepResult> {
  const dryRun = options.dryRun ?? !isVenueSweepDeleteEnabled();
  const ttlMinutes = pendingSignupTtlMinutes();
  const result: VenueSweepResult = {
    dryRun,
    candidates: 0,
    deleted: 0,
    venues: [],
    errors: [],
    abortedOverCap: false,
    scanned: 0,
    tierA: 0,
    tierB: 0,
    tierSplitActive: true,
    ttlMinutes,
  };

  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  const db = supabaseAdmin;
  const now = Date.now();
  const tierBCutoffMs = now - SWEEP_ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const tierACutoffMs = now - ttlMinutes * 60 * 1000;
  const tierBCutoff = new Date(tierBCutoffMs).toISOString();

  // One scan, filtered on the LOOSER of the two windows, then partitioned in
  // memory. `Math.min` rather than plain Tier A: if the TTL is ever configured
  // above seven days, Tier A stops being the looser bound and a DB-side filter on
  // it would silently hide every eligible Tier B row.
  const scanCutoff = new Date(Math.min(tierACutoffMs, tierBCutoffMs)).toISOString();

  const scanVenues = (columns: string, cutoff: string) =>
    db
      .from("venues")
      .select(columns)
      .eq("hidden", true)
      .not("self_serve_created_at", "is", null)
      .lt("self_serve_created_at", cutoff)
      .order("self_serve_created_at", { ascending: true })
      // Oldest first, so a not-yet-abandoned row (fetched by the looser scan
      // cutoff and dropped by its tier's window below) can never crowd an older,
      // genuinely abandoned row out of the page.
      .limit(SWEEP_MAX_VENUES_PER_RUN + 1)
      .returns<CandidateVenueRow[]>();

  let candidateQuery = await scanVenues(CANDIDATE_COLUMNS_TIERED, scanCutoff);

  if (candidateQuery.error && isMissingCheckoutStampColumn(candidateQuery.error)) {
    // The migration has not been applied yet. Fall back to the pre-Phase-4
    // behaviour — one 7-day window for everything — rather than failing the run:
    // the legacy sweep is correct, merely slower, and refusing to run at all
    // would let real debris pile up unreported while the column is pending.
    result.tierSplitActive = false;
    console.warn(
      "[SignupSweep] checkout-stamp-column-missing — venues.checkout_started_at is not deployed; " +
        `falling back to the single ${SWEEP_ABANDON_AFTER_DAYS}-day window (Tier A is inert)`
    );
    candidateQuery = await scanVenues(CANDIDATE_COLUMNS_LEGACY, tierBCutoff);
  }

  if (candidateQuery.error) {
    result.errors.push(`venues-read-failed: ${candidateQuery.error.message}`);
    return result;
  }

  const scanned = candidateQuery.data ?? [];
  result.scanned = scanned.length;

  /**
   * Apply each row's own tier window. The scan's cutoff is only the looser of the
   * two, so a Tier B row fetched here may be days away from being abandoned —
   * this is where it is put back down.
   */
  const tiers = new Map<string, SweepTier>();
  let candidates = scanned.filter((venue) => {
    if (!result.tierSplitActive) {
      // Legacy path: the scan cutoff already WAS the 7-day window.
      tiers.set(venue.id, "stamp-column-missing");
      return true;
    }

    const created = Date.parse(venue.self_serve_created_at ?? "");
    // Unparseable stamp: the clock this whole job runs on is unreadable, so
    // nothing about this row's age is known. Fail closed and leave it.
    if (!Number.isFinite(created)) {
      result.errors.push(`venue-stamp-unparseable venue=${venue.id}`);
      return false;
    }

    const tier = tierOf(venue);
    if (tier === "never-started-checkout") {
      if (created >= tierACutoffMs) return false;
      tiers.set(venue.id, tier);
      return true;
    }

    // Tier B: the later of the two stamps must clear the 7-day window. An
    // unparseable checkout stamp is treated as "just now" — the strictly
    // conservative reading, since the only thing it can do is keep the venue.
    const startedCheckout = Date.parse(venue.checkout_started_at ?? "");
    const startedCheckoutMs = Number.isFinite(startedCheckout) ? startedCheckout : now;
    if (created >= tierBCutoffMs || startedCheckoutMs >= tierBCutoffMs) return false;
    tiers.set(venue.id, tier);
    return true;
  });

  if (candidates.length > SWEEP_MAX_VENUES_PER_RUN) {
    // Over the rail. Do nothing at all rather than delete an arbitrary 50 of an
    // unexpected pile — a run this size is a signal, not a workload.
    result.candidates = candidates.length;
    result.abortedOverCap = true;
    result.errors.push(
      `candidate-count-over-cap: more than ${SWEEP_MAX_VENUES_PER_RUN} abandoned venues; nothing deleted`
    );
    return result;
  }

  if (candidates.length === 0) return result;

  // Exclude any venue that has ever tracked a subscription.
  const paidQuery = await supabaseAdmin
    .from("billing_subscriptions")
    .select("venue_id")
    .in(
      "venue_id",
      candidates.map((venue) => venue.id)
    )
    .returns<{ venue_id: string }[]>();

  if (paidQuery.error) {
    // Fail closed: without this answer we cannot tell a payer from an abandon.
    result.errors.push(`billing-read-failed: ${paidQuery.error.message}`);
    return result;
  }

  const paidVenueIds = new Set((paidQuery.data ?? []).map((row) => row.venue_id));
  candidates = candidates.filter((venue) => !paidVenueIds.has(venue.id));
  result.candidates = candidates.length;
  // Counted AFTER the billing exclusion, so `tierA + tierB === candidates` and the
  // dry-run reader is looking at the same set the live run would act on.
  for (const venue of candidates) {
    const tier = tiers.get(venue.id);
    if (tier === "never-started-checkout") result.tierA += 1;
    else if (tier === "reached-checkout") result.tierB += 1;
  }

  for (const venue of candidates) {
    const swept: SweptVenue = {
      venueId: venue.id,
      venueName: venue.name,
      tier: tiers.get(venue.id) ?? "stamp-column-missing",
      ownerIdsDeleted: [],
      authUserIdsDeleted: [],
      ownerIdsKept: [],
    };

    // Read the owners BEFORE the venue delete — the link rows cascade away with it.
    const linkQuery = await supabaseAdmin
      .from("venue_owner_venues")
      .select("owner_id")
      .eq("venue_id", venue.id)
      .returns<{ owner_id: string }[]>();

    if (linkQuery.error) {
      result.errors.push(`links-read-failed venue=${venue.id}: ${linkQuery.error.message}`);
      continue;
    }
    const ownerIds = Array.from(new Set((linkQuery.data ?? []).map((row) => row.owner_id)));

    if (dryRun) {
      // Finding #8: the old dry run returned here, so it ALWAYS reported every
      // owner kept and nothing deleted — a preview that structurally could not
      // show the destructive half the two-flag split exists to be careful about.
      // Run the read-only classifier and report the true projected split.
      for (const ownerId of ownerIds) {
        const plan = await classifyOwnerForSweep(ownerId, venue.id, result.errors);
        if (plan.deleteOwner) {
          swept.ownerIdsDeleted.push(ownerId);
          if (plan.deleteAuthUser && plan.authUserId) swept.authUserIdsDeleted.push(plan.authUserId);
        } else {
          swept.ownerIdsKept.push(ownerId);
        }
      }
      console.log(
        `[SignupSweep] venue-sweep-dry-run venue=${venue.id} tier=${swept.tier} ` +
          `created=${venue.self_serve_created_at ?? "?"} checkoutStarted=${venue.checkout_started_at ?? "none"} ` +
          `ownersToDelete=${swept.ownerIdsDeleted.length} ownersToKeep=${swept.ownerIdsKept.length} ` +
          `authUsersToDelete=${swept.authUserIdsDeleted.length}`
      );
      result.venues.push(swept);
      continue;
    }

    const venueDelete = await supabaseAdmin.from("venues").delete().eq("id", venue.id);
    if (venueDelete.error) {
      result.errors.push(`venue-delete-failed venue=${venue.id}: ${venueDelete.error.message}`);
      continue;
    }
    result.deleted += 1;
    // The live counterpart of the dry-run line above, and the only record that
    // survives the run: an irreversible delete should say which window justified
    // it, so a wrong tier is auditable after the fact rather than only before it.
    console.log(
      `[SignupSweep] venue-swept venue=${venue.id} tier=${swept.tier} ` +
        `created=${venue.self_serve_created_at ?? "?"} checkoutStarted=${venue.checkout_started_at ?? "none"}`
    );

    for (const ownerId of ownerIds) {
      const plan = await classifyOwnerForSweep(ownerId, venue.id, result.errors);
      const removed = await deleteOwner(plan, result.errors);
      if (removed.deletedOwner) {
        swept.ownerIdsDeleted.push(ownerId);
        if (removed.deletedAuthUserId) swept.authUserIdsDeleted.push(removed.deletedAuthUserId);
      } else {
        swept.ownerIdsKept.push(ownerId);
      }
    }

    result.venues.push(swept);
  }

  return result;
}

/**
 * The projected fate of one `venue_owners` row once `sweptVenueId` is gone.
 * Produced by the read-only `classifyOwnerForSweep`; consumed by `deleteOwner`
 * (live run) and reported verbatim by the dry run.
 */
export type OwnerSweepPlan = {
  ownerId: string;
  /** The owner's auth user, or null if the row has none. */
  authUserId: string | null;
  /** The owner row is now unused (no other venue link, no subscription of its own). */
  deleteOwner: boolean;
  /** The auth user cleared all seven FK tables (the owner's own row discounted). */
  deleteAuthUser: boolean;
  /**
   * Why the owner or auth user is being kept — a greppable tag for the log and
   * for the dry-run reader. null when both are being deleted.
   */
  keepReason: string | null;
};

/**
 * READ-ONLY. Decide what WOULD happen to a `venue_owners` row once `sweptVenueId`
 * is deleted: whether the owner row is now left with nothing (no other venue
 * link, no subscription of their own) and, if so, whether its auth user is safe
 * to delete (unreferenced by the other FK tables — the owner's own row is
 * discounted, because it is about to go).
 *
 * `sweptVenueId` is discounted from the link check EXPLICITLY rather than relying
 * on the caller having already deleted the venue. That is the whole point of the
 * split (Finding #8): the dry run never deletes the venue, so without the
 * explicit exclusion its link row makes every owner look retained. In the live
 * run the link has already cascaded away, so the exclusion is a harmless no-op
 * and the result is identical to the old `deleteOwnerIfUnused`.
 *
 * An owner can legitimately hold more than one venue (an admin can add a second
 * via Activate-a-Venue), so "their abandoned venue was swept" does not imply
 * "delete the account."
 *
 * Fails closed: a read error pushes to `errors` and yields `deleteOwner: false`,
 * EXCEPT an auth-guard read failure, which yields `deleteOwner: true` /
 * `deleteAuthUser: false` — a guard we could not read never justifies an auth
 * delete, but it does not rescue an otherwise-unused owner row either (matching
 * the prior behaviour). When the guard clears but finds a reference, the auth row
 * is kept on purpose: an extra orphan is strictly better than a broken player.
 */
export async function classifyOwnerForSweep(
  ownerId: string,
  sweptVenueId: string,
  errors: string[]
): Promise<OwnerSweepPlan> {
  const keep = (reason: string, authUserId: string | null = null): OwnerSweepPlan => ({
    ownerId,
    authUserId,
    deleteOwner: false,
    deleteAuthUser: false,
    keepReason: reason,
  });

  if (!supabaseAdmin) return keep("supabase-admin-unconfigured");

  const remainingLinks = await supabaseAdmin
    .from("venue_owner_venues")
    .select("id")
    .eq("owner_id", ownerId)
    .neq("venue_id", sweptVenueId)
    .limit(1)
    .returns<{ id: string }[]>();
  if (remainingLinks.error) {
    errors.push(`owner-links-read-failed owner=${ownerId}: ${remainingLinks.error.message}`);
    return keep("owner-links-read-failed");
  }
  if ((remainingLinks.data ?? []).length > 0) return keep("another-venue");

  const remainingSubs = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1)
    .returns<{ id: string }[]>();
  if (remainingSubs.error) {
    errors.push(`owner-subs-read-failed owner=${ownerId}: ${remainingSubs.error.message}`);
    return keep("owner-subs-read-failed");
  }
  if ((remainingSubs.data ?? []).length > 0) return keep("own-subscription");

  const ownerRow = await supabaseAdmin
    .from("venue_owners")
    .select("auth_id")
    .eq("id", ownerId)
    .maybeSingle<{ auth_id: string | null }>();
  if (ownerRow.error) {
    errors.push(`owner-read-failed owner=${ownerId}: ${ownerRow.error.message}`);
    return keep("owner-read-failed");
  }
  const authUserId = ownerRow.data?.auth_id ?? null;

  // The owner row is unused and will be deleted. Now decide the auth user.
  if (!authUserId) {
    return { ownerId, authUserId: null, deleteOwner: true, deleteAuthUser: false, keepReason: null };
  }

  const unreferenced = await authUserIsUnreferenced(authUserId, { ignoreVenueOwnerId: ownerId });
  if (!unreferenced.ok) {
    errors.push(`auth-guard-failed auth=${authUserId}: ${unreferenced.error}`);
    return {
      ownerId,
      authUserId,
      deleteOwner: true,
      deleteAuthUser: false,
      keepReason: "auth-guard-failed",
    };
  }
  if (!unreferenced.unreferenced) {
    return {
      ownerId,
      authUserId,
      deleteOwner: true,
      deleteAuthUser: false,
      keepReason: `auth-shared:${unreferenced.referencedBy}`,
    };
  }

  return { ownerId, authUserId, deleteOwner: true, deleteAuthUser: true, keepReason: null };
}

/**
 * Act on a `classifyOwnerForSweep` plan. LIVE PATH ONLY — the dry run reports the
 * plan and never reaches here.
 *
 * Deletes the `venue_owners` row, then (only when the plan cleared it) the auth
 * user. Order matches `unwind()` in app/api/owner/signup/route.ts: venue (already
 * gone by the time this runs) → venue_owners → auth user.
 */
async function deleteOwner(
  plan: OwnerSweepPlan,
  errors: string[]
): Promise<{ deletedOwner: boolean; deletedAuthUserId: string | null }> {
  if (!supabaseAdmin || !plan.deleteOwner) return { deletedOwner: false, deletedAuthUserId: null };

  const ownerDelete = await supabaseAdmin.from("venue_owners").delete().eq("id", plan.ownerId);
  if (ownerDelete.error) {
    errors.push(`owner-delete-failed owner=${plan.ownerId}: ${ownerDelete.error.message}`);
    return { deletedOwner: false, deletedAuthUserId: null };
  }

  if (!plan.deleteAuthUser || !plan.authUserId) {
    if (plan.authUserId && plan.keepReason) {
      console.log(
        `[SignupSweep] auth-user-kept auth=${plan.authUserId} reason=${plan.keepReason} — not deleting a shared or unguarded auth user`
      );
    }
    return { deletedOwner: true, deletedAuthUserId: null };
  }

  const authDelete = await supabaseAdmin.auth.admin.deleteUser(plan.authUserId);
  if (authDelete.error) {
    errors.push(`auth-delete-failed auth=${plan.authUserId}: ${authDelete.error.message}`);
    return { deletedOwner: true, deletedAuthUserId: null };
  }
  return { deletedOwner: true, deletedAuthUserId: plan.authUserId };
}

/**
 * True only when NO row in any of the seven FK consumers points at this auth user.
 *
 * Fails closed: a read error returns `ok: false` and the caller must NOT delete.
 * "I could not check" and "nothing references it" are opposite answers and must
 * never collapse into the same branch.
 *
 * `ignoreVenueOwnerId` discounts one `venue_owners` row (by primary key) from the
 * check. `classifyOwnerForSweep` needs this: it asks "once we delete THIS owner
 * row, is the auth user unreferenced?" before the delete, so the row it is about
 * to remove must not count as a reference. The orphan job (job 2) passes no
 * options — it has no owner-deletion context — and gets the full seven-table check.
 */
export async function authUserIsUnreferenced(
  authUserId: string,
  options: { ignoreVenueOwnerId?: string } = {}
): Promise<{ ok: true; unreferenced: boolean; referencedBy: string | null } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };

  for (const { table, column } of AUTH_USER_FK_CONSUMERS) {
    let query = supabaseAdmin.from(table).select(column).eq(column, authUserId).limit(1);
    if (table === "venue_owners" && options.ignoreVenueOwnerId) {
      query = query.neq("id", options.ignoreVenueOwnerId);
    }
    const found = await query;
    if (found.error) return { ok: false, error: `${table}: ${found.error.message}` };
    if ((found.data ?? []).length > 0) return { ok: true, unreferenced: false, referencedBy: table };
  }
  return { ok: true, unreferenced: true, referencedBy: null };
}

// --- Job 2: orphaned auth users ----------------------------------------------

type AuthUserSummary = { id: string; email: string; createdAt: string };

/**
 * Reconcile the auth users POST /api/owner/signup created and could not unwind
 * (Phase 5a §1: `unwind()`'s deleteUser can fail, or the function can die between
 * createUser and the venue_owners insert). Those leave a partner wedged — signup
 * says "email taken", login says 401 — with no self-service way out.
 *
 * FOUR FILTERS, and the email one is not optional:
 *
 *   1. HAS AN EMAIL. This is the filter that makes the job safe, and it was not
 *      in the plan. `lib/auth.ts`'s signInAnonymously() — three call sites in
 *      components/join/JoinFlow.tsx — mints an EMAILLESS auth.users row for every
 *      anonymous player visit, and one who never finishes joining a venue never
 *      gets an `accounts` or `users` row. So they are orphans by the seven-table
 *      test and they are PLAYERS. Production, 2026-09-07: 768 orphans, of which
 *      765 emailless. Without this filter the job's first run deletes 765 player
 *      sessions. Reproduce with `npm run signup:check-orphan-auth-users`.
 *   2. Not a reserved/non-routable domain (fixtures and backfill artifacts).
 *   3. Older than ORPHAN_MIN_AGE_HOURS — a younger row may be mid-signup.
 *   4. Unreferenced by all seven FK tables.
 *
 * Then ORPHAN_MAX_DELETES_PER_RUN aborts the whole run if the survivors are more
 * numerous than owner-signup debris could plausibly be.
 */
export async function reconcileOrphanedAuthUsers(
  options: { dryRun?: boolean } = {}
): Promise<OrphanSweepResult> {
  const dryRun = options.dryRun ?? !isOrphanAuthDeleteEnabled();
  const result: OrphanSweepResult = {
    dryRun,
    authUsersScanned: false,
    candidates: 0,
    deleted: 0,
    candidateEmails: [],
    errors: [],
    abortedOverCap: false,
  };

  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  const ageCutoff = Date.now() - ORPHAN_MIN_AGE_HOURS * 60 * 60 * 1000;
  const eligible: AuthUserSummary[] = [];

  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const listed = await supabaseAdmin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (listed.error) {
      result.errors.push(`list-users-failed page=${page}: ${listed.error.message}`);
      return result;
    }
    const batch = listed.data?.users ?? [];
    for (const user of batch) {
      const email = String(user.email ?? "").trim();
      if (!email) continue; // Filter 1 — anonymous player session. See the doc block.
      if (hasReservedEmailDomain(email)) continue; // Filter 2.
      const created = Date.parse(String(user.created_at ?? ""));
      if (!Number.isFinite(created) || created >= ageCutoff) continue; // Filter 3.
      eligible.push({ id: user.id, email, createdAt: String(user.created_at ?? "") });
    }
    if (batch.length < AUTH_PAGE_SIZE) {
      result.authUsersScanned = true;
      break;
    }
    if (page === AUTH_MAX_PAGES) {
      result.errors.push(`list-users-truncated: stopped at ${AUTH_MAX_PAGES} pages`);
    }
  }

  if (eligible.length === 0) return result;

  // Filter 4, batched: one `.in(...)` per table per chunk rather than seven
  // queries per user. Fails closed — an unreadable table aborts the run.
  const referenced = new Set<string>();
  for (const { table, column } of AUTH_USER_FK_CONSUMERS) {
    for (let i = 0; i < eligible.length; i += IN_CHUNK) {
      const ids = eligible.slice(i, i + IN_CHUNK).map((user) => user.id);
      // The table/column pair is dynamic, so PostgREST's row type cannot be
      // inferred — declare it explicitly rather than casting the result.
      const found = await supabaseAdmin
        .from(table)
        .select(column)
        .in(column, ids)
        .returns<Array<Record<string, unknown>>>();
      if (found.error) {
        result.errors.push(`fk-read-failed table=${table}: ${found.error.message}`);
        return result;
      }
      for (const row of found.data ?? []) {
        const value = row[column];
        if (typeof value === "string" && value) referenced.add(value);
      }
    }
  }

  const orphans = eligible.filter((user) => !referenced.has(user.id));
  result.candidates = orphans.length;
  result.candidateEmails = orphans.map((user) => user.email);

  if (orphans.length > ORPHAN_MAX_DELETES_PER_RUN) {
    result.abortedOverCap = true;
    result.errors.push(
      `orphan-count-over-cap: ${orphans.length} candidates exceeds ${ORPHAN_MAX_DELETES_PER_RUN}; nothing deleted`
    );
    console.error(
      `[SignupSweep] orphan-scan-exceeded-cap count=${orphans.length} cap=${ORPHAN_MAX_DELETES_PER_RUN} — ` +
        "refusing to delete. Something is creating emailed auth users this sweep does not understand; " +
        "run npm run signup:check-orphan-auth-users before changing the cap."
    );
    return result;
  }

  if (dryRun) {
    for (const orphan of orphans) {
      console.log(`[SignupSweep] orphan-auth-user-dry-run email=${orphan.email} created=${orphan.createdAt}`);
    }
    return result;
  }

  for (const orphan of orphans) {
    const deleted = await supabaseAdmin.auth.admin.deleteUser(orphan.id);
    if (deleted.error) {
      result.errors.push(`orphan-delete-failed email=${orphan.email}: ${deleted.error.message}`);
      continue;
    }
    result.deleted += 1;
    console.log(`[SignupSweep] orphan-auth-user-deleted email=${orphan.email} created=${orphan.createdAt}`);
  }

  return result;
}
