# Squares + Brackets plan — Phase 10.5.1 handoff (a late admin lock can be pulled earlier)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 10 "10.5.1", findings §22 R1/R9/R10, as-built §23).

## For Andrew (plain English)

- **What changed:** if a bracket's lock time turns out to be after the first game has already tipped, an admin can now
  pull the lock earlier (closing entries), but never push it later. Pressing "Follow feed" now sets the feed's lock time
  straight away instead of waiting for the next sync (before, entries briefly showed "not open" in between). The
  "lock is after the first tip" warning in the logs is now written once instead of every 2 minutes.
- **Is it live?** No. Not committed, pushed or deployed; brackets are off; no database change.
- **What's left:** 10.5.2 (championship score), 10.5.3 (TV clock), 10.5.4 (refused save sent twice), then the 10.6
  rehearsal.
- **Needs you:**
  1. Still pending from 10.1: `supabase db push` for migration `20261021035254`.
  2. Commit / push / deploy 10.2–10.5.1 when you choose (all uncommitted).
  3. Still open (10.5 handoff §7): in the late-lock window a player can pick games already over. I built option (a):
     those picks stay (the window is now short and only happens after an admin mistake). Say if you want option (b),
     blocking picks of started games in the database, as its own step.

## For the next agent

### 1. Next phase
**10.5.2** (Opus 5.5 · medium): the championship score stays put and agrees with the winner — new migration
(`create or replace bracket_save_feed_games` with `coalesce` on scores), one shared total helper used by the sync and the
override, a 409 for a winner the stored score contradicts, the panel's "Enter both scores, or neither" hint. Design in
the plan under 10.5.2. Then 10.5.3 (Sonnet 5.5 · low) and 10.5.4 (Sonnet 5.5 · low). Out of scope: Squares, flags,
applying migrations, deploying, the 10.6 rehearsal, the §7 option (b).

### 2. Starting state
- Branch `main`, last commit `9f9de25` (10.1). 10.2, 10.3, 10.4, the 10.5 docs and 10.5.1 are all **uncommitted** in the
  working tree (not asked to commit). To commit phases separately see the 10.4 handoff §2 (hunk-by-hunk staging).
- Other people's uncommitted work — never commit with brackets work: `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the POS hunk in `CLAUDE.md`, the deleted
  `design-system/project/public/info/*.png` + untracked `New Folder With Items/`,
  `tests/fixtures/squares/nfl-live-capture-1392308.json`.
- Data: untouched. No migration in 10.5.1. Migration `20261021035254` (10.1) still NOT applied.

### 3. Decisions
- After the kind has started, a move is allowed only when its target ≤ the current lock (target = `lockAt`, or for Follow
  feed `autoBracketLocks(games)[kind]`). No current lock → refused (entries are `not_open` anyway). Moving into the past is
  allowed and closes entries at once. I did NOT also require the target ≤ the first tip after the start (the plan's test
  list allows "equal to the current lock"); the panel copy steers the admin to the first tip.
- **Follow feed now writes `autoBracketLocks(games)[kind]` immediately** (before and after the tip), set_by `auto`. Small
  addition beyond the plan's text: a null lock makes `bracket_save_entry` answer `not_open`, so the old null-until-next-
  sync write closed entries for up to a minute; after the tip it would have read as "no lock". Null is still written when
  no tips are known (same as before).
- R9: warn only when `autoBracketLocks(stored)[kind]` ≠ merged (`sameInstant`). Since an admin can't set a lock after a
  known tip (10.2 refuses it), the condition can only start from a tip change, so this is "once per tip change".
- R10 left as is: `creditSeasonalPoints` result order follows the RPC's rows, not guaranteed to match the input.
- §7 question: option (a) built (picks stay); (b) not built.

### 4. Files changed
- `lib/bracketsAdmin.ts`: `lockMoveRefusal` gains `currentLockAt` (3rd argument) and the after-start rule; `move_lock`
  passes the current lock and writes the feed's lock for Follow feed; `bracketProblems` copy.
- `lib/bracketsSync.ts`: `storedAutos` + the warn-once condition in `moveLock` (inside `syncBracketTournament`).
- `tests/brackets-contract.test.ts`: existing 10.2 test adapted to the new signature; new "after the first tip, a lock only
  moves earlier" test.
- `tests/brackets-sync.test.ts`: the 10.2 test's last step (earlier allowed, later refused); new "a late admin lock found
  after the first tip can be pulled in, and is logged once" test.
- Docs: plan status line, Phase 10 table row, 10.5.1 heading, new §23; `CLAUDE.md` bracket lock bullet (one clause).

### 5. Traps
- `lockMoveRefusal` has a new positional argument; any new caller must pass the CURRENT lock of that kind.
- `bracket_save_entry`: null lock → `not_open`; `now >= lock` → `locked` (database clock minus the rehearsal offset).
- The sync test's admin "sync" action runs `syncBracketTournament` directly (no `next_sync_at` check) — handy for
  multi-run tests.
- Don't run `tsc` and `build` at the same time.

### 6. Build / test (run 2026-10-21)
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 428 files, 5,218 passed / 13 skipped (+2 new); replay
6,411 feed requests (unchanged). `npm run build` not run (no route/page change). Not browser-tested: the admin panel only
changed one string.

### 7. Open questions for Andrew
- §7 of the 10.5 handoff: option (b) (refuse picks of started games in `bracket_save_entry`) as its own sub-phase, or not?

### 8. Recommended first steps
1. Read the plan's 10.5.2 design and §22 R2/R4/R5/R7.
2. `supabase migration new bracket_feed_scores_keep` (never edit `20261021035254`); extend `scripts/test-brackets-sql.cjs`.
3. Write the tests first, then the shared total helper in `lib/bracketsStore.ts`.
