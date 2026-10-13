# Speed Trivia uniqueness — Phase 1 handoff

Date: **2026-10-12, America/New_York**. Next phase: **Phase 2 only, GPT-6.1 Sol / high**.

## Developer summary

Phase 1 is complete. The read-only production audit found **13,801 Speed questions: 5,136 active, 8,663 pending, 2 deleted**, and live repeats of all six reported facts. A complete checksummed question snapshot, privately preserved logs/schema/reference evidence, tested durable local archive, writer map, and **272 labeled evaluation pairs** are ready for the next agent. **Nothing changed in production or gameplay.**

The current checks let 23 of 43 held-out duplicate pairs through. Phase 2 builds the shared comparison engine and a cleanup **dry run**. Provider dollars remain unavailable; proposed caps are **$25 one-time / $20 monthly**, not selected or activated. No developer policy question is required to start offline Phase 2. Paid benchmarking/bulk processing needs an informed cap first; live schema changes/cleanup remain later phases.

## To the next agent: scope and first objective

Read `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, this handoff, and the audit/writer map. Execute **Phase 2 only**: shared versioned comparison module usable from CJS scripts and TS server code; complete-corpus loader/index; fact/alias and answer-aware retrieval plus semantic adjudication; content/version/revision-bound evidence; meaningful retrieval/adjudication evaluation; private dry-run retirement manifest; cost comparison and next handoff.

Speed scope is `question_pool='anytime_blitz'` plus `answer_format='multiple_choice'`, **all nine categories**, including pending/active/deleted history. Do not edit or regenerate Live JSON, change Live generation/grades/schedules, alter player/history/rewards/points, apply retirement, deploy, dispatch a paid Action, add writer prevention as a Phase 2 shortcut, or start Phase 3 migrations/cleanup tooling early. Phase 2 outputs no production content mutation. No delegation requested; the plan explicitly says this.

## Starting branch, code and operational state

- Workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch **`main`**, HEAD **`96b88658dfeeb42ef88aa09fb858d9d794631e04`** (unchanged throughout Phase 1).
- Operational repository **`AndrewSerulneck/Trivia-Predictions`**; package metadata names another repository and is misleading.
- Latest inspected nightly run: **38227838099**, number **218**, `schedule`, successful, source **`0931f553d3f0bc57b4f00b1030787bd270740eaa`**, start **2026-10-12T09:07:21Z**, finish **09:18:11Z**. GitHub compare shows this run source is **9 commits behind** the local HEAD, not ahead. Generator/nightly/import scripts and workflow YAML match exactly between those versions. Other deployment code was not independently verified live.
- Workflow is **active**; no disable/enable/dispatch/rerun, no deployment performed. YAML schedules 02:15 UTC, while 14 sampled starts are 08:02–09:07 UTC. Cause not established; do not change cron as part of this phase.
- Local docs/scripts/tests/fixture changes are **uncommitted and unpushed**. No Phase 1 commit, PR or release exists. No migration was created/applied. Existing HEAD push status was not independently reverified beyond repository compare access.
- Leave pre-existing modified **`next-env.d.ts`** and untracked **`.vscode/settings.json`** untouched. Phase 0 plan/handoff were already untracked. Recheck worktree/HEAD on entry; user work can continue.
- No production write, cleanup, restore, score/reward/player repair or paid model API call. Database linkage **`pkmxupsayzshvpirkaav`** verified. No undo log is needed: zero mutations. Future undo belongs to Phase 3/5's guarded protocol.

## Private data, backup and recovery

Complete capture directory:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z/
```

Complete `speed-questions.json`, **13,801 rows / 11,975,215 bytes**; SHA-256 **`48b4f0a58866ffc49d6b7b836fcac748c3a85145fcc4438db0b8b280d771b2b1`**. All content/IDs/slugs/answers/options/statuses/source/review/image/timestamp columns included; no player identity/answer export.

