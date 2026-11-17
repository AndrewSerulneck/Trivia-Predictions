# Phase 4c.5 handoff — writer polish: interesting, no loose superlatives, a "why it's true" note (D30)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.5" (and its "As built" block). Done 2026-11-16 on
Opus 5.5, which is the plan's model (Opus 5.5 / medium).

## For Andrew (plain English)

- **What changed (both Speed and Live):**
  - The writer is now told to make each question interesting by how it frames a fact the crowd knows, and never by
    picking a surprising, little-known fact. Live gets one new bad example: the Percy Spencer / microwave question.
  - The writer may not use "best", "greatest", "most famous", "most popular" or "most iconic" unless an official
    measure settles it (Best Picture, best-selling and so on). The bar test now counts a loose superlative as
    "ambiguous", which caps the score at 2.
  - Every question the writer sends must come with a one-sentence "why it's true" note. With no note, the question is
    rejected. A note over 200 characters is cut short, not rejected. The bar test sees the note as the writer's claim
    and checks the answer for itself.
  - Quick Review (Speed and Live) has a **Why** button next to Source. It shows the note under the answer and stays
    hidden until you press it. Older questions have no note, so they don't show the button.
  - The Live note is never written into the Live JSON files.
- **Is it live?** No. Everything is uncommitted on `feature/speed-trivia-variety`, like 4c.1–4c.3. No database change,
  no data change, no paid call was made.
- **Cost:** the writer runs on your ChatGPT plan, so $0 there. The bar test reads about 1,000 more tokens a day on
  Gemini Flash, under $0.01 a day. Speed Quick Review makes one extra small database read per page that has
  writer-made questions on it.
- **What's left:** 4c.6 → 4c.7 → 4c.4, then commit, merge and deploy (D23). Nothing here needs you.

## For the next agent (Phase 4c.6)

### 1. Next phase goal and scope

