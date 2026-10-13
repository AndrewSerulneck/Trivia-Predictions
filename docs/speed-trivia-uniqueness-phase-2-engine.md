# Speed Trivia shared comparison engine — Phase 2

Date: **2026-10-13, America/New_York**. Local implementation only; no writer, workflow, deployment, migration, approval queue or production content change.

The shared checker now catches the labeled repeated facts while allowing different facts about one subject. A private cleanup dry run proposes soft retirements only when a sound approved keeper has direct comparison evidence. Production still uses the old writers until Phases 3–4 install and release prevention. This phase does not remove questions from play.

## Package and contracts

- `lib/speed-trivia-uniqueness/core.cjs` is the single comparison policy for Node CJS and TypeScript. `core.d.cts` provides strict declarations; `types/speedTriviaUniqueness.ts` holds the application types. `lib/speedTriviaUniqueness.ts` is a `server-only` adapter with injected corpus reader and semantic dependency. No application caller is wired yet.
- `lib/speed-trivia-uniqueness/gemini.cjs` is an explicit, capped semantic dependency. Passing configuration: **Gemini 2.5 Flash, temperature 0, thinking budget 0, one pair per request**, model/prompt identifier `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1`. The generator has not switched models.
- `lib/speed-trivia-uniqueness/retirement.cjs` builds a reviewable, non-applicable manifest. It contains no database write/apply code.
- `scripts/speed-trivia-phase2-support.cjs` validates private backups, converts evaluation inputs, stores private immutable outputs/checksums, manages content/version caches and a persistent spending ledger with a single-process lock.
- `scripts/evaluate-speed-trivia-uniqueness.cjs` measures complete-bank retrieval and isolated-pair judgment separately. It supports offline replay and capped paid trials.
- `scripts/dry-run-speed-trivia-retirement.cjs` selects bounded audit work, compares directly against keepers, records uncertainties and reference counts, and persists a private manifest/index/coverage report. Default execution writes an audit plan only; paid comparisons require `--paid` and the approved cap.

Versions: policy **`speed-facts-v2`**, extractor **`answer-concepts-v2`**, retrieval **`union-answer-bm25-concepts-v4`**. A content SHA-256 includes question, actual correct answer, options/index, category, image URL/context, pool and format. Status enters the corpus SHA-256; IDs enter corpus identity but are not a fact key. A pair cache key includes both content hashes, policy/extractor and model/prompt/batch configuration. Directional quality fields are swapped when replaying a reversed pair.

Neither `answerEntity` nor a model's fact description is a universal fact identity. Answer aliases/token sets and locally derived entity mentions are retrieval hints. Same titles/names may refer to different entities; the judge sees the full question/answer/context to disambiguate them. Distractors are not indexed as primary subjects. Derived descriptors/qualifiers and model explanations are persisted privately; no paid embeddings or model extraction of the whole bank was introduced.

## Corpus and retrieval

`createCorpus()` rejects missing completeness/count/revision evidence, duplicate IDs, malformed content/answers, wrong pools/formats/statuses and unsupported image context. It copies and deeply freezes content. `loadCorpus()` requires count/revision evidence before and after ordered pagination, validates every page and checks drift. Missing reader/database dependencies throw; they never become an empty successful corpus. The tests exercise 1,203 rows over three pages, truncation, order, wrong revisions and final drift.

The real dry run uses the verified Phase 1 snapshot mechanism, refreshed at **2026-10-13T04:06:04.571422Z** (October 13, 12:06:04 AM EDT). It captured **13,801 Speed rows** and verified the same revision as Phase 1: **`bf59e8249cba428662dd8c33e50b61c1`**. Active, pending and deleted rows all remain in the index. This audited content digest is not a concurrency-safe admission receipt. Phase 3 must install a database-enforced revision and atomic write protocol.

