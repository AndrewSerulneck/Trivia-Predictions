# Phase R7 handoff: schedule changes pay after the write, from one read (2026-11-10)

## For Andrew (plain English)

- **What changed:** when you cancel or change a Live Trivia game mid-week, a weekly 1st/2nd/3rd prize that ends because of it
  is still paid for the nights already played. The difference is that the payment now happens **after** the change succeeds,
  not before. Before this fix, if the change failed (for example, new questions couldn't be found when the rounds changed),
  the week was already paid on Monday alone, and Thursday's winners would get nothing.
- **Also fixed:** editing only a game's name or ads no longer runs any prize checks. A real change reads the bar's prizes and
  games once instead of three to five times, so saving is faster. An old fallback for a database layout we no longer have is
  gone. It could retire a winner prize that was never paid.
- **Your answer is recorded:** every open question takes its default (Q2, Q4–Q9). R9 and R10 will build those defaults.
- **Live?** No. Like everything since A2, it's code and tests only: uncommitted, not deployed, no database change.
- **Needs you:** nothing for R7. Next is R8 (the line saved on a Pick 'Em pick).

## For the next agent

### 1. Next phase: R8, and what is out of scope

R8 = "A pick's line is set when it's made" (plan §7, Phase R8, third review findings 1 and 3). Read its spec in
`docs/cancelled-prizes-pick-windows-away-mode-plan.md` and the Pick 'Em plan's "Standing rules"
(`docs/pickem-college-football-and-prize-plan.md`) first. Out of scope for R8: `settlePendingPickEmPicks`,
`pay_pickem_points`, and everything R7 touched (Live Trivia prizes, schedules, payout sweeps). Q7 (keeping played history
when one of two schedules is cancelled) stays out of scope for every R phase.

### 2. Starting state

- Branch `main`, last commit `40d47492`. **Nothing committed, pushed or deployed.** R7 sits inside the held A2–B4 + R1–R6 change
  set (about 140 entries in `git status --short`). Andrew's 2026-11-09 rule still applies: don't commit or deploy before Phase R.
- No migration, env var or data change in R7. The three unapplied migrations are unchanged: `20261109214742_push_game_reminder_optins.sql`,
  `20261109223743_pickem_pick_windows.sql`, `20261110014242_pickem_venue_frozen_lines.sql`.
- Production was **read** twice, both read-only, through temporary scripts that were deleted afterwards:
  1. `select recurring_type, recurring_days from trivia_schedules limit 1` succeeded, so the columns exist. That allowed the
     legacy branch to be removed.
  2. A row count per venue: 7 `trivia_schedules` rows in total, across 5 venues, with at most 3 at one venue.
- `output/` and `assets/app-store/*-2026-11-09/` are untracked and unrelated. Don't commit them with this work.

### 3. Decisions already made (don't re-ask)

- **Andrew, 2026-11-10: "our default decisions all work for me."** Q2 = 1 hour; Q4 = not now; Q5 = close the week early on the
  nights played; Q6 = refuse the change if a payout can't be confirmed; Q7 = out of scope; Q8 = one "at the bar" rule with a
  16-minute lease (R10); Q9 = keep listing "Your bars" when the location check fails (R9). Recorded in plan §8 and the status line.
- R7 choices within the spec (also in the plan's R7 "Built" note):
  1. The settle reads prizes first. If the venue has no game-winner or weekly-places prize, it returns at once, with no schedule
     read and no dry run. The old code ran a dry run there and threw the result away.
  2. All four award RPC statuses (`awarded`, `no_scorers`, `below_minimum`, `already_resolved`) count as paid. The spec's
     "`no_winner` / `already_settled`" names don't exist in the code.
  3. "The edit moves no game" means `start_time` (compared as an instant), timezone, recurrence type, days (as a set), rounds
     and venue are all unchanged. A missing stored row counts as moved, so the old behaviour is kept.

### 4. Files changed

- `lib/liveTriviaRankedRewards.ts`:
  - `closeRankedWeekEarly` is **deleted**.
  - New `rankRankedWeek` (private): totals → `rankWeekPlaces`. `settleRankedWeek` = rank + award.
  - New `planRankedWeekEarlyClose({ campaign, schedules, nowMs })`: reads the timezone, the settlements and the totals; writes
    nothing. Returns `{ outcome: "planned", plan } | { outcome: "nothing_played" } | { outcome: "already_settled", cycleStart }`.
  - New `payPlannedWeekClose(plan, now)`: calls `awardRankedCyclePlaces` and logs `[RankedReward] week-closed-early`; throws on failure.
  - New `RankedWeekClosePlan` type. It carries the campaign object, because the RPC snapshots its place prizes.
  - New `rankedPlaceCampaignsInScope`: the JS mirror of `listActiveRankedPlaceCampaigns(venueIds)`.
  - `resolveRankedPlaceRewards(nowMs, scope?: PayoutSweepScope)`: when given preloaded `campaigns` / `schedules`, it reads neither.
- `lib/liveTriviaWinnerRewards.ts`:
  - `PayoutSweepScope` gains optional `campaigns` and `schedules`.
  - New `schedulesInScope`, which filters by venue.
  - `resolveGameWinnerRewards` uses `endedOccurrencesFromRows` and the preloaded prizes when it is given them.
- `lib/liveShowdownEngine.ts`: new pure `endedOccurrencesFromRows(rows, nowMs, lookbackMs?)`. `findEndedOccurrences` now
  delegates to it, with the same behaviour.
- `lib/rewardGameSlotCascade.ts`:
  - `emptyReport` is renamed and exported as `emptyCascadeReport`.
  - `ScheduleChangeParams` and `cascadeScheduleChangeToRewards` gain `weekCloses`.
  - `runCascade(params, dryRun, preloaded?)`.
  - **Rules 1–3 guard:** in a real run, a pinned game-winner prize that isn't in `settledCampaignIds` is left alone, and the
    report gets `NOT_RETIRED_UNSETTLED_MESSAGE`.
  - Rule 4 reads preloaded rows through `venueSchedulesFromRows`. Before retiring an orphaned prize that has a plan, it pays the
    plan (`payWeekClose`). If that fails, the prize stays active and `[RankedReward] early-close-award-failed` is logged with
    the venue, cycle start, places, user ids and points.
  - `settleVenueBeforeScheduleChange` returns a `ScheduleChangeSettlement` (`{ settledCampaignIds, weekCloses }`) and pays no
    early close. The header comment has a new "PAY THE EARLY CLOSE AFTER THE WRITE" section.
- `lib/liveShowdownAdmin.ts`:
  - New exports: `venueSchedulesFromRows` (the JS mirror of `listVenueLiveShowdownSchedules`'s SQL) and `scheduleEditMovesGames`.
  - New `SCHEDULE_TIMING_COLUMNS` / `ScheduleTimingRow`.
  - `settleBeforeScheduleChange` merges both sets across venues.
  - `updateAdminLiveShowdownSchedule` runs in this order: timing read → `cascadeInputs` (computed once) → question matrix (only
    if the rounds changed) → settle (only if a game moved) → question writes → update → cascade (only if it settled).
    The legacy no-recurrence-columns branch is deleted.
  - `deleteAdminLiveShowdownSchedule` spreads the settlement into its cascade call.
  - `previewLiveShowdownScheduleChange` reads the timing columns and returns an empty preview for an edit that moves no game.
- Tests:
  - `tests/lib.live-trivia-ranked-rewards.test.ts`: the new "planRankedWeekEarlyClose + payPlannedWeekClose" block.
  - `tests/lib.reward-cascade-no-games-left.test.ts`: the settle block is rewritten. It covers call order, a failed award, a
    plan that is dropped, read counts and the 24-hour filter. Its `liveShowdownAdmin` mock now uses the real
    `venueSchedulesFromRows`, through `importOriginal`, with `supabaseAdmin` and `liveTriviaBroadcast` mocked.
  - `tests/lib.live-showdown-schedule-change-order.test.ts`: a rename, timing changes, the matrix built before the settle, a
    failed delete, the preview, the no-legacy contract and the helper units.
  - `tests/lib.reward-slot-cascade.test.ts`: wraps the cascade with every prize settled, and adds an "R7" unsettled test.
  - `tests/lib.live-trivia-winner-rewards.test.ts`: the preloaded-rows test.
  - `tests/prize-sweep-ownership-contract.test.ts`: the regex follows the new `listed` shape. The ownership filter is unchanged.
- Docs: the plan's status line, the R7 "Built" note, standing rule R1 (rewritten for R7), and the §8 answer.

### 5. Facts and traps

- **Import cycle (unchanged):** `liveShowdownAdmin.ts` imports the cascade statically. The cascade reaches
  `liveShowdownAdmin`, `liveShowdownEngine`, `liveTriviaWinnerRewards` and `liveTriviaRankedRewards` only through `import()`.
  - Don't destructure two exports from a lazy import when only one is used. Vitest's factory mocks throw on access to a missing
    export, which is why rule 4 calls `admin.venueSchedulesFromRows` / `admin.listVenueLiveShowdownSchedules` directly.
  - `liveTriviaRankedRewards.ts` now imports `schedulesInScope` / `PayoutSweepScope` from `liveTriviaWinnerRewards.ts`. The
    winner module doesn't import the ranked one, so there is no cycle.
- **Accepted trade-off (from the spec):** if the award fails after a **delete**, that week's played nights can only be paid by
  hand, because the answers are gone. The `early-close-award-failed` log line has everything needed.
- **Settle vs real run disagreeing is safe in one direction.** The settle's schedules come from `loadLiveTriviaSchedulesForVenues`:
  200 rows per venue, newest first, with no SQL one-off filter. If a venue ever had more than 200 rows, the dry run could miss
  a row and think a prize ends when it doesn't. The real run would then keep the prize and drop the plan, and the cron pays
  the week. That costs nothing. The reverse can't happen, because the real run's filtered read sees at least as many live rows.
  Production has 7 rows in total.
- The rules 1–3 guard means **any** future caller of `applyScheduleChangeToGameWinnerRewards` / `cascadeScheduleChangeToRewards`
  without `settledCampaignIds` changes no game-winner prize. Today every call is in `lib/liveShowdownAdmin.ts`, after the settle.
- `.next/types/` Finder duplicates (`routes.d 2.ts`, etc.) still make `npx tsc --noEmit` print TS2300/TS2717. Filter them with
  `grep -v "routes.d 2.ts"`.
- `npm run lint` still reports 309 errors from the git-ignored `tmp/group-games-phase-4/`. Lint only the changed files.

### 6. Build, run, test

- `npm run test`: **517 files passed, 1 skipped; 6,816 tests passed, 13 skipped** (final run, after every change).
- `npx tsc --noEmit` (filtered as above): clean.
- `npx eslint` on the 5 changed lib files and 6 changed test files: clean.
- Not run: `npm run build` (Andrew's dev server shares `.next`, no route or config shape changed, and Phase R builds) and the SQL
  proofs (no SQL changed). No browser test, because nothing on screen changed.
- **Unverified:** a real end-to-end cancel against the database. Every step is mocked at the database edge. Phase R's review
  should read `settleVenueBeforeScheduleChange` → `retireLiveTriviaPrizesWithNoGamesLeft` → `payPlannedWeekClose` as one path.

### 7. Open questions for Andrew

None. All §8 questions are answered (defaults).

### 8. Recommended first steps for R8

Model **Opus 5.5, high effort** (plan table: points path; both Pick 'Em engines must match settlement).
1. Read the R8 spec, standing rules B3 and R2 in this plan, and the Pick 'Em plan's "Standing rules".
2. College: in `lib/pickem.ts`, find `resolvePickScoringMode` and the side-switch update (search for `...lineColumns`, around
   line 2280). Run the frozen-line step only when there is no existing pick, and never spread line columns into an update.
3. NFL: in `lib/nflPickEm.ts`, move `nflFrozenLineColumnsForPick` (around line 1681/1755) after the existing-pick read, for
   inserts only. Then add the failed-settings fallback: `frozenLineForPick` with `globalLine: null`; found = record it; none =
   no line; lookup failed = `PICKEM_FROZEN_LINE_FAILED_MESSAGE`.
4. Add the tests and the contract line from the spec. Run `npm run test`, `npm run test:pickem-frozen-lines-sql` and
   `npm run test:pickem-lines-sql`.
5. Write `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R8_HANDOFF.md`, update the plan's status line, and update
   standing rules B3 ("insert and side switch" becomes "insert only") and R2.