Snapshot at **2026-10-13T02:56:31.683326Z** = **October 12, 10:56:31 PM EDT**. Corpus MD5 drift marker **`bf59e8249cba428662dd8c33e50b61c1`**, MVCC **`4634704:4634704:`**. Single PostgreSQL snapshot returns **56 ordered pages of at most 250 rows** with count/ID digest/revision evidence; independent post-read full-content revision matches. MD5 is audit evidence, not the later secure admission content hash. Schema/reference reads have their own timestamps, not the same transaction.

Durable private archive:

```text
/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/2026-10-13T02-56-30-977Z.tar.gz
```

Archive **5,059,753 bytes**, SHA-256 **`e01970f67185121c6f91a968f11335ab9eb56707e52e3074022b96b3fff9fb3a`**. Matching `.sha256` beside it and a workspace copy under the ignored capture parent. Artifact inventory hashes 65 private files; including inventory/checksum there are 67 archived files. Inventory SHA-256 **`d3d848a2a2a02f2021925659580b22f503198e82e91061052eb979a7ef99551f`**.

Actual recovery test reopened durable archive, extracted it into `/private/tmp/speed-trivia-phase1-restore-f32x9a_5/2026-10-13T02-56-30-977Z/`, verified every indexed file, then passed the primary backup verifier (9 files, all rows/pages). Temporary recovery directory is ephemeral. **Off-device recovery/Time Machine/iCloud coverage is not verified**; this is a persistent same-Mac copy. Fresh backup and private off-device recovery must be verified before later production mutation. See `docs/speed-trivia-uniqueness-phase-1-backup-record.md`.

Important private files:

- `manifest.json` + `manifest.sha256`: immutable primary 9-file capture, request timings/bytes and completion flag.
- `speed-questions.json`, `snapshot-pages.json`: full content and page/MVCC evidence.
- `schema.json`: columns/defaults/constraints/indexes/triggers/functions/grants/RLS/FKs/installed migrations; query text next to it.
- `reference-counts.json`: aggregate FK preservation baseline; no user IDs.
- `dependencies.json`: 5,695 per-question/reference count entries, non-FK seen counts, pool counts/defaults/extensions/SQL-function scan. Never infer these later counts share the corpus transaction.
- `six-families.json`: exact real IDs/slugs/options/answers/status for all six mandatory families.
- `pair-shortlist.json`, `distinct-shortlist.json`, `build-evaluation.cjs`, `evaluation-provenance.json`: curation/source mapping. `sourceHash` in public fixture is SHA-256 of a UUID, **not content**.
- `frozen-evaluation-v1.json`: archived copy of final public fixture.
- `legacy-evaluation-final.json`: final 272-case baseline. Earlier `legacy-evaluation.json` is an **obsolete preliminary 260-case result**; do not report it as final.
- `traffic-estimates.json`: reproducible serialized projection payload arithmetic.
- `operational-sql.json`: top 100 statement shapes; `operational-writers.json` separately captures **all 36** matching DML shapes (29 PostgREST / 7 direct SQL), avoiding the top-100 omission trap.
- `github/`: 14 raw private logs/job records, workflow state/run list/summary, latest observed source copies, checksummed manifest. Raw logs stay private.
- `artifact-inventory.json` + checksum: full private artifact integrity index. `validation-results.json` records the initial verified checks; final code/docs results below include the later successful typecheck correction.

The failed sandbox-network attempt `tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-12-272Z/` has completed=false and no corpus. Preserve it as failure evidence; never use as snapshot. Capture scripts create new exclusive files/directories. To recapture GitHub/dependencies, use a **fresh successful inventory directory**, not overwrite these immutable artifacts.

## Decisions already made — never re-ask

Andrew on **2026-10-12**: keep the best repeated-fact wording and retire others; preserve historical games/records; distinct facts about one artist are allowed; 100 is a maximum and zero novel output is valid; measure spending before selecting a cap; prefer Sol engineering with cheaper models when adequate.

