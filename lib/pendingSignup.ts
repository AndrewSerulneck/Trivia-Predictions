import "server-only";

import { findOwnerIdByEmail } from "@/lib/ownerEmailAvailability";
import { authUserIsUnreferenced } from "@/lib/signupSweep";
import { stripe } from "@/lib/stripe";
import { sweepAbandonedIncompleteSubscriptions } from "@/lib/stripeIncomplete";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  VENUE_CLAIM_COLUMNS,
  isAdminHiddenVenueRow,
  isPlaceholderVenueRow,
  isSelfServeVenueRow,
  type ClaimableVenueRow,
} from "@/lib/venueClaim";

// Abandoned-signup cleanup — Phase 1 (docs/abandoned-signup-cleanup-plan.md).
//
// THE ONE HOME of the question "is this email an unpaid, never-finished signup?"
// and of the teardown that answers it. Every later phase calls this module and
// nothing re-derives the predicate:
//
//   Phase 2a  POST /api/owner/signup       — supersede a pending collision at
//                                            submit, so a returning partner is
//                                            never told their account exists.
//   Phase 2b  POST /api/signup/email-available — report a pending collision as
//                                            AVAILABLE, because the submit will
//                                            supersede it.
//   Phase 3   POST /api/owner/signup/abandon — an explicit "cancel and start
//                                            over" from /owner/billing/setup.
//
// ── Why the predicate is written this defensively ───────────────────────────
//
// This module is the only thing standing between a PUBLIC, UNAUTHENTICATED
// signup form and a row in `auth.users` — a table SHARED WITH PLAYERS (CLAUDE.md
// standing prohibition; tests/lib.auth-users-fk-guard.test.ts pins its seven FK
// consumers, six of which are player tables). "This email has no live
// subscription, so delete its auth user" is an account-takeover vector if the
// predicate is even slightly loose. So:
//
//   - every clause is load-bearing and none is optional;
//   - the row-shape predicates are IMPORTED from lib/venueClaim.ts and the auth
//     guard from lib/signupSweep.ts — a second copy is exactly how the original
//     claim branch lost its (0, 0) clause;
//   - every read error fails CLOSED (`ok: false`), never "not pending" and never
//     "pending";
//   - `purgePendingSignup` re-runs the whole predicate itself before it deletes
//     anything, so a caller holding a stale or wrong owner id cannot turn it into
//     a delete of a real account.
//
// A "pending signup" is DEBRIS WITH AN EMAIL ON IT: no payment, no gameplay, no
// player linkage, and no user-visible identity. Anything that fails a clause is
// not pending and is never touched — a partner who paid once and cancelled, an
// admin-activated venue, a Category Blitz global room, an owner holding a second
// venue, an auth user a player is using.

/** An unpaid, never-finished signup: the rows that may be destroyed as a unit. */
export type PendingSignup = {
  ownerId: string;
  /** null when the owner row carries no auth user (nothing to delete). */
  authUserId: string | null;
  /** Every venue linked to this owner. All of them passed clause 2. */
  venueIds: string[];
  /** `venue_owners.created_at` — for logging and the sweep's TTL tiers. */
  createdAt: string;
  /**
   * True when ANY linked venue has `venues.checkout_started_at` stamped — the
   * partner reached Stripe Checkout at least once, so an abandoned `incomplete`
   * subscription carrying `metadata.venueId` may exist and `purgePendingSignup`
   * must run the Stripe cancel sweep (and abort on its failure).
   *
   * False when EVERY linked venue is unstamped: Stripe never created a
   * Subscription object for this signup — Checkout does not until payment is
   * submitted — so the sweep can only ever find nothing and its one possible
   * effect is to fail on a network error and block a retry that has nothing to
   * clean up. `purgePendingSignup` skips it entirely in that case
   * (docs/abandoned-signup-cleanup-plan.md §4.1a).
   *
   * A null stamp means "never reached Checkout" ONLY because
   * `POST /api/owner/billing/checkout` writes it before handing back the session
   * URL (matching comment there). Read defensively: the migration may not be
   * deployed yet, and ANY failure to read the column resolves this `true` —
   * today's behaviour, sweep-and-abort. The skip fires only when we are certain.
   */
  reachedCheckout: boolean;
};

/**
 * `pending: null` = not pending. That covers both "no owner row at all" and "an
 * owner we must never touch", and the two are deliberately indistinguishable to
 * a caller: the only safe action in either case is to leave it alone. The reason
 * is logged (`[PendingSignup] not-pending`), not returned, so no public route can
 * turn it into a disclosure about somebody else's account.
 */
