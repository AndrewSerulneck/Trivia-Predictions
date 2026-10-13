# Speed Trivia uniqueness — Phase 4 handoff

Date: **2026-10-13, America/New_York**. Next phase: **5, GPT-6.1 Sol / high**. **Phase 4 complete: safeguards deployed and verified live**. Andrew deferred editorial 4.1–4.4 on 2026-10-13; final Phase 5 now coordinates cleanup, the one approved uniqueness pilot and nightly restart.

## Developer summary

The approved migration and signing-key configuration are live. Comparison metadata was backfilled for all 13,878 Speed questions without changing their content/status or spending paid API credits. The old nightly generator was stopped before migration and remains stopped. The app/workflow release **`602aab932bea3d8bf694e8b77aaa1119347e9676`** is pushed and verified on Vercel **`dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`** with both production domains.

Andrew has now deferred the proposed editorial gate: current Speed questions are good, and repetition is the immediate problem. **Go directly to final Phase 5.** The four unexecuted editorial phases are archived, not active requirements. No editor implementation/calls were made and the $0.50 pilot is unspent. Nightly remains paused during cleanup preparation/apply; Phase 5 runs that uniqueness pilot and verifies the release before restarting. No new developer answer is needed to begin read-only/offline Phase 5 preparation; additional paid bank-audit work needs its own measured cap if existing authorized evidence cannot cover it.

## To the next agent: goal, scope and exclusions

