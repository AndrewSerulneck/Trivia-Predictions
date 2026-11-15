# Speed Trivia backlog plan — Phase 0 handoff

Written 2026-11-15 by Claude (Opus 5.5, medium effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md`.

## For Andrew

- **Literary Landscapes is gone.** All 220 of its questions were retired in production (121 waiting + 99 that players
  could get under "All Categories"). That's live now, no deploy needed. The bank is now **4,221 approved / 7,333
  waiting / 2,864 deleted**.
- **The nightly writer is paused** (GitHub workflow "Trivia Nightly" disabled). It stays off until Phase 4.
- **The writer can no longer invent categories.** It now only writes for the 8 categories players pick. This code
  change is **not committed yet** (it sits on your working copy). It only matters once nightly is turned back on.
- **Cost: $0.**
- **Needs you:**
  1. Your answer "3. No" is ambiguous. D3 asked: review the 473 recent questions with the score, or reject them
     all? Does "No" mean **reject them all**? Phase 1 doesn't depend on it; Phase 2 does.
  2. D5–D8 are still open. Phase 1 needs D5 (should a "dull/obscure" reject block that fact forever?). Phase 3
     needs D8. Phase 4 needs D6 and D7.
  3. Commit/PR: say when you want these changes committed (suggest a new branch, not
     `chore/drop-tv-pairing-codes`).

## For the next agent (Phase 1 — Quick Review)

### 1. Goal and scope

Phase 1 per plan §4: Quick Review screen, server-side filters, bulk-by-filter, `speed_trivia_review_marks` table,
free fast-lane approval RPC for rows with a current full-bank admission. **Out of scope:** the bar-test scorer
(Phase 2), the overnight Keep queue and checker speed-up (Phase 3), any generator prompt change (Phase 4),
re-enabling nightly.

### 2. Starting state

- Branch `chore/drop-tv-pairing-codes`, last commit `5d3c10e6` (unrelated TV-pairing work). **Nothing from Phase 0
  is committed or pushed.** Uncommitted Phase 0 files:
  - `lib/speed-trivia-uniqueness/generation.cjs` (modified)
  - `tests/scripts.speed-trivia-admission.test.ts` (modified)
  - `tests/speed-trivia-generator-categories-contract.test.ts` (new)
  - `scripts/retire-speed-trivia-category.cjs` (new)
  - `docs/speed-trivia-backlog-and-quality-plan_PHASE_0_RETIRE_LOG_2026-11-15.json` (new — **the undo log; keep it**)
  - `docs/speed-trivia-backlog-and-quality-plan.md` (untracked before this phase; status line updated)
  - this handoff
  Other untracked files in `git status` (`* 2.ts`, `* 2.m4a`, backfill logs from other plans) are not Phase 0's.
- Nightly: the GitHub workflow `trivia-nightly.yml` (id 264911476) is `disabled_manually` (`gh workflow disable`,
  2026-11-15). The generator runs from the GitHub checkout of `main`, so the category fix only takes effect when it
  reaches `main`; no Vercel deploy is involved.
- Data (production `pkmxupsayzshvpirkaav`, read back 2026-11-15 after the change), `question_pool='anytime_blitz'`:

  | status | before | after |
  | --- | --- | --- |
  | active | 4,320 | 4,221 |
  | pending_review | 7,454 | 7,333 |
  | deleted | 2,644 | 2,864 |

  Literary Landscapes now: 247 rows, all `deleted` (220 by this phase + 27 already deleted).
- Undo log: `docs/speed-trivia-backlog-and-quality-plan_PHASE_0_RETIRE_LOG_2026-11-15.json` — full before-state of
  all 220 rows (`select *`), `before: {pending_review:121, active:99}`.

### 3. Decisions already made (2026-11-15)

- D1 **Yes**: retire the 99 approved Literary Landscapes rows too. Done.
- D2 **Yes**: pause nightly until Phase 4. Done.
- D3 **"No"**: ambiguous — see "Needs you" above. Don't act on the 473 recent rows until clarified.
- D4 **$1.50** approved for the Phase 3 measurement run only.
- D5–D8: **unanswered.**

### 4. Files changed

- `lib/speed-trivia-uniqueness/generation.cjs`: removed `'Literary Landscapes'` from `TOPICS`; new exported
  `GENERATOR_CATEGORIES = Object.keys(TOPICS)`. `planTopics()` seeds the inventory with those 8 categories at 0 and
  ignores rows in any other category. The `['origins', …, 'lesser-known discoveries']` fallback for unknown
  categories is gone. Nothing else in the prompt changed (that's Phase 4).
- `tests/speed-trivia-generator-categories-contract.test.ts`: `GENERATOR_CATEGORIES` and `TOPICS` keys must equal
  `TRIVIA_CATEGORIES` dbValues (`lib/triviaCategories.ts`). The `.cjs` can't import that `.ts` file (it pulls in
  `lucide-react`), so the list is duplicated and pinned by this test.
- `tests/scripts.speed-trivia-admission.test.ts`: the old "plans from database counts…" test expected Literary
  Landscapes first; now asserts 8 categories, Literary Landscapes excluded, Music counted.
- `scripts/retire-speed-trivia-category.cjs`: `--category X [--status pending_review,active] [--apply]`. Dry run by
  default. `--apply` writes the undo log with `flag:'wx'` (refuses to overwrite) **before** any update, then
  updates in chunks of 100, guarded by `eq('status', <logged status>)` + pool + format, then reads counts back.
  `--undo <log>` is a dry run; `--undo <log> --apply --max-dollars N` restores through signed admission (see §5).

### 5. Facts and traps

- **Un-retiring is paid, and plain updates are blocked.** The trigger `guard_speed_trivia_write`
  (`supabase/migrations/20261013120000_speed_trivia_admission.sql`) lets a status-only change *to* `deleted` through
  without a permit, but any other change (including `deleted → pending_review`) raises `speed-admission-required`
  unless a signed admission permit exists. So the undo path uses `session.write({status:'pending_review'},
  {existing: row, restore: true})` → `admit_speed_trivia`, a full-bank repeat check at ~$0.03/row (≈ $7 for all
  220). **The undo `--apply` path is untested** (it would cost money and undo the phase). Its dry run was verified:
  `logged 220, stillRetired 220, reapproveInQuestionReview 99`. Formerly active rows come back as `pending_review`
  and need re-approval in Question Review, never a plain `status='active'` update.
- Phase 1's Undo (restore a rejected row within the session) hits the **same trigger**: a plain
  `deleted → pending_review` update will fail. Plan for it: either keep "reject" as a mark until the session ends,
  or add a narrow SECURITY DEFINER RPC that allows only `deleted → pending_review` with unchanged content for a row
  whose mark says it was rejected by Quick Review. Decide before building Undo.
- `scripts/manage-speed-trivia-retirement.cjs` is the duplicate-retirement tool (needs keeper evidence + signed
  manifest); it is not usable for category retirement. `scripts/restore-deleted-speed-trivia.cjs` is deliberately
  disabled.
- `tests/fixtures/speed-trivia-uniqueness/evaluation-*.json` still contain Literary Landscapes rows. They're frozen
  evaluation fixtures; leave them.
- `npx tsc --noEmit` reports errors only in stale `.next/types/app/tv/*` and `.next/types/app/api/tv-pair/*` (routes
  removed on this branch); `next typegen` doesn't delete them. Zero errors outside `.next/`. Don't delete `.next`
  while Andrew's dev server may be running; filter with `grep -v '^\.next/'`.
- Scripts reach production with `node --env-file=.env.local …` (service role). Never read `.env.local`.

### 6. Build, run, test

- `npm run test` → 539 files passed, 1 skipped (7,089 tests). `npx tsc --noEmit` → 0 errors outside `.next/`.
  `npx eslint` on the four changed code files → clean.
- Targeted: `npx vitest run tests/speed-trivia-generator-categories-contract.test.ts tests/scripts.speed-trivia-admission.test.ts`.
- Re-run the dry run any time: `node --env-file=.env.local scripts/retire-speed-trivia-category.cjs --category "Literary Landscapes" --status pending_review,active` → should now report `matched: 0`.

### 7. Open questions for Andrew

D3 meaning; D5, D6, D7, D8; when to commit (and on which branch).

### 8. Recommended first steps for Phase 1

1. Get D5 answered (it decides what a Quick Review reject writes) and D3 clarified.
2. Commit Phase 0 on its own branch off `main` first, so Phase 1 starts clean.
3. Read `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`, `tests/security-definer-execute-contract.test.ts`, and the
   admission migration's `admit_speed_trivia` / `speed_trivia_admissions` before designing the fast-lane RPC.
4. Model/effort: **Opus 5.5 / high** (plan §3).
