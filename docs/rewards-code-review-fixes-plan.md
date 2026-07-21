# Rewards System — Code Review Fixes Plan

> **Status:** Planning. No code written yet.
> **Source:** `/code-review high` pass over the Rewards branch (post Phase 1–7 of
> `docs/rewards-system-plan.md`). 6 findings, ranked most-severe first.
> **Created:** 2026-07-20

## Findings being addressed

1. **[Correctness]** `listChallengeCampaignWinsForUser` compares a Postgres
   timestamptz string to `new Date(0).toISOString()` to detect one-time-reward
   epoch rows — the same string-vs-instant bug already fixed in
   `getCurrentCycleWinnerState`, but missed here. One-time-reward coupons show a
   bogus "Week of Jan 1, 1970" and claim keys diverge from the actual row.
   (`lib/challengeCampaigns.ts:1881`)
2. **[Reliability]** `awardCycleWinner` mints the redemption coupon and
   notification in a separate call *after* the atomic RPC commits — a crash or
   transient failure between the two leaves a ledgered winner with no coupon and
   no automatic recovery path. (`lib/challengeCampaigns.ts:1582`)
3. **[Correctness/Security]** The `award_cycle_winner` advisory-lock key hashes
   `p_cycle_start::text`, whose rendering depends on the session's `TimeZone`
   GUC. Two connections with different session timezones could take different
   locks for the *same* cycle and both pass the count check, over-awarding past
   `winner_quota`. (`supabase/migrations/20260720130000_rewards_multi_winner.sql:70`)
4. **[Correctness]** A weekly reward whose resolved `scheduleDays` ends up empty
   expands with `activeDays: []`; `computeCycleStart` then silently returns the
   epoch for every "weekly" cycle, so the quota never resets — the reward
   quietly behaves like a one-time reward instead of failing loudly.
   (`lib/rewards.ts:290`)
5. **[Correctness — defensive default]** The panel's `quotaRemaining` fallback
   (`challenge.winnerUserId ? 0 : 1`) is wrong for recurring rewards, whose
   `winnerUserId` is always null — if a card ever renders without the Phase-6
   snapshot fields, a 5-winner weekly reward would show "All Claimed" after one
   winner. Currently unreachable (the snapshot always populates the field) but
   a live landmine. (`components/venue/VenueChallengesPanel.tsx:74`)
6. **[Efficiency]** `getChallengeCampaignSnapshotForUser` calls
   `getCurrentCycleWinnerState` per progress campaign, which calls
   `listChallengeCycleWinners` — a 3-query fan-out (winners + usernames +
   redemptions) that pulls the campaign's **entire historical** winner ledger
   just to filter to the current cycle in JS. Cost grows unbounded with a
   reward's cycle count and multiplies by campaign count on every venue-home
   load. (`lib/challengeCampaigns.ts:1755`)

## Phasing rationale

Findings #1 and #5 are small, isolated, mechanical fixes with no schema or
concurrency risk — ship first, fast. #4 is a validation/gating fix confined to
`lib/rewards.ts` (no DB change). #3 is a one-line SQL change but touches the
security-critical concurrency primitive, so it gets its own phase with explicit
concurrent-race test coverage. #2 is the deepest fix — per the review's
"altitude" note, the correct fix is moving redemption-row creation *into* the
same atomic RPC rather than bolting on a retry, which changes the SQL function
signature and every caller. #6 is a pure refactor (no behavior change) and is
lowest urgency, so it's last.

## Phases

