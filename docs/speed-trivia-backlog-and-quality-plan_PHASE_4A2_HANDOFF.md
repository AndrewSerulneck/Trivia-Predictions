# Phase 4a.2 handoff — one fact, one question (D26)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` (§4 "Phase 4a.2", D26, §7 "Fact rules").
Written 2026-11-16. **Phase IN PROGRESS: stopped while the ChatGPT fact sort runs.**

## STATE NOW (2026-11-16, late) — read first

- **Cleanup DONE.** Two runs, both with undo logs:
  1. v2 apply, run `6c1502bd-ddd2-4a1a-aea9-af9a1d53489b`: 22 alias tag merges plus 6,600 rows retired, stopped
     part-way by Andrew. Log `docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_THIN_LOG_2026-11-17.json`
     (`result: null`; the database log is the truth).
  2. Reconcile to the v3 plan, run `471498d8-d5e2-4e68-a8df-5f9204434424`: 438 restored (216 live, 222 waiting), 448
     more retired (68 live, 380 waiting). 0 skipped, 0 live rows sent back to waiting. Log
     `docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_RECONCILE_LOG_2026-11-17.json`.
- **Bank after:** Speed has 2,524 active and 2,412 waiting. Andrew OK'd the full list
  (`docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_FULL_LIST.md`, 6,610 removals).
- **Full undo:** run `--undo` on the reconcile log first (it puts back the 448), then `--undo` on the base log. Before
  undoing the base log, take the 438 restored rows out of its `rows`: they are no longer retired, so the RPC would
  skip them anyway.
- **D27 (Andrew):** Speed is multiple choice and players can guess, so it can be much harder than Live. It must still
  be knowable, or at least fairly common knowledge, for the average American.
  - Cleanup `thin-subjects-v3`: facts known 3–5 first, then known 2. Known-1 (specialist-only) facts are dropped,
    unless that would leave the subject empty.
  - Writer `writer-v3`.
  - Speed bar test `bar-test-v4`: `obscure-fact` now means specialist-only.
  - Live keeps the full rule (`bar-test-live-v2`).
  - Written into CLAUDE.md, AGENTS.md, SYSTEM_CONTEXT.md and the plan (D27).
- **Writer volume (Andrew):**
  - Speed stays at 10 a night.
  - Live writes one 15-question round a night from one category. The category rotates through all nine, Current
    Events included (`slots.nightPlan`, `LIVE_ASK` 24, `LIVE_ROUND` 15).
  - Not deployed.
- **Workflows:** Speed Trivia Keep Queue re-enabled 2026-11-16. Trivia Nightly is still disabled until the deploy.
- **Done by Andrew:** 4b steps 1–2 (`SECRETS_WRITE_TOKEN`, `renew-login.sh`). Migration `20261116214747` is pushed.
- **Next:**
  1. Andrew's code review of 4a–4c + 4a.2.
  2. Commit, merge and deploy (D23).
  3. 4d.
- **Open (Andrew):** a Live Trivia difficulty review. The Live JSON is canonical and was never thinned (D10), so it
  needs his explicit OK, and a review list first.

## For Andrew

- **What changed:** your spot-check feedback is now four rules, written in one place and used by the cleanup, the
  writer and the bar test:
  1. One fact, one question.
  2. The *fact* must be widely known, not just the subject.
  3. Spread a subject's questions across kinds of knowledge first.
  4. 5 is a ceiling, not a target.
- **Cleanup:** rebuilt. ChatGPT sorts each subject's questions into facts; code applies the rules. Checked on your
  five subjects:
  - Chameleon keeps 1 (color change).
  - Octopus keeps 2 (eight arms, ink).
  - Beethoven keeps 5: one deafness question, the Fifth, Ode to Joy, Moonlight Sonata, piano.
  - The Nile keeps 5, including "longest in Africa" and ancient Egypt.
  - Koala keeps 3: diet, one fingerprint question, pouch.
- **One rule changed from what I first proposed:** "at most one fact per kind" dropped every Koala fingerprint
  question, so rule 3 became "different kinds first, then other well-known facts".
- **Writer and bar test:** both now judge the fact, not the subject. A new "Obscure fact" flag caps a question's score
  at 2.
- **Nothing is live.** Nothing in the database has changed. All of this is uncommitted, on branch
  `feature/speed-trivia-variety`.
- **Needs you:**
  1. Look at the spot-check page once the sort finishes.
  2. OK the totals.
  3. Push migration `20261116214747` (`supabase db push`).
  4. OK the apply.

## For the next agent

### 1. Goal and scope

Finish Phase 4a.2:
1. Complete the fact sort.
2. Build the plan and the spot-check page.
3. After Andrew's OK and his push of migration `20261116214747`, apply with an undo log.
4. Re-enable the Keep Queue: `gh workflow enable speed-trivia-keep-queue.yml`.

