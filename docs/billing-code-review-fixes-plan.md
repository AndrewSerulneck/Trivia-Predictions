# Billing — Code Review Fixes Plan

Fixes the five findings from the `/code-review` pass on branch
`billing-guard-and-discounts` (`main...HEAD`, ~7.6k lines: guard hardening,
discounts, custom price, promo codes) plus the SlimCD teardown the review
surfaced.

**Related docs:** `docs/billing-open-issues-plan.md` (the broader open-items
inventory — items B, L, M overlap with Phases 1/3/4 here),
`docs/billing-guard-hardening-plan.md`, `docs/billing-discounts-plan.md`,
`docs/billing-run-log.md`.

## Decisions locked with the user (2026-08-01)

1. **Offline `amount_cents` means the FULL LIST RATE.** The admin's manual-grant
   amount box currently means "amount received," which is usually already
   discounted — so the owner page discounts it a second time. We change the
   meaning (and the label) to the list rate, giving one consistent rule for
   card and check partners alike.
2. **Fractional percent-off must work end to end.** Widen the integer columns to
   `numeric(5,2)` rather than forbidding 12.5%.
3. **SlimCD is dead.** It was built before the switch to Stripe and is not
   wanted. Remove the code paths rather than guarding them.
4. **Scope = all five findings + a real verification phase** (Stripe test mode
   and browser), closing open items F and G in `billing-open-issues-plan.md`.

## Phase table

| # | Phase | Model | Effort | Depends on |
|---|-------|-------|--------|-----------|
| 0 | Baseline + branch hygiene | Haiku 4.5 | Low | — |
| 1 | Offline discount double-count (list-rate semantics) | Opus 5 | **High** | 0 |
| 2 | `grant-manual` must clear the discount mirror | Sonnet 5 | Medium | 1 |
| 3 | Fractional percent-off: migration + validation + writes | Sonnet 5 | Medium | 0 |
| 4 | SlimCD teardown | Opus 5 | Medium-High | 0 |
| 5 | `incomplete` subscriptions must not lock out Checkout | Opus 5 | Medium | 0 |
| 6 | Stripe test-mode + browser verification | Opus 5 | **High** | 1–5 |
| 7 | Run-log + doc close-out | Haiku 4.5 | Low | 6 |

