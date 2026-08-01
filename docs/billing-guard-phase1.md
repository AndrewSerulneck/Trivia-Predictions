# Phase 1 — Shared "is this row live at Stripe" predicate

Read `docs/billing-guard-hardening-plan.md` first for full rationale — the
short version: every existing billing guard was written against
`status === "active"`, but `past_due` (card declined, Stripe still retrying)
is ALSO live at Stripe and slips through every one of those guards. This
phase introduces the concept precisely, in one place, so the routes touched
in later phases can share it instead of re-deriving it and drifting.

## What to build

In `lib/billing.ts`, add:

```ts
export type BillingRowState =
  | { live: true;  reason: "active" | "past_due" }
  | { live: false; reason: "cancelled" | "no_stripe_object" };
```

And a pure function `classifyBillingRow(row)` that takes the same shape of row
the existing helpers already take (at minimum `status` and
`stripe_subscription_id`) and returns a `BillingRowState`:

- No `stripe_subscription_id` → `{ live: false, reason: "no_stripe_object" }`
  (first-time signup, or an offline/check-billed row — nothing exists at
  Stripe, so there is nothing to protect against).
- `status === "active"` → `{ live: true, reason: "active" }`
- `status === "past_due"` → `{ live: true, reason: "past_due" }`
- `status === "cancelled"` → `{ live: false, reason: "cancelled" }`

This is a pure addition — no other file should change in this phase, and no
route's behavior should change yet. That comes in later phases, once this
predicate exists to build on.

## Tests
Add a focused unit test file (or extend `tests/lib.billing.cancel-subscription.test.ts`'s
sibling pattern) covering all four inputs above, including the
no-token-but-active-status edge case (should still read as `no_stripe_object`
since there's genuinely nothing at Stripe to protect).