Read `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, this handoff, `docs/speed-trivia-uniqueness-phase-4-release-record.md`, `docs/speed-trivia-uniqueness-phase-2-cleanup-summary.md` and Phase 2 handoff. Execute **Phase 5 only, Sol/high**: refresh current inventory/reference evidence, compare drift against existing proposal/keepers, reuse valid version/content-bound comparison caches, resolve conservative holds, take a fresh recoverable backup and freeze a new exact `speed-retirement-apply-v1` manifest/checksum at the live numeric admission revision. Then apply/verify status-only retirement, history/in-flight references, approved-Speed export PR and empty-category handling. Use the one approved $0.50 uniqueness pilot and record actual output/cost/revision/deployment before restoring the recorded active nightly state. Zero pilot output remains valid with isolated success evidence. Post-release seven-run monitoring is ordinary operational follow-up, not another phase or a condition for starting cleanup.

The existing Phase 2 proposal (849 active + 1,618 pending retirements, 968 approved keepers, unresolved coverage) is **not apply input**. Do not flip `applyReady:false` or reuse an old audit MD5 as the numeric admission revision. Keep question writers paused during snapshot/manifest/apply to avoid drift. Preserve question IDs/slugs/text/options and all historical/player/answer records. Andrew's keep-best/soft-retire policy is already authorized; present exact counts/material departures before destructive work, without re-asking that policy.

Out of scope: deferred editorial scoring/rewrites/new quality gate, artist lifetime bans, Live canonical JSON/content/generation/grading/schedules/rewards, points/player-history edits, physical deletion, blanket undo/restoration, old migration reapply/down-migration, new paid provider/embeddings or unapproved bank-wide audit expansion. Do not spawn agents; no delegation requested. The archived editorial proposal is not permission to execute it later.

## Starting state: branch, commits, publishing and production

- Branch `main`; reviewed application commit **`47498cd523b48218288ae2350f5374feed9dd47e`**, base **`96b88658dfeeb42ef88aa09fb858d9d794631e04`**, repository `AndrewSerulneck/Trivia-Predictions`. HEAD/published SHA **`602aab932bea3d8bf694e8b77aaa1119347e9676`** (`Record authorized safeguard rollout and plan editorial quality phases`), containing application commit `47498cd`. Remote main matches. Final release/handoff/plan/context verification notes were updated locally after that push and are uncommitted at this handoff; no code or migration change remains uncommitted. Never infer deployment from push alone.
- Preserve unrelated modified `next-env.d.ts` and untracked `.vscode/settings.json`. No source change to frozen core/provider/fixtures occurred in this rollout. Release documentation may have uncommitted final verification facts; inspect `git status` and retain them.
- Production project **`pkmxupsayzshvpirkaav`**, migration **`20261013120000_speed_trivia_admission.sql` applied**. Dry run and actual `supabase db push --linked --skip-vault --yes` listed/applied only that migration; no seeds/roles/vault update or old migration replay. **Do not reapply/edit/down-migrate it.** SHA-256 `df80e21f705aeaf772b12316f4290d031c2333111a4321d71e4a6b45768f72a4`.
- Live schema verified at **2026-10-13T14:27:08.634037Z**: eight private forced-RLS tables with owner BYPASSRLS, 19 new functions with restricted browser execution/pinned search paths/BYPASSRLS owners, both guard triggers installed. Service-role direct control-table read denied (`42501`). Active selection still **5,136**.
- Inventory **13,878 rows: 5,136 active / 8,740 pending_review / 2 deleted**, numeric admission revision **`0`**. Metadata-only backfill applied **28 batches / 13,878 features**, zero paid calls. Question checksum before migration is **`83e0626ed96b4ea9f91646eedf1dba5f`**; final verification compares original fields excluding new migration columns. No admitted/generated/retired/restored/approved question or player mutation; cleanup log/undo state remain unused.
- Backfill checkpoint: `tmp/speed-trivia-uniqueness-private/phase4-feature-backfill/feature-checkpoint.json`, `next:13878`, revision `0`, extractor `answer-concepts-v2`, corpus digest **`a51f703094ce880bf148989b5c6d89c3098170fd16c86a4775146d26e6f146cc`**. It is complete; never reuse for a changed revision or count legacy rows as semantically/editorially certified.
- Nightly workflow **`264911476`**, `.github/workflows/trivia-nightly.yml`, prior state **active**, now **disabled_manually**. Pause captured with no legacy in-progress run. **Leave it disabled during Phase 5 cleanup; resume after the single approved uniqueness pilot and final release checks pass.** No cron schedule change (02:15 UTC). No Action dispatch or paid pilot occurred. Original latest legacy run was **`38375678967`**, success, old SHA `96b88658dfeeb42ef88aa09fb858d9d794631e04`.
- Same new admission key is configured in private DB, GitHub secret and Vercel production secret. Approved cap **`0.50`** is GitHub repository variable `SPEED_TRIVIA_MAX_DOLLARS` and Vercel production server secret/env of that name. Local `.env.local` received **append-only additions** for the two approved server keys after names-only checks confirmed absence, so local admin writers can use the same key/cap. Existing lines/values were never opened/printed/rewritten. Operational commands may also inject the private release file after it.
- Vercel project **`prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`**, scope **`andrewserulnecks-projects`**, project **`hightop-challenge`**, Node 24.x. Previous production was **`dpl_25ngkUXDXN7Ep32UffH6bpxvPpn7`**, READY on old SHA. Current release **`dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`**, READY, at `https://hightop-challenge-gvtwqm136-andrewserulnecks-projects.vercel.app`, bound to SHA `602aab932bea3d8bf694e8b77aaa1119347e9676`. `vercel inspect hightopchallenge.com` resolves to that ID and aliases include both apex and `play.` domains.

## Authorization and decisions — do not re-ask

On **2026-10-13**, Andrew explicitly approved applying **migration `20261013120000` to `pkmxupsayzshvpirkaav`**, then configuring, backfilling and releasing safeguards, with **$0.50 per nightly/admin operation and one $0.50 pilot**. This covers the executed migration/config/backfill/app/workflow release. No repeated request for this same migration/publishing authorization is needed. It does not authorize a different future migration or extra paid pilot.

Andrew initially requested editorial phases 4.1–4.4, then **explicitly deferred them on 2026-10-13** because existing questions are good and repetition is the priority. The active sequence is now **Phase 4 → final Phase 5**. The original $0.50 pilot returns to uniqueness-only release verification during Phase 5, followed by nightly restart when checks pass. No separate seven-run phase remains; monitoring is operational follow-up. No editorial work was ever executed. This later decision supersedes the earlier editorial hold without changing deployed safeguards or spending caps.

