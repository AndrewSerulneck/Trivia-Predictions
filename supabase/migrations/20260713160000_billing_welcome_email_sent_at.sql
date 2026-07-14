-- Idempotency marker for the Phase 8 partner welcome email: set once the
-- checkout.session.completed webhook successfully sends it, so a Stripe
-- webhook retry (or a later customer.subscription.updated for the same
-- subscription) never re-sends it. Additive ALTER on an existing table — RLS/
-- grants/policies already established by 20260627100000_venue_owner_billing.sql.

alter table public.billing_subscriptions
  add column if not exists welcome_email_sent_at timestamptz;
