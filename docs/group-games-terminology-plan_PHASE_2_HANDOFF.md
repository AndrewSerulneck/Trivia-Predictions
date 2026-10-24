# Group Games terminology — Phase 2 handoff

## For Andrew

The Partner Dashboard now says **Active Group Games** and **Active Prizes** in local code.
The schedule sheet says **Group Games**, and creation says **Schedule a group game**.
The longer dashboard heading can wrap. All 255 focused tests pass. Nothing is committed,
pushed or deployed. Phase 3 must update the other surfaces; Phase 4 must finish review and
rendered responsive checks. No answer is needed from you.

## To the next agent

### 1. Next goal and scope

Execute Phase 3 of `docs/group-games-terminology-plan.md` when requested, using the decisions
in `docs/group-games-terminology-inventory.md`. Recommended model **GPT-6.1 Sol
(`gpt-6.1-sol`), Medium effort**. Update admin/player/push/manual/email/marketing and living
documentation as inventoried. Preserve game names, timing statuses, internal identifiers,
routes, filters, push audiences/preferences, and user-authored/stored/historical content.
Do not deploy a partial rename. Phase 4 owns full gates, responsive review and release preparation.
No database operations, sending messages/emails/pushes, paid generation, native binary or
external store listing publication belongs to this work.

### 2. Starting state and publication/data state

Recorded 2026-10-24. Branch `main`; HEAD remains
`bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`. Phase 2 made no commit, staging, push, merge,
deployment or remote status check. All changes remain local. No production read/write,
migration, backup or data undo log; rollback consists of reverting only the scoped local edits.
No environment secrets were read. No new assets or dependencies were generated/installed.

The extensive pre-existing dirty tree is listed exactly in
`docs/group-games-terminology-plan_PHASE_1_HANDOFF.md` §2; it was unchanged by this phase.
In particular preserve dirty `CLAUDE.md`, `app/info/page.tsx`, dashboard host, owner menu,
`lib/ownerSheetParams.ts`, partner-message work and trivia JSON. Do not stage/deploy the root
wholesale. Every application/test file listed in §4 below was clean at Phase 2 entry; its current
diff is Phase 2-owned. The plan/inventory/earlier handoffs are still untracked. This handoff is new.

### 3. Decisions already made

Andrew authorized Phase 2 execution and detailed handoff notes, not publishing or later phases.
His exact requested headings are implemented. “Active” keeps upcoming schedules and active
prizes, including the existing three-row limit; it does not mean only in-progress games.
Group Games means Live Trivia and Category Blitz, without adding membership or changing behavior.
Keep individual game names. Schedule all/history/detail uses Group Games; creation uses Schedule
a group game; editing remains Edit game. Prize sheet still uses Prizes / Offer a prize.
Offer a prize, Create Prize and Schedule another game remain action language.
Keep `?sheet=schedule`, `?sheet=prizes` and permanent `?sheet=rewards` alias.
The manual's teaching heading Offer Prizes stays, but its dashboard instruction must become
Tap Active Prizes on your dashboard in Phase 3. No developer question is pending.

### 4. Files changed and how they fit

Application edits:

- `components/owner/dashboard/LiveGamesSection.tsx`: heading Active Group Games; add/empty
  Schedule a group game; skeleton Loading group games. `splitSchedules(...).upcoming`,
  `DASHBOARD_LIST_LIMIT`, row mapping and every callback are untouched.
- `components/owner/dashboard/RewardsSection.tsx`: heading Active Prizes only;
  `splitCompetitions(...).active` and actions untouched.
- `components/owner/dashboard/DashboardSectionCard.tsx`: removed `truncate` from shared h2,
  retaining `ht-h2 min-w-0 flex-1`; natural whitespace permits wrapping. Header icon and add
  button retain `shrink-0`, button remains 44 px. No typography/color token changes.
- `components/owner/schedule/ScheduleGameFlow.tsx`: title expression updated as described
  above; comment now names Group Games. No state, request, navigation or saving change.
- `components/owner/schedule/ScheduleGameRow.tsx`,
  `components/owner/schedule/ScheduleStepScreens.tsx`, `lib/ownerScheduleDisplay.ts`:
  umbrella references in comments only; runtime logic untouched.

Existing test copy updated:

- `tests/owner-dashboard-contract.test.ts`: empty-state assertion only. Manual's old
  dashboard instruction assertion intentionally remains for Phase 3.