Phase 4c.6: Speed answers in a fair, hidden order (D31). Plan §4 "Phase 4c.6": a seeded shuffle of the options per
question (`lib/triviaOptionOrder.ts`), the player GET stops sending `correctAnswer`, the POST maps the shown pick back
to the stored index, and `TriviaGame.tsx` reveals only from the server's reply. Speed only, no migration.
Out of scope: deploys and `supabase db push` (4c.4 does both with Andrew's OK), and 4c.7's Report button. Run 4c.7 only
after 4c.6, because both edit `components/trivia/TriviaGame.tsx`.

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e`. **All 4a–4c.5 work is uncommitted** by design (D23).
  Never `git checkout -- <file>`, `git stash` or `git reset`.
- No migration was added in 4c.5. Migrations still waiting for 4c.4 to apply: `20261117025917_live_publish_pr_open.sql`
  (4c.2) and `20261117033637_speed_trivia_expire_undated_current_events.sql` (4c.3).
- No data change, no production read or write, no paid call.

### 3. Decisions made in this phase

- D30 was implemented as the plan specifies. Speed `bar-test-v4` → `bar-test-v5`, Live `bar-test-live-v2` →
  `bar-test-live-v3`, `writer-v3` → `writer-v4`. Stored scores were not re-run.
- **Check-first result:** `speed_generation_metadata` is not part of the content key (`speed_content_hash`,
  `speed_trivia_audience_key`) or the signed **payload** hash. It is part of the signed **envelope**
  (`p_check.generation`), and `admit_speed_trivia` (`supabase/migrations/20261013120000_speed_trivia_admission.sql`,
  lines ~207–213) validates only `version`, `subtopic` and `primarySubject` and stores the whole object. So `whyTrue`
  was added to `runtime.WRITER_META_KEYS` with no migration.
- **Departure (no migration):** Speed Quick Review rows come from the `speed_trivia_review_queue` RPC, which returns
  a fixed field list and has no note. Instead of a migration, `readQuickReviewQueue` takes `{ withNotes: true }` (the
  route GET passes it; bulk Keep/Reject does not) and makes one read: `trivia_questions`
  `select("id, whyTrue:speed_generation_metadata->>whyTrue").in("id", ids)` for the page's writer rows (`recent`), at
  most 100 ids, and none when the page has no writer rows. A failed read just shows no notes. Rows without a note
  are returned unchanged (no `whyTrue` key), so existing responses are byte-identical.
- The bar-test note rule is added to the system prompt **only when some row in the batch has a note**, so backlog
  re-scores send the same prompt as before apart from the wider `ambiguous` definition.
- `noteOf(row)` (Speed `audience.cjs`, reused by Live) reads `row.note`, then `row.whyTrue` (Live candidates), then
  `row.speed_generation_metadata.whyTrue` (stored Speed rows), collapsed and cut to 200 characters.

### 4. Files changed

- `lib/question-writer/rules.cjs` (+ `rules.d.cts`): `INTEREST_RULE`, `SUPERLATIVE_RULE`, `WHY_TRUE_RULE`,
  `LIVE_ONLY_HOOK_EXAMPLE`, `MAX_WHY_TRUE_CHARS`, `whyTrueNote`; both prompts and schemas; both validators return
  `whyTrue`.
- `lib/question-writer/candidates.d.cts`: `whyTrue` on `SpeedPayload` / `LivePayload`.
- `lib/question-writer/geminiWriter.cjs`: both Gemini schemas have and require `whyTrue`.
- `lib/question-writer/process.cjs`: `writerMeta.whyTrue`; the bar test gets `{ ...p.row, note }`.
- `lib/speed-trivia-uniqueness/runtime.cjs`: `WRITER_META_KEYS` + `whyTrue`.
- `lib/speed-trivia-quality/audience.cjs`: v5, wider `ambiguous`, `NOTE_RULE`, `noteOf`, `systemFor`, `buildPrompt`.
- `lib/live-trivia-quality/audience.cjs`: live-v3, wider `ambiguous`, note via `speed.noteOf` / `speed.systemFor`.
- `lib/speedTriviaQuickReview.ts` (`readWhyTrueNotes`, `withNotes` option), `app/api/admin/trivia/quick-review/route.ts`.
- `lib/liveTriviaReview.ts` (`toItem` → `whyTrue`), `types/speedTriviaQuickReview.ts`, `types/liveTriviaReview.ts`.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`, `components/admin/sections/LiveTriviaQuickReview.tsx`:
  Why button (`aria-expanded`), note in `text-sm` under the answer (`data-testid` `quick-review-why` /
  `live-review-why`), keyed to the current question's id so each new question starts closed.
- Tests: `tests/lib.question-writer.test.ts`, `tests/lib.live-trivia-quality.test.ts`,
  `tests/lib.speed-trivia-audience.test.ts`, `tests/scripts.question-candidates.test.ts`,
  `tests/scripts.live-question-candidates.test.ts`, `tests/api.question-writer.test.ts`,
  `tests/api.admin.speed-trivia-quick-review.test.ts`, `tests/components.speed-trivia-quick-review.test.ts`,
  `tests/components.live-trivia-quick-review.test.ts` (fixtures gained `whyTrue`; versions bumped; new D30 cases).
- Docs: the plan's status line, the 4c.5 "As built" block, and two new standing rules under the writer path.

### 5. Facts and traps

- **Deploy-day edge case:** the nightly re-validates each stored candidate's payload. A batch received under the old
  prompt (no `whyTrue`) but processed after the D23 deploy is rejected as `schema`. At most one day's batch per game,
  and only if a post lands before the merge and is processed after it. 4c.4 may want to deploy right after a nightly
  run, or accept the loss.
- Live candidates already in Quick Review have no note, so they show no Why. That is expected.
- The `question_writer_receive` cap is 64 KB a post. 40 notes of up to 200 characters add at most ~8 KB.
- The 4c.6 code reading (done before 4c.5, read only): `app/api/trivia/route.ts` is the only caller of
  `getTriviaQuestions`; `mapQuestionRow` is private to `lib/trivia.ts`; `submitTriviaAnswer` grades
  `params.answer === question.correctAnswer`. **`components/venue/VenueHubClient.tsx` (~line 1102) also fetches
  `/api/trivia` to warm a cache (`writeWarmTriviaCache`)**, so check how `TriviaGame.tsx` reads that cache when
  `correctAnswer` disappears from the GET.

### 6. Build, run, test

- `npx vitest run tests/lib.question-writer.test.ts tests/lib.live-trivia-quality.test.ts tests/lib.speed-trivia-audience.test.ts tests/scripts.question-candidates.test.ts tests/scripts.live-question-candidates.test.ts tests/api.question-writer.test.ts tests/api.admin.live-review.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/components.live-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts` → 10 files, 137 tests pass.
- `npm run test` → 568 files passed (1 skipped), 7,430 tests passed, 13 skipped, 0 failed (2026-11-16).
- `npx tsc --noEmit`: clean outside `.next/`. `npx eslint` on every changed file: clean.
- **Unverified:** a real writer run with the new prompt (the ChatGPT job only sees it after the D23 merge) and a real
  bar-test call with notes. 4d's trial covers both.

### 7. Open questions for Andrew

- None new. Still open from 4c.3: page the Live admin dropdown's read (it stops at 1,000 rows)?

### 8. Recommended first steps for 4c.6

Model **Opus 5.5 / high** (plan table). Read plan §4 "Phase 4c.6" and D31. Do its check first (count Speed questions
with an "All of the above" / "None of the above" / "Both" option, read-only), then `lib/triviaOptionOrder.ts` and its
tests, then the GET/POST, then `TriviaGame.tsx` (and the warm cache noted above). Handoff:
`speed-trivia-backlog-and-quality-plan_PHASE_4C6_HANDOFF.md`.
