# Billing — Open Issues Plan (post-run cleanup)

Derived from `docs/billing-run-log.md` after both chained runs
(`billing-guard-hardening-plan.md`, `billing-discounts-plan.md`) finished their
build phases. This doc enumerates everything the run log left **open, unverified,
unlogged, or flagged**, and sequences it.

Everything below is currently **uncommitted working-tree state**. Nothing here
has run against real Stripe. The discount migration has **not been applied** to
Supabase — that gates most of the verification.

## Inventory of open items

> **Status as of 2026-08-02 (billing-code-review-fixes-plan.md Phase 7 close-out):**
> Items **B, D, F, G, L, M, N** are closed — see the "Closed" column and the
> linked run-log sections. **T** (new) is also closed. Everything else in this
> table remains open/unquantified as of the last time it was reviewed.
>
> **Status as of 2026-08-02 (billing-review-round2-plan.md Phase 4 close-out):**
> Items **U, V, W** (new, from the second `/code-review` pass) are closed — see
> the "Closed" column and `docs/billing-review-round2-plan.md`.
>
> **Status as of 2026-08-02 (code-review-round3-plan.md Phase 8 close-out):**
> Items **X, Y** (new, from the third `/code-review` pass) are closed — see
> the "Closed" column and `docs/code-review-round3-plan.md`. The round's other
> five findings (NFL Pick 'Em spread-line/settlement fixes, the `AppShell`
> legal-notice restoration) are recorded in
> `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md` and this doc's
> Phase 7 as-built respectively — not in this inventory table, which is
> billing-scoped.

