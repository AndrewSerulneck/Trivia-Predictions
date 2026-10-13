# Speed Trivia uniqueness — Phase 4 release record and prepared rollout

Date: **2026-10-13, America/New_York**. **Phase 4 complete: approved safeguards deployed and verified live. Generator remains disabled. Subsequent course correction: editorial 4.1–4.4 deferred; next is final Phase 5 cleanup, uniqueness pilot and restart.**

The safeguards passed local review and verification. The complete implementation is now committed locally as **`47498cd523b48218288ae2350f5374feed9dd47e`**, based on `96b88658dfeeb42ef88aa09fb858d9d794631e04`. Application/workflow release **`602aab932bea3d8bf694e8b77aaa1119347e9676`** is pushed and verified on production deployment **`dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`**. Existing repeats remain unchanged. Phase 4 is complete; go directly to final Phase 5 under the latest course correction.

## Reviewed release manifest

| Item | Exact prepared state |
| --- | --- |
| Repository / branch | `AndrewSerulneck/Trivia-Predictions`, `main` |
| Code commit | `47498cd523b48218288ae2350f5374feed9dd47e` (69 files; coherent implementation) |
| Published app/workflow SHA | `602aab932bea3d8bf694e8b77aaa1119347e9676`; exact remote workflow bytes verified, state disabled |
| Production database | `pkmxupsayzshvpirkaav` |
| Applied migration | `supabase/migrations/20261013120000_speed_trivia_admission.sql`; sole dry-run/apply migration, verified live at `2026-10-13T14:27:08.634037Z` |
| Migration SHA-256 | `df80e21f705aeaf772b12316f4290d031c2333111a4321d71e4a6b45768f72a4` |
| Frozen comparison core | `24ae8e137aa990be82e9a09b60e4b822fcc497248cf20ab342538e596d047660` |
| Frozen provider | `1fad34a5a2b8ea1f6ae89a6d63bb987b4bff77a4b64f684039ea7a259e167d2f` |
| Versions | `speed-facts-v2`, `answer-concepts-v2`, `union-answer-bm25-concepts-v4`; provider `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1` |
| Workflow | `Trivia Nightly`, ID `264911476`, `.github/workflows/trivia-nightly.yml`; previous state active, now **disabled_manually** during Phase 5 cleanup/release verification |
| Latest completed old workflow | Run `38375678967`, success, created `2026-10-13T09:21:08Z`, SHA `96b88658dfeeb42ef88aa09fb858d9d794631e04` |
| Vercel project | `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, `andrewserulnecks-projects/hightop-challenge`, Node 24.x |
| Current production deployment | `dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`, READY; deployment-list git SHA `602aab932bea3d8bf694e8b77aaa1119347e9676`, production alias independently verified |
| Current production URL | `https://hightop-challenge-gvtwqm136-andrewserulnecks-projects.vercel.app`; aliases include `hightopchallenge.com` and `play.hightopchallenge.com` |
| Configuration | Matching new signing key set in private DB, GitHub secret and Vercel production secret; cap `0.50` in GitHub variable/Vercel production. Local `.env.local` received append-only additions of these two approved server keys; private `release.env` also supplies operational commands. |

Review covered HMAC/payload/content/old-state binding, expiry, private forced-RLS tables, RPC grants/search paths, statement-before-row lock ordering, stale admissions, direct DML/normalized-key/TRUNCATE/pool-departure defenses, retired history, cached pair directionality, bounded refreshes, generation budgets/diversity, all mapped writer routes, disabled legacy tools, Live behavior and cleanup/undo mechanics. No change to the frozen comparator, provider, evaluation labels or existing SQL history was needed. New provisioning code addresses the missing concrete key setup mechanism; it does not grant service-role access or rotate an existing different key.

Writer coverage: generators and Speed importer use `runtime.cjs:createSession`; admin create/edit/approve/bulk/pool conversion use `lib/speedTriviaAdmission.ts`; SQL protects direct DML; legacy backfill/restore/cleanup writes refuse. Speed deletion remains status-only. Normal Live imports retain their existing branch. Gameplay/history modules and Live canonical JSON are unchanged.

