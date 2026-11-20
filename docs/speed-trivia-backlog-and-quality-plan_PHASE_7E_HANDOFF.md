# Phase 7e handoff: OpenAI calls get room to answer, true costs and bounded retries (2026-11-20)

## For Andrew

- **What changed:**
  - **Room to answer.** The subject-tag call had too few tokens: it could run out before answering, and you'd still
    pay for it. It now has room. The Convert to Live rewrite got the same fix.
  - **True costs.** The overnight Keep queue counted each tag call as $0.0001; the real cost is about $0.003–$0.006. It
    now counts the real cost against your $1 nightly limit. A call that fails after OpenAI billed it is now recorded too.
  - **Time limits.** Admin screens can't hang past their time limit while OpenAI is busy. Quick Keep's tagging stops at
    90 seconds; an Admin save's tag call at 45 seconds.
  - **Convert to Live export.** At most 25 questions at a time, 4 at once, with a $0.25 cap per click. The screen now
    says how many weren't rewritten.
  - **Cost page.** It counts real calls, not ledger rows (one row can stand for 600 calls).
  - **Current Events grading.** If the writer's grade is missing, the backup grader now gets the question's news link.
- **Is it live?** **No.** It's committed on `fix/second-review-remedials` with 7d. Nothing is pushed yet. No database
  change, no new env var, no new scheduled job.
- **Cost:** no new paid calls. Last night's real spend:
  - **3.5¢** for the nightly checks.
  - **7.8¢** for the Keep queue: 22 Kept questions, about 0.35¢ each, cheaper than the 1¢ estimate.
  - **No tag calls at all**, because the writer tags its own questions. So the real tag cost adds about $0 a night today.
- **Thanksgiving check:** the first holiday question worked. It asks what "cornucopia" means. It's waiting in Quick
  Review.
- **Needs you: one problem found.** Last night's Live round lost 19 of its 24 questions. Science & Tech has only 5
  area/era slots on the variety map, but a Live night asks for 24. The other 19 went out with no area, and the
  processing rejects every such question. Movies lost 19 the same way on 11-18. Geography and Art, Literature and Comics
  have the same shortfall. The fix is free: let a thin category reuse its slots (recommended), or add eras to those
  areas on the Variety page. Which do you want?

## For the next agent

### 1. Next phase and scope

