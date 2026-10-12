# Multi-Venue Volume Billing — Phase 6.1 Handoff (written 2026-10-11)

> **Update 2026-10-11 (after this note was written):** Andrew approved the push. Migration
> `20261011224839_bill_price_change_lock.sql` is **applied to production** (`supabase db push`) and verified through
> PostgREST: `billing_venue_changes.price_id` exists; `claim_bill_price_change`, `finish_bill_price_change` and the
> replaced `finish_venue_bill_change` answer `invalid` to empty arguments with the service role; the anon key gets
> `42501 permission denied`. Phase 6.1 is now **committed locally** (not pushed). Items 1–2 under "What needs you"
> and §7.1–7.2 below are done.

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phase 6.1"). This note closes **Phase 6.1** (review fix #1:
the admin price swap takes the bill's lock) and opens **Phase 6.2**. Earlier handoffs (`…_PHASE_1_` …
`…_PHASE_6_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What was wrong.** In Admin → Partner Billing, "Set rate" and "Back to standard pricing" checked whether a partner
was adding or removing a venue, but that check wasn't locked. If a partner pressed "Add a venue" at the same moment,
the admin's change could undo the venue they had just paid for, or cancel their card check.

**What changed.** A price change now waits its turn, the same way adds and removes already do. While one is going
through, the other is told "try again in a minute". If a price change gets stuck (for example, Stripe doesn't answer),
it clears itself after about 10 minutes, and the nightly billing job also checks for it. Adding and removing a venue
now also re-check Stripe after they've taken their turn, so they always charge the rate Stripe has right now.

**Is it live?** No. Nothing is committed, pushed or deployed. It needs **one database change** first:
`supabase/migrations/20261011224839_bill_price_change_lock.sql`. It adds no table, only a new kind of row and three
database functions. I tested it on a local copy of the database and it is **not** applied to production.

**What needs you:**
1. **Say "push the migration"** when you want it applied. Order matters: the database change first, then the app.
   If the app goes out first, "Set rate" and "Back to standard pricing" safely refuse with "temporarily unavailable"
   until the database change is in. Nothing else is affected.
2. **Phase 6 (`6c5a178`) is committed but not pushed.** Phase 6.1 is not committed. Tell me whether to commit 6.1
   now as its own commit, or keep going through 6.2–6.4 and commit at 6.5 (the plan's default).
3. **For later (not urgent).** I found one more small gap, which the original review missed and which is older than this
   phase. If you change a partner's rate while they are on the "Review & pay" screen of Add a venue, and they then
   press Confirm, they are charged the new rate, not the one on their screen. This needs an admin rate change at the
   exact moment a partner is mid-add, so it's rare. It's listed for Phase 6.5 to fix or for you to waive.

---

## For the next agent (Phase 6.2)

### 1. Goal and scope

**Phase 6.2** (plan §5, **Opus 5.5, high**, ½ session): review findings #3, #9, #10:
- #3: `billRateFromPrice` (`lib/venuePricing.ts`) must treat only Prices whose `lookup_key` starts with
  `CUSTOM_PER_VENUE_LOOKUP_PREFIX` as a per-venue rate. `customPriceLookupKey` builds from that constant.
- #9: revive the `custom_rate` refusal (409) for a flat non-`custom_monthly_` Price in `loadAddVenueContext` and the
  removal context (`checkAddableSubscription` / `checkChangeableSubscription` are now the places, see §4). Delete
  `isGraduatedPrice` (`lib/venueAddition.ts`, no callers). Admin success message for a non-prefixed pasted Price.
- #10: `lib/billingQuantityDrift.ts` runs its three reads in one `Promise.all`.
- Read-only: list every live subscription's item Price and lookup key before shipping (plan §5 6.2 bullet).

**Out of scope for 6.2:** 6.3 (removed/comped classifier, Checkout refusal), 6.4 (admin Link tool UI), the
quote-vs-confirm gap in §7 (6.5 or Andrew), any commit unless Andrew asks, and `supabase db push` unless Andrew asks.

### 2. Starting state

- Branch `main`. Last commit **`6c5a178`** (Phase 6), **committed locally, NOT pushed** (`git log origin/main..main`
  shows it). Phase 6.1 is **uncommitted** in the working tree.
- **Migration `20261011224839_bill_price_change_lock.sql` is NOT applied** (`supabase migration list`: local only;
  every earlier migration is applied). Production check (read-only, 2026-10-11): `billing_venue_changes` and
  `billing_venue_additions` are both **empty**, and `billing_venue_changes.price_id` doesn't exist yet (42703).
- No data changed, no scripts run against production, no Stripe calls. Nothing to undo.
- Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` still off.
- Phase 6.1 paths (for the eventual commit, **explicit list, never `git add -A`**):
  `supabase/migrations/20261011224839_bill_price_change_lock.sql`, `lib/billingCustomPrice.ts`,
  `lib/venueAddition.ts`, `lib/venueRemoval.ts`, `app/api/admin/billing/route.ts`, `app/api/cron/billing/route.ts`,
  `scripts/test-multi-venue-billing-sql.cjs`, `tests/lib.billingCustomPrice.test.ts`,
  `tests/multi-venue-billing-contract.test.ts`, `tests/api.admin.billing-discounts.test.ts`,
  `tests/api.owner.venues-add.test.ts`, `tests/api.owner.venues-remove.test.ts`,
  `docs/multi-venue-volume-billing-plan.md`, `docs/multi-venue-volume-billing-plan_PHASE_6.1_HANDOFF.md`.
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.

