# Phase 2 — Checkout guard: refuse anything live at Stripe

Read `docs/billing-guard-hardening-plan.md` first. Phase 1 (already done —
`classifyBillingRow` in `lib/billing.ts`) must exist before this phase; if it
doesn't, stop and implement it first.

**This is the highest-risk phase in the whole plan.** A wrong predicate here
either reopens double billing (a second Stripe subscription minted on the same
customer, colliding with the `venue_id`-unique webhook upsert) or wrongly
blocks a paying customer from subscribing. Move carefully and lean on the
existing test matrix pattern in `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`.

## What to build

Rewrite the existing-subscription guard in
`app/api/owner/billing/checkout/route.ts` to branch on
`classifyBillingRow(existing)` instead of the current `status === "active"`
checks:

| row state | response |
|---|---|
| live + `cancelAtPeriodEnd` | 409, `code: "resume_instead"` (existing copy, unchanged) |
| live + `past_due` (not cancelAtPeriodEnd) | 409, **new** `code: "fix_payment"` — copy should say something like "Your last payment failed. Update your card to keep this subscription" and point at the billing portal (`POST /api/owner/billing/portal`) |
| live + `active` (not cancelAtPeriodEnd, not past_due) | 409, already-subscribed (existing copy, unchanged) |
| not live (`no_stripe_object` or `cancelled`) | proceed to create the Checkout session, reusing `stripe_customer_id` if present (unchanged from today) |

Do not touch Phase 3's self-heal logic yet — that lands next and changes what
"not live" means when the local mirror might be stale. This phase should still
trust the local `status`/`cancel_at_period_end` columns as-is.

## Tests
Extend `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` with
`past_due` and `past_due + cancelAtPeriodEnd` rows for the checkout endpoint,
asserting `checkout.sessions.create` is never called in either case — this is
the regression test for the exact hazard this phase closes.
