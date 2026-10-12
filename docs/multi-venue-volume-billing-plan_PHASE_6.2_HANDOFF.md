# Multi-Venue Volume Billing — Phase 6.2 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phase 6.2"). This note closes **Phase 6.2** (review findings
#3, #9, #10) and opens **Phase 6.3**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.1_HANDOFF.md`) still hold for what
they describe.

---

## For Andrew (plain English)

**What was wrong.** When a partner adds a venue, the app checks how their bill is priced. It treated *any* flat
monthly price as a negotiated per-venue rate. That included the old $100 list price and any price pasted by hand.
So a partner on one of those prices could have been charged $100 for their second venue instead of $75.

**What changed.**
- Only the custom rates the admin screen creates (Stripe "lookup key" starting `custom_monthly_`) count as a
  per-venue rate. Any other flat price is refused, and the partner is told to email us. A hand-pasted rate now gives
  the true reason ("Your account has a custom rate. Email …").
- If an admin pastes a Stripe price id that isn't one of ours, Set rate still works. A pop-up then says
  "Partner self-serve add/remove is off for this bill (not a standard custom rate)."
- One unused piece of code was deleted. The nightly drift check now runs its three reads at once, which is faster and
  costs the same.

**Is anyone affected today?** No. I checked Stripe (read-only): both active subscriptions are on the standard
graduated price.

**Is it live?** No. Phase 6.2 is **not committed**, and it needs no database change. Earlier today: the Phase 6.1
database change was **applied to production** and verified, and Phase 6.1 was **committed** (`a83da94`). Phase 6
(`6c5a178`) and Phase 6.1 are committed but **not pushed**. The feature flag is still off.

