# Billing Run Log

Shared memory between the independently-run phases in docs/billing-run-phases.sh,
across BOTH chained plans (billing-guard-hardening-plan.md, then
billing-discounts-plan.md). Each phase reads this file first; a note here
about an earlier phase supersedes anything that contradicts it in that later
phase's own doc. Headers are tagged GUARD/DISCOUNT + phase number since both
plans number their own phases independently.

## GUARD Phase 1

Implemented `classifyBillingRow` in `lib/billing.ts` exactly as specified — no
deviation. Added `ClassifiableBillingRow` as a small input type (`status`,
`stripe_subscription_id`) rather than reusing `CancelableSubscriptionRow`,
since that one lacks `status`; later phases can import either type as needed.
Tests live in `tests/lib.billing.classify-billing-row.test.ts` (new file, pure
function, no mocks needed) covering all four states plus the
active-status-but-no-token edge case. `npx tsc --noEmit` and the new test file
both pass. Nothing else in the repo was touched — later phases can safely
import `classifyBillingRow`/`BillingRowState`/`ClassifiableBillingRow` from
`@/lib/billing` without redefining the predicate.

## GUARD Phase 2

Implemented as specified, no deviation. Two things later phases must know:

1. **The checkout route's `select` did not fetch `stripe_subscription_id`** —
   added it, plus a local `ExistingBillingRow = ClassifiableBillingRow & {
   stripe_customer_id, cancel_at_period_end }`. Any phase touching this query
   must keep that column or `classifyBillingRow` silently reads every row as
   `no_stripe_object` (fail-open to Checkout). Same trap applies elsewhere.
2. **Intentional behavior change:** a tokenless offline/check row with
   `status='active'` now *permits* Checkout (per the plan's `no_stripe_object`
   ⇒ "nothing at Stripe, safe"), where before it 409'd. Not UI-reachable —
   `billing/page.tsx` hides Subscribe when `isManual` — but Phase 6's setup-page
   guard should keep offline rows out of the Subscribe path.

Ordering: `resume_instead` is checked before `past_due`, so `past_due +
cancelAtPeriodEnd` returns `resume_instead` (matches the phase table).

Tests: matrix file extended with `past_due`, `past_due + cancelAtPeriodEnd`
(both assert `checkout.sessions.create` never called) and the tokenless case —
10 tests pass; `npx tsc --noEmit` clean. Phase 7 can skip re-adding those three
checkout cases; the resume side of `past_due` is still unwritten (Phase 4).

## GUARD Phase 3

Implemented in the checkout route as specified. Decisions later phases need:

1. **Third outcome `unknown`.** `readStripeTruth` returns live/dead/**unknown**;
   a non-`resource_missing` throw (Stripe outage) keeps the mirror's verdict, so
   an outage can never reopen double billing. Only `resource_missing` reads dead.
2. **New refusal code `stripe_live`** (409) for mirror-`cancelled` + Stripe-live
   (the `paused` case). Phase 5's UI should handle it alongside `resume_instead`
   / `fix_payment`.
3. **No write-back on that path** — `mapStripeSubscriptionStatus` folds `paused`
   into `cancelled`, so "correcting" the row would be a no-op or wrong. Only the
   refuse path writes (`status: "cancelled"`, keyed on `venue_id`, not `id` — the
   select still has no `id` column).
4. Self-heal costs one `subscriptions.retrieve` and only when a row has a
   `stripe_subscription_id`; tokenless rows never call Stripe.

Tests: 5 self-heal cases added to the matrix file (both directions,
`resource_missing`, outage, tokenless) — Phase 7 can skip all of them. 15 tests
pass, `npx tsc --noEmit` clean. Phase 8 should verify the `paused` case live.

## GUARD Phase 4

Implemented exactly as specified, no deviation: the resume route's guard is
now `!classifyBillingRow(subscription).live` instead of `status !== "active"`,
so `past_due` rows (still live at Stripe) can resume, same as `active`.
`resumeSubscription()` needed no change, as predicted.

Added one test: `past_due + cancelAtPeriodEnd` → resume succeeds (200),
`subscriptions.update` called with `cancel_at_period_end: false`. The
plain-`cancelled` refusal case was already covered by an existing test, so
nothing new was needed there — Phase 7 can skip both. 16 tests pass in the
matrix file, `npx tsc --noEmit` clean.

## GUARD Phase 6

Implemented as specified, no deviation. `app/owner/billing/setup/page.tsx`
now has two checks in sequence: `active && !cancelAtPeriodEnd` → dashboard
(unchanged); else any subscription that's live (`active`/`past_due`) AND
either `cancelAtPeriodEnd` or `past_due` → `/owner/billing`. Everything else
(cancelled/no row) falls through to the existing Subscribe UI. Kept it as a
plain client-side conditional, no import of `classifyBillingRow` server code,
per the phase doc. No dedicated test file added (page has none today, and
the doc marked tests optional). `npx tsc --noEmit` clean. Nothing for later
phases to know — this page had no other callers/consumers.

## GUARD Phase 5

Implemented as specified, with one real bug found via Part A's "flag it, don't
paper over it" instruction: the checkout route's self-heal path
(`app/api/owner/billing/checkout/route.ts`, the `readStripeTruth === "dead"`
branch from Phase 3) wrote `status: "cancelled"` but never cleared
`cancel_at_period_end`, so a row that was `active` + scheduled-cancel and then
found dead at Stripe would land as `cancelled` + `cancelAtPeriodEnd: true` —
exactly the "shouldn't be producible" combo the phase doc asked me to check
for. Fixed by adding `cancel_at_period_end: false` to that same update; updated
the two matrix tests asserting the old write shape.

Part B: `displayStatus()` now special-cases `status === "past_due"` to always
show "Payment due" regardless of `cancelAtPeriodEnd`, ahead of the existing
`cancelAtPeriodEnd → "cancelled"` fold. No markup/sizing changes — same
`subStatus`/button elements Phase 6 already made mobile-safe, only the
selection logic changed.

Part C: added a mount-only effect that captures the `?success=`/`?error=`
banner into local state (`urlBanner`) and immediately `router.replace`s the
clean URL, so a stale param can't resurface after a later action; flipped the
render ternary to prefer `actionMessage` over `urlBanner`.

**Could not browser-verify at 320px this session** — network/localhost calls
(curl, lsof, Playwright) were denied by the sandbox with no prompt resolution.
Static review: Part B/C changes don't touch markup size/layout (only which
existing badge entry renders, and banner state source), so overflow risk is
low, but this still needs a real screenshot pass before shipping — flagging
for whichever phase does live verification.

Tests: 2 existing matrix tests updated for the new write shape (25 total
still pass across the 3 billing test files), `npx tsc --noEmit` and
`npx eslint` clean on both changed files.

## GUARD Phase 7

No code changes — this phase's entire scope was already delivered by earlier
phases, exactly as their run-log entries predicted:

1. Matrix widened to `past_due` / `past_due + cancelAtPeriodEnd` for both
   resume and checkout — done in Phase 2 (checkout) and Phase 4 (resume);
   present in `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`.
2. All three self-heal cases (live→canceled corrects+allows,
   cancelled→paused refuses `stripe_live`, `resource_missing` reads dead not
   502) — done in Phase 3, same file.
3. Direct `classifyBillingRow` unit tests — done in Phase 1,
   `tests/lib.billing.classify-billing-row.test.ts`.

Verified rather than re-derived: read both test files to confirm the cases
genuinely exist (not just claimed), then ran the full suite — 132 files,
1085 passed / 13 skipped, 0 failed — and `npx tsc --noEmit` clean. Nothing
left for later phases on this item; Phase 8 (live Stripe verification of the
`paused` case, per Phase 3's note) is still open.

## GUARD — code-review fixes (post-Phase 7)

Three findings from a review of the working diff, all fixed. These SUPERSEDE
Phase 3's notes 1 and 3.

1. **`readStripeTruth` moved to `lib/billing.ts` and widened to four outcomes**
   (`live` / `dead` / `missing` / `unknown`) so both routes share it. The new
   `missing` case splits `resource_missing` out of `dead`: Stripe throws it for
   a genuinely deleted object AND for a wrong-mode id (test id, live key), so it
   is not authoritative. Phase 3's "only `resource_missing` reads dead" is no
   longer accurate.
2. **Fail-closed on `unknown` in the mirror-`cancelled` branch.** That branch
   previously refused only on `live`, so a Stripe outage let a possibly-`paused`
   (still live) subscription through to Checkout — double billing, the exact
   thing the branch exists to prevent. It now also refuses on `unknown`, with a
   new 409 code **`stripe_unreachable`** ("try again in a few minutes") beside
   the existing `stripe_live`. No UI consumes these codes today (the pages
   render `error` text), so nothing downstream needed changing.
3. **`resource_missing` no longer writes back to the mirror.** It only unblocks
   the current request (`rowState` is downgraded in memory); the
   `status: "cancelled", cancel_at_period_end: false` update now fires solely on
   a confirmed-dead Stripe status. This matters because `.env.local`'s
   `STRIPE_SECRET_KEY` is a LIVE key — a key/mode mismatch would otherwise have
   silently overwritten a genuinely live row to `cancelled` and invited a real
   duplicate-billing resubscribe.
4. **Resume route got the checkout route's self-heal** (finding 3, UX parity):
   after `classifyBillingRow(...).live` passes it now calls `readStripeTruth`
   and returns the friendly `checkout_instead` 409 on `dead`/`missing` instead
   of surfacing a raw 502 from `subscriptions.update`. `unknown` deliberately
   falls through and fails naturally. No DB write on any of these paths.

Tests: the `resource_missing` case now asserts NO db write; four new matrix
cases (mirror-cancelled + outage → `stripe_unreachable`; mirror-cancelled +
Stripe-canceled → allow; resume + dead Stripe object → `checkout_instead`;
resume + outage → still attempts). 20 tests in the matrix file, full suite
132 files / 1089 passed / 13 skipped / 0 failed; `npx tsc --noEmit` and
`npx eslint` clean on all changed files. Phase 8's live-Stripe verification
should now also cover the mirror-`cancelled` + outage path.

## DISCOUNT Phase 1

Implemented as specified, no deviation. New migration
`20260731120000_billing_discounts.sql`: additive mirror columns on
`billing_subscriptions` (`stripe_coupon_id`, `discount_label`,
`discount_percent_off`, `discount_amount_off_cents`, `discount_ends_at`) plus a
new `billing_discount_grants` audit table.

Decision for later phases: `granted_by` on the grants table is `text`, not a
uuid FK — `requireAdminAuth()` (`lib/adminAuth.ts`) has no `admin_users` table,
only a configured-credentials username (`adminUsername`), so that's what
Phase 3 should write into `granted_by`. Grant rows store one column per
discount type (`free_months`, `percent_off`, `amount_off_cents`,
`custom_price_cents`, all nullable) rather than a single polymorphic `value`
column, gated by a `discount_type` check constraint — Phase 2/3 should read/
write only the column matching `discount_type`, leaving the others null.

No RLS policies added on `billing_discount_grants` (admin-only, accessed via
`supabaseAdmin` service-role client same as other admin writes) — deny-by-
default, consistent with other admin-only tables. Migration not yet applied
to a live Supabase project this session; Phase 3/4 (or whoever runs `db push`
next) should apply it before wiring the API.

## DISCOUNT Phase 2

`lib/billingDiscounts.ts` built as specified. Things later phases must know:

1. **Removal requires `discounts: ""`, not `[]`.** In stripe 22.x an empty
   array *leaves discounts unchanged*; only the empty string clears them.
2. **Coupon reuse = deterministic id** (`hc-free-3mo`, `hc-pct-25-forever`,
   `hc-amt-2500-usd-once`) + `coupons.retrieve`, since Stripe's coupon list has
   no percent/amount filter. Mismatched id collision → create with a
   Stripe-generated id rather than reuse.
3. **Exported `validateDiscountSpec(spec)`** already rejects `percent_off > 100`,
   non-positive values, `repeating` without months, and months on a
   non-repeating duration — Phase 3 should call it, not re-derive it.
4. Offline path writes `amount_cents` / `current_period_end` directly and is
   **not reversible**; `removeDiscountFromSubscription` clears the mirror only.
5. Mirror shape: `stripe_coupon_id === null` marks a locally-applied discount —
   Phases 4/5/6 should read it that way.

Tests: `tests/lib.billingDiscounts.test.ts`, 24 passing — Phase 9 can skip the
unit-level spec/validation/offline cases. `npx tsc --noEmit` + eslint clean.
Not verified against live test-mode Stripe (Phase 10's job).

## DISCOUNT Phase 3

Implemented as specified, no deviation: `POST /api/admin/billing` gained
`"apply-discount"` and `"remove-discount"`, following the existing
`grant-manual`/`revoke` dispatch pattern. Things later phases need:

1. Both actions look up the `billing_subscriptions` row by `venue_id`
   (`id, stripe_subscription_id, amount_cents, current_period_end` — exactly
   `DiscountableSubscriptionRow`) and 404 if none exists.
2. `apply-discount`'s server-side validation duplicates
   `validateDiscountSpec`'s rules inline (percent 0<x≤100, positive-int
   amount, repeating needs `duration_in_months`) rather than calling it,
   per the phase doc's "this validation is the actual safety net" framing —
   `lib/billingDiscounts.ts` still re-validates too (defense in depth).
3. `billing_discount_grants.reason` is nullable and optional in the request
   body; `granted_by` is `auth.adminUsername` from `requireAdminAuth`, per
   Phase 1's decision. Grant-row insert failure is non-fatal (same pattern as
   the existing invoice-insert warning) — the discount is already live.
4. `custom_price` (permanent price swap) is intentionally NOT handled by
   either action — Phase 1/2 both scoped it out of `lib/billingDiscounts.ts`
   as a separate Price-swap mechanism; a later phase adding it needs its own
   action or an extended `discountType` branch.

Tests: new `tests/api.admin.billing-discounts.test.ts` (6 tests) covering all
three rejected-input cases (never reach the helper), a successful apply with
grant-row assertion, 404 on missing subscription, and remove-discount. Full
suite: 134 files / 1119 passed / 13 skipped, `npx tsc --noEmit` and eslint
clean. Not browser-verified (admin UI doesn't call this yet — later phase).

## DISCOUNT Phase 6 (webhook sync)

Implemented as specified. One SDK discovery later phases must know:

1. **The coupon is at `discount.source.coupon`, NOT `discount.coupon`, and it is
   itself expandable** (stripe 22.x). So expanding `discounts` alone still yields
   a bare coupon id. New exports in `lib/billingDiscounts.ts`:
   `discountCouponRef`, `resolveDiscountCoupon` (retrieves by id when needed),
   `discountMirrorFromStripe(discount, coupon)`, plus now-exported
   `DiscountMirror` / `CLEARED_MIRROR`. Phase 5 should reuse these rather than
   re-reading Stripe shapes.
2. `upsertSubscription` now folds the mirror into its existing upsert (cleared on
   `.deleted`). When discount state is **unreadable** (no `discounts` field,
   unexpandable, Stripe unreachable) it **omits** the columns so the mirror is
   kept, never wrongly cleared. Offline/local discounts are safe — the stale-id
   guard already skips tokenless rows.
3. Added `customer.discount.created/updated/deleted` handling, keyed on
   `stripe_subscription_id` (that match IS the ownership guard).

Tests: new `tests/api.webhooks.stripe-discount-sync.test.ts`, 7 cases. Full
suite 135 files / 1126 passed; tsc + eslint clean. Not verified against live
test-mode Stripe — Phase 10 should confirm the real `discounts` payload shape.

## DISCOUNT Phase 7

Implemented as specified, no deviation on scope. `allow_promotion_codes: true`
added to the checkout session in `app/api/owner/billing/checkout/route.ts`.
Admin management landed as a **sibling route**, `app/api/admin/billing/
promo-codes/route.ts` (GET list / POST create / PATCH deactivate), reusing
`createOrReuseCoupon` + `validateDiscountSpec` from Phase 2's
`lib/billingDiscounts.ts` — not added to `../route.ts`, per the phase doc's
own suggestion, since that file was already ~440 lines. UI landed inside
`BillingSection.tsx` (new "Promotion codes" panel at the bottom) rather than a
new admin nav section, to avoid touching `adminSections.tsx` routing for one
small feature.

One SDK discovery later phases must know: **this Stripe SDK version's
Promotion Code shape is `promotion: { type: "coupon", coupon: id }`**, not the
older flat `coupon: id` — both on `PromotionCodeCreateParams` and on the
returned object (`pc.promotion.coupon`, not `pc.coupon`). Got this wrong on
the first pass; `npx tsc --noEmit` caught it immediately. Any future promo-code
work should read `promotion.coupon`, expand `"data.promotion.coupon"` on list.

Tests: new `tests/api.admin.billing-promo-codes.test.ts` (7 cases: list,
invalid discount type, bad maxRedemptions, past expiresAt, successful create,
deactivate, missing id on deactivate); one assertion added to the existing
checkout matrix test confirming `allow_promotion_codes: true` is sent. Full
suite 136 files / 1133 passed / 13 skipped; `npx tsc --noEmit` and eslint
clean on all changed/new files. Not browser-verified (Checkout's own promo UI
is Stripe-hosted; admin panel not clicked through live-Stripe this session —
a later phase doing live verification should exercise "create → shows in
list → redeem in test-mode Checkout → deactivate").

## DISCOUNT Phase 4

Implemented as specified, no deviation. `GET /api/admin/billing` now selects
the Phase 1 mirror columns and adds `subscription.discount` (`label`,
`percentOff`, `amountOffCents`, `endsAt`, or `null`) to each partner. Added a
"Discount" control (button reads "Add discount" / "Discount…") next to
Grant/Revoke in `BillingSection.tsx`, shown whenever a subscription exists and
isn't cancelled (same visibility rule as Revoke) — a modal either shows the
active discount + Remove, or the apply form (type → value → duration, with
`durationInMonths` only rendered when duration is `repeating`, so illegal
combos can't be built in the UI). `free_months` has no duration control, wired
as the plan specified (backend already treats it as 100%-off repeating).

No component test added — the phase doc marked this optional and prioritized
the illegal-combo UI logic instead, which is enforced structurally (the
`durationInMonths` field literally doesn't render outside `repeating`) rather
than via a runtime check. `npx tsc --noEmit`, eslint, and the full suite (134
files / 1119 passed / 13 skipped) all clean. Not yet browser-verified — Phase
9/10 (or whichever phase does live-Stripe verification) should exercise the
modal against real test-mode Stripe, including the "replace, not stack"
messaging.

## DISCOUNT Phase 8

Implemented as specified. Scope calls the phase doc left open, plus what later
phases need:

1. **New module `lib/billingCustomPrice.ts`**, not `billingDiscounts.ts` —
   Phase 2's header explicitly says the Price swap "deliberately does not appear
   in this module." Exports `setCustomPrice(row, priceId)`,
   `CUSTOM_PRICE_PRORATION_BEHAVIOR = "none"` (next cycle, no proration), and
   `isStripePriceId`.
2. **Price id is pasted, not minted** (the doc's suggested scope call): admin
   creates the negotiated recurring Price in the Stripe Dashboard. The helper
   refuses archived / one-time / non-USD / tiered (no `unit_amount`) prices and
   multi-item subscriptions before swapping.
3. **Offline rows are refused** (400, "use Grant offline") — no Stripe objects
   to swap; the offline grant flow already takes a dollar amount.
4. Route action `"set-custom-price"` on POST `/api/admin/billing`; audit row
   written with `discount_type: 'custom_price'`, `custom_price_cents`.
5. Mirror write failure is non-fatal + returns `warning` — the webhook's
   `upsertSubscription` re-derives `amount_cents` from the price, so it self-heals.
6. UI: separate "Custom rate" modal/button in `BillingSection.tsx` (Stripe-billed,
   non-cancelled rows only), NOT a fourth discount type.

Tests: `tests/lib.billingCustomPrice.test.ts` (12) + 4 route cases appended to
`tests/api.admin.billing-discounts.test.ts`. Full suite 137 files / 1149 passed
/ 13 skipped; tsc + eslint clean. Not live-Stripe verified — Phase 10 should
add a real price-swap run to its checklist.

## DISCOUNT Phase 9

Most of this phase's coverage already existed from Phases 2/3/6 (unit specs,
route validation/404, webhook mirror clear on no-discount/deleted/
discount.deleted — that last one already subsumes "expiry", since Stripe
represents both as the discount leaving the array and firing
`customer.subscription.updated`). Only two real gaps, both filled:

1. **Admin-auth enforcement was untested** for `apply-discount`/
   `remove-discount` (the existing mock always returned `ok: true`). Made
   `requireAdminAuth` a controllable `vi.fn` in
   `tests/api.admin.billing-discounts.test.ts` and added two 401 cases.
2. **Regression case (the important one):** added a discounted + `active` row
   to `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` asserting
   409/no-Stripe-call. Note for later phases: the checkout route's `select()`
   doesn't even fetch the discount mirror columns (`app/api/owner/billing/
   checkout/route.ts:62`), so a discount structurally cannot influence
   `classifyBillingRow` — this test documents that invariant rather than
   catching a live bug.

Nothing left for Phase 10 on the test side. Full suite: 138 files / 1152
passed / 13 skipped; `npx tsc --noEmit` and eslint clean.

## --- Verification session started ---
Resuming from docs/billing-run-phases-verify.sh, run manually while Andrew
watches. Both build runs (GUARD, DISCOUNT) above this line are assumed done.

## Open-issues Phase 1 (migration + baseline)

Andrew ran `supabase db push` himself before this phase started. Confirmed via
`npx supabase migration list`: `20260731120000` (the discount migration) shows
matching `local`/`remote` timestamps, and every local migration file has a
remote counterpart — nothing pending. `npx tsc --noEmit`, `npm run lint`, and
`npm test` all clean: 138 files / 1152 passed / 13 skipped, matching the
baseline DISCOUNT Phase 9 recorded. No code changes this phase. Next: Phase 2
(server-side offline-row Checkout guard).

## Open-issues Phase 2 (server-side offline-row Checkout guard)

Closed the GUARD Phase 2 note-2 gap: a tokenless offline/check row with
`status='active'` could reach Checkout server-side, relying only on the UI
hiding Subscribe. `app/api/owner/billing/checkout/route.ts`'s select now also
fetches `billing_method`; a check placed **ahead of** `classifyBillingRow`
refuses (409, code `offline_billing`) any row with `billing_method ===
OFFLINE_BILLING_METHOD` that isn't `cancelled`. It is decided on
`billing_method` alone — the Stripe-truth logic below it has no bearing on a
tokenless row, and no Stripe-side collision can catch this case because there
is no customer to collide with.

**Two facts later phases should not re-derive** (both verified in code, and they
bound the whole offline state space):

1. `BillingStatus` is exactly `active | past_due | cancelled` (`lib/stripe.ts`).
2. **An offline row is only ever `active` or `cancelled`.** `grant-manual`
   creates it `active`, `cancel_at_period_end: false`, with every processor id
   explicitly nulled; the cron expiry sweep (`app/api/cron/billing/route.ts`)
   flips it straight to `cancelled` when the paid-through date lapses. It never
   goes `past_due`. So `!== "cancelled"` is equivalent to `=== "active"` here —
   kept as `!== "cancelled"` because that fails in the safe direction if the
   domain ever widens. `cancelled` falling through is deliberate: converting an
   expired check payer to self-serve card billing is the same Resubscribe path
   the owner UI already offers.

**Scope correction — the setup page needed no change.** I first mirrored the
guard into `app/owner/billing/setup/page.tsx`, then proved it was dead code and
reverted it: walking that page's branches for an offline row, `active +
!cancelAtPeriodEnd` is caught by `activeNotScheduled` → dashboard, and
`cancelled` is excluded by the guard's own condition, so no offline row can
reach it. GUARD Phase 6's existing branches already keep offline rows out of
the Subscribe UI; the earlier claim in this plan that they didn't was wrong.
That page is byte-identical to its GUARD Phase 6 state.

Tests: two new cases in `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`
(offline+active → 409 `offline_billing`, no `checkout.sessions.create`;
offline+cancelled → still 200), plus `OFFLINE_BILLING_METHOD: "offline"` added
to its `@/lib/stripe` mock. Made `billing_method` **required** on the test
file's `SubRow` and set `billing_method: "stripe"` on the `ACTIVE` base row
(which every other fixture spreads), so fixtures match the NOT NULL DEFAULT
'stripe' column instead of leaving it undefined — this also sharpens the
pre-existing "tokenless row permits checkout" case into the real distinction:
tokenless-but-stripe stays allowed, offline is blocked. Verified the new
blocking test is not vacuous by disabling the guard and confirming it fails
(the permissive case correctly still passed).

23 tests in the matrix file, full suite 138 files / 1154 passed / 13 skipped;
`npx tsc --noEmit` and `npm run lint` clean. Next: Phase 3 (review the
unlogged DISCOUNT Phase 5 diff + DISCOUNT code-review pass).

## Open-issues Phase 3 (Item C — review of the unlogged DISCOUNT Phase 5)

`app/owner/billing/page.tsx`'s discount display, read against
`docs/billing-discount-phase5.md`. The doc's four asks all check out: it shows
the discounted amount, the label, and the end date, and omits the end date
entirely when `discount_ends_at` is null ("forever"). `discountedAmountCents`
does clamp at 0 on the amount-off branch (`Math.max(0, …)`) — confirmed as the
plan asked; the percent branch needs no clamp because `percentOff` is capped at
100 by both `handleApplyDiscount` and `validateDiscountSpec`.

Three defects found, all three fixed in this phase:

1. **Offline/check rows double-counted their own discount.** This is a real
   money-display bug and the exact failure the phase doc was written to prevent.
   `applyOfflineDiscount` (`lib/billingDiscounts.ts`) already rewrites
   `amount_cents` to the net figure for `percent_off`/`amount_off` **and** writes
   the percent/amount into the mirror. The page then applied the mirror a second
   time: a $100 offline venue granted 25% off rendered "**$56** ~~$75~~" while
   the admin invoices $75 — both numbers wrong. Reachable from the admin UI
   today (the "Add discount" button shows for any non-cancelled row, offline
   included, and `applyDiscountToSubscription` routes on
   `stripe_subscription_id == null`).
   Fixed on the page, not in the helper, because for an offline row
   `amount_cents` genuinely IS the effective rate — free months push
   `current_period_end` out rather than zeroing the rate, so there is no case
   where an offline row's mirror should be re-applied. New
   `effectiveAmountCents(subscription)` recomputes only for Stripe rows; offline
   rows show `amount_cents` with the discount reduced to a label + end date.
   The mirror's value columns stay as the audit record of what was granted.
2. **Whole-dollar rounding printed a price nobody is charged.** Both the headline
   and the strike-through used `$${Math.round(cents / 100)}`. That was harmless
   for a round $100 list price but not once discounts exist — 10% off $99 showed
   "$89" against a real $89.10, and a 50¢ remainder rendered as "$1". Replaced
   with `formatPrice`: whole dollars when `cents % 100 === 0`, two decimals
   otherwise. This also fixes the pre-existing case of an offline grant entered
   as $99.50 displaying "$100".
3. **Degenerate strike-through.** The old markup struck the list price whenever
   `discount` was non-null. When a coupon can't be resolved,
   `discountMirrorFromStripe` still mirrors a label (falling back to the coupon
   id) with both value columns null, so `discountedAmountCents` returns the input
   unchanged and the card rendered "$100 ~~$100~~". The strike now renders only
   when the two amounts actually differ, which also collapses the duplicated
   discount/no-discount branches into one.

Two things deliberately **not** changed:

- **A discount survives on a `cancelled` row.** The Stripe path self-clears
  (`customer.subscription.deleted` → `CLEARED_MIRROR`), but the offline path does
  not: the cron expiry sweep flips `status` to `cancelled` and leaves the mirror,
  and the admin's Discount button is hidden for cancelled rows, so it can't be
  removed from the UI either. Cosmetic on a dead row (badge reads "Cancelled",
  Resubscribe is offered) — flagged, not widened into.
- **A `once` discount displays as if it were the ongoing price** for one cycle.
  Stripe populates `Discount.end` only for `repeating`, so `discount_ends_at` is
  null and no "ends …" line renders. It self-corrects when the coupon is consumed
  and `customer.discount.deleted` clears the mirror, and the label ("25% off for
  one month") carries the meaning in the interim.

Not browser-verified at 320px — that is Phase 4's job. The fix adds no new
element; the widest line is unchanged except that cents can now add three
characters to the headline.

## Open-issues Phase 3 (Item I — code review of the DISCOUNT half of the diff)

`/code-review` is **not an invokable command in this environment** (the only
project skill is `verify`, and `/code-review ultra` is user-triggered/billed), so
this was a manual read of `lib/billingDiscounts.ts`, `lib/billingCustomPrice.ts`,
`app/api/admin/billing/route.ts`, `app/api/admin/billing/promo-codes/route.ts`,
`app/api/webhooks/stripe/route.ts` and `BillingSection.tsx`. Nothing here was
changed — the three fixes above are the only code edits this phase.

**The plan's three named high-value targets all hold up:**

1. **`discounts: ""` vs `[]` removal semantics (Ph2 note 1).** Correct as
   written: removal sends `discounts: ""`, apply sends `[{ coupon }]` (which
   replaces rather than stacks). The SDK's `Emptyable` typing accepts the empty
   string, so tsc confirms the shape but not the behavior — that claim is
   runtime-unverifiable here and remains Phase 7 Check 3's job.
2. **Deterministic-coupon-id collision path (Ph2 note 2).** Safe. A retrieved
   coupon is reused only if `couponMatchesSpec` passes on validity, percent,
   amount, currency, duration and duration_in_months; a mismatch falls back to
   creating with a Stripe-generated id, never overwriting or reusing the
   colliding one. The `resource_already_exists` retrieve covers the concurrent-
   grant race. One subtlety worth knowing: `couponMatchesSpec` ignores `name`, so
   a hand-made coupon sitting at one of our ids with matching math but a
   different name would be reused, and the webhook later writes *its* name into
   `discount_label` — a silent relabel. Narrow and non-monetary.
3. **`upsertSubscription`'s omit-when-unreadable branch (Ph6 note 2).** Correct
   and fails safe. supabase-js builds the `ON CONFLICT DO UPDATE` set from the
   payload's own keys, so spreading `...(discountMirror ?? {})` genuinely
   preserves the five columns on update and lets them default to null on insert.
   `resolveDiscountMirror` returns null on all three unreadable shapes (no
   `discounts` field at all, retrieve threw, still a bare string after expand)
   and `CLEARED_MIRROR` only on a genuinely empty array.

**Additional findings, all flagged rather than fixed:**

- `handleApplyDiscount` selects the offline path on `stripe_subscription_id ==
  null`, not on `billing_method`. A Stripe row whose subscription id hasn't
  landed yet would take the local path and permanently rewrite `amount_cents`.
  Narrow (the admin list only renders a subscription once the row exists) but the
  two offline predicates in this feature now disagree — `setCustomPrice` uses the
  same null test, while the Phase 2 checkout guard keys on `billing_method`.
- **`applyOfflineDiscount` silently ignores `duration`.** "25% off **once**" on
  an offline row permanently rewrites `amount_cents` with no restore path, and
  repeat applications compound (10000 → 7500 → 5625). The module header documents
  irreversibility but not that duration is dropped entirely. Either lock the
  duration control for offline partners in the admin modal or say so in its copy.
- `syncDiscountFromEvent`'s customer-level fallback updates **every** row
  matching `stripe_customer_id`. Right for a customer-level discount, unbounded
  if one Stripe customer ever backs multiple venues.
- `promo-codes` GET lists with `limit: 100` and no pagination — codes past the
  first 100 are invisible to the panel, and therefore undeactivatable through it.
- `PatchBody.active` is declared and never read; PATCH hardcodes `active: false`.
  Dead field.
- **The admin discount modal has no replace path.** With a discount present it
  renders only "Remove discount"; the "applying this will replace any existing
  discount" copy lives in the *other* branch. So the manual runbook's DISCOUNT
  Check 5 ("apply a second discount over an existing one") is not reachable from
  the UI without removing first — verify it via the API, or treat the check as
  covering the messaging rather than the flow.
- `handleApplyDiscount` validates percent/amount inline but delegates
  `free_months` to `validateDiscountSpec`. Behaviorally fine (still a 400), but
  DISCOUNT Ph3's note 2 claims the inline validation is complete; it isn't.
- No new unauthenticated surface: `requireAdminAuth` gates every handler in both
  admin routes, and `stripePriceId` is regex-gated before any Stripe call.

Verification: `npx tsc --noEmit` and `npx eslint` clean on the changed file; the
six billing test files pass (85 tests) and the full suite is unchanged at 138
files / 1154 passed / 13 skipped — same baseline as Phase 2. Next: Phase 4
(browser verification at 320px + admin modals, no Stripe mutations), which should
add the offline+discount state to its screenshot matrix now that fix 1 has
changed what that state renders.

## Open-issues Phase 3b (Items L–S — fixing what the review found)

Inserted before Phase 4 so the browser pass screenshots the corrected behavior.
All eight items closed.

**L — offline discounts are now mirror-only.** The root cause behind four
separate defects was one line of design: `applyOfflineDiscount` wrote the net
figure into `amount_cents`. That made `duration` unenforceable (a "25% off once"
ran forever), let a second apply compound off the reduced number (10000 → 7500 →
5625, reachable via apply → Remove → apply), left removal with nothing to restore
from, and let the next `grant-manual` silently overwrite the discount while the
mirror still advertised it. The offline path no longer touches `amount_cents` at
all — it stays the list rate, the mirror carries the discount, and every reader
computes the net the same way it does for a Stripe row. Three consequences
implemented alongside:

- `free_months` no longer mirrors `discount_percent_off = 100`. It is a
  `current_period_end` extension, not a rate change; under the new model that 100
  would have rendered the partner's rate as $0 with nothing to ever undo it.
- Non-`forever` durations on offline percent/amount are **refused** (400) with a
  message pointing at Free months / Grant offline, because nothing local can
  expire them. The admin modal now shows "Forever" as fixed text for offline
  partners rather than offering three options, two of which the server rejects.
- Phase 3's `isManual` carve-out on `effectiveAmountCents` is **reverted**. That
  was the right patch against the old data model and the wrong one against this
  one — the double-count is now fixed at the source, and both row types share a
  single display rule. `formatPrice` and the conditional strike-through stay.

**M — one offline predicate.** `applyDiscountToSubscription` /
`removeDiscountFromSubscription` route on `billing_method ===
OFFLINE_BILLING_METHOD`, matching the Phase 2 checkout guard, instead of
`stripe_subscription_id == null`. `billing_method` is now required on
`DiscountableSubscriptionRow` and added to both admin-route selects (same trap
GUARD Ph2 note 1 flagged — dropping it from the `select()` would route every row
down the Stripe branch). A card-billed row with no subscription id gets an
explicit 400 rather than silently taking the local path.

**N — the cron sweep clears the mirror.** `app/api/cron/billing/route.ts` nulls
the five mirror columns in the same update that flips an expired offline grant to
`cancelled`. Nothing else could: no webhook fires for a tokenless row and the
admin's Discount control is hidden once cancelled, so the discount was stranded.

**O — the admin discount modal has a replace path.** "Apply a different discount
instead →" reveals the form over an existing discount and the footer button
becomes "Replace discount"; the "replaces, does not stack" copy moved to the
branch where it is actually true. The runbook's DISCOUNT Check 5 is now reachable
from the UI.

**P–S.** `couponMatchesSpec` compares `name`, so a same-math coupon parked at one
of our deterministic ids under a different name falls through to a
Stripe-generated id instead of being reused and silently relabeling the mirror on
the next webhook sync. `promo-codes` GET auto-pages (cap 1000) instead of
truncating at 100. Dead `PatchBody.active` removed. `free_months` is
inline-validated in `handleApplyDiscount` alongside percent/amount, making
DISCOUNT Ph3's note 2 true.

Also hardened while in the webhook: `syncDiscountFromEvent`'s customer-level
fallback resolves matching rows first and writes only when exactly one matches.
Checkout scopes a Stripe customer to one venue so this is defensive, but the
write was unfiltered by subscription and would otherwise fan out across every
venue sharing a customer, overwriting a sibling's subscription-level mirror.

**Tests (+7, 1154 → 1161).** Reworked the three offline cases in
`tests/lib.billingDiscounts.test.ts` (they asserted the `amount_cents` rewrite
this phase deletes) and added: applying twice cannot compound; non-`forever`
offline is refused for both `once` and `repeating`; a card row with a null
subscription id 400s rather than falling through; the coupon-name mismatch mints
a fresh id. Plus route-level `free_months` validation (0 / negative / fractional
/ missing), the two customer-level webhook cases, and the promo-code list now
asserting a second page is returned. `billing_method` was made **required** on
`tests/api.admin.billing-discounts.test.ts`'s `SubRow`, same discipline as Phase
2's matrix fixture — a fixture that omits it stops matching the real query. The
cron expiry test now asserts the mirror-clearing write shape. All four new
blocking assertions are non-vacuous by construction (each asserts an outcome the
pre-change code produced the opposite of).

`npx tsc --noEmit` and `npm run lint` clean; full suite 138 files / 1161 passed /
13 skipped. No migration needed — this phase changes what gets written to
existing columns, not the schema. Next: Phase 4.

**One thing Phase 4 must know:** any offline row that already received a
percent/amount discount under the old code has a *reduced* `amount_cents` in the
database, and will now render that reduced number as its list rate with the
discount applied on top — the old double-count, frozen into the data. There are
almost certainly none of these (the feature has never been live), but if Phase 4
seeds one, seed it fresh rather than reusing a pre-3b row.

## Open-issues Phase 4 (Items D+E — browser verification, no Stripe mutations)

Real Playwright screenshots at 320px against a throwaway hidden venue
(`zz-billing-verify-<runid>`) + owner + a single mutated `billing_subscriptions`
row, with forged `tp_owner_sess` / `admin_session` cookies (mirroring
`lib/ownerSession.ts` / `lib/adminSession.ts` — the "server-only" modules
weren't imported directly to avoid the server-component guard). Reused the
already-running dev server on :3000 rather than starting a new one. No
`STRIPE_SECRET_KEY` override was needed because every path exercised either
never reaches Stripe (offline-billed rows) or is refused by server-side
validation before a Stripe call would fire — the one exception (Promotion
codes' list GET) is a live *read*, not a mutation, and returned an empty list
for this Stripe account.

**`/owner/billing` at 320px, seven states (all screenshotted, all correct):**
1. Active, offline-billed — "Active — Billed Offline" badge, no Cancel/Resume
   button, "Contact us to update your payment or renew your access."
2. Active, card-billed — "Active" badge, "Cancel subscription" button, "No
   card on file".
3. Active + `cancelAtPeriodEnd` — badge folds to "Cancelled", "Resume
   subscription" button, "You'll keep access until Aug 31, 2026."
4. `past_due` + `cancelAtPeriodEnd=true` **together** — badge reads "Payment
   due", not "Cancelled". This is the GUARD Ph5 Part B assertion the run log
   flagged as never browser-verified; confirmed here with both flags set
   simultaneously, the strictest form of the check.
5. `cancelled` — "Cancelled" badge, "Resubscribe" link.
6. Active + `percent_off=25`, `discount_ends_at=null` — $75 struck against
   $100, "25% off" label, **no** "ends" text (the forever-degrade path Item C
   asked about).
7. Active + `amount_off_cents=2000`, `discount_ends_at` set — $80 struck
   against $100, "$20 off · ends Oct 31, 2026".

**Banner behavior (GUARD Ph5 Part C):** loaded `/owner/billing?error=payment-declined`
— banner rendered, URL replaced to bare `/owner/billing` on mount (confirmed via
`page.url()`), and a full page reload afterward did not resurface the banner
(confirmed both by URL and by asserting the banner's text was absent from the
DOM post-reload).

**Admin Discount modal** (`/admin/partner-billing`, offline row): "Percent
off" + "Forever" render as **fixed text** (not a dropdown) for an offline
partner, matching item L's duration lock. Applied 15% forever → button label
flipped "Add discount" → "Discount…", modal reopened showing "Active discount:
15% off forever". Clicked "Apply a different discount instead →" (item O's
replace path) → form re-opened over the existing discount with a "Replace
discount" button → replaced successfully. Removed via "Remove discount" →
button reverted to "Add discount", mirror cleared. Zero Stripe calls at any
step (offline path is mirror-only, per Phase 3b Item L).

**Admin Custom-rate modal, offline refusal (Phase 3b Check 6's negative case):**
seeded the row with a truthy `slimcd_recurring_token` and null
`stripe_subscription_id` (a legacy-SlimCD shape) so the "Custom rate" button
renders (`isStripe` keys off either token) while the offline-refusal branch
(`!row.stripe_subscription_id`) still fires. Entered `price_verify_fake_id` →
"This partner is billed offline — there is no Stripe subscription to move. Set
their rate with Grant offline / Extend instead." — the exact refusal message,
never reaching `stripe.prices.retrieve`.

**Admin Promotion codes panel:** opened via "Manage" (live Stripe
`promotionCodes.list` read — zero codes returned for this account, panel
rendered "No promotion codes yet." with no error). Opened "New code", set
Percent off = 0, submitted → "Percent off must be greater than 0 and no more
than 100." — `buildSpecFromBody`'s validation refuses before
`stripe.coupons.create`/`promotionCodes.create` are ever called. Did not
attempt a real create: every successful code creation is an unconditional
live-Stripe mutation with no offline/refusal branch to hide behind, unlike the
other two modals, so it's out of scope for a "no Stripe mutations" phase.

**Cleanup:** deleted the `billing_subscriptions` row, `venue_owner_venues`
link, `venue_owners` row, `venues` row, and the `auth.users` row — verified
zero `zz-billing-verify%` rows remain in `venues`. No dev server was started
(reused the one already running), so none was stopped. Scratch driver scripts
lived only in the scratchpad dir; the one throwaway `scripts/tmp-billing-verify/*-p4.cjs`
copies made to get Node's module resolution to find `node_modules` were
deleted after the run — that directory is back to exactly what Phase 5 already
expected to find there (`lib.cjs`, `probe.cjs`, `stripe-test-env.sh`).

All three "not browser-verified" flags (D, and the two GUARD Ph5 Part
B/C sub-items folded into it, plus E) are now closed. Next: Phase 5 (clean
junk + chunked commits), then the manual-runbook Phases 6/7.