No lifetime song/album/artist ban. No automatic retirement for Taylor Swift concentration. Compare required knowledge, correct answer, material qualifiers and image context; category, distractor order, spelling aliases, reversal and minor extra clues do not supply novelty. Gobi continent versus countries and same-artist tour versus separate album facts remain distinct. Combined mostly-repeated facts are held/rejected. Keeper groups require evidence against the actual chosen keeper, not weak transitive similarity chains.

Semantic gates are empirical, not a mathematical universal guarantee. Missing credentials, incomplete corpus, timeout, truncation, bad schema or budget exhaustion must mean unverified/uncertain, never successful uniqueness. Deleted fact evidence stays reserved. An existing `clear` default is not a successful semantic check.

**Budget proposal only:** $25 one-time (up to $5 comparison trials, remaining up to $20 audit/extraction/backfill); scheduled cap $0.50/run, $15 per 30 nights plus $5 manual checking = shared $20/month model APIs. No cap/provider switch/paid call was approved or enacted. Implement offline work first; obtain informed paid cap before calling any provider in Phase 2. Keep Gemini initially unless fixed-set evidence supports an alternative. A new OpenAI production provider would need credentials not currently evidenced by the environment-name inventory; never expose existing secrets.

## Changed files and responsibilities

1. `scripts/audit-speed-trivia-inventory.cjs`: SELECT-only read-only-user capture; `validatePages()`, `referenceSQL()`, `verifyBackup()`; `--verify` is fully offline. Defaults capture only, never cleanup. Credentials injected, project linked/hostname check, ignored/private output, exclusive writes, no raw error bodies printed.
2. `scripts/capture-speed-trivia-dependencies.cjs`: supplemental read-only aggregates/non-FK/SQL-function/default evidence; no player export.
3. `scripts/capture-speed-trivia-workflow-baseline.cjs`: read-only `gh` run/job/log/source capture; raw logs private; sanitized summary. `imported` means processed upsert-attempted count, **not verified inserted**. Logged attempts are lower-bound evidence, not billed request counts.
4. `scripts/evaluate-speed-trivia-legacy.cjs`: VM extracts only actual lexical helper declarations, never generator main; isolated-pair exact/category/deleted exclusion baseline, no network/model calls.
5. `tests/scripts.speed-trivia-inventory.test.ts`: 6 meaningful checks for >1,000 rows, truncation/count/order/ID/revision/pool failures, missing credentials, identifier escaping/aggregate-only query.
6. `tests/speed-trivia-uniqueness-evaluation.test.ts`: 3 checks for class counts/real evidence/category coverage, component/answer/source/fact split leakage and mandatory/difficult-case coverage. These do not pretend an engine exists.
7. `tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json` + README: **272 cases**, frozen SHA-256 **`44d2056a27e30d317f7b7b4e30185a3c7a60b53ca1ce09c8a44f847a68e37045`**. 137 duplicate / 124 distinct / 11 uncertain; calibration 188 (94/87/7), held-out 84 (43/37/4). Both splits cover all 9 categories; at least 100 real-real pairs per duplicate/distinct class. Synthetic image context, not image-recognition evidence.
8. `docs/speed-trivia-uniqueness-phase-1-audit.md`: counts/backlog/six-family cluster assumptions, measured baseline and explicitly estimated costs/cap proposal.
9. `docs/speed-trivia-uniqueness-phase-1-writer-map.md`: all discoverable writer chains, aliases, Live exclusion, schema bypasses and preservation contract.
10. `docs/speed-trivia-uniqueness-phase-1-backup-record.md`: exact private archive/integrity/recovery state and remaining off-device gate.
11. This handoff and `docs/speed-trivia-uniqueness-plan.md` status. No application, workflow, package command, existing migration, env value, Supabase admin client, or cron configuration changed.

## Facts and traps for implementation