**What needs you:**
1. Commit 6.2 now, or let it ride until 6.5 (the plan's default). Pushing is your call too.
2. Before Phase 6.3 ships, its agent will list the partners with more than one venue for you. That's so the new
   Checkout refusal can't lock out a real partner.

---

## For the next agent (Phase 6.3)

### 1. Goal and scope

**Phase 6.3** (plan §5, **Opus 5.5, high**): review findings #2 and #4. Removed and comped venues are not "no bill".
- A shared classifier, `unbilledVenueStates(venueIds, ownerIdByVenue)`, in `lib/venueBilling.ts`, returning
  `removed | comped | unbilled`.
- The admin list (`app/api/admin/billing/route.ts`) uses it. A removed venue is never "Comped". Delete the inline
  `ownersWithLiveBill` derivation.
- Checkout (`app/api/owner/billing/checkout/route.ts`) refuses `409 { code: "on_partner_bill" }` for comped, removed,
  or a second venue of an owner with a live bill. It is **not flag-gated**, and it runs before
  `sweepAbandonedIncompleteSubscriptions` and before any Stripe call.
- The owner Billing page shows "Included on your account at no charge" for a comped venue.
- **Read-only production query before shipping:** owners with more than one linked venue where one is billed and one
  isn't, or with more than one separate bill. Report them to Andrew (`venue-hightop-test` is an expected case).
- Tests, plus a contract pin for the Checkout refusal. The plan §5 "Phase 6.3" has the full list.

**Out of scope for 6.3:** 6.4 (admin Link tool UI: #5–#8), the quote-vs-Confirm rate gap (6.5, or Andrew waives it;
`…_PHASE_6.1_HANDOFF.md` §7.3), any commit or push unless Andrew asks, and `supabase db push`. 6.3 needs no
migration.

### 2. Starting state

- Branch `main`. Commits on top of `origin/main`, **not pushed**: `6c5a178` (Phase 6) and `a83da94` (Phase 6.1).
  Check with `git log origin/main..main`.
- **Phase 6.2 is uncommitted** in the working tree. Paths for its commit (**explicit list, never `git add -A`**):
  `lib/venuePricing.ts`, `lib/billingCustomPrice.ts`, `lib/venueAddition.ts`, `lib/venueRemoval.ts`,
  `lib/billingQuantityDrift.ts`, `components/admin/sections/BillingSection.tsx`, `tests/lib.bill-rate.test.ts`,
  `tests/lib.billingCustomPrice.test.ts`, `tests/api.owner.venues-add.test.ts`, `tests/api.owner.venues-remove.test.ts`,
  `tests/multi-venue-billing-contract.test.ts`, `docs/multi-venue-volume-billing-plan.md`,
  `docs/multi-venue-volume-billing-plan_PHASE_6.2_HANDOFF.md`, `CLAUDE.md`.
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Database:** migration `20261011224839_bill_price_change_lock.sql` was **applied to production 2026-10-11**
  (`supabase db push`, Andrew's go-ahead). It was verified through PostgREST: `billing_venue_changes.price_id`
  exists, and the three RPCs answer `invalid` to empty arguments with the service role. The anon key gets
  `42501 permission denied`. `supabase migration list` now shows every local migration as remote. No data was
  written, and 6.2 changed no data. Nothing to undo.
- **Stripe:** read-only listing only (§6). No writes.
- Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is still off.

### 3. Decisions already made

- Andrew's answers are in plan §2. Don't re-ask them. A custom rate is **per venue**.
- **Refusal split (6.2):** `unratedPriceRefusal(price, { listPriceId })` in `lib/venuePricing.ts` returns
  `custom_rate` for a flat monthly USD Price that isn't the configured list Price. It returns `billing_state` for the
  list Price, tiered, yearly, non-USD, or no Price. The list Price stays `billing_state` because it isn't a negotiated
  rate (it needs moving to the graduated Price). With `STRIPE_PRICE_ID` unset, the list Price can't be told apart, so
  it reads as `custom_rate`. That's still a refusal, and it's never charged $100 (tested).
- The post-claim refusal in `startVenueAddition` / `startVenueChange` still records `refused:billing_state`, whatever
  the pre-check code was. That's unchanged on purpose: after a claim, a Price change is caught as `price-changed`
  first anyway.
- The admin notice is returned as `notice` on `SetCustomPriceResult` (`NON_STANDARD_RATE_NOTICE`). The admin UI
  shows `notice` and `warning` in a `window.alert` after a successful Set rate, because the rate dialog closes on
  success and the page has no success banner. (The same file already uses `window.confirm` for "Back to standard
  pricing".)

### 4. Files changed and how they fit

- **`lib/venuePricing.ts`**: new private `isFlatMonthlyUsdPrice`. `billRateFromPrice` gives `per_venue` only when
  `lookup_key` starts with `CUSTOM_PER_VENUE_LOOKUP_PREFIX` **and** the Price is flat/monthly/USD. The list-id guard
  was dropped as redundant: the prefix rule covers it. New `unratedPriceRefusal`.
- **`lib/billingCustomPrice.ts`**: `customPriceLookupKey` builds from `CUSTOM_PER_VENUE_LOOKUP_PREFIX`. New export
  `NON_STANDARD_RATE_NOTICE`. `setCustomPrice` adds `notice` on success when `billRateFromPrice(price, ids)` is null.
- **`lib/venueAddition.ts`**: `isGraduatedPrice` deleted (it had no callers), along with the now-unused
  `GRADUATED_PRICE_LOOKUP_KEY` import. New export `unratedItemRefusal(item)`, which wraps `unratedPriceRefusal` with
  `getStripePriceId()`. `checkAddableSubscription` returns `unratedItemRefusal(item)` when there is no rate.
- **`lib/venueRemoval.ts`**: `checkChangeableSubscription` does the same, importing `unratedItemRefusal`.
- **`lib/billingQuantityDrift.ts`**: memberships, `inFlightBillIds()` and `listStripeSubscriptions()` run in one
  `Promise.all`. The memberships `ok` check comes after it. Reads and count are unchanged, and any rejection still
  throws.
- **`components/admin/sections/BillingSection.tsx`**: `submitCustomPrice` alerts `notice` / `warning` after success.
- **`CLAUDE.md`**: the Multi-Venue `BillRate` bullet now states the prefix rule.
- `ADD_VENUE_MESSAGES.custom_rate` / `VENUE_CHANGE_MESSAGES.custom_rate` in `lib/multiVenueBilling.ts` are **live
  again**. They were not changed.

### 5. Facts and traps

- `.env.local` has **no `STRIPE_GRADUATED_PRICE_ID`**. Locally, the graduated Price is recognised by its lookup key
  `hightop_venue_graduated_monthly_v1`. `STRIPE_PRICE_ID` (the list Price) is set. Don't assume the graduated id env
  exists in a script.
- `scripts/migrate-subscriptions-to-graduated.cjs` keeps its own CJS copy of the `custom_monthly_` literal (a script
  can't import the TS module). The contract test scans only `app/`, `lib/` and `components/`.
- `npm run build` flips `next-env.d.ts` to `./.next/types/routes.d.ts`. It was put back to `./.next/dev/types/…` with
  `sed`, and the file is clean. Never use `git checkout --` on it.
- The traps from 6.1 still hold: use `npm run test:multi-venue-billing-sql`, not `node scripts/…`. Use
  `NODE_PATH="$PWD/node_modules"` for scratch scripts run with `node --env-file=.env.local`. Never run typecheck and
  build at the same time.
- In `tests/lib.billingCustomPrice.test.ts`, the `okPrice()` fixture has no `lookup_key`. Every pasted-id test
  therefore now returns `notice`, which `toMatchObject` ignores. Give a test a `custom_monthly_` key when it must not
  carry the notice.

### 6. Build, run, test: what was verified (2026-10-11)

- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note for `lib/sportsBingo.ts`).
- `npm run test`: **340 files passed, 1 skipped; 3,979 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded (run after the typecheck, not alongside it). `next-env.d.ts` restored afterwards.
- New and changed tests:
  - `tests/lib.bill-rate.test.ts`: the prefix rule; the list Price with and without `listPriceId`; a hand-made flat
    Price with no key, an unrelated key, and `xcustom_monthly_…`; `unratedPriceRefusal` for both outcomes.
  - `tests/api.owner.venues-add.test.ts`: a hand-pasted $80 Price gives `custom_rate`; the list Price with
    `STRIPE_PRICE_ID` unset is refused (`custom_rate`); nothing charged in either case.
  - `tests/api.owner.venues-remove.test.ts`: a hand-pasted flat Price gives `custom_rate`.
  - `tests/lib.billingCustomPrice.test.ts`: a pasted non-prefixed Price swaps and carries `notice`; a
    `custom_monthly_` Price (pasted or minted) has none; a refused swap has none.
  - `tests/multi-venue-billing-contract.test.ts`: the prefix literal exists only in `lib/venuePricing.ts`;
    `customPriceLookupKey` uses the constant; `billRateFromPrice` checks `startsWith`; `isGraduatedPrice` is gone;
    both flows use `unratedItemRefusal`.
- **Live Stripe check (read-only, 2026-10-11)**, every non-cancelled subscription:
  `sub_1U1So41djkdMC76XePDK9srm` and `sub_1TvKnu1djkdMC76X5IZZhXR6`. Both are `active`, quantity 1, on
  `price_1UPOUD1djkdMC76XYeVsQXKl` (lookup key `hightop_venue_graduated_monthly_v1`, tiered), so graduated. **No live
  bill is on a flat non-prefixed Price.** The script (scratchpad, not in the repo) used `stripe.subscriptions.list`
  with `status: "all"` and skipped canceled/incomplete_expired.
- **Unverified:** the `window.alert` path in a real browser (it is a one-line UI branch, and admin-only).

### 7. Open questions and waiting on Andrew

1. Commit 6.2 now, or at 6.5 (plan default: 6.5, explicit path list). Pushing `6c5a178` and `a83da94` is his call.
2. Still open from 6.1: the quote-vs-Confirm rate gap (`…_PHASE_6.1_HANDOFF.md` §7.3), for 6.5 to fix or Andrew to
   waive.

### 8. Recommended first steps for Phase 6.3 (Opus 5.5, high)

1. Read plan §5 "Phase 6.3" and this note. Check that `git status` matches §2.
2. Read `lib/venueBilling.ts` (`loadBillingForVenues`, `billMemberships`, `isBilledMembership`, `hasLeftBill`) and
   the admin list's `comped` / `venueState` derivation in `app/api/admin/billing/route.ts`.
3. Run the read-only production query first (one-off script, `node --env-file=.env.local`): owners with more than one
   linked venue, billed vs unbilled, and owners with more than one bill. Report the list in the handoff.
4. Build `unbilledVenueStates`, wire it into the admin list, Checkout and the owner Billing GET/page, then add the
   tests and the contract pin.
5. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (in sequence), then restore
   `next-env.d.ts`. Write `docs/multi-venue-volume-billing-plan_PHASE_6.3_HANDOFF.md` and update the plan's status
   line.
