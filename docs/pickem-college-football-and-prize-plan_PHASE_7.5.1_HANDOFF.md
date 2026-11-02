# Pick 'Em plan — Phase 7.5.1 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** the admin "settle this game" action no longer adds points to a player's total itself. It marks the
  picks right or wrong, then pays through the same once-only payment the automatic grading uses. Before, every win it
  settled would have been paid twice (20 points instead of 10) as soon as the new code went live.
- Picks scored against the spread are left for automatic grading (a winning team alone can't grade them); the action
  now says how many it left.
- **Production check (read-only, 2026-11-02 01:50 UTC):** 0 picks look like the old admin action already paid them, so
  there is nothing to fix in the data and nothing needs your OK. (13 NFL wins from today are waiting for payment; the
  first automatic run after the deploy pays them 10 each, once — that is expected.)
- **Not live:** code only, uncommitted, not deployed (main is frozen). No database change.
- **Left before deploy:** 7.5.2. Then 7.5.3–7.5.5, the 7.6 re-review, and your phone pass.

## For the next agent

### 1. Next phase: 7.5.2 (Opus 5.5 · high)
Spec in `docs/pickem-college-football-and-prize-plan.md` "### Phase 7.5.2": F14 (keyset-page the pending read, cap 6
pages), F15 (a player's own `settlePendingPickEmPicks({ userId })` pays only when it graded a win), F19 (`newlyWonPointsOf`
shows "+10" only once `userPickRewardClaimedAt` goes null → set). Out of scope: 7.5.3 (prize save lease, migration),
7.5.4, 7.5.5, F7.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated Category Blitz work). Everything from Phases 1–7.5.1 is
  uncommitted on top. Main frozen during App Store review: never push `main`, never `supabase db push`, never change
  Production env.
- All Pick 'Em migrations up to `20261101153306` (7.1c) are applied. 7.5.1 added none.
- No data was written. The only production access was the read-only report below.

### 3. Decisions
- Plan spec followed. Two small additions, both mine: an NFL pick at a venue whose scoring rule can't be read is counted
  separately (`scoringModeUnresolvedLeft`), not folded into `spreadPicksLeft`; and a failed payment is returned as
  `payoutError` rather than thrown (grades are kept; the every-minute cron pays them).
- The plan said "the admin panel shows the count in its success line": **no admin UI calls `resource: "pickem-settle"`**
  (grep of `components/` and `app/` finds only the API route), so there was nothing to change. The JSON result carries
  the new fields.
- `affectedPicks` now means "picks this call graded" (winners + losers), counting only rows the conditional update
  actually changed — if the cron graded one in between, it isn't counted.

### 4. Files
- `lib/admin.ts` — `settleAdminPickEmGame` rewritten; new exported type `AdminPickEmSettleResult`;
  `PickEmPendingPickRow` now selects `venue_id, sport_slug, sport_key, selected_team_id, scoring_mode`. New imports:
  `COLLEGE_FOOTBALL_SPORT_KEY`, `payPickEmPoints` + `PICKEM_POINTS_PER_CORRECT_PICK`, `chunkIds`,
  `getVenueNFLPickEmScoringMode`. Flow: read pending picks of the game → read each NFL venue's rule
  (`Promise.allSettled`) → group gradeable picks by (won/lost, NFL `standard` stamp) → one conditional update per group
  per 150-id chunk (`.eq("status","pending").select("id")`) → one global `payPickEmPoints()`.
- `app/api/admin/route.ts` — unchanged (passes `result` through).
- `tests/admin.pickem-settle.test.ts` (new) — in-memory Supabase mock whose `pay_pickem_points` honours the stamp:
  paid exactly once across admin call + `settlePendingPickEmPicks()`; spread / unreadable-rule picks stay pending;
  payment failure keeps grades; non-pending picks untouched. Asserts zero `users` writes.
- `tests/pickem-automatic-points-contract.test.ts` — new case: `settleAdminPickEmGame`'s body has no `.from("users")`,
  writes no `reward_claimed_at`, calls `payPickEmPoints(` exactly once.
- `scripts/pickem-unpaid-points-report.cjs` — new `alreadyCreditedByAdminSettle` block (won, unpaid, `home_score` null,
  `scoring_mode` null, graded since `2026-10-30T18:29:14Z` = 24 h before the payment migration). Upper bound: a
  cron-graded pick with no provider score looks the same.
- Plan status line, 7.5.1 table row and section; CLAUDE.md Pick 'Em bullet.

### 5. Facts and traps
- `lib/admin.ts` still has a `users.points` read-then-write in the **predictions** legacy fallback (~line 4620) — not
  Pick 'Em, out of scope; the contract scan is scoped to `settleAdminPickEmGame` for that reason.
- College picks are stamped with their rule when made (`scoring_mode` `spread`/`standard`); NFL picks only at
  settlement — hence the per-venue read.
- `npm run test` currently has 4 failures, all Sports Bingo star-index "snapshot is stale" date tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), unrelated to Pick 'Em.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npx eslint` on the four touched files clean.
- `npx vitest run tests/admin.pickem-settle.test.ts tests/pickem-automatic-points-contract.test.ts` pass; 85 pickem/admin/
  prize test files pass (945 tests); full suite 6,016 pass / 4 fail (above) / 13 skipped.
- `npm run pickem:unpaid-report` (read-only, needs `.env.local`): `alreadyCreditedByAdminSettle.picks = 0`.
- Unverified: a real admin call against production (none should be made from dev — shared DB).

### 7. Open questions
None.

### 8. Recommended first steps for 7.5.2
Read `settlePendingPickEmPicks` in `lib/pickem.ts` (the `readPending` / 7.4 stale-cancel block and the two
`payPickEmPoints({ userId })` calls — the contract test pins exactly 2 of those, so update it when F15 changes them), then
`newlyWonPointsOf` in `components/pickem/PickEmGameList.tsx` and `tests/pickem-today-win-points.test.ts`. The
`tests/lib.pickem-stale-pending.test.ts` mock already honours order + limit and is a good base for the paging test.