- Live categories/counts: Animals 731/1,144; General Knowledge 546/619; Geography 625/1,124 +1 deleted; History 646/1,133; Literary Landscapes 100/0; Music 613/1,128; Pop Culture 591/1,213 +1 deleted; Science 655/1,082; Sports 629/1,220 (active/pending). Literary Landscapes absent from eight export files.
- Six-family rows: Gobi continent 2 active/2 pending; Eras artist 3/15; Africa hemispheres 10/7; vertebrate longevity 7/18; Sputnik country 2/3; Olympia city 3/2. 74 total/27 active/47 pending. Conditional keeping one approved per family would retire 68, leaving 5,115 active; **not an exhaustive estimate or selected manifest**.
- Zero normalized exact duplicates, zero malformed answer/index rows, zero Speed images, all metadata `clear`; no real image captures can be supplied from this corpus.
- Schema has **no updated_at or corpus revision**. Do not measure approval/edit throughput from creation time. Pool/format/status constraints and June exact/review migrations are installed. No semantic admission object exists.
- Default manual insert active; bulk/PATCH approval can resurrect deleted; Speed “InFile” catches DB error and writes exports; physical delete cascades history. Export PR does not delete files for now-empty categories. See writer map before implementing boundaries in Phase 3.
- Exact normalized-key trigger watches only question update, permitting direct derived-key edits by privileged callers. Service-role bypasses RLS; anon/authenticated DML grants alone are blocked by absent DML policies. Preserve Live compatibility in later DB guard.
- Reference counts: Speed 3,307 answers / 5,626 variants (2 retired refs) / 18 non-FK seen entries, 0 Live mappings/answers/venue seen. Refresh before cleanup. `getQuestionById()` no status predicate enables in-flight submissions after soft retirement; new selection requires active. No gameplay writes were exercised live.
- Installed function body scan found no explicit question DML function; dynamic SQL/unrecorded external credential holders cannot be exhaustively proven absent. Statement shapes are cumulative across pools, not attributed nightly usage. Stats reset 2026-02-24; no pg_cron.
- Actual API tokens/thinking/cost/runtime successful model are not logged; no Gemini billing export available. Logs show 190 children/78 refills/1,408 successful generation-attempt lines/1,322 generated and processed rows in 14 nights; those processed rows can include ignored slug conflicts. Mean 100.57 logged attempts/night and 13.57 child corpus loads/night. Provider retry lines 0; 12 model-failure lines are not fallback success.
- Current-shaped payload estimate ~46.38 MB/night/1.391 GB per 30 runs, versus one complete answer/context corpus ~6.02 MB/night/180.64 MB per 30 runs. Queries estimated 220–278/night from actual page sizes/logged counts, not observed network billing. Re-estimate at 10× and 2× retries, as audit documents; no full corpus per candidate or category.
- Existing isolated-pair baseline: blocks 56/137 duplicates, misses 81; held-out blocks 20/43, misses 23; accepts 123/124 distinct and 8/11 uncertain. All 8 mandatory duplicate comparisons fail. Retrieval recall still **unmeasured**. Do not claim release gates passed.
- Small unresolved accuracy/scope list is documented in audit/uncertain fixtures. Treat those as holds, not automatic removal. No need for Andrew to label hundreds of obvious cases. A factual correction needs evidence and versioned fixture changelog, not lowering the gate.
- Preserve the final v1 evaluation; do not feed held-out labels/rationales to model prompts/tuning. Images are synthetic context fixtures; text-identical different-image case is semantically distinct even if DB text backstop refuses it. Evaluation is not universal recall evidence.
- Initial Supabase CLI help attempted telemetry outside sandbox and failed; **do not use CLI diagnostics as this audit's schema proof**. Read-only management endpoint worked with injected existing access token. Network/specific durable-file write auto-review allowed, no rejection. Production db push confirmation remains required, not granted here.
- One late typecheck found Next's augmented `ProcessEnv` requires NODE_ENV in the stripped-credential subprocess test; fixed to explicit `NODE_ENV: 'test'`. Final typecheck/tests/targeted lint passed. No application change was needed.

## Exact commands and verified results

Local environment: Node **v24.19.0**, existing node_modules, gh CLI and configured read access. Actions uses Node20; new scripts use Node20-compatible APIs, but were **not executed on Node20** in this phase. No new dependency installed. Missing-credential test injects only PATH/NODE_ENV; no existing secrets copied.

