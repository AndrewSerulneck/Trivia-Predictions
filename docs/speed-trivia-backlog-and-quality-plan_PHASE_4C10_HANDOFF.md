# Phase 4c.10 handoff: bulk Keep, the report limit, a cleanup; apply and verify

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.10" (post-4c.4 review #7, #8, #9). Done 2026-11-17
on Opus 5.5 / medium (the plan's tier). Steps 1–6 are done: **D23 shipped 2026-11-17** (PR #20 merged, production
deploy READY 15:41 UTC, Trivia Nightly re-enabled). Since then: the report smoke test passed, the old-tab check was
skipped (Andrew, no old tab), the Sync Live Trivia fix shipped (PR #21), and the Live report-sheet change shipped
(branch `feature/live-report-sheet-hold`, see §2). Andrew signed the writer in to ChatGPT (`CODEX_AUTH_JSON` set
2026-11-17 16:15 UTC). Next: Phase 4d.

## For Andrew (plain English)

- **What changed:**
  - **"Keep all shown" no longer skips questions silently.** If a question changed while the bulk Keep ran (for
    example, someone edited it), it used to be passed over and left behind with no message. Now the bulk Keep reads it
    again and keeps it. If it changes a second time, the bulk Keep stops and says "Some changed. Run again."
  - **The 20-reports-a-day limit can't be beaten by sending many at once.** The database now enforces it. Each report
    also costs one database read fewer.
  - A small code cleanup (no behaviour change).
  - **The green "Correct" chip in Speed Trivia now shows the points actually won.** It always said "+2 pts", even
    when a 2x Challenge gave more (Andrew's request, 2026-11-17).
- **Database:** one migration, `20261117142126_question_reports_daily_limit.sql`, was **applied to production with your
  OK on 2026-11-17**. It adds a rule to the reports table, which is still empty. 4c.8's migration
  (`20261117135338_speed_trivia_tag_cap.sql`) had already been applied before this phase. Both are checked and working.
  No data changed and no paid call was made.
- **Is it live?** Yes. Everything from 4a to 4c.10 went live on 2026-11-17 at about 15:41 UTC
  ([PR #20](https://github.com/AndrewSerulneck/Trivia-Predictions/pull/20)). Trivia Nightly is back on; its next run is
  02:15 UTC.
- **Checks:** lint, typecheck, all 7,552 tests and the build pass, and so does GitHub's check on the PR.
- **Since then (2026-11-17):** your test reports (1 Speed, 2 Live) all arrived and were cleared. The Live question
  sync, broken since July, is fixed and ran: 253 Live questions were added (3,707 active). On Live, the Report window
  now stays open over the next question until you send or close it (shipped 2026-11-17). You signed the question
  writer in to ChatGPT; it keeps itself signed in from now on (see §7).
- **Needs you:** your go-ahead for Phase 4d's trial run.

## For the next agent

### 1. Next phase and scope
Finish 4c.10's steps 6–8, then **Phase 4d** (plan §4 "Phase 4d — trial run, then daily").
- Step 6, D23: commit, PR, merge to main, deploy (Vercel deploys main). **Each step on Andrew's word.** Re-enable Trivia
  Nightly only once the deploy is READY: `gh workflow enable trivia-nightly.yml`.
- Step 7, right after the deploy: in a tab loaded **before** the deploy, tap an answer. Expect "Refresh to keep
  playing." and no `trivia_answers` row. Then refresh and play one question normally.
- 4c.4's post-deploy smoke test still applies: one real report per game, `npm run trivia:reports`, then
  `--resolve <id> --yes` the test reports. That also exercises the new trigger on real Postgres.
- Out of scope: an Admin screen for reports; acting on reports automatically (D32).

### 2. Starting state
- **Shipped 2026-11-17.** Branch `feature/speed-trivia-variety`: commits `a153b72b` (all of 4a–4c.10) and `6b59aefb`
  (test only: `tests/components.speed-trivia-answer-reveal.test.ts` stubs `Element.prototype.scrollIntoView` for the
  whole file, because the game's Next-button scroll timer fired after a test ended and failed CI's `validate` with an
  unhandled error). PR #20 merged to main as `1a604278` at 15:39 UTC; both Vercel production deploys (hightop-challenge,
  trivia-predictions) succeeded at 15:41 UTC. `gh workflow enable trivia-nightly.yml` → **active**.
- **Sync Live Trivia still fails (found after the merge, not caused by it).** The merge's run (2026-11-17 15:39 UTC) got
  past `live-trivia:check` for the first time since July (D24's JSON fix), then failed at the import:
  `node: .env.local: not found`. The `live-trivia:import` npm script has used `--env-file=.env.local` since `f916d0f5`
  (2026-06-09), and CI has no such file. **Fixed and shipped:** `.github/workflows/sync-live-trivia.yml` runs
  `node scripts/import-trivia-questions.cjs --live-dir data/live-trivia/categories` directly. PR #21 merged as
  `f6e384af` (16:10 UTC); the dispatched run 44122721588 passed: 3,707/3,707 upserted, no orphans. Production now has
  live_showdown 3,707 active of 4,793 rows (was 3,454 active of 4,540: +253, 0 soft-deleted).
- **Report smoke test passed (2026-11-17):** Andrew sent 1 Speed and 2 Live reports; `npm run trivia:reports` showed all
  three (with player answers for Live); resolved with `--resolve 1521826c-…,a532d6fd-…,610f2eac-… --yes` (3 resolved).
  The old-tab check was skipped: Andrew had no tab from before the deploy.
- **Live Report sheet stays open over the next question (Andrew, 2026-11-17). Built, uncommitted,** on branch
  `feature/live-report-sheet-hold` (from main `f6e384af`). Before, the sheet lived inside the "Next question in" panel,
  so the next question unmounted it mid-report. `components/trivia/ReportQuestionSheet.tsx` now exports `ReportButton`,
  `ReportSheet` (mounted only while open; own status/note state; closes 1.2 s after "Sent.") and `ReportQuestionSheet`
  (both together; Speed still uses it, keyed per question). `app/trivia/live/page.tsx` keeps `heldReport {key, slug}` and
  `reportedKeys` in page state, shows `ReportButton` in the panel, and renders `ReportSheet` at the end of `<motion.main>`
  so it survives the question change and reports the question it was opened on. The answer box's autofocus on a new
  question is skipped while a sheet is open. The server has no time limit on Live reports (it only checks the player
  answered), so a late send works. Tests: `tests/components.report-question-sheet.test.ts` (harness of the page's
  pattern + a source check); full suite 7,554 pass, typecheck and lint clean. Browser-checked 2026-11-17 (scratchpad
  clone, no `.env.local`, `/api/**` mocked, 390x844, script `drive-live-report.mjs` in that session's scratchpad):
  answer Q1 → reveal → Report → Other → type "half typed" → the state switches to Q2: the sheet stays open at the
  bottom with Q2 visible above it, the note and the focus stay in the sheet, Send posts
  `{game:"live", slug:"slug-r1-q1", reason:"other", note:"half typed"}`, the sheet closes, and Q2 can be answered.
  Shipped on Andrew's OK (2026-11-17).
- **Flaky test seen in CI:** PR #21's push-triggered `validate` failed on `tests/components.speed-trivia-quick-review
  .test.ts` › "3c: Undo in Needs a look puts the question back there with its note" (`Nothing left.` not found); the
  pull_request run on the same commit passed, and the PR touched no code. Not fixed yet.
- About 23 MB of the commit is Phase 4a's JSON records in `docs/` (largest ~7.5 MB). They were kept on purpose as the
  audit trail (Andrew left the call to Claude).
- After the deploy (read-only): `/api/admin/trivia/live-review` answers 401 without auth and `/api/trivia/report` 405 on
  GET (the route exists; main had none before). The 4c.9 query (`order("audience->score", {nullsFirst:false})` on
  `question_candidates`) runs on production with no PostgREST error; there are 0 Live candidates, so the sort order
  itself is untested until the writer's first batch.
- Never `git checkout -- <file>`, `git stash` or `git reset`. Finder duplicates with a ` 2`
  suffix exist (e.g. `tests/venue-screen-brand-stage-tier-contract.test 2.ts`); don't commit them. The file
  `supabase/migrations/Warnings` (62 KB, dated Aug 12) is an old stray; the CLI skips it. Don't commit it either.
- **Production database:** every migration on the branch is applied. `supabase migration list` shows local = remote
  through `20261117142126`. Applied this phase: `20261117142126` only (Andrew's OK, 2026-11-17). `20261117135338` was
  already applied when this phase started (who applied it isn't recorded in the 4c.8 or 4c.9 handoff; it's verified
  working, see §6).
- **Old code against the new database is safe:** production's current code (main) has no report route, so nothing
  inserts into `question_reports` until the deploy. 4c.8's tag trigger only refuses a tag that would break the star
  cap. Deployed main's Admin edit path upserts the tag after the save; in that one rare case the tag write fails and
  the old tag is kept.
- Trivia Nightly is still **disabled** (main has no 4b code).
- Read-only production check, 2026-11-17 (ordered paged reads; script kept outside the repo, logic in §6):

  | Check | Result |
  |---|---|
  | Live JSON slugs | 3,707 |
  | ... also used by a non-Live row | 0 |
  | Live JSON entries past `expires_on` | 0 |
  | Live candidates waiting / kept / publishing | 0 |
  | Speed active rows | 2,524 in 1,916 subjects |
  | Subjects over 5 | 0 (max 5) |
  | `question_reports` rows | 0 |
  | Speed answers, last 7 days | 61 |

  These match the review's numbers exactly.

### 3. Decisions made (don't re-ask)
- **#7 (bulk Keep):**
  - There is one `retried` flag **per request**, not per page. The second time any page has `changed` rows, the
    request stops with `changed: n`.
  - On a change, the cursor goes back to the row before the page's first `changed` row. If the first row changed, it
    goes back to where the page started (`null` on the first page).
  - `full` rows **after** the first changed row aren't counted on that pass, because the re-read counts them. So
    `processed` / `full` never double-count.
  - The screen keeps the **last** request's `changed`. A later request starts before those rows, so it supersedes an
    earlier count. It appends " Some changed. Run again." to the Keep notice.
  - `not_pending` rows have left the queue. They count as no progress, as before.
- **#8 (report limit):**
  - The trigger `question_reports_daily_limit` (`before insert`, function `guard_question_report_limit()`, SECURITY
    INVOKER, `search_path = pg_catalog, public`) does three things in order:
    1. takes `pg_advisory_xact_lock(hashtextextended('question_reports:' || user_id, 0))`;
    2. returns null for a duplicate `(user_id, question_id)`;
    3. raises `question-report-limit` at 20 or more rows with `created_at > now() - 24h`.
  - EXECUTE is revoked from `public, anon, authenticated`. service_role keeps it through Supabase's default
    privileges. That is harmless, because it's invoker rights and a trigger function.
  - The route maps an insert error whose message contains `question-report-limit` to 429 "Try again later.". Any
    other error is 500, as before.
  - The unique constraint `question_reports_one_per_player` stays as a backstop. A plain duplicate insert is now
    skipped by the trigger instead of raising.
- **#9:** `cleanPlayerAnswer = (raw) => cleanReportNote(raw) || null`.

### 4. Files
- `lib/speedTriviaQuickReview.ts`: `runQuickReviewBulk` counts per page (`pageFull`, `pageChanged`, `firstChanged`),
  rewinds the cursor and retries once.
- `types/speedTriviaQuickReview.ts`: `QuickReviewBulkResult.changed: number`.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`: `runBulk` tracks `changed` and shows "Some changed. Run again."
- `lib/questionReports.ts`: the count read is removed, the trigger error maps to 429, `cleanPlayerAnswer` is a
  one-liner, and the header cost note now says 2 reads.
- `supabase/migrations/20261117142126_question_reports_daily_limit.sql` (new, **applied**).
- Tests:
  - `tests/api.admin.speed-trivia-quick-review.test.ts`: `fakeDb` takes a `changes` map. New tests cover a changed
    page after a full page stopping, a mixed page re-read, and changed twice (with the cursor before the rows, or
    `null` when the first row changed). The old "no progress" case now uses `not_pending`.
  - `tests/components.speed-trivia-quick-review.test.ts`: the fake bulk honours `changedIds`. A new test checks
    "Kept 3. Some changed. Run again." and the `after` sequence `[null, id-2, id-3]`.
  - `tests/api.trivia-report.test.ts`: the fake no longer allows a `question_reports` read, and its upsert mimics the
    trigger. New tests cover a duplicate at the limit → "Sent.", and another insert error → 500 and a log line.
  - `tests/question-reports-sql.test.ts` (PGlite): adds the new migration and 25 fixture rows. New tests cover:
    21st refused (insert and upsert, per player); 20th allowed; duplicate at the limit skipped; rows over 24 h not
    counted; invoker rights and the grants. The "one per player" test now expects a quiet skip.
  - `tests/question-reports-limit-contract.test.ts` (new): the trigger's number equals `QUESTION_REPORT_DAILY_LIMIT`,
    and the route doesn't count.

### 5. Facts and traps
- `supabase db query --linked "<sql>"` runs read-only SQL through the Management API (no DB password needed). Use it
  to inspect `pg_proc` / `pg_trigger`. Cast `"char"` columns to text (`tgenabled::text`), or `||` is ambiguous (42725).
- PGlite has one connection, so the advisory lock's protection against concurrent bursts is reasoned, not tested.
  The lock is per player and per transaction. Each PostgREST insert is its own transaction, so concurrent POSTs from
  one player serialize at the trigger.
- An upsert with `ignoreDuplicates` (`on conflict do nothing`) still fires BEFORE INSERT triggers. That's why the
  trigger checks for a duplicate before the limit (otherwise a re-report at the limit would get 429 instead of "Sent.").
- Plain `npm run lint` trips on the scratch `tmp/` folder. Use `npx eslint lib app components scripts tests types`.
- `npx tsc --noEmit` prints only stale `.next/dev/types` errors from Andrew's dev server. Filter with
  `| grep -v '^\.next/'`.

### 6. Build, run, test — what was verified
- Phase tests:
  `npx vitest run tests/api.admin.speed-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts tests/api.trivia-report.test.ts tests/question-reports-sql.test.ts tests/question-reports-limit-contract.test.ts`
- Verified 2026-11-17, run one at a time:
  - `npx eslint lib app components scripts tests types`: clean.
  - `npx tsc --noEmit`: no source errors.
  - `npm run test`: 579 files passed, 1 skipped; 7,551 tests passed, 13 skipped. The flaky bingo star-tilt test
    passed this time.
  - `npm run build`: passes.
- Production after the push (read-only `supabase db query --linked`):

  | Function | Security | EXECUTE | Trigger |
  |---|---|---|---|
  | `guard_question_report_limit` | invoker, path pinned | not anon or authenticated | `question_reports_daily_limit` on `question_reports`, enabled |
  | `guard_speed_question_tag` | definer, path pinned | no role | `guard_speed_question_tag` on `question_tags`, enabled |
  | `speed_trivia_subject_has_room` | definer, path pinned | service_role only | none |

  Also checked over the API: `speed_trivia_subject_has_room` returns `true` for service_role and 42501 for anon.
- `/verify` 2026-11-17 (scratchpad clone, no `.env.local`, every `/api/**` mocked, 390x844): the answer POST sends
  `order: 1` and nothing is revealed before the reply; Report appears only after the reveal and sends
  `{game:"speed", questionId, reason}`; a saved round without `order` is dropped with no forfeit POST; a new-format
  saved round forfeits with `answer: -1` and resumes.
- Feedback chip: `TriviaGame.tsx` keeps `feedbackPoints` (set from the reply's `pointsAwarded`) for the "🔥 +N pts" chip.
  Pinned by `tests/trivia-feedback-points-contract.test.ts`.
- **Unverified:**
  - The bulk Keep change in a browser (fake-tested only).
  - The report trigger with a real insert (do it in the post-deploy smoke test).
  - The `audience->score` sort order with real rows (the query itself is accepted; see §2). Open Admin → Live Quick
    Review once candidates exist.
  - The old-tab check (step 7): skipped, no old tab existed.
  - The Live report sheet held over the next question in a real game with real timing (browser-checked with mocked
    state only).

### 7. Open questions
- The private writer repo `AndrewSerulneck/hightop-question-writer` has `QUESTION_WRITER_TOKEN`,
  `SECRETS_WRITE_TOKEN` and, since Andrew ran `renew-login.sh` on 2026-11-17 (twice; the second sign-in, 16:15 UTC,
  replaced the first), `CODEX_AUTH_JSON`. **Do not ask him to sign in again** unless a run fails with "ChatGPT login
  needs renewing". The repo has **no workflow runs yet**, so the save-back below has never run: after 4d's first run,
  check the "Save the refreshed login" step passed (`gh run view <id> -R AndrewSerulneck/hightop-question-writer`).
  It stays signed in on its own: each run of `write-questions.yml` saves the
  refreshed login back to the secret (step "Save the refreshed login", via `SECRETS_WRITE_TOKEN`), so a renewal is
  needed only if OpenAI ends the session (password change, sign-out everywhere, or a long gap between runs) or
  `SECRETS_WRITE_TOKEN` expires; the workflow then fails with "ChatGPT login needs renewing".
- Phase 4d step 1 runs the private writer workflow by hand (≤ $0.50 of Gemini for both games, plus Codex usage). Start
  it on Andrew's word.

### 8. First steps
1. (Done 2026-11-17: `feature/live-report-sheet-hold` shipped.)
2. Phase 4d (plan §4 "Phase 4d — trial run, then daily"), **Opus 5.5 / medium**. Trivia Nightly is already on, so
   tonight's 02:15 UTC run uses the Gemini fallback (D13, ≤ $0.10 per game) if the private writer hasn't produced a
   batch. Check that run's report artifact before the trial.
