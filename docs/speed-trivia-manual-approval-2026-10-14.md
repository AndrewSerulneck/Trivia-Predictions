# Speed Trivia manual approval — October 14, 2026

## For Andrew

“Approve Selected” has been changed to compare each waiting Speed question only with questions that are already approved. Other waiting questions and deleted questions no longer block that manual approval. If two selected questions repeat the same fact, approving the first makes it count when checking the second. A batch also reports the questions actually saved, even when others are rejected. The release has passed its tests and build; deployment details will be recorded below after publishing.

Newly generated questions still go through the existing repeat checker before entering review. That check still considers approved, waiting and deleted questions, including remembered old versions. No $225 audit, paid test, database migration or question change was performed by this implementation. Andrew will review the backlog himself; do not request the declined bulk audit allowance again without a new request.

## For the next agent: scope and decisions

Andrew explicitly requested on **2026-10-14**: **“Can you make it so that ‘Approve Selected’ only checks against already approved questions?”** He also asked whether new generation already has repeat protection. This is a narrow exception for **unchanged pending→active manual approval**, not a weakening of generation, edits, imports, restoration or undo. Preserve existing signed admission, current revision/content checks, factual quality checks, retired-row protection, provider limits and the normal $0.50 operation budget.

The old paid backlog plan is no longer the authorized next action. Preserve its frozen private preparation as historical unfinished evidence. User decisions override its previous complete-bank approval requirement and its instructions to ask for $225. Subject-variety generation/player-selection changes from that plan remain separate, uncommitted and not released by this work. Do not apply `20261014020000_speed_trivia_variety_review.sql` or the missing reference indexes as part of this manual-review release.

## Starting state and release isolation

- Original workspace `/Users/andrewserulneck/Documents/Trivia-Predictions`, branch `main`, starting HEAD **`1932091e6bbe38ff2c3abae16bc677d396e63d61`**. It already contained substantial uncommitted Phase 1–3 variety/audit work and documents. These were preserved.
- Isolated release worktree **`/private/tmp/speed-trivia-approval-release-2026-10-14`**, branch **`fix/speed-trivia-approved-only`**, based on that exact HEAD. Only the manual approval change, accurate batch-result handling, relevant tests and portable SQL-test dependency are included. The release GET review query and generator remain from the published base; future ready/held queue filters and new schema prerequisites are deliberately absent from this release because their migration is not applied.
- Root workspace also contains the approval change alongside its prior future-schema work; its runtime retains that future migration prerequisite. **Do not deploy the root working tree.** Releasing it would publish unrelated schema-dependent code. Keep working from the isolated release or a fresh checkout of its final published SHA.
- Linked Supabase **`pkmxupsayzshvpirkaav`**; applied original migration **`20261013120000_speed_trivia_admission.sql`** unchanged. This manual approval change works on that existing schema; no new migration exists or is needed. Both old-schema and future-schema compatibility were tested locally, independently of production.
- No production data was written. No question backup/undo log was necessary for this code-only change. Existing Phase 3 snapshots, two private packages, proposals and unapproved funding draft remain untouched.
- Final application SHA, push/domain/deployment verification are recorded in the publication addendum after release. A commit/push/build alone must not be described as verified live behavior.

## Files and behavior

- **`lib/speed-trivia-uniqueness/approval.cjs`**: `approvedIndex()` makes one cached approved-only view of the already checked index, reusing row features. It filters all retrieval postings before ranking, so many waiting questions cannot crowd an approved competitor out of the bounded search. `refreshApprovedIndex()` applies the same bounded change feed to the view, adding newly approved rows and removing rows that become inactive. `requireUnchangedPendingApproval()` refuses using this scope for new rows, edits, generated candidates, restore or undo. `approval.d.cts` supplies the view type.
- **`lib/speed-trivia-uniqueness/runtime.cjs`**: `write(...,{approvedOnly:true})` uses this view solely for a status-only approval of an existing pending row. Full-bank index, corpus loading, generator/default write path and pair cache remain intact. Approved-only evidence and its signed envelope include `comparisonScope:'approved'` so later readers do not misinterpret the proof as a full-bank review. Freshness/retry checks and the database's signed transaction are unchanged. A competing approval updates the view on retry and rejects the second repeated fact.
- **`lib/speedTriviaAdmission.ts`**: new `approveSpeedTrivia(existing,session)` narrowly calls `gate.write({status:'active'},{existing,approvedOnly:true})`. Other writes keep using `writeSpeedTrivia` and the full fact bank. Serialized server index updates continue across all writes.
- **`types/speedTriviaAdmission.ts`**: typed `approvedOnly` option; release includes a `generated` flag only to guard scope misuse. Existing generation still uses the default full-bank path.
- **`app/api/admin/trivia/questions/route.ts`**: bulk manual approval uses the narrow helper. Returns actual `savedIds`, repeats, unresolved outcomes and not-processed IDs on success or partial failure. Existing matching-question text is preserved. Duplicate/uncertain questions remain waiting; nothing is auto-deleted or automatically held by this operator action. Ordinary database/status errors stop further work while retaining accurate saved IDs. Live approval/delete behavior remains intact.
- **`components/admin/sections/TriviaPendingReviewSection.tsx`**: removes only saved IDs from the displayed list and selection; displays actual saved/repeat/unresolved/not-processed counts even when a later question fails. This avoids a batch error implying that earlier successful approvals did not happen. No future-schema queue controls are included in the isolated release.
- **`tests/scripts.speed-trivia-approved-only.test.ts`**: tests approved-only handling of waiting/deleted conflicts, first keeper blocking a second version, competing approval during save, removal of retired competitors from the cached view, factual uncertainty refusal, full-bank generation protection, scope-misuse refusal and filtering before bounded retrieval ranking. Root runs **9 cases** against both schemas; isolated release runs **5 cases** against the installed schema.
- **`tests/api.admin.speed-trivia-review.test.ts`**: checks use of the narrow approval helper, exact existing-question error, partial saved IDs, retired-row refusal and unchanged edit/Live behavior.
- **`package.json` / `package-lock.json`**: pinned dev-only **`@electric-sql/pglite@0.5.8`**, so the new SQL regression runs without relying on an ignored local folder. SQL harness and existing provider/admission tests resolve the installed package. No runtime/cloud dependency, provider or pricing change was introduced.

