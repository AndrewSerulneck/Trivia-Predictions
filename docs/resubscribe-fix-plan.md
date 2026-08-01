# Resubscribe-loops-to-dashboard fix — plan + status

## Bug
Owner cancels → billing shows "Resubscribe" → clicking it bounces back to
`/owner/dashboard` instead of letting them resubscribe.

## Root cause
Cancel is a **scheduled** cancel (`cancel_at_period_end: true`); `status` stays
`"active"` until the paid period actually ends (`lib/billing.ts`
`cancelSubscription`). Two bugs stacked on that fact:

1. `app/owner/billing/page.tsx` showed "Resubscribe" → `/owner/billing/setup`
   whenever `cancelAtPeriodEnd` was true, even though the subscription was
   still `active`.
2. `app/owner/billing/setup/page.tsx` redirects to the dashboard whenever it
   finds a subscription with `status === "active"` — true here — so the setup
   page immediately bounced away.

There's also a **latent** bug (not yet fixed): even without the redirect,
`app/api/owner/billing/checkout/route.ts` 409s on "already has an active
subscription" for the same reason. Creating a new Stripe Checkout session for
a still-active-but-scheduled-to-cancel subscription would also risk minting a
**second** Stripe subscription on the same customer (double billing + a
`venue_id`-unique upsert collision in the webhook).

## Two distinct states, two distinct correct actions
| State | Correct action |
|---|---|
| `status: active`, `cancelAtPeriodEnd: true` (still inside paid period) | **Resume** the existing Stripe subscription (`cancel_at_period_end: false`). No new charge, no Checkout. |
| `status: cancelled` (period elapsed) | New Stripe Checkout — existing `/owner/billing/setup` flow is correct as-is for this case. |

## Phases

- **Phase 1 — DONE.** `lib/billing.ts`: added `resumeSubscription()` next to
  `cancelSubscription()` — un-schedules `cancel_at_period_end` on Stripe,
  mirrors locally, and refuses (400) for tokenless offline/legacy rows since
  those aren't resumable here (admin re-grant is the reactivation path for
  those). Exposed as `POST /api/owner/billing/subscription` in
  `app/api/owner/billing/subscription/route.ts`, alongside the existing
  `DELETE`, with the same `requireOwnerAuth` + venue-ownership guard.

- **Phase 2 — DONE.** `app/owner/billing/page.tsx`: split the single button.
  - `status === "cancelled"` → keeps the `/owner/billing/setup` Link,
    labeled "Resubscribe".
  - `cancelAtPeriodEnd && status === "active" && !isManual` → new "Resume
    subscription" button calling the Phase 1 endpoint, with an optimistic
    `cancelAtPeriodEnd: false` update + `refresh()` (mirrors the existing
    `handleCancel` pattern).
  - `isManual` (offline/check-billed) rows get neither button — they were
    never resumable/resubscribable client-side; contact-support copy already
    covers this case in the payment-method section.

  Typecheck (`npx tsc --noEmit`) passes clean after both phases.

- **Phase 3 — DONE.**
  - `app/owner/billing/setup/page.tsx`: added `cancelAtPeriodEnd` to the local
    `BillingResponse` subscription type and changed the dashboard-redirect
    guard to `status === "active" && !cancelAtPeriodEnd`.
  - `app/api/owner/billing/checkout/route.ts`: existing-sub guard now also
    selects `cancel_at_period_end`; active+scheduled-to-cancel returns a 409
    with `code: "resume_instead"` and copy pointing at the resume endpoint,
    ahead of the still-active plain-409 case.

  Typecheck (`npx tsc --noEmit`) passes clean.

