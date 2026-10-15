# Phase 1 inventory, evaluation and cost design

**2026-10-13, New York.** Read-only preparation for [the plan](speed-trivia-variety-and-backlog-plan.md); numeric contract: [subject policy v1](speed-trivia-variety-policy-v1.md). No paid requests, database writes, migration, deployment or workflow changes were made.

## Snapshot and cohort

Captured **2026-10-14T01:36:30.649Z = October 13, 9:36:30 PM EDT**, linked Supabase `pkmxupsayzshvpirkaav`, independent before/after revision **2551**. **13,894 Speed rows: 4,274 active + 7,083 pending + 2,537 deleted.** Against the preserved 01:14:46.531Z preparation: **0 new IDs, 0 missing IDs, 0 content changes, 0 status changes**. No totals forced to match a UI page count.

The frozen pending cohort has **7,083 IDs**, each with status, content hash, full-state hash and creation timestamp, in ignored private `tmp/speed-trivia-uniqueness-private/variety-phase1-2026-10-13/target-pending.json`. Future arrivals and concurrent changes are separate reconciliation buckets. No survivor/retirement counts are promised by the workload estimate.

The capture made **30 successful read RPCs**, receiving **11,654,731 bytes**: two inventories and 28 ≤500-row corpus pages. An initial sandboxed read failed before the network-enabled read-only retry; no paid endpoint was contacted. Both original and refreshed captures remain intact. This is a revision-bound corpus snapshot, **not** a full references/undo backup or an activation receipt; Phase 3 still needs independently verified mutation backups/reference evidence.

| Category | Active | Pending | Retired |
| --- | ---: | ---: | ---: |
| Animals | 632 | 984 | 271 |
| General Knowledge | 427 | 472 | 277 |
| Geography | 484 | 876 | 400 |
| History | 528 | 903 | 348 |
| Literary Landscapes | 94 | 11 | 6 |
| Music | 512 | 926 | 315 |
| Pop Culture | 511 | 1,010 | 297 |
| Science | 534 | 821 | 393 |
| Sports | 552 | 1,080 | 230 |

## Subject coverage and concentration

Only **16 / 13,894 (0.115%)** rows have generation metadata; all 16 are pending, from the two already-authorized historical pilots. Do not treat that field as a complete subject/history inventory. A bounded reference measurement used **87 curated identities**: 50 people, 9 groups, 28 works. It read prompts and correct answers, omitted distractors, applied contextual exclusions for ambiguous aliases and supported creator-focused work relations. This is a **lower-bound, partial-focus inventory**, not production tagging or proof that a question is factually sound.

| Status | Rows with ≥1 registered focus | Rows without a registered focus | Multi-focus rows |
| --- | ---: | ---: | ---: |
| Active | 472 / 4,274 (11.04%) | 3,802 | 81 |
| Pending | 942 / 7,083 (13.30%) | 6,141 | 127 |
| Retired | 413 / 2,537 (16.28%) | 2,124 | 57 |

“Without a registered focus” includes generic questions and named subjects outside this registry; it does **not** mean no primary subject exists. The reference measurement does not certify every primary entity in a tagged row. Keep that distinction in dashboards, tests and handoffs.

| Identified focus | Active | Pending | Retired | Active + pending |
| --- | ---: | ---: | ---: | ---: |
| Beethoven | 27 | 46 | 17 | 73 |
| Beyoncé | 16 | 46 | 42 | 62 |
| Queen (band, role-bound) | 21 | 41 | 21 | 62 |
| Adele | 13 | 42 | 5 | 55 |
| Bohemian Rhapsody | 20 | 34 | 19 | 54 |
| Game of Thrones | 15 | 39 | 12 | 54 |
| Taylor Swift | 16 | 34 | 24 | 50 |
| Johannes Gutenberg | 14 | 35 | 2 | 49 |
| Beatles | 9 | 32 | 14 | 41 |
| Harry Potter (work/franchise focus) | 15 | 26 | 16 | 41 |
| Michael Jackson | 14 | 20 | 15 | 34 |

Registered nonretired subject counts: **median 14, p75 24, p90 41, p95 54**. A **24-row generation threshold** covers 22 / 87 identified keys and **817 / 11,357 nonretired rows** (7.19%, unique rows; a row with several subjects counts once here). Sensitivity: thresholds 10/12/15/20 cover 60/53/43/31 keys and 1,326/1,260/1,168/990 rows. The threshold is calibrated to this deliberately concentrated registry; unknown subjects do not prove low concentration.

