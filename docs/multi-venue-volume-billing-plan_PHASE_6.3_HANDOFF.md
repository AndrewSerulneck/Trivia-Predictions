# Multi-Venue Volume Billing — Phase 6.3 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phase 6.3"). This note closes **Phase 6.3** (review findings
#2 and #4) and opens **Phase 6.4**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.2_HANDOFF.md`) still hold for what
they describe.

---

## For Andrew (plain English)

**What was wrong.**
- A venue taken off a partner's bill showed in Admin → Partner Billing as "Comped (free)", which was wrong.
- A partner could open Stripe Checkout for a venue you gave them free, or for a venue they'd removed. That would start
  a **second** $100/month subscription next to their real bill.

**What changed.**
- One shared check now sorts every venue with no live bill into one of three states:
  - **Removed:** it was taken off a bill.
  - **Comped:** it was never billed, and the partner pays for another venue.
  - **Unbilled:** anything else.
- **Checkout refuses a second subscription.** This covers a comped venue, a removed venue, and a second venue of a
  partner who already pays. The refusal happens before anything is sent to Stripe. The partner sees one of these:
  - removed: "This venue was taken off your bill. Add it back from Billing."
  - comped: "This venue is included free on your account."
  - otherwise: "Your venues share one bill. Email partnerships@hightopchallenge.com …"

  This refusal is **not** behind the feature flag, so it is live as soon as this code deploys.
- The admin list shows a removed venue as **Removed**, with the line "Removed from Pacific Street's bill (date)".
- A partner's Billing page lists a comped venue as **"Included on your account at no charge"**, never as something to
  subscribe to.

**Who does this touch today?** Only your own account. I checked production (read-only). Of 4 partners, only yours has
more than one venue: Pacific Street (paying) and the hidden test venue `venue-hightop-test`, which now counts as
comped. No partner has two bills. Nobody real gets locked out.

**Is it live?** No. Phase 6.3 is **not committed** and needs no database change. Phase 6.2 was committed today as
`636410c`. Phases 6, 6.1 and 6.2 are committed but **not pushed**, per your instruction to push everything when the
plan is finished.

**Recorded from you today:** the 6.1 rate gap is fixed in Phase 6.5, not waived. If you change a partner's rate while
they're on "Review & pay", they're charged the new rate instead of the one on their screen. The plan's 6.5 section now
says so.

**What needs you:** nothing for 6.4 to start. Committing 6.3 is your call; the commit list is in §2 below.

---

## For the next agent (Phase 6.4)

### 1. Goal and scope

**Phase 6.4** (plan §5, **Sonnet 5.5, high**): the admin "Link a venue" fixes, review #5–#8. The full spec is in the
plan.
- **#5:** keep the idempotency key on an unknown outcome.
- **#6:** the Link dropdown and the anchor name must not come from the search-filtered list.
- **#7:** let an admin move a **comped** venue onto the partner's bill. Use 6.3's classifier (`unbilledVenueStates`)
  to find comped venues. Never re-derive it.
- **#8:** build the price-band label from `VENUE_PRICE_TIERS`.

**Note for #6:** the new removed line takes its anchor name from the filtered `partners` list too (`billLine` in
`components/admin/sections/BillingSection.tsx`). It falls back to the venue id, so it never crashes. Fix it with the
same server-side `anchorVenueName`.

**Out of scope for 6.4:** the quote-vs-Confirm rate gap (6.5; Andrew said fix it), any commit or push unless Andrew
asks, and `supabase db push`.

### 2. Starting state

- Branch `main`. Commits on top of `origin/main`, **not pushed**: `6c5a178` (Phase 6), `a83da94` (6.1) and `636410c`
  (6.2). Check with `git log origin/main..main`. Andrew wants **one push when the whole plan is finished**.
- **Phase 6.3 is uncommitted.** Commit paths (**explicit list, never `git add -A`**):
  - `lib/venueBilling.ts`, `lib/multiVenueBilling.ts`, `lib/adminBillView.ts`
  - `app/api/owner/billing/checkout/route.ts`, `app/api/owner/billing/route.ts`, `app/api/admin/billing/route.ts`
  - `app/owner/billing/page.tsx`, `components/admin/sections/BillingSection.tsx`
  - `tests/api.billing-unbilled-venue-states.test.ts` (new), `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`,
    `tests/lib.admin-bill-view.test.ts`, `tests/multi-venue-billing-contract.test.ts`
  - `docs/multi-venue-volume-billing-plan.md`, `docs/multi-venue-volume-billing-plan_PHASE_6.3_HANDOFF.md`
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Database:** no migration, and no writes. The production check (§6) was read-only. The 6.1 migration
  `20261011224839` is applied, as recorded before.
