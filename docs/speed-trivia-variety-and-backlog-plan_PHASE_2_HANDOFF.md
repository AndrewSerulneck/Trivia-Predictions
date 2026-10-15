# Speed Trivia variety and backlog — Phase 2 handoff

## For Andrew

**Phase 2 is complete locally.** Generation now has enforceable subject cooldown/concentration and rotating briefs; player rounds avoid repeated identified subjects; pending review has accurate partial results, separate queues and tested atomic family/undo tools. **This work is not deployed, and no backlog row was changed.** The new migration is a local artifact for Phase 4, not an applied migration.

All offline gates pass: **4,320 tests, 13 existing environment skips, typecheck, lint and a 203-page production build**. The paired simulation returned 15 questions in all 10,000 selections with zero repeated keys identified by the new classifier. Identity coverage remains partial; the broader reference tags still found repeats in some rounds, especially Pop Culture. Details: [Phase 2 evidence](speed-trivia-variety-phase-2-evidence.md).

Phase 3 is next: refresh the pending cohort/reference evidence, freeze actual audit work and request one concrete paid cap plus question-data transfer before calling Gemini. **No new paid allowance is approved.** The historical $4 audit, two $0.50 pilots and illustrative $225 planning number provide no funding. No answer from you is needed until that concrete Phase 3 proposal exists.

## To the next agent: goal and boundaries

Execute **Phase 3 only**, using the plan's **GPT-6.1 Sol / high** recommendation. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, `docs/speed-trivia-variety-and-backlog-plan.md`, this handoff, `docs/speed-trivia-variety-policy-v1.md` and both phase evidence documents. No delegation was requested or authorized.

Goal: audit the frozen **7,083 pending IDs**, reconcile intervening changes explicitly, choose directly proven sound keepers with reference evidence, and produce a reopened/checksummed per-row proposal with active/retired/held/not-processed/concurrent outcomes. Take/reopen the verified backup/reference evidence needed for later mutation. Prepare measured task/cache/retry/loss estimates and an immutable one-time cap; obtain the explicit paid allowance and consent to transfer question/answer/image context to the existing Gemini checker before any paid call. Never send player identities, answer-history payloads or gameplay rows to Gemini.

Out of scope: deploying/applying the new migration or backlog proposals (Phase 4), restarting/pausing writers casually, positive paid generation pilots (Phase 5), active-bank repair, editorial 4.1–4.4, Live JSON rewrites/exports, changing the normal $0.50 ceiling or old ≤$25 helper, rewards/points/quota/auth changes, or treating subject concentration as fact invalidity. Stop after Phase 3 and leave its named handoff.

## Repository, publication, production and data state

- Workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`, branch **`main`**.
- At start: HEAD/local `origin/main` **`2d6211ebb2cfbb47dd646c3de5a49f1124eab5b0`**. A concurrent animation workstream advanced both to **`1932091e6bbe38ff2c3abae16bc677d396e63d61`**, merge PR #6, at **2026-10-13T22:34:18-04:00**. Its implementation commit is **`2920477b7b46c626520dae9557c93fec4f74e365`**. This phase did not create, stage, commit, merge or push anything. Local remote-tracking equality is not an independent remote/deployment check.
- Concurrent committed files were preserved: `app/globals.css`, `components/animations/AnimationTriggerProvider.tsx`, `SpeedTriviaCorrectAnimation.tsx`, `types/animation.ts`, animation plans/handoffs/preview and `tests/speed-trivia-correct-points.test.ts`. `components/trivia/TriviaGame.tsx` contains both that committed work and this phase's still-uncommitted selection/count changes. Do not restore it from the original starting HEAD or erase either set of changes.
- All Phase 2 application/schema/scripts/tests/docs changes remain **local and uncommitted**. Pre-existing dirty documents remain: `AGENTS.md`, `SYSTEM_CONTEXT.md`, original uniqueness plan/Phase 5 handoff, credential-repair record and subject-diversity proposal. Phase 1 plan/policy/fixtures/evidence/handoff were also uncommitted at start. Do not discard or accidentally attribute those earlier documents to Phase 2.
- `next-env.d.ts` initially had `.next/dev/types/routes.d.ts`; subsequent builds regenerated `.next/types/routes.d.ts`, and it is clean relative to the current HEAD. iCloud duplicate generated files `.next/types/routes.d 2.ts`, `validator 2.ts`, `package 2.json` caused a typecheck failure and were removed. Only ignored generated copies were removed, not source or the developer's dev server.
- Linked Supabase is **`pkmxupsayzshvpirkaav`**. Applied migration **`20261013120000_speed_trivia_admission.sql` remains immutable** and was not edited/reapplied/down-migrated. The old feature backfill was not repeated. New **`20261014020000_speed_trivia_variety_review.sql` is NOT applied**.
- Last independently recorded Vercel baseline before this task: READY **`dpl_DuAEjzd4CM9is1UeCApJNq3yyziG`**, source `2d6211...`, both domains checked by the prior repair. The concurrent animation merge may have triggered hosting activity; this phase did not inspect it. Do not report that old deployment as a newly verified current release.
- Nightly workflow **264911476**, `.github/workflows/trivia-nightly.yml`, original **02:15 UTC** schedule and **$0.50/operation** unchanged. This work made no workflow or live-state call. A scheduled run could have occurred while implementation was underway; refresh actual bank/workflow state in Phase 3/4 rather than assuming the snapshot stayed fixed.
- Last verified corpus remains **revision 2551**, **13,894 = 4,274 active + 7,083 pending + 2,537 deleted**, captured **2026-10-14T01:36:30.649Z / October 13, 9:36:30 PM EDT**. No new live inventory capture was made in Phase 2. Frozen target/content/state hashes remain preserved, not current activation receipts.
- **Paid requests by this work: 0. Production mutations by this work: 0. Player records read by these audit/simulation tools: 0.** Tests use synthetic mocked transports/in-memory PostgreSQL. Standard build loaded normal Next environment configuration internally; no secrets were printed. No application-level generation/cleanup endpoint was exercised.
- No new mutation backup or undo log was needed/created against production. Existing historical private backups/undo logs remain untouched. Phase 1's corpus is NOT a full reference/undo backup. New application SQL journals before/after rows and the apply tool requires **two independently verified backup directories** before mutation.

## Decisions and permissions already settled

1. Different facts sharing an artist/person/answer remain valid. Generation restrictions, presentation spread and backlog fact disposition are separate. A sound distinct old pending question can become active despite concentration.
2. Policy is `speed-subject-variety-v1`: 30×24h = **2,592,000,000 ms**, UTC instants; all active/pending/held/retired introductions count for history. Concentration is **≥24 active+pending rows/key**, retired excluded. Status-only transitions never reset introductions. Missing/invalid/future legacy times block that key with diagnostics.
3. Primary identity needs original spans and grounded roles, with all co-primary keys counted. Registered works expand reviewed creator links only for creator-focused relations; casts/settings/techniques do not inherit every creator. Distractors, generic countries/materials and royal “queen” do not count as the band.
4. The 87-item registry is partial, not a closed allowlist. New precise full names with source spans and roles can establish keys; unchecked labels and bare surnames cannot. Generated unknown identities fail before comparisons. Legacy unknown identity alone cannot invalidate a sound backlog fact.
5. Keep all original fact gates, retired memory, signatures, global candidate/token/deadline ceilings and **$0.50 normal cap**. The dedicated audit ledger is separate; the historical ≤$25 helper was not widened.
6. Player rule: at most one identified key, all unseen compatible supply before seen fill, balanced compatible categories, existing candidate/history reads, honest smaller rounds. No new recent-subject player history.
7. Family authority requires a direct high-confidence sound loser→keeper proof for EVERY loser, independent keeper retrieval/soundness including exposed competitors, current raw-state/content/revision/reference bindings and one transaction. No A–B/B–C transitive proof, arbitrary exclusion, temporary activation or erased retired reservation.
8. Bulk unresolved/repeat reporting is not an implicit persisted hold or retirement. The audit/apply path persists explicit holds; normal bulk requests report committed IDs accurately and stop after operational failure.
9. New production migration still needs the concrete confirmation required by `CLAUDE.md`. Andrew's authorization to process pending questions persists; do not re-ask that same cleanup question. No new paid allowance/data-transfer approval was inferred here.

## Changed files and responsibilities

### Subject identity and generation

- `lib/speed-trivia-uniqueness/subjects.cjs` + `.d.cts`: `extract`, `evidenceFor`, `createState`, `introductionEvidence`. Unicode normalization preserves ł; source/role validation; reviewed creator links; unknown/generic/identified coverage; counters and introduction history. Trusted same-content evidence survives ordinary approval, including open-world identities.
- `types/speedTriviaVariety.ts`: spans, evidence/proposals, selection reasons/coverage. `types/speedTriviaUniqueness.ts` and `types/speedTriviaAdmission.ts`: evidence and session options/operation ID.
- `lib/speed-trivia-uniqueness/generation.cjs`: one topic aggregate, UTC/operation rotation, bounded ≤3 brief/lens allocation, pre-comparison subject/subtopic rejection, accepted-run keys, blocked reasons/coverage in reports. Generic answers do not receive artificial per-run subject identity; exact repeats still hit the unchanged fact gate.
- `lib/speed-trivia-uniqueness/runtime.cjs`: matching-signature/schema prerequisite probe before paid transport; lazy once-per-session subject aggregate updated by deltas; subject evidence in signed envelopes; complete fact-evidence hash binding; normal env cap ≤$0.50; safe item-level failure copy. `lib/speedTriviaAdmission.ts` reuses the prerequisite check within a serialized operation.
- **`core.cjs` and `gemini.cjs` are unchanged.** Core SHA-256: **`24ae8e137aa990be82e9a09b60e4b822fcc497248cf20ab342538e596d047660`**. Checker remains `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`.

### Player selection and operator UI

- `lib/speedTriviaSelection.ts`: `selectVariedTrivia`, **12,000-node** ceiling, **128** equally unseen alternatives, partial identity cache ≤10,000 signatures, category balance and explicit shortfall reasons. No query/provider call in this module.
- `lib/trivia.ts`: `getTriviaQuestionSelection` reuses the original count/windows/history reads; `getTriviaQuestions` remains an array-returning compatibility wrapper. No extra selected database fields.
- `app/api/trivia/route.ts`: returns questions plus selection counts/reason/coverage; GET authentication and POST scoring/presence are unchanged.
- `components/trivia/TriviaGame.tsx`: actual question count and short-round copy; server selection reason; rules say **45 questions/hour**. Existing `fetchTriviaQuestions` remains exported for compatibility. Concurrent feedback animations are preserved.
- `app/api/admin/trivia/questions/route.ts`: ordinary ready queue filter; held/unverified queue options; bulk committed IDs, repeat/unresolved outcomes and untouched IDs retained across failures.
- `components/admin/sections/TriviaPendingReviewSection.tsx`: separate queue selector; removes only saved IDs; truthful partial totals/errors.
- `lib/speed-trivia-uniqueness/diagnostics.cjs` + `.d.cts`, `app/api/admin/trivia/checker-status/route.ts`: authenticated, no-store prerequisite booleans and matching signing probe, no keys/question/player payloads. Provider-positive success remains a future live check.

### Audit, atomic review and undo

- `lib/speed-trivia-uniqueness/review.cjs` + `.d.cts`: directional/version/content-bound cached judgments; `directProof`, reference-aware `proposeStars`, filtered posting view `externalIndex` (no full bank re-extraction per family), `verifyKeeper`, `makeAuthority`, `applyAuthority`, distinct hold/unfinished disposition mapping.
- `lib/speed-trivia-uniqueness/audit.cjs` + `.d.cts`: `planAudit`, `openLedger`, `runAudit`, `refreshAuditPlan`, `recoverLock`. Immutable cap/config per audit ID; hash-chained integer accounting; fsync before calls; process ownership; shared in-flight pairs; ≤6 workers; ≤1 retry/task and global 5%; losses retained; oversized known usage charged and halted; exact unfinished outcomes. New direct-family external tasks share the same cap. **≤500 changed rows relative to the original snapshot** may be refreshed under the original approval/ledger; broader drift refuses. Do not pretend it supports arbitrary re-baselining or replenish the cap by creating another directory.
- `scripts/audit-speed-trivia-pending.cjs`: checksummed file loader, read-only planning/dry-run by default, explicit `--paid --approval`, private output enforcement, optional original baseline for bounded refresh. Does not load env files itself or mutate Supabase.
- `scripts/manage-speed-trivia-pending-review.cjs`: `cacheOnlyJudge`, `prepare`, `run`, `undo`. Default preparation reads only; fresh signatures generated immediately before apply; cache misses refuse with **no paid fallback**. Reference reads ≤200 IDs once per preparation cohort, narrowed for each transaction. Apply requires two verified backups; signed authorities are fsynced before atomic RPCs; DB journal is consulted for restart/idempotency; application summary preserves committed work after later failures. No deployment/migration automation.
- `supabase/migrations/20261014020000_speed_trivia_variety_review.sql`: two nullable metadata columns, private permit/review-log tables with RLS and denied direct access; new signed admission wrapper around the immutable fact implementation; service-only family/activate/retire/hold RPC; bounded FK/slug reference validation; idempotent readback; exact status/metadata group undo; matching-signature prerequisite RPC. Existing IDs/content/history/references remain intact. Original admission implementation is renamed/private, so old application code cannot bypass the new envelope.
- Migration SHA-256: **`7f1a3ff54ae310dfc15c074ef66e800567a7928dabd59b9355cbb20884e54fea`**. It is a local draft artifact, not applied history; inspect exact file before Phase 4 confirmation.

### Tests, portability and measurements

- `package.json` / `package-lock.json`: pinned dev dependency **`@electric-sql/pglite@0.5.8`**. Installed with scripts disabled after offline npm lacked the cached package. Approved dependency network escalation succeeded; no automatic-review rejection remains.
- `scripts/test-speed-trivia-admission-sql.cjs`, `scripts/test-speed-trivia-retirement-sql.cjs`: portable package loading, existing override env retained; original v2 standalone fixtures remain on the immutable original migration. Their isolated legacy Live-departure/undo calls explicitly bypass the *new prerequisite-only probe* because their fixture intentionally tests the old schema; no application fallback was added.
- `tests/scripts.speed-trivia-admission.test.ts`, `tests/scripts.speed-trivia-provider-labels.test.ts`: run runtime fixtures against both migrations using the portable dependency. Generation fixtures follow the dated topic allocation; repeated generic El Niño is a fact repeat, not a forbidden generic subject.
- `tests/lib.speed-trivia-variety.test.ts`: 25 frozen identity cases, clocks/thresholds, invalid/held/retired history, edit preservation, open-world spans, rotation/lenses, selection balance/unseen/shortfalls and adversarial reconsideration.
- `tests/scripts.speed-trivia-pending-review.test.ts`: global ledger/cache/config/controller/refreshed snapshot tests; atomic SQL rollback/replay/concurrency/reference/index/undo/permission checks; pre-comparison cooldown; cache-only fresh authority/backup requirement; open-world approval preservation and signing mismatch.
- `tests/api.admin.speed-trivia-review.test.ts`: existing admission coverage plus the frozen **three saved / fourth fails / remaining untouched** regression.
- `scripts/measure-speed-trivia-variety.cjs`: reproducible offline paired candidate-window simulation and metadata/aggregation estimates. Does not read env, players or network.
- `docs/speed-trivia-variety-phase-2-evidence.md`, this handoff and plan/context status pointers: sanitized implementation, costs, coverage and next steps. Original Phase 1 fixtures are unchanged.

## Private evidence and checksums

Preserve ignored **`tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/`** and prior historical backup/cache paths from the Phase 1 handoff. Phase 2 re-ran its offline verifier: **11 checksums, 7,083 targets and 208,425 task hashes pass**. No frozen corpus/target/task file was overwritten.

New ignored **`tmp/speed-trivia-uniqueness-private/variety-phase2-2026-10-13/`** is 0700; generated evidence/log files are 0600:

- `selection-measurement.json`: earlier stricter-role development measurement; retain as history, not the final coverage report.
- **`selection-measurement-expanded-roles.json`**: final paired 10,000-trial report; SHA-256 **`9d47acd78b75b924f13e18b1c4fadd12cb99129aff32f69fae9f17dbc2b128e4`**. Corpus bytes hash **`a7c99e67751f81e3b47c301f8c368b09dd96a477ebd64c8b5436e6b856acf2da`**.
- `full-tests.log`: earlier 4,314-pass full run; **`full-tests-final.log`**: final **4,320 pass / 13 skip** run. These counts include the concurrent committed animation tests.
- `build.log` and `build-final.log`: successful **203/203** static-page builds; the latter includes the final generated source-span guard. No production release follows from this log.

Do not commit raw corpus/targets/tasks/caches/application authorities/private reports. If private originals are missing in another checkout, recover them or take a fresh read-only capture with new filenames; summaries/export JSON cannot replace proof. The new controller's binding uses **canonical plan hash**, while `.sha256` companions bind exact file bytes; these are deliberately different checks.

## Facts, traps and unverified limits

- The new runtime requires the new migration/signing probe. **Do not deploy these uncommitted application changes ahead of the separately approved schema cutover.** Phase 4 must pause the necessary writers, apply the reviewed migration and deploy compatible code together, then verify the matching probe. No unchecked fallback exists.
- New ordinary admission does one extra metadata UPDATE in the same transaction. That means **two revision/change entries per ordinary admission**, not one; bounded 500-change deltas can fill sooner. Family/hold operations write once/member. Update release-window assumptions accordingly.
- New nullable columns change raw state hashes even without content/status changes. The bounded refresh helper treats only new null evidence fields as schema-compatible; all other raw state drift remains real. Phase 4 signs from current rows, not Phase 1 old hashes.
- Reference RPC includes all single-column catalog FKs, including slug references. Composite FKs refuse. Missing valid leading-column/nonpartial indexes refuse before counts. Inspect actual production reference schema/indexes in Phase 3; do not drop that gate to get a green run. Reference counts influence keeper ranking, never prove soundness or duplication.
- SQL permits in the original migration are keyed by **transaction ID alone**, so the new family operation clears unused permits after every member; otherwise unguarded retirement/hold writes leave a permit that collides with the next member. Regression proves full rollback/idempotency.
- Cached result `firstHash` controls quality orientation. Exact text establishes a repeated fact but not sound quality; the audit still needs valid semantic quality before retirement. Deterministic contradiction holds are preserved before comparison. No `duplicate_review_status='clear'` shortcut exists.
- The audit is bounded retrieval, not all-pairs proof. A direct family can expose competitors; those tasks are recorded and charged to the same global ledger. One-time cap exhaustion leaves precise unfinished rows. Provider timeout is a provider hold; it must not be mislabeled as a deadline merely because its error string contains “timeout.”
- A crash leaves a lock and full claims. `recoverLock` requires same host, exact nonce, an actually gone PID and valid journal integrity. PID reuse/foreign host remains conservatively blocked; age alone never authorizes takeover. Never manually erase charged claims.
- Ledger retry allowance and approval cannot be widened on resume. Known oversized usage may exceed a reservation despite provider output limits; the controller charges the conservative known amount and stops. Normal malformed/lost calls keep full claims. Actual invoices remain unmeasured.
- The selector's registry/role coverage is partial: corpus **1,690 identified / 4,726 generic / 7,478 unknown**. New reference repetition remains **3/1,000 All**, **30 Music**, **126 Pop Culture**, **47 Literary**, **14 History**, **8 Sports**. Do not describe zero classifier-key repeats as universal variety or silently drop unknowns from diagnostics.
- Candidate count remains five 220-row windows for usual large All requests, not 600 total. Query ordering is unspecified; simulation uses capture order and independent selector ordering. All-unseen simulation is not production player-history sampling.
- Normal prerequisite diagnostics prove configuration presence, matching signing key and schema policy, not provider-positive capability. No live Gemini/generation/admin approval path was exercised here. Real positive/negative flows and device experience remain Phase 5 work with a new allowance.
- The old ≤$25 helper and old applied migration remain unchanged. The new controller has no default $225 funding. Phase 1's real task scenarios remain provisional until fresh reference-aware planning in Phase 3.

## Exact commands and results

Run in `/Users/andrewserulneck/Documents/Trivia-Predictions` with Node/npm dependencies installed (`npm ci` now installs the pinned SQL harness). Standard tests load no real API keys. Do not run build and typecheck concurrently.

```sh
npx vitest run tests/lib.speed-trivia-variety.test.ts tests/scripts.speed-trivia-pending-review.test.ts tests/lib.speed-trivia-uniqueness.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-admission.test.ts tests/scripts.speed-trivia-provider-labels.test.ts tests/scripts.speed-trivia-audit-lock.test.ts tests/api.admin.speed-trivia-review.test.ts tests/api.admin.speed-trivia-export.test.ts
node scripts/test-speed-trivia-admission-sql.cjs
node scripts/test-speed-trivia-retirement-sql.cjs
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --check
```

Results: affected checks pass; original held-out gate unchanged (zero duplicate/uncertain admissions and ≥95% distinct acceptance in both splits); original SQL **26 admission / 16 retirement-undo** pass; typecheck/lint pass; full suite **362 files pass / 1 environment file skipped, 4,320 tests pass / 13 skip / zero fail**; **203/203** build succeeds. Babel's existing large `lib/sportsBingo.ts` note is nonfatal. Duplicate `.next/types/* 2.*` copies were removed before the passing typecheck.

Offline reproduction, with a **new output filename** so previous evidence is preserved:

```sh
node tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/verify.cjs
node --import tsx scripts/measure-speed-trivia-variety.cjs --snapshot tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13 --output tmp/speed-trivia-uniqueness-private/variety-phase2-2026-10-13/selection-recheck.json
```

That helper writes with `wx`, deliberately refusing to overwrite evidence. No paid/provider or database mutation command belongs in ordinary regressions.

## Phase 3 operating entry points

First obtain a fresh verified corpus and reference evidence in a **new private directory**; preserve original IDs/versions as the target cohort and report newer arrivals separately. The planner expects reference weights/optional adjacency in a checksummed JSON file; reference `counts` can be `{ constraintName: { questionId: count } }` and influences keeper ranking. Generate zero counts only from a proven complete read, never from absent evidence. The applied new reference RPC is unavailable until Phase 4, so Phase 3 should use the existing read-only inventory/reference capture tools and transform their verified evidence offline. The migration's catalog/index guard documents the exact future application contract.

Example **free planning/dry-run shape**, replace paths/revision with that fresh capture; do not reuse a frozen capture output directory:

```sh
node scripts/audit-speed-trivia-pending.cjs --plan --corpus <private-corpus.json> --targets <private-targets.json> --references <private-references.json> --revision <numeric-revision> --caches <private-cache-1.jsonl>,<private-cache-2.jsonl> --output tmp/speed-trivia-uniqueness-private/<new-plan-directory>
node scripts/audit-speed-trivia-pending.cjs --corpus <private-corpus.json> --targets <private-targets.json> --references <private-references.json> --revision <numeric-revision> --plan-file <private-pending-audit-plan.json> --output tmp/speed-trivia-uniqueness-private/<audit-directory>
```

All JSON inputs require exact-byte `.sha256` companions. Planning returns canonical `planHash`, prompt hashes, per-task byte/token reservations, cache savings, representative/exposed work and cost scenarios. Missing references prevent a defensible final keeper plan; do not substitute an all-zero pretend inventory.

After Andrew explicitly approves the measured cap and question-data transfer, an **approval JSON with checksum** must contain:

```json
{
  "auditId": "a-new-unique-audit-id",
  "approvedBy": "Andrew Serulneck",
  "questionTransferApproved": true,
  "planHash": "the-returned-canonical-plan-hash",
  "capMicrodollars": 0,
  "maxRequests": 0,
  "maxRetries": 0,
  "maxInputTokens": 0,
  "maxOutputTokens": 0
}
```

**Zeroes are non-runnable placeholders, not approved amounts.** Fill only with the newly approved ceiling and computed bounds. `--paid --approval <private-file>` enables the one-time controller; load secrets internally through the established `node --env-file=.env.local` invocation only then, never print/read `.env.local` values. Every resume uses the same audit directory/binding/cap. Do not launch many $0.50 operations or new directories to replenish it.

For a checked ≤500-row refresh, `audit.refreshAuditPlan({baseCorpus,basePlan,corpus,references,cache})` creates the refreshed plan, preserving the original cohort and explicit concurrent outcomes. `runAudit` requires `refreshBase:{baseCorpus,basePlan}`; CLI accepts `--base-corpus` and `--base-plan`. Reuse the **original approval**, not a new cap. More than 500 raw row changes relative to that original snapshot refuses; report that condition and exact unfinished work.

Phase 4 tools are ready but **do not run apply/undo in Phase 3**. The management tool's default mode is fresh read-only preparation; `--apply --backups <verified-copy-1>,<verified-copy-2>` is for the approved release window. Cache-only comparisons refuse missing work, which must return to the same approved audit ledger. Fresh receipt signatures expire after five minutes and should not be stored as eternal approvals.

## Open questions and recommended first steps

No developer question blocks Phase 3's read-only preparation. The only required future decisions are its concrete paid cap/data-transfer consent and Phase 4's exact production migration confirmation (plus any genuinely necessary new reference index artifact discovered from real schema evidence). Do not ask again about valid different same-artist facts or already-authorized pending cleanup.

1. Re-check branch/dirty state and reopen private checksums. Preserve the concurrent animation merge and prior documents. Confirm no Phase 2 code has been published inadvertently; hosting state was not inspected here.
2. Take fresh bounded read-only inventory/reference evidence, including FK index availability, workflow state and original cohort reconciliation. Keep **7,083 original IDs** as the accounting denominator; content/status changes/new arrivals are separate evidence, not assumed approvals.
3. Reuse validated directional caches, build reference-aware direct stars and freeze complete task/prompt hashes. Include keeper activation/soundness, exposed external competitors, ≤5% retries and full lost-call claims. Compare the actual selected workload with Phase 1's 208,425/174,205 scenarios before proposing funding.
4. Request one total cap and explicit question-data transfer only when the concrete plan/approval bounds are reviewable. No player data, provider switch, normal budget increase or implicit $225 allowance.
5. Run/resume the dedicated audit, inspect exact holds/unfinished work and independent keeper quality. Never transform budget/provider failure into a duplicate or quietly expand to old active repair.
6. Reopen proposal/ledger/cache checksums, reconcile every original target outcome, leave two verified private copies and a detailed **Phase 3 handoff**. Leave migration/deployment/data application for Phase 4.
