# Billing — Code Review Round 2 Fixes Plan

Fixes the three findings from the second `/code-review` pass on branch
`billing-guard-and-discounts` (run 2026-08-02, after
`docs/billing-code-review-fixes-plan.md` Phases 0–8 and the Phase 7 close-out).

That review confirmed the five original findings are resolved and cleared a long
list of surfaces (the checkout guard matrix, `resumeSubscription`'s 409 symmetry,
the discount mirror sync, `numeric(5,2)` coercion, the promo-code SDK shape, and
the Category Blitz portal rework). What follows is only what it newly found.

**Related docs:** `docs/billing-code-review-fixes-plan.md` (round 1, done),
`docs/billing-open-issues-plan.md` (the open-items inventory — this doc adds
items U, V, W to it), `docs/billing-run-log.md`.

## Phase table

| # | Phase | Model | Effort | Depends on | Status |
|---|-------|-------|--------|-----------|--------|
| 0 | Baseline | Haiku 4.5 | Low | — | ✅ done 2026-08-02 |
| 1 | `grant-manual` 502s on a churned card row (finding 1) | **Opus 5** | Medium | 0 | ✅ done 2026-08-02 |
| 2 | Welcome email + first invoice lost on the recovery path (finding 2) | **Opus 5** | Medium-High | 0 | ⬜ not started |
| 3 | Custom price accepts a yearly interval (finding 3) | Sonnet 5 | Low-Medium | 0 | ✅ done 2026-08-02 |
| 4 | Verification + close-out | Sonnet 5 | Medium | 1–3 | ⬜ not started |

Phases 1, 2, 3 are independent of each other and can run in any order or in
parallel worktrees. Phase 4 is last.

**Severity order if you only do some of it:** 2 → 1 → 3. Finding 2 silently
loses a real partner's welcome email and first payment record with no error
anywhere; finding 1 is loud (a 502 the admin sees) but blocks a real workflow;
finding 3 needs an admin to paste the wrong price id.

---

## Phase 0 — Baseline

**Model: Haiku 4.5 · Effort: Low**

- `npx tsc --noEmit`, `npm run test` — record the counts (last known green:
  1218 passed / 13 skipped, 145 files).
- Confirm the working tree is clean apart from the two advertising PNGs and the
  Phase 7 doc edits.
- Note the starting SHA in `docs/billing-run-log.md` so each phase below is a
  separate revertible commit.

---

## Phase 1 — `grant-manual` must not 502 on a churned card row

**Model: Opus 5 · Effort: Medium** — it is a small diff, but choosing *which*
failures are safe to swallow on a money path is a judgment call, and the
neighbouring code deliberately fails closed.

**Finding:** `app/api/admin/billing/route.ts:301`. The Phase 2 (round 1) fix
added an unconditional coupon detach before the row goes offline:

```ts
if (existingSub?.stripe_subscription_id) {
  const removeResult = await removeDiscountFromSubscription(existingSub);
  if (!removeResult.ok) {
    return NextResponse.json({ ok: false, error: removeResult.error }, { status: removeResult.status });
  }
}
```

`removeDiscountFromSubscription` (`lib/billingDiscounts.ts:561`) takes the
`"stripe"` branch whenever `billing_method !== 'offline'` and a
`stripe_subscription_id` is present, and calls
`stripe.subscriptions.update(id, { discounts: "" })`. Stripe rejects an update on
a **canceled** subscription, and the helper turns any throw into a hard
`502`, which this route returns.

**Why the row is reachable in that state:** `cancelSubscription`
(`lib/billing.ts`) sets `status: 'cancelled'` but **retains**
`stripe_subscription_id` — deliberately, so the mirror can still be reconciled.
And the admin UI only disables "Grant offline" for a *non-cancelled* Stripe row
(`components/admin/sections/BillingSection.tsx:537`, `hasLiveCard`). So the exact
sequence — card partner churns → admin converts them to check billing — is a
supported workflow that now fails with a 502 the admin cannot clear. It fails
even when the row carries **no discount at all**, because the detach is
unconditional.

