# Reliable Speed Trivia review — Phase 2 handoff

The review page now shows progress while questions are checked, puts repeat reasons
and matching approved questions beside each affected row, and treats the checking
limit as a normal pause. Continue selects only unchecked questions and visibly
starts another operation capped at $0.50. Received results survive a lost response.
This is built and tested locally, **not published**. The free local production-server
diagnostic lasted 45 seconds with regular progress and no question or AI operations.
Phase 3 must still prove the actual hosted connection and publish the isolated release.
Nothing is waiting on Andrew for that planned phase; the expensive backlog audit
remains declined.

## To the Phase 3 agent

### Goal, scope and resolved decisions

Read `docs/speed-trivia-review-reliability-plan.md` and the Phase 1 handoff. Phase 3
uses the fixed, free authenticated diagnostic on an independently verified preview,
then publishes only the passing isolated release and verifies both live domains and
exact source. Recommended intelligence: **High / Sol-high**. Phase 2 used Extra high
reasoning without delegation. No provider model or price was changed.

Andrew authorized approved-only unchanged pending→active manual approval and its
publication, chose manual Question Review, and declined the $225 bank audit. Do not
re-ask those decisions. This turn requested **Phase 2 only**, so no preview, push,
PR, production deployment or hosted diagnostic was performed here. Phase 3 is next.

Preserve the existing signed admission, database revision/concurrency checks,
retired fact memory and full-bank/history protection for edits, generation, imports,
restoration and undo. Approved-only scope applies solely to unchanged pending
manual approvals, across batches and later requests. Different facts sharing an
answer remain valid. Unresolved/unchecked is never labeled a repeat. Deletion
remains an explicit separate user action; no automatic deletion or approval retry.

One progressive request uses one shared admission budget and sequential selected
rows. Configured normal operation ceiling remains $0.50 including retries, with a
240-second application deadline and a 300-second hosting maximum. Continue is an
explicit additional capped operation, never automatic replenishment or per-row
funding. No paid pilot/audit, migration, cron, secret or new external service.

### Starting state, commits, publication and data

- Release worktree: `/private/tmp/speed-trivia-approval-release-2026-10-14`.
  Branch `fix/speed-trivia-progress-review`.
- Last commit **`0adebd3f516b10d97a9eb100d3c91e1759e85d3d`** adds strict timing
  gates to the free probe. Implementation commit
  **`abca1e1fdce21257a86314ddd3ff3f79704b1d79`** contains the endpoint,
  transport/parser, UI, cancellation, probe and tests (18 files).
- Base is live release `244ac0bb2d029c11ea150793ce2eab395f871f62`.
  All application/test/probe changes are committed **locally only**. No push,
  new PR, preview or deployment occurred. The plan, copied Phase 1 handoff,
  this Phase 2 handoff and updated AGENTS.md/SYSTEM_CONTEXT.md are deliberately
  left uncommitted in the release worktree for the Phase 3 documentation commit.
  Inspect/stage those five documentation files explicitly; never blanket-stage root.
- Root `/Users/andrewserulneck/Documents/Trivia-Predictions`: branch `main`,
  HEAD `1932091e6bbe38ff2c3abae16bc677d396e63d61`. Existing substantial
  uncommitted future variety/runtime/schema work remains. Phase 2 is mirrored
  there without overwriting its ready/held/unverified queue or prerequisite checks.
  Root was not committed, pushed or deployed. Never deploy or reset it.
