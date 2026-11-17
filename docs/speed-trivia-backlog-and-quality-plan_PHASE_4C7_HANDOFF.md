# Phase 4c.7 handoff — report a bad question, both games (D32)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.7" (and its "As built" block). Done 2026-11-17 on
Opus 5.5 / high, the plan's model and effort. Started 2026-11-16 late evening; that session hit a rate limit after the
code was written. This session (2026-11-17) reviewed it, wrote the route, component and export tests, and finished
the docs.

## For Andrew (plain English)

- **What changed (both games):**
  - After the answer is shown, a small **Report** link with a flag appears: in Speed under the four answers, in Live
    under the revealed answer on the phone. It's hidden while the timer runs.
  - It opens **"What's wrong?"**. Speed: Wrong answer · Two right answers · Confusing · Typo · Other. Live: My answer
    was right · Wrong answer · Confusing · Typo · Other. Other asks for a short note (200 characters max) and a Send
    button. Every other reason sends on one tap.
  - Then **"Sent."**, and the link becomes a greyed-out "Reported" for that question. In Live, the sheet closes by
    itself when the next question starts.
  - Limits: only after answering, one report per player per question, 20 a day. Players and partners never see
    reports. A report never changes a question by itself.
  - **For you:** `npm run trivia:reports` writes `tmp/question-reports-<date>.json`: each reported question once, with
    its answer, how many players reported it and why, their notes and answers, and how often it's been played. No
    player ids. Hand the file to Claude for fixes. After a fix lands,
    `npm run trivia:reports -- --resolve <question id,…>` says how many reports it would close, and adding `--yes`
    closes them.
- **Is it live?** No. Uncommitted on `feature/speed-trivia-variety`, like 4c.1–4c.6. The new database table is written
  and tested on a throwaway database but **not applied** to Supabase. Phase 4c.4 asks you to push it with the 4c.2 and
  4c.3 ones. It must be applied before the deploy, or Report shows "Couldn't send. Try again." (the game is unaffected).
- **Cost:** ~$0. Each report is one small request: 3 quick reads and 1 write. At 1–2% of answers that's ~50–100 a
  month. Nothing is read when a page loads, and nothing polls. The export runs only when you run it.
- **What's left:** Phase 4c.4 (checks, apply the three migrations, then commit, merge and deploy — each on your word).

## For the next agent (Phase 4c.4)

### 1. Next phase goal and scope