Keep-best/soft-retire/preserve-history, different facts about the same artist allowed, uniqueness over volume and zero output acceptable remain approved. $0.50 × 30 scheduled runs is at most **$15**; admin operations are extra and there is **no shared monthly counter**. One pilot is at most another $0.50; it remains unspent. All generation, uniqueness checking and retries in the restored uniqueness pilot must share its single cap. Phase 2's separate paid ledger is historical, not replenished permission. Phase 4 actual paid provider usage **$0**.

No model/provider switch, paid grounding/embeddings, volume increase or removal of safeguards was approved. A future different schema migration still follows CLAUDE's concrete confirmation requirement. Local/read-only/backup/migration/config/backfill/push actions required sandbox escalation; authorization is supplied by Andrew's explicit reply. No automatic approval rejection remains.

## Private backup, key recovery and operation evidence

Latest pre-apply snapshot: **`tmp/speed-trivia-uniqueness-private/2026-10-13T14-24-58-385Z/`**, stable 13,878 rows, unchanged from earlier review snapshot, sole pending migration at capture. It exported questions/schema and aggregate references, no player identities. Before mutation a durable archive was extracted and verified:

`/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-preapply-2026-10-13T14-24-58-385Z.tar.gz`

**4,607,373 bytes**, SHA-256 **`960770f70b4aab024b5ca1e034e5ddf096380938c6ebd371fb9ef12b4bea3c77`**; recovered under **`/private/tmp/speed-phase4-preapply-_0kpctm6/2026-10-13T14-24-58-385Z/`**, core inventory verification passed. Preserve older Phase 1/2/4 backups/manifests/budgets/caches. Hosted off-device Supabase backup **`1953327419`**, completed **2026-10-13T11:31:37.619Z**, was listed independently; hosted restore was not tested, PITR is disabled. Same-Mac archive cloud sync is not established. No whole-database restore is appropriate for routine Speed rollback.

**Secrets: never print/read into tool output/commit** operational `tmp/speed-trivia-uniqueness-private/phase4-release/release.env` and separate durable key copy:

`/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-admission-release-2026-10-13.env`

Both mode 0600, byte-verified; key is not in question archives/docs/CLI args/SQL text. Use Node environment injection. `configure-speed-trivia-admission.cjs --apply` used bind `$1`; matching host secrets were set through stdin with output suppressed. Key rotation is intentionally refused by that setup helper. No direct service-role access was granted to private tables.

Private operations directory **`tmp/speed-trivia-uniqueness-private/phase4-release/`** includes `workflow-before-pause.json`, `workflow-after-pause.json`, `host-configuration.json`, `production-guard-verification.json`, `backfill-verification.json`, `live-session-readiness.json`, and private operational helpers `configure-hosts.cjs`, `verify-release.cjs`. No secret values belong in their JSON evidence. `live-session-readiness.json` records full 13,878-row index/revision 0, provider requests 0/dollars 0. Publication evidence is in `published-workflow.json`, `new-deployment.json`, `production-alias-deployment.json`, `deployments-after-push.json`; authenticated sanitized checks are in `authenticated-production-smoke.json`.

Earlier review evidence **`2026-10-13T12-55-58-227Z/`** includes dependencies and fresh aggregate references: 3,307 Speed answers, 5,626 answer variants, 18 user-seen records and zero Speed session/Live-answer/venue-seen links. Gameplay may add references without advancing question revision; refresh before Phase 5. Phase 2 manifest remains non-applyable. No cleanup transaction or undo log was created.

## Files and architecture relevant to Phase 4.1

