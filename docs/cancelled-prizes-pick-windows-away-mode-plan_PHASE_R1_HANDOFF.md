# Phase R1 handoff: pay what's owed before a schedule changes (2026-11-09)

## For Andrew (plain English)

- **What changed:** when a partner (or admin) cancels, edits or moves a Live Trivia game, we now pay that bar's prizes
  **first**, while the game and its answers still exist. Then we change the game. Before this, the cancel deleted the answers
  first, so a weekly 1st/2nd/3rd prize cancelled mid-week never paid the nights already played.
- **Your defaults are built:** a weekly places prize ended mid-week is paid on the nights already played (Q5). If that payment
  fails on our side, the cancel is refused with "Couldn't pay this game's prizes first. Try again." Nothing is deleted, so
  trying again is safe (Q6).
- **It's cheaper too:** the payout check now looks at the one bar being changed, not every bar on the platform.
- **Live?** No. Like A2–B4, it is code and tests only: uncommitted and not deployed. It waits for Phase R's review and release.
- **Needs you:** nothing for R1. Next is R2 (the line a player sees on a Pick 'Em pick).

## For the next agent

### 1. Next phase: R2, and what is out of scope

R2 = "The line on a player's pick is the line it's graded by" (plan §7, Phase R2, review finding 2). Read its spec in
`docs/cancelled-prizes-pick-windows-away-mode-plan.md` and the Pick 'Em plan's "Standing rules" first. Out of scope for R2:
`settlePendingPickEmPicks`, `pay_pickem_points`, and anything R1 touched. Q7 (cancelling one of two schedules mid-week still
drops the cancelled schedule's played night, because its answers are deleted) remains out of scope for every R phase.

### 2. Starting state

- Branch `main`, last commit `40d47492` (not mine). **Nothing committed, pushed or deployed**: R1 sits inside the held A2–B4
  change set (Andrew, 2026-11-09: hold everything for Phase R). Don't commit or deploy before Phase R.
- No migration, no env var, no data change, no script run. The three unapplied migrations from C3/B1/B3 are unchanged.
- No production data was read or written in R1.

### 3. Decisions already made (don't re-ask)

- Q5 = yes (close the week early on the nights played). Q6 = refuse the change. Both were the plan's defaults and Andrew said
  "go with all of your default recommendations" (2026-11-09).
- My departures from the spec, each recorded in the plan's R1 "Built" note:
  1. A refusal also covers a game-winner / places prize the change only **shrinks**, not just one it ends. A pinned
     game-winner prize losing its Thursday game loses that game's payout the same way.
  2. A weekly places prize the sweep would never pay (`rewardDefinitionId` isn't `live_trivia_challenge`, or
     `rankedRewardConfigError` is non-null; only admin-edited rows) **owes nothing**. It doesn't block the change and gets no
     early close. Without this, one broken row would block that bar's cancels forever, or the early close would pay a prize
     the sweep never owns.
  3. Log tags are `[RankedReward] week-closed-early` and `[RewardCascade] schedule-change-refused`. The spec said
     `[rewards] …`, but `tests/prizes-wording-contract.test.ts` refuses any new string containing "rewards".
  4. `deleteAdminLiveShowdownSchedule` now throws when its `venue_id` read fails. Before, it deleted anyway with no venue, so
     nothing could be settled.
  5. If the dry run itself can't read the prizes, or rule 4's schedule read fails for a places/winner prize, the change is
     refused. We can't tell that it owes nothing.

### 4. Files changed

- `lib/rewardGameSlotCascade.ts`:
  - New `settleVenueBeforeScheduleChange({ venueId, scheduleId, change, nowMs })`. It runs (a) the dry run via `runCascade`,
    (b) the venue-scoped sweeps, and (c) `closeRankedWeekEarly`, and returns `{ settledCampaignIds }`.
  - New `ScheduleChangeSettlementError`, `isScheduleChangeSettlementError`, `SCHEDULE_CHANGE_SETTLEMENT_MESSAGE`, the
    `PendingScheduleChange` type and the `scopeBlocks` helper. Error scopes are matched against the venue's schedule ids read
    **before** the change, plus `scheduleId` itself.
  - `settleBeforeRetiring` is **deleted**. `ScheduleChangeParams` and `cascadeScheduleChangeToRewards` gain
    `settledCampaignIds`.
  - Rule 4 retires a game_winner / ranked_places prize only if it is in that set. Otherwise the report gets the error "Not
    retired: its payout wasn't confirmed before the change." Points targets retire as before.
  - The header comment has a new "SETTLE BEFORE THE CHANGE" section.
- `lib/liveShowdownAdmin.ts`:
  - New `cancelChange()`, `venueChangesForEdit(...)` (the one per-venue list, used by the A3 preview and the settle) and
    `settleBeforeScheduleChange(scheduleId, venues)`.
  - Delete: venue read → settle → delete questions → delete answers → delete schedule → cascade.
  - Update: existing-row read → settle (new venue first, then the venue it left on a move) → questions/schedule writes → cascade.
    The legacy-columns path passes `settledCampaignIds` too.
  - `previewLiveShowdownScheduleChange` now loops over `venueChangesForEdit`. The result is the same.
- `lib/liveTriviaWinnerRewards.ts`: `resolveGameWinnerRewards(nowMs, scope?)` and a new `PayoutSweepScope` type. With no scope,
  `findEndedOccurrences(nowMs)` is called exactly as before.
- `lib/liveShowdownEngine.ts`: `findEndedOccurrences(nowMs, lookbackMs?, venueIds?)`. With venues it reads through
  `loadLiveTriviaSchedulesForVenues`; without, it uses `loadScheduleRows()` as before.
- `lib/challengeCampaigns.ts`: `listActiveRankedPlaceCampaigns(venueIds?)` adds `.overlaps("venue_ids", …)` only when given venues.
- `lib/liveTriviaRankedRewards.ts`:
  - `resolveRankedPlaceRewards(nowMs, scope?)`.
  - New `settleRankedWeek`: the one ranking + `awardRankedCyclePlaces` path, now used by the sweep loop as well.
  - New `planEarlyCloseRankedWeek` (pure): the current week's games with `endMs ≤ now`, under D8.
  - New `closeRankedWeekEarly({ campaign, schedules, nowMs })`: reads settlements first, then pays and logs. It returns
    `nothing_played` / `already_settled` / the RPC status, and throws on failure.
- `app/api/owner/schedule/[id]/route.ts` (DELETE + PATCH) and `app/api/admin/route.ts` (DELETE + POST catch blocks): a refusal
  returns 409 with the message. The owner sheet (`ScheduleGameFlow.cancelGame` / save) and the admin single delete already show
  `reply.error`, so no UI change was needed. Caveat: admin **bulk** delete (`SchedulesSection.bulkDelete`) ignores non-ok replies
  (pre-existing). A refused row simply stays in the list after the refetch.
- Tests:
  - `tests/lib.reward-cascade-no-games-left.test.ts`: rule-4 tests rewritten for "nothing is paid after the write", plus the
    "settleVenueBeforeScheduleChange" block (13 cases, including the finding's Tue + Thu scenario) and an admin-409 source check.
  - New `tests/lib.live-showdown-schedule-change-order.test.ts`: a fake Supabase that logs writes, asserting settle → deletes →
    cascade for a cancel, an edit and a move, and no write on a refusal.
  - `tests/lib.live-trivia-ranked-rewards.test.ts`: the "closeRankedWeekEarly" block on the real week planner, including "the
    cron never pays that week twice" and the scoped/unscoped prize read.
  - `tests/lib.live-trivia-winner-rewards.test.ts`: scoped vs unscoped `findEndedOccurrences`.
  - `tests/api.cron.resolve-live-trivia-winners.test.ts`: the cron's game-winner call has no scope argument.
  - `tests/api.owner.schedule.test.ts`: DELETE and PATCH answer 409.
  - `tests/prize-sweep-ownership-contract.test.ts`: the regex now allows `listActiveRankedPlaceCampaigns(scope?.venueIds)`.
- Docs: the plan's status line, the R1 "Built" note, the cost row "as built", the A2 standing rule (its "settle, then retire"
  sentence is superseded) and a new R1 standing rule.

### 5. Facts and traps

- **Import cycle:** `lib/liveShowdownAdmin.ts` imports `lib/rewardGameSlotCascade.ts` statically. The cascade imports
  `liveShowdownAdmin`, `liveShowdownEngine`, `liveTriviaWinnerRewards` and `liveTriviaRankedRewards` only via dynamic `import()`
  (plus `import type`). Keep it that way. The cascade tests mock those modules by path, so a new export the cascade uses must
  be added to each test's `vi.mock` factory. This is why `isLiveTriviaRankedCampaign` / `rankedRewardConfigError` appear in
  the mock in `tests/lib.reward-cascade-no-games-left.test.ts`.
- `.next/types/` contains Finder duplicates (`routes.d 2.ts`, `app 2`, `app 3`, `validator 2.ts`, `package 2.json`) that make
  `npx tsc --noEmit` print TS2300/TS2717 errors. They are not from this work. Filter them with
  `npx tsc --noEmit 2>&1 | grep -v "routes.d 2.ts"`. Deleting them is safe, but I left them for Andrew.
- If the delete fails **after** a week was closed early, the week stays closed with the nights played so far. That is accepted
  by the spec, and the log line `[RankedReward] week-closed-early` records it.
- A game in progress at cancel time (started, not ended) is not counted in an early close. Its answers go with the cancel.

### 6. Build, run, test

- `npm run test` (final run, after every change): **516 files passed, 1 skipped; 6,760 tests passed, 13 skipped.**
- `npx tsc --noEmit` (filtered as above) is clean. `npx eslint` on every touched file is clean.
- I did not run `npm run build`: no route or config shape changed, and Phase R builds. No browser test, because there is no UI
  change.
- **Unverified:** the `.overlaps("venue_ids", …)` filter against the real database. It is the same PostgREST `ov` operator
  `listChallengeCampaigns` uses as `venue_ids.ov.{…}`. Phase R can confirm it with one read-only call:
  `listActiveRankedPlaceCampaigns(["<a venue id with a places prize>"])`.

### 7. Open questions for Andrew

None new. Q7 (keeping played history when one of two schedules is cancelled) is still "a separate plan, if you want it".

### 8. Recommended first steps for R2

Model **Opus 5.5, high effort** (from the plan's table: points path, both Pick 'Em engines must match settlement).
1. Read the R2 spec and `docs/pickem-college-football-and-prize-plan.md` "Standing rules".
2. Read `lib/pickemFrozenLines.ts`, `applyCollegeSpreadLines` in `lib/pickem.ts` (around line 2142) and the overlay in
   `listNFLPickEmGames` (`lib/nflPickEm.ts`, around lines 1369 and 1448).
3. Add `lineShownForGame`, switch both lists to it, add the tests and the contract line, then run
   `npm run test:pickem-frozen-lines-sql`.
4. Write `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R2_HANDOFF.md` and update the plan's status line.