## Costs and evidence

No new paid checks, queries, stored per-player data or recurring jobs are added. Manual approvals reuse one existing checked corpus and derive the approved view once per cached index; after saves, only the existing bounded change feed is used. New generation uses the same complete bank. The normal maximum remains **$0.50 per admin/nightly operation**, at most **$15 for 30 scheduled runs**, plus at most **$0.50 × number of admin operations**; there is no shared monthly counter or approved bulk-audit funding. Actual provider invoices and real approval latency were not measured or paid-tested.

Offline, deterministic sample of **200 original pending rows** from revision **2551**: full-bank retrieval **7,050 competitor slots**, approved-only **6,061**, a **14.03% reduction in candidate slots**. This is not a bill or an assurance of identical savings per batch; cache/deterministic matches, uncertainty and early stopping affect actual calls. Approved subset **4,274 / 13,894** rows in that dated snapshot. Extra database reads/provider calls **0**. The full corpus read volume remains about **11.65 MB / 30 bounded RPC reads per fresh operation**, historically measured before this change; approved projection adds no network transfer. At illustrative 30/300 fresh operations/month, transfer remains about **349.6 MB / 3.50 GB**; no recurring increase. Additional view memory/CPU is local, one projection per checked index, and is not a paid tagging pass.

Private measurement: **`tmp/speed-trivia-uniqueness-private/variety-phase3-2026-10-14/manual-approval-cost-measurement.json`**. Raw Phase 3 bank/caches remain ignored, and no private questions/player data were added to public docs.

## Exact checks and results

Root workspace: full suite **4,332 pass / 13 existing environment skips**, **364 files pass / 1 skipped**; typecheck/lint pass. Isolated release: full suite **4,261 pass / 13 skips**, **361 files pass / 1 skipped**; typecheck/lint and production build pass. Isolated original-schema SQL: **26 admission / 16 retirement-undo checks** pass. Frozen uniqueness gate remains zero duplicate/uncertain admissions and ≥95% distinct acceptance in both evaluation sets. No live paid generation or admin approval was used as a regression.

Commands in the isolated worktree:

```sh
npx vitest run tests/scripts.speed-trivia-approved-only.test.ts tests/api.admin.speed-trivia-review.test.ts tests/lib.speed-trivia-uniqueness.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-provider-labels.test.ts tests/scripts.speed-trivia-admission.test.ts
npx tsc --noEmit
npm run lint
npm test
node scripts/test-speed-trivia-admission-sql.cjs
SPEED_TRIVIA_PGLITE_MODULE=/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules/@electric-sql/pglite node scripts/test-speed-trivia-retirement-sql.cjs
git diff --check
```

Local Node **24.19.0**, pinned SQL fixture dependency above. Standard tests load no real keys. Build requires the normal environment internally and access to the existing Google fonts. Never print/read `.env.local` values, copy/overwrite the file, or load real keys into ordinary tests. Build command used a parent process to avoid passing `--env-file` to Next workers:

```sh
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local -e 'const result=require("node:child_process").spawnSync("npm",["run","build"],{env:process.env,stdio:"inherit"});process.exit(result.status??1)'
```

Logs: **`/private/tmp/speed-trivia-manual-approval-release-tests-final.log`**, **`/private/tmp/speed-trivia-manual-approval-release-build-network.log`**, root private **`manual-approval-full-tests-final.log`**. Initial simultaneous full suites exceeded existing 5-second SQL/Bingo test limits; separate reruns pass. Initial build could not download Google fonts in the sandbox; read-only build network escalation succeeded. A direct Node `--env-file ... next build` made Next workers reject the inherited flag; spawning npm with inherited environment fixes that. No approval-review rejection occurred. iCloud-generated duplicate `.next/types/* 2.*` files were removed, leaving source untouched.

## Recommended next steps and limits

1. Read the publication addendum for the exact live SHA/deployment and inspect root dirty state before editing. Preserve the older unpublished variety/audit work; never merge/reset it away or deploy it by accident.
2. Andrew can refresh Question Review, manually select good pending questions and approve in small batches. The checker now treats only currently approved questions as repeat competitors. Two same-fact questions in one batch result in at most one approval; unrelated facts with the same artist/answer remain valid.
3. The normal paid checker budget still applies. A unavailable/uncertain/budget message is not proof of a repeat. Delete only after comparing the actual rejected question with its shown approved match. Nothing in this release automatically reviews/deletes the 7,083-row cohort.
4. Real provider-positive behavior and operator experience must be observed through Andrew's normal review actions; no additional paid pilot or automated question mutation is approved. Semantic detection remains imperfect. If a specific repeat passes, capture a sanitized regression and repair it without widening spending or weakening quality checks.
5. No product answer is outstanding. Production migrations, separate subject-variety release, bulk audit and new paid testing need their own concrete authorization. Use **Sol/high** for a concrete repeat/concurrency defect; **Sol/medium** for read-only operational verification. No agents were delegated and no skill/plugin was used.