### 3. Decisions already made

- Andrew's answers are in plan §2. Don't re-ask them. The custom rate is **per venue** (§2 row 6).
- Before 6.1, the plan said to ask whether to commit Phase 6 first. It **was** committed (`6c5a178`), so 6.1 is its
  own reviewable diff on top.
- The swap is a **claimed row on the existing `billing_venue_changes` ledger** (`action = 'price'`), not a new table,
  so it shares the one per-bill advisory lock `'billing_venue_addition:' || bill id` with adds and Remove/Undo.
- **Fresh idempotency key per admin action** (`bill-price:<billId>:<uuid>`), also used as Stripe's idempotency key.
  A repeated "Set rate" is a new decision. A concurrent one is refused as `busy_change`.
- **Fails closed.** A missing claim RPC gives 503 + `[CustomPrice] claim-rpc-missing`. There is no unlocked fallback.
- The new RPCs are **invoker** plpgsql with a pinned `search_path` (not `security definer`), matching the existing
  `claim_venue_addition` / `claim_venue_bill_change` / `finish_venue_bill_change`. The plan text said "security
  definer", but the repo convention is invoker. service_role already has every privilege they need, and definer would
  only widen what they run as. Execute: service_role only.

### 4. Files and how they fit

- **`supabase/migrations/20261011224839_bill_price_change_lock.sql`** (new):
  1. `billing_venue_changes.price_id text`. The `action` CHECK is dropped **by shape** (every CHECK whose `conkey` is
     just the `action` column; it raises if there are none) and re-added as `billing_venue_changes_action_check`
     `('remove','undo','price')`. Postgres's own name for the old inline check is the same (proven on PGlite).
     The file is re-runnable.
  2. `billing_venue_changes_price_row_check`: a price row has `price_id` and no `venue_id`, and a remove/undo has no
     `price_id`.
  3. `claim_bill_price_change(p_idempotency_key, p_owner_id, p_subscription_id, p_price_id)` →
     `claimed | existing | key_conflict | busy_addition | busy_change | not_owner | no_bill | invalid`.
  4. `finish_bill_price_change(p_change_id, p_outcome 'done'|'failed', p_failure_reason)` →
     `done | failed | already | wrong_action | not_found | invalid`. It only marks the row; mirrors are the
     caller's/webhook's job.
  5. `finish_venue_bill_change` **replaced** with the same body plus one guard: a non-`remove`/`undo` row gives
     `wrong_action` and nothing is written. (Its old `else` treated anything not `remove` as `undo`.)
  - No change to `claim_venue_addition` / `claim_venue_bill_change`. Both already treat **any** pending change row as
    busy (verified on PGlite, §6).
