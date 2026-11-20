# Phase 7g handoff: Live Publish, Speed answers, Admin edits (2026-11-20)

## For Andrew

- **Your answers are recorded:**
  - a question may return to its own reserved fact: yes (D45);
  - one PR for 7d–7j, opened in 7j.
- **What 7g fixes (none of it had happened on production; checked read-only today):**
  - **Publish never merges a changed PR.** If someone pushes to a Publish branch, Publish leaves the PR for you. It
    no longer switches on GitHub's auto-merge for it. Auto-merge is still used when GitHub just isn't ready yet, and
    it's now tied to the exact commit Publish made.
  - **Speed answers only count for playable questions.** An answer to a waiting, retired, Live or hidden Current
    Events question now gets "Not available". No points are given and the correct answer isn't revealed.
  - **An edited question gets its new subject tag.** Before, if the tag call failed before the save, the question kept
    its old subject. Now it's tagged again after the save.
  - **A failed Publish record no longer says "Nothing changed".** It now says "Publish opened PR #N but couldn't record
    it. Don't publish again." Publish tries the record twice. If both fail, the PR check settles the questions on its
    own after 10 minutes.
  - **The writer can retry a batch any number of times.** A third identical retry used to fail with "Daily post limit
    reached" (database change, not applied yet).
  - **Live Quick Review loads faster.** The GitHub check runs alongside the page load, at most once a minute.
  - **Undo gives the real reason:** "Already undone.", "Publishing now. Try again in a minute.", "Waiting on GitHub."
    or "Can't undo: already published."
- **Is it live?** No. It's committed on `fix/second-review-remedials`, not pushed. The database change
  (`20261120151403`) waits for 7j, which asks you before applying it.
- **Cost:** $0. No new paid calls, cron or env var. Fewer GitHub calls than before. An edit makes a second tag call
  (about $0.0005) only when the first one failed.
- **Needs you:** nothing now.

## For the next agent

### 1. Next phase and scope