| Phase | Scope | Model | Effort |
|---|---|---|---|
| **1. Fix the epoch string-compare bug + quotaRemaining fallback** | In `listChallengeCampaignWinsForUser`, replace `row.cycle_start === epochIso` with an instant comparison (`new Date(row.cycle_start).getTime() === 0`), mirroring the fix already applied in `getCurrentCycleWinnerState`. In `VenueChallengesPanel.tsx`, fix the `quotaRemaining` fallback to not assume single-winner semantics (e.g. fall back to `winnerQuota` untouched — i.e. "unknown, don't claim exhausted" — rather than inferring from `winnerUserId`). Add/extend Vitest coverage for a one-time reward's redemption epoch handling (`tests/lib.rewards-cycle-snapshot.test.ts` or a new one-time-specific case) using a real Postgres-style `"+00:00"` fixture string, not a `.toISOString()` one, so the test would have caught the original bug. | **Sonnet 5** | **Low** — mechanical, same shape as the fix already made, no schema change. |
| **2. Gate weekly-reward creation on non-empty scheduleDays** | In `lib/rewards.ts`, `resolveRewardCreationContext`: if a schedule's `recurring_type !== "none"` but `scheduleWeekdays()` resolves to `[]` for every schedule, do not offer `"weekly"` in `allowedCadences` (treat it as unscheduled/non-recurring for cadence purposes) rather than silently allowing a broken weekly reward. Add a defensive assertion in `createReward()`: if `cadence === "weekly"` and `context.scheduleDays` is empty, throw rather than expand with `activeDays: []`. Add Vitest cases for the empty-scheduleDays path (currently untested) in `tests/lib.rewards-definitions.test.ts`. | **Sonnet 5** | **Low-Medium** — needs care reading `scheduleWeekdays`/`getTimeZoneParts` to construct a correct empty-days fixture, but the fix itself is a guard clause. |
| **3. Make the advisory-lock key timezone-independent** | New additive migration replacing `award_cycle_winner`'s lock key: hash `extract(epoch from p_cycle_start)` (or pass the raw numeric epoch alongside the timestamptz) instead of `p_cycle_start::text`, so the lock key is identical regardless of session `TimeZone`. Verify no other caller relies on the old lock-key derivation. Add a Vitest/integration-style concurrency test if feasible (parallel RPC calls under different session `SET TIME ZONE` values), or at minimum a manual verification step documented in the phase's as-built notes, since Vitest can't easily fork two Postgres sessions with different GUCs — the `verify` skill or a direct `psql`/Supabase script may be needed for real coverage here. | **Opus 4.8** | **Medium** — small diff, but it's the security-critical concurrency primitive; reasoning about GUC-dependent hashing and confirming the fix doesn't break the existing quota-cap guarantee needs the extra scrutiny. |
| **4. Move redemption + notification into the atomic RPC (fix the non-atomic coupon mint)** | Extend `award_cycle_winner` (new migration, not editing the existing one) to also insert the `challenge_campaign_redemptions` row inside the same transaction as the ledger insert, using the RPC's existing advisory lock + transaction boundary, and return whatever the caller needs to fire the notification afterward (notifications are an external side effect and can reasonably stay outside the DB transaction, but should get a retry or reconciliation sweep). Update `awardCycleWinner()` in `lib/challengeCampaigns.ts` to stop double-writing the redemption row and instead just handle the notification (with a best-effort retry or a queued reconciliation check for missed notifications). Update `tests/lib.rewards-multi-winner.test.ts` to assert the redemption row is created atomically with the ledger row. | **Opus 4.8** | **High** — changes the core RPC signature/behavior, has to preserve the existing quota-cap guarantee exactly, needs careful backward-compat handling for the additive-migration convention, and touches the most safety-critical code path in the whole system (real prizes). |
| **5. Batch the multi-winner snapshot query (fix the N+1 / unbounded-history read)** | Refactor `getChallengeCampaignSnapshotForUser`'s winner-state resolution: instead of calling `listChallengeCycleWinners` (full history) once per progress campaign, either (a) add a new query that fetches only the rows matching each campaign's *current* computed `cycle_start` in one batched `IN` query, or (b) add a `cycle_start` filter parameter to the existing winners query. Preserve the exact current return shape (`viewerWon`, `winnerUsernames`, `quotaRemaining`, `prizeClaimedAt`) — this is a pure performance refactor, not a behavior change. Extend `tests/lib.rewards-cycle-snapshot.test.ts` to cover multiple campaigns with different cycle starts in one snapshot call, and add a light assertion/mock-call-count check that the query fan-out no longer scales with historical cycle count. | **Sonnet 5** | **Medium** — batching logic across the leaderboard-snapshot + cycle-winner code paths needs care not to regress the existing `attachLeaderboardSnapshotsToCampaigns` pass, but it's a contained refactor with a clear before/after contract. |

