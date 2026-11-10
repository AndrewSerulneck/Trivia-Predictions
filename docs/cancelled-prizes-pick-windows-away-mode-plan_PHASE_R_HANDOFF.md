# Phase R handoff: second review done, release not started (2026-11-10)

> **Update (2026-11-10, later): release is paused.** A third `/code-review` (high) found 8 more problems. The plan now has
> remedial phases R7–R10 (§7 of `docs/cancelled-prizes-pick-windows-away-mode-plan.md`). R7 is done
> (`…_PHASE_R7_HANDOFF.md`); continue with R8, not the release steps below. Sections 2–6 still describe the starting state accurately. Section 8's first steps apply only after R10.

## For Andrew (plain English)

- **What changed:** the second code review of all the held work (A2–B4 + R1–R6) is done, and the issues worth fixing now are
  fixed:
  1. Changing or cancelling a Live Trivia game now pays out every weekly-places and game-winner prize at that bar first, not
     only the prizes the change ends. Cancelling deletes that game's answers, so a game that had just ended could otherwise go unpaid.
  2. "Your bars" and opening a bar view-only now work for players with accounts. Before, opening any bar wiped the account id
     these features check, so the list came back empty. They now check the player id instead (your choice).
  3. A pick refused because the game's window has passed now says "Picks closed." It no longer says "Picks open Mon…" (your choice).
  4. The cancel warning can no longer show the wrong game's warning, or leave "Yes, cancel game" stuck, when you switch games quickly.
- **Live?** No. Nothing is committed, deployed or migrated.
- **Needs you:** a go-ahead to apply the 3 database migrations to production (`supabase db push`). After that comes commit and
  deploy.

## For the next agent

**1. Goal and scope.** Finish Phase R (plan §7 "Phase R: Review + release"): with Andrew's go-ahead, `supabase db push` the
three held migrations, commit the held change set, deploy, then add the CLAUDE.md Feature-rules row (doc
`docs/cancelled-prizes-pick-windows-away-mode-plan.md`, rule most often broken: "Pay before a schedule changes:
`settleVenueBeforeScheduleChange`; pick windows only via `lib/pickemPickWindowGate.ts`") and update `SYSTEM_CONTEXT.md` §7/§8.
Out of scope: the four deferred findings below, and Q7 (schedules keeping played history).

**2. Starting state.** Branch `main`, last commit `40d47492`. All of A2–B4 + R1–R6 + this phase's fixes are uncommitted (about 72
modified + 70 untracked files; `git status`). Not deployed. Unapplied migrations: `20261109214742_push_game_reminder_optins.sql`
(C3), `20261109223743_pickem_pick_windows.sql` (B1), `20261110014242_pickem_venue_frozen_lines.sql` (B3). No production data
was touched in this phase. `output/` and `assets/app-store/*-2026-11-09/` are untracked and unrelated: don't commit them
with this work unless Andrew says so.

**3. Decisions (Andrew, 2026-11-10).**
- "Your bars" / view-only open: match the browser's **player id** (`tp:user-id`) against the signed session, not the account
  id. The reviewer's other option (re-save the account id after `navigateToResolvedVenue`'s clear) was rejected because it
  would change the join path in `handleSelectVenue` and what passkey setup sends.
- A closed window whose game can no longer be picked refuses with **"Picks closed."**

**4. Files changed in this phase.**
- `lib/rewardGameSlotCascade.ts` `settleVenueBeforeScheduleChange`: sweeps run for every active places/winner prize at the
  venue (`atVenue`). `settledCampaignIds` still holds only the prizes the change ends or shrinks (`affected`). A sweep error
  blocks an ending prize if it is on any of the venue's games (`venueScheduleIds`), and a still-running prize only if it is on
  the changed game (`changedScheduleIds`). The previous session made this change; this session fixed its docstring and test.
- `lib/playerVenues.ts` `readSessionUser(sessionUserId, claimedUserId)`: returns null unless `claimedUserId === sessionUserId`.
  Wire field is now `userId` (GET query `?userId=`, POST body `{ venueId, userId }`) in `app/api/player/venues/route.ts` and
  `app/api/player/venues/open/route.ts`. `components/join/JoinFlow.tsx` sends `getUserId()`; `accountId` dropped from those two
  hooks' deps.
- `lib/pickemPickWindowGate.ts` `assertPickEmPickWindowOpen`: refusal = `${pickWindowViewForGame(...).line}.`.
  `pickWindowClosedMessage` deleted from `lib/pickemPickWindow.ts`.
- From the review's own `--fix`: `components/owner/schedule/ScheduleGameFlow.tsx` `startCancel` ignores stale responses
  (`cancelImpactRequestRef`); `app/api/trivia/live/calendar/route.ts` uses `isScheduleId` from `lib/gameReminderOptIns.ts`.
- Tests: `tests/lib.reward-cascade-no-games-left.test.ts` (the old "ends nothing → no sweep" test replaced by two tests),
  `tests/api.player-venues.test.ts`, `tests/away-mode-contract.test.ts`, `tests/api.pickem-pick-window-gate.test.ts` (now covers
  both refusal wordings), `tests/lib.pickem-college-spreads.test.ts`, `tests/pickem-prize-tiebreaker.test.ts`,
  `tests/lib.pickem-pick-window.test.ts`.
- Plan doc: status line and Standing rules C1, B1, R1 updated.

**5. Traps.**
- `npm run lint` reports 309 errors, all in the git-ignored `tmp/group-games-phase-4/`. Lint the change set with
  `{ git diff --name-only; git ls-files --others --exclude-standard; } | grep -E '\.(ts|tsx)$' | grep -v '^output/' | tr '\n' '\0' | xargs -0 npx eslint`
  (zsh doesn't word-split `$files`).
- `hardClearAuthAndCachePreserveVenue` clears `tp:account-id`, and nothing re-saves it after a bar opens. This was true before
  this plan. Any new feature must not depend on `getAccountId()` after a venue open.
- `npx tsc --noEmit` prints a known error for the Finder duplicate `.next/types/routes.d 2.ts`. Ignore it.

**6. Verified (2026-11-10).** `npm run test`: 517 files passed, 1 skipped; 6788 tests passed, 13 skipped. `npx tsc --noEmit`
is clean (apart from the duplicate above). eslint on the 112 changed and new TS files is clean. `npm run build` succeeds.
`npm run test:push-sql`, `test:pickem-frozen-lines-sql`, `test:pickem-lines-sql` and `test:pickem-points-sql` pass.
`npm run test:god-mode-join` passes (59 tests).
Not verified: a browser run of "Your bars" or away open after the user-id change. Do a scratchpad Playwright check if time allows.

**7. Deferred review findings (not blocking, Andrew to decide whether to plan them).**
- `lib/venueGameSettings.ts` ~194: saving pick windows reads, merges in the app, then upserts. An owner and an admin saving
  different sports for the same bar at the same moment can drop one save. Fix = an atomic jsonb-merge RPC (new migration).
- `lib/nflPickEm.ts` ~1755 `nflFrozenLineColumnsForPick` re-reads the game line that `listNFLPickEmGames` already loaded: one
  extra small read per NFL pick at bars with a window and spreads on.
- `lib/venueGameSettings.ts` ~161 `getVenueCollegeFootballPickEmScoringMode` has no production callers; only 4 test mocks use it.

**8. First steps.** Ask Andrew for the `supabase db push` go-ahead (3 migrations above). Then run `/verify` and commit the held
set (exclude `output/` and the app-store screenshot folders), deploy, and do the CLAUDE.md and SYSTEM_CONTEXT.md updates. Model:
Opus 5.5 / high (plan table).
