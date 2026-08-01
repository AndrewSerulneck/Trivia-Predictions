# Phase 8 — Live verification against real Stripe test mode

Read `docs/billing-guard-hardening-plan.md` first, and also read
`docs/resubscribe-fix-plan.md`'s own Phase 5 section — this phase repeats that
recipe for the new `past_due` states.

## Critical safety note — read before running anything

**`.env.local`'s `STRIPE_SECRET_KEY` is a LIVE key.** Do not start any dev
server the normal way for this phase — it will create and mutate real
subscriptions. Override `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` in the
process environment (process env wins over `.env.local` in Next.js) using the
**test-mode key from the Stripe CLI config**:
`grep -m1 '^test_mode_api_key' ~/.config/stripe/config.toml`. Never point this
verification at the live key. If that config file or key is missing, stop and
ask rather than falling back to the live key.

## What to verify

Using a throwaway hidden venue/owner/auth-user seeded directly via Supabase
(same pattern as `resubscribe-fix-plan.md` Phase 5 — a forged, HMAC-signed
`tp_owner_sess` cookie via `lib/ownerSession.ts`, not real login) and a real
Stripe test-mode subscription:

1. Drive a subscription into `past_due` in test mode (a failing test card such
   as `pm_card_chargeCustomerFail`, or Stripe's dashboard, against the test
   customer) with **no** scheduled cancel. Confirm `POST
   /api/owner/billing/checkout` refuses with `fix_payment` and Stripe's
   `checkout.sessions.create` is never called (list the customer's
   subscriptions afterward — must still be exactly 1).
2. From that same `past_due` state, schedule a cancel
   (`cancel_at_period_end: true` via the existing DELETE endpoint or directly
   in Stripe), then call the resume endpoint. Confirm it succeeds, Stripe shows
   `cancel_at_period_end: false`, and the subscription is still exactly 1 on
   the customer (no duplicate).
3. Confirm the billing page renders the payment-failure state honestly (not
   folded into "Cancelled") and that the Resume button, if shown, actually
   works end-to-end in a real browser (Playwright), not just via curl.
4. Re-confirm the untouched paths still work: plain `active + cancelAtPeriodEnd`
   → resume succeeds; truly `cancelled` → Resubscribe reaches Stripe Checkout.
5. Exercise the self-heal path from Phase 3 if practical to construct in test
   mode (e.g., cancel the Stripe subscription directly via the Stripe API
   without going through our endpoints, leaving our mirror stale, then hit
   Checkout and confirm it self-corrects and proceeds rather than staying
   wrongly refused).

Clean up every seeded Supabase row and every Stripe test object afterward —
don't leave throwaway data behind. Report the full set of results plainly; if
anything above doesn't hold, stop and flag it rather than proceeding to a
"verified" conclusion.
