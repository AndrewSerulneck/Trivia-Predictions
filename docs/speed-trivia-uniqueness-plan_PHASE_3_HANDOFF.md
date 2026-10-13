# Speed Trivia uniqueness — Phase 3 handoff

Date: **2026-10-13, America/New_York**. Next: **Phase 4 only, GPT-6.1 Sol / high**.

## Developer summary

Phase 3 built the prevention locally: every new question, import, edit and approval now uses the same fact check. The database refuses unchecked saves and forces another check when two writers race. Retired facts stay remembered. Generation uses the real question bank, explores less-used subtopics, limits repeated subjects in a nightly batch, and can stop below 100 questions rather than recycle facts.

**This is not live yet. Existing repeated questions have not been removed.** Phase 4 reviews/releases the safeguards; Phase 5 retires the reviewed repeats while keeping one good version and preserving past games. The Phase 2 proposal remains 849 active + 1,618 pending retirements, with unresolved cases explicitly retained; it is not an apply input or a completed cleanup.

The plan should give players fewer recycled facts and a wider subject range. It does not prove that the generator's writing is more creative or that every semantic mistake is impossible. Generation breadth/yield and actual total cost still need the capped live release/pilot and monitoring. **Phase 3 made no paid model calls.** No production migration, question mutation, cleanup, workflow operation, push or deployment occurred.

No developer answer is needed to complete this local phase. Phase 4 still needs an informed spending limit and the project's explicit confirmation for the concrete production migration/rollout. A suggested $0.50 nightly ceiling is only a proposal, not an approved allowance.

## To the next agent: goal, scope and exclusions

Read `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, this handoff, `docs/speed-trivia-uniqueness-phase-3-release-runbook.md`, Phase 2 handoff/engine/cleanup summary and Phase 1 writer map.

Execute **Phase 4**: review/fix admission and threat/race paths; run final gates; prepare the exact release manifest; verify live schema/drift/backups and caps; obtain the genuinely required `supabase db push` confirmation; coordinate migration, private key, metadata backfill, application/workflow deployment and one capped manual run; record actual deployment/run/spend evidence. Prevention must be live before cleanup.

Out of scope: applying duplicate retirements (Phase 5), promoting pending-only keepers silently, physically deleting Speed/player/history records, changing scores/rewards, rewriting Live JSON, changing `vercel.json` or the cron schedule, down-migrating old SQL, restoring retired duplicates, selecting a different production generator/provider without equivalent evaluated evidence and an approved capped trial. Do not count a push as deployment. Do not claim all reported families or the entire bank are cleaned.

No delegation requested/used. The plan names Sol/high; keep the release transaction together rather than starting multiple agents/chats mid-rollout.

## Starting state: branch, commits, deployment and data

- Workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch **`main`**; HEAD **`96b88658dfeeb42ef88aa09fb858d9d794631e04`**. No new commit, push, PR or deployment. Operational remote **`AndrewSerulneck/Trivia-Predictions`**; package metadata points elsewhere.
- Phase 0–2 docs/scripts/core/fixtures/types remain untracked/uncommitted. Phase 3 modifies existing writers/workflow and adds the files below. Review/stage the whole coherent implementation when Phase 4 calls for a release commit; do not omit untracked Phase 2 core files because `git diff --stat` excludes them.
- Preserve pre-existing modified **`next-env.d.ts`** (`.next/types/routes.d.ts` instead of the committed dev path) and untracked **`.vscode/settings.json`**. Builds regenerate Next types; no manual restore/staging was performed. Existing **`eslint.config.mjs`** modification is Phase 2's `.d.cts` parser override, not a Phase 3 change.
- Linked production Supabase project **`pkmxupsayzshvpirkaav`**. New migration exists **locally only**: **`20261013120000_speed_trivia_admission.sql`**. Nothing was applied. New key/cap were not configured anywhere. Old migration files, `lib/supabaseAdmin.ts`, `.env.local` contents and `vercel.json` were not edited.
- Live nightly workflow was not paused/dispatched/reconfigured. Its operational state/current release were not re-queried during Phase 3. The YAML changes are only local. Dated Phase 1 evidence/run ID **38227838099** / source **0931f553d3f0bc57b4f00b1030787bd270740eaa** remains dated evidence.
- No question cleanup/restore/approval/export, player write or paid generation/checking was intentionally executed against production. Standard full tests/typecheck/lint/build were run; build loads the existing `.env.local` through Next's normal mechanism. No browser/real payment/gameplay test was performed. No env values were printed or archived.
- Last independently captured bank: **13,801 Speed rows**, **5,136 active / 8,663 pending / 2 deleted**, nine categories. That is the preserved October 13 snapshot, **not a fresh live count**. Phase 4 must check drift before release.
- No production undo log exists because there were zero phase mutations. The private cleanup-log table/tool are newly implemented local release prerequisites.

## Preserved private evidence and new evidence

Phase 2 snapshot remains:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z/
```

