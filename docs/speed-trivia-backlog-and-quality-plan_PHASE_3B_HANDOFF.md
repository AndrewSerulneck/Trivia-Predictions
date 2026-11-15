# Speed Trivia backlog plan — Phase 3b handoff (the repeat checker keeps a confirmed repeat; released rows by revision)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 3b". Previous:
`speed-trivia-backlog-and-quality-plan_PHASE_3A_HANDOFF.md`.

## For Andrew

- **Fixed (review #2, #4 and #5):**
  - When the checker finds a repeat while a different comparison fails (Gemini briefly down, or the budget running
    out), the repeat now counts. The overnight job retires it instead of stopping, and admin edits show "already
    used" instead of "checks unavailable". Comparisons already paid for are saved first, so they're never paid twice.
  - A question you rejected as dull, then brought back, then rejected as **wrong** now blocks its fact again, even
    inside a long-running job.
  - Approvals no longer read the "rejected as dull" list they never used, so a 200-question approval makes 200 fewer
    database calls. If that list can't be read, nothing is skipped and the save still works.
- **Not live.** The database change is written and tested but **not applied**. Phase 3d applies all three remedial
  database changes at once, with your OK. Nothing reaches the site until PR #19 is merged.
- **Cost:** $0. No paid calls were made.
- **Needs you:** nothing new. Still open: the two GitHub budget variables, and when to merge PR #19 (after 3d, never
  before).

## For the next agent

### 1. Next phase: 3c

**Phase 3c** (plan §4 "Phase 3c"): Undo in **Needs a look** restores Needs a look with its note (`prior` column +
`BEFORE UPDATE` trigger on `speed_trivia_review_marks`, `speed_trivia_quick_undo` returns `view`); the reject route
requires `reason` exactly `'quality'` or `'wrong'`; `SpeedTriviaQuickReview` becomes an arrow function.

**Out of scope:** 3d (list check, shared helpers, applying migrations, commit/merge question) and `core.cjs` (frozen).

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19, open and not merged. Phase 3b is committed and pushed on top of
  `1216ead6` as "Speed Trivia: the repeat checker keeps a confirmed repeat; released rows by revision (backlog plan
  Phase 3b)".
- **Two migrations are written and NOT applied:** `20261115212126_speed_trivia_queue_repairs.sql` (3a) and
  `20261115213124_speed_trivia_released_rows_revision.sql` (3b). 3c's must sort after `20261115213124`. 3d pushes all
  three with `supabase db push --linked`, with Andrew's OK.
- **Production data:** unchanged. No paid calls; the `speed_trivia_queue_runs` ledger is still $0.0422 of $20.
- Leave the unrelated untracked files alone and don't commit them: `* 2.ts`, `* 2.m4a`, `* 2.mp4`, `README 2.md`, and
  the two `*_BACKFILL_LOG_*.json` files.

### 3. Decisions made (and why)

- **Capped judge order** (`runtime.cjs`, `cappedJudge.adjudicate`, after every worker settles):
  1. Persist the new verdicts (`toPersist` keys now in `cache`) through `speed_trivia_cache_pairs`. If that write
     fails, throw the pending pair failure if there is one, otherwise the write's own error.
  2. If a pair failed and **no** verdict is `duplicate`, throw the failure (unchanged behaviour).
  3. Otherwise return the results. Failed and unstarted pairs are the existing "Not examined…" holds, so
     `core.checkCandidate` returns `duplicate` and `requireUnique` throws `AdmissionError('duplicate')`.
  - Admission is unchanged: "unique" still needs every pair unique and sound; only a result that couldn't admit
    changes, from "unverified" to "duplicate". `requireUnique` still calls `budget.assertTime()` first, so a real
    deadline still wins over a duplicate.
  - A duplicate can't sit beside a failure inside the two probe pairs (they run one at a time and stop at the first
    non-unique or failure), so the cases are all in the fan-out pool.
- **Released rows by revision:**
  - `speed_trivia_released_rows_v2()` returns `[{id, revision}]`, `revision = m.decided_revision`, same `where` as the
    old function (which already requires `q.speed_revision = m.decided_revision`). The old function is kept; the
    migration says it's dropped once nothing calls it. **Nothing calls it now** — a later phase may drop it.
  - `approval.releasedIndex(index, released: Map<id, revision>)` skips a row only when
    `status==='deleted' && released.get(id) === Number(row.speed_revision)`. Corpus rows are `to_jsonb(trivia_questions)`
    so `speed_revision` is a JSON number (bigint). History rows have `history:<id>:<rev>` ids, so they never match.
- **Lazy read** (`runtime.cjs` `readReleased`): `createSession` no longer reads at start. `write()` reads once per
  session, only when `!approvedOnly`, after the import-idempotent shortcut. `checkApproved` and approved-only writes
  never read it. Any read failure (missing function, error, bad shape) → `released=null` (compare the whole bank),
  one `console.warn`, and the write continues. Exception: `budget_exhausted`/`cancelled` from the budget wrapper are
  rethrown, because the run is over anyway. A failed read is not retried in the same session.
