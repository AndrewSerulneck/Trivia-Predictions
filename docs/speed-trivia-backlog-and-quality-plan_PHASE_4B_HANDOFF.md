# Speed Trivia backlog plan — Phase 4b handoff (the ChatGPT writer and the Speed Trivia path)

Written 2026-11-16 by Claude (Opus 5.5, high effort, as the plan's table names; no substitution).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4b". Previous: `..._PHASE_4A1_HANDOFF.md` (4a.1 is
**still in progress**: its thinning waits for your spot check, and the Keep Queue is still paused).

## For Andrew

- **Built and tested, not live yet.** Every day, ChatGPT will write about 16 Speed Trivia questions (11 regular and 5
  Current Events) from a brief the site prepares. Overnight, the site checks each one: the rules, the variety map,
  the 5-per-subject cap, the bar test and the repeat check. Up to 10 a day then wait in Quick Review, marked
  **ChatGPT**. Their Keep is instant and free.
- **Trial on today's real brief:** I ran one ChatGPT call for each half (your plan, no money, nothing saved). All 16
  questions passed the free checks. Examples: "Which national park is home to Half Dome and El Capitan?", "Who plays
  the Riddler in the 2022 film The Batman?", "In July 2026, who won his second consecutive Wimbledon men's singles
  title?" (with an ATP source link). The bar test and repeat check didn't run on these.
