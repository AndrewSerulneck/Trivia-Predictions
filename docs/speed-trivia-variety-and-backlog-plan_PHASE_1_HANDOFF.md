# Speed Trivia variety and backlog — Phase 1 handoff

## For Andrew

Phase 1 is complete: the subject policy, backlog target, evaluation examples and cost design are written down. **Nothing new is live.** The refreshed bank remains **4,274 active / 7,083 pending / 2,537 retired**. New generation will use a **30-day subject cooldown**, a **24-question concentration threshold**, and broader topic rotation; players will get at most one occurrence of an identified person/group/work per selection, with honest short rounds when the bounded pool cannot fill it. Those behaviors are specified, not implemented yet.

Phase 2 builds and tests the controls locally. The complete audit is larger than the original missing-pair estimate: roughly **$138 at the measured mean**, with a **$220 illustrative total** after usage/retry/lost-call allowances. **No funding is requested or approved.** You do not need to answer anything to begin Phase 2. Phase 3 must separately request a concrete new paid allowance; production SQL still needs its own exact confirmation later.

## To the next agent: goal, scope and exclusions

Execute **Phase 2 only** of `docs/speed-trivia-variety-and-backlog-plan.md`, using **GPT-6.1 Sol / xhigh** as the plan's recommendation. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, this handoff, `docs/speed-trivia-variety-policy-v1.md` and `docs/speed-trivia-variety-phase-1-evidence.md` before coding. No delegation is requested or authorized. The model recommendation is not permission to spawn another agent.

Build subject-aware prevention/rotation, player selection, reliable held/ready review and partial bulk outcomes, resumable globally budgeted pending review, and safe direct pending-family transactions. Prepare any necessary **new** migration locally with security/grant checks and isolated SQL/concurrency/undo tests. Build deploy-prerequisite diagnostics without secrets. Complete all Phase 2 offline gates, then write `docs/speed-trivia-variety-and-backlog-plan_PHASE_2_HANDOFF.md` and update the plan's status.

Out of scope: paid provider calls, production writes/deployment/migration/workflow toggles, actual backlog approvals/retirements, changing $0.50 nightly/admin ceilings, reopening old editorial 4.1–4.4, rewriting/exporting Live Trivia, repairing old active facts, changing rewards/points/quota/auth behavior, or assuming the two prior pilots/$4 audit fund new work. Do not advance to Phase 3 automatically.

## Starting repository, production and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch **`main`**. HEAD and local `origin/main` both **`2d6211ebb2cfbb47dd646c3de5a49f1124eab5b0`** at Phase 1. No new commit, push, branch switch, deployment or export was performed. Local remote-tracking equality is not a new remote publication check.
- Pre-existing uncommitted changes were preserved: `AGENTS.md`, `SYSTEM_CONTEXT.md`, `docs/speed-trivia-uniqueness-plan.md`, `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md`; untracked `docs/speed-trivia-approval-config-repair-2026-10-13.md`, `docs/speed-trivia-subject-diversity-proposal-2026-10-13.md`, `docs/speed-trivia-variety-and-backlog-plan.md`. Phase 1 adds the documents/fixtures below and updates only the active-plan status/context pointers. Do not discard, accidentally stage or misattribute the earlier documentation.
- A concurrent/generated change appeared during the phase in `next-env.d.ts`: import `.next/types/routes.d.ts` → `.next/dev/types/routes.d.ts`. This phase ran neither `next dev` nor a build and did not edit that file; it was preserved. Inspect it separately before a future commit rather than folding it into Phase 1 documentation.
- Last recorded production: Supabase **`pkmxupsayzshvpirkaav`**; Vercel READY **`dpl_DuAEjzd4CM9is1UeCApJNq3yyziG`**, source SHA above, both domains verified by the preceding configuration repair. Phase 1 did **not** recheck Vercel/domain/provider-positive behavior.
- Existing migration **`supabase/migrations/20261013120000_speed_trivia_admission.sql`** is applied/immutable. Never edit/reapply/down-migrate it or repeat its feature backfill. `lib/supabaseAdmin.ts`, `vercel.json`, existing migrations and all application files were untouched.
- Nightly workflow **264911476**, `.github/workflows/trivia-nightly.yml`, last recorded active at original **02:15 UTC** schedule ($0.50/run; 10:15 PM previous New York evening during DST). Phase 1 made no workflow call and did not pause it. Re-read actual state before the future release pause; do not describe it as freshly verified here.
- New read-only capture: **2026-10-14T01:36:30.649Z / October 13, 9:36:30 PM EDT**, revision **2551**, **13,894 rows = 4,274 active + 7,083 pending + 2,537 deleted**. Zero ID/content/status drift against the original 01:14:46.531Z capture. New arrivals after this target are a different cohort. Independent before/after revision evidence passed; 30 successful RPCs / 11,654,731 received bytes. Initial restricted-network read failed, then read-only network escalation succeeded; no auto-review rejection or pending permission request remains.
- **Database mutations 0, paid requests 0, player records read 0.** No approvals/retirements/holds were applied. No undo log was necessary because nothing changed. The corpus is not a complete reference/undo backup. Phase 3 must take/reopen verified backups and reference evidence before any future mutation; preserve original historical release backups/undo logs under their existing private paths.