- `invalid-released-rows-option` is now thrown at the top of `createSession`, before the bank load.
- **View rebuild kept.** Measured `approval.releasedIndex` on the 2026-10-14 snapshot
  (`tmp/speed-trivia-uniqueness-private/2026-10-14T03-58-39-593Z`, 13,894 rows): **~60 ms** median per rebuild
  (100, 2,000 and 5,000 released ids all 60 ms; max 70 ms); approved view 27 ms; full index build 3.2 s. Under the
  100 ms bar, so no in-place delta. In the web app, `lib/speedTriviaAdmission.ts` opens a fresh session per write on
  the shared cached index; the view is cached per index by set content, so a rebuild happens only when the set
  changed. The measuring script was a scratch file (not committed); it called `readSnapshot` + `core.buildIndex` and
  timed `releasedIndex` with fresh maps.

### 4. Files changed

- `supabase/migrations/20261115213124_speed_trivia_released_rows_revision.sql` (new): `speed_trivia_released_rows_v2()`,
  `revoke all … from public, anon, authenticated`, `grant execute … to service_role`.
- `lib/speed-trivia-uniqueness/runtime.cjs`: capped judge persist-first / duplicate-wins; lazy fail-safe
  `readReleased`; option check moved up.
- `lib/speed-trivia-uniqueness/approval.cjs` + `approval.d.cts`: `releasedIndex` takes `Map<id, revision>`.
- `types/speedTriviaAdmission.ts`: `releasedRows` doc comment. (`runtime.d.cts` needed no change.)
- `tests/scripts.speed-trivia-admission.test.ts`:
  - existing D5 test now mocks `speed_trivia_released_rows_v2`, plus a same-id-other-revision case (not skipped);
  - new describe "capped judge: a duplicate beside a failed pair" (5 tests): 5xx first then duplicate; duplicate then
    5xx; duplicate beside `budget_exhausted`; failure without duplicate (unchanged, verdicts still saved); cache write
    down beside a failure (throws the pair failure). Cache persistence is checked by reading
    `speed_trivia_cached_pairs` back from PGlite;
  - new describe "D5 released set by revision, read lazily" (3 tests, applies the four Phase 1–3b migrations): the
    reviewer's #4 lifecycle through the real `quick_reject`/`quick_undo` RPCs mid-session; approved-only writes and
    `checkApproved` make zero released calls while full-bank writes make one per session; a missing v2 function →
    whole-bank compare, the write succeeds, one warning.
- `tests/speed-trivia-keep-queue-sql.test.ts`: migration added to `MIGRATIONS`; new test for v2 (ids + numeric
  revision, same ids as v1, wrong re-reject drops it, quality re-reject lists the new revision); anon/authenticated
  denied v2.
- `docs/speed-trivia-backlog-and-quality-plan.md`: status line, §4 Phase 3b "DONE" note, §7 D5 rule names v2.

### 5. Facts and traps

- Fixture judges must be narrow: in a tiny PGlite corpus, retrieval returns nearly every row, so "duplicate when
  `b` is the released row" also hits unrelated questions. The new tests match on the answer too.
- To test pair-cache persistence, a fixture judge must write into the session `cache` the way `gemini.cjs` does
  (`{modelVersion, firstHash, result}` under `core.pairKey(a, b, modelVersion)`); `speed_trivia_cache_pairs` rejects
  other shapes.
- PGlite returns `int8` awkwardly; tests read `speed_revision::int`.
- `components.speed-trivia-quick-review.test.ts` › "ignores shortcuts while editing…" failed once in a full run (1,019
  ms under load), passed alone (162 ms) and in a full re-run. Timing flake, untouched by this phase; 3c edits that
  component, so watch it.
- Deploy order is now safe for 3b alone: code without the v2 function just compares the whole bank. 3a's
  `speed_trivia_queue_prepare` is still required before the overnight script runs, so **don't merge before 3d**.

### 6. Build, run, test

- `npm run test`: **546 files passed, 1 skipped (7,172 tests passed, 13 skipped)** on 2026-11-15 (second run; first
  run had the flake above). `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` printed nothing. `npx eslint` on the six
  changed code/test files was clean.
- Targeted:
  ```
  npx vitest run tests/scripts.speed-trivia-admission.test.ts tests/speed-trivia-keep-queue-sql.test.ts tests/scripts.speed-trivia-keep-queue.test.ts tests/security-definer-execute-contract.test.ts tests/supabase-migration-grants-contract.test.ts
  ```
- Frozen gates, unchanged and passing:
  `npx vitest run tests/speed-trivia-uniqueness-evaluation.test.ts tests/speed-trivia-uniqueness-release.test.ts`.
- **Verified:** PGlite + fixture judges only. **Not verified:** the migration on production (3d).

### 7. Open questions / waiting on Andrew

Unchanged: set `SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20`; merge PR #19 only
after 3d.

### 8. Recommended first steps for Phase 3c

1. Read plan §4 "Phase 3c" and §7 "Remedial rules".
2. `supabase migration new speed_trivia_undo_needs_look` (must sort after `20261115213124`); add it to the
   `MIGRATIONS` arrays in `tests/speed-trivia-keep-queue-sql.test.ts`, `tests/scripts.speed-trivia-keep-queue.test.ts`,
   the `REMEDIAL` list in `tests/scripts.speed-trivia-admission.test.ts`, and any Quick Review SQL test that needs it.
3. Copy today's `speed_trivia_quick_undo` body from `20261115170333_speed_trivia_keep_queue.sql` exactly (status
   restore, drift checks, `speed_trivia_released_restores` insert) before adding the `prior` restore.
4. Model and effort: **Opus 5.5 / high** (plan §3).