- `tests/app.owner-dashboard-one-round-trip.test.ts`: both section region names and loading
  label; all request/seed/retry/refetch expectations preserved.
- `tests/app.owner-dashboard-merch.test.ts`: readiness heading locator Active Prizes.
- `tests/components.owner-sheet.test.ts` and
  `tests/__snapshots__/components.owner-sheet.test.ts.snap`: synthetic title Schedule a group
  game; exactly three snapshot title replacements, structural markup unchanged.
- `docs/group-games-terminology-plan.md`: status, owner/publication note, Phase 2 result and
  handoff link. This handoff completes the phase record.

### 5. Facts, traps and permissions

No remaining old umbrella matches exist under `components/owner/dashboard` or
`components/owner/schedule`. Wider copy intentionally still differs until Phase 3.
Source inspection of edit/history/detail, confirmations/errors found no additional obsolete
umbrella copy requiring change. Keep backend error behavior and game-specific wording.
The shared h2 uses `.ht-h2` in `app/globals.css` (existing display font, line-height 1.1,
letter-spacing 0.02em); removing Tailwind truncate removes nowrap/ellipsis/overflow-hidden.
No global styling was changed.

A local Playwright Chromium launch for a synthetic header layout failed **before navigation**:
`bootstrap_check_in … MachPortRendezvousServer … Permission denied (1100)`.
This matches Phase 1's sandbox limitation. No escalation/automatic-approval rejection occurred.
No viewport metrics or screenshots were obtained. Source wrapping review is complete; do not
claim rendered 350/390/1280 px or physical-device checks passed. Finish real/stubbed UI checks
in a browser-capable environment in Phase 4, without scheduling real games or creating prizes.
Local dev shares production data. The synthetic browser attempt made no app/network request.

### 6. Verification and exact commands

Run from `/Users/andrewserulneck/Documents/Trivia-Predictions` with installed dependencies:

```sh
npx --no-install vitest run tests/owner-dashboard-contract.test.ts tests/app.owner-dashboard-one-round-trip.test.ts tests/app.owner-dashboard-merch.test.ts tests/components.owner-schedule-flow.test.ts tests/lib.owner-schedule-form.test.ts tests/lib.owner-schedule-display.test.ts tests/api.owner.schedule.test.ts tests/components.partner-manual-prizes.test.ts tests/lib.email.welcomeEmail.test.ts tests/lib.email.venueAddedEmail.test.ts tests/push-notifications-contract.test.ts tests/lib.push.test.ts tests/components.owner-sheet.test.ts
```

Result: **13 suites / 255 tests passed, zero failures/skips**, duration 3.46 s.
Existing JSDOM `Not implemented: Window's scrollTo() method` warnings persist; exit 0.
This covers seed/one-round-trip, retry, venue switch, scheduling, sheet chrome and merch behavior.
No new tests merely mirroring copy were added. Reviewed full scoped diff: strings/comments and
one CSS utility removal only. Three snapshots pass without other markup changes.

```sh
rg -n -i 'live games?|group games?|offer prizes' components/owner/schedule components/owner/dashboard
```

Result: only new Group Games wording/comments; no old umbrella labels in those directories.
Full test/typecheck/lint/build gates are deferred to Phase 4 per plan, not claimed here.
Email preview is Phase 3; Phase 2 did not regenerate or send emails.

Cost estimate remains **zero incremental database reads/writes, provider calls, jobs, retries or
fan-out per load/run/day/month**, at current and 10× traffic. Text-only payload differences are
immaterial; no asset bandwidth change. Request-count tests pass. Nothing released, so no live
usage/performance comparison is available.

### 7. Open questions

None blocking Phase 3. Publication is separate and not authorized by this execution request.
Rendered responsive checks remain open for Phase 4 due to the launch limitation above.

### 8. Recommended first steps

1. Read project rules, plan, reviewed inventory and this handoff; confirm HEAD/status.
2. Implement Phase 3 rows while preserving unrelated dirty work. Start with manual and its
   dashboard assertion, shared email copy, push label and Category Blitz player label.
3. Keep push welcome's specific Live Trivia delivery promise; do not broaden it to Category Blitz.
4. Preview local email HTML/text without sending; run affected tests. Update living docs with
   glossary (Group Games umbrella; Live Trivia individual game; internal live names stable).
5. Write `docs/group-games-terminology-plan_PHASE_3_HANDOFF.md` and update plan status before
   reporting completion. Next Phase 4 recommendation is GPT-6.1 Sol / High effort.