- Last independently verified production state remains Phase 1's main
  `244ac0bb2d029c11ea150793ce2eab395f871f62`, READY
  `dpl_Gut4nT9YNfkHtaWkspupDQKzy9kA`, Vercel project
  `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, team
  `team_uGVCpxcJGBQ1VdCDO0lSMRZf`; both domains verified
  `2026-10-14T15:51:44.590Z` in the prior release. Production was not queried
  again during Phase 2; do not claim its current deployment independently verified.
- Applied migration `20261013120000_speed_trivia_admission.sql` is untouched.
  Root future `20261014020000_speed_trivia_variety_review.sql` remains unapplied
  and excluded from release. No schema change was created/applied.
- Agent question mutations, paid provider checks, production bank reads, backups,
  undo logs and generation in this phase: **zero**. The diagnostic authenticates
  using configured signed admin credentials internally; it neither accesses the
  question bank nor invokes any provider. No credential/cookie was printed or stored.
  Current production question counts/revision are unknown and not inferred from
  historical manifests. All SQL writes below occur only in disposable PGlite fixtures.

### Files and implementation

- `types/triviaReview.ts`: explicit review versus diagnostic protocol, row outcomes,
  approved-match details, counts and final/recovery/paused result types.
- `lib/triviaReviewTransport.ts`: `triviaReviewStream` synchronously enqueues a
  start record before selected-row/corpus loading, emits tiny five-second heartbeats,
  clears timers and propagates request/reader cancellation. NDJSON, UTF-8,
  `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no`.
- `app/api/admin/trivia/questions/route.ts`: explicit `progressive: true` opt-in
  is restricted to Speed approval with at most 200 IDs. Existing ordinary JSON
  approval/deletion/status callers retain their behavior. All responses, including
  auth and status refusals, now have no-cache headers.
- `lib/triviaReviewApproval.ts`: `runProgressiveTriviaApproval` performs one
  bounded selected-row read, opens one admission gate, and checks IDs sequentially
  in requested order. Sends current question, confirmed approval/repeat/unresolved
  deltas, reasons and at most three active approved matches from the existing index.
  No match lookup query or repeated whole-bank read was added. Budget/time stops
  conclude with `ok: true, paused: true`; ambiguous save acknowledgements request
  the existing single bounded status recovery. Provider failures preserve earlier
  results and distinguish the current unresolved row from later unchecked rows.
- `lib/triviaReviewParser.ts`: `consumeTriviaReviewStream` incrementally decodes
  arbitrary byte/chunk boundaries, including split Unicode. Validates framing,
  types and mode, requires an explicit terminal record, and bounds accepted data
  (4 MB per record / 8 MB per response). Diagnostic data cannot approve questions.
- `lib/triviaBulkAction.ts`: opts Speed approval into progress, preserves received
  row outcomes on malformed/truncated/network failures, then runs at most one
  selected-ID status read with a 12-second client deadline (server read 10 seconds).
  Saved statuses override conflicting earlier labels. Pending status never invents
  a duplicate or duplicate reason. No second approval or new paid budget is sent.
- `lib/speedTriviaAdmission.ts`: accepts optional cancellation signal and exposes
  the latest fresh write index/corpus for precise match details, without another
  refresh. The wrapper still serializes writes and shares the same budget.
- `lib/speed-trivia-uniqueness/runtime.cjs`, its `.d.cts` declaration and
  `types/speedTriviaAdmission.ts`: optional abort signal participates in budget
  limits, RPC/provider cancellation and queued-work checks. Candidate evidence
  can turn a provider error into a conservative hold, so `budget.assertTime()`
  after candidate checking preserves authoritative cancellation/deadline meaning.
  Late in-flight results remain consumed, avoiding unhandled rejections. A
  database write already in flight may have committed; read-only recovery exists
  for that ambiguity. No claim that disconnect can undo a committed write.
- `components/admin/sections/TriviaPendingReviewSection.tsx`: immediate saved-row
  removal, live checked/approved/repeat/unresolved/remaining counts, current question,
  row-specific labels and matching approved answers. A disabled fieldset locks
  selection, tabs, category, paging, editing, conversion/export during work; a ref
  prevents duplicate clicks before rerender. Only unchecked IDs are selected after
  a confirmed pause. Select Confirmed Repeats selects only labeled repeat rows for
  deliberate deletion. Lost/unconfirmed response requires refresh before another
  approval. Reload/edit clears obsolete labels.
- `app/api/admin/trivia/review-diagnostic/route.ts`: admin-authenticated POST of
  exactly `{}`, fixed **45,000 ms**, `maxDuration=60`, same progress transport.
  Rejects IDs, durations, arrays and unauthorized calls. Distinct
  `diagnostic_complete` with zero question reads/writes/provider calls.
- `scripts/probe-speed-trivia-review-transport.ts`: actual client parser on a
  fixed diagnostic fetch, signed admin cookie held only in memory, no redirects,
  65-second client timeout. Prints timings/byte counts only. Requires first record
  ≤5 seconds, maximum observed record gap ≤10 seconds, heartbeat after 30 seconds,
  total ≥40 seconds, no-cache and clean diagnostic completion. Verify your own
  preview origin before passing it to this authenticated script.

Tests added: `tests/api.admin.speed-trivia-progress.test.ts` (10),
`tests/lib.trivia-review-stream.test.ts` (11), and
`tests/components.trivia-pending-progress.test.ts` (4). Extended
`tests/lib.speed-trivia-admission-deadline.test.ts` (5) and
`tests/scripts.speed-trivia-approved-only.test.ts` (6 in release / 10 in root).
They cover delayed opening/provider checks, partial 200-row deadlines, one shared
$0.50 budget, exact repeats/holds, Unicode/chunk framing, delivery before final,
lost final acknowledgement/recovery, no approval retry, safe UI selection/controls,
new-session repeat protection, SQL competing approvals and cancelled delayed checks.

### Results and exact commands

Release worktree final gates: **4,300 tests pass / 13 environment skips**, 366
passing files / one skipped file; typecheck and lint pass; production build
**203/203 pages**, including the new diagnostic route. Isolated SQL: **26 admission
checks** with queued competing transactions and **16 retirement/undo checks**, all
pass. Root mirror: **4,371 pass / 13 skips**, 369 passing files / one skipped file;
root typecheck/lint and focused mirrored tests pass. No root build/deploy was run.

```sh
cd /private/tmp/speed-trivia-approval-release-2026-10-14
npx vitest run tests/api.admin.speed-trivia-progress.test.ts tests/lib.trivia-review-stream.test.ts tests/components.trivia-pending-progress.test.ts tests/api.admin.speed-trivia-review.test.ts tests/lib.trivia-bulk-action.test.ts tests/lib.speed-trivia-admission-deadline.test.ts tests/scripts.speed-trivia-approved-only.test.ts tests/scripts.speed-trivia-admission.test.ts
npm test
node scripts/test-speed-trivia-admission-sql.cjs
SPEED_TRIVIA_PGLITE_MODULE=node_modules/@electric-sql/pglite node scripts/test-speed-trivia-retirement-sql.cjs
npx tsc --noEmit
npm run lint
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local -e 'const r=require("node:child_process").spawnSync("npm",["run","build"],{env:process.env,stdio:"inherit"});process.exit(r.status??1)'
```

The worktree uses root's linked node_modules; PGlite 0.5.8 is available. Do not run
its typecheck concurrently with its build, since Next regenerates `.next/types`.
Load secrets internally using the parent-process env-file convention; never
print, copy or overwrite `.env.local`. Keep worktrees outside root's tmp to avoid
its broad TypeScript glob. Local lint's Babel large-file note for sportsBingo.ts
is informational, not a failure.

**Real local production-server diagnostic, completed before 2026-10-14T16:45:15Z:**
HTTP 200, first parsed record **50 ms**, maximum inter-record gap **5,003 ms**,
**8** heartbeats, heartbeat arrivals at **35,051 / 40,054 ms**, terminal arrival
**45,046 ms**, total **45,048 ms**, transferred **483 bytes**. Server terminal
elapsed 45,001 ms; zero question reads/writes/provider calls. Actual parser ran
through HTTP on `http://127.0.0.1:3098`. The final probe's added first/gap thresholds
were separately checked against every recorded arrival; they pass. The production
server was stopped with SIGINT afterward. This proves local HTTP framing/timing,
**not hosted preview/live transport or paid semantic provider accuracy**.

