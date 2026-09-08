import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Partner Self-Serve Signup — "does this email already have a partner account?"
//
// THIS IS THE ONE HOME OF THAT QUESTION. It has two callers and they must not
// drift (docs/self-serve-signup-review-fixes-plan.md §2 — a rule that exists in
// two places is what produced five of the original fifteen findings):
//
//   1. POST /api/signup/email-available — the step-2 pre-check, so the wizard
//      refuses to advance past the email field instead of discovering the
//      collision four steps later on the review screen.
//   2. POST /api/owner/signup          — the authoritative check. The pre-check
//      is UX, never a gate: a caller can skip it entirely, and two signups can
//      race between the check and the submit, so the submit re-runs it.
//
// ── On email enumeration ─────────────────────────────────────────────────────
// A route that answers "is this email registered?" is an enumeration oracle,
// and CLAUDE.md's join-flow rule ("no unauthenticated god-mode lookup — it
// would be a username-enumeration leak") is the standing precedent for taking
// that seriously.
//
// It is accepted HERE, narrowly, for two reasons. First, the disclosure already
// exists: POST /api/owner/signup has always returned `email_taken` to an
// anonymous caller, because a signup form cannot both refuse duplicate accounts
// and hide that it did. Moving the answer earlier changes the COST of
// enumeration, not the fact of it. Second, that cost is what the check route's
// rate-limit bucket exists to control — see `emailCheck` in lib/rateLimit.ts,
// which is deliberately an hour-long window and not a per-minute one.
//
// What must NOT happen is a third caller answering this question its own way,
// or a route returning the raw Postgres error, which would turn a boolean into
// a database-shape disclosure. Both are why this module exists.

/**
 * The single partner-facing sentence for "this email is taken".
 *
 * Both routes return this verbatim, and the wizard renders it on the email
 * field. Changing the wording here changes it in both places at once.
 */
export const OWNER_EMAIL_TAKEN_MESSAGE =
  "An account with this email already exists. Sign in instead, or use a different email.";

/**
 * Whether `email` already has a `venue_owners` row.
 *
 * Returns a discriminated result rather than throwing or returning a bare
 * boolean: a lookup FAILURE must never be collapsed into "available", or a
 * transient Supabase blip would let the wizard wave a duplicate through to a
 * submit that then fails on the review screen — exactly the dead end this
 * pre-check exists to remove.
 *
 * `email` is expected already normalised (trimmed + lowercased) by the caller,
 * matching how `draftFromBody` stores it.
 */
export async function ownerEmailExists(
  email: string
): Promise<{ ok: true; exists: boolean } | { ok: false; message: string }> {
  if (!supabaseAdmin) return { ok: false, message: "supabase-admin-unavailable" };

  const existing = await supabaseAdmin
    .from("venue_owners")
    .select("id")
    .eq("email", email)
    .maybeSingle<{ id: string }>();

  if (existing.error) return { ok: false, message: existing.error.message };
  return { ok: true, exists: Boolean(existing.data) };
}
