# Copy and three-question publication — 2026-10-24

Andrew explicitly requested batching, committing and publishing the `/info` copy, Partner
Dashboard copy, three added trivia questions and the Group Games terminology plan. The three
content commits are pushed to `origin/main`; production serves their exact final source on both
`hightopchallenge.com` and `play.hightopchallenge.com`. The three questions are active in the live
bank. Unfinished partner messaging, native/POS work, moved assets and unrelated dirty work are
excluded. No further publishing permission is needed for this completed release.

## Commit grouping and application deployment

| Commit | Scope |
| --- | --- |
| `8b0ea5114a210dd3cb330e6d39ec6eb334d466f7` | Group Games terminology, dashboard headings, related player/settings/manual/email copy, responsive spacing fix, existing tests and plan/handoffs |
| `fced3b9c6c7dbb986646807fdcfbc239f14ca8e9` | Remaining `/info` signup/marketing/pricing copy, Explore link and matching existing test update; correct `gamese` typo and remove the stray blank pricing-list line |
| `e095b546b264fb02350666b430337b3a4df0a767` | Exactly three appended Sports Live Trivia question objects, all previous objects unchanged |

Application source: **`e095b546b264fb02350666b430337b3a4df0a767`**. Production deployment:
**`dpl_963x3ij1uoLwvUYdT9zETpcrjAkF`**, **READY**, project
`prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, URL
`https://hightop-challenge-2ino7yzrz-andrewserulnecks-projects.vercel.app`.
Deployment metadata confirms the exact GitHub source SHA. Both custom domains resolve to this
deployment, checked **2026-10-24 around 18:43 UTC / 2:43 PM Eastern**. Later documentation-only
commits retain identical application/data source; these original application-deployment facts
remain dated evidence rather than a claim that future docs deployments have the same ID.

Previous production/source was `dpl_4PWJyM4KAUju9BLdgBwjKCCqrteD` /
`bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`. The isolated release worktree is
`/private/tmp/hightop-copy-release-2026-10-24`, branch
`release/group-games-copy-2026-10-24`; installed `node_modules` links to root. No `.env*` was
copied to it. Builds ran with `env -i`; database operations use the established Node env-file
loader without exposing secret values. Root unrelated edits were preserved.

## Validation and live copy

Final combined release: **5,504 passing tests / 13 environment skips, 445 passing suites /
1 skipped suite**, **27.87 s**; clean typecheck/lint and **217 generated static pages** in a
production build. The one-test difference from Phase 4's 5,505 is the intentional removal of the
old `/info` paragraph assertion alongside the requested paragraph removal. No test was removed
to hide a failure. The frozen Phase 4 record originally misstated the credential-free build page
count as 218; its original build log also shows 217 (the root build, with unrelated work, had 218).
The maintained records now distinguish these counts.