**Why the existing test misses it:** `tests/api.admin.billing-grant-manual-clears-discount.test.ts:15`
mocks `removeDiscountFromSubscription` and stubs it `{ ok: true }`, so no test
exercises a real Stripe rejection.

**Work:**
1. Make the detach conditional on there actually being something to detach —
   skip it when the row's discount mirror is empty. Add the mirror columns to the
   `select()` at line ~263 (it currently reads `id, billing_method,
   stripe_subscription_id, status, amount_cents, current_period_end`) and note in
   a comment that dropping them re-arms this bug.
2. Skip it for a row whose subscription cannot hold a discount anyway —
   `status === 'cancelled'`. A canceled subscription bills nothing, so there is
   no coupon to orphan; that is the whole justification for the detach.
3. For the remaining real case (live subscription, discount present) decide the
   failure policy explicitly. **Recommendation: keep failing closed (502), but
   treat Stripe's `resource_missing` — and a "cannot update a canceled
   subscription" style `invalid_request_error` — as success**, since both mean
   there is nothing left at Stripe to orphan. Use the existing `stripeErrorCode`
   helper (`lib/billingCustomPrice.ts` already imports it) rather than string
   matching where possible; write the comment so the *reason* each code is safe
   is stated, not just the code list.
4. Consider whether `removeDiscountFromSubscription` itself should absorb these
   codes for every caller, or whether that would mask a genuine failure on the
   admin's explicit "Remove discount" button. **Recommendation: fix it at the
   call site in `grant-manual`**, and leave the explicit-removal path strict — an
   admin who clicks "Remove discount" should hear about a Stripe failure.

**Tests:** un-mock or add a second suite so `removeDiscountFromSubscription`'s
Stripe branch is exercised for real (with the Stripe SDK mocked at the
`stripe.subscriptions.update` level, as the discount tests already do):
- cancelled card row **with** a discount mirror → `grant-manual` succeeds, and
  either no Stripe call is made or a rejection does not fail the grant.
- cancelled card row with **no** discount mirror → no `subscriptions.update` call
  at all, grant succeeds.
- **live** card row with a discount → detach is still attempted, and a genuine
  Stripe error (not `resource_missing`) still 502s. This is the guardrail the
  round-1 fix existed for — it must not regress.

**Risk:** loosening this is how a live coupon gets orphaned at Stripe. Keep the
live-subscription path strict; only the demonstrably-dead cases get a pass.

---

## Phase 2 — The recovery path must not lose the welcome email or the first invoice

**Model: Opus 5 · Effort: Medium-High** — this touches the Phase 8 creation gate,
which is the newest and most carefully-reasoned invariant in the billing system.
The fix must not reintroduce the ambiguity Phase 8 removed.

**Finding:** `app/api/webhooks/stripe/route.ts:64`. Phase 8's creation gate is
correct — an unpaid attempt writes nothing — but the *recovery* path it
deliberately preserves is now one-sided.

When a signup needs a second step (3-D Secure, or any card that settles after
the session completes), the sequence is:

1. `checkout.session.completed` arrives with the subscription still `incomplete`.
   `upsertSubscription` correctly returns `false` → **no row**, and because
   line 64 reads `if (applied) await maybeSendWelcomeEmail(sub)`, **no welcome
   email** — correct so far.
2. `invoice.paid` may arrive next. `recordInvoice` (line ~393) resolves the row
   by `stripe_subscription_id`, finds none, and `return`s. The invoice is
   **dropped permanently** — nothing ever replays it.
3. `customer.subscription.updated` arrives with `status: 'active'`.
   `upsertSubscription` creates the row (the intended recovery). But
   `maybeSendWelcomeEmail` is wired **only** to `checkout.session.completed`, so
   it is never called.

