# Speed Trivia Phase 1 writer and preservation map

Date: **2026-10-12**. Local: `main` / `96b88658dfeeb42ef88aa09fb858d9d794631e04`. Latest nightly source: `0931f553d3f0bc57b4f00b1030787bd270740eaa`. The three generation/import scripts and workflow YAML are identical between these inspected versions. **No writer was changed or disabled.**

Discovery covered repository references, installed non-system SQL function bodies, all question FKs/related columns, nightly workflow/logs, and all 36 visible recorded question DML shapes. This map covers those discoverable surfaces. It cannot certify unknown future privileged callers. Masked statement parameters cannot identify caller or Speed versus Live pool.

## Speed and shared writers

| Entry point | Actual mutation / call chain | Phase 3 coverage / trap |
| --- | --- | --- |
| `.github/workflows/trivia-nightly.yml` | Temp exports → nightly coordinator → generator children → importer with pending Speed multiple-choice rows. Active, not paused. | Shared corpus, global budgets, admission before normal review. Workflow concurrency is insufficient. |
| `scripts/generate-trivia-nightly.cjs:runGeneratorForCategory()` | Spawns category/refill child, inherits credentials; allocates from local export counts. | Share corpus and admitted candidates across children; DB has nine categories, exports eight. |
| `scripts/generate-trivia-questions.cjs:main()`, `writeQuestions()`, `writeNewQuestions()` | Direct execution generates/writes Speed files. Child DB reads exclude deleted; missing credentials produce empty catalog. | Gate direct generation; quarantine failures; unverified corpus must stop import. |
| `scripts/import-trivia-questions.cjs:upsertRows()` | Slug upserts content/options/index/category/pool/format/status. Pending imports ignore existing slug conflicts; active imports overwrite. Shared with Live. | Inserts, changed rows, unchanged idempotent reimports, retired facts under new slugs. Preserve Live-only prune branch. |
| `app/api/admin/route.ts` POST `resource=trivia` → `lib/admin.ts:createAdminTriviaQuestion()` | Direct insert without status; installed default is **active**. | Manual creation must check novelty and use future pending admission contract. |
| Same PATCH `resource=trivia` → `updateAdminTriviaQuestion()` | Content/options/index/category/difficulty/pool/format by UUID, no status precondition. | Edits, conversions, deleted-row changes; exclude only own current version. |
| Same PATCH `resource=trivia-bulk` → `bulkUpdateAdminTriviaQuestions()` | Batch pool/format changes. | Cover Live→Speed conversion and batch internal conflicts in DB protocol. |
| Same PATCH Speed file-bank branch → `updateAdminSpeedTriviaQuestionInFile()` → `updateTriviaBankQuestionByIdOrSlug()` | “InFile” first updates DB by UUID/slug. On **any error**, catches and falls back to Speed JSON write. | Never treat admission rejection as permission to write local artifacts. Speed JSON is not canonical. |
| `app/api/admin/trivia/questions/route.ts` POST `approve` | Sets active, optional pool only; no pending precondition. Can reactivate deleted rows. | Current content/corpus/revision, retirement protection and intra-batch admission. |
| Same POST `delete` | Status-only soft delete. | State change must advance future revision and retain memory; not manifest cleanup tooling. |
| `app/api/admin/trivia/questions/[id]/route.ts` PATCH | Question/options/index/answer/status by UUID. Can reactivate deleted; `answer` branch builds write-in-style options without stored-pool check. | Validate final whole Speed row and admission. Changing options while retaining old index needs final validation. |
| Same DELETE | Soft delete then replaces today's/future Live mappings for slug. | Cleanup needs dedicated audited status-only path without replacement effects. |
| Generic admin DELETE → `deleteAdminTriviaQuestion()` | Deletes session references then **physically deletes question**; FK cascades. | Never use for this cleanup; historical preservation hazard. |
| Speed bank DELETE → `deleteAdminSpeedTriviaQuestionInFile()` → `deleteTriviaBankQuestionByIdOrSlug()` | Soft delete plus possible future-slot replacement; file fallback when DB missing/unconfigured. | Not manifest apply/undo; preserve IDs/slugs and revision invalidation. |
| `scripts/backfill-trivia-question-bank.cjs` → `readSpeedRows()`, `normalizeAndDeduplicate()`, `upsertRows()` | Shared legacy backfill; expects old `normal_multiple_choice` object shape, not current export arrays. Skips deleted **same slugs**; other inserts/upserts use active default. | Gate/disable unsafe Speed branch, retain Live branch. New slug for retired fact remains bypass. |
| `scripts/restore-deleted-speed-trivia.cjs --fix` | Blanket restore of all returned deleted Speed rows; no paging/novelty. | Replace with explicit checked selection/refusal. No restore run. |
| `scripts/cleanup-trivia-duplicates.cjs --apply-db/--apply-local` | Exact-only grouping, DB status deletion or Speed JSON removal, no durable undo. | Replace with frozen checksummed guarded manifest tooling. Not run. |
| Privileged SQL/PostgREST | Service-role DML bypasses RLS; historical shapes include content/status edits, inserts/upserts, conversions, key rewrites, slug changes, deletes. | Service-only RPC plus DB trigger/privilege guard; server checks cannot close arbitrary DML. |

Package aliases: `trivia:generate`, `trivia:generate:nightly`, `trivia:import`, misleading `trivia:import:prune` (same Speed import, no prune flag), `trivia:bank:backfill` (shared), `trivia:restore-speed`, `trivia:duplicates:fix:db`, `:fix:local`, `:fix`. `trivia:check` and `:bank:check` validate shape only. New audit scripts use direct Node commands; package commands were unchanged.

