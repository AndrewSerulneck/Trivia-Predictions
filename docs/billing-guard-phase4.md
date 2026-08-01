# Phase 4 — Resume guard: accept anything live at Stripe

Read `docs/billing-guard-hardening-plan.md` first. Phase 1
(`classifyBillingRow`) must already exist.

Product decision already made (do not re-litigate): a `past_due` subscription
(card declined, but Stripe is still retrying — the subscription itself is
still alive) that also has a scheduled cancel MUST be resumable self-serve,
same as a plain `active + cancelAtPeriodEnd` row. Resuming only un-schedules
the cancellation; it charges nothing and fixes nothing about the card — the
owner separately uses the existing "Update" button (Stripe Billing Portal) to
fix payment.

## What to build

In `app/api/owner/billing/subscription/route.ts`'s `POST` handler, replace the
current `subscription.status !== "active"` guard with
`!classifyBillingRow(subscription).live` — i.e. resume is refused (409,
`code: "checkout_instead"`, existing copy) only for rows that are NOT live at
Stripe (`cancelled` or `no_stripe_object`), and permitted for both `active` and
`past_due`.

`resumeSubscription()` in `lib/billing.ts` itself needs **no change** — it
already refuses tokenless rows with a 400, and un-scheduling a `past_due`
subscription's cancellation is a perfectly valid Stripe operation with no
special-casing required.

## Tests
Extend `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` with a
`past_due + cancelAtPeriodEnd` row: resume must succeed (200,
`cancel_at_period_end` cleared), and Stripe's `subscriptions.update` must be
called with `cancel_at_period_end: false` exactly as it is for the plain
`active + cancelAtPeriodEnd` case. Also confirm a plain `cancelled` row is
still refused with `checkout_instead` (this must not regress).
