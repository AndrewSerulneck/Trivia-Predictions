# Speed Trivia backlog plan — Phase 2 handoff (bar-test scorer)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md`. Previous: `speed-trivia-backlog-and-quality-plan_PHASE_1_HANDOFF.md`.

## For Andrew

- **Every waiting question now has a "bar test" score from 1 to 5.** The score measures how familiar and how fun the
  question is to a typical American adult at a bar trivia night. The scores sit in a file and are **not in the
  database yet**: that needs your OK for one database change (below).
- **Quick Review gains a Score filter and a "Best score" sort** (now the default). The card shows the score and, in
  plain words, why a question scored low (Niche, Long, Two sentences, Gives it away, Answer may be wrong…).
- **What the scores mean (tested against your own past decisions):**
  - **Score 1** is safe to reject in bulk. Of 200 questions you approved earlier, only 4 (2%) scored 1. Of the 19
    recent questions you deleted, 9 scored 1.
  - **Score 5** never matched a question you deleted (0 of 19). Spot-check a few, then "Keep all shown".
  - **What's waiting, by score:** 311 score 1, 841 score 2, 1,427 score 3, 2,915 score 4, 1,839 score 5. The recent
    nightly-writer questions are the problem group: **190 of the 352 score 1** and only 3 score 5. Older questions
    are mostly 4–5.
  - **Your time, estimated:** reject the 311 at score 1 in one action, keep the 1,839 at score 5 in one action after a
    spot-check, then about 2–3 seconds each for the 5,183 in between (roughly 3½ hours, in sittings). If score 4 looks
    good on a spot-check too, bulk-keeping it cuts that to about 1½ hours.
  - **Scores 2–4** are worth a quick look. The scorer is stricter than your older approvals (it marks things like
    "Pankration", "tachyon" or "Peace of Westphalia" as niche), which fits your new bar.
- **Cost: about $1.09** ($1.01 to score all 7,333, plus $0.08 for two calibration runs), under the $2 cap. Flash-Lite turned out to be
  unavailable on our Google key, so this used Gemini 2.5 Flash.