## Phase 3 — as-built notes (2026-07-20)

**Done.** New additive migration
`supabase/migrations/20260720140000_rewards_lock_key_tz_independent.sql`
`create or replace`s `award_cycle_winner` with a single change: the advisory-lock
key now hashes `p_challenge_id::text || ':' || extract(epoch from p_cycle_start)::text`
instead of `... || p_cycle_start::text`. `extract(epoch ...)` is the absolute
instant in seconds (UTC); its numeric rendering is identical on every connection
regardless of session `TimeZone`, so the same cycle always maps to the same lock.
Everything else in the function body is byte-for-byte unchanged, so the
count-then-insert quota guarantee and the signature are preserved exactly.

- **No other caller derives the lock key.** `grep` for `award_cycle_winner` /
  `pg_advisory_xact_lock` finds only the RPC definition and the single TS caller
  `awardCycleWinner()` in `lib/challengeCampaigns.ts`, which passes an ISO string
  and never touches the lock. The unique constraint
  `(challenge_id, cycle_start, winner_user_id)` is already instant-based
  (timestamptz equality compares instants, not text), so it was never affected.
- **Vitest can't cover this.** The multi-winner test's JS RPC mirror keys on the
  `cycle_start` string directly and JS is single-threaded, so it can neither
  reproduce the GUC-dependent-rendering bug nor exercise real cross-session lock
  contention. Existing tests still pass unchanged (`npm run test` 592 passed;
  `npm run test:god-mode-join` 34 passed; `npx tsc --noEmit` clean).
- **Real verification is a `psql` step to run once the migration is applied**
  (no local Docker DB available at authoring time). Two proofs:

  **VERIFIED on the live DB 2026-07-20** (migrations pushed by the user). Via the
  Supabase Management API SQL endpoint: `pg_get_functiondef(award_cycle_winner)`
  confirms the deployed body uses `extract(epoch from p_cycle_start)` (and no
  longer `p_cycle_start::text`); a lock-key comparison showed the same instant
  rendered under a UTC vs America/New_York session produces DIFFERENT old-style
  keys (`-2886246263663742413` vs `-3750580612748226553`) but IDENTICAL
  `extract(epoch)` (`1784505600` both), i.e. an identical new key — the fix holds.

  1. *Lock-key invariance* — the key is now identical across session timezones:
     ```sql
     -- Same instant, two session timezones → identical new key, differing old key.
     with t as (select '2026-07-20 00:00:00+00'::timestamptz AS ts)
     select
       set_config('TimeZone', tz, false)                                    as tz,
       ts::text                                                             as old_render,
       hashtextextended('c:' || ts::text, 0)                               as old_key,
       extract(epoch from ts)::text                                        as new_render,
       hashtextextended('c:' || extract(epoch from ts)::text, 0)           as new_key
     from t, (values ('UTC'), ('America/New_York')) v(tz);
     -- Expect: old_key differs between the two rows, new_key is identical.
     ```
  2. *No over-award across mismatched-timezone sessions* — open two `psql`
     sessions, `set time zone 'UTC'` in one and `set time zone 'America/New_York'`
     in the other, `begin` both, and have each call
     `select * from award_cycle_winner(<challenge>, '<cycle>'::timestamptz, <distinct user>, '<venue>', 600, 1, ...)`
     before either commits. Exactly one must return `won = true`; the second must
     block on the advisory lock until the first commits, then see the full count
     and return `won = false, exhausted = true`. (Before this fix the two sessions
     took different locks and both returned `won = true`.)

## Phase 4 — as-built notes (2026-07-20)