| # | Item | Source | Closed |
|---|---|---|---|
| A | Migration `20260731120000_billing_discounts.sql` never applied | DISCOUNT Ph1 | — applied, see Phase 1 above |
| B | Offline/check row with `status='active'` now *permits* Checkout (server-side); only the UI hides Subscribe | GUARD Ph2 note 2 | ✅ fixed by Phase 2 above (`offline_billing` 409 guard); re-verified in REVIEWFIX Phase 6 Scenario 5 |
| C | DISCOUNT Phase 5 (partner-facing discount display) shipped code but **wrote no run-log entry** — never reviewed | run log gap between DISCOUNT Ph4 and Ph8 | open |
| D | GUARD Phase 5 could not browser-verify at 320px (sandbox denied localhost) | GUARD Ph5 | ✅ closed — REVIEWFIX Phase 6 Scenario 6 (320px pass) and Phase 8's 8.6 (320px on the empty state) both ran in a real browser |
| E | Admin discount modal (Ph4), promo-code panel (Ph7), custom-rate modal (Ph8) never clicked through | DISCOUNT Ph4/7/8 | open |
| F | GUARD Phase 8 — live Stripe test-mode verification of `past_due` / `paused` / outage paths never run | GUARD Ph3, Ph7, code-review §4 | ✅ closed — REVIEWFIX Phase 6 Scenario 5 (23/23) + REVIEWFIX Phase 8's 8.6 Scenario 5 re-ran the same matrix unchanged (18/18 + 3/3) |
| G | DISCOUNT Phase 10 — live Stripe test-mode verification of discounts, promo codes, price swap never run | DISCOUNT Ph2/4/6/7/8 | ✅ closed — REVIEWFIX Phase 6 Scenarios 1–3 (offline list-rate, mirror-clear, fractional percent-off) verified against real Stripe test mode |
| H | Real Stripe `discounts` payload shape (`discount.source.coupon`) confirmed only against types, never a live event | DISCOUNT Ph6 note 1 | open |
| I | DISCOUNT run never logged a code-review pass (GUARD did) | script has a review step; log has only a GUARD review section | open |
| J | Junk in tree: `.tmp_full_diff.txt`, `scripts/tmp-billing-verify/` | `git status` | open |
| K | Whole feature is one giant uncommitted diff | `git status` | open — superseded in spirit by `billing-code-review-fixes-plan.md`'s per-phase commits |
| L | **Offline discounts are structurally wrong**: `applyOfflineDiscount` rewrites `amount_cents`, so `duration` is silently ignored, repeat applies compound, removal can't restore, and the next `grant-manual` clobbers the discount | Phase 3 review | ✅ closed — `billing-code-review-fixes-plan.md` Phase 1 fixed the double-count at the source (offline `amount_cents` = list rate, mirror carries the discount) and Phase 2 made `grant-manual` clear the mirror, closing the clobber path described here |
| M | The "is this row offline?" predicate disagrees across the feature (`stripe_subscription_id == null` vs `billing_method`) | Phase 3 review | ✅ closed — Phase 2's checkout guard and Phase 1/2's offline-path code all route on `billing_method`, matching this item's recommended fix |
| N | The discount mirror survives on a cancelled offline row — the cron expiry sweep doesn't clear it and the admin's Discount button is hidden for cancelled rows | Phase 3 review | ✅ closed — Phase 2 (`grant-manual` clears `discount_*` alongside processor ids) plus the cron sweep now going through the same cleared-mirror path; re-verified in REVIEWFIX Phase 6 |
| O | Admin discount modal has **no replace path** (only Remove), yet its other branch advertises "applying this will replace any existing discount" | Phase 3 review | open |
| P | `couponMatchesSpec` ignores `name`, so a same-math/different-name coupon at one of our deterministic ids is reused and the webhook later relabels the mirror | Phase 3 review | open |
| Q | `promo-codes` GET lists `limit: 100` with no pagination — codes past 100 are invisible and undeactivatable | Phase 3 review | open |
| R | `PatchBody.active` is declared and never read; PATCH hardcodes `active: false` | Phase 3 review | open |
| S | `handleApplyDiscount` doesn't inline-validate `free_months`, contradicting DISCOUNT Ph3's note 2 | Phase 3 review | open |
| T | `billing_invoices` table was never written by any webhook handler (dead write path) | DISCOUNT Phase 10 review | ✅ closed — fixed by `f3490ac` (the Phase 0 baseline commit on `billing-code-review-fixes-plan.md`), confirmed against live webhooks in REVIEWFIX Phase 6 |
| U | `grant-manual` unconditionally detached a Stripe coupon before taking a card row offline, 502ing on a churned (`cancelled`) row that Stripe refuses to update | second `/code-review` pass, finding 1 | ✅ closed — `billing-review-round2-plan.md` Phase 1: detach skipped when the mirror has nothing to detach or the row is already `cancelled`; the live-subscription path stays fail-closed. Mocked-SDK tests only, per the plan |
| V | The 3-D-Secure recovery path (`checkout.session.completed` incomplete → `customer.subscription.updated` active) never sent the welcome email and permanently dropped the first `invoice.paid` | second `/code-review` pass, finding 2 | ✅ closed — `billing-review-round2-plan.md` Phase 2: welcome email now hangs off `isFirstSyncForSubscription` from both webhook entry points; first invoice backfilled at row-creation time. Row-creation timing + invoice backfill (2.2) confirmed live in Phase 4 against real Stripe test mode (3DS card `4000002500003155`); the email send itself (2.1) is closed on unit-test coverage — the live run's send outcome was inconclusive (no Resend send attempt logged despite `RESEND_API_KEY` present; see Phase 4's run-log entry) and was not pursued further given the cost of a second full signup cycle. Not reopened as its own item since nothing here implicates the billing code |
| W | `setCustomPrice` accepted a yearly (or non-1x-monthly) Stripe price, silently flipping a subscription to yearly billing and mis-stating the rate everywhere `amount_cents` renders | second `/code-review` pass, finding 3 | ✅ closed — `billing-review-round2-plan.md` Phase 3: fifth guard requires `interval === 'month' && interval_count === 1`. Mocked-SDK tests only, per the plan |
| X | `customer.discount.deleted` cleared the **entire** discount mirror matched only on `stripe_subscription_id`, with no check of *which* coupon died — a retried/reordered delete for a replaced coupon wiped out the replacement while Stripe kept billing it | third `/code-review` pass, finding 5 | ✅ closed — `code-review-round3-plan.md` Phase 5: `syncDiscountFromEvent` now reads the target row(s) before writing and gates the clear on `row.stripe_coupon_id` matching the deleted event's coupon id (`deletedCouponOwnsMirror`), on both the subscription and customer-level branches. A null `stripe_coupon_id` (offline discount) or an unresolvable event coupon ref both resolve to "don't clear." Mocked-SDK tests only (`tests/api.webhooks.stripe-discount-sync.test.ts`, 9→14 cases incl. the replace-then-retry sequence end to end); live Stripe pass considered optional per Phase 8 (round-2 Phase 4's live-harness cost note still applies) |
| Y | `sweepAbandonedIncompleteSubscriptions` listed account-wide incomplete subscriptions with a flat `limit: 100` and no paging — past 100 account-wide incompletes, this venue's own abandoned subscription could fall outside the page and be missed, reopening the double-bill window the sweep exists to close | third `/code-review` pass, finding 6 | ✅ closed — `code-review-round3-plan.md` Phase 6: switched to `.list(...).autoPagingToArray({ limit: 1000 })`, matching the promo-codes route's existing shape; log-and-proceed failure policy unchanged; hitting the 1000-item cap now logs a warning naming the venue. Mocked-SDK tests only (`tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`, new case: match sitting behind 100 filler subscriptions) |