## Decisions already settled

1. Different facts sharing a person/answer remain valid. Subject concentration applies to **new generation**, selection spread to **presentation**, and fact policy to **backlog disposition**. A sound distinct old row may be approved despite a crowded subject. Never delete merely for subject frequency.
2. Frozen policy **`speed-subject-variety-v1`**: 30×24h, exactly 2,592,000,000 ms, server UTC; latest successful subject introduction across active/pending/retired/held states. Status-only approval/retirement/backfill does not reset it. Legacy `created_at` is a documented proxy; bad keyed timestamps block generation for that key with diagnostics. Content edits introducing a subject start a new event; preserve earlier memory.
3. Block generated candidates when any identified primary person/group/work has **≥24 active+pending occurrences**, held pending included, retired excluded from that count. Count rows once/key, cross-category. Threshold 24 is p75 of the measured registry; it is not a universal population percentile. At most one occurrence/key in an accepted run; each multi-primary relation reserves all keys. Enforce before paid comparisons, then unchanged fact/soundness/signed admission.
4. Creator/work relations need role evidence; changing an artist's song label cannot evade artist history. A cast/technique/setting question does not automatically inherit every creator. Distractors never count. Generic countries/materials/genres/eras do not receive person/work cooldowns. Unknown identity is explicit; no bare surname/capitalization/unchecked model-label identity. A new precise full name with unambiguous grounded role can establish a new key; the 87-item calibration registry is **not a production closed allowlist**.
5. Rotate existing categories and eight-subtopic lists; one batch/category before repeats; tie rotation by UTC day/operation; ≤3 distinct brief topics/batch and ≤3 accepted/subtopic/run, ≤20 generation calls unchanged. Geographic/era/genre lenses steer variety without inventing historical tags or adding another judge. Exact rotation contract is in policy §2.
6. Player selection: preserve unseen-first, category balance and current candidate/history reads. At most one identified key across both tiers/categories; unknown/generic rows stay usable with honest coverage. Return shorter rounds with explicit insufficient/bounded-selection reason when necessary; no silent repeat filler or whole-bank expansion. No recent-subject player-history extension in v1 (zero extra queries/storage/provider calls). Preserve 45/hour, 2/correct, venue/session/reward rules.
7. Backlog: verified unique/sound → active; directly proven duplicate with retained sound keeper/reservation → soft retirement; factual/provider/incomplete/reservation issues → distinct internal holds outside ready review; unfinished work reported separately. `duplicate_review_status='clear'` proves nothing by itself. Existing approved cleanup authorization persists, but no paid cap or production migration permission is inferred.
8. Pending-family authority must be direct, content/hash/revision-bound and atomic: choose/check keeper independently against the external bank; prove every loser directly; preserve exactly one representative or hold the group. No transitive A–B–C proof, arbitrary ID exclusions, temporary unchecked keeper activation, or deleting retired reservation memory. Filtering siblings changes retrieval and can expose additional competitors.
9. Cache-first/global audit controller is required; old ≤$25 helper stays unchanged. **No $225 allowance is approved or requested.** Phase 2 builds/tests concrete controller/prompt/task selection; Phase 3 then requests one capped total plus question-data transfer (no player data). Normal $0.50 operations cannot be chained to evade it.