Phase 2 private proposal remains `tmp/speed-trivia-uniqueness-private/phase2-dry-run/retirement-manifest-1791866241862.json`, SHA-256 **`9c8e8023c7d1f4169d7317f777e1c9d66ef778052da479c376ffeee3056b650c`**; **`applyReady:false`**. Its original assumptions/holds and reference evidence are unchanged. Read the Phase 2 handoff before using it; Eras/Africa/longevity are not fully consolidated, and 3,957 distinct rows have overlapping unresolved entries.

Durable same-Mac archive remains:

```text
/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/phase2-2026-10-13.tar.gz
```

SHA-256 **`569575a2ab4362d26f8782a726dacb5a4e6bc64d1e8b2d28043fbf5107a666cc`**. Phase 2 verified 81 indexed files after extraction. **Off-device recovery remains unverified**; obtain fresh recoverable evidence before production mutation. Phase 3 did not replace/archive raw data or reset prior paid ledgers.

New ignored evidence:

- `tmp/speed-trivia-uniqueness-private/phase3-offline-cost-and-planning.json`: sanitized measurements from the verified preserved snapshot; SHA-256 **`c37a128d8746777369593913446353a751bcb2c976d619285113c3d0d3f8262e`**. No network/provider calls. 13,801 rows, **9,946,466 compact bytes**, **30 initial RPCs**, **3,303 ms** index build, **197 ms** retrieval over **271** valid frozen candidates, mean **36.9557** competitors. **268** exact matches are existing-bank examples, not fresh generation yield evidence.
- `tmp/speed-trivia-phase3-vitest.log`, `tmp/speed-trivia-phase3-targeted.log`, `tmp/speed-trivia-phase3-build.log`: local verification logs. They contain synthetic test/provider accounting, not actual paid Phase 3 spending.
- `tmp/speed-trivia-postgres/`: ignored test-only npm prefix containing **`embedded-postgres@18.4.0-beta.17`** and **`pg`**. Not an application dependency/package lock change. No private player data or live credentials.

## Decisions already made; do not re-ask

Andrew chose keep-best/soft-retire/preserve-history; repeated facts are banned, **different facts about the same artist remain valid**; 100 is a ceiling and zero new output is acceptable; measure/approve spending before release. Phase 2 had separate **$5 benchmark + $10 audit** authorization, conservative spend **$4.9012484**. This did not authorize a recurring budget or paid Phase 3 generation trial. Phase 3 actual paid generation/checking **$0**.

The generator remains Gemini by default. Topic breadth is improved by inventory-driven planning before proposing a provider swap. No lifetime artist/song/album ban, no automatic retirement for subject concentration, no relaxed frozen comparison gates. New rows/pool conversions start pending. Existing active edits can remain active only after current fact checking; approvals recheck current content/corpus. An unchanged trusted import is an idempotent no-op; it never restores deleted rows.

There is no unchecked emergency fallback: corpus/dependency/configuration/receipt problems stop Speed writing; `--allow-category-errors` only tolerates bounded harmless generation failures. Verified earlier admissions survive a later fatal failure and appear in the run report; no unverified remainder is imported.

## Implementation: files and connections

