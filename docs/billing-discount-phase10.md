# Phase 10 — Live verification against real Stripe test mode

Read `docs/billing-discounts-plan.md` first, and also
`docs/resubscribe-fix-plan.md`'s Phase 5 section for the base recipe this
repeats.

## Critical safety note — read before running anything

**`.env.local`'s `STRIPE_SECRET_KEY` is a LIVE key.** Do not start any dev
server the normal way for this phase. Override `STRIPE_SECRET_KEY` and
`STRIPE_PRICE_ID` in the process environment (process env wins over
`.env.local` in Next.js) using the **test-mode key from the Stripe CLI
config**: `grep -m1 '^test_mode_api_key' ~/.config/stripe/config.toml`. Never
point this verification at the live key. If that config file or key is
missing, stop and ask rather than falling back to the live key.

## What to verify

Using a throwaway hidden venue/owner/auth-user seeded directly via Supabase
(same pattern as `resubscribe-fix-plan.md` Phase 5) and a real Stripe
test-mode subscription:

1. Apply a **100%-off, 2-month** discount via the admin action from Phase 3.
   Confirm in Stripe test mode that the resulting invoice is actually **$0**,
   and that both the admin billing list and the partner `/owner/billing` page
   show the discount honestly (not just "$100/mo" with no indication).
2. Apply a **percent-off** discount to a *different* already-active test
   subscription (existing-subscriber path, not signup-time). Confirm the next
   invoice reflects the reduced amount.
3. Force the discount to expire or remove it directly via the Stripe API
   (bypassing our admin UI), then trigger/simulate the webhook event from
   Phase 6 and confirm the mirror columns clear and the partner page stops
   showing a discount that no longer exists.
4. Confirm the discounted subscription still cannot reach a new Checkout
   session (the Phase 9 regression test's real-world equivalent) — attempt
   Checkout against the discounted-and-active row and confirm it is refused
   exactly as an un-discounted active row would be.
5. Confirm applying a second discount to a subscription that already has one
   replaces it (Stripe's one-coupon-per-subscription behavior) rather than
   stacking, and that the admin UI reflected this correctly per Phase 4.

Clean up every seeded Supabase row, every Stripe test coupon, and every Stripe
test subscription/customer afterward. Report the full set of results plainly;
if anything above doesn't hold, stop and flag it rather than proceeding to a
"verified" conclusion.
