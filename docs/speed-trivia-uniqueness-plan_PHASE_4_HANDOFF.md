# Speed Trivia uniqueness — Phase 4 handoff

Date: **2026-10-13, America/New_York**. Next phase: **4.1, GPT-6.1 Sol / high**. Safeguard application deployment is being verified; nightly activation and the one paid pilot belong to 4.3 under the revised plan.

## Developer summary

The approved migration and signing-key configuration are live. Comparison metadata was backfilled for all 13,878 Speed questions without changing their content/status or spending paid API credits. The old nightly generator was stopped before migration and remains stopped. The reviewed application/workflow publication is being verified.

Andrew requested an editorial quality gate before new generator questions reach review. The plan now has 4.1 (rubric/evaluation), 4.2 (implementation), 4.3 (the one capped pilot and generator release), and 4.4 (seven scheduled runs of monitoring). Phase 5 remains final cleanup. No editorial gate has been implemented yet; no repeats were retired, no new questions generated, and no pilot allowance spent. No new developer answer is needed to start 4.1.

## To the next agent: scope and exclusions

Read `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, this handoff, and `docs/speed-trivia-uniqueness-phase-4-release-record.md`. Phase 4.1 defines measurable editorial rules and a frozen sanitized evaluation set, across all nine current categories, for natural wording, factual soundness/unambiguous answers, plausible distinct distractors/no accidental clues, worthwhile facts and topic/difficulty mix. Distinguish worthwhile hard knowledge from arbitrary obscurity and durable cultural knowledge from disposable celebrity detail. Define pass/fail/uncertain reasons and achievable small-batch mix targets. Freeze calibration/held-out cases before tuning. Plan a cheap bounded implementation sharing the approved operation budget; do not claim a universal guarantee of interestingness or accuracy.

Phase 4.1 is planning/evaluation-fixture work only: no paid model evaluation/pilot, no implementation/deployment of the editorial gate, no new admission, no bank-wide content edits or cleanup. 4.2 implements and tests the shared gate, limited rewrites and final-content rechecking. 4.3 uses the single $0.50 pilot, including all generation/editorial/rewrite/uniqueness costs, and resumes only after gates pass. 4.4 replaces former Phase 6 monitoring. Phase 5 uses fresh reviewed retirement evidence and preserves history. Keep Live Trivia canonical JSON/generation/grading/schedules/rewards/player histories/points out of scope. No agent delegation requested.

## Starting state: branch, commits, publishing and production

- Branch `main`; reviewed application commit **`47498cd523b48218288ae2350f5374feed9dd47e`**, base **`96b88658dfeeb42ef88aa09fb858d9d794631e04`**, repository `AndrewSerulneck/Trivia-Predictions`. Release-documentation/push/deployment SHA will be recorded in the final publication facts below. Never infer deployment from push alone.
- Preserve unrelated modified `next-env.d.ts` and untracked `.vscode/settings.json`. No source change to frozen core/provider/fixtures occurred in this rollout. Release documentation may have uncommitted final verification facts; inspect `git status` and retain them.
- Production project **`pkmxupsayzshvpirkaav`**, migration **`20261013120000_speed_trivia_admission.sql` applied**. Dry run and actual `supabase db push --linked --skip-vault --yes` listed/applied only that migration; no seeds/roles/vault update or old migration replay. **Do not reapply/edit/down-migrate it.** SHA-256 `df80e21f705aeaf772b12316f4290d031c2333111a4321d71e4a6b45768f72a4`.
- Live schema verified at **2026-10-13T14:27:08.634037Z**: eight private forced-RLS tables with owner BYPASSRLS, 19 new functions with restricted browser execution/pinned search paths/BYPASSRLS owners, both guard triggers installed. Service-role direct control-table read denied (`42501`). Active selection still **5,136**.
- Inventory **13,878 rows: 5,136 active / 8,740 pending_review / 2 deleted**, numeric admission revision **`0`**. Metadata-only backfill applied **28 batches / 13,878 features**, zero paid calls. Question checksum before migration is **`83e0626ed96b4ea9f91646eedf1dba5f`**; final verification compares original fields excluding new migration columns. No admitted/generated/retired/restored/approved question or player mutation; cleanup log/undo state remain unused.
- Backfill checkpoint: `tmp/speed-trivia-uniqueness-private/phase4-feature-backfill/feature-checkpoint.json`, `next:13878`, revision `0`, extractor `answer-concepts-v2`, corpus digest **`a51f703094ce880bf148989b5c6d89c3098170fd16c86a4775146d26e6f146cc`**. It is complete; never reuse for a changed revision or count legacy rows as semantically/editorially certified.
- Nightly workflow **`264911476`**, `.github/workflows/trivia-nightly.yml`, prior state **active**, now **disabled_manually**. Pause captured with no legacy in-progress run. **Leave it disabled until Phase 4.3.** No cron schedule change (02:15 UTC). No Action dispatch or paid pilot occurred. Original latest legacy run was **`38375678967`**, success, old SHA `96b88658dfeeb42ef88aa09fb858d9d794631e04`.
- Same new admission key is configured in private DB, GitHub secret and Vercel production secret. Approved cap **`0.50`** is GitHub repository variable `SPEED_TRIVIA_MAX_DOLLARS` and Vercel production server secret/env of that name. Local `.env.local` was neither opened/printed/rewritten nor appended; operational commands inject the private release file after it.
- Vercel project **`prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`**, scope **`andrewserulnecks-projects`**, project **`hightop-challenge`**, Node 24.x. Previous production was **`dpl_25ngkUXDXN7Ep32UffH6bpxvPpn7`**, READY on old SHA. New exact release and aliases must be established from final publication facts, not this previous ID.

## Authorization and decisions — do not re-ask

On **2026-10-13**, Andrew explicitly approved applying **migration `20261013120000` to `pkmxupsayzshvpirkaav`**, then configuring, backfilling and releasing safeguards, with **$0.50 per nightly/admin operation and one $0.50 pilot**. This covers the executed migration/config/backfill/app/workflow release. No repeated request for this same migration/publishing authorization is needed. It does not authorize a different future migration or extra paid pilot.

Andrew then requested explicit editorial phases, starting 4.1, before generator release, and **Phase 5 as final**. Therefore the original Phase 4 pilot/resume moved to **4.3**, and former Phase 6 monitoring moved to **4.4**. Existing approved questions keep playing while generation is paused. Implementing these new phases is a future task; adding the plan is not evidence that they were built or deployed.

Keep-best/soft-retire/preserve-history, different facts about the same artist allowed, uniqueness over volume and zero output acceptable remain approved. $0.50 × 30 scheduled runs is at most **$15**; admin operations are extra and there is **no shared monthly counter**. One pilot is at most another $0.50; it remains unspent. All generation, editorial checking, rewrites, uniqueness and retries in that pilot must share its single cap. Phase 2's separate paid ledger is historical, not replenished permission. Phase 4 actual paid provider usage **$0**.

No model/provider switch, paid grounding/embeddings, volume increase or removal of safeguards was approved. A future different schema migration still follows CLAUDE's concrete confirmation requirement. Local/read-only/backup/migration/config/backfill/push actions required sandbox escalation; authorization is supplied by Andrew's explicit reply. No automatic approval rejection remains.

## Private backup, key recovery and operation evidence

Latest pre-apply snapshot: **`tmp/speed-trivia-uniqueness-private/2026-10-13T14-24-58-385Z/`**, stable 13,878 rows, unchanged from earlier review snapshot, sole pending migration at capture. It exported questions/schema and aggregate references, no player identities. Before mutation a durable archive was extracted and verified:

`/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-preapply-2026-10-13T14-24-58-385Z.tar.gz`

**4,607,373 bytes**, SHA-256 **`960770f70b4aab024b5ca1e034e5ddf096380938c6ebd371fb9ef12b4bea3c77`**; recovered under **`/private/tmp/speed-phase4-preapply-_0kpctm6/2026-10-13T14-24-58-385Z/`**, core inventory verification passed. Preserve older Phase 1/2/4 backups/manifests/budgets/caches. Hosted off-device Supabase backup **`1953327419`**, completed **2026-10-13T11:31:37.619Z**, was listed independently; hosted restore was not tested, PITR is disabled. Same-Mac archive cloud sync is not established. No whole-database restore is appropriate for routine Speed rollback.

**Secrets: never print/read into tool output/commit** operational `tmp/speed-trivia-uniqueness-private/phase4-release/release.env` and separate durable key copy:

`/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase4-admission-release-2026-10-13.env`

Both mode 0600, byte-verified; key is not in question archives/docs/CLI args/SQL text. Use Node environment injection. `configure-speed-trivia-admission.cjs --apply` used bind `$1`; matching host secrets were set through stdin with output suppressed. Key rotation is intentionally refused by that setup helper. No direct service-role access was granted to private tables.

Private operations directory **`tmp/speed-trivia-uniqueness-private/phase4-release/`** includes `workflow-before-pause.json`, `workflow-after-pause.json`, `host-configuration.json`, `production-guard-verification.json`, `backfill-verification.json`, `live-session-readiness.json`, and private operational helpers `configure-hosts.cjs`, `verify-release.cjs`. No secret values belong in their JSON evidence. `live-session-readiness.json` records full 13,878-row index/revision 0, provider requests 0/dollars 0. Publication evidence is added here after deployment.

Earlier review evidence **`2026-10-13T12-55-58-227Z/`** includes dependencies and fresh aggregate references: 3,307 Speed answers, 5,626 answer variants, 18 user-seen records and zero Speed session/Live-answer/venue-seen links. Gameplay may add references without advancing question revision; refresh before Phase 5. Phase 2 manifest remains non-applyable. No cleanup transaction or undo log was created.

## Files and architecture relevant to Phase 4.1

- **`docs/speed-trivia-uniqueness-plan.md`**: updated approved decisions, four detailed editorial phases, gate/budget/pilot sequencing and Phase 5 final position. Do not resurrect standalone Phase 6 or spend the pilot early.
- **`docs/speed-trivia-uniqueness-phase-4-release-record.md`**: exact manifest/migration/backup/cap/rollout and live verification facts; earlier review facts remain dated historical evidence. This handoff and `AGENTS.md`/`SYSTEM_CONTEXT.md` pointers are current.
- **`scripts/configure-speed-trivia-admission.cjs:configure`**: parameterized private DBA setup, read-only default, fixed project and safe existing-key refusal. Three configuration safety tests in `tests/scripts.speed-trivia-configuration.test.ts` use synthetic transport.
- **`runtime.cjs:createSession/createBudget`**: shared corpus/index/bounded deltas/cache and per-operation token/dollar/request/candidate/retry/time cap, signed current-revision write receipts. Existing budget should be reused by future quality/rewrites; never add an independent $0.50 budget per stage.
- **`generation.cjs:runGeneration/planTopics/briefFor/normalizeGenerated`**: current DB category/subtopic planning, 72 authored briefs, primary-subject spread, four-option shape checking and uniqueness admission. Current generation is uniqueness-only and is intentionally paused until editorial implementation. Deterministic shape checking is not a quality verdict.
- **`lib/speedTriviaAdmission.ts`**: serialized server index mutations/admission adapters; gate callers are `lib/admin.ts`, generic admin route and newer question review routes. Future quality design must consider manual create/edit/import/approve and legacy handling without silently mass-certifying all old questions.
- **`core.cjs`/`gemini.cjs`** frozen uniqueness core/judge, unchanged. Core SHA **`24ae8e137aa990be82e9a09b60e4b822fcc497248cf20ab342538e596d047660`**, provider SHA **`1fad34a5a2b8ea1f6ae89a6d63bb987b4bff77a4b64f684039ea7a259e167d2f`**. Versions **`speed-facts-v2` / `answer-concepts-v2` / `union-answer-bm25-concepts-v4`** and **`gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`**. Keep these gates separate from a new editorial policy and never change hashes/labels to manufacture passing tests.
- **Migration `20261013120000_speed_trivia_admission.sql`** is applied immutable history. New editorial schema, if actually needed, requires a new timestamped migration, explicit API-grant/RLS review and separate concrete production confirmation.
- **`backfill-speed-trivia-features.cjs`** writes derived metadata only, does not certify legacy questions unique/good. **`manage-speed-trivia-retirement.cjs`** applies frozen checksummed retirement manifests in 50-row transactions and current-admission undo; Phase 5 only. Live importer branch/gameplay history remain intact.

## Testing, cost baseline and operational traps

Local final Phase 4 gates before rollout: **4,226 Vitest pass / 13 environment-gated skip / zero fail**, 355 passing files + one skipped, started **9:02:34 AM EDT**, 18.25 seconds; targeted eight-file suite **68/68**. SQL synthetic checks **26 admission / 16 retirement-undo / 7 real simultaneous PostgreSQL sessions** passed. Typecheck/lint/build **202 pages**/diff checks passed. Frozen original/fresh recorded-provider comparison gates remain passing. No fresh paid editorial evaluation exists.

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

**Do not repeat migration/backfill apply, key setup, workflow dispatch/enable or generation just as a test.** Backfill is complete; the single pilot is reserved for 4.3. Inspect/refetch current state before retrying interrupted bulk requests because earlier verified items may already be committed. No emergency unchecked rollback: retain DB guards, pause admission/generation, restore only reviewed app versions, never disable triggers/down-migrate/blanket restore.

Fresh offline corpus: **10,002,942 compact bytes**, 30 initial RPCs, **3,151 ms** index build, **207 ms** for 271 retrievals, mean **37.0664** competitors, all complete/no overflow; 268 exact existing-bank matches, so this is not novel-generation yield. Private report `tmp/speed-trivia-uniqueness-private/phase4-offline-cost-and-planning.json` is immutable/exclusive. No malformed/image rows in this fresh Speed corpus.

Estimated old traffic 46.38 MB/night versus shared roughly 10–11 MB/night/300–330 MB per 30 scheduled loads. At 10× bank size roughly 100–110 MB/load/3–3.3 GB per 30 nights; avoid per-category/per-candidate full reloads. Backfill at 13,878 rows was one load + 28 batches; no paid calls. Persistent-cache/storage/Supabase marginal bill and deployed bulk latency remain unmeasured. Uncapped naive checking estimate about $109 per 30 nights before generation/manual work ($218 at 2× work; 10× candidates $1,090/$2,180) is contained by the approved $0.50 operation cap. Shortfalls/zero are expected valid outcomes, not permission to raise caps.

## Open questions and recommended next steps

No developer question blocks 4.1. Use the explicit requested editorial criteria and existing keep-best/different-facts/zero-output decisions. Ask only for a small genuinely disputed labeling/style policy if repository examples cannot settle it. No extra spending, provider switch, new migration or paid retry is authorized by this plan addition.

1. Confirm final publication facts below and working-tree state. Preserve private evidence/editor files and leave nightly disabled.
2. Execute **4.1 with Sol/high**: inspect generated examples/current inventory privately, define editorial rubric/reasons and topic/difficulty contract, build sanitized calibration/held-out fixtures and explicit pass gates before implementation. Do not ask Andrew to review hundreds of obvious weak questions.
3. Estimate incremental quality/rewrite calls/bytes at present and 10× volume, including retries/reservations and cache reuse, under the existing shared $0.50 cap. Prefer rejection/fewer safe output over new expensive providers.
4. Write `docs/speed-trivia-uniqueness-plan_PHASE_4.1_HANDOFF.md` and update plan/context status before completing 4.1. Next is 4.2, then one quality pilot/restart in 4.3, seven-run monitoring in 4.4, final Phase 5 cleanup.

## Final publication facts

Application/workflow publication and production deployment verification pending at this intermediate write. Replace this paragraph with exact release SHA, workflow state, deployed ID/aliases and final unchanged-data/backfill checks before marking Phase 4 complete.