- **`lib/speed-trivia-uniqueness/runtime.cjs`**, **`runtime.d.cts`**, **`types/speedTriviaAdmission.ts`**: `createBudget`, `readerFor`, `createSession`, `write`/signed `leave`, bounded `refresh`/`applyDelta`, HMAC signing and `AdmissionError`. One corpus/index per coordinated run; delta-only posting changes after writes. Current old-state hash/payload/content/policy/revision/expiry bind each receipt. At most two stale-write attempts consume global retry claims; edits drifting from their exact old state refuse. Semantic calls stop on the first rejecting/uncertain result; remaining tasks get explicit unexamined holds, never invented unique results. Actual provider decisions are content/version keyed and persisted through signed cache RPCs. Compact admission metadata stores pair keys instead of duplicate full verdicts.
- **`lib/speedTriviaAdmission.ts`**: server-only canonical gate; regular DB lookup for existing Live/Speed rows; `convertSpeedTriviaToLive` for explicit checked pool departure; one cached index/pair cache per server process; serialized local index mutations; bounded delta refresh. New/cold Vercel instances load once. Actual deployed Vercel/request duration and bulk-provider latency still need Phase 4 verification; an interrupted bulk operation can have already committed earlier verified items, so inspect/refetch current rows before retrying. Cache overflow over 500 changes fails closed, discards the stale cached index and lets a later operation start clean. Pair cache is cleared over 20,000 entries after successful writes. `speedTriviaError` maps repeat/uncertain/retired conflicts to 409 and unavailable/configuration/budget issues to 503. Duplicate messages name existing question/answer rather than only UUIDs.
- **`lib/speedTriviaUniqueness.ts`** remains comparison-only; comment now points writers at admission. **Frozen `core.cjs` / `gemini.cjs` / policy / fixtures are unchanged.** Do not rewrite hashes/labels to make tests pass.
- **`lib/speed-trivia-uniqueness/generation.cjs`**: `planTopics`, `briefFor`, `normalizeGenerated`, `subjectKeysFor`, `generateOnce`, `runGeneration`. Counts current active/pending inventory across all DB categories; 72 authored subtopics for the nine present categories; rotates toward less-used categories/topics. Signed `speed_generation_metadata` (`speed-subject-plan-v1`) stores chosen subject/subtopic on each admitted row, so later runs count topic use even when the question does not literally name the topic; unchanged approvals/wording edits retain it, changed facts clear stale labels. Relevant reserved facts (including deleted/cross-category wording) and concentrated subjects go into bounded prompts. Topic counts are cheap lexical steering, not proof of novelty. After generation, shared admission checks every candidate. Subject spread uses the supplied subject plus correct-answer identity and named question entities, so changed labels cannot trivially evade it. Broader answer/name spread can hold distinct questions within one nightly batch; it is not a permanent fact ban.
- **`scripts/generate-trivia-nightly.cjs`** and **`generate-trivia-questions.cjs`**: small entry points into that single in-process coordinator. Direct generation also admits checked pending rows into the canonical DB. `--dir` is retained for compatibility but does not read/write canonical Speed exports; `--new-only-dir` receives diagnostic report/admitted artifacts. `--new-categories` accepts only zero; category invention/unbounded child refills/old fallback were removed. Missing credentials cannot simulate an empty bank. `reportFailure` emits a zero-admission fatal summary if setup fails.
- **`.github/workflows/trivia-nightly.yml`**: same nightly schedule/concurrency, one generate/check/admit process with new secret/cap prerequisites, 100/10/0 limits and private seven-day report artifact. No separate unchecked importer/validation stage or provider fallback. **Local YAML only**.
- **`scripts/import-trivia-questions.cjs`**: Speed portion gets one shared admission session; changed content/current status checked, retired slugs refused, unchanged trusted reimports skipped. Normal Live normalize/upsert/prune branch retained. `--check` remains shape-only, does not certify bank novelty.
- **`lib/admin.ts`**: gated Speed create/edit, generic pool conversion/bulk changes, Speed bank edits; removed local Speed write fallback/helpers. Generic Speed deletion and Speed bank deletion are status-only and preserve references. Live file fallbacks/replacements remain. Bulk operations commit sequential verified items; a later refusal can leave earlier verified items changed. They are bounded to 200 and never allow unchecked rows.
- **`app/api/admin/route.ts`**, **`app/api/admin/trivia/questions/route.ts`**, **`app/api/admin/trivia/questions/[id]/route.ts`**: create/edit error mapping, shared checked bulk approval, retired refusal, final Speed content checking; write-in `answer` mutation is refused for Speed. Speed deletion skips Live replacement helpers. Existing auth guards remain.
- **`scripts/backfill-trivia-question-bank.cjs`**: legacy Speed backfill disabled; existing Live branch retained. **`restore-deleted-speed-trivia.cjs`**: blanket restore disabled. **`cleanup-trivia-duplicates.cjs`**: legacy apply/local mutation flags disabled; dry audit retained.
- **`supabase/migrations/20261013120000_speed_trivia_admission.sql`**: local schema/protocol below; **read `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` before altering it or adding future SQL**. Existing historical migration files were not touched.
- **`scripts/manage-speed-trivia-retirement.cjs`**: validates an explicit checksummed new apply manifest; defaults dry-run. `--apply` uses immutable signed atomic batches and private journal; `--undo --apply` uses original DB before/after log and fresh admission. No recomputation or blanket resurrection.
- **`scripts/backfill-speed-trivia-features.cjs`**: current corpus, 500-row metadata-only batches, exact revision/hash/extractor binding and resumable private checkpoints; dry-run default, no paid extraction, no legacy unique/approval certification. Persisted features are useful provenance; runtime reuses its in-memory features and does not download a second full metadata table per run.
- **`scripts/measure-speed-trivia-admission-offline.cjs`**: repeatable private-snapshot-only transfer/retrieval/index/planning measurement; exclusive output file. It deliberately does not measure live generation quality/spend.
- **Docs/context**: this handoff, `docs/speed-trivia-uniqueness-phase-3-release-runbook.md`, plan status/Phase 3 table row, and local-only pointers in `AGENTS.md` / `SYSTEM_CONTEXT.md`.
- **Tests/SQL runners**: `tests/scripts.speed-trivia-admission.test.ts`, `tests/admin.speed-trivia-admission.test.ts`, `tests/api.admin.speed-trivia-review.test.ts`; `scripts/test-speed-trivia-admission-sql.cjs`, `test-speed-trivia-admission-concurrency.cjs`, `test-speed-trivia-retirement-sql.cjs`.

