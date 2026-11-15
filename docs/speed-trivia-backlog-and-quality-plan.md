# Speed Trivia backlog clearing and question quality

Created 2026-11-15. Owner: Andrew Serulneck.

**Status: Phase 0 DONE 2026-11-15 — `speed-trivia-backlog-and-quality-plan_PHASE_0_HANDOFF.md`. Phase 1 DONE
2026-11-15 (migration applied) — `..._PHASE_1_HANDOFF.md`. Phase 2 DONE 2026-11-15: migration `20261115153905` applied,
all 7,333 bar-test scores loaded — `..._PHASE_2_HANDOFF.md`. Phase 3 DONE 2026-11-15 (overnight Keep queue, faster
checker, D5, D17 pre-check, D4 dollars ledger): migration `20261115170333` APPLIED; verified on production with a
10-question pre-check ($0.04, 8 repeats retired); committed to PR #19. Repository variables
`SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20` SET 2026-11-15 (confirmed with
`gh variable list`); the nightly job runs only once PR #19 is merged — `speed-trivia-backlog-and-quality-plan_PHASE_3_HANDOFF.md`. All on branch `feature/speed-trivia-quick-review`,
PR #19, merge after the end-of-plan code review. Decisions: D1 yes, D2 yes, D3 review, D4 $5 per night and $20 in total
(answered), D5 no (built), D6 10/game/day, D7 ages 21–75, D8 retire automatically (built), D9–D11 and D14–D16
answered, D12 superseded, D13 Gemini fallback (confirmed), D17 yes (built). Phase 4 AMENDED 2026-11-15: ChatGPT
(Andrew's Pro plan) writes Speed AND Live Trivia questions; a variety map plus a star cap force spread inside every
category; a new Current Events category in both games (§4 Phase 4a–4d). REMEDIAL PHASES 3a–3d ADDED 2026-11-15
from Andrew's code review of Phases 0–3 (10 findings; §4 "Remedial phases 3a–3d"). Phase 3a DONE 2026-11-15
(migration `20261115212126` written and tested, NOT applied; 3d applies it) —
`speed-trivia-backlog-and-quality-plan_PHASE_3A_HANDOFF.md`. Phase 3b DONE 2026-11-15 (migration `20261115213124`
written and tested, NOT applied; 3d applies it) — `speed-trivia-backlog-and-quality-plan_PHASE_3B_HANDOFF.md`. Phase 3c
DONE 2026-11-15 (migration `20261115214254` written and tested, NOT applied; 3d applies it) —
`speed-trivia-backlog-and-quality-plan_PHASE_3C_HANDOFF.md`. Next: Phase 3d, then Phase 4a. Don't merge PR #19 until
3d has applied the three remedial migrations (Andrew, 2026-11-15). Andrew code-reviews Phases 4a–5 after Phase 5, before they are committed.**

## 1. For Andrew — the short version

**What's actually in the backlog (production, read 2026-11-15):**

| Group | Waiting | What they're like |
| --- | --- | --- |
| Older questions, written Jun–Oct 13, before the repeat checker existed | **6,981** | Short and mainstream (koala sleep, U2 → Dublin, The Simpsons → Springfield, Back to the Future → DeLorean). Never checked for repeats, and **4,602 (66%) have the same correct answer as a question you've already approved**, so many will turn out to be repeats. |
| Newer questions from the nightly writer, Oct 13 onward | **473** | The obscure, long-winded ones (average 146 characters vs 77 for approved questions; 360 of 473 run past 120). **Your four examples all came from this group.** These were already checked against the whole bank before they reached your page. |
| Literary Landscapes (across both groups) | **121** waiting, plus **99 already approved** | Not one of the 8 categories players pick, but its approved questions still appear under "All Categories". |

**Why the nightly writer produces obscure questions.** It's told to. The prompt in
`lib/speed-trivia-uniqueness/generation.cjs` tells Gemini to "explore these less-used subtopics" and "prefer places,
works and people beyond the usual famous examples". Its topic lists are niche by design ("invertebrates",
"everyday materials", "crafts", "cities outside Europe and North America", "authors outside Britain and America",
"adaptive sports"), and it always picks the topics with the fewest questions. Nothing checks whether a typical
American would know or enjoy the question. "Hard" is never defined, so Gemini makes questions hard by making them
obscure. Literary Landscapes exists only because the writer generates for every category already in the database.
Nobody chose it as a game category.

**Why approval is slow.** Each question is compared one pair at a time against up to 128 similar approved
questions, one Gemini call per pair, while you wait in the browser. That's roughly 30–75 seconds per question, so a
200-question click can't finish and you have to keep clicking Continue. Each check costs about $0.03 per question.
The nightly writer hits the same wall: every run stops at its 10-minute limit, so it keeps only ~16 of the 100
questions it's asked for.

**Your point 1 is already true for new questions.** The nightly writer checks for repeats before saving, so its
questions reach your page already verified. Approving them still re-runs the check, which costs time and money for
nothing. The older 6,981 are the only ones that genuinely need checking.

**The plan:**

1. **Phase 0 (same day, free):** stop generating Literary Landscapes, remove its waiting questions, and pause the
   nightly writer until it's fixed.
2. **Phase 1:** a **Quick Review** screen. One question at a time, Keep (→) or Reject (←) from the keyboard, Undo,
   filters by category and age, and "Reject all shown" or "Keep all shown". **Keep doesn't make you wait.** It just
   marks the question. Newer questions that were already checked are approved instantly at no cost.
3. **Phase 2:** an AI "bar test" scores every waiting question for how familiar and fun it is to a typical
   American adult. It costs about $1 one time. You can then reject the bottom of the pile in one action and review
   the best first.
4. **Phase 3:** repeat-checking moves to a background job that runs overnight on everything you marked Keep, and
   the check itself gets faster. You stop waiting entirely. Next morning, kept questions are approved, and repeats
   are removed automatically with a note saying which approved question they matched (D8); you can restore one
   from **Repeats**. Ones the checker can't settle wait under **Needs a look**. A question you reject as dull no
   longer blocks its fact for new questions (D5).
5. **Phases 3a–3d (added 2026-11-15, after your code review): fixes before anything new.** They cost nothing to run.
   - **3a:** one bad question can no longer stop the overnight job every night. Keeps on questions you later
     deleted or approved elsewhere are cleared, so an idle night really is idle.
   - **3b:** a confirmed repeat is never thrown away because a different comparison failed. Approvals stop reading a
     list they never use.
   - **3c:** Undo in **Needs a look** puts the question back in Needs a look, with its note. An unclear reject
     reason is refused instead of being treated as "dull".
   - **3d:** answers like "1,000,000" or "Crosby, Stills, Nash & Young" stop counting as lists. Then the database
     changes go live (with your OK), and you decide when to merge PR #19.
6. **Phase 4 (amended 2026-11-15): a new daily writer, ChatGPT, for both games.** Your ChatGPT Pro plan writes
   about **10 good questions a day for Speed Trivia and 10 for Live Trivia**. Writing them costs nothing extra.
   - **4a: variety.** Every category gets a map of well-known areas and eras. For Music: rock, pop, hip-hop,
     country, R&B, metal, grunge, disco, EDM, Latin, one-hit wonders… from the 1950s to the 2020s. The writer is
     always sent to the emptiest parts of the map, and no single person, band, team or event may have more than 5
     questions. You review the map once, and you can add areas any time on a **Variety** page. Also new:
     **Current Events**, a category players can pick in both games. It covers the past 12 months; each question
     carries its month and year and retires after a year. It stays hidden until it has enough questions.
   - **4b:** the ChatGPT writer for Speed Trivia. Its questions pass the bar test and the repeat check and show up
     in Quick Review, ready to Keep.
   - **4c:** the same for Live Trivia. One **Publish** button adds the kept ones to the Live Trivia files, and from
     there into the game.
   - **4d:** one trial run of each for you to rate before it runs daily.
7. **Phase 5:** watch seven days and compare yield, your keep rate and cost, for both games.

**What the bar-test score is for (Andrew asked 2026-11-15).** You never score anything. The score is the AI's
guess at how familiar and fun a question is to a typical American at a bar trivia night. It has two jobs. **Today**
it sorts the backlog: you reject the bottom in bulk, keep the top in bulk and only look closely at the middle,
instead of reading 7,333 questions one by one. **Later (Phase 4)** the same scorer grades every new question
ChatGPT writes, and anything that scores low is thrown out before you see it. It doesn't decide what gets
written. The variety map and the writing rules decide that. The score only screens the results.

**Your time, estimated:** about 2–3 seconds per question in Quick Review. Once the bar test removes the worst
and you bulk-keep the best, you're likely looking at a few hours in total, not weeks. That's an estimate until Phase
2 shows how the scores spread.

## 2. Findings the plan relies on (verified 2026-11-15)

- Speed Trivia bank (`trivia_questions`, `question_pool='anytime_blitz'`): **4,320 active / 7,454 pending /
  2,644 deleted**. Pending by category: Animals 972, General Knowledge 627, Geography 943, History 911, Music 923,
  Pop Culture 994, Science 898, Sports 1,065, Literary Landscapes 121. Andrew said "about 7,478"; the small gap is
  overnight change.
- Pending with `speed_generation_metadata IS NULL` (older, never repeat-checked): **6,981**, created 2026-06 (243),
  07 (1,584), 08 (2,159), 09 (2,163), 10 (832). Pending with metadata (newer writer, already admitted by the
  full-bank checker): **473**.
- Newer-writer outcomes so far: **27 approved, 40 deleted, 473 pending**. Andrew has approved about 40% of the ones
  he's decided on. Andrew's four examples are all `deleted`, created 2026-11-13/14, subtopics "everyday materials",
  "literary movements", "poetry" and "archaeology".
