# Reliable manual Speed Trivia review

Created 2026-10-14. Owner: Andrew Serulneck.

**Status: All three phases complete/live, 2026-10-14. PR #9 merged; application main `dd45c62d5053ac53eb399344c9e26096704ff9fb`, READY `dpl_FoVD4MvfNVAWZT4hSbKN4noYF1Wa`; both live domains/exact source verified 2026-10-14T17:08:42Z. Authenticated free hosted preview/live diagnostics pass beyond 30 seconds through the actual parser and Chromium, with clean 45-second finishes; zero question/provider operations. All 4,300 tests / 13 skips, typecheck/lint/203-page build, SQL 26/16 and three final-head CI gates pass. [Phase 3 handoff](speed-trivia-review-reliability-plan_PHASE_3_HANDOFF.md). Real paid user-run latency/cost and physical-device checks remain optional monitoring, not unfinished phases. Final documentation main `fbdcc3fba32acc90e6d9f3ad6829e85b813a2791`, READY `dpl_33xUyb9UBXZbHXbiU2ugRzaiwvph`, both domains/exact source verified 2026-10-14T17:15:05Z; final browser/play diagnostics also pass.**

## What Andrew will get

Select pending questions once. The page checks them against already-approved questions one at a time and shows progress while it works. Each repeat is labeled beside its own question, with the existing approved question shown. Accepted questions are saved. Unfinished questions remain pending and can be continued after a normal pause. A pause for time or money is not presented as a broken connection or as proof that a question repeats.

The existing $0.50 checking cap applies to the whole selection for that click, including retries. The page must never split one click into separately funded automatic requests. A later explicit Continue click is another operation under the existing cap; show this clearly. No claim that all 200 questions must fit within $0.50 or four minutes. No blanket deletion, paid backlog audit, new recurring job or new service.

## Phases and intelligence levels

| Phase | Work | Required intelligence | Done when |
| --- | --- | --- | --- |
| 1 | Find the failure and set a concrete test for success | **High** | Actual request evidence and the cheapest sound design are recorded. |
| 2 | Build progress, exact repeat labels and safe continuation | **Extra high** | Slow and interrupted requests preserve correct results; the approved-only guard and one-click budget pass tests. |
| 3 | Verify the real hosted connection, publish and check the live release | **High** | A free, authenticated connection test survives beyond the observed 30-second cutoff; exact source and both live domains are verified. |

These levels describe the engineering work, not a change to the application's question-checking model or price. The existing project recommendation of Sol/high fits Phases 1 and 3; Sol/xhigh fits Phase 2. No stronger model or parallel agent is required by this plan.

## Phase 1 — evidence and decisions

Initial 200-question request on the earlier release hit Vercel's actual 300-second timeout. Five approvals committed before it stopped. PR #8 introduced a 240-second application deadline and recovery of saved statuses, but the browser still waits silently for one complete JSON body.

The subsequent failure occurred on main `244ac0bb2d029c11ea150793ce2eab395f871f62`, READY `dpl_Gut4nT9YNfkHtaWkspupDQKzy9kA`:

- Approval POST started 15:56:25.157 UTC, recorded status 503; recovery POST started 15:56:55.282 UTC, status 200 — 30.125 seconds later.
- Approval POST started 16:07:21.509 UTC, recorded status 409; recovery POST started 16:07:51.524 UTC, status 200 — 30.015 seconds later.
- These are server logs, not a browser trace. They establish when recovery started; they do not prove which browser or intermediary closed the connection or whether its limit is idle versus total time. Do not call that distinction conclusively diagnosed.
- A legitimate authenticated read-only live probe at 16:17:16.513 UTC returned valid JSON for selected-status reads (200, 661 ms) and refused empty approval (400, 134 ms). The existing client helper accepted this ordinary JSON response. No question write or paid check occurred.