- **Phase 4 — DONE.** Two net-new test files (note: the plan's claim that
  `tests/` had no billing test was wrong — `lib.billing.cancel-subscription.test.ts`
  and `api.admin.billing-cancel-at-period-end.test.ts` already existed and their
  mocking patterns were reused).
  - `tests/lib.billing.resume-subscription.test.ts` — unit tests
    `resumeSubscription` against a mocked Stripe: un-schedules on the existing
    subscription + mirrors the flag, never creates a second subscription, never
    writes `status` locally, 400s a tokenless offline row without touching
    Stripe, 502s a Stripe failure without writing the local mirror.
  - `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` — drives the two
    real route handlers over the full state matrix {no row, active,
    active+cancelAtPeriodEnd, cancelled} × {resume, checkout}, asserting which
    is permitted and that `checkout.sessions.create` is never reached from the
    scheduled-cancel state (the double-billing hazard).

  **One code change was required to make the matrix well-defined:**
  `POST /api/owner/billing/subscription` had no status guard, so a truly
  `cancelled` row would have handed a dead subscription id to Stripe and
  surfaced the processor error as a 502. It now selects `status` and returns a
  409 with `code: "checkout_instead"` — the mirror image of the checkout route's
  `resume_instead`. No UI change needed (the billing page only renders Resume in
  the active+scheduled state), so this is a defense-in-depth server guard.

  Full suite green: 1072 passed / 13 skipped. `npx tsc --noEmit` clean.

- **Phase 5 — DONE (2026-07-31).** Verified end-to-end in a real browser against
  **real Stripe test mode**.

  **Safety note — read before repeating this.** `.env.local`'s
  `STRIPE_SECRET_KEY` is a **LIVE** key, so a dev server started the normal way
  will mutate real subscriptions. The verification ran on port 3100 with
  `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` overridden in the process env
  (process env beats `.env.local` in Next), using the **test-mode key from the
  Stripe CLI config** (`~/.config/stripe/config.toml`, `test_mode_api_key`) —
  that is where the missing test-mode access came from. Never point this
  verification at the live key.

  Setup: a hidden throwaway venue (`sim-billing-verify`) + owner + auth user +
  `billing_subscriptions` row in Supabase, wired to a genuine test-mode
  customer/price/subscription; forged `tp_owner_sess` cookie (signed with
  `SESSION_SECRET`, see `lib/ownerSession.ts`). All of it deleted afterward —
  Supabase back to its prior 2 billing rows, Stripe test customer deleted.

  Results:
  1. Active sub → **Cancel subscription** → badge flips to CANCELLED, **Resume
     subscription** button appears, "You'll keep access until Aug 20, 2026".
     Survives a reload.
  2. `/owner/billing/setup` with active+`cancelAtPeriodEnd` → **does not bounce
     to the dashboard** (the Phase 3 guard; this was the original bug).
  3. `POST /api/owner/billing/checkout` in that state → **409 `resume_instead`**,
     Stripe never called.
  4. **Resume** → badge returns to ACTIVE, "Subscription resumed…", persists
     across reload; Supabase `cancel_at_period_end: false`; and in Stripe the
     customer has **exactly 1 subscription** (`active`,
     `cancel_at_period_end=false`) — **no second subscription was minted**, the
     core hazard this fix exists to prevent.
  5. Truly-cancelled path (Stripe sub cancelled for real, row `cancelled`) →
     **Resubscribe** → setup page → "Subscribe — $100/mo" → reaches
     `checkout.stripe.com` with a `cs_test_…` session at $100.00, reusing the
     existing Stripe customer.
  6. Resume on a cancelled row → **409 `checkout_instead`** (the Phase 4 guard),
     Stripe never called.
  7. Offline/`isManual` row with `cancelAtPeriodEnd` → **neither** button, and
     the "Contact us to update your payment or renew your access" copy shows.

  **Unrelated defects observed, NOT fixed (pre-existing, not from this work):**
  - On a 420px-wide mobile viewport the subscription card's status badge is
    clipped and the action button overflows the card's right edge. The
    untouched `Resubscribe` link clips identically, so this predates the Resume
    button — but it now affects both, on a mobile-first surface.
  - `GET /brand/hightop-logo.svg` 404s on every owner page load.

## Status: all 5 phases complete. Bug fixed and verified against real Stripe.

## Open question carried over — RESOLVED (2026-07-31, product decision)
Should "Resume subscription" be self-serve, or should a cancelling partner have
to talk to support (retention conversation)? **Self-serve.** If a partner wants
to sign back up / un-cancel, they should be able to do it themselves without
gating it behind support. This matches the existing self-serve cancel and is
what Phases 1–4 already implement — no code change follows from this decision.

The one deliberate exception stays: tokenless offline/check-billed rows are not
self-serve resumable (there is nothing to un-schedule at a processor), and an
admin re-grant remains their reactivation path.
