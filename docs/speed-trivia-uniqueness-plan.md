# Speed Trivia uniqueness and database cleanup plan

Created: **2026-10-12**. Owner: Andrew Serulneck.

**Status: Phases 0–3 complete locally (Phase 3: 2026-10-13); Phases 4–6 not started. Latest handoff: [Phase 3](speed-trivia-uniqueness-plan_PHASE_3_HANDOFF.md). Shared fact comparison is wired into generation/import/admin writers with signed database admission, race/direct-write/pool-conversion guards, diversity planning, global budgets, metadata backfill and immutable cleanup/undo tooling. [Release/backfill/recovery runbook](speed-trivia-uniqueness-phase-3-release-runbook.md). Final gates: 4,223 tests pass / 13 environment-gated skip, clean typecheck/lint/build, isolated SQL + real concurrent-session checks. Phase 3 paid API use $0. Nothing is committed/pushed/deployed/applied; live repeats remain for Phase 5. Phase 2 proposal still has 849 active + 1,618 pending retirements with 968 approved keepers and explicitly unresolved coverage; its private manifest remains non-applyable. [Engine/evaluation/cost record](speed-trivia-uniqueness-phase-2-engine.md), [cleanup proposal](speed-trivia-uniqueness-phase-2-cleanup-summary.md). Recurring spending/pilot allowance and concrete production migration confirmation remain Phase 4 decisions.**

## 1. Developer summary and decisions

The existing system catches identical wording but misses many questions testing the same fact. We will make every Speed Trivia writer check the current database through one shared admission process, remember retired facts, and keep uncertain candidates out of your normal approval queue. Then we will retire existing duplicates while keeping the best version and preserving past games.

Andrew answered these questions on 2026-10-12. Do not ask them again:

1. **Keep the best version of a repeated fact and retire the others. Preserve past game records.**
2. **Only repeated facts are banned. Different facts about the same artist are allowed.** This answer supersedes the initial request for a lifetime limit of one question per song, album, or artist. Avoid subject concentration through generation diversity controls, not lifetime subject bans.
3. **Uniqueness takes priority over quantity.** A run may submit fewer questions, or none. The present target of 100 is a ceiling, not a requirement to fill by weakening checks.
4. **Measure current API spending first, then propose a capped budget.** No monthly dollar cap has been chosen. Measure both the one-time cleanup cost and recurring generation/checking cost before paid bulk processing or rollout.
5. Preferred engineering model: **GPT-6.1 Sol**; cheaper models are welcome when adequate. This document supplies effort recommendations below. No delegation requested.

Scope: Speed Trivia only, `question_pool = 'anytime_blitz'` and `answer_format = 'multiple_choice'`, across **all categories**. Audit active, pending, and deleted rows; distinguish database states rather than calling approved rows `approved` (their status is `active`). Live Trivia content, generation, grading, schedules, rewards, points, player history, and historical game questions are out of scope.

Semantic similarity cannot be guaranteed perfectly by a model or numeric threshold. The acceptance contract is: deterministic exact duplicates never pass; all known repeated-fact regressions are blocked; uncertain comparisons never enter normal review; measured recall and false-positive results must pass release gates. Report this limitation honestly rather than promising a mathematical guarantee of zero future semantic mistakes.

## 2. What was verified in the repository

Baseline: branch `main`, HEAD `96b88658dfeeb42ef88aa09fb858d9d794631e04`. Remote: `https://github.com/AndrewSerulneck/Trivia-Predictions.git`. `package.json` names another GitHub repository, so do not infer the operational repository from package metadata. Existing unrelated local changes: `next-env.d.ts` modified and `.vscode/settings.json` untracked; leave them alone.

