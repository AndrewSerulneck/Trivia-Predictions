# Speed Trivia bulk approval timeout — 2026-10-14

The 200-question request ran past the site's five-minute limit. Five questions
were approved before it stopped, and those approvals are saved. This repair
stops checking after four minutes, returns the saved results, and keeps unfinished
questions pending. If a response is lost, the page checks which selected questions
are already saved without automatically approving again. The checking budget stays
unchanged. At preparation, this repair is tested locally and awaits publication;
the local repository's release addendum records the final publication state.

## Handoff to the next agent

### Scope and developer decisions

Andrew reported `Unexpected token '<', "<html> <h"... is not valid JSON` after
approving 200 questions at `hightopchallenge.com/admin`, around 11:25 EDT on
2026-10-14. He previously authorized publication of the approved-only approval
change, which is live through PR #7 / main commit
`05ae101097623ff3c91254856a3f14f39b48c00c`.

This follow-up repairs that manual workflow. Do not expand paid audits, change
the $0.50 per-operation ceiling, add automatic repeated approval requests, or
remove semantic checks to speed things up. A pending question is not automatically
a repeat. Different facts about the same person remain eligible. New generation,
imports and edits still compare with the full fact bank; unchanged pending-to-active
manual approval compares only with already-approved questions across all batches.
Recognition of reworded facts remains fallible.

Andrew declined the Phase 3 proposal for a $225 backlog audit and chose manual
review. The next plan action is manual review or a separately requested low-cost
follow-up, not the previously proposed paid Phase 4 audit. The unapplied future
variety migration `20261014020000_speed_trivia_variety_review.sql` remains out of
scope. Never deploy the root workspace's future runtime ahead of that migration.

### Starting state and evidence

- Clean release worktree: `/private/tmp/speed-trivia-approval-release-2026-10-14`.
  Branch `fix/speed-trivia-bulk-timeout`, based on main
  `05ae101097623ff3c91254856a3f14f39b48c00c`. Only this narrow follow-up and routine
  generated sports references belong in its release.