Then the plan resumes with Andrew's code review of 4a–4c (now including 4a.2), commit/merge/deploy (D23), and 4d.

**Out of scope:**
- Live Trivia JSON. It is never thinned (D10).
- Subjects with one question.
- Re-scoring stored bar-test scores.
- Running the new bar test on Gemini. That happens in 4d with the writer.

### 2. Starting state

- **Branch and commits:** `feature/speed-trivia-variety`, last commit `1aa32e4e`. 4a, 4a.1, 4b, 4c and 4a.2 are all
  uncommitted. Never `git checkout -- <file>`, `git stash` or `git reset`.
- **Migration `20261116214747_speed_trivia_fact_retire.sql`:** written and tested in PGlite, **NOT applied.** Andrew
  pushes it; `supabase db push` always asks first.
- **Production data:** unchanged by 4a.2. Reads only.
- **Workflows:** Speed Trivia Keep Queue and Trivia Nightly are both still **disabled**.
- **Fact sort:** started 2026-11-16 in the background on Andrew's Mac:
  ```
  node --env-file=.env.local scripts/speed-trivia-thin-subjects.cjs \
    --facts docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_FACTS.json \
    --aliases docs/speed-trivia-backlog-and-quality-plan_PHASE_4A1_SUBJECT_ALIASES.json
  ```
  - Scope: 1,584 subjects, of which the 5 calibration subjects are done first, so 1,579 were to sort.
  - Measured pace: about 70 questions a minute, so about 2–2.5 hours for ~9,600 questions.
  - It's resumable: re-run the same command. Only unsorted or changed subjects are sent.
  - A ChatGPT usage limit stops it cleanly (`stopped` in its output).
- **Superseded:** the 4a.1 v1 plan files (`..._PHASE_4A1_THIN_PLAN_2026-11-16.json`, `.ties.json`,
  `..._PHASE_4A1_SPOT_CHECK.md`) are history only. `--apply` refuses them with `plan-version-mismatch`.

### 3. Decisions already made

- **D26 (Andrew, 2026-11-16):** build the rules, starting with the cleanup, and include the 1,107 subjects with 2–5
  questions. He wrote "The cleanup include the 1,107 subjects…", read as yes. Re-confirm when showing totals.
- **Rule 3 loosened the same day:** the strict form contradicted his Koala instruction ("drop all but one").
- **`KNOWN_MIN = 3`:** a fact is kept if at least about half the crowd knows it (known 3–5 of 5). Koala fingerprints
  sort as 3, so one is kept, as Andrew asked.
- **Live first within a fact (as D19):** then ChatGPT's clearest wording, then the bar-test score.
- **ChatGPT for the sort (D21):** free.
- **The writer doesn't get each subject's existing facts.** It picks its own subject inside a slot, and the repeat
  check already rejects a same-fact repeat.

### 4. Files

- `lib/question-variety/factRules.cjs` + `.d.cts` (new): the four rules, `KINDS`, `KIND_HELP`, `CEILING`,
  `FACT_RULES_VERSION` (`fact-rules-v1`).
- `scripts/speed-trivia-thin-subjects.cjs` → `thin-subjects-v2`:
  - `--facts` → `sortFacts`. Batches ≤ 80 questions / ≤ 20 subjects per call. `factPrompt` includes calibration
    examples. `checkFacts` requires every question in exactly one fact; a failing subject is asked once more on its
    own. The cache is keyed by `subjectSig` (row ids + content hashes); `--only` and `--limit` narrow it.
  - `--plan` → `makePlan` / `buildPlan` / `applyFactRules`. No model calls. Drop reasons: `little-known`,
    `same-fact` (with `keptId`), `ceiling`.
  - `--apply` writes `docs/..._PHASE_4A2_THIN_LOG_<date>.json` first, then merges aliases, then calls
    `speed_trivia_fact_retire`.
  - `--undo` uses the 4a.1 `speed_trivia_subject_cap_undo`, which shares the log table.
- `supabase/migrations/20261116214747_speed_trivia_fact_retire.sql`: `speed_trivia_fact_retire(run_id, rows)`.
  - Same status, content and tag checks as `speed_trivia_subject_cap_retire`, and the same
    `speed_trivia_subject_cap_log` (so the D5 release and undo work unchanged).
  - No floor of 5. A `keptId` row must still be active or waiting on the same subject (`kept_row_gone`).
  - `service_role` only.
- `lib/speed-trivia-quality/audience.cjs` → `bar-test-v3`: `familiar` judges the fact; `obscure-fact` flag;
  `CAP_FLAGS`; two Chameleon examples.
