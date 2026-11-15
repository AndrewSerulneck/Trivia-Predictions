# Speed Trivia backlog clearing and question quality

Created 2026-11-15. Owner: Andrew Serulneck.

**Status: Phase 0 DONE 2026-11-15 — `speed-trivia-backlog-and-quality-plan_PHASE_0_HANDOFF.md`. Phase 1 DONE
2026-11-15 (migration applied) — `..._PHASE_1_HANDOFF.md`. Phase 2 BUILT 2026-11-15: all 7,333 waiting questions
scored ($1.09); scores in a file, migration `20261115153905` NOT applied (needs Andrew's OK) —
`speed-trivia-backlog-and-quality-plan_PHASE_2_HANDOFF.md`. All on branch `feature/speed-trivia-quick-review`, PR #19,
merge after the end-of-plan code review. D1 yes, D2 yes, D3 review, D4 $1.50; D5–D8 open. Next: Phase 3.**

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
   are removed with a note saying which approved question they matched.
5. **Phase 4:** rewrite the nightly writer: mainstream American topics, a "would a typical bar crowd know this?"
   gate before anything reaches you, short questions, difficulty from close wrong answers instead of obscure
   subjects, and examples taken from questions you've approved. It writes fewer questions each night, but better
   ones.
6. **Phase 5:** watch seven nights and compare yield, your approval rate and cost.

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
  **$0.032/question** at today's checker). Gemini rates in code (`RATES`, `gemini.cjs`): flash $0.30 in / $2.50
  out, flash-lite $0.10 / $0.40 per million tokens. Verify current Google prices in Phase 2 before quoting a bill.

## 3. Phases, model and effort

| Phase | Work | Model / effort | Why |
| --- | --- | --- | --- |
| 0 | Stop Literary Landscapes, bulk-retire it, pause nightly | **Opus 5.5 / medium** | Production data change (top tier), but a single mechanical status update with an undo log, so medium effort is enough. |
| 1 | Quick Review screen, server-side filters, bulk by filter, free approval for already-checked rows | **Opus 5.5 / high** | New SECURITY DEFINER approval path + migration touching the signed-admission boundary. |
| 2 | Shared "bar test" scorer; score the backlog; calibrate against Andrew's decisions | **Opus 5.5 / high** | Shared engine reused by generation; paid API; threshold calibration is judgment-heavy. |
| 3 | Overnight Keep queue + faster repeat checker | **Opus 5.5 / high** | Changes the uniqueness engine; must re-pass frozen evaluation gates; new workflow + budget. |
| 4 | Nightly writer rewrite + one capped pilot | **Opus 5.5 / high** | Prompt and gate design decide quality; shared engine; paid pilot. |
| 5 | Seven-night monitoring and report | **Sonnet 5.5 / medium** | Read-only measurement against stated baselines. |

**Which AI model runs the work (Andrew asked 2026-11-15 whether to switch off Gemini).** The table above names the
coding agent. The model *inside* the pipeline is a separate choice for each job:

| Job | Now | Recommendation | Why |
| --- | --- | --- | --- |
| Bar test (Phase 2) | Gemini 2.5 Flash, ~$1 one time | Keep | Already calibrated against Andrew's decisions and run. Switching means re-running calibration. |
| Repeat check (Phase 3) | Gemini 2.5 Flash | Keep | Frozen evaluation gates (`evaluation-v1.json`, `evaluation-fresh-v1.json`) are passed on this model; a switch must re-pass them. It's also the high-volume job (one call per pair). |
| Question writer (Phase 4) | Gemini 2.5 Flash | **Bake-off in the Phase 4 pilot**: Gemini 2.5 Flash vs Claude Sonnet 5.5, ~40 questions each, rated blind by Andrew in Quick Review | The writer decides question quality, so it's where a stronger model can help most: more natural wording, fewer wrong facts. A different model grading the writer's output also avoids a model marking its own homework. |

Claude list prices (2026-11): Sonnet 5.5 $2 / $10 per million input / output tokens, Haiku 5.5 $0.10 / $0.50, Opus
5.5 $4 / $20; the Batch API halves these. A nightly 100-candidate run is roughly 20k input + 15k output tokens, about
**$0.20/night on Sonnet 5.5** (Claude thinking tokens add to output), versus a few cents on Gemini Flash. The project
already ships `@anthropic-ai/sdk`. A Claude writer would need its own key (e.g. `ANTHROPIC_API_KEY_SPEED_TRIVIA`) in
`.env.local` and as a GitHub Actions secret for the nightly workflow. Today only `GEMINI_API_KEY` is there.

Order: 0 → 1 → 2 → 3 → 4 → 5. Phase 4 depends only on Phase 2, so it may run before or alongside Phase 3 if Andrew
wants the writer fixed sooner. Each phase ends with `speed-trivia-backlog-and-quality-plan_PHASE_<N>_HANDOFF.md`
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
   - `familiar` 1–5: would a typical American adult (D7) recognise the correct answer?
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

### Phase 3 — overnight Keep queue and a faster repeat check

1. **Background, not in the click.** A new step after generation in `trivia-nightly.yml` (or a separate workflow
   with `workflow_dispatch` for a manual run) processes `keep` marks oldest first. That gives up to 60 minutes per
   run instead of the browser's 4, under a separate per-run cap (D4). Results:
   - Unique → approved (signed admission, approved-only scope, as today).
   - Confirmed repeat → retired, with the matched approved question recorded in the mark (D8).
   - Uncertain → left pending with reason `needs-look`. Quick Review shows these under their own filter.
2. **Faster check, same answers.** In order of safety:
   - (a) Run pair comparisons with bounded concurrency (start at 6) instead of one at a time. Same calls and cost,
     several times faster. Keep the early stop by cancelling the remaining pairs on the first non-unique result.
   - (b) Compare same-answer competitors first, since they're the most likely repeats, so the early stop hits sooner.
   - (c) Optionally narrow retrieval with embeddings, or batch several pairs per call. **Either one changes the
     frozen policy:** it must re-pass `tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json` and
     `evaluation-fresh-v1.json` (zero repeat admissions, ≥95% distinct acceptance), or it isn't shipped.
3. Measure first. Run the old and new checkers on the same 50 kept rows (≈$1.50 at today's rate, inside Andrew's
   D4 cap) and report seconds and dollars per question and agreement before switching.
4. The same speed-up applies to generation, so the nightly stops timing out.

Cost: depends on D4 and on how many older questions Andrew keeps. At today's ~$0.032/question, 1,500 kept ≈ $48;
the target after (b)/(c) is ≤ $0.015 ≈ $22. The figure is measured in step 3, not assumed. Supabase: one corpus
load (~11.65 MB) per run plus bounded deltas, unchanged.

### Phase 4 — rewrite the nightly writer

1. **Audience rule** at the top of the prompt: *"Write for a typical American adult at a bar trivia night. The
   correct answer must be something most of them have heard of. Make questions hard with close, plausible wrong
   answers, never with an obscure subject."*
2. Delete "less-used subtopics" and "beyond the usual famous examples". Replace `TOPICS` with mainstream, US-relevant
   subtopics for the 8 categories (e.g. Sports: NFL, NBA, MLB, Olympics, college football, golf and tennis majors;
   Pop Culture: blockbuster movies, sitcoms, streaming hits, celebrities, video games, commercials and brands;
   History: US presidents, American wars, the 20th century, world-famous events). Stop always picking the
   least-used topic. Rotate evenly, and allow **a new fact about a famous subject**, which the checker already
   permits.
3. Hard limits checked in code: one sentence, ≤ 110 characters, a single-item answer, the answer not in the question,
   and four options of similar length and type.
4. Difficulty anchor: easy ≈ 70%+ of the bar gets it, medium ≈ 40–70%, hard ≈ 20–40%, never below 20%. Target mix
   30 / 50 / 20.
5. Pipeline: generate → free hard limits → **bar test (Phase 2 scorer)** below threshold → reject → then the paid
   repeat check. The cheap gate runs first, so fewer paid checks are wasted.
6. 6–8 good examples, rotated nightly from recently approved rows, plus 3 fixed bad examples.
7. Nightly target per D6 (recommended 25). Report generated, bar-test rejects by flag, repeats, admitted and cost.
8. **One capped pilot** (≤ $0.50, dry-run to a file, not to the database): ~40 candidates for Andrew to rate in Quick
   Review. Pass when he would keep ≥ 70%. Then re-enable nightly.

Cost: the bar test adds ~$0.02/night for 100 candidates. Repeat checks fall because fewer candidates reach them.
Nightly stays ≤ $0.50.

### Phase 5 — monitor seven nights

Report per night: generated, gate rejects, repeats, admitted, Andrew's keep rate, cost and run time. Compare with
the baseline (16/night, ~40% keep rate, 10.5 min, ≤ $0.50). Then use `trivia_answers` correct-rates on questions
with ≥ 20 answers to check whether "easy / medium / hard" matches real play, and report which categories run too
hard. Any question Andrew calls obscure becomes a regression example for the scorer.

## 5. Recommended path through the backlog (once Phases 0–3 exist)

1. Literary Landscapes gone (Phase 0).
2. Recent 473 (minus their Literary Landscapes rows): sort by score, Keep / Reject. Keeps are instant and free.
3. Older 6,981: "Reject all shown" with a bar-test score of 2 or below. "Keep all shown" with a score of 5 (spot-check
   a few first). Quick Review the middle band.
4. Overnight runs approve unique kept questions and retire repeats. Andrew only looks at the `needs-look` list.

## 6. Decisions needed from Andrew

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Also retire the **99 approved** Literary Landscapes questions players can get under "All Categories"? | **Yes.** |
| D2 | Pause the nightly writer until Phase 4 ships? | **Yes.** It adds ~16 mostly weak questions a night at up to $0.50. |
| D3 | The 473 recent questions: review them with the score (approval is instant and free) or reject them all? | **Answered 2026-11-15: review them** in Quick Review. |
| D4 | One-time budget for repeat-checking older questions you Keep, and a per-night cap. | Approve **$1.50** for the Phase 3 measurement first; set the full budget after that number is known (likely $20–50). |
| D5 | When you reject a question for being dull or obscure, should its fact be blocked forever? Today it is. | **No.** Block forever only repeats and wrong answers. Otherwise every rejected mainstream question pushes the writer further toward obscurity. Phase 3 implements it. |
| D6 | Nightly target. | **25** (down from 100), with the bar-test gate. |
| D7 | Audience definition: "typical American adult, 21–45, at a bar trivia night". | Confirm or edit. |
| D8 | Kept older questions that turn out to be repeats: retire automatically (match recorded, undoable) or show them to you? | **Retire automatically.** Uncertain ones are shown to you. |

## 7. Standing rules

- Speed Trivia only: `anytime_blitz` + `multiple_choice`. Never touch Live Trivia (`live_showdown`,
  `data/live-trivia/`) or cross the pools.
- The generator's categories = `TRIVIA_CATEGORIES` dbValues in `lib/triviaCategories.ts`, never database inventory.
- Every approval goes through signed admission (`admit_speed_trivia`) or the Phase 1 fast-lane RPC, never a plain
  `status='active'` update.
- The bar test is a gate and a sort, never an automatic delete: rejecting needs Andrew's click (Quick Review or
  "Reject all shown").
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