Retrieval unions all exact-text matches, all answer-alias matches, reordered answer token-set matches, 24 lexical hits and 24 controlled semantic-concept hits over question **and answer**. For a corpus of at most 128 rows it compares the entire corpus. The total competitor cap is 128; overflow returns uncertain, not a silently truncated uniqueness decision. The complete-bank fixed set averaged **37.11 competitors**, maximum **103**. The six-plus-six experiment was rejected after retrieval misses; reducing the cap is not an approved optimization.

No embedding threshold or lexical overlap admits a question. Semantic judgment explicitly compares required knowledge, aliases, reversals, qualifiers, accuracy, material context and combined repeated facts. Similar same-scope questions with contradictory answers are held before a model can reinterpret their wording to justify a wrong answer. Exact normalized wording/answer/context is a deterministic duplicate; conflicting exact answers are uncertain. Different supplied image subjects can be distinct even where the existing database text index would still refuse insertion.

`checkCandidate()` returns `duplicate`, `unique` or `uncertain`, content/corpus hashes, all versions, matched IDs and explanations/comparisons. Missing dependency, timeout, invalid/truncated/missing results, retrieval overflow or stale revision cannot return unique. Even a candidate with no retrieved competitor requires a soundness check. `checkBatch()` shares earlier candidates across categories, including quarantined facts, and builds the initial index once; later additions reuse derived hashes/postings instead of rebuilding the bank for every candidate. The batch revision is ephemeral evidence, not a database admission authorization.

Caller responsibilities for Phase 3: load the complete corpus once per coordinated run, provide a capped judge, keep uncertain/duplicate candidates in an internal report outside normal review, implement exact self-row/idempotent reimport rules, and bind evidence to the database admission protocol. Do not present a Phase 2 `unique` result alone as permission to write to production.

## Frozen evaluation and evidence limits

The original **272-pair** `evaluation-v1.json` is unchanged (SHA-256 `44d2056a27e30d317f7b7b4e30185a3c7a60b53ca1ce09c8a44f847a68e37045`). Recorded provider decisions plus full-corpus retrieval evidence are frozen in `release-evaluation-v1.json` with its adjacent checksum. `tests/speed-trivia-uniqueness-release.test.ts` replays the actual engine using that recorded dependency; it makes no paid request.

| Gate | All original cases | Original held-out |
| --- | ---: | ---: |
| Labeled duplicates blocked | 137 / 137 | 43 / 43 |
| Duplicate admissions | 0 | 0 |
| Distinct facts accepted | 122 / 124 (98.39%) | 36 / 37 (97.30%) |
| Uncertain admissions | 0 / 11 | 0 / 4 |
| Duplicate competitors retrieved | 137 / 137 | 43 / 43 |

All **8 mandatory duplicate comparisons across 6 families** and **11 deterministic exact cases** are blocked. Initial policies/configurations that failed are retained privately; no gate was lowered and no original label was rewritten.

Methodological limitation: the original held-out retrieval failure was inspected during diagnosis of reordered multi-entity answers. Do not describe the final original held-out result as an untouched blind test. A supplementary **36-case** set (`evaluation-fresh-v1.json`: 18 duplicate / 18 distinct, all nine categories) was frozen **after** the policy/core/provider hashes were fixed and **before** provider scoring. No policy change followed its results: **18/18 duplicates blocked and retrieved, 18/18 distinct accepted**. Its recorded responses and checksum are in `release-fresh-evaluation-v1.json`; the offline test also pins the frozen implementation hashes. Cases were self-curated by the engineering agent, not independently expert-certified.

A finite evaluation demonstrates these cases, not universal recall or factual perfection. Images test supplied synthetic annotations only; no real image recognition/caption provider was evaluated (the real Speed corpus contains zero images). Distinct acceptance is judged in isolated pairs: in full-bank admission a labeled distinct pair's candidate can legitimately be blocked by another duplicate elsewhere in the bank. This distinction is stated in raw reports.

## Keeper and dry-run rules

The capped audit prioritizes high-overlap retrieval edges and the original six reported families. Graph components choose work only. They do not authorize transitive retirement. A candidate connected via A–B–C is checked directly against its proposed keeper; an already verified keeper group can skip redundant internal paid comparisons. All selected edges remain accounted for in private coverage evidence. Lower-overlap unexamined matches remain unresolved; the dry run is explicitly **not exhaustive**.

