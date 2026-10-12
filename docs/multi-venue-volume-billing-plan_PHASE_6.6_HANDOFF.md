# Multi-Venue Volume Billing — Phase 6.6 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phases 6.6–6.9"). This note closes **Phase 6.6** and opens
**Phase 6.7 (Rejoin UI)**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.5_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What changed.** Two partners could get stuck with a venue that had no way back onto their bill:

1. a venue whose **own** bill was cancelled, while the partner now pays on another venue's bill; and
2. a venue that was **removed** from a bill that was later cancelled.

Now both can be put back on the partner's current bill with the normal **"Add back"** (or your admin **"Add to their
bill"**). It is the same paid flow as any other add: the card is charged the prorated price first, and only then does the
venue move onto the bill and show to players again. Nothing new can charge anyone.

Also:
- The "you can't open a second bill" messages now say the right thing for these venues ("Add it back from Billing"
  instead of "email support").
- A safety repair: if an old bill is ever restarted after one of its venues moved away, that venue is moved back
  automatically (by the Stripe update, by "Grant offline", or by the nightly billing job).

**Is it live?** No. Built and tested, **not committed**, no database change. The partner screens that will show "Add back"
for these venues are the next phase (6.7) — today there is no button for them yet, and the multi-venue flag is still off.
I checked production (read-only): you have 3 bills, all live, none cancelled — so nobody is in either situation and the
new nightly step will do nothing.

**What needs you:** say whether to commit Phase 6.6 (one commit; path list in §2 below). Phases 6.7–6.9 then follow; 6.8
has a database change that needs your go-ahead to apply.

---

## For the next agent (Phase 6.7 — Rejoin UI)

### 1. Goal and scope

**Phase 6.7** (plan §5, **Sonnet 5.5, high**): make the 6.6 server behaviour reachable.
- Partner Billing page: list the partner's linked venues whose `rejoinStateOf` is `dead_bill` under "Not on your bill"
  with **Add back** (same quote → Confirm with `quotedVenueCents` → Check again flow as Phase 5/6.5), sending the live
  bill's `billVenueId` as `venueId`. Flag-gated like the rest of the account view (`GET /api/owner/billing` `account`,
  `lib/billAccountView.ts`, `components/owner/billing/BillVenuesPanel.tsx`).
- A lapsed venue's own Billing view must not offer Subscribe; point at Add back.
- Admin: a `lapsed` label in the billing list next to Removed/Comped; `attach-options` includes lapsed venues tagged with
  their partner (locked to "Add to their bill"); the greyed Grant offline note uses the `lapsed` copy.

**Out of scope:** the 6.8 migration items, `supabase db push`, any change to the money flow built in 6.6.

### 2. Starting state

