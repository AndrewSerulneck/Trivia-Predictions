# Phase 7 — Extend the test matrix

Read `docs/billing-guard-hardening-plan.md` first. Phases 1–6 should already
be done. This phase widens existing test files rather than inventing new ones
— do not create a parallel test file structure.

## What to build

1. In `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` (already
   drives the real handlers over `{none, active, active+cancelAtPeriodEnd,
   cancelled}` × `{resume, checkout}`): widen the state axis to also include
   `past_due` and `past_due + cancelAtPeriodEnd`, for both endpoints. The
   load-bearing assertion for both new rows on the checkout side is that
   `stripe.checkout.sessions.create` is **never called** — this is the
   regression test for the double-billing hole this whole plan exists to
   close.
2. Add the self-heal cases from Phase 3: mirror-live + Stripe-retrieve-says-
   canceled → checkout allowed, row corrected; mirror-cancelled +
   Stripe-retrieve-says-paused → checkout refused; `resource_missing` reads as
   dead, not a 502.
3. Unit-test `classifyBillingRow` directly (if Phase 1 didn't already add this)
   in a `tests/lib.billing.*` file matching the existing naming convention.

Run the full suite (`npm test`) after, not just the new/touched files — this
phase is explicitly about catching regressions across the whole billing
surface, not just the new cases.
