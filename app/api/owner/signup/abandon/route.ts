import { NextResponse } from "next/server";

import { clearOwnerSessionCookie } from "@/lib/ownerSession";
import { findPendingSignupByOwnerId, purgePendingSignup } from "@/lib/pendingSignup";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

// Abandoned-signup cleanup — Phase 3 (docs/abandoned-signup-cleanup-plan.md).
//
// "Cancel and start over" from /owner/billing/setup: a partner who has tapped
// through the wizard, landed on the priced card, and decided not to pay. This
// erases what they entered AT THAT MOMENT rather than waiting for the sweep,
// which is requirement #2 for the visible case.
//
// ── Why this is authenticated by the OWNER SESSION COOKIE, never an email ────
//
// The teardown behind it deletes an `auth.users` row, a table SHARED WITH
// PLAYERS (CLAUDE.md standing prohibition). Taking an email in the body would
// hand a stranger holding somebody's address a delete button; taking the caller's
// own owner id from the signed session cookie means the only signup a caller can
// destroy here is the one they are sitting in. (POST /api/owner/signup does
// accept an email collision and supersede it — that is Phase 2a's deliberate,
// argued trade, made acceptable by the fact that a signup submit REPLACES what
// it destroys. Nothing replaces what this route destroys, so it does not get the
// same latitude.)
//
// ── This route decides nothing ───────────────────────────────────────────────
//
// Every question — "is this owner an unpaid, never-finished signup?" and "what
// exactly gets deleted, in what order?" — is answered by lib/pendingSignup.ts,
// the one home of the predicate. This file is wiring: authenticate, ask, purge,
// clear the cookie. Do not add a clause here.

const notFound = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

const fail = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  // Consistent with every other surface in this flow: with the flag off there is
  // no wizard to abandon, so the route does not exist either. Phase 4's sweep is
  // what collects anything left behind by a rollback.
  if (!isSelfServeSignupEnabled()) return notFound();

  // No rateLimit() here, deliberately. The signup routes are rate limited because
  // they are PUBLIC and unauthenticated; this one is gated by requireOwnerAuth,
  // and an authenticated owner deleting their own debris is not a spam vector.
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const lookup = await findPendingSignupByOwnerId(auth.ownerId);

  if (!lookup.ok) {
    // Fails CLOSED: a read error is not "not pending" and is certainly not
    // permission to delete. The reason is logged, never returned — the same rule
    // the public signup routes follow.
    console.error("[OwnerSignupAbandon] lookup-failed", { ownerId: auth.ownerId, message: lookup.message });
    return fail("Something went wrong. Please try again.", 500);
  }

  if (!lookup.pending) {
    // A real owner tapped a control that should not have been rendered for them,
    // or this is a double-tap after the first purge already succeeded. Either way
    // the answer is the same: touch nothing. `findPendingSignupByOwnerId` has
    // already logged which clause refused.
    console.log("[OwnerSignupAbandon] not-pending", { ownerId: auth.ownerId });
    return fail("There's nothing to cancel on this account.", 409, { code: "not_pending" });
  }

  // `purgePendingSignup` re-runs the whole predicate itself before deleting
  // anything (lib/pendingSignup.ts) and cancels any abandoned Stripe object
  // first. The lookup above is NOT permission to skip that — it is what decides
  // whether the partner sees a 409 instead of a 200.
  const purge = await purgePendingSignup(lookup.pending.ownerId);

  if (!purge.ok) {
    // Nothing, or only part, was deleted. The session cookie is left alone: the
    // owner row may still exist, and signing the partner out of a half-purged
    // signup would strand them with no way back to this button. They can retry,
    // and Phase 4's sweep is the backstop.
    console.error("[OwnerSignupAbandon] purge-failed", {
      ownerId: lookup.pending.ownerId,
      errors: purge.errors,
    });
    return fail("Something went wrong. Please try again.", 500);
  }

  console.log(
    `[OwnerSignupAbandon] purged owner=${lookup.pending.ownerId} venues=${purge.deletedVenueIds.length}`
  );

  // The owner row is gone, so the cookie now points at nothing. Clearing it is
  // not a courtesy: left in place it would send the partner into /owner/* pages
  // that 401 in ways that read like a broken account rather than a finished
  // cancellation.
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": clearOwnerSessionCookie(), "Cache-Control": "no-store" } }
  );
}