- **Stripe:** no calls this phase.
- Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is still off. The new Checkout refusal and the owner page's comped list
  are deliberately **not** flag-gated.

### 3. Decisions already made

- Andrew's answers are in plan §2. Don't re-ask them.
- 6.2 was committed on Andrew's instruction. Push waits for the end of the plan.
- **The quote-vs-Confirm rate gap is to be fixed in 6.5, not waived** (Andrew, 2026-10-11). It is recorded in the
  plan's 6.5 section.
- "Comped" stays derived and is never stored. It means: no membership row, never the anchor of any bill (any status),
  and the linked owner has a non-cancelled bill.
- A venue still **leaving** (`remove_at` set, `removed_at` null) counts as covered. That matches the resolver, which
  ignores only `removed_at` rows. So it gets no state: it's still on its bill until the cron takes it off.
- Checkout refuses whenever the state is `removed`, `comped`, or `unbilled` with an `ownerBillId`. Every partner-facing
  word lives in `lib/multiVenueBilling.ts`: `ON_PARTNER_BILL_CODE`, `ON_PARTNER_BILL_MESSAGES`, `COMPED_VENUE_LABEL`.
- A removed venue is refused even when the bill it left is now cancelled. That's harmless: the UI resubscribes through
  the anchor venue (`/owner/billing/setup` uses `subscriptions[0].venueId`), and the venue can be added back after.

### 4. Files changed and how they fit

- **`lib/venueBilling.ts`**: two new exports.
  - `UnbilledVenueState` / `unbilledVenueStates(venueIds, ownerIdByVenue)`. It makes three parallel reads:
    memberships of any state by `venue_id`, `billing_subscriptions` by `venue_id` (any status), and the partners'
    non-cancelled bills by `owner_id`. Then, only if a membership points at an unloaded bill, it reads that bill by
    `id`. Venues a live bill covers are left out of the map. A missing membership table reads as "no rows".
  - `otherLiveBillOfOwner(ownerId, exceptBillId)`: one `limit(1)` read.
- **`app/api/owner/billing/checkout/route.ts`**: right after `loadBillingForVenue`, it calls `unbilledVenueStates`.
  A read error returns 503 and refuses (fails closed). It then runs `refusesOwnBill` and returns
  `onPartnerBillResponse` with 409 `on_partner_bill` and logs `[OwnerCheckout] on-partner-bill`. This is before any
  `readStripeTruth`, cancel, sweep or session create.

  The stale-mirror path is different: the venue's own row is `active`/`past_due` in our DB, but Stripe said
  dead/missing/incomplete. The classifier counted that venue as covered. So just before the sweep, the route asks
  `otherLiveBillOfOwner(auth.ownerId, existing.id)`. In that path an incomplete subscription may already have been
  voided, which is correct either way.
- **`app/api/admin/billing/route.ts`**: `ownersWithLiveBill` is deleted. Venues with no row or a cancelled row go
  through the classifier, which adds three reads to the whole list. `comped` now means "the classifier says comped".
  A new `removedFrom: { anchorVenueId, removedAt } | null` is filled only when the venue has no bill row.
- **`lib/adminBillView.ts`**: new `AdminRemovedFrom` type and `removedFromLine()`.
- **`components/admin/sections/BillingSection.tsx`**: `Partner.removedFrom`. `statusBadge` checks **Removed** (slate)
  before Comped. `billLine` shows the removed line.
- **`app/api/owner/billing/route.ts`**: new `compedVenues: [{ id, name }]`. The classifier runs only for the caller's
  venues that no live bill covers, so a normal partner pays zero extra reads. When there are comped venues it adds one
  `venues` name read. A classifier error is logged (`[OwnerBilling] unbilled-read-failed`) and the page still loads
  without the list.
- **`app/owner/billing/page.tsx`**: `CompedVenuesCard` shows each venue with `COMPED_VENUE_LABEL`. It appears below
  the account panel when there's a subscription. With no subscription and comped venues, it **replaces** "Set up
  subscription".