| Component | Verified behavior / problem |
| --- | --- |
| `.github/workflows/trivia-nightly.yml` | Runs daily at **02:15 UTC** (10:15 PM previous evening in New York during DST; 9:15 PM during standard time). Uses Gemini, default `gemini-2.5-flash` with a configured fallback; target 100, batches of 25, zero new categories. Copies local exports to runner temporary files, generates, then imports `pending_review`. Workflow concurrency only serializes this workflow. |
| `scripts/generate-trivia-nightly.cjs` | Plans category allocations from local export counts and spawns a generator per category. Up to four refill passes; each child reloads the database. Local counts do not represent the complete current database/review backlog. |
| `scripts/generate-trivia-questions.cjs` | `fetchExistingDatabaseQuestionCatalog()` paginates existing non-deleted Speed rows, but returns an empty corpus when credentials are absent. Prompt shows **15 recent local questions**, not the full database. `areQuestionsNearDuplicates()` uses sorted English tokens and a **0.9 Dice overlap**; most comparisons require at least four tokens. Similarity checks are category-local and do not use answers or fact identity. |
| `scripts/import-trivia-questions.cjs` | Reloads non-deleted corpus and applies similar category-local lexical filtering. Uses slug upserts; shares Live Trivia duties. Preserve its Live branch. `--check` validates file shape, not database novelty. |
| `supabase/migrations/20260609103000_prevent_duplicate_trivia_question_text.sql` and `20260609123000_scope_question_uniqueness_to_speed_trivia.sql` | Repo declares a normalized-text unique index for non-deleted Speed rows and a normalization trigger. Deleted text is not reserved. Live deployment of these objects must be verified in Phase 1; migration files are evidence of intended schema, not proof of current production state. |
| `supabase/migrations/20260609113000_add_trivia_duplicate_review_metadata.sql` | Defines `duplicate_review_status` (`clear`, `suspected`, `confirmed_unique`) and JSON matches. Initial code search found no consumer. Verify before extending; existing default `clear` is not evidence that a row has been checked. |
| `app/api/admin/trivia/questions/route.ts` | Bulk approval currently changes status without a semantic check. GET exposes pending rows by status. |
| `app/api/admin/trivia/questions/[id]/route.ts`; `lib/admin.ts` | Edits, creation, bulk pool changes, and status transitions can bypass generator checks. Several deletion paths differ; `deleteAdminTriviaQuestion()` physically deletes session references and the question. Do not use it for this cleanup. |
| `scripts/cleanup-trivia-duplicates.cjs` | Handles normalized exact-text duplicates only; keeps active then oldest. Does not find rewordings or record durable undo data. Do not use its apply flags as the new cleanup tool. |
| `scripts/restore-deleted-speed-trivia.cjs` | Blanket restore of deleted Speed rows with `--fix`; can undo cleanup. Replace Speed restore behavior with explicit, checked selection or refuse it. |
| `scripts/sync-local-trivia.cjs` | Reverse-syncs both Speed **and Live** files from the database; conflicts with current Live source-of-truth rules. Do not run it for this work. |
| `app/api/admin/trivia/questions/export-speed-json/route.ts` | Existing approved Speed export through a GitHub PR. Use this direction after cleanup; inspect how it handles old files/categories that become empty. |
| `lib/trivia.ts` | New question selection uses active Speed rows. Verify retirement and already-issued questions separately so cleanup does not disrupt in-flight answers. |

Read-only local evidence on 2026-10-12: **8 Speed export files, 2,974 questions, zero normalized exact duplicate groups**. These are **not live database counts**. Yet local exports contain repeated facts, including the Gobi Desert's countries, Africa in four hemispheres across Geography and General Knowledge, and vertebrate longevity. Four user-example paraphrase pairs evaluated against the actual generator function all returned **false** for near-duplicate detection: Gobi continent, four hemispheres, vertebrate lifespan, and Eras Tour artist. Local exports contain four questions explicitly naming Taylor Swift and seven with Taylor Swift as the correct answer; these counts overlap and omit implied references, so they are not a full subject audit. Distractor mentions must not count as subject repetition.

No live database read or GitHub Action run inspection was performed in Phase 0. Exact live counts, backlog, installed schema, provider usage, workflow status, and completeness of every writer remain Phase 1 work.

## 3. What “same question” means

Compare the **fact a player must know**, using question text, correct answer, relevant options, qualifiers, and referenced entities. Wording, option order, category, and whether the question asks in the reverse direction do not make a fact new.

Mandatory regression families (use database examples in Phase 1, not only these synthetic phrasings):