- Nightly (`.github/workflows/trivia-nightly.yml`, 02:15 UTC, `--total 100 --batch-size 10`): the last five runs
  took 10m28s–11m03s. That's the 600 s elapsed budget in `createBudget()` (`lib/speed-trivia-uniqueness/runtime.cjs`).
  Yield was 12–19 questions per day from 2026-11-01 to 11-13. Model `gemini-2.5-flash`, temperature 0.8, no thinking.
- Generator categories come from **database inventory** (`planTopics()` over the corpus), not from the 8 player
  categories in `lib/triviaCategories.ts`. That's how Literary Landscapes keeps getting generated.
- Players: `getTriviaQuestions()` in `lib/trivia.ts` filters by category only when one is chosen. "All Categories"
  therefore includes the 99 active Literary Landscapes rows.
- Approval: `POST /api/admin/trivia/questions` with `action:'approve'` → `approveSpeedTrivia()` →
  `session.write(...,{approvedOnly:true})`. Each pair is one isolated Gemini call (`runtime.cjs` throws
  `semantic-comparisons-must-be-isolated`). Calls run sequentially and stop at the first non-unique. Retrieval keeps
  up to 128 competitors (`LIMITS` in `core.cjs`). The pair cache (`speed_trivia_pair_cache`) only helps on repeats.
  The click cap is $0.50 and 4 minutes, and each click is limited to 200 IDs.
- Reject = plain `status='deleted'` update in the same route (free). Deleted rows stay in the generator's full-bank
  corpus and in `speed_trivia_memory`. **A rejected fact is reserved forever**, so new questions can never test it
  again (see D5).
- The Question Review category filter is client-side, over the 200 rows loaded
  (`components/admin/sections/TriviaPendingReviewSection.tsx`). There's no server-side filter, sort or score.
- Player answer history: `trivia_answers` has **3,831 rows** (`question_id`, `is_correct`). That's too thin to
  grade the backlog, but useful later to calibrate real difficulty (Phase 5).
