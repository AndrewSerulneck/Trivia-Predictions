import "server-only";

import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Partner Self-Serve Signup — Phase 1 rate limiter.
// See docs/partner-self-serve-signup-plan.md §4 Phase 1.
//
// Every /api/signup/* route is reachable by an unauthenticated stranger and
// every call bills Google (Maps JS loads, Places Autocomplete sessions, Place
// Details). This is the only thing standing between that surface and a scraper,
// so it is deliberately conservative.
//
// Storage is the `signup_attempts` table (migration
// 20260907130000_partner_self_serve_signup_foundations.sql), NOT an in-memory
// map: serverless instances do not share state, so an in-process counter would
// reset on every cold start and scale linearly with concurrency.
//
// The QUOTA DECISION lives in Postgres, in the `claim_signup_attempt` RPC
// (migration 20260908120000_signup_attempt_atomic_rate_limit.sql) — an
// advisory-locked count-then-insert, the same pattern as `award_cycle_winner`.
// This file must never count attempts or compare them to `max` itself; doing so
// is a read-then-write race, which is exactly Finding #6 of
// docs/self-serve-signup-review-fixes-plan.md.

/** A bucket + window. One row in `signup_attempts` == one allowed call. */
export type RateLimitRule = {
  /** Sliding window length, in seconds. */
  windowSeconds: number;
  /** Maximum allowed calls per hashed IP inside the window. */
  max: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the caller may retry. 0 when allowed. */
  retryAfterSeconds: number;
  /** Set when the limiter itself failed (fail-closed) rather than the caller being over quota. */
  unavailable?: boolean;
};

/**
 * Per-route quotas. Places is billed per Autocomplete *session* and per Details
 * *call*, so it is limited harder than the Maps JS key handout (which a single
 * page load fetches exactly once).
 *
 * These are per hashed IP. A bar owner filling the wizard once uses ~1 maps-key,
 * ~4-8 predicts and 1-2 details.
 */
export const SIGNUP_RATE_LIMITS = {
  /** GET /api/signup/maps-key — one per page load, a few retries on flaky networks. */
  mapsKey: { windowSeconds: 60, max: 10 },
  /** POST /api/signup/places (autocomplete) — debounced at 300ms client-side. */
  placesPredict: { windowSeconds: 60, max: 20 },
  /** POST /api/signup/places (details) — one per prediction the user actually taps. */
  placesDetails: { windowSeconds: 60, max: 10 },
  /**
   * GET /api/signup/venue-map (Phase 4) — the review screen's Static Maps
   * thumbnail. Billed per request like Places Details, and one review screen
   * fetches exactly one image, so it is limited on the tighter of the two
   * Google tiers rather than maps-key's.
   */
  venueMap: { windowSeconds: 60, max: 10 },
  /**
   * POST /api/owner/signup — the INNER, identity-keyed bucket.
   *
   * Keyed on `IP + normalised email`, not the IP alone (see
   * `rateLimitSignupSubmit` below and
   * docs/abandoned-signup-cleanup-plan.md §4.1b). It was 5/hour/IP, which fails
   * CLOSED with a 429 and an hour-long wait — the single worst error this
   * surface can show, because the person hitting it is an honest partner who
   * fumbled: a mistyped ZIP that fails server validation, a dropped connection
   * retried, a duplicate-venue 409 answered and resubmitted, a supersede. Six of
   * those and they were locked out for an hour.
   *
   * 15 is generous for one fumbling human and still far below anything useful
   * for scripted account creation — which is capped by `signupSubmitIp` below
   * regardless of how many emails the caller varies through.
   */
  signupSubmit: { windowSeconds: 3600, max: 15 },
  /**
   * POST /api/owner/signup — the OUTER, IP-only bucket.
   *
   * The anti-abuse invariant. The inner bucket keys on the email, so an attacker
   * who varies the email gets a fresh inner bucket every time; this one does not
   * move, and is what actually caps account creation from a single address.
   *
   * 40/hour is deliberately well above one venue's plausible traffic (a bar with
   * three staff fumbling on the same WiFi is ~15-20) and deliberately a hard
   * ceiling. It widens worst-case scripted abuse from 5/hour to 40/hour; that is
   * the price of the shared-NAT fix, accepted because account creation is
   * additionally gated by the email-uniqueness check
   * (lib/ownerEmailAvailability.ts) and every row it creates is a pending signup
   * subject to the one-hour purge tier (lib/signupSweep.ts).
   */
  signupSubmitIp: { windowSeconds: 3600, max: 40 },
  /**
   * POST /api/signup/email-available — the step-2 "is this email taken?"
   * pre-check.
   *
   * An HOUR-long window, not a per-minute one, and that is the whole point: this
   * route is an email-enumeration oracle (see lib/ownerEmailAvailability.ts), so
   * the limit is sized against an attacker walking a list, not against burst
   * traffic. A real partner types one email and edits it once or twice; 15 per
   * hour is generous for that and slow for enumeration.
   */
  emailCheck: { windowSeconds: 3600, max: 15 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof SIGNUP_RATE_LIMITS;

/**
 * First hop of `x-forwarded-for`, else `x-real-ip`, else "". On Vercel the
 * left-most XFF entry is the real client. An empty result means every anonymous
 * caller collapses into ONE shared bucket — strictly safer (more limiting), not
 * less, which is the direction we want when we cannot identify the caller.
 */
export function deriveRequesterIp(request: Request): string {
  const forwardedFor = String(request.headers.get("x-forwarded-for") ?? "").trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return String(request.headers.get("x-real-ip") ?? "").trim();
}

/**
 * SHA-256 of `bucket:ip` salted with SESSION_SECRET. A raw IP is never stored.
 *
 * The bucket name is folded into the hash so one `ip_hash` column can carry
 * independent per-route windows without a second column or a migration.
 *
 * `identity` (§4.1b) narrows the bucket below the IP — today only the normalised
 * signup email, for `signupSubmit`. It is folded in ONLY when non-empty, so
 * every existing bucket hashes exactly as it did before this parameter existed
 * and no live window is reset by the deploy that adds it. An EMPTY identity is
 * therefore the plain per-IP hash for that bucket, which is the conservative
 * direction we want when the caller gave us nothing to key on (an unparseable or
 * oversized body): every such caller from one IP collapses into ONE shared
 * bucket rather than getting a fresh one each time.
 *
 * The identity is PII, and it never leaves this function un-hashed — it goes
 * into the same salted digest the IP does, and `signup_attempts` stores only the
 * digest.
 *
 * With no SESSION_SECRET (local dev) a fixed literal is used. That is fine for
 * grouping — the salt exists to stop an IP being recovered from a database
 * dump, and local dev has no production IPs in it.
 */
export function hashRequesterIp(bucket: string, ip: string, identity = ""): string {
  const salt = process.env.SESSION_SECRET?.trim() || "self-serve-signup-dev-salt";
  const key = identity ? `${bucket}:${ip}:${identity}:${salt}` : `${bucket}:${ip}:${salt}`;
  return createHash("sha256").update(key).digest("hex");
}

/** The ledger table itself is gone — the foundations migration never ran. */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || String(error.message ?? "").includes("signup_attempts");
}

/**
 * The RPC is gone. This is the mid-deploy skew case (Risk #3 of
 * docs/self-serve-signup-review-fixes-plan.md): code that calls
 * `claim_signup_attempt` is live but the migration has not been applied.
 *
 * PostgREST answers a function it cannot find in its schema cache with
 * `PGRST202`; Postgres itself answers with `42883` (undefined_function). Both
 * must fail CLOSED — a public money-spending route with no limiter is exactly
 * what this module exists to prevent.
 */
function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /claim_signup_attempt/.test(String(error.message ?? ""));
}

