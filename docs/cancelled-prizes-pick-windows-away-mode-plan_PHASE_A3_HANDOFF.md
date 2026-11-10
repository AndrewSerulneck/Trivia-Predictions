# Phase A3 handoff: warn before cancelling or editing a game

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase A3 was done on 2026-11-09 by Claude Opus 5.5. The plan's table
names Opus 5.5 at medium effort for this phase, which matches.

## For Andrew (plain English)

- **What changed:** when a partner taps **Cancel game** on a Live Trivia game, the confirmation box now adds one line if any
  prize would end, for example "Also ends: Live Trivia Challenge." **Yes, cancel game** waits a moment until that check is
  back, so a quick tap can't skip the warning. Editing a game does the same thing on the Review screen: "Also ends: …" and/or
  "Covers fewer games: …". When nothing would change, no line appears. Admin works the same way: the Delete pop-up and a
  pop-up before saving an edit show the same line.
- **The check changes nothing.** It is a "what if" run of the same rules that a real cancel uses. It saves nothing and pays
  nothing.
- **Checked on your live data (read-only):** cancelling Carrabba's East Brunswick or Garden State Bar's game would say
  "Also ends: Live Trivia Challenge." Cancelling Riverside's game shows nothing, because its prizes count several games.
  The line uses each prize's name as it appears in your Prizes list, so a prize still called "Live Trivia Challenge"
  shows that name.
- **Is it live?** No. A2 and A3 are **not committed or deployed**. They ship with Phase R, or sooner if you ask.
- **Noted:** you said `VENUE_PRESENCE_ENFORCEMENT` is `1` (on) in Production, Preview and Development. Phase C1 uses this.

## For the next agent (Phase C1: away mode, view-only bar)

### 1. Next phase goal and scope
Phase C1 per the plan §7: a signed-in player who has a profile at the bar but isn't there gets a view-only **Venue Home**
instead of the blocking overlay. It shows upcoming games, prizes, the leaderboard and Directions, and game buttons read "Play
at the bar" and open nothing. Game screens keep today's overlay. Nothing that writes changes. Read the standing rules in
`docs/join-flow-location-error-plan.md` and `docs/native-app-store-plan.md` first.
Out of scope: Q3 ("Your bars" list), pushes (C2), Remind me (C3), and every B phase.

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new is committed, pushed or deployed.
- **Uncommitted, A2** (see `…_PHASE_A2_HANDOFF.md` §2): `lib/liveTriviaScheduleSlots.ts` (new),
  `tests/lib.reward-cascade-no-games-left.test.ts` (new), `lib/rewardGameSlotCascade.ts`, `lib/rewards.ts`,
  `lib/liveShowdownAdmin.ts`, `tests/lib.reward-slot-cascade.test.ts`, the A2 handoff.
- **Uncommitted, A3:**
  - new `app/api/owner/schedule/[id]/cancel-impact/route.ts`
  - new `tests/lib.reward-cascade-dry-run.test.ts` (13 tests), new `tests/api.owner-schedule-cancel-impact.test.ts` (6 tests)
  - modified `lib/rewardGameSlotCascade.ts`, `lib/liveShowdownAdmin.ts`, `lib/ownerSchedule.ts`, `app/api/admin/route.ts`,
    `components/owner/schedule/ScheduleGameFlow.tsx`, `components/owner/schedule/ScheduleStepScreens.tsx`,
    `components/admin/sections/SchedulesSection.tsx`, `tests/components.owner-schedule-flow.test.ts`
  - modified plan doc (status line + A3 standing rule) and this handoff.
- Not mine, leave alone: `assets/app-store/google-play-screenshots-2026-11-09/`, `assets/app-store/venue-home-screenshots-2026-11-09/`,
  `output/`.
- No data changed, no migration, no new env var. The production check was select-only.

### 3. Decisions already made
- Plan D1–D5, §4 defaults, Phase 0 P1–P4, the A1 and A2 standing rules.
- **Andrew, 2026-11-09:** `VENUE_PRESENCE_ENFORCEMENT = 1` in Production, Preview and Development. So the server-side presence
  checks (`maybeRequireActiveVenuePresence`, about 10 mutation routes) **are enforced in production**. C1's "nothing that writes
  changes" is therefore already backed by the server, but C1 must not loosen any of those checks. The plan's C1 contract test
  ("the 10 presence-checked routes still check") still applies.
