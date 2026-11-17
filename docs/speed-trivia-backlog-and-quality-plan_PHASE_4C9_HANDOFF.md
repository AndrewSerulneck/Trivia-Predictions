# Phase 4c.9 handoff: Live Publish slugs, expired entries, the review queue, matchable answers

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.9" (post-4c.4 review #2, #3, #5, #6). Done
2026-11-17 on Opus 5.5 / high (the plan's tier).

## For Andrew (plain English)

- **What changed:**
  - **A Live question can't clash with a Speed question's ID.** Both games share one ID column. If a new Live question
    was worded like a Speed one, the nightly Live sync would fail completely. Now Publish checks the IDs first and
    picks a free one. The sync also skips any clash, imports everything else, and then goes red with the IDs to fix.
  - **An expired Current Events question no longer blocks a new one.** Publish used to treat a new question as
    "already published" if it matched an expired one, so the new one never reached the game. Now it is added as a new
    entry. A question that is already past its expiry date is refused.
  - **The Live review queue sorts all waiting questions,** not just the 200 oldest. "N left" shows the real number.
  - **An edited Live answer must be one players can type and match.** Answers like "$" or "-" are refused.
- **Is it live?** No. It's uncommitted on `feature/speed-trivia-variety`. Nothing was committed, pushed or deployed.
- **Database:** no migration, no data change and no paid call. Publish adds one small read per run.
- **Checks:** lint (changed files), typecheck (source) and `npm run test` all pass. One unrelated Sports Bingo test
  failed once under load and passed 3 out of 3 times on its own.
- **Needs you:** nothing now. Next is 4c.10, which needs your OK to push the 4c.8 and 4c.10 migrations.

## For the next agent

### 1. Next phase and scope
**Phase 4c.10** (plan §4): bulk Keep stops on changed rows (#7), an atomic report limit as a trigger migration (#8),
the `cleanPlayerAnswer` cleanup (#9). Then: full checks, a read-only production check, Andrew pushes the 4c.8 and 4c.10
migrations, grants are verified, the 4c.10 handoff is written, D23, and the old-tab check. 4c.9 touched none of
4c.10's files (`lib/speedTriviaQuickReview.ts`, `lib/questionReports.ts`).

### 2. Starting state
- Branch `feature/speed-trivia-variety`. The last commit is `1aa32e4e` (the PR #19 merge). All work from 4a to 4c.9
  is uncommitted. Never `git checkout -- <file>`, `git stash` or `git reset`. Finder duplicates with a ` 2` suffix
  exist; don't commit them.
- Production: untouched this phase. No reads, writes or paid calls.
- Migrations still waiting: `20261117135338_speed_trivia_tag_cap.sql` (4c.8), plus the migration 4c.10 will write.
  4c.9 has none.

### 3. Decisions made (don't re-ask)
- **#2, Publish slug check (`planWithFreeSlugs`):** the plan said "re-plan up to 3 rounds". The implementation:
  - Plan, then read only the slugs not yet confirmed free, then reserve any hits and plan again.
  - After 3 reads (`SLUG_CHECK_ROUNDS`), a candidate whose slug is still unchecked is refused with `publish:slug-taken`
    (→ `reject`). The rest are re-planned without it, and every reserved slug is kept.
  - It reads any pool and any status, because a deleted Live row's slug is also unsafe to reuse.
  - The read is one `.in("slug", ≤100)` per round. The importer's prune already sends 200 slugs per `.in`, so URL
    length is fine.
  - A failed read throws a `PublishError("slug-check")`, so every claim goes back to keep (502, "Publish failed.
    Nothing changed.") and no PR is opened.
- **#2, the sync:**
  - The clash read uses the importer's `CHUNK_SIZE` (200, not 500): about 19 reads for 3,707 slugs.
  - Clashing rows are left out before the upsert, so they're also out of the prune set and the availability count.
  - If **every** row clashes, it throws before importing, instead of letting the prune's safety stop hide the
    message.
  - The error text is exactly `Live slug used by a Speed question: <slugs>. Re-slug these in the Live JSON.`. A
    `console.error` line names each slug's pool first.
- **#3:** `isExpiredLiveEntry(entry, today)` lives in `lib/live-trivia-quality/categories.cjs`. It accepts
  `expires_on` or `expiresOn`, and `today` as a Date or YYYY-MM-DD. The importer's `splitExpiredLiveRows` now calls
  it, and its behaviour is unchanged. `buildEntry(candidate, slug, today)` and `planPublish({ …, today })` take
  `today` (default now).
- **#5:** the server orders in SQL (`audience->score` desc nulls last, then `created_at`) with `count: "exact"`;
  `total = max(count, items.length)`. The in-memory sort was removed. The screen shows
  `items.length + beyondPage` as "N left", where `beyondPage = total − loaded`. Keep, reject and Undo still move it
  by one.
- **#6:** `isMatchableAnswer` is exported from `lib/liveShowdownGrading.ts` and built on the grader's own private
  `normalizeForTriviaComparison`. `NUMERIC` must contain a digit. Acceptable answers are still de-duplicated by
  lower case, as before.

### 4. Files
- `lib/live-trivia-quality/categories.cjs` and `.d.cts`: `isExpiredLiveEntry`.
- `lib/live-trivia-quality/publish.cjs` and `.d.cts`:
  - `planPublish` takes `reserved` (treated as taken) and `today`;
  - an expired entry's slug stays taken, but its question key isn't indexed;
  - `buildEntry` throws `PublishError('expired')` for a past Current Events expiry.
- `lib/liveTriviaReview.ts`:
  - `slugsInDatabase` and `planWithFreeSlugs`; `publishLive` calls the latter;
  - `readLiveReviewQueue` orders in SQL and counts;
  - `NUMERIC` needs a digit, and `parseLiveEdit` uses `isMatchableAnswer`;
  - the header comment now says Publish never *writes* `trivia_questions`.
- `lib/liveShowdownGrading.ts`: `isMatchableAnswer`.
- `scripts/import-trivia-questions.cjs`:
  - `findLiveSlugClashes` and `slugClashError`;
  - `upsertRows(rows, { supabase? })` takes an injected client (and skips the network preflight when given one);
  - `splitExpiredLiveRows` uses the shared helper;
  - exports `upsertRows` and `findLiveSlugClashes`.
- `components/admin/sections/LiveTriviaQuickReview.tsx`: `beyondPage`; "N left" counts every waiting question.
- Tests:
  - `tests/lib.live-trivia-quality.test.ts`: `reserved` → `-2`; the expiry rule; a candidate matching an expired
    entry is appended with `-2`; one matching a current entry is "already"; an expired candidate is refused.
  - `tests/api.admin.live-review.test.ts`: the fake `trivia_questions` is now **read-only** (only
    `select("slug").in("slug", …)`; anything else throws). The fake `question_candidates` honours `order`, `limit`
    and `count`. New tests cover: one read with no clash; a re-plan on a clash; 3 reads → `slug-taken`, no PR; a
    stuck candidate doesn't block the others; a failed read releases the claims; unmatchable edits refused; 250
    waiting → total 250 with the newest high scorer first.
  - `tests/components.live-trivia-quick-review.test.ts`: "250 left" → keep → "249 left" → undo → "250 left".
  - `tests/scripts.import-trivia-questions.test.ts`: an in-memory fake whose upsert onto a Speed slug fails, like
    production. The tests: a clash is left out, the rest import, nothing is pruned, and it throws naming the slug;
    all rows clashing → no import; no clash → imports and prunes as before; a Live-on-Live slug isn't a clash; the
    `splitExpiredLiveRows` boundary.

### 5. Facts and traps
- In the Publish test harness, `githubReady`'s merge mock asserts that **every** `publishing` row has the PR URL. A
  refused or "already" row legitimately stays claimed without one until the settle, so a test with a refused row
  must override `mocks.merge` (see "a stuck candidate doesn't hold back the others").
- `planPublish` only sees the files `readLiveFiles` returns: every `.json` in the Live directory on main, plus the
  new-category paths. Expired entries stay in those files as history (D16), so their slugs are always taken.
- `tests/lib.sportsBingo.nfl-star-tilt.test.ts` ("puts stars on boards materially more often than chance") is
  statistical. It failed once in the full run and passed 3 out of 3 alone. It's unrelated to 4c.9.
- `npx tsc --noEmit` prints only stale `.next/dev/types/validator.ts` errors from Andrew's dev server; source is
  clean (`| grep -v '^\.next/'` is empty).

### 6. Build, run, test
- Phase tests:
  `npx vitest run tests/lib.live-trivia-quality.test.ts tests/api.admin.live-review.test.ts tests/components.live-trivia-quick-review.test.ts tests/scripts.import-trivia-questions.test.ts`
- Verified:
  - `npx eslint` on every changed file: clean.
  - `npx tsc --noEmit`: no source errors.
  - `npm run test`: 577 files passed, 1 failed (the flaky bingo test above) and 1 skipped; 7,536 tests passed.
- **Unverified:**
  - The build (4c.10 runs it).
  - PostgREST ordering by `audience->score` against real Supabase. It's documented PostgREST syntax, and jsonb
    numbers sort numerically, but only the fake has run it. After deploy, check that Admin → Live Quick Review loads
    and the top card has the highest score.
  - The importer's clash path against real Supabase. Fake only; it runs on the next push to the Live JSON.

### 7. Open questions
None.

### 8. First steps for 4c.10
Read the plan's "Phase 4c.10" and the shared ground rules for 4c.8–4c.10. Start with #7 in
`lib/speedTriviaQuickReview.ts` (`runQuickReviewBulk`). Model and effort: **Opus 5.5 / medium** (the plan's tier).