- **`docs/speed-trivia-uniqueness-plan.md`**: updated approved decisions, editorial deferral and direct Phase 5 sequence. Pilot/restart are coordinated after cleanup checks; no standalone Phase 6.
- **`docs/speed-trivia-uniqueness-phase-4-release-record.md`**: exact manifest/migration/backup/cap/rollout and live verification facts; earlier review facts remain dated historical evidence. This handoff and `AGENTS.md`/`SYSTEM_CONTEXT.md` pointers are current.
- **`docs/speed-trivia-uniqueness-phase-3-release-runbook.md`**: prominent historical-state notice points to actual Phase 4 evidence and routes remaining pilot/resume work to Phase 5. Do not follow stale setup commands by ignoring that notice.
- **`scripts/configure-speed-trivia-admission.cjs:configure`**: parameterized private DBA setup, read-only default, fixed project and safe existing-key refusal. Three configuration safety tests in `tests/scripts.speed-trivia-configuration.test.ts` use synthetic transport.
- **`runtime.cjs:createSession/createBudget`**: shared corpus/index/bounded deltas/cache and per-operation token/dollar/request/candidate/retry/time cap, signed current-revision write receipts. Generation/uniqueness/retries share this existing budget; never give each stage another $0.50 allowance.
- **`generation.cjs:runGeneration/planTopics/briefFor/normalizeGenerated`**: current DB category/subtopic planning, 72 authored briefs, primary-subject spread, four-option shape checking and uniqueness admission. Current generation is uniqueness-only and is paused for cleanup/release verification. Andrew accepts the current editorial quality; no extra quality gate is required now.
- **`lib/speedTriviaAdmission.ts`**: serialized server index mutations/admission adapters; gate callers are `lib/admin.ts`, generic admin route and newer question review routes. Manual create/edit/import/approve remain subject to existing shared uniqueness checks; do not mass-certify legacy questions.
- **`core.cjs`/`gemini.cjs`** frozen uniqueness core/judge, unchanged. Core SHA **`24ae8e137aa990be82e9a09b60e4b822fcc497248cf20ab342538e596d047660`**, provider SHA **`1fad34a5a2b8ea1f6ae89a6d63bb987b4bff77a4b64f684039ea7a259e167d2f`**. Versions **`speed-facts-v2` / `answer-concepts-v2` / `union-answer-bm25-concepts-v4`** and **`gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`**. Keep these gates separate from a new editorial policy and never change hashes/labels to manufacture passing tests.
- **Migration `20261013120000_speed_trivia_admission.sql`** is applied immutable history. New editorial schema, if actually needed, requires a new timestamped migration, explicit API-grant/RLS review and separate concrete production confirmation.
- **`backfill-speed-trivia-features.cjs`** writes derived metadata only, does not certify legacy questions unique/good. **`manage-speed-trivia-retirement.cjs`** applies frozen checksummed retirement manifests in 50-row transactions and current-admission undo; Phase 5 only. Live importer branch/gameplay history remain intact.

## Testing, cost baseline and operational traps

Local final Phase 4 gates before rollout: **4,226 Vitest pass / 13 environment-gated skip / zero fail**, 355 passing files + one skipped, started **9:02:34 AM EDT**, 18.25 seconds; targeted eight-file suite **68/68**. SQL synthetic checks **26 admission / 16 retirement-undo / 7 real simultaneous PostgreSQL sessions** passed. Typecheck/lint/build **202 pages**/diff checks passed. Frozen original/fresh recorded-provider comparison gates remain passing. No editorial work or new paid trial occurred.

Commands from repository root:

```sh
node scripts/test-speed-trivia-admission-sql.cjs
node scripts/test-speed-trivia-retirement-sql.cjs
node scripts/test-speed-trivia-admission-concurrency.cjs
npx vitest run tests/scripts.speed-trivia-configuration.test.ts tests/scripts.speed-trivia-admission.test.ts tests/admin.speed-trivia-admission.test.ts tests/api.admin.speed-trivia-review.test.ts tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/supabase-migration-grants-contract.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run build
git diff --check
node scripts/audit-speed-trivia-inventory.cjs --verify tmp/speed-trivia-uniqueness-private/2026-10-13T14-24-58-385Z
```