- **Needs you:**
  1. **OK to apply the database change to production** (`supabase db push`)? It adds one function to store scores
     and lets Quick Review filter and sort by them. It changes no questions. After that I load the scores (free).
  2. **Merge timing.** You asked to merge after the end-of-plan review, which means Quick Review isn't usable on the
     live site until then. If you want to start the backlog sooner, merging this PR now is safe: Phases 0–2 never
     approve anything without your click, and the nightly writer stays off.
  3. Still open: **D5–D8**, and D7 (the audience definition the scorer uses: "a typical American adult, aged 21 to
     45, at a bar trivia night").

## For the next agent

### 1. Next phase goal and scope

**Phase 3 — overnight Keep queue and a faster repeat check** (plan §4 Phase 3). Process `keep` marks with
`outcome='queued'` whose row is still `pending_review` and whose `content_hash` still matches; approve unique ones,
retire confirmed repeats (needs D8), leave uncertain as `needs-look`. Measure the old vs new checker on 50 kept rows
first (≤ $1.50, D4). **Out of scope:** the writer rewrite (Phase 4), re-enabling nightly, any automatic rejection by
score.

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19 (https://github.com/AndrewSerulneck/Trivia-Predictions/pull/19),
  **not merged** (Andrew: merge after the end-of-plan code review). Commit `6ebfe9ba` = Phases 0–1; Phase 2 is the
  next commit on the same branch. Nothing is deployed to production; Vercel builds a preview per push.
- Preview deploys lack `SPEED_TRIVIA_ADMISSION_SECRET` (Production only), so Keep returns 503 there. Reject, Undo and
  the queue work. Don't copy the signing secret to Preview without Andrew's decision.
- Migrations: `20261115151703_speed_trivia_quick_review.sql` **applied** (Andrew ran `supabase db push`, 2026-11-15).
  `20261115153905_speed_trivia_bar_test_scores.sql` **NOT applied**. It needs Andrew's OK.
- Scores: `docs/speed-trivia-backlog-and-quality-plan_PHASE_2_SCORES_2026-11-15.jsonl`, one JSON line per waiting
  question (`id`, `contentHash`, `audience`). 7,333 rows (every waiting question at 2026-11-15), 184 calls, 0 failures, 5.6 minutes. **Not written to the database.** After the migration:
  `node --env-file=.env.local scripts/score-speed-trivia-backlog.cjs --write docs/speed-trivia-backlog-and-quality-plan_PHASE_2_SCORES_2026-11-15.jsonl --apply`
  (free; it skips rows that changed or were decided since scoring).
- Production data: unchanged by Phase 2. 7,333 waiting (6,981 older + 352 recent), 0 marks (read 2026-11-15).
- Nightly writer still disabled.

### 3. Decisions made (and why)

- **Andrew, 2026-11-15: D3 = review the recent questions** in Quick Review (don't reject them all).
- **Model: `gemini-2.5-flash`**, thinking off, temperature 0, response schema enforced, 40 questions per call.
  `gemini-2.5-flash-lite` is listed by the models API but returns **404 on `generateContent`** for our key. A 404 isn't
  billed; the script still counts the reservation against its cap (budgets never refund lost attempts).
- **Calibration labels:** keep = 200 older approved rows (25 per category, fixed hash sample); reject = the 19 recent
  rows Andrew deleted. The 22 recent rows he approved earlier are reported separately: many are obscure
  (Welwitschiaceae, endothelial cells), so they're noisy labels for his current bar. Older deleted rows have no
  recorded reason (repeats mixed with quality deletes), so they're only shown as a distribution.
- **Prompt examples are not calibration rows.** Good examples are real approved questions excluded from the sample by
  exact key; bad ones were written for the prompt.
- **Composite score** (`compositeScore`): `round((2·familiar + fun) / 3)`, −1 for long or two-sentence wording, −1 when
  fewer than 15% would get it right; capped at 2 for give-away, list answer, ambiguous or possibly-wrong.
- **"multi-answer" means three or more items only.** "Which two NFL teams…" is a fine question; the first calibration
  run capped those wrongly, so the rule was narrowed and calibration re-run.
- **The score is a sort and a filter, never a delete** (standing rule).
- **Stale scores:** a score stores `md5` of the graded fields (`speed_trivia_audience_key`). If an edit changes the
  question, the queue treats it as unscored. Computing the full `speed_content_hash` over all waiting rows took 5.6 s
  in production, too slow for each page.
- **Default sort is now "Best score"** (score high→low, then oldest). Unscored rows sort last, as score 0.

### 4. Calibration results (Gemini 2.5 Flash, `bar-test-v1`, 2026-11-15)

Full detail per question: `docs/speed-trivia-backlog-and-quality-plan_PHASE_2_CALIBRATION_gemini-2.5-flash_2026-11-15.json`.

| Reject at or below | Older approved lost (of 200) | Recent deleted caught (of 19) | Recent approved (of 22) |
| --- | --- | --- | --- |
| 1 | 4 (2%) | 9 | 8 |
| 2 | 32 (16%) | 15 | 16 |
| 3 | 77 (39%) | 18 | 20 |
| 4 | 155 (78%) | 19 | 22 |

Score distribution by group: keep `{1:4, 2:28, 3:45, 4:78, 5:45}`; reject `{1:9, 2:6, 3:3, 4:1, 5:0}`; recent approved
`{1:8, 2:8, 3:4, 4:2, 5:0}`; older deleted (unlabelled, 80) `{2:8, 3:17, 4:34, 5:21}`. Two runs at temperature 0
gave nearly the same table. **Threshold under the plan's ≤5% rule: reject at score 1.** Rejects that scored 3+:
Frank Gehry/Bilbao, Mason jar (the answer's premise looks wrong; the model missed it), limestone and buttons (long and
dull, but familiar).

### 5. Backlog score distribution (all waiting questions)

Scored 2026-11-15, all 7,333 waiting questions, `bar-test-v1` on Gemini 2.5 Flash.

| Group | 1 | 2 | 3 | 4 | 5 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Older | 121 | 752 | 1,374 | 2,898 | 1,836 | 6,981 |
| Recent | 190 | 89 | 53 | 17 | 3 | 352 |
| **All** | 311 | 841 | 1,427 | 2,915 | 1,839 | 7,333 |

| Category | 1 | 2 | 3 | 4 | 5 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Animals | 21 | 102 | 197 | 415 | 237 | 972 |
| General Knowledge | 75 | 68 | 95 | 263 | 126 | 627 |
| Geography | 50 | 119 | 259 | 399 | 116 | 943 |
| History | 37 | 124 | 188 | 391 | 171 | 911 |
| Music | 36 | 111 | 144 | 264 | 368 | 923 |
| Pop Culture | 4 | 57 | 92 | 272 | 569 | 994 |
| Science | 82 | 164 | 233 | 369 | 50 | 898 |
| Sports | 6 | 96 | 219 | 542 | 202 | 1,065 |

Flags: too-long 749, niche-subject 591, answer-in-question 88, preamble 66, multi-answer 24, bad-distractors 6,
dated 2, ambiguous 1, possibly-wrong 1. Science runs hardest (only 50 at score 5); Pop Culture easiest.

**Phase 3 cost warning:** every older question Andrew keeps goes to the paid repeat check. Keeping score 4–5 alone is
~4,700 older rows, which is **~$150 at today's ~$0.032/question**, or ~$70 at the Phase 3 target of ≤ $0.015. Measure
first (D4, $1.50), then get Andrew's budget before processing the queue.

### 6. Files created or changed

- `lib/speed-trivia-quality/audience.cjs` (new, shared with Phase 4): `preChecks` (free: `too-long` > 120 chars,
  `preamble`, `multi-answer`, `answer-in-question`), `compositeScore`, `buildPrompt` (short ids, data marked
  untrusted), `parseReply` (one valid grade per id or throw), `audienceFor`, `createAudienceScorer({model, apiKey,
  budget, transport})` → `scoreBatch(rows ≤ 50)`. Reserve-then-settle budgeting via `runtime.cjs` `createBudget`.
- `scripts/score-speed-trivia-backlog.cjs` (new): dry run (free estimate), `--calibrate`, `--score --out` (resumable
  JSONL, rescoring only rows whose content changed), `--write <file> [--apply]`. 4 concurrent calls; a failed batch is
  retried once, then left for a rerun.
- `supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql` (new, not applied):
  `speed_trivia_audience_key(trivia_questions)`, `speed_trivia_review_set_audience(jsonb)` (security definer; writes
  only `audience`, only for waiting Speed rows whose `speed_content_hash` matches), and `speed_trivia_review_queue`
  recreated with `p_score_min`, `p_score_max`, `p_after_score` (default null) and `sort='best'`. All revoked from
  public/anon/authenticated, execute to `service_role`.
- `lib/speedTriviaQuickReview.ts`: `parseQuickReviewFilter` (adds `score`, default sort `best`),
  `parseQuickReviewCursor` (adds `afterScore`), queue call passes the band and score cursor.
- `types/speedTriviaQuickReview.ts`: `QuickReviewAudience`, `score` on the filter, `audience` on items, sort `best`.
- `app/api/admin/trivia/quick-review/route.ts`: `score`, `afterScore` on GET; `score` on bulk.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`: Score select, Best score sort, score and flag words on card.
- Tests: `tests/lib.speed-trivia-audience.test.ts` (new), `tests/speed-trivia-bar-test-sql.test.ts` (new, PGlite),
  `tests/api.admin.speed-trivia-quick-review.test.ts` and `tests/components.speed-trivia-quick-review.test.ts` (extended).
- Data files: the calibration JSON and the scores JSONL above (audit records; keep them).

### 7. Facts and traps

- The route must be deployed **after** the migration: the new code sends `p_score_*` arguments the old function
  doesn't have. The new function keeps the old six-argument call working, so the migration can go first safely.
- PGlite: `db.query` with parameters can't run several statements; use `db.exec` for the trigger toggles.
- `supabase db query --linked` output ends with extra lines after the JSON; parse with `JSONDecoder().raw_decode`.
- The model sometimes misses wrong facts (Mason jar → "Ezra Warner"; it was John Landis Mason). `possibly-wrong` is a
  hint, not a check.
- The scorer's stricter bar means "Keep all shown" at score 4 would still include some niche questions; score 5 is
  the bulk-keep band.

### 8. Build, run, test

- `npm run test` → **544 files passed, 1 skipped (7,130 tests)**, 2026-11-15. `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` → empty. `npx eslint` on all Phase 2
  files → clean.
- Targeted: `npx vitest run tests/lib.speed-trivia-audience.test.ts tests/speed-trivia-bar-test-sql.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts`.
- **Not verified:** the new migration against real Supabase (PGlite only); the screen in a real browser.
  After the push and `--write --apply`, check:
  `supabase db query --linked "select (audience->>'score')::int s, count(*) from speed_trivia_review_marks where audience is not null group by 1 order by 1"`
  should match §5, and Quick Review → Score 1 should show that count.

### 9. Open questions / waiting on Andrew

1. OK to `supabase db push` the Phase 2 migration (then load scores, free).
2. Merge now vs after the end-of-plan review.
3. D5, D6, D7, D8. Phase 3 needs D8; D4 ($1.50) covers its measurement.
4. Model choice for later phases: see the plan's §3 model note. Recommended: keep Gemini for the scorer and the
   repeat checker, and run a Gemini vs Claude Sonnet 5.5 writer bake-off in the Phase 4 pilot (needs a Claude key
   for Speed Trivia if Andrew agrees).

### 10. Recommended first steps for Phase 3

1. Confirm the Phase 2 migration is applied and scores loaded (§8 check), or ask Andrew.
2. Recalibrate once Andrew has made ~150 Quick Review decisions:
   `select m.decision, m.reason, (m.audience->>'score')::int, count(*) from speed_trivia_review_marks m where m.decision is not null and m.audience is not null group by 1,2,3`.
3. Then plan §4 Phase 3, starting with the 50-row old-vs-new checker measurement (≤ $1.50).
4. Model/effort: **Opus 5.5 / high** (plan §3).
