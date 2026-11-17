# Phase 4c.3 handoff — dated questions and category gates

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Remedial phases 4c.1–4c.4" → "Phase 4c.3" (review #4, #5,
#7, #8; D28). Done 2026-11-16 on Opus 5.5 (the plan names Opus 5.5 / medium).

## For Andrew (plain English)

- **What changed:**
  - Speed questions with no category no longer vanish from "All Categories" while Current Events is hidden.
  - A Current Events Speed question that has no expiry date (added in Admin, or edited) now retires 12 months after
    it was created, in the same monthly step as the dated ones.
  - A Live Current Events question added by hand without `expires_on` now fails the Live check, so Sync Live Trivia
    stops instead of keeping it forever.
  - On the 1st, the nightly runs expiry before it decides whether Current Events is shown, so the category hides the
    same night it drops below 60.
  - The Live admin round dropdown now offers Current Events only when the round builder can actually fill it.
- **Is it live?** No. Everything is uncommitted on `feature/speed-trivia-variety`. One new database change
  (`20261117033637_speed_trivia_expire_undated_current_events.sql`), tested on a throwaway database only. Phase 4c.4
  applies it with your OK.
- **Cost:** $0. No paid calls. The monthly expiry may read ~5,000 rows instead of a handful, once a month. The Live
  admin dropdown makes one extra small read when it opens.
- **A separate finding for you (not fixed, as the plan says):** the Live admin round dropdown reads every active Live
  question in one go, and the database stops at 1,000 rows. Production has 3,454, so the counts shown for other
  categories come from only the first 1,000 rows. It doesn't change what rounds can be built (the builder reads in
  pages, and the replacement reads the files), only the numbers in the dropdown. Fixing it means paging that read.
  Want that added as its own small phase?
- **What's left:** 4c.5 → 4c.6 → 4c.7 → 4c.4, then commit, merge and deploy.

## For the next agent (Phase 4c.5)

### 1. Next phase goal and scope

Phase 4c.5 — writer polish (D30): plan §4 "Phase 4c.5". Then 4c.6 → 4c.7 → 4c.4. Out of scope: deploys,
`supabase db push` (4c.4 applies 4c.2's, 4c.3's and 4c.7's migrations once, with Andrew's OK), the dropdown truncation
above (waits on Andrew).

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e`. **All 4a–4c.3 work is uncommitted** by design (D23).
  Never `git checkout -- <file>`, `git stash` or `git reset`.
- New migration **`supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql` — NOT applied.**
  It is a `create or replace` of `speed_trivia_expire_dated(date, boolean, int)` (same signature), so until it's
  applied, production keeps the old rule; nothing breaks.
- No data change, no paid call. One read-only production query (counts only, below).
- 4c.4 before the push should re-check: `select count(*) from trivia_questions where question_pool='anytime_blitz'
  and category='Current Events' and status in ('active','pending_review') and coalesce(speed_generation_metadata->>'expiresOn','') !~ '^\d{4}-\d{2}-\d{2}$' and created_at < now() - interval '12 months'`
  — should be 0 (0 Current Events rows existed at the review), so the first monthly run after the push retires nothing
  unexpected.

### 3. Decisions made in this phase

- D28 default applied (Andrew gave no other answer): undated Current Events Speed rows retire 12 months after
  `created_at` (UTC date ≤ `p_today − 12 months`).
- **Deviation:** a malformed `expiresOn` counts as undated (spec said "no expiresOn"), so a typo can't make a question
  live forever. Rows with NULL `created_at` are left alone.
- The new predicate is an `OR` inside the existing two branches (not a `UNION`), because the apply branch keeps the
  original `for update of t` row locks, which Postgres doesn't allow on a `UNION`.
- The Live check is in `normalizeAndValidate` (used by both `--check` and the import), case-insensitive on the category.
- The admin gated read uses `.ilike("category", "Current Events")` (case-insensitive, like `liveCategoryMinimum`;
  the name has no `%`/`_`), `.range(0, 999)`. The main read now skips gated rows; the gated count replaces them.

### 4. Files changed

- `lib/trivia.ts`: `withoutHidden` → `.or("category.is.null,category.not.in.(…)")`.
- `supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql` (new).
- `scripts/speed-trivia-dated-housekeeping.cjs`: `run()` calls `speed_trivia_expire_dated` first, then the visibility
  refresh. Output shape unchanged.
- `scripts/import-trivia-questions.cjs`: Live Current Events entry without `expires_on` → "Current Events needs
  expires_on (YYYY-MM-DD)."
- `lib/liveTriviaCategoryGate.ts`: now also exports `GATED_LIVE_CATEGORIES`, `getLiveTriviaCorrectAnswer`,
  `countAnswerWords`, `isLiveTriviaSeedAnswerAllowed` (moved from `lib/liveShowdownEngine.ts`; imports
  `parseLargePureNumberAnswer` from `lib/liveShowdownClosestGuess.ts`, which is `server-only` — fine, only server libs
  import the gate).
- `lib/liveShowdownEngine.ts`: local copies removed; imports them.
- `lib/liveShowdownAdmin.ts`: `getLiveShowdownRoundCategories` counts gated categories from their own bounded read
  through the shared rule (`GATED_CATEGORY_READ_LIMIT = 1000`).
- Tests: `tests/api.speed-trivia-current-events.test.ts` (fake now applies the `.or` with SQL NULL semantics; new NULL
  row case), `tests/question-variety-sql.test.ts` (loads the new migration; 2 new PGlite cases),
  `tests/live-question-candidates-sql.test.ts` (migration added to the list after `20261117025917`),
  `tests/scripts.question-variety.test.ts` (order test with a fake bank), `tests/live-trivia-current-events-gate.test.ts`
  (importer rejection; Admin + builder with 45 rows, one long answer; one existing case moved to Music).
- Docs: plan status line, 4c.3 "As built", Speed and Live standing rules.

### 5. Facts and traps

- **PostgREST row cap is 1,000 on production:** an unranged select of active `live_showdown` rows returned 1,000 of
  3,454 (read-only, 2026-11-16). 0 active Live Current Events rows. Anything that reads a whole pool must page.
- `lib/liveShowdownEngine.ts`'s `loadActiveLiveTriviaSeedQuestionPool` already pages; `replaceRoundQuestionsWithCategory`
  draws from the JSON files, so neither is affected.
- The housekeeping script's `rpc` throws on error, so if expiry fails, visibility isn't refreshed that night (the flag
  keeps its last value; reads fail closed only on a read error). Same failure mode as before for the other order.
- `npx tsc --noEmit`: clean outside `.next/`.

### 6. Build, run, test

- `npx vitest run tests/api.speed-trivia-current-events.test.ts tests/question-variety-sql.test.ts tests/scripts.question-variety.test.ts tests/live-trivia-current-events-gate.test.ts tests/live-question-candidates-sql.test.ts`
- `npm run test` → 568 files passed (1 skipped), 7,419 passed, 13 skipped, 0 failed (2026-11-16).
- `npm run live-trivia:check` → 3,707 questions, 8 files, passes.
- `npx eslint` on every changed file: clean.
- **Unverified:** the migration on the real database (4c.4).

### 7. Open questions for Andrew

- Page the Live admin dropdown's read (wider truncation above) — as its own phase, or leave it?

### 8. Recommended first steps for 4c.5

Model **Opus 5.5 / medium** (plan table). Read plan §4 "Phase 4c.5" and D30. No migration expected. Bar-test versions
bump: Speed `bar-test-v4` → `bar-test-v5`, Live `bar-test-live-v2` → `bar-test-live-v3`.
