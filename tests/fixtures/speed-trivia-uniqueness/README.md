# Speed Trivia uniqueness evaluation v1

Curated on **2026-10-12**, from the complete read-only production snapshot, plus authored regressions. Speed Trivia only, all nine current categories; no paid labeling or generation calls.

Frozen file: `evaluation-v1.json`, **272 pairs**, SHA-256:

```text
44d2056a27e30d317f7b7b4e30185a3c7a60b53ca1ce09c8a44f847a68e37045
```

| Split | Duplicate | Distinct (`unique`) | Uncertain | Total |
| --- | ---: | ---: | ---: | ---: |
| Calibration | 94 | 87 | 7 | 188 |
| Held-out | 43 | 37 | 4 | 84 |
| Total | 137 | 124 | 11 | 272 |

At least 100 duplicate pairs and 100 distinct pairs contain **two actual database questions**. Authored paraphrases supplement those. Categories have 12–18 duplicate labels and 12–16 distinct labels each, by left question category; both splits cover all nine categories. Cases cover cross-category facts, aliases, reversal, low word overlap, partial overlap, identical answers/different facts, same artist/different fact, option order, exact normalization, deleted history, missing/conflicting answers, and images.

Each side supplies question, answer, options/index, category, image context, and provenance. `source.sourceHash` is an **opaque SHA-256 of the source UUID**, not a content hash or admission receipt. UUID/slug mappings are private in `evaluation-provenance.json` beside the backup. Never build a content cache from these opaque identifiers.

The implementing agent manually curated labels from displayed question/answer content. This is not independent expert certification of every assertion. `duplicate` identifies repeated required knowledge, not keeper accuracy. `uncertain` flags missing evidence, accuracy conflicts, or unresolved scope/time. Uncertain inputs must never be admitted. This fixture authorizes no retirement.

Whole connected components of fixture identity, source row, normalized answer/entity, and named duplicate fact go into one split. No component crosses splits. Keep held-out labels/rationales out of adjudication prompts and policy/retrieval fitting. The public fixture supports reproducible scoring; secrecy is not enforced. A small set demonstrates its cases, not universal recall.

There are **zero live Speed image rows**. Image fixtures use authored subject/context annotations: they test comparison context handling, not recognition, fetching, or real provider captions. Identical text over different supplied image subjects is semantically distinct; the existing text-only database index can still refuse insertion. Report engine and database backstop results separately.

Mandatory fact IDs: `gobi_continent`, `eras_artist`, `africa_hemispheres`, `vertebrate_longevity`, `sputnik_country`, `olympia_origin`. Evaluate all mandatory cases regardless of split. Two historical exact copies and a retired/active Miley Cyrus pair test retained fact memory.

```sh
npx vitest run tests/speed-trivia-uniqueness-evaluation.test.ts
node scripts/evaluate-speed-trivia-legacy.cjs
```

The baseline executes only the actual lexical helper, category gate, exact normalization, and deleted-row exclusion against isolated pairs. It runs **no generation/import/network/full-corpus retrieval**. All-pair baseline: blocks 56/137 duplicates, accepts 123/124 distinct cases, incorrectly accepts 8/11 uncertain cases. Held-out: blocks 20/43 duplicates, accepts 36/37 distinct cases. All eight mandatory duplicate comparisons escape. These are defects, not passing Phase 2 gates.

Phase 2 must separately measure full-corpus retrieval recall and adjudication quality. Gates: **zero duplicate admissions** on mandatory/held-out/exact cases, **at least 95% acceptance** of distinct facts, **zero uncertain admissions**. For 37 held-out distinct cases, accept at least 36; report all 124 separately. Never lower gates or fit against held-out answers. Label corrections require evidence, changelog, new version/checksum, and re-evaluation; do not rewrite labels to accommodate model failures.

## Phase 2 release evidence (2026-10-13)

The original v1 input/labels/checksum above remain unchanged. `release-evaluation-v1.json`
plus its `.sha256` freezes recorded isolated Gemini 2.5 Flash comparisons and complete-bank
retrieval evidence. Policy `speed-facts-v2`, extractor `answer-concepts-v2`, retrieval
`union-answer-bm25-concepts-v4`, prompt `fact-judge-v2`, thinking 0, batch size 1.
Original results: 137/137 duplicates blocked/retrieved, 122/124 distinct accepted;
held-out 43/43 blocked/retrieved and 36/37 distinct accepted; uncertain admissions 0/11.
All eight mandatory and eleven exact cases are blocked.

The original held-out retrieval miss was inspected while fixing general reordered-answer
retrieval; the final original split is not an untouched blind test. `evaluation-fresh-v1.json`
was frozen after the final core/provider hashes and before scoring: 36 self-curated cases
(18 duplicate / 18 distinct) across all nine categories, with no subsequent policy fitting.
`release-fresh-evaluation-v1.json` freezes its recorded responses; 18/18 duplicate blocks
and retrieval hits, 18/18 distinct acceptance. Adjacent checksums pin both files.
These are finite self-curated sets, not independent factual certification or universal recall.

```sh
npx vitest run tests/speed-trivia-uniqueness-release.test.ts tests/lib.speed-trivia-uniqueness.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-retirement.test.ts
```

This is an offline recorded-dependency replay. Paid re-evaluation must use the existing
private spending ledger and approved scope/cap; missing cache results are unverified.
Exact commands, private evidence, budget and outstanding release work are in
`docs/speed-trivia-uniqueness-plan_PHASE_2_HANDOFF.md`.