**Done.** New additive migration
`supabase/migrations/20260720150000_rewards_atomic_redemption.sql` folds the
`challenge_campaign_redemptions` coupon insert INTO `award_cycle_winner`, so it
commits in the same transaction (and under the same advisory lock) as the winner
ledger row. The old window where a crash between the RPC commit and a separate
app-side coupon upsert orphaned a winner from their coupon is closed.

- **Signature change:** one new trailing param `p_prize_expires_at timestamptz
  default null`. The migration `drop function if exists ...(8-arg)` first so
  PostgREST has a single unambiguous overload, then recreates the 9-arg version.
  It carries forward the Phase-3 tz-independent lock key unchanged. Final applied
  state (after 130000 → 140000 → 150000) is the 9-arg atomic function.
- **Prize-model-agnostic gate:** the RPC mints a redemption iff `won AND
  p_prize_expires_at IS NOT NULL`. The caller (`awardCycleWinner` in
  `lib/challengeCampaigns.ts`) computes the expiry via `campaignHasPrize(campaign)
  ? now + PRIZE_EXPIRY_MS : null` and passes it — so the RPC never needs to know
  about `prize_type` vs the newer `prize_kind` (menu_item/gift_card) model.
- **Notification is now best-effort, never throws:** new
  `notifyPrizeWinBestEffort` helper retries `createNotification` up to 3×, then
  logs and returns. Rationale: the durable coupon (read directly by
  `/redeem-prizes`) is already committed atomically, so a transient notification
  failure must not bubble up and look like the award itself failed. (Chose the
  plan's "best-effort retry" option over a reconciliation-sweep table — the coupon
  being durable makes a missed notification cosmetic, not prize-losing.)
- **Test:** `tests/lib.rewards-multi-winner.test.ts` — the fake RPC now mirrors
  the atomic coupon mint (mints the redemption in the same call, on-conflict
  deduped), and the `supabaseAdmin.from()` fake now THROWS so any regression that
  moves the redemption write back out of the RPC fails loudly. Added two cases:
  one asserting the coupon is minted in-RPC with `from` never called, one
  asserting `p_prize_expires_at` is non-null for a prize reward and null
  otherwise. `npm run test` 594 passed (+2); `npm run test:god-mode-join` 34;
  `npx tsc --noEmit` clean.
- **Out of scope (intentional):** the two OTHER redemption-mint sites —
  `finalizeClosedLeaderboardCampaigns` (~L876) and
  `finalizeClosedRecurringCycles` (~L965) — are the RETIRED leaderboard-mode
  finalization paths (single-winner, plain INSERT, not routed through
  `award_cycle_winner`). Finding #2 and this phase are scoped to `awardCycleWinner`
  per the review. Those paths remain non-atomic; since leaderboard creation is
  retired (CLAUDE.md) and they're single-winner, they were left untouched to keep
  the safety-critical diff minimal. Flagged here for a future cleanup if desired.
- **Real-DB re-verification — DONE 2026-07-20** (migrations pushed by the user).
  `pg_get_functiondef(award_cycle_winner)` on the live DB confirms the 9-arg
  signature with the `p_prize_expires_at`-gated `insert into
  challenge_campaign_redemptions`. A throwaway venue + 3 users + a prize-bearing
  progress reward (winner_quota 2) were seeded and driven through the REAL
  `awardCycleWinner()` → deployed RPC: exactly 2 winners, and the
  `challenge_campaign_redemptions` coupon set === the `challenge_cycle_winners`
  ledger set (each coupon minted BY the RPC, since the script never wrote a
  redemption row — proving atomicity), with the 3rd crosser turned away
  (`won:false, exhausted:true`). Playwright then loaded `/redeem-prizes` as the
  winner (signed `tp_sess`) and rendered "PRIZE COUPON — FREE APPETIZER … Expires
  in 7 days — Redeem" (the 7-day expiry is the RPC-set `prize_expires_at`). All
  seeded rows were deleted afterward (verified zero residual).

## Phase 5 — as-built notes (2026-07-20)