Phase 4c.4 (plan §4 "Phase 4c.4"): review #9 (writer-stopped warning for both games: `'none' | 'silent' | 'fallback'
| 'ok'`) and review #6 (re-score version stamp), then full checks, Andrew pushes the 4c.2 / 4c.3 / 4c.7 migrations,
verify functions and grants, write `..._PHASE_4C4_HANDOFF.md`, then the D23 commit / merge / deploy on Andrew's word.
Out of scope: Phase 4d (the trial run), any Admin screen for reports (D32 says not yet), auto-acting on reports.

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e` (PR #19 merge). **All 4a–4c.7 work is uncommitted**
  by design (D23). Never `git checkout -- <file>`, `git stash` or `git reset` — it would wipe days of work.
- The working tree also holds unrelated stray files with a ` 2` suffix (e.g. `tests/venue-screen-fx.test 2.ts`,
  `public/brand/web/keep-awake-v1 2.mp4`) — Finder duplicates, not from this plan. Don't commit them; ask Andrew before
  deleting.
- **Migrations waiting for 4c.4 to apply (all PGlite-tested, none applied):**
  - `supabase/migrations/20261117025917_live_publish_pr_open.sql` (4c.2)
  - `supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql` (4c.3)
  - `supabase/migrations/20261117040723_question_reports.sql` (4c.7)
- Production: nothing read or written in 4c.7. No paid API call.

### 3. Decisions made in this phase

- Built as the plan specifies. Small additions, all inside the spec's intent:
  - `question_report_play_counts(p_speed_ids uuid[], p_live_slugs text[])` in the same migration: the export's "one
    grouped count per game" as a single RPC. plpgsql (so it doesn't bind to the answer tables at create time),
    `security invoker`, `revoke … from public, anon, authenticated`, `grant execute … to service_role`.
  - `service_role` gets select / insert / update on `question_reports`, **not delete** (resolve = set `resolved_at`).
  - A note is allowed with **Other only** (DB check); the server drops a note sent with another reason.
  - `--resolve <ids>` is a dry count; `--resolve <ids> --yes` writes ("says how many first").
  - The Report button only appears when the viewer actually answered: Speed once the server's reply sets
    `revealedCorrectAnswer` (a time-out counts, it has a `trivia_answers` row with `-1`); Live in `rest_warning` with
    `revealedAnswer` set and a non-forfeit answer for this question (spectators and late joiners don't see it).
- Copy: "What's wrong?", reasons as in D32, "Send", "Sent.", "Reported", errors "Answer it first." / "Try again later."
  / "Pick a reason." / "Add a note." / "Couldn't send. Try again." / "Session required.".

### 4. Files created or changed

- `supabase/migrations/20261117040723_question_reports.sql` — table, checks, two indexes, RLS forced, grants, the
  play-count function.
- `lib/questionReportReasons.ts` — `QUESTION_REPORT_REASONS` per game (codes + labels), `QUESTION_REPORT_NOTE_MAX`
  (200), `isQuestionReportGame`, `isReasonForGame`. Shared by the sheet and the server.
- `lib/questionReports.ts` (`server-only`) — `submitQuestionReport({ userId, game, questionId | slug, reason, note })`:
  reason check → question lookup (Speed by id in `anytime_blitz`; Live by slug in `live_showdown`) → latest answer
  row (Speed `trivia_answers.answer` = stored index → option text; Live `live_showdown_answers.submitted_answer`,
  `__FORFEIT__` → null) → 24 h count (`QUESTION_REPORT_DAILY_LIMIT` = 20) → upsert `ignoreDuplicates` on
  `user_id,question_id`. `cleanReportNote` strips C0/C1 controls and bidi overrides. The note is never logged; the only
  log line is the insert error code.
- `app/api/trivia/report/route.ts` — `POST`; `resolveRequestUserId` (signed session when `SESSION_SECRET` is set), 401
  without a valid uuid user, then `submitQuestionReport`; replies `{ ok: true, message: "Sent." }`.
- `components/trivia/ReportQuestionSheet.tsx` — the button and portal bottom sheet. Props
  `{ game: "speed", questionId } | { game: "live", slug }`. Parent keys it per question.
- `components/trivia/TriviaGame.tsx` — renders `<ReportQuestionSheet key={question.id} game="speed" …/>` under the
  options when `revealedCorrectAnswer !== null` (~line 1967). (Most of this file's diff is 4c.6.)
- `app/trivia/live/page.tsx` — `reportSlug` (~line 1184) and the sheet under `RevealedAnswerBanner` (~line 1837),
  keyed by `activeKey`.
- `scripts/export-question-reports.cjs` + `package.json` script `trivia:reports` — exports `parseArgs`,
  `buildExport`, `resolveReports`, `readLiveAnswers` for tests. Reads Live answers from
  `data/live-trivia/categories/*.json` (`answer`, `acceptableAnswers`) read-only.
- Tests: `tests/question-reports-sql.test.ts` (PGlite: grants, RLS, checks, uniqueness, cascade, play counts),
  `tests/api.trivia-report.test.ts` (401/400/403/404/429, duplicate, note cleaning, `player_answer` from the row),
  `tests/components.report-question-sheet.test.ts` (reason lists, Other, Sent./Reported, errors, Live key closes the
  sheet, text scale), `tests/scripts.export-question-reports.test.ts` (grouping, no user id, `--resolve`, args), plus
  Report-visibility checks added to `tests/components.speed-trivia-answer-reveal.test.ts`.
- Docs: plan status line and "As built" block; this note.

### 5. Facts and traps

- `live_showdown_answers.question_id` is the **slug** (text FK to `trivia_questions(slug)`); `question_reports.question_id`
  is always the `trivia_questions` **uuid**. The Live state's `activeQuestion.questionId` is the slug
  (`lib/liveShowdownEngine.ts:939`).
- `trivia_answers.answer` holds the stored index since 4c.6 (D31), so `player_answer` reads `options[answer]` directly.
- The export file contains Speed question ids with their correct option. It's in gitignored `tmp/`; never commit it
  (the 4c.6 order algorithm is public, so ids + answers would publish the answers).
- Full `npm run test` run: 575 files passed, 1 failed — `tests/components.live-trivia-quick-review.test.ts` "shows a
  possible repeat…" timed out under full-suite load (1,064 ms). It passes 3/3 alone and isn't touched by 4c.7 (it's
  4b's Live Quick Review). If it flakes again in 4c.4, raise that test's timeout rather than chase it.
- `npx tsc --noEmit` prints errors only from stale `.next/types` / `.next/dev/types` for deleted TV-pairing routes
  (`app/tv/page`, `app/api/tv-pair/*`, `app/api/owner/tv-pair/claim`). Source is clean. A `npm run build` (or deleting
  `.next/types`) regenerates them; don't do that while Andrew's dev server runs.
- The sheet's colours are fixed slate/emerald/rose like the rest of both game screens (which are dark-only); no light
  variant was added.

### 6. Build, run, test

- `npx vitest run tests/question-reports-sql.test.ts tests/api.trivia-report.test.ts tests/components.report-question-sheet.test.ts tests/scripts.export-question-reports.test.ts tests/components.speed-trivia-answer-reveal.test.ts`
  → 33 tests pass.
- `npx eslint` on all 4c.7 files: clean. `npx tsc --noEmit`: clean apart from the stale `.next` types above.
- **Unverified:** the route against the real database (the table doesn't exist yet), `npm run trivia:reports` against
  production, and the sheet on a real phone. After the migration push and deploy, do one real report in each game
  from a test player, run `npm run trivia:reports`, check the file, then `--resolve <id> --yes` that test report.
- `npm run build` was not run in this phase (4c.4 step 1 runs it).

### 7. Open questions for Andrew

None new. D32's defaults stand (no Admin screen, no automatic action); Phase 5 revisits.

### 8. Recommended first steps for 4c.4

Model / effort per the plan: **Sonnet 5.5 / medium**.
1. Read plan §4 "Phase 4c.4" and the 4c.2, 4c.3 handoffs' "apply" notes.
2. Do fixes #9 and #6 with their tests.
3. Run lint, typecheck, test, build — one at a time.
4. Ask Andrew to `supabase db push` the three migrations. Then verify `question_report_play_counts`,
   `question_reports` grants (`service_role` only; no `anon` / `authenticated`) and RLS forced, alongside the 4c.2 /
   4c.3 functions.
5. Smoke-test one report per game after the deploy (§6), then write the 4c.4 handoff.
