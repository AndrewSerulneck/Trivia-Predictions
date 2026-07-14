-- Tracks whether an active subscription is scheduled to cancel at the end of
-- the current billing period (owner clicked "Cancel subscription", which uses
-- Stripe's cancel_at_period_end rather than an immediate cancel, so the venue
-- keeps access it already paid for). Without this, our `status` stays 'active'
-- until the real cancellation lands (days/weeks later via the Stripe webhook),
-- so the dashboard has no way to show the pending-cancellation state. Additive
-- ALTER on an existing table — RLS/grants/policies already established by
-- 20260627100000_venue_owner_billing.sql.

alter table public.billing_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