| Fact family to block | Examples of equivalent knowledge |
| --- | --- |
| Gobi Desert → continent | “Which continent is the Gobi Desert primarily located in?” / “The Gobi Desert is located on which continent?” |
| Taylor Swift → Eras Tour | “Which pop superstar's record-breaking Eras Tour began in 2023?” / “Which pop star is famous for her Eras Tour?” Reverse artist/tour identification also repeats this association. |
| Africa → four hemispheres | All forms asking which continent spans all four hemispheres, across all categories. |
| Greenland shark → longest vertebrate lifespan | “Which of these animals…” / “Which animal has the longest known lifespan among vertebrates?” |
| Soviet Union → Sputnik 1 launch | Rephrasing the first artificial satellite's launching country, including USSR/Soviet Union aliases. |
| Olympia → origin of ancient Olympics | Rephrasing which ancient city originated/hosted the first ancient Olympic Games. |

Different facts remain allowed: the Gobi's continent versus its two countries; an artist's tour association versus a distinct album release fact. Questions about vertebrates and mammals need different scope; identical answers such as “Asia” or “1969” alone never establish duplication. Different distractors never establish novelty. A spelling alias or a fact hidden in the correct answer still counts. Image questions need image subject/context when relevant.

Avoid rejecting distinct questions solely because they share sentence templates, broad topic, person, country, song, or answer. Conversely, a combined question that mostly retests an already used fact must be held or rejected, not admitted by attaching a minor new qualifier. During audits, do not collapse a whole chain of weak pairwise similarities into one duplicate group: each retirement needs evidence against the chosen keeper.

For diversity, prioritize underrepresented subtopics and subjects using current pending/active counts and recent generation history. Proposed initial rule: one primary person/artist/song/album per accepted nightly batch; spread subsequent runs toward less-used subjects. This is a configurable generation policy, **not** a ban on existing distinct facts. Calibrate after inventory; no automatic retirement merely for mentioning Taylor Swift.

## 4. Phase sequence and engineering models

These are models for the AI agent implementing the phase, not a decision to switch the production generator away from Gemini.

| Phase | Deliverable | Engineering model | Reasoning effort | Chat boundary |
| --- | --- | --- | --- | --- |
| 0 | Investigation and this plan | GPT-6.1 Sol | high | Complete; handoff written. |
| 1 | Live inventory, backup, writer map, evaluation set, cost baseline | GPT-6.1 Sol | high | Complete; [handoff](speed-trivia-uniqueness-plan_PHASE_1_HANDOFF.md). Fresh chat for Phase 2. |
| 2 | Shared uniqueness engine, evaluation, retirement manifest | GPT-6.1 Sol | high | Complete locally; [handoff](speed-trivia-uniqueness-plan_PHASE_2_HANDOFF.md). Fresh chat for Phase 3. |
| 3 | Guard every Speed writer, update nightly generation, build cleanup/undo tools | GPT-6.1 Sol | high | Complete locally; [handoff](speed-trivia-uniqueness-plan_PHASE_3_HANDOFF.md). Fresh chat for Phase 4. |
| 4 | Review and release prevention; install/backfill admission metadata safely | GPT-6.1 Sol | high | Keep the release transaction together; fresh chat after completion. |
| 5 | Apply and verify reviewed database cleanup, update Speed exports | GPT-6.1 Sol | high | Keep application and immediate verification together; fresh chat afterward. |
| 6 | Observe runs, tune diversity/cost, close release record | GPT-6.1 Sol | medium | Can share Phase 5 chat if context is still small. |

GPT-6.1 Sol is the recommended model throughout; no phase currently justifies requiring Astra. Use **xhigh** only for a concrete unresolved transaction/race or semantic-evaluation failure where high effort was inadequate. No default max effort or Pro mode. If an architectural defect remains unresolved, record it and explain an escalation recommendation rather than silently changing models.

Cheaper optional substitution: **GPT-6 Luna, medium**, for Phase 6 reporting or mechanically formatting reports after the checks exist. Retain Sol/high for admission design, semantic calibration, migrations, rollback logic, and cleanup decisions. A cheap model may prepare labels, but cannot authorize retirement on its own.