---

## Phase 1 — Apply the migration + baseline

**Model: Sonnet 5 · effort: low**

1. Apply `supabase/migrations/20260731120000_billing_discounts.sql` via
   `npx supabase db push`.
2. Confirm the five mirror columns exist on `billing_subscriptions` and
   `billing_discount_grants` exists with its `discount_type` check constraint.
3. Run `npx tsc --noEmit`, `npm run lint`, `npm test` to record a clean
   baseline (expect ~138 files / 1152 passed / 13 skipped).

Gates: everything else. No live-Stripe work is meaningful until the columns are real.

**Risk:** `db push` may surface unrelated pending migrations. If it wants to apply
anything other than `20260731120000`, stop and report rather than pushing.

---

## Phase 2 — Item B: server-side offline guard

**Model: Opus 5 · effort: medium**

The one genuine behavior regression the run log flagged and then left standing.

- `app/api/owner/billing/checkout/route.ts` currently selects
  `status, stripe_customer_id, stripe_subscription_id, cancel_at_period_end`.
  Add `billing_method` to that select (and to `ExistingBillingRow`).
- Refuse with 409 + code `offline_billing` when
  `existing.billing_method === OFFLINE_BILLING_METHOD` (`lib/stripe.ts`),
  **before** `classifyBillingRow`, and only when the row is not cancelled —
  a cancelled offline grant should still be able to convert to Stripe.
- ~~Mirror the same check in `app/owner/billing/setup/page.tsx`'s fall-through
  (GUARD Ph6 left offline rows falling into the Subscribe UI).~~ **Wrong —
  disproved during execution.** GUARD Ph6's `activeNotScheduled` branch already
  catches offline+`active`, and offline rows are only ever `active` or
  `cancelled`, so a guard there is unreachable. See the run log's Phase 2 entry.
- Heed GUARD Ph2 note 1: any change to this `select()` that drops
  `stripe_subscription_id` silently fails open. Add a comment.

**Tests:** two cases in `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`
— offline + `active` → 409 `offline_billing`, no `checkout.sessions.create`;
offline + `cancelled` → still allowed.

---

## Phase 3 — Item C+I: review the unlogged/unreviewed diff

**Model: Opus 5 · effort: high**

Two blind spots in one pass, because they overlap.