## Fresh data and recovery evidence

Read-only capture at **2026-10-13T12:55:58.227Z (8:55:58 AM EDT)**:

- **13,878 rows: 5,136 active / 8,740 pending_review / 2 deleted**, 56 atomic snapshot packets; 10,068,840 bytes across inventory requests.
- Compared with Phase 3's 13,801-row capture: **77 added, zero removed, zero changed existing rows**. Content revision checksum `83e0626ed96b4ea9f91646eedf1dba5f`; this is the pre-admission MD5 audit checksum, not the future numeric admission revision.
- Installed/local migration histories differ only by pending `20261013120000`; no remote-only versions. Admission columns and triggers are not installed. Existing normalized-text unique index is installed.
- Aggregates remain 3,307 Speed answers, 5,626 Speed answer variants, 18 Speed user-seen records and zero Speed links in session questions/Live answers/venue-seen. No player identities exported. No discoverable installed SQL writer function explicitly writes `trivia_questions`.
- Private evidence: `tmp/speed-trivia-uniqueness-private/2026-10-13T12-55-58-227Z/`. Immutable inventory manifest SHA-256 `18be4860f222b7241953d7bdf386336297c0658a7e97bea31b83c71bab64051e`; supplementary dependencies/drift/backup records are separate.
- Durable same-Mac archive: `/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-2026-10-13T12-55-58-227Z.tar.gz`; **4,714,419 bytes**, SHA-256 `42ffff91587bd79b7f617564d20f6bed517a6eff344d1fc1cb8fbd3220791c1f`. Extraction to `/private/tmp/speed-phase4-recovery-j2somsl0/` passed inventory verification and all 15 archived file byte comparisons. The subsequently written backup-record file is outside that immutable archive.
- Hosted off-device Supabase physical backup **`1953327419`**, COMPLETED, inserted **2026-10-13T11:31:37.619Z**; nine completed backups listed, region `us-east-2`, PITR disabled. Availability verified; actual hosted restoration was not tested. Same-Mac archive cloud sync is not established. Never restore the entire shared production database as a routine Speed rollback.

Refresh the snapshot after actually pausing writers; today's evidence can drift before approval. Preserve ignored private evidence; do not commit it.

## Approved cost decision — 2026-10-13

Measured Phase 2 comparison cost was about **$0.00049/pair**. The naive 200 candidates × about 37 uncached comparisons estimate is **$3.63/night / $109 per 30 nights**, excluding generation/manual work; 2× work is $218. At 10× candidates: $1,090/$2,180. Caching and early rejection help, but paid end-to-end novelty yield is still unmeasured.

Andrew approved the lower-cost starting cap: **$0.50 per nightly or admin operation**, and **one release pilot capped at $0.50**. Thirty scheduled runs are at most **$15**, or **$15.50 with that single pilot**. Admin operations and additional manual runs are additional: 100 admin operations at this cap could add at most $50. This is **not an automatically enforced shared monthly ceiling**. Approval includes this per-operation accounting; no shared monthly allowance/counter was added. Fewer/zero safe questions are accepted; an unset cap prevents paid writes. Metadata backfill makes zero paid provider calls.

Current compact corpus transfer: roughly 10–11 MB per cold process, 300–330 MB per 30 nightly loads, versus prior 46.38 MB/night / 1.391 GB per 30 nights. Approximately 30 initial inventory/page RPCs, up to 200 refreshes and 100 admission/post-write refresh pairs, bounded cache reads/writes and two retry claims. At 10× bank size: 100–110 MB/load and 3–3.3 GB per 30 nights, about 279 initial inventory/page RPCs. A cold admin process also pays one full load; it is not one permanent global Vercel cache. Backfill at 13,878 rows: one corpus load, **28 batches / 13,878 feature upserts**, no content/status changes. At 10×: 278 batches / 138,780 upserts. Supabase marginal bill, cache storage and actual deployed latency remain unmeasured; retain Phase 3's conservative cache/storage estimates and measure the pilot before tuning upward.