- Cost reference: Andrew declined a **$225** whole-backlog repeat audit on 2026-10-14 (~7,083 questions ≈
  **$0.032/question** at today's checker). *Phase 3 measured far less (2026-11-15): $0.00048 per pair, ~$0.0024 per
  older question against approved questions, ~$0.013 for a unique one.* Gemini rates in code (`RATES`, `gemini.cjs`): flash $0.30 in / $2.50
  out, flash-lite $0.10 / $0.40 per million tokens. Verify current Google prices in Phase 2 before quoting a bill.

## 3. Phases, model and effort

| Phase | Work | Model / effort | Why |
| --- | --- | --- | --- |
| 0 | Stop Literary Landscapes, bulk-retire it, pause nightly | **Opus 5.5 / medium** | Production data change (top tier), but a single mechanical status update with an undo log, so medium effort is enough. |
| 1 | Quick Review screen, server-side filters, bulk by filter, free approval for already-checked rows | **Opus 5.5 / high** | New SECURITY DEFINER approval path + migration touching the signed-admission boundary. |
| 2 | Shared "bar test" scorer; score the backlog; calibrate against Andrew's decisions | **Opus 5.5 / high** | Shared engine reused by generation; paid API; threshold calibration is judgment-heavy. |
| 3 | Overnight Keep queue + faster repeat checker | **Opus 5.5 / high** | Changes the uniqueness engine; must re-pass frozen evaluation gates; new workflow + budget. |
| 3a | Remedial: per-row errors never stop the overnight job; prune stale queued Keeps (review #1, #3) | **Opus 5.5 / high** | New SECURITY DEFINER RPC that writes marks and approvals, inside the paid nightly loop. |
| 3b | Remedial: a confirmed repeat beats a failed pair; released rows by revision; lazy released read (review #2, #4, #5) | **Opus 5.5 / high** | Shared uniqueness engine and the D5 admission boundary; one wrong line admits a repeat. |
| 3c | Remedial: Undo restores Needs a look; strict reject reason; arrow function (review #7, #9, #10) | **Opus 5.5 / high** | Replaces the SECURITY DEFINER undo (status restore + D5 release window) and adds a trigger on marks. |
| 3d | Remedial: list check fix + free re-score, shared helpers, apply 3a–3c migrations, verify, commit (review #6, #8) | **Sonnet 5.5 / medium** | Departure from top tier: a regex fix, a free rewrite of ≤ 24 score rows through the existing RPC with an undo log, and two mechanical refactors. The migrations it applies were written and tested in 3a–3c, and the push needs Andrew's OK. |
| 4a | Variety map, tags + one-time tagging, star cap, Variety page, Current Events category (Speed), expiry | **Opus 5.5 / high** | Migrations, a ~15k-row data load, a new player-facing category, and the slot logic that decides variety. |
| 4b | ChatGPT writer in a private repo, writer endpoints, Speed Trivia gates and admission | **Opus 5.5 / high** | New auth boundary (writer token, ChatGPT login secret), shared engine, prompt design decides quality. |
| 4c | Live Trivia path: Live bar test, Live repeat check, Quick Review Live mode, Publish to the canonical JSON, Current Events round | **Opus 5.5 / high** | Crosses the Live Trivia source-of-truth boundary (append-only, D10); a new checker; GitHub write path. |
| 4d | Trial run of each game, Andrew rates, tune thresholds, turn on daily | **Opus 5.5 / medium** | Mostly running and reporting, but threshold choices are judgment calls on a paid gate. |
| 5 | Seven-day monitoring and report (both games) | **Sonnet 5.5 / medium** | Read-only measurement against stated baselines. |

**Which AI model runs the work (Andrew asked 2026-11-15 whether to switch off Gemini).** The table above names the
coding agent. The model *inside* the pipeline is a separate choice for each job:

| Job | Now | Recommendation | Why |
| --- | --- | --- | --- |
| Bar test (Phase 2) | Gemini 2.5 Flash, ~$1 one time | Keep | Already calibrated against Andrew's decisions and run. Switching means re-running calibration. |
| Repeat check (Phase 3) | Gemini 2.5 Flash | Keep | Frozen evaluation gates (`evaluation-v1.json`, `evaluation-fresh-v1.json`) are passed on this model; a switch must re-pass them. It's also the high-volume job (one call per pair, $0.00048 each, measured 2026-11-15). |
| Question writer, Speed + Live (Phase 4) | Gemini 2.5 Flash | **ChatGPT through OpenAI's Codex CLI (`codex exec`), signed in with Andrew's ChatGPT Pro plan** (D9, Andrew 2026-11-15). Use the strongest model Codex offers on that plan when Phase 4a is built, and record its exact name in the handoff (don't assume a version). Web search is on only for Current Events slots. It also does the one-time tagging (free); Gemini is the fallback, capped at ≤ $2.50. On a day ChatGPT misses, Gemini 2.5 Flash writes that day's slots (D13). | Andrew's Pro plan is mostly unused, so writing costs nothing extra. The writer decides question quality, so it gets the strongest model. Gemini stays as the independent grader (bar test and repeat checks), so no model marks its own homework. |
| Live repeat check (Phase 4b) | none (exact text and slug match only) | Gemini 2.5 Flash, one call per candidate against ≤ 12 likely matches | New and not frozen. It's cheap because the Live bank is ~3,800 questions, read from the repo for free. |

The Gemini-vs-Claude writer bake-off (planned before 2026-11-15) is dropped, and no Claude key is needed.

Order: 0 → 1 → 2 → 3 → **3a → 3b → 3c → 3d** → 4a → 4b → 4c → 4d → 5. The remedial phases come first (Andrew,
2026-11-15). Run them one after another because 3d edits files 3a and 3b change. 4b needs 4a's map and tags. 4c needs
4b's writer and candidate table. 4d needs all three.

**Commits (Andrew, 2026-11-15):** each remedial phase commits to PR #19 when it finishes, as Phases 0–3 did. Phases
4a–5 are **not committed** until Andrew has code-reviewed them after Phase 5. Do them on a new branch from PR #19's
head and list every uncommitted file in each handoff. Never use `git checkout -- <file>`, `git stash` or `git reset` on
that work; one slip loses whole phases.

**Why keep Gemini at all (Andrew asked 2026-11-15 whether to switch everything to ChatGPT).** Use both, each for
what it's good at. ChatGPT does the writing and the one-time tagging, which are the creative, quality-deciding jobs,
and they're free on the Pro plan. Gemini keeps the checking (bar test and repeat checks, ~$8/month) for four
reasons:
1. A ChatGPT plan has no API, so it can't be called from the live site (admin edits and approvals re-run the
   repeat check there) or from the public nightly. It can only run inside the private repo.
2. The repeat checker's frozen evaluation gates were passed on Gemini. Switching means re-passing them, and moving
   database keys into the private repo.
3. If the ChatGPT login lapses, Gemini writes that day's questions (D13), and approvals and edits keep working.
4. A different model grading the writer's work catches more than self-grading.

Moving the repeat check to ChatGPT later would save at most ~$7/month, which isn't worth those costs. Each phase ends with `speed-trivia-backlog-and-quality-plan_PHASE_<N>_HANDOFF.md`
and updates the status line above.

## 4. Phase detail

### Phase 0 — stop the bleeding (free)

1. Generator uses only the 8 player categories from `lib/triviaCategories.ts` (`dbValue`). Remove
   `'Literary Landscapes'` from `TOPICS` in `generation.cjs`. `planTopics()` must ignore inventory categories that
   aren't on that list. Add a contract test: the generator's category set equals `TRIVIA_CATEGORIES` dbValues.
2. One script `scripts/retire-speed-trivia-category.cjs --category "Literary Landscapes" --status pending_review
   [--apply]`. Dry run by default. It writes a before-state JSON undo log at
   `docs/speed-trivia-backlog-and-quality-plan_PHASE_0_RETIRE_LOG_<date>.json`, then sets `status='deleted'` the
   same way the review route does. It also covers the 99 active rows if D1 says so. Read the counts back.
3. Pause nightly per D2: `gh workflow disable trivia-nightly.yml` (Andrew's go-ahead required; re-enable in Phase 4).
4. Tests: `npm run test`, `npx tsc --noEmit`, `npm run lint`. Deploy needed only for the generator file, and only
   once nightly resumes.

Cost: $0. About 120–220 row updates, once.

### Phase 1 — Quick Review

**Screen** (admin → Trivia Questions → Question Review, a "Quick Review" toggle beside the existing table). Keep the
copy minimal:

- One card: question, four options with the correct one marked, category, and (after Phase 2) score.
- Keys: **→ Keep**, **← Reject**, **E** edit, **S** skip, **Z** undo last. Buttons for touch. A count of how many are
  left.
- Filters (server-side): category, source (Older / Recent), and score band once Phase 2 lands. Sort: best score
  first, then oldest.
- "Reject all shown (N)" and "Keep all shown (N)" with a count confirmation. These act on the whole filter
  server-side, in chunks, not just the loaded page.

**Server:**

1. `GET` gains `category`, `source`, `scoreMin/Max`, `sort` query params. One bounded page per request (50–100
   rows); no polling.
2. New table `speed_trivia_review_marks(row_id uuid pk references trivia_questions(id) on delete cascade, decision
   text check (decision in ('keep','reject')), reason text, decided_at timestamptz, audience jsonb)` with a
   `service_role` grant and RLS (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`). Phase 2 scores and Phase 3's
   queue live here. There's no new column on `trivia_questions`.
3. **Reject** = the existing free `status='deleted'` update, plus a mark row (reason per D5). Undo restores
   `pending_review` from the mark, within the session.
4. **Keep, newer rows (free fast lane):** if the row has a full-bank `speed_trivia_admissions` record whose
   `content_hash` equals the row's current content hash, approve it with no paid call. This is sound: at admission
   it was compared against every approved, pending and deleted row, and every later write (generation, edit,
   import) is full-bank-checked against it. It needs a new SECURITY DEFINER RPC (e.g.
   `approve_admitted_speed_trivia(p_row_id, p_content_hash)`) that verifies that admission record and flips the
   status, with `revoke … from public, anon, authenticated` and `grant execute … to service_role`
   (`tests/security-definer-execute-contract.test.ts`). An edited row loses the fast lane and goes to the Phase 3
   queue.
5. **Keep, older rows:** write a `keep` mark only. Until Phase 3 ships, the existing "Approve Selected" flow still
   works for anyone who wants to approve immediately.
6. Tests: fast-lane refusal when the content hash differs, the scope isn't full-bank or the record is missing;
   filter correctness; bulk-by-filter chunking; undo; Live Trivia rows untouched; the text-size floor; no "Reward"
   wording.

Cost: no paid calls. Reads are one small page per card batch (~7,500 rows ≈ 75–150 page reads in total). Writes are
one mark per decision.

### Phase 2 — the "bar test" scorer

1. New module `lib/speed-trivia-quality/audience.cjs`, shared with Phase 4. One structured Gemini call scores a
   **batch of ~40 questions** and returns, per question:
   - `familiar` 1–5: would a typical American adult, aged 21 to 75 (D7), recognise the correct answer? The
     backlog was scored on 2026-11-15 with the first draft (21 to 45, `bar-test-v1`); the scorer is `bar-test-v2`
     from Phase 3 on.
   - `fun` 1–5: would they enjoy hearing the answer, even if they got it wrong?
   - `estCorrect`: % of a bar crowd expected to answer correctly.
   - `flags`: `too-long`, `answer-in-question`, `ambiguous`, `dated`, `niche-subject`, `bad-distractors`.

   The prompt carries a short, fixed set of good examples (sampled from active rows) and bad examples (Andrew's four
   plus newer-writer rows he deleted). Question text is data, not instructions.
2. Free deterministic pre-checks run first: length > 120 characters, a two-sentence preamble ("The 'X' is…
   Which…"), a multi-item answer ("Eritrea, Djibouti, …"), and the answer appearing in the question.
3. **Calibrate before trusting it.** Use a held-out set of Andrew's real decisions: active rows = keep;
   newer-writer rows he deleted = reject. After Phase 1 is live, add his first ~150 Quick Review decisions. Report
   agreement at candidate thresholds and pick the threshold that rejects at most ~5% of questions Andrew would keep.
   Record the confusion table in the handoff.
4. Script `scripts/score-speed-trivia-backlog.cjs [--apply]` scores all pending rows once, writes `audience` into
   `speed_trivia_review_marks`, and caps spend (default $2) with the existing budget helper.
5. Quick Review then gains the score filter and sort, so "Reject all shown" with a score of 2 or below is one
   action. No automatic rejection without Andrew's click.

Cost: ~7,500 questions ≈ 190 calls, ~1.0 M input + ~0.3 M output tokens. Flash ≈ **$1.05**, flash-lite ≈
**$0.22**; pick the model by calibration agreement. One time. The ongoing per-night cost is in Phase 4.

### Phase 3 — overnight Keep queue and a faster repeat check (DONE 2026-11-15, amended with D5, D8, D17 and D4)

1. **Background, not in the click.** Workflow `.github/workflows/speed-trivia-keep-queue.yml` (03:30 UTC daily, plus
   a manual run) runs `scripts/process-speed-trivia-keep-queue.cjs --apply`. It processes `keep` marks with outcome
   `queued`, oldest first, for up to 50 minutes, inside repository variables **`SPEED_TRIVIA_QUEUE_MAX_DOLLARS`**
   (per run, $5) and **`SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS`** (all runs, $20) (D4). With either unset it only counts;
   with nothing to do it exits before loading the bank. Runs only from `main` (schedule and manual both).
   - Unique → approved (signed admission, approved-only scope, as today); mark `approved`, so Undo works.
   - Confirmed repeat of an approved question → retired automatically (D8); mark `repeat` with the match. Quick
     Review → **Repeats** shows the question, the approved one it repeats, and **Restore**.
   - Uncertain, or edited after Keep → mark `needs_look` with the checker's note, still waiting. Quick Review →
     **Needs a look** works like the main list (Keep, Reject, Edit).
   - Results are recorded only by `speed_trivia_queue_settle` (migration `20261115170333_speed_trivia_keep_queue.sql`),
     which refuses to mark a row approved unless a real signed admission for that content exists.
2. **Faster check, same admissions.** In `runtime.cjs`'s capped judge, not the frozen policy (`core.cjs`):
   same-answer competitors first; the first 2 pairs run one at a time ("probe"), then up to 6 at once; no new pair
   starts after a non-unique result, and unexamined pairs stay explicit holds. A question is admitted exactly when
   it was before. The faster path applies to approvals in the browser, edits and generation too. Option (c)
   (embeddings or batched pairs) is not built; it would have to re-pass the frozen gates.
3. **Measured 2026-11-15** (`docs/speed-trivia-backlog-and-quality-plan_PHASE_3_MEASUREMENT_2026-11-15.json`): 50 older
   waiting questions with score 5, every pair checked once ($0.70, under the $1.50 D4 cap), schedules simulated from
   the same 1,473 verdicts:

   | Checker | Seconds per question | Dollars per question | Paid pairs |
   | --- | --- | --- | --- |
   | Before (one at a time, retrieval order) | 4.35 | $0.0023 | 244 |
   | Plain 6 at once, same answer first (tried, not shipped) | 1.75 | $0.0047 | 496 |
   | **Shipped (2 probe pairs, then 6)** | **1.66** | **$0.0024** | 247 |

   Admission agreed on all 50. **42 of the 50 were repeats** of an approved question, 7 unique, 1 uncertain. A pair
   costs $0.00048; a unique question needs ~28 pairs (~$0.013), a repeat usually 1. The old $0.032/question figure
   was far too high.
4. **D5, built:** a Quick Review reject for quality (`←`, "Reject all shown") releases the fact. Full-bank checks
   (edits, generation) skip released rows (`speed_trivia_released_rows`, `releasedRows:'read'`). W (wrong answer),
   repeats and every deletion from before Quick Review stay blocked. Safety: while a row is released, new questions
   aren't compared with it, so if Undo brings it back, `speed_trivia_quick_keep` denies the free fast lane to it and
   to every question admitted while it was released (`speed_trivia_released_restores`); those go to the overnight
   check instead.
5. The same speed-up applies to generation, so the nightly should stop timing out (Phase 4 confirms).
6. **D17 pre-check, built** (`--precheck`, on in the workflow): after the Keep queue, with what's left of the run, older
   undecided waiting questions with a bar-test score ≥ 3 (6,108 on 2026-11-15; `--min-score` changes it) are checked
   against approved questions, best score first, **without approving anything**. A confirmed repeat is retired
   (`speed_trivia_precheck_settle`; mark `decision 'precheck'`, outcome `repeat`) and shown under Repeats with
   Restore. Unique and uncertain ones stay waiting, noted in `speed_trivia_review_marks.precheck` so they aren't
   checked again; a later Keep re-checks almost free from the pair cache. Restore records `restored`, so the
   pre-check never retires that wording again. Score 1–2 rows are skipped because §5 step 3 rejects them anyway.
7. **D4 dollars ledger, built:** every paid run first reserves its dollars in `speed_trivia_queue_runs`
   (`speed_trivia_queue_reserve`, never past the total), then records what it spent (`speed_trivia_queue_finish`). A
   run that dies first counts its whole reservation (conservative).
8. **Verified on production 2026-11-15:** a 10-question pre-check (score 5, `--max-dollars 0.25`): 8 repeats retired
   (each checked by hand: Queen of Pop, Cleopatra, Für Elise, Pearl Harbor, Shape of You, Amazon, TikTok, Berlin
   Wall), 2 unique; $0.042 spent and recorded; 41 s including the bank load.

Cost (measured): ~$0.0024 per kept older question at the measured mix (84% repeats), up to ~$0.013 for a unique one.
Keeping every older question with score 4–5 (~4,700) ≈ **$11**; all 6,981 older ≈ $17 at the measured mix. The
pre-check over the 6,108 with score ≥ 3 is ≈ $15 at that mix, more if lower scores repeat less often; the $20 total
stops it either way, and best-first order spends it on the likeliest keeps first. Kept questions it already checked
then cost almost nothing. At 1.66 s per question
a 50-minute run checks ~1,800, so the backlog clears in 2–4 nights. Supabase: one bank load (~11.65 MB) per run
with work to do, plus bounded deltas; an idle night is one count query and ~1 minute of free public-repo Actions
time.

### Remedial phases 3a–3d (added 2026-11-15, from Andrew's code review of Phases 0–3)

Andrew ran `/code-review` on PR #19 (Phases 0–3) on 2026-11-15. It reported 10 findings. Each one is restated below
as "review #N" so the agent fixing it doesn't need the review output.

**Shared ground rules for 3a–3d:**
- `core.cjs` (the frozen policy) is not touched.
- Applied migrations are read-only history, so every SQL change is a new migration from `supabase migration new …`.
- Every new function revokes `public, anon, authenticated` and grants `execute` to `service_role`.
- The migrations are applied **once, in 3d**, with Andrew's OK. Nothing is deployed until PR #19 merges, so
  code that calls an unapplied RPC is safe until then.
- No paid calls, so none of these phases spends from the D4 budget.
- Tests run on PGlite and fake judges (`scripts/test-speed-trivia-admission-sql.cjs` harness), never on production.

#### Phase 3a — one bad question never stops the overnight job (review #1, #3)

**Problems:**
- **Review #1.** Any error on a single row ends the whole run.
  - `processQueue`'s outer catch sets `stopped='settle_failed'` and breaks. `precheckPass` breaks on any unknown
    code.
  - The order is fixed (oldest Keep first, best score first), so the same row stops every later night, and the
    pre-check never runs (`!queue?.stopped`).
  - The reviewer's case: a queued Keep is edited, then approved through the old Question Review. The row is
    `active` with new content, so `speed_trivia_queue_settle('approved')` raises `invalid-quick-review-request`.
  - Any code-less `Error` from `core.content()` (`malformed-question`, `malformed-answer`, …) does the same.
- **Review #3.** A queued Keep whose row was later deleted, or left Speed, is skipped without being settled, so it
  stays `queued` forever.
  - `countQueued` counts it, so the "nothing to do" exit never fires.
  - Each night then reserves dollars and loads the ~11.65 MB bank just to skip it.
  - Stale marks also use up `--limit` slots. Quick Review's counts filter on `pending_review`, so they show 0 while
    the job keeps running.

**Fix:**
1. **Migration** `supabase migration new speed_trivia_queue_repairs`. Create
   `speed_trivia_queue_prepare(p_apply boolean) returns jsonb` → `{queued, stale, settled}`:
   - Takes the `speed_trivia_control` row lock first (same lock order as the other RPCs).
   - **Stale** = a mark with `decision='keep'`, `outcome='queued'` whose row is missing, isn't
     `anytime_blitz`/`multiple_choice`, is `deleted`, or is `active` without the admission `settle('approved')`
     requires. That admission has `content_hash` = the mark's, `evidence->>'decision'='unique'` and the row's current
     `speed_content_hash` = the mark's.
   - **Settled** = queued marks on `active` rows that *do* have that admission (approved elsewhere with the same
     content). With `p_apply`, record them `approved` (the same field writes as `speed_trivia_queue_settle`).
   - With `p_apply`, a stale mark is **cleared**, using the same field reset as `speed_trivia_quick_undo` (decision,
     outcome, reason, content_hash, decided_revision, decided_at, matched_row_id, note, checked_at → null). The
     mark is deleted when `audience` and `precheck` are both null. It never changes `trivia_questions`.
   - **Queued** = what is left that is still a waiting Speed question.
   - Without `p_apply` it only counts, so the free count mode stays read-only.
   - Add a partial index `speed_trivia_review_marks (decided_at, row_id) where decision='keep' and outcome='queued'`.
     It matches `readQueued`'s order.
2. **Script** `scripts/process-speed-trivia-keep-queue.cjs`:
   - `countQueued` is replaced by `prepare(client, apply)`. Count mode calls `false`; `--apply` calls `true` before
     the nothing-to-do check. That check uses `queued` after pruning.
   - **One shared error classifier** for `processQueue` and `precheckPass`. It returns one of three classes:
     - **stop:** `budget_exhausted`, `cancelled`, `budget_configuration`. These end the run, as today; `budget` isn't an
       error exit.
     - **row:** a problem with this row that will happen again on every run:
       - `core.content(row)` throws. Call it in its own `try` before checking, so its plain `Error` is recognised.
       - `invalid_pool`, `retired`, or `approved-only-requires-unchanged-pending-approval`.
       - a settle RPC refusing with `invalid-quick-review-request`.
     - **transient:** everything else, including `verification_unavailable`, `stale_revision` and provider errors.
   - **Keep queue:**
     - row → `settle(…,'needs_look', null, "Couldn't check (<code>). Keep it again or reject it.")`. If that settle
       also fails, record the error and move on.
     - transient → leave the mark `queued`, record the error, move on. The row is retried first next night, and the
       pair cache makes the retry nearly free.
   - **Pre-check:**
     - row → `precheckSettle(…,'uncertain', null, "Couldn't check (<code>).")`, so the row isn't retried.
     - transient → skip and move on; it's retried next night.
   - **Breaker:** stop with `stopped='errors'` (exit 1, as any non-budget stop) after **3 transient errors in a row or
     20 errors in the run**. That way an outage can't mark rows `needs_look` or burn the night.
   - **Report:** `errors` keeps at most 50 entries, plus counts by class (`rowErrors`, `transientErrors`).
   - `runPaid` still skips the pre-check when the queue stopped. After this change the queue stops only at the
     budget, the deadline or the breaker.
3. **Tests**:
   - In `tests/scripts.speed-trivia-keep-queue.test.ts`:
     - the reviewer's case: a queued Keep, edited, then approved elsewhere. `prepare(true)` clears it, and the
       next mark is processed.
     - a malformed row at the head → `needs_look`, and the rest are processed.
     - 2 transient errors then a success → the run continues. 3 in a row → `stopped='errors'`.
     - 20 errors in total → stops.
     - a deleted-elsewhere Keep → `queued=0`, no `speed_trivia_queue_reserve` call and no bank load.
     - a pre-check row error → `uncertain` with a note, and the rest are processed.
   - In `tests/speed-trivia-keep-queue-sql.test.ts`:
     - `prepare(false)` writes nothing.
     - `prepare(true)` settles `approved` only with a matching unique admission, and clears the other stale states.
     - it never changes a `trivia_questions` row.
     - permissions, and the security-definer contract test.

Cost: $0 paid. One extra small RPC per night. An idle night goes back to 2 RPCs and an exit; today it's a bank load
plus a reservation whenever one stale mark exists.

#### Phase 3b — the repeat checker keeps a confirmed repeat; released rows by revision (review #2, #4, #5)

*DONE 2026-11-15 (`..._PHASE_3B_HANDOFF.md`). Released-view rebuild measured at ~60 ms on the 13,894-row 2026-10-14
snapshot, so the rebuild was kept (no in-place delta).*

**Problems:**
- **Review #2.** In `runtime.cjs`'s capped judge, a pair can return `duplicate` while another pair in flight
  fails (a provider 5xx, or `budget_exhausted` with 6 reservations open near the cap).
  - `if(failure)throw failure` runs before the results are returned and before the pair cache is written.
  - So the confirmed repeat becomes "Unverified comparison" → `verification_unavailable`. The queue run stops with
    an error instead of retiring a repeat, and admin edits show "checks unavailable" instead of the duplicate.
  - Up to 5 paid verdicts are never saved and are paid for again next run.
- **Review #4.** The released set (D5) is read once when a session starts, as bare ids. `releasedIndex` skips any of
  those rows whose `status==='deleted'`.
  - A long session (generation) can see this happen: row R is released, then Undo brings it back, then it's rejected
    as **wrong**, all while the session runs.
  - R is still deleted and still in the stale set, so new questions skip it. But a `wrong` reject must keep blocking
    its fact.
  - No `speed_trivia_released_restores` window covers the revisions after the second reject, so those admissions
    keep the free fast lane.
- **Review #5.** Every session opened with `releasedRows:'read'` calls `speed_trivia_released_rows` before any
  write, approvals included.
  - `approvedOnly` approvals never use the set; they compare against `approvedIndex`. So a 200-row approval in
    Question Review means 200 wasted RPCs, each returning every quality-rejected id, which will be thousands once
    the backlog is triaged.
  - Each new set also rebuilds the released view over the whole index.
  - Missing the function (code deployed before its migration) fails every Speed write with
    `verification_unavailable`.

**Fix:**
1. **Capped judge** (`lib/speed-trivia-uniqueness/runtime.cjs`, `cappedJudge.adjudicate`), after every worker
   settles:
   - **Persist first.** Write the new signed verdicts (`toPersist` keys now in `cache`) to `speed_trivia_cache_pairs`
     before deciding what to return or throw. If that write fails while a failure is already pending, throw the
     original failure.
   - **A duplicate wins.** If any verdict is `decision==='duplicate'`, return the results even when another pair
     failed. Failed and unstarted pairs become the existing explicit "Not examined…" holds. `checkCandidate` then
     returns `duplicate`, and `requireUnique` throws `duplicate`, so the queue settles `repeat`.
   - Without a duplicate, behaviour is unchanged: the failure is thrown.
   - **Admission is unchanged.** "Unique" still needs every pair unique and sound. Only a result that already
     couldn't admit changes, from "unverified" to "duplicate". `requireUnique` still checks the deadline first.
2. **Released rows by revision** (review #4):
   - New migration `supabase migration new speed_trivia_released_rows_revision`. Add `speed_trivia_released_rows_v2()`
     → `[{id, revision}]`, where `revision` = `m.decided_revision`, with the same `where` as today's function, which
     already requires `q.speed_revision = m.decided_revision`.
   - Keep the old function for now; note in the migration that it is dropped once nothing calls it.
   - `approval.releasedIndex(index, released)` takes a `Map<id, revision>`. It skips a row only when
     `row.status==='deleted' && released.get(row.id) === Number(row.speed_revision)`.
   - Corpus rows are `to_jsonb(trivia_questions)`, so they carry `speed_revision`. Check its type (bigint → JSON
     number), and check that `speed_trivia_memory` rows never match.
   - A re-retired row then has a new revision and is compared again. A stale set can only miss rows released later,
     and missing one only means comparing against more questions, which is safe.
   - Update `approval.d.cts`, `runtime.d.cts` and `types/speedTriviaAdmission.ts`.
3. **Lazy, cheap, fail-safe** (review #5):
   - `createSession({releasedRows:'read'})` no longer reads at start. `write()` reads the set the first time it runs a
     **full-bank** check (`!approvedOnly`), once per session. `checkApproved` and `approvedOnly` writes never read it.
   - **Read failure → skip nothing.** Compare against the whole bank, which is the conservative D5 default. Write
     one `console.warn` and continue; never fail the write. This also removes the deploy-order hazard.
   - **View rebuild:** first measure `approval.build` on a production-size index (~15k rows; use the offline harness
     `scripts/measure-speed-trivia-admission-offline.cjs`).
     - If it's under ~100 ms, keep the rebuild and record the number in the handoff.
     - Otherwise, update the one released view in place: apply only the difference between the old and new set
       through `applyDelta`, as `refreshApprovedIndex` does.
4. **Tests**:
   - In `tests/scripts.speed-trivia-admission.test.ts` and the runtime tests:
     - a duplicate in the probe, or in the pool, alongside a concurrent 5xx → `AdmissionError('duplicate')`, and
       `speed_trivia_cache_pairs` gets the paid verdicts.
     - a duplicate alongside a concurrent `budget_exhausted` → `duplicate`.
     - a failure without a duplicate → unchanged.
     - the cache is written before the throw.
     - the reviewer's #4 case: a stale set `{R@r1}`, then R restored and re-rejected `wrong` at r3 → R is compared.
     - an `approvedOnly` write makes **zero** `speed_trivia_released_rows*` calls; a full-bank write makes one per
       session.
     - the RPC missing → a full-bank comparison, and the write succeeds.
   - Re-run the frozen gates unchanged: `npx vitest run tests/speed-trivia-uniqueness-evaluation.test.ts
     tests/speed-trivia-uniqueness-release.test.ts`.

Cost: $0 paid, and it saves money. Repeats found next to a failure are no longer re-paid, and bulk approvals make
one fewer RPC per row.

#### Phase 3c — Quick Review: Undo returns a question to where it was (review #7, #9, #10)

*DONE 2026-11-15 (`..._PHASE_3C_HANDOFF.md`). One addition to the trigger below: it also clears `prior` when the
overnight job settles the queued Keep (approved or repeat), so Restore from Repeats still goes to Waiting.*

**Problems:**
- **Review #7.** In **Needs a look**, Keep (or Reject) and then **Z** goes wrong:
  - `speed_trivia_quick_keep` / `_reject` overwrite the mark, which loses the needs-look note.
  - `speed_trivia_quick_undo` then clears the mark, so the row is really back in **Waiting**.
  - The client still re-inserts it at the top of Needs a look with the old note. After a reload it's gone from
    that view, and the overnight explanation has been erased.
- **Review #9.** `app/api/admin/trivia/quick-review/route.ts` turns any reason other than exactly `'wrong'` into
  `'quality'`, and a quality reject releases the fact (D5). So `'Wrong'`, `'wrong_answer'` or a missing reason
  silently unblocks a fact Andrew meant to keep blocked.
- **Review #10.** `components/admin/sections/SpeedTriviaQuickReview.tsx` uses `export function`, but CLAUDE.md says
  arrow functions.

**Fix:**
1. **Migration** `supabase migration new speed_trivia_undo_needs_look`:
   - Add `speed_trivia_review_marks.prior jsonb`: null, or `{content_hash, decided_revision, decided_at, note,
     checked_at, matched_row_id}` of a needs-look Keep.
   - Add a `BEFORE UPDATE` trigger on `speed_trivia_review_marks`. It also fires on the `on conflict do update` path
     that `quick_keep` and `quick_reject` use.
     - When the old row is `decision='keep', outcome='needs_look'` and the new one isn't `needs_look`, set
       `new.prior` from the old fields.
     - When the new row has `decision is null` or `outcome='needs_look'`, set `new.prior := null`.
     - A trigger is used so `speed_trivia_quick_keep` (the fast lane and the D5 release-window checks) is **not
       rewritten**.
     - Revoke `execute` on the trigger function from `public`.
   - `create or replace speed_trivia_quick_undo`:
     - Keep today's body exactly, including the status restore, the drift checks and the
       `speed_trivia_released_restores` insert.
     - Then, if `m.prior` is not null, write the mark back to `decision='keep', outcome='needs_look'` with the prior
       fields, keeping `audience` and `precheck`.
     - Return `{id, status, view}`. `view` is `'needs_look'` when the prior state was restored, otherwise `'waiting'`.
2. **Client**: `undo` re-inserts the item only when the server's `view` equals the current Show view. Otherwise it
   removes the item from the list and adjusts `counts`. Add `view` to `types/speedTriviaQuickReview.ts` and the
   `quickUndo` result in `lib/speedTriviaQuickReview.ts`.
3. **Route**: `action:'reject'` requires `reason` to be exactly `'quality'` or `'wrong'`; anything else gets 400
   "Invalid request.".
   - The component already always sends one.
   - Bulk reject stays `'quality'` by design: "Reject all shown" is for dull or obscure questions.
4. **Style**: `export const SpeedTriviaQuickReview = () => { … }`.
   - Leave route handlers as `export async function POST`, the repo's convention for route files (186 of 190).
   - Leave the pre-existing `TriviaPendingReviewSection.tsx` alone.
5. **Tests**:
   - SQL:
     - Keep, and Reject, from Needs a look, then Undo → the row is `pending_review` and the mark is `needs_look`
       with its note.
     - Undo from Waiting is unchanged.
     - Settle, precheck and quick writes leave `prior` null.
     - The D5 window is still recorded on undoing a quality reject.
   - API: no reason, `'Wrong'` or `'wrong_answer'` → 400.
   - Component:
     - Undo in Needs a look puts the item back with its note.
     - When the server returns `view:'waiting'`, the item leaves Needs a look.
   - The text-floor and no-"Reward" contract tests still pass.

Cost: $0.

#### Phase 3d — list check, shared helpers, apply, verify, commit (review #6, #8)

**Problems:**
- **Review #6.** `preChecks` in `lib/speed-trivia-quality/audience.cjs` flags `multi-answer` on any answer with 2 or
  more commas, and `compositeScore` caps the score at 2. So `1,000,000`, `$1,000,000,000` and "Crosby, Stills, Nash
  & Young" sink, and drop out of the D17 pre-check (score ≥ 3).
  - **Production, read 2026-11-15:** 24 stored scores carry the flag, all on waiting rows.
  - Most are real lists ("Foil, Epee, Sabre", the Horn of Africa countries).
  - Some are single answers with commas: "Citius, Altius, Fortius", "On your marks, Get set, Go!", the event-horizon
    and leitmotif definitions.
  - The Phase 4 writer will use this same check as a gate, so it matters more later.
- **Review #8.**
  - `priorityOf` in the queue script copies `runtime.cjs`'s private `sameAnswer`, so `--measure` simulations can
    quietly drift from the real schedule.
  - `clientFromEnv` is copied in `process-speed-trivia-keep-queue.cjs`, `score-speed-trivia-backlog.cjs` and
    `retire-speed-trivia-category.cjs`.

**Fix:**
1. **List check:**
   - Ignore digit-group commas (`/(\d),(?=\d{3}\b)/g`).
   - Flag `multi-answer` only when the answer still has ≥ 2 commas **and** the question asks for several things:
     - a count word or digit from two to ten (`which four countries`, `three main types`);
     - `(which|what) (group|set|list) of`;
     - or `lists`.
   - Keep the existing `which three|four|five` rule.
   - Fixture tests:
     - the reviewer's three cases → not flagged;
     - the 24 production rows → record which ones change.
   - `answer-in-question` is both a model flag and a check flag, so **re-derive only `multi-answer`**.
   - Bump `AUDIENCE_VERSION` to `bar-test-v2.1`, per §7. No SQL filters on the version (checked 2026-11-15).
   - Re-run calibration for free from the stored `PHASE_2_CALIBRATION_bar-test-v2_…` file, and record agreement
     before and after.
2. **Free re-score:** `scripts/rescore-speed-trivia-checks.cjs [--apply]`.
   - Read the marks whose `audience.flags` contain `multi-answer` (one bounded query, ~24 rows).
   - Recompute that flag and `compositeScore` from the stored `familiar`, `fun`, `estCorrect` and other flags. No
     provider call.
   - Write the changed rows through `speed_trivia_review_set_audience`, which accepts only waiting rows whose
     content still matches. Bump the version on the rewritten rows.
   - Write a before-state undo log first: `docs/speed-trivia-backlog-and-quality-plan_PHASE_3D_RESCORE_LOG_<date>.json`.
3. **Helpers:**
   - Export `sameAnswer` from `runtime.cjs`. `priorityOf` becomes `runtime.sameAnswer`.
   - Add `scripts/lib/speedTriviaServiceClient.cjs` exporting `clientFromEnv()`, next to the existing
     `scripts/lib/category-blitz-letters.cjs`. The three scripts import it.
   - Check that `.github/workflows/speed-trivia-keep-queue.yml` needs no path change.
4. **Apply:** get Andrew's OK, then run `supabase db push --linked` once for the three remedial migrations (3a, 3b,
   3c). Then verify on production, all free:
   - `speed_trivia_queue_prepare(false)` returns counts;
   - `speed_trivia_released_rows_v2()` returns `[]` or the expected list;
   - `node --env-file=.env.local scripts/process-speed-trivia-keep-queue.cjs` (count mode) prints `queued`;
   - `speed_trivia_quick_undo` has the new signature behaviour (`view` in the result);
   - run step 2 with `--apply`.
5. **Checks:**
   - `npm run test`;
   - `npx tsc --noEmit 2>&1 | grep -v '^\.next/'`;
   - `npx eslint` on the changed files;
   - the frozen gates from 3b.
6. **Commit and push** to PR #19, then **ask Andrew whether to merge PR #19 now**. Recommended: yes. The review's
   blockers are fixed, and merging puts Quick Review live and starts the nightly job, which needs about 3–4 nights.
   It still needs the two repository variables (Phase 3 handoff §7).

Cost: $0 paid. About 24 small row writes, once.

### Phase 4 — a daily ChatGPT writer for Speed and Live Trivia (amended 2026-11-15, twice)

**What Andrew asked for (2026-11-15):**
- ChatGPT writes **~10 high-quality questions a day for each game**, using his mostly idle Pro plan.
- The questions suit an American bar trivia crowd: a real chance they know the answer, or at least the topic.
- **One new category, "Current Events"**, in both games (D11, revised).
- **Variety inside every category.** Not every music question about Michael Jackson, Beyoncé and Taylor Swift. Every
  era of modern music across all well-known genres. Not every history question about the Civil War or World War II.
  The same goes for every subject.
- "1980s pop culture" and "2010s Rock Anthems" aren't new categories. They're the kind of areas the variety system
  must reach on its own.

**Is it possible? Yes, with one constraint.**
- A ChatGPT plan includes no API credits. It can still run OpenAI's **Codex CLI** non-interactively (`codex exec`)
  while signed in as Andrew. OpenAI documents this for CI as an advanced path:
  <https://learn.chatgpt.com/docs/auth/ci-cd-auth>.
- OpenAI says not to use it in **public** repositories, and `AndrewSerulneck/Trivia-Predictions` is public (checked
  2026-11-15). So the writer runs in a **small private repo** (D9).
- That repo holds only the ChatGPT login and one narrow write token. It never holds database keys, the Gemini key or
  the signing secret.
- It may need re-signing-in now and then. OpenAI doesn't guarantee a session lasts forever.

**How it fits together:**

```
private repo (daily, ~00:30 UTC)                 production (this repo)
  GET  /api/question-writer/brief   ───────────►  today's slots (category · area · era), subjects to avoid,
                                                   examples, rules
  codex exec --output-schema …      (ChatGPT; web search only for Current Events slots)
  POST /api/question-writer/candidates ────────►  question_candidates (status 'received') — nothing else
                                                   │
trivia-nightly.yml (public repo, 02:15 UTC, re-enabled)
  Speed: hard limits → star cap → bar test → full-bank repeat check + signed admission → pending_review
  Live:  hard limits → star cap → Live bar test → Live repeat check → question_candidates pending_review
                                                   │
Admin → Quick Review (Speed / Live)   Keep / Reject (Speed Keep = free fast lane, Phase 1)
Live: "Publish (N)" → PR appending to data/live-trivia/categories/*.json → auto-merge → Sync Live Trivia imports it
```

#### How variety is forced (the variety map)

Every category in both games gets a **map**. A map is a list of **areas** (well-known sub-areas), each with the
**eras** it applies to. One area × one era is a **cell**, e.g. Music · Hip-hop · 1990s. Each day's slots go to the
**least-covered cells**, so the writer is told exactly where to write, not just "Music". A **star cap** then stops
any one person, band, team, work or event from crowding out the rest.

1. **Draft map (Phase 4a writes the full draft; Andrew reviews it once, D14).** It lists only mainstream areas that
   a typical American has heard of:
   - **Music** (1950s–2020s): rock and classic rock, pop, hip-hop/rap, country, R&B/soul/Motown, metal and hard rock,
     punk/grunge/alternative, disco and funk, dance/EDM, Latin, jazz and blues standards, Broadway and movie
     soundtracks, one-hit wonders, MTV and music videos, awards and halftime shows.
   - **History** (Ancient, Medieval, 1500–1799, 1800s, 1900–1945, 1945–1999, 2000–present): presidents and
     government, every American war (not just two), world wars and empires, civil rights and social movements,
     inventions and business, exploration and space, famous documents and speeches, everyday life, world leaders.
   - **Pop Culture** (1950s–2020s): movies, sitcoms, TV dramas, reality TV, cartoons and animation, video games,
     celebrities, commercials and brands, toys and fads, internet and viral moments, comics and superheroes, late
     night and SNL.
   - **Sports** (1950s–2020s): NFL, NBA, MLB, NHL, college football, March Madness, Summer and Winter Olympics, golf,
     tennis, soccer and the World Cup, boxing and UFC, NASCAR and racing, records and famous moments.
   - **Geography, Science, Animals, General Knowledge:** mostly timeless areas (e.g. US states and cities, capitals,
     landmarks, national parks; space, human body, elements, inventions, computers; pets and breeds, ocean life,
     birds, record-holders; food and drink, brands and logos, words, holidays, money, cars).
   - **Current Events** (rolling past 12 months, spread across the months): politics and government (neutral
     facts), business and tech, entertainment and celebrities, sports, science, health and space, world news,
     viral and internet.
   - **Live Trivia** gets its own maps for its categories (Art, Literature and Comics; Geography; History &
     Government; Movies; Music; Science & Tech; Sports; Television; Current Events). They're seeded from the
     `subcategory` values already in `data/live-trivia/categories/`.
2. **Storage:** table `question_coverage_areas` (`id, game, category, name, eras text[], note, active, created_at,
   created_by`), with a `service_role` grant and RLS per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`. The draft is
   inserted by a migration-free seed script with a dry run, so Andrew can review it before it's applied.
3. **Admin → Trivia Questions → Variety** (D14):
   - Pick a game and a category to see its areas, each with a question count per era and an On/Off switch.
   - **Add area** asks for a name, eras and an optional note (e.g. "include Motown").
   - Andrew adds areas whenever he likes; the next day's brief uses them.
   - A light colour marks thin cells (the design system's one accent). Copy is minimal ("Saved.").
4. **Tags on every question:** `area`, `era` and `subject` (the main person, band, team, work or event, written as
   one canonical name). Table `question_tags` (`game, question_ref` = Speed row id or Live slug, `category, area_id,
   era, subject, subject_key, tagged_at`), with a `service_role` grant.
   - New questions come tagged by the writer, and the server checks the tags against the map.
   - **Existing questions get a one-time tagging run** (~4,320 active + ~7,300 waiting Speed, ~3,800 Live): batches
     of 40 through ChatGPT (`codex exec` on Andrew's Mac, using the same login he sets up for the private repo; no
     extra cost).
   - Fallback: Gemini 2.5 Flash, capped at **$2.50** (the bar test cost $1.01 for 7,333 questions).
   - `subject_key` = the subject lower-cased, with punctuation and a leading "the" removed.
5. **Slot choice (each day, per game).** The day is **10 questions delivered to review**, so the brief asks for ~16
   candidates:
   - **Current Events: 3 delivered (~5 asked).** They're spread across Current Events areas and months, with web
     search on.
   - **Regular: 7 delivered (~11 asked).** Rotate the other categories evenly. Within a category, pick the cells
     with the **lowest count relative to an even share** and break ties by least recently written. At least ⅓ of
     regular slots fall in 2000–present; every listed era stays in rotation.
   - Each slot names category · area · era and carries that category's **avoid list**.
6. **Star cap (D15):**
   - A subject may have **at most 5 questions** in a game's bank (active + waiting, from `question_tags`).
   - There's also **a 30-day gap**: nothing about a subject written in the last 30 days in that game.
   - Subjects at the cap or inside the gap go on the brief's avoid list.
   - The server re-checks each candidate's `subject_key` and rejects breaches with reason `star-cap`.
   - The writing rule says: *"Pick a well-known subject from this cell. Famous is fine, but don't reach for the same
     few superstars. Spread across the many well-known names in this area and era."*
   - Familiarity is still policed by the bar test, so variety never means obscurity.
7. **Report (Variety page and Phase 5):** cells with zero questions, the top 20 subjects by count, and how much of
   the bank sits in each category's top 5 subjects. A healthy map shows that share falling over time.

#### Phase 4a — variety map, tags, the Current Events category (Speed)

1. The variety map, `question_coverage_areas`, `question_tags`, the Variety page and the one-time tagging run, as
   described above. Andrew reviews the draft map before tagging starts.
2. **Current Events as a 9th Speed Trivia category (D11):**
   - Add `{ slug: "current-events", label: "Current Events", dbValue: "Current Events" }` to `TRIVIA_CATEGORIES`
     (`lib/triviaCategories.ts`), with a Lucide icon.
   - The category is **hidden from players until it has ≥ 60 active questions**. The nightly writes one small
     visibility flag, and the picker reads that flag with what it already loads, so there's no count query per
     player.
   - "All Categories" includes it only once it's visible.
   - Phase 0's contract test (generator categories = `TRIVIA_CATEGORIES` dbValues) still holds.
3. **Expiry (D16):**
   - Current Events questions carry the month and year in the wording ("In March 2026, …"), one source URL and
     `expires_on` = event month + 12 months.
   - A monthly step in the nightly retires active and waiting Speed rows past their date, with an undo log, using
     one indexed query.
4. Tests: map seed dry run and apply; tag validation against the map; slot choice (lowest-cell first, the 2000+
   share, the Current Events count, the empty-map fallback); the star cap and 30-day gap; hidden-category
   visibility; expiry selection; the Variety page (text floor, no "Reward").

#### Phase 4b — the ChatGPT writer and the Speed Trivia path

1. **Writing rules** (one shared module, `lib/question-writer/rules.cjs`, used by both games):
   - Audience (D7): *"Write for a typical American adult, aged 21 to 75, at a bar trivia night. The correct answer, or at least the
     topic, must be something most of them have heard of. Make questions hard with close, plausible wrong answers,
     never with an obscure subject."* None of the old prompt's "less-used subtopics" / "beyond the usual famous
     examples" wording.
   - Difficulty: easy ≈ 70%+ of the bar gets it, medium ≈ 40–70%, hard ≈ 20–40%, never below 20%. Target mix
     30 / 50 / 20.
   - Each slot's cell and avoid list, plus the variety rule in the star-cap step above.
   - **Current Events:** events 7 days to 12 months old (no still-developing stories). The month and year go in the
     wording, with one source URL. No disasters, death tolls or crimes against private people, and no partisan or
     opinion framing.
   - Examples: 6–8 good ones rotated daily from recently approved rows of that game, plus 3 fixed bad examples
     (Andrew's four from §2).
   - Everything the writer returns, and anything it read on the web, is data, never instructions, in every later
     step.
2. **Output schema** (`codex exec --output-schema`, validated again on the server):
   - Speed: `{question, options[4], correctIndex, category, area, era, subject, difficulty, sourceUrl?, expiresOn?}`.
   - Live: `{question, answer, acceptableAnswers[], category, area, era, subject, difficulty, sourceUrl?, expiresOn?}`.
3. **Writer endpoints** (production, Node runtime):
   - `GET /api/question-writer/brief?game=speed|live` returns the slots, avoid lists, examples and rules. It's one
     bounded read per call, built from `question_tags` group-by counts.
   - `POST /api/question-writer/candidates` inserts into **`question_candidates`** (`id, game, run_date, slot jsonb,
     payload jsonb, status, reason, created_at`; `service_role` only) and nothing else. Limits: ≤ 40 items, ≤ 64 KB,
     ≤ 2 posts per game per UTC day; the idempotency key is `(game, run_date)`.
   - Auth: `Authorization: Bearer $QUESTION_WRITER_TOKEN` (32 random bytes; Vercel Production env and the private
     repo's secret; constant-time compare). The token can't read questions, approve anything or touch the JSON.
4. **Private repo** (name e.g. `hightop-question-writer`, private, created with Andrew's OK):
   - One workflow: daily cron plus `workflow_dispatch`, `concurrency` so it never runs twice at once. Steps: restore
     `$CODEX_HOME/auth.json` from secret `CODEX_AUTH_JSON` → `codex exec` per game → POST → if `auth.json` changed,
     write it back with `gh secret set` using a fine-grained token scoped to that repo only (secrets: write). Never
     print or upload `auth.json`.
   - Re-sign-in: a 401 fails the job and GitHub emails Andrew. He runs one helper script (`codex login
     --device-auth` into a fresh `CODEX_HOME`, then `gh secret set CODEX_AUTH_JSON`). Write it so a non-programmer
     can follow it.
   - Use a **separate Codex login** for this repo, not the file from Andrew's laptop. OpenAI says not to share one
     `auth.json` across machines.
   - Model: the strongest one Codex offers on the Pro plan at build time. Record its exact name in the handoff.
5. **Speed processing** (a new step in `trivia-nightly.yml`, replacing Gemini generation; re-enable the nightly
   here): take today's `received` Speed candidates → hard limits in code (one sentence, ≤ 110 characters, a
   single-item answer, the answer not in the question, 4 options of similar length and type) → tags valid against
   the map → star cap → bar test (`lib/speed-trivia-quality/audience.cjs`, threshold from 4d, start at score ≥ 3) →
   the existing full-bank repeat check and signed admission → `pending_review` with `speed_generation_metadata`
   (`source:'chatgpt'`, `sourceUrl`, `expiresOn`) and a `question_tags` row. They then get Quick Review's free
   fast-lane Keep. Every rejected candidate keeps its reason in `question_candidates`.
   **Gemini fallback (D13, Andrew 2026-11-15):** if a game has no `received` candidates for today when the nightly
   runs (the ChatGPT login lapsed, or the private run failed), the nightly writes that game's slots with Gemini 2.5
   Flash from the same brief, rules, variety map and gates. Fallback rows carry `source:'gemini-fallback'`, are
   capped at $0.10 per game per day, and show "Gemini" in Quick Review's Source filter. GitHub still emails Andrew
   about the failed private run, and Quick Review shows "Writer stopped" after 2 days in a row on the fallback, so
   the login gets renewed. On fallback days Gemini grades its own writing; the hard limits, star cap and repeat
   check still apply.
6. Quick Review: a **Source** filter value "ChatGPT". The card shows area · era, and the source link for Current
   Events.
7. Tests: endpoint auth and limits, schema validation, hard limits, the star-cap re-check, the nightly never
   admitting without the signed path.

#### Phase 4c — Live Trivia path

1. **Live bar test:** a `game:'live'` variant in `audience.cjs` (write-in wording, version `bar-test-live-v1`),
   calibrated with the existing Live JSON as "keep" labels plus 4d ratings.
2. **Live hard limits:** a single unambiguous answer of ≤ 4 words (or a year or number), acceptable answers covering
   common spellings and surnames, no "which of these", the answer not in the question, and ≤ 140 characters for
   reading aloud.
3. **Live repeat check** (new, `lib/live-trivia-quality/repeats.cjs`): free checks first (an exact slug or normalized
   question match, the same normalized answer in the category, then top-8 word overlap), then **one** Gemini call
   per candidate against those ≤ 12 likely matches. A confirmed repeat is rejected with the match recorded; an
   uncertain one is shown to Andrew as "Possible repeat of: …". The corpus is the checked-out JSON (free).
4. **Quick Review, Live mode:** a Speed / Live switch. The card shows the question, answer, acceptable answers,
   category, area · era and source link. Keys work the same way, and **E** edits the answer and acceptable answers.
   Marks live on `question_candidates` (`status` keep / reject).
5. **Publish (D10):** a **Publish (N)** button, using the same GitHub helper pattern as
   `app/api/admin/trivia/questions/export-speed-json/route.ts` (`GITHUB_TOKEN`, `GITHUB_REPOSITORY`). It reads each
   category file from `main`, **appends** kept entries (fresh slugs, re-checked against the current file), commits
   to a branch, opens a PR and turns on auto-merge. The merge triggers the existing **Sync Live Trivia** workflow
   (`live-trivia:check`, then import). Existing entries are never changed, reordered or rebuilt. Published
   candidates are marked `published` with the PR URL.
6. **Current Events for Live (D11):**
   - A new file `data/live-trivia/categories/current-events.json` (`categoryName: "Current Events"`), created by the
     first Publish.
   - A new category is the only kind of new file Publish may create.
   - It's offered as a schedulable round only once it has **≥ 45 unexpired questions** (three rounds of 15).
     Confirm where Live scheduling lists categories (start at `lib/liveShowdownAdmin.ts`).
7. **Expiry (D16):** entries carry `expires_on` in the JSON. `import-trivia-questions.cjs` accepts the field and
   treats expired entries as absent (pruned from the database; the JSON keeps them as history). `sync-live-trivia.yml`
   gains a monthly schedule so expiry takes effect without a push. The JSON is never auto-edited for expiry.
8. Record the authorized exception in `SYSTEM_CONTEXT.md` §12 (the Live Trivia source-of-truth rule):
   *append-only publishing of reviewed candidates, authorized by Andrew 2026-11-15*. CLAUDE.md is Andrew's to change;
   propose a one-line edit in the handoff.
9. Tests: append-only (a byte-for-byte check that existing entries are unchanged), slug collisions, a new category
   file, expiry in the importer, the round-visibility threshold, pool separation (Live candidates never reach
   `trivia_questions` as `anytime_blitz`), and the Live mode UI.

#### Phase 4d — trial run, then daily

1. Run the private workflow once by hand for each game (candidates marked as a trial; ≤ $0.50 of Gemini for both
   games). Andrew rates them in Quick Review.
2. Pass when all of these hold for each game:
   - Andrew would keep **≥ 70%**.
   - No subject appears twice in the trial.
   - At least 5 categories, and 8 different areas, are represented.
   - Current Events questions have working sources.
   - No facts are wrong in his sample.
3. Tune the bar-test threshold and prompt, then turn on the daily schedule in both repos.
4. Check the Codex usage the trial used against the Pro plan's limits; two runs a day should sit far inside them.
   Report it.

**Cost (estimated 2026-11-15; measure in 4d):**

| Item | Per day | Per month | Note |
| --- | --- | --- | --- |
| ChatGPT writing (2 Codex runs) | $0 extra | $0 extra | Uses Pro plan usage limits, not money. |
| Gemini fallback writing (D13), only on days ChatGPT misses | ~$0.02 per missed day | ≤ $0.60 if every day missed | ~32 candidates, Flash; cap $0.10 per game per day. |
| One-time tagging (~15,400 questions) | — | $0 once (ChatGPT) | Gemini fallback ≤ $2.50 once. |
| Bar test, ~32 candidates | ~$0.01 | ~$0.30 | Gemini 2.5 Flash, 1–2 calls. |
| Speed repeat check, ~12 candidates past the gates | ~$0.25 | ~$7 | Measured in Phase 3: $0.00048 per pair; a new unique question needs ~28–128 pairs (~$0.013–0.06). The nightly cap stays $0.50. |
| Live repeat check, ~12 candidates | ~$0.02 | ~$0.60 | One small call each. Cap $0.25/day. |
| Private-repo Actions minutes | ~5 min | ~150 min | Inside GitHub Free's 2,000 private minutes. |
| Supabase / Vercel | 2 brief reads (one group-by each), 2 posts, small inserts | negligible | Tags add ~15k small rows once, plus ~20 a day. The nightly's corpus load is unchanged. |

Total ≈ **$8/month** at the pair cost measured in Phase 3 (the earlier $13 used the old $0.032/question guess). That's
below the old nightly's $0.50/night (≈ $15/month), which kept about 16 mostly weak questions a night. Cost scales roughly linearly with the repeat check.
Raising the daily target needs Andrew's OK.

### Phase 5 — monitor seven nights

Report per day **for each game**: written, gate rejects by reason, repeats, reached review, Andrew's keep rate,
Current Events count and any expired, empty cells, top subjects and the top-5-subject share per category,
star-cap rejects, cost, run time and whether the ChatGPT login needed renewing.
Compare with the baseline (16/night, ~40% keep rate, 10.5 min, ≤ $0.50) and with 4d's numbers. Then use `trivia_answers` correct-rates on questions
with ≥ 20 answers to check whether "easy / medium / hard" matches real play, and report which categories run too
hard. Any question Andrew calls obscure becomes a regression example for the scorer.

## 5. Recommended path through the backlog (once Phases 0–3 exist)

1. Literary Landscapes gone (Phase 0).
2. Recent 473 (minus their Literary Landscapes rows): sort by score, Keep / Reject. Keeps are instant and free.
3. Older 6,981: "Reject all shown" with a bar-test score of 2 or below. "Keep all shown" with a score of 5 (spot-check
   a few first). Quick Review the middle band.
4. Overnight runs approve unique kept questions and retire repeats. Andrew only looks at the Needs a look list.
5. D17 (built): the nightly pre-check removes older repeats with score ≥ 3 before step 3, so steps 3–4 cover roughly
   1,000–1,500 questions instead of ~7,000 (Phase 3 measured 42 of 50 likely keeps as repeats; 8 of the first 10
   pre-checked). It takes about 3–4 nights at $5 a night once PR #19 is merged.

## 6. Decisions needed from Andrew

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Also retire the **99 approved** Literary Landscapes questions players can get under "All Categories"? | **Yes.** |
| D2 | Pause the nightly writer until Phase 4 ships? | **Yes.** It adds ~16 mostly weak questions a night at up to $0.50. |
| D3 | The 473 recent questions: review them with the score (approval is instant and free) or reject them all? | **Answered 2026-11-15: review them** in Quick Review. |
| D4 | One-time budget for repeat-checking older questions you Keep, and a per-night cap. | $1.50 measurement approved and done ($0.70 spent). **Answered 2026-11-15: $5 per night and $20 in total** for the overnight job (Keep queue and D17 pre-check together). Enforced by `speed_trivia_queue_reserve`; set as repository variables `SPEED_TRIVIA_QUEUE_MAX_DOLLARS=5` and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS=20`. |
| D5 | When you reject a question for being dull or obscure, should its fact be blocked forever? Today it is. | **Answered 2026-11-15: No** (Andrew took the recommendation). Block forever only repeats and wrong answers. Built in Phase 3: a Quick Review reject for quality (← / Reject all shown) releases the fact; W (wrong answer), repeats and deletions from before Quick Review stay blocked. |
| D6 | Nightly target. | **Answered 2026-11-15: ~10 good questions a day for each game**, counted as reaching review after the gates. |
| D7 | Audience definition. | **Answered 2026-11-15: a typical American adult aged 21 to 75**, at a bar trivia night. Scorer `bar-test-v2` (Phase 3) and the Phase 4 writing rules use it. |
| D8 | Kept older questions that turn out to be repeats: retire automatically (match recorded, undoable) or show them to you? | **Answered 2026-11-15: retire automatically.** The match is recorded and shown under Quick Review → Repeats, with Restore. Uncertain ones wait under Needs a look. |
| D9 | Where does the ChatGPT writer run? | **Answered 2026-11-15: a small private GitHub repo**, daily in the cloud, signed in with Andrew's ChatGPT Pro plan. (Not his Mac, not a paid API key.) |
| D10 | How do approved Live Trivia questions reach the canonical JSON? | **Answered 2026-11-15: review in Quick Review, then Publish** appends them through a self-merging PR. Append-only; never rebuilt from the database. |
| D11 | Current-events questions: existing categories or a new one? | **Revised by Andrew 2026-11-15: a new "Current Events" category in both games**, the only new category. It's a 9th pickable Speed category and a schedulable Live round, hidden until it has ≥ 60 (Speed) / ≥ 45 (Live) questions. 3 of each day's 10 per game. |
| D12 | Share of daily questions from Andrew's topics. | **Superseded 2026-11-15.** Andrew's "1980s pop culture" and "2010s Rock Anthems" were examples of variety *within* categories, so the topics list became the variety map (D14). |
| D13 | If the ChatGPT writer misses a day (login expired), skip the day or fall back to Gemini? | **Answered 2026-11-15: don't skip; fall back to Gemini** (Andrew answered "No" to skipping). Recommendation was to skip. Fallback design in Phase 4b step 5. **Confirmed by Andrew 2026-11-15.** |
| D14 | Who maintains the variety map? | **Answered 2026-11-15: Andrew reviews the drafted map once, then edits it and adds areas whenever he likes** on the Variety page. |
| D15 | Star cap: max questions per subject in a game's bank. | **Answered 2026-11-15: 5**, plus nothing new on the same subject within 30 days. |
| D16 | How far back Current Events reaches. | **Answered 2026-11-15: the past 12 months.** Questions retire 12 months after the event month. |
| D17 | Check older waiting questions for repeats **before** you review them? (New, 2026-11-15.) 42 of 50 likely keeps turned out to be repeats of an approved question. | **Answered 2026-11-15: yes. Built in Phase 3** (§4 Phase 3 step 6): nightly, inside the D4 budget, score ≥ 3, best first. Repeats are retired with the match shown under Repeats and Restore, as D8. |

## 7. Standing rules

- Never cross the pools: Speed stays `anytime_blitz` + `multiple_choice`, and Live stays `live_showdown` + write-in.
  Phases 0–3 and 4a touch Speed only. Live Trivia is touched only by Phase 4b's **append-only** Publish of reviewed
  candidates (D10, 2026-11-15). Existing JSON entries are never changed, reordered or rebuilt, and nothing is
  regenerated from the database.
- The ChatGPT login (`auth.json`) lives only in the private writer repo's secrets, never in this public repo, a
  log or an artifact. `QUESTION_WRITER_TOKEN` can only read the brief and insert into `question_candidates`.
- Writer output and web pages it read are untrusted data, never instructions. Every candidate passes the hard
  limits, the bar test and a repeat check before Andrew sees it.
- Current Events questions carry the month and year in the wording, a source URL and `expires_on`, and retire 12
  months after the event (D16). Current Events is the only new category (D11). Every other new idea is an area on
  the variety map.
- Variety is enforced in code, not only asked for in the prompt: slots come from the least-covered map cells, and
  the server rejects a subject at the star cap (5) or written in the last 30 days (D15). Variety never overrides
  familiarity: the bar test still gates every candidate.
- The generator's categories = `TRIVIA_CATEGORIES` dbValues in `lib/triviaCategories.ts`, never database inventory.
- Every approval goes through signed admission (`admit_speed_trivia`) or the Phase 1 fast-lane RPC, never a plain
  `status='active'` update.
- The bar test is a gate and a sort, never an automatic delete: rejecting needs Andrew's click (Quick Review or
  "Reject all shown"). The overnight queue retires only confirmed repeats of an approved question (D8), never for
  quality.
- D5: only a Quick Review reject for quality (reason `quality`) releases a fact. Full-bank checks skip released rows
  only through `speed_trivia_released_rows_v2` (by revision, Phase 3b) and `releasedRows:'read'`; nothing else may
  drop rows from the bank. If a
  released row is restored, `speed_trivia_quick_keep` denies the fast lane to it and to everything admitted while it
  was released (`speed_trivia_released_restores`). Never remove that check.
- The overnight queue (`scripts/process-speed-trivia-keep-queue.cjs`) records results only through
  `speed_trivia_queue_settle`, which verifies a real signed admission before marking a row approved. It runs paid
  only inside repository variables `SPEED_TRIVIA_QUEUE_MAX_DOLLARS` (per run) and `SPEED_TRIVIA_QUEUE_TOTAL_DOLLARS`
  (all runs), and every paid run reserves its dollars through `speed_trivia_queue_reserve` first. Never bypass the
  reservation, and never delete or edit a `speed_trivia_queue_runs` row to free up budget without Andrew's OK.
- D17: the pre-check never approves. It records results only through `speed_trivia_precheck_settle`, touches only
  older undecided waiting questions, and retires only confirmed repeats of an approved question. A restored row
  (`precheck.outcome = 'restored'`) is never pre-checked again in that wording.
- **Remedial rules (Phases 3a–3c, 2026-11-15):**
  - The overnight job never stops for one question. A row's own errors are recorded and the run moves on. It stops
    only at the budget, the deadline, or the error breaker (3 transient errors in a row, or 20 in a run).
  - Queued Keeps whose row is no longer waiting are cleared or settled only by `speed_trivia_queue_prepare`.
  - The capped judge never throws away a confirmed `duplicate` because another pair failed. It saves paid verdicts
    to the pair cache before it throws anything.
  - A released row is skipped only at the revision it was released at (`speed_trivia_released_rows_v2`).
    Approved-only checks never read the released set. If the released set can't be read, nothing is skipped.
  - Undo returns a question to the view it came from. A Quick Review reject needs an explicit reason
    (`quality` or `wrong`), and anything else is refused.
- No paid run beyond a cap Andrew has approved. The $225 whole-backlog audit stays declined.
- Every bulk status change writes a before-state undo log first. (Quick Review's mark row, written in the same
  transaction as the status change, is that log.)
- `speed_trivia_review_marks` is written only by its RPCs (`service_role` has `select` only): Undo trusts
  `decided_revision`, so marks must not be forgeable. A queued keep is approved only while its row is still
  `pending_review` and its `content_hash` still matches.
- Bar-test scores are written only by `speed_trivia_review_set_audience`, which never touches decision fields, and
  only for a waiting row whose content hash still matches. The scorer lives in `lib/speed-trivia-quality/audience.cjs`
  and is shared with the Phase 4 writer; a prompt or rule change bumps `AUDIENCE_VERSION` and is re-calibrated.
- Product copy minimal; "Prize", never "Reward"; no text under 12 px.