/** One row of `claim_signup_attempt`'s `returns table (...)`. */
type ClaimSignupAttemptRow = {
  allowed?: boolean | null;
  retry_after_seconds?: number | null;
};

/**
 * Sliding-window check against `signup_attempts`, decided ATOMICALLY in
 * Postgres by the `claim_signup_attempt` RPC.
 *
 * The RPC takes a transaction-scoped advisory lock on the hashed IP, counts the
 * attempts inside the window, and inserts this one only if the caller is under
 * quota — so N concurrent requests from one IP consume exactly `max` slots
 * between them. This module deliberately does NOT count, compare or window
 * anything itself: the previous read-then-write version let ~40 signups through
 * a cap of 5 (Finding #6). Same pattern as `award_cycle_winner`; see
 * supabase/migrations/20260908120000_signup_attempt_atomic_rate_limit.sql.
 *
 * Denied calls are not recorded: one row means one Google-billed call, so a
 * blocked hammering client cannot inflate our own database as a side effect of
 * being blocked.
 *
 * **Fails closed.** If Supabase is unreachable, the table or the function is
 * missing, or the RPC errors or answers with a shape we do not recognise, the
 * call is denied (`unavailable: true`). A public route that spends money on
 * every request must not degrade into an open one.
 *
 * `options.identity` (§4.1b) narrows the bucket below the IP — see
 * `hashRequesterIp`. Only `rateLimitSignupSubmit` passes one today.
 */
