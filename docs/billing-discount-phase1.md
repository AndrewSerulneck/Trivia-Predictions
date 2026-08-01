# Phase 1 — Schema: discount mirror + audit trail

Read `docs/billing-discounts-plan.md` first. **Do not start this until
`docs/billing-guard-hardening-plan.md` Phases 1–4 are done** — discounts sit
directly on top of the guard predicate those phases introduce.

## What to build

One new migration (creating a new timestamped file is fine; never edit an
existing one) adding:

1. **Discount mirror columns on `billing_subscriptions`**: `stripe_coupon_id`,
   `discount_label` (human-readable, e.g. "20% off" or "3 months free"),
   `discount_percent_off`, `discount_amount_off_cents`, `discount_ends_at`
   (nullable — null means "forever" or "not applicable"). Stripe stays
   authoritative; this is a mirror, same convention as the existing
   `cancel_at_period_end` column.
2. **`billing_discount_grants`** audit table: who granted it (admin user id),
   to which venue/subscription, what type and value, when, and an optional
   free-text reason. This is money given away — the mirror alone only holds
   *current* state, not history, and you will want the paper trail later.

No application code changes in this phase — schema only.