These are workload judgments, not benchmark guarantees. Official documentation describes [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) as suited to complex coding at lower cost than Astra and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) for focused high-volume work. Official [effort guidance](https://developers.openai.com/api/docs/guides/deployment-checklist) recommends medium/high for diagnosis and code, reserving xhigh/max for measured gains. Checked 2026-10-12. Account availability and chat billing are not established by API pricing.

## 5. Phase 1 — inventory, preservation, and measurable requirements

**Model: GPT-6.1 Sol / high.** No content retirement or production deployment in this phase.

1. Read project rules and Phase 0 handoff; inspect current branch/worktree without disturbing unrelated changes. Enumerate every Speed insertion, update, approval, import, restoration, and pool/format conversion path. Mark Live-only scripts as out of scope, including misleadingly named tools. Include `app/api/admin/route.ts`, `lib/admin.ts`, the newer review routes, import/backfill/restore scripts, any external/SQL writers discoverable from operational records, and package command aliases.
2. Verify linked project `pkmxupsayzshvpirkaav`, installed status constraints/indexes/triggers/RLS and grants. Use authorized read-only access; do not display secrets or read `.env.local` values. Use existing environment injection conventions, never dump environment. Confirm workflow and recent run logs through GitHub; logs/artifacts may contain sensitive values and must be summarized carefully.
3. Export a stable, completely paginated Speed snapshot with all content, IDs/slugs, statuses, answers, timestamps, image/source/review metadata, plus schema/dependency and count evidence. Use ordered/keyset pagination and snapshot/revision checks: unordered offset pagination while writes occur is not a complete snapshot. Discover all references; gather aggregate reference counts without exporting player identities unnecessarily.
4. Store private backup, checksum, progress, and eventual undo manifests under ignored `tmp/speed-trivia-uniqueness-private/<run-id>/`. Confirm ignored status. Arrange a durable private copy outside ephemeral runner storage before mutation; the local `tmp` directory alone is not disaster recovery. Never commit raw player records or secrets.
5. Report counts by active/pending/deleted and category; age of backlog; repeated exact/fact/entity clusters; how many active questions remain if proposed duplicates are removed. Locate all six reported families in current rows and record their real IDs and answers. Include deleted rows as historical novelty evidence, without restoring them.
6. Build at least **200 labeled pairs**: at least 100 duplicates/paraphrases and 100 distinct facts, balanced across all current categories, with cross-category, answer aliases, reverse questions, minimal wording overlap, partial overlap, similar templates, same subject/different fact, missing answers, and image cases. Split calibration from held-out tests; generated paraphrases supplement real pairs. Put disputed labels in a small developer review list. Do not ask Andrew to review hundreds of obvious cases.
7. Measure recurring baseline (section 10): actual executions/category invocations/refills/retries, tokens and spend where available, rows/bytes read, generated versus imported versus approved counts. If provider billing cannot be accessed, distinguish estimated usage from measured dollars. Propose one-time and monthly caps before paid bulk evaluation/backfill.

**Exit:** sanitized audit report, private checksummed backup inventory, exhaustive writer map, labeled evaluation set, six-family inventory, baseline/cost proposal, and Phase 1 handoff. Any live containment pause is a separate operational change: first prepare the concrete resume/rollback instructions; do not silently disable the workflow in an audit.

## 6. Phase 2 — shared fact comparison and cleanup dry run

**Model: GPT-6.1 Sol / high.** Implement locally and evaluate; no database cleanup.

1. Create one versioned Speed-only comparison package usable by Node CJS scripts and server TS code, with a typed server adapter. Avoid duplicating thresholds or normalization in generator/import/admin routes. The exact module arrangement must fit current build/test tooling.
2. Load the complete current Speed corpus once per run, including pending, active and historical deleted facts, with answer text and applicable context. Detect incomplete reads, unexpected schema, stale revisions, and malformed content. Missing credentials/database/model dependencies mean **unverified**, not an empty successful corpus.
3. Layer checks: exact normalized identity; alias-aware entity/fact lookup; lexical retrieval; semantic retrieval over question **and answer**; explicit semantic adjudication of retrieved competitors. Choose the lowest-cost combination passing the evaluation. Embeddings are a retrieval aid, not proof of uniqueness; a free-form model-generated `fact_key` is not a trustworthy universal identity. Use multiple retrieval routes and measure retrieval recall separately from adjudication quality. Search all Speed categories, including within the candidate batch.
4. Persist/cache derived entity IDs, fact descriptions/relations/qualifiers, candidate matches and optional embeddings by content hash plus extractor/model/policy version. Metadata from retired duplicate wording remains usable. Changes to question, answer, image context, pool or format invalidate evidence. For entities, distinguish primary subject from distractors and disambiguate same titles/names.
5. Return `duplicate`, `unique`, or `uncertain` with matched row IDs, fact-level explanation, policy/model versions, content hash, and corpus revision. Any timeout, missing result, truncation, incomplete retrieval, bad schema, or exhausted budget prevents admission. Keep uncertain/duplicate generated candidates in an internal report/quarantine, **outside the normal Trivia Questions approval queue**.
6. Produce a dry-run retirement manifest from the same engine: active-active, active-pending, pending-pending, and matches to deleted history. Choose an accurate/unambiguous/clean keeper; prefer a sound already-approved keeper when comparable, then quality, historical reference stability, oldest timestamp, and ID for deterministic ties. If all variants are wrong/ambiguous or the best keeper is only pending, do not promote it silently; hold that group for ordinary approval or a small decision list.
7. Every proposed retirement includes exact ID/slug, old status/content hash, keeper or reason no keeper, explanation and confidence/evidence, matched fact, expected references, and changed-field list. Separate clear duplicates from unresolved cases; uncertain active questions are not automatically removed.
8. Required evaluation: **zero escapes on all six example families and held-out labeled duplicates**, at least **95% acceptance of labeled distinct facts**, and zero escapes on deterministic exact cases. Publish raw counts and retrieval recall; a small test set proves those cases, not universal recall. If gates fail, improve retrieval/labels/adjudication instead of lowering the bar or asking Andrew to accept repeat questions. Freeze a versioned release evaluation set.

**Exit:** shared module, meaningful tests, benchmark/cost comparison, sanitized proposed cleanup summary, private dry-run manifest, and handoff. No new provider/model selected merely because it is newer.

## 7. Phase 3 — prevention at every writing boundary

**Model: GPT-6.1 Sol / high.** Build application changes and new migration files locally; production migration requires the project’s explicit `db push` confirmation.

1. Update the nightly coordinator to read database inventory once, choose underused subjects/subtopics, and pass the checked corpus/index to category generation. Show the model relevant reserved facts and subjects before generation; inspect candidates afterward using Phase 2. Never rely on prompt instructions alone. Share newly admitted in-run candidates across categories and refill attempts.
2. Make 100 a maximum accepted count; impose a global candidate, token/spend, retry and elapsed-time budget. Do not multiply unlimited refill attempts by categories and fallbacks. Allow zero novel questions; emit a clear run summary. Corpus or admission-service failures stop import for affected unverified output even if `--allow-category-errors` remains for harmless category generation failures. Separate fatal verification failure from a shortfall.
3. Gate direct generator execution, importer, admin create/edit/bulk approve/pool conversion and restore paths. Existing trusted unchanged-row reimports are idempotent, not self-duplicates; changed content must be checked excluding only its own current version. No approvals or upserts may resurrect retired duplicates. Retire unsafe blanket restore behavior and disable legacy Speed writers that cannot use the shared gate; preserve Live-only behavior.
4. Close concurrency gaps with a **database-enforced admission protocol**, not just GitHub workflow concurrency. Semantic work happens outside a transaction; the service-only write RPC validates a server-issued check bound to content hash/policy and a current corpus revision under a shared lock, atomically inserts/updates content + metadata, and advances that revision. If another question changed the corpus after checking, refuse the stale check and recheck bounded deltas/retry. Two paraphrases with different fact keys checked against one old revision must not both commit. Database uniqueness remains a backstop for exact identity.
5. Prevent direct Speed INSERT/content changes/status resurrection from bypassing admission via reviewed trigger/privilege design; any trigger must cover pool conversions too and remain compatible with Live imports. Enumerate and test privileged service-role routes; adding an RPC while leaving arbitrary Speed DML unguarded is not sufficient. New speed rows start pending only after passing admission; default metadata `clear` is insufficient.
6. Approval checks both current content and current corpus, using cached valid evidence where sound. Show precise conflict information for manual creates/edits/approvals without adding generated duplicates to the normal queue. Bulk operations enforce the same invariants within their batch. An internal uncertainty report can support troubleshooting; it is not another large approval burden for Andrew.
7. Build cleanup and undo tools with dry run as default, explicit immutable manifest input, expected old hashes/statuses, recorded before/after state, transaction/bounded atomic batches, resumability, idempotence, and keeper validation. Never recompute a different retirement list implicitly at apply time. Guard cleanup and undo against intervening content/status changes; rollback must not restore a row now conflicting with a new keeper.
8. Reuse existing duplicate metadata only if useful; otherwise add narrowly scoped versioned metadata/run records. Read `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` before SQL. New timestamped migrations only, explicit grants, RLS, pinned `search_path`, restricted service-only RPC execute rights. Do not edit old migrations, `lib/supabaseAdmin.ts`, `.env.local` values, or `vercel.json`.

**Exit:** reviewable diff, safe release/backfill/rollback runbook, cleanup/undo tooling, and handoff. Must test missing credentials, >1,000-row pagination, deleted history, batch/cross-category duplicates, aliases/reversals, distinct same-artist facts, edits/pool changes, stale revision races, retries/fallbacks, direct-write bypasses, idempotent reimports, budget exhaustion, and unchanged Live behavior. Exercise SQL/concurrent sessions in an isolated database; no paid generation or cleanup against production as a test.

## 8. Phase 4 — review and release prevention

**Model: GPT-6.1 Sol / high.** Prevention goes live before cleanup; incomplete rollout must not reopen the old unsafe writer.

1. Review implementation and threat/race paths; fix findings. Run targeted tests and full gates. Prepare a concrete release manifest with commits, schema prerequisites, cost caps, writer coverage, backup locations, temporary generation pause, resume steps, and rollback instructions.
2. Reconfirm live rows/schema and snapshot drift. Before activation, prepare/backfill comparison metadata for all relevant Speed rows under the agreed one-time cap, with checkpoints. This is derived metadata, not retirement or content editing. Do not treat legacy rows as checked merely because a column defaults to `clear`.
3. Present the actual migration and rollout procedure for required production confirmation. `CLAUDE.md` says “`supabase db push` applies to the LINKED PRODUCTION database and always asks first; never run it unprompted.” Phase instructions are not permission to skip this boundary. Do all local preparation first. Ask only for steps genuinely lacking prior authorization.
4. Coordinate schema, server deployment, and workflow rollout so no legacy Speed writes pass during transition. A brief Speed-generation pause may be part of the prepared release; existing approved gameplay continues. Verify deployed revisions and all admission prerequisites before resuming. Rollback stops admission/generation if checks are unavailable; it does not restore unchecked importing.
5. Run one capped manual Action and verify fresh safe pending rows (or documented valid zero-output), absence of duplicate/uncertain rows in normal review, report counts, approval/edit behavior, and preserved Live import behavior. Record GitHub run ID, commit, Vercel deployment evidence, migration ID, corpus/policy versions and measured spend. If no candidates pass, additionally prove the success path in isolated/staged testing.

**Exit:** prevention verified live, agreed budget enforced, actual release facts recorded, and handoff. Do not mark deployed merely because code was pushed.

## 9. Phase 5 — apply existing database cleanup

**Model: GPT-6.1 Sol / high.** Use the released engine; preserve history.

1. Refresh the dry run against current database state. Diff from Phase 2, validate keeper eligibility, freeze a checksummed manifest, and take a fresh recoverable backup. Resolve disputed groups without making Andrew review obvious repeated wording one at a time. His keep-best/retire policy is already authorized; do not re-ask it. Present exact counts and any material departure or disputed action before destructive work.
2. Retire clear redundant pending rows and active rows using `status = 'deleted'` plus retirement/keeper metadata and durable fact memory. Keep IDs/slugs/text/options unchanged so historical references remain readable. **No physical DELETE, no removal of answer/session records, no score/reward repair.** Ambiguous groups remain unresolved with an explicit report.
3. Apply with hashes/status/revision checks, audited atomic batches, expected counts, checkpoints and undo data. Stop on drift or mismatched counts; do not broaden the manifest to compensate. Account for already-issued Speed questions: historical/in-flight answer lookup must still work even though new selection excludes retired rows. Avoid Live replacement routines.
4. Verify every manifest row and keeper, active/pending counts, new question selection, historical/in-flight access and unchanged player-record aggregate counts. Re-audit retained corpus with the released checker; ensure reported families have at most one approved/pending representative per fact, or are fully retired for documented accuracy reasons. Record all unresolved items; do not label them cleaned.
5. Export approved Speed rows through the existing Admin Review GitHub PR flow; inspect whole retired-only categories and stale file deletion so exports cannot keep ghost questions. Export direction is database → Speed JSON. Never run the mixed-pool `trivia:sync` script or rewrite Live files. Guard import/backfill against reintroducing any old export.
6. Demonstrate retired facts stay blocked via isolated tests and a live read-only/dry-run replay; test undo on a copied database, not by briefly restoring duplicates to production. Store exact applied IDs only in private manifests; put sanitized counts/checksums/paths in docs.

**Exit:** verified applied cleanup, preserved history, checked export PR state, remaining uncertainty explicitly listed, private backup/undo location recorded, and handoff. “Retired” means removed from active play/review while retained in the database for history and duplicate memory; Andrew explicitly selected this preservation policy.

## 10. Cost constraints and Phase 6 monitoring

**Phase 6 model: GPT-6.1 Sol / medium**; optional Luna/medium for mechanical reporting only.

Current actual cost is unknown; Phase 1 measures it. Keep Gemini generation initially unless an evaluated alternative is more cost effective. A stronger generator alone is not duplicate prevention. Compare existing-provider semantic checking with cheap alternatives on the same fixed evaluation; any paid trial has a stated cap.

Let `N` = current Speed rows including retired history, `S` = measured compact corpus bytes/row, `P` = page size, `G` = generator child invocations (including refills), `M` = generated candidates, and `K` = retrieved competitors per candidate.

- Current approximate corpus traffic: `(G + 1) × N × S` bytes/run (children plus import), with roughly `(G + 1) × (ceil(N/P) + possible terminating page)` queries and additional retry traffic. Repeated whole-table loading inside per-category children is avoidable.
- Proposed small/medium-corpus baseline: **one complete paginated corpus load per nightly run**, plus bounded changed-row reads at final admission. Global corpus includes historical fact memory. No full-corpus prompt per candidate; no API call for every possible pair. Build an in-memory index from the shared load; persist content-derived metadata so only new/edited rows are reprocessed. Approval/edits should use indexed bounded retrieval, not a full scan per tap.
- Illustrative, **not measured**: `N=10,000`, `S=1 KB`, `G=8` gives about **90 MB/run / 2.7 GB per 30 nights** today versus **10 MB/run / 0.3 GB per 30 nights** for one load, excluding vectors, deltas, retries and protocol overhead. At 100,000 rows those numbers multiply by ten; then evaluate indexed server retrieval or an incremental versioned cache instead of nightly whole-corpus/vector downloads.
- One-time processing should scale with changed rows and retrieved candidate pairs, approximately `N × K`, not all `N(N−1)/2` paid comparisons. For `N=10,000`, `K=20`, that is up to 200,000 directed retrieval hits before deduplication versus 49,995,000 unordered pairs. Completeness still requires measured retrieval recall and sampling of non-matches; cheap retrieval cannot silently exclude hard paraphrases.
- Runtime target: up to 100 accepted questions/night = 3,000 per 30 nights; cap generated candidates separately. Initial proposed ceiling **200 candidates/run**, subject to measured yield and agreed spending; a shortfall is acceptable. At 10× target volume, repeat usage estimates for 1,000 accepted and up to 2,000 candidates/night. Batch semantic decisions, bound retrieval tokens, cache results, and cap all retries/fallbacks globally.
- Official standard API rates checked 2026-10-12: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) **$2/M input, $10/M output**; [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) **$0.10/M input, $0.50/M output**. Illustrative checking load of 500,000 input + 50,000 billed output tokens/night = **$1.50/night / $45 per 30 nights for Sol**, or **$0.075/night / $2.25 per 30 nights for Luna**. At 10× load: $450/$22.50 per 30 nights. Include billed reasoning tokens, retries, extraction, embeddings/storage, generation and runner time separately; these figures are not a quote for the finished system or chat costs.
- Provider retries can multiply those estimates; use a conservative 2× retry sensitivity estimate as well as measured averages. Enforce cumulative token/request ceilings with worst-case remaining output reserved before issuing requests, not just an after-the-fact cost log.