export async function rateLimit(
  request: Request,
  bucket: RateLimitBucket,
  options: { identity?: string; rule?: RateLimitRule } = {}
): Promise<RateLimitResult> {
  const rule = options.rule ?? SIGNUP_RATE_LIMITS[bucket];
  const windowSeconds = Math.max(1, Math.floor(rule.windowSeconds));
  const max = Math.max(1, Math.floor(rule.max));
  const closed: RateLimitResult = {
    allowed: false,
    retryAfterSeconds: windowSeconds,
    unavailable: true,
  };

  if (!supabaseAdmin) {
    console.error("[SignupRateLimit] supabase-admin-unconfigured", { bucket });
    return closed;
  }

  const ipHash = hashRequesterIp(bucket, deriveRequesterIp(request), options.identity ?? "");

  const { data, error } = await supabaseAdmin.rpc("claim_signup_attempt", {
    p_ip_hash: ipHash,
    p_window_seconds: windowSeconds,
    p_max: max,
  });

  if (error) {
    if (isMissingFunctionError(error)) {
      console.error(
        "[SignupRateLimit] claim_signup_attempt-missing — run supabase/migrations/20260908120000_signup_attempt_atomic_rate_limit.sql",
        { bucket }
      );
    } else if (isMissingTableError(error)) {
      console.error(
        "[SignupRateLimit] signup_attempts-missing — run supabase/migrations/20260907130000_partner_self_serve_signup_foundations.sql",
        { bucket }
      );
    } else {
      console.error("[SignupRateLimit] rpc-failed", { bucket, message: error.message });
    }
    return closed;
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimSignupAttemptRow | null;
  if (typeof row?.allowed !== "boolean") {
    console.error("[SignupRateLimit] rpc-malformed-response", { bucket });
    return closed;
  }

  if (!row.allowed) {
    const retryAfter = Number(row.retry_after_seconds);
    return {
      allowed: false,
      retryAfterSeconds:
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(Math.ceil(retryAfter), windowSeconds)
          : windowSeconds,
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * The whole quota decision for `POST /api/owner/signup`, in one place.
 * docs/abandoned-signup-cleanup-plan.md §4.1b.
 *
 * TWO buckets, and the ORDER IS LOAD-BEARING:
 *
 *   1. `signupSubmit`   — keyed on `IP + normalised email`. 15/hour.
 *   2. `signupSubmitIp` — keyed on the IP alone.            40/hour.
 *
 * **Why two.** A single IP-only bucket has to be both things at once and cannot
 * be: low enough to stop scripted account creation, and high enough that a
 * fumbling human is not locked out for an hour. Worse, the IP is not the person
 * — a bar's shared WiFi and mobile carrier-grade NAT both collapse many people
 * into one bucket, and the partner signing up is *very often on the venue's own
 * WiFi*, the single most likely place for two staff to try this on the same
 * afternoon. Splitting the two concerns lets each get the right number.
 *
 * **Why the identity bucket goes FIRST.** `claim_signup_attempt` records only
 * ALLOWED calls, so a denial consumes nothing. Checking the narrow bucket first
 * means a partner who fumbles their way to 15 is stopped by their OWN bucket and
 * burns at most 15 of the shared 40 — leaving room for the colleague on the next
 * stool. Reverse the order and that same person quietly eats the whole venue's
 * ceiling, which is the exact failure this phase exists to remove.
 *
 * **Why the IP bucket still exists.** The inner bucket is keyed on
 * attacker-controlled input: vary the email and you get a fresh one every time.
 * The outer bucket does not move, so it — not the inner one — is what actually
 * caps account creation from a single address. Never drop it, and never reorder
 * these so a request can reach the writes having claimed only the inner slot.
 *
 * `email` must already be trimmed and lowercased (the route derives it through
 * `draftFromBody`, the same normalisation `classifyEmailForSignup` sees). An
 * EMPTY email — an unparseable or oversized body — is not an escape hatch: it
 * hashes to the plain per-IP key for the inner bucket, so every such caller from
 * one IP shares one bucket. See `hashRequesterIp`.
 *
 * Fails CLOSED in both tiers, exactly as `rateLimit` does.
 */
export async function rateLimitSignupSubmit(request: Request, email: string): Promise<RateLimitResult> {
  const identity = String(email ?? "").trim().toLowerCase();

  const perIdentity = await rateLimit(request, "signupSubmit", { identity });
  if (!perIdentity.allowed) return perIdentity;

  return rateLimit(request, "signupSubmitIp");
}

/**
 * Standard 429 (or 503, when the limiter itself is down) for a denied call.
 * Every /api/signup/* route returns exactly this so the client has one shape to
 * handle.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const status = result.unavailable ? 503 : 429;
  const error = result.unavailable
    ? "Signup is temporarily unavailable. Please try again in a moment."
    : "Too many requests. Please slow down and try again shortly.";
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, result.retryAfterSeconds)),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Housekeeping for the Phase 6 sweep cron: drop ledger rows older than the
 * longest window we use. Nothing reads them, and the limiter never prunes
 * inline (an un-awaited delete is not reliable in serverless).
 */
export async function pruneSignupAttempts(olderThanSeconds = 24 * 60 * 60): Promise<number> {
  if (!supabaseAdmin) return 0;
  const cutoff = new Date(Date.now() - Math.max(60, olderThanSeconds) * 1000).toISOString();
  const deleted = await supabaseAdmin
    .from("signup_attempts")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (deleted.error) {
    console.error("[SignupRateLimit] prune-failed", { message: deleted.error.message });
    return 0;
  }
  return deleted.data?.length ?? 0;
}
