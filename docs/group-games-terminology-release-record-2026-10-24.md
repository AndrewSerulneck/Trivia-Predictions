# Group Games terminology — local release candidate, 2026-10-24

The terminology update is ready as one isolated candidate. The dashboard, schedule flow,
player status, notification settings, manual and new email copy agree. A small spacing fix keeps
the longer Category Blitz status clear of its artwork. Nothing is committed, pushed or deployed.
Existing email layouts still exceed narrow browser widths; this rename does not enlarge them.

## Candidate and publication boundary

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `main`; base/HEAD: `bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`.
- No staging, commit, push, merge, deployment or external store listing change in this phase.
- **Application patch:** [group-games-terminology-release.patch](group-games-terminology-release.patch),
  **28 files / 31,401 bytes**, SHA-256
  `22f7a396e39f91361f16c124403c04e2632e73a2f20b20df8d964499cdeb6694`.
- **Living-docs patch:** [group-games-terminology-living-docs.patch](group-games-terminology-living-docs.patch),
  **6 files / 22,883 bytes**, SHA-256
  `42112eeb46f6331778df7043d860a941b22a6c0c4eabaf39ce842e61a9185bca`.
- [Release manifest](group-games-terminology-release-manifest.json) records exact paths and
  SHA-256 of every candidate file. These patches exclude unrelated dirty work, including mixed
  hunks in `app/info/page.tsx`, `lib/ownerSheetParams.ts`, `CLAUDE.md` and the native checklist.
- Local assembled source: `tmp/group-games-phase-4/release/` (ignored). Created from `git archive`
  of the base plus only the reviewed changes; no `.git`, `.env*`, messaging additions, moved
  design assets or local trivia edits were copied. `node_modules` links to installed root dependencies.
- Plan/inventory, Phase 0–4 handoffs and this record are separate documentation artifacts; they
  are not embedded in the patches. Include them deliberately in a future scoped documentation commit.
- Publication requires a separate instruction. Do not deploy or stage the dirty root wholesale.

## Verification

Commands were run from the repository root, then on the isolated candidate. Installed dependencies:
Node **v24.19.0**; Next **16.1.6**; Chromium through the installed Playwright **1.61.1**.

| Gate | Result |
| --- | --- |
| Root `npm run test` | 5,524 pass / 1 fail / 13 skip; 445 suites pass, 1 fail, 1 skip; 28.38 s |
| Unchanged Bingo failing suite rerun | 12/12 pass, 3.39 s |
| Root `npx --no-install tsc --noEmit` | Pass |
| Root `npm run lint` | Pass; existing >500 KB Babel styling notice |
| Root `npm run build` | Pass; 218 static pages generated |
| Candidate full suite before spacing fix | 5,505 pass / 13 skip, 445 suites pass / 1 skip; 22.33 s |
| **Final candidate `npx --no-install vitest run`** | **5,505 pass / 13 skip, 445 suites pass / 1 skip; 27.32 s** |
| **Final candidate `npx --no-install tsc --noEmit`** | **Pass** |
| **Final candidate `npm run lint`** | **Pass** |
| **Final candidate `npm run build`** | **Pass, 218 static pages; credential-free environment** |
| `npm run email:preview` | Pass; sample data, no sending |
| Semantic review | 32 remaining old-phrase lines, all inventoried exclusions; admin metadata unchanged/component-free |
| Candidate patch whitespace/application | Checked against the exact base; no unrelated whitespace included |

The root failure was `tests/lib.sportsBingo.nfl-star-tilt.test.ts:362`, “puts stars on boards
materially more often than chance”: random star share **0.2916666666666667**, required **>0.3**.
That test, `lib/sportsBingo.ts` and `lib/sportsBingoNflStars.ts` are byte-identical to HEAD.
The immediate rerun and both candidate full runs passed. This is evidence of an unrelated
randomized test failure; it was not repaired or suppressed. Root and candidate totals differ
because the root includes unrelated unpublished work. No test assertion was removed to pass.