Before release, give Andrew a plain-English measured baseline, proposed capped monthly spend and one-time audit/backfill spend, quality benefit, and lower-cost alternative. A materially higher recurring-cost design needs his informed decision. Do not silently select paid embeddings/a new provider or send the entire database into every generation prompt.

After release observe **seven consecutive scheduled runs** (zero novel output counts as a run, but successful admission/approval must also have been verified). Report generated/blocked/uncertain/admitted counts, duplicate reasons, top subjects, retrieval misses discovered, review backlog, latency, retries, rows/bytes, tokens and spend per admitted and approved question. Run a bounded incremental audit of new admissions rather than re-auditing the whole bank daily. Tune diversity and prompt scheduling without weakening frozen correctness gates; changes to comparison policy invalidate affected evidence and rerun evaluation. Record any Andrew-reported duplicate as a regression immediately.

**Exit:** seven-run evidence, baseline versus actual cost/performance, budget adherence, disposition of all cleanup questions, deployment record, updated context pointers and final handoff. No claim of complete cleanup while unresolved duplicate groups remain.

## 11. Validation, handoffs, and new chats

Existing commands, to be run when appropriate to implementation:

```sh
npx vitest run tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run build
git diff --check
```

Add meaningful comparison/admission/cleanup behavior tests and an isolated SQL harness; exact new commands belong in each implementation handoff. Do not run typecheck concurrently with build (`.next/types` regeneration). Node 20 is used in Actions; local scripts must remain compatible with it. No tests or paid model runs are required merely for this planning-only document.

