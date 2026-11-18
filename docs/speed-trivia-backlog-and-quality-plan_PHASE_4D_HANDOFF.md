# Phase 4d handoff: trial run (paused for Phase 4d.1)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4d — trial run, then daily". Started 2026-11-17 on
Opus 5.5 / medium (the plan's tier). Step 1 (trial run) is done. Steps 2–4 are waiting: Andrew's ratings, and Phase
**4d.1** (ChatGPT bar test, D35), which was added because the trial showed Current Events can't pass the Gemini bar test.

## For Andrew (plain English)

- **What happened:** ChatGPT wrote today's batch for both games (16 Speed, 24 Live) and the site checked them.
  - **Speed:** 7 are waiting in Quick Review (Source: ChatGPT). 4 more good ones were held back only because the daily
    target (7 regular) was full. The 5 news questions were all rejected (see below).
  - **Live:** 9 are waiting in Quick Review's Live mode. 15 were rejected as repeats of questions you already have
    (correctly: Ides of March, Waterloo, D-Day, Magna Carta…). Live writes one category a night; today was History.
- **The problem:** the scoring AI (Gemini) knows nothing from 2026, so it marked every news question "possibly wrong".
  You chose to have ChatGPT do all the scoring instead. That's new **Phase 4d.1**, added to the plan.
- **Cost:** $0.11 (Speed $0.10, Live $0.007). ChatGPT used about 62,000 tokens of your plan for Speed (Live's count
  didn't record; 4d.1 fixes that).
- **Is anything new live?** No code changed. The writer repo is now set to write both games. The writer's daily
  schedule is still off.
- **Needs you:** rate the 16 waiting questions (Keep or Reject) in Admin → Quick Review: 7 Speed (Source: ChatGPT)
  and 9 Live (Live mode). I checked every fact and found nothing wrong; the list is in §2 below.

## For the next agent

### 1. Next phase and scope
**Phase 4d.1** (plan §4 "Phase 4d.1 — ChatGPT bar test (D35)"), Opus 5.5 / high. Then resume 4d at its step 1 with a
re-trial on a new UTC day, Andrew rates, check the pass rules, tune thresholds, turn on both schedules, report Codex usage.
Out of scope for 4d.1: moving the repeat check off Gemini (frozen gates), changing Live's one-category-a-night design.

### 2. Starting state
- Branch `feature/live-report-sheet-hold`, last commit `74ce47cb`. Only uncommitted change from this phase: the plan
  doc (4d.1 section, table row, D35, status line, order line) and this note. Production code = main (PR #22).
- **Private repo** `AndrewSerulneck/hightop-question-writer`: variable `WRITER_GAMES=speed,live` set 2026-11-17 16:40
  UTC (was unset → `speed`). Workflow file unchanged; the `schedule` is still commented out (turned on at the end of 4d).
  Its `write.mjs` and workflow match `tools/question-writer/` exactly (diffed).
- **Writer run** 44128366101 (dispatch, 16:40 UTC, 5 m 50 s): Speed 16 written/received, 62,069 tokens; Live 24
  written/received, `tokens: 0` (regex miss). "Save the refreshed login" step passed; the login hadn't changed, so the
  secret wasn't rewritten (`CODEX_AUTH_JSON` still dated 16:15:07 UTC). The rewrite path itself is still unexercised.
- **Trivia Nightly** run 44129602915 (dispatch, 2 m 0 s, success). Reports downloaded (not kept in the repo):
  - Speed: examined 16, rejected `bar-test` 5 (all Current Events, score 1), admitted 7 regular, skipped 4
    (`daily-target`), $0.1033.
  - Live: examined 24, rejected `repeat` 15, waiting 9 (regular), $0.0070.
- **Production data written by this phase:** `question_writer_runs` rows (speed, 2026-11-17) and (live, 2026-11-17);
  40 `question_candidates` rows for run_date 2026-11-17; 7 Speed `trivia_questions` rows `pending_review` with
  `speed_trivia_review_marks` scores. Today's UTC day is used for both games: a second, different batch today gets 409.
- Tonight's scheduled Trivia Nightly (2026-11-18 02:15 UTC) finds no ChatGPT batch for the 18th, so the Gemini fallback
  writes regular slots (≤ $0.10 per game, D13) as already approved. Expected; not a fault.

**The trial batch (for rating; facts checked by Claude, all correct):**

| Game | Status | Score | Question → answer |
|---|---|---|---|
| Speed | waiting | 4 | Who takes up the Black Panther mantle in *Wakanda Forever*? → Shuri |
| Speed | waiting | 4 | U.S. secretary of defense at the 2003 Iraq invasion? → Donald Rumsfeld |
| Speed | waiting | 4 | First railroad after GO on a U.S. Monopoly board? → Reading Railroad |
| Speed | waiting | 4 | Dinosaur with two rows of bony plates? → Stegosaurus |
| Speed | waiting | 5 | Park with El Capitan and Half Dome? → Yosemite |
| Speed | waiting | 4 | Dog bred to hunt badgers? → Dachshund |
| Speed | waiting | 4 | 1972 Album of the Year Grammy for *Tapestry*? → Carole King |
| Speed | skipped (target) | — | Lennox Lewis (Tyson 2002) · HTTPS "Secure" · Wii Sports bowling 300 · pancreas |
| Speed | rejected, 1 | 1 | Current Events: Spain (World Cup 2026) · Tom Cruise (*Digger*) · Greenland · Tiramisu · Spain (eclipse) |
| Live | waiting | 4 | Department created after 9/11 → Homeland Security |
| Live | waiting | 4 | Venetian traveler at Kublai Khan's court → Marco Polo |
| Live | waiting | 4 | Iraqi dictator overthrown in 2003 → Saddam Hussein |
| Live | waiting | 4 | State of the Salem witch trials → Massachusetts |
| Live | waiting | 5 | "Tear down this wall!" → Ronald Reagan |
| Live | waiting | 5 | "Yes We Can" 2008 → Barack Obama |
| Live | waiting | 3 | Co-wrote *The Communist Manifesto* with Engels → Karl Marx |
| Live | waiting | 4 | 1920s bobbed-hair young women → Flappers |
| Live | waiting | 4 | 2014 Ice Bucket Challenge disease → ALS |

### 3. Decisions made (don't re-ask)
- **D35 (Andrew, 2026-11-17):** ChatGPT grades the whole bar test for both games; Gemini only on fallback days. He
  first picked "Gemini with web search" for Current Events, then said "we should be relying on ChatGPT for this, not
  Gemini. It's better", and chose "All of the bar test" over "Current Events only".
- **"Candidates marked as a trial" (plan step 1):** no trial flag exists; the trial is identified by `run_date
  2026-11-17` (and the re-trial by its date). No column was added.
- **Cost caps used:** the approved nightly caps (`SPEED_TRIVIA_MAX_DOLLARS=0.50`, Live default $0.25). Actual $0.11.

### 4. Files
- Changed: `docs/speed-trivia-backlog-and-quality-plan.md`; new: this note. Scratch scripts (not kept):
  `dump.cjs` (read today's candidates), `rescore.cjs` (re-score the 5 Current Events with the live scorer, $0.0011),
  `scores.cjs` (read `speed_trivia_review_marks` for the admitted rows) in the session scratchpad.

### 5. Facts and traps
- **Root cause, measured:** re-scoring the 5 Current Events rows with `audience.createAudienceScorer` (bar-test-v5)
  gave each `{familiar 1, fun 1, estCorrect 25, flags [dated, possibly-wrong]}`. The cap flags force ≤ 2 and the
  composite gives 1. Same for Live's scorer on its Current Events nights (1 in 9, by rotation).
- Rejected candidates don't store their `audience`; only the reason `bar-test:<score>`. Admitted Speed scores are in
  `speed_trivia_review_marks.audience` (not on `trivia_questions`). Live waiting scores are on `question_candidates.audience`.
- Candidate `payload` (Speed) has `question`, `options`, `correctIndex`, `subject`, `area`, `era`, `whyTrue`,
  `sourceUrl`, `difficulty`; Live has `answer` and `acceptableAnswers`. `core.content()` needs `status`,
  `question_pool`, `answer_format` and `correct_answer` (index) on a row.
- **Live pass rules:** Live writes one category a night (`slots.nightPlan`), so "≥ 5 categories" can't hold in one Live
  run. Judge Live by areas/eras: today 5 areas, 7 eras, no subject twice. 62% repeats is high for History (the avoid
  list holds only subjects at the cap or inside the gap, so a subject with one well-known fact isn't listed); the repeat
  check caught them for $0.007. Consider sending Live's existing facts for the night's category to the writer later.
- Speed pass-rule check on the trial (before ratings): no subject twice ✓; 9 categories written, 7 among admitted ✓;
  15 distinct areas written ✓; Current Events sources: all 5 were https links to real-looking pages (not opened); no
  loose superlatives ✓; Why notes all correct ✓.

### 6. Build, run, test
- Trial commands: `gh variable set WRITER_GAMES -b "speed,live" -R AndrewSerulneck/hightop-question-writer`;
  `gh workflow run write-questions.yml -R AndrewSerulneck/hightop-question-writer`; then `gh workflow run
  trivia-nightly.yml`; `gh run download <id> -D <dir>` for the two reports.
- No code changed, so no tests run.
- Codex usage vs the Pro plan's limits: not checked yet (can't read the plan's meter from the CLI). Writing alone was
  ~62k tokens for Speed; the 4b trial measured ~21.5k + ~51k. Re-measure in the 4d re-trial, with grading added.

### 7. Open questions for Andrew
- His Keep/Reject on the 16 waiting questions (keep rate ≥ 70% per game is a pass rule).

### 8. Recommended first steps
1. Phase 4d.1 per the plan (Opus 5.5 / high). Start by reading `lib/speed-trivia-quality/audience.cjs`, the Live bar test
   (`lib/live-trivia-quality/`), `lib/question-writer/{brief,candidates,process,liveProcess}.cjs` and
   `tools/question-writer/write.mjs`.
2. Calibrate the ChatGPT grader for free before wiring it in, so a bad prompt is caught early.
3. Then resume 4d: re-trial on a new UTC day, Trivia Nightly by hand, Andrew rates, check pass rules, set thresholds,
   uncomment the writer's `schedule` (00:30 UTC) in both `tools/question-writer` and the private repo, report usage.
