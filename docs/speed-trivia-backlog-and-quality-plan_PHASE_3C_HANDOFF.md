# Speed Trivia backlog plan — Phase 3c handoff (Quick Review: Undo returns a question to where it was)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 3c". Previous:
`speed-trivia-backlog-and-quality-plan_PHASE_3B_HANDOFF.md`.

## For Andrew

- **Fixed (review #7, #9 and #10):**
  - In **Needs a look**, Keep or Reject and then **Z** now puts the question back in Needs a look, with the
    overnight note. It used to drop it into Waiting and erase the note.
  - A Quick Review reject must say exactly "quality" or "wrong". Anything else is refused, so a typo can never
    release a fact you meant to keep blocked.
  - The Quick Review component now follows the arrow-function style rule.
- **Budget variables:** confirmed set on GitHub — $5 per night, $20 in total.
- **Not live.** The database change is written and tested but **not applied**. Phase 3d applies all three remedial
  database changes at once, with your OK. Don't merge PR #19 before then.
- **Cost:** $0. No paid calls were made.
- **Needs you:** in 3d, an OK to apply the three database changes; after that, whether to merge PR #19.

## For the next agent

### 1. Next phase: 3d

**Phase 3d** (plan §4 "Phase 3d"): list-check fix (`audience.cjs` `preChecks`, `AUDIENCE_VERSION` → `bar-test-v2.1`,
free calibration re-run), free re-score script with an undo log, shared helpers (`runtime.sameAnswer`,
`scripts/lib/speedTriviaServiceClient.cjs`), then **apply the 3a, 3b and 3c migrations with Andrew's OK**, verify on
production, run all checks, commit, push, and ask Andrew whether to merge PR #19.

**Out of scope:** Phase 4a onward; `core.cjs` (frozen).

### 2. Starting state

- Branch `feature/speed-trivia-quick-review`, PR #19, open and **not merged**. Phase 3c is committed and pushed on top
  of `7dfcb722` as "Speed Trivia: Undo returns a question to Needs a look; strict reject reason (backlog plan Phase 3c)".
- **Three migrations are written and NOT applied:** `20261115212126_speed_trivia_queue_repairs.sql` (3a),
  `20261115213124_speed_trivia_released_rows_revision.sql` (3b), `20261115214254_speed_trivia_undo_needs_look.sql`
  (3c). 3d pushes them with `supabase db push --linked` after Andrew says OK.
- **Andrew, 2026-11-15:** "Don't merge PR #19 until Phase 3d has applied the database changes."
- **GitHub repository variables set** (checked with `gh variable list`, 2026-11-15): `SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5`,
  `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20` (and the older `SPEED_TRIVIA_MAX_DOLLARS=0.50`).
- **Production data:** unchanged. The `speed_trivia_queue_runs` ledger is still $0.0422 of $20.
- Leave the unrelated untracked files alone and don't commit them: `* 2.ts`, `* 2.m4a`, `* 2.mp4`, `README 2.md`, and
  the two `*_BACKFILL_LOG_*.json` files.

### 3. Decisions made (and why)

- **`speed_trivia_review_marks.prior jsonb`** holds `{content_hash, decided_revision, decided_at, note, checked_at,
  matched_row_id}` of the needs-look mark while a Keep or Reject made from Needs a look stands. A check constraint
  allows it only on a `keep`/`reject` mark that isn't `needs_look`, and requires `content_hash`, `decided_revision`
  and `decided_at`.
- **`BEFORE UPDATE` trigger `speed_trivia_review_marks_prior`** (fires on the `on conflict do update` path of
  `quick_keep` / `quick_reject`, so neither RPC was rewritten). Rules, in order:
  1. new `decision is null` or new `outcome = 'needs_look'` → `prior := null`;
  2. old is `keep`/`needs_look` → `prior :=` the old fields;
  3. **(addition to the plan)** old `outcome = 'queued'` and new outcome isn't `queued` (the overnight job settled the
     Keep, or `queue_prepare` settled it `approved`) → `prior := null`. Why: the settle result is the newest word on
     the question, so Restore from **Repeats** still returns it to Waiting, as before, instead of to a stale note.
  - Otherwise `prior` is left as it is (e.g. `set_audience` on a queued Keep keeps it).
  - The trigger function is plain (not SECURITY DEFINER); `execute` revoked from `public, anon, authenticated`.
- **`speed_trivia_quick_undo`**: `create or replace` with the 20261115170333 body unchanged (status restore, drift
  checks, `speed_trivia_released_restores` insert for a quality reject). Then, if `m.prior` is set, the mark is written
  back to `keep`/`needs_look` with the prior fields, keeping `audience` and `precheck`; `matched_row_id` is restored
  only if that row still exists (FK). Returns `{id, status, view}`, `view` = `'needs_look'` or `'waiting'`.
- **Lib** `quickUndo` normalises `view`: anything but `'needs_look'` is `'waiting'`, so a server without 3c behaves as
  before.
