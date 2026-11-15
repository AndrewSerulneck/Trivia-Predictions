# Speed Trivia backlog plan — Phase 3d handoff (list check, shared helpers, apply, verify)

Written 2026-11-15 by Claude (Sonnet 5.5, as the plan's table names; no substitution).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 3d". Previous:
`speed-trivia-backlog-and-quality-plan_PHASE_3C_HANDOFF.md`.

## For Andrew

- **Live in the database now:** the three remedial database changes (3a, 3b, 3c) were applied to production with your
  OK. Checks after the push all passed (queue counts, released-rows list, the new `prior` column; nothing was queued,
  nothing changed for players).
- **Fixed (review #6):** answers like "1,000,000" and "Crosby, Stills, Nash & Young" no longer count as lists. Of the
  24 stored scores that carried the list flag, **6 were wrong and were re-scored** (free, no AI calls); the other 18
  are real lists and stay flagged. Undo log: `docs/speed-trivia-backlog-and-quality-plan_PHASE_3D_RESCORE_LOG_2026-11-15.json`.
- **Fixed (review #8):** two copied pieces of code now have one home each.
- **Not live yet:** the website code (Quick Review changes) is on PR #19, which is **not merged**.
- **Cost:** $0. No paid calls.
- **Needs you:** decide whether to merge PR #19. Recommended: yes. Merging puts Quick Review live and starts the
  nightly job (3–4 nights to clear the backlog; budget variables are already set: $5 a night, $20 total).

## For the next agent

### 1. Next phase: 4a

Phase 4a of the plan (variety map and tags; plan §4 "Phase 4"). Read the plan's Phase 4 section and §7 first. Out of
scope for 4a: anything in 3a–3d, `core.cjs` (frozen), and Live Trivia JSON (only Phase 4b appends).

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19, open. Phase 3d is committed and pushed on top of `368ad0cd`
  (see `git log -1`).
- **Production database:** all migrations through `20261115214254` applied on 2026-11-15 by `supabase db push --linked`.
  `supabase migration list --linked` showed only those three pending beforehand.
- **Production data changed:** 6 rows in `speed_trivia_review_marks.audience` (list above in the log file). Undo:
  `node --env-file=.env.local scripts/rescore-speed-trivia-checks.cjs --undo docs/speed-trivia-backlog-and-quality-plan_PHASE_3D_RESCORE_LOG_2026-11-15.json --apply`.
- Not deployed: web code waits for the PR #19 merge.
- Leave the unrelated untracked files alone: `* 2.ts`, `* 2.m4a`, `* 2.mp4`, `README 2.md`, the two `*_BACKFILL_LOG_*.json`.

### 3. Decisions made

- Plan's list rule followed: flag `multi-answer` only with ≥ 2 commas (digit-group commas ignored) **and** a question that
  asks for several things (count word two–ten or digit 2–10, "which/what group|set|list of", "list"/"lists"); the old
  "which three|four|five" rule is kept.
- Consequence: a plural question with no count word ("Which countries border Eritrea?") is no longer flagged by the free
  check; the model's `ambiguous` flag is the backstop. I changed the existing test to "Which three countries…".
- Rewritten rows get `version: bar-test-v2.1` as the plan says, but their `model` string still reads
  `…:bar-test-v1`, because the grades themselves are old. **All 24 stored scores were `bar-test-v1`**, not v2 as the
  plan assumed. Nothing in SQL filters on version.
- The re-score skips any mark whose stored `key` doesn't match the question today (edited since graded). It computes
  the key in JS (`audienceKey`, mirrors `speed_trivia_audience_key`) and returns null for non-string options. On
  production all 24 matched, none skipped.

### 4. Files

- `lib/speed-trivia-quality/audience.cjs`: `isListAnswer` (exported), `preChecks` uses it, `AUDIENCE_VERSION = 'bar-test-v2.1'`.
- `scripts/rescore-speed-trivia-checks.cjs` (new): dry run by default; `--apply` writes the undo log first, then the
  rows through `speed_trivia_review_set_audience`; `--undo <log> [--apply]`.
- `scripts/lib/speedTriviaServiceClient.cjs` (new): `clientFromEnv`; imported by `score-speed-trivia-backlog.cjs`,
  `process-speed-trivia-keep-queue.cjs`, `retire-speed-trivia-category.cjs` (their copies removed).
- `lib/speed-trivia-uniqueness/runtime.cjs`: exports `sameAnswer`; the queue script's `priorityOf` is gone
  (`runtime.sameAnswer`). `core.cjs` untouched.
- Tests: `tests/lib.speed-trivia-audience.test.ts` (list-check cases, version), new `tests/scripts.speed-trivia-rescore.test.ts`
  (rescore, key, `sameAnswer`, client helper).
- Docs: plan status line, §4 3d "DONE", §7 remedial rules; this file; the rescore log.
- `.github/workflows/speed-trivia-keep-queue.yml`: checked, no change needed.

### 5. Facts and traps

- Calibration re-run (free, from the stored `PHASE_2_CALIBRATION_bar-test-v2_…` file): agreement is identical before and
  after (≤2 loses 34/200 keeps and catches 14/19 rejects; ≤3 76/200, 18/19; ≤4 165/200, 19/19). None of the 321 labelled rows changed score.
- `supabase db push --linked --yes` works non-interactively. `supabase migration list --linked` prints a very large single JSON line.
- The trigger `speed_trivia_review_marks_prior` could not be queried through supabase-js (no `pg_trigger` access). Only the
  `prior` column was confirmed (selectable; 0 marks have it set). The trigger shipped in the same migration file that was
  tested on PGlite; confirm it with one real Keep→Undo in Needs a look after the merge.
- `speed_trivia_quick_undo` probe with a nonexistent id returns `quick-review-nothing-to-undo` (no data touched).
- A Quick Review undo of a real row was deliberately NOT run on production (it would change data).

### 6. Build, run, test

- `npm run test`: 547 files passed, 1 skipped (7,191 tests passed, 13 skipped). `npx tsc --noEmit 2>&1 | grep -v '^\.next/'`: nothing.
  `npx eslint` on the two changed test files: clean. Frozen gates (`speed-trivia-uniqueness-evaluation`, `-release`): pass.
- Production checks run (all free): `speed_trivia_queue_prepare(false)` → `{queued:0,stale:0,settled:0}`;
  `speed_trivia_released_rows_v2()` → `[]`; count-mode queue script → `{"queued":0,"stale":0,"settled":0}`.
- **Not verified:** Quick Review in a real browser against the new database; the overnight job (it can't run until the merge
  and a queued Keep exists).

### 7. Open questions

- Merge PR #19? (Andrew; recommended yes.)

### 8. First steps for Phase 4a

1. Read plan §4 Phase 4 (amended) and §7, and D9–D16.
2. If PR #19 was merged, start from updated `main`; otherwise stay on this branch.
3. Model/effort per the plan's table (§3).
