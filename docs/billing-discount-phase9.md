# Phase 9 — Tests

Read `docs/billing-discounts-plan.md` first. Phases 1–6 (and 5) should already
be done. This phase extends the existing billing test files rather than
starting new ones — do not invent a parallel test structure.

## What to build

1. Unit (`lib/billingDiscounts.ts`, extend if Phases 2/3 didn't already add
   enough coverage): each of the three coupon-backed discount types produces
   the correct Stripe coupon spec; `percent_off > 100` and a malformed
   `repeating` duration are rejected before any Stripe call; offline rows take
   the local-adjustment path and never call Stripe.
2. Route (`app/api/admin/billing/route.ts`): `apply-discount` /
   `remove-discount` including admin-auth enforcement, following the pattern
   in `tests/api.admin.billing-grant-manual-guard.test.ts`.
3. **Regression test (important):** a discounted subscription must still trip
   the hardened "live at Stripe" guard from `docs/billing-guard-hardening-plan.md`
   and must not be able to reach a new Checkout session. Extend
   `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` with a
   discounted-and-active row and confirm `checkout.sessions.create` is still
   never called for it.
4. Webhook: discount expiry/removal correctly clears the mirror (extends
   Phase 6's own test coverage if that phase didn't already cover it fully).

Run the full suite (`npm test`) after, not just the new/touched files.
