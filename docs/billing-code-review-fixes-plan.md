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
5. **(2026-08-02, after Phase 6) An unfinished signup must leave NO trace.** Phase
   6 found that Phase 5's server-side fix is unreachable from the owner UI, and
   that the UI cannot be fixed because our mirror cannot tell "first payment never
   finished" apart from "existing subscriber's card declined" — both are stored as
   `past_due`. Rather than teach the system to tell them apart, **stop creating the
   ambiguous row at all.** A partner who starts Checkout and doesn't finish is
   simply not a subscriber; the next visit shows the normal "No subscription yet"
   screen and they start over. See **Phase 8**, which supersedes the UI half of
   Phase 5.

## Phase table

| # | Phase | Model | Effort | Depends on | Status |
|---|-------|-------|--------|-----------|--------|
| 0 | Baseline + branch hygiene | Haiku 4.5 | Low | — | ✅ done — baseline (`f3490ac`) + per-phase commits (`9293db3`, `0f0b1d2`, `e8a081f`, `f8f1a07`, `9fd2535`) |
| 1 | Offline discount double-count (list-rate semantics) | Opus 5 | **High** | 0 | ✅ done (`2080cca`) — run-log section written, data audit run 2026-08-02: **0 affected rows** |
| 2 | `grant-manual` must clear the discount mirror | Sonnet 5 | Medium | 1 | ✅ done (`9293db3`) |
| 3 | Fractional percent-off: migration + validation + writes | Sonnet 5 | Medium | 0 | ✅ done (`0f0b1d2`), migration applied |
| 4 | SlimCD teardown | Opus 5 | Medium-High | 0 | ⚠️ **code done** (`e8a081f`) — Vercel `SLIMCD_*` env vars still owed |
| 5 | `incomplete` subscriptions must not lock out Checkout | Opus 5 | Medium | 0 | ✅ server side done + verified (`f8f1a07`); UI half → Phase 8 |
| 6 | Stripe test-mode + browser verification | Opus 5 | **High** | 1–5 | ✅ done 2026-08-01, 68/68 assertions (`9fd2535`) |
| 8 | **Unfinished signups leave no trace** (supersedes Phase 5's UI half) | Opus 5 | Medium-High | 6 | ⚠️ **code done** (8.1–8.3, 8.5) — 8.4 audit + 8.6 Stripe verification blocked, see below |
| 7 | Run-log + doc close-out | Haiku 4.5 | Low | 6, 8 | ⬜ **not started** (must be last) |

Phases 1→2 are ordered (2 depends on 1's semantics). Phases 3, 4, 5 are
independent of each other and of 1/2 — they can run in any order or in
parallel worktrees.

---

## ▶ START HERE — remaining roadmap (as of 2026-08-02)

Everything below is what's left. Execute in this order.

### 1. ~~Phase 0 revisit — chunk the branch into commits~~ DONE

Split into five revertible commits: `9293db3` (Phase 2), `0f0b1d2` (Phase 3),
`e8a081f` (Phase 4), `f8f1a07` (Phase 5), `9fd2535` (Phase 6 run log + this
doc's tracking). Two files (`app/api/admin/billing/route.ts`,
`app/api/owner/billing/route.ts`) had hunks from multiple phases interleaved
in the same lines; each was reconstructed phase-by-phase from HEAD rather than
patch-split. Typecheck + full test suite (1202 tests) verified green after
recommitting, and the resulting working tree diffed byte-identical to the
pre-split state. The two advertising PNGs and no other unrelated files were
swept in.

### 2. ~~Phase 1 revisit — two loose ends~~ DONE

- **Run-log section written** (2026-08-02) from `2080cca`, filed as
  "REVIEWFIX Phase 1" ahead of Phase 2 in `docs/billing-run-log.md`.
- **Step 3's data audit ran read-only on 2026-08-02: 0 affected rows.**
  Production `billing_subscriptions` is 2 rows; the single offline row
  (`venue-garden-state-bar`, $100.00) carries **no** discount mirror, and
  `billing_discount_grants` has no row for any offline venue. Nothing needs
  `amount_cents` re-entered by hand, so **Phase 1's stated risk is closed**, not
  merely unquantified. Nothing was auto-migrated.

### 3. ~~Phase 8 — the main remaining build~~ CODE DONE, two steps outstanding

Unfinished signups leave no trace. **8.1 (creation gate), 8.2 (pre-checkout
sweep), 8.3 (accept the empty Stripe customers) and 8.5 (tests) shipped
2026-08-02** — full write-up in `docs/billing-run-log.md`, "REVIEWFIX Phase 8".
Typecheck clean, `npm run test` 1218 passed / 13 skipped (145 files). Still owed:

- **8.4 — the read-only `past_due` + `stripe` audit.** Both ways of reading
  production were refused by the permission classifier this session
  (`node --env-file=.env.local <script>` and `supabase db dump --linked
  --data-only --table billing_subscriptions`), so it needs the user to allow one
  of them. Expected to be **empty**: the Phase 1 audit on the same day showed
  production `billing_subscriptions` is 2 rows, both `active`
  (`venue-garden-state-bar` offline, `venue-pacific-street` stripe). Confirm
  before concluding; report the list to the user before deleting anything.
- **8.6 — verification against real Stripe test mode.** Needs the :3000 dev
  server stopped (Next 16's exclusive `.next/dev` lock) — ask first.

### 4. Phase 4 revisit — `SLIMCD_*` env vars (needs the user)

Logged as "still owed by the operator." They exist in Vercel and `.env.local`,
nothing reads them, so they are inert — but these are live-environment changes.
**Ask before touching env**, use scoped `vercel env rm`, never `vercel env pull`
(it silently clobbers the local file).

### 5. Phase 7 — close-out, last

---

### Context a fresh session needs

- **`.env.local`'s `STRIPE_SECRET_KEY` is LIVE.** Never read or modify that file.
  All Stripe work goes through `scripts/stripe-test-env.sh`, which pulls the
  test-mode key from the Stripe CLI config and refuses to run without it.
- **`.env.local`'s `STRIPE_PRICE_ID` is also LIVE** — it does not resolve with a
  test key, so Checkout in test mode needs a throwaway test price exported as
  `STRIPE_PRICE_ID` at dev-server startup.
- **Next 16 holds an exclusive `.next/dev` lock** — a second `next dev` cannot
  start, so verification means stopping the :3000 server (ask first) and
  restarting it afterward. Revert `next-env.d.ts` after; the dev server rewrites it.
- **The Phase 6 run-log section** (`docs/billing-run-log.md`) documents the whole
  verification harness, including the Stripe Checkout gotchas (payment-method
  accordion needs `check({force:true})`; Link's pre-checked "save my information"
  makes Phone required and silently blocks Subscribe) and the corrected premise
  that voiding an `incomplete` subscription yields `incomplete_expired`, not
  `canceled`. Read it before rebuilding any harness.
- Phase 6's throwaway scripts lived in that session's scratchpad
  (`…/348e693e-…/scratchpad/hv/`) and may have been cleaned up; the run log has
  enough to rebuild them.

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

> **⚠️ OUTSTANDING (2026-08-02).** The baseline and the webhook commit happened
> (`f3490ac`), but the "separate, revertible commit per phase" requirement did
> not: Phases 2–5 and the Phase 6 run log are still one uncommitted blob. That is
> item 1 of the roadmap above.

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

> **✅ DONE (2026-08-02).** The code shipped as `2080cca` and Phase 6 verified
> the new semantics end to end (7/7). The two skipped items are now closed:
> **(a)** a run-log section exists (`docs/billing-run-log.md`, "REVIEWFIX
> Phase 1"); **(b)** step 3's audit ran read-only and found **0 affected rows** —
> the one live offline row (`venue-garden-state-bar`, $100.00) carries no
> discount mirror, and no discount was ever granted to an offline venue. The
> risk above is closed; no `amount_cents` needed re-entry and nothing was
> auto-migrated.

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

> **⚠️ OUTSTANDING (2026-08-02).** Steps 1–5 and 7 are done (see the run log):
> code deleted, columns kept and commented as dead, tests replaced with a static
> tripwire. **Step 6 is still owed** — the `SLIMCD_*` env vars remain in Vercel
> and `.env.local`. Nothing reads them, so they are inert; removing them is a
> live-environment change that needs the user's go-ahead and scoped
> `vercel env rm`.

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

> **Status after Phase 6 (2026-08-02): shipped and verified, but half-reachable.**
> Everything above works and is proven against real Stripe. What Phase 6 found is
> that the owner UI never offers the partner a way to *reach* it (see the Phase 6
> run-log section). **Phase 8 supersedes the UI half of this problem** by removing
> the state entirely. Keep every line of Phase 5's server-side work: it stays the
> correct handling for a row that already exists — legacy rows, and a resubscribe
> attempt on top of a previously-cancelled subscription.

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

> **✅ DONE 2026-08-01** — all six scenarios run against real Stripe test mode,
> **68/68 assertions passed**, full write-up in the Phase 6 section of
> `docs/billing-run-log.md`. All throwaway Stripe + Supabase data cleaned up and
> verified. It also turned up the defect that Phase 8 now exists to fix, and
> confirmed the `billing_invoices` never-written defect is resolved by `f3490ac`.

---

## Phase 8 — An unfinished signup leaves no trace

**Model: Opus 5 · Effort: Medium-High** — small diff, but it changes when the
billing mirror comes into existence, which is the record everything else reads.

**The principle.** `billing_subscriptions` is a record of a partner who **pays
us**. It should not be created by someone merely *attempting* to pay. If a signup
is interrupted — card declined at the last step, tab closed, 3-D Secure
abandoned, phone died — the system acts as if it never happened. The partner
returns to `/owner/billing`, sees the normal "No subscription yet" screen, and
starts over from the beginning.

**Why this replaces the UI work Phase 5 implied.** The unreachable-fix problem
exists only because an unfinished signup and a real dunning failure are both
stored as `past_due`, so no screen can tell the partner which one they are. Delete
the first case and the ambiguity is gone: **`past_due` comes to mean exactly one
thing — an established subscriber whose card failed** — and every existing screen
that assumes that becomes correct, including `/owner/billing/setup`'s redirect,
which is right under this design and should be left alone.

**No new UI is needed.** `/owner/billing` already renders the "No subscription
yet" + "Set up subscription" empty state (`app/owner/billing/page.tsx`), and
`/owner/billing/setup` already falls back to `venueIds[0]` when there is no row.
Both were verified working in Phase 6. Confirm, don't rebuild.

---

### 8.1 — Gate row CREATION on payment having actually succeeded

**The one rule:** a `billing_subscriptions` row may be **created** only for a
subscription Stripe reports as paid-for (`active` or `trialing`). Rows that
already exist keep updating exactly as they do today — a renewal that goes
`past_due` must still be mirrored, so **only creation is gated, never updates.**

Both writers in `app/api/webhooks/stripe/route.ts` need it, because a row can
appear from either:

1. **`checkout.session.completed`** (line ~51) upserts unconditionally today. A
   session can complete with `payment_status: 'unpaid'` and an `incomplete`
   subscription behind it. Ignore the event unless the payment really succeeded.
2. **`customer.subscription.updated` / `.deleted`** (line ~64) currently creates a
   row when none exists — a deliberate choice documented at lines ~143–156, to
   survive a missed or out-of-order `checkout.session.completed`. **That intent
   must be preserved, not reverted:** gating on "is the subscription paid-for"
   rather than "did checkout.session.completed arrive" keeps the legitimate first
   sync working while refusing to invent a row for an unpaid attempt.

Implement as one predicate in `upsertSubscription` (an `allowCreate`/
`isEstablished` check consulted only when no row exists), so the rule lives in a
single place instead of being duplicated per event type. Rewrite the comment
block at lines ~143–156 to state the new rule and why it does not reintroduce
the missed-webhook bug it was originally guarding.

**Also verify:** the welcome email (`maybeSendWelcomeEmail`) now cannot fire for
an unpaid attempt. That is a strict improvement — note it, no change needed.

### 8.2 — Don't leave a chargeable orphan at Stripe

Once we stop tracking the abandoned subscription, we can no longer void it the
way Phase 5 does. Stripe expires an `incomplete` subscription on its own in ~23h,
but inside that window a partner could complete the stale Checkout tab *after*
starting a fresh signup and end up billed twice.

Close it at the moment a new Checkout begins: in
`app/api/owner/billing/checkout/route.ts`, before creating the session, cancel
any `incomplete` subscription already carrying this `venueId` in its metadata.
Every subscription this app creates sets `subscription_data.metadata.venueId`, so
this needs no stored state — confirm whether `stripe.subscriptions.search`
supports the metadata query on the pinned API version; if not, fall back to
listing recent `incomplete` subscriptions and filtering by metadata.

**Failure policy:** if the sweep call itself fails, log and proceed. Unlike Phase
5's void — where the abandoned object was the *same* subscription we were about
to replace — this is belt-and-braces on top of Stripe's own 23h expiry, and
blocking a paying partner's signup over it would trade a certain harm for an
unlikely one. State this explicitly in the code comment so it doesn't read as an
oversight.

### 8.3 — Decide the Stripe customer question

With nothing stored, `checkout.sessions.create` has no `stripe_customer_id` to
reuse, so each abandoned attempt leaves an empty Stripe customer behind.

**Recommendation: accept it.** Empty customers cost nothing, carry no billing
state, and reusing one would mean storing exactly the trace this phase exists to
eliminate. Note it in the run log so the sprawl isn't mistaken later for a bug.
If it ever becomes untidy, the fix is a lookup by email at Checkout time, not a
stored id — but don't build that now.

### 8.4 — Clean up rows already in the ambiguous state

Read-only audit first (scratchpad, not committed): every row with
`status = 'past_due'` and `billing_method = 'stripe'`, cross-checked against
Stripe for `incomplete` / `incomplete_expired`. Any hit is an unfinished signup
recorded under the old behavior.

**Report the list to the user before touching anything.** The correct repair is
to delete the row (the partner is not a subscriber and should get the clean
signup screen), but deleting billing rows is not something to do unattended —
and a genuine dunning `past_due` must never be caught by it.

### 8.5 — Tests

- `checkout.session.completed` with `payment_status: 'unpaid'` → **no row
  written**, no welcome email.
- `customer.subscription.updated` for an `incomplete` subscription with **no
  existing row** → no row written.
- `customer.subscription.updated` for an `active` subscription with no existing
  row → row **is** created (the missed-`checkout.session.completed` case that
  lines ~143–156 protect — this must not regress).
- `customer.subscription.updated` to `past_due` for an **existing** row → still
  mirrored (renewal dunning is untouched).
- Checkout start cancels a pre-existing `incomplete` subscription for the venue;
  and still proceeds when that cancel fails.
- Keep every existing Phase 5 test green — that logic is retained.

### 8.6 — Verify against real Stripe

Reuse the Phase 6 harness (`scripts/stripe-test-env.sh` + the scratchpad scripts;
the setup notes in the Phase 6 run-log section — LIVE `STRIPE_PRICE_ID`, the
`.next/dev` lock, the Checkout accordion and Link-phone gotchas — will save an
hour).

1. Real Checkout, abandon at the payment step → **zero** `billing_subscriptions`
   rows for the venue, and `/owner/billing` shows "No subscription yet" at 320px.
2. Same partner returns and pays → exactly one row, `active`, one subscription at
   Stripe, welcome email path fires once.
3. Established subscriber's renewal fails (test clock, as in Phase 6) → row still
   goes `past_due` and the page still says "Payment due" with "Update".
4. Abandoned attempt, then a fresh signup → the abandoned subscription is
   terminal at Stripe and the partner is billed once.
5. Re-run the Phase 6 guard sweep unchanged — all 23 assertions must still pass.

**Done when:** every scenario is logged with observed Stripe state in
`docs/billing-run-log.md`, and the Phase 6 "Defect found" section is updated to
record that the defect was resolved by removing the state rather than by adding
a button.

---

## Phase 7 — Close-out

**Model: Haiku 4.5 · Effort: Low**

- Append a run-log section covering all phases with the review findings marked
  resolved.
- Update `docs/billing-open-issues-plan.md`: close items B, D, F, G, L, M, N;
  restate anything still open. Also add and close the `billing_invoices`
  never-written defect (found in DISCOUNT Phase 10, fixed by `f3490ac`, confirmed
  against live webhooks in Phase 6) — it was never in that doc's inventory table.
- Record in `SYSTEM_CONTEXT.md` the one-line rule Phase 8 establishes: **a
  `billing_subscriptions` row means a partner who paid; an unfinished signup
  leaves nothing behind.** It is the kind of invariant that gets re-broken by
  someone "helpfully" persisting an in-progress checkout.
- Re-run `/code-review` on the branch and confirm the five findings are gone.

---

## Model/effort summary

Use **Opus 5** for Phases 1, 4, 5, 6, 8 — each involves either money semantics on
existing rows, a multi-file teardown, the fail-closed guard logic where a wrong
call means double-billing a real partner, or (Phase 8) changing when the billing
record comes into existence at all. **Sonnet 5** is sufficient for Phases 2 and
3: both are well-specified, single-surface changes with an obvious correct shape.
**Haiku 4.5** handles Phases 0 and 7 (mechanical bookkeeping).