Read-only capture commands already executed (network sandbox access was permitted):

```sh
node --env-file=.env.local scripts/audit-speed-trivia-inventory.cjs
node scripts/capture-speed-trivia-workflow-baseline.cjs tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z
node --env-file=.env.local scripts/capture-speed-trivia-dependencies.cjs tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z
```

Do not recapture into the same directory. Operational SQL/evaluation curation scripts are private under that directory and archived; read their source/queries before reuse. No paid API call in any of them. Do not run the old restore/cleanup/sync aliases as shortcuts.

Final verification commands:

```sh
node scripts/audit-speed-trivia-inventory.cjs --verify tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z
node scripts/evaluate-speed-trivia-legacy.cjs
npx vitest run tests/scripts.speed-trivia-inventory.test.ts tests/speed-trivia-uniqueness-evaluation.test.ts tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts
npx eslint scripts/audit-speed-trivia-inventory.cjs scripts/capture-speed-trivia-workflow-baseline.cjs scripts/capture-speed-trivia-dependencies.cjs scripts/evaluate-speed-trivia-legacy.cjs tests/scripts.speed-trivia-inventory.test.ts tests/speed-trivia-uniqueness-evaluation.test.ts
npx tsc --noEmit
git diff --check
```

Results: backup verifies 13,801/56/9 and all artifact hashes; recovered durable archive also passes; **4 test files / 14 tests pass**, targeted ESLint clean, final typecheck clean. Legacy metric output intentionally demonstrates failed uniqueness gates. Full application test suite/build were not run: application unchanged, phase only adds audit scripts/fixtures/docs. New file whitespace and handoff/status link checks are included in final documentation validation. Do not typecheck concurrently with a later build (`.next/types` regeneration).

## Open questions and recommended first steps

No policy answer is missing for offline Phase 2. **Paid cap not selected**; propose concrete trial total before semantic API benchmarking. Actual model bills require Google AI Studio/Cloud usage/billing export for the Action's credential, with model/input/output/thinking/credits; account rates needed for Supabase/Actions dollar estimates. Do not request raw secrets. Off-device fresh backup is a **later pre-mutation gate**, not permission to mutate now.

1. Recheck worktree/HEAD and read rules/plan/audit/writer map/fixture README.
2. Verify private primary snapshot and frozen fixture checksum; use durable recovery if workspace artifacts are missing. Load full corpus once for evaluation, including two retired rows. Do not use exports or empty-corpus fallback.
3. Define a shared CJS package + typed server adapter, versioned content hash/schema/policy evidence, and duplicate/unique/uncertain result contract. Use corpus snapshot as testing input, not a live admission receipt.
4. Build multi-route fact/alias/lexical/semantic retrieval and explicit adjudication; log retrieval recall separately from classifier/admission performance. Exclude only own current version for edits; compare batches and cross-category facts.
5. Calibrate with calibration cases only. Require zero escapes on all mandatory/held-out/exact duplicates, at least 95% distinct acceptance, zero uncertain admissions. 37 held-out distinct means at least 36 accepted. Test failure/incomplete/missing answer/budget outcomes, retired history and same-artist distinct facts. Never lower gates or fit prompts to held-out answers.
6. Under agreed one-time spending only, evaluate lowest-cost adequate semantic strategy and caching; keep current provider initially. Publish raw counts, cost/token/retry/latency and retrieval misses.
7. Produce **private dry-run retirement manifest** with exact IDs/slugs/current status/content hashes, keeper/evidence/quality/references/field changes, separate ambiguity list, deterministic keeper policy, and retained active counts. No implicit promotion of pending keeper, no transitive weak groups, no apply.
8. Write `docs/speed-trivia-uniqueness-plan_PHASE_2_HANDOFF.md` and update plan before declaring Phase 2 complete. Next chat normally Sol/high; no need for Astra or delegation established.