Fresh offline measurement against this exact snapshot: **10,002,942 compact corpus bytes**, **30 initial RPCs**, **3,151 ms index build**, **207 ms retrieval for 271 frozen sample candidates**, mean **37.0664** competitors, all **271 complete**, zero overflow holds. **268** sample candidates already exactly match the bank; this is not an end-to-end generated novelty-yield benchmark. All 13,878 rows also passed content validation/indexing, with zero malformed rows and zero image rows. Private report: `tmp/speed-trivia-uniqueness-private/phase4-offline-cost-and-planning.json`; zero production writes/paid calls.

Unchanged global caps: 100 accepted, 200 requested candidates, 20 generation calls, two retries, 2M input tokens, 500K output tokens, 8,000 provider calls and 10 minutes. Lost calls retain worst-case reservations. HTTP request termination can leave earlier verified bulk admissions committed; refetch before retry. Do not increase Vercel duration or relax comparisons without measured need.

## Rollout procedure and editorial hold

Andrew confirmed and the agent completed the sole migration, key/cap configuration, metadata backfill and reviewed app/workflow release. Andrew subsequently deferred unexecuted editorial 4.1–4.4 and restored direct final Phase 5. Remaining steps 7–8 (the single approved $0.50 uniqueness pilot and nightly resume) are coordinated in Phase 5 after reviewed cleanup/release verification. Keep generation disabled while cleanup evidence/apply is in progress. Cleanup remains excluded from completed Phase 4.

1. Capture the current workflow state and pending/in-progress runs privately. Pause:

   ```sh
   gh workflow disable trivia-nightly.yml --repo AndrewSerulneck/Trivia-Predictions
   gh run list --repo AndrewSerulneck/Trivia-Predictions --workflow trivia-nightly.yml --limit 20 --json databaseId,status,headSha
   ```

   Wait for existing old runs to complete, or cancel specifically identified legacy runs and verify they stopped. Do not cancel unrelated workflows. No old run may remain capable of importing. Pause manual question writers during backfill. Do not change the 02:15 UTC schedule.

2. Refresh private snapshot/dependencies, verify recovery, recompare pending migrations and hashes. Refuse unexpected migration drift. Apply **only after Andrew's explicit confirmation**:

   ```sh
   supabase db push --linked --skip-vault
   ```

   Expected list is exactly `20261013120000_speed_trivia_admission.sql`. No `--include-all`, seed, role update, old migration replay or down-migration. Record actual completion time/history. Verify new functions' actual owners have BYPASSRLS, private forced RLS/grants and service-role direct denial. Existing active selection should remain unchanged. Migration starts with NULL key and blocks unchecked Speed writers.

