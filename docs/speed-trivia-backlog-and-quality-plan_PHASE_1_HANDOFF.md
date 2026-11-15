# Speed Trivia backlog plan — Phase 1 handoff (Quick Review)

Written 2026-11-15 by Claude (Opus 5.5, high effort, as the plan's table names).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md`. Previous: `speed-trivia-backlog-and-quality-plan_PHASE_0_HANDOFF.md`.

## For Andrew

- **Quick Review is built but not live yet.** It's a new button beside "Speed Trivia Pending" in Question Review.
  You see one question at a time. **→** keeps it, **←** rejects it, **W** rejects it as a wrong answer, **S** skips,
  **E** edits, **Z** undoes. Filters: category, Older / Recent, Oldest / Newest. "Reject all shown" and "Keep all shown"
  act on the whole filter, not only the loaded page, after you confirm the count.
- **Keep never makes you wait or costs money.**
  - **Recent questions (352 waiting):** approved instantly at no cost. I checked production: every one of the 352
    already passed the full repeat check when the nightly writer saved it.
  - **Older questions (6,981):** Keep marks the question and leaves it waiting. They're approved by the overnight
    check, which is Phase 3 and isn't built yet. Until then, "Approve Selected" in the table still works if you
    want one approved now.
- **Reject is free**, the same as Delete today. Rejected facts are still blocked forever for now; D5 decides that
  later. Quick Review records why you rejected each one (dull/obscure vs wrong answer), so D5 can be applied
  afterwards without reviewing again.
- **Cost: $0.** Nothing paid runs. Database work is about one small request per decision.
- **Needs you:**
  1. **OK to apply the database change to production?** It adds one table and four functions and changes no
     questions (`supabase db push`). I haven't run it.
  2. **Commit and deploy.** Nothing is committed yet. The changes sit on branch `chore/drop-tv-pairing-codes` together
     with the uncommitted Phase 0 work. I suggest one new branch off `main` for Phase 0 + Phase 1, a PR, then merge.
     The database change must go first: before it's applied, the Quick Review screen shows "Quick Review is
     unavailable".
  3. Still open from Phase 0: **D3** (does "No" mean reject all 352 recent questions? With Quick Review that's
     Source = Recent → "Reject all shown"), **D5–D8**.

## For the next agent

### 1. Next phase goal and scope

**Phase 2 — the "bar test" scorer** (plan §4 Phase 2): `lib/speed-trivia-quality/audience.cjs`, free deterministic
pre-checks, calibration against Andrew's real decisions, `scripts/score-speed-trivia-backlog.cjs [--apply]` with a
spend cap (default $2), then the score filter and sort in Quick Review. **Out of scope:** the overnight Keep queue and
checker speed-up (Phase 3), generator prompt changes (Phase 4), re-enabling nightly, any automatic rejection.

Before Phase 2 can use Quick Review decisions for calibration, Phase 1 must be **applied and deployed** (see §7).

### 2. Starting state

- Branch `chore/drop-tv-pairing-codes`, last commit `5d3c10e6` (unrelated TV-pairing work). **Nothing from Phase 0 or
  Phase 1 is committed, pushed or deployed.**
- **Migration `supabase/migrations/20261115151703_speed_trivia_quick_review.sql` is NOT applied to production.**
  `supabase db push` needs Andrew's explicit OK (CLAUDE.md). Apply it before deploying the route/UI.
- Production data: unchanged by Phase 1. Read-only queries only (via `supabase db query --linked`, 2026-11-15):
  - Speed pending: **7,333** = 6,981 older (no `speed_generation_metadata`, no admission record) + **352 recent**.
  - All 352 recent pending rows have a `speed_trivia_admissions` row with `content_hash = speed_content_hash(row)`,
    `policy = 'speed-facts-v2'`, `evidence.decision = 'unique'`, no `evidence.comparisonScope` (full bank), and
    `revision = speed_revision`. → **352 fast-lane eligible.**
  - Admission scopes overall: active 24 approved-only + 17 full; deleted 1 approved-only + 166 full; pending 352 full.
  - No pending Speed row has an image; all have exactly 4 options; 8 categories.
- Uncommitted Phase 0 files are listed in the Phase 0 handoff §2; keep the Phase 0 undo log
  `docs/speed-trivia-backlog-and-quality-plan_PHASE_0_RETIRE_LOG_2026-11-15.json`.
- Nightly writer still disabled (`trivia-nightly.yml`, `disabled_manually`).

### 3. Decisions made in Phase 1 (and why)

- **A separate route** `app/api/admin/trivia/quick-review` instead of adding params to
  `app/api/admin/trivia/questions` GET. The table flow keeps its exact behaviour; Quick Review logic lives in one
  place (`lib/speedTriviaQuickReview.ts`).
- **Fast lane soundness** (why approving a full-bank-admitted pending row without a new check is safe): the row was
  compared with every Speed row present at its admission (active, pending, deleted, memory — `checkCandidate` has no
  status filter). Any Speed content written later went through a full-bank admission that included this row. The
  approved-only path (`approveSpeedTrivia`) never changes content (`requireUnchangedPendingApproval`), so it can't
  introduce content this row wasn't compared with. The RPC also requires the current policy, a `unique` decision, no
  `comparisonScope`, and that the content hash equals both the admission record and the hash the reviewer saw.
- **The fast-lane call is signed** with `SPEED_TRIVIA_ADMISSION_SECRET` (same HMAC as `admit_speed_trivia`), so the
  service-role key alone still can't make a question active.
- **Marks are RPC-only:** `service_role` has `select` on `speed_trivia_review_marks`, no insert/update/delete.
  Undo trusts `decided_revision` from the mark, so marks must not be forgeable. Phase 2 needs an RPC (or a
  column-level `grant update (audience)` plus an insert path) to write scores; `decision` is nullable for that.
- **Undo** (the Phase 0 trap: the trigger blocks plain `deleted → pending_review`): `speed_trivia_quick_undo` inserts a
  permit and restores `pending_review` only if `trivia_questions.speed_revision` still equals the mark's
  `decided_revision`, i.e. Quick Review made the last write. Undo of a fast-lane approval (active → pending) works the
  same way. Undo of a queued keep just clears the mark. Undo keeps `audience`.
- **Reject reasons:** `quality` (← key, and all bulk rejects) and `wrong` (W). D5 is still unanswered; the reason is
  stored so Phase 3 can apply it. A reject is still the plain status-only retirement, so its fact stays reserved.
- **Keep on a row whose content changed since it was shown** returns `changed`, writes nothing, and the UI reloads.
- **Bulk** uses the confirmed count as a hard cap (`max`), pages of 100, ≤ 1,000 rows and 60 s per request; the
  client repeats until `remaining` is 0. Bulk keep uses the hash the server just read.
- No score filter/sort yet (Phase 2). Sort is oldest/newest only.

### 4. Files created or changed

- `supabase/migrations/20261115151703_speed_trivia_quick_review.sql` (new):
  - table `speed_trivia_review_marks(row_id pk → trivia_questions, decision keep|reject, outcome
    queued|approved|rejected, reason ≤40 chars, content_hash, decided_revision, decided_at, audience jsonb)`, with a check
    that decision fields are all set or all null. RLS on + forced; `select` to `service_role` only.
  - `speed_trivia_review_queue(p_category, p_source all|older|recent, p_sort oldest|newest, p_after_created,
    p_after_id, p_limit ≤100)` → `{total, rows:[{id, question, options, correctAnswer, category, difficulty, createdAt,
    recent, contentHash}]}`. Undecided pending Speed MC rows only; keyset on `(created_at, id)`.
  - `speed_trivia_quick_keep(p_check, p_signature)` → `{rows:[{id, outcome approved|queued|changed|not_pending}]}`.
    `p_check = {operation:'quick_keep', policyVersion, expiresAt (≤ now+310 s), rows:[{id, contentHash}] (1–200)}`.
  - `speed_trivia_quick_reject(p_row_ids uuid[] 1–200, p_reason quality|wrong)` → `{rejected:[ids]}`.
  - `speed_trivia_quick_undo(p_row_id)` → `{id, status}`; raises `quick-review-undo-drift` /
    `quick-review-nothing-to-undo`.
  - All four: `security definer`, `search_path=pg_catalog,public`, revoked from public/anon/authenticated, execute to
    `service_role`. Lock order: control row first, then question rows (matches the admission RPCs).
- `lib/speedTriviaQuickReview.ts` (new, `server-only`): `parseQuickReviewFilter`, `readQuickReviewQueue`,
  `quickKeep` (signs), `quickReject`, `quickUndo`, `runQuickReviewBulk`, `QuickReviewError` (maps RPC errors to
  400/409/503).
- `app/api/admin/trivia/quick-review/route.ts` (new): `GET ?category&source&sort&afterId&afterCreated`;
  `POST {action: keep|reject|undo|bulk}`. `requireAdminAuth`, no-store headers, `maxDuration = 120`.
- `types/speedTriviaQuickReview.ts` (new): shared types.
- `components/admin/sections/SpeedTriviaQuickReview.tsx` (new): the card UI, keyboard shortcuts, 50-row buffer with
  one refill page when ≤ 10 remain (no polling), undo stack (50), bulk with `window.confirm`. Edit uses the existing
  `PATCH /api/admin/trivia/questions/[id]` (a paid full-bank check, ~$0.03, as before) and then reloads.
- `components/admin/sections/TriviaPendingReviewSection.tsx` (changed): "Quick Review" toggle beside the tabs on the
  Speed tab; when on, it replaces the category filter, the table, and its buttons.
- Tests (new): `tests/speed-trivia-quick-review-sql.test.ts` (PGlite, reuses `scripts/test-speed-trivia-admission-sql.cjs`
  `setup`), `tests/api.admin.speed-trivia-quick-review.test.ts` (route + bulk, mocked RPC; asserts the paid checker is
  never called), `tests/components.speed-trivia-quick-review.test.ts` (jsdom keyboard flow, fake server).

### 5. Facts and traps

- `supabase db query --linked "<sql>"` runs read-only SQL against production through the Management API. That's how
  the admission tables (revoked from `service_role`, so supabase-js can't read them) were measured.
- `.env.local` can't be listed in this environment (the hook denied even `cut -d= -f1`). Not needed: Phase 1 reads
  `SPEED_TRIVIA_ADMISSION_SECRET`, which production already has (approvals already use it).
- `speed_trivia_permits` has `transaction_id` as its **primary key**: one permit per transaction at a time. Any RPC
  that changes several rows must consume (update) or delete each permit before inserting the next. Quick Review
  deletes after each update.
- Every status change bumps `speed_trivia_control.revision`. A warm server index refreshes with
  `speed_trivia_corpus_delta(p_limit 500)`; after a bulk of more than 500 changes the next paid approval/edit in that
  server process gets `verification_unavailable` once, drops its cached index and reloads the corpus (~11.65 MB) on
  the next request. Expected, one reload.
- The existing table's "Approve Selected"/"Delete Selected" don't touch marks. A row kept in Quick Review and then
  approved or deleted in the table keeps a `queued` mark. **Phase 3 must only process `queued` marks whose row is
  still `pending_review` and whose `content_hash` still matches.**
- Restoring a rejected row can collide with the unique index on `normalized_question_key` (non-deleted Speed rows) if
  a newer row with the same text exists; the route maps that to 409 "Can't undo."
- `npx tsc --noEmit` errors only in stale `.next/types/app/tv/*` and `.next/types/app/api/tv-pair/*` (from the TV
  branch); filter with `grep -v '^\.next/'`.
- The repo's Vitest only globs `*.test.ts`, so component tests use `createElement`, not JSX.

### 6. Build, run, test

- `npm run test` → **541 files passed, 1 skipped (7,107 tests)**, 2026-11-15.
- `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` → empty. `npx eslint` on all new/changed files → clean.
- Targeted: `npx vitest run tests/speed-trivia-quick-review-sql.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/components.speed-trivia-quick-review.test.ts`.
- **Not verified:** the migration against real Supabase/PostgREST (only PGlite); the screen in a real browser
  (jsdom only). After the push and deploy, check in this order: open Question Review → Speed Trivia Pending → Quick
  Review; confirm "7,333 left"; Source = Recent shows 352; Keep one recent question → "Approved." and it appears as
  active; Z → back to waiting; Reject one older question → Z restores it. Then read back:
  `supabase db query --linked "select decision,outcome,count(*) from speed_trivia_review_marks group by 1,2"`.

### 7. Open questions / waiting on Andrew

1. OK to `supabase db push` the Phase 1 migration.
2. Commit/branch/PR and deploy (Phase 0 + Phase 1 together).
3. D3 meaning; D5, D6, D7, D8.

### 8. Recommended first steps for Phase 2

1. Confirm the migration is applied and the route is live (§6 checks), or ask Andrew.
2. Decide how Phase 2 writes `audience`: a new SECURITY DEFINER RPC `speed_trivia_review_set_audience(jsonb)` that
   upserts only `audience` (never `decision`), with revoke/grant per `tests/security-definer-execute-contract.test.ts`.
3. Build the free pre-checks first; verify current Gemini prices before quoting; calibrate on active rows (keep)
   vs newer-writer rows Andrew deleted (reject), plus his first ~150 Quick Review decisions
   (`speed_trivia_review_marks` where `decision is not null`).
4. Add `p_score_min/p_score_max` and a score sort to `speed_trivia_review_queue` in a **new** migration.
5. Model/effort: **Opus 5.5 / high** (plan §3).