1. **DISCOUNT Phase 5** (`app/owner/billing/page.tsx`) shipped without a run-log
   entry, so no later phase read its decisions. Review it directly against
   `docs/billing-discount-phase5.md`: does it show the discounted amount, the
   label, and the end date; does it degrade correctly when `discount_ends_at` is
   null ("forever"); does `discountedAmountCents` handle
   `amountOffCents > amountCents` (it clamps at 0 — confirm) and a discount on a
   `cancelled` row.
2. **Code-review the DISCOUNT half of the diff** the way the GUARD half was
   reviewed (`lib/billingDiscounts.ts`, `lib/billingCustomPrice.ts`,
   `app/api/admin/billing/route.ts`, `promo-codes/route.ts`,
   `app/api/webhooks/stripe/route.ts`, `BillingSection.tsx`). Highest-value
   targets given the run log: the `discounts: ""` vs `[]` removal semantics
   (Ph2 note 1), the deterministic-coupon-id reuse collision path (Ph2 note 2),
   and `upsertSubscription`'s "omit columns when unreadable" branch (Ph6 note 2).

Append a run-log entry for both. Use `/code-review` for part 2 rather than
free-form reading.

---

## Phase 3b — Items L–S: fix what the Phase 3 review turned up

**Model: Opus 5 · effort: high**

Phase 3 was a review phase and fixed only the three defects on
`app/owner/billing/page.tsx`. These are the rest. They land **before** Phase 4 so
the browser pass verifies the corrected behavior rather than screenshotting
states that are about to change.

### L (the big one) — offline discounts become mirror-only

`applyOfflineDiscount` currently rewrites `billing_subscriptions.amount_cents` to
the net figure *and* writes the percent/amount into the mirror. That single
decision causes four separate defects:

- `duration` is silently dropped — "25% off **once**" is permanent, because
  nothing local ever expires it.
- Repeat applies compound off the already-reduced number (10000 → 7500 → 5625),
  reachable through the UI via apply → Remove → apply.
- `remove-discount` can't restore the rate (the original was never recorded), the
  irreversibility the module header documents.
- The next `grant-manual` ("Extend / edit") writes a fresh `amount_cents` and
  silently discards the discount while the mirror still advertises it.

Fix: **stop touching `amount_cents` on the offline path.** `amount_cents` stays
the list rate; the mirror carries the discount; every reader computes the net.
That kills all four at once, needs no migration, and makes the owner page's
recompute correct for offline rows — so Phase 3's `isManual` carve-out on
`effectiveAmountCents` gets reverted (the double-count is now fixed at the source
instead). Consequences to implement alongside:

- `free_months` offline must stop writing `discount_percent_off = 100`. Its
  mechanism is a `current_period_end` extension, not a rate change; writing 100
  would now make the page render "$0" and never stop. Mirror = label +
  `discount_ends_at` only.
- Non-`forever` durations on offline `percent_off`/`amount_off` are **refused**
  with a message pointing at Free months / Grant offline, because nothing local
  can expire them. Don't silently accept a duration that isn't honored.
- `removeDiscountFromSubscription` becomes genuinely reversible for offline
  percent/amount; already-granted free months stay granted (the date is already
  pushed). Update the module header, which currently documents the opposite.

### M — one offline predicate

Route on `billing_method === OFFLINE_BILLING_METHOD`, matching the Phase 2
checkout guard, not on `stripe_subscription_id == null`. Add `billing_method` to
`DiscountableSubscriptionRow` and the admin route's `select`. A Stripe-billed row
with no subscription id then gets an explicit 400 instead of silently taking the
local path and rewriting its rate.

### N — clear the mirror when an offline grant expires

The cron sweep (`app/api/cron/billing/route.ts`) that flips an expired offline
row to `cancelled` should clear the five mirror columns in the same update.
Nothing else can: the Stripe webhook never fires for a tokenless row, and the
admin's Discount button is hidden once a row is cancelled.

