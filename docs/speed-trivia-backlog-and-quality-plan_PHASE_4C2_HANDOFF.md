# Phase 4c.2 handoff — Live Publish records what really happened

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Remedial phases 4c.1–4c.4" → "Phase 4c.2" (review #2, #3).
Done 2026-11-16.

## For Andrew (plain English)

- **What changed:** when Publish opens a Live Trivia PR that doesn't merge straight away, its questions are now marked
  "waiting on GitHub", not "published". Quick Review (Live) shows "N waiting on GitHub" with the PR link. When you merge
  that PR, they become published; if you close it, they go back to the kept list and Undo works again. While a Publish
  PR is open on GitHub, a new Publish won't open a second one; it says "A Publish PR is waiting on GitHub." with the
  link. The record of what was published is now written in one step, so a half-saved Publish can no longer open a
  duplicate PR.
- **Is it live?** No. Everything is uncommitted on `feature/speed-trivia-variety`. There is one new database change
  (`20261117025917_live_publish_pr_open.sql`), written and tested on a throwaway database only. It is applied in
  Phase 4c.4, with your OK (`supabase db push` asks first).
- **Cost:** $0. No paid calls. GitHub calls are free: one extra per Publish (the open-PR check), plus one per waiting PR
  when Quick Review (Live) loads (usually none).
- **What's left:** Phases 4c.3, 4c.5, 4c.4, then commit, merge and deploy. Nothing needs you for this phase.

## For the next agent (Phase 4c.3)

### 1. Next phase goal and scope

