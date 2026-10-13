# Speed Trivia prevention: release, backfill and recovery

**Prepared locally October 13, 2026. Not deployed or applied. Phase 4 executes release; Phase 5 executes cleanup.**

The new system checks the fact behind every new or edited Speed question. It remembers retired facts, shares checks across categories, and rejects a save if somebody changed the bank after the check. It also gives generation a wider subject brief. This file describes how to switch it on without temporarily allowing unchecked questions.

## Release prerequisites and costs

Application source is uncommitted on `main`, base `96b88658dfeeb42ef88aa09fb858d9d794631e04`. Review the complete Phase 0–3 changes together. Preserve unrelated `next-env.d.ts` and `.vscode/settings.json`; the narrow `.d.cts` eslint override belongs to Phase 2. Phase 2 core/provider code and frozen evaluation files are unchanged.

Local migration: `supabase/migrations/20261013120000_speed_trivia_admission.sql`. Production project: `pkmxupsayzshvpirkaav`. Before any application rollout, pause `Trivia Nightly` **with an explicit prepared operational action**, record its previous enabled state, and ensure no in-progress legacy run can import. Do not change the cron schedule. Legacy Speed writers must remain stopped during a rollback. Existing active gameplay and Live Trivia continue.

Required new configuration:

- `SPEED_TRIVIA_ADMISSION_SECRET`: a new random server-only key of at least 32 characters, identical in the private database control row, Vercel server environment and GitHub Actions secret. Never use `NEXT_PUBLIC_`. Never print/store its value in docs, manifests or command output. Configure the DB value through an approved parameterized administrative connection, not a service-role RPC; service role cannot read/change the control table.
- `SPEED_TRIVIA_MAX_DOLLARS`: an **explicitly approved** dollars-per-operation/run ceiling. GitHub uses a repository **variable**, Vercel a server environment value. No default exists: unset/zero/invalid stops Speed writes. A bulk approval shares one ceiling; individual manual requests each have their own ceiling. This is **not** a shared monthly allowance.
- Existing Gemini generation/checking credentials and Supabase credentials. Generator stays `gemini-2.5-flash` by default. The old unpriced `gemini-2.0-flash` fallback is removed. No new provider, embeddings, grounding or paid extraction is introduced.

Generation stores signed, versioned `speed_generation_metadata` (`speed-subject-plan-v1`) on each admitted row. Topic allocation counts those labels as well as legacy wording, so a question about Bach counts toward its chosen subtopic even without the word “classical.” Approvals/wording edits retain the label; replacing the fact clears it unless new generation provides a checked label. This adds no separate RPC/provider call and about 100–160 bytes per newly generated question (roughly 0.3–0.48 MB per 3,000/month, or 3–4.8 MB at 10×). New NULL/revision/context fields add response framing to the old snapshot; allow about 1 MB extra per cold corpus load until live measurement. Labels steer diversity, not uniqueness certification.

Global nightly limits: **100 accepted**, **200 requested candidates** (including lost/failed generations), **20 generation calls**, **2 shared retry claims** for category failures/stale writes, **2,000,000 reserved input tokens**, **500,000 reserved output tokens**, **8,000 total provider calls**, **600,000 ms** elapsed and the approved dollar ceiling. The earliest limit wins. Provider/database waits are bounded by the remaining run time; signed receipts also expire at the run deadline. Semantic calls have no automatic retry/fallback. Each candidate's retrieval remains capped by the unchanged Phase 2 policy (128 competitors; overflow held). Lost requests retain their worst-case reservations. Dollar/output reservations are made before calling the provider; billed reasoning is included. Zero admitted questions is valid. Verification failure is fatal, even with `--allow-category-errors`; earlier verified admissions remain saved and appear in the report.

**Measured offline, preserved 13,801-row snapshot:** 9,946,466 compact JSON bytes, 30 initial inventory/page RPCs at 500 rows/page, 3,303 ms initial index build, 197 ms for 271 frozen candidate retrievals; average 36.9557 competitors. Of those bank-derived cases 268 match an existing exact question; this is **not a generated novelty-yield benchmark**. No paid call/production query occurred. Report: ignored `tmp/speed-trivia-uniqueness-private/phase3-offline-cost-and-planning.json`.

