-- Venue signup hygiene — `venues.checkout_started_at`.
--
-- docs/abandoned-signup-cleanup-plan.md Phase 4 (the tier split, already shipped
-- in lib/signupSweep.ts by Opus 5, 2026-09-09; this migration + the checkout
-- stamp are its Sonnet 5 half).
--
-- This column answers ONE honest question about a pending, hidden, never-paid
-- self-serve signup venue: *did this partner ever reach the Stripe Checkout
-- page?* The abandoned-signup sweep (lib/signupSweep.ts) splits its retention
-- window on the answer:
--
--     checkout_started_at IS NULL  → TIER A: never reached Stripe, reap after
--                                    PENDING_SIGNUP_TTL_MINUTES (default 60m).
--                                    A week is far too long to hold the details
--                                    of somebody who never got near a payment.
--
--     checkout_started_at IS SET   → TIER B: reached Stripe, keep the 7-day
--                                    window (SWEEP_ABANDON_AFTER_DAYS). A card
--                                    can settle late, 3-D Secure takes a while,
--                                    a bank can hold a charge overnight — and
--                                    the webhook writes a billing_subscriptions
--                                    row against this venue when it does.
--
-- Stamped by POST /api/owner/billing/checkout immediately before it hands back a
-- Checkout URL — after `session.url` is confirmed, so a failed Stripe call never
-- stamps. Best-effort: a stamp failure logs and returns the URL anyway (a missed
-- stamp costs one venue an early sweep; a refused Checkout costs a subscription).
--
-- ADD COLUMN IF NOT EXISTS on an existing table: no new RLS work
-- (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md), no backfill, no default. NULL
-- on every existing row is the correct starting state — "we have no evidence
-- this venue reached Stripe", which the tier logic reads as Tier A. Between this
-- migration landing and the stamp code deploying, EVERY venue looks like Tier A;
-- that window is a non-event only because SIGNUP_SWEEP_DELETE_ENABLED is unset
-- (the sweep is log-only). Deploy the stamp code first, or in the same deploy.
--
-- No index: the sweep scan filters on `hidden` + `self_serve_created_at` and
-- partitions on this column in memory. Production's hidden-venue population is a
-- handful of rows and will stay that way.

alter table public.venues
  add column if not exists checkout_started_at timestamptz null;

comment on column public.venues.checkout_started_at is
  'Set by POST /api/owner/billing/checkout just before it returns a Checkout URL. '
  'NULL means "never reached Stripe" — the abandoned-signup sweep (lib/signupSweep.ts) '
  'reaps such a venue after PENDING_SIGNUP_TTL_MINUTES instead of the 7-day window. '
  'Sole writer: app/api/owner/billing/checkout. See docs/abandoned-signup-cleanup-plan.md Phase 4.';
