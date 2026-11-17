# Phase 4c.1 handoff — Keep tags an untagged question; one tag call per save

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Remedial phases 4c.1–4c.4" → "Phase 4c.1". Done 2026-11-16.

## For Andrew (plain English)

- **What changed:** a waiting Speed question with no subject tag can now be kept. Quick Review's Keep tags it first
  (one Gemini call, about $0.0001), and so does the overnight Keep Queue. If tagging fails, the screen now says
  "Couldn't tag." (it used to say "Not tagged yet."). An Admin save no longer tags the same question twice.
- **Is it live?** No. Everything is uncommitted on `feature/speed-trivia-variety`. It goes live with the D23 deploy
  after Phase 4c.4.
- **Cost:** today 0 Speed questions are untagged, so about $0. At most 25 tag calls per Keep request (~$0.0025).
- **What's left:** Phases 4c.2, 4c.3, 4c.4, then commit, merge and deploy. Nothing needs you for this phase.

## For the next agent (Phase 4c.2)

### 1. Next phase goal and scope

Phase 4c.2 — Live Publish records what really happened (review #2, #3): `pr_open` status, one-transaction settle,
open-PR guard, PR check. Full spec: plan §4 "Phase 4c.2". Out of scope: anything in 4c.3/4c.4; no deploy; no
`supabase db push` (migrations are written and tested in 4c.2/4c.3, applied once in 4c.4 with Andrew's OK).

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e` (the PR #19 merge). **All 4a–4c.1 work is
  uncommitted** by design (D23: commit/merge/deploy after 4c.4). Never `git checkout -- <file>`, `git stash` or
  `git reset`.
- 4c.1 added **no migration** and made **no data change** and **no paid call** (tests use fake Gemini/Supabase/PGlite).
- Production unchanged by this phase.

### 3. Decisions already made

- Quick Keep's 25-tag cap is **per HTTP request**: a bulk Keep (up to 1,000 rows, 10 pages) shares one allowance, so
  tagging can't push the request past its 120 s `maxDuration`. A single Keep of ≤ 200 rows also gets 25.
- Quick Keep tags only rows that are `pending_review` + `anytime_blitz` and have no `question_tags` row with a
  `subject_key` (same rule as `speed_trivia_star_cap_state`). Rows decided elsewhere are never tagged.
- The Keep Queue retries the write **only if the tag was written**; a failed tag goes straight to Needs a look with
  "No subject tag yet." (unchanged note). Each tag call reserves `$0.0001` + 1 request on the run's budget **before**
  the call; a spent budget stops the run (`stopped: 'budget'`) like any paid check.
- `tagged_by` labels: `gemini:gemini-2.5-flash:admin-save-v1` (unchanged), `…:quick-keep-v1`, `…:keep-queue-v1`.

### 4. Files changed

- `lib/question-variety/tagging.cjs` (+ `.d.cts`): new `tagOne({ client, row, apiKey, transport, taggedBy, timeoutMs })`
  — the body of the old `tagSpeedQuestion`; never throws; true only when a tag row was upserted. Also exports
  `TAG_MODEL` (`gemini-2.5-flash`) and `TAG_DOLLARS` (0.0001). The `.d.cts` types `client` structurally
  (`{ from(table) }`) because a `SupabaseClient` import there resolves to a different, incompatible declaration.
- `lib/speedTriviaTagging.ts`: thin `server-only` wrapper. `tagSpeedQuestion(row, transport?, taggedBy?)` →
  `tagOne`. New `tagUntaggedSpeedQuestions(ids, allowance, transport?)` (two indexed reads, 4 concurrent calls),
  `tagAllowance()`, `QUICK_KEEP_TAG_LIMIT = 25`.
- `lib/speedTriviaQuickReview.ts`: `quickKeep(rows, allowance = tagAllowance())` tags first, then the unchanged
  `speed_trivia_quick_keep` RPC; `runQuickReviewBulk` creates one allowance per request.
- `lib/speedTriviaAdmission.ts`: `withTag` returns `{ result, tagged }`; `writeSpeedTrivia` skips the post-save tag
  when `tagged` (review #10).
- `scripts/process-speed-trivia-keep-queue.cjs`: `processQueue({ …, tag })` (default `tagOne` with the script
  client); report gains `tagCalls` and `tagged`; `runPaid` passes `tag` through.
- `components/admin/sections/SpeedTriviaQuickReview.tsx`: "Not tagged yet." → "Couldn't tag.".
- Tests: `tests/api.admin.speed-trivia-quick-review.test.ts` (Supabase mock is now a chainable, awaitable fake by
  table; 5 new tests), `tests/scripts.speed-trivia-keep-queue.test.ts` (2 new), `tests/lib.speed-trivia-tagging.test.ts`
  (3 new).
- `tests/scripts.speed-trivia-thin-subjects.test.ts` (untracked, from 4a.1/4a.2): added `onlyKept?` to its `Kept` type
  — it was the only non-`.next` typecheck error.
- Plan: status line and the "Star cap rules" standing rules updated.

### 5. Facts and traps

- **Quick Keep refuses an untagged row outright** (the star cap writes nothing), so an untagged row only reaches the
  Keep Queue if it was kept before the 4a.1 cap, or its tag was removed later. The queue test keeps first, then
  loads the star-cap migrations.
- The PGlite client (`scripts/test-speed-trivia-admission-sql.cjs clientFor`) only has `rpc`, so queue tests inject
  a fake `tag` that inserts the `question_tags` row directly.
- `npx tsc --noEmit` prints stale `.next/types` errors for removed `tv-pair` / `app/tv` routes; ignore them (or
  delete `.next/types` when the dev server isn't using it). Everything outside `.next/` is clean.
- `npm run lint` reports ~309 parsing errors, all inside the untracked `tmp/group-games-phase-4/` copy; none in the repo.
- `tests/components.live-trivia-quick-review.test.ts` › "shows a possible repeat…" failed once in the full run and
  passed 3/3 alone: a timing flake under load, in a file 4c.1 didn't touch.

### 6. Build, run, test

- `npx vitest run tests/api.admin.speed-trivia-quick-review.test.ts tests/scripts.speed-trivia-keep-queue.test.ts tests/lib.speed-trivia-tagging.test.ts`
  → 21 + 18 + 8 pass.
- `npm run test` → 7,388 passed, 13 skipped, 1 flaky failure (above). `npx tsc --noEmit` clean outside `.next/`.
- Unverified: a real Gemini tag from Quick Keep on production (needs the deploy; 0 untagged rows today anyway).

### 7. Open questions for Andrew

None for 4c.1.

### 8. Recommended first steps for 4c.2

Model **Opus 5.5 / high** (plan table). Read plan §4 "Phase 4c.2" and the 4c handoff
(`…_PHASE_4C_HANDOFF.md`), then `lib/liveTriviaReview.ts` `publishLive` (line 150; it settles claims as `published` ~25 lines below) and the
`live_candidates_publish_claim` migration (`20261116201904`). New migration via `supabase migration new …`; grant
`service_role` only; test on PGlite with fake GitHub.