## Files and how they fit together

New public preparation artifacts, all local/uncommitted:

- `docs/speed-trivia-variety-policy-v1.md`: normative identity, clocks/statuses, thresholds, rotation, selection, backlog/family rules and numeric exit gates.
- `docs/speed-trivia-variety-phase-1-evidence.md`: measured snapshot/category/subject inventory, recent-pilot evidence, player simulation, current/10× cost analysis, audit scenarios and durable controller design.
- `docs/fixtures/speed-trivia-variety-subject-registry-v1.json`: 87 canonical calibration identities (50 people / 9 groups / 28 works), typed aliases, ambiguity flags and creator links. Partial, deliberately famous-subject-heavy, not production truth.
- `docs/fixtures/speed-trivia-variety-evaluation-v1.json`: **48 synthetic examples** (25 identity, 23 clock/threshold/selection/family/cache/bulk/ledger/admission protocols). No production questions/player content. Identity-reference pass is not a future production-policy test pass.
- This handoff; active plan/context status pointers updated to link it and make Phase 2 next.

Private evidence retained under **`tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/`**, ignored by git, directory 0700 / files 0600. Do not commit its corpus/questions/IDs/tasks/sample evidence. Important files:

- `capture.cjs`: existing read-only inventory/page loader adapted to a new directory; `corpus.json`, `corpus.json.sha256`, `capture-report.json`. Capture uses `flag:wx`; do not overwrite originals on a refresh.
- `analyze.cjs`: **offline preparation helper only**; uses `core.createCorpus/buildIndex/retrieve/pairKey/deterministicPair`, validates cache quality orientation via `firstHash`, writes target hashes, bounded registry/reference tags/inventory, direct-star **workload scenarios**, full and cache-first task envelopes/costs. `--inventory-only` skips expensive pair planning. It is not a production entity parser or mutation/audit controller. Full run took several minutes. The initial full-run stdout preceded the Queen correction; **final `inventory-report.json`/checksums are authoritative**, not that stdout.
- `target-pending.json`: all 7,083 target IDs/status/content/state hashes.
- `subject-row-tags.json`, `inventory-report.json`, `primary-subject-review-sample.json`: partial reference classifications and bounded manual identity inspection. Sample has raw question content, so keep it private. A recognized subject is not soundness proof; unregistered co-primary subjects remain unknown.
- `audit-row-plans.json`, `pending-star-scenario.json`, `audit-task-envelope.json`, `audit-task-cache-first-scenario.json`, `cost-report.json`: task selection and cost scenarios. Workload stars are **not approved keepers/families**. Future reference-aware keeper changes require recalculation.
- `selection-baseline.cjs`, `selection-baseline.json`: deterministic all-unseen offline simulation, seed 20261013, 1,000 trials for All and each category. No gameplay queries. Production ordering is unspecified; capture ID ordering is an approximation.
- `verify.cjs`, `verification-report.json`: local identity-reference/schema/reference checks, reopened SHA checks, target/task content hashes. It loads only the measurement classifier block and makes no network/provider/DB calls. Analysis helpers can overwrite their generated reports; **do not rerun `analyze.cjs` into this frozen evidence directory**. Copy/adapt helpers to a fresh private directory for new snapshots. `verify.cjs` preserves target/task evidence and updates only its verification report.

### Frozen checksums