export type PendingSignupLookup =
  | { ok: true; pending: PendingSignup | null }
  | { ok: false; message: string };

export type PendingSignupPurge = {
  /** True only when every step of the teardown succeeded. */
  ok: boolean;
  deletedVenueIds: string[];
  deletedAuthUserId: string | null;
  /** Greppable failure tags. Never partner-facing — routes return generic copy. */
  errors: string[];
};

type OwnerRow = { id: string; auth_id: string | null; created_at: string | null };

const notPending = (ownerId: string, reason: string): PendingSignupLookup => {
  console.log(`[PendingSignup] not-pending owner=${ownerId} reason=${reason}`);
  return { ok: true, pending: null };
};

/**
 * Is the email an unpaid, never-finished signup?
 *
 * Resolves the email through `findOwnerIdByEmail` — the single home of the
 * `venue_owners`-by-email query, shared with `ownerEmailExists` — and then hands
 * off to the by-id evaluator, so both entry points apply exactly one predicate.
 */
export async function findPendingSignupByEmail(email: string): Promise<PendingSignupLookup> {
  const found = await findOwnerIdByEmail(email);
  if (!found.ok) return { ok: false, message: `owner-lookup-failed: ${found.message}` };
  if (found.ownerId === null) return { ok: true, pending: null };
  return findPendingSignupByOwnerId(found.ownerId);
}

/**
 * Phase 2's signup-email discriminator: the single answer to "may this email
 * start a new self-serve signup, and if not, why not?".
 *
 *   exists: false          — no `venue_owners` row. Signup proceeds.
 *   kind: "pending"         — an unpaid, never-finished signup. Signup STILL
 *                             proceeds: `POST /api/owner/signup` calls
 *                             `purgePendingSignup` and supersedes it at submit,
 *                             so telling the partner "an account already exists"
 *                             would be a dead end that no longer exists (plan
 *                             §0.1). `/api/signup/email-available` reports this
 *                             as `available: true`.
 *   kind: "account"         — a REAL account: paid, ever paid, or admin-
 *                             activated. This is the ONLY value that blocks a
 *                             signup and the only surviving path to
 *                             `OWNER_EMAIL_TAKEN_MESSAGE`.
 *
 * Built on the same predicate as everything else in this module — resolve the
 * email to an owner id, then run `findPendingSignupByOwnerId`. Both signup
 * callers (the submit route and the step-2 pre-check) go through here, so they
 * can never disagree about which emails are blocked.
 *
 * Fails CLOSED: any read error is `{ ok: false }`, never a `kind`. A caller must
 * not collapse `ok: false` into "available" — see `/api/signup/email-available`,
 * which returns 503 on it.
 */
export type SignupEmailClassification =
  | { ok: true; exists: false }
  | { ok: true; exists: true; kind: "account"; ownerId: string }
  | { ok: true; exists: true; kind: "pending"; ownerId: string }
  | { ok: false; message: string };

export async function classifyEmailForSignup(email: string): Promise<SignupEmailClassification> {
  const found = await findOwnerIdByEmail(email);
  if (!found.ok) return { ok: false, message: `owner-lookup-failed: ${found.message}` };
  if (found.ownerId === null) return { ok: true, exists: false };

  const lookup = await findPendingSignupByOwnerId(found.ownerId);
  if (!lookup.ok) return { ok: false, message: lookup.message };

  return lookup.pending
    ? { ok: true, exists: true, kind: "pending", ownerId: found.ownerId }
    : { ok: true, exists: true, kind: "account", ownerId: found.ownerId };
}

/**
 * The predicate itself, keyed on the owner's primary key.
 *
 * Phase 3's abandon route reaches the owner through the session cookie rather
 * than an email, and `purgePendingSignup` re-verifies through this same
 * function — which is why it is a separate export rather than an inner helper.
 *
 * FOUR CLAUSES, in cheapest-first order. Each is stated as a refusal so that
 * adding a fifth cannot accidentally widen the set:
 *
 *   1. A `venue_owners` row exists.
 *   2. It has AT LEAST ONE linked venue, and EVERY linked venue is hidden, was
 *      created by this flow (`self_serve_created_at` — a capability grant, not a
 *      timestamp), and is not the (0, 0) placeholder both Category Blitz global
 *      rooms sit at.
 *   3. NO `billing_subscriptions` row for the owner or for any linked venue,
 *      EVER — not "no live subscription". A cancelled subscription keeps its row
 *      precisely so it can serve as this proof (CLAUDE.md, Venue Visibility).
 *   4. The auth user is unreferenced by the seven FK consumers, discounting this
 *      owner's own row.
 */