## Database protocol, writer coverage and traps

All `anytime_blitz` INSERT/content/category/image/status activation changes require a transaction permit issued by `admit_speed_trivia`. HMAC-SHA256 is implemented using Postgres SHA-256 primitives, tested against Node (including Unicode/long keys), so no pgcrypto extension dependency. The private control table's key starts NULL. A receipt expires after five minutes, binds the exact payload/content/policy/current revision and exact old state, and is validated under the shared lock before saving content/metadata. Default `clear` does not count as evidence.

Private tables: `speed_trivia_control`, `speed_trivia_permits`, `speed_trivia_memory`, `speed_trivia_changes`, `speed_trivia_admissions`, `speed_trivia_cleanup_log`, `speed_trivia_pair_cache`, `speed_trivia_features`. All have enabled/forced RLS; direct API table access is explicitly revoked, including service role. Documented grants-contract exemptions are intentional because only restricted security-definer RPCs may use them. RPCs pin `search_path=pg_catalog,public`, revoke PUBLIC/anon/authenticated execution and grant only intended entry points to service role; utility/trigger functions are not client-executable. Key setup requires an approved DBA channel. The new public question columns are `image_context`, `speed_revision`, and nullable versioned `speed_generation_metadata`; the label is diversity provenance, not permission to admit. The trusted boundary is server signing key + reviewed semantic service; a DB owner that deliberately disables triggers or a compromised signing service cannot be secured by these triggers.

The statement trigger locks control **before question row locks**, including multi-row direct DML, preventing lock-order inversion with the admission RPC. Live writes take the same brief transaction lock but require no semantic ticket and do not advance the Speed revision unless leaving/entering Speed. Semantic work stays outside the transaction. Row triggers reject physical Speed deletion/identity changes, recompute normalized keys on every Speed write, preserve facts on pool departure, and protect pool conversion/activation. TRUNCATE is revoked and blocked. Converted former-Speed rows also remain protected from physical deletion. Service-role calls cannot insert permits, change the signing key or bypass with a custom session setting. Speed-to-Live conversion also requires a signed `leave_speed_trivia` permit bound to current revision/old state; normal Live upserts cannot overwrite a colliding Speed slug. Former-Speed provenance cannot be cleared by direct writes to permit a later physical delete.

Edits exclude only the current row from full-bank comparison. A separate old/new fact comparison distinguishes a wording edit (one representative, no duplicate memory copy) from changing the fact (old fact retained as `history:<UUID>:<revision>`). This prevents a wording edit from self-blocking later approval while keeping a replaced fact reserved. Unresolved old/new relation holds the edit. Deleted rows stay in the corpus. Different fact keys/paraphrases checked against the same old revision cannot both commit; the second waits/rechecks/refuses. Delta reads are bounded at 500 changes; overflow is a failure, not silently truncated success.

