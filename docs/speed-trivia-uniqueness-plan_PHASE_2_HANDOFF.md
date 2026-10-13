# Speed Trivia uniqueness — Phase 2 handoff

Date: **2026-10-13, America/New_York**. Next phase: **Phase 3 only, GPT-6.1 Sol / high**.

## Developer summary

Phase 2 is complete locally. The shared checker passed the frozen repeated-fact tests, including all six reported examples, and accepts at least 95% of labeled distinct facts. A bounded dry run proposes retiring **849 active and 1,618 pending questions**, preserving **968 approved keepers** and past game references. **Nothing changed in production or gameplay.** Uncertain cases and unexamined comparisons are recorded; this is not a claim that the entire bank is cleaned.

Next comes Phase 3: guard every writing path, improve generation's subject planning, and build safe cleanup/undo tools. Phases 4–6 release prevention, apply reviewed cleanup, then monitor quality/cost. When complete, Speed Trivia should stop repeating known facts, draw from broader subjects, and retain historical game records. No production confirmation is needed now; migration rollout and any recurring budget still require the later concrete decisions.

Conservative Phase 2 API accounting: **$4.9012484 total**, below the separately approved **$5 benchmark + $10 audit** caps. The naive uncached recurring checker is too expensive for the earlier unapproved $20/month proposal; Phase 3 must optimize/measure and settle the recurring cap before release.

## To the next agent: scope and goal

Read `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, this handoff, `docs/speed-trivia-uniqueness-phase-2-engine.md`, `docs/speed-trivia-uniqueness-phase-2-cleanup-summary.md`, and the Phase 1 writer map/audit.

Execute **Phase 3 only**: integrate this comparison package at every Speed writer, coordinate one complete corpus/index per run, add global candidate/token/request/spend/retry/time limits and diversity planning, implement a service-only atomic admission protocol and direct-write bypass protection, and create manifest-bound cleanup/undo tools plus a release runbook. Write new timestamped migrations locally after reading `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`. Preserve Live-only imports and historical/in-flight answer access.

Out of scope: deploy, `supabase db push`, apply retirements, alter points/rewards/history, physically delete questions/records, restore retired duplicates, regenerate Live JSON, change cron configuration, silently select a new generator/provider or run paid generation. Build/review concrete release actions before asking for production confirmation. The Phase 2 manifest is **not an apply input**: `applyReady: false`, metadata schema/protocol absent, non-exhaustive audit, and outstanding keeper holds.

No delegation was requested or used. The plan recommends Sol/high; do not change model/effort or introduce agents merely to format reports.

## Starting branch, commit, dirty state and deployment

- Workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: **`main`**. HEAD remains **`96b88658dfeeb42ef88aa09fb858d9d794631e04`** (`Partner email redesign, NFL Pick 'Em UI polish, theme token updates`). No Phase 2 commit/push/PR/deployment exists.
- Operational repository: **`AndrewSerulneck/Trivia-Predictions`**. `package.json` names another repository; do not derive GitHub targets from it.
- Phase 0–1 plan/docs/scripts/tests/fixtures remain uncommitted/untracked. Phase 2 adds the files listed below and modifies only `eslint.config.mjs`, the untracked plan/status and fixture README. No existing application writer was changed.
- Preserve pre-existing modified **`next-env.d.ts`** and untracked **`.vscode/settings.json`**. Do not stage/restore them as part of this work. Recheck HEAD/worktree at entry because Andrew can continue editing.
- Linked production project: **`pkmxupsayzshvpirkaav`**. No migration was created or applied; no cleanup/approval/restore/export or player write occurred. No undo log is needed: zero production mutations.
- Nightly workflow remains active/unchanged. No dispatch/pause/rerun/cron edit. Phase 2 made no GitHub/Vercel operational query, so deployment and latest nightly run state were not independently reverified. Phase 1 last observed successful run was **38227838099**, source **`0931f553d3f0bc57b4f00b1030787bd270740eaa`**; that is dated evidence, not proof of the current live release.
- Dev/build/test calls can load the existing app environment, but no browser/gameplay/real payment test was run. `.env.local` was only loaded by authorized commands; no value was displayed, changed or archived. `lib/supabaseAdmin.ts`, `vercel.json`, old migrations, Speed/Live content files and all live writer routes are untouched.

## Data, snapshot, private manifest and recovery