Local server/probe commands (start server in one terminal, probe in another):

```sh
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local -e 'const r=require("node:child_process").spawnSync("npm",["run","start","--","--hostname","127.0.0.1","--port","3098"],{env:process.env,stdio:"inherit"});process.exit(r.status??1)'
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local --conditions react-server --import tsx scripts/probe-speed-trivia-review-transport.ts http://127.0.0.1:3098
```

For Phase 3, replace the origin with the exact independently verified preview,
then each live domain. Inspect unauthenticated diagnostic/approval/status refusals
and no-cache headers separately. Playwright is installed: use a genuine browser
execution of this same parser on the hosted stream if browser tooling is available,
without submitting an approval or inventing approval counts.

Ignored evidence preserved in root at
`tmp/speed-trivia-uniqueness-private/progressive-review-2026-10-14/phase-2/`:
release/root full test logs, release build/lint logs, root lint/focused logs and
`local-transport.jsonl`. No private evidence or player/consequence data is committed.

### Traps, permissions and cost

Root future schema differs from release. Mirrored root SQL tests retain both
`variety=false/true`; their second-session fixture uses the existing explicit
`prerequisitesChecked: !variety` test arrangement. Root cancellation SQL fixture
uses its isolated future schema, while release fixture uses the applied schema.
This is test setup only: root's production prerequisite guard was **not weakened**.
Do not copy root runtime, queue or migrations into the narrow release.