### O — a replace path in the admin discount modal

The has-discount branch renders only "Remove discount", so the runbook's DISCOUNT
Check 5 ("apply a second discount over an existing one") isn't reachable from the
UI, while the *other* branch promises replacement. Add an "Apply a different
discount" affordance that reveals the same form over an existing discount, and
move the replace copy where it's true.

### P–S — the small ones

- **P**: add `name` to `couponMatchesSpec`, so a differently-named coupon sitting
  at one of our ids falls through to a Stripe-generated id instead of being
  reused and later relabeling the mirror through the webhook.
- **Q**: page the promotion-code list (`autoPagingToArray`) instead of capping at
  100.
- **R**: delete the dead `active` field from `PatchBody`.
- **S**: inline-validate `free_months` in `handleApplyDiscount` alongside
  percent/amount, so DISCOUNT Ph3's note 2 is actually true.

**Tests:** rework the offline cases in `tests/lib.billingDiscounts.test.ts` (they
currently assert the `amount_cents` rewrite this phase deletes) and add: offline
percent/amount leaves `amount_cents` untouched; offline non-`forever` is refused;
offline `free_months` writes no `discount_percent_off`; remove restores nothing
but clears cleanly; a `billing_method='stripe'` row with a null subscription id
400s. Plus the coupon-name mismatch case.

**Not fixed on purpose:** a `once` Stripe discount still renders as the ongoing
price for one cycle (Stripe populates `Discount.end` only for `repeating`); it
self-corrects when `customer.discount.deleted` clears the mirror and the label
carries the meaning meanwhile.

---

## Phase 4 — Items D+E: browser verification (no Stripe mutations)

**Model: Sonnet 5 · effort: medium**

Everything that can be proven with seeded Supabase rows and a forged
`tp_owner_sess` cookie, without touching Stripe at all. Cheap, and it clears
three separate "not browser-verified" flags.

- **320px screenshots** of `/owner/billing` in all four states: `active`,
  `active + cancelAtPeriodEnd`, `past_due` ("Payment due" must win — GUARD Ph5
  Part B), `cancelled`. Plus with a discount populated (Item C). Real
  screenshots, not JSX reading — that is exactly what GUARD Ph5 could not do.
- **Banner behavior** (GUARD Ph5 Part C): load `/owner/billing?error=...`,
  confirm the param is stripped from the URL on mount and the banner does not
  resurface after a subsequent action.
- **Admin modals**: Discount modal (type → value → duration; confirm
  `durationInMonths` renders only for `repeating`), Custom-rate modal, Promotion
  codes panel — all against seeded rows with Stripe calls stubbed or expected to
  fail. Verifying UI wiring, not Stripe.

Use the `verify` skill's auth-cookie recipe. Seed a hidden venue so nothing leaks
into real venue lists.

---

## Phase 5 — Items J+K: clean and commit

**Model: Sonnet 5 · effort: low**

Do this *before* live verification, so the live phases have a clean baseline to
diff against and a known-good commit to revert to.

1. Delete `.tmp_full_diff.txt`. Decide on `scripts/tmp-billing-verify/` —
   `stripe-test-env.sh` is genuinely useful for Phases 6/7 and should be
   **kept and renamed** to `scripts/stripe-test-env.sh`; `lib.cjs` / `probe.cjs`
   are throwaway.
2. Branch off `main`, then commit in these chunks:
   - `lib/billing.ts` + guard changes to checkout/resume/setup/billing pages +
     their tests → *guard hardening*
   - migration + `lib/billingDiscounts.ts` + admin route discount actions +
     webhook sync + admin UI + owner display + tests → *discounts*
   - `lib/billingCustomPrice.ts` + `set-custom-price` + tests → *custom price*
   - `app/api/admin/billing/promo-codes/` + panel + tests → *promo codes*
   - `docs/billing-*` → *plan docs*
3. Advertising PNGs in the tree are unrelated — leave them out.

