# Phase 4c.10 handoff: bulk Keep, the report limit, a cleanup; apply and verify

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.10" (post-4c.4 review #7, #8, #9). Done 2026-11-17
on Opus 5.5 / medium (the plan's tier). Steps 1–5 are done. Steps 6–8 (the D23 commit, merge and deploy, the old-tab
check, then 4d) are next and need Andrew's word for each step.

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
- **Is it live?** The database part is. The code is not: everything from 4a to 4c.10 is still uncommitted on
  `feature/speed-trivia-variety`.
- **Checks:** lint, typecheck, all 7,551 tests and the build pass.
- **Needs you:** your word for the D23 steps: commit, merge (PR), then deploy. After the deploy: Trivia Nightly gets
  turned back on, and an old browser tab is checked.

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
- Branch `feature/speed-trivia-variety`. Last commit `1aa32e4e` (the PR #19 merge). All work from 4a to 4c.10 is
  uncommitted (~160 paths). Never `git checkout -- <file>`, `git stash` or `git reset`. Finder duplicates with a ` 2`
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
  - 4c.9's PostgREST `audience->score` ordering on real Supabase: after deploy, open Admin → Live Quick Review and
    check that it loads.
  - The old-tab check (step 7).

### 7. Open questions
None. Waiting only on Andrew's word for each D23 step.

### 8. First steps
1. Ask Andrew to confirm the commit. Stage by explicit path, leaving out ` 2` duplicates, `supabase/migrations/Warnings`
   and `tmp/`. Commit to `feature/speed-trivia-variety`.
2. Push, open the PR to main, and merge on his word. Confirm the Vercel deploy is READY.
3. Run `gh workflow enable trivia-nightly.yml`, then the old-tab check and the report smoke test.
4. Start Phase 4d. Model and effort: as named in the plan's §3 table.