Phases 1→2 are ordered (2 depends on 1's semantics). Phases 3, 4, 5 are
independent of each other and of 1/2 — they can run in any order or in
parallel worktrees.

---

## Phase 0 — Baseline + branch hygiene

**Model: Haiku 4.5 · Effort: Low**

- Confirm green baseline: `npx tsc --noEmit`, `npm run test` (88 billing tests
  currently pass).
- Commit the uncommitted `app/api/webhooks/stripe/route.ts` invoice-subscription-id
  fix together with its test `tests/api.webhooks.stripe-invoice-subscription-id.test.ts`
  (the review cleared this change).
- Record the starting commit SHA in `docs/billing-run-log.md` so each phase below
  is a separate, revertible commit.

**Done when:** typecheck + tests green, working tree clean apart from the two new
advertising PNGs.

---

## Phase 1 — Offline discount double-count

**Model: Opus 5 · Effort: High** — this is a *semantics* change to a money
column with existing rows, not a one-line arithmetic fix. It needs judgment
about migration of live data and about copy the admin will read.

**Finding:** `app/owner/billing/page.tsx:58` — `effectiveAmountCents` subtracts
the discount from `amount_cents` for every row. For an offline row,
`amount_cents` was entered as the *amount received* (already net), so $100
received with 25% off renders as "$75 ~~$100~~". CONFIRMED.

**Root cause:** two writers disagree about what the column means.
`lib/billingDiscounts.ts` (header comment, lines 23–31) declares the offline
path "mirror-only — `amount_cents` stays the list rate." But
`app/api/admin/billing/route.ts` `grant-manual` writes
`amountCents = body.amountDollars`, and its admin UI labels that field
"Amount received (USD)."

**Work:**
1. **Admin UI + route (the actual fix):** relabel the manual-grant amount field
   to the venue's **full list rate** (e.g. "Monthly rate before any discount
   (USD)"), with help text saying the discount is recorded separately and the
   partner sees the net. Find the field in the admin Partner Billing section
   (`components/admin/sections/` — grep `amountDollars`) and update the API
   route's inline comments to match. `grant-manual` keeps writing the value
   verbatim; only its *meaning* and label change.
2. **Owner page:** leave `effectiveAmountCents` as-is — under the new semantics
   it is correct for both row types. Strengthen the existing comment at
   `app/owner/billing/page.tsx:44-56` to state the contract explicitly and name
   the admin field that upholds it.
3. **Existing data:** write a read-only audit query (scratchpad, not committed)
   listing every `billing_subscriptions` row with
   `billing_method='offline'` AND a populated discount mirror. Report the list
   to the user — each one needs its `amount_cents` re-entered as the list rate
   by hand. Do **not** auto-migrate: we cannot infer a list rate from a net
   amount without knowing the deal.
4. **Tests:** extend the owner-billing display tests with an offline+discount
   case asserting `$100` list → `$75` net, and an offline-no-discount case
   asserting the entered amount renders unchanged.

**Risk:** if the user has already granted offline access using the old meaning,
those partners' pages under-report until step 3's list is corrected. Surface
that list before merging.

---

## Phase 2 — `grant-manual` must clear the discount mirror

**Model: Sonnet 5 · Effort: Medium** — well-scoped, one route, an existing
constant to reuse.

**Finding:** `app/api/admin/billing/route.ts:304` — the `grant-manual` upsert
nulls every processor id (`slimcd_recurring_token`, `stripe_customer_id`,
`stripe_subscription_id`, `stripe_price_id`) but leaves
`discount_*` populated. A Stripe coupon's label and percent therefore survive
conversion from card to offline billing and keep mispricing the owner page.
CONFIRMED. The cron expiry sweep was already fixed for exactly this reason
(open item N); this path was missed.

**Work:**
1. Spread the existing `CLEARED_MIRROR` constant (see
   `app/api/owner/billing/checkout/route.ts` and the cron sweep — grep for its
   definition and import it rather than re-declaring) into the `grant-manual`
   upsert alongside the processor-id nulls.
2. Consider whether the Stripe-side coupon should also be detached before the
   row goes offline. Recommendation: yes if `stripe_subscription_id` is present
   — call the existing removal helper in `lib/billingDiscounts.ts` first and
   fail the grant if it errors, so we never orphan a live coupon at Stripe on a
   subscription we're about to stop tracking. Confirm the cancel-at-Stripe step
   that already runs in this route doesn't make this redundant.
3. **Test:** new case — card row with a discount mirror → `grant-manual` →
   assert every `discount_*` column is null and the owner payload shows no
   discount.

---

## Phase 3 — Fractional percent-off

**Model: Sonnet 5 · Effort: Medium** — a migration plus a small typed surface;
mechanical once the column type is decided.

**Finding:** `lib/billingDiscounts.ts:114` — `validateDiscountSpec` accepts a
fractional `percentOff` (and `couponIdForSpec` explicitly encodes a decimal
point), but `billing_subscriptions.discount_percent_off` and
`billing_discount_grants.percent_off` are `integer`
(`supabase/migrations/20260731120000_billing_discounts.sql:15,28`). A 12.5%
grant applies at Stripe but the mirror write fails silently — the partner is
charged less and sees no discount. CONFIRMED.

**Work:**
1. **New migration** (new timestamped file; never edit `20260731120000_*`):
   ```sql
   alter table billing_subscriptions
     alter column discount_percent_off type numeric(5,2);
   alter table billing_discount_grants
     alter column percent_off type numeric(5,2);
   ```
   Both are widening conversions — existing integer values survive intact.
2. Bound `percentOff` in `validateDiscountSpec`: still `> 0 && <= 100`, and add
   a precision cap (at most 2 decimal places) matching `numeric(5,2)`, so a
   pathological `33.333` is rejected with a clear message rather than silently
   rounded by Postgres.
3. Audit every read of these columns for an implicit integer assumption —
   `supabase-js` returns `numeric` as a **string** in some paths. Grep
   `discount_percent_off` and `percent_off` and make each consumer coerce via
   `Number(...)`; the owner page's `discountedAmountCents` in particular must
   not receive `"12.5"`. Update the TS types in `types/index.ts`.
4. **Tests:** validation accepts `12.5` and rejects `33.333`, `0`, `100.01`;
   a mirror round-trip asserting `12.5` survives write→read as a number;
   `discountedAmountCents(10000, {percentOff: 12.5})` → `8750`.
5. Apply the migration to Supabase and note it in the run log.

---

## Phase 4 — SlimCD teardown

**Model: Opus 5 · Effort: Medium-High** — the footprint spans 15+ files
including a cron route and live migrations; deciding what is safe to delete vs.
leave inert needs care.

**Finding:** `app/api/owner/billing/checkout/route.ts:92` — the old blanket
`status === "active"` refusal is gone, so a legacy SlimCD row (token set,
`stripe_subscription_id` null, `billing_method='stripe'`) classifies as
`no_stripe_object` and can start a Stripe Checkout while the SlimCD cron keeps
charging it. PLAUSIBLE. **The user has confirmed SlimCD was abandoned before
launch and nothing about it is wanted** — so the fix is removal, not a guard.

**Current footprint** (`grep -ril slimcd`, excluding node_modules/.git):
`lib/slimcd.ts`, `lib/stripe.ts`, `types/index.ts`,
`app/api/owner/billing/{route,portal,card,return,checkout,subscribe,session}.ts`,
`app/api/admin/billing/route.ts`, `app/api/cron/billing/route.ts`,
`slimcd-payment-form-hightop.html`, three tests, three migrations, and several
docs.

**Work — in this order:**
1. **Confirm the data is empty first.** Run a read-only count of
   `billing_subscriptions where slimcd_recurring_token is not null`. If it is
   non-zero, STOP and report to the user before deleting anything — the plan
   below assumes zero.
2. Delete the SlimCD charge path from `app/api/cron/billing/route.ts` and delete
   `lib/slimcd.ts` and `slimcd-payment-form-hightop.html`.
3. Remove `slimcd_recurring_token` reads/writes from the owner and admin billing
   routes and from `types/index.ts`. Keep the **column** in the database for now
   (dropping a column is irreversible and buys nothing); add a comment in the
   new migration noting it is dead.
4. Migrations under `supabase/migrations/` are history — **do not edit them.**
5. Update the affected tests (`tests/api.cron.billing-manual-guard.test.ts`,
   `tests/api.cron.billing-offline-expiry.test.ts`,
   `tests/api.admin.billing-cancel-at-period-end.test.ts`) and remove SlimCD
   references from `SYSTEM_CONTEXT.md` and `docs/partner-dashboard-plan.md`.
6. Remove any SlimCD env vars from Vercel — **ask before touching env**, and
   never via `vercel env pull` (see the local-env safety rule).
7. **Test:** a regression case asserting the checkout route no longer has any
   SlimCD-shaped bypass — i.e. classification depends only on
   `billing_method` + Stripe truth.

---

## Phase 5 — `incomplete` must not lock a partner out

**Model: Opus 5 · Effort: Medium** — small diff, but it touches the
fail-closed guard logic, which is the highest-consequence code on this branch.

**Finding:** `app/api/owner/billing/checkout/route.ts:157` — Stripe's
`incomplete` status maps to our `past_due` and is not in `DEAD_STRIPE_STATUSES`
(`lib/billing.ts:66`), so a first Checkout whose payment never completed leaves
the partner with a `past_due` row. Checkout then refuses with `fix_payment`
("update your card") for ~23h — but there is no card to update, and no valid
action behind that message. PLAUSIBLE.

**Why not just add `incomplete` to `DEAD_STRIPE_STATUSES`:** that set means
"authoritatively dead, safe to overwrite the mirror." An `incomplete`
subscription is *not* dead — Stripe can still complete it within its ~23h
window, and treating it as dead invites a genuine double subscription.

**Recommended fix — distinguish the two, don't merge them:**
1. Add a third `readStripeTruth` outcome, `"incomplete"`, returned when
   `subscription.status === "incomplete"`. Every existing caller must handle it
   explicitly (TypeScript exhaustiveness will force this) — do not let it fall
   into a default branch.
2. In the checkout route, treat `"incomplete"` as **allow, after cleanup**: void
   the abandoned Stripe subscription (`subscriptions.cancel`) so it cannot
   later complete and double-bill, then let Checkout proceed. If the cancel
   call fails, fall back to refusing with a message that actually names the
   situation ("your previous payment didn't finish — try again in a few
   minutes").
3. Everywhere else (resume, card update), `"incomplete"` should behave like
   `"live"` — fail closed.
4. **Tests:** `incomplete` at Stripe + `past_due` mirror → Checkout allowed and
   the old subscription cancelled; the cancel-fails path → 409 with the new
   code; resume with `incomplete` → still refuses.

**Guardrail:** do not change `readStripeTruth`'s existing `unknown` (outage)
fail-closed behavior. The review explicitly cleared that logic.

---

## Phase 6 — Stripe test-mode + browser verification

**Model: Opus 5 · Effort: High** — this is the phase that has been deferred
twice (open items F and G). It is long-running, stateful, and needs real
judgment when Stripe's behavior diverges from the mocks.

**Critical setup:** `.env.local`'s `STRIPE_SECRET_KEY` is a **LIVE** key. Use the
Stripe CLI's test-mode key for all of this. Never read or modify `.env.local`.

**Scenarios:**
1. Offline grant at a list rate + 25% discount → owner page shows net, not
   double-discounted (Phase 1).
2. Card row with a discount → `grant-manual` → mirror cleared, coupon detached
   (Phase 2).
3. 12.5% grant → applies at Stripe AND appears on the owner page (Phase 3).
4. Checkout with a card that triggers `incomplete` → retry immediately succeeds,
   no double subscription at Stripe (Phase 5).
5. Regression sweep of the guard matrix already built:
   `past_due`, `paused`, `cancel_at_period_end`, stale mirror, Stripe outage
   (`unknown` → fail closed).
6. Browser pass at 320px on `/owner/billing` (open item D) — use the `verify`
   skill's auth-cookie approach; direct navigation needs cookies set, not just
   localStorage.

**Done when:** every scenario is logged with its observed Stripe object state in
`docs/billing-run-log.md`.

---

## Phase 7 — Close-out

**Model: Haiku 4.5 · Effort: Low**

- Append a run-log section covering all six phases with the review findings
  marked resolved.
- Update `docs/billing-open-issues-plan.md`: close items B, D, F, G, L, M, N;
  restate anything still open.
- Re-run `/code-review` on the branch and confirm the five findings are gone.

---

## Model/effort summary

Use **Opus 5** for Phases 1, 4, 5, 6 — each involves either money semantics on
existing rows, a multi-file teardown, or the fail-closed guard logic where a
wrong call means double-billing a real partner. **Sonnet 5** is sufficient for
Phases 2 and 3: both are well-specified, single-surface changes with an obvious
correct shape. **Haiku 4.5** handles Phases 0 and 7 (mechanical bookkeeping).
