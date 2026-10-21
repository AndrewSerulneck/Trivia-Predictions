# Squares + Brackets plan — Phase 10.4 handoff (TV games, shared helpers, one-pass payment)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 10 "10.4", as-built §21, findings §17 B7, B9, B10).

## For Andrew (plain English)

- **What changed:**
  - The bar TV's "today's games" now lists only the games of the bracket it's showing. It no longer mixes in the other
    tournament, and a test (rehearsal) tournament never shows on a real venue's TV.
  - Two rules that were copied in several places now live in one place each, so prizes, Results and the TV can't
    disagree about when a bracket locked.
  - When several rounds' points need paying at once (after a correction, or a failed run), the server now reads the
    entries once instead of once per round. Same points, same records, fewer database reads.
- **Is it live?** No. Nothing committed, pushed or deployed; the brackets flag is off; no tournament until Mar 14, 2027.
  No database change.
- **What's left:** 10.5 (a fresh code review of 10.1–10.4), 10.6 replay rehearsal, 10.7 your phone + TV pass, 10.8
  launch by Mon Mar 8, 2027. **Waiting on you:** `supabase db push` for 10.1's migration `20261021035254`; commit /
  push / deploy whenever you choose (10.2, 10.3 and 10.4 are all uncommitted).

## For the next agent

### 1. Next phase
**10.5** (Opus 5.5 · high): `/code-review high` over the 10.1–10.4 changes (10.1 = commit `9f9de25`; 10.2–10.4 are
uncommitted unless Andrew has committed them since — check `git log`). New findings become 10.5.1, 10.5.2, … each with a
designed fix (Andrew's rule: no in-place patches). Out of scope: Squares (6.5 waits on Oct 19/22 NFL captures), flags,
applying migrations, deploying.

### 2. Starting state
- Branch `main`, last commit `9f9de25` (10.1). **10.2, 10.3 and 10.4 are uncommitted** in the working tree. I did not
  commit (not asked).
- 10.4 files: `lib/brackets/tree.ts`, `lib/bracketsStore.ts`, `lib/bracketPrizeAwards.ts`, `lib/bracketsEntries.ts`,
  `lib/bracketsTv.ts`, `lib/bracketsTvRead.ts`, `lib/bracketsSync.ts`, `lib/results/adapters/bracket.ts`,
  `tests/bracket-tv.test.ts`, `tests/brackets-contract.test.ts`, `tests/brackets-sync.test.ts`,
  `tests/lib.bracket-prize-awards.test.ts`, `docs/squares-and-brackets-plan.md` (status line, 10.4 heading, §21),
  `CLAUDE.md` (one bullet after the 10.2 bullet), this file. `lib/bracketsStore.ts`, `lib/bracketsSync.ts`,
  `tests/brackets-contract.test.ts`, `tests/brackets-sync.test.ts` and `CLAUDE.md` also carry 10.2 hunks — to commit
  10.2 and 10.4 separately, stage hunk by hunk (10.2's file list: `docs/squares-and-brackets-plan_PHASE_10.2_HANDOFF.md` §2).
- Other people's uncommitted work — never commit it with brackets work: `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the POS hunk in `CLAUDE.md`, the deleted
  `design-system/project/public/info/*.png` + untracked `New Folder With Items/`,
  `tests/fixtures/squares/nfl-live-capture-1392308.json`.
- Data: untouched. Migration `20261021035254` (10.1) still NOT applied.

### 3. Decisions
- **TV: chosen tournament only** (the plan's recommendation; the other gender's games are dropped). No new question to
  Andrew.
- **Where the helpers live:** `bracketSeatList` in `lib/brackets/tree.ts` (pure, client-safe, next to `emptyPicks`);
  `bracketRealLockMs` in `lib/bracketsStore.ts` next to `tournamentNowMs` (the clock helpers). No re-export from
  `lib/bracketPrizeAwards.ts` — the test imports it from the store now.
- **Rehearsal visibility** got one home too: `bracketTournamentsShownAt` (generic over anything with `purpose`), used by
  the bracket screen (`tournamentsForVenue`) and the TV.
- **Payment failure semantics:** with one pass, a failure marks no round paid (before, rounds finished earlier in the
  loop were marked). Safe: re-sent keys return `already_credited`.

### 4. Files and how they fit
- `lib/bracketsTvRead.ts` `getBracketTvPayload`: shared 15 s tournaments+games read (unchanged) → on a venue refresh,
  `bracketTournamentsShownAt` (venue read only if a rehearsal is current) → entries read for those ids + timezone →
  cached as `{ tournaments, entries, timeZone }` → `buildBracketTvPayload` gets only the shown tournaments.
- `lib/bracketsTv.ts` `buildBracketTvPayload`: `games` now = `tournament.games` (the chosen one) filtered to today on
  its clock.
- `lib/bracketsSync.ts`: `payCompleteBracketRounds` (unchanged up to the winner-seats re-check) → `payBracketRounds`
  (new, replaces `payBracketRound`) → mark each round paid with `.eq("grade_no", …)`. Error text is now
  `rounds 1,2,3: <cause>`.

### 5. Traps
- `tests/bracket-tv.test.ts` mocks `supabaseAdmin` as a chain; it now records `.in()` calls and has `maybeSingle`
  (the venue `hidden` read). A new query shape there needs the mock extended.
- The contract test forbids any new `picksOf =` / `seatList =` and the literal
  `seat === null || seat === undefined ? null : Number(seat)` outside `lib/brackets/tree.ts`, and any
  `lock… + …clockOffset` outside `lib/bracketsStore.ts`.
- `lib/bracketsSync.ts:~264` `offsetMs = tournament.clockOffsetSeconds * 1000` is the feed replay mask, not a lock —
  intentionally left.
- Don't run `tsc` and `build` at the same time.

### 6. Build / test (2026-10-21)
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 428 files passed, 1 skipped, 5,216 tests passed,
13 skipped. Replay (`tests/brackets-sync.test.ts`): 6,411 feed requests, same totals and prize results. Not run:
`npm run build` (library-only changes; Andrew's dev server may hold `.next`), `npm run test:brackets-sql` (no SQL
changed). Unverified: a real TV screen (checklist section B in 10.6).

### 7. Open questions
None.

### 8. First steps
1. Ask Andrew whether to commit 10.2, 10.3, 10.4 (separately, see §2) before reviewing.
2. Run `/code-review high` over 10.1–10.4 (Opus 5.5 · high) and record findings in a new plan section.
