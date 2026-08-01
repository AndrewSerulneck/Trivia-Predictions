# Phase 4 — Admin UI

Read `docs/billing-discounts-plan.md` first. Phase 3 (admin API actions) must
already be done.

## What to build

In `components/admin/sections/BillingSection.tsx`, add a "Discount" control to
each partner row, next to the existing Grant/Revoke controls — reuse this
section's existing notice/confirm patterns (see how `handleGrant`/`handleRevoke`
surface errors and confirmations today) rather than inventing new UI
conventions.

- A small form: discount type (free months / percent off / dollar off) →
  value → duration (once / N months / forever, as applicable to the type) →
  optional reason text.
- If a subscription already has an **active** discount (readable from the
  Phase 1 mirror columns in the `GET /api/admin/billing` response — extend
  that response's shape if it doesn't already surface these columns), show
  what it is plainly and offer a Remove action instead of the apply form.
- Stripe allows only **one** coupon per subscription at a time — applying a
  second silently replaces the first. Make this obvious in the UI (e.g. "this
  will replace the current 20%-off discount") rather than letting it look like
  discounts stack.

Keep the type × duration combinations honest in the form — not every
combination is legal (e.g. "dollar off" + "forever" is fine, but the free
months type is really just 100%-off + `repeating`, wire it that way rather than
exposing it as a distinct backend concept).

## Tests
A component-level test is optional here; prioritize the form correctly
disabling illegal type/duration combinations and correctly showing the
existing-discount/Remove state over new test infrastructure.