Node 20 in Actions/24.x on Vercel. Isolated PGlite is under `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite`; actual PostgreSQL runner under `tmp/speed-trivia-postgres/node_modules`, port **55483**, loopback/shared-memory permission needed; no real `.env.local`/production credentials loaded by SQL fixtures. Do not run typecheck concurrently with build. iCloud created identical `.next/types/routes.d 2.ts`, `validator 2.ts`, `package 2.json`; verified byte identity/removing only those generated copies resolved an intermediate typecheck duplicate. Do not remove user source copies by analogy. Lint only had the existing large-Babel-file note.

Private release checks may be repeated read-only:

```sh
node --env-file=.env.local tmp/speed-trivia-uniqueness-private/phase4-release/verify-release.cjs
node --env-file=.env.local scripts/configure-speed-trivia-admission.cjs --check
```

**Do not repeat migration/backfill apply, key setup, workflow dispatch/enable or generation just as a test.** Backfill is complete; the single pilot belongs to Phase 5 release verification after cleanup. Inspect/refetch current state before retrying interrupted bulk requests because earlier verified items may already be committed. No emergency unchecked rollback: retain DB guards, pause admission/generation, restore only reviewed app versions, never disable triggers/down-migrate/blanket restore.

Fresh offline corpus: **10,002,942 compact bytes**, 30 initial RPCs, **3,151 ms** index build, **207 ms** for 271 retrievals, mean **37.0664** competitors, all complete/no overflow; 268 exact existing-bank matches, so this is not novel-generation yield. Private report `tmp/speed-trivia-uniqueness-private/phase4-offline-cost-and-planning.json` is immutable/exclusive. No malformed/image rows in this fresh Speed corpus.

Estimated old traffic 46.38 MB/night versus shared roughly 10–11 MB/night/300–330 MB per 30 scheduled loads. At 10× bank size roughly 100–110 MB/load/3–3.3 GB per 30 nights; avoid per-category/per-candidate full reloads. Backfill at 13,878 rows was one load + 28 batches; no paid calls. Persistent-cache/storage/Supabase marginal bill and deployed bulk latency remain unmeasured. Uncapped naive checking estimate about $109 per 30 nights before generation/manual work ($218 at 2× work; 10× candidates $1,090/$2,180) is contained by the approved $0.50 operation cap. Shortfalls/zero are expected valid outcomes, not permission to raise caps.

## Open questions, costs and recommended Phase 5 steps

No developer question blocks read-only/offline Phase 5 work. Andrew accepts current content quality, wants repeats fixed, and already chose keep-best/soft-retire/history preservation and different facts about the same artist. Do not re-ask these decisions. The approved recurring cap stays **$0.50 per nightly/admin operation**, at most **$15 for 30 scheduled runs**, with manual/admin operations additional; actual monthly bills were not measured and need not equal that ceiling. The one $0.50 pilot remains unspent and is now for uniqueness-only verification. No editorial model calls/rewrites were ever added, so deferring them incurs no charge and avoids future editorial work.

**Fresh bank-audit processing is a separate one-time cost.** Phase 2 spent $4.2284033 conservatively on its bounded audit and $0.6728451 on the separate benchmark ($4.9012484 combined). Those historical caps/remaining balances are not new Phase 5 spending permission. Reuse valid cached verdicts and measure changed rows/missing keeper evidence before estimating further paid work; do not reset old ledgers, invent a fixed cleanup price, or consume the pilot budget for an audit. Metadata backfill is complete and cost zero paid calls. Any material paid expansion needs a concrete cap approved before calls; no new budget is requested just to begin offline preparation.

