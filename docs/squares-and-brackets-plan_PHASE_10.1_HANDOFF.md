# Squares + Brackets — 10.1 handoff (admin corrections reach players and stick)

**Date:** 2026-10-21. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 10 → 10.1; findings §17 B1, B2, B3,
B8; as-built §18). **Next:** 10.2, Opus 5.5 · medium (then 10.3 and 10.4 in any order).

## For Andrew (plain English)

- **What changed:** four March Madness admin problems from the review are fixed:
  - If an admin corrects a result after the final, players' points for that round now come back within a minute.
    Before, they were taken back and never paid again.
  - Choosing "No result" on a game now **holds** it. The feed can't put its answer back until you press the new
    **Let the feed decide** button. The admin panel shows a HELD badge on that game.
  - If an admin fixes a game while the automatic sync is running, the fix now always survives. Before, the sync could
    overwrite it and then stop recording results for the whole tournament.
  - The bar TV now refreshes its standings when a correction flips a winner. Before, it could stay wrong for up to 10
    minutes.
- **Is it live?** No. Brackets are still switched off, nothing is committed (you didn't ask), and nothing is pushed or
  deployed. The new database change (migration `20261021035254`) is **not applied** yet.
- **Needs you:** one `supabase db push` for that migration, **before** this code is deployed. (If the code goes out
  first, only the admin Brackets panel breaks until the push; players see nothing because the flag is off.) Say the
  word and I'll run the push and check it.
- **Cost:** no meaningful change. The sync does one extra tiny read when a round is about to be paid, and one extra
  write only when an admin pressed something during a sync. The full replay of both 2026 tournaments still makes
  6,411 feed requests, the same as before.

---

## For the next agent

### 1. Next phase goal and scope
**10.2 — lock and final-score guards (§17 B5, B6), Opus 5.5 · medium.** The design is in plan §4 Phase 10 → 10.2:
`move_lock` refuses a lock later than the first tip of that kind's first round; `override_result` on the championship
takes optional `homeScore`/`awayScore`; a decided final with no total sets `needsAdmin` ("Enter the final score") and
slows to hourly; prizes still never settle without the total.
**Out of scope for 10.2:** 10.3 (editor saves), 10.4 (TV game filter, helper de-duplication, one-pass payment).

Things 10.2 must keep from 10.1:
- The championship override writes its game through `updateBracketGameColumns` (`lib/bracketsStore.ts`). Scores are
  **feed-owned columns** today (`bracket_save_feed_games` always writes `home_score`/`away_score`). If 10.2 lets an
  admin enter the score, the feed's next write will overwrite it with the feed's (possibly null) scores. 10.2 must
  decide how an admin score sticks. Options: a `scores_set_by` column that the RPC respects (new migration), or the
  RPC keeps a non-null stored score when the feed sends null. Record the choice.
- Any new admin action that changes results or games must end with `followUp()` (sets `next_sync_at = now`, returns
  the "within a minute" / "press Sync now" sentence). It's a closure inside `runBracketsAdminAction`.

### 2. Starting state
- Branch `main`, last commit `3273e4d` (Phase 9). Local `main` is 11 commits ahead of `origin/main` (`b5c1778`).
  Nothing pushed or deployed.
- **Uncommitted, ours (10.1 + the Phase 10 review docs before it):**
  `lib/brackets/games.ts`, `lib/bracketsStore.ts`, `lib/bracketsSync.ts`, `lib/bracketsAdmin.ts`,
  `lib/bracketsTvRead.ts`, `components/admin/sections/BracketsSection.tsx`, `scripts/test-brackets-sql.cjs`,
  `tests/brackets-sync.test.ts`, `tests/brackets-engine.test.ts`, `tests/brackets-contract.test.ts`,
  `tests/bracket-tv.test.ts`, new `supabase/migrations/20261021035254_bracket_admin_corrections.sql`,
  `docs/squares-and-brackets-plan.md` (status line, "Needs you", 10.1 heading, §17 untouched, new §18),
  `docs/squares-and-brackets-device-checklist.md` + `docs/squares-and-brackets-plan_PHASE_10_HANDOFF.md` (Phase 10
  review, uncommitted from before), this file, and two `CLAUDE.md` bullets at the end of the Squares + March Madness
  section (Phase 10 review + 10.1).
- **Uncommitted, NOT ours, leave alone:** `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, the POS/Toast hunk at the top of `CLAUDE.md`, the deleted/moved
  `design-system/project/public/info/*` images, `tests/fixtures/squares/nfl-live-capture-1392308.json` (6.5's capture).
  When committing `CLAUDE.md`, stage only the bracket hunks (`git diff CLAUDE.md` → `git apply --cached` the hunks).
- **Data:** nothing written to production. Migration `20261021035254` **not applied** (`supabase migration list` will
  show it local-only). No tournaments exist (no tournament until Mar 14, 2027).
- Squares 6.5 recorder PID 10302 (`capture-nfl-live-game.cjs 1392309`, NE @ CHI, kickoff 2026-10-23T00:15Z) is still
  running. Don't kill it.

### 3. Decisions made in 10.1 (don't re-ask)
- **RPC, not two upsert batches**, for the sync's game write: PostgREST upserts whole rows, so only a conditional
  write against the CURRENT row keeps an admin's result. Recorded in the migration header and plan §18.
- **Compare-and-set on results:** `bracket_record_results(…, p_expected_winner_seats smallint[] default null)`. The
  sync passes the seats it read at the start of the run. If they differ, the RPC answers `stale = true` and changes
  nothing; the sync stops before paying. Admin calls pass null (unchanged behaviour). The function was dropped and
  re-created in the new migration because the return type gained `stale`. Old 6-argument callers still work (the
  new argument has a default).
- **Admin writes are column-level:** `updateBracketGameColumns(tournamentId, game, patch)`, each action passing only
  its columns. `saveBracketGames` was deleted.
- **"Sync now" can't be lost:** the sync's end write (`finishBracketSyncRun`) writes `next_sync_at` only if it still
  equals what the run read (PostgREST `.eq`/`.is` filter + `.select("id")`); otherwise a second write without it.
- **Payment re-check:** `payCompleteBracketRounds` reads the stored winner seats AFTER reading the rounds (only when a
  round is due) and pays only rounds complete in them. Read order matters (comment in the code says why).
- **Hold semantics:** "No result" holds any game, including an undecided one (the panel enables Override for "No
  result" on an unheld game). `release_result` ("Let the feed decide") requires a reason (3–400 chars), works only on
  a held game, clears the hold and the note, and asks for a sync. A winner override clears a hold.
- **The override grades from a fresh games read** after its own write, so a sync fill that landed in between isn't
  cleared (and re-graded) by the admin's stale snapshot.
- Phase 9 decision unchanged: a correction after prizes are settled does NOT change prizes.

### 4. Files and functions
- `supabase/migrations/20261021035254_bracket_admin_corrections.sql`: `bracket_games.result_held` + check
  `bracket_games_held_has_no_winner`; `bracket_save_feed_games(uuid, jsonb) returns integer` (≤ 100 games; insert
  new rows with only sync-allowed values, else a conditional update per column group); `bracket_record_results` with
  `p_expected_winner_seats` / `stale`. Both functions: revoked from public/anon/authenticated, granted to service_role.
- `lib/brackets/games.ts`: `BracketGameState.resultHeld`; `emptyBracketGame` sets false; `mergeOne` never fills a held
  game (writes "…the result is held (No result) by an admin." when the feed has a final) and clears the note on a fill.
- `lib/bracketsStore.ts`: `GAME_COLUMNS` + `result_held`; `saveFeedBracketGames(tournamentId, changed, seen)`;
  `updateBracketGameColumns`; `getBracketWinnerSeats`; `finishBracketSyncRun`; `recordBracketResults` takes
  `expectedWinnerSeats` and returns `stale`.
- `lib/bracketsSync.ts`: uses the above; `isBracketSyncAutomatic(t, now)` (exported, for admin messages); stale →
  early return; pay re-check; conditional end write.
- `lib/bracketsAdmin.ts`: new action `release_result` (parse + run); `link_opener` / `set_seat_team` /
  `override_result` / `release_result` write columns only and call `followUp()`; held games listed in
  `bracketProblems`.
- `lib/bracketsTvRead.ts`: `bracketTvRevisionOf` (exported) keys on the winner seats.
- `components/admin/sections/BracketsSection.tsx`: HELD badge, "Let the feed decide" button, hold-aware Override
  enable and confirm text.

### 5. Facts and traps
- In tests, a row object from the in-memory tables is LIVE: after an admin action its fields change. Capture values
  (e.g. `const champion = game(6, 1).winner_side`) before acting. (Cost me one failing run.)
- `tests/brackets-sync.test.ts`'s fake now mirrors `bracket_save_feed_games`, the stale check and the re-grade
  (reverse/burn keys, bump `grade_no`). The real SQL is proven only by `npm run test:brackets-sql`; keep the two in
  step if either changes.
- `hooks.beforeFeedWrite` in that test runs a callback inside the next feed write: that is how the B3 race is
  reproduced. Reuse it for any future race test.
- Clearing a round-1 winner cascades nulls into every later slot that winner reached (`bracketWinnerSeats` derives
  later seats from children), so "No result" early in the bracket re-grades several rounds. The hold test uses the
  championship to keep it to one round.
- The 2027 men's final in the shifted replay ends ≈ 2027-04-06T03:20Z; `2027-04-06T15:00Z` is after both finals and
  still inside the card window.

### 6. Build, run, test (all run 2026-10-21, all passing)
- `npx tsc --noEmit` (clean), `npm run lint` (clean; the usual Babel note about `lib/sportsBingo.ts`),
  `npm run test:brackets-sql` ("all checks passed", now with a 10.1 section),
  `npx vitest run tests/brackets-*.test.ts tests/bracket-*.test.ts tests/lib.bracket-*.test.ts tests/lib.results-bracket-adapter.test.ts`
  (11 files, 162 tests), `npm run test` (428 files passed, 1 skipped; 5,202 tests passed, 13 skipped), `npm run build`
  (passes). Don't run typecheck and build at the same time.
- New tests: SQL (feed writer keeps admin winner/teams/link, never fills a held game, note follows the seen result,
  stale results); `tests/brackets-sync.test.ts` "admin corrections reach players and stick (plan 10.1)" (B1 re-pay
  after the final + "press Sync now" after the window; B2 hold/release; B3 race); `tests/brackets-engine.test.ts`
  (held game not refilled); `tests/bracket-tv.test.ts` (flipped winner re-reads entries);
  `tests/brackets-contract.test.ts` (one writer for game rows; no whole-row upserts; sync passes expected seats).
- Replay unchanged: 6,411 feed requests, same points and prize results.
- **Unverified:** the migration against the real Supabase database (only PGlite); the admin panel in a browser (HELD
  badge, button); PostgREST's handling of `p_expected_winner_seats` as a `smallint[]` named argument and of the
  `.eq("next_sync_at", <timestamp string>)` filter (both standard, but first exercised on a Preview in 10.6).

### 7. Open questions for Andrew
- `supabase db push` for `20261021035254`: when? (Before any deploy of this code.)
- Commit 10.1 locally now? (Plan: each fix gets its own commit.)

### 8. Recommended first steps for 10.2 (Opus 5.5 · medium)
1. Read plan §4 Phase 10 → 10.2, §17 B5/B6, §18 (this phase), and `lib/bracketsAdmin.ts` `move_lock` / `override_result`.
2. Decide how an admin-entered final score survives the feed write (see §1 above); new migration if needed.
3. Tests first: lock refusal at/before/after the first tip on real and rehearsal clocks; final override with scores →
   prizes settle; decided final with no total → `needsAdmin` + hourly pace.
4. Re-run the replay (6,411 requests, same totals) and `npm run test:brackets-sql`.
5. Write `docs/squares-and-brackets-plan_PHASE_10.2_HANDOFF.md` and update the plan's status line.