- **Next: 7h** (Opus 5.5 / medium): plan §4 "Phase 7h — the private writer: a failed grade never loses a batch"
  (R2 #25.1, #25.2, #25.5–#25.7, #25.9, #25.10). Same branch. It includes the private-repo sync.
- **Out of scope (not done here):**
  - Pushing, the PR, applying `20261119193552` (7d), `20261120145222` (7f) and `20261120151403` (7g), and the merge.
    All of that is 7j, with Andrew's OK.
  - The writer's own retry behaviour (`tools/question-writer/write.mjs`) is unchanged. 7g only made the server answer
    an identical retry with success.

### 2. Starting state

- **Branch:** `fix/second-review-remedials`. Nothing pushed. The 7g commit sits on top of `ea2708e1` (7f); see
  `git log`.
- **Migrations not applied (7j applies all three, with Andrew's OK):**
  - `20261119193552_speed_trivia_quick_keep_after_live_edit.sql` (7d);
  - `20261120145222_live_conversions_cant_get_stuck.sql` (7f);
  - `20261120151403_question_writer_retry_before_post_limit.sql` (7g).
  - Order doesn't matter between them: 7g's migration replaces only `question_writer_receive`, which 7d and 7f don't
    touch.
- **Production data:** not changed. Read-only check (2026-11-20), using a scratchpad script with `node --env-file=.env.local`:
  - Live candidates: 0 `publishing`, 0 `pr_open`, 12 `keep`, 9 `published`;
  - `question_writer_runs` with `posts >= 2`: 0.
  - So every 7g finding was latent.
- **Left untracked on purpose (not ours):** `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions

- **Andrew (2026-11-20):**
  - D45 confirmed: "a question may return to its own reserved fact". It's recorded in the plan's D45 row.
  - One PR for 7d–7j. The ground rule in plan §4 "Shared ground rules for 7d–7j" is updated.
- **Agent's calls:**
  - **R2 #20.1:** a 409 returns `false` at once. As defence in depth, the auto-merge mutation (used only after
    405/422) now passes `expectedHeadOid` = the Publish commit. So even a head that moves after a 405 can't
    auto-merge.
  - **R2 #20.3, how the PR check finds an unrecorded Publish:**
    - Rows left `publishing` with no `pr_url` don't say which PR is theirs. So Publish now writes two things:
      - the branch name ends with the claim's first 8 hex characters: `live-trivia-publish-<stamp>-<claim8>`;
      - the PR body ends with a hidden comment, `<!-- live-publish-record {"claim":…,"published":[[id,slug]…],"already":…,"refused":…} -->`.
    - The PR check (`reconcileLivePrs`) collects claims of stale (> 10 min) `publishing` rows with no `pr_url`. It then
      makes one GitHub list call (`pulls?state=all&base=main&sort=created&direction=desc&per_page=50`) and matches each
      claim by branch suffix AND a valid record for that exact claim.
    - For each match it reuses the existing RPCs, so there's no new SQL:
      1. `live_candidates_publish_record_pr`;
      2. `live_candidates_publish_settle`: published → `pr_open`, already → `published`, refused → `reject`;
      3. then, unless the PR is open, `live_candidates_pr_settle` with its state (merged → `published` + tags; closed →
         `keep`).
    - **Trust:** the record is parsed strictly (uuid ids, slug `^[a-z0-9][a-z0-9-]{0,199}$`, reason
      `^[a-z0-9-]{1,60}$`, ≤ 200 rows). The RPCs only move rows still held by that claim, all or nothing. Anyone who
      could edit the PR body could already edit the canonical JSON.
    - **No PR found** (none was opened, or it's older than the 50 newest): the rows are left for the next Publish's
      re-claim, as before 7g.
  - **R2 #20.7:**
    - `readLiveReviewQueue` runs the PR check alongside its two reads.
    - GitHub is asked at most once a minute per server instance. This uses a module-level timestamp, reset in tests
      with `resetLivePrCheckThrottle()`.
    - Publish passes `{ force: true }` and always checks.
    - When throttled, the "waiting on GitHub" count still comes fresh from the database. Only the GitHub calls are
      skipped.
    - When the check sends a closed PR's questions back to `keep`, the kept count is read once more (`reopened > 0`).
      So the page is never one load behind.
  - **R2 #20.4:**
    - The built-in fallback questions (`fallback-1..3`) are still graded from the list, as before. Their answers never
      save, because they aren't uuids.
    - A non-uuid id that isn't a fallback id is refused without a database read.
    - A database error is a 500 ("Failed to submit answer."), not a 404.
  - **R2 #20.5:** an identical retry is a pure read. It doesn't increment `posts`, so `posts` stays at 1 after the
    first batch. The post limit and `writer-already-received` still guard different batches.
  - **R2 #20.9:** a `pr_open` row keeps its existing "Waiting on GitHub." message (it was already tested). The plan's
    three messages are added for `pending_review`, `publishing` and the rest.

### 4. Files changed

- `lib/liveTriviaGithub.ts`:
  - `mergePublishPr`: 409 → `return false`; auto-merge pinned with `expectedHeadOid`.
  - `openPublishPr(baseSha, changes, summary, record)`: new 4th argument `PublishRecord`. The branch suffix is the
    claim's short form, and the body carries the record.
  - New `PublishRecord` type, `readPublishRecord(body, claim)` and `findPublishPrsByClaim(claims)`.
- `lib/liveTriviaReview.ts`:
  - `PublishDeps.findClaimPrs`, and the `PrCheckDeps` type.
  - `readLiveReviewQueue`: the PR check runs alongside the reads, and the kept count is re-read when needed.
  - `liveUndo` + the exported `undoRefusal(status)`.
  - `reconcileLivePrs(deps, { force })` returns `{ waiting, prUrl, reopened }`. It also handles unrecorded Publishes
    and the throttle (`PR_CHECK_INTERVAL_MS`, `resetLivePrCheckThrottle`).
  - The `settleRows(record, prUrl, merged)` helper is shared by Publish and the PR check.
  - `publishLive`: forced PR check, record passed to `openPr`, record retried once, then the new `not_recorded`
    message (502).
- `lib/trivia.ts`:
  - `getQuestionById` → `getPlayableQuestionById`: pool `anytime_blitz`, status `active`, category not hidden
    (`getHiddenSpeedCategories`, cached 5 min).
  - New `TriviaQuestionUnavailableError`.
- `app/api/trivia/route.ts`: `TriviaQuestionUnavailableError` → 404 `{ ok: false, error: "Not available" }`.
- `lib/speedTriviaAdmission.ts`: `writeSpeedTrivia` returns early only when the early tag succeeded. Otherwise it
  falls through to the post-save `tagSpeedQuestion`.
- `supabase/migrations/20261120151403_question_writer_retry_before_post_limit.sql`: `create or replace
  question_writer_receive`. The identical-batch check comes before the post limit and writes nothing. Grants are
  restated (`service_role` only).
- `app/api/question-writer/candidates/route.ts`: comment only.
- **Tests:**
  - `tests/lib.live-trivia-github.test.ts`, 7 new: the 409 paths (including 405 then 409), the pinned auto-merge,
    merge + branch delete, the branch/body record, `readPublishRecord` refusals, `findPublishPrsByClaim`.
  - `tests/api.admin.live-review.test.ts`: the GitHub mock gains `findPublishPrsByClaim`, and `beforeEach` resets the
    throttle. New tests:
    - Undo messages;
    - record retried, then the message; a record that succeeds on the retry;
    - the record passed to `openPr`;
    - six recovery tests: merged, open, closed (the kept count on the same load), no PR, fresh claim, failed lookup;
    - two throttle tests.
  - `tests/api.speed-trivia-answer-order.test.ts`: the fake applies every `.eq` filter, and hidden categories can be
    set. Six new refusal tests and one "still graded" test.
  - `tests/lib.speed-trivia-tagging.test.ts`: the old "no second call" test is replaced. Now an early failure is
    re-tagged after the save; if both calls fail, there are 2 calls and the old tag stays.
  - `tests/question-writer-sql.test.ts`: loads the new migration. New tests: unlimited identical retries
    (`posts` stays 1), the post limit still refuses, grants.
- **Plan doc:** the top table, status line, 7g heading, D45 row and the 7d–7j ground rule (one PR).

### 5. Facts and traps

- **`new Response(body, { status: 204 })` throws** in Node's fetch. A fake GitHub must reply 200 with a body, or the
  call silently goes down a `.catch` path.
- **GitHub keeps `head.ref` on a PR after its branch is deleted.** That's why the claim lookup still works after a
  merge (Publish deletes the branch).
- **The once-a-minute throttle is per server instance.** On Vercel, two instances may each call GitHub once a
  minute. That's still bounded, and usually there are 0 rows to check, so 0 calls.
- **`tests/scripts.speed-trivia-approved-only.test.ts` timed out once** (5.3 s against vitest's 5 s default) in a
  full `npm run test`. It passed alone and in the next two full runs. It's PGlite-heavy and load-sensitive, not
  related to 7g. If 7j sees it again, give that test a longer timeout.
- Never `git checkout -- <file>`, `git stash` or `git reset`.

### 6. Checks run (2026-11-20)

- Targeted: GitHub helper 11, Live review route 32, Speed answer order + Current Events + hidden-answer contract +
  away-mode 38, tagging + admission + Speed review routes 62, writer SQL 11. All green.
- `npm run test`: 591 files passed, 1 skipped; 7,706 tests passed, 13 skipped. One earlier run had the timeout above.
- `npx tsc --noEmit`: clean.
- `npx eslint` on every changed file: clean.
- `npm run build`: success (run after the typecheck, not at the same time).
- `/verify`: the real route was run, not a browser. Setup:
  - a scratchpad copy of the working tree with no `.env.local`, so the database is off and nothing could be written;
  - `next dev --webpack -p 3107` (Turbopack refuses a symlinked `node_modules`).
  - Results:
    - `GET /api/trivia` served the fallback questions;
    - a POST for `fallback-1` was graded correct (200);
    - an unknown uuid, a time-out on it, and a junk id all got 404 `{"ok":false,"error":"Not available"}`.
  - The game screen is unchanged; it shows the error as its existing feedback line.
  - The server was stopped and the copy deleted. Andrew's :3000 server wasn't touched.
- **Unverified until 7j applies the migration and merges:**
  - `question_writer_receive` on real Postgres (only PGlite so far);
  - a real GitHub reply to `enablePullRequestAutoMerge` with `expectedHeadOid`. If GitHub rejected the field, the
    call is `.catch`ed and the PR just waits for Andrew, as on a 409.
  - The first unrecorded-Publish recovery against real GitHub (it may never happen).

### 7. Open questions for Andrew

- None.

### 8. Recommended first steps for 7h

1. `git switch fix/second-review-remedials`. Read plan §4 "Phase 7h" and the shared ground rules for 7d–7j.
2. 7h edits `lib/question-writer/candidates.cjs`, `process.cjs` and `liveProcess.cjs`. 7e and 7f changed those files
   last, so read their current state (`git log -p -3 -- lib/question-writer/`). 7g didn't touch them.
3. 7h ends with a sync of `tools/question-writer/*` to `AndrewSerulneck/hightop-question-writer`. That repo is shared
   with the live nightly writer, so check its open runs (`gh run list -R AndrewSerulneck/hightop-question-writer`)
   before pushing there.
4. Model: **Opus 5.5 / medium** (the plan's top table).
