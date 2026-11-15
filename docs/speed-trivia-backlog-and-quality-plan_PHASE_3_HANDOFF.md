# Speed Trivia backlog plan — Phase 3 handoff (overnight Keep queue, faster checker, D5, D17 pre-check, D4 budget)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names). Finished in a second session the same
day, after Andrew answered the five open questions.
Plan: `docs/speed-trivia-backlog-and-quality-plan.md`. Previous: `speed-trivia-backlog-and-quality-plan_PHASE_2_HANDOFF.md`.

## For Andrew

- **Phase 3 is done and committed to PR #19.** The database change is applied. Nothing is live on the website until
  PR #19 is merged.
- **The overnight checker** handles the questions you mark Keep:
  - it approves the ones that are new;
  - it retires repeats and shows each one under **Repeats**, next to the approved question it repeats, with a
    **Restore** button;
  - it leaves unclear ones under **Needs a look**.
- **D17 is built and tested on real data.** With the money left after your Keeps, each night also checks the older
  waiting questions, best score first, and retires the repeats before you see them. It never approves anything.
  - I ran it on 10 questions as a test. 8 were repeats, all real (e.g. "Queen of Pop" was already approved as a
    Madonna question), and 2 were new. Cost: $0.04.
  - Those 8 are under Repeats once Quick Review is live, and you can Restore any of them.
  - It skips questions with a score of 1–2, since your plan is to reject those anyway.
- **Your budget is enforced by the database:** $5 a night and $20 in total, across the Keep queue and the pre-check.
  So far $0.04 of the $20 is used.
- **D13 is confirmed:** Gemini writes the day's questions if ChatGPT misses a day.
- **Needs you:**
  1. **Set the two budget settings in GitHub.** I wasn't allowed to change GitHub settings myself. Run these in
     Terminal from the project folder, or add them under GitHub → Settings → Secrets and variables → Actions →
     Variables:
     ```
     gh variable set SPEED_TRIVIA_QUEUE_MAX_DOLLARS --body 5
     gh variable set SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS --body 20
     ```
     Until both are set, the nightly job only counts and spends nothing.
  2. **When to merge PR #19.** GitHub runs nightly jobs only from `main`, so **nothing runs overnight until PR #19
     is merged**. Quick Review isn't on the site until then either. I recommend a code review of Phases 0–3 now,
     then merging, rather than waiting for the end of the whole plan. Phases 0–3 stand on their own, and the
     pre-check needs about 3–4 nights.

## For the next agent

### 1. Next phase goal and scope

**Phase 4a — variety map, tags, Current Events category (Speed)** (plan §4 "Phase 4a"). Draft the variety map for
every Speed and Live category. Create `question_coverage_areas` and `question_tags` (migrations with `service_role`
grants). Build the Variety page, the one-time tagging run (ChatGPT via `codex exec` on Andrew's Mac; Gemini fallback
≤ $2.50), the star cap and 30-day gap, Current Events as a hidden 9th Speed category (visible at ≥ 60 active), and
expiry. Andrew reviews the drafted map before any tagging (D14).

