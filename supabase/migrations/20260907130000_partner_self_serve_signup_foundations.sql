-- Partner Self-Serve Signup — Phase 0 foundations.
-- See docs/partner-self-serve-signup-plan.md §4 Phase 0.
--
-- Two additions, both inert until the later phases (and the
-- NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED flag) turn the flow on:
--
--  1. venues.self_serve_created_at — stamped by POST /api/owner/signup (Phase 5)
--     on rows it creates. It is the guard that lets the Phase 6 abandoned-signup
--     sweep and the Stripe webhook's maybeRevealVenue touch ONLY self-serve
--     rows. Without it the sweep could reap a hidden venue an admin created on
--     purpose (e.g. the Category Blitz global room hc-cbz-live), and the webhook
--     could unhide it. NULL for every existing and every admin-created row.
--
--  2. signup_attempts — backs the Supabase-table-backed sliding-window rate
--     limiter (lib/rateLimit.ts, Phase 1) that protects the public, Google-billed
--     /api/signup/* routes. ip_hash is a SHA-256 of x-forwarded-for salted with
--     SESSION_SECRET — never a raw IP. No FK, no RLS surface beyond service_role:
--     only server code (service role key) ever reads or writes it.

-- 1. Self-serve marker on venues (venues.id is text in this schema).
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS self_serve_created_at timestamptz;

COMMENT ON COLUMN venues.self_serve_created_at IS
  'Set by POST /api/owner/signup for rows created through partner self-serve signup. '
  'NULL for admin-created rows. Guards the Phase 6 abandoned-signup sweep and the '
  'Stripe webhook maybeRevealVenue so neither ever touches an admin-created hidden venue.';

-- 2. Rate-limiter ledger for the public signup surface.
CREATE TABLE IF NOT EXISTS signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The limiter reads exactly this way: attempts for one ip_hash inside a window.
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_hash_created_at
  ON signup_attempts (ip_hash, created_at);

-- Follows supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md: RLS forced, deny-all for
-- the API roles, service_role only.
ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE signup_attempts FROM anon, authenticated;

-- Server-only table: the anon key must never see it. service_role (the admin
-- client used by the API routes) is the sole accessor.
DROP POLICY IF EXISTS "Service role can modify signup_attempts" ON signup_attempts;
CREATE POLICY "Service role can modify signup_attempts"
  ON signup_attempts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE signup_attempts IS
  'Sliding-window rate-limit ledger for the public /api/signup/* routes. '
  'ip_hash = SHA-256(x-forwarded-for + SESSION_SECRET salt); never a raw IP. '
  'Written and read only by server code via the service role key.';