Phase 1 estimated old traffic 46.38 MB/night / 1.391 GB per 30 nights. This design loads one complete current/historical corpus (approximately **10–11 MB/night / 300–330 MB per 30 nights** at today's inventory), plus bounded changed-row and cache reads/writes. At 138,010 rows, approximately **100–110 MB/night / 3–3.3 GB per 30 nights**, before cache/delta/protocol traffic. Inventory is loaded once per process/run, not per category; an admin server process caches its index and refreshes at most 500 changes. A cold/new server needs one load; do not imply every Vercel request shares a permanently warm instance.

Per nightly run, approximately **30 initial RPCs + up to 200 candidate refreshes + up to 100 admissions/post-write refreshes**, plus at most one bounded pair-cache read/write per candidate, slug lookups where supplied and bounded retries. Semantic provider calls can be much higher than DB RPC counts. A fresh roughly 37-comparison candidate stores at most 37 signed pair-cache entries. New admissions store cache references instead of duplicating full verdicts; derived features are local computation. Worst-case uncached 200 × 37 comparisons imply about **7,400 cache entries**, approximately **3.7 MB** at an illustrative 500 bytes/entry, plus admission/feature records; approximately **111 MB per 30 nights** for pair records alone. At 10× candidate volume that storage estimate is 1.11 GB/month. Actual sizes, reuse and Supabase bill impact are unmeasured; the dollar/time/token caps usually stop far earlier. Code still caps accepted volume at 100; raising it to 1,000 is a future reviewed change, not an automatic scale-up.

Phase 2 measured about $0.00049 per comparison: **uncached** 200 × 37 ≈ **$3.63/night / $109/month**, excluding generation/manual checks. A 2× work/retry sensitivity is $218/month before caps; 10× candidate volume $1,090/$2,180. Cached pairs and early rejection reduce work, but **no paid end-to-end generation yield/spend measurement exists yet**. A lower-cost starting proposal is **$0.50 per nightly run, at most $15 for 30 scheduled runs**, including generation/checking, with shortfalls accepted; **Andrew has not approved this proposal**. Manual approvals/edits and extra manual runs add separate operations: e.g. 100 manual operations at that same ceiling add at most $50. Phase 4 must settle a total operational spending allowance and, if needed, a separately capped pilot before enabling paid use. Do not silently describe per-run limits as a monthly guarantee. No cloud recurring change is active today.

Derived-feature backfill needs one corpus load plus **28 batches / 13,801 feature upserts**, no paid model calls. At 10× inventory: 277 batches / 138,010 upserts. It stores extraction metadata, **never marks legacy rows semantically approved**. Admission always reads current content and current bank state; legacy `duplicate_review_status='clear'` has no authority. More expensive/new-provider alternatives require a separately approved equivalent evaluation; the lowest-cost fallback is fewer/zero safe questions under the same policy.

## Concrete Phase 4 sequence

1. Read the Phase 3 handoff and review SQL privileges, MAC/content hashes, revision locks, every writer and frozen comparison gates. Run local gates below. Capture actual commit IDs before releasing; code is not deployed merely because pushed.
2. Inspect production schema/current rows and all pending migrations using read-only access. Capture fresh recoverable private evidence and backup locations. Confirm function owner can access forced-RLS private tables (`postgres`/BYPASSRLS) and service role cannot read control/permit/cache tables directly. Do not reapply old migrations.
3. Prepare the exact migration list/rollout, generation pause/resume steps, configuration mechanism, approved caps and recovery instructions. **Ask Andrew before `supabase db push`**: `CLAUDE.md` explicitly requires confirmation. Phase 3 authorization is not that confirmation. Prepare all local work before asking.
4. After that confirmation, apply the reviewed migration while legacy generation is paused. The signing key starts NULL. All unchecked Speed inserts/edits/activations are immediately refused; existing active selection keeps working. Normal Live-only DML still works, with a brief shared transaction lock. A Live upsert colliding with a Speed slug refuses; intentional Speed-to-Live conversion uses the separate signed `leave_speed_trivia` RPC and preserves the old fact. The migration itself edits no question content/status.
5. Configure the private DB key through the approved parameterized DBA channel. Do not grant service-role table access to simplify setup. Set matching server/Actions secret and the agreed cap; redeploy the application, publish the reviewed workflow revision and verify both actual revisions. A mismatched/unset key safely stops Speed writes.
6. Backfill derived metadata, first dry-run, then apply. Use a **new private checkpoint directory** tied to the actual corpus revision. Pause writers during the backfill to avoid restart/drift. Resume uses that exact checkpoint; changed content/revision requires a new reviewed run rather than ignoring a mismatch.

   ```sh
   node --env-file=.env.local scripts/backfill-speed-trivia-features.cjs --output tmp/speed-trivia-uniqueness-private/phase4-feature-backfill
   # Only during authorized Phase 4:
   node --env-file=.env.local scripts/backfill-speed-trivia-features.cjs --output tmp/speed-trivia-uniqueness-private/phase4-feature-backfill --apply
   ```

7. Run the capped manual Action only after prerequisites verify. Record GitHub run ID, commit/workflow SHA, deployed Vercel revision, migration ID, revision/policy/extractor/retrieval/provider versions, generated/admitted/duplicate/uncertain/diversity counts, actual tokens/reservations/spend and artifact location. Report artifacts contain question content; keep access private. Generation and admission now happen in one coordinator process; there is no later unchecked import step.
8. Prove one actual success or preserve a documented valid zero-output run plus isolated success evidence. Exercise manual create/edit/approve/rejected duplicate, retired restore refusal and Live import using authorized staged/read-only boundaries. Do not generate against production as a test in Phase 3. Then restore the recorded nightly enabled state and monitor seven scheduled runs in Phase 6.

## Cleanup input and apply (Phase 5 only)

`manage-speed-trivia-retirement.cjs` defaults to dry-run, requires an exact file SHA-256 and never discovers/re-groups duplicates at apply time. **All Phase 2 files remain `applyReady:false` and are rejected.** Phase 5 must refresh audit/keeper evidence, resolve holds, compare current drift, produce a new reviewed `speed-retirement-apply-v1` manifest with a numeric admission revision and recoverable backup, then freeze its bytes/checksum. Do not simply flip the Phase 2 flag.

Apply-manifest fields: `version`, `applyReady:true`, `policyVersion:'speed-facts-v2'`, `corpusRevision` (numeric string), `retirements`. Each entry retains Phase 2's exact `id`, `slug`, `oldStatus`, `oldContentHash`, `keeperId`, `keeperContentHash`, `confidence:'high'`, direct `evidence` with both bound IDs/hashes and sound/high duplicate verdict, expected reference evidence, `proposedStatus:'deleted'`, and `changedFields:['status','retirement_metadata']`. Keeper must be active, unchanged, different and outside the retirement set. Retired history can block novelty but is not silently restored/promoted as keeper.

The protocol signs the immutable canonical manifest, applies up to **50 rows/transaction** and checks the original revision plus its own already-applied row count. Any other Speed write—including a status change—stops later batches on drift. Stop/pause other question writers during apply; ordinary gameplay ledger writes do not advance the question revision. Each transaction validates statuses/content/keepers and writes a durable private `speed_trivia_cleanup_log` entry with original row, resulting row, manifest entry/keeper/evidence and applied revision. A bad second row rolls back the whole batch. Replaying the same file validates existing after-states and is idempotent. It never recomputes a different list, deletes references, replaces Live slots or changes question IDs/slugs/text/options.

```sh
# These paths/checksums are placeholders for Phase 5's NEW reviewed artifact.
node --env-file=.env.local scripts/manage-speed-trivia-retirement.cjs --manifest tmp/speed-trivia-uniqueness-private/phase5/reviewed-manifest.json --sha256 EXACT_FILE_SHA256
# Only during authorized Phase 5, after recoverable backup and actual drift review:
node --env-file=.env.local scripts/manage-speed-trivia-retirement.cjs --manifest tmp/speed-trivia-uniqueness-private/phase5/reviewed-manifest.json --sha256 EXACT_FILE_SHA256 --apply --output tmp/speed-trivia-uniqueness-private/phase5/apply
```

Reference counts in entries are preserved audit evidence; gameplay may add references. The tool makes no reference-table writes. Phase 5 must compare aggregate history/in-flight checks and every actual row/keeper, export approved Speed content through the Admin GitHub PR flow, and handle categories that became empty. The existing exporter does not remove stale empty-category files yet; that Phase 5 task remains. Do not run mixed `trivia:sync` or rewrite Live JSON.

## Undo and application rollback

Undo uses the **original applied manifest**, its DB before/after log, exact current after-state and fresh current-bank admission. `--undo` alone only checks state; it explicitly reports that semantic admission is still required. `--undo --apply` checks every restoration, with the same capped provider dependency, before restoring the exact previous status/content. Already-undone operations are tracked. An intervening content/status change refuses undo. A surviving original keeper **or a new conflicting keeper blocks restoration**; this is deliberate. There is no emergency unchecked restore. Correcting a disputed cleanup decision may require separately reviewed fact/keeper corrections before a safe restoration can pass. Copied-database tests prove mechanics; never temporarily restore duplicates in production to test undo.

```sh
node --env-file=.env.local scripts/manage-speed-trivia-retirement.cjs --manifest tmp/speed-trivia-uniqueness-private/phase5/reviewed-manifest.json --sha256 EXACT_FILE_SHA256 --undo
node --env-file=.env.local scripts/manage-speed-trivia-retirement.cjs --manifest tmp/speed-trivia-uniqueness-private/phase5/reviewed-manifest.json --sha256 EXACT_FILE_SHA256 --undo --apply --output tmp/speed-trivia-uniqueness-private/phase5/undo
```

CLI writes a private operations journal and DB undo-state copy. The DB transaction log remains authoritative if a local write/network response is lost. Keep off-device private recoverable copies before mutation; the current same-Mac Phase 2 archive is recovery-tested, **not independently verified off-device recovery**.

If application rollout fails: leave DB guards installed, pause generation and do not restore an unchecked importer. Removing/unsetting the application key/cap stops Speed admission; NULL-ing/rotating the private DB key through an approved DBA operation also invalidates outstanding receipts. Gameplay and Live remain available. Restore a reviewed application version only with generation stopped and guard retained. No down-migration, trigger disabling, blanket restores or reapplying historical migrations. A future intentional removal/replacement requires a separately reviewed migration preserving history and duplicate memory.

## Local verification

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

Node 20 in Actions; existing package dependencies only for application. PGlite test runner uses ignored `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite`. Actual concurrent-session runner additionally uses ignored `tmp/speed-trivia-postgres/node_modules` (`embedded-postgres@18.4.0-beta.17`, `pg`), a temporary cluster, synthetic credentials and local port **55483**. It needs local shared-memory/loopback permission; sandboxed `initdb` is denied. No production/network DB or `.env.local` is loaded by those SQL test scripts. The runner always stops its own cluster; do not kill another process occupying that port.
