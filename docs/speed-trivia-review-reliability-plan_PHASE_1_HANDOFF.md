# Reliable Speed Trivia review — Phase 1 handoff

The last repair did not make slow approvals reliable. Two later attempts started
recovery after about 30 seconds, even though the site allows five minutes. Ordinary
logged-in responses work. The next step is to deliver progress while checking,
show repeats beside the actual question and make time/cost stops normal pauses.
The replacement has not been built or published yet. No money was spent on AI
checking, no questions were changed and no answer is needed from Andrew for the
planned local build. The $225 backlog audit remains declined.

## To the Phase 2 agent

### Goal, scope and decisions

Read `docs/speed-trivia-review-reliability-plan.md`. Phase 2 builds and tests the
progressive manual-review workflow; Phase 3 publishes only after a free hosted
connection diagnostic survives beyond the observed 30 seconds. Intelligence:
Phase 1 High, Phase 2 Extra high, Phase 3 High; project settings Sol/high,
Sol/xhigh, Sol/high are sufficient. No delegation was requested or used.

Andrew explicitly wants a useful tool to compare pending questions with already
accepted questions. He is tired of repeated error messages and wants plain,
short explanations. He previously authorized the approved-only policy and
publication, rejected the expensive audit, and chose manual review. Preserve
those decisions; do not re-ask or resume the old audit.

Unchanged pending-to-active manual approval checks approved active questions
across all batches, with existing signed admission and semantic/factual checks.
New generation, imports, edits, restoration and undo keep full-bank/history
protection. Different facts about one subject remain valid. Unresolved or
unchecked is not a duplicate. Do not automatically delete any question.

One progressive click retains the existing whole-operation $0.50 ceiling,
including retries. Do not split 200 selected questions into 200 automatically
funded requests. Keep one server session, one budget and existing four-minute
checking deadline. Use incremental result delivery and tiny heartbeats, with a
normal pause and deliberate Continue for unfinished rows. A new explicit click
is another operation under the existing cap; disclose that clearly in the UI.
No promise that all 200 can complete within four minutes or $0.50.

No new background queue, polling, migration, provider subscription, cron or
environment secret is expected. If transport testing proves this approach
insufficient, amend the plan before expanding architecture or recurring cost.
A new production migration would require concrete separate approval after
implementation/testing under CLAUDE.md. Never silently reuse the unapplied
future variety migration to solve this operational repair.

### Starting state

- Root `/Users/andrewserulneck/Documents/Trivia-Predictions`: branch main,
  local HEAD `1932091e6bbe38ff2c3abae16bc677d396e63d61`; substantial uncommitted
  Phase 1–3 variety work plus mirrors of narrower already-published releases.
  Never reset, blanket-stage, pull over or deploy this workspace.
- Release worktree `/private/tmp/speed-trivia-approval-release-2026-10-14`:
  clean branch `fix/speed-trivia-progress-review`, HEAD
  `244ac0bb2d029c11ea150793ce2eab395f871f62`, created from origin/main.
  New branch has not been pushed; no implementation is modified there yet.
