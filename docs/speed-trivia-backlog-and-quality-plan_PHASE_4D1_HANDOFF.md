# Phase 4d.1 handoff: ChatGPT bar test (D35)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4d.1 — ChatGPT bar test (D35)". Done 2026-11-18 on
Opus 5.5 (the plan's tier). Code, tests and calibration are done; **nothing is committed, deployed or copied to the
private writer repo yet** (waits for Andrew's OK).

## For Andrew (plain English)

- **What changed:** ChatGPT now grades the questions it writes (the "bar test"), in a separate ChatGPT session that sees
  only the grading rules and the finished questions. News questions are graded with web search and today's date.
  Gemini now grades only on days when ChatGPT doesn't send a batch, or if ChatGPT's grading fails.
- **Did it work?** Yes, on your past decisions:
  - The 5 news questions Gemini scored 1 now score 3–5, so they'd reach Quick Review.
  - The 9 Live questions you kept score 4–5.
  - On 321 older Speed questions you'd kept or rejected, ChatGPT is a bit stricter than Gemini. Most of the extra
    ones it fails have real problems, e.g. "Which British pop group sang Dancing Queen?" (ABBA is Swedish), a disputed
    "first female pharaoh", and questions that give the answer away. Those are live questions in the game today.
  - The pass mark stays at 3 for both games.
- **Also fixed:** the writer's token count, which read 0 for Live.
- **Cost:** no new money. Calibration used about 238,000 tokens of your ChatGPT plan, plus $0.05 of Gemini to compare
  the two fairly. Grading adds an estimated 20,000–40,000 plan tokens a day. The 4d re-trial will measure it.
- **Is it live?** No. Not committed, not deployed, and the private writer repo doesn't have it yet.
- **Your answers (2026-11-18):** ship it; D36 as recommended (the Gemini backup writer is now off; the repeat check
  and tagging move to OpenAI later, as their own phase); the 7 trial Speed questions are Kept; and a new Phase 4e
  lets you send any Speed question to ChatGPT to become a Live question.

## For the next agent

### 1. Next phase and scope
1. **Ship 4d.1** (Andrew's OK first): new branch from `origin/main` (this branch, `feature/live-report-sheet-hold`, is
   already merged; main is ahead of it), commit the files in §4, PR, merge, wait for the production deploy, then copy
   `tools/question-writer/{write.mjs,grade.mjs,README.md,.github/workflows/write-questions.yml}` to
   `AndrewSerulneck/hightop-question-writer`. **Deploy the site before copying the writer.** The old site ignores
   `grade` and `graderModel` (`parsePost` reads only `slot` and `payload`), so either order is safe. Site first just
   means the first graded batch is used.
2. **Resume 4d** (plan §4 "Phase 4d", step 1): a re-trial on a new UTC day (dispatch the writer, then Trivia Nightly by
   hand), Andrew rates, check the pass rules, report the token usage of writing + grading, then uncomment the writer's
   `schedule` (00:30 UTC) in both copies.
3. **D36** (new, open): see §7.

Out of scope: moving the repeat check off Gemini (frozen evaluation gates; that's D36's call), Live's
one-category-a-night design.

### 2. Starting state
- Branch `feature/live-report-sheet-hold` at `4801de9d`. That commit is already in `origin/main` (PRs #22, #23 merged).
  All 4d.1 work is **uncommitted** in the working tree (list in §4).
- **No migration, no database write, no env/variable change.** Reads only: the Phase 2 calibration rows, the
  2026-11-17 candidates and their Quick Review marks.
- Paid calls: one Gemini comparison run, $0.0528 (321 Speed rows at `bar-test-v5` + 50 Live at `bar-test-live-v3`).
  ChatGPT calibration ran locally with `codex exec` on Andrew's plan: speed 148,019 tokens, live 20,145, trial 69,714.
- Private repo `AndrewSerulneck/hightop-question-writer`: unchanged since 4d (`WRITER_GAMES=speed,live`,
  `CODEX_MODEL=gpt-6-astra`, schedule still commented out).
- Trial ratings (checked 2026-11-18): Live 9/9 `keep`; Speed 7 still `pending_review` with no mark.
- Repo rule added this session (Andrew's request): CLAUDE.md §Trivia content and AGENTS.md say "OpenAI / ChatGPT first"
  for any question-pipeline AI step. Memory `feedback_prefer_chatgpt_over_gemini.md` updated.

### 3. Decisions made (don't re-ask)
- **D35** (2026-11-17): ChatGPT grades the whole bar test for both games; Gemini only for fallback/ungraded items.
- **D36 preference** (2026-11-18, Andrew): "rely primarily or even exclusively on OpenAI (ChatGPT) models … for the
  nightly trivia writer and anything else as well." Which remaining uses to move is still open (§7).
- Thresholds stay 3 for both games (calibration below). `QUESTION_WRITER_*_THRESHOLD` variables stay unset.
- Grading effort `medium` (writing stays `high`), via `CODEX_GRADE_EFFORT`. Calibrated at medium.
- Gemini's prompt text is unchanged, so its version stays `bar-test-v5` / `bar-test-live-v3`; only ChatGPT grades are
  `bar-test-v6` / `bar-test-live-v4` (a plan deviation, recorded in the plan's 4d.1 "Done" note).

### 4. Files
- `lib/speed-trivia-quality/audience.cjs`: `RUBRIC` + `EXAMPLES_TEXT` split out of `SYSTEM` (Gemini prompt byte-identical,
  checked); `GRADE_VERSION`; `cleanGrade`; `parseReply(text, count, modelFlags)`; `gradeSchema`, `buildGradeBlock`,
  `gradeBlock({kind,today})` (Current Events: date + search + sourceUrl + "never flag dated" + "US news" rules);
  `makeWriterGrade` / `writerGrade` (version must match, model label checked, flags of that game only);
  `audienceFor(..., version)`; `audienceFromWriter(row, grade)`.
- `lib/live-trivia-quality/audience.cjs`: the same for Live (`GRADE_VERSION`, `gradeBlock`, `writerGrade`,
  `audienceFromWriter`); `parseReply` now delegates to Speed's with Live flags.
- `lib/question-writer/brief.cjs` (+ `.d.cts`): each prompt carries `grade: {version, webSearch, fields, prompt, schema}`.
- `lib/question-writer/candidates.cjs` (+ `.d.cts`): `parsePost` reads `body.graderModel` and `items[].grade`, keeps a valid
  grade as `payload.grade` (`{version, model, familiar, fun, estCorrect, flags}`), drops an invalid one (never the
  item), returns `graded`. `app/api/question-writer/candidates/route.ts` returns `graded`.
- `lib/question-writer/process.cjs`, `liveProcess.cjs`: step 3 uses `writerGrade(payload.grade)` →
  `audienceFromWriter`; only ungraded items go to the Gemini scorer (created only if needed); `report.graded =
  {chatgpt, gemini}`; bar-test rejects store `audience`.
- `tools/question-writer/grade.mjs` (new): `gradeItems`, `attachGrades`, `tokensUsed`. `write.mjs`: after each writing
  prompt, one grading `codex exec` (`--search` for Current Events) at `CODEX_GRADE_EFFORT`; posts `graderModel`; logs
  `graded`/`gradedReceived`; token count read from stderr only (fixes Live `tokens: 0`). Workflow passes
  `CODEX_GRADE_EFFORT`; README updated.
- `scripts/calibrate-chatgpt-bar-test.mjs` (new): re-runnable calibration (read-only DB, local codex).
- Tests: `tests/tools.question-writer-grade.test.ts` (new); new cases in `tests/lib.question-writer.test.ts` (grade
  blocks, grade parsing, 40 graded items < 64 KB), `tests/scripts.question-candidates.test.ts`,
  `tests/scripts.live-question-candidates.test.ts`.
- Docs: plan (status line, 4d.1 "Done" note, D36 row), this note, the calibration JSON
  `docs/speed-trivia-backlog-and-quality-plan_PHASE_4D1_CALIBRATION_chatgpt-gpt-6-astra_2026-11-18.json`.
  `CLAUDE.md`, `AGENTS.md` (OpenAI-first rule).

### 5. Facts and traps
- `codex exec` prints `tokens used\n17,101` on **stderr** after the answer, and the answer itself on stdout. The old
  shared 4,000-char tail lost it whenever the answer was long (Live's 24 items).
- `AGENTS.md` and `agents.md` are the same file (case-insensitive disk, one inode). Edit one.
- `npm run lint` shows 309 errors, all in git-ignored `tmp/` copies (e.g. `tmp/group-games-phase-4/`). There are none
  in tracked code. Not caused by this phase.
- The writer's grades are trusted like its questions (same token). The free pre-checks (`preChecks`) are still
  merged into every score on the server, and the repeat check still runs.
- Phase 2 "keep" labels are old approvals from before the quality bar; ChatGPT fails about 16 of them for real defects. Calibration
  numbers in the plan's 4d.1 "Done" note. Active Speed questions with factual errors spotted: ABBA called "British",
  two "first female pharaoh" (Hatshepsut is disputed: Sobekneferu was earlier), "longest mountain range" (Andes vs the
  mid-ocean ridge). Not changed; offer Andrew a fix list.
- Grading tokens per call: ~19k for 40 regular Speed items at medium; Current Events with search costs more (the
  trial's 4 calls, 40 items incl. 5 searched, were 69.7k).

### 6. Build, run, test
- `npm run test` → 581 files, 7,564 passed, 13 skipped. `npx tsc --noEmit` clean. `npm run build` passes.
  Lint clean outside `tmp/`.
- Calibration: `node --env-file=.env.local scripts/calibrate-chatgpt-bar-test.mjs --out <file> [--only speed|live|trial]
  [--effort medium] [--concurrency 3]` (needs a local `codex` logged in to ChatGPT; read-only on the database).
- Unverified until the re-trial: a real `codex --search exec` grading call **inside GitHub Actions** (it worked
  locally), the writer posting grades to production, and the nightly using them (`report.graded`).

### 7. Open questions for Andrew
- **Ship 4d.1?** (PR, merge, deploy, copy the writer.)
- **D36: remaining Gemini uses.** After 4d.1, Gemini still runs in the main repo's nightly:
  (a) the fallback writer on days ChatGPT sends nothing (≤ $0.10/game/day);
  (b) the bar test for items without a valid ChatGPT grade;
  (c) the Speed and Live repeat checks (~$0.10/night Speed, ~$0.01 Live; the Speed checker's gates were tuned on
  Gemini, so a switch needs re-evaluation);
  (d) question tagging (`lib/question-variety/tagging.cjs`) and backlog re-scores.
  ChatGPT-plan steps can only run in the private writer repo (that's where the login is), so the options are:
  1. **OpenAI API in the main repo** (needs an `OPENAI_API_KEY`, pay-per-use): replace (a)–(d). The cost is likely a
     similar few cents a night, but measure it before switching. (c) needs a re-evaluation.
  2. **Drop the Gemini fallback writer** (a): no new questions on a day ChatGPT fails. Free and simple.
  3. **Move checks into the private writer** (ChatGPT plan, $0): possible for (b) (already done), harder for (c),
     which needs the whole question bank.
  Recommendation: 2 now (cheap, matches "exclusively"), then 1 for (c)/(d) as its own phase with a cost baseline.

### 7a. Update 2026-11-18 (after Andrew's answers)
- Ship approved. D36 answered: `trivia-nightly.yml` now passes `--no-fallback` for both games and no longer sets
  `QUESTION_WRITER_FALLBACK_MAX_DOLLARS` (the code path stays, unused). The OpenAI-API phase for (c)/(d) is not yet
  written into the plan; add it after Phase 5 with a cost baseline.
- The 7 Speed trial questions were Kept on 2026-11-18 through the signed `speed_trivia_quick_keep` RPC (all 7
  `approved`; ids e2b70311…, b915192d…, da784358…, d2ec69b8…, aa6bfd44…, af0b2c9d…, 1b3284f3…).
- New Phase 4e (D37, Speed → Live conversions) is in the plan, after the 4d re-trial.

### 8. Recommended first steps
1. Get Andrew's OK, then ship (§1.1). Opus 5.5 / medium is enough for the shipping steps.
2. Re-trial (4d step 1) on the next UTC day; check `report.graded` shows `chatgpt` counts and Current Events reach
   Quick Review.
3. Write D36's answer into the plan as a new phase with its model/effort row (Opus 5.5 / high if the repeat check
   moves; it's a shared engine).