CI: **PASS**. GitHub run
[40121830217](https://github.com/AndrewSerulneck/Trivia-Predictions/actions/runs/40121830217).

Real Chromium checked the final local production build and both live domains at **350, 390 and
1280 × 900 px**: `/info`'s new copy, no `gamese` typo, the working `#overview` Explore link,
Active Group Games / Active Prizes and Schedule a group game. No marketing horizontal overflow.
Partner pages opened from `play.` follow the existing redirect to the apex; both domain paths were checked with that routing intact. An initial fixture run blocked that redirect; permitting the two official origins completed all three widths. Dashboard API data was intercepted with empty fixtures: this proves the deployed bundle's
rendered labels without logging in or sending production API mutations; it is not a real-partner
account walkthrough. The earlier 60-view fixture review remains in the Phase 4 record. Physical
phones/email clients remain unverified. Existing narrow-email overflow is unchanged.

Exact local gate commands, run from the isolated worktree:

```sh
npm run test
npx next typegen
npx --no-install tsc --noEmit
npm run lint
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 npm run build
```

## Three-question data release and the full-bank sync exception

Three canonical additions in `data/live-trivia/categories/sports.v1.json`:

| Slug | Answer | Live row ID | Zero-based source order |
| --- | --- | --- | ---: |
| `dwayne-johnson-college-football-team` | Miami Hurricanes | `eff8e169-2d46-49bc-b4c1-2f35ad85e7cd` | 429 |
| `terry-crews-professional-sport` | Football | `d8496ce7-2f5f-4e89-8c8b-e54529752289` | 430 |
| `ed-oneill-nfl-team` | Pittsburgh Steelers | `0341d784-18bb-472d-8bb2-465c58f886ab` | 431 |

Each row is `active`, `question_pool=live_showdown`, `answer_format=write_in`,
`source_file=sports.v1.json`; exact question text, options/accepted answers, canonical-answer
index and source order match the existing importer's normalized form. Read back verified at
**2026-10-24T18:42:14.517Z**. Live pool total **4,537 → 4,540**; active **3,451 → 3,454**.
All **4,537 existing** catalog rows retain their ID, slug, question, category, status, pool,
canonical-answer index and answer format. No existing question was overwritten or retired.
This comparison covers the selected fields; no whole-table byte-identical claim is made for
unselected metadata. No Speed question or game/session record was mutated.

Fact references: Johnson's [University of Miami appearance record](https://miamihurricanes.com/news/1999/10/25/205544515-2),
Crews's [Chargers career interview](https://www.chargers.com/video/terry-crews-reacts-to-his-nfl-career-more),
and O'Neill's Steelers signing as reported by [CBS Sports](https://www.cbssports.com/nfl/news/the-legend-of-al-bundy-and-the-time-the-steelers-actually-signed-ed-oneill/).

The existing automatic **Sync Live Trivia** run
[40121830224](https://github.com/AndrewSerulneck/Trivia-Predictions/actions/runs/40121830224)
**failed before importing** at validation:
`Row 1385 (history.v1.json): duplicate slug "sun-tzu-art-of-war".` This exact failure also
reproduces in the unmodified Phase 4 candidate, which lacks the three new questions. The existing
nine JSON files have 3,763 objects, 3,707 unique raw slugs, including 56 repeated-slug occurrences;
253 older unique canonical slugs were absent from production before this release. Do not silently
merge/delete questions, import that unrelated backlog, or repair the full-bank pipeline under
this release. That data cleanup remains separate work.

To meet the request without those unrelated effects, the **existing** importer ran with a
three-row `--file`, explicit Live Trivia pool/format, **no `--live-dir` and no pruning**. The file
was generated from the current canonical Sports JSON, adding only source metadata. It passed
validation first, then upserted **3/3**; no importer/workflow/migration code changed:

```sh
node scripts/import-trivia-questions.cjs --file /absolute/path/to/three-sports-questions.json --pool live_showdown --answer-format write_in --check
node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local scripts/import-trivia-questions.cjs --file /absolute/path/to/three-sports-questions.json --pool live_showdown --answer-format write_in
```

Do **not** rerun this import just to inspect the release. Read the rows instead. The normal
workflow is still blocked by the pre-existing duplicate; do not report every workflow as green.

## Cost, backups and reversal

No recurring requests, jobs, provider credits, push delivery, scheduling behavior or schema changes.
The normal whole-bank sync would attempt 19 upsert batches and bring in unrelated missing
questions if validation were repaired. The targeted operation instead performs one catalog load
and one three-row upsert. Measured fetch totals: **21 requests**, **1,429 uploaded JSON body
bytes**, **964,969 response-body bytes**; this includes the existing connectivity/count calls.
Counts exclude HTTP/TLS headers and are not a cloud invoice. No retries occurred. The preflight
read 4,537 rows in 10 bounded requests, **1,489,333 response JSON bytes**. One-time only; no
new daily/monthly recurring usage. Ten comparable manual additions would be about 210 requests /
9.65 MB of import-response payload at this bank size; there is no automatic repetition or fan-out.

Ignored evidence/backup/undo ledger:
`tmp/group-games-publication-2026-10-24/` in the root repository:

- `live-trivia-before.json`, `preflight-summary.json`: pre-import selected-field catalog backup;
  three requested slugs did not exist. No player/consequence data.
- `three-sports-questions.json`, `targeted-import.log`, `targeted-import-network.json`:
  exact input, 3/3 result and measured operation usage.
- `trivia-verification.json`, `undo-log.json`: exact inserted rows/IDs, verified fields, no prior
  target rows and proposed scoped undo instructions. **No undo was executed.**
- `live-trivia-check.log`, `baseline-live-trivia-check.log`, `sync-workflow-failure.log`:
  pre-existing full-bank failure evidence and failed CI step.
- `test.log`, `typecheck-final.log`, `lint.log`, `build.log`, `ci.json`, deployment/domain JSON
  and local/live browser screenshots/results: verification evidence, never secret values.

A code rollback reverts only the three content commits (and scoped release documentation),
preserving unrelated work. Database rollback is a **separate, explicit** operation: review the
three recorded IDs/slugs and current usage before soft-retiring them; do not delete records or
run a full-bank import/prune to undo this release. No backup restore/migration is needed.

## Handoff for the next agent

The requested copy and questions are published. Publication authorization is resolved. The
Group Games plan has no next implementation phase. Preserve unfinished root work and the
ignored backup/undo evidence. Do not reimport these questions, rewrite canonical files from
Supabase/history, repair duplicate slugs or re-run the unrelated backlog. The existing full-bank
sync failure and pre-existing email layout limits are the only documented maintenance issues
relevant here; ask for a separate scope before changing their data/layout. Use the Phase 4
handoff's implementation decisions and this record's newer publication/data facts.
