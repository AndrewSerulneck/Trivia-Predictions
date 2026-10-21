# Squares + Brackets plan — Phase 10.2 handoff (lock and final-score guards)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 10 "10.2", as-built §19, findings §17 B5/B6).

## For Andrew (plain English)

- **What changed:** two safety checks in the bracket admin panel.
  1. An admin can no longer move a bracket's lock to a time *after* its first game tips (that would have let players
     keep changing picks while games were being played). A time at or before the first tip still saves.
  2. If the championship ends but the score feed stalls, an admin can now type the final score on the championship
     row. Prizes need that score (it's the tiebreaker), so until it's there the sync checks hourly instead of every
     2 minutes and the panel says "Enter the final score".
- **Is it live?** No. Nothing is pushed or deployed, the brackets flag is off, and no tournament exists until
  Mar 14, 2027. 10.2 is **not committed yet** (10.1 was committed locally as `9f9de25` in this session).
- **No database change** in 10.2. 10.1's migration `20261021035254` still needs your `supabase db push`.
- **What's left:** 10.3 and 10.4 (any order), then the re-review (10.5), the replay rehearsal (10.6), your phone pass
  (10.7, two new lines added to checklist section B3), launch by Mon Mar 8, 2027.

## For the next agent

### 1. Next phase: goal and scope
Next is **10.3** (bracket drafts never drop picks, `components/bracket/BracketEditor.tsx`, Sonnet 5.5 · medium) and/or
**10.4** (TV games from the chosen tournament only, one home for `bracketRealLockMs` + the picks normalizer, one-pass
round payment, Opus 5.5 · medium). Designs are in the plan §4 Phase 10. Out of scope: anything in Squares (6.5 waits
on the Oct 19/22 NFL captures), turning any flag on, applying migrations.

### 2. Starting state
- Branch `main`. Last commit `9f9de25` "feat(brackets): plan 10.1 — admin corrections reach players and stick"
  (also carries the Phase 10 review docs and `docs/squares-and-brackets-plan_PHASE_10_HANDOFF.md`). Nothing pushed.
- **10.2 is uncommitted** in the working tree: `lib/bracketsAdmin.ts`, `lib/bracketsSync.ts`, `lib/bracketsStore.ts`,
  `components/admin/sections/BracketsSection.tsx`, `tests/brackets-contract.test.ts`, `tests/brackets-sync.test.ts`,
  `docs/squares-and-brackets-plan.md`, `docs/squares-and-brackets-device-checklist.md`, `CLAUDE.md` (one bullet at the
  end of the Squares/March Madness section), and this file.
- **Other people's uncommitted work in the tree — do NOT commit it with brackets work:** `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, a POS hunk in `CLAUDE.md` (the "Toast is the
  PRIORITY" heading + paragraph), the deleted `design-system/project/public/info/*.png` files and the untracked
  `design-system/project/public/info/New Folder With Items/`, and `tests/fixtures/squares/nfl-live-capture-1392308.json`
  (Squares 6.5 capture). The 10.1 commit staged `CLAUDE.md` hunk-by-hunk to leave the POS hunk out; do the same.
- Data: none touched. No migration in 10.2. Migration `20261021035254` (10.1) NOT applied.

### 3. Decisions made (don't re-ask)
- Lock at exactly the first tip is allowed (it equals the automatic lock); later is refused; Follow feed always allowed
  before the tip. No tips known → allowed, and the sync only warns (it never moves an admin lock) — per plan.
- Admin scores live on the game row (`home_score`/`away_score`), not only on the tournament, so screens show them. The
  feed's later scores overwrite them (feed columns), which is fine before settlement; settled prizes never change.
- No migration to protect admin scores on the game row from a racing sync (cosmetic only; the tournament total is
  protected in TypeScript). Recorded in §19.
- The "stalled final" case is an admin choosing the champion while the feed is stuck: `feedWinnerSide` only ever
  decides a game that has both scores.
- Scores 0–200 each, winner strictly higher (no ties in basketball); refused with "No result" and on any round but 6.

### 4. Files and functions
- `lib/bracketsAdmin.ts`: `lockAfterFirstTip(kind, lockAt, games)` and `lockMoveRefusal(kind, lockAt, games,
  winnerSeats, tournamentNow)` (pure, exported; `move_lock` calls only this); `parseBracketsAdminAction` →
  `override_result` now has `scores: {home, away} | null` (from body `homeScore`/`awayScore`); the override writes
  them and its message says "Final score saved (total N)…" or "Prizes need the final score…";
  `bracketProblems(tournament, games, tournamentNow)` gained two lines (admin lock after first tip; final with no score).
- `lib/bracketsSync.ts` (`syncBracketTournament`): `finalDecided`, guarded `total`, `awaitingScore` → needsAdmin +
  `BRACKET_IDLE_SYNC_MS`; `moveLock` warns `[Brackets] admin-lock-after-first-tip`. Header comment updated.
- `lib/bracketsStore.ts`: `BracketGameAdminPatch` + `ADMIN_PATCH_COLUMNS` include `homeScore`/`awayScore`.
- `components/admin/sections/BracketsSection.tsx` (`GameRow`): Home/Away score inputs on the championship row; only
  sent when both are filled and changed.

### 5. Traps
- Tests calling `runBracketsAdminAction` directly bypass the parser: pass `scores: { home, away }`, not
  `homeScore`/`awayScore`.
- `kindHasStarted` is defined below `lockMoveRefusal` in the file; that's fine (called at runtime, not at load).
- Don't run `npx tsc --noEmit` and `npm run build` at the same time (`.next/types`).

### 6. Build / test (all run 2026-10-21, all pass)
- `npx tsc --noEmit`, `npm run lint` — clean.
- `npx vitest run tests/brackets-*.test.ts tests/bracket-*.test.ts` — 8 files, 141 tests. New: contract
  "never moves a lock past the kind's first tip", "takes a championship score only with a winner, both or neither";
  sync "lock and final-score guards (plan 10.2)" ×3 (live lock, rehearsal replay-clock lock, stalled final → hourly +
  needsAdmin → admin score → prizes settle, total kept).
- `npm run test` — 428 files passed, 1 skipped; 5,207 tests passed, 13 skipped.
- `npm run build` — passes. `npm run test:brackets-sql` — all checks passed (no SQL changed).
- Replay: 6,411 feed requests for both 2027 tournaments, same totals as 10.1.
- Unverified: the admin panel score fields in a browser (covered by checklist B3 in the 10.6 replay).

### 7. Open questions for Andrew
None new. Still waiting on him: `supabase db push` for 10.1's migration; push + deploy whenever he chooses.

### 8. Recommended first steps
1. Commit 10.2 (stage only the files in §2; `CLAUDE.md` hunk-by-hunk).
2. Start 10.3 or 10.4 from the plan §4 Phase 10. 10.4 rewrites `payCompleteBracketRounds`: keep 10.1's order (rounds
   read, then the winner-seats re-read, then pay) and the ledger keys exactly.
3. After both: 10.5 `/code-review high` over the 10.1–10.4 commits.