- `lib/live-trivia-quality/audience.cjs` → `bar-test-live-v2`: the same change, using `speed.CAP_FLAGS`.
- `lib/question-writer/rules.cjs` (+ `.d.cts`) → `writer-v2`: new `AUDIENCE_RULE` without "or at least the topic",
  new `FACT_RULE` in both prompts, and a 4th bad example (a real Chameleon tongue question).
- `components/admin/sections/SpeedTriviaQuickReview.tsx` and `LiveTriviaQuickReview.tsx`: label
  `obscure-fact` → "Obscure fact".
- `scripts/rescore-speed-trivia-checks.cjs`: stamps a pinned `bar-test-v2.1`, the only fix it applies.
- Tests:
  - New: `tests/speed-trivia-fact-retire-sql.test.ts`.
  - Rewritten: `tests/scripts.speed-trivia-thin-subjects.test.ts`.
  - Updated: `tests/lib.speed-trivia-audience.test.ts`, `tests/lib.live-trivia-quality.test.ts`,
    `tests/lib.question-writer.test.ts`, `tests/scripts.question-candidates.test.ts`.
- Plan doc: D26 row, Phase 4a.2 section, phase-table row, §7 "Fact rules", status line.

### 5. Facts and traps

- Prompt order is by `createdAt`, then id (`promptRows`), not by id. A cached sort maps numbers back through it.
- **Data quirk:** some Speed answers carry a letter prefix ("C. Marsupial", "C. Chameleon", "A. Specialized optical
  muscles"). Not fixed here; worth a separate look.
- **Bar test v3 calibration** (free, ChatGPT, one question per fact on the five subjects; production scores on
  Gemini, which wasn't run):
  - 16 of 23 little-known facts scored ≤ 2. Misses: Octopus "three hearts" and "opens jars" (4).
  - 22 of 24 well-known facts scored ≥ 3. Exceptions: Koala fingerprints scored 2, stricter than Andrew; Octopus
    "eight arms" was flagged ambiguous.
- `supabase migration new` hung in this shell after creating the file. The file is fine.
- The full `npm run test` had 2 failures under load (`components.speed-trivia-quick-review` 3c undo,
  `share-pictures-stability`). Both pass alone.
- `npx tsc --noEmit` reports only stale `.next/` types for removed tv-pair routes. Nothing from this work.

### 6. Build, run, test

- Tests:
  ```
  npx vitest run tests/scripts.speed-trivia-thin-subjects.test.ts tests/speed-trivia-fact-retire-sql.test.ts \
    tests/lib.speed-trivia-audience.test.ts tests/lib.live-trivia-quality.test.ts tests/lib.question-writer.test.ts
  ```
  All pass; the full suite is 7,373 passed with 2 load-flaky.
- Plan (free, no writes):
  ```
  node --env-file=.env.local scripts/speed-trivia-thin-subjects.cjs \
    --plan docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_THIN_PLAN_<date>.json \
    --aliases docs/speed-trivia-backlog-and-quality-plan_PHASE_4A1_SUBJECT_ALIASES.json \
    --facts docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_FACTS.json \
    --scores docs/speed-trivia-backlog-and-quality-plan_PHASE_4A1_LIVE_SCORES.json \
    --spot docs/speed-trivia-backlog-and-quality-plan_PHASE_4A2_SPOT_CHECK.md
  ```
  `complete: true` needs every subject sorted.
- Check: `... --apply <plan>`. Without `--yes` it only compares the plan with the database. The auto-mode classifier
  may ask Andrew to approve it because of the flag.
- Apply: `... --apply <plan> --yes`. Only after migration `20261116214747` is applied and Andrew OKs the totals.
- Undo: `... --undo <log> [--yes]`.

### 7. Waiting on Andrew

- Spot check and totals (more live questions retire than 4a.1's 650).
- Confirm the 2–5 subjects are in scope.
- Push migration `20261116214747`.
- Still owed from 4b:
  - `SECRETS_WRITE_TOKEN`: a fine-grained PAT, then
    `gh secret set SECRETS_WRITE_TOKEN --repo AndrewSerulneck/hightop-question-writer`.
  - `bash tools/question-writer/renew-login.sh`, which sets `CODEX_AUTH_JSON`.
- Code review of 4a–4c + 4a.2.

### 8. First steps

1. Re-run the `--facts` command until `toSort` is 0 and `failed` is 0.
2. Run `--plan … --spot …` and show Andrew the totals and the spot-check page.
3. After his OK and his push of the migration: `--apply <plan>` (check), then `--apply <plan> --yes`.
4. Then `gh workflow enable speed-trivia-keep-queue.yml`.

Model: **Opus 5.5 / high** (production data change, migration, shared scorer).