| Artifact | SHA-256 |
| --- | --- |
| Private corpus bytes | `a7c99e67751f81e3b47c301f8c368b09dd96a477ebd64c8b5436e6b856acf2da` |
| Corpus semantic/status digest | `c8a07825a05beedf3188303cf60078747cc047008275ec692da966e63ff19614` |
| Private target-pending.json | `8f176628f3a6b59af7505a935a6f5d57ce90637bb9fece2983faacd60abd0bac` |
| Private audit-task-envelope.json | `255db7c7aed9bc681d5eb1e4b969d17daeba4771868e303c446a4053552f867c` |
| Private cache-first task scenario | `174a3fa640e564ab822774e79b4cafd152abfaff935a75837d80cb8a960ab4fa` |
| Private final inventory-report.json | `66c706a04f60a40c1e5707d2e956651123b49c6cb93b59dee50f8cfd3035eee0` |
| Private final cost-report.json | `596f30029d581eea1da35efc234c4eed6ba52bfd19d1cfe841c017f79e39d785` |
| Private selection-baseline.json | `4f0b8d671aabd3c28692d7386b23b0dcff9747e5fced0f77c72c02f41a4565fd` |
| Public registry v1 | `db469b24b29f48cd8f99fbc3023dbcf6fcf67d0df0e700db4048fd328ded4acb` |
| Public evaluation v1 | `82bf5b4a356586a42b4784a0d576a64ed6e8af95884e2bcdf1a76412dacf6979` |

Original preparation remains `tmp/speed-trivia-uniqueness-private/pending-review-2026-10-13/`. Original cache sources are `tmp/speed-trivia-uniqueness-private/phase2-dry-run/pair-cache.jsonl` and `.../phase5-audit/pair-cache.jsonl`. If ignored evidence is absent in a fresh checkout, recover private originals or take a **new read-only** capture; never synthesize missing proof from committed summary counts or export JSON.

## Findings and traps to preserve

- Only **16 rows** carry generator metadata; 10/16 have registered person/work focus. One label normalized Wisława into **`wis awa szymborska`**. Preserve source characters; exact identity must handle ł rather than silently deleting it.
- Bounded registered-focus coverage: **472 active / 942 pending / 413 retired**; unregistered includes generic AND unknown names. Multi-focus **81 / 127 / 57**. Median/p75/p90 subject nonretired counts **14 / 24 / 41**; threshold24 covers **22 keys / 817 unique nonretired rows**. “Queen of Soul” was the sample false positive and is now excluded. Do not reuse pre-fix mention counts as primary counts.
- Last30d created-time proxy has **2,602 rows / 367 registered-focus rows / 86 registered keys**. This is not complete run/admission history. Seven recent date buckets are not seven scheduled-run observations.
- Current player pool: for 15 questions, large bank reads **5×220**, not 600 total. All baseline mean **290,131 bytes**, ~1,009 distinct candidates; Music/Pop Culture known repeats **44.6% / 40.1%**, simulated all-unseen/partial-registry. No production gameplay history was sampled. A small greedy algorithm can underfill despite a possible compatible selection; freeze/test bounded reconsideration and truthful reason reporting.
- Current retrieval: **257,274 slots; 6,039 cache / 4,712 deterministic; 0 overflow**. **2,439** rows with conflict evidence split **735** directly sound/high active links, **1,386** pending-only, **318** weak/deleted/reserved. These are not retirement totals. Exact duplicate decisions have unverified quality unless backed by valid judge evidence; cache direction matters.
- Provisional direct stars **542 / 741 losers**, **740 sound cached links**. Filtering provisional siblings exposed **1,581 extra contender slots**. No reference counts read, so no final keepers chosen.
- Complete planning tasks **208,425**, $138.44 mean / $166.13 +20%; cache-first complete scenario **174,205**, $115.71 / $138.85. The earlier $93.07 list omitted completion work. Including 5% retries and 1% full lost-call reservations yields illustrative **$220.20**, provisional $225 planning cap only. All-lost reservations would be ~$4,715, so no fixed cap can guarantee completion under provider failure. Cap exhaustion leaves exact unfinished work, not fabricated classification.
- Unchanged normal Gemini version `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`. Do not switch model/batch/policy to cheapen estimates and silently reuse incompatible cache. No price/provider change proposed.
- The old helper's ledger rejects >$25; it is not the new controller. Atomic pending-family activation cannot use ordinary admission with arbitrary siblings excluded. Existing retirement requires an already-active keeper; implement narrow, signed group authority and undo concretely before later production confirmation.
- `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite` exists locally and existing tests passed; make these required tests portable in CI during Phase 2. Do not skip them for green CI.
- `.env.local` values must never be printed/read by tools. The single read-only capture process loaded credentials internally with `node --env-file=.env.local`; no secrets were displayed. Standard tests load no real keys. No dev-server live writes or paid checks.

