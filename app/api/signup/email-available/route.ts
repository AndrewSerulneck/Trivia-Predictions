import { NextResponse } from "next/server";

import { OWNER_EMAIL_TAKEN_MESSAGE, ownerEmailExists } from "@/lib/ownerEmailAvailability";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isSelfServeSignupEnabled, isValidSignupEmail, SIGNUP_FIELD_LIMITS } from "@/lib/selfServeSignup";

// Partner Self-Serve Signup — the step-2 email pre-check.
//
// WHY THIS ROUTE EXISTS. Before it, a partner whose email already had a
// `venue_owners` row filled in all six steps, tapped "Start subscription", and
// was bounced back to step 2 by the review screen's 409. That jump reads as
// "the wizard reset itself" — it was the single most confusing thing in the
// flow. Now the collision is caught on the field it belongs to, before the
// partner invests five more steps in an account that cannot be created.
//
// IT IS A UX CHECK, NOT A GATE. Nothing here creates, reserves, or locks
// anything, and a caller can skip it entirely. `POST /api/owner/signup` re-runs
// the same lookup through the same module and stays the authority — which also
// covers the race where two people claim one email between check and submit.
//
// PUBLIC, UNAUTHENTICATED AND AN ENUMERATION ORACLE. Gated on the flag +
// `rateLimit()` like its /api/signup/* siblings, never `requireAdminAuth`. The
// enumeration trade-off and why the `emailCheck` bucket is an hour-long window
// are argued in lib/ownerEmailAvailability.ts — read that before widening it.
//
// GENERIC ERRORS ONLY (Finding #7). A lookup failure returns a fixed sentence;
// the Postgres message goes to console.error and never to the body.

const notFound = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSelfServeSignupEnabled()) return notFound();

  const limit = await rateLimit(request, "emailCheck");
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  // Normalised exactly as `draftFromBody` normalises it, or the pre-check and
  // the submit would disagree about which string they are asking about.
  const email = String(body.email ?? "").trim().toLowerCase();

  // A malformed or over-long address is not a lookup — it is the format error
  // the client already renders on blur. Answering `available` here would be a
  // lie; answering 400 lets the wizard fall through to its own message.
  if (!email || email.length > SIGNUP_FIELD_LIMITS.email || !isValidSignupEmail(email)) {
    return json({ ok: false, error: "That email doesn't look right — check for a typo." }, 400);
  }

  const result = await ownerEmailExists(email);
  if (!result.ok) {
    console.error("[SignupEmailCheck] lookup-failed", { message: result.message });
    return json({ ok: false, error: "We couldn't check that email right now. Please try again." }, 503);
  }

  return json({
    ok: true,
    available: !result.exists,
    ...(result.exists ? { error: OWNER_EMAIL_TAKEN_MESSAGE } : {}),
  });
}