Phase 4c.3 — dated questions and category gates (review #4, #5, #7, #8): plan §4 "Phase 4c.3". Order after that:
4c.5 → 4c.4. Out of scope: deploys, `supabase db push` (4c.4 applies 4c.2's and 4c.3's migrations once, with Andrew's
OK), anything in 4c.4/4c.5.

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e` (PR #19 merge). **All 4a–4c.2 work is uncommitted** by
  design (D23). Never `git checkout -- <file>`, `git stash` or `git reset`.
- New migration **`supabase/migrations/20261117025917_live_publish_pr_open.sql` — NOT applied.** Production is unchanged
  by this phase. No data change, no paid call, no GitHub write (tests fake GitHub).
- Until 4c.4 applies it, the new code calls RPCs that don't exist on production; that's safe because nothing deploys
  before 4c.4 (shared ground rule). **4c.4 must apply it before the D23 deploy**, or Live Publish fails (claims would
  stay `publishing`; harmless but broken).
- `20261116201904_live_question_candidates.sql` (4c) was already applied before this phase; production had 0
  published Live candidates and 0 `publishing` rows at the review (plan §4), so the new constraints validate cleanly.
  4c.4 should re-check `select status, count(*) from question_candidates where game='live' group by 1` before the push:
  any `published` row with a `pr_url` is fine; a `pr_url` on any other status would fail the new check.

### 3. Decisions made in this phase (deviations from the spec, all recorded in the plan's "As built")

- Step 2's "one checked update" is an RPC, `live_candidates_publish_record_pr(p_claim, p_pr_url, p_rows)`: each row gets
  its own final slug, which a single PostgREST update can't do. All or nothing (raises `publish-record-mismatch`).
- `live_candidates_publish_settle` **raises** `publish-settle-mismatch` on a count mismatch, so nothing is half-settled
  (otherwise a partly-settled merged row would miss its tags). The caller still checks the returned count.
- A closed PR's rows return to `keep` with `pr_url` cleared but **`question_ref` kept**: the existing ref constraint
  requires a slug on `keep` rows, and the next Publish computes a fresh slug from the files anyway.
- The PR check (`live_candidates_pr_settle`) also turns a **stale `publishing` row whose PR is still open into
  `pr_open`** (spec said "left alone"), so the header counts it and Undo says "Waiting on GitHub.".
- The PR check stops asking GitHub after 15 s total (`PR_CHECK_BUDGET_MS`), so it can't eat Publish's 120 s
  `maxDuration` (each GitHub call times out at 20 s). Max 10 PRs per check.
- `already` rows (question already on `main`) settle `published` with `pr_url` null: they aren't in this PR.
- The open-PR guard runs **after** the claim (the claim serializes Publishes, so a second Publish always sees the
  first one's PR), and before reading files.

### 4. Files changed

- `supabase/migrations/20261117025917_live_publish_pr_open.sql` (new): status/ref/publish constraints widened for
  `pr_open` (needs slug + PR link + no claim; `pr_url` allowed on `publishing`, `pr_open`, `published`);
  `create or replace live_candidates_publish_claim` (stale `publishing` re-claimed only when `pr_url is null`);
  new `live_candidates_publish_record_pr`, `live_candidates_publish_settle`, `live_candidates_pr_settle`. All
  SECURITY DEFINER, `revoke … from public, anon, authenticated`, `grant execute … to service_role`. The two that move
  rows across Publishes take the same advisory lock as the claim.
- `lib/liveTriviaGithub.ts`: `PUBLISH_BRANCH_PREFIX`, `findOpenPublishPr()` (one `GET /pulls?state=open&base=main&per_page=100`;
  throws on failure → Publish fails closed), `readPrState(prUrl)` (one `GET /pulls/{n}`; null for another repo's link).
- `lib/liveTriviaReview.ts`: `PublishDeps` gains `findOpenPr`, `prState`; `reconcileLivePrs()` (the PR check, never
  throws); `publishLive` rewritten: PR check → claim → guard → read/plan → open PR → record PR → merge → one settle RPC
  → tags if merged. `release()` is checked (every claimed row must come back) and only runs before a PR exists.
  `liveUndo` says "Waiting on GitHub." for `pr_open`. `readLiveReviewQueue` runs the PR check first and returns `waiting`.
- `types/liveTriviaReview.ts`: `LiveReviewPage.waiting: { waiting, prUrl }`; `LivePublishResult.waiting: boolean`.
- `lib/question-writer/liveProcess.cjs`: `IN_REVIEW` adds `pr_open` (repeat corpus + star cap).
- `components/admin/sections/LiveTriviaQuickReview.tsx`: header "N waiting on GitHub" + PR link; Publish notice
  "Published N." / "Waiting on GitHub." / "A Publish PR is waiting on GitHub." (+ PR link).
- Tests: `tests/live-question-candidates-sql.test.ts` (7 new, PGlite), `tests/api.admin.live-review.test.ts` (Publish
  block rewritten with a fake of the four RPCs; 7 new cases), `tests/lib.live-trivia-github.test.ts` (new, 4),
  `tests/components.live-trivia-quick-review.test.ts` (2 new), `tests/scripts.live-question-candidates.test.ts` (1 new).
- Docs: plan status line, 4c.2 "As built", Live standing rules; `SYSTEM_CONTEXT.md` §12 Live exception (two lines).

### 5. Facts and traps

- The route test's Supabase fake has no `.not()`; the PR check filters `pr_url` and stale claims in JS after one read
  (`status in (pr_open, publishing)`, limit 500) — cheap, and the RPC re-checks staleness authoritatively.
- `live_candidates_pr_settle` returns rows ordered by `created_at, id`; rows from one batch share `created_at`, so
  tests sort before comparing.
- The "settle mismatch" error copy is the spec's: "Published, but not recorded. Don't publish again; tell the
  developer." It shows even when the PR didn't merge. Recovery: the rows stay `publishing` with `pr_url`; ten minutes
  later the PR check settles them from GitHub's state.
- If recording the PR fails, Publish stops **before merging** and leaves the claim: the open PR then blocks Publish
  (guard) until Andrew merges it (the next Publish finds the entries on main → `already` → `published`) or closes it.
- `npx tsc --noEmit`: clean outside `.next/` (stale `.next/types` errors for removed routes, as noted in 4c.1).

### 6. Build, run, test

- `npx vitest run tests/live-question-candidates-sql.test.ts tests/api.admin.live-review.test.ts tests/lib.live-trivia-github.test.ts tests/components.live-trivia-quick-review.test.ts tests/scripts.live-question-candidates.test.ts`
  → 14 + 13 + 4 + 7 + 9 pass.
- `npm run test` → 568 files, 7,410 passed, 13 skipped, 0 failed (2026-11-16).
- `npx eslint` on every changed file: clean. Contract tests `security-definer-execute-contract` and
  `supabase-migration-grants-contract` pass with the new migration.
- **Unverified:** the migration on the real database (4c.4), and a real GitHub round trip (needs the deploy and a kept
  Live candidate; 0 exist today).

### 7. Open questions for Andrew

None for 4c.2.

### 8. Recommended first steps for 4c.3

Model **Opus 5.5 / medium** (plan table). Read plan §4 "Phase 4c.3" and D28. New migration via
`supabase migration new …`; add it to the PGlite test's migration list after `20261117025917`. Don't touch the signed
admission SQL (`20261013120000`) or `core.cjs`.
