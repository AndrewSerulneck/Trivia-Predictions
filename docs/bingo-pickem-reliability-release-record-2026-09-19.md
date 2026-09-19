# Bingo and Pick ’Em reliability — release record

Date: 2026-09-19. Status: **developer-accepted for merge to `main`**.

Andrew confirmed authenticated Prop Bingo works after the schema migration and closed the plan.
Physical-device layout and live-game latency observation remain optional operational monitoring rather
than release blockers.

## Release identity and scope

- Branch: `main`.
- Base HEAD: `783ebd2f07bffef05e086ef0687ec53f99377dbc` (`Prop Bingo NFL Phase 2:
  game-day re-verification, blockers cleared`).
- Candidate commit: none. Phases 0–7 remain uncommitted and unpushed in the shared dirty tree.
- Deployment URL/ID: none for this candidate. Last recorded old deployment is
  `dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv` from commit
  `d282bd35decbadbbf6d5924477361f6b82fe4e01`; it is not this release.
- Production data changes: none. Phase 6 historical reconciliation was intentionally skipped by
  Andrew; the original stored Brunswick Grove result remains unchanged.
- Database prerequisite: `supabase/migrations/20260914010000_bingo_atomic_grading.sql` was applied
  with Andrew's authorization to linked Supabase project `pkmxupsayzshvpirkaav` at
  `2026-09-19T23:48Z`. A follow-up dry-run reported `upToDate: true`; a zero-row column query and a
  nonexistent-card service-role RPC probe verified `grading_state` and
  `apply_sports_bingo_grading` without changing a card. Application deployment remains pending.

## Automated release gates

| Gate | Result on 2026-09-19 |
|---|---|
| `npx tsc --noEmit` | Pass when run alone after build |
| `npm run lint` | Pass; only Babel's >500KB `lib/sportsBingo.ts` note |
| `npm run test:bingo-nfl -- --silent` | 22 files, 288 tests pass |
| `npm run test:bingo-mlb -- --silent` | 11 files, 142 tests pass |
| Focused Bingo selectors/routes/recovery/quality | 15 files, 238 tests pass |
| Focused Pick ’Em/NFL selector/routes | 11 files pass, one environment-gated file skipped; 136 pass, 13 skip |
| `npm run test:pwa-contract -- --silent` | 20 tests pass |
| `npm run test -- --silent` | 249 files pass, one skipped; 2,620 tests pass, 13 skip, zero fail |
| `npm run build` | Pass; Next 16.1.6, 179 pages, no deployment |
| Incident replay | Pass; 25/25, 11 hit/14 miss, winning third column, one preserved label dispute |
| Isolated PostgreSQL/PGlite | Pass; migration, 25-cell batch, guards, atomic rejection, competing transitions, notification, terminal and service-role checks |

The 13 skipped cases are all in `tests/api.nfl-pickem.test.ts` and require their external integration
environment. The active unit and route coverage for those paths passed. Two harness problems were
fixed without weakening assertions: `tests/lib.nfl-pickem-game-fetch.test.ts` now freezes its default
clock before the historical Week 1 fixture kickoff, and
`tests/lib.sportsBingo.nfl-flavor-squares.test.ts` uses a fixed random sample while retaining its
exact 25/25 requirement.

Do not run `npx tsc --noEmit` concurrently with `npm run build`: Next removes/regenerates `.next/types`
during the build, which produces transient TS6053 missing-file errors. Sequential typecheck passed.

## Authorized schema application

At 2026-09-19T23:48Z Andrew authorized the linked-project migration. The exact sequence was:

```sh
npx supabase db push --dry-run
npx supabase db push
npx supabase db push --dry-run
```

The first dry-run listed only `20260914010000_bingo_atomic_grading.sql`; the push applied only that
migration; the final dry-run returned `upToDate: true` with no pending migrations. A service-role
PostgREST probe selected `grading_state` with a zero-row limit and invoked
`apply_sports_bingo_grading` for the nil UUID. It returned `{ "applied": false }`, proving the function
exists and writes nothing for a nonexistent card. No secret value was displayed.