Cleanup logs record manifest entries/keepers/evidence plus full before/after states. Apply uses status-only retirement and checks active unchanged keepers outside the retirement list. Every 50-row transaction rolls back entirely on a bad member. Replays validate after-states. Drift refuses further batches rather than rebasing/changing the frozen list. Undo requires exact logged current state + fresh uniqueness and **cannot restore a duplicate merely to roll back a cleanup**. The copied SQL fixture's successful undo uses an injected unique verdict to prove mechanics only; the real runtime test correctly rejects its still-conflicting keeper. Do not claim production undo has been performed.

New question selection/history/in-flight lookup (`lib/trivia.ts`, `lib/activity.ts`) are untouched. Phase 1 established active-only selection and status-independent UUID answer lookup. Phase 5 must prove the actual retained references/in-flight behavior after its reviewed cleanup. The Speed JSON exporter still needs empty-category/stale-file handling in Phase 5. The old legacy lexical evaluator depends on removed generator internals; its dated historical evidence is retained, but use the frozen release checker for current gates.

## Verification and exact commands

Use repository root and Node 20-compatible runtime. SQL tests use synthetic fixtures only; no `.env.local`, real DB, production cleanup or paid API calls.

```sh
node scripts/test-speed-trivia-admission-sql.cjs
node scripts/test-speed-trivia-retirement-sql.cjs
node scripts/test-speed-trivia-admission-concurrency.cjs
npx vitest run tests/scripts.speed-trivia-admission.test.ts tests/admin.speed-trivia-admission.test.ts tests/api.admin.speed-trivia-review.test.ts tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/supabase-migration-grants-contract.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run build
git diff --check
```

Results at phase finish are recorded in the final verification note below. Frozen original/fresh comparison cases remain passing: original **137/137 duplicates blocked**, **122/124 distinct accepted**, held-out **43/43 blocked / 36/37 distinct accepted**, supplementary **18/18 duplicates blocked / 18/18 distinct accepted**; finite cases, not universal recall or a new paid benchmark.

The runtime tests include missing credentials/config/schema, >1,000 actual SQL rows over three pages, deleted/cross-category exact/alias/reversal matches, batch sharing, same-artist different facts, own-row edits/wording approvals, stale revision/delta/retries, budget/time/token exhaustion, reserved lost calls, direct DB bypasses/pool conversion, idempotent imports, generation success/zero/shortfall/diversity, fatal verification despite `--allow-category-errors`, and Live edit/delete preservation. The concurrency runner uses **actual simultaneous PostgreSQL 18 sessions**: lock-wait evidence in `pg_stat_activity`, only one competing commit, and invalidation by direct retirement. PGlite alone queues transactions; do not misdescribe it as multi-session proof.

Isolated dependencies already installed:

```sh
# Existing PGlite path (no package.json change):
SPEED_TRIVIA_PGLITE_MODULE=tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite node scripts/test-speed-trivia-admission-sql.cjs
# Recreate ignored actual-Postgres runner on another machine if needed:
npm install --prefix tmp/speed-trivia-postgres --no-audit --no-fund embedded-postgres@18.4.0-beta.17 pg --cache /private/tmp/speed-trivia-npm-cache
# On this Mac npm blocked the binary package's postinstall; run its inspected symlink script:
(cd tmp/speed-trivia-postgres/node_modules/@embedded-postgres/darwin-arm64 && node scripts/hydrate-symlinks.js)
node scripts/test-speed-trivia-admission-concurrency.cjs
```

Sandbox initially blocked npm network and Postgres shared memory. Automatic escalation review approved metadata/install and local concurrency execution; **no auto-review rejection remains**. Real Postgres requires local shared-memory/loopback access and unused **port 55483**; runner creates/stops only its own temporary cluster. No root-user account creation or Homebrew/system install. Standard typecheck must not run concurrently with build because `.next/types` regenerates. Lint emits only the existing Babel large-file note for `lib/sportsBingo.ts`.

Offline measurement was actually run:

```sh
node scripts/measure-speed-trivia-admission-offline.cjs --snapshot tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z --output tmp/speed-trivia-uniqueness-private/phase3-offline-cost-and-planning.json
```

That output is exclusive/immutable; use a new output filename to rerun. Never reset the old Phase 2 paid budget ledgers to obtain fresh spending permission.

## Costs, open decisions, limits and first steps

