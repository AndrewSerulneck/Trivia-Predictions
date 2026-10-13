# Speed Trivia Phase 2 cleanup proposal

**2026-10-13 — dry run only. Nothing has been retired, approved, restored, exported or deployed.**

The shared engine proposes soft retirement of **2,467 questions: 849 active and 1,618 pending**, retaining **968 sound approved keepers**. It verified each proposed row directly against its keeper; no proposal is based on a transitive similarity chain. IDs, text, answers/options, slugs and past game references would remain intact. This proposal is not ready to apply.

## Coverage and unresolved work

The complete input has **13,801 Speed questions** (5,136 active / 8,663 pending / 2 deleted), all nine categories. A fresh snapshot and final read-only revision check confirm no corpus drift from the original capture. Production remains at these counts.

The union index found **319,335 unordered competitor pairs**. The developer-approved bounded audit selected **10,623 edges**, covering **1,710 retrieval components**, using high wording overlap and the original six reported families for prioritization. It processed every selected edge, made **7,156 direct comparison lookups** in its final pass, and covered **3,467 redundant internal edges** through directly verified keeper groups. Cumulative private evidence from resumable work contains **6,882 distinct judged pairs**; **6,727** are edges in the original retrieval set, and **155** are additional direct keeper comparisons. Repeated lookups and cache hits explain the different counts.

**This is not an exhaustive cleanup of the bank.** There are **312,608 retrieved edges without their own semantic verdict** (including edges represented by keeper-group evidence). High lexical overlap selected work only; low-overlap unexamined matches are not classified as unique. Later cleanup must refresh/expand the audit under an agreed cap after prevention is live.

The manifest contains **6,279 unresolved entries**, concerning **3,957 distinct rows** (1,210 active / 2,746 pending / 1 deleted). Entries are overlapping edges/keeper holds, **not 6,279 questions or developer approval tasks**. They stay in an internal report, not a new review queue. Ordinary pending approval, scope/accuracy evidence and further direct keeper checks may resolve them. A question involved in uncertainty was held rather than automatically removed.

| Unresolved reason | Entries |
| --- | ---: |
| Scope, accuracy or confidence | 968 |
| Keeper also participates in unresolved evidence | 376 |
| No sound approved keeper; ordinary approval needed | 2,205 |
| Deleted-history retirement/accuracy reason unknown | 1 |
| Duplicate edge lacks one directly verified approved keeper | 2,729 |

## Six reported facts

These figures refer only to the original captured family rows, not all possible variants elsewhere in the bank. The **checker blocks all eight labeled mandatory comparisons**; the cleanup proposal conservatively holds ambiguous actual rows.

| Family | Original rows | Proposed retirements | Remaining/held |
| --- | ---: | ---: | ---: |
| Gobi continent | 4 | 3 | 1 |
| Eras Tour artist | 18 | 11 | 7 |
| Africa hemispheres | 17 | 13 | 4 |
| Vertebrate longevity | 25 | 12 | 13 |
| Sputnik country | 5 | 4 | 1 |
| Olympia origin | 5 | 4 | 1 |

Do not describe Eras, Africa or longevity as already consolidated. Remaining rows need the report's evidence/keeper checks; no content was changed to force a result. There is no lifetime ban on different facts about Taylor Swift or another artist.

## History preservation and guards

The proposed rows carry **370 trivia-answer references, 860 answer-variant references and 2 user-seen references**, from fresh aggregate-only evidence. The proposal changes only status and future retirement metadata. No physical deletes, player/history/score/reward edits or Live Trivia changes are allowed. The future apply tool must refresh these counts and verify historical/in-flight lookup behavior; Phase 2 exercised no gameplay write.

If this exact proposal were later approved and applied unchanged, counts would be 4,287 active / 7,045 pending / 2,469 deleted. **That has not happened**, and drift/further review can change the later frozen manifest. Every proposed keeper is active and is absent from the retirement set. All 2,467 old hashes/statuses, keeper hashes/statuses, direct edges and high-confidence soundness judgments were independently verified offline.

Private evidence directory:

```text
tmp/speed-trivia-uniqueness-private/phase2-dry-run/
```

Authoritative completed files (earlier timestamped outputs are partial attempts):

- `retirement-manifest-1791866241862.json` — **10,446,027 bytes**, SHA-256 `9c8e8023c7d1f4169d7317f777e1c9d66ef778052da479c376ffeee3056b650c`.
- `retrieval-and-coverage-1791866241862.json` — **138,425,990 bytes**, SHA-256 `7b5c1e0725e780a941c2a3c93ec472cea468a4f295865742073e76ac6f802e0b`.
- `derived-facts-1791866241862.json` — **11,587,992 bytes**, SHA-256 `bc86ceaccd44397343cd3c7a7eb2228653ab0eaf43e0d3bb45775b186504ba5a`.
- `verification-final.json` and checksum — independent manifest verification and family/reference counts.
- `revision-after.json` and checksum — production still matched at **2026-10-13T04:39:32.800Z** (12:39:32 AM EDT); one SELECT-only response, **76 bytes**.
- `adjudicated-pairs.jsonl`, `pair-cache.jsonl`, `budget.jsonl` — resumable, version/content-bound evidence and spend accounting. No lock remains.

All exact question IDs/slugs stay in private evidence. Full snapshot and reference source: `tmp/speed-trivia-uniqueness-private/2026-10-13T04-06-03-889Z/`. Its question file is byte-identical to the recoverably archived Phase 1 bank: **11,975,215 bytes**, SHA-256 `48b4f0a58866ffc49d6b7b836fcac748c3a85145fcc4438db0b8b280d771b2b1`.

## Spending

The separate **$10 audit cap was approved**. Final conservative accounting is **$4.2284033**, consisting of **$4.0021683** in measured token charges (6,148 settled requests; 4,150,136 input / 1,102,851 output tokens) and **$0.226235** held for ten lost/failed requests. Interrupted helper attempts preserved caches/journals; uncertain in-flight costs were retained at their full reservation rather than guessed as free. API replies with invalid IDs/schema were quarantined; outages stopped an attempt until safely resumed. Final bounded retry allowance is one per transient request failure, maximum 50 per process, all charged to the same persistent ledger. The final pass needed zero transient retries.

Benchmark conservative accounting: **$0.6728451** of the separate $5 cap. Combined conservative Phase 2 amount: **$4.9012484**, below the authorized **$15 total**. These are published-rate calculations/upper reservations, not provider invoice totals; generation, runner time and production storage costs are not established by this phase.

Next: Phase 3 builds writer admission and guarded cleanup/undo tools locally; Phase 4 releases prevention with required production migration confirmation; Phase 5 refreshes and applies reviewed cleanup and Speed exports; Phase 6 measures scheduled performance/cost. This private proposal must not be passed directly to a write command.