The initial sandbox denied local socket binding and Git index.lock writes.
Automatic review approved loopback-only server/probe and scoped local release
commits. No automatic-review rejection remains; no user permission is pending.
These approvals are not authorization to publish root or mutate production data.
The probe emits only whitelisted counts/timings; no signed cookie/credential output.

A complete synthetic **200-approved-row** stream transferred **40,387 bytes**;
fixture performs no paid calls. Real repeats/long reasons add bytes, so retain the
plan's conservative **~100 KB/run** planning allowance: ~1 MB/day and 30 MB/month
at ten manual runs/day; ~10 MB/day and 300 MB/month at 100/day. The 45-second
local diagnostic transferred 483 bytes. At most about 48 tiny heartbeats occur
in a four-minute review. No normal extra bank scan, paid request, fan-out, polling,
retry allowance or schedule was added. Failed/ambiguous requests retain the
existing one selected-status recovery read. Duration and whole-operation paid cap
are unchanged. Hosting billing and actual user-run semantic latency/spend remain
unmeasured; compare count-only evidence after a normal user-initiated operation.
Do not run paid processing simply to collect those measurements.

### Open questions and first steps

No implementation question needs Andrew. The exact intermediary/browser cause of
the old approximately 30-second losses remains unproven. Local success does not
resolve that unknown. The required hosted diagnostic is the next release gate.

1. Inspect the isolated branch and its five pending documentation files. Commit
   those files only; preserve the dirty root and ignored evidence.
2. Prepare a preview of this exact release branch and run free hosted diagnostic
   with the real parser; verify immediate and regular delivery beyond 30 seconds.
   If transport fails, stop publication and amend the plan for a concrete durable
   alternative before considering a migration or recurring cost increase.
3. Follow Phase 3's local/online release gates and existing publishing permission.
   Publish only the passing isolated head; verify both live domains and exact
   READY source, then authenticated free live diagnostics and auth refusals.
4. Record hosted results, exact commit/deploy IDs and limitations in a Phase 3
   handoff and update the plan/AGENTS.md/SYSTEM_CONTEXT.md. Wait for a normal user
   approval to measure real semantic behavior; do not initiate a paid pilot.

Platform references consulted:
[Vercel streaming](https://vercel.com/docs/functions/streaming-functions) and
[Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).
Streaming retains function-duration limits; the hosted test remains essential.