Read the release runbook's estimates before activating anything. Old Phase 1 transfer estimate **46.38 MB/night** versus roughly **10–11 MB/night** shared load here, plus deltas/cache. At 10× bank size roughly **100 MB/night**, 279 initial inventory/page calls. DB cache/metadata storage and per-tap cold-start traffic remain unmeasured in production. No paid end-to-end novel yield test was run; benchmark sample matches mostly existing bank facts and cannot supply that claim.

Naive uncached comparisons at Phase 2 measured pair cost remain about **$109/month**, excluding generation/manual operations, **$218 at 2× work** and 10× volume **$1,090/$2,180**. Persistent caches/early rejection reduce work, but quantify actual reduction during the approved pilot. A proposed **$0.50 nightly cap** gives at most **$15 for 30 scheduled runs** including generation/checking; it is **unapproved**, and manual operations/extra runs are additional ceilings. Current code has **no dollar default** and cannot activate paid admission without configuration. In-flight provider/database waits and receipts are bounded by remaining elapsed time, not just checks between calls. Global limits are 100 accepted / 200 requested candidates / 20 generation calls / 2 retry claims / 2M input / 500K output / 8,000 provider requests / 10 minutes; raising target to 1,000 needs an intentional reviewed change.

Open developer decisions for Phase 4: approved total recurring/operation budget and separately capped pilot if needed; concrete production migration/release confirmation; fresh off-device/recoverable evidence before mutations; a secure approved DBA route to set the private key if existing operational credentials cannot do it. No Phase 3 task is waiting on a developer answer. Future disputed keeper/fact cases belong to a small triaged list; do not ask Andrew to review thousands of obvious repeats.

Recommended first steps, **Sol/high**:

1. Inspect HEAD/worktree, this full handoff and runbook; preserve unrelated changes. Review signed ticket/old-state/revision/permit/cache/trigger threat paths and writer coverage, including Live conversions and privileged direct DML.
2. Review/re-run local gates and capture the exact final code/migration SHA in a concrete release manifest. Recheck live schema/counts/drift and backup recoverability read-only. Nothing here establishes the current hosting release.
3. Present measured baseline, proposed capped recurring allowance/pilot and the exact production rollout for genuinely required confirmation. Prepare the key setup and resume/rollback mechanism before asking; don't invent an extra broad approval burden.
4. Keep legacy generation paused while installing guards, configuring private key/cap, backfilling metadata and deploying/verifying new app/workflow. An incomplete rollout stays closed to unchecked Speed writes.
5. Record actual manual Action/deployment/migration/revision/cost/quality evidence, update context pointers and write the Phase 4 handoff before calling it complete. Leave cleanup for Phase 5.

## Final verification note

**Phase 3 complete locally, 2026-10-13.** Final `npm run test`: **4,223 passed / 13 environment-gated skipped / zero failed**, **354 passing test files + one skipped file**, 16.45 seconds (run started **08:31:07 EDT**). Targeted new runtime/admin/review tests: **27/27**, including real SQL pagination/delta overflow and staged generation success/zero/fatal handling. `npx tsc --noEmit`, `npm run lint`, `npm run build` (202 generated pages) and `git diff --check` all pass. No typecheck ran concurrently with build.

Isolated SQL: **26 checks** admission/privileges/hashes/conversions/retirement memory; **16 checks** copied-database immutable cleanup/undo, reference preservation and whole-batch rollback; **7 checks** real simultaneous PostgreSQL sessions with actual lock waiting/stale refusals. All pass. These use synthetic injected judgments to test write mechanics; semantic quality is separately covered by the unchanged frozen actual-provider evaluation replay. Phase 3 paid API usage remains **zero**.

One intermediate full run hit the existing randomized NFL star-tilt test: star share **0.29583333333333334**, expected **>0.3**. No Bingo code/test/threshold changed. That file passed all **12** cases unchanged on recheck; the final entire suite passed. Preserve ignored `tmp/speed-trivia-phase3-vitest-random-failure.log` and `tmp/speed-trivia-phase3-bingo-recheck.log` as provenance. This is an existing statistical-test stability limit, not a relaxed Speed gate.

Final local migration SHA-256: **`df80e21f705aeaf772b12316f4290d031c2333111a4321d71e4a6b45768f72a4`**. Frozen core **`24ae8e137aa990be82e9a09b60e4b822fcc497248cf20ab342538e596d047660`**; frozen provider **`1fad34a5a2b8ea1f6ae89a6d63bb987b4bff77a4b64f684039ea7a259e167d2f`**. No phase changes were committed, pushed, deployed or applied. Next action is Phase 4 review/release, not production cleanup.
