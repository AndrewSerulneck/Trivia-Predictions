# Phase 7 — Promotion codes for new signups

Read `docs/billing-discounts-plan.md` first. Phases 1–6 (and 5, 9) should
already be done — this phase is an independent add-on to the core
admin-granted-discount slice, not a dependency of it.

## What to build

1. **Checkout flag (the nearly-free part):** in
   `app/api/owner/billing/checkout/route.ts`, add
   `allow_promotion_codes: true` to the `stripe.checkout.sessions.create(...)`
   call. This alone lets a partner type a code (e.g. `LAUNCH50`) into Stripe's
   own Checkout UI at signup — no new code path required on our side for
   redemption itself, since Stripe handles matching the code to its underlying
   coupon and applying it.
2. **Admin management surface:** extend `app/api/admin/billing/route.ts` (or a
   sibling admin billing route if that file is getting large) with actions to
   create, list, and deactivate Stripe Promotion Codes
   (`stripe.promotionCodes.create/list/update`) — each wraps an existing
   coupon (reuse `createOrReuseCoupon` from `lib/billingDiscounts.ts`, Phase 2)
   with `max_redemptions` and/or `expires_at`. Surface redemption counts in the
   admin UI (`components/admin/sections/BillingSection.tsx` or a new small
   section) so you can see which codes are actually being used.

## Note on scope
This phase is about **new signups only** — a promo code entered at Checkout
has no bearing on an existing subscription. Applying a discount to an existing
subscriber is Phases 2–4's admin-grant path, not this one.

## Tests
Unit-test promo code creation validates `max_redemptions`/`expires_at` inputs
the same way Phase 3's discount validation does. A live-mode assertion that
`allow_promotion_codes: true` is present on the Checkout session params is
enough for the flag itself — no need to simulate real code redemption in unit
tests, since that logic lives entirely in Stripe's own Checkout UI.
