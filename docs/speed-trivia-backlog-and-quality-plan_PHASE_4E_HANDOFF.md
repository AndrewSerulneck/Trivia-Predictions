# Phase 4e handoff: Speed → Live conversions (D37), plus the 4d re-trial and D38 shipping

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4e — Speed → Live conversions (D37)" and §4 "Phase 4d"
(re-trial note). Done 2026-11-19 on Opus 5.5 (the plan's tier for 4e; high effort).

## For Andrew (plain English)

- **Repeat-check fix (D38):** committed and in **PR #26**. All checks are green, but **I couldn't merge it**: the
  merge needs your click (or a "merge it" from you). Until it's merged and deployed, edits in Admin still use the old rule.
- **Nightly writer re-trial (today, Nov 19):** it worked. ChatGPT wrote and graded every question, for both games.
  - **Speed:** 8 waiting in Quick Review (Source: ChatGPT), incl. one news question (Disney+ 3D on Meta Quest, Nov 2026).
  - **Live:** 14 waiting in Quick Review's Live mode (tonight's category was Music).
  - I checked all 22 facts (the Disney one against Disney's own Nov 10 release). None are wrong.
  - Cost: $0.13 of Gemini (the repeat check). ChatGPT used ~154,000 tokens of your plan (writing + grading).
  - **One problem found:** 3 of the 4 Speed news questions were thrown out by the Gemini repeat check, because Gemini
    can't confirm 2026 facts ("could not be verified"). That's the planned "move the repeat check to OpenAI" phase
    (D36). Until then, most Speed news questions won't get through.
- **"Make Live" (Phase 4e): built and tested, not live yet.**
  - In Speed Quick Review, **L** (or "Keep + Live") keeps the question and queues it. In the Trivia question list, live
    Speed questions get a **Make Live** button. It then shows "Queued for Live" (tap to cancel), "Converting",
    "In Live review", "Kept for Live", "In Live", or "Not convertible: <why>".
  - That night ChatGPT rewrites each one (up to 20) as a write-in Live question with the same answer, or says why it
    can't. The rewrite shows up in Live Quick Review with a "From Speed: …" line. The Speed question never changes.
  - No new money: ChatGPT plan only, plus ≤ $0.02/night of the existing Live repeat check.
- **Needs you:**
  1. Merge PR #26.
  2. Rate the 22 waiting re-trial questions (Keep/Reject). Then I turn the writer's daily schedule on.
  3. OK to apply the 4e database change to production (`supabase db push`, one new table + 5 functions, nothing
     existing changes). After that: commit, PR, deploy, copy the writer files to the private repo.

## For the next agent

### 1. Next steps and scope
1. **Andrew merges PR #26** (D38). Verify the production deploy; nothing else to do for it.
2. **4d step 2–4:** Andrew's ratings on the 2026-11-19 batch (Speed: Quick Review, Source ChatGPT; Live: Live mode).
   Pass rule ≥ 70% kept per game. Then uncomment the `schedule` (00:30 UTC) in `tools/question-writer/.github/workflows/write-questions.yml`
   **and** in the private repo `AndrewSerulneck/hightop-question-writer`. Report the token usage (below).
3. **Ship 4e** (after Andrew's OK for the migration): `supabase db push` (applies only
   `20261119134654_live_conversion_requests.sql`; check `supabase migration list` first), verify the table/functions
   exist with service_role grants, commit the 4e files (list in §4), PR, merge on Andrew's word, wait for the Vercel
   production deploy, **then** copy `tools/question-writer/{write.mjs,grade.mjs,README.md}` to the private repo.
   Order matters: the old writer ignores a `conversion` prompt only partly (it would run the prompt and drop the
   answers, wasting plan tokens), so deploy and sync the same day. The migration must be applied **before** the deploy
   (the brief route calls `live_conversion_brief`; if it's missing the Live brief returns 503 and that night's Live
   batch is lost).
4. Smoke test after deploy: Make Live on one active Speed question, check `live_conversion_requests` has it `queued`;
   the next writer run should show a `conversions` log line; the nightly report has `conversions: {examined, waiting, rejected}`.

Out of scope: moving the repeat check / tagging to OpenAI (D36, its own phase after Phase 5), Live's one-category-a-night design.

### 2. Starting state
- Branch `fix/speed-live-edit-repeat-check`, last commit `D38` (pushed; PR #26 = that commit on top of `origin/main` `de5e5ac0`).
  **All 4e work is uncommitted** in the working tree on that branch. Don't stash/checkout/reset it.
- Production data written today: `question_writer_runs` (speed + live, 2026-11-19, source chatgpt); 40
  `question_candidates` for run_date 2026-11-19; 8 Speed `trivia_questions` rows `pending_review` (ids from
  `question_candidates.question_ref` where game speed, status pending_review, run_date 2026-11-19). No other writes.
- Writer repo unchanged (schedule still commented out; `WRITER_GAMES=speed,live`; `CODEX_AUTH_JSON` still dated
  2026-11-17 16:15 UTC; the refreshed-login save step ran but the login hadn't changed).
- Migration `20261119134654_live_conversion_requests.sql`: **NOT applied**.

### 3. Decisions (don't re-ask)
- D37 (Andrew 2026-11-18): L key + list button; same answer, free rewording, decline with a reason; rules + repeats
  reject, the grade never does.
- D38 OK'd 2026-11-19 ("You have my OK for the repeat-check change"): commit + PR done. Merging was blocked by the
  auto-mode permission check because the OK named commit/PR only; ask Andrew to merge.
- Ungraded conversions are not sent to Gemini (D36 "never add a new Gemini use").
- `QUESTION_WRITER_CONVERSIONS_PER_NIGHT` (site env, default 20, max 20, 0 = off). Not set anywhere; no env change needed.

### 4. Files (4e, uncommitted)
- `supabase/migrations/20261119134654_live_conversion_requests.sql` (new): table `live_conversion_requests` (one open
  request per Speed question; RLS on; service_role only) and SECURITY DEFINER functions, service_role only:
  `live_conversion_queue(uuid)`, `live_conversion_cancel(uuid)`, `live_conversion_status(uuid[])`,
  `live_conversion_brief(int)` (stable, read-only), `live_conversion_receive(jsonb)` (inserts `question_candidates`
  game live, adds `conversionOf` + `fromSpeed` in SQL, marks the request `sent`/`declined`; idempotent per request).
- `lib/question-writer/rules.cjs` (+ `.d.cts`): `MAX_CONVERSIONS`, `LIVE_CONVERSION_SCHEMA`, `buildLiveConversionPrompt`, `declineReason`.
- `lib/question-writer/brief.cjs` (+ `.d.cts`): Live adds a `kind:'conversion'` prompt with `conversions:[{n, requestId}]`;
  `conversionsPerNight(env)`; `buildBrief({ conversions:false })` for the fallback (used in `process.cjs`, `liveProcess.cjs`).
- `lib/question-writer/candidates.cjs` (+ `.d.cts`): `parseConversions`, `receiveConversions`.
- `app/api/question-writer/conversions/route.ts` (new): writer token, ≤ 64 KB, ≤ 20 items.
- `lib/question-writer/liveProcess.cjs`: `isConversion`, `settleRequest`, `conversionFailure`; conversions skip slot
  match, star cap (note `tag.overStarCap`) and the score gate; repeat check + Live hard limits still reject and set
  the request `failed`; a pass sets it `done`; `report.conversions`. `readReceived` reads up to 60.
- `lib/question-writer/geminiWriter.cjs`: skips `conversion` prompts.
- `lib/liveConversions.ts`, `types/liveConversions.ts`, `app/api/admin/trivia/live-conversions/route.ts` (new): admin
  GET `?ids=` (≤ 100), POST/DELETE `{questionId}`.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`: L key, "Keep + Live (L)", Undo cancels.
- `components/admin/sections/TriviaListSection.tsx`: Make Live control (one status GET per page).
- `components/admin/sections/LiveTriviaQuickReview.tsx`, `lib/liveTriviaReview.ts`, `types/liveTriviaReview.ts`: "From Speed" and "Over star cap".
- `tools/question-writer/write.mjs`, `grade.mjs` (`conversionItems`, `conversionPost`), `README.md`.
- Tests: `tests/live-conversion-requests-sql.test.ts`, `tests/api.admin.live-conversions.test.ts`,
  `tests/components.trivia-list-make-live.test.ts` (new); new cases in `tests/lib.question-writer.test.ts`,
  `tests/scripts.live-question-candidates.test.ts`, `tests/api.question-writer.test.ts`,
  `tests/tools.question-writer-grade.test.ts`, `tests/components.speed-trivia-quick-review.test.ts`,
  `tests/components.live-trivia-quick-review.test.ts`.
- Docs: plan (status line, 4d re-trial note, 4e "Done" note, §7 standing rule), this note.

### 5. Facts and traps
- **Speed Current Events vs the Gemini repeat check:** 3 of 4 rejected `uncertain` with "This question could not be
  verified" (Gemini's soundness check on 2026 facts). Not a 4e issue; it's D36's OpenAI repeat-check phase.
- The writer rewrote the same failed Current Events facts as on 2026-11-17 (World Cup, *Digger*, eclipse); rejected or
  skipped questions don't enter the avoid list.
- PGlite fixtures: inserting an active Speed row needs `alter table trivia_questions disable trigger all` (star-cap
  guard) **and** an explicit `normalized_question_key` (NOT NULL, normally set by a trigger).
- The harness `call()` can't pass a `uuid[]`; query `live_conversion_status($1::uuid[])` directly.
- `gh pr merge` was denied by the auto-mode classifier; don't retry without Andrew's explicit word.
- Untracked `* 2.*` files and two other backfill logs in the tree are unrelated (Finder duplicates); leave them.

### 6. Build, run, test
- `npx vitest run` → 584 files passed, 7,605 tests passed, 13 skipped. `npx tsc --noEmit` clean. ESLint clean on all
  touched paths. `npm run build` passes (both new routes built).
- Re-trial commands: `gh workflow run write-questions.yml -R AndrewSerulneck/hightop-question-writer`, then
  `gh workflow run trivia-nightly.yml`; `gh run download <id> -D <dir>`.
- Token usage (re-trial): Speed 114,116 (16 written + graded, incl. 5 Current Events with search), Live 39,652.
  The 2026-11-17 Speed writing alone was 62,069, so grading added roughly 50k for Speed.
- Unverified until shipped: a real conversion night end to end (writer prompt → post → nightly → Live Quick Review).

### 7. Open questions for Andrew
- Merge PR #26.
- Ratings on the 22 re-trial questions.
- OK to `supabase db push` the 4e migration, then commit/PR/deploy/sync.

### 8. Recommended first steps
1. Check PR #26 merged and deployed; `git fetch`, rebase or merge `origin/main` into the 4e branch if needed (the
   D38 commit is already on it).
2. Ask for / read Andrew's ratings; if ≥ 70% kept per game, turn the schedule on in both copies.
3. With the migration OK, ship 4e per §1.3 (Opus 5.5 / medium is enough for shipping), then the smoke test in §1.4.
4. Then Phase 5 (monitor seven nights), per the plan's table.