A retirement requires a high-confidence duplicate comparison with sound/unambiguous content on both sides. Prefer a sound approved keeper, then clean wording score, reference stability, oldest timestamp and ID. Pending-only groups stay held for ordinary approval; nothing is promoted. Deleted-history matches do not silently become keepers or restore rows. Uncertain active questions are not automatically removed. Unresolved edges not covered by one directly verified keeper are explicitly retained in the report.

Each proposed row includes exact ID/slug, old status/content SHA-256, keeper ID/slug/hash, fact/explanation/confidence, direct comparison evidence, expected per-table reference counts and changed-field list. Intended changes are `status` and future retirement metadata; IDs, slugs, question/options/answer and historical references stay intact. Metadata columns/cleanup/undo tooling do not yet exist. Every manifest says **`applyReady: false`**. Phase 5 must refresh evidence, validate disputed keepers and build a new checksummed manifest after prevention is live; never apply these files directly.

## Model findings and recurring-cost decision

Multi-pair Flash requests produced contamination between comparisons and failed the distinct/uncertain gates. Turning on 1,024 reasoning tokens did not consistently solve that defect. Isolated, zero-thinking Flash requests plus the conservative contradiction policy passed at lower cost. **Gemini 2.5 Flash-Lite returned HTTP 404** with the available credential; it was unavailable, not a measured quality failure. No OpenAI credential was evidenced and no other provider was invoked. No provider was selected because it was newer.

This evaluation concerns comparison quality. It does **not** compare generator topic breadth. Andrew explicitly raised the narrow subject range on October 12/13. Phase 3 should plan underused subjects from the actual database and share reserved facts across categories/refills; the generator sees only 15 recent local examples today. A fair later generator trial should use the same diversity brief and measure novel yield, breadth, accuracy, acceptance and cost. A generator upgrade alone cannot replace admission. No paid generation trial or production provider switch was authorized here.

Andrew approved **$5 total benchmark** and **a separate $10 total dry run**, with no further increase without approval. No monthly allowance was approved. The benchmark ledger ends at **$0.6728451 conservative accounted usage**: **$0.6188671 measured token charges**, 807 settled requests, 591,507 input / 176,566 output tokens, plus **$0.053978** reserved for three unresolved network/404/503 attempts. These are estimates at published API rates, not a billing invoice.

Standard text rates checked against [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing): Flash $0.30/M input and $2.50/M output including thinking; Flash-Lite $0.10/M input and $0.40/M output. No grounding, embeddings, persistent provider caching or paid extraction was used.

The final isolated fixed-set check costs approximately **$0.00049 per pair**. At roughly 37 competitors and 200 generated candidates, an uncached checker could cost about **$3.63/run / $109 per 30 runs**, excluding generation/manual approval checks; 2× retry sensitivity is **$218/month**. At 2,000 candidates it is about **$1,090/month**, or **$2,180 at 2× retries**. These are workload projections, not approved recurring costs or a promise of accepted yield. Early exact rejection, duplicate/uncertain stop conditions, valid pair caches and bounded retrieval can reduce actual calls; Phase 3 must measure the complete admission path and choose a lower-cost design/cap with Andrew before activation. The old $20/month proposal has not been approved and does not support silently deploying this uncached design.

Whole-corpus database traffic should remain one bounded load per coordinated run, not per category/candidate. Phase 1 estimated 46.38 MB/night / 1.391 GB per 30 nights today versus 6.02 MB/night / 180.64 MB for a compact shared corpus; multiply by 10 for 10× inventory and 2 for full retries. The fresh full-content snapshot actually transferred 10,012,364 response bytes across its read-only capture queries; supplemental reference evidence added 500,847 bytes. Persisted private metadata size and final audit spend are recorded in the handoff/cleanup summary. Production cache/table read/write costs remain unmeasured until Phase 3's design; this phase introduced zero recurring production executions.