---

## Phase 6 — Item F: GUARD live Stripe verification (you run this)

**Model: Opus 5 · effort: medium** — but see the manual runbook below; you asked
to drive this yourself.

## Phase 7 — Items G+H: DISCOUNT live Stripe verification (you run this)

**Model: Opus 5 · effort: medium**

Both phases are already scripted: `bash docs/billing-run-phases-verify.sh` runs
GUARD 8 then DISCOUNT 10 with the safety note prepended and a confirmation
prompt. The manual equivalent is below.

---

# MANUAL RUNBOOK — driving Phases 6 & 7 yourself

## 0. Safety (read twice)

`.env.local`'s `STRIPE_SECRET_KEY` is a **LIVE** key. A dev server started the
normal way will create and mutate **real, billable** subscriptions.

Process env beats `.env.local` in Next.js, so the only safe pattern is to
override the key in the environment of every command you run:

```bash
# Confirm a test key exists (should print sk_test_… or rk_test_…)
grep -m1 '^test_mode_api_key' ~/.config/stripe/config.toml
```

The wrapper `scripts/tmp-billing-verify/stripe-test-env.sh` (renamed to
`scripts/stripe-test-env.sh` in Phase 5) does the extraction and refuses to fall
back to the live key. Use it for **everything**:

```bash
bash scripts/stripe-test-env.sh env | grep STRIPE_SECRET_KEY   # sanity check
bash scripts/stripe-test-env.sh npm run dev                    # the dev server
```

You also need a test-mode `STRIPE_PRICE_ID`. Create a $1/mo recurring USD price
in the **test-mode** Stripe Dashboard and export it alongside:

```bash
export STRIPE_PRICE_ID=price_...   # test mode
bash scripts/stripe-test-env.sh npm run dev
```

**Before you start, verify in the running app's logs or via a scratch script
that Stripe calls are hitting test mode.** If any object id you see lacks a
`_test_`-style test-mode marker in the Dashboard's test view, stop.

