-- Phase 4 of the check/offline-payment feature: promote the offline-billing
-- marker from a `plan_type = 'manual_check'` magic string to a first-class,
-- orthogonal column. `plan_type` describes the plan/product; `billing_method`
-- describes HOW it is paid. This lets the billing automation (Stripe webhook,
-- renewal cron) filter on an explicit dimension instead of overloading plan_type,
-- and lets an offline subscription keep a normal plan_type ('subscription') so
-- the owner-facing UI reads cleanly.
--
-- Additive + backfilled with a safe default, so existing behavior is unchanged:
-- every current row is Stripe/card-billed and defaults to 'stripe'.

alter table public.billing_subscriptions
  add column if not exists billing_method text not null default 'stripe'
    check (billing_method in ('stripe', 'offline'));

-- Backfill any rows that used the interim Phase-1 marker, and normalize their
-- plan_type back to the standard product label now that the method is tracked
-- separately.
update public.billing_subscriptions
  set billing_method = 'offline',
      plan_type = 'subscription'
  where plan_type = 'manual_check';

-- The renewal cron filters active, non-offline subscriptions that are due.
create index if not exists idx_billing_subscriptions_billing_method
  on public.billing_subscriptions(billing_method);
