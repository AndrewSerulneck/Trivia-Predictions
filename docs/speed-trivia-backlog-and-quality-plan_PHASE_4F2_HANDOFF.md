# Phase 4f.2 handoff: the question checks move from Gemini to the OpenAI API (D40)

Written 2026-11-19 by Claude (Opus 5.5, high effort, as the plan's table names).

## For Andrew (plain English)

- **What changed:** every job Gemini still did now uses OpenAI through the API key you added:
  - the Speed and Live repeat checks
  - subject tagging
  - the backup bar test, for questions ChatGPT didn't grade
  - the Admin "Convert to Live export" rewrite

  The Gemini code is deleted, and a test now fails if Gemini comes back anywhere.
- **Which model does what (picked by test, not by name):**
  - **Speed repeat check:** `gpt-6-luna`, the cheap one. It re-passed both frozen accuracy tests and matched or beat Gemini.
    `gpt-6.1-sol` (your suggestion) **failed** that test: it rejects too many good questions as repeats (117 of 124
    accepted; the bar is 95%) and costs 20× more.
  - **Tagging, Live repeat check, backup bar test:** `gpt-6.1-sol`. It was clearly better at tagging (95% agreement vs 79%)
    and closer on Live repeats, and those jobs make only a few calls a night.
- **Cost:**
  - **Gemini (measured, last 30 days):** about $4–5 a month for the recurring checks.
  - **OpenAI (estimated):** about $2–4 a month for the same work.
  - **Keep Queue backlog sweep:** still capped at $20 in total (about $5.35 left). It gets through more questions per dollar
    now, so it finishes sooner, but spends the same.
  - **Testing today:** about $0.90.
- **Is it live?** **No.** It's on branch `feature/gemini-writers-out-4f1` (with 4f.1), committed but not pushed. Gemini keeps
  running every night until this is merged.
- **What needs you:**
  1. OK to apply one small database change (it lets the cost log accept "openai" rows). Until it's applied, the new cost
     rows are skipped. Nothing else breaks.
  2. OK to push and open the PR, then merge it.
  3. After the first nightly run on OpenAI looks right, remove `GEMINI_API_KEY` from GitHub (Settings → Secrets) and
     Vercel, and delete its line from `.env.local`. Agents aren't allowed to remove secrets.

## For the next agent

### 1. Next phase and scope

- **First, finish 4f.2's open items** (nothing else in 4f.2 is open):
  - apply the migration with Andrew's OK;
  - push and open the PR;
  - after the merge, run step 6, the production check: one nightly run of both games and one Admin edit of a Speed
    question should each show `provider='openai'` rows in `llm_usage_logs` and no Gemini. Compare a week's spend with
    the baseline in §6.
- **Then Phase 7 (seasonal slots, D34)** per the plan, §4 "Phase 7".
- **Out of scope:** changing `core.cjs` or the `fact-judge-v2` prompt (both frozen; see §5), and adding any Gemini use.

### 2. Starting state

- **Branch:** `feature/gemini-writers-out-4f1`. It holds the 4f.1 commits (`19e0b03c`, `45f2ccb3`) plus the 4f.2 commit
  made with this note. Nothing is pushed and there is no PR yet.
- **Migration:** `supabase/migrations/20261119153651_llm_usage_logs_openai.sql`, **NOT applied**. It drops and re-adds
  `llm_usage_logs_provider_check` as `('anthropic','gemini','openai')`. Verified 2026-11-19 that production rejects an
  `openai` row today. `lib/openai/ledger.cjs` never throws, so before the migration the ledger rows are simply lost
  (it logs a warning).
- **Secrets:** `OPENAI_API_KEY` is in `.env.local` (appended), Vercel production + preview (sensitive) and the GitHub
  Actions secrets. `GEMINI_API_KEY` is still in all three; Andrew removes it after the merge.
- **OpenAI account:** prepaid credit (Andrew added $5–10 on 2026-11-19). The API is billed separately from ChatGPT Pro.
- **Data:** no data was changed. The paid test runs only wrote private files under
  `tmp/speed-trivia-uniqueness-private/phase4f2-*` (git-ignored):
  - `phase4f2-gpt-6-luna-main` and `phase4f2-gpt-6-luna-fresh`: the frozen runs.
  - `phase4f2-gpt-6.1-sol-main` and `phase4f2-gpt-5-nano-main`: comparison runs.
  - `phase4f2-gpt-6-luna-aborted`: an early run stopped by a 503 before the retry existed.

### 3. Decisions made, and why

- **D40 (Andrew):** Gemini out altogether.
- **Models were chosen by the frozen gates and comparisons, not by name.** Andrew suggested `gpt-6.1-sol`; he was told
  the gates decide. The results are in §6.
- **Credits:** Andrew chose "Add $5–10 credit" after learning ChatGPT Pro doesn't cover the API.
- **The ledger writes one row per model per run**, not one per call: it is cheap and enough for the Admin LLM Cost page.
- **The backup bar test uses the ChatGPT grader's prompt** (`bar-test-v6`, Live `bar-test-live-v4`, no web search), so
  both paths grade alike. The old v5 prompt is kept only for `scripts/speed-trivia-thin-subjects.cjs`.
- **The Live rewrite (`lib/liveTriviaExport.ts`) uses `gpt-6.1-sol`.** It is rare and quality-critical.

### 4. Files

**New**
- `lib/openai/responses.cjs` (+ `.d.cts`): the single transport.
  - Main pieces: `callJson`, `claimFor` (budget reservation), `priceOf`, `RATES`, `EFFORT`, `jsonOf`.
  - Requests use the Responses API with a strict `json_schema` and `store:false`.
  - Each model gets its lowest reasoning setting, or temperature 0 for non-reasoning models.
  - It retries 429/500/502/503/504 up to twice (1 s, then 3 s, or the `retry-after` header, capped at 20 s). It never
    retries a timeout (that call may have been billed) or `insufficient_quota`.
  - It returns usage even for an incomplete reply, so callers can settle the budget before refusing it.
- `lib/openai/ledger.cjs` (+ `.d.cts`): `recordUsage` and `recordBudget`.
  - Features: `speed_question_checks`, `live_question_checks`, `question_tagging`, `live_trivia_rewrite`.
- `lib/speed-trivia-uniqueness/openai.cjs` (+ `.d.cts`): the Speed repeat judge.
  - It uses the same `fact-judge-v2` text as the deleted Gemini client.
  - `modelVersion()` returns `openai:gpt-6-luna:fact-judge-v2:effort-none:batch-1`. Pair-cache keys include it, so a
    Gemini verdict is never reused (plan step 4).
- `scripts/freeze-speed-trivia-uniqueness-evidence.cjs`: turns a passing paid evaluation into release evidence.
- Evidence:
  - `tests/fixtures/speed-trivia-uniqueness/release-openai-evaluation-v1.json` (258 recorded verdicts) and
    `release-openai-fresh-evaluation-v1.json` (36), each with a `.sha256` file.
  - `tests/speed-trivia-uniqueness-openai-release.test.ts` replays them and pins the hashes of `core.cjs` and `openai.cjs`.
- Tests:
  - `tests/lib.openai-transport.test.ts`: transport, retry, budget tally per model, ledger.
  - `tests/helpers/openaiReply.ts`.
- Migration: see §2.

**Changed**
- `lib/speed-trivia-uniqueness/runtime.cjs`:
  - It now uses the OpenAI judge and `OPENAI_API_KEY`.
  - `createBudget().summary().byModel` tallies calls, tokens and dollars per model.
- `lib/live-trivia-quality/repeats.cjs`: `REPEAT_MODEL = 'gpt-6.1-sol'`, with a strict schema.
- `lib/question-variety/tagging.cjs` and `lib/speedTriviaTagging.ts`:
  - `TAG_MODEL = 'gpt-6.1-sol'`.
  - `tagged_by` labels are `openai:<model>:<route>`.
- Bar test:
  - `lib/speed-trivia-quality/audience.cjs`: `BAR_TEST_MODEL = 'gpt-6.1-sol'`, `makeApiScorer`.
  - `lib/live-trivia-quality/audience.cjs`.
- Run processors and Admin paths:
  - `lib/question-writer/process.cjs` and `liveProcess.cjs`: write a ledger row in `finally`.
  - `lib/speedTriviaAdmission.ts`: Admin saves record spend.
  - `lib/liveTriviaExport.ts`: the rewrite.
- Cost page:
  - `lib/llmCostTracker.ts`: Gemini pricing removed; `openai` added as a provider.
  - `components/admin/sections/LlmCostSection.tsx`: copy.
- Workflows `trivia-nightly.yml` and `speed-trivia-keep-queue.yml`: `OPENAI_API_KEY` replaces `GEMINI_API_KEY`.
- Scripts moved to OpenAI: `process-speed-trivia-keep-queue`, `evaluate-speed-trivia-uniqueness` (`--model`),
  `tag-questions` (`--provider codex|openai`), `score-speed-trivia-backlog`, `audit-speed-trivia-refresh`,
  `dry-run-speed-trivia-retirement`.
- **Deleted:** `lib/speed-trivia-uniqueness/gemini.cjs`, `gemini.d.cts`, `scripts/audit-live-trivia.cjs`.
- `tests/no-gemini-writer-contract.test.ts` now scans `lib/`, `app/`, `components/`, `scripts/` and `.github/` for any
  Gemini key, endpoint or client.
- Docs:
  - `CLAUDE.md` and `AGENTS.md`: the "No Gemini" rule.
  - The plan: status line, Phase 4f.2 results, D40 row, §7 rule.

### 5. Facts and traps

- **Model quirks** (the lowest reasoning setting each accepts, probed 2026-11-19):

  | Setting | Models |
  |---|---|
  | `none` | `gpt-6-luna`, `gpt-6.1-terra`, `gpt-5.4-nano`, `gpt-5.6-luna` |
  | `low` (rejects `none` and `minimal`) | `gpt-6.1-sol` |
  | `minimal` | `gpt-5-nano`, `gpt-5-mini` |
  | Temperature 0 (not reasoning models) | `gpt-4o-mini`, `gpt-4.1-mini` |

  No reasoning model accepts `temperature`. All of this is encoded in `EFFORT`.
- **A new account's credit takes about 10–15 minutes to settle.** Calls succeed and fail at random ("You have no credits
  remaining", 429 `insufficient_quota`) until it does.
- **OpenAI returns short bursts of 503.** Before the retry existed, `evaluate-speed-trivia-uniqueness.cjs` stopped at
  the first error, because it batches 3 calls and breaks on any failure. With the retry, a full run finished cleanly.
- **Judge calls take 8–17 s each on `gpt-6-luna`** (server processing time, not rate limits; limits are 5,000 req/min).
  A full 258-pair run takes about 7 minutes. Tag calls take about 2 s on either model, well inside the 15 s Admin timeout.
- **Hash pins:** `openai.cjs`'s hash is pinned in the evidence. Any edit to it, even a comment, needs a new paid
  evaluation and a new freeze:
  ```
  node --env-file=.env.local scripts/evaluate-speed-trivia-uniqueness.cjs --snapshot <snap> --output <dir> --paid --model <m> [--fixture <fresh>]
  node scripts/freeze-speed-trivia-uniqueness-evidence.cjs --report <dir>/evaluation-*.json --output <dir> --fixture <fixture> --out <release-openai-*.json>
  ```
  `core.cjs` is pinned too, and is frozen.
- **Snapshots** (private, under `tmp/speed-trivia-uniqueness-private/`):
  - main: `2026-10-13T02-56-30-977Z`
  - fresh: `2026-10-13T04-06-03-889Z`, used with `--fixture tests/fixtures/speed-trivia-uniqueness/evaluation-fresh-v1.json`
- **`gpt-5-nano` returned an HTTP 400 on one pair** in the evaluation. It was dropped on quality anyway (it called
  "Thriller" vs "Bad" a repeat), so the cause wasn't investigated.
- **`tests/components.live-trivia-quick-review.test.ts` failed once** under full-suite load and passes on its own. It is a
  timing flake unrelated to this change.
- **Permissions:** `cut -d= -f1 .env.local` was denied here. To check that a key is present, print a boolean via
  `node --env-file=.env.local -e "console.log(Boolean(process.env.OPENAI_API_KEY))"`.

### 6. Build, test, and what was verified

- **Commands:**
  - `npx tsc --noEmit`: clean.
  - `npx eslint <changed files>`: clean.
  - `npx vitest run`: 7,622 passed, 13 skipped, with the flake above passing on re-run.
  - `npm run build`: see the commit message for the result.
- **Paid verification, 2026-11-19 (about $0.90 in all):**

  | Test | Model | Result | Cost |
  |---|---|---|---|
  | Speed frozen gate, main (272 pairs) | gpt-6-luna | **pass**: 137/137 caught, 0 escapes, 122/124 distinct accepted, held-out 37/37 | $0.031 |
  | Speed frozen gate, fresh (36) | gpt-6-luna | **pass**: 18/18, 18/18 | $0.004 |
  | Speed frozen gate, main | gpt-6.1-sol | **fail**: 117/124 distinct (94.4%), held-out 35/37 | $0.626 |
  | Speed frozen gate, main | gpt-5-nano | stopped (HTTP 400); wrong on a probe pair | $0.012 |
  | Gemini, for reference (frozen) | gemini-2.5-flash | 122/124, held-out 36/37; fresh 18/18 | — |
  | Live repeat check vs Gemini's 45 past verdicts | luna / sol | 36 / 35 agree (disagreements reviewed: mostly Gemini flagging a different answer about one event) | $0.002 / $0.048 |
  | Tagging vs 100 existing tags (area/era/subject) | luna / sol | 79/86/88 vs **95/97/94** | $0.006 / $0.117 |

- **Cost baseline** (Gemini, 30 days):
  - `llm_usage_logs` had no Gemini rows.
  - Nightly Speed checks cost $0.004–0.127 a night; Live $0.003–0.02.
  - Keep Queue: about $4.87 a run, mostly the D17 backlog pre-check, stopped by its $5 cap. It has spent $14.65 of its
    $20 total.
- **OpenAI estimate:**

  | Job | Model | Estimate |
  |---|---|---|
  | Speed checks | luna (~$0.00012 a pair, vs Gemini ~$0.0005) | under $1 a month |
  | Live checks | sol | ~$0.02 a night |
  | Tagging | sol | ~$0.0012 a tag, ~$1–2 a month |
  | Backup bar test | sol | rare |
  | **Total** | | **~$2–4 a month**, vs Gemini ~$4–5 |

- **Unverified until after the merge:** the production ledger rows, the nightly workflows with the new secret, and an
  Admin edit (step 6).

### 7. Open questions for Andrew

- OK to run `supabase db push` for `20261119153651_llm_usage_logs_openai.sql`?
- OK to push the branch and open the PR (4f.1 + 4f.2 together)?
- After the merge: remove `GEMINI_API_KEY` from GitHub, Vercel and `.env.local`.

### 8. Recommended first steps

1. With Andrew's OK:
   ```
   supabase db push
   ```
   Then confirm an `openai` row inserts (insert one test row and delete it, or wait for the first run).
2. Push `feature/gemini-writers-out-4f1` and open the PR. Andrew merges.
3. After the next nightly run, query
   `llm_usage_logs where provider='openai' and created_at > now()-interval '1 day'` and expect
   `speed_question_checks`, `live_question_checks` and `question_tagging` rows. Then do one Admin edit of a Speed
   question.
4. A week later, compare spend with the §6 baseline and report it. Then Phase 7 (plan §4), on Opus 5.5 / high as the
   plan's table names.
