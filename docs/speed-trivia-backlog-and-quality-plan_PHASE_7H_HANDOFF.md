# Phase 7h handoff: the private writer never loses a batch (2026-11-20)

## For Andrew

- **What 7h fixes (none of it has happened yet, as far as the logs show):**
  - **A failed grading call no longer throws away the day.** Before, if ChatGPT's grading step failed and a question
    happened to mention "log in", the writer thought its login had expired, quit, and sent nothing. Now a grading
    failure never stops the run: the questions are sent anyway and the site grades them.
  - **"Login needs renewing" is now read only from codex's own error lines,** never from the question text it echoes.
    Checked against a real signed-out codex run.
  - **A real login failure still stops the run (exit 3, the same email),** but whatever that game had already written
    is sent first.
  - **Two questions for one slot:** the writer keeps the first, and the site refuses a batch that repeats a slot.
  - Tidy-ups: one shared bar-test step for Speed and Live; one home for the model-name rule; the calibration script
    uses the writer's own codex runner and grades Current Events questions with the Current Events rules.
- **Is it live?** No. It's committed on `fix/second-review-remedials`, not pushed. The private writer repo
  (`hightop-question-writer`) still runs the old writer. 7j copies the new files there after the merge.
- **Cost:** $0. No new paid calls, cron, env var or migration.
- **Needs you:** nothing now. (If you'd like the writer fix sooner, it can be copied to the writer repo before the
  merge: it works with the site as it is today. Just say so.)

## For the next agent

### 1. Next phase and scope

- **Next: 7i** (Sonnet 5.5 / medium): plan §4 "Phase 7i — player screens: the held report sheet, the Current Events
  tab". It touches no 7h file.
- **7j inherits from 7h:** step 4, "Sync the writer repo". Copy `tools/question-writer/{write.mjs,grade.mjs,day.mjs,README.md}`
  to `AndrewSerulneck/hightop-question-writer` (repo root), **after** the merge. `renew-login.sh` is unchanged. The
  `.d.mts` files are for the main repo's tests only; copying them is harmless but not needed. Before pushing, check
  `gh run list -R AndrewSerulneck/hightop-question-writer` for a run in progress (nightly at 00:30 UTC). After, diff
  each file against the repo copy (as below), and read the next run's log: expect one JSON line per game, no
  "repeated slot(s) dropped" (normally), and no exit.
- The repo's workflow (`.github/workflows/write-questions.yml`) runs `node write.mjs` from the repo root with Node 22
  and codex 0.163.0; it needs no change for `day.mjs` (a sibling ESM import).
- **Out of scope:** re-running calibration (plan says so); applying migrations, pushing, the PR, the merge (7j).

### 2. Starting state