## Read-only provider and local-server evidence

- `npm run bingo:validate:nfl -- --seasons 2026 --weeks 1`: pass over 16 completed games. The play
  walk reproduced 16/16 final scores, quarter columns summed correctly for 16/16, and first-TD
  scorer parsing succeeded 16/16. This one-week smoke sample is not a calibration set: notably,
  fourth-down conversion realized 50% against the shipped 83% price, non-offensive touchdown 12.5%
  against 26%, and 50+ yard touchdown 25% against 34%. Monitor multiple weeks before retuning.
- `npm run bingo:simulate`: pass at `2026-09-19T19:03:15.762Z`. WNBA produced eight unlocked boards,
  predicted mean 25.76%, 100% in the 20–30% band. MLB produced 56 unlocked boards, predicted mean
  26.14%, 100% in band. NBA and NFL returned zero games in the current local-day creation window.
  Four WNBA and four MLB generation attempts correctly rejected already-started games. WNBA lineup
  calls returned provider 404 and degraded to empty input as logged.
- `npm run dev -- --port 3017`: Next/Turbopack became ready in 746ms. Unauthenticated requests to
  `/bingo/select-sport`, `/nfl-pickem` and `/pickem` all returned the expected 307 auth redirect.
  Authenticated UI rendering was not exercised. A later localhost API probe was blocked by the
  execution approval quota, not by an application response.

The first sandboxed provider request failed DNS (`ENOTFOUND api.balldontlie.io`); rerunning the
read-only commands with approved network access produced the results above. No credential value was
read or printed.

## Non-blocking operational follow-up

The implementation has been accepted. These observations remain useful after release but do not keep
the plan open:

1. **Application commit and deployment — owner: Andrew/release operator.** The migration is complete.
   Review and commit the dirty tree, then deploy the exact reviewed commit. Record the commit,
   deployment URL/ID, timestamp and flag state in the Phase 7 handoff.
2. **Authenticated selector/UI review — owner: Andrew/release operator.** Verify standalone Bingo and
   `CreateBoardSheet` on desktop and narrow mobile, regular Pick ’Em without football, and dedicated
   NFL week selection/history. Automated component/route/PWA tests pass, but no authenticated browser
   session was available here.
3. **Physical device/PWA — owner: Andrew.** Check the NFL week popup anchor, scrolling, keyboard/focus
   where applicable, iOS/Android browser chrome, landscape and installed-PWA behavior.
4. **Live delivery — owner: release operator.** Observe one NFL game (one-minute cron path) and one
   NBA/WNBA/MLB game (webhook path) through live → final → delayed-data recovery. Record provider,
   sweep/webhook, database and visible-client timestamps, final convergence and void/error counts.
5. **Availability boundaries — owner: release operator.** On the deployed candidate, verify league
   visibility immediately before/after kickoff and across the player's local midnight, then inspect
   aggregate grading/void/error logs.
6. **NFL calibration — owner: product/release operator.** Accumulate current-season prop-rich boards
   and multiple completed weeks. Do not infer a new rate from the 16-game Week 1 integrity sample.

## Deployment and rollback sequence

1. Create and review a single candidate commit from the current dirty tree; rerun the gates above.
2. Confirm `npx supabase db push --dry-run` remains up to date; do not reapply or down-migrate the
   already-applied atomic-grading migration.
3. Deploy that exact commit and record its URL/ID. Run authenticated selector/create-board smoke tests.
4. If the application fails, roll the application back to the prior deployment. The additive column
   and service-only RPC may remain unused; do not attempt a destructive database down-migration during
   an incident.
5. The application intentionally has no non-atomic fallback. If schema verification ever fails,
   stop board creation and investigate instead of bypassing the RPC.