Fresh read-only snapshot directory:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z/
```

- Snapshot: **2026-10-13T04:06:04.571422Z**, October 13 **12:06:04 AM EDT**; single MVCC ordered page capture, **13,801 rows / 56 pages**. Count/content revision verified independently after capture.
- Rows: **5,136 active / 8,663 pending / 2 deleted**. All nine Speed categories; zero live images. Corpus MD5 audit revision: **`bf59e8249cba428662dd8c33e50b61c1`**. Comparison SHA-256 corpus digest: **`6de29b4cac5dd97946d1e948dd076f5eaa49ed96b273ad7a385a0f9d474859c1`**.
- Question file: **11,975,215 bytes**, SHA-256 **`48b4f0a58866ffc49d6b7b836fcac748c3a85145fcc4438db0b8b280d771b2b1`**, byte-identical to Phase 1. Capture transferred **10,012,364 bytes**; refreshed supplemental dependency/reference evidence **500,847 bytes**.
- `dependencies.json` has **5,695 per-question reference groups**, including non-FK `user_seen_questions`; counts are aggregate-only, no player IDs/answer records exported. It is captured separately from the question transaction. `six-families.json` wraps original family evidence with its source and verified identical corpus revision; it is not a new live query.
- Final SELECT-only revision check at **2026-10-13T04:39:32.800Z**, **12:39:32 AM EDT**, still found **13,801 rows / identical revision**; response **76 bytes**. Evidence: `phase2-dry-run/revision-after.json` plus checksum.

Completed private audit directory:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/phase2-dry-run/
```

Authoritative final artifacts, each with an adjacent `.sha256`:

1. **`retirement-manifest-1791866241862.json`** — **10,446,027 bytes**, SHA-256 **`9c8e8023c7d1f4169d7317f777e1c9d66ef778052da479c376ffeee3056b650c`**. Exact IDs/slugs/hashes/statuses, direct keeper comparisons/quality, expected references, changed fields, proposed soft statuses and unresolved items. **2,467 proposed retirements / 968 active keepers**. No keeper occurs in the retirement set. All old/keeper hashes/statuses and direct high-confidence soundness edges independently verified in `verification-final.json`.
2. **`retrieval-and-coverage-1791866241862.json`** — **138,425,990 bytes**, SHA-256 **`7b5c1e0725e780a941c2a3c93ec472cea468a4f295865742073e76ac6f802e0b`**. Every row's retrieved competitors and pair coverage. Large private JSON: read projections, not print it wholesale.
3. **`derived-facts-1791866241862.json`** — **11,587,992 bytes**, SHA-256 **`bc86ceaccd44397343cd3c7a7eb2228653ab0eaf43e0d3bb45775b186504ba5a`**. Version/content-bound answer entities, primary mentions, descriptions, qualifiers and lexical/concept features, including deleted wording.
4. `adjudicated-pairs.jsonl`, `pair-cache.jsonl`, `budget.jsonl`: resumable evidence and persistent spend ledger. No lock remains. Earlier timestamped manifests/coverage/derived files are **partial attempts**; preserve for provenance but do not report their counts as final.
5. `verification-final.json`, `revision-after.json`, their checksums: final independent integrity/guard/reference/family and live-drift evidence.

Coverage: **319,335 retrieved unordered edges**; **10,623 selected edges / 1,710 retrieval components**. Final pass accounted for every selected edge with **7,156 direct lookups** and **3,467 redundant edges covered by directly verified keeper groups**. Cumulative resumable evidence has **6,882 unique judged pairs**, including **155 new direct keeper comparisons** outside the initial retrieved-edge set. **312,608 original retrieved edges lack their own semantic verdict**; this includes represented group edges. Do not call them distinct or the audit exhaustive.

Unresolved: **6,279 overlapping entries covering 3,957 distinct rows** (1,210 active / 2,746 pending / 1 deleted). These are not individual approval tasks for Andrew. Scope/accuracy/model-result holds, pending-only keeper groups and unproven keeper edges remain internal. Original family proposed/remaining counts: Gobi **3/1**, Eras **11/7**, Africa **13/4**, longevity **12/13**, Sputnik **4/1**, Olympia **4/1**. **Do not claim Eras/Africa/longevity are fully consolidated.** More precise reasons/counts are in the sanitized cleanup summary.

