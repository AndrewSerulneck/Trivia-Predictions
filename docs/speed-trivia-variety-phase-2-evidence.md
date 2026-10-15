# Phase 2 offline implementation and evidence

**2026-10-13, New York.** Parent: [variety and backlog plan](speed-trivia-variety-and-backlog-plan.md). This phase implements the [frozen policy](speed-trivia-variety-policy-v1.md). No paid request, production database mutation, migration application, workflow change or deployment was performed by this work.

## Implemented contract

- `subjects.cjs` separates person/group/work identity from fact uniqueness. It records original source spans, roles, reviewed creator links, content hashes, classifier/registry/policy versions and introduction history. Curated ambiguous aliases require context; distractors, generic answers, royal titles and incidental contrasts do not establish primary identities. Precise new full names can be admitted with validated source spans and grounded roles. Unknown generated identities fail before paid comparison; unknown legacy rows remain eligible for presentation and fact-valid backlog approval.
- One lazy subject aggregate per checked admission session; bounded deltas update counters without re-extracting unchanged rows. Generation enforces 30×24h, concentration ≥24, all-primary within-run spread and ≤3 accepted/subtopic. Status-only approvals preserve trusted evidence/introduction times. The fact policy remains `speed-facts-v2` and the original held-out fixtures are unchanged.
- Topics rotate by UTC date/category and operation ID, with each eligible category getting one opportunity before repeats. Brief allocation prefers unattempted eligible topics, uses ≤3 topics, rotates region/era lenses and includes a lens outside Europe/North America in every full three-brief allocation. Labels and prompts remain inside the existing request/token/dollar/candidate/time ceilings. Reports include allocations, accepted topics, blocked reasons and coverage.
- Player selection adds no query, selected database column, stored player history or provider call. It reserves every identified key across categories and unseen/seen tiers, balances compatible categories and reconsiders conflicting multi-primary choices. Ceiling: **12,000 search nodes**, plus at most **128 equally unseen alternatives**; explicit `bounded_selection_shortfall` if bounded work cannot establish a fill. Proven smaller compatible pools use `insufficient_subject_variety`. The game displays actual round length and 45 questions/hour; scoring/session/presence behavior is preserved.
- Pending audit uses one immutable global ledger, integer upward-rounded microdollars, fsync before transport, hash-chained reservations/settlements, exclusive host/PID/nonce ownership, ≤6 workers, per-pair in-flight sharing, ≤1 retry/task and a global ≤5% retry ceiling. Invalid/missing usage and malformed responses retain full claims; known oversized usage is charged conservatively and halts work. Workers drain before lock release. No time-only stale-lock takeover. A ≤500-row revision refresh can retain the **original** approval and ledger; broader drift refuses rather than creating another allowance.
- Cache direction, model/policy/content hashes and direct sound proof control pending-family proposals. The keeper is checked independently against all externally retrieved active/pending/retired memory, including newly exposed contenders. No transitive grouping or arbitrary ID exclusion. Fresh signed atomic RPCs activate exactly one keeper, retire direct losers, journal complete before/after states and provide exact group undo. Holds retain content/IDs and stay outside ordinary ready review.
- Bulk responses preserve committed IDs/counts, repeats, unresolved rejections and untouched IDs after later failures. The UI removes only saved IDs. The ordinary Speed queue requires signed `ready` evidence; held and unverified legacy queues are separate. “Unresolved” in a bulk response does not claim a hold was persisted.
- Authenticated checker diagnostics expose configuration booleans/reason codes only. A signed harmless probe checks that website and database signing keys actually agree and that the new RPC/policies exist. These prerequisites are checked before generation transport. They do not prove that the Gemini key can successfully call the provider; Phase 5 still needs its authorized positive check.

## Paired player simulation

Private authoritative report:
`tmp/speed-trivia-uniqueness-private/variety-phase2-2026-10-13/selection-measurement-expanded-roles.json`.
SHA-256 **`9d47acd78b75b924f13e18b1c4fadd12cb99129aff32f69fae9f17dbc2b128e4`**.

Same corpus/revision **2551**, seed **20261013**, exactly the original baseline's candidate-window RNG sequence: **1,000 trials for All and each of nine categories = 10,000**. The new selector's independent seeded ordering does not change those pools. All trials are unseen, with no player records read. These are simulations, not production gameplay or exhaustive identity certification.

| Category | Baseline broader-reference repeats / 1,000 | New broader-reference repeats / 1,000 | New classifier's identified repeats | Short selections |
| --- | ---: | ---: | ---: | ---: |
| All | 31 | 3 | 0 | 0 |
| Music | 446 | 30 | 0 | 0 |
| Pop Culture | 401 | 126 | 0 | 0 |
| Literary Landscapes | 225 | 47 | 0 | 0 |
| General Knowledge | 80 | 0 | 0 | 0 |
| History | 78 | 14 | 0 | 0 |
| Sports | 52 | 8 | 0 | 0 |
| Animals / Geography / Science, each | 0 | 0 | 0 | 0 |