- Branch `main`. Local commits ahead of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2),
  `54af6e3` (6.3–6.5, committed 2026-10-11 on Andrew's instruction).
- **Phase 6.6 is uncommitted.** No migration. Commit path list (explicit, never `git add -A`):
  ```
  app/api/admin/billing/route.ts
  app/api/cron/billing/route.ts
  app/api/owner/billing/checkout/route.ts
  app/api/webhooks/stripe/route.ts
  docs/multi-venue-volume-billing-plan.md
  docs/multi-venue-volume-billing-plan_PHASE_6.6_HANDOFF.md
  lib/adminVenueAttach.ts
  lib/multiVenueBilling.ts
  lib/venueAddition.ts
  lib/venueBilling.ts
  tests/api.admin.billing-grant-manual-churned-card.test.ts
  tests/api.admin.billing-grant-manual-clears-discount.test.ts
  tests/api.admin.billing-grant-manual-guard.test.ts
  tests/api.admin.billing-grant-manual-list-rate.test.ts
  tests/api.admin.billing-grant-manual-validates-first.test.ts
  tests/api.billing-unbilled-venue-states.test.ts
  tests/api.owner.venues-add.test.ts
  tests/api.owner.venues-remove.test.ts
  tests/lib.rejoin-state.test.ts
  tests/multi-venue-billing-contract.test.ts
  ```
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Data:** no writes, no Stripe calls. One read-only production query (scratchpad script, not in the repo): 3
  `billing_subscriptions` rows, all live, 0 cancelled; 3 membership rows; no live bill's anchor row is missing or
  elsewhere; 0 membership rows on cancelled bills. Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` still off.

### 3. Decisions already made

- **Andrew, 2026-10-11:** fix the five 6.5-review findings now (phases 6.6–6.9), don't wait for a partner to hit one.
- **Rejoin = re-point the existing membership row**, inside the existing paid add flow (not a new admin-only "move" tool):
  `billing_subscription_venues.venue_id` is UNIQUE, so the row moves; the dead bill row is history and is never touched.
- **No RPC for the move** (reasoning in `moveFromDeadBill`'s comment): the quantity guard is already the claim RPC under
  the target bill's lock; the remaining precondition ("old bill is cancelled") is not reversed while the partner has a live
  bill. A reviewer may challenge this — the alternative is a `move_venue_membership` RPC in 6.8's migration.
- **Admin attach accepts `left_here` too** (a venue taken off this partner's live bill) in `bill` mode: it is the only way
  back for an OFFLINE bill (the partner's Add back refuses `offline_bill`).
- **Never a transfer between partners** (plan §8): a `dead_bill` venue rejoins only if linked to this partner, or unlinked
  with the dead bill's `owner_id` = this partner.
- **Hidden venues:** admin attach accepts a hidden venue only with history AND `rehidden_at` (we hid it). Admin-hidden
  (no stamp) stays `venue_hidden`.
- **A `removed` venue whose partner has no live bill** stays refused at Checkout (6.5's rule: `removed` always refuses)
  but the copy is now "email support" (`removed_no_bill`); the admin copy says restart billing from the old anchor venue,
  then Add back (the resubscribe re-points the old bill row, so the venue is then `left_here`).

### 4. Files changed and how they fit

- **`lib/venueBilling.ts`**
  - `UnbilledVenueState` gains `{ kind: "lapsed", fromBillId, ownerBillId }` (history only on cancelled bills, partner has
    a live bill). `refusesOwnBill` is unchanged and already refuses it.
  - `addVenueToBill`: a row on another bill → `moveFromDeadBill` (reads that bill; `cancelled` → one update conditional on
    `venue_id` + old `subscription_id`; live → `venue-on-another-bill`; lost race → re-read, ok only if now billed here).
    Logs `[VenueBilling] membership-moved`.
  - `RejoinState`, pure `classifyRejoin(target, membership, anchoredBill, membershipBill, nowMs)`, and
    `rejoinStateOf(venueId, targetBillId, nowMs)` (membership row + anchored bill in parallel, then the row's bill by id).
  - `bringAnchorHome(billId)` → `home | moved | inserted | not_live | anchor_on_live_bill`; and
    `repairAnchorMemberships({ dryRun })` for the cron (2 bounded reads; missing membership table = nothing to do).
- **`lib/venueAddition.ts`**: `readdableVenue` decides on `rejoinStateOf` (`left_here`/`dead_bill` allowed). The two
  un-hide updates moved out of `completeAddition` into exported `revealPaidVenue(venueId)` (unchanged SQL).
- **`lib/adminVenueAttach.ts`**: selects `rehidden_at`; `venue_has_own_bill` only for a LIVE own bill; comped refuses any
  history; bill mode with history requires a rejoinable `rejoinStateOf` against the partner's bill; offline path calls
  `revealPaidVenue` after the move.
- **`lib/multiVenueBilling.ts`**: `ON_PARTNER_BILL_MESSAGES` / `ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES` gain `lapsed` and
  `removed_no_bill`; `onPartnerBillMessageKey(state)` now takes `{ kind, ownerBillId }`; `venue_has_billing_history`
  admin copy reworded.
- **Routes:** Checkout and grant-manual pass the state to `onPartnerBillMessageKey`; grant-manual calls
  `bringAnchorHome(subscription.id)` after its upsert (best-effort, logged); the Stripe webhook's `runFirstSyncFollowers`
  calls new `maybeBringAnchorHome(sub)` (bill found by `stripe_subscription_id`); `/api/cron/billing` runs
  `repairAnchorMemberships` before the drift check and returns `anchorRepair`.

### 5. Facts and traps

- The resolver's rule 2 already covers a rejoined anchor: `loadBillingForVenue(A)` with A's own bill cancelled and its row
  on live bill B returns B. After a move, the dead bill has no anchor row; `billedVenueCountFromRows` counts a row-less
  anchor as billed, but the **claim RPCs count rows** — hence `bringAnchorHome` when such a bill is revived.
- The anchor trigger fires on INSERT only; a resubscribe UPDATEs the old row (webhook upsert `onConflict: venue_id`).
- The five `tests/api.admin.billing-grant-manual-*.test.ts` files partially mock `@/lib/venueBilling`; they now also stub
  `bringAnchorHome`. A new grant-manual test file needs the same.
- zsh does not word-split `$VAR` in commands — use an explicit file list (or `${=VAR}`) when scripting vitest runs.
- Older traps still hold: `npm run build` flips `next-env.d.ts` — restore with
  `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts` (never `git checkout --`); don't
  run typecheck and build together; scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`;
  never POST a real add from a dev server (live Stripe + shared DB).

### 6. Build, run, test — verified 2026-10-11

- `npx tsc --noEmit` clean; `npm run lint` clean (usual Babel size note only).
- `npm run test`: **343 files passed, 1 skipped; 4,064 tests passed, 13 skipped, 0 failed.**
- `npm run build`: compiled successfully; `next-env.d.ts` restored (no diff). `tests/lib.auth-users-fk-guard.test.ts`
  unchanged.
- **New tests:** `tests/lib.rejoin-state.test.ts` (rule matrix + copy keys); partner Add back for finding #1 and #2,
  declined rejoin, refusals, `bringAnchorHome` all outcomes, cron repair with dry run (`tests/api.owner.venues-remove.test.ts`);
  `addVenueToBill` move/refuse/no-op and admin attach rejoin on card + offline bills plus refusals
  (`tests/api.owner.venues-add.test.ts`); `lapsed` state and copy (`tests/api.billing-unbilled-venue-states.test.ts`);
  two contract pins (`tests/multi-venue-billing-contract.test.ts`).
- **Mutation checks** (each restored from scratchpad copies): move allowed off a live bill → 3 fail; Add back refusing
  `dead_bill` → 5 fail; no `lapsed` kind → 4 fail; admin attach refusing every hidden venue → 1 fail.
- **Unverified:** no UI exists yet for the partner path (6.7); no browser pass; the webhook follower is covered only by the
  contract pin, not an end-to-end webhook test.

### 7. Open questions for Andrew

- Commit Phase 6.6 now (path list in §2)? Nothing else is waiting on him for 6.7.
- 6.8 will need `supabase db push` approval (two columns on existing tables).

### 8. Recommended first steps for Phase 6.7 (Sonnet 5.5, high)

1. `git status` / `git log origin/main..main` — confirm whether 6.6 was committed; if not, build on the working tree and
   commit nothing without Andrew.
2. Read `lib/billAccountView.ts`, `components/owner/billing/BillVenuesPanel.tsx`, `app/api/owner/billing/route.ts`
   (`loadBillAccount`, the `uncovered` / `unbilledVenueStates` block) and `app/api/admin/billing/route.ts`
   (`attach-options`, the list's `comped` / `venueState` fields).
3. Server: in the owner billing GET, add the partner's `lapsed` / removed-from-a-dead-bill venues to the account view
   (from `unbilledVenueStates`, already computed there for `uncovered` — no extra read for the usual partner). Admin:
   `venueState: "lapsed"` and lapsed venues in `attach-options`.
4. UI per plan §5 Phase 6.7; tests; light-surface + 12px rules; add the screens to Phase 7's device checklist list.
5. Write `docs/multi-venue-volume-billing-plan_PHASE_6.7_HANDOFF.md` and update the plan's status line.
