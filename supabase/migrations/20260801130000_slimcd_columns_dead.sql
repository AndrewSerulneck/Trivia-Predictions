-- Phase 4 of docs/billing-code-review-fixes-plan.md — SlimCD teardown.
--
-- SlimCD was the pre-Stripe payment processor. It was abandoned before launch
-- and never charged a real partner (audited: zero rows carried a token). The
-- application code is gone: lib/slimcd.ts, the hosted-page session/return
-- routes, the owner card/subscribe 410 stubs, and the cron charge loop.
--
-- The columns stay. Dropping a column is irreversible and buys nothing, and the
-- 2026-06/07 migrations that created them are history we don't rewrite. These
-- comments mark them dead so nobody reads them as a live signal — in particular
-- `slimcd_recurring_token` used to be the owner page's "card on file" test,
-- which now derives from stripe_subscription_id instead.

comment on column public.billing_subscriptions.slimcd_recurring_token is
  'DEAD (SlimCD removed 2026-08-01). Nothing reads or writes this. Card-on-file is stripe_subscription_id.';

comment on column public.billing_invoices.slimcd_ticket is
  'DEAD (SlimCD removed 2026-08-01). Nothing reads or writes this. Stripe invoice idempotency uses stripe_invoice_id.';
