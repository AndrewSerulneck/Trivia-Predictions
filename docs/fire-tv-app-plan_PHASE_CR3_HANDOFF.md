# Fire TV plan — Phase CR3 handoff (code review, small fixes)

**Date:** 2026-11-25 · **Model:** Claude Sonnet 5.5 (the plan's model), one session, no sub-agents.

## Summary for Andrew

- **Nothing urgent. Nothing was changed in the app.** This phase only reads code and records findings.
- **The four small PRs are good.** #43 (T1), #45 (T3), #47 (flavor-squares timeout) and #50 (Pick 'Em recheck) each
  do what their title says. For the three tests that can be broken on purpose (#43, #45, #50) I removed the fix in a
  scratch copy and the test failed each time, so they really guard what they claim. #47 is a timeout, which can't be
  tested that way; all three of its slow loops have it.
- **The 5-second Pick 'Em recheck (#50) runs once**, never loops, and adds one extra call per open while a game is live.
- **One small finding (F67):** if you switch sport on the Pick 'Em list within 5 seconds of opening it with a live
  game, a slow reply for the *old* sport can land last and show the old sport's games under the new tab until the next
  refresh. Display only: no wrong pick, no points affected. The weakness was already there; #50's recheck makes it a
  little likelier. I reproduced it with a test. The fix is a new phase, **CR3.1**, filed in the Pick 'Em plan (that plan
  owns this code). **Awaiting your OK.**
- **Your answer on code reviews is recorded as D39:** no automatic review after every phase; reviews go into a plan's
  phase table when the plan is made (usually one per plan, two for a long one), or you ask for one.
- **Not pushed.** This and CR2.3 are three local commits on `fix/cr2-connect-privacy` (CR2.3, a Vercel preview-opt-in change from another session, and this); they go out as one PR (your
  batching rule).

## For the next agent

### 1. Next phase and scope
There is no further CR phase. The plan's remaining work, in table order: **push `fix/cr2-connect-privacy` as one PR**
(CR2.3 code + CR3 docs), then everything else waits on Amazon's approval of 1.0.0 (CR1.7 = 1.0.1 release, Phase 5 / 12
device reviews, Phase 13 Vega). **CR1.7 must come after CR2.2**, which is already done.
Awaiting Andrew's OK, not started: **CR1.2.1** (F44, NFL screen), **CR3.1** (F67), and any CR1/CR2 phases not marked
done in the table. Don't start them without his yes.
Out of scope: anything reviewed by CR1 or CR2.

### 2. Starting state
- Branch `fix/cr2-connect-privacy`, from `main` `f3a6750c`. Commits on it, newest first: CR3 docs (this note + plan edits),
  `2fc94b8e` (preview builds opt-in, not mine), `8266040b` (CR2.3 code, tests, CLAUDE.md batching rule). **Nothing is pushed or deployed.**
- **Not mine, already committed on this branch:** `2fc94b8e` "Vercel: preview builds opt-in" (another session, landed
  while CR3 ran): `CLAUDE.md` bullet, `scripts/vercel-ignore-build.cjs` (`previewRequested`), and
  `tests/build-skip-contract.test.ts`. It rides in the same PR. Working tree is clean.
- No database writes, no production reads in this phase. No migrations. The scratchpad worktree used for the mutation
  runs is removed.

### 3. Decisions made
- **D39** (Andrew, 2026-11-25, in `docs/fire-tv-app-plan.md`): code reviews are planned per plan, not per phase.
- F67 goes in `docs/bingo-pickem-reliability-plan.md` as **CR3.1**, with a pointer row in this plan's findings table,
  because `PickEmGameList.tsx` belongs to the Pick 'Em feature (CLAUDE.md §Code review findings become remedial phases;
  the same was done for CR1.2.1 / F44).
- I did **not** run the `code-review` skill's multi-agent fan-out: four small PRs, a read-only review, the cost rule. I read
  each diff and the current code and ran the mutation checks by hand. Say so if Andrew expected the skill.

### 4. Files changed
- `docs/fire-tv-app-plan.md`: status line (line 17), decision D39, CR3 row marked done, new section "CR3 review findings"
  (before "Phase N1"), F67 row with a pointer.
- `docs/bingo-pickem-reliability-plan.md`: status paragraph, phase-table row CR3.1, new section "Phase CR3.1" (before
  "Mandatory handoff contract").
- This file. No code or tests changed.

### 5. Facts and traps
- `data/live-trivia/categories/current-events.json` is a Live category *and* `map.CURRENT_EVENTS` is added separately in
  `tests/lib.question-variety.test.ts`, which is why T1's expectation had a duplicate. The dedupe is correct.
- macOS has no `timeout` command and `sed -i` needs `-i ''`. Use `python3` for in-place test mutations.
- A worktree needs `ln -s <repo>/node_modules <worktree>/node_modules` to run Vitest.
- `vitest.config` has `clearMocks: true`; the star-tilt file calls `vi.restoreAllMocks()` itself, so the seeded
  `Math.random` doesn't leak between its tests.
- `loadGames` in `PickEmGameList.tsx` has **no** sequence guard: any slow reply, poll or not, can apply late. That is
  F67's root. The recheck timer reads `loadGamesRef.current`, so it always uses the sport and day current at fire time.
- The star index was committed by the weekly bot on 2026-11-24 (`generatedAt` 2026-11-24T20:30:41Z), so the T2 cron
  has now run at least once on schedule.

### 6. Build, run, test and what was verified
- Verified by hand, in a scratch worktree of `f3a6750c` (each change reverted afterwards):
  - #43: old expectation restored → `covers every Live Trivia category file` fails (9 vs 10 items).
  - #45: `BINGO_NFL_STAR_TIER_BOOST_STAR=1` / `_KNOWN=1` with seed 4 → fails, `expected 0.2125 to be greater than 0.3`.
  - #50: `if (false && needsFreshRecheck(...))` → the "reloads once, 5 s later" test fails (1 call, not 2).
  - #47: `tests/lib.sportsBingo.nfl-flavor-squares.test.ts` passes (27 tests, ~5 s); the three board loops at lines 751,
    785 and 814 carry `BOARD_LOOP_TIMEOUT_MS`.
  - F67: a probe test (recheck reply held, sport switched, reply released) showed the stale games on screen. The probe
    was throwaway and is not in the repo; CR3.1's step 1 describes it again.
- Docs-only commit: Vercel and CI skip it. The two plan docs are read by no test.
- Unverified: whether F67 shows on a real phone (it needs a slow reply landing in a 5-second window).

### 7. Open questions for Andrew
1. OK for **CR3.1**? (Small; low urgency.)
2. `2fc94b8e` (preview builds opt-in) is on this branch and will ship with the PR: fine?

### 8. Recommended first steps
1. `git status`; confirm the branch and that the CR3 docs commit is on top of `8266040b`.
2. Note `2fc94b8e` is in the batch; its tests are in `tests/build-skip-contract.test.ts`.
3. `npm run test`, `npm run lint`, `npx tsc --noEmit` once more, then `git push -u origin fix/cr2-connect-privacy`, open one
   PR, `gh pr checks <n> --watch` once, merge when green (CLAUDE.md §Batch pushes; Andrew's standing auto-merge rule).
4. Then wait for Amazon; if Andrew says yes to CR3.1 or CR1.2.1, do them on Sonnet 5.5 / medium and batch the push.