- **Live in the database (you OK'd it):** the writer's inbox and the new Quick Review Source values (ChatGPT, Gemini).
  I checked that the live Quick Review still works.
- **Created (you OK'd it):** the private repo `AndrewSerulneck/hightop-question-writer`. Its daily schedule is off.
  The writer token is in Vercel Production and in that repo. Neither was ever shown.
- **Not live:** the website code. As you decided (D23), you review 4a–4c after 4c, then we commit, merge and deploy.
  The Trivia Nightly job **stays off** until then. Switching it on now would run the old Gemini writer (the one that
  wrote obscure questions), because main doesn't have the new code yet.
- **Cost so far: $0.** ChatGPT usage: about 73k plan tokens for the two trial calls.
- **Needs you, before the trial run (4d), about 5 minutes:**
  1. Make one GitHub token: GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository
     access: only `hightop-question-writer`. Permissions: Secrets, Read and write. Then run
     `gh secret set SECRETS_WRITE_TOKEN --repo AndrewSerulneck/hightop-question-writer` and paste the token.
  2. Give the writer its own ChatGPT login: clone the private repo, then run `bash renew-login.sh` on your Mac and
     follow the link it shows.
- **Still waiting from 4a.1:** your spot check of about 20 subjects, then the thinning and the Keep Queue restart.

## For the next agent

### 1. Next phase and scope

The plan order puts **4a.1's unfinished steps first**: re-tag, aliases, the plan and spot check, apply, then re-enable
the Keep Queue (see `..._PHASE_4A1_HANDOFF.md` §7). Then comes **Phase 4c, the Live Trivia path** (plan §4 "Phase 4c"):
Live bar test, Live hard limits, Live repeat check, Quick Review Live mode, Publish to the canonical JSON, the Current
Events round, Live expiry and the `SYSTEM_CONTEXT.md` §12 note. Model: **Opus 5.5 / high**. 4c adds `'live'` to
`WRITER_GAMES` (`lib/question-writer/brief.cjs`) and `CATEGORIES` (`candidates.cjs`), adds a Live prompt and schema to
`rules.cjs`, and adds the Live statuses to `question_candidates` with a new migration.

**After 4c (D23):** Andrew reviews 4a–4c. Then commit, merge, deploy, run `gh workflow enable trivia-nightly.yml`, and
start 4d.

Out of scope for 4c: the trial run and the daily schedule (4d), `core.cjs` (frozen), and anything in 3a–3d.

### 2. Starting state

- Branch `feature/speed-trivia-variety`. Last commit `1aa32e4e` (PR #19 merge). **Everything from 4a, 4a.1 and 4b
  is uncommitted.** Never use `git checkout -- <file>`, `git stash` or `git reset` on it.
- **4b files (new unless marked M):**
  - `supabase/migrations/20261116030506_question_writer_candidates.sql`: **APPLIED 2026-11-16** with
    `supabase db push --linked --yes`; the dry run first showed only this file.
  - `lib/question-writer/rules.cjs` + `.d.cts`, `brief.cjs` + `.d.cts`, `candidates.cjs` + `.d.cts`, `process.cjs`,
    `geminiWriter.cjs`
  - `lib/questionWriterAuth.ts`, `app/api/question-writer/brief/route.ts`, `app/api/question-writer/candidates/route.ts`
  - `scripts/process-question-candidates.cjs`
  - `tools/question-writer/` (`README.md`, `write.mjs`, `renew-login.sh`, `.github/workflows/write-questions.yml`).
    This is the private repo's source of truth.
  - Tests: `tests/question-writer-sql.test.ts`, `tests/lib.question-writer.test.ts`,
    `tests/scripts.question-candidates.test.ts`, `tests/api.question-writer.test.ts`
  - M `lib/speed-trivia-uniqueness/runtime.cjs` + `runtime.d.cts` (`writerMeta`), M `.github/workflows/trivia-nightly.yml`,
    M `eslint.config.mjs`, M `lib/speedTriviaQuickReview.ts`, M `types/speedTriviaQuickReview.ts`,
    M `app/api/admin/trivia/quick-review/route.ts`, M `components/admin/sections/SpeedTriviaQuickReview.tsx`,
    M `tests/api.admin.speed-trivia-quick-review.test.ts`, M `tests/components.speed-trivia-quick-review.test.ts`,
    M the plan doc, and this note.
- **Production data:** none written by 4b. `question_writer_runs` and `question_candidates` are empty (checked
  after the push).
- **Private repo** `AndrewSerulneck/hightop-question-writer` (PRIVATE). One commit `466917e`, a copy of
  `tools/question-writer` plus a `.gitignore`. Secrets: `QUESTION_WRITER_TOKEN`. Variables:
  `WRITER_BASE_URL=https://hightopchallenge.com`, `CODEX_MODEL=gpt-6-astra`. **Missing until Andrew acts:**
  `SECRETS_WRITE_TOKEN` and `CODEX_AUTH_JSON`. The schedule is commented out; `workflow_dispatch` works.
- **Vercel:** `QUESTION_WRITER_TOKEN` added to Production (2026-11-16 03:23 UTC). The same value is in the private
  repo. It was generated in a shell variable and piped to both, and no copy exists anywhere else. To rotate, generate a
  new one and pipe it to both again. It isn't a `NEXT_PUBLIC_` variable; it takes effect at the next deploy.
- **Workflows:** Trivia Nightly `disabled_manually`; Speed Trivia Keep Queue `disabled_manually` (4a.1, D18).

### 3. Decisions (don't re-ask)

- **D23 (Andrew, 2026-11-16):** review 4a–4c after 4c, then commit, merge and deploy; 4d and 5 run live. Also OK'd:
  push `20261116030506` (done), create the private repo and set the token (done).
- **The brief builds the prompts on the server** (`rules.buildSpeedPrompt`) and sends them with the output schema. The
  private repo runs them and posts the results, so the rules are reviewed and tested here. The Gemini fallback uses the
  same prompts.
- **One batch per game per UTC day** (`question_writer_runs` primary key, server date). An identical retry is
  answered idempotently; a different second batch gets 409; at most 2 accepted posts. A day the fallback filled refuses
  a late ChatGPT post, and the reverse holds too.
- **The server computes `expiresOn`** with `expiresOnFor(era)` and ignores any the writer sends. The plan listed
  `expiresOn?` in the writer's schema; it was dropped so the date can't disagree with the era.
- **The fallback skips Current Events.** Gemini without web search would write from stale knowledge, and paid search
  grounding isn't in the approved cost. Fallback days deliver regular slots only.
- **Processing order:** free gates (schema, slot category, hard limits, Current Events limits, tag) → star cap → one bar
  test call → admission, best score first (Current Events first) until `DELIVER` (3 Current Events + 7 regular).
  The rest are `skipped` with reason `daily-target`. `budget_exhausted` marks the rest `skipped`/`budget`. A duplicate
  or uncertain result is `rejected` with the checker's message. Any other error is fatal, and candidates not yet
  settled stay `received`, so a same-day re-run continues.
- **Bar-test threshold:** default 3, from repository variable `QUESTION_WRITER_SPEED_THRESHOLD` (4d tunes it). The score
  is also stored on the admitted row (`speed_trivia_review_set_audience`), so Quick Review's Best sort works.
- **Writer model:** Codex `gpt-6-astra` (listed in `~/.codex/models_cache.json`, Codex CLI 0.163.0, "Frontier
  intelligence for the most demanding work"), effort `high`. The private workflow pins `@openai/codex@0.163.0`.
- **"Writer stopped"** shows when the two latest writer days are consecutive, both `gemini-fallback`, and the latest is
  within 2 days.

### 4. How the pieces fit

```
private repo (write.mjs, manual until 4d)       production
  GET /api/question-writer/brief?game=speed  ->  brief.buildBrief: question_variety_stats + 120 recent active rows
                                                 -> chooseSlots / avoidList / pickExamples -> 2 prompts + schema
  codex [--search] exec ... per prompt
  POST /api/question-writer/candidates       ->  candidates.parsePost -> question_writer_receive (source chatgpt)
trivia-nightly.yml 02:15 UTC (after deploy)
  scripts/process-question-candidates.cjs    ->  process.processSpeedDay
     no batch today -> geminiWriter.writeWithGemini (≤ $0.10) -> receive (source gemini-fallback)
     gates -> question_subject_stats + checkStarCap -> audience scorer -> runtime session.write (pending_review,
     speed_generation_metadata: source, writer, model, candidateId, area, era, sourceUrl, expiresOn)
     -> question_tags upsert (written_at = created_at) -> set_audience -> candidate status
Quick Review: Source = ChatGPT / Gemini; the card shows "ChatGPT · area · era" and a Source link (https only)
```

- `runtime.writerMeta` whitelists the metadata keys (≤ 500 characters each). The envelope keeps
  `version:'speed-subject-plan-v1'`, which `admit_speed_trivia` already accepts, and it stores the whole object. No
  admission SQL changed.
- `speed_trivia_review_queue` was replaced with the same signature. It adds `p_source` values `chatgpt` and `gemini`
  and the item fields `source`, `area`, `era` and `sourceUrl` (only `https://`).

### 5. Facts and traps

- **Don't enable Trivia Nightly before the deploy.** GitHub runs main's workflow file, which still calls
  `scripts/generate-trivia-nightly.cjs`, the old obscure-question writer.
- `codex --search` is a global flag: `codex --search exec ...`, not `codex exec --search`. `codex login --device-auth`
  exists in 0.163.0.
- `www.hightopchallenge.com` 308-redirects to the apex. The writer must call the apex (`WRITER_BASE_URL`), because
  `fetch` drops `Authorization` on a cross-origin redirect.
- The current month is a valid Current Events era once 7 days old (`writingMonths`). The trial brief offered 2026-11
  on 2026-11-16.
- The trial used ~21.5k plan tokens (regular, 87 s) and ~51k (Current Events with search, 71 s). 4a.1's re-tag hit a
  ChatGPT usage limit after heavy use the same day, so 4d should check the daily writer fits.
- A fine-grained PAT can't be created from the CLI. Andrew makes `SECRETS_WRITE_TOKEN` in the GitHub UI.
- The Vercel CLI prints a `vercel env pull` hint after `env add`. Pulling is forbidden here (CLAUDE.md).
- On fallback days Gemini grades its own writing. The hard limits, star cap and repeat check still apply.
- The brief's avoid list is up to 80 subjects per category (active + waiting). Until 4a.1 thins the bank, it is
  dominated by the heavy subjects. The server's star cap still catches the rest.

### 6. Build, run, test

- `npm run test`: 560 files passed, 1 skipped (7,311 tests). `npx tsc --noEmit`: clean. ESLint on every changed file
  and on `tools/question-writer`: clean.
- New tests: SQL inbox and Source filter on PGlite (8), rules, brief, parser and fallback (13), processing with fakes
  (7), endpoints (6), Quick Review route (+2) and card (+2).
- Production checks after the push (free): all five Source values answer, with the new item fields; the inbox tables
  are empty; the receive RPC refuses bad input; a direct insert is denied.
- Free trial (nothing written): `buildBrief` against production, then one `codex exec` per prompt through the free gates.
  The probe scripts were scratch files and aren't kept. To repeat it, build the brief with
  `node --env-file=.env.local` + `brief.buildBrief({ client: clientFromEnv(), game: 'speed' })`, then
  `scripts/lib/codexExec.cjs` `runCodex`.
- Nightly command: `node --env-file=.env.local scripts/process-question-candidates.cjs --game speed [--threshold 3]
  [--no-fallback] [--report <dir>]`. **It is paid** (bar test + repeat check, ≤ `SPEED_TRIVIA_MAX_DOLLARS`), so run it
  by hand only with Andrew's OK.
- **Not verified:** the endpoints on the live site (not deployed); the private workflow on GitHub (no login or
  secrets token yet); the paid gates on real candidates; the Quick Review card in a real browser (tests only); the
  login write-back.

### 7. Open questions for Andrew

- The two setup steps under "For Andrew" (the token and the login). They are needed before 4d, not before 4c.
- 4a.1's spot check (from the 4a.1 handoff).
- Optional proposal for CLAUDE.md (his call): in the Feature rules table, add "Daily question writer |
  `docs/speed-trivia-backlog-and-quality-plan.md` | The writer only reaches production via the token endpoints;
  candidates reach the bank only through signed admission."

### 8. Recommended first steps

1. Read plan §4 Phase 4 (all of it), 4a.1, 4c, §7, the 4a.1 handoff and this note. Run `git status` and
   `gh workflow list --all`.
2. Finish 4a.1 if Andrew has done the spot check. Otherwise start 4c and leave 4a.1 to him.
3. For 4c, start from `rules.cjs` (Live prompt and schema), `candidates.cjs` (Live parser), and a Live branch in
   `process.cjs`, or a sibling `processLiveDay`. Reuse the inbox. A Live migration adds the statuses `keep`, `reject`
   and `published`, plus a `pr_url` column.
