# Multi-Venue Volume Billing — Phase 6.5 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phase 6.5"). This note closes **Phase 6.5** (re-review and close-out
of Phases 6 → 6.4) and opens **Phase 7 (release)**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.4_HANDOFF.md`) still hold
for what they describe.

---

## For Andrew (plain English)

**What changed in 6.5.**

1. **The price a partner sees is the price they pay — guaranteed.** Before, if an admin changed a partner's rate while the
   partner had the "Review & pay" screen open, pressing Confirm charged the *new* rate. Now Confirm sends the price the
   partner was shown, and if it no longer matches, nothing is charged: the screen fetches the new price and asks them to
   confirm again. This covers the partner's "Add a venue", their "Add back", and your admin "Add to their bill".
2. **"Grant offline" can no longer give a partner a second bill.** On a venue that is comped, was removed from a bill, or
   whose partner already pays on another venue's bill, the button is now greyed out (with a note saying what to use
   instead), and the server refuses it too. Renewing ("Extend / edit") a venue's own check-paid bill works exactly as before.
3. **Fixes from the final code review** (it found 10 things; I fixed 5, listed 5 below for you):
   - While a card charge for an admin "Add to their bill" waits on the partner's bank check, nobody can comp that venue
     or give it to a different partner underneath it (that could have charged one partner for a venue another owns).
   - The admin "Add to their bill" now clears out stuck half-finished changes first, like the partner's own screen does
     (otherwise "Check again" could spin until the next day's cleanup).
   - If the server answers "something went wrong" (a 5xx) to an add, every screen now keeps its safety key and offers
     "Check again" instead of starting a fresh attempt. It can't double-charge either way, but this is the safe habit.
   - Two small tidy-ups (one shared rule instead of two copies; two cleanup lookups now run side by side).

**Is it live?** No. Nothing is committed or pushed yet, there's no database change in 6.5, and the multi-venue flag is
still off. The only parts that are visible with the flag off: the greyed-out "Grant offline" in admin, and the Checkout
refusal from 6.3.

**What needs you:**
- **Say whether to commit** Phases 6.3 + 6.4 + 6.5 (they share files, so one commit is the honest option — see §2).
- **Five review findings I did not fix**, because each needs your decision or a database change (§7). None blocks Phase 7
  for today's partners: production has no partner in any of those situations (checked in 6.3).

---

## For the next agent (Phase 7 — Release)

### 1. Goal and scope

**Phase 7** (plan §5, **Sonnet 5.5, medium, + Andrew**): the Partner Manual and any price copy;
`docs/multi-venue-billing-device-checklist.md`; set `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` in Vercel and **redeploy**
(it is a `NEXT_PUBLIC_*` var, inlined at build time); Andrew adds a real second venue to his own account and removes it,
watching the Stripe invoice and the Billing page.

**Before Phase 7 starts:** Phases 6.3–6.5 must be committed (Andrew's call) and the whole stack pushed (Andrew wants one
push at the end of the plan). Andrew should also decide on §7 items 1–2, or explicitly defer them.

**Out of scope:** `supabase db push` (no migration is pending), anything in §7 unless Andrew says.

### 2. Starting state

- Branch `main`. Commits ahead of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2).
- **Phases 6.3, 6.4 and 6.5 are uncommitted.** No migration in any of them. One commit is recommended
  ("Multi-venue billing Phases 6.3–6.5: …"), because 6.4 and 6.5 re-touched most 6.3 files. **Explicit path list, never
  `git add -A`:**
  ```
  CLAUDE.md
  app/api/admin/billing/route.ts
  app/api/owner/billing/checkout/route.ts
  app/api/owner/billing/route.ts
  app/api/owner/venues/add/route.ts
  app/owner/billing/page.tsx
  components/admin/billing/LinkVenueToPartner.tsx
  components/admin/sections/BillingSection.tsx
  components/owner/add-venue/AddVenueSheet.tsx
  components/owner/billing/BillVenuesPanel.tsx
  docs/multi-venue-volume-billing-plan.md
  docs/multi-venue-volume-billing-plan_PHASE_6.3_HANDOFF.md
  docs/multi-venue-volume-billing-plan_PHASE_6.4_HANDOFF.md
  docs/multi-venue-volume-billing-plan_PHASE_6.5_HANDOFF.md
  lib/addVenueFlow.ts
  lib/adminAttachFlow.ts
  lib/adminBillView.ts
  lib/adminVenueAttach.ts
  lib/billingCustomPrice.ts
  lib/multiVenueBilling.ts
  lib/venueAddition.ts
  lib/venueBilling.ts
  lib/venuePricing.ts
  lib/venueRemoval.ts
  tests/api.admin.billing-grant-manual-churned-card.test.ts
  tests/api.admin.billing-grant-manual-clears-discount.test.ts
  tests/api.admin.billing-grant-manual-guard.test.ts
  tests/api.admin.billing-grant-manual-list-rate.test.ts
  tests/api.admin.billing-grant-manual-validates-first.test.ts
  tests/api.billing-unbilled-venue-states.test.ts
  tests/api.owner.billing-resume-vs-checkout-matrix.test.ts
  tests/api.owner.venues-add.test.ts
  tests/api.owner.venues-remove.test.ts
  tests/lib.add-venue-flow.test.ts
  tests/lib.admin-attach-flow.test.ts
  tests/lib.admin-bill-view.test.ts
  tests/multi-venue-billing-contract.test.ts
  ```
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Database / Stripe:** no migration, no writes, no Stripe calls, no production queries in 6.5. Migration
  `20261011224839` (6.1) is applied, as recorded before. Flag still off.

### 3. Decisions already made

- Andrew's answers: plan §2. Rate gap: fixed (not waived). Grant-offline guard: built as the 6.4 handoff's default (Andrew
  was told; no answer needed). Push once at the end of the plan.
- **Quote check rule:** `quotedVenueCents` must be a whole number equal to `rateVenuePriceCents(liveRate, row.quantity_after)`
  — checked **after** the claim and `postClaimCheck` (so on the subscription as it is under the lock) and **before** the
  address scan, venue insert and Stripe update. Missing / wrong type / different value → `quote_changed` 409, ledger row
  `failed` (`refused:quote_changed`), nothing charged or created. A re-ask of a key that already has a row is answered from
  that row (step 1) and never re-checked. Only the per-venue price is compared — not the discount or `dueTodayCents`
  (proration is Stripe's own preview at `prorationDate`; a discount change mid-review is out of scope).
- **Any 5xx reply to an add is "unconfirmed"** (`interpretAddVenueReply`): keep the key, show Check again. Pre-claim 5xx
  (e.g. `stripe_unavailable` from the context read) also lands here; that is harmless because a re-ask of a key with no row
  is simply a fresh attempt (and all three clients re-send the original quote with it).
- **Grant-offline guard rule = Checkout's rule**: `refusesOwnBill(unbilledVenueStates(...))`, moved to `lib/venueBilling.ts`.
  `removed` is always refused (its membership row's `venue_id` is UNIQUE, so a new bill anchored there would get no anchor
  row from the trigger and count 0 venues). The admin list returns `grantOfflineBlocked` from the same predicate.

### 4. Files changed in 6.5 and how they fit

- **`lib/venueAddition.ts`**: `quotedPriceMatches()`; `StartVenueAdditionArgs.quotedVenueCents`; the check right after
  `postClaimCheck` (which now also returns the live `rate`). New `venueAdditionInFlight(venueId)` (owner of a
  `pending`/`requires_action` add carrying this existing venue).
- **`lib/multiVenueBilling.ts`**: code `quote_changed` (+ partner message); admin code `venue_add_in_flight` (+ message);
  `ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES`; `onPartnerBillMessageKey()` (shared by Checkout and grant-manual).
- **`app/api/owner/venues/add/route.ts`**: passes `body.quotedVenueCents`.
- **`lib/adminVenueAttach.ts`**: passes `quotedVenueCents`; refuses `venue_add_in_flight` for a comp or another partner while
  an add for the venue is in flight (same partner's bill add continues to `startVenueAddition`, which answers same-key
  re-asks); calls `settleStaleVenueChangesForBill(bill)` after `loadAddVenueContext`, before quote/charge.
- **`app/api/admin/billing/route.ts`**: `quotedVenueCents` on `attach-venue`; grant-manual guard after the not-anchor check
  and before any Stripe call or the upsert (fails closed 500 on a read error); `grantOfflineBlocked` on each list row.
- **`lib/venueBilling.ts`**: `refusesOwnBill` (moved from the Checkout route, unchanged).
- **`lib/addVenueFlow.ts`**: `buildAddVenueBody` takes `quotedVenueCents`; `interpretAddVenueReply` → unconfirmed on any 5xx.
- **`lib/adminAttachFlow.ts`**: `refused` carries `requote` (true for `quote_changed`).
- **`lib/venueRemoval.ts`**: `settleStaleVenueChangesForBill` runs the price settler and the new
  `settleStaleRemoveUndoForBill` in `Promise.all` (two reads kept on purpose: the price read selects `price_id`, which a
  deploy-skewed DB may lack).
- **UI:** `AddVenueSheet.tsx` sends the quote's price and, on `quote_changed`, re-quotes with the message as a hint;
  `BillVenuesPanel.tsx` (Add back) keeps the confirmed quote in `quotedRef` and re-sends it on every re-ask, re-quotes on
  `quote_changed`; `LinkVenueToPartner.tsx` sends the preview's price and drops the preview on `requote`;
  `BillingSection.tsx` disables Grant offline on `grantOfflineBlocked` (desktop tooltip, mobile note).
- **`CLAUDE.md`**: multi-venue section — price swap claimed under the bill lock, only `custom_monthly_` is per-venue,
  Confirm carries the quoted price, one bill per partner at Checkout and Grant offline; latest-handoff pointer.

### 5. Facts and traps

- The five older `tests/api.admin.billing-grant-manual-*.test.ts` files hand-roll a Supabase mock without `.in()`. They now
  stub `unbilledVenueStates` (partial `vi.mock` of `@/lib/venueBilling`) as "nothing to refuse"; the guard's behaviour is
  tested in `tests/api.billing-unbilled-venue-states.test.ts`. A new grant-manual test file needs the same stub.
- Tests that POST an add now need `quotedVenueCents`. `tests/api.owner.venues-add.test.ts` and
  `tests/api.owner.venues-remove.test.ts` have a `quotedNow()` helper (next band, or the `custom_monthly_` amount).
- Older traps still hold: `npm run build` flips `next-env.d.ts` — restore with
  `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts` (never `git checkout --`); don't
  run typecheck and build together; scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`;
  no `STRIPE_GRADUATED_PRICE_ID` in `.env.local`; never POST a real add from a dev server (live Stripe + shared DB).