The candidate's first sandbox build failed fetching Bree Serif/Nunito (`ENOTFOUND
fonts.googleapis.com`). An approved network-enabled build then passed, with credentials removed
by `env -i`. No font mock, alternative font or application workaround was used. Root build uses
Next's normal automatic `.env.local` loading; no secret values were read or printed by the agent.

## Responsive and compatibility review

Real Chromium rendered the actual application in the isolated checkout, at **350, 390 and
1280 px**, height **900**, device scale **1**, locale `en-US`, timezone `America/New_York` and
fixed fixture time **2026-10-25T16:00:00Z**. This future time is a test clock, not a release date.
No `.env` files or inherited service credentials were available to that server. All browser
`/api/*` requests were intercepted; other origins were blocked. Fake native capability and a fake
push token exercised settings without a real device registration or send. Existing game fixtures
were reused from `scripts/theme-screenshots-fixtures.cjs`.

**60 distinct screenshots**, 20 scenarios at each width:

- Dashboard list, empty, error and section loading; both new headings, three-row limit, See all
  and add controls. The heading wraps without overlapping the add control or horizontal overflow.
- Schedule all, history, detail and creation; Live Trivia / Category Blitz names preserved.
- `/owner/schedule` redirects to the schedule sheet, `/owner/competitions` to Prizes, and
  `?sheet=rewards` opens Prizes and normalizes to `?sheet=prizes`.
- Partner Manual and exact new schedule heading.
- Admin desktop Live Trivia Schedules, including at phone widths, and the mobile Venues shell.
  The mobile allowlist is unchanged; no new Group Games navigation was added.
- Player Category Blitz status and LIVE badge, Live Trivia banner, native-style notification
  switches with Group games starting.
- Both email previews at the top and tour heading; all four welcome images decoded locally.

No app-screen document exceeded its viewport width. Zero captured page errors and zero external
browser requests occurred. Unknown unrelated feed/ads/config requests were fulfilled locally with
404 `{ok:false}`; none fell through to a real API. Aggregated logs include repeated exploratory
runs (242 GET / 15 POST interceptions), not a production traffic measurement. POSTs were fake
push-device registrations. No schedule/prize creation, message send or paid generation occurred.

### Spacing fix proven by glyph bounds

`components/venue/VenueGamesPanel.tsx` adds `pr-[5.5rem]` only to the active Category Blitz status
paragraph, reserving the existing corner artwork's width. No color/font token or game behavior changes.
Measured text-character rectangles intersecting that image's rectangle:

| Width | Original Live wording | Group wording before fix | Group wording after fix |
| --- | ---: | ---: | ---: |
| 350 | 0 | 2 | 0 |
| 390 | 0 | 0 | 0 |
| 1280 | 0 | 2 | 0 |

Paragraph height remains 48 px on both phones; at 1280 it wraps from 24 to 48 px. The existing
Category Blitz title/art placement is unchanged; the measured fix applies to the changed status.

### Email baseline exceptions (not rename regressions)

Both builders are unchanged. Baselines were reconstructed from the preview HTML by reversing
exactly the three email-copy edits shown in the application patch. Browser document widths are
identical before and after:

| Preview | 350 px viewport | 390 px viewport | 1280 px viewport |
| --- | ---: | ---: | ---: |
| Welcome | 370 px | 390 px | 1280 px |
| Venue added | 560 px | 560 px | 1280 px |

These are **existing browser-preview horizontal overflows**, especially the added-venue email's
fixed-width table. Do not call the emails fully responsive or claim an actual email-client/physical
phone pass. The new headings render and wrap; the rename does not increase the baseline widths.
An email-layout repair is separate work, not an unfinished rename phase.

## Semantic and cost review

- Group Games = Live Trivia + Category Blitz; game names, LIVE/Live now and actual sports remain.
- Schedule/upcoming and active-prize filters, three-row limits, API calls, preference keys, routes,
  hooks, IDs, RPCs, audiences, scheduling and push delivery are unchanged.
- TypeScript's printer with comments removed produced identical syntax for all 13 comment-only
  application files. Reviewed remaining edits are copy, the dashboard heading's removed `truncate`,
  existing copy assertions/snapshots and the status spacing fix.
- The 32 retained search matches concern sports/provider/capture evidence, running gameplay/TV
  sessions, or valid Offer Prizes teaching/action prose. See the reviewed inventory; no blanket ban.
- Root `git diff --check` still reports pre-existing trailing whitespace at `app/info/page.tsx:743`.
  The isolated patch uses HEAD plus the single marketing-copy substitution and excludes that line.
- Incremental DB reads/writes, provider calls, cron/jobs, retry/fan-out: **0 per load/run/day/month**
  at current and 10× traffic. No new asset bytes; a few text/class bytes differ. Existing request-count
  and seed tests pass. No release occurred, so live usage/performance comparison is unavailable.
- No migration, data mutation, backup or data undo log. Reversal is code-only and must preserve
  unrelated edits. Local review server was stopped after screenshots; no developer server was stopped.

## Reconstruct the candidate without the dirty root

Use a fresh checkout at the base SHA. The two patches use standard Git paths and apply without
an index operation; the manifest is the authority for their exact file contents.

```sh
git switch --detach bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a
git apply --check /absolute/path/to/docs/group-games-terminology-release.patch
git apply /absolute/path/to/docs/group-games-terminology-release.patch
git apply --check /absolute/path/to/docs/group-games-terminology-living-docs.patch
git apply /absolute/path/to/docs/group-games-terminology-living-docs.patch
npm run test
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

Run `git switch` **only in a separate clean checkout**, never this dirty root. On a later base,
review/rebase the patches and rerun affected gates. Do not treat a clean patch apply as permission
to publish. After authorized release, record the exact commit, deployment ID, domains and observed
live copy in this record, the Phase 4 handoff and context files. Roll back only the scoped commit(s).

Local evidence (ignored, useful on this machine but not required to understand the conclusions):
`tmp/group-games-phase-4/{entry-status.txt,entry.diff,test.log,bingo-rerun.log,typecheck.log,lint.log,
build.log,release-test-final.log,release-typecheck.log,release-lint.log,release-build.log,
release-build-network.log,remaining-matches.txt,semantic-review.log,review-report-final.json}`;
60 PNGs in the same directory. Ad hoc safe fixture runner: `review.cjs`; packaging helper:
`package.py`. These helpers are local evidence, not production source or a prerequisite for release.
