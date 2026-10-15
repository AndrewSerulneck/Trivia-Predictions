# Speed Trivia Phase 3 preparation evidence

**2026-10-14, New York. Phase 3 is in progress, awaiting paid approval.** This is the free, read-only preparation for the [plan](speed-trivia-variety-and-backlog-plan.md), not a completed semantic audit or an application-ready cleanup manifest. Detailed continuation instructions: [Phase 3 handoff](speed-trivia-variety-and-backlog-plan_PHASE_3_HANDOFF.md).

## Current inventory and references

Fresh production snapshot: **2026-10-14T03:58:39.593Z** capture start (October 13, 11:58:39 PM EDT). Reference/revision verification finished **2026-10-14T04:00:32.022Z** (October 14, 12:00:32 AM EDT). Supabase project **`pkmxupsayzshvpirkaav`**, numeric revision **2551**, **13,894 Speed rows = 4,274 active + 7,083 pending + 2,537 deleted**. Against Phase 1: **zero new/missing IDs, content/status/full-state changes or new pending arrivals**. All **7,083 original pending versions** remain the target cohort.

Snapshot state digest (PostgreSQL MD5): **`5e62c223de2c2fe0ba4e72d3776d0783`**; content/status corpus digest (SHA-256): **`c8a07825a05beedf3188303cf60078747cc047008275ec692da966e63ff19614`**. These are different contracts; neither replaces the numeric admission revision.

The snapshot used **4 successful read-only management queries / 11,123,275 received bytes**. References used **4 queries / 2,849,988 bytes**, with before/after full-state digest and numeric revision equality. Total successful database capture: **8 queries / 13,973,263 bytes**, once for the operation. Failed attempts remain preserved separately; their network/error-response bytes were not measured. No provider requests, player payload exports, database writes or writer-state changes occurred.

Reference evidence includes every catalog FK into `trivia_questions`, including UUID and slug targets, with complete per-question counts and genuine zeros from left-join aggregates:

| Reference | All records | Speed references | Pending references |
| --- | ---: | ---: | ---: |
| `answer_variants.question_id` → ID | 9,343 | 5,626 | 453 |
| `trivia_answers.question_id` → ID | 3,353 | 3,352 | 0 |
| `live_showdown_answers.question_id` → slug | 516 | 0 | 0 |
| `trivia_session_questions.question_id` → slug | 12,510 | 0 | 0 |
| `venue_seen_questions.question_id` → slug | 8,595 | 0 | 0 |

**Three required leading-column, valid/ready, nonpartial reference indexes are missing:** `trivia_answers(question_id)`, `live_showdown_answers(question_id)`, `venue_seen_questions(question_id)`. Phase 4's proposed reference RPC will correctly refuse until these prerequisites exist. Do not bypass its guard. Prepare separate new index migration(s) and exact production confirmation in Phase 4; no existing migration was edited and no new index migration was created here. At today's table sizes the three indexed tables contain **12,464 rows total**; at 10×, approximately **124,640**. Index storage/build time and write overhead remain unmeasured. Indexes trade a one-time build and one index update per affected reference write for avoiding repeated table scans in bounded application batches. The other two FK indexes passed. No composite FK was found.

## Frozen workload and proposed approval

Checker unchanged: **`gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`**. Validated cache union **8,932 entries**; **4,461** distinct selected tasks are already cached, saving about **$2.96** at the historical mean before further conflict short-circuiting. Every planned pair, content hash and exact prompt hash was independently reopened/verified: **215,636 tasks**. Reference-aware ranking produces **580 provisional direct stars**; these are workload estimates, not approved keeper/family outcomes.

| Planning item | Count |
| --- | ---: |
| Current retrieval tasks | 207,879 |
| Per-target self-soundness tasks | 7,083 |
| Additional exposed-family tasks | 674 |
| Total selected tasks | 215,636 |
| Reusable cached tasks | 4,461 |
| Maximum base uncached tasks | **211,175** |
| Global retry ceiling, ≤1 retry/task | **10,558** |
| Additional request allowance for newly exposed family work | **42,235** |
| Combined request ceiling | **263,968** |

The **211,175-task uncached controller envelope** is **2,750 tasks (+1.32%)** above Phase 1's 208,425-task scenario, and broader than its 174,205 cache-first scenario. Phase 1 omitted some deterministic-pair semantic/soundness tasks from the counted envelope; the actual controller reserves them, includes self-quality, and chooses families using the real references. Actual execution prioritizes valid cached active/retired conflicts and stops on repeats/uncertainty. The full envelope conservatively budgets comparisons that early stopping may avoid; it is not an instruction to pay every planned pair.

Historical mean **$0.000664214/call**, not an invoice quote:

| Cost component | Dollars |
| --- | ---: |
| Base uncached work | $140.27 |
| 20% work/usage allowance | $28.05 |
| 5% retry allowance at mean cost | $7.01 |
| 1% lost calls retaining full reservations | $47.74 |
| Sum | **$223.07** |
| Recommended one-time cap, rounded | **$225.00** |

