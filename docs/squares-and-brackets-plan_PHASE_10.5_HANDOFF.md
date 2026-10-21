# Squares + Brackets plan — Phase 10.5 handoff (re-review of 10.1–10.4)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 10 "10.5" and 10.5.1–10.5.4, findings §22).

## For Andrew (plain English)

- **What happened:** a fresh code review of the four bracket fixes (10.1–10.4). It found 10 possible problems. I
  checked each one against the code: 9 are real, 1 was a false alarm. Nothing in the code was changed. Each real
  problem now has a planned fix (10.5.1–10.5.4), following your no-quick-patches rule.
- **The one that matters most (10.5.1):** if an admin sets a bracket's lock time and the feed later shows the first
  game starting earlier, the admin can't pull the lock back once that game has tipped. Picks stay open while games
  are played. The fix lets the admin move the lock earlier, never later.
- **The rest are small:** the championship final score can be lost after a rare timing overlap, and a winner can be
  chosen that contradicts the score (10.5.2, needs one small database update from you); the bar TV ignores a test-clock
  change for up to 10 minutes (10.5.3, test tournaments only); a refused save can be sent twice (10.5.4).
- **Is anything live?** No. Brackets are off, there's no tournament until Mar 14, 2027, and nothing was committed,
  pushed or deployed.
- **Needs you:**
  1. `supabase db push` for 10.1's migration `20261021035254` (still pending), and later for 10.5.2's migration.
  2. Commit / push / deploy 10.2, 10.3, 10.4 whenever you choose (still uncommitted).
  3. One question (below, §7): in that late-lock window a player can even pick games that are already over. Keep
     those picks (recommended; the fix makes the window short), or also block picks for games that have started
     (a bigger database change)?

## For the next agent

### 1. Next phase
**10.5.1** (Opus 5.5 · medium), then 10.5.2 (Opus 5.5 · medium), 10.5.3 (Sonnet 5.5 · low), 10.5.4 (Sonnet 5.5 · low).
Design for each is in the plan under its heading; findings in §22. All four before the 10.6 rehearsal. 10.5.1 and
10.5.2 both edit `lib/bracketsAdmin.ts` and `lib/bracketsSync.ts`: do them in sequence. Out of scope: Squares (6.5 waits
on the Oct 19/22 NFL captures), flags, applying migrations, deploying, the 10.6 rehearsal itself.

### 2. Starting state
- Branch `main`, last commit `9f9de25` (10.1). **10.2, 10.3, 10.4 are still uncommitted** in the working tree (I did not
  commit; not asked). 10.5 changed docs only: `docs/squares-and-brackets-plan.md` (status line, Phase 10 table rows
  10.5–10.5.4, the 10.5 heading and four new sub-phase sections, §22), `CLAUDE.md` (one sentence on the "Phase 10
  review" bullet), and this file. To commit 10.2 / 10.4 separately, see the 10.4 handoff §2 (hunk-by-hunk staging).
- Other people's uncommitted work — never commit with brackets work: `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the POS hunk in `CLAUDE.md`, the deleted
  `design-system/project/public/info/*.png` + untracked `New Folder With Items/`,
  `tests/fixtures/squares/nfl-live-capture-1392308.json`.
- Data: untouched. Migration `20261021035254` (10.1) still NOT applied. No migration written in 10.5.

### 3. Decisions
- Review method: the `code-review` skill at `high` over 10.1 + the working tree; each finding then checked by reading
  the code (results in §22's "Checked" column).
- **R6 rejected** (score-only entry setting `result_source = 'admin'`): `mergeOne` (`lib/brackets/games.ts`) never
  changes a stored winner whatever its source, and `feedWinnerSide` decides only with both scores, so a feed-decided
  final always has a score. Don't reopen it.
- **10.5.2's migration is a new file** (`create or replace bracket_save_feed_games`), even though `20261021035254` isn't
  applied yet: CLAUDE.md forbids editing existing migration files.
- **R8: the tab-hide save keeps waiting** behind the send in flight (an unordered keepalive could be overwritten by the
  older save landing second). Recorded as accepted in 10.5.4.
- **R10 is optional** (style only).

### 4. Files that the fixes will touch
- 10.5.1: `lib/bracketsAdmin.ts` (`lockMoveRefusal`, `kindHasStarted`, `bracketProblems` copy), `lib/bracketsSync.ts`
  (`moveLock` warn ~line 324; optionally `payBracketRounds` ~line 196), tests `tests/brackets-*.test.ts`.
- 10.5.2: new migration under `supabase/migrations/`, `scripts/test-brackets-sql.cjs`, `lib/bracketsAdmin.ts`
  (override branch ~lines 540–600), `lib/bracketsSync.ts` (total ~line 313), a shared total helper (suggested in
  `lib/bracketsStore.ts`), `components/admin/sections/BracketsSection.tsx` (`scoresGiven` ~line 59),
  `tests/brackets-contract.test.ts`.
- 10.5.3: `lib/bracketsTvRead.ts` (`venueCache` type, `getBracketTvPayload`), `tests/bracket-tv.test.ts`.
- 10.5.4: `components/bracket/BracketEditor.tsx` (`persist`), `tests/bracket-screen.test.ts`.

### 5. Traps
- `bracket_save_entry` closes entries only on `lock_at` (database clock minus the rehearsal offset), never on tips —
  that is why R1 matters. Moving a lock into the past closes entries at once.
- `bracket_record_results` sets `championship_total = p_championship_total` unconditionally (both the Phase 7 and the
  10.1 versions): any caller passing null clears it.
- `tests/bracket-tv.test.ts` mocks `supabaseAdmin` as a chain; 10.5.3 shouldn't need new query shapes.
- Contract tests from 10.4 forbid new `picksOf =` / `seatList =` and any `lock… + …clockOffset` outside
  `lib/bracketsStore.ts`.
- Don't run `tsc` and `build` at the same time.

### 6. Build / test
Nothing was run in 10.5 (docs only). Last full run (10.4, 2026-10-21): `npx tsc --noEmit` clean, `npm run lint` clean,
`npm run test` 5,216 passed / 13 skipped, replay 6,411 feed requests with unchanged totals. Each 10.5.x fix: the same
three commands, plus `npm run test:brackets-sql` for 10.5.2.

### 7. Open questions for Andrew
- **10.5.1:** when an admin pulls a late lock earlier after the first tip, picks saved between that tip and the
  corrected lock stay saved as designed. Checked 2026-10-21: `bracket_save_entry` does NOT refuse a pick for a game
  already decided (`bracket_picks_problem` uses `winner_seats` only as the second-chance base), so in that window a
  player could pick winners of finished games. Options: (a) keep them (rare, admin-caused; the fix shortens the window);
  (b) also refuse, in the save RPC, any changed pick whose game has tipped (new migration, a bigger change to the only
  entry writer). Recommended: (a) for 10.5.1, and ask Andrew whether he wants (b) as its own sub-phase.

### 8. Recommended first steps
1. Ask Andrew whether to commit 10.2–10.4 first (separately, see the 10.4 handoff §2), then start 10.5.1.
2. Ask Andrew §7's question (a or b).
3. 10.5.1 (Opus 5.5 · medium): read `lockMoveRefusal` and the plan's 10.5.1 design; write the tests first.
