# Speed Trivia uniqueness — Phase 1 audit

Date: **2026-10-12, America/New_York**. Corpus captured **2026-10-12 10:56:31 PM EDT** (`2026-10-13T02:56:31.683326Z`). Scope: all Speed Trivia categories, including deleted history. **Read-only production audit: no content retirement, migration, workflow change, generation call, deployment, commit, or push.**

The complete database contains 13,801 Speed questions, including an 8,663-question review backlog. Repeated facts exist in approved and pending content even though there are no normalized exact-text duplicates. Phase 2 can now build against a preserved corpus, a complete discoverable writer map, and a fixed labeled evaluation. Actual provider dollars remain unknown because current code discards usage data and no billing export is available.

## Snapshot, completeness and preservation

Linked project verified: **`pkmxupsayzshvpirkaav`**, both local `supabase/.temp/project-ref` and injected Supabase URL hostname. Credentials were injected using the existing Node `--env-file=.env.local` convention; values were never displayed or copied. Data came through [Supabase's read-only-user SQL endpoint](https://supabase.com/docs/reference/api/v1-read-only-query), not a write-capable arbitrary SQL call.

`scripts/audit-speed-trivia-inventory.cjs` uses **one PostgreSQL statement/MVCC snapshot** to materialize the corpus once and return 56 ordered 250-row pages. It validates page count/length, ordered unique IDs, pool/format, independent total, ordered-ID digest, and identical corpus revision on every packet. It does not page unordered offsets across independent changing snapshots. The same full-content revision/count were independently rechecked afterward and matched. Schema and reference aggregates are separate timed reads; they are not claimed to share the corpus transaction.

- Run ID: `2026-10-13T02-56-30-977Z`.
- Private root: `tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z/` (git-ignored, directory 0700, captures 0600).
- Corpus revision: `bf59e8249cba428662dd8c33e50b61c1` (PostgreSQL MD5 of ordered full JSON content; an audit drift marker, **not future secure admission evidence**).
- MVCC snapshot: `4634704:4634704:`.
- Full `speed-questions.json`: **13,801 rows / 11,975,215 bytes**; SHA-256 `48b4f0a58866ffc49d6b7b836fcac748c3a85145fcc4438db0b8b280d771b2b1`.
- `snapshot-pages.json`: **13,370,705 bytes**; SHA-256 `73bab429e30e1cd6f0c77df7a7504394316ee2cec44a66a898a5494143fd78e3`.
- Primary capture: 4 SQL requests / **10,012,364 response-body bytes**, without per-user/fact full scans. Additional bounded dependency/operational/GitHub reads are separately inventoried privately.
- No malformed question/options/index/answer, unknown status, missing IDs/slugs, or mixed Speed formats found; **zero image rows**. All 18 columns retained, including review/source/image/subcategory metadata.
- No player records exported. Aggregate reference evidence only; no backup/undo operations changed the database. There is **no undo log needed for Phase 1**, since mutations = 0.

Backup verification command:

```sh
node scripts/audit-speed-trivia-inventory.cjs --verify tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z
```

It verifies manifest SHA-256, all 9 primary file hashes/byte lengths, pagination and full row equality. Full private artifact inventory and durable archive details are in `speed-trivia-uniqueness-phase-1-backup-record.md`. A failed initial network-sandbox capture at `2026-10-13T02-56-12-272Z` has `completed:false`; do not use it. No secrets were printed during that failure.

## Live inventory and backlog

| Category | Active | Pending review | Deleted | Total |
| --- | ---: | ---: | ---: | ---: |
| Animals | 731 | 1,144 | 0 | 1,875 |
| General Knowledge | 546 | 619 | 0 | 1,165 |
| Geography | 625 | 1,124 | 1 | 1,750 |
| History | 646 | 1,133 | 0 | 1,779 |
| Literary Landscapes | 100 | 0 | 0 | 100 |
| Music | 613 | 1,128 | 0 | 1,741 |
| Pop Culture | 591 | 1,213 | 1 | 1,805 |
| Science | 655 | 1,082 | 0 | 1,737 |
| Sports | 629 | 1,220 | 0 | 1,849 |
| **Total** | **5,136** | **8,663** | **2** | **13,801** |

Oldest pending creation: **2026-06-24T03:28:12.566471Z**, about 111 days before capture. Newest: **2026-10-12T09:18:06.891985Z**. Pending created before July 1: 318; August 1: 2,339; September 1: 5,025; October 1: 7,624. The current schema lacks update/approval timestamps, so backlog age means creation age; approval throughput cannot be measured from these timestamps.

There are nine live DB categories versus eight local export files. Literary Landscapes has 100 active rows and is absent from the local nightly category workspace. Local exports are neither complete live inventory nor pending counts.

## Six reported fact families

Exact IDs/slugs/questions/answers/statuses are in private `six-families.json`, not copied into the public cleanup documentation. Definitions use question **and canonical answer**, exclude distractors, and separate nearby distinct relations.

| Required fact | Active | Pending | Total | Canonical answer / interpretation |
| --- | ---: | ---: | ---: | --- |
| Gobi → continent | 2 | 2 | 4 | Asia; Gobi's two countries is a separate fact |
| Eras Tour → artist | 3 | 15 | 18 | Taylor Swift; includes repeated association with additional incidental clues |
| Africa → four hemispheres | 10 | 7 | 17 | Africa; includes Geography/General Knowledge |
| Longest-lived vertebrate → animal | 7 | 18 | 25 | Greenland Shark; unqualified “longest-lived animal” held separately |
| Sputnik/first artificial satellite → launching country | 2 | 3 | 5 | Soviet Union; USSR alias/regression included |
| Ancient Olympics → original city | 3 | 2 | 5 | Olympia; country and date questions remain distinct |
| **Total** | **27** | **47** | **74** | Six distinct facts |

If Phase 2 finds one sound existing approved keeper per family and Phase 5 retires only the other representatives, this **six-family-only scenario** removes 21 active + 47 pending rows, leaving **5,115 active / 8,616 pending / 70 deleted**. This is arithmetic under stated keeper assumptions, **not a cleanup manifest or full-bank estimate**. No keeper was selected or row retired. A precise whole-bank retained count belongs to the calibrated Phase 2 dry run.

Additional real duplicate pairs span every category, including the new Literary Landscapes category. The fixed evaluation contains over 100 real-real repeated-fact pairs; it does not purport to exhaustively cluster the bank. Existing exact-key duplicate groups: **0 across all statuses**. Zero exact duplicates clearly does not establish fact novelty.

Entity concentration examples, using canonical answers only: Taylor Swift 54 rows (11 active/43 pending); Greenland Shark 31 (11/20); Asia 19 (8/11); Jamaica 12 (3 active/8 pending/1 deleted). These are **answer-frequency indicators**, not complete primary-subject counts or duplicate groups. They exclude distractors, but may include separate relations or implied subjects. Artist facts are not retired for sharing an artist.

One deleted Miley Cyrus first-Grammy/Flowers wording has an active paraphrase in current rows. The other deleted row concerns Jamaica/reggae/Blue Mountain coffee. Both are preserved in the snapshot and evaluation as fact-memory evidence; neither was restored. Two answer-variant ledger records reference deleted Speed questions.

## Writer/security and history findings

See [the detailed writer map](speed-trivia-uniqueness-phase-1-writer-map.md) for entry points, package aliases, external SQL, source-of-truth traps, and reference counts. All discoverable Speed/shared routes require the later gate; no new migration or application guard was implemented now.

Key findings: generic manual create defaults active; approve/PATCH/restore can reactivate deleted content; the Speed “InFile” edit catches DB failure and writes export JSON; a physical-delete helper cascades history; export PR logic leaves files for categories that become empty. Service-role arbitrary DML bypasses RLS. Normalized key can be edited directly because the normalization trigger watches only question text. All 13,801 review fields say clear without semantic evidence. No semantic RPC/current-corpus revision exists.

Aggregate preservation baseline: 3,307 Speed answers, 5,626 Speed answer-variant records, 18 non-FK Speed seen records, no Speed Live-session/Live-answer/venue-seen records. New selection filters active; in-flight answer lookup does not filter status. Keep IDs/slugs/content/options unchanged through retirement. Do not submit test answers to production or repair scores/rewards.

## Evaluation and small uncertainty list

Frozen [evaluation README](../tests/fixtures/speed-trivia-uniqueness/README.md): **272 pairs = 137 duplicate / 124 distinct / 11 uncertain**. Calibration 188, held-out 84; no source/answer/fact component leakage. Both splits cover all nine categories. At least 100 real-real pairs per positive/distinct class; authored regressions supplement them. Full rationale/options/answers present; raw IDs remain private.

Offline isolated-pair baseline using the actual legacy helper: **56/137 duplicates blocked, 81 escape**; **123/124 distinct accepted**; **8/11 uncertain incorrectly accepted**. Held-out: **20/43 duplicates blocked, 23 escape**; **36/37 distinct accepted**. All eight mandatory duplicate comparisons escape. This measures comparison failure, not full-corpus retrieval recall; Phase 2 must measure retrieval separately. No paid evaluator was called and no release gate has passed.

Only a small accuracy/scope list needs later attention, not hundreds of manual reviews: broad animal versus vertebrate longevity; broad versus general relativity; Magellan “first to circumnavigate” despite dying en route; present versus past Queen lead singer; tied Formula 1 championship records; Paris “twice” wording after its third Games; ancient Olympic wreath answer; single-dart score; and combined Eras facts with an extra clue. These are holds, not proposed auto-retirements. No immediate developer decision is needed to start Phase 2.

External checks support several flags: ancient winners received olive wreaths ([Tufts/Perseus](https://www.perseus.tufts.edu/Olympics/faq7.html)); Paris hosted in 1900, 1924 and 2024 ([City of Paris](https://www.paris.fr/en/pages/paris-and-the-olympic-games-an-enduring-partnership-27736)); F1 describes Hamilton/Schumacher as joint seven-title record holders ([Formula 1](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-f1-drivers-championship.53MjXJzTDxQnfxfoCLnxNZ)). Other questionable variants remain explicitly unresolved; this phase is not a general accuracy repair.

## Current execution/cost baseline

Repository: `AndrewSerulneck/Trivia-Predictions`, verified through GitHub, not package metadata. Workflow **active**. Latest observed scheduled run [38227838099](https://github.com/AndrewSerulneck/Trivia-Predictions/actions/runs/38227838099), number 218, source `0931f553d3f0bc57b4f00b1030787bd270740eaa`, success, **2026-10-12T09:07:21Z–09:18:11Z**. No run was dispatched/rerun/disabled.

Fourteen scheduled runs, 2026-09-29 through 2026-10-12, all success:

| Metric | Measured from current logs |
| --- | --- |
| Generator child invocations | 190 total, mean **13.57/night**, range 11–15 |
| Extra refill child invocations | 78 total, mean 5.57/night; eight initial category calls each night |
| Logged successful generation attempts | 1,408 total, mean **100.57/night**, range 81–124; failed/unlogged attempts may add calls |
| Written generated candidates | 1,322 total, mean **94.43/night**, range 86–100 |
| Importer processed/upsert-attempted count | 1,322; same totals as generated. **Not proof of 1,322 fresh inserts**: pending upsert can ignore slug conflicts and logs count attempted rows |
| Child duplicate discards | 3,094 exact + 966 near; raw responses/invalid candidates not logged |
| Logged API retry messages | 0; not proof of zero SDK/network/retry overhead |
| Model failure/fallback messages | 12; do not imply successful fallback selection |
| Run elapsed including setup/install | 8,367 seconds total; mean **597.64 s**, range 475–683 s |
| Tokens, thinking tokens, billing, successful runtime model, approval throughput | **Unavailable**; API usage metadata discarded and no approval timestamp or billing export |

Default workflow generator is Gemini 2.5 Flash with configured fallback; secret overrides mean the actual successful model is unverified. Keep Gemini initially; no model/provider change was made. YAML schedules 02:15 UTC, but observed runs start 08:02–09:07 UTC. Treat this as recorded timing variance, not proof of an understood scheduler problem or reason to change cron.

Measured current-row serialized projections: generator catalog **3,110,880 bytes** (13,799 non-deleted rows); importer catalog **4,159,604 bytes**. These are reproducible compact JSON estimates from the snapshot, not packet/egress billing measurements. With measured 13.57 children + one importer load: **46.38 MB/night / 1.391 GB per 30 nights** at current corpus shape. Loader query estimates from logged corpus sizes and actual page sizes: **220–278 queries/night, mean 251.64**, excluding preflight/counts/retries/inserts. Exact query counts weren't logged.

One complete answer/context corpus projection is **6,021,479 bytes** including deleted memory: roughly **6.02 MB/night / 180.64 MB per 30 nights**, plus bounded admission deltas. This is about 87% less catalog payload despite carrying answers. At 10× corpus with the same child count: current pattern about **463.79 MB/night / 13.91 GB/month**, versus one answer-aware load **60.21 MB/night / 1.806 GB/month**. At 10× candidate/accepted volume, semantic requests/tokens also grow roughly 10× unless batching/cache changes; do not silently expand budgets. A conservative 2× retry scenario doubles request/payload/token estimates. New indexed/incremental retrieval at large scale must be measured before selecting it.

Paid standard Gemini 2.5 Flash rates: **$0.30/M text input and $2.50/M billed output, including thinking**, checked on 2026-10-12 from [Google pricing](https://ai.google.dev/gemini-api/docs/pricing.md). Current invoice may be zero/free-tier or higher; it is unknown. Pure sensitivity example, **not measured**: 100.57 requests/night × 2,000 input + 2,000 billed output tokens gives **$0.563/night / $16.90 per 30 nights**, or **$33.79 at 2× retries**. Thinking above the assumed 2,000 increases this. Provider spend per actual admitted/approved question cannot be reported yet.

## Proposed budgets — not approved or enacted

Before paid work, propose **$25 total one-time cap**, including at most **$5 for evaluation/provider comparison**, remaining at most $20 for initial extraction/index/backfill. Pause if coverage cannot be completed under that cap; do not process the bank uncapped. No paid API trial happened in Phase 1.

Propose **$0.50 maximum per scheduled run**, **$15 per 30 scheduled runs**, plus **$5/month for manual approval/edit checking**, for a shared **$20/month total model ceiling**. Include generation, extraction, semantic adjudication, billed thinking, failed calls and fallbacks in one persistent ledger/reservation. Limit generated candidates to 200, accepted questions to 100; zero accepted is valid. Scope these dollar caps to model APIs; Supabase/runner/storage dollars require the developer's account rates to estimate separately.

A bounded illustrative run of 600,000 input + 100,000 billed output tokens costs $0.43 at those rates, under $0.50. A 2× retry demand would cost $0.86 and must be stopped by the same cap, producing a shortfall instead of quietly doubling spend. At 10× load, illustrative usage is $4.30/night/$129 per 30 nights before retries, materially above the proposal; it requires a fresh cost decision or lower output.

Benefit: shared loading reduces reads/bandwidth while adding measured semantic checks; retired facts stay reserved and uncertainty stops before Andrew's review queue. Lowest-cost starting option: current Gemini plus deterministic/alias/lexical retrieval, cached metadata, bounded batches, and fail-closed uncertainty. Evaluate semantic retrieval/adjudication on the frozen set; deterministic-only checking demonstrably fails it. No embedding subscription or stronger provider is selected. If quality cannot pass within caps, report the measured tradeoff before increasing spend.

Andrew has **not selected a dollar budget**. Phase 2 may implement offline work now; obtain an informed cap before paid benchmarking/bulk processing. Missing evidence precisely: Google AI Studio/Cloud billing or usage export for the Gemini credential used by Actions, including actual model, input/output/thinking tokens and credits; Supabase/Actions account billing rates; approval audit timestamps. Do not request or expose existing keys. Phase 3 should add safe structured usage/run receipts; Phase 6 should compare seven live runs against this baseline.

## Verification and boundary

Primary private backup verified; 272-case coverage/split integrity verified; 14 runs and matching source inspected; schema/roles/FKs/36 SQL shapes captured. Targeted tests and typecheck/lint results are in the Phase 1 handoff. No full application build is needed for read-only scripts/fixtures/docs, and no production generation/cleanup was used as a test. The next phase is the shared comparison engine and a **dry-run** retirement manifest, not live cleanup or rollout.