- **`lib/billingCustomPrice.ts`**: `swapSubscriptionPrice(bill, …)` = `claimPriceChange` → `subscriptions.retrieve`
  → single-item + `pending_update` checks (each refusal closes the claim `failed` with a `refused:*` reason) →
  `subscriptions.update(…, { idempotencyKey: key })` → `closePriceChange(done)` → mirror. A definitive Stripe rejection
  (`isDefinitiveStripeRejection`, imported from `lib/venueAddition.ts`) closes it `failed`. An ambiguous one
  (5xx/connection) leaves it **pending** (503 "check automatically within about 10 minutes"). `venueChangeInFlight` is
  deleted. New exports: `settleBillPriceChange(row)` (after `VENUE_ADDITION_LEASE_MS`: Stripe's sole item on
  `price_id` gives `done`, otherwise `failed`; a Stripe read error stays pending; a missing subscription gives
  `failed`), `settleStaleBillPriceChangesForBill(billId)` (never throws), `reconcileStaleBillPriceChanges({dryRun})`
  (daily, limit `BILL_PRICE_CHANGE_RECONCILE_LIMIT` = 20). `CustomPriceRow` gained `owner_id`. The settlers are
  deploy-skew safe: a missing `price_id` column (42703) means "nothing to settle", logged once as
  `[CustomPrice] price-ledger-missing`.
- **`lib/venueRemoval.ts`**: `VENUE_CHANGE_ACTIONS = ["remove","undo"]`. Both stale readers
  (`settleStaleVenueChangesForBill`, `reconcileStaleVenueChanges`) filter `.in("action", VENUE_CHANGE_ACTIONS)`.
  `reconcileVenueChange` returns `unknown` for a non-venue row. `settleStaleVenueChangesForBill` first calls
  `settleStaleBillPriceChangesForBill`, so every add/quote/remove route and both admin price routes clear a dead swap.
  **Post-claim re-read:** `startVenueChange` now retrieves the subscription after its claim and runs
  `postClaimCheck` (item id, `pending_update`, quantity = `quantity_before`, and for a remove the period end equals
  the claimed `remove_at`). The update uses `checked.item.id`. `checkChangeableSubscription` holds the shared Stripe
  rules (context + post-claim).
- **`lib/venueAddition.ts`**: `checkAddableSubscription` holds the shared Stripe rules. `startVenueAddition` re-reads
  after `claimAddition` and runs `postClaimCheck` (healthy bill, same item, **same Price id as the context**, no
  `pending_update`, quantity = `quantity_before`). A read failure gives a `failed` ledger row
  (`subscription-read-failed`) and 503 `stripe_unavailable`. The charge uses `liveItem` (id and
  `current_period_start`).
- **`app/api/admin/billing/route.ts`**: both price handlers select `owner_id` and call
  `settleStaleVenueChangesForBill(row.id)` before the swap.
- **`app/api/cron/billing/route.ts`**: new `priceChanges` job (`reconcileStaleBillPriceChanges`) between
  `venueChanges` and `venueRemovals`. It never fails the cron and appears in the JSON response.

### 5. Facts and traps

- **The PGlite SQL proof is `npm run test:multi-venue-billing-sql`, not `node scripts/…` directly.** The npm script
  sets `MULTI_VENUE_PGLITE_MODULE`. Plain `node` fails with "Cannot find module '@electric-sql/pglite'".
- **`npm run build` flips `next-env.d.ts`** (`./.next/dev/types/…` becomes `./.next/types/…`). Put the `dev/` line
  back afterwards so it doesn't land in a commit. Don't use `git checkout --` (see memory: it wipes all uncommitted
  changes to that file).
- A Node script outside the repo needs `NODE_PATH="$PWD/node_modules"` to find `@supabase/supabase-js` when run
  with `node --env-file=.env.local`.
- In `tests/api.owner.venues-add.test.ts` the in-memory DB has no `billing_venue_changes` table, so every add test
  logs `[CustomPrice]/[VenueRemoval] settle-failed … Unexpected table`. That's harmless: both settlers swallow errors
  by design, and Phase 5 already logged the VenueRemoval one.
- When a pending **price** row blocks a partner add, `claim_venue_addition` returns `busy` with `addition_id` null, so
  the partner sees the generic `addition_in_progress` copy. A blocked partner remove sees `change_in_progress`.
  Both are accurate enough. No copy change was made.
- The admin `amountDollars` path still mints/resolves the `custom_monthly_<cents>` Price **before** the claim. A busy
  refusal can leave an unused Price at Stripe, which is harmless (lookup key reused next time).
- `supabase migration list` works without prompts and is read-only. There's no `timeout` binary on this Mac.
- Cost: one extra bounded, indexed read of `billing_venue_changes` per add/quote/remove/admin-price request (the
  price-row settle), plus one per daily cron run. Normally zero rows. Stripe reads only per stuck row. No new cron and
  no `vercel.json` change.

