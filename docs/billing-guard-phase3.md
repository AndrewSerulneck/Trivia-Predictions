# Phase 3 — Stale-mirror self-heal against Stripe

Read `docs/billing-guard-hardening-plan.md` first. Phase 2 (checkout guard
rewrite) must already be done.

Our `billing_subscriptions` row is a **mirror** of Stripe, kept in sync by a
webhook. If that mirror is ever wrong — a webhook was missed, or Stripe's
dashboard was used to pause/cancel something directly — the guards from
Phase 2 read stale local state and could either permanently lock a real
customer out of Checkout, or (worse) let a Checkout through for a subscription
that is actually still alive at Stripe (Stripe's `paused` status maps into our
local `cancelled` via `mapStripeSubscriptionStatus`, even though a paused
subscription still exists and would duplicate).

## What to build

In `app/api/owner/billing/checkout/route.ts`, before finalizing the
Phase 2 guard decision, add a Stripe-truth check on the two paths where being
wrong matters:

1. **About to refuse** (mirror says live: `active`/`past_due`). Call
   `stripe.subscriptions.retrieve(stripe_subscription_id)`. If Stripe reports
   `canceled` or `incomplete_expired`, or the call throws with Stripe's
   `resource_missing` error code, the subscription is actually dead — correct
   our row (`status: "cancelled"`) and fall through to allow Checkout instead
   of refusing.
2. **About to allow** (mirror says `cancelled` but `stripe_subscription_id` is
   still set — i.e., there IS a Stripe object on record, just marked dead
   locally). Retrieve it. If Stripe reports it as still live (this is exactly
   the `paused` case), refuse Checkout instead of allowing — the mirror was
   wrong in the dangerous direction.

Both are one extra Stripe API call, and only on the Checkout path (never on
page load / `GET /api/owner/billing`). Handle `resource_missing` explicitly —
a deleted test-mode object or a wrong-mode id (test id against a live key, or
vice versa) must read as "dead", not surface as an uncaught 502.

## Tests
Mock `stripe.subscriptions.retrieve` in the checkout route test file for both
directions: mirror-live-but-Stripe-says-canceled → Checkout allowed and the row
corrected in the DB; mirror-cancelled-but-Stripe-says-paused → Checkout
refused. Also cover `resource_missing` reading as dead rather than a 502.
