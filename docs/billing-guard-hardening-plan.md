# Billing guard hardening — plan (follow-up to `resubscribe-fix-plan.md`)

Fixes the four findings from the code review of the resume/resubscribe work.
That fix was correct for the states it considered; this plan closes the states it
did **not** consider.

## The one root cause behind findings 1–3

Every guard was written against `status === "active"`. But `status` has **three**
values, and `active` is not the same question as *"does a live subscription
exist at Stripe right now?"*

| our `status` | live at Stripe? | why |
|---|---|---|
| `active` | yes | paying normally |
| `past_due` | **yes** | card declined; Stripe is still retrying (~2wk dunning). Subscription object is alive and un-cancellable-from. `mapStripeSubscriptionStatus` also defaults **unknown** Stripe statuses here. |
| `cancelled` | usually no | but Stripe `paused` also maps here, and a paused subscription still exists |

So `past_due` is the hole: it is live at Stripe but passes every
`status === "active"` guard. Consequences, all confirmed against the code:

1. **Double billing (finding 1).** `checkout/route.ts` refuses `active` and
   `active + cancelAtPeriodEnd`, then falls through for `past_due` — creating a
   **second** Stripe subscription on the same `stripe_customer_id`. That is
   exactly the hazard the original PR exists to prevent, reached through a
   status the guards miss. Note this bites `past_due` **with or without** a
   scheduled cancel; the review flagged the former, but the plain case is
   equally exposed.
2. **Dead button + false copy (finding 2).** `subscription/route.ts` accepts only
   `active`, but `billing/page.tsx` renders Resume on `cancelAtPeriodEnd &&
   !isManual` regardless of status. A `past_due` owner sees a button that always
   409s with *"This subscription has already ended"* — untrue, and it discourages
   a partner who is actively trying to stay.
3. **Swallowed messages (finding 3).** Independent of the above: `actionMessage`
   renders only when no URL-param `banner` exists, and nothing clears the param.
   Landing on `/owner/billing?error=incomplete` and clicking Resume hides both
   the success and the failure result.

## Decisions taken (Andrew, 2026-07-31)

- **`past_due` may self-serve Resume.** Consistent with the earlier "resume is
  self-serve" call. Resuming only stops the cancellation clock; it collects
  nothing and grants nothing. The owner fixes their card separately.
- **`past_due` may NOT start a new Checkout.** Refuse, and route them to the
  Stripe Billing Portal to fix the card, so they understand the real problem.
- **Self-heal a stale mirror.** Never let a wrong local row permanently lock an
  owner out of Checkout — confirm against Stripe before it matters.

### On past-due money (asked during planning)
No code owed here. Stripe keeps the failed charge as an **open invoice** and
retries it; attaching a new default payment method via the existing portal
button triggers collection. `invoice.paid` / `invoice.payment_failed` already
flow into `billing_invoices` through the webhook. **Two dashboard settings to
confirm (not code):** Billing → *Manage failed payments* end-of-retry behavior
(should be "cancel" for our `cancelled` state to be truthful), and whether the
Billing Portal shows outstanding invoices with "Pay now".

---

## Phases

### Phase 0 — Revert `next-env.d.ts` (finding 4)
Auto-generated; currently committed pointing at `./.next/dev/types/routes.d.ts`
(the `next dev` output) instead of the build output `./.next/types/routes.d.ts`.
On a clean CI/Vercel checkout `.next/dev/` does not exist. `git checkout
next-env.d.ts`, and re-check it before every commit — **running `npm run dev`
rewrites this file**, which is why it keeps reappearing (commit `ee478a4 "Retry
Build"` churned the same file).

> **Model/effort: none — mechanical.** One `git checkout`. Do it last, right
> before committing, since any dev-server run re-dirties it.

### Phase 1 — One shared predicate in `lib/billing.ts`
Introduce the concept the guards were missing, in the module both routes already
import, so the three call sites can never drift again:

```ts
export type BillingRowState =
  | { live: true;  reason: "active" | "past_due" }
  | { live: false; reason: "cancelled" | "no_stripe_object" };
```

- `no_stripe_object` — no `stripe_subscription_id` (first-time, or offline/check
  row). Nothing exists at Stripe; Checkout is safe.
- Otherwise derive from `status`, with `past_due` **live**.

Export a `classifyBillingRow(row)` returning this. No behavior change yet — pure
addition, so it can land and be unit-tested independently.

> **Model/effort: Sonnet 5, low.** Small, self-contained, no cross-system
> reasoning. It is just naming a concept precisely.

### Phase 2 — Checkout guard: refuse anything live (findings 1)
Rewrite the guard in `app/api/owner/billing/checkout/route.ts` on top of Phase 1:

| row state | response |
|---|---|
| live + `cancelAtPeriodEnd` | 409 `resume_instead` (existing copy) |
| live + `past_due` | 409 **new** `fix_payment` — "Your last payment failed. Update your card to keep this subscription" + route to the portal |
| live + `active` | 409 already-subscribed (existing copy) |
| not live | proceed to Checkout, reusing `stripe_customer_id` |

**This is the highest-risk phase in the plan** — a wrong predicate here either
reopens double billing or wrongly blocks a paying customer from subscribing.

> **Model/effort: Opus 5, medium.** Money-correctness, several interacting
> states, and the failure mode is silent (a duplicate subscription bills for
> months before anyone notices).

### Phase 3 — Stale-mirror self-heal
Add a Stripe-truth check so the mirror is never the last word:

- **Refuse path** (mirror says live): retrieve the subscription from Stripe. If
  Stripe says `canceled`/`incomplete_expired`, or throws `resource_missing`,
  correct our row and **allow** Checkout instead of refusing.
- **Allow path where a Stripe object exists** (mirror says `cancelled` but
  `stripe_subscription_id` is set): retrieve before allowing. This is what
  catches Stripe `paused` — which `mapStripeSubscriptionStatus` folds into our
  `cancelled` even though the subscription is still alive and would duplicate.

Both are one extra API call on a rare path (Checkout), never on page load.
Handle `resource_missing` explicitly — a deleted test object or wrong-mode id
must read as "dead", not as a 502.

> **Model/effort: Opus 5, medium.** Cross-system reconciliation and Stripe error
> taxonomy; the `paused` case is easy to reason about wrongly.

### Phase 4 — Resume guard: accept live rows (finding 2, server half)
In `app/api/owner/billing/subscription/route.ts`, replace `status !== "active"`
with the Phase 1 predicate: allow `active` **and** `past_due`; keep the 409
`checkout_instead` only for genuinely dead rows. `resumeSubscription()` itself
needs no change — it already refuses tokenless rows, and un-scheduling a
`past_due` subscription is a valid Stripe operation.

> **Model/effort: Sonnet 5, low-medium.** Small diff once Phase 1 exists, but
> keep the dead-row refusal intact.

### Phase 5 — Billing page UI (finding 2 client half, finding 3)
1. Gate the Resume button on the same live/dead notion rather than
   `cancelAtPeriodEnd` alone, so the UI can no longer offer an action the server
   will refuse. Requires the `GET /api/owner/billing` payload to carry enough
   state — it already returns `status` and `cancelAtPeriodEnd`, so no API change.
2. Surface `past_due` honestly: the badge currently shows "Cancelled" for any
   `cancelAtPeriodEnd` row (`displayStatus`), hiding the payment problem. Show
   the payment-failure state and point at the portal.
3. **Message precedence:** prefer a fresh `actionMessage` over the stale URL
   `banner`, and clear the params (`router.replace`) when an action runs.

> **Model/effort: Sonnet 5, medium.** Mostly presentational, but four states ×
> manual/stripe. Re-check at 320px — the card just had an overflow bug from
> oversized badge/button type.

### Phase 6 — Setup page redirect guard
`app/owner/billing/setup/page.tsx:35` redirects on `status === "active" &&
!cancelAtPeriodEnd` — the same blind spot. A `past_due` owner reaches the
Subscribe button and gets a 409 they cannot act on. Base it on Phase 1's notion
and send live-but-unpayable rows somewhere useful instead of a dead end.

> **Model/effort: Sonnet 5, low.** One condition, once Phase 1 exists.

### Phase 7 — Extend the tests
`tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` already drives the
real handlers over `{none, active, active+cancelAtPeriodEnd, cancelled}` — widen
the same matrix rather than writing a new file:
- `past_due` and `past_due + cancelAtPeriodEnd` for **both** endpoints (the
  double-billing regression test: `checkout.sessions.create` must NOT be called).
- Self-heal: mirror-live + Stripe-says-canceled → Checkout allowed and row
  corrected; mirror-cancelled + Stripe-says-paused → Checkout refused.
- `resource_missing` reads as dead, not 502.
- Unit-test `classifyBillingRow` directly in the `lib.billing.*` file.
- Message-precedence is worth a small component test only if cheap; otherwise
  cover it in Phase 8.

> **Model/effort: Sonnet 5, medium.** Patterns and mocks already exist; this is
> extension, not invention.

### Phase 8 — Live verification
Same recipe as `resubscribe-fix-plan.md` Phase 5 — and re-read its safety note
first: **`.env.local`'s `STRIPE_SECRET_KEY` is LIVE.** Override
`STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID` in the process env with the Stripe CLI's
test key (`~/.config/stripe/config.toml` → `test_mode_api_key`).

Drive a **real test-mode** subscription into `past_due` (subscribe with the
`pm_card_chargeCustomerFail` test card, or attach a failing card and let the
invoice fail) and confirm: Resume works, Checkout is refused, no second
subscription exists on the customer, and the UI copy names the payment problem.
Then confirm resume still works from plain `active + cancelAtPeriodEnd`.
Clean up all seeded Supabase rows and Stripe test objects afterward.

> **Model/effort: Opus 5, medium.** Browser driving plus Stripe/Supabase
> reconciliation, and the live-key hazard demands care.

---

## Suggested execution order
0 is deferred to commit time. **1 → 2 → 3 → 4 → 6 → 5 → 7 → 8**: land the shared
predicate, then the two money-critical server guards, then the remaining server
guard, then UI, then tests, then verify. Phases 2 and 3 can be reviewed together
since both live in the checkout route.

## Downstream work that depends on this plan
- **`docs/billing-discounts-plan.md`** (discounts, free months, promo codes,
  negotiated rates) is written against Phases 1–4 here and should not start
  before they land. A discounted subscription must keep tripping the hardened
  "live at Stripe" guard, and 100%-off/trial states make the old
  `status === "active"` assumptions worse rather than better.

## Out of scope (deliberately)
- Surfacing an outstanding-balance / "Pay now" affordance in our own UI rather
  than deferring to the Stripe portal. Worth doing, but it is a feature, not a
  fix for these findings.
- The missing `/brand/hightop-logo.svg` asset referenced by
  `components/ui/HightopLogo.tsx` (404s on every page load via the global
  transition overlay). Unrelated; Andrew has seen it and set it aside.