export async function findPendingSignupByOwnerId(ownerId: string): Promise<PendingSignupLookup> {
  if (!supabaseAdmin) return { ok: false, message: "supabase-admin-unavailable" };

  // --- Clause 1: the owner row -----------------------------------------------
  const owner = await supabaseAdmin
    .from("venue_owners")
    .select("id, auth_id, created_at")
    .eq("id", ownerId)
    .maybeSingle<OwnerRow>();
  if (owner.error) return { ok: false, message: `owner-read-failed: ${owner.error.message}` };
  if (!owner.data) return { ok: true, pending: null };

  // --- Clause 2: every linked venue is this flow's own hidden debris ----------
  const links = await supabaseAdmin
    .from("venue_owner_venues")
    .select("venue_id")
    .eq("owner_id", ownerId)
    .returns<{ venue_id: string }[]>();
  if (links.error) return { ok: false, message: `links-read-failed: ${links.error.message}` };

  const venueIds = Array.from(new Set((links.data ?? []).map((row) => row.venue_id))).filter(Boolean);
  // An owner with no venue at all is not this flow's debris — POST
  // /api/owner/signup always links one, and unwinds if it cannot. Something else
  // made this row (an admin repair, a half-deleted account), so leave it alone.
  if (venueIds.length === 0) return notPending(ownerId, "no-linked-venue");

  const venues = await supabaseAdmin
    .from("venues")
    .select(VENUE_CLAIM_COLUMNS)
    .in("id", venueIds)
    .returns<ClaimableVenueRow[]>();
  if (venues.error) return { ok: false, message: `venues-read-failed: ${venues.error.message}` };

  const rows = venues.data ?? [];
  // A link pointing at a venue we could not read is an unanswered question, not a
  // clearance. Fail closed rather than purge on a partial picture.
  if (rows.length !== venueIds.length) return notPending(ownerId, "venue-row-missing");

  for (const row of rows) {
    // A placeholder / internal room. Checked FIRST and on its own, because it is
    // the clause the original claim branch was missing and the one whose failure
    // is worst: both Category Blitz global rooms live at (0, 0).
    if (isPlaceholderVenueRow(row)) return notPending(ownerId, `venue-placeholder:${row.id}`);
    // Not stamped by this flow: an admin-activated venue. Never sweepable, never
    // revealable, and never ours to delete.
    if (!isSelfServeVenueRow(row)) return notPending(ownerId, `venue-not-self-serve:${row.id}`);
    // Revealed to players — i.e. it has been paid for at least once, whatever the
    // billing rows say. `hidden` is the visible half of "unpaid"; clause 3 is the
    // durable half, and both must hold.
    if (row.hidden !== true) return notPending(ownerId, `venue-not-hidden:${row.id}`);
    // Redundant with the two clauses above, and deliberately so — this is the
    // guard that must be right on its own if either is ever relaxed.
    if (isAdminHiddenVenueRow(row)) return notPending(ownerId, `venue-admin-hidden:${row.id}`);
  }

  // --- Clause 3: never paid, ever --------------------------------------------
  // Two queries rather than one `.or(...)`: `billing_subscriptions` carries BOTH
  // `owner_id` and `venue_id`, and a row can exist on either dimension alone (an
  // admin offline grant is written against the venue). Both must be clear, and
  // both fail closed.
  const ownerSubs = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1)
    .returns<{ id: string }[]>();
  if (ownerSubs.error) return { ok: false, message: `owner-subs-read-failed: ${ownerSubs.error.message}` };
  if ((ownerSubs.data ?? []).length > 0) return notPending(ownerId, "owner-subscription");

  const venueSubs = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .in("venue_id", venueIds)
    .limit(1)
    .returns<{ id: string }[]>();
  if (venueSubs.error) return { ok: false, message: `venue-subs-read-failed: ${venueSubs.error.message}` };
  if ((venueSubs.data ?? []).length > 0) return notPending(ownerId, "venue-subscription");

  // --- Clause 4: the auth user belongs to nobody else -------------------------
  const authUserId = owner.data.auth_id ?? null;
  if (authUserId) {
    // `ignoreVenueOwnerId` discounts this owner's own row, which is about to be
    // deleted. Every OTHER consumer — `accounts`, `users`, both Category Blitz
    // tables and the two username-change ledgers — is a player and is decisive.
    const unreferenced = await authUserIsUnreferenced(authUserId, { ignoreVenueOwnerId: ownerId });
    if (!unreferenced.ok) return { ok: false, message: `auth-guard-failed: ${unreferenced.error}` };
    if (!unreferenced.unreferenced) {
      return notPending(ownerId, `auth-shared:${unreferenced.referencedBy}`);
    }
  }

  // --- Not a clause: did this signup ever reach Stripe Checkout? -------------
  // Read AFTER the four refusals so a not-pending owner never triggers it. It
  // decides nothing about pending-vs-not — only whether `purgePendingSignup`
  // bothers with the Stripe cancel sweep (§4.1a). Fails toward `true`.
  const reachedCheckout = await anyVenueReachedCheckout(venueIds);

  return {
    ok: true,
    pending: {
      ownerId,
      authUserId,
      venueIds,
      createdAt: owner.data.created_at ?? "",
      reachedCheckout,
    },
  };
}