## Exact commands and verification results

Run from `/Users/andrewserulneck/Documents/Trivia-Predictions` with the existing Node/npm dependencies installed:

```sh
node tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/verify.cjs
node --check tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/analyze.cjs
git check-ignore tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/corpus.json
git diff --check
npx vitest run tests/lib.speed-trivia-uniqueness.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-admission.test.ts tests/scripts.speed-trivia-provider-labels.test.ts tests/scripts.speed-trivia-audit-lock.test.ts tests/api.admin.speed-trivia-review.test.ts tests/api.admin.speed-trivia-export.test.ts
```

Results: **48 fixture IDs valid / 87 registry keys and creator references valid / 25 identity-reference examples passed / 23 protocol cases reserved for Phase 2; 7,083 target rows and 208,425 task hashes verified; 11 reopened private checksums valid; ignore and whitespace checks pass.** Existing Speed regression: **8 files / 59 tests passed**, 0 failures, including held-out release/PGlite admission tests. No paid transport was used by these tests.

To reproduce the **offline simulation** in a copied evidence directory (so frozen files are preserved), adapt its `__dirname` input paths and run `node <new-private-dir>/selection-baseline.cjs`. To reproduce pair planning, similarly copy the corpus/checksum/capture report and adapted helper into a **new** private directory, then `node <new-private-dir>/analyze.cjs`; it loads prior private caches locally and takes several minutes. Normal capture command was `node --env-file=.env.local tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/capture.cjs`, permitted only read inventory/page RPCs. **Do not rerun it at that path:** `wx` preserves existing capture; future capture must use a new output directory and fresh date.

Phase 1 has no application/schema implementation, so typecheck/lint/full test/build were not rerun. All are **required for Phase 2**, along with meaningful new fixtures/tests and isolated atomic SQL/concurrency/undo checks. Build and typecheck must run sequentially. No live provider-positive path, physical-device check, seven-run sequence or production behavior was verified in Phase 1.

## Open questions and recommended first steps

No question blocks Phase 2. Do not ask Andrew again about already-authorized pending cleanup or valid facts sharing artists/answers. The one-time paid cap and any exact production migration remain future concrete approval steps; do not request them from this preparatory handoff.

1. Verify branch/dirty state and frozen checksums; read the policy/evidence before touching application code. Preserve earlier documents/private evidence.
2. Design one reusable typed subject-evidence extractor and once-per-corpus aggregates with role/alias/version rules. Implement the 48 synthetic expectations as meaningful tests; add missing malicious/ambiguous/unknown/history cases. Keep `speed-facts-v2` unchanged.
3. Implement/measure bounded subject selection inside current pool, including unseen/category interactions and greedy counterexamples; wire truthful short-round handling through API/client with minimal product copy. Compare same baseline seeds and report coverage.
4. Design the pending-family RPC/ledger/undo invariants before migration text, then prove them offline. Review `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` before new SQL; explicit grants/RLS/service-only signed paths mandatory.
5. Build the dedicated global audit controller, dry-run task manifests and configuration diagnostics. Reuse cached judgments/direction, bound retries/concurrency and test crash/restart/fsync/partial outcomes. Update cost/task scenarios after reference-aware family design without a paid request.
6. Run all Phase 2 gates and leave its detailed handoff. **Stop there** with tested local implementation and concrete migration/release artifacts; no paid audit or deployment yet.
