-- Add Stripe identifiers to the billing tables alongside the existing SlimCD
-- columns. Billing is migrating from SlimCD to Stripe; the SlimCD columns
-- (slimcd_recurring_token, slimcd_ticket) stay nullable for back-compat with any
-- subscriptions created before the cutover. Stripe becomes the source of truth
-- for status via the /api/webhooks/stripe handler.
--
-- These are additive ALTERs on existing tables (no new tables), so RLS/grants/
-- policies are already established by 20260627100000_venue_owner_billing.sql and
-- do not need to be redefined here.

alter table public.billing_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text;

alter table public.billing_invoices
  add column if not exists stripe_invoice_id text;

-- Webhook lookups resolve a subscription row by its Stripe ids.
create index if not exists idx_billing_subscriptions_stripe_customer_id
  on public.billing_subscriptions(stripe_customer_id);

create unique index if not exists idx_billing_subscriptions_stripe_subscription_id
  on public.billing_subscriptions(stripe_subscription_id);

create unique index if not exists idx_billing_invoices_stripe_invoice_id
  on public.billing_invoices(stripe_invoice_id);