**Done.** Replaced the per-progress-campaign `getCurrentCycleWinnerState` fan-out
in `getChallengeCampaignSnapshotForUser` with a single batched resolver,
`resolveCurrentCycleWinnersForSnapshot` (`lib/challengeCampaigns.ts`).

- **Before:** each progress campaign called `getCurrentCycleWinnerState` →
  `listChallengeCycleWinners(campaign.id)`, a 3-query fan-out (winners + usernames
  + redemptions) that pulled the campaign's ENTIRE historical winner ledger just
  to filter to the current cycle in JS — cost `O(campaigns × history)` per
  venue-home load.
- **After:** compute every progress campaign's current `cycle_start` up front,
  then one batched `challenge_cycle_winners` read scoped by
  `.in("challenge_id", ids).in("cycle_start", targetIsos)` (matches by instant at
  the DB, so it never pulls prior cycles), plus one `users` lookup — **two queries
  total, independent of campaign count and history depth.** Rows are bucketed to
  their own campaign's current cycle with the same instant-comparison guard used
  throughout the file (Postgres `+00:00` vs JS `...Z`).
- **Return shape preserved exactly:** `cycleStateById` still maps campaign id →
  `{ cycleStartIso, winners: ChallengeCycleWinnerRecord[] }`, so `viewerWon`,
  `winnerUsernames`, `quotaRemaining`, and `prizeClaimedAt` are computed
  identically downstream. The batched path deliberately drops the per-winner
  `prizeRedeemedAt` sub-query (set to null) because the snapshot never reads it —
  `prizeClaimedAt` is resolved separately from redemptions by the caller.
  `attachLeaderboardSnapshotsToCampaigns` is untouched (leaderboard campaigns
  don't go through this resolver).
- `getCurrentCycleWinnerState` was removed (its only caller was the snapshot).
  `listChallengeCycleWinners` is unchanged — still used by the admin route
  (`app/api/admin/route.ts`) where full history is the intent.
- **Tests** (`tests/lib.rewards-cycle-snapshot.test.ts`): added a per-table
  `.from()` call counter to the fake Supabase, then two cases — (1) two campaigns
  with DIFFERENT cycle starts (one-time epoch + weekly) resolve correctly in one
  snapshot call while prior-cycle history is ignored (also exercises a viewer
  whose only win was a prior week → `viewerWon: false`), and (2) an assertion that
  `challenge_cycle_winners` is read **exactly once** across 3 campaigns × 10+
  historical cycles — which would fail (=3) under the old per-campaign fan-out.
  `npx tsc --noEmit` clean; `npm run test` 596 passed (+2);
  `npm run test:god-mode-join` 34 passed.
- **Note (unrelated, spotted while testing):** the pre-existing recurring
  fixtures used long day keys (`"monday"`), which `computeCycleStart`'s short-key
  `DOW` table (`"mon"`) doesn't recognize → silent epoch fallback. Real data uses
  short keys (`activeDays` comes from `scheduleWeekdays` → `getTimeZoneParts`,
  which emits `"mon"`), so production is correct; the new tests use `"mon"` to
  exercise a genuine weekly cycle. Left the old fixtures alone (out of scope).

## Suggested execution order

Phases 1 and 2 can ship immediately and independently (no cross-dependencies,
low risk). Phase 3 should land before Phase 4, since Phase 4 rewrites the same
RPC and it's simpler to reason about one SQL change at a time. Phase 5 has no
dependency on the others and can run in parallel with any of them if capacity
allows, but is lowest urgency (perf only, not correctness) and can slip last.

## Definition of done

- All 6 findings from the code review are fixed or explicitly deferred with a
  documented reason.
- `npx tsc --noEmit`, `npm run test`, `npm run test:god-mode-join` all green
  after each phase.
- Phases 3 and 4 (SQL/RPC changes) are re-verified against a real seeded
  multi-winner scenario the same way Phase 7 of the original plan was (direct
  Supabase calls + Playwright), not just unit tests with mocked RPC responses —
  mocks are exactly what let findings #1 and #3's underlying bug class ship
  undetected the first time.