- **Branch:** `fix/second-review-remedials`, 7h commit on top of `0d087008` (7g). Nothing pushed.
- **Migrations still not applied (7j, with Andrew's OK):** `20261119193552` (7d), `20261120145222` (7f),
  `20261120151403` (7g). 7h adds none.
- **Production data:** not read or changed.
- **Writer repo:** checked 2026-11-20: its `write.mjs`, `grade.mjs`, `README.md`, `renew-login.sh` were identical to
  this repo's copies **before** 7h. Last runs: 2026-11-20 07:38 UTC (schedule, success, 10m40s), 11-19 (5m16s).
- **Left untracked on purpose (not ours):** `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions (agent's calls; Andrew wasn't asked)

- **New file `tools/question-writer/day.mjs`** (not in the plan's file list). The day's loop moved there from
  `write.mjs` so tests can run it with a fake site and a fake codex; `write.mjs` is now env checks, the `api` helper
  and exit codes. Putting the loop in `grade.mjs` would have made that file's name misleading.
- **Exit 3 on a writing-call login failure, but post first.** The plan keeps exit 3 for the writing call. Before 7h,
  `fail(3)` ran at once, so a login failure on a game's second prompt (e.g. Current Events) dropped the first prompt's
  questions. Now `writeDay` stops writing, posts that game's items, skips conversions and later games, and returns
  `login: true`; `write.mjs` then exits 3.
- **A login failure on a grading call does not exit** (logged like any grading failure). If the login really has
  expired, the next writing call (next game or next night) reports it.
- **Duplicate-slot refusal code is `duplicate_slot`** (400), matching the other `CandidateError` codes
  (`too_many`, `game_not_ready`); the plan wrote "duplicate-slot". It's checked on the raw `slot.n` of every entry,
  before validation, so a repeated slot is refused even when one copy is invalid.
- **Login-line matching:** an error line is `ERROR…` at line start, optionally after `[anything]` or an ISO timestamp
  (`2026-11-20T15:33:16.75Z ERROR …`). Login words: `log ?in|logged ?in|401|unauthori[sz]ed|refresh token`. The prompt
  can't fake it: the rubric lines are ours and the questions are one JSON line (JSON escapes newlines).
- **Timeouts** now say "codex timed out after 15 minutes." and are never read as a login failure.
- **`scoreBarTest`** returns audiences in item order and throws `bar-test-result-missing` itself. `report.graded` is
  now set after the API call instead of before it; on a fatal scorer error the error report's `graded` is `null`
  (nothing reads it there).
- **Calibration Current Events split:** the Speed and Live sets are now split by `category === "Current Events"` into
  `regular` / `currentEvents` jobs (the trial set already was), so those rows get the web-search grading block.

### 4. Files changed

- `tools/question-writer/grade.mjs`: new `runCodex({ prompt, schema, webSearch, model, effort, timeoutMs, spawnImpl })`
  (moved from `write.mjs`), `isLoginFailure(output)`, `writtenItems(output, slots, seen)` (first item per slot,
  counts dropped), `CODEX_TIMEOUT_MS`; comments no longer say Gemini.
- `tools/question-writer/day.mjs` (new): `writeDay({ games, api, codex, model, gradeEffort, log, warn })` →
  `{ failed, login }`, and `LOGIN_MESSAGE`.
- `tools/question-writer/write.mjs`: thin runner; `if (login) fail(3, LOGIN_MESSAGE); if (failed) process.exit(1);`.
- `tools/question-writer/grade.d.mts`, `day.d.mts` (new): types for tests (R2 #25.10).
- `tools/question-writer/README.md`: the grading log line now reads "(the site grades these instead)"; notes on
  dropped repeated slots and on a login failure still sending what was written.
- `scripts/calibrate-chatgpt-bar-test.mjs`: uses `runCodex` from `grade.mjs`; Current Events split.
- `lib/question-writer/modelName.cjs` (new): `MODEL_NAME` regex and `cleanModel`.
- `lib/question-writer/candidates.cjs`: uses `modelName.cjs`; `parsePost` refuses a repeated slot (400
  `duplicate_slot`). Still exports `cleanModel` (the route imports it).
- `lib/question-writer/barTest.cjs` (new): `scoreBarTest({ items, audience, scoreUngraded })`.
- `lib/question-writer/process.cjs`, `liveProcess.cjs`: the bar-test block replaced by `scoreBarTest`. Live
  conversions still take only the writer's grade (never the API, D36).
- `lib/speed-trivia-quality/audience.cjs`: `MODEL_NAME` from `modelName.cjs`; `map.isoDay` replaces its own `isoDay`.
- `eslint.config.mjs`: `tools/question-writer/*.d.mts` parsed with the TypeScript config (as the `.d.cts` files).
- Tests:
  - `tests/tools.question-writer-grade.test.ts`: imports `@/tools/question-writer/grade.mjs` / `day.mjs` with types,
    no cast. New: `writtenItems`; `isLoginFailure` (echoed prompt vs codex's 401, bracketed and ISO timestamps);
    `runCodex` with a fake spawn (echoed "log in" → ordinary error; 401 → login; clean run → output + tokens; timeout
    → ordinary error); `writeDay` (grading failure with "log in" still posts and the next game runs; grading login
    failure doesn't stop; writing login failure posts first, skips Live, `login: true`; repeated slot dropped before
    grading and posting).
  - `tests/lib.question-writer.test.ts`: `parsePost` duplicate-slot refusal; the old "invalid items" test now uses
    distinct slots; `scoreBarTest` against the real Speed and Live audience modules (same result as the old blocks:
    `audienceFromWriter` for a valid grade, one API call for the rest in order, none when all graded, missing →
    throws).
- Plan doc: top table, status line, 7h heading.

### 5. Facts and traps

- **Real codex 0.163.0 signed-out output** (probed with an empty `CODEX_HOME` in the scratchpad; no account, $0):
  `ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication…` plus
  `2026-…Z ERROR codex_api::endpoint::responses_websocket: … 401 Unauthorized` and `ERROR: Reconnecting... n/5`. It
  retries for ~20 s before exiting. `isLoginFailure` reports it as a login failure.
- An `^\s*` at the start of a multiline regex crosses newlines; the error-line regex uses `[ \t]*` for that reason
  (the first draft matched the echoed JSON line).
- `tsc` resolves `@/tools/question-writer/grade.mjs` to `grade.d.mts` (`allowJs` is false); vitest runs the `.mjs`.
- Never `git checkout -- <file>`, `git stash` or `git reset`.

### 6. Checks run (2026-11-20)

- Targeted: writer helpers 15, writer lib 29 + 2 new describe blocks, Speed nightly 9, Live nightly 19, no-Gemini
  contract 4 — green.
- `npm run test`: 591 files passed, 1 skipped; 7,718 tests passed, 13 skipped.
- `npx tsc --noEmit`: clean. `npx eslint` on every changed file: clean. `npm run build`: success (after typecheck).
- The real-codex probe above. **Not verified:** a real night with the new writer (needs the 7j sync), and the
  calibration script end to end (not re-run, by plan; `node --check` passes).

### 7. Open questions for Andrew

- None. (Optional: sync the writer repo before the merge, see "For Andrew".)

### 8. Recommended first steps for 7i

1. Stay on `fix/second-review-remedials`. Read plan §4 "Phase 7i" and the shared ground rules for 7d–7j.
2. Model: **Sonnet 5.5 / medium** (the plan's top table).
3. 7i is player UI: browser-test from a scratchpad clone with no `.env.local` and mocked routes (CLAUDE.md).