Correct-answer frequency is a separate measurement. Taylor Swift is the correct answer in **9 active / 26 pending** versus **16 / 34** registered focus rows. Beyoncé: **12 / 38** answer rows versus **16 / 46** focus rows. Countries/materials are outside the person/group/work threshold even when answer counts are high. Literal mention counts are also separate: some mentions are incidental, titles, partial answers or alias variants. Earlier proposal counts used substring mentions and therefore differ; do not describe the change as database drift.

A manually inspected SHA-256(ID)-ordered sample of **50 registered matches** found one specific pre-fix false positive: **Queen of Soul → Queen band**. The role exclusion fixed it; the same 50 had **0 known identity false-positive rows after that correction**, with partial co-primary coverage still acknowledged. Factual soundness was not audited: a recognizable subject can occur in an invalid premise. Exact sample text/IDs stay private in `primary-subject-review-sample.json`.

Recent creation-time proxy: **2,602 rows in 30 days**, **367** with a registered focus, **86 / 87** registry identities present. Most famous choices are therefore already in cooldown under v1. This is expected to reduce familiar-subject output and steer generation elsewhere; it is not evidence of complete admission-event history. Over the seven latest UTC creation dates, daily registered repetition reached **2**; creation dates can contain several runs and are **not run IDs**. Do not claim these are seven monitored scheduled runs.

Historical reports separately prove two paid pilots: first **10 generated / 2 admitted**, second **19 generated / 14 admitted**. Accepted pilot content covers **2 categories / 8 subtopics**; 10 / 16 admitted rows have a registered person/work focus, while others concern materials/crafts/places/techniques. The second pilot accepted **4 poetry** questions. v1's per-subtopic ceiling is 3 and will be enforced separately from fact validity; those old questions are not retroactively invalid. Both reports retain their historical fatal/cutoff classifications. No new live generation or provider-positive check was run.

## Player-selection baseline and bounded cost

Source inspected: `lib/trivia.ts:getTriviaQuestions` / `pickBalancedRandomQuestions`, `app/api/trivia/route.ts`, `components/trivia/TriviaGame.tsx`. For the usual limit 15, the declared query limit is 600, but banks larger than 600 use **five windows**: a fixed first window plus four random offsets, each **220 rows**. Thus up to **1,100 transferred question rows** (and ≤1,100 distinct), plus one count query and optional answered-ID read of ≤10,000 rows. The constant 2,000 does not cap the combined five-window transfer for larger internal limits. Preserve/measure the actual implementation rather than promising “600 candidates.” Category counts ≤600 use one question read; Animals currently still uses five windows. The database query does not specify ordering; the simulation uses capture ID order only as an approximation.

Offline baseline: seed **20261013**, **1,000 trials per All/each of nine categories = 10,000 trials**, all-unseen, no player records read. Average All pool **1,008.873 distinct rows**, **1,100 transferred**, serialized selected-column payload **290,131.178 bytes/request**, all nine categories represented in each trial. Known-subject repetitions:

| Selection | Trials with registered subject repetition | Mean known-focus question rows / 15 |
| --- | ---: | ---: |
| All | 31 / 1,000 (3.1%) | 1.797 |
| Music | 446 / 1,000 (44.6%) | 5.255 |
| Pop Culture | 401 / 1,000 (40.1%) | 5.302 |
| Literary Landscapes | 225 / 1,000 (22.5%) | 1.877 |
| General Knowledge | 80 / 1,000 (8.0%) | 1.151 |
| History | 78 / 1,000 (7.8%) | 1.003 |
| Sports | 52 / 1,000 (5.2%) | 0.837 |

Science/Geography/Animals have zero **registered** matches in these pools, so their zero measured repeats give no universal variety assurance. These are simulations of subject repetition, **not observed gameplay rates or fact duplicates**. Phase 2 compares its selection using the same seeds/pools; release needs bounded real observations.