- Root workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`, local
  main at `1932091e6bbe38ff2c3abae16bc677d396e63d61`, with substantial uncommitted
  Phase 1–3 variety work. Preserve it. Equivalent focused changes were applied
  there without replacing future queue or schema logic. Do not deploy root.
- Incident deployment: `dpl_qocmBBNTRMY8UXoeWSQNDJP5vYvk`, exact source SHA
  `05ae101097623ff3c91254856a3f14f39b48c00c`.
- Failed request: `t64cd-1791991241493-a7a67c428972`, POST
  `/api/admin/trivia/questions`, started `2026-10-14T15:20:41.493Z`, status 504.
  Vercel's actual message: `Vercel Runtime Timeout Error: Task timed out after 300 seconds`.
  Log metadata misleadingly calls the source `serverless-middleware`; it is the
  approval POST request. Initial finite logs showed status 0 until execution finished.
- A read-only SQL count of admissions between `15:20:41Z` and `15:26:00Z` found
  five active approvals, first `15:22:28.603882Z`, last `15:25:13.466682Z`.
  Andrew was told to refresh Review before continuing. These were user-initiated
  approvals; the agent ran no approval, deletion, paid question check or migration.
- Sanitized evidence: root ignored directory
  `tmp/speed-trivia-uniqueness-private/manual-approval-timeout-2026-10-14/incident-summary.json`.
  Raw finite CLI logs remain private under `/private/tmp/speed-trivia-approval-*-logs.jsonl`.
  No question-bank mutation or undo log was created by this repair.

### Root cause and implementation

The admission runtime's default time budget is 600 seconds, while the deployed
function allowed 300 seconds. The browser unconditionally parsed the hosting HTML
timeout page as JSON. Already committed approvals were not reconciled on parse or
network failure.

- `app/api/admin/trivia/questions/route.ts`: explicitly retains `maxDuration=300`;
  one manual Speed session gets at most 240,000 milliseconds measured from POST
  start. All questions and retries retain one existing dollar budget. The loop
  checks the deadline before the next item and returns normal JSON with confirmed
  `savedIds`, repeats, holds, and `notProcessed` on partial failure. Already-active
  selected rows are returned as saved without paid checking. Authenticated
  `action: "status"` returns only `id,status` for at most 200 selected IDs, optional
  pool restriction, with a ten-second database abort signal. It never writes.
- `lib/speedTriviaAdmission.ts`: `openSpeedTriviaAdmission({elapsedMs})` creates
  the same configured dollar budget before the local serialization queue; bounds
  both opening and individual writes with its deadline. Expired queued work checks
  time before starting. Existing non-bulk callers keep their normal defaults.
  Existing provider/database request cancellation and signed expiry still apply.
- `lib/triviaBulkAction.ts`: `runTriviaBulkAction` sends exactly one approve/delete
  POST. A lost/invalid response or operational failure triggers one bounded read-only
  status POST. It merges confirmed saves, never resubmits approval, never infers
  duplicates from pending status, and reports when status recovery itself failed.
  Recovery cannot reconstruct repeat decisions from an entirely lost response.
- `components/admin/sections/TriviaPendingReviewSection.tsx`: uses that helper,
  removes confirmed saved IDs, preserves remaining questions, clears selection on
  recovery so unfinished rows are not accidentally treated as confirmed repeats,
  and suppresses misleading zero-save counts if recovery could not confirm them.
  The button shows Working while busy; pool switching is disabled during work.
- Tests: `tests/api.admin.speed-trivia-review.test.ts` covers 200-item partial
  deadline, selected-status reads and already-active no-recheck behavior.
  `tests/lib.trivia-bulk-action.test.ts` covers HTML/network failure, five saved
  out of 200, lost post-commit acknowledgement, recovery failure, ordinary repeat
  results and deletion status. `tests/lib.speed-trivia-admission-deadline.test.ts`
  covers slow opening, expired queued work and pending individual writes.

No promise that all 200 questions finish in one click. They may require smaller
manual selections or multiple explicit operations. One timed-out database operation
can have an uncertain commit acknowledgement; the status read addresses this using
current stored state. If status cannot be read, the page asks for a refresh instead
of claiming nothing was saved. No automatic retries of a whole approval request.

### Costs and routine release maintenance

The incident confirms the pre-change baseline: one 200-ID approval request reached
300 seconds and saved five questions. Per-click paid-check ceiling stays $0.50,
including existing provider retries. No new paid calls were made to reproduce it.
The four-minute limit is lower than the existing hosting duration. Recovery adds
at most one request and one indexed read of 200 `id,status` rows per failed click,
roughly 12–16 KB of JSON; ordinary success/repeat results add no read. At ten
failed clicks/day this is at most 2,000 small rows/day, 60,000/month and roughly
5 MB/month. At 100/day: 20,000 rows/day, 600,000/month, roughly 50 MB/month.
Actual hosting/database billing change is unmeasured, but there is no new whole-bank
scan, background job or provider fan-out. Paid ceiling remains the existing
operation count × $0.50; no shared monthly cap was added and no new operation is
started automatically.

At about 15:01 UTC on this same date, the previously committed NFL/MLB reference
snapshots crossed their existing 14-day freshness limit. The first full suite found
four unrelated freshness failures; all approval tests passed. Standard existing
refresh scripts regenerated `data/sports-bingo/nfl-star-index.json` and
`data/sports-bingo/mlb-star-index.json` from current provider responses, not by
changing timestamps manually. No sports rules, boards or historical records changed.
NFL generation: `2026-10-14T15:34:29.633Z`, 1,452 current/1,828 prior input rows,
485/602 scored players. MLB: `15:34:29.938Z`, 1,773/1,792 input rows, 1,487/1,486
scored players. Existing scripts bound four season reads to 40 pages each, no
retries: at most 160 calls, measured row counts imply 70 pages at 100/page.
One-time transfer was unmeasured (estimate several MB); no recurring job or new
provider subscription was added. Keep these generated changes distinct in review.

### Build, tests and publishing

In the clean release worktree, with root dependencies installed and its `node_modules`
symlink pointing to root:

```sh
npx vitest run tests/api.admin.speed-trivia-review.test.ts tests/lib.trivia-bulk-action.test.ts tests/lib.speed-trivia-admission-deadline.test.ts tests/scripts.speed-trivia-approved-only.test.ts tests/scripts.speed-trivia-admission.test.ts
npx tsc --noEmit
npm run lint
npm test
```

For a production build, load the root environment internally in a parent process,
then spawn npm so Next workers do not inherit a relative `--env-file` flag:

```sh
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local -e 'const r=require("node:child_process").spawnSync("npm",["run","build"],{env:process.env,stdio:"inherit"});process.exit(r.status??1)'
```

Never print credentials or copy/overwrite `.env.local`. PGlite is installed locally
as a dev dependency and SQL fixtures make no production connections. Do not run
typecheck concurrently with build because Next regenerates `.next/types`.
At preparation: 39 focused approval/runtime tests pass; typecheck/lint pass; 202-page
build passes. Final full suite: 4,272 pass / 13 environment-gated skips,
363 passing files / one skipped file. The legitimate reference refresh resolved
all four unrelated freshness failures.
Read the release addendum for final exact totals, PR, commit and READY deployment.

For incident logs, finite `vercel logs ... --json` goes to a private file; do not
print raw logs. Inspect aliases independently and verify deployment git SHA via
the deployment REST API because CLI inspect alone omits source SHA. Project is
`prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`.
Unauthenticated status/approve POSTs must return 401 without checking questions.
Publishing permission already exists for this manual-review repair; do not re-ask
about the declined audit. Preserve the isolated release approach.

### Next steps and remaining uncertainty

1. Read the final publication addendum and plan's current status before any work.
2. Andrew can refresh Review and manually continue with smaller selections.
   Do not interpret unresolved or unfinished questions as duplicates to delete.
3. No paid live reproduction was run; the real slow-provider path is covered with
   synthetic responses, controlled deadlines and existing SQL/concurrency tests.
   Observe the next user-initiated request if another failure is reported; do not
   initiate an extra paid pilot or processing job.
4. Optional operational follow-up: count-only request durations, saved count and
   existing provider accounting, with no question/player content in logs. Actual
   billing change remains unmeasured until a normal operation runs.
5. No developer answer is needed to finish this repair. The future variety cutover
   and any new paid audit remain separately unauthorized. The original plan names
   Sol/high for Phase 3; no parallel agents were used or requested for this repair.
