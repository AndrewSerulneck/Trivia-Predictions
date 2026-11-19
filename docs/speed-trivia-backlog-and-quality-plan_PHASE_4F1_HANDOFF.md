# Handoff: Phase 4f.1 — every Gemini question writer deleted (2026-11-19)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` (status line, Phase 4f, §6 D40, §7 standing rules).
Previous note: `speed-trivia-backlog-and-quality-plan_PHASE_4E_SHIP_HANDOFF.md`. Done on Sonnet 5.5 / medium (per the §3 table).

## For Andrew (plain English)

- **Gemini can no longer write a question anywhere.** The "backup writer" that used to step in on a day ChatGPT sent
  nothing, and the four old hand-run generators, are deleted. A day with no ChatGPT batch now simply produces no new
  questions; Quick Review still says "Writer stopped" after 2 silent days.
- **Not live yet.** The work is on branch `feature/gemini-writers-out-4f1`, uncommitted/unpushed until you say so. No
  database change, no data change, no cost ($0). Nothing needs doing from you except merging the PR when it is open.
- **Gemini still checks.** The repeat checks, tagging and the rare ungraded bar test still call Gemini. That is
  Phase 4f.2, which needs your OpenAI API key and your OK on the cost.

## For the next agent

### 1. Next phase and scope
**Phase 4f.2** (plan "Phase 4f.2", Opus 5.5 / high): move the checks to the OpenAI API. **Blocked on Andrew:** an
`OPENAI_API_KEY` (he pastes it; you append to `.env.local` with `>>`, add to Vercel and GitHub secrets) and his OK on
the measured cost (step 1 cost baseline first). Out of scope here: anything in 4f.2, Phase 7. If the key isn't ready,
Phase 7 can run first (plan order note); never run both at once.

### 2. Starting state
- Branch `feature/gemini-writers-out-4f1`, cut from `chore/writer-schedule-on` (`ca303fa6`, which is not yet merged
  to `main`). Nothing committed until the end of this session's work; check `git log`/`git status`.
- Also in the working tree, from the earlier planning session (not mine): edits to `CLAUDE.md`, `AGENTS.md` and the plan
  (D40/D41 text). Untracked clutter (`* 2.ts`, `* 2.m4a`, backfill logs) is not part of this phase; don't commit it.
- No migration, no database write, no deploy, no paid call. The nightly workflow file changed, so the next
  `trivia-nightly` run (02:15 UTC) is the live test; it must pass.

### 3. Decisions (don't re-ask)
- D40 (Andrew 2026-11-19): Gemini out altogether; D41: Phase 5 skipped, 6 deferred.
- I kept `gemini-fallback` readable in old rows and in Quick Review's "gemini" source filter; only *writing* it is gone.
- `lib/question-writer/candidates.cjs` `SOURCES` is now `['chatgpt']`. The DB's `question_writer_runs` source check was
  not touched (no migration); old rows keep working.
- The tripwire does **not** fail on `GEMINI_API_KEY` in `lib/question-writer/`, contrary to plan step 3: the bar-test
  scorer and the Live repeat checker built in `process.cjs`/`liveProcess.cjs` still need it until 4f.2. 4f.2 must add
  that check and widen to the whole repo.

### 4. Files
- Deleted: `lib/question-writer/geminiWriter.cjs`, `lib/speed-trivia-uniqueness/generation.cjs`,
  `scripts/generate-trivia-nightly.cjs`, `scripts/generate-trivia-questions.cjs`,
  `scripts/generate-live-trivia-questions.cjs`, `scripts/generate-live-trivia-nightly.cjs`,
  `scripts/measure-speed-trivia-admission-offline.cjs` (only measured the old generator's plan), and the npm scripts
  `trivia:generate`, `trivia:generate:nightly`, `live-trivia:generate`, `live-trivia:generate:nightly`.
- New: `lib/question-writer/speedCategories.cjs` (`SPEED_CATEGORIES`, `DATED_CATEGORIES`; replaces what `brief.cjs` and
  `candidates.cjs` took from `generation.cjs`), `tests/no-gemini-writer-contract.test.ts` (tripwire).
- Changed: `process.cjs`, `liveProcess.cjs` (fallback branch, `fallback` option, `writeFallback`, `report.fallback`
  removed), `brief.cjs` (`conversions:false` option removed), `candidates.cjs`, `rules.cjs` (comment),
  `scripts/process-question-candidates.cjs` (`--no-fallback` flag gone; unknown flags still throw),
  `.github/workflows/trivia-nightly.yml` (`--no-fallback` removed from both steps),
  `lib/speedTriviaQuickReview.ts` (`WriterState` is `none|silent|ok`; reads 1 row instead of 2),
  `scripts/capture-speed-trivia-workflow-baseline.cjs` (dropped two deleted files from its list).
- Tests: fallback tests deleted (not skipped) in `lib.question-writer`, `scripts.question-candidates`,
  `scripts.live-question-candidates`, `api.admin.*`, `scripts.speed-trivia-admission`, `scripts.question-variety`;
  two "does nothing without a batch" tests added; `speed-trivia-generator-categories-contract.test.ts` now reads
  `speedCategories.cjs`.

### 5. Facts and traps
- `tests/live-conversion-requests-sql.test.ts` ("reads the oldest queued requests…") is **flaky** (ordering of rows
  created in one transaction): failed 1 of 4 isolated runs on this branch, passes on retry; unrelated to this phase.
- `npm run lint` over the whole repo reports ~309 errors from `tmp/` copies; lint only touched paths.
- Old docs/handoffs still mention the deleted scripts; they are history, left alone.
- `GEMINI_API_KEY` is still passed to both nightly steps and the Keep Queue workflow on purpose.

### 6. Build, run, test
`npx vitest run` → all pass except the flaky test above (7,600 passed). `npx tsc --noEmit` clean. ESLint clean on
touched files. `npm run build` passes. Unverified: a real nightly after merge (check the next day's Trivia Nightly
run with `gh run list --workflow trivia-nightly.yml`, both steps green, "no-candidates" only if the writer missed).

### 7. Open questions for Andrew
None for 4f.1. For 4f.2: the OpenAI API key and cost OK.

### 8. Recommended first steps
1. Confirm 4f.1 is merged and the following night's run passed.
2. Ask Andrew for the key; do 4f.2 step 1 (cost baseline) before anything else.
