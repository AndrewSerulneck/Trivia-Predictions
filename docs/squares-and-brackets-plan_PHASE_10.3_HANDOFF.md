# Squares + Brackets plan — Phase 10.3 handoff (bracket drafts never drop picks)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 10 "10.3", as-built §20, finding §17 B4).

## For Andrew (plain English)

- **What changed:** on the bracket screen, if you tapped Back (or Next, or Save bracket) while an earlier save was
  still going, your newest picks could be left unsent. Now the screen waits for the save in progress, then sends
  anything newer, so picks are no longer dropped. If nothing changed, nothing extra is sent.
- **Is it live?** No. Nothing is committed, pushed or deployed; the brackets flag is off and no tournament exists until
  Mar 14, 2027. No database change.
- **What's left:** 10.4 (TV games, shared helpers, one-pass payment), then review (10.5), replay rehearsal (10.6), your
  phone pass (10.7), launch by Mon Mar 8, 2027. Still waiting on you: `supabase db push` for 10.1's migration
  `20261021035254`; commit/push/deploy when you choose.

## For the next agent

### 1. Next phase
**10.4** (Opus 5.5 · medium), plan §4 Phase 10: TV "today's games" from the chosen tournament only (rehearsal only at a
hidden venue); one home for the real-lock rule (`bracketRealLockMs` in `lib/bracketPrizeAwards.ts` vs `realLockMs` in
`lib/results/adapters/bracket.ts`) and one exported 63-seat picks normalizer (`picksOf` in `lib/bracketsEntries.ts`,
`seatList` in `lib/bracketsStore.ts`, inline in `lib/bracketsTvRead.ts`) pinned by a contract test; one-pass
`payCompleteBracketRounds` (keep 10.1's order: rounds read, winner-seats re-read, then pay; ledger keys unchanged).
Out of scope: Squares (6.5 waits on Oct 19/22 NFL captures), flags, applying migrations.

### 2. Starting state
- Branch `main`, last commit `9f9de25` (10.1). **10.2 and 10.3 are both uncommitted** in the working tree.
  10.3 files: `components/bracket/BracketEditor.tsx`, `tests/bracket-screen.test.ts`,
  `docs/squares-and-brackets-plan.md` (status line + §20), this file. 10.2 files are listed in
  `docs/squares-and-brackets-plan_PHASE_10.2_HANDOFF.md` §2 (plus its plan/CLAUDE.md edits).
- Other people's uncommitted work — do NOT commit with brackets work: `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the POS hunk in `CLAUDE.md`, the deleted
  `design-system/project/public/info/*.png` + untracked `New Folder With Items/`, and
  `tests/fixtures/squares/nfl-live-capture-1392308.json`. Stage `CLAUDE.md` hunk-by-hunk.
- Data: untouched. Migration `20261021035254` NOT applied.

### 3. Decisions
Followed the plan's design as written (promise in a ref; `persist()` waits, then sends if the version moved; 3 s exit cap
kept in `BracketGame`). No new user decisions.

### 4. Files and how they fit
`BracketEditor.persist(keepalive)`: `while (inflightRef.current) await inflightRef.current.catch(...)`; return true if
`versionRef === sentVersionRef`; else build the send (promise), set `inflightRef`, `setSaving(true)`, await, clear in
`finally`. Callers: `flushRef` (exit), `goTo`, `finish`, the `visibilitychange` handler. `BracketGame.tsx` is unchanged.

### 5. Traps
- In the tests a pick on the same game only changes the seat (count stays 1); use another game for a "newer pick".
- While a save is out, the Next/Save button shows "Saving…" and is disabled, so "Save during a background save" is
  only reachable in the tick before React re-renders (the test dispatches `visibilitychange` and clicks in one `act`).
- Don't run `tsc` and `build` at the same time.

### 6. Build / test (2026-10-21)
`npx vitest run tests/bracket-screen.test.ts tests/bracket-screen-contract.test.ts` 32/32; `npm run test` 428 files
passed, 1 skipped, 5,209 tests passed, 13 skipped; `npx tsc --noEmit` and `npm run lint` clean. `npm run build` not
re-run (client-component-only change). Unverified: real phone behaviour (checklist B3).

### 7. Open questions
None.

### 8. First steps
1. Commit 10.2 and 10.3 separately (see §2 for what to leave out).
2. Do 10.4 per the plan; then 10.5 `/code-review high` over 10.1–10.4.
