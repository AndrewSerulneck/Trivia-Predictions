-- Phase 1 of docs/billing-discounts-plan.md: schema only, no application code.
--
-- 1. Discount mirror on billing_subscriptions. Stripe (a Coupon, or a swapped
--    Price for the permanent-custom-price case) stays authoritative; these
--    columns just let the admin list and partner billing page render the
--    current discount without a Stripe call per row — same convention as the
--    existing cancel_at_period_end mirror column.
-- 2. billing_discount_grants: an append-only audit trail of who granted what
--    discount, to which subscription, and why. The mirror only holds current
--    state, not history, and this is money given away.

alter table public.billing_subscriptions
  add column if not exists stripe_coupon_id text,
  add column if not exists discount_label text,
  add column if not exists discount_percent_off integer,
  add column if not exists discount_amount_off_cents integer,
  add column if not exists discount_ends_at timestamptz;

create table if not exists public.billing_discount_grants (
  id uuid primary key default gen_random_uuid(),
  venue_id text references public.venues(id) on delete cascade not null,
  subscription_id uuid references public.billing_subscriptions(id) on delete cascade not null,
  granted_by text not null,
  discount_type text not null check (
    discount_type in ('free_months', 'percent_off', 'amount_off', 'custom_price')
  ),
  free_months integer,
  percent_off integer,
  amount_off_cents integer,
  custom_price_cents integer,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_discount_grants_venue_id
  on public.billing_discount_grants(venue_id);
create index if not exists idx_billing_discount_grants_subscription_id
  on public.billing_discount_grants(subscription_id);

alter table public.billing_discount_grants enable row level security;

-- Admin-only table (no owner-facing reads); accessed via supabaseAdmin
-- (service role, bypasses RLS) same as billing_subscriptions writes today.
-- No policies defined, matching the deny-by-default posture for admin-only
-- tables elsewhere in this schema.