/**
 * Did ANY of these venues reach Stripe Checkout — i.e. is `checkout_started_at`
 * stamped on one? (docs/abandoned-signup-cleanup-plan.md §4.1a.)
 *
 * Deliberately its own tolerant read rather than a column added to clause 2's
 * `VENUE_CLAIM_COLUMNS` select: the Phase 4 migration may not be deployed yet
 * (the same state `lib/signupSweep.ts`'s `isMissingCheckoutStampColumn` fallback
 * handles), and folding it into a load-bearing clause would fail the whole
 * predicate CLOSED on a missing column — wedging every retry until the migration
 * lands. This is not load-bearing, so ANY read failure — missing column, a
 * timeout — resolves to `true`: run the Stripe sweep and abort on its failure,
 * exactly today's behaviour. The skip fires only on a clean read that finds
 * every linked venue unstamped.
 *
 * The truthiness test mirrors `tierOf` in `lib/signupSweep.ts` (a stamped value
 * ⇒ reached checkout) without importing across the modules — they are separate
 * on purpose (owner-id-first and TTL-blind here; owner-first and TTL-aware
 * there) and the contract test pins this module's import list.
 */
async function anyVenueReachedCheckout(venueIds: string[]): Promise<boolean> {
  if (!supabaseAdmin) return true;

  const stamps = await supabaseAdmin
    .from("venues")
    .select("id, checkout_started_at")
    .in("id", venueIds)
    .returns<{ id: string; checkout_started_at: string | null }[]>();

  if (stamps.error) {
    console.warn(
      `[PendingSignup] checkout-stamp-read-failed — assuming reached-checkout: ${stamps.error.message}`
    );
    return true;
  }

  return (stamps.data ?? []).some((row) => Boolean(row.checkout_started_at));
}

/**
 * Destroy a pending signup: cancel its abandoned Stripe objects, then delete its
 * venues, its owner row and its auth user.
 *
 * RE-VERIFIES THE PREDICATE FIRST. The plan's signature takes only an owner id,
 * and an id is not evidence — a caller can hold a stale one, resolve the wrong
 * owner, or (Phase 3) be handed one by a session cookie minted before the world
 * changed. Re-running `findPendingSignupByOwnerId` here costs a few small reads
 * on a cold path and removes the entire class of "purge deleted a real account"
 * bug. A caller that has just looked the owner up does not need to skip it.
 *
 * ── Order, and why Stripe comes first ───────────────────────────────────────
 *
 * A partner can reach Stripe Checkout, abandon it there, and come back to the
 * wizard. Stripe holds that `incomplete` subscription for ~23h and it carries
 * `metadata.venueId` for a venue this purge is about to delete — so if it later
 * completes, the webhook writes a `billing_subscriptions` row against a venue
 * that no longer exists and `maybeRevealVenue` fires on nothing. Cancelling
 * first is what closes that window, and a Stripe failure ABORTS the purge with
 * nothing deleted: a partner keeping their debris for another hour is a
 * non-event, an orphaned live subscription is not.
 *
 * Row order then matches `unwind()` in app/api/owner/signup/route.ts, the tested
 * reference teardown: venues → venue_owners → auth user. Deleting the venue
 * cascades every venue_id FK (tests/lib.venue-fk-cascade-guard.test.ts proves
 * none is RESTRICT), including the `venue_owner_venues` links.
 *
 * A failure at any step stops the purge and reports `ok: false` with whatever
 * was already deleted — the caller must not assume the email is now free.
 */