v1 chooses no recent-subject player-history extension: **zero additional database reads/writes, bytes or AI calls** for selection, and one local pass over the existing pool. Actual daily selection traffic was not measured; at an illustrative **1,000 All selections/day**, baseline question payload is **290.1 MB/day / 8.70 GB per 30 days** and 7,000 queries/day including history; at **10,000/day**, **2.90 GB/day / 87.0 GB per 30 days**, 70,000 queries/day. These exclude HTTP overhead, history bytes and count-query database work. New selection adds **0** to each. The five-window read count stays bounded even at 10× bank size; old history may reach its 10,000-ID cap and is not all-time unseen certification.

Generation already loads one corpus per operation: measured **11.655 MB / 30 read RPCs/run**, **349.642 MB / 900 RPCs per 30 runs**; at 10× bank volume, roughly **116.5 MB / 280 RPCs/run**, **3.50 GB / 8,400 RPCs per 30 runs**. Bounded revision deltas are additional and unchanged. New counters should add **0 corpus reads / 0 separate AI calls**. A compact policy prompt allowance of **≤2,048 input tokens/call × ≤20 calls** costs at most **$0.012288/run**, **$0.36864/30 scheduled runs**, within the unchanged $0.50 cap, reducing available comparison funds. Reserve those tokens inside the existing budget rather than adding a new allowance. Additional identity output labels also count toward existing output-token reservations. At 10× operation count the same caps imply up to $150/300 runs; no increase in frequency is proposed. Actual provider invoices/hosting fees are unmeasured; do not claim dollars saved from earlier rejection until useful admissions and spend are observed.

## Complete pending-audit estimate

Existing cache: **8,932** valid model/policy-bound entries, preserving `firstHash` direction. Frozen checker: `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`. Historical measured mean: **$2.1268289 / 3,202 calls = $0.000664214 per call**, 2,162,913 input / 591,182 output tokens. Mean-based estimates are planning estimates, not billing quotes or guaranteed maximum costs.

Refresh retrieval: **257,274 row/competitor slots**, **6,039 cached slots**, **4,712 deterministic slots**, **0 retrieval overflows**. The old 2,439 duplicate-flagged pending rows decompose into **735** with a directly cached high-confidence sound active keeper, **1,386** with pending-only conflict evidence, and **318** with weak/deleted/other reserved evidence. Even the 735 remain current-state/reference/drift checks, not approved mutations.

A cache-derived **workload scenario** greedily chooses **542 direct stars / 741 potential losers / 542 provisional keepers**, including 740 directly cached sound loser links. This is not transitive clustering or a frozen disposition manifest. Not every pending-only flagged row is assigned; contradictory/overlapping/weak edges stay for explicit review. Removing these provisional sibling rows changes retrieval: **1,581 new keeper/competitor slots** appeared and were budgeted. References were not read, so keeper ranking is provisional; changed family choices require task recalculation. Existing exact-repeat slots already have cached judgments in this snapshot; **0 additional uncached exact-quality pairs** were needed. Deterministic identity still cannot establish sound quality on its own.

| Work design | Distinct new pair/self tasks | At measured mean | +20% allowance |
| --- | ---: | ---: | ---: |
| Original missing list, omitting family/activation completion | 140,112 | $93.07 | $111.68 |
| All current retrieval pairs, no conflict short-circuit | 200,029 | $132.86 | $159.44 |
| Cache-first direct-star scenario, plus ≤1 soundness reserve per target | 174,205 | $115.71 | $138.85 |
| Complete planning envelope: all retrieval + 7,083 soundness reserves + newly exposed keeper competitors | **208,425** | **$138.44** | **$166.13** |

Recommended order: validate cache once; directly sound active/retired evidence first; short-circuit only a proven repeat/explicit hold; then prove direct pending-only representatives; check survivor/keeper external retrieval; reuse judgments for fresh signed activation. Known strong-active/direct-star savings reduce the conservative task count by **34,220 (16.42%)**. Runtime early stopping on newly discovered repeats/uncertainty can save more, but cannot be predicted honestly from cache alone. Do not pay every missing comparison for a row already proven to repeat; conversely, do not drop representative work because a pending row has *some* duplicate evidence.

Activation is included: up to **7,083 self-soundness checks ($4.70 mean)** reserved conservatively even when existing sound comparisons suffice; signatures are recomputed locally, **zero paid signature calls**. Identical cached content comparisons need not be repurchased. Drift/new competitors need bounded fresh retrieval and extra tasks **charged to the same cap**. This envelope covers the measured scenario; it is not a proof of all possible future family/drift tasks. Holds/unknown evidence get explicit dispositions; no paid rewriting or active-bank re-audit is included.