Net result for a partner who completed 3-D Secure: a correct `active` billing
row, **no welcome email ever**, and a payment history permanently missing its
first charge. Both failures are silent.

Note this is not a regression *introduced* by Phase 8 so much as an interaction:
before the gate, step 1 created the row, so the email fired and the invoice
landed. Phase 8 was still the right call — but it moved the moment of row
creation without moving these two followers.

**Work:**

### 2.1 — Move the welcome email to follow row creation, not the event type

The email's real trigger is "this venue's billing row just came into existence
for a paid subscription," which is exactly what the creation gate decides. Have
`upsertSubscription` report whether it **created** (vs. updated) the row, and
send the welcome email off that signal, so both entry points get it.

- `upsertSubscription` currently returns `boolean` ("was the mirror written").
  Widen it to distinguish written-created / written-updated / skipped. A small
  string union or `{ applied, created }` object is fine — prefer whichever keeps
  the two call sites readable.
- Call `maybeSendWelcomeEmail` on creation from **both** `checkout.session.completed`
  and `customer.subscription.updated`.
- `maybeSendWelcomeEmail` is already idempotent (it reads
  `welcome_email_sent_at` and returns early if set), so double-firing is already
  impossible — verify that, don't rebuild it. It is what makes this safe.
- Do **not** send on the `customer.subscription.deleted` branch even if it
  somehow creates a row.

### 2.2 — Don't drop the invoice that arrives before the row

Once the row is created, that first `invoice.paid` is gone. Two options:

