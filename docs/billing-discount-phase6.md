# Phase 6 — Webhook sync of discount state

Read `docs/billing-discounts-plan.md` first. Phases 1–3 must already be done.
(Numbered 6 to match the master plan's phase numbering; run this before
Phase 5 per the plan's suggested order, so the partner-facing display built in
Phase 5 never shows state that can silently rot.)

## The problem this closes

A coupon with `duration_in_months: 3` expires at Stripe on its own — no action
happens on our side when that occurs. Without this phase, our Phase 1 mirror
columns would keep advertising a discount to the admin and the partner long
after it's gone, and a discount removed directly in the Stripe Dashboard
(bypassing our admin UI) would do the same.

## What to build

In `app/api/webhooks/stripe/route.ts`, handle `customer.subscription.updated`
(and `customer.discount.deleted` / relevant `customer.discount.*` events if
the discount is being tracked at the customer level rather than purely on the
subscription) to re-sync the Phase 1 mirror columns on `billing_subscriptions`
from the event payload's current discount state — clearing them when Stripe
reports no discount is present, and updating them if Stripe reports a
different one than what's mirrored.

Be precise about the event shape: read the discount off the subscription
object in the event payload rather than assuming it always matches what your
own last admin action set, since this is exactly the path that catches drift
from writes that didn't originate in our own admin UI.

## Tests
Extend `tests/api.webhooks.stripe-stale-guard.test.ts`'s pattern (or add a
sibling file) with: a `customer.subscription.updated` event carrying no
discount clears the mirror columns; one carrying a different coupon than
currently mirrored updates them to match.