- A3 choices made in this phase:
  - **One code path.** `applyScheduleChangeToGameWinnerRewards` and the new `previewScheduleChangeToRewards` both call
    `runCascade(params, dryRun)`. In a dry run, every campaign write goes through a no-op `write`, rule 4 returns its
    would-be retirements **before** `settleBeforeRetiring` (no payout sweeps), and the schedule list is simulated.
  - **The warning names prizes** (`campaign.name`, the title the partner's Prizes list shows). Retirements from all rules go
    under "ending"; rule 1's partial loss goes under "shrinking".
  - A rule 4 retirement that the real run might hold back (payout unconfirmed) is still listed. The warning errs toward
    telling the partner.
  - Copy (minimal): "Also ends: A, B." and "Covers fewer games: C." It comes from `describeScheduleChangePreview` only.
  - **The client fails open.** Any error means no line, and cancelling still works. "Yes, cancel game" is disabled only while
    the check runs.
  - **Edits:** one GET route name covers both cases, as the plan named it. `GET` previews a cancel, and `POST` (same body as
    `PATCH /api/owner/schedule/[id]`) previews an edit. Admin uses one GET resource; adding the PATCH fields as query
    params turns it into an edit preview.
  - Admin **bulk** delete got no warning (each schedule's preview ignores the others being deleted with it). Single delete
    and edit have it.

### 4. Files and how they fit
- `lib/rewardGameSlotCascade.ts`: new exports `ScheduleChangeParams`, `DryRunScheduleChange`, `ScheduleChangePreview`,
  `previewScheduleChangeToRewards`, `mergeScheduleChangePreviews`, `describeScheduleChangePreview`, `simulateScheduleChange`.
  The private `runCascade` holds rules 1–4. `retireLiveTriviaPrizesWithNoGamesLeft` now takes `scheduleId` and `dryRun`.
  `simulateScheduleChange` drops the changed row. If the change keeps it at this venue, it re-adds the edited form, merged
  over the stored row, or built from the edit when the read didn't return it (an old one-off).
- `lib/liveShowdownAdmin.ts`: `normalizeScheduleRecurringType` and `editCascadeInputs` were extracted from
  `updateAdminLiveShowdownSchedule`, which now uses them, so the edit and its preview compute the same `survivingWeekdays` and
  `survivingRecurrence`. New `previewLiveShowdownScheduleChange({ scheduleId, edit | null })`: one `venue_id` read, then a
  dry run per venue. A move to another venue runs it twice, as the real edit does.
- `lib/ownerSchedule.ts`: `previewOwnerScheduleChangeNotice(schedule, edit?)`. It returns null for Category Blitz and
  normalizes an edit with `normalizeOwnerRecurrence`, as `updateOwnerSchedule` does.
- `app/api/owner/schedule/[id]/cancel-impact/route.ts`: `requireOwnerAuth` → `getOwnerSchedule` (404) → `ownsVenue` (403) →
  preview. Returns `{ ok, notice }`.
- `app/api/admin/route.ts` GET `resource=live-showdown-schedule-impact&id=…[&targetDate&startTime&timezone&recurringType&recurringDays=csv&numRounds&venueId]`.
- `components/owner/schedule/ScheduleGameFlow.tsx`: `fetchImpactNotice`, `startCancel` (fired by the Cancel game tap), and an
  effect that re-checks the edit warning on Review, keyed on the request body without the title, so renaming doesn't refetch.
  The rose line renders above `ShareDetailsPanel` on Review.
  `ScheduleStepScreens.tsx` `GameDetailScreen` has new props: `onStartCancel`, `impactNotice`, `checkingImpact`.
- `components/admin/sections/SchedulesSection.tsx`: `scheduleImpactNotice` feeds the `confirm()` text for single delete
  and edit save.

### 5. Facts and traps
- To run repo TS that imports `server-only` from a scratchpad script, stub it with a preload file:
  `NODE_OPTIONS="--require <scratchpad>/stub-server-only.cjs" node --env-file=.env.local node_modules/.bin/tsx --tsconfig tsconfig.json <file>.mts`.
  The stub sets `require.cache[require.resolve("server-only")] = { exports: {} }`. `--conditions=react-server` did **not** work.
- In production, prize names are often the definition default ("Live Trivia Challenge"), so the warning can read generically.
  That is by design (it matches the partner's Prizes list title).
- `npx tsc --noEmit` reports errors only under `.next/` (Finder duplicates); filter with `grep -v "^\.next/"`.
- `tests/components.owner-schedule-flow.test.ts`: `scheduleCalls()` now excludes `/cancel-impact`, and `routeFetch(notice, reply)`
  answers the two kinds of call differently.
- Cost: cancel opens one GET (owner schedule lookup + one `venue_id` read + the venue's campaigns + one schedule read only
  when a rule 4 candidate exists). An edit adds one POST each time its timing changes on Review. That is a few calls per
  partner edit, so negligible, as plan §6 says.

### 6. Build / run / test
- `npx vitest run tests/lib.reward-cascade-dry-run.test.ts tests/lib.reward-cascade-no-games-left.test.ts tests/lib.reward-slot-cascade.test.ts tests/api.owner-schedule-cancel-impact.test.ts tests/components.owner-schedule-flow.test.ts`
- Full: `npm run test` → **497 files passed, 1 skipped; 6,558 tests passed, 13 skipped** (2026-11-09).
- `npx tsc --noEmit` clean outside `.next/`; `npx eslint` on every changed file clean.
- Production dry run (select-only; script was
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/9b139eba-6879-43d4-873f-d07043a259f6/scratchpad/a3-preview-check.mts`):
  cancel `ee97f951-…` (Carrabba's) → "Also ends: Live Trivia Challenge."; cancel `78a0e374-…` (Garden State Bar) → same;
  cancel `fda23d4e-…` (Riverside) → null.
- **Not done:** a 350 px browser check. The line is a plain wrapping `<p>` (`text-sm`, no truncate/nowrap) inside the
  existing full-width confirmation box, so it wraps rather than overflowing, but no browser screenshot was taken. Also not
  done: `npm run build` (Andrew's dev server owns `.next`; Phase R runs it).

### 7. Open questions for Andrew
- Commit/deploy A2 + A3 now, or with Phase R?
- Plan Q1–Q4 are still open. Only Q1 blocks anything (B3). Q3 ("Your bars" list) is a possible small add-on to C1, off by default.

### 8. Recommended first steps for Phase C1 (Opus 5.5, high effort)
1. Read `components/venue/VenuePresenceBoundary.tsx`, `docs/join-flow-location-error-plan.md` and
   `docs/native-app-store-plan.md` (standing rules), and the Phase 0 handoff's walk of the away path.
2. List the routes that call `maybeRequireActiveVenuePresence` and pin them in a contract test before changing anything.
3. Build view-only mode on Venue Home only. Every game screen keeps its overlay.