- **Removed venues:** they already show Add back in `BillVenuesPanel` (flag on). The page's only Subscribe and
  Resubscribe controls are bill-level, so no removed venue gets a Subscribe. Confirmed by reading the page.

### 5. Facts and traps

- **The admin can still "Grant offline" on a comped or removed row** (`openGrant` in `BillingSection.tsx`). That writes
  a separate offline bill for that venue. It's an explicit admin action and outside 6.3's scope. **6.5 should decide**
  whether to warn or refuse there.
- `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` had a hand-shaped Supabase mock that couldn't chain the
  new reads. It is now a small in-memory filter (eq / neq / in / order / limit). The 38 cases are unchanged and pass.
- Andrew's `venue-hightop-test` (hidden, linked to Pacific Street's owner) now shows **Comped (free)** in admin. It did
  before too, through the old derivation. Checkout for it is refused.
- The traps from earlier phases still hold:
  - `npm run build` flips `next-env.d.ts`. It was restored with `sed` to `./.next/dev/types/routes.d.ts`. **Never** use
    `git checkout --` on it.
  - Don't run typecheck and build at the same time.
  - Scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`.
  - No `STRIPE_GRADUATED_PRICE_ID` is set in `.env.local`.

### 6. Build, run, test: what was verified (2026-10-11)

- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note for `lib/sportsBingo.ts`).
- `npm run test`: **341 files passed, 1 skipped; 4,000 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded (run after typecheck, not alongside it). `next-env.d.ts` was restored afterwards.
- **New tests**, all 17 in `tests/api.billing-unbilled-venue-states.test.ts`:
  - The classifier: comped, removed (with its anchor), leaving counts as covered, a cancelled own bill plus another
    live bill gives `unbilled` with `ownerBillId`, another owner's bill doesn't count, a missing table vs a real read
    error.
  - Checkout refuses comped, removed, a second venue, and a stale-mirror second venue, all with no Stripe call. It still
    allows a cancelled-only partner (Resubscribe) and a first venue. A read error gives 503 with no Stripe call.
  - The admin list: removed is not comped, and comped is still comped.
  - The owner GET: comped venues listed, none for a single-venue partner, a removed venue never listed as comped.
- **Mutation check:** with the two refusal lines disabled, 4 Checkout tests failed. The file was restored from a
  scratch copy and all 17 pass.
- **Contract pins** in `tests/multi-venue-billing-contract.test.ts`:
  - The refusal sits before `readStripeTruth(`, the cancel, the sweep and the session create.
  - The stale-mirror check sits before the sweep.
  - The refusal is not flag-gated, and the code literal is pinned.
  - `ownersWithLiveBill` is gone, and both billing routes use the classifier.
  - `unbilledVenueStates` is defined only in `lib/venueBilling.ts`.
- `tests/lib.admin-bill-view.test.ts` covers `removedFromLine`.
- **Production (read-only, 2026-10-11)**, a scratchpad script outside the repo (`venue_owner_venues`,
  `billing_subscriptions`, `billing_subscription_venues`): 5 links, 4 owners, 3 bills, 3 membership rows.
  - Only one owner has more than one venue: `64f046ff-a44f-47b4-acc1-94ff30288920` (Andrew). `venue-pacific-street` is
    on an active bill, and `venue-hightop-test` (hidden) has no bill, so it is classified **comped**.
  - No owner has more than one bill. No bill is anchored on a venue its owner isn't linked to.
- **Unverified:** the new owner-page card and the admin "Removed" badge haven't been checked in a real browser. Both are
  simple, light-surface/dark-surface UI branches.

### 7. Open questions and waiting on Andrew

1. Commit 6.3 (path list in §2). Pushing everything waits for the end of the plan.
2. For 6.5: should admin "Grant offline" on a comped or removed venue warn or refuse (§5)?

### 8. Recommended first steps for Phase 6.4 (Sonnet 5.5, high)

1. Read plan §5 "Phase 6.4" and this note. Check that `git status` matches §2.
2. For #7, call `unbilledVenueStates` from `attachOptions()` in `app/api/admin/billing/route.ts`, for linked venues,
   and keep only `kind === "comped"`. Tag each with its owner.
3. For #6, return `anchorVenueName` on each bill **and** on `removedFrom` (looked up before the search filter), and use
   it in `billLine`.
4. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (in sequence), then restore
   `next-env.d.ts`. Write `docs/multi-venue-volume-billing-plan_PHASE_6.4_HANDOFF.md` and update the plan's status
   line.
