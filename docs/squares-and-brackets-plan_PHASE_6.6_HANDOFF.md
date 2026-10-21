# Squares + Brackets plan — Phase 6.6 handoff (re-review of Squares 6.1–6.5)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 6 "6.6" and 6.6.1–6.6.4, findings §29).

## For Andrew (plain English)

- **What happened:** a fresh code review of the five Squares fixes (6.1–6.5 part 1). It found 9 possible problems.
  I checked each one: 6 are real, 3 were false alarms or matters of style. No code was changed. Each real problem
  now has a planned fix (6.6.1–6.6.4), following your no-quick-patches rule.
- **The one that matters most (6.6.1):** if the December test game (the 6.7 rehearsal) isn't archived before
  Feb 1, it would quietly block the real Super Bowl board at every bar. Today only a note in the plan prevents this.
  The fix makes the system clear away a leftover test game by itself when the Super Bowl window opens. The same fix
  stops last year's Super Bowl from blocking next year's.
- **The rest are small:** a player's phone could keep re-loading the finished board every 5 seconds after an
  unlucky timing of a correction (6.6.2); a payment that fails late isn't retried automatically, and a test game
  could give real points if a hidden test bar were made public mid-test (6.6.3); two tidy-ups (6.6.4).
- **Is anything live?** No. Squares is still switched off and no Squares game exists yet. This step changed
  documents only, and nothing was committed, pushed or deployed.
- **Needs you:** nothing for 6.6. Thursday evening (Oct 22, about 8 PM to midnight ET), keep the Mac on, plugged
  in, with the lid open, for 6.5 part 2's recording (already running).

## For the next agent

### 1. Next phase
**6.6.1** (Opus 5.5 · medium), **6.6.2** (Sonnet 5.5 · low), **6.6.3** (Opus 5.5 · medium), **6.6.4** (Sonnet 5.5 ·
low). The design for each is in the plan under its heading, and the findings are in §29. All four must be done before
the 6.7 rehearsal. 6.6.1 and 6.6.3 both edit `tick` in `lib/squaresSettlement.ts`, so do them one after the other.
6.6.2 and 6.6.4 are independent. 6.5 part 2 (replay the Oct 22 NE @ CHI capture, see the 6.5 handoff §8) can go
before or after them. Out of scope: flags, deploys, the 6.7 rehearsal, brackets.

### 2. Starting state
- Branch `main`. The last commit is `3d88939` (6.5 part 1), which is NOT pushed (`origin/main` = `4facaac`).
- 6.6 changed docs only and nothing is committed: `docs/squares-and-brackets-plan.md` (status line, the "Next" line,
  Phase 6 table rows 6.6–6.6.4, the 6.6 section plus four new sub-phase sections, new §29), `CLAUDE.md` (one
  sentence on the "Phase 6 review" bullet), and this file.