Therefore, add immediate response delivery and periodic progress while keeping one existing server-side session/budget. This is cheaper and narrower than a new background-job service, repeatedly funded per-question requests, or a new database workflow. Official hosting support: [streaming functions](https://vercel.com/docs/functions/streaming-functions), [function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration). Streaming does not remove the hosting duration limit; retain the earlier safe application deadline and treat its conclusion as a pause.

## Phase 2 — implementation and required tests

1. Keep the existing authenticated endpoint, approval helper, signed database admission and approved-only comparison. Retain ordinary JSON for existing callers and deletion. Add an explicitly requested progressive response for Speed approval.
2. Return the first progress record before corpus loading or a paid check. Send a small heartbeat every few seconds even while a provider response is slow. Run selected questions sequentially using one shared admission session and the same configured $0.50 budget, not one budget per question.
3. Emit confirmed per-question results, including duplicate/hold reasons and matching approved question details. The browser consumes records incrementally. Show checked/approved/repeat/unresolved/remaining counts and the question currently being checked.
4. A time/cost stop returns a normal paused result. Leave confirmed repeats unselected, select only unfinished rows for the next explicit Continue operation, and make the per-click cost cap visible. Allow selecting confirmed repeats for manual deletion; never select unresolved or unchecked rows as repeats.
5. A genuinely lost response retains results already received, then performs the existing single bounded status recovery. A pending status cannot recover a duplicate decision. No automatic approval retry or hidden new budget.
6. Preserve controls during work so editing, paging, pool switching or conversion cannot change the in-flight selection. Clear obsolete result labels when content or loaded rows change.
7. Test delayed first checks, progress before completion, arbitrary network chunk boundaries/Unicode, 200 selected rows with three or more saved then a deadline, repeated facts across new sessions, provider errors, lost final acknowledgements, no duplicate paid request, exact row labels and selection behavior. Use real existing SQL/concurrency tests and synthetic semantic providers. No paid pilot is authorized.
8. Add a bounded authenticated diagnostic that produces heartbeat/progress but reads/writes no questions and makes no provider calls. It must have a clearly separate diagnostic result, require admin auth, take no question IDs and have a fixed duration. Use it to prove the actual hosted transport beyond 30 seconds in Phase 3; do not confuse this with verifying live semantic accuracy.

No new schema, migration, cron, environment secret or external service is expected. If evidence shows streaming cannot survive the actual client path, stop and amend this plan around a concrete durable-work alternative. Do not bolt on unbudgeted automatic chunks. Build and test the alternative before asking for any new production-migration approval required by CLAUDE.md.

## Cost and performance constraints

Existing baseline: one browser approve POST per click, one corpus/index per server process, bounded deltas per saved row, up to $0.50 of checks for the entire click; four-minute checking window under the existing five-minute hosting limit. Current failed requests need one extra selected-status recovery read.

The proposed change adds no normal extra database read, approval request, paid comparison, retry allowance or whole-bank scan. A four-minute run adds about 48 tiny five-second heartbeats. Per-question result messages should be bounded; estimate roughly 100 KB/run including progress and final results, versus one final JSON body today. At ten runs/day: about 1 MB/day, 30 MB/month; at 100/day: about 10 MB/day, 300 MB/month. Real transferred bytes will be measured by the free hosted connection probe and sample synthetic run. Actual hosting billing change is unmeasured, but duration and paid-check cap are unchanged. No polling, fan-out or scheduled work is added. Diagnostic calls are manual and bounded, not recurring.

Do not automatically consume an additional $0.50 to finish a large selection. A safe pause must say that an explicit Continue click is another capped operation. Andrew declined a $225 whole-backlog audit; that remains declined. No new paid reproduction or provider cap is approved.

## Phase 3 — release gates

- Isolate release from the dirty root's unapplied subject-variety migration/runtime. Start from current origin/main and preserve all root work.
- Required local checks: focused new tests, full Vitest, `npx tsc --noEmit`, `npm run lint`, production build. Run typecheck before, not alongside, build.
- Use the authenticated, read-only diagnostic on the hosted preview to verify immediate delivery, continued heartbeats after 30 seconds and a clean final result. Use the real client parser, including browser execution if browser tooling is available. No fake approval counts or production question mutation.
- Publish only the exact passing release head under Andrew's existing manual-review publishing permission. Do not deploy root or apply the separate future migration.
- Verify both live domains resolve to the exact READY source; authenticated free diagnostic must also pass through the live URL. Keep unauthenticated approval/diagnostic/status refusals and no-cache headers.
- Record what the live diagnostic proves and what remains unmeasured. Positive paid semantic behavior is covered by existing synthetic/provider/SQL tests and the user-initiated path; do not describe a free transport test as a paid-provider success.
- After a normal user approval, compare elapsed time, result counts and existing cost accounting to the baseline using count-only evidence. Do not initiate paid processing to obtain measurements.
- Write detailed handoffs for each completed/stopped phase and update this status before claiming that phase complete.
