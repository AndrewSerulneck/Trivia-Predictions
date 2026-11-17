# Speed Trivia backlog plan — Phase 4a.1 handoff (thin subjects over the star cap, keep them thin)

Written 2026-11-16 by Claude (Opus 5.5, high effort, as the plan's table names; no substitution).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4a.1". Previous: `..._PHASE_4A_HANDOFF.md`.

**Status: IN PROGRESS.** Steps 1 (map areas) and 3 (star cap migration) are done and live in the database. Step 2
(the thinning) is built and tested but **not applied**: it waits for ChatGPT runs and then Andrew's spot check. Step 4
(re-enable the Keep Queue) waits for step 2. The section "Where this stopped" below is the exact state.

## For Andrew

- **New map areas are live** (you approved them): 13 General Knowledge and 8 Sports areas, so 172 areas in all.
  Re-tagging the unmatched questions into them through ChatGPT is part done: 606 of 833 GK questions found an area
  before ChatGPT's usage limit stopped the run ("try again at 10:08 PM").
- **The star cap is live in the database** (you OK'd the push): no Speed question can go live if its subject already
  has 5 live questions, whichever way it's approved (Quick Review, Admin, the overnight queue, the future writer).
  Nothing was thinned yet. Chameleon, for example, has 43 live questions today.
- **Until the 4a/4a.1 website code is deployed** (after your Phase 5 review): a question you add in Admin has no subject
  tag, so Admin can't approve it (it shows an error) and Quick Review Keep leaves it waiting. Every existing question is
  tagged, so nothing else changes.
- **Cost so far: $0.** No Gemini calls. ChatGPT through your plan only.
- **Needs you next:** the spot check of about 20 subjects (a page in `docs/`), then I apply the thinning and turn the
  Keep Queue back on.

## For the next agent

### 1. Goal and scope

Phase 4a.1 (plan §4): thin Speed subjects to 5 per subject (D19), enforce the cap on every path to active (done), map
areas for unmatched GK/Sports rows (D20, done except the re-tag), re-enable the Keep Queue, report. Out of scope: Live
Trivia (never thinned; plan §7), Phase 4b, anything in 3a–3d, `core.cjs` (frozen).

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e` (PR #19 merge). **Everything from 4a and 4a.1 is
  uncommitted** (Andrew: Phases 4a–5 are committed only after his code review following Phase 5). Never use
  `git checkout -- <file>`, `git stash` or `git reset` on them.
- **Database:** migration `20261116014954_speed_trivia_star_cap.sql` APPLIED 2026-11-16 (`supabase db push --linked`,
  dry run first showed only it). Verified read-only on production: `speed_trivia_star_cap_check` answers `full` for
  chameleon/koala waiting rows and `untagged` for an unknown id; `speed_trivia_released_rows_v2` returns 0 rows;
  `speed_trivia_subject_cap_log` is empty; `service_role` can't call `speed_trivia_star_cap_state`.
- **Data written:** 21 rows in `question_coverage_areas` (`created_by = 'seed:variety-map-v2'`); 606 `question_tags` rows
  updated from `area_id` null to an area (`tagged_by` ends `:area-retag-v2`; subject and subject_key unchanged). No
  question row changed. Undo for the tags: set `area_id`/`era` back to null where `tagged_by like '%:area-retag-v2'`.
- **Keep Queue:** still `disabled_manually` (`gh workflow list --all`). Trivia Nightly stays disabled until 4b.

### 3. Decisions (don't re-ask)

- D20 (2026-11-16): the 21 drafted areas approved as drafted. Speed Sports era set is now `sportsEras` = "Before 1950"
  + the decades + "Timeless"; its first 14 areas keep the decades (explicit `eras` in the draft file).
- D21 (2026-11-16): Andrew prefers his ChatGPT plan over Gemini wherever possible. Live rows are scored with the Phase 2
  bar-test prompt through `codex exec` (`--score-live`); Gemini only if ChatGPT can't.
- D22 (2026-11-16): push the migration before the code is deployed (done).
- Statuses: "rejected" and "retired" in the plan are both `status = 'deleted'` (the only retired status). The log row's
  `old_status` says which it was.
- Ranking (D19): live first; then the stored Phase 2 score (only while `marks.audience.key` matches the content, as
  `speed_trivia_audience_key`); live rows in the 138 subjects with more than 5 live use the ChatGPT scores; ties at the
  cut go to ChatGPT ("best known and most different"), cached in `<plan>.ties.json`; anything ChatGPT doesn't answer
  falls back to "different answers first" and marks the plan incomplete (apply refuses an incomplete plan).
- Aliases are merged in `question_tags` (subject and subject_key) at apply time, logged, so the guard counts one subject
  once. Candidates come from word containment; ChatGPT judges "exactly the same thing"; the agent reviews the list.
- Undo of a live row whose subject has no room goes back to waiting, never past the cap.

### 4. Files

New: `supabase/migrations/20261116014954_speed_trivia_star_cap.sql`, `scripts/speed-trivia-thin-subjects.cjs`,
`scripts/lib/codexExec.cjs`, `lib/question-variety/tagging.cjs` + `.d.cts`, `lib/speedTriviaTagging.ts`,
`tests/speed-trivia-star-cap-sql.test.ts`, `tests/scripts.speed-trivia-thin-subjects.test.ts`,
`tests/lib.speed-trivia-tagging.test.ts`, this note.
Changed (on top of 4a's uncommitted files): `data/question-variety/draft-map.json` (v2),
`docs/..._PHASE_4A_DRAFT_MAP.md` (regenerated), `scripts/tag-questions.cjs` (`--unmapped`; prompt/codex moved to shared
libs), `lib/speed-trivia-uniqueness/runtime.cjs` (`subject_full`/`untagged` codes; `requireStarCapRoom` before paid
checks), `lib/speedTriviaAdmission.ts` (`withTag`, tag on save, 409 for the new codes), `lib/triviaReviewApproval.ts`,
`app/api/admin/trivia/questions/route.ts` (holds), `lib/speedTriviaQuickReview.ts` + `types/speedTriviaQuickReview.ts` +
`app/api/admin/trivia/quick-review/route.ts` + `components/admin/sections/SpeedTriviaQuickReview.tsx` ("Subject full.",
bulk cursor), `scripts/process-speed-trivia-keep-queue.cjs` (Subject full → Needs a look, no paid check),
`scripts/test-speed-trivia-admission-sql.cjs` (harness passes `p_row_ids` as a Postgres array),
`tests/api.admin.speed-trivia-quick-review.test.ts`, `tests/scripts.speed-trivia-keep-queue.test.ts`, the plan doc.

### 5. Facts and traps

- ChatGPT's plan has a usage limit: the re-tag stopped after ~125k tokens today with "You've hit your usage limit …
  try again at 10:08 PM". `codexExec.isLimitOrLogin` stops a run on it; every step is resumable (re-run the command).
  Each `codex exec` call costs ~15k tokens of overhead, so batches are large (scores 100, ties 25 subjects, aliases 150).
- The free summary (`node --env-file=.env.local scripts/speed-trivia-thin-subjects.cjs`) reproduces the plan's numbers
  exactly: 3,534 subjects, 483 over 5, reject 3,319 waiting, retire 648 live, 138 subjects with more than 5 live,
  365 ties at the cut.
- PGlite harness: `harness.call` only turned `p_keys` into a Postgres array; `p_row_ids` now too.

### 6. Build, run, test

- `npm run test`: 556 files passed, 1 skipped (7,271 tests). `npx tsc --noEmit`: clean. ESLint on changed files: clean.
- Commands: see the header of `scripts/speed-trivia-thin-subjects.cjs`.

### 7. Where this stopped / next steps

1. After 10:08 PM local: finish the re-tag
   `node --env-file=.env.local scripts/tag-questions.cjs --game speed --unmapped --category "General Knowledge" --apply --batch 80 --concurrency 1`
   (then the same for `Sports`).
2. Aliases, live scores, plan + spot check (all ChatGPT, free), then Andrew's spot check, then `--apply <plan> --yes`,
   then `gh workflow enable speed-trivia-keep-queue.yml`, then the report (plan §4 Phase 4a.1 step 5).