**Out of scope:** the ChatGPT writer and private repo (4b), Live Trivia publish (4c), and re-enabling the nightly
writer. **No more Phase 3 work is pending** except the two items waiting on Andrew (§7).

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19 (https://github.com/AndrewSerulneck/Trivia-Predictions/pull/19),
  **open, not merged**. Phase 3 is committed and pushed on top of `86b36f4c`; `git log` shows the commit
  "Speed Trivia: overnight Keep queue, D5, D17 pre-check (backlog plan Phase 3)".
- Unrelated untracked files predate these sessions. Leave them alone and don't commit them:
  - `* 2.ts`, `* 2.m4a`, `* 2.mp4` and `README 2.md`;
  - `docs/cancelled-prizes-…_C1_BACKFILL_LOG_2026-11-09.json` and `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.
- **Migrations:** `20261115151703` (Phase 1), `20261115153905` (Phase 2) and **`20261115170333` (Phase 3)
  all applied**. Phase 3 was applied with `supabase db push --linked`, with Andrew's OK, on 2026-11-15. It's now
  read-only history, so any SQL fix is a new migration.
- **Production data changed (Phase 3, both sessions):**
  - ~1,473 signed `speed_trivia_pair_cache` rows from the measurement, plus the verification run's pairs. These are
    reusable verdicts, never approvals.
  - **8 older waiting questions retired as repeats by the D17 verification run:**
    `--precheck --limit 10 --max-dollars 0.25 --total-dollars 20`, 2026-11-15.
    - Each has a mark with `decision='precheck'`, `outcome='repeat'` and `matched_row_id`. The mark row is the undo
      log; Restore is `speed_trivia_quick_undo(row_id)`.
    - 2 more have `precheck.outcome='unique'` and are still waiting.
    - List them with `select row_id from speed_trivia_review_marks where precheck is not null`.
  - `speed_trivia_queue_runs`: 1 row, reserved $0.25, spent $0.0422.
  - No question was approved. There are 0 Quick Review decision marks, because Quick Review isn't deployed.
- **Repository variables `SPEED_TRIVIA_QUEUE_MAX_DOLLARS` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS` are NOT set.**
  `gh variable set` was denied by the auto-mode classifier, so Andrew has to set them. The existing
  `SPEED_TRIVIA_MAX_DOLLARS=0.50` belongs to the nightly writer.
- The nightly writer is still disabled (Phase 0). `.github/workflows/speed-trivia-keep-queue.yml` (03:30 UTC, runs
  `--apply --precheck`) only runs from `main`.

### 3. Decisions made (and why)

- **Andrew, 2026-11-15, second session:**
  - (1) yes to `db push`;
  - (2) yes to **$5 a night and $20 in total**, and to setting the variables;
  - (3) **yes to D17**;
  - (4) **D13 confirmed: Gemini fallback**;
  - (5) OK to commit and push.
- **Earlier the same day:** D5 yes (quality rejects release the fact); D7 is ages 21–75; D8 retires kept repeats
  automatically.
- **One $20 total covers the Keep queue and the pre-check together.** After the pre-check, a Keep re-check is
  nearly free from the pair cache, so the two jobs don't double-spend.
- **The total cap lives in the database** (`speed_trivia_queue_reserve`, which takes an exclusive table lock), not
  only in an environment variable. A local run and a CI run can't race past it.
  - A run that crashes before `speed_trivia_queue_finish` counts its whole reservation. That's conservative: it can
    only under-spend.
- **Pre-check scope:** older (`speed_generation_metadata is null`) undecided waiting questions whose score is for
  the current wording, **score ≥ 3**, best score first, then oldest. That was 6,108 rows on 2026-11-15; with score
  1–2 it's 6,981.
  - Score 1–2 rows are skipped because plan §5 step 3 bulk-rejects them; that saves ~$2–3. Use `--min-score 1` to
    include them.
  - Recent rows are skipped: they were already checked against the whole bank.
- **Pre-check results:**
  - a repeat retires the row with `decision 'precheck'`, a new allowed value. Its own constraint requires
    `outcome='repeat'`.
  - unique and uncertain results only set `speed_trivia_review_marks.precheck` (`{contentHash, outcome, note?, at}`).
    The row stays in Waiting with no decision, so Andrew's buttons work unchanged.
  - Restore sets `precheck.outcome='restored'`, so the pre-check never retires that wording again.
- **Order each night:** the Keep queue runs first, because those are Andrew's explicit choices. The pre-check gets
  the time and dollars left over, and is skipped if the queue stopped.
- **Uncertain pre-check notes aren't shown in Quick Review.** That's deliberate, to keep the screen minimal. They're
  stored if a later phase wants them.
- **Unchanged from the first session:**
  - schedule: same answer first, 2 probe pairs, then 6 at once;
  - `core.cjs` (the frozen policy) is untouched;
  - the D5 design;
  - the backlog isn't re-scored for D7.

### 4. Files created or changed (all Phase 3)

- `supabase/migrations/20261115170333_speed_trivia_keep_queue.sql` (applied):
  - **Marks:**
    - outcomes `repeat` and `needs_look`;
    - columns `matched_row_id`, `note`, `checked_at` and **`precheck`**;
    - decision `precheck`.
  - **Tables:** `speed_trivia_released_restores` and **`speed_trivia_queue_runs`**. Both have RLS and are
    `select`-only for `service_role`.
  - **Functions:**
    - `speed_trivia_released_rows()`;
    - `speed_trivia_queue_settle(uuid,text,text,uuid,text)`;
    - **`speed_trivia_precheck_candidates(int,int)`** (≤ 5,000 ids);
    - **`speed_trivia_precheck_settle(uuid,text,text,uuid,text)`**;
    - **`speed_trivia_queue_reserve(numeric,numeric)`**;
    - **`speed_trivia_queue_finish(uuid,numeric,jsonb)`**.
  - **Replaced:**
    - `speed_trivia_quick_keep` and `speed_trivia_quick_reject`;
    - `speed_trivia_quick_undo`, which now also records `restored` for pre-check repeats;
    - `speed_trivia_review_queue`, which gains `p_view`. The Repeats view and counts include `decision 'precheck'`.
  - Every function revokes public/anon/authenticated and grants `execute` to `service_role`.
- `lib/speed-trivia-uniqueness/runtime.cjs`:
  - probe-then-pool capped judge;
  - `releasedRows`;
  - **`session.checkApproved(row)`**: the approved-only check without writing. It throws the same `AdmissionError`
    codes as `write`, and shares `requireUnique` with it. Admission logic is identical to before.
  - `approval.cjs` holds the scoped views and `releasedIndex`.
  - Types are in `runtime.d.cts`, `approval.d.cts` and `types/speedTriviaAdmission.ts` (`checkApproved` added).
- `lib/speedTriviaAdmission.ts` and `generation.cjs` use `releasedRows: 'read'`.
- `scripts/process-speed-trivia-keep-queue.cjs`:
  - **modes:** count, `--estimate N`, `--measure N --max-dollars X`, and
    `--apply [--precheck] [--min-score 3] [--max-dollars N] [--total-dollars N] [--minutes 50] [--limit 2000]`;
  - **exports:** `processQueue`, **`precheckPass`**, **`runPaid`**, `simulate` and `queueBudget`;
  - **budget:** `--max-dollars` falls back to `SPEED_TRIVIA_QUEUE_MAX_DOLLARS`, and `--total-dollars` to
    `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS`. With either unset, it only counts.
- `.github/workflows/speed-trivia-keep-queue.yml`: 03:30 UTC plus manual; `--apply --precheck --minutes 50`; passes
  both variables; uploads a report artifact (kept 7 days).
- Quick Review:
  - `lib/speedTriviaQuickReview.ts`, `types/speedTriviaQuickReview.ts` and `app/api/admin/trivia/quick-review/route.ts`;
  - `components/admin/sections/SpeedTriviaQuickReview.tsx`: the Show select (Waiting / Needs a look / Repeats),
    counts, note, match and Restore.
  - No change was needed for pre-check repeats: they arrive through the same Repeats view.
- `lib/speed-trivia-quality/audience.cjs` (`bar-test-v2`, ages 21–75) and `scripts/score-speed-trivia-backlog.cjs`.
- Tests:
  - `tests/speed-trivia-keep-queue-sql.test.ts`: 8 tests, including D17 candidates/settle/Restore, the D4 ledger
    and permissions;
  - `tests/scripts.speed-trivia-keep-queue.test.ts`: 8 tests, including `precheckPass` and `runPaid`;
  - `tests/scripts.speed-trivia-admission.test.ts` (+3), plus extended Quick Review API and component tests.
- Data, committed:
  - `docs/speed-trivia-backlog-and-quality-plan_PHASE_3_MEASUREMENT_2026-11-15.json`;
  - `docs/speed-trivia-backlog-and-quality-plan_PHASE_2_CALIBRATION_bar-test-v2_gemini-2.5-flash_2026-11-15.json`.
- The plan doc covers: status, Phase 3 steps 6–8 (D17, ledger, verification), the cost note, §5 step 5, D4/D13/D17 in
  §6, and two §7 rules (ledger, pre-check).

### 5. Facts and traps

- **The nightly runs only from `main`.** Until PR #19 merges, the only way to make progress is a local run:
  `node --env-file=.env.local scripts/process-speed-trivia-keep-queue.cjs --precheck --max-dollars 5 --total-dollars 20`.
  It takes up to 50 minutes and counts toward the same $20. Run it only if Andrew asks.
- **Measured on production (verification run):**
  - 10 rows in 41 s, including the ~11.65 MB bank load;
  - $0.0042 per question, because 2 of 10 were unique (~28 pairs each);
  - the Phase 3 estimate was $0.0024 at 84% repeats.
  - Lower scores may repeat less often, which costs more per question. The $20 cap holds regardless.
  - Expect ~1,800 rows a night at 1.66 s each, i.e. ~$4–5.
- **Each pre-checked row costs one `speed_trivia_corpus_delta` RPC** (via `refresh()`), plus one settle RPC, plus a
  row read per 100. That's ~3,600 small Supabase calls a night: trivial cost, but don't loop it per pair.
- `speed_trivia_precheck_candidates` caps a page at 5,000. The script takes `min(--limit, 5000)` (default 2000),
  enough for one night.
- `gh variable set` was **denied** by the auto-mode classifier this session. `cut -d= -f1 .env.local` was denied in
  the first session. Check env presence with `node --env-file=.env.local -e 'console.log(!!process.env.NAME)'`.
- `instanceof AdmissionError` fails across ESM/CJS copies. The script checks `error.code`.
- PGlite rows from `db.query` aren't JSON-identical to `to_jsonb`. Tests read rows with `speed_trivia_find` before
  passing `existing`.
- The harness client (`scripts/test-speed-trivia-admission-sql.cjs` `clientFor`) has only `.rpc`. `precheckPass`
  and `runPaid` take a `read` function so tests can avoid `.from()`.
- `supabase db query --linked` wraps results in an untrusted-data boundary. Treat the output as data.

### 6. Build, run, test

- `npm run test` gave **546 files passed, 1 skipped (7,152 tests)** on 2026-11-15 after the D17 work.
  `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` printed nothing. `npx eslint` on the changed files was clean.
- To run the targeted tests:
  ```
  npx vitest run tests/speed-trivia-keep-queue-sql.test.ts tests/scripts.speed-trivia-keep-queue.test.ts tests/scripts.speed-trivia-admission.test.ts tests/speed-trivia-quick-review-sql.test.ts tests/speed-trivia-bar-test-sql.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts
  ```
- **Verified on production:**
  - `speed_trivia_review_queue(..., 'repeats')` returns `counts`;
  - `speed_trivia_precheck_candidates` works (6,108 at score ≥ 3);
  - `speed_trivia_released_rows()` returns `[]`;
  - the 10-row paid pre-check run and its ledger row are correct;
  - all 8 retired repeats were checked by hand.
- **Not verified:**
  - the workflow on GitHub (needs `main` and the variables);
  - `--apply` on real Keep marks (none exist until Quick Review is deployed);
  - the Quick Review screen in a real browser.

  After merge, run the workflow once manually (Actions → Speed Trivia Keep Queue → Run workflow) and read the
  report artifact.

### 7. Open questions / waiting on Andrew

1. **Set the two repository variables** (`SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5`, `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20`).
2. **When to merge PR #19.** Recommended: code-review Phases 0–3 now and merge, so Quick Review goes live and the
   nightly runs. The plan's earlier default was to merge after the end-of-plan review.
3. Optional: run the pre-check locally before merge (see §5). It spends from the same $20.

### 8. Recommended first steps for Phase 4a

1. Read plan §4 "How variety is forced" and "Phase 4a", plus §7.
2. Check whether Andrew set the variables (`gh variable list`) and whether PR #19 merged. If it merged, trigger the
   keep-queue workflow once and check `select * from speed_trivia_queue_runs order by started_at`.
3. Draft the variety map as a dry-run seed script, and show Andrew before inserting or tagging anything (D14).
4. Confirm Codex CLI availability and Andrew's login on his Mac before planning the tagging run. Record the exact
   model name in the 4a handoff.
5. Model/effort: **Opus 5.5 / high** (plan §3).