Retries and lost calls materially affect the cap. Complete base: **208,425 requests**; +5% attempts: **218,847** (retry requests are new claims). Conservative prompt byte ceilings total **1,489,822,323 bytes** including 4,096 framing bytes/call. Provider JSON payload is smaller; this is a **token reservation ceiling**, not measured HTTP transfer. At 8,192 reserved output tokens and current configured rates, reserving every call as lost would be **$4,715.49**, so the mean estimate cannot promise full completion under worst-case provider failures. **1% lost full reservations** alone uses **$47.15**. An illustrative planning cap scenario is **$138.44 + $27.69 (20% work/usage allowance) + $6.92 (5% mean-cost retries) + $47.15 (1% lost reservations) = $220.20**, rounded provisionally to **$225**. **No $225 cap is requested or approved.** Phase 2 must implement/test the controller and refine actual selected prompts/tasks before Phase 3 requests funding/data transfer; high loss/drift must stop with exact unfinished counts, not exceed the cap. Budget-limited explicit holds are not semantic duplicates.

The audit is one operation across restarts/workers; not hundreds of replenished $0.50 operations. At the illustrative mean, a serial 1-second/call audit would take **57.90 hours**; six workers **9.65 hours**; actual provider latency/rate limits were not measured here. Split into resumable wall-clock slices using one durable total ledger, not separately funded jobs. At 10× pending volume, task count need not scale linearly because retrieval has a 128-competitor limit and overflow becomes a hold; report this instead of extrapolating an exhaustive all-bank guarantee.

## Durable controller design for Phase 2

- One explicitly authorized audit ID binds target/corpus/task hashes, policy/extractor/model versions and an immutable one-time ceiling. Retain normal $0.50 operation ceilings and the old helper's ≤$25 guard; introduce a separately scoped controller, not a global cap widening.
- One coordinator owns an exclusive lock with host/PID/process-start nonce and run ID; at most **6 workers**, at most **1 in-flight request/worker**. A crash leaves a lock and reservations. Do not steal it on elapsed time alone; recover only after verifying the owning process is gone and journal integrity. Close/drain all workers before releasing ownership.
- Append and fsync a reservation **before transport**. Use integer microdollars rounded upward, prompt bytes + framing, complete output ceiling and retry/request/token counters. Claims use audit ID/task key/attempt ID. Lost/malformed/no-usage responses retain full claims; retries reserve independently. Settlements append actual usage exactly once and never refund an unidentified call.
- Global retry ceiling **5% of frozen planned requests**; ≤1 transient retry per task; schema/invalid/uncertain judgments are dispositions, not automatic retries. Six unresolved in-flight calls can reserve roughly **$0.136** at once. Stop queueing when cap/time/dependency/journal failure occurs; drain/retain in-flight reservations and preserve completed results.
- Cache-first checks need no paid reservations; validate hashes, policy/model version and direction. Per-row state machine records untouched/started/comparisons complete/hold/proposed disposition/applied. Save evidence before classifying a row ready; unfinished work cannot look like an approval.
- Regenerate receipts from current retrieval and signed authority just before application. Reuse judged pairs after freshness verification. Read reference counts once per bounded cohort/batch and apply only atomic idempotent reviewed operations. One stable corpus at audit start, bounded deltas during refresh and application; never whole-bank reads per row.
- Freeze manifest/journal/backup hashes, reopen them, preserve two independently verified private copies before any mutation. Keep undo references and before/after states. Original corpus captures are evidence, not sufficient undo backups.

## Verification

The **48 synthetic examples** comprise **25 identity examples** passing the bounded reference measurement and **23 protocol examples** awaiting Phase 2 implementation (clock/concentration/selection/family/cache/bulk/ledger/admission). The reference examples validate the declared measurement limits, not the future production policy. All **7,083 target hashes** and **208,425 task hashes** are locally verified; reopened checksums cover private artifacts. The original unchanged Speed regression command in plan §6 passed **8 files / 59 tests / 0 failures**, including the held-out release and existing PGlite admission checks. No credentials loaded by that regression.

Application typecheck/lint/full-suite/build and new production-policy/atomic SQL tests are Phase 2 implementation/release gates; they were not run as a documentation-only Phase 1 release. No application/schema files changed. Full live checks, real scheduled-run observation and new positive paid pilots remain unperformed/unauthorized here.