- **(a) Backfill at creation time.** When `upsertSubscription` creates a row,
  list the subscription's invoices from Stripe (`stripe.invoices.list({
  subscription })`, or read `latest_invoice`) and record them. Self-healing,
  costs one API call on a rare path.
- **(b) Retry the webhook.** Have `recordInvoice` return 500 when it can't find
  the row, so Stripe retries and eventually lands it after the row exists.

**Recommendation: (a).** Option (b) makes a legitimately-unmatchable invoice (a
venue we don't track at all, a deleted row) retry for three days and pollute the
Stripe webhook error rate; it also inverts the existing convention in this route,
where 500 is reserved for *transient DB* failures. Do (a) at creation only —
scoped to `latest_invoice` plus any already-paid invoice on that subscription, so
it can't turn into an unbounded backfill.

Keep `recordInvoice`'s `if (!row) return` for the genuinely-untracked case, but
change the comment to say the creation-time backfill is what covers the race.

### 2.3 — Tests

- `checkout.session.completed` while `incomplete`, then `customer.subscription.updated`
  to `active` → row created, **welcome email sent exactly once**.
- Normal path (`checkout.session.completed` already `active`) → welcome email
  still sent exactly once, and **not** re-sent by a following
  `customer.subscription.updated`.
- `invoice.paid` arriving **before** the row exists, then the row is created →
  the invoice appears in `billing_invoices`.
- An `invoice.paid` for a subscription we track nothing about → still a no-op,
  still 200 (no retry storm).
- Every existing test in `tests/api.webhooks.stripe-unfinished-signup.test.ts`
  stays green — the creation gate itself must not move.

---

## Phase 3 — `setCustomPrice` must reject a non-monthly interval

**Model: Sonnet 5 · Effort: Low-Medium** — well-specified, one function, one
guard to add alongside four that already exist.

**Finding:** `lib/billingCustomPrice.ts:117`. The validation chain checks
`active`, `type === 'recurring'`, `currency === USD`, and a numeric
`unit_amount` — each with a comment explaining that it prevents a swap that
"succeeds" onto a rate we can't represent. It does **not** check
`price.recurring.interval`.

Pasting a **yearly** `price_…` therefore passes every guard, flips the
subscription to yearly billing at Stripe, and writes the yearly figure into
`amount_cents` — the column the owner page and the admin partner list both render
as the per-cycle rate. A $1,200/yr price shows up everywhere as if it were the
monthly amount.

The whole product is monthly: the offline path's `paidThroughDate`, the
`free_months` discount mechanism, and the welcome email's `planAmountCents` all
assume a monthly cycle.

**Work:**
1. Add the guard next to the others, in the same style and with the same kind of
   comment (state the consequence, not just the rule): reject unless
   `price.recurring.interval === 'month' && (price.recurring.interval_count ?? 1) === 1`.
   `interval_count` matters — a "every 3 months" monthly-interval price is just
   as wrong and would slip past an interval-only check.
2. Give it a message the admin can act on, matching the tone of the neighbours
   ("That price bills yearly — the Partner Dashboard is monthly-only.").
3. Grep for a shared monthly constant before inventing one; if `lib/stripe.ts`
   has nothing, define it next to `PRICE_CURRENCY` in the same module so the two
   assumptions sit together.
4. Check whether the same assumption needs asserting anywhere else the app reads
   a price — notably the `STRIPE_PRICE_ID` used at Checkout. If it is only ever
   an env var an operator sets once, a comment is enough; don't add a runtime
   check on the hot path.

**Tests:** extend `tests/lib.billingCustomPrice.test.ts` alongside the existing
archived / one-time / non-USD negative cases: a yearly price → 400 and **no**
`subscriptions.update` call; an `interval_count: 3` monthly price → 400; a plain
monthly price → still succeeds (the positive case must not regress).

---

## Phase 4 — Verification + close-out

**Model: Sonnet 5 · Effort: Medium**

Most of this is provable without Stripe. Only Phase 2's recovery path really
wants a live run, and it is the one most worth doing.

1. `npx tsc --noEmit`, `npm run lint`, `npm run test` green.
2. **Phase 1 and Phase 3 need no live Stripe** — mocked SDK tests cover them.
3. **Phase 2 against real Stripe test mode**, reusing the harness documented in
   the Phase 6 / 8.6 sections of `docs/billing-run-log.md` (read it first — the
   LIVE `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` in `.env.local`, the
   `scripts/stripe-test-env.sh` wrapper, the `.next/dev` lock, the Checkout
   accordion and Link-phone gotchas). One scenario:
   - Real hosted Checkout with a **3-D Secure test card** (`4000002500003155`),
     complete the authentication → confirm exactly one row, `active`,
     `welcome_email_sent_at` set **once**, and the first invoice present in
     `billing_invoices`.
   - Clean up every seeded venue/owner/customer/subscription afterwards and
     verify the cleanup, as the previous runs did.
4. Append a run-log section per phase with per-check pass/fail lines.
5. Add items **U** (grant-manual 502), **V** (welcome email + first invoice on
   the recovery path), **W** (yearly custom price) to
   `docs/billing-open-issues-plan.md`'s inventory table and close them.
6. Ask the user to re-run `/code-review` — it is user-invoked and cannot be
   launched from a session.

---

## Model / effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 0 | Baseline | Haiku 4.5 | Low |
| 1 | `grant-manual` detach failure policy | **Opus 5** | Medium |
| 2 | Welcome email + invoice on the recovery path | **Opus 5** | Medium-High |
| 3 | Reject non-monthly custom price | Sonnet 5 | Low-Medium |
| 4 | Verification + close-out | Sonnet 5 | Medium |

**Opus 5 for Phases 1 and 2.** Phase 1 decides which Stripe failures are safe to
swallow on a path whose entire purpose is not orphaning a live coupon — the wrong
call silently keeps discounting a partner Stripe still bills. Phase 2 modifies
the Phase 8 creation gate's surroundings, and the failure mode of getting it
wrong (a duplicate welcome email, or reintroducing the `past_due` ambiguity) is
exactly the class of bug the last round existed to remove.

**Sonnet 5 for Phase 3** — four guards already sit in a row; this adds a fifth in
the same shape. **Sonnet 5 for Phase 4**, with the caveat that the live-Stripe
scenario needs the run-log's setup notes followed exactly.