### 6. Build, run, test: what was verified (2026-10-11)

- `npx tsc --noEmit`: clean. `npm run lint`: clean.
- `npm run test`: **340 files passed, 1 skipped; 3,970 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded (typecheck and build were run one after the other, not together).
- `npm run test:multi-venue-billing-sql`: "all SQL checks passed". Section 10 covers: the auto-named constraint is
  `billing_venue_changes_action_check`; the migration applied twice (re-runnable) leaves exactly one action check;
  the shape constraints; argument checks; add pending/`requires_action` blocks the swap (`busy_addition`); a pending
  remove blocks it (`busy_change`, row returned); same key gives the same row, other Price/a remove's key gives
  `key_conflict`; while a swap is pending a second swap, a partner add (`busy`, `addition_id` null) and a partner
  remove are all refused; each finish function refuses the other's rows without writing; done/failed/idempotent; the
  bill is free after either; the replaced `finish_venue_bill_change` still applies a remove; execute is service_role
  only.
- Vitest added/extended: `tests/lib.billingCustomPrice.test.ts` (claim-before-read order, busy ×3, fail-closed on
  missing RPC, not_owner/no_bill, pending_update, ambiguous stays pending, definitive closes failed, settle both ways,
  dry run, missing column, never-throws); `tests/api.owner.venues-add.test.ts` (an admin rate / quantity /
  pending_update / cancel landing **between the context read and the claim** is refused after the re-read, nothing
  charged; post-claim read failure gives 503 + failed row); `tests/api.owner.venues-remove.test.ts` (same for quantity,
  period renewal, pending_update; a stale `price` row is skipped by the Remove/Undo reconciler);
  `tests/multi-venue-billing-contract.test.ts` (claim before retrieve before update; RPC sole callers; cron + per-bill
  settle wired; reconcilers filter by action; add/remove update from the post-claim read);
  `tests/api.admin.billing-discounts.test.ts` (settle runs before the swap).
- `tests/supabase-migration-grants-contract.test.ts` passes (no new table/view/sequence).
  `tests/lib.auth-users-fk-guard.test.ts` unchanged and passing.
- **Unverified:** the migration against real production Postgres (only PGlite), and the live Stripe behaviour of the
  swap's idempotency key. Both get exercised the first time Andrew uses Set rate after the push.

### 7. Open questions and waiting on Andrew

1. **`supabase db push`** of `20261011224839`. Needs his explicit go-ahead. Deploy the app **after** it.
2. Commit 6.1 now, or at 6.5 (plan default: 6.5, explicit path list). Push of `6c5a178` is also his call.
3. **New finding (not in the original 10), for 6.5 to fix or Andrew to waive:** Add a venue's Confirm doesn't carry the
   rate the partner was quoted. If an admin's swap lands after the partner opened Review & pay but before Confirm, the
   context read already sees the new Price, so the post-claim check passes and the card is charged the new rate.
   Suggested fix: the client sends the quote's price id (or `thisVenueCents`) and `startVenueAddition` refuses
   `quote_changed` (409, re-quote) on mismatch. It touches `lib/addVenueFlow.ts` + `AddVenueReviewStep`, so it's
   outside 6.1's scope.

### 8. Recommended first steps for Phase 6.2 (Opus 5.5, high)

1. Read plan §5 "Phase 6.2" and this note. `git status` should match §2 above.
2. Read `billRateFromPrice` in `lib/venuePricing.ts` and `customPriceLookupKey` in `lib/billingCustomPrice.ts`. Move
   the prefix literal to `CUSTOM_PER_VENUE_LOOKUP_PREFIX` only.
3. Wire `custom_rate` into `checkAddableSubscription` (`lib/venueAddition.ts`) and `checkChangeableSubscription`
   (`lib/venueRemoval.ts`). Both run on the context read and again after the claim, so one change covers both paths.
4. `Promise.all` in `lib/billingQuantityDrift.ts`.
5. Read-only Stripe listing of live subscription items (Price id + lookup key) before shipping.
6. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (sequentially), then restore
   `next-env.d.ts`. Write `docs/multi-venue-volume-billing-plan_PHASE_6.2_HANDOFF.md` and update the plan status line.
