# Phase 7d handoff: the repeat check on live edits (2026-11-19)

## For Andrew

- **What changed:**
  - **The hole is closed.** Editing a live question could take the fact of a question still waiting in Quick Review,
    and Keep would then approve the waiting one instantly. That left two live questions on one fact. Now Keep sends
    any waiting question admitted before a live edit to the overnight check instead.
  - **Fewer wrong refusals.** A live edit that keeps its fact now saves even when the old wording already repeated
    2, 4 or more live questions, and a difficulty-only edit saves too.
  - **D45 default taken.** A live edit can't take another question's *reserved* old fact. A question may still go
    back to its own old fact.
- **Is it live?** **No.** It's committed on `fix/second-review-remedials` and not pushed. The database change
  (migration `20261119193552`) is written and tested but **not applied**. Phase 7j applies it with your OK, and the
  code merges after that.
- **Cost:** no new paid calls. Some edits now cost a few extra fractions of a cent in checks. Once the migration is
  applied, **337 waiting questions** (admitted before today's 86 Admin edits) go to the overnight check when you
  Keep them, about **$3.40 in all** (~1 cent each).
- **Keep queue budget (settled 2026-11-19):** the overnight Keep queue had used $14.65 of its $20 lifetime cap, at
  ~$4.87 a night, almost all on the D17 pre-check of older waiting questions. Your call:
  - The nightly limit is now **$1** and the lifetime cap **$30** (repo variables, already set).
  - The pre-check is turned off (**PR #32, merged** with your OK as `230f0ba9`). The queue now spends only on
    questions you Keep (about 1 cent each; $0 on nights with no Keeps).
- **Also merged today:** PR #31 (7a–7c), with your OK. It's deployed. The first seasonal (Thanksgiving) brief gets
  checked after tonight's 00:30 UTC writer run (7c step 8).

## For the next agent

### 1. Next phase and scope

- **First, if not done yet: 7c step 8** (Opus 5.5 / medium). After the 2026-11-20 00:30 UTC writer run and the
  Trivia Nightly, follow `speed-trivia-backlog-and-quality-plan_PHASE_7C_HANDOFF.md` §1 and record the result at the
  bottom of that file.
- **Then 7e** (Opus 5.5 / high): plan §4 "Phase 7e — OpenAI calls: room to answer, true costs, bounded retries"
  (R2 #29.1–#29.8, #29.10). Same branch, `fix/second-review-remedials`. 7e is the first phase with real
  `provider='openai'` rows in `llm_usage_logs` (from the 2026-11-20 nightly). Read them first; that's 7e's baseline.
- **Out of scope for 7d (not done):**
  - Applying the migration (7j).
  - The approval path (`approvedOnly`). It still compares with live questions only, not with `history:`
    reservations. D45 was about live edits only.
  - The server-side seasonal-subject reject (7c's deferred item).

### 2. Starting state

- `main` = `ee19fbdd` (merge of PR #31, 7a–7c). Production deploy of it succeeded (Vercel status `success`).
- Branch `fix/second-review-remedials`, cut from `origin/main` at `ee19fbdd`. It **tracks `origin/main`** because it
  was created with `git switch -c … origin/main`. When pushing, use `git push -u origin fix/second-review-remedials`
  so it tracks its own remote branch. 7d is one commit on it, **not pushed**, no PR. Plan: one PR for 7d–7j, or one
  per phase if Andrew prefers.
- Migration `supabase/migrations/20261119193552_speed_trivia_quick_keep_after_live_edit.sql`: **NOT applied**.
- No data changed, no paid call, no env var, no cron. Read-only production queries only (below).
- Left untracked on purpose (not ours): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions

- **Andrew, 2026-11-19:** "OK to merge #31". Merged by the agent with a merge commit.
- **D45:** default taken (Andrew didn't answer otherwise). Reserved previous facts (`history:` rows) of **other**
  questions block a live edit. Deleted and waiting rows still don't (D38).
- **Own-history refinement (agent's call; flag it if Andrew disagrees):** a question's own `history:<id>:<rev>` rows
  don't block it. The rule says a reserved fact "must not return under another ID", so returning under the same ID
  is fine. To revert, use `comparisonIndex = liveView` instead of `approval.without(liveView, ownHistory)` in
  `runtime.cjs`.
- **D38b ordering (a departure from the plan's wording; same outcome, cheaper):**
  - The plan said: always check the *old* wording against the live index first, then the edit once.
  - Built instead: check the edit as usual. **Only if** it's refused as a repeat and keeps its fact:
    1. Judge the edit against every retrieved live question, with no early stop.
    2. Judge the old wording only against the edit's repeats.
    3. If the old wording had every one of them, set them aside and check the edit once more. The pair cache answers
       that final check, so it costs nothing extra.
  - Why: the common case (a unique edit) pays nothing extra, which "always check the old wording" would. No loop.
- **Fast-lane rule in SQL:** Keep's fast lane needs `max(revision)` of `live-edit` admissions to be `< a.revision`.
  `max` is read once per Keep call, under the control-row lock, using a new partial index. Only
  `speed_trivia_quick_keep` changes:
  - `speed_trivia_queue_settle`'s `approved` branch needs no change. The overnight job approves only after an
    approved-only check against live questions.
  - `speed_trivia_queue_prepare`'s `settled` state counts already-active rows; it isn't a fast lane.
  - (The plan's "Keep Queue's equivalent in `20261115170333`" is that migration's earlier copy of the same
    `speed_trivia_quick_keep`.)

### 4. Files changed

- `lib/speed-trivia-uniqueness/runtime.cjs`:
  - `judgeWith(thorough)` builds `cappedJudge` (unchanged behaviour) and `thoroughJudge` (no early stop).
  - `scope` is computed once and used for the index, `evidence.comparisonScope` and the envelope (R2 #26.9).
  - Live edits compare with `approval.without(approval.liveEditIndex(index), ownHistory)`.
  - `preexistingRepeats(view)` is the one-pass D38b, applied whether or not the content changed (#26.4).
  - `RECENT_FACT_CATEGORY = varietyMap.CURRENT_EVENTS`, and the D39 comment now names the writer, Keep and edits
    (R2 #27.9).
- `lib/speed-trivia-uniqueness/approval.cjs` (+ `.d.cts`):
  - `liveEditIndex` is a cached view (active + `history:`), refreshed by `refreshApprovedIndex` like the others.
  - `historyOf(view, rowId)` returns a question's own reserved facts.
  - `without(view, ids)` is a lazy wrapper. It copies only the posting sets that hold a dropped id (R2 #26.6). Its
    `corpus.digest` = `hash([view digest, sorted dropped ids])`.
  - `liveIndexWithout` was removed (its only caller was the old loop).
- `types/speedTriviaUniqueness.ts`: `AdmissionEvidence` gains optional `comparisonScope` and `preexistingRepeats`.
- `supabase/migrations/20261119193552_speed_trivia_quick_keep_after_live_edit.sql`:
  - Partial index `speed_trivia_admissions_live_edit_idx`.
  - `speed_trivia_quick_keep`, copied from `20261116014954` plus the one condition.
  - `revoke … from public, anon, authenticated` and `grant execute … to service_role`.
- `tests/scripts.speed-trivia-approved-only.test.ts`, new tests:
  - "Phase 7d: D38b in one pass": 2 and 4 repeats; difficulty-only; a new repeat is still refused; #26.8; D45.
  - "R2 #26.1" end to end in PGlite: a waiting P, a live edit to P's fact, then Keep returns `queued`, and
    re-admission earns the fast lane back.
- Plan doc: top table, status line, the 7d heading and the D45 row. 7C handoff: step-8 note.

### 5. Facts and traps

- **Production, read-only, 2026-11-19 ~20:00 UTC:**
  - Admissions with `comparisonScope='live-edit'`: 86, all from 13:07–13:37 UTC today (Andrew's fix list); newest
    revision 11807.
  - Waiting rows with a fast-lane-eligible admission: 345. Of these, 337 are older than revision 11807 and go
    overnight once the migration is applied.
  - `speed_trivia_admissions`: 720 rows.
- **Keep queue budget:** 4 runs, $14.6462 committed (11-17, 11-18 and 11-19 each spent ~$4.87; `report->'precheck'`
  examined ~460–490 a night, while `report->'queue'` held 14 Keeps on 11-18 and 1 on 11-19).
  - Andrew, 2026-11-19: `SPEED_TRIVIA_QUEUE_MAX_DOLLARS=1` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=30`, set with
    `gh variable set`.
  - The D17 pre-check is off: `--precheck` is removed from `.github/workflows/speed-trivia-keep-queue.yml` on branch
    `chore/keep-queue-no-precheck`, PR #32, merged 2026-11-19 as `230f0ba9`.
  - Cost per overnight check is ~$0.01 per question (pre-check: ~$4.87 for ~470), so the 337 rows 7d sends overnight
    cost ~$3.40 in all (first estimated at $0.17). The $1 nightly limit spreads it over the nights they're Kept.
  - Andrew understands the $30 is a lifetime total (not monthly); no monthly cap wanted.
  - The script and SQL are unchanged; add the flag back to restore the pre-check.
  - Waiting rows: 1,974 `pending_review`.
- The fake judges in tests have **no pair cache**, so the final D38b check calls them again. The OpenAI judge
  (`openai.cjs`) answers repeats from `cache`. Don't assert "each pair once" with a fake judge.
- `core.checkCandidate` returns early on a *deterministic* (exact-text) duplicate without judging the rest. That's
  why D38b uses `core.retrieve` plus `deterministicPair` plus the thorough judge, and not a second `checkCandidate`
  on the old wording.
- Known, accepted edge: removing set-aside ids can let a different row enter the lexical/semantic top-24. If the edit
  repeats that row, the edit is refused (conservative, never admits a repeat).
- `cut -d= -f1 .env.local` was **denied** by the permission layer this session, even though CLAUDE.md allows it.
  `supabase db query --linked "<sql>"` works for read-only checks (`speed_trivia_*` tables have no API access).
- Never `git checkout -- <file>`, `git stash` or `git reset`. To test the new tests against the old code, the agent
  copied its files to the scratchpad, wrote `git show HEAD:<file>` over them, ran the tests, and copied them back
  (`cmp` confirmed). The new tests failed on the old code for 4 repeats, difficulty-only, D45 and #26.1. The 2-repeat
  case already passed with the old loop's 3 passes.

### 6. Checks run (2026-11-19)

- `npx vitest run tests/scripts.speed-trivia-approved-only.test.ts tests/lib.speed-trivia-uniqueness.test.ts`
  → 28 passed.
- `npx vitest run tests/lib.speed-trivia tests/scripts.speed-trivia tests/speed-trivia tests/security-definer-execute-contract.test.ts tests/supabase-migration-grants-contract.test.ts tests/api.admin.speed-trivia`
  → 34 files, 376 passed. This includes the frozen gates in `tests/speed-trivia-uniqueness-release.test.ts`.
- `npm run test` → 589 files, 7,648 passed, 13 skipped, 0 failed.
- `npx tsc --noEmit` → clean. `npx eslint` on the changed files → clean. `npm run build` → success (run separately).
- `/verify` (browser) was **not applicable**: no page changed, and an Admin-edit browser test would write the shared
  production database. The PGlite tests cover the path end to end.
- **Unverified until 7j:** the migration on real Postgres (Supabase). It's PGlite-tested only.

### 7. Open questions for Andrew

- OK with "a question may return to its own reserved fact" (the D45 refinement)?
- One PR for 7d–7j, or one per phase?

### 8. Recommended first steps for 7e

1. Do 7c step 8 if it hasn't been done (above).
2. `git switch fix/second-review-remedials`. Read the plan's §4 "Phase 7e" and the shared ground rules ("Remedial
   phases 7d–7j").
3. Read the first `provider='openai'` rows in `llm_usage_logs` from the 2026-11-20 nightly, read-only, as the
   baseline.
4. Model: **Opus 5.5 / high** (plan's top box).