3. Generate one new random key into a fresh **ignored** `tmp/speed-trivia-uniqueness-private/phase4-release/release.env`, with exclusive creation and mode 0600. Store the approved nonsensitive cap beside it. Do not print the key, put it in CLI arguments/SQL text or commit it. Keep a secure durable secret copy separate from content archives. The administrative API supports bind `parameters` ([official reference](https://supabase.com/docs/reference/api/v1-run-a-query)); its read-only parameter path was actually verified. `scripts/configure-speed-trivia-admission.cjs` defaults to no writes and uses this channel:

   ```sh
   node --env-file=.env.local scripts/configure-speed-trivia-admission.cjs --check
   node --env-file=.env.local --env-file=tmp/speed-trivia-uniqueness-private/phase4-release/release.env scripts/configure-speed-trivia-admission.cjs --apply
   ```

   `--apply` binds the key as `$1`, refuses a different existing key and reports only a boolean. No service-role key setup RPC/table grant. The read-only API executor is `supabase_read_only_user`; the readiness role check verifies planned migration owner `postgres` has BYPASSRLS. Actual privileged update remains unexecuted until approval. If it refuses, leave generation paused and resolve the operational channel; do not interpolate the secret into SQL.

4. With the same private key in process memory, pass it through stdin to `gh secret set SPEED_TRIVIA_ADMISSION_SECRET --repo AndrewSerulneck/Trivia-Predictions` and `vercel env add SPEED_TRIVIA_ADMISSION_SECRET production --sensitive --yes --project prj_yjIvzEUquV1gPWBsgOIluVp8v1ci --scope andrewserulnecks-projects`. Use Node `execFileSync` with `input: process.env.SPEED_TRIVIA_ADMISSION_SECRET` and captured output; sanitize exceptions instead of dumping child stderr. Add cap through GitHub **variable** `SPEED_TRIVIA_MAX_DOLLARS` and Vercel server environment of that name. No overwrite/rotation or `.env.local` rewriting. Confirm names/targets only. If settings already exist on retry, inspect state without exposing values; do not use `vercel env rm/pull/--force`.

5. Backfill before resuming writers, fresh revision-bound directory:

   ```sh
   node --env-file=.env.local scripts/backfill-speed-trivia-features.cjs --output tmp/speed-trivia-uniqueness-private/phase4-feature-backfill
   node --env-file=.env.local scripts/backfill-speed-trivia-features.cjs --output tmp/speed-trivia-uniqueness-private/phase4-feature-backfill --apply
   ```

   Dry-run first; expect current total/28 batches if unchanged. Record numeric admission revision, corpus digest and checkpoint. Never reuse a checkpoint from another revision or certify legacy rows as unique.

6. Commit updated release facts/docs if needed; publish with `git push origin main` only after schema/config/backfill are ready. Capture final pushed SHA. Verify GitHub workflow content at that SHA and actual Vercel READY build SHA plus production aliases. A pushed SHA alone is not deployment proof. Deploy from reviewed git source, not the dirty workspace, to preserve unrelated `next-env.d.ts` and `.vscode/settings.json`.

7. Dispatch one pilot only after approved budget and prerequisites:

   ```sh
   gh workflow run trivia-nightly.yml --ref main --repo AndrewSerulneck/Trivia-Predictions
   ```

   Capture run ID and exact SHA. Download its report to ignored private storage. Record generated/admitted/duplicate/uncertain/diversity/malformed counts, reservations/usage/spend, final revision and provider/policy versions. Valid zero output is acceptable; isolated success evidence already exists. Verify actual pending rows and no rejected candidates added to normal review; do not approve generated test rows just to exercise production. Use authorized existing admin tasks or isolated tests for create/edit/approve/duplicate refusal/retired restore/Live import. Bulk provider latency must fit the deployed request boundary or fail safely; preserve partial-write evidence.

8. Only when app/workflow/admission verify, restore recorded previous state:

   ```sh
   gh workflow enable trivia-nightly.yml --repo AndrewSerulneck/Trivia-Predictions
   ```

   Previous state was active and is already captured; leave the workflow disabled during cleanup. Phase 5 verifies the uniqueness pilot and then resumes. Phase 4 hands off directly to final Phase 5; seven-run observation is ordinary operational follow-up.

## Failure and rollback

Leave database guards installed. Keep `Trivia Nightly` disabled if migration/config/deployment/pilot verification fails. Do not restore old unchecked import, clear fact memory, disable triggers, drop guards or down-migrate. An absent/mismatched key or invalid cap fails closed. If necessary restore a reviewed app version while Speed generation remains stopped. Existing active gameplay and ordinary Live imports continue; a Live slug collision with Speed deliberately refuses. A key rotation requires a separately reviewed administrative operation; the setup utility intentionally refuses it. Backfill adds metadata only, with no content undo required. No cleanup/undo operation has been run.

## Verification completed locally

- Full Vitest: **4,226 passed / 13 environment-gated skipped / zero failed**, 355 passing files + one skipped; final run started **9:02:34 AM EDT**, 18.25 seconds. No paid model calls.
- Targeted release/writer/admin/import/grants/configuration checks: **68 passed** across eight files (full suite also contains all updated tests).
- Isolated SQL: **26** admission/privilege checks, **16** retirement/undo mechanics checks, **7** actual simultaneous PostgreSQL session checks, all passing. Synthetic data only.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` (**202 pages**) and `git diff --check` passed. Final typecheck was sequential after build.
- One later typecheck found identical iCloud-generated `.next/types/routes.d 2.ts`, `validator 2.ts`, `package 2.json`. Verified byte equality, removed only these ignored generated copies and passed again. No application source/threshold changed. Lint's existing large-Babel-file note remains.

No paid calls, question-content/status writes, cleanup, pilot dispatch or nightly restart have occurred. Approved schema/config/backfill changes and actual publication evidence are recorded in the live execution section. The editorial gate proposal is now deferred; Phase 5 owns the one approved uniqueness pilot and generator restart.

## Live execution — 2026-10-13

- Explicit Andrew approval arrived before every production mutation. Previous nightly state `active` captured in ignored `tmp/speed-trivia-uniqueness-private/phase4-release/workflow-before-pause.json`; pause verified as `disabled_manually`, no legacy runs in progress.
- Fresh post-pause pre-apply snapshot `tmp/speed-trivia-uniqueness-private/2026-10-13T14-24-58-385Z/`: 13,878 rows, unchanged from review snapshot, only approved migration pending. Core checksum `83e0626ed96b4ea9f91646eedf1dba5f`. Durable archive `/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-preapply-2026-10-13T14-24-58-385Z.tar.gz`, 4,607,373 bytes, SHA-256 `960770f70b4aab024b5ca1e034e5ddf096380938c6ebd371fb9ef12b4bea3c77`; recovered and verified under `/private/tmp/speed-phase4-preapply-_0kpctm6/`.
- `supabase db push --linked --skip-vault --dry-run` listed exactly `20261013120000_speed_trivia_admission.sql`. Authorized `supabase db push --linked --skip-vault --yes` applied it, with no seeds/roles/vault update. CLI's unrelated `Warnings...` filename was skipped, not applied.
- Live guard verification at `2026-10-13T14:27:08.634037Z`: eight private forced-RLS tables with owner BYPASSRLS, service-role direct table access denied; 19 new functions, intended grants/search paths and BYPASSRLS owners; both guard triggers installed. Inventory revision `0`, 13,878 rows; active 5,136 / pending 8,740 / deleted 2. Service-role direct control SELECT returned `42501`; active-selection read still 5,136. Private evidence `phase4-release/production-guard-verification.json`.
- Parameterized key setup succeeded. Matching key synchronized via stdin into GitHub/Vercel; cap `0.50` set. No value printed, no service-role grants widened, no `.env.local` rewrite. Private operational file `phase4-release/release.env`; durable separate secret recovery copy `/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-admission-release-2026-10-13.env`, mode 0600, byte-verified. Treat both as secrets, never print/archive with question evidence/commit.
- Derived-feature dry run and apply completed: **13,878 features / 28 batches / revision `0` / zero paid calls**. Checkpoint digest `a51f703094ce880bf148989b5c6d89c3098170fd16c86a4775146d26e6f146cc`, `next:13878`. Live verification at **2026-10-13T14:31:25.214015Z** confirmed feature count, zero admissions/memory, signing key configured and original question checksum `83e0626ed96b4ea9f91646eedf1dba5f`. Live inventory remains 4,537 Live rows. Empty invalid admission receipt refused; no question written.
- Editorial implementation is out of this turn's scope: Andrew asked to add the phases, not to execute them now. Phase 4.1 freezes rubric/evaluation/mix/cost design; 4.2 implements shared gate/bounded rewrites; 4.3 runs the one $0.50 pilot and releases generation; 4.4 replaces former Phase 6's seven-run monitoring. Final Phase 5 remains reviewed cleanup. No extra pilot/spending allowance inferred.

- Published app/workflow **`602aab932bea3d8bf694e8b77aaa1119347e9676`**. GitHub remote workflow content equals reviewed YAML, SHA-256 `f539db1155ddbbdb646cc142e61227db7a11d8481be2ac584af1d374d472e003`; variable cap `0.50`, workflow `disabled_manually`, no pilot dispatch. Git push includes application commit `47498cd` and updated editorial plan; unrelated editor/next-env files excluded.
- Vercel production **`dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`**, **READY**, `https://hightop-challenge-gvtwqm136-andrewserulnecks-projects.vercel.app`, bound by deployment list to published SHA. `vercel inspect hightopchallenge.com --format json` independently resolves to that exact deployment ID; aliases include apex and `play.` domains. Private `new-deployment.json`, `production-alias-deployment.json`, `published-workflow.json` preserve evidence.
- Authenticated production checks at **2026-10-13T14:38:44.746Z**: unauthenticated admin refused 401; Speed active read 200/5,136 rows; Live active read 200/3,451 rows; exact existing duplicate create refused **400** (generic create route retains its legacy inner error mapping), retired-row restoration refused **409 / retired**. Existing exact content and retired status use deterministic early refusal, **zero paid checks and zero accepted question writes**. Private `authenticated-production-smoke.json` contains sanitized results only. No actual approval/edit/new-generation success was performed in production: isolated evidence covers these, and the quality pilot remains deferred.
- Phase 4 is complete under the revised exit contract: database safeguards/configuration/backfill and actual app/workflow deployment verified. Nightly is intentionally disabled for the new editorial phases; $0.50 pilot unspent. Final verification documentation is updated locally after the published build; no second code release is necessary for these notes.

- Final read-only production recheck **2026-10-13T14:41:22.278683Z** after refusal checks: revision remains 0, question/status counts unchanged, private access denied. The matching key/cap were also appended to ignored `.env.local` after names-only absence checks for local admin compatibility; no existing value/line was read, printed or replaced.

## Subsequent course correction — 2026-10-13 (current instructions)

Andrew considers current Speed question quality good and wants repeated facts fixed first. **Defer all unexecuted editorial Phases 4.1–4.4; go directly to final Phase 5.** Earlier editorial sequencing in dated execution history above records the earlier decision and is superseded here. Preserve deployed uniqueness/soundness/admission/diversity checks. No quality-scoring/rewrite work was implemented or billed.

Recurring allowance is unchanged: $0.50 per nightly/admin operation, at most $15 for 30 scheduled runs, admin operations additional; actual historical monthly billing remains unmeasured. The one unspent $0.50 pilot is now uniqueness-only, performed as part of Phase 5 release verification. Fresh bank-audit cost is a separate one-time matter: measure drift/cache reuse/missing evidence first and obtain a concrete allowance before unapproved paid expansion; do not reset Phase 2 ledgers or reuse their old authorization as a new budget.

This course-correction turn updated local plan/handoff/context documentation only: no paid call, production mutation, pilot dispatch, workflow restart, cleanup or new commit/push/deployment. Nightly remains disabled while Phase 5 refreshes/applies reviewed cleanup; resume after the single pilot and release checks pass. The archived editorial proposal is `docs/speed-trivia-editorial-quality-deferred.md`; it is not an active phase. The latest Phase 4 handoff addresses the next agent's Phase 5 work directly.

**Final Phase 5 completion (2026-10-13):** Reviewed cleanup/export and both explicitly authorized pilots are documented in `docs/speed-trivia-uniqueness-phase-5-release-record.md`; final source `0b1f5e819971673ed617b2c1ef98f239c57e2096`, READY deployment `dpl_Aw67UdWUXWbWcEWtaQP9ytc8UhrM`, nightly active at 2026-10-13T19:23:18.329Z. Preserve the dated Phase 4 evidence below and never repeat applied migration/backfill or reset a spent budget.