**Never** run the webhook forwarder against the live key either:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET for the dev server
```

`stripe listen` uses the CLI's own test-mode session, which is correct here.

## 1. Seed a throwaway venue + owner

Follow `docs/resubscribe-fix-plan.md` Phase 5's recipe verbatim. Summary:

1. Insert a venue with `hidden = true` (so it never appears in any venue list)
   and a name like `zz-billing-verify-<date>`.
2. Insert the matching owner/auth-user rows granting that venue.
3. Forge a signed `tp_owner_sess` cookie with `lib/ownerSession.ts` (do **not**
   try to log in through the real UI — the join flow is not what you are testing).
4. Set that cookie in the browser/Playwright context before navigating; direct
   navigation without it redirects to `/` via `proxy.ts`.

Keep a scratch file listing every id you create (venue, owner, Stripe customer,
subscription, coupon, promo code, price). You will delete all of them at the end.

## 2. GUARD Phase 8 checks (`docs/billing-guard-phase8.md`)

Subscribe the test venue once through `/owner/billing/setup` → Stripe Checkout
(use card `4242 4242 4242 4242`). Confirm the webhook wrote a row with
`status='active'`.

**Check 1 — `past_due` blocks Checkout.**
Force the subscription into `past_due`: attach `pm_card_chargeCustomerFail` as
the customer's default payment method, then advance/pay the next invoice (or use
the test clock). Wait for `customer.subscription.updated` to land and confirm the
mirror reads `past_due`.
- `POST /api/owner/billing/checkout` for that venue → expect **409, code
  `fix_payment`**.
- Then `stripe subscriptions list --customer cus_...` → must still be **exactly 1**.
  That count is the real assertion; the 409 alone doesn't prove nothing was created.

**Check 2 — `past_due` + scheduled cancel resumes.**
Set `cancel_at_period_end: true` on that same `past_due` subscription.
- `/owner/billing` should show **"Payment due"**, not "cancelled" (GUARD Ph5 Part B).
- `POST /api/owner/billing/subscription` (resume) → expect **200**, and
  `stripe subscriptions retrieve` shows `cancel_at_period_end: false`.
- `POST .../checkout` on the same state → **409 `resume_instead`** (ordering:
  `resume_instead` is checked before `past_due`).

**Check 3 — the `paused` case (GUARD Ph3's flagged gap).**
Pause collection on the subscription (`stripe subscriptions update sub_... \
--pause-collection[behavior]=void`). `mapStripeSubscriptionStatus` folds `paused`
into `cancelled`, so the mirror will read `cancelled` while Stripe is still live.
- `POST .../checkout` → expect **409, code `stripe_live`**, and **no DB write**
  (re-read the row: `status` must still be whatever it was, unchanged).
- Subscription count on the customer must stay 1.

**Check 4 — mirror-`cancelled` + Stripe unreachable → `stripe_unreachable`.**
This is the fail-closed path added in the post-Phase-7 code review. Simulate by
pointing `STRIPE_SECRET_KEY` at a syntactically-valid but dead test key, or by
blocking `api.stripe.com` (e.g. an `/etc/hosts` entry) for one request.
- With the mirror at `cancelled` and a `stripe_subscription_id` present:
  `POST .../checkout` → **409 `stripe_unreachable`**, never a Checkout session.
- Undo the hosts entry immediately afterward.

**Check 5 — self-heal in the safe direction.**
Cancel the subscription for real at Stripe (`stripe subscriptions cancel`), but
hand-edit the mirror back to `status='active'` in Supabase to simulate a missed
webhook.
- `POST .../checkout` → **200**, a session is created, and the row was corrected
  to `status='cancelled', cancel_at_period_end=false` with the discount mirror
  cleared.

**Check 6 — `resource_missing` must NOT write back.**
Set `stripe_subscription_id` to a bogus `sub_doesnotexist` on an `active` row.
- `POST .../checkout` → allowed (unblocks the owner), **but re-read the row: it
  must still say `active`.** A write here is a real bug (post-Ph7 review §3) —
  with a live key, a mode mismatch would otherwise nuke a paying customer's row.

## 3. DISCOUNT Phase 10 checks (`docs/billing-discount-phase10.md`)

**Check 1 — 100%-off, 2 months, really invoices $0.**
Admin → Partner Billing → the test venue → **Discount** → free months = 2.
- In test-mode Stripe: the subscription shows a discount; force the next invoice
  (test clock, or `stripe invoices create` + finalize) and confirm **`amount_due`
  is 0**.
- Admin list shows the discount; `/owner/billing` shows the **discounted** price
  (not "$100/mo"), the label, and the end date. Screenshot at 320px.
- `billing_discount_grants` has a row with `granted_by` = your admin username and
  `free_months = 2`, other value columns null.

**Check 2 — percent-off on an *already active* subscription.**
Use a **second** test venue/subscription (existing-subscriber path, not signup).
Apply 25% off, forever.
- Next invoice reflects the reduced amount.
- Mirror columns: `discount_percent_off = 25`, `discount_ends_at` null.
- `/owner/billing` renders "ends …" **not at all** when forever.

**Check 3 — removal and expiry.**
- Remove via the admin modal → mirror columns clear, Stripe shows no discount.
  Confirm the SDK quirk holds in practice: removal must send `discounts: ""`;
  if you see the discount survive, that's Ph2 note 1 regressing.
- Separately, delete the discount directly at Stripe
  (`stripe customers delete_discount` / subscription equivalent) and confirm the
  **webhook** clears the mirror on its own (`customer.discount.deleted` and/or
  `customer.subscription.updated`).

**Check 4 (Item H) — confirm the real payload shape.**
With `stripe listen` running, capture one `customer.subscription.updated` event
carrying a discount and inspect the raw JSON:
- Confirm the coupon lives at **`discount.source.coupon`**, not `discount.coupon`
  (DISCOUNT Ph6 note 1). If Stripe's shape differs from what
  `discountCouponRef`/`resolveDiscountCoupon` expect, the mirror will silently
  stop updating — this check is the only thing that catches it.
- Also confirm the "unreadable → omit columns, don't clear" branch: send an event
  with no `discounts` field and verify the mirror is **preserved**.

**Check 5 — replace, don't stack.**
Apply a second discount over an existing one. Stripe must show exactly one
discount, and the mirror must reflect the new one. The admin modal's messaging
should have warned you.

**Check 6 — custom price swap (DISCOUNT Ph8).**
Create a negotiated recurring **USD, test-mode** price in the Dashboard, paste
its id into the **Custom rate** modal.
- Subscription's item swaps to the new price with **no proration**
  (`CUSTOM_PRICE_PRORATION_BEHAVIOR = "none"`) — verify the next invoice, not the
  current one.
- `amount_cents` in the mirror updates (or self-heals via webhook if the direct
  write warned).
- Negative cases, all expected to be **refused**: an archived price, a one-time
  price, a non-USD price, and an offline-billed row (400, "use Grant offline").

**Check 7 — promo codes end to end (DISCOUNT Ph7).**
- Admin → Promotion codes → create one → confirm it appears in the list, and that
  the created object reads `pc.promotion.coupon` (this SDK's shape).
- Start a **fresh** Checkout for a third test venue, enter the promo code in
  Stripe's hosted UI (`allow_promotion_codes: true` must expose the field),
  complete with `4242…`.
- Confirm the resulting subscription carries the discount **and** that the webhook
  mirrored it — the signup-time discount path is otherwise completely untested.
- Deactivate the code; confirm a new Checkout rejects it.

## 4. Cleanup (do not skip)

Work backwards through your scratch id list:

```bash
bash scripts/stripe-test-env.sh stripe subscriptions cancel sub_...
bash scripts/stripe-test-env.sh stripe customers delete cus_...
bash scripts/stripe-test-env.sh stripe coupons delete hc-...
# promo codes cannot be deleted — deactivate them
```

Then delete the seeded Supabase rows (`billing_discount_grants`,
`billing_subscriptions`, owner/auth rows, the hidden venue), and archive the
test-mode price in the Dashboard.

Finally: `git checkout -- next-env.d.ts` if a dev server churned it, and confirm
`git status` shows no stray files.

## 5. Record results

Append `## GUARD Phase 8 (verification)` and `## DISCOUNT Phase 10 (verification)`
to `docs/billing-run-log.md` with a **per-check pass/fail line** — not "verified
successfully". A failure recorded honestly is the entire point of these two phases.

---

## Model / effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 1 | Apply migration + baseline | Sonnet 5 | low |
| 2 | Server-side offline-row checkout guard | Opus 5 | medium |
| 3 | Review unlogged Ph5 + code-review DISCOUNT diff | Opus 5 | high |
| 3b | Fix Items L–S from the Phase 3 review | Opus 5 | high |
| 4 | Browser verification, no Stripe (320px, modals, banner) | Sonnet 5 | medium |
| 5 | Clean junk + chunked commits on a branch | Sonnet 5 | low |
| 6 | GUARD live Stripe verification | Opus 5 | medium |
| 7 | DISCOUNT live Stripe verification | Opus 5 | medium |

Phases 1→2→3→3b are sequential. Phase 4 needs Phase 1 and should follow 3b, so
it screenshots the corrected offline-discount behavior. Phase 5 should land
before 6/7. Phases 6 and 7 are yours to run manually per the runbook above.

Phase 3b changes what Phases 6/7 should check: the runbook's DISCOUNT Check 2
(percent-off mirror columns) and Check 5 (replace, don't stack) now have UI paths
that didn't exist, and any offline-partner discount should be verified to leave
`amount_cents` alone.