The configured $0.30 input / $2.50 output per million token rates match [Google's published Gemini 2.5 Flash standard pricing](https://ai.google.dev/gemini-api/docs/pricing), checked October 14. No model/provider/prompt switch or normal $0.50 operation-cap change is proposed. The existing checked cache, conflict-first ordering and early stopping are the lower-cost execution path. A smaller approved cap would stop with exact unfinished work; completion is not guaranteed under $225. All calls lost would retain **$4,774.36** for the base workload and therefore stop well before completion under this cap. Largest measured individual reservation **$0.022790**; up to six in-flight base reservations **$0.136740**. Unexpected oversized known usage is charged and stops the controller; invoices remain unmeasured.

Base prompt text **633,017,629 UTF-8 bytes**, excluding transport JSON/HTTP overhead; input reservations include framing and total **1,497,990,429 tokens**. Proposed total bounds: **1,904,496,529 input / 2,162,425,856 output reserved tokens**, **263,968 requests / 10,558 retries**, **≤6 workers**. These ceilings do not authorize spending beyond the single $225 ledger. No bank reload inside row/family loops; signatures require no provider calls. At a purely illustrative 1 second/call, base uncached work takes **9.78 hours at six workers**; latency and quota are unmeasured. This is one one-time operation across restarts, **zero recurring audit jobs**. At 10× bank size, retrieval overflow/128-competitor limits prevent honest linear completion extrapolation; take a new measured workload instead of scheduling whole-bank work.

Requested transfer is question text, correct answer, options, category, pool/format and any stored image URL/verified image context through the existing checker prompt. No player identity, username, gameplay history, reference-table payload or question UUID is included in that prompt. **Transfer and $225 funding are not yet approved.** The private draft explicitly has `approvedBy: null` and `questionTransferApproved: false`; it cannot enable paid execution.

Canonical plan hash: **`9d768d78ba429f2bd4f967f9db1c363138ab2e1de3410a523dde957d7e6e3268`**. Task hash: **`4425fa52f4a4a80a3567772d6a378bce076ee2d918476b8bb5443c996769fc99`**. Exact-byte checksums differ from these canonical hashes. Plan file SHA-256 **`d58bf705e3d7442fb8c3b59ed0591b83af9b764bffeb0540a6fad924c016d415`**; unfinished proposal file **`d0eb83c8aa85b1a6bf8511bfe1dd41b26e6efec5a53501117f7517dfa6aa72cb`**. Both private packages were independently reopened at **2026-10-14T04:07:29.398Z**, each **53 manifest files / 255,453,583 bytes / 23 companion checksums**, including a 13,894-row / 56-page / 9-file verified inventory. Total copied payload **510,907,166 bytes** on the same local filesystem; no recurring cloud storage or provider work was added.

## Dispositions and operating state

Preparation manifest: **0 proposed active / 0 proposed retired / 0 semantic holds / 7,083 explicitly not processed / 0 concurrent changes**. This does not imply that valid prior cached judgments disappeared; no row is being represented as a newly completed audit. Paid audit, exceptional-family review, independent keeper verification and final semantic disposition manifest are still outstanding. No cleanup/data application or undo log was created. Backups do not authorize mutation.

GitHub remote `main` independently equals local **`1932091e6bbe38ff2c3abae16bc677d396e63d61`**. Workflow **264911476 remains active**, schedule source remains **02:15 UTC**, unchanged $0.50 operation cap. Latest API-listed run **38375678967**, scheduled, successful, created **2026-10-13T09:21:08Z**, SHA **`96b88658dfeeb42ef88aa09fb858d9d794631e04`**. The API did not list a newer run at this capture; no dispatch/pause/resume was performed. Treat this as observed state, not proof that a run occurred exactly at the configured cron time.

Both domains independently inspect as READY deployment **`dpl_C5JhQeDE9hKt2Qmi6TzGjnho7ZTV`**, captured **2026-10-14T04:02:39.740Z**. CLI JSON supplied no source SHA; live source equality is **unverified**. The new migration is independently absent from installed migration evidence. Phase 2/3 source remains uncommitted and was not deployed by this work. No authenticated provider-positive/live approval path was exercised.

## Local verification

- **81 affected tests / 10 files**, including new SQL-backed UUID/slug reference counts, drift accounting and stale/partial cache refusal, all pass.
- **Full suite: 4,323 pass / 13 existing environment skips; 363 files pass / 1 skipped.**
- Typecheck and lint pass; existing Babel large-file note is nonfatal.
- Production build succeeds, **203/203 static pages**.
- Real captured-plan dry-run: **zero paid requests / zero mutations**, correct binding accepted.
- Every **7,083 target / 215,636 task proof** and private checksum verified; independently verified snapshot/package copies recorded in private package report.
- `git diff --check` and new script syntax checks pass.

Private evidence root: `tmp/speed-trivia-uniqueness-private/variety-phase3-2026-10-14/`; snapshot `tmp/speed-trivia-uniqueness-private/2026-10-14T03-58-39-593Z/`. Do not commit raw questions/caches/proposals/reference maps. Earlier failed preparation outputs remain private historical evidence and must never be used as final approval input; use **`preparation-final/`** only.
