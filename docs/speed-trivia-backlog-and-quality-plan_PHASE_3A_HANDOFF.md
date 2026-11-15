# Speed Trivia backlog plan — Phase 3a handoff (one bad question never stops the overnight job)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Remedial phases 3a–3d". Previous:
`speed-trivia-backlog-and-quality-plan_PHASE_3_HANDOFF.md`.

## For Andrew

- **Fixed (review #1 and #3):**
  - One question with a problem no longer stops the overnight job. If the problem is with the question itself, it
    goes to **Needs a look** with a short note and the job moves on. If it's a passing problem, like Gemini being
    briefly down, the question stays queued and is retried the next night.
  - The job stops early only at your budget, the time limit, or after 3 passing failures in a row or 20 failures in
    one night, so an outage can't burn the night.
  - Keeps on questions you later deleted, or approved in the old Question Review, are now cleared each night. An
    idle night is idle again: no dollars reserved, no bank load.
- **Not live.** The database change is written and tested but **not applied**. Phase 3d applies all three remedial
  database changes at once, with your OK. Nothing reaches the site until PR #19 is merged.
- **Cost:** $0. No paid calls were made.
- **Needs you:** nothing new for this phase. Still open from Phase 3: the two GitHub budget variables, and when to
  merge PR #19. **Don't merge PR #19 before Phase 3d has applied the database changes.** The overnight job now calls
  a database function that doesn't exist on production yet.

## For the next agent

### 1. Next phase: 3b

**Phase 3b**: the capped judge keeps a confirmed `duplicate` when another pair fails, and saves paid verdicts before it
throws. Released rows are tracked by revision (`speed_trivia_released_rows_v2`). The released set is read lazily and
safely (review #2, #4, #5). The full spec is in plan §4 "Phase 3b".

**Out of scope:**
- 3c (Undo restores Needs a look, strict reject reason, arrow function);
- 3d (list check, shared helpers, applying the migrations);
- `core.cjs`, which is frozen.

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19, open and not merged. Phase 3a is committed and pushed on top of
  `d5266f69`, as "Speed Trivia: one bad question never stops the overnight queue (backlog plan Phase 3a)". That
  commit also carries the plan-doc edits that added the remedial phases.
- **Migration `supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql` is NOT applied.** By plan rule, 3d
  runs `supabase db push --linked` once for 3a+3b+3c, with Andrew's OK. Don't push it earlier.
- **Production data:** nothing changed in this phase. No paid calls, and the `speed_trivia_queue_runs` ledger is
  unchanged ($0.0422 of $20 spent).
- Leave the unrelated untracked files alone and don't commit them: `* 2.ts`, `* 2.m4a`, `* 2.mp4`, `README 2.md`, and
  the two `*_BACKFILL_LOG_*.json` files.

### 3. Decisions made (and why)

- **`speed_trivia_queue_prepare(p_apply)`** classifies every `decision='keep', outcome='queued'` mark:
  - `queued` = a Speed row (`anytime_blitz` + `multiple_choice`) that is still `pending_review`, **whatever its
    content**. An edited waiting row stays queued, because the queue itself settles it `needs_look` "Edited after
    Keep".
  - `settled` = an `active` Speed row with an admission whose `content_hash` matches the mark,
    `evidence->>'decision'='unique'`, and whose current `speed_content_hash` matches the mark. These are exactly
    the checks `speed_trivia_queue_settle('approved')` makes. Applying it writes the same fields as settle.
  - `stale` = everything else (missing row, left Speed, `deleted`, or `active` without that admission). This is the
    complement, which is safer than listing each case.
  - Applying a stale mark clears it with the same field reset as `quick_undo`. The mark is deleted when `audience`
    and `precheck` are both null. It never touches `trivia_questions` (tested by a before/after snapshot).
  - `p_apply=false` takes **no locks** and writes nothing. `p_apply=true` locks the control row first, then the
    queued marks, the same lock order as the other RPCs. All Speed writes take the control lock (the guard
    trigger), so reading `trivia_questions` under it is consistent.
  - `p_apply null` raises `invalid-quick-review-request`.
- **Error classes** (`classify` in the script):
  - **stop:** `budget_exhausted`, `cancelled`, `budget_configuration`. `budget_exhausted` reports
    `stopped='budget'`, which isn't an error exit.
  - **row:**
    - `core.content()` failing (checked first, by `contentProblem`, flagged `malformed: true`);
    - `invalid_pool`, `retired`, `approved-only-requires-unchanged-pending-approval`;
    - a settle RPC refusing with `invalid-quick-review-request`.
  - **transient:** everything else, including `verification_unavailable`, `stale_revision`, network errors and
    other settle failures (`settle_failed`).
- **Plain-Error codes:** the engine throws some errors as plain `Error`s whose message is the code (for example
  `malformed-answer`, or `approved-only-…`). `errorCode` uses the message as the code when it looks like a slug
  (`/^[a-z][a-z0-9_-]{2,80}$/`), and returns `failed` otherwise. Settle errors now carry `code`.
- **Breaker:** created in `runPaid` and **shared by both passes**, so "20 in a run" covers the queue and the
  pre-check together. A transient error adds to the in-a-row streak, and any other result resets it. Every error,
  of either class, counts toward the 20. A stop-class error isn't counted in `rowErrors`/`transientErrors`, but it
  is listed in `errors` when it isn't the budget.
- **Keep queue, row problem:** the row is settled `needs_look` with "Couldn't check (<code>). Keep it again or reject
  it." If that settle fails as well, the error is recorded and the run continues. Example: the row is active, so
  settle returns `skipped`, and next night's `prepare` clears the mark.
- **Pre-check, row problem:** for a problem from `checkApproved`, the row is settled `uncertain` with "Couldn't check
  (<code>)." A **malformed row can't be settled**: the JS can't compute a content hash for it, and
  `precheck_settle` needs one. So it is only reported as a row error, at no cost. It's retried each night and
  counts toward the 20. That's acceptable: the 7,333 waiting rows were all scored in Phase 2, which needed valid
  content, so none are malformed today. If it ever matters, give `speed_trivia_precheck_settle` a "current content"
  mode.
- **Report:** each pass report gains `rowErrors` and `transientErrors`, and `errors` entries gain `kind`. At most 50
  entries are kept. `--apply` output also carries `stale` and `settled` from `prepare`. Count mode prints
  `{queued, stale, settled}`, where stale and settled are what an `--apply` run *would* clear or settle.

### 4. Files changed

- `supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql` (new):
  - partial index `speed_trivia_review_marks_queued_idx (decided_at, row_id) where decision='keep' and
    outcome='queued'`, which matches `readQueued`'s order;
  - `speed_trivia_queue_prepare(boolean) returns jsonb`, with `execute` revoked from public, anon and authenticated
    and granted to `service_role`.
- `scripts/process-speed-trivia-keep-queue.cjs`:
  - `countQueued` is replaced by **`prepare(client, apply)`**;
  - new `classify`, `contentProblem`, `createBreaker`, `recordError` and `settleError`;
  - `processQueue` and `precheckPass` are rewritten around the classifier, and both take an optional `breaker`;
  - `runPaid` creates the shared breaker, and takes an injectable `readMarks` (default `readQueued`);
  - **`runApply({client, args, env, ...inject})`** is the old apply block from `main`, now testable. Its order is:
    prepare(true), then pre-check candidates, then the nothing-to-do exit, then the budget check, then `runPaid`;
  - exports `prepare`, `runApply` and `classify` as well.
- `tests/speed-trivia-keep-queue-sql.test.ts` (+2 tests, extended permissions test):
  - `prepare(false)` writes nothing;
  - `prepare(true)` settles only with a matching unique admission;
  - it clears deleted, left-Speed and active-unadmitted marks, deleting unscored ones and clearing scored ones;
  - it doesn't settle an admission of edited content;
  - anon and authenticated are denied.
- `tests/scripts.speed-trivia-keep-queue.test.ts` (+7 tests), covering:
  - the reviewer's case (edited, then approved elsewhere: prepare clears it, and the next mark is processed);
  - the same case without prepare (the run continues);
  - a malformed head row going to `needs_look`;
  - 2 transient errors, then a success;
  - 3 transient errors in a row, which gives `stopped='errors'` after exactly 3 writes;
  - 20 errors in a run, which stops it with the 21st mark still queued;
  - a Keep deleted elsewhere: `runApply` makes only `prepare` + `precheck_candidates` calls and never creates a
    session;
  - pre-check row, transient and malformed cases.
- `docs/speed-trivia-backlog-and-quality-plan.md`: the status line only. The remedial-phase text was already there,
  uncommitted, and is now committed with this phase.
- No change was needed to `.github/workflows/speed-trivia-keep-queue.yml`. It runs `--apply --precheck` and
  `prepare` is internal.

### 5. Facts and traps

- **The production schema lacks `speed_trivia_queue_prepare` until 3d.** Any run of the script against production
  (count or `--apply`) fails with "function not found" until then. Don't run it, and don't merge PR #19 before 3d.
- The harness client (`scripts/test-speed-trivia-admission-sql.cjs` `clientFor`) has only `.rpc`, so tests read
  queued marks straight from SQL (`queuedMarks()` in the script test) instead of `readQueued`.
- In tests, `failing(session, 'write'|'checkApproved', fn)` wraps a real session so chosen rows throw a code. Session
  methods are closures, so spreading the session object is safe.
- A JS-side-corrupted row (`rows.set(id, {...row, options: [...,'']})`) is how the tests simulate malformed content.
  The guard trigger would refuse it in SQL.
- `instanceof AdmissionError` is still never used across ESM/CJS. The classifier works on `error.code`.

### 6. Build, run, test

- `npm run test` gave **546 files passed, 1 skipped (7,162 tests)** on 2026-11-15.
  `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` printed nothing, and `npx eslint` on the three changed code and test
  files was clean.
- To run the targeted tests:
  ```
  npx vitest run tests/scripts.speed-trivia-keep-queue.test.ts tests/speed-trivia-keep-queue-sql.test.ts tests/security-definer-execute-contract.test.ts tests/supabase-migration-grants-contract.test.ts
  ```
- **Verified:** everything on PGlite with fixture judges.
- **Not verified:** the migration on production (3d), and a real overnight run (needs the merge and the variables).

### 7. Open questions / waiting on Andrew

Unchanged from Phase 3 §7:
1. Set the repository variables `SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20`.
2. Decide when to merge PR #19. Merge after 3d, never before.

### 8. Recommended first steps for Phase 3b

1. Read plan §4 "Phase 3b" and §7 "Remedial rules".
2. Start in `lib/speed-trivia-uniqueness/runtime.cjs` `cappedJudge.adjudicate`. Around line 150, `if(failure)throw
   failure` runs before the pair-cache write and before the duplicate check. Persist first, then let a duplicate
   win.
3. Write the new migration with `supabase migration new speed_trivia_released_rows_revision`. It **must sort after**
   `20261115212126`. Add it to the `MIGRATIONS` arrays in the tests that need it.
4. Measure `approval.build` on a ~15k-row index with `scripts/measure-speed-trivia-admission-offline.cjs` before
   choosing between a full rebuild and an in-place delta. Record the number.
5. Re-run the frozen gates without changing them: `npx vitest run tests/speed-trivia-uniqueness-evaluation.test.ts
   tests/speed-trivia-uniqueness-release.test.ts`.
6. Model and effort: **Opus 5.5 / high** (plan §3).
