# Speed Trivia variety, prevention and backlog plan

Created **2026-10-13**. Owner: Andrew Serulneck.

**Status, updated 2026-10-14: Phases 1–2 variety work remains local. Phase 3 free preparation is complete; Andrew DECLINED the paid audit and chose manual review. Approved-only manual approval (PR #7) and the subsequent large-batch timeout repair (PR #8) are COMPLETE/LIVE. Current main `244ac0bb2d029c11ea150793ce2eab395f871f62`; READY `dpl_Gut4nT9YNfkHtaWkspupDQKzy9kA`; both domains/exact source verified 2026-10-14T15:51:44.590Z. The repair preserves saved approvals, returns unfinished IDs and safely recovers lost responses without automatic paid retries. [Current manual-review repair/handoff](speed-trivia-bulk-approval-timeout-2026-10-14.md), [original manual approval handoff](speed-trivia-manual-approval-2026-10-14.md), [Phase 3 historical preparation/handoff](speed-trivia-variety-and-backlog-plan_PHASE_3_HANDOFF.md). Approved facts block later recognized repeats across all batches; semantic recognition remains fallible. No agent-paid audit/question test, new migration or agent production-question mutation occurred; five questions were saved by Andrew’s reported request. Do not re-ask for $225 or replay its frozen 7,083-target proposal. Subject-variety runtime/schema cutover is separate and unauthorized; preserve the dirty root workspace and never deploy it.**

**Committed, not merged (2026-10-15):** the previously uncommitted Phase 1–3 root work is now committed on branch `speed-trivia-variety-backlog`, reconciled onto `main` (which already contains the PR #7/#8/#9 releases and ranked-places work). It is pushed for safekeeping only: do NOT merge it to `main` — migration `20261014020000` is not applied in production and the runtime/schema cutover is still unauthorized. Known at commit time: typecheck/lint clean; Vitest 4,655 pass / 13 skip / 1 fail — `tests/scripts.speed-trivia-admission.test.ts` › "plans from database counts and supplies less-used subtopics" (expected 'Literary Landscapes', got 'Music'); it fails identically in the original uncommitted tree, so it predates the reconciliation.

**Subsequent operational repair:** The manual page still lost responses after PR #8. Andrew requested phased reliability work; follow [the reliability plan](speed-trivia-review-reliability-plan.md) and its [Phase 1 handoff](speed-trivia-review-reliability-plan_PHASE_1_HANDOFF.md) for this repair. This does not resume the declined paid audit or authorize the separate variety migration.

Execute **one numbered phase per request**, in order. Before reporting any phase finished, write `docs/speed-trivia-variety-and-backlog-plan_PHASE_<N>_HANDOFF.md` and update this status with its link. If a phase stops part-way, write the handoff and identify the exact stop. Planning itself does not authorize a new paid audit, replenish old spending allowances or apply a production migration.

## 1. What Andrew should expect

New questions should explore a much wider range of people, works and topics. Repeated facts and unverified candidates must be stopped before they enter ordinary review. The old pending backlog will receive an explicit outcome: approve verified distinct questions, soft-delete proven repeats while keeping a suitable representative, or hold unresolved cases outside the normal approval list. Players should also receive varied subjects from the bank already available.

The system cannot mathematically guarantee that an AI recognizes every repeated fact. Completion means enforced controls, measured coverage, all known regressions blocked, a reconciled backlog and visible operational evidence—not a claim that the problem can never recur. Different facts with the same correct answer remain valid.

## 2. Decisions and boundaries

**October 14 scope change:** Andrew declined the one-time bulk audit because of cost and will review pending questions himself. He explicitly requested that manual “Approve Selected” compare only against **approved active Speed questions**, allowing one good pending version to be kept. Waiting and deleted facts stay in memory and remain blockers for **new generation, edits and imports**. Approved-only checking applies solely to unchanged pending→active manual approval; a newly approved row blocks later duplicates in the same batch and across concurrent requests. This instruction supersedes the old complete-bank comparison requirement for that narrowly defined manual action. No paid audit, spending increase or production migration is authorized. Preserve frozen Phase 3 evidence as historical preparation; do not silently execute its old paid commands.

- Andrew explicitly authorized processing all pending Speed questions, approving genuinely distinct questions and deleting repeats, and requested one phased plan covering variety as well. Do not re-ask for that same data-cleanup permission after preparing and validating the concrete changes. Additional paid processing needs its own measured allowance; a new production migration still needs the exact confirmation required by `CLAUDE.md`.
- Different facts about the same person or sharing an answer are valid. A **generation concentration limit** and a **presentation spread rule** are separate from fact validity. Do not silently delete valid old questions merely for mentioning Taylor Swift, and do not impose lifetime uniqueness on generic answers such as countries or materials.
- Use a **30-day generation cooldown** for identified primary people/groups/works as the starting policy, alongside one such subject per accepted run. Phase 1 must make entity identity, related works, recent history and exceptions precise and testable. Broad categories/genres are scheduled for variety, not excluded for 30 days.
- Steer away from subjects already heavily represented in the bank and rotate subtopics, regions, genres and eras. Phase 1 derives the numerical concentration threshold from the actual inventory; record its value and rationale before implementation. No prompt-only promise counts as enforcement.
- Preserve the existing frozen fact/soundness gate and signed admission. Novelty takes priority over volume. Fewer questions, including zero, are acceptable under the same budget.
- Preserve IDs, content and gameplay references. “Delete” means status-based retirement with durable before/after evidence and an undo path, not physical deletion. Do not restore previously retired facts or rewrite Live Trivia JSON.
- No new editorial scoring/rewrite system, provider switch, blanket fact revalidation of all active questions, rewards/points changes or expansion of nightly target volume. Existing factual ambiguity checks stay in force. A newly discovered active duplicate is recorded for a separately bounded repair rather than quietly expanding this pending-only cleanup.
- Model/effort: use the phase-specific assignments below. **GPT-6.1 Sol is the default for every phase**; Phase 2 uses extra-high reasoning for the most complex implementation. No delegation requested.

### Engineering model and reasoning assignments

These are recommendations for the Codex agent executing the plan, based on the work's complexity and consequences. They do **not** change the application's existing Gemini generator/checker or its spending cap. Reasoning effort controls how much work the engineering model does; it is not a guarantee of correctness. Tests and release gates remain mandatory.

| Phase | Engineering model | Reasoning effort | Why |
| --- | --- | --- | --- |
| 1 — Policy, inventory and acceptance criteria | GPT-6.1 Sol | **High** | Resolve subject identity, exceptions, coverage and cost before coding. |
| 2 — Prevention, player variety and offline tools | GPT-6.1 Sol | **Extra high (`xhigh`)** | Highest design complexity: signed admission, pending-only family transactions, concurrency, undo, budgets and selection interact. |
| 3 — Full pending audit and manifest | GPT-6.1 Sol | **High** | Safely orchestrate resumable processing, evidence validation, keeper decisions and aggregate spending. The actual bulk comparisons remain Gemini calls. |
| 4 — Deployment and cleanup application | GPT-6.1 Sol | **High** | Production data consequences require careful drift, backup, idempotency and outcome reconciliation checks; follow the already-tested design. |
| 5 — Live verification and restart | GPT-6.1 Sol | **High** | Diagnose real provider/configuration failures and verify positive paths before restarting. |
| 6 — Monitoring and final report | GPT-6.1 Sol | **Medium** | Mostly bounded evidence collection and comparison against frozen criteria. Raise to high for a concrete defect requiring diagnosis or repair. |

**No model switch is required by this plan.** If Phase 2 exposes an unresolved atomicity/security design issue or Sol repeatedly fails a meaningful gate, consider **GPT-6 Astra / high** for a narrowly scoped design/code review, then resume with Sol. Do not automatically use Astra for the bulk audit, every phase or routine monitoring. Do not spawn a review agent unless Andrew explicitly requests delegation; a model recommendation is not delegation permission. Higher effort or a stronger model never authorizes bypassing a failed check or spending cap.

Source checked 2026-10-13: [official OpenAI model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection). The exact phase assignments are project-specific engineering judgment, not published model benchmarks. Sol is documented for complex work where cost matters; this plan has no measured Sol-versus-Astra comparison on its own tasks.

## 3. Starting state and evidence

Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`, branch `main`, published HEAD **`2d6211ebb2cfbb47dd646c3de5a49f1124eab5b0`**. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md` and `AGENTS.md` first.

Production: Supabase **`pkmxupsayzshvpirkaav`**. Existing migration **`20261013120000_speed_trivia_admission.sql`** is applied, immutable and must not be reapplied or edited. READY Vercel **`dpl_DuAEjzd4CM9is1UeCApJNq3yyziG`**, source above, both production domains verified. The missing website `GEMINI_API_KEY` was subsequently added as a hidden production secret with Andrew's explicit approval and redeployed. Live provider success after that configuration repair was not tested. Verify real prerequisites rather than relying only on local tests or authenticated refusals.

Nightly workflow **264911476**, `.github/workflows/trivia-nightly.yml`, last verified active; schedule **02:15 UTC** (10:15 PM previous evening in New York during DST). Refresh its actual state before any pause/resume. The recurring cap is **$0.50 per nightly/admin operation**, not per question and not a monthly shared cap. At most $15 for 30 scheduled runs, plus at most $0.50 for each admin operation. Prior $4 bank audit and both $0.50 pilots are historical allowances, not available funding for this work.

Last revision-checked snapshot: **2551**, **13,894 Speed rows = 4,274 active + 7,083 pending + 2,537 deleted**, captured `2026-10-14T01:14:46.531Z` (October 13 in New York). Only **16 rows** have generation subject metadata. The original phase retired 2,534 reviewed versions; subsequent operator changes explain why these newer counts differ. These are dated baseline counts, not a promise that the live bank will remain fixed.

Private preparation: ignored `tmp/speed-trivia-uniqueness-private/pending-review-2026-10-13/`, containing `corpus.json`, `corpus.json.sha256`, `capture-report.json`, `estimate-report.json`, `row-plans.json`, `uncached-pairs.json`, `capture.cjs`, `estimate.cjs`. Capture used **30 read RPCs / 11,654,731 received bytes**, no paid requests or database mutations. Reused **8,932 cached pair results**; initial upper-work estimate after known-conflict short-circuiting: **140,112 distinct uncached pairs**, about **$93.07** at the previously measured mean, **$111.68** with 20% allowance. This is neither an approved cap nor a quote. It excludes work still needed to choose/prove pending-only representatives, resolve weak evidence, refresh drift and activate survivors. Phase 1 must refine a complete-operation estimate before requesting funding.

The initial cache-only scan flags **2,439 pending rows** with duplicate evidence; **1,386** have only pending counterparts. Those numbers are not validated retirement totals or final survivor counts. Do not delete every member of a pending-only family.

Relevant paths:

| Responsibility | Current path |
| --- | --- |
| Fact policy, retrieval and evidence | `lib/speed-trivia-uniqueness/core.cjs` |
| Existing Gemini checker, content-bound cache | `lib/speed-trivia-uniqueness/gemini.cjs` |
| Signed admission, revision/delta checks, operation budgets | `lib/speed-trivia-uniqueness/runtime.cjs`, `lib/speedTriviaAdmission.ts` |
| Generator subject checks and topic briefs | `lib/speed-trivia-uniqueness/generation.cjs` |
| Nightly coordinator | `scripts/generate-trivia-nightly.cjs`, `.github/workflows/trivia-nightly.yml` |
| Bank-audit/retirement tools | `scripts/audit-speed-trivia-refresh.cjs`, `scripts/prepare-speed-trivia-retirement.cjs`, `scripts/manage-speed-trivia-retirement.cjs`, `lib/speed-trivia-uniqueness/retirement.cjs` |
| Admin review/approval | `app/api/admin/trivia/questions/route.ts`, `[id]/route.ts`, `components/admin/sections/TriviaPendingReviewSection.tsx` |
| Player question selection | `lib/trivia.ts`, `app/api/trivia/route.ts` |
| Prior release/undo/backup facts | `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md` |
| Production credential repair | `docs/speed-trivia-approval-config-repair-2026-10-13.md` |

Uncommitted documents at planning start: original plan/handoff operational additions, credential-repair record and focused diversity proposal. This new plan and its pointers are also local until published. No pending-bank mutation or paid processing has occurred. The approved export PR #5 is merged; unrelated PR #2 remains open.

## 4. Cost, approvals and operating rules

One checked corpus/index per audit or generation operation, with bounded deltas after changes. Never reload the bank for each question, player or category. Reuse content/policy/model-bound cached judgments in the correct orientation; aliases alone or shared answers do not establish a repeated fact.

New subject scheduling and player selection should use local aggregates and bounded candidate/history reads. Prefer existing features/metadata over a second AI judge or mandatory whole-bank paid tagging. Estimate extra executions, row/byte transfer and latency at current and 10× volume before adding a query, schema or AI call. Additional generated label/prompt tokens still count toward the same operation budget. If a sound design materially raises recurring cost, present the measured alternative before implementing it.

Before any new paid audit, prepare the exact task selection, cache savings, representative work, expected cost, retries, lost-call reservations and a durable **global one-time cap**, then request explicit approval. Include the intended transfer of question/answer/image context to the existing Gemini checker in that request. No player identities or gameplay payloads go to Gemini. Do not evade the total cap by launching many separately capped $0.50 operations. The older audit helper's ledger accepts caps only up to $25; any larger one-time allowance needs a tested controller confined to the newly approved audit, preserving other caps and lock safety.

Pause only the necessary Speed writers during the application/release window, record their prior states, and resume after verification. Audit against a stable target cohort and revalidate content/status before mutations; changed/new rows require explicit current checks, not reuse of stale conclusions. Normal checks can remain active during read-only preparation.

## 5. Phases

### Phase 1 — Freeze the subject policy, inventory and success criteria

**Complete, 2026-10-13:** [policy v1](speed-trivia-variety-policy-v1.md), [inventory/evaluation/cost evidence](speed-trivia-variety-phase-1-evidence.md), [detailed handoff](speed-trivia-variety-and-backlog-plan_PHASE_1_HANDOFF.md). Refreshed revision 2551, 7,083 target pending IDs/hash-bound; 30-day cooldown, concentration ≥24, 48 synthetic examples. No application implementation, paid calls or production changes.

**Engineering model: GPT-6.1 Sol / high.**

**Scope: free/local/read-only preparation. No paid calls or production changes.**

1. Refresh the baseline and identify the target pending IDs, hashes and status; retain original snapshot evidence. Explain concurrent approvals/deletions/new arrivals separately instead of forcing final totals to equal an old page count.
2. Measure primary-subject coverage/concentration in the bank and recent generation. Separate identified entities from unknown legacy rows, correct-answer mentions from primary focus, and people from generic answers. Use a small sanitized regression set to validate aliases, ambiguous names, works/creators, distractor-only mentions, diacritics and cross-category reuse.
3. Specify the 30-day cooldown clock and included statuses, within-run spread, bank concentration threshold, subject/subtopic rotation and treatment of multiple primary subjects. A different song about an already concentrated artist must not evade the artist limit through the song label. Ordinary country/material answers must not spuriously block unrelated facts.
4. Specify player selection: prefer subject variety within each existing 15-question selection, initially at most one identified primary person/group/work when the checked candidate pool can fill the selection. Preserve category balance, unseen-question preference, quotas, venue rules and bounded reads. Define truthful insufficient-pool behavior; do not silently bypass the subject rule or loop through the entire bank. Measure any recent-subject-history extension before adding it.
5. Specify backlog outcomes: verified distinct → active; directly proven repeat → retired with a keeper/reservation; ambiguous, invalid or unavailable → internal hold outside the normal ready-to-review queue. Existing `duplicate_review_status='clear'` is not proof of checking. Distinguish factual uncertainty, same-subject concentration and provider failure.
6. Freeze evaluation gates and refine the complete audit estimate, including pending-only families and signed activation—not just the initial missing pair list. Compare cheaper cache-first/active-first/early-stop processing. No funding request until the work and ledger design are concrete.

**Exit:** versioned, numeric policy; measured coverage and cost design; frozen evaluation examples; explicit classification/selection rules; Phase 1 handoff. No implementation, paid allowance or production migration is inferred from passing this phase.

### Phase 2 — Build prevention, player variety and reliable review tools offline

**Complete locally, 2026-10-13:** [detailed handoff](speed-trivia-variety-and-backlog-plan_PHASE_2_HANDOFF.md), [implementation/cost/selection evidence](speed-trivia-variety-phase-2-evidence.md). All offline gates pass: 4,320 tests / 13 environment skips, typecheck/lint and 203-page build; 10,000 paired selections. Concrete new migration `20261014020000` is not applied. All Phase 2 changes are local/uncommitted; concurrent animation PR #6 advanced repository HEAD to `1932091`. No paid requests or production changes by this phase.

**Engineering model: GPT-6.1 Sol / xhigh (extra high).**

1. Aggregate subject/history counters once from the checked corpus. Produce rotating, bounded briefs favoring less-used subjects. Enforce cooldown/concentration after generation and before paid fact comparisons, then run the unchanged signed fact/soundness gate before saving. Preserve the accepted-run spread and all global cost/time/candidate ceilings.
2. Persist trustworthy subject identity/policy evidence as needed without pretending sparse legacy metadata is complete. Prefer compatible existing metadata/features; if stronger enforcement needs schema/RPC changes, prepare a **new** migration and follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`. Never edit the applied migration or add an unchecked fallback.
3. Add subject-aware player selection under the Phase 1 contract, keeping work bounded to the existing candidate pool and measured history. Newly tagged and conservatively classified legacy rows may be used; test the declared behavior for unknown subjects rather than claiming universal coverage.
4. Build resumable pending review with global durable reservations, lock ownership, bounded concurrency/retries, per-row dispositions and content-bound evidence. Cache deterministic/semantic work once; classify against active, pending and retired facts. Reject stale input and preserve partial progress without applying partial classifications as proof of completion.
5. Handle **pending-only duplicate families safely**. Current retirement requires an already-active keeper, while normal admission rejects a keeper against its still-pending/retired siblings. Build and prove a compatible narrow group operation: direct sound duplicate evidence for each loser, independent uniqueness/soundness checks for the chosen keeper against the rest of the bank, revision/hash-bound authority and atomic keeper activation/loser retirement. No transitive grouping, arbitrary excluded IDs, temporary unchecked activation or erased retired history. A new production RPC/migration may be necessary; prepare it concretely here for later confirmation.
6. Make review readiness and bulk outcomes accurate. New unverified candidates are never saved as ordinary pending items; old unresolved rows are held separately. Bulk requests report already-saved IDs/counts, repeats, holds and not-processed rows when stopping. A later failure must not display “Nothing was saved” for an entire partially committed batch. Keep the same $0.50 per-operation ceiling.
7. Add safe checker diagnostics and a deployment prerequisite check for Gemini key, signing configuration and caps, without printing keys/question/player payloads. Local pilot success must not substitute for website runtime configuration.
8. Test aliases/cooldowns/concentration, rotation across runs, distractor exclusions, generic answers, category balance/unseen preference, insufficient pools, budgets, cache direction/version, concurrency/drift, worker failures, pending-family atomicity/undo and accurate partial-result UI. Run unchanged uniqueness held-out gates and relevant full repository checks.

**Exit:** tested local code, any concrete new migration, audit controller/dry-run tools, cost comparison and release checklist; Phase 2 handoff. No paid calls, bank writes or deployment yet.

### Phase 3 — Audit every target pending question and freeze the disposition manifest

**In progress, 2026-10-14:** free preparation complete, paid audit awaiting new explicit funding/data-transfer approval. Recommended measured cap **$225 total**, not yet authorized. Read [Phase 3 handoff](speed-trivia-variety-and-backlog-plan_PHASE_3_HANDOFF.md) and [evidence](speed-trivia-variety-phase-3-evidence.md). Two private packages are verified; **0 active / 0 retired / 0 semantic holds / 7,083 explicitly not processed / 0 concurrent changes**. Three missing leading-column FK indexes must be addressed in Phase 4 with new migration artifacts and exact production confirmation. No statuses changed.

**Engineering model: GPT-6.1 Sol / high.**

1. Refresh/verify the target cohort. Prepare durable private snapshot/manifest copies with reopened checksum verification before mutation. Reuse prior backups and immutable receipts without overwriting their meaning.
2. Present the refined **one-time total cap** and question-data transfer request; obtain explicit approval before paid calls. Existing cleanup authorization covers the intended pending approvals/retirements, not new AI spending or a different migration.
3. Process every target row through the current fact policy using validated reused evidence, active/retired conflicts first and bounded new comparisons. Short-circuit proven conflicts; examine pending-only families directly against their chosen representatives. Reuse the same valid cache for later activation instead of paying to re-check identical content unnecessarily.
4. Record row outcome/reason, keeper and direct evidence, content hash, corpus/policy/model versions, actual usage/reservations, retries and unresolved work. Provider failure or budget exhaustion is not a duplicate classification. Continue/resume only within the approved total cap.
5. Produce a reviewable, checksum-bound manifest with proposed active/retired/held rows, canonical family representatives, expected references, before states and undo design. Keep all old active rows and Live content outside the mutation scope. Resolve outcome conflicts and validate one representative per retained fact family before application.
6. Independently review bounded examples and every exceptional family/hold rule; compare synthetic evaluation with actual audit judgments. If a row remains uncertain, keep it held. Report audited/unaudited counts separately; no final survivor total until every target has a verified disposition.

**Exit:** all target rows have a disposition or an explicit unfinished-work list; frozen manifest and verified backup; actual-vs-estimated spending and coverage; Phase 3 handoff. If cap/provider issues prevent completion, stop with exact outstanding counts rather than claiming all rows processed. No database statuses changed in this phase.

### Phase 4 — Deploy safeguards and apply the reviewed backlog cleanup

**Engineering model: GPT-6.1 Sol / high.**

1. Prepare exact release SHA, migration text (if any), production config, frozen manifest/checksum and undo steps. Obtain the concrete production migration confirmation if one is necessary. Avoid re-asking for previously authorized pending cleanup unless the proposed scope changes.
2. Record current workflow/writer state and pause the required writers during the mutation window. Verify production project, snapshot freshness, receipt/cache validity and expected row/reference hashes. Reconcile intervening changes and check new competitors without exceeding the audit cap.
3. Apply the new schema/RPC, if approved, and deploy tested code. Verify production Gemini/signing/cap prerequisites and every writer's signed path, plus player selection and ready/held queue behavior. Refusals alone are insufficient release evidence.
4. Apply small atomic, idempotent batches of the frozen pending manifest. Preserve the chosen keeper, IDs/content/history, references and reservation memory. Journal every action durably; unexpected drift stops that item/batch. Never retire an unproven row or all versions of a pending-only family.
5. Re-read results independently. Verify every target outcome, all original content/IDs and reference integrity; verify the held queue is excluded from normal review. Report **approved survivors, retired repeats, held unresolved, concurrently changed/skipped and remaining unaudited**, with totals reconciled to the target cohort.
6. Export the resulting approved Speed bank through the normal PR flow, verifying only Speed files and no stale/retired rows. Record the PR and merge state honestly; never reverse-sync Live JSON.

**Exit:** deployed guardrails; verified data application and undo evidence; target counts reconciled; release/PR facts; Phase 4 handoff. Generation stays paused until Phase 5 release checks pass.

### Phase 5 — Verify real generation, approvals and player experience; resume

**Engineering model: GPT-6.1 Sol / high.**

1. Use a deliberately small positive end-to-end check covering generated candidate → subject policy → fact/soundness check → pending admission, and a separately selected verified approval. Preserve real provider evidence; synthetic mocks and 401/duplicate refusals do not prove the positive path.
2. Paid positive checks must fit an explicitly approved remaining allowance or a newly approved capped pilot. Both prior pilots were already used; no third pilot is implied. Count all generation/comparison/retry costs together and report losses conservatively. Do not activate test rows simply to improve metrics.
3. Verify cross-run cooldown, broader subject allocation, real repeat/uncertain/concentration rejection before saving, accurate partial bulk results and primary-subject spread in actual player selections. Check existing questions still work, history/points/quotas remain correct, and Live Trivia is unaffected.
4. Reconcile any real admissions/approvals with the Phase 4 totals and export snapshot; distinguish new checked additions from the original pending cohort.
5. Resume the prior nightly state only after these gates pass. Record exact commit, deployment, domains, workflow/cap and actual positive verification evidence. Failures remain visible and generation stays paused until corrected.

**Exit:** verified real positive/negative paths and restored scheduled operation; plain-English survivor/rejection/hold counts and expected improvements; Phase 5 handoff. The functionality is released; Phase 6 observes it rather than withholding a report until seven days pass.

### Phase 6 — Observe scheduled results and close the plan

**Engineering model: GPT-6.1 Sol / medium; high for a concrete repair.**

Observe seven consecutive scheduled runs with the unchanged $0.50 cap. Use their existing reports and bounded samples; no nightly whole-bank audit or extra manual paid pilots.

Report generated/admitted/blocked/held counts, primary subjects and repetition, subtopic/region/genre spread, subject-metadata coverage, expected-vs-actual cost, requests/retries/bytes/latency and cost per admitted question. Include empty runs as observations, but do not count seven empty runs as proof of useful generation. Compare player-selection variety to Phase 1's baseline using bounded evidence. Any reported repeated fact becomes a sanitized regression with a concrete repair—not a reason to loosen the gate.

Correct operational defects within authorized scope, re-run affected checks and document any remaining limits. No spending increase or subject-policy weakening without showing its effect and obtaining required approval.

**Exit:** seven-run evidence, effective variety and useful-yield measurements, actual costs, final reconciled backlog totals, known limits and a concise operator runbook; Phase 6 handoff; status complete. Semantic judgments remain fallible, with monitoring and durable prevention in place.

## 6. Verification and handoff requirements

Start with affected tests, then required release checks:

```sh
npx vitest run tests/lib.speed-trivia-uniqueness.test.ts tests/speed-trivia-uniqueness-release.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-admission.test.ts tests/scripts.speed-trivia-provider-labels.test.ts tests/scripts.speed-trivia-audit-lock.test.ts tests/api.admin.speed-trivia-review.test.ts tests/api.admin.speed-trivia-export.test.ts
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Add meaningful new subject/selection/group-operation tests; use isolated SQL/concurrency fixtures for new atomic operations. The Speed SQL tests now use pinned dev dependency `@electric-sql/pglite@0.5.8` (Phase 2); `npm ci` installs it in CI. The old local-only PGlite path is no longer required; never skip these checks to get a green build. Existing unrelated CI date/timezone and UI timing failures must be separated, diagnosed and reported. Do not run typecheck concurrently with build. Standard tests load no real API credentials; never use a production mutation or paid comparison as an ordinary regression.

Each phase handoff opens with a plain-English developer summary and then gives the next agent: goal/scope/exclusions; branch/commits/push/deployment/data/backup/undo state; decisions and permissions; changed paths/functions; traps; exact commands/results and unverified risks; pending questions; and first steps/model/effort. Keep question/player evidence and credentials out of committed documents. Link the handoff in this plan's status before marking the phase complete.
