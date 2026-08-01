# Phase 2 — Stripe discount helpers

Read `docs/billing-discounts-plan.md` first. Phase 1 (schema) must already be
done.

## SDK shape — already resolved, do not re-investigate

This repo pins `"stripe": "^22.3.1"`. Its own type definitions
(`node_modules/stripe/esm/resources/Subscriptions.d.ts`) only define the
`discounts: [{ coupon: string }]` array param on subscription create/update —
the older single-field `coupon:` param does not exist in this version. Use
`stripe.subscriptions.update(id, { discounts: [{ coupon: couponId }] })`
directly; there is no ambiguity left to resolve here.

## What to build

New server-only module `lib/billingDiscounts.ts`, beside `lib/billing.ts` and
following its `CancelResult`-style return shape
(`{ok:true, ...} | {ok:false, status, error}`) so routes built in later phases
stay uniform with the existing ones:

- `createOrReuseCoupon(spec)` — `spec` covers the three coupon-backed types
  (N free months, percent off, fixed dollar off) with their duration. Search
  for an equivalent existing Stripe coupon before creating a new one, so
  repeated identical grants don't mint duplicate coupon objects.
- `applyDiscountToSubscription(row, spec)` — for a row with a
  `stripe_subscription_id`, attach via the `discounts:` param above, then
  mirror the resulting coupon id/label/percent/amount/end-date onto the
  `billing_subscriptions` row (the columns from Phase 1). **For a
  tokenless offline/check-billed row** (no `stripe_subscription_id`), there is
  nothing at Stripe to attach to — take a local-only path instead: free months
  push `current_period_end` forward by N months; percent/fixed off adjusts
  `amount_cents` directly for the admin's own record-keeping. This carve-out
  must be explicit, not an afterthought — get it wrong and granting a discount
  to a check-paying partner either crashes or silently does nothing.
- `removeDiscountFromSubscription(row)` — clears the Stripe-side discount (for
  Stripe-backed rows) and/or the local mirror columns (for offline rows).

Do NOT touch the permanent-custom-price case here — that is a different
mechanism (a Price swap, not a coupon) and is its own later phase.

## Tests
Unit tests for each of the three coupon-backed spec types producing the
correct Stripe coupon parameters; `percent_off > 100` and a `repeating`
duration with no `duration_in_months` are rejected before any Stripe call;
offline rows take the local-adjustment path and never call Stripe.