Proposed rows have **370 trivia-answer / 860 answer-variant / 2 user-seen references**. Preserve every reference and row's content/ID/slug. Hypothetical post-application counts of this exact list would be **4,287 active / 7,045 pending / 2,469 deleted**, but **production remains 5,136 / 8,663 / 2**. Phase 5 must obtain fresh evidence and resolve remaining cases after prevention is live. No historical score/reward repair is authorized.

Durable same-Mac private archive:

```text
/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase2-2026-10-13.tar.gz
```

- **33,434,398 bytes**, SHA-256 **`569575a2ab4362d26f8782a726dacb5a4e6bc64d1e8b2d28043fbf5107a666cc`**; matching `.sha256` beside it. New exclusive file; Phase 1 archive untouched.
- **81 indexed files / 82 archived files**, including final evidence, whole benchmark directory, fresh snapshot/reference evidence, frozen fixtures and comparison source. Inventory: workspace `tmp/speed-trivia-uniqueness-private/phase2-artifact-inventory.json`, SHA-256 **`fd26f1b0b052f94fad78000d4f72a60aa76bc5334718cbbe1d55781e9f654fdd`**. The archive excludes `.env.local`, player identity/history records and unnecessary repeated partial large artifacts.
- Recovery reopened/extracted the archive into **`/private/tmp/speed-trivia-phase2-restore-75op5339/`**, verified all **81 indexed hashes/lengths**, then passed `verifyBackup()` on restored snapshot: **13,801 rows / 56 pages / 9 primary files**. Recovery directory is ephemeral.
- Packaging/recovery records: `tmp/speed-trivia-uniqueness-private/phase2-archive-record.json`, `phase2-recovery-record.json`; source packaging script `package-phase2-evidence.py`. **Off-device/Time Machine/iCloud recovery remains unverified.** Obtain fresh recoverable/off-device evidence before production mutation; Phase 1 durable archive also remains intact and covers identical bank content.

## Decisions already made; do not re-ask

Andrew's October 12 decisions remain: keep the best repeated fact, retire others softly, preserve history, allow different facts about the same artist, make 100 a maximum and accept zero novel output, measure spending before selecting caps, prefer Sol engineering with cheaper models where adequate.

During Phase 2 Andrew approved **$5 benchmark**, then explicitly approved **a separate $10 dry run**, saying to avoid more than that. Combined authorization is **$15 total for this Phase 2 work**, not a recurring allowance. The large exhaustive pair audit was **not** approved or run. No monthly cap, paid generation trial or provider migration was approved. Use the existing ledgers if completing genuinely missing Phase 2 work, not fresh directories that reset spending.

Andrew asked whether another LLM would produce broader/more unique questions. Answer recorded: comparison and generation breadth are different evaluations. Current generation supplies only 15 recent local examples and no global fact/subject memory; Phase 3 must improve planning first. Gemini was tested as a checker, not proven the best generator. No stronger/newer generator was silently selected. A future generator comparison needs equivalent diversity inputs, measured novel yield/accuracy/breadth/cost and an approved capped trial.

Novelty is required knowledge plus correct answer, material qualifiers and image context. Category, spelling aliases, option order, reversal and extra clues do not supply novelty. No lifetime artist/song/album ban. Combined largely repeated facts are held/blocked. Deleted facts stay reserved; no `clear` default counts as checked evidence. An accurate pending-only keeper cannot be promoted silently. Every retirement needs direct keeper evidence, not similarity-chain inference.

## Changed files and key functions