- Uncommitted work that is NOT ours (never commit it with Squares work): the POS hunk in `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the deleted
  `design-system/project/public/info/*.png` and the untracked `design-system/project/public/info/New Folder With Items/`.
  When committing, stage `CLAUDE.md` hunk by hunk (`git add -p`).
- Data: untouched. No migration was written. There are no Squares events in production. `NEXT_PUBLIC_SQUARES_ENABLED`
  and `SQUARES_REHEARSAL_ENABLED` are set in no Vercel environment.
- Recorder PID 10302 (capture `1392309`) is still waiting for kickoff at 2026-10-23T00:15Z. Don't kill it.

### 3. Decisions
- Review method: the `code-review` skill at `high` over the five commits. Each finding was then checked by reading
  the code (results in §29's "Checked" column).
- **S3 rejected:** the committed fixture `tests/fixtures/squares/nfl-postseason-2025.json` is the feed's whole 2025
  postseason (13 games). Exactly one game in it is inter-conference (id 1341307, week 5, NE vs SEA), and there is no
  Pro Bowl. Don't add a `week === 5` check unless a future feed shows a second AFC-vs-NFC postseason game.
- **S7 rejected (style):** filtering inside `listActiveRankedPlaceCampaigns` would change a shared reader for no
  behaviour gain. The contract test covers every file that pays.
- **6.6.1 auto-archives**, rather than only warning: a stale event in season mode can only be a rehearsal (hidden
  venues only) or a closed season's game. It happens in season mode only, never in rehearsal mode. The admin
  `create_from_game` also refuses a rehearsal in season mode, so the cron never archives one that was made on purpose.
- **6.6.3 S5 retries hourly**, not every minute: this keeps 6.3's cost win (3 reads/hour vs 3/minute) and still
  retries.
- **6.6.3 S6 reuses the 6.3 "blocked" mechanism** (note + `credit_blocked_at`) instead of silently skipping. The admin
  sees the rows, and Archive isn't held up.

### 4. Files the fixes will touch
- 6.6.1: `lib/squares.ts` (new `isStaleSquaresEvent`), `lib/squaresSettlement.ts` (`tick`, around the
  `getCurrentSquaresEvent` branch ~line 125), `lib/squaresAdmin.ts` (`squaresArchiveRefusal` ~line 143; the
  `create_from_game` branch ~line 269; the admin log helper `logSquaresAdmin`), tests `tests/squares-settlement.test.ts`,
  `tests/squares-engine.test.ts`; plan 6.9 wording.
- 6.6.2: `components/squares/useSquaresData.ts` (the `phase === "complete"` branch ~line 152), `tests/squares-screen.test.ts`.
- 6.6.3: `lib/squaresSettlement.ts` (`idleReason` call site ~line 145; `payUnpaidSquaresResults` ~line 427),
  `lib/squaresPrizeAwards.ts` (the hidden-venues read: make it a shared export; comments at ~24, ~84, ~112),
  `tests/squares-settlement.test.ts`, `tests/lib.squares-prize-awards.test.ts`.
- 6.6.4: `lib/liveTriviaRankedRewards.ts` (~lines 140–155), `lib/squaresAdmin.ts` (`countRows`, `countBlockedResults`,
  overview blocked select ~line 203).

### 5. Facts and traps
- `squares_events_one_current` is a unique index over non-archived rows, so exactly one current event exists.
  `getCurrentSquaresEvent` relies on it (`.limit(1).maybeSingle()`).
- A rehearsal event's `season` is the feed game's season (`feed.value.season ?? squaresSeason()` in
  `lib/squaresAdmin.ts`). A December 2026 rehearsal therefore has season 2026, the same as `squaresSeason()`. That is
  why the stale predicate must check `purpose` as well as `season`.
- `squaresSeason()` comes from `SEASONAL_GAME_WINDOWS.squares.opensOn` (year − 1), so it changes when Phase 11 rolls
  the window forward.
- Results have no `venue_id`. A result's venue comes through `board_id → squares_boards.venue_id` (the prize path
  already reads it that way).
- `useSquaresData`'s `fetchBoard` counts as a score read (`lastScoreAtRef`). Keep that in mind when you write the
  6.6.2 cadence test.
- The settlement tests mock `supabaseAdmin` as a chain. Add the new query shapes (the guarded archive update, the
  `squares_boards!inner` embed) to the mock.
- zsh: quote globs in `grep --include='*.ts'`. Don't run `tsc` and `build` at the same time.

### 6. Build / test
Nothing was run in 6.6 (docs only). The last full run (6.5 part 1, 2026-10-21) was: `npx tsc --noEmit` clean,
`npx eslint` clean on the changed files, `npm run test` 5,232 passed / 13 skipped. For each 6.6.x fix run those three,
plus `npm run test:squares-sql` if any SQL is touched (none is planned).

### 7. Open questions for Andrew
None.

### 8. Recommended first steps
1. Read plan §29 and the 6.6.1 section, then `tick` in `lib/squaresSettlement.ts` and `squaresArchiveRefusal` in
   `lib/squaresAdmin.ts`.
2. Write the four 6.6.1 settlement tests first; they should fail on today's code.
3. After each sub-phase: update its plan section with "Built …", the status line and the Phase 6 table row, and write
   `docs/squares-and-brackets-plan_PHASE_6.6.<N>_HANDOFF.md`.