- Production currently runs that same main SHA, READY
  `dpl_Gut4nT9YNfkHtaWkspupDQKzy9kA`, Vercel project
  `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, team
  `team_uGVCpxcJGBQ1VdCDO0lSMRZf`. Both domains were independently verified
  in the preceding release at `2026-10-14T15:51:44.590Z`.
- PR #7 / main `05ae101097623ff3c91254856a3f14f39b48c00c` introduced approved-only
  scope. PR #8 / main `244ac0bb2d029c11ea150793ce2eab395f871f62` introduced
  four-minute deadline and read-only recovery, but subsequent user failures show
  this is still inadequate. Do not present the prior successful build as proof
  that the user workflow now works.
- Applied admission migration `20261013120000_speed_trivia_admission.sql` is
  immutable. Root future migration
  `20261014020000_speed_trivia_variety_review.sql` is NOT applied. Future subject
  metadata/prerequisite/ready-held runtime in root must not enter this release.
- No phase data mutation, backups, paid calls, undo or generation were performed.
  Five approvals recorded in the earlier 300-second incident were user-initiated,
  not agent processing. Old revision-2551 / 7,083-pending manifests are historical;
  do not assume the production bank remains at that revision/count.

### Evidence, facts and traps

Private evidence directory in root:
`tmp/speed-trivia-uniqueness-private/progressive-review-2026-10-14/`.
It contains `read-only-probe.json`. Raw finite log capture is private at
`/private/tmp/speed-trivia-approval-second-incident.jsonl`.

Later live request pairs on `hightopchallenge.com`:

- `rjw5d-1791993385157-eb2948c5e612`: approval POST, timestamp
  `2026-10-14T15:56:25.157Z`, status 503.
  `trsgt-1791993415282-965578c758e4`: recovery/status POST at
  `15:56:55.282Z`, status 200, 30.125 seconds later.
- `99ljl-1791994041509-a919c80ccc64`: approval POST at
  `2026-10-14T16:07:21.509Z`, status 409.
  `tb5mh-1791994071524-cba00262d84e`: recovery/status POST at
  `16:07:51.524Z`, status 200, 30.015 seconds later.

Logs contain no browser network exception or response body. They show when
recovery started, not which intermediary/browser imposed the limit or whether
it is idle versus total time. That remains an inference to test. The last
503/409 status is not another confirmed 300-second Vercel timeout. Do not claim
an exact network root cause without additional evidence.

At `2026-10-14T16:17:16.513Z`, the free authenticated probe returned:
selected-status POST 200/application-json/661 ms, empty approval POST
400/application-json/134 ms; actual existing client helper accepted the JSON
and did not show a false connection message. Status read used a nonexistent
fixture UUID, returning zero items. Empty approval was rejected before any
index opening, AI check or question write. Legitimate signed admin credentials
were loaded internally; neither credentials nor cookie were printed/stored.

Repository search found no global 30-second fetch wrapper/service worker in
this application. Gemini's comparison timeout is 55 seconds. The runtime's
ordinary default operation deadline is 600 seconds, but manual bulk already
has a 240-second limit under explicit hosting `maxDuration=300`.

Previous tests exercised synthetic HTML/network failures and correct status
recovery but did not test a real slow hosted response through the client parser.
That missing release gate is the central trap: adding another friendly error
message is not sufficient. Phase 3 must test a real authenticated hosted
connection with synthetic progress and zero paid calls/question changes.

### Current files and how they fit

- `app/api/admin/trivia/questions/route.ts`: authenticated GET lists pending
  questions; JSON POST approves/deletes up to 200 selected IDs or reads their
  `id,status` with `action=status`. One gate per approval request, shared budget,
  known `savedIds`, repeats, holds, unfinished IDs. Existing gate opening occurs
  before any response body is delivered; this needs the progressive path.
- `lib/speedTriviaAdmission.ts`: caches full/approved indexes and pairs;
  serializes process writes; `openSpeedTriviaAdmission({elapsedMs})` bounds
  opening and writes. `approveSpeedTrivia` narrowly enables approved-only scope.
- `lib/speed-trivia-uniqueness/runtime.cjs`: existing signed admission,
  revision/content/retirement checks, bounded deltas, shared budget and Gemini
  adjudication. Preserve policy, concurrency checks and paid defaults.
- `lib/triviaBulkAction.ts`: sends one approval/delete POST and waits for one
  JSON body; invalid/lost response or operational failure performs one bounded
  status POST. Current recovery can confirm saved statuses but cannot recover
  repeat reasons; client needs incremental records and per-row result retention.
- `components/admin/sections/TriviaPendingReviewSection.tsx`: selection and
  approval table. It removes confirmed saved IDs at the end and clears selection
  after recovery. It currently shows only a shared error/count, not exact repeat
  reasons beside their own rows. Add progress, row outcomes and unfinished-only
  continuation selection while preserving future root queue controls when mirroring.
- Tests to extend: `tests/api.admin.speed-trivia-review.test.ts`,
  `tests/lib.trivia-bulk-action.test.ts`,
  `tests/lib.speed-trivia-admission-deadline.test.ts`,
  `tests/scripts.speed-trivia-approved-only.test.ts`.
- New files this phase: `docs/speed-trivia-review-reliability-plan.md` and this
  handoff. Detailed prior release:
  `docs/speed-trivia-bulk-approval-timeout-2026-10-14.md`.

### Build/test commands and requirements

In the release worktree:

```sh
npx vitest run tests/api.admin.speed-trivia-review.test.ts tests/lib.trivia-bulk-action.test.ts tests/lib.speed-trivia-admission-deadline.test.ts tests/scripts.speed-trivia-approved-only.test.ts tests/scripts.speed-trivia-admission.test.ts
npx tsc --noEmit
npm run lint
npm test
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local -e 'const r=require("node:child_process").spawnSync("npm",["run","build"],{env:process.env,stdio:"inherit"});process.exit(r.status??1)'
```

Do not run typecheck concurrently with build. Worktree node_modules links to
root; PGlite 0.5.8 is installed. Keep worktrees outside repo/tmp because the root
TypeScript glob includes tmp. Never print/copy/overwrite `.env.local`; configured
secrets can be loaded internally with the established parent-process convention.

Baseline from the preceding release: 4,272 passing tests / 13 environment skips,
363 passing files / one skip; typecheck/lint/202-page build pass. No new application
code was changed in Phase 1, so those are baseline evidence, not rerun results.
Both final old CI runs 38591881335 / 38591891546 passed but did not verify slow
live transport. NFL/MLB references were legitimately regenerated on Oct 14 and
are not presently stale. Two old UI tests were repaired to await quote load and
idle animation; preserve those fixes.

Free live JSON probe command in root:

```sh
node --env-file=.env.local --conditions react-server --import tsx /private/tmp/speed-trivia-review-read-only-probe.ts
```

It prints only whitelisted statuses/timings and zero-paid/zero-write metadata.
It does not exercise a slow stream or real provider call; do not overstate it.
Hosting sources: https://vercel.com/docs/functions/streaming-functions and
https://vercel.com/docs/functions/configuring-functions/duration.

### Cost, open questions and recommended first steps

No new paid cap, provider switch, audit or migration is authorized. One progressive
request keeps one existing capped budget. Estimate roughly 100 KB of bounded
progress records per run: 30 MB/month at ten runs/day, 300 MB/month at 100/day;
actual bytes must be measured during the free diagnostic. Send per-row deltas
and counts, not repeated cumulative arrays that would make transfer quadratic.
No extra normal bank read/polling/provider call should be introduced.

Unknown: exact browser/intermediary cutoff, actual user selection sizes in the
second failure, and actual provider spend after release. None prevents the local
progress build. Do not demand screenshots or ask Andrew to approve cost increases.
The free hosted diagnostic is required before a replacement is described as live
and verified. A subsequent normal paid user operation is needed to observe real
semantic latency; do not run an extra paid pilot merely to manufacture that proof.

First: implement the server/client progress protocol and exact row outcomes in
the clean worktree, mirror focused changes into root without replacing future
schema/queue logic, run the meaningful failure tests and write Phase 2 handoff.
Then execute the free hosted gate before publishing the exact passing head.