- **`lib/speed-trivia-uniqueness/core.cjs`**: `content()`/`contentHash()`, normalization/aliases; `derive()`; `createCorpus()`/`loadCorpus()`; `buildIndex()`/`retrieve()`; `deterministicPair()` contradiction/exact guards; `pairKey()`; `checkCandidate()`; `checkBatch()`. One policy/normalization/threshold source. Batch builds one initial index and incrementally reuses features/hashes across categories.
- **`core.d.cts`, `gemini.d.cts`, `retirement.d.cts`**: CJS declarations for strict TS import resolution. **`types/speedTriviaUniqueness.ts`**: shared row/corpus/index/decision/evidence/reader types, no `any`.
- **`lib/speedTriviaUniqueness.ts`**: typed `server-only` injected adapter, `loadSpeedTriviaCorpus()` and `createSpeedTriviaChecker()`. No route imports it yet. No Supabase admin boundary modification.
- **`gemini.cjs`**: `buildPrompt()` (question/answer/context only; no labels/rationales/source IDs), `modelVersion()`, `createJudge()`. Default batch **1**, temperature 0, thinking 0. Explicit configuration/cache/usage validation; reserves worst-case bytes/framing plus output before calls; sanitized errors; no automatic retries in the admission dependency. Cached quality is directional.
- **`retirement.cjs`**: `rankKeepers()`, `qualityScore()`, `createRetirementManifest()`. Sound approved preference, clean wording/reference/age/ID tie-breaks; direct edges, uncertainty/pending/deleted holds, no promotion/apply.
- **`scripts/speed-trivia-phase2-support.cjs`**: `readSnapshot()` calls Phase 1's complete backup verifier; `fixtureRow()` pads authored one-option comparison examples with a neutral evaluation-only distractor without changing frozen inputs; `writeExclusive()`/checksums, private-path enforcement, `openBudget()`/`openCache()`.
- **`scripts/evaluate-speed-trivia-uniqueness.cjs`**: frozen checksum validation, complete-bank retrieval metrics and isolated judgment; original or `--fixture` supplementary set; bounded concurrent isolated requests and offline cached replay. Distinct fact acceptance is separate from full-bank novelty.
- **`scripts/dry-run-speed-trivia-retirement.cjs`**: `buildAudit()`/`componentsFor()` for work selection; selected-edge agenda, direct keeper rewiring, shared in-flight/cache/ledger, partial-safe artifacts, one retry per transient failure (max 50/process), conservative uncertainty quarantine, persistent reference/coverage/manifest outputs. Default prints/writes plan; no apply mode exists. Selected components are not authoritative semantic groups.
- **Tests**: `tests/lib.speed-trivia-uniqueness.test.ts` (12), `lib.speed-trivia-semantic-provider.test.ts` (5), `scripts.speed-trivia-retirement.test.ts` (4), `speed-trivia-uniqueness-release.test.ts` (4). Pagination/revision/missing dependencies, all statuses, aliases/reordered answers/reversal, image/context changes, batch/cross-category, same-artist distinct facts, exact conflicts, overflow/budgets/timeout/schema/cache orientation, nested immutability, stable keeper/non-transitive manifests and frozen recorded-dependency replay.
- **Fixtures**: original `evaluation-v1.json` unchanged; `release-evaluation-v1.json` + checksum; `evaluation-fresh-v1.json` + checksum; `release-fresh-evaluation-v1.json` + checksum; README update. Raw model replies are sanitized to question-derived comparisons, no real UUID/slug/player evidence in public fixtures.
- **`eslint.config.mjs`**: narrow override reuses Next's existing TS parser for `.d.cts`, which Next's default TypeScript glob omits. No new dependency/configuration change elsewhere.
- **Docs**: this handoff; engine/cost/evaluation record and cleanup summary; plan status link. No Phase 3 migration, writer guard or cleanup apply/undo script was started early.

## Evaluation, costs and facts/traps

Versions: **policy `speed-facts-v2` / extractor `answer-concepts-v2` / retrieval `union-answer-bm25-concepts-v4` / model `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`**. Google reported actual model **`gemini-2.5-flash`** for settled calls.

Original frozen **272 pairs**: duplicates **137/137 blocked/retrieved**, distinct **122/124 accepted (98.39%)**, uncertain **0/11 admitted**. Original held-out **43/43 blocked/retrieved**, **36/37 distinct accepted (97.30%)**, **0/4 uncertain admitted**. Mandatory **8/8 across 6 families**, exact **11/11** blocked. No threshold/label was relaxed.

The original held-out retrieval miss was inspected during general answer-order diagnosis. **Do not call final v1 an untouched blind test.** Supplementary **36 cases** (18 duplicate / 18 distinct, nine categories) were frozen after final core/provider hashes and before scoring; **18/18 blocked/retrieved and 18/18 distinct accepted**, with no subsequent policy adjustment. They are self-curated, not independently expert-certified. Offline tests pin frozen code hashes and replay actual engine results using recorded provider decisions. Finite fixtures are not universal recall/accuracy proofs; image annotations are synthetic, not image-recognition evidence.

