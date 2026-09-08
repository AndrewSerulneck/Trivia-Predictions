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
  /** POST /api/owner/signup (Phase 5) — creating accounts, deliberately strict. */
  signupSubmit: { windowSeconds: 3600, max: 5 },
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
 * With no SESSION_SECRET (local dev) a fixed literal is used. That is fine for
 * grouping — the salt exists to stop an IP being recovered from a database
 * dump, and local dev has no production IPs in it.
 */
export function hashRequesterIp(bucket: string, ip: string): string {
  const salt = process.env.SESSION_SECRET?.trim() || "self-serve-signup-dev-salt";
  return createHash("sha256").update(`${bucket}:${ip}:${salt}`).digest("hex");
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
 */
export async function rateLimit(
  request: Request,
  bucket: RateLimitBucket,
  rule: RateLimitRule = SIGNUP_RATE_LIMITS[bucket]
): Promise<RateLimitResult> {
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

  const ipHash = hashRequesterIp(bucket, deriveRequesterIp(request));

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