- **Client** (`SpeedTriviaQuickReview.tsx`): Undo re-inserts the item only when the returned `view` equals the Show
  view; otherwise it stays out of the list. Counts are now kept in step locally: a Keep that queued adds 1 to
  `queued`; a Keep/Reject in Needs a look takes 1 from `needsLook`; Undo reverses both by what the server returned.
  `UndoEntry` gained `queued?: boolean`.
- **Route**: `action:'reject'` requires `reason` exactly `'quality'` or `'wrong'` → otherwise 400 "Invalid request."
  Bulk reject stays `'quality'` by design (server-side, not from the body).
- **Style**: `export const SpeedTriviaQuickReview = () => { … };`. Route handlers stay `export async function`.

### 4. Files changed

- `supabase/migrations/20261115214254_speed_trivia_undo_needs_look.sql` (new): column + constraint, trigger function
  + trigger, `speed_trivia_quick_undo` replacement, re-issued revoke/grant on it.
- `lib/speedTriviaQuickReview.ts`: `quickUndo` → `QuickReviewUndoResult`.
- `types/speedTriviaQuickReview.ts`: `QuickReviewUndoResult`.
- `app/api/admin/trivia/quick-review/route.ts`: strict reject reason.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`: arrow function; Undo by server `view`; counts.
- Tests:
  - `tests/speed-trivia-keep-queue-sql.test.ts`: 3c migration in `MIGRATIONS`; 5 new tests (Keep→Undo with note and
    score; fast-lane approval from Needs a look after an edit → Undo; quality and wrong Reject → Undo with the D5
    window still recorded and the fast lane still denied; Waiting Undo unchanged and settle / pre-check / quick
    writes / `prepare(true)` leave `prior` null; constraint and trigger-function permissions).
  - `tests/api.admin.speed-trivia-quick-review.test.ts`: missing, `null`, `""`, `'Wrong'`, `'wrong_answer'`,
    `'QUALITY'`, `'anything'`, `1` → 400 with no RPC; Undo passes `view` through and defaults it to `'waiting'`.
  - `tests/components.speed-trivia-quick-review.test.ts`: fake server gained a Needs a look list and `view` on Undo;
    2 new tests (Keep and Reject in Needs a look → Z puts it back with its note and counts; server says `waiting` →
    it leaves Needs a look).
  - `tests/scripts.speed-trivia-keep-queue.test.ts` (added the 3b and 3c migrations, which it lacked) and
    `tests/scripts.speed-trivia-admission.test.ts` (`REMEDIAL` list): migration lists only.
- `docs/speed-trivia-backlog-and-quality-plan.md`: status line (3c done, variables set, don't merge before 3d), §4
  Phase 3c "DONE" note with the trigger addition.

### 5. Facts and traps

- PGlite `db.query` refuses several statements in one string ("cannot insert multiple commands into a prepared
  statement"); use `db.exec` or one `asAdmin` call per statement.
- Writing `prior` directly on a `needs_look` mark does nothing (the trigger nulls it), even as the table owner;
  the constraint only bites on a decided mark. `service_role` can't update marks at all.
- A needs-look mark's `content_hash` can be stale (the row was edited in Question Review after the overnight check).
  Undo restores it as it was; Keep always sends the current hash, so nothing relies on it.
- The component test "ignores shortcuts while editing…" was flaky under load in 3b; it passed in every 3c run.

### 6. Build, run, test

- `npm run test`: **546 files passed, 1 skipped (7,181 tests passed, 13 skipped)** on 2026-11-15.
- `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` printed nothing. `npx eslint` on the 9 changed code/test files: clean.
- Targeted:
  ```
  npx vitest run tests/speed-trivia-keep-queue-sql.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts tests/scripts.speed-trivia-admission.test.ts tests/scripts.speed-trivia-keep-queue.test.ts tests/security-definer-execute-contract.test.ts tests/supabase-migration-grants-contract.test.ts tests/text-size-floor-contract.test.ts tests/prizes-wording-contract.test.ts
  ```
- Frozen gates, unchanged and passing:
  `npx vitest run tests/speed-trivia-uniqueness-evaluation.test.ts tests/speed-trivia-uniqueness-release.test.ts`.
- **Verified:** PGlite, mocked route, jsdom component. **Not verified:** the migration on production (3d), and the
  page in a real browser.

### 7. Open questions / waiting on Andrew

- OK to run `supabase db push --linked` for the three remedial migrations (asked in 3d).
- Whether to merge PR #19 after 3d (recommended: yes).

### 8. Recommended first steps for Phase 3d

1. Read plan §4 "Phase 3d" and §7.
2. Do the code work first (list check, re-score script, helpers), with tests.
3. Ask Andrew before `supabase db push --linked`; first `supabase migration list --linked` to confirm only
   `20261115212126`, `20261115213124` and `20261115214254` are pending.
4. After the push, add one production check for 3c: `select public.speed_trivia_quick_undo(…)` can't be tried without
   changing data, so instead confirm the column and trigger exist
   (`select column_name from information_schema.columns where table_name='speed_trivia_review_marks' and column_name='prior'`
   and `select tgname from pg_trigger where tgname='speed_trivia_review_marks_prior'`) and that every mark's `prior`
   is null.
5. Model and effort: **Sonnet 5.5 / medium** (plan §3).