export async function purgePendingSignup(ownerId: string): Promise<PendingSignupPurge> {
  const result: PendingSignupPurge = {
    ok: false,
    deletedVenueIds: [],
    deletedAuthUserId: null,
    errors: [],
  };

  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unavailable");
    return result;
  }

  const verified = await findPendingSignupByOwnerId(ownerId);
  if (!verified.ok) {
    result.errors.push(`verify-failed: ${verified.message}`);
    return result;
  }
  if (!verified.pending) {
    // Not an error the caller caused, necessarily — a race with the sweep, or a
    // caller acting on a stale read. Either way: touch nothing.
    result.errors.push("not-pending");
    return result;
  }
  const pending = verified.pending;

  if (!(await cancelIncompleteSubscriptions(pending.venueIds, pending.reachedCheckout, result.errors)))
    return result;

  for (const venueId of pending.venueIds) {
    const deleted = await supabaseAdmin.from("venues").delete().eq("id", venueId);
    if (deleted.error) {
      result.errors.push(`venue-delete-failed venue=${venueId}: ${deleted.error.message}`);
      return result;
    }
    result.deletedVenueIds.push(venueId);
  }

  // `venue_owners.auth_id` cascades from `auth.users`, so deleting the auth user
  // would take this row too. It is deleted explicitly anyway, for the same reason
  // `unwind()` does: the teardown must be legible on its own and must not
  // silently stop working if that FK is ever changed.
  const ownerDelete = await supabaseAdmin.from("venue_owners").delete().eq("id", ownerId);
  if (ownerDelete.error) {
    result.errors.push(`owner-delete-failed owner=${ownerId}: ${ownerDelete.error.message}`);
    return result;
  }

  if (pending.authUserId) {
    const authDelete = await supabaseAdmin.auth.admin.deleteUser(pending.authUserId);
    if (authDelete.error) {
      // The owner row and venues are gone, so the email is free and the partner
      // can retry — but an auth user survives that nothing references. It is
      // reported, and /api/cron/signup-sweep's orphan job is the repair path.
      result.errors.push(`auth-delete-failed: ${authDelete.error.message}`);
      return result;
    }
    result.deletedAuthUserId = pending.authUserId;
  }

  result.ok = true;
  console.log(
    `[PendingSignup] purged owner=${ownerId} venues=${result.deletedVenueIds.length} ` +
      `authUser=${result.deletedAuthUserId ? "deleted" : "none"}`
  );
  return result;
}

/**
 * Cancel every abandoned `incomplete` Stripe subscription pointing at these
 * venues. Returns false if any of it could not be done, and the caller must then
 * delete nothing.
 *
 * Delegates to the SHARED helper that POST /api/owner/billing/checkout uses
 * (lib/stripeIncomplete.ts) rather than writing a second Stripe query — the two
 * differ only in what they do with the result.
 *
 * Two short-circuits, both on the same principle — no possible Stripe object ⇒
 * no Stripe call:
 *   - `stripe` is null: payments unconfigured, nothing ever reached Checkout.
 *   - `reachedCheckout` is false: every linked venue has `checkout_started_at IS
 *     NULL`, so the partner never submitted payment and Stripe never created a
 *     Subscription for this signup. The sweep could only fail and block a retry
 *     with nothing to clean up (§4.1a). The abort-on-failure behaviour is kept
 *     for the `reachedCheckout` case, where a live `incomplete` subscription
 *     really can carry `metadata.venueId` for a venue we are about to delete.
 */
async function cancelIncompleteSubscriptions(
  venueIds: string[],
  reachedCheckout: boolean,
  errors: string[]
): Promise<boolean> {
  if (!stripe) {
    // Payments unconfigured. Nothing could have reached Checkout — POST
    // /api/owner/billing/checkout returns 500 before creating a session — so
    // there is no abandoned object to cancel and no reason to block the purge.
    console.warn("[PendingSignup] stripe-unconfigured — skipping incomplete-subscription cancel");
    return true;
  }

  if (!reachedCheckout) {
    // §4.1a. Safe ONLY because `checkout_started_at` is stamped before the
    // Checkout URL is handed back (matching comment in
    // app/api/owner/billing/checkout/route.ts). If that write ever moves later,
    // revert this skip with it.
    console.log(
      `[PendingSignup] stripe-sweep-skipped venue=${venueIds.join(",")} reason=never-started-checkout`
    );
    return true;
  }

  for (const venueId of venueIds) {
    const swept = await sweepAbandonedIncompleteSubscriptions(stripe, venueId);
    if (swept.cancelledSubscriptionIds.length > 0) {
      console.log(
        `[PendingSignup] stripe-incomplete-cancelled venue=${venueId} ` +
          `subscriptions=${swept.cancelledSubscriptionIds.join(",")}`
      );
    }
    if (!swept.ok) {
      errors.push(`stripe-sweep-failed venue=${venueId}: ${swept.errors.join("; ")}`);
      return false;
    }
  }
  return true;
}