- **Next: 7f** (Opus 5.5 / high): plan §4 "Phase 7f — Speed → Live conversions can't get stuck" (R2 #27.1–#27.8,
  #27.10).
  - Same branch, `fix/second-review-remedials`.
  - 7f also owns the flaky test `tests/live-conversion-requests-sql.test.ts` › `live_conversion_brief` (see
    `..._PHASE_7C_HANDOFF.md` §5).
- **Waiting on Andrew (not 7f's scope unless he says so):** the Live thin-category slot problem. Details are in
  `..._PHASE_7C_HANDOFF.md` at the bottom ("Found: Live nights in thin categories…").
  - If he picks option (a), it's a small pure-function change in `lib/question-variety/slots.cjs` `chooseSlots`:
    reuse a category's cells least-covered first once each has a slot; keep `fallbackSlot` only for a category with no
    areas.
  - Run it as its own small phase before or after 7f (Opus 5.5 / medium); it shares no files with 7f.
  - Update `tests/lib.question-variety-*.test.ts`.
- **Out of scope in 7e (not done):**
  - Pushing, the PR and the merge (7j, with Andrew's OK).
  - Converting `liveTriviaExport.ts`'s other `function` declarations to arrows. R2 #29.10 named only
    `callOpenAIForLiveRewrite`.

### 2. Starting state

- Branch `fix/second-review-remedials` (cut from `origin/main` at `ee19fbdd`; it tracks `origin/main`, so push with
  `git push -u origin fix/second-review-remedials`). It's 2 commits behind `origin/main`: PR #32's merge, which touched
  only `.github/workflows/speed-trivia-keep-queue.yml`. Commits on it:
  - 7d `dd15c718` plus its two handoff commits;
  - **7e: one commit** (this phase; see `git log`).
- **Nothing pushed, no PR.** 7d's migration `20261119193552` is still **NOT applied** (7j). 7e has no migration.
- No data changed, no paid call made, no env var, no cron. Read-only production queries only (§5).
- Left untracked on purpose (not ours): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions (agent's calls; flag any Andrew disagrees with)

- **Token limits** (step 0 measured):
  - `tagOne`: 512 → **2048** (`TAG_MAX_OUTPUT_TOKENS`).
  - Live rewrite: 1024 → **2048**.
  - **Live repeat check: kept at 512.** The 11-20 nightly averaged 37 output tokens a call, reasoning included (5 calls,
    186 tokens), so 512 is about 14× headroom.
  - No tag call ran anywhere, so there's no measured tag reasoning yet. 2048 is the plan's starting value.
- **The Keep Queue's tag call settles on the run's budget *without* a `model`.**
  - Unmodelled settles count against the caps but aren't tallied in `byModel`.
  - So the run's `speed_question_checks` ledger row doesn't double-count what `tagOne`'s own `question_tagging` row
    records (one row per tag call).
  - Tag calls are rare: 0 a night now, because the writer tags its own questions.
- **`tagOne` now throws one thing:** a budget stop (`budget_exhausted`, `cancelled`, `budget_configuration`) from a
  `budget` the caller passed. The Keep Queue needs it to stop the run. Everything else still returns false/null.
- **Keep Queue `tagCalls`** now counts a call only once `tag()` returns. A budget stop before sending isn't a call. The
  "past the run budget" test now uses the real tagger (budget $0.005 < the ~$0.02 claim).
- **Deadlines:**
  - Admin save tag: 45 s (route `maxDuration = 300`).
  - Quick Keep: one 90 s window per request, shared across a bulk Keep's pages (`TagAllowance.until`; route 120 s; no
    new call starts with < 2 s left).
  - Convert to Live: a 90 s budget (`createBudget({ elapsedMs })`), and the route now sets `maxDuration = 120` (it had
    none).
  - Nightly scripts: unchanged, no deadline.
- **Convert to Live budget: $0.25 a request** (`LIVE_EXPORT_MAX_DOLLARS`). Real cost is ~25 × $0.003, plus 4
  worst-case reservations in flight (~$0.026 each with 2048 output tokens). A question the budget or deadline doesn't
  reach gets the plain fallback and is counted.
- **Five "No automatic retries" headers:** corrected in `responses.cjs`, `live-trivia-quality/repeats.cjs`,
  `live-trivia-quality/audience.cjs` and `speed-trivia-quality/audience.cjs`.
  - **`lib/speed-trivia-uniqueness/openai.cjs` was left byte-identical:** `tests/speed-trivia-uniqueness-openai-release.test.ts`
    hash-pins it (`providerSha256`), and even a comment change fails both frozen gates.
  - The transport header now states the real retry rule. Correcting that one header would need new release evidence.
    Not worth it.
- **Cost dashboard (`lib/llmCostTracker.ts`):** the old "aggregate" selects (`count:feature, sum:input_tokens`) are
  PostgREST *aliases*, not aggregates, so they never summed.
  - Replaced with one bounded read (≤ 20,000 rows; the table holds ~300) summed in `summarizeUsage`.
  - It counts `metadata.calls` (via `calls:metadata->calls`), else 1 a row.
- **Reasoning tokens are now kept:** the budget tally and the ledger store `metadata.reasoningTokens` when > 0, so 7j
  and later reviews can size token limits from data. Old rows don't have it.

### 4. Files changed

- `lib/openai/responses.cjs` (+ `.d.cts`):
  - `callJson({ deadlineMs, now })` sets a total deadline. Each attempt's timeout is `min(timeoutMs, left)`.
  - A retry whose wait leaves < `MIN_ATTEMPT_MS` (1 s) throws `openai-http-<status>`.
  - Nothing left at the start of an attempt throws `openai-deadline` (nothing sent).
  - `invalid-deadline` for a bad value. Header rewritten.
- `lib/openai/ledger.cjs` (+ `.d.cts`): `rowsFor` adds `metadata.reasoningTokens`.
- `lib/speed-trivia-uniqueness/runtime.cjs`: `createBudget`'s tally adds `reasoningTokens` (from `reasoningTokens` or
  the judge's `thoughtTokens`). It isn't frozen; `core.cjs` is untouched.
- `lib/question-variety/tagging.cjs` (+ `.d.cts`):
  - `TAG_DOLLARS` deleted; `TAG_MAX_OUTPUT_TOKENS = 2048`.
  - `runOpenAI` attaches `usage`/`dollars` to a parse error.
  - `tagOne({ budget, deadlineMs, warn })` calls `callJson` directly and runs in this order:
    1. ledger row;
    2. budget settle;
    3. parse (a failed parse warns with the code and token counts, never question text).
- `lib/speedTriviaTagging.ts`:
  - `ADMIN_TAG_DEADLINE_MS`, `QUICK_KEEP_TAG_MS`, `TagAllowance = { left, until }` and `tagAllowance(now)`.
  - Workers stop starting calls near `until`.
- `lib/speedTriviaQuickReview.ts`: comment only (the cost figure).
- `scripts/process-speed-trivia-keep-queue.cjs`:
  - `tagWith(client, { apiKey, transport })` is exported and returns `(row, budget) => tagOne({ …, budget })`.
  - `processQueue` passes `session.budget`. Header corrected.
- `lib/liveTriviaExport.ts`:
  - `convertForLiveExport(rows, { transport, now })`: ≤ 25, 4 at a time, `createBudget($0.25, 90 s)`,
    claim → call → settle → parse.
  - One `recordBudget` row per request (`metadata: { questions, fallbacks }`). Returns `{ items, fallbacks }`.
  - `callOpenAIForLiveRewrite` is an arrow function.
  - The old single-question `convertSpeedQuestionToLiveTriviaExportQuestion` was removed (its only caller was the
    route). `PendingSpeedQuestion` is exported.
- `app/api/admin/trivia/questions/convert-live-export/route.ts`: `maxDuration = 120`; > 25 ids → 400 "Select at most
  25 questions."; calls `convertForLiveExport`; the response adds `fallbacks`.
- `components/admin/sections/TriviaPendingReviewSection.tsx`: the success line adds " N not rewritten." when any fell back.
- `scripts/tag-questions.cjs`:
  - `apiCeiling` = `claimFor(...)` with 8192 output tokens, passed explicitly to `runOpenAI`.
  - A billed failure settles from `error.dollars`.
  - One `question_tagging` ledger row per run (`source: 'tag-questions'`).
- `lib/question-writer/process.cjs`: the backup bar test's rows carry `sourceUrl` when the item has one (R2 #29.8).
- `lib/llmCostTracker.ts`: `callsOf`, `summarizeUsage` and the `UsageSummaryRow` type; `getCostSummary` uses them.
- Comments only: `lib/live-trivia-quality/repeats.cjs` and `lib/speed-trivia-quality/audience.cjs` (headers, plus
  `reasoningTokens` passed to `settle`), `lib/live-trivia-quality/audience.cjs` (header).
- Tests:
  - `tests/lib.openai-transport.test.ts`: the deadline across retries; reasoning tally; unmodelled settle; ledger
    reasoning.
  - `tests/lib.speed-trivia-tagging.test.ts`: new "Phase 7e" block covering 2048 tokens, an incomplete reply with
    2040 reasoning tokens (ledger row plus warning), a billed refusal, budget reserve/settle, a budget stop with nothing
    sent, and a spent deadline.
  - `tests/scripts.speed-trivia-keep-queue.test.ts`: the tagger gets the run's budget; the real tagger settles real
    dollars in PGlite; the budget stop uses the real tagger.
  - `tests/lib.live-trivia-export-budget.test.ts` (new): 4 at a time, 2048 tokens, one ledger row, fallback count with
    a billed incomplete reply, deadline, > 25 refused.
  - `tests/lib.llm-cost-tracker-calls.test.ts` (new): `metadata.calls` counted, else 1.
  - `tests/scripts.question-candidates.test.ts`: the backup grader receives `sourceUrl`.
  - `tests/scripts.question-variety.test.ts`: tag-questions settles a billed failure, writes one ledger row, and uses
    `claimFor`.
- Plan doc: top table, status line, 7e heading. `..._PHASE_7C_HANDOFF.md`: step-8 result.

### 5. Facts and traps

- **Step 0 baseline (production, read-only, 2026-11-20):** this is the cost baseline for 7j's after-ship comparison.

  | Run | Feature / model | Calls | Input → output tokens | Cost |
  | --- | --- | --- | --- | --- |
  | Trivia Nightly `44715698023`, 10:05 UTC | `speed_question_checks`, `gpt-6-luna` | 248 | 187,379 → 22,302 (~90 out/call; effort none) | 2.9889¢ |
  | Trivia Nightly | `live_question_checks`, `gpt-6.1-sol` | 5 | 1,853 → 186 (37 out/call, reasoning included) | 0.5566¢ |
  | Keep Queue `44732040784`, 12:05 UTC | `speed_question_checks`, `gpt-6-luna` | 643 | 480,948 → 56,531 | 7.636¢ |

  - **Keep Queue run report:** 23 queued, 22 examined, 18 approved, 4 "Needs a look", 1 transient
    `verification_unavailable`, `tagCalls: 0`, spent $0.0779 of the $1 reservation. The lifetime total is now about
    $14.72 of the $30 cap.
    - The report shows $0.0779; the ledger row shows $0.07636. The report also counts unsettled reservations.
  - **No `question_tagging` or `live_trivia_rewrite` rows yet.** So there are no `tagging-truncated-or-blocked` or
    `untagged` refusals to count.
  - Earlier Keep Queue runs (11-18, 11-19) also had `tagCalls: 0`. Expected effect of R2 #29.2 at current volume:
    **$0**, not the plan's ~$0.25.
  - **Reasoning tokens weren't in the ledger before 7e.** The nightly checks after the merge will be the first rows
    with `metadata.reasoningTokens`.
- **`tests/speed-trivia-uniqueness-openai-release.test.ts` hash-pins `lib/speed-trivia-uniqueness/openai.cjs`** (and
  `core.cjs`). Never edit either, not even comments. (The plan's ground rules name only `core.cjs`.)
- `createBudget().settle(reserved, actual)` tallies `byModel` only when `actual.model` is set. Use that on purpose
  (§3), and never settle a call twice.
- `claimFor` for `gpt-6.1-sol` with 2048 output tokens is ~$0.025 a call (output tokens dominate). Small test budgets
  must be below that to force a budget stop.
- The writer's schedule ran **~7 h late** (07:38 UTC instead of 00:30) and took 10 m 40 s. GitHub scheduled runs can be
  delayed; the Trivia Nightly (10:00 UTC) still came after it.
- `supabase db query --linked "<sql>"` works for read-only checks, and its output wraps rows in an untrusted-data
  boundary. Column names that tripped me: `llm_usage_logs` has `cost_cents` (not `cost_usd`); `question_tags` keys on
  `question_ref`; `question_coverage_areas.eras` is `text[]` (use `cardinality`).
- Never `git checkout -- <file>`, `git stash` or `git reset`. The `openai.cjs` comment edit was undone with a reverse
  text edit; `git diff` confirms the file is unchanged.

### 6. Checks run (2026-11-20)

- Targeted: transport 13, tagging 21, Keep Queue 19, export 4 + 3, cost tracker 1, question candidates and variety
  10 + 14. All green.
- `npm run test` → 592 files: 7,660 passed, 13 skipped. The only failures were the two `openai.cjs` hash pins; after
  restoring that file, both release files pass (10 tests).
- `npx tsc --noEmit` → clean. `npx eslint` on every changed file → clean. `npm run build` → success (run after the
  typecheck, not at the same time).
- `/verify` (browser) **not run**:
  - No game page changed. The one UI change is a success message on the Admin pending-review screen.
  - Exercising it would call OpenAI and read the shared production database.
- **Unverified until after merge:**
  - real tag calls at 2048 tokens (none happen today);
  - Quick Keep under a real 429 burst;
  - the dashboard's `calls:metadata->calls` select against real PostgREST (unit-tested on the summing only). Check
    `/api/admin/llm-cost` once after deploy.

### 7. Open questions for Andrew

- **Live thin categories:** (a) let thin categories reuse their slots (recommended, $0), or (b) add eras on the Variety
  page?
- From 7d, still open: OK with "a question may return to its own reserved fact"? One PR for 7d–7j, or one per phase?

### 8. Recommended first steps for 7f

1. `git switch fix/second-review-remedials`. Read plan §4 "Phase 7f" and the ground rules ("Remedial phases 7d–7j").
2. If Andrew has answered the thin-category question with (a), consider doing that small fix first. It's separate
   files and $0.
3. Model: **Opus 5.5 / high** (plan's top box).