1. Read the latest plan/authorization/course correction; inspect branch/worktree. Deployed source is `602aab932bea3d8bf694e8b77aaa1119347e9676`; final evidence and this planning adjustment are local uncommitted docs. Preserve editor files, `.env.local` append-only rules, existing guards, private evidence and disabled nightly state.
2. Capture a fresh stable complete corpus with live **numeric** admission revision and aggregate references, verify backups, compare every proposed row/keeper/status/content and resolve keeper holds conservatively. Do not treat the last 13,878-row count/revision 0 as fresh forever.
3. Reuse Phase 2 direct-pair evidence only where content/policy/provider match, report remaining audit coverage/cost before any new paid expansion, and prepare a **new frozen checksummed apply manifest**. Existing proposal is non-applyable.
4. Apply/verify reviewed status-only retirement in atomic guarded batches, preserve references/history/in-flight lookup, handle empty export categories and use Admin approved-Speed export PR direction. No mixed `trivia:sync` or Live JSON rewrite.
5. Run the one already-approved $0.50 uniqueness pilot after cleanup release checks, preserve its private run/usage/admission report and actual commit/deployment/revision facts; restore original active nightly state only after prerequisites verify. A second pilot is not authorized. Ordinary seven-run monitoring can follow without reviving deferred editorial phases.
6. Write `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md` even if stopping partially; update plan/context pointers with exact counts/undo/backups/commit/deployment/pilot/resume and unresolved evidence. Phase 5 is final; no new phase is required.

## Final publication facts

**Phase 4 complete at this handoff under Andrew's revised sequencing.** App/workflow SHA **`602aab932bea3d8bf694e8b77aaa1119347e9676`** pushed; exact GitHub YAML bytes/hash and cap verified; workflow still **disabled_manually**. Actual Vercel production deployment **`dpl_8vdTxBRAQ6ULHK8ZFXAXM4TWkxGu`**, **READY**, at `https://hightop-challenge-gvtwqm136-andrewserulnecks-projects.vercel.app`. Production alias inspection points to that same ID; both public domains attached. Latest publication notes are local uncommitted documentation, not another application rollout.

Backfill/live state verified **2026-10-13T14:31:25.214015Z**: features 13,878, numeric revision 0, admissions/memory 0, key configured, unchanged original question checksum `83e0626ed96b4ea9f91646eedf1dba5f`, Live total rows 4,537. Empty invalid admission receipt refused. Authenticated production checks **2026-10-13T14:38:44.746Z**: unauthenticated admin 401; authenticated Speed active read 200/5,136; Live active read 200/3,451; existing exact duplicate create refused **400**; retired restoration refused **409 / retired**. Generic create still uses its legacy inner 400 mapping; this is rejection, not a successful save. Exact duplicate/retired refusal required zero provider calls and accepted zero question writes. No new live create/edit/approval success was fabricated to test release; isolated success/approval/edit/Live-import evidence remains valid, with the uniqueness pilot now assigned to Phase 5.

One private helper initially had an incorrect relative module path and exited before any HTTP request; fixed to absolute `path.resolve` and all checks passed. Private helper changes are ignored, no application code change. Physical-device/gameplay interaction and actual paid yield/bulk-provider latency remain unverified; Phase 5 pilot and operational follow-up must distinguish those limits. No editorial implementation, no pilot dispatch, no nightly resume, no question retirement and no paid Phase 4 spend. **Current next step: Phase 5; editorial detour deferred by Andrew.**

Final read-only recheck at **2026-10-13T14:41:22.278683Z**, after authenticated refusals, still shows revision 0, original 5,136/8,740/2 statuses, 13,878 corpus rows and private access denied. `.env.local` is ignored; its two new approved keys were appended only, with no existing-line replacement or credential output.

**Course correction recorded 2026-10-13:** this turn changed planning/handoff/context documentation only. No production mutation, paid call, pilot dispatch, workflow restart, cleanup or new push/deployment occurred. Latest live figures in this handoff remain the explicitly dated Phase 4 verification, not a new inventory capture. Deferred proposal: `docs/speed-trivia-editorial-quality-deferred.md`.

**Final phase completed 2026-10-13:** Phase 5 retired 2,534 reviewed versions, verified history/export/16 pending pilot admissions, deployed final fixes as `0b1f5e819971673ed617b2c1ef98f239c57e2096`, READY `dpl_Aw67UdWUXWbWcEWtaQP9ytc8UhrM`, and restored nightly ACTIVE at 2026-10-13T19:23:18.329Z. Final bank 13,894 / revision 2550. Current handoff: `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md`; this Phase 4 handoff is dated history, not permission to repeat its migration/backfill/pilot steps.