Original fixture SHA-256: **`44d2056a27e30d317f7b7b4e30185a3c7a60b53ca1ce09c8a44f847a68e37045`**. Release evidence SHA-256: **`9437bdffe212cce0ed9fe6b9f8b05565ae9cafe02e090430555cd74373e2900f`**. Fresh input: **`828933ef70ce633a206a645387fca0181402f6ab3a582612cf7706de2730142e`**; fresh release evidence: **`712a916d68a142a23102b577f08136ca6108abfb2f9aec4471b323dcec72640c`**. Do not rewrite these frozen files to accommodate later failures; version/changelog and independent evaluation are required for policy changes.

Benchmark private directory: `tmp/speed-trivia-uniqueness-private/phase2-benchmark/`. Final original full report **`evaluation-gemini-2.5-flash-thinking-0-all-1791864674436.json`**; fresh report **`evaluation-gemini-2.5-flash-thinking-0-all-1791865467839.json`**. Filenames alone do not identify fixture/version/batch; inspect report fields. Earlier reports are intentional failed experiments. The final original report used the refreshed byte-identical snapshot and offline cached decisions. All private comparisons are keyed by content/policy/extractor/model; fixture `sourceHash` is a hash of a UUID, **not content evidence**.

**Budget accounting:**

- Benchmark: **$0.6188671 measured**, 807 settled requests, **591,507 input / 176,566 output tokens**, plus **$0.053978** unknown-attempt reservations (3). Conservative **$0.6728451 / $5**.
- Audit: **$4.0021683 measured**, 6,148 settled requests, **4,150,136 input / 1,102,851 output tokens**, plus **$0.226235** unknown-attempt reservations (10). Conservative **$4.2284033 / $10**. Final pass had zero transient retries; cumulative accounting includes earlier outages and helper restarts.
- Combined conservative **$4.9012484 / $15**. Not invoices; current generation dollars remain unknown. Published rates and recurrence estimates are linked in the engine document.

Multi-pair Flash requests contaminated comparisons and failed gates. Turning on 1,024 reasoning tokens did not reliably fix that. Isolated zero-thinking requests passed and were cheaper. **Flash-Lite endpoint returned HTTP 404**; no quality benchmark could be completed for it. No OpenAI key was evidenced; no other provider was used. The smaller 6+6 retrieval experiment missed examples and was discarded. Aliases replace in one pass to avoid recursive expansion; reordered answer token sets only retrieve, never prove identity. Small corpora compare all rows to avoid empty-hit evaluation optimism. Full-corpus missing hits still require a candidate soundness check.

A naive uncached path costs about **$0.00049/pair**, at mean **37.11** retrieved competitors. **200 candidates ≈ $3.63/night / $109 per 30 nights**, or **$218 at 2× retry sensitivity**, excluding generation/manual checking/storage. At 10× candidates: **$1,090/$2,180 per 30 nights**. These are not approved costs. Exact/early rejection, cache reuse and better bounded indexed retrieval can reduce measured use; do not silently release this recurrence under the unapproved $20/month proposal. One compact corpus load is roughly 6.02 MB/night / 180.64 MB per 30 nights versus Phase 1's estimated 46.38 MB/1.391 GB old multi-child pattern; production metadata transfer/storage costs are still unknown.

Audit helper interruptions occurred to replace redundant pair/connected-component loops with bounded selected-edge/direct-keeper work and to increase independent concurrency to 12. Only the identified audit PID was stopped; caches/journals preserved, in-flight spend conservatively retained. All selected edges eventually completed, final `failed: null`; no lock/running helper remains. Partial reports stay private. Do not delete stale budget locks unless the recorded PID is confirmed stopped; losing the ledger would reset an approved cap. Admission dependency itself never retries silently; audit retries have explicit limits and reservations.

Permissions: sandbox-network and exclusive local durable-archive writes were approved by automatic review. An initial network-sandbox call failed safely; `ps` inspection required escalation. **No auto-review rejection remained**, no production permission was requested/granted, and no secret was printed. Existing protected-file boundaries still apply.

## Exact commands and verification

Environment: local Node **v24.19.0**, existing `node_modules`, Python tar tooling; Actions Node20. No new dependency installed. Source APIs are Node20-compatible; **not executed under Node20**. Do not run typecheck concurrently with build.

Offline replay (no paid call), always reuse the existing ledger/cache directory:

