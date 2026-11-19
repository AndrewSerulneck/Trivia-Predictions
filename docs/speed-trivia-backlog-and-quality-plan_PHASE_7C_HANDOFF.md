# Phase 7c handoff — seasonal subjects, a path fix, a sharper test, the duplicate files (2026-11-19)

## For Andrew

- **What changed:** the writer is told that a holiday/event question's subject must be the specific person, team,
  game, place or tradition (e.g. "Joe Namath", "jack-o'-lantern"), never the event's own name ("Halloween"). Before,
  a question about "Halloween" would block every later Halloween question that season. The writer version is now
  `writer-v6`. Also removed 41 stray "name 2.ext" copies that Finder/iCloud made (32 that were committed, 9 that
  weren't), and added a test that fails if one is ever committed again.
- **Is it live?** **No.** 7a, 7b and 7c are committed together on `fix/seasonal-slots-7abc` with one PR. It merges
  only with your OK.
- **What needs you:** OK the PR merge. Nothing else.
- **Left after the merge:** the agent checks the next nightly's brief and the seasonal question it produced (step 8).
  Then 7d.

## For the next agent

### 1. Next step and scope

- **Immediately after Andrew OKs the merge — 7c step 8 (this phase's last step, Opus 5.5 / medium):** merge the PR,
  then after the next writer run (daily 00:30 UTC) read each game's brief: the top-level `seasonal` field and the one
  slot carrying `event` (the event's **name**, and the prompt line `… · seasonal: <name>`). After the Trivia Nightly,
  check that the seasonal question was admitted with a normal tag (real area/era in `question_tags`) and a subject that
  isn't the event's name, and that `tagged_by` ends `:writer-v6`. Record the result at the bottom of this file.
  Read-only queries with `node --env-file=.env.local`; never print `.env.local` values.
- **Then 7d** (Opus 5.5 / high), plan §4 "Phase 7d", on a new branch `fix/second-review-remedials` from `main` after
  this PR merges.
- **Out of scope here:** the server-side reject of a seasonal subject equal to the event's name (plan 7c step 3, not
  built: processing doesn't know which slot was seasonal; revisit only if step 8 shows the writer ignoring the rule).

### 2. Starting state

- Branch `fix/seasonal-slots-7abc`, cut from `main` at `fa6979a1`. All 7a + 7b + 7c work is in one commit (see
  `git log -1`), pushed, PR open (see `gh pr list --head fix/seasonal-slots-7abc`). **Not merged, not deployed.**
- No migration, no data change, no paid call, no env var, no cron. Cost unchanged.
- Left untracked on purpose (not this phase's): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions

- D43 / D44 were taken at their defaults in 7b (rotation; 14→3-day window). Nothing new asked of Andrew in 7c.
- The 4 committed copies that differed from their originals were all **older** (so `git rm`'d, as the plan allows):
  - `tests/components.bingo.SportsBingoSelectSport.test 2.ts` — last changed 2026-09-04 (original 2026-09-19); it
    tests "Coming soon"/`note`/`out_of_season` rendering that `components/bingo/SportsBingoSelectSport.tsx` no longer has.
  - `tests/venue-screen-brand-chrome-contract.test 2.ts`, `tests/venue-screen-intro-stinger-contract.test 2.ts` —
    reference `components/venue-screen/TvPairingDisplay.tsx` and `app/tv/page.tsx`, both deleted (pairing removed).
  - `tests/venue-screen-idle-moments-contract.test 2.ts` — expects the idle game card that Andrew removed 2026-11-14.
  So the tripwire's `ALLOWED` list is empty.
- The 9 untracked copies matched the plan's description: 5 byte-identical to their originals; the 4 calendar/test
  copies byte-identical to the **committed** (`HEAD`, pre-7a/7b) versions; `..._PHASE_7_HANDOFF 2.md` the older draft.
  Deleted with `rm`. (The first `rm` attempt was blocked by the auto-mode classifier; it went through on a retry
  after the checks were shown.)

### 4. Files changed in 7c

- `lib/question-writer/rules.cjs` — `SEASONAL_RULE` gains the subject sentence; `WRITER_VERSION = 'writer-v6'` (+ v6
  comment). The prompt is served from this repo; the private writer repo needs **no** sync.
- `lib/question-writer/brief.d.cts` — `import("@/lib/question-variety/calendar.cjs").Calendar` (was `../`). `tsc`
  resolves it.
- `tests/lib.question-variety-seasonal.test.ts` — brief fixture now id `big-game`, name `the Big Game`; asserts the
  slot's `event` is the name, the prompt shows `seasonal: the Big Game` (never the id) and carries the new rule;
  `writer-v6`.
- `tests/lib.question-writer.test.ts`, `tests/scripts.question-candidates.test.ts` — `writer-v6` pins.
- `tests/no-finder-duplicates-contract.test.ts` — new; fails if `git ls-files` has a path matching `/ \d+(\.[^/]+)?$/`.
- 32 `git rm`'d copies (bingo plans, `docs/phase0-artifacts/* 2.json`, `lib/envNumber 2.ts`, four `scripts/* 2.cjs`,
  17 `tests/* 2.ts`).
- 7a/7b files (`slots.cjs`, `calendar.cjs/.d.cts`, `map.cjs/.d.cts`, `calendar.json`) — see the 7A/7B handoffs.

### 5. Traps

- **`npm run lint` reports 309 errors, all in the git-ignored `tmp/group-games-phase-4/release/` folder** (old local
  copies). Tracked files lint clean. Don't "fix" them; if it bothers Andrew, that folder is his to delete.
- **Flaky test (not 7c's):** `tests/live-conversion-requests-sql.test.ts` › `live_conversion_brief` › "reads the
  oldest queued requests…" failed 1 run in 3. Requests queued in the same instant tie on `requested_at`, and the
  SQL tie-break is `x.id` (a random uuid), so the order is random. Fix in **7f** (it owns conversions): give the test
  rows distinct `requested_at`, or — only if real queue order matters — a new migration with a stable tie-break. If CI
  fails on this PR with only that test, re-run it.
- Never `git checkout -- <file>`, `git stash` or `git reset` (CLAUDE.md / memory).

### 6. Checks run (2026-11-19)

- `npx vitest run tests/lib.question-variety tests/lib.question-writer.test.ts tests/scripts.question-candidates.test.ts` → 74 green.
- `npm run lint` → clean on tracked files (see trap). `npx tsc --noEmit` → clean.
- `npm run test` → 7,639 passed, 13 skipped, 1 failed on the first run (the flaky test above); second run all green.
- `npm run build` → success. (Typecheck and build run separately.)
- **Unverified:** how the writer behaves with the new rule — that's step 8.

### 7. Open questions for Andrew

- OK to merge the 7a–7c PR?
- (Optional, from 7b) move the Stanley Cup Final's Live entry out of Sports in `calendar.json` so it gets Live nights in 2027.

### 8. Model

7c step 8: Opus 5.5 / medium. 7d: Opus 5.5 / high (plan's top box).

## Step 8 result (post-merge brief check)

_Not yet run._