## Exports, indirect writers and Live-only paths

| Surface | Disposition |
| --- | --- |
| `app/api/admin/trivia/questions/export-speed-json/route.ts` | Active Speed DB → export PR. Not DB writer, but stale export can be reimported. `buildExportFiles()` emits nonempty categories; PR tree only adds changed files and **never deletes old files for newly empty categories**. Phase 5 must verify/fix this before export. No PR created. |
| `app/api/admin/trivia/questions/convert-live-export/route.ts` | Reads Speed and returns converted Live payload; no DB conversion/write. Preserve. |
| `scripts/sync-local-trivia.cjs`, `trivia:sync`, `:sync:dry-run` | DB → both Speed and Live JSON. Prohibited here by canonical Live rule. Not run. |
| `scripts/sync-purged-trivia.cjs` | Despite name, reads Live JSON and purges Live question/session/answer rows. Live-only; do not run. |
| `scripts/seedLiveShowdownPool.ts`, `live-showdown:seed` | Live clone upserts. Excluded from Speed content scope; preserve through future DB guard. |
| `scripts/patch-live-trivia-question-text.cjs`, `migrate-live-trivia.cjs`, `reseed-live-trivia-future.cjs`, Live generation/import workflows and aliases | Live-only content/session work. No expansion of scope. |
| `scripts/generate-map-questions.cjs`, `generate-science-questions.js`, `enrich-landmark-images.cjs`, `review-trivia-images.cjs` | Local Live generation/enrichment/review despite broad names; no discoverable Speed DB writer. |
| `lib/liveShowdownAdmin.ts` | Single-slot replacement soft-deletes old mapped slug without pool predicate; JSON round replacement upserts Live. DB-only round fallback reads **both pools**, can map eligible Speed slugs. Zero Speed session/Live-answer references at capture. Preserve Live behavior; future revision must cover shared state writes. |
| `lib/liveShowdownEngine.ts`, `lib/liveShowdownSubmission.ts`, `lib/liveShowdown.ts` | Reads/session/gameplay effects, not Speed content insertion. Preserve. |
| `lib/triviaAnswerVariants.ts` | Reads questions; writes separate answer-variant ledger, not canonical answer. Preserve ledger. |
| `lib/trivia.ts`, `lib/activity.ts`, `app/api/trivia/*` | Selection/submission/history; writes answers/points, not question content. Preservation contract below. |
| Historical migrations | Include slug/key/status/pool/format backfills and exact cleanup. Read-only history; no editing/reapplying. |

## Live schema and external SQL

June uniqueness/review migrations are installed. Table has 18 columns, **no `updated_at` or application corpus revision**. Creation time does not establish approval/edit time. Phase 1 uses full-content checksums; Phase 3 needs transactional revision.

Unique `idx_trivia_questions_speed_question_key_active` covers normalized key for non-deleted Speed rows. Trigger normalizes before INSERT or **UPDATE OF question only**: privileged direct normalized-key edits bypass recomputation. Guard derived fields in Phase 3. Slug is globally unique. Pool/format/status checks are present; no semantic admission RPC/trigger. Defaults: active status, clear review. **All 13,801 Speed rows are clear without semantic-check evidence.**

RLS enabled, not forced; sole policy public SELECT true. Anon/authenticated have DML grants but no DML policy and no RLS bypass. Service role has all DML and bypasses RLS. Grants alone are not effective permission. Captured trigger/Live-summary functions privately; installed non-system body scan found no explicit trivia-question DML function. Dynamic SQL and future external callers remain outside what this proves.

Statement stats reset **2026-02-24T01:29:11.499806Z**; all **36** matching DML shapes captured, no unreadable entries. They include PostgREST and direct SQL. Counts are cumulative across both pools, can be evicted, hide parameters, and do not identify caller. They are not nightly metrics. `pg_cron` not installed. Privileged SQL remains an explicit Phase 3 boundary.

## History and in-flight preservation

| Reference | Total | Speed-linked | Physical delete behavior |
| --- | ---: | ---: | --- |
| `trivia_answers.question_id` → UUID | 3,308 | 3,307 | CASCADE |
| `answer_variants.question_id` → UUID | 9,343 | 5,626 | CASCADE; 2 reference deleted Speed rows |
| `trivia_session_questions.question_id` → slug | 12,300 | 0 | RESTRICT |
| `live_showdown_answers.question_id` → slug | 516 | 0 | RESTRICT |
| `venue_seen_questions.question_id` → slug | 8,576 | 0 | CASCADE |
| `user_seen_questions.question_id` text, no FK | 1,731 | 18 matching UUID text or slug | No FK protection; retain rows |

Only aggregate counts exported; no player identities/answers/accounts/session arrays. Private `dependencies.json` has 5,695 per-question/reference aggregate entries for keeper stability. Counts were captured after atomic corpus statement and can grow with gameplay; refresh before Phase 5.

`lib/trivia.ts:getTriviaQuestions()` selects active rows. In-flight submission calls `getQuestionById()` by UUID **without status filtering**, preserving lookup/reveal after status-only retirement. `lib/activity.ts` joins historical answers to retained rows. Preserve UUID, slug, text, options/index; never call physical-delete or session-replacement helpers for cleanup. Later isolated tests must prove in-flight submission/history. Phase 1 submitted no real answer and changed no points.