All selections returned **15**; measured search nodes ≤**16**. Synthetic tests separately exercise adversarial reconsideration, unseen/seen alternatives, category balance, known-subject underfill and empty pools.

The stricter role extractor identifies **1,690 / 13,894 corpus rows**, marks **4,726 generic** and **7,478 unknown**; **86** counted nonretired keys. This differs from Phase 1's lexical reference measurement: conservative production roles intentionally leave some reference matches unresolved. All-category selections average **1.641 identified / 5.048 generic / 8.311 unknown** rows. Zero repeated identified keys **does not** imply universal subject variety. Residual reference repeats, especially Pop Culture, remain visible above. No second paid tagger or blanket legacy backfill is proposed.

Local aggregation took **1.947 s**; All selection mean **2.626 ms**, max **119.194 ms** including initial classifier warming. Other category means **0.145–1.087 ms**. Host/process timing is noisy; these are local measurements, not device or production latency promises.

## Cost before release

Player question payload is unchanged: All mean **290,131.178 bytes**, **1,008.873 distinct candidates**, up to **1,100 transferred rows**. New selection adds **0 reads/writes/bytes/provider calls**. At illustrative 1,000 selections/day: **290.1 MB/day / 8.70 GB per 30 days**; at 10,000/day: **2.90 GB/day / 87.0 GB per 30 days**, before history/HTTP overhead. No new player-subject history is stored.

Generation still reads one checked corpus, with bounded deltas. The new signing/schema probe adds **one small read RPC per operation**, reused within the website's serialized writes. No extra AI judge. Policy/lens text is byte-bounded to 2,048 inside the existing generation request; additional source-span labels use its existing output reservation. The **$0.50 normal ceiling** and ≤20 generation calls are unchanged. An optional/manual operation is still separate from scheduled runs; there is no new monthly counter.

The two new nullable evidence columns project **778,064 extra corpus bytes** at this bank size, **23.342 MB / 30 whole-corpus runs**; at 10× rows, **233.419 MB / 30 runs**. This is about **6.68%** of the Phase 1 11,654,731-byte capture, excluding response framing. If every existing row were later tagged, subject evidence alone would add roughly **4,486,069 bytes** before review/history growth. **That blanket tagging is not part of this release.** New signed ordinary admissions persist their evidence; family/hold application does not perform a whole-bank tagging backfill. Full corpus reads include metadata, while player selected columns remain unchanged.

The signed ordinary writer adds one metadata UPDATE in the same transaction: at most **100 extra question updates per maximum generation operation**, **3,000 per 30 maximum-volume runs**, plus corresponding revision/change/permit bookkeeping. At 10× operation count the same upper bound is 30,000; no higher schedule/target is proposed. Actual useful generation is expected to be much lower than that ceiling. No separate subject-history table, scheduled job or repeated bank query was added. Hosting/database invoices and production latency are unmeasured; Phase 5/6 should compare actual reads, bytes, revision deltas and admissions with these projections.

Reference reads are batched ≤200 IDs in the application tool, and revalidated ≤50 transaction members by SQL. Each referencing column must have a valid leading-column, nonpartial index; a missing index refuses before counts instead of scanning whole gameplay tables per operation. Phase 3 must inspect actual reference schema/indexes and capture fresh counts before selecting keepers. Any required production index would need a concrete additional migration artifact and the normal production confirmation; none is silently created here.

The Phase 1 audit scenarios remain planning baselines: **208,425 full-envelope tasks**, **174,205 cache-first scenario tasks**, mean estimates **$138.44 / $115.71**, and illustrative total **$220.20** including usage/retry/loss allowances. **No $225 or other paid cap is approved.** Final reference-aware task selection must be frozen in Phase 3 before requesting its one-time cap/data transfer. The controller uses the unchanged `gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1` checker and includes conservative lost-call reservations; it does not guarantee completion at any finite cap during provider failure.

## Verification

Required Phase 2 checks pass; exact commands and release state are in the [Phase 2 handoff](speed-trivia-variety-and-backlog-plan_PHASE_2_HANDOFF.md). Full repository: **4,320 passing / 13 environment skips / zero failures**. The frozen held-out release gate still has zero duplicate/uncertain admissions and ≥95% distinct acceptance in both splits. Existing isolated SQL checks: **26 admission / 16 retirement-undo**. New tests cover direct-family rollback/idempotency/undo/concurrency/reference drift, generator pre-comparison rejection, open-world evidence preservation, global reservation/restart/drain safety, bounded refresh, cache orientation and truthful partial bulk results.

All **48 frozen synthetic cases** are exercised by the new identity/clock/concentration/selection tests and named review/cache/bulk/ledger/admission regressions. The old Phase 1 verification helper still says its 23 protocols “await Phase 2”; that is the preserved Phase 1 helper's historical wording, not the new test status. Its **11 private checksums / 7,083 targets / 208,425 task hashes** still verify.

No live provider-positive test, live selection sample, production SQL apply, data cleanup, export, physical-device check or scheduled-run observation occurred in this phase.
