# Phase 3 — Admin API actions

Read `docs/billing-discounts-plan.md` first. Phase 2 (`lib/billingDiscounts.ts`)
must already be done.

## What to build

Extend the existing `action`-dispatch `POST` handler in
`app/api/admin/billing/route.ts` (already handles `"revoke"` and
`"grant-manual"` — follow that same pattern, don't invent a new route) with
two new actions:

- `"apply-discount"` — validate the request body server-side before calling
  into `lib/billingDiscounts.ts`: reject `percent_off` outside `0 < x <= 100`,
  reject negative `amount_off_cents`, reject `duration: "repeating"` with no
  `duration_in_months` provided. This validation is the actual safety net
  against a fat-fingered "1000% off" or similar — the helper module trusts its
  caller. Write the corresponding `billing_discount_grants` row (Phase 1) in
  the same request, including the admin's auth identity from
  `requireAdminAuth`.
- `"remove-discount"` — calls `removeDiscountFromSubscription`.

Reuse `requireAdminAuth` exactly as the existing actions do.

## Tests
Follow the pattern in `tests/api.admin.billing-grant-manual-guard.test.ts` /
`tests/api.admin.billing-cancel-at-period-end.test.ts` — mock
`lib/billingDiscounts.ts`, assert admin-auth is enforced, assert each rejected
input (over-100 percent, negative amount, missing duration_in_months) never
reaches the helper module.