Every phase, including a partial stop, must create `docs/speed-trivia-uniqueness-plan_PHASE_<N>_HANDOFF.md` and update this status line **before** calling it finished. Open with a nontechnical developer summary, then address the next agent with scope/out-of-scope; exact branch/commit/dirty/push/deployment/database/backup/undo state; recorded answers and decisions; changed paths/key functions; traps/permissions; exact commands/results and unknowns; open questions; and next steps/model/effort. Do not include secrets or private player evidence.

Starting a new chat at substantial phase boundaries usually reduces the accumulated context carried into subsequent work; it still costs tokens to read project rules, this plan, the latest handoff and relevant code. Exact savings depend on caching, compaction and account billing, so no numeric savings are promised. Restarting during one debugging/release/cleanup transaction usually wastes context and can increase tokens. Phases 5–6 can share a chat when the prior context is modest.

Copy into a new chat:

> Read AGENTS.md, CLAUDE.md, SYSTEM_CONTEXT.md, docs/speed-trivia-uniqueness-plan.md and its latest phase handoff. Execute Phase N only using the model/effort listed in the plan. Preserve the recorded decisions and Speed/Live separation, measure and cap paid usage, and leave unrelated working-tree changes alone. Prepare concrete production actions before any required confirmation. Write the phase handoff and update plan status before reporting completion.

Open decisions after Phase 0: none required to begin Phase 1. Choose budget after measurement; request developer input only for disputed factual labels/keeper choices or material scope/cost changes. Credentials or billing access needed later must be identified precisely, without exposing existing secrets.