```sh
node scripts/audit-speed-trivia-inventory.cjs --verify tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z
node scripts/evaluate-speed-trivia-uniqueness.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z --output tmp/speed-trivia-uniqueness-private/phase2-benchmark --batch-size 1
node scripts/evaluate-speed-trivia-uniqueness.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z --output tmp/speed-trivia-uniqueness-private/phase2-benchmark --fixture tests/fixtures/speed-trivia-uniqueness/evaluation-fresh-v1.json
npx vitest run tests/lib.speed-trivia-uniqueness.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-retirement.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/scripts.speed-trivia-inventory.test.ts tests/speed-trivia-uniqueness-evaluation.test.ts tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run build
git diff --check
```

Results: targeted tests pass; **final full suite 4,195 pass / 13 environment-gated skip / 0 fail, 351 passing files / 1 skipped**. Final typecheck/lint clean; **202-page production build passes**. An earlier full run hit the existing randomized `tests/lib.sportsBingo.nfl-star-tilt.test.ts:362` threshold exactly (0.3 rather than >0.3); isolated rerun passed all 12, subsequent full runs passed. No unrelated test/code was changed to hide it. Final logs: `/private/tmp/speed-trivia-phase2-final-tests.log`, `...-final-lint.log`, `...-final-build.log` (ephemeral). No SQL concurrency harness is claimed; Phase 3 must implement it.

Read-only live capture commands already executed:

```sh
node --env-file=.env.local scripts/audit-speed-trivia-inventory.cjs
node --env-file=.env.local scripts/capture-speed-trivia-dependencies.cjs tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z
```

Paid final commands already executed under the persistent approved ledgers; **do not rerun paid trials just for reassurance**:

```sh
node --env-file=.env.local scripts/evaluate-speed-trivia-uniqueness.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z --output tmp/speed-trivia-uniqueness-private/phase2-benchmark --paid --batch-size 1
node --env-file=.env.local scripts/evaluate-speed-trivia-uniqueness.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z --output tmp/speed-trivia-uniqueness-private/phase2-benchmark --paid --fixture tests/fixtures/speed-trivia-uniqueness/evaluation-fresh-v1.json
node --env-file=.env.local scripts/dry-run-speed-trivia-retirement.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z --output tmp/speed-trivia-uniqueness-private/phase2-dry-run --paid --cap 10 --concurrency 12
```

Archive verification: check the adjacent SHA, extract safely into a fresh temporary directory, hash every entry from `phase2-artifact-inventory.json`, then run the primary backup verifier on the restored snapshot. This was actually performed (81 indexed files and restored 9-file/13,801-row snapshot verified), not only proposed.

## Open questions, limits and recommended first steps

No developer answer is required to begin **offline/local Phase 3**. Pending decisions later: measured capped recurring budget and any paid generator/provider trial; genuine disputed fact/keeper cases after agent triage; concrete production migration/release confirmation; off-device recovery before cleanup. Do not ask Andrew to relabel obvious repeats or accept a lower correctness gate. Do not confuse unresolved edge entries with thousands of new approval tasks.

1. Check branch/worktree; read the Phase 1 writer map. Inventory every create/edit/approve/restore/import/pool-conversion and privileged direct SQL path before coding guards.
2. Design service-only admission under a shared database revision/lock. Semantic checks happen outside the transaction, then the atomic write must validate a server-issued content/policy/revision-bound receipt and reject stale checks. Guard arbitrary Speed DML and pool/status resurrection; adding an RPC alone is insufficient.
3. Reuse the package's policy/index/cache; measure the complete admission path and minimize calls/corpus transfers. Use one shared corpus per nightly run, bounded delta/retry checks, global candidate/time/token/spend ceilings. Do not copy normalization/thresholds into writers or use paid all-pairs bank comparisons.
4. Improve planning toward underused subjects/subtopics and expose relevant reserved facts before generation. Keep Gemini initially; generation breadth remains unbenchmarked. Share newly checked/quarantined facts across categories/refills; 100 stays a ceiling.
5. Build manifest-bound dry-run/default cleanup/undo tools, direct keeper/status/hash/revision checks, resumability/idempotence and copied-database undo tests. No actual retirement in Phase 3.
6. Preserve frozen original/fresh evaluation and rerun it for policy changes; establish new independent validation if needed. Add meaningful writer, stale-race, direct-write, reimport, edit/pool conversion, budget/fallback, deleted-memory and unchanged-Live tests plus isolated SQL/concurrent-session evidence.
7. Write the Phase 3 handoff/update plan before reporting completion. Keep production release/application and cleanup in their later phases; request approval only after concrete actions are prepared where prior authorization genuinely does not cover them.