### 6. Build, run, test — verified 2026-10-11

- `npx tsc --noEmit` clean; `npm run lint` clean (usual Babel size note only).
- `npm run test`: **342 files passed, 1 skipped; 4,042 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded; `next-env.d.ts` restored (no diff). `tests/lib.auth-users-fk-guard.test.ts` unchanged.
- **New tests:** quote_changed after a rate swap, then a re-quote succeeds; missing / string / lower / fractional quoted
  price refused with nothing charged; a paid key re-ask ignores the quote; admin card attach with a wrong price; Add back
  with a stale quote; `requote` in the admin reader; any-5xx-is-unconfirmed; grant-manual refused for comped / removed /
  other-live-bill, allowed for first bill / only-other-bill-cancelled / renewing its own offline bill, 500 on a read error,
  and `grantOfflineBlocked` on the list; admin attach reserves a 3-D-Secure-pending venue; contract pins for all of it.
- **Mutation checks** (each made tests fail, then restored from scratchpad copies): the quote check forced true (7 fail);
  the grant guard disabled (3 fail); the in-flight reservation disabled (1 fail).
- **Unverified:** no browser pass of the three screens' quote_changed / Check again paths, the greyed Grant button, or the
  Link sheet (Phase 7's device checklist should include them; never against live Stripe from dev).

### 7. Review findings NOT fixed — open questions for Andrew

From the `/code-review` of the whole Phase 6 → 6.5 diff (high). Fixed: admin attach reserve during 3-D Secure, admin attach
stale-change settle, Add back re-ask losing its quote, duplicated refusal-key mapping, sequential stale reads.

1. **A venue with only a cancelled bill of its own, whose partner pays on another venue's bill, has no way back on.**
   Checkout and Grant offline refuse (one bill per partner), and Link a venue refuses `venue_has_own_bill`. Reachable if
   such a partner ever exists (e.g. A's bill cancelled, then they subscribed B). Fix needs a design: moving a venue's
   membership row from its old bill to the live one (`billing_subscription_venues.venue_id` is UNIQUE). **Production has no
   such partner today** (6.3 check). Decision: build an admin "move onto their bill" now, or defer until it happens.
2. **A removed venue whose old bill is gone** (cancelled, partner now on a different bill row) can't be added back
   (`readdableVenue` requires the same bill) and is refused everywhere else. Same move-membership design as item 1.
3. **`billRateFromMirror` (displays) still calls any non-graduated flat Price a per-venue rate**, while `billRateFromPrice`
   (charges) only accepts `custom_monthly_`. Display-only mismatch; both live bills are on the graduated Price. Fixing it
   needs the lookup key mirrored (a column → migration) or a `custom_monthly_` check on the price id.
4. **An admin "Add to their bill" on a card bill records the membership as `role 'added'`**, not `'admin'` (the offline path
   uses `'admin'`). Audit-only. Fix needs the ledger row to remember it was an admin attach (a column → migration).
5. **`isMissingFunction` is copied in `lib/billingCustomPrice.ts` and `lib/venueRemoval.ts`.** Can't import one from the
   other (`venueRemoval` imports `billingCustomPrice`); a tiny shared module would do. Cosmetic.

### 8. Recommended first steps for Phase 7 (Sonnet 5.5, medium)

1. Confirm with `git log origin/main..main` and `git status` that 6.3–6.5 are committed (Andrew's call) and everything is
   pushed; if not, stop and ask.
2. Ask Andrew about §7 items 1–2 (build now or defer). Don't build them inside Phase 7 without a yes.
3. Follow plan §5 "Phase 7": Partner Manual / price copy, write `docs/multi-venue-billing-device-checklist.md` (include the
   quote_changed re-quote, Add back, Check again, greyed Grant offline, Link sheet locked-partner view), then the Vercel
   env var + **Redeploy**, then Andrew's live add/remove on his own account.
4. Write `docs/multi-venue-volume-billing-plan_PHASE_7_HANDOFF.md` and update the plan's status line.
