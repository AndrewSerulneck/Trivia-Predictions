# Bingo and Pick ’Em reliability plan — Phase 5 handoff

## Developer summary

Phase 5 is complete locally as of September 19, 2026. Bingo boards now reject unsupported,
duplicate and non-composable selections; no player can own more than two cells. Rich NFL boards keep
the intended 10 core / 6 special / 8 prop mix, use at least six players and both teams, and have at
least three chances to move before the final whistle. Thin boards no longer replace missing props
with a wall of specials: NFL specials are capped at six.

The deterministic 300-board historical NFL sample improved from 16% to 22% realized wins, and its
unknown square rate fell from 14.21% to 7.24%. The point estimate is inside the 20–30% target, but
this is still a prop-free historical sample; current prop-rich multi-week observation remains open
for release. NFL, MLB, typecheck, lint, build, the incident replay and isolated database checks pass.
The only full-suite failures are the same six date-sensitive dedicated Pick ’Em tests inherited from
Phase 4. Nothing is committed, pushed, deployed or repaired in production.

Phase 6 is next: prepare a reviewable, default-dry-run repair for the original Brunswick Grove board
and its consequences. The stored lost card is unchanged and no authorization to mutate production
has been given.

## Next agent: goal, scope and exclusions

Execute **Phase 6 — Reconcile affected boards and rewards safely** in
`docs/bingo-pickem-reliability-plan.md`. Recommended model: **GPT-6 Astra (`gpt-6-astra`), Extra
High**.

Start with only Brunswick Grove/game **1392216** and the exact original card identified below. Use
the Phase 1 protected before-state and Phase 4 verified grader to produce a read-only before/after
report. Quantify square changes, winning lines, card result, points, leaderboard/challenge effects,
reward claim state and notifications. Then prepare a bounded repair tool that defaults to dry-run,
requires explicit IDs for apply, checks expected versions/rows, is idempotent, logs an undo record,
and has a verified restore path. Test repeated apply, concurrency, unrelated-venue isolation and
terminal won/lost behavior in fixtures or isolated PostgreSQL.

Explicitly out of scope: broad production cohort repair without demonstrated defect predicates;
automatic terminal-card reopening in the ordinary sweep; silently changing stored labels/resolvers;
clawing back claimed rewards; production migration/repair/deployment without separate authorization;
new square families; and Phase 7 release/device/live-provider certification.

## Starting repository, commit, deployment and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch `main`; HEAD
  **`783ebd2f07bffef05e086ef0687ec53f99377dbc`**, subject
  `Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`.
- All Phase 0–5 work is **uncommitted and unpushed** in one dirty working tree. Preserve all existing
  modifications and untracked files; do not reset, clean or selectively revert earlier phases.
- Nothing from this plan is deployed. No production database row, board, square, point, reward,
  notification, feature flag, environment value or deployment alias changed in Phase 5.
- `supabase/migrations/20260914010000_bingo_atomic_grading.sql` remains local and unapplied. The new
  sweep requires it and fails closed without it. Production migration and application rollout need
  separate authorization; do not use `supabase db push` as a test.
- Existing production cadence evidence still describes the old deployment
  `dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`, source commit
  `d282bd35decbadbbf6d5924477361f6b82fe4e01`. Phase 5 did not re-query or modify deployment state.
- Protected production evidence remains under ignored `tmp/bingo-incident-private/`, including
  `2026-09-12T21-50-36-367Z/`. Never commit player/consequence records. No repair undo log exists
  because no repair has run.
- The production build loaded the project's existing `.env.local` through Next. No secret value was
  inspected or printed. `lib/supabaseAdmin.ts`, `vercel.json` and existing migrations were not edited.
- Build may regenerate `next-env.d.ts`; it was not an intended Phase 5 change and is not dirty at
  this handoff.

## Decisions already made — do not re-ask

1. Phase 4 capability admission remains absolute. Odds are not grading evidence; no unsafe family
   was restored to satisfy variety or calibration.
2. A generated board is one FREE plus exactly 24 supported non-free cells. Shared availability now
   uses the same composability preflight; a game that cannot form 24 quality cells is unavailable.
3. Player identity uses the verified provider ID embedded in `Display Name::<id>`, with normalized
   name only as the legacy fallback. Maximum is two selected cells per player across all leagues and
   player resolver families.
4. Alternate thresholds/directions for the same player's same stat are one diversity axis. MLB prop
   aliases and webhook event phrasing also collapse to one axis. This prevents contradictory player
   pairs and duplicate factory phrasing.
5. Core spread/total/team-total ladder thresholds deliberately remain distinct. The calibrated
   10/6/8 NFL mix and board correlation model rely on those rungs; impossible combinations remain
   excluded from each winning line by the established arranger. Redesigning core ladders requires
   separate correlation evidence.
6. Rich NFL boards retain **10 core / 6 special / 8 props**. Eight props require at least six
   distinct subjects when the pool has six, both teams when team metadata permits, and no player
   above two. NFL special and prop buckets are hard-capped at six and eight respectively.
7. NFL boards require at least three safe early-progress resolvers. The classifier follows shipped
   settlement semantics and is conservative; it does not infer availability from labels.
8. Thin NFL boards do not flood specials. Missing prop slots backfill from supported core ladders;
   if constraints leave fewer than 24 cells, Phase 2 hides the game.
9. The 20–30% target remains the aggregate selection objective, not permission to manufacture
   missing stats or admit unsupported props. The seeded thin NFL sample has 277/300 boards in the
   ideal band, predicted mean 25.698%, and realized rate 22.0%. Per-board outliers are documented.
10. Predicted and realized rates remain separate. Current prop-rich multi-week results, installed
    mobile/PWA review and live first-resolution timing are Phase 7 observation, not claimed complete.
11. Phase 4 recovery decisions still apply: missing is not zero; 60-second final confirmation,
    two-hour delayed-final grace, 48-hour no-final deadline; terminal correction only through the
    reviewed Phase 6 repair path.
12. The original “3+ punts downed inside the 20” label/resolver dispute is preserved. Phase 6 must
    present it rather than silently rewriting either interpretation.

## Phase 5 files and integration points

### Runtime

- `lib/sportsBingoQuality.ts` — new quality contract:
  - numeric constants for 24 non-free cells, two/player, eight NFL props, six NFL specials, six NFL
    prop subjects and three early-progress cells;
  - `bingoResolverPlayerKey` uses provider IDs first;
  - `bingoCandidateDiversityAxis` canonicalizes player prop/achievement aliases;
  - `isBingoEarlyProgressResolver` mirrors safe early settlement families;
  - `auditSportsBingoBoardQuality` returns eligibility, issue codes and measured mix/label metrics;
  - `hasComposableSportsBingoCandidatePool` performs deterministic availability preflight using
    unique axes, per-player axis caps and distinct early axes.
- `lib/sportsBingo.ts` — `pickCandidateSet` now applies shared player/axis limits, reserves six NFL
  prop subjects and the second team, caps NFL props/specials at 8/6, and emits selected-board quality
  telemetry. `generateBoardForGame` rejects ineligible attempts. `listSportsBingoGames`, the sync
  archived-board seam and normal generation all inherit composability. Resolver-returning builders
  now retain `bucket` and `teamHint` for audit. The public pure NFL grader exposes diagnostic reasons.
- `buildSportsBingoBoardFromBallDontLieGame` has a **test-only** `qualityMode: "legacy-audit"` used
  by the paired offline artifact. Normal application callers cannot select it and default to enforced.
- `package.json` adds `bingo:audit:phase5`, which uses no env file, network or database.

### Evidence and tests

- `scripts/audit-bingo-phase5.cjs` — deterministic paired before/after replay across 12 checked-in
  real 2025 NFL games, 25 boards/game, seed `0x5eed2026`. Records probability, outcomes/reasons,
  Wilson interval, bucket mix, quality metrics and readable labels.
- `docs/phase5-artifacts/nfl-calibration-2026-09-19.json` — machine-readable 300-board result.
- `docs/bingo-board-quality-calibration-2026-09-19.md` — enforced targets, all-league sample sizes,
  rates/uncertainty, labels/mobile review and limitations.
- `tests/lib.sportsBingo.phase5-quality.test.ts` — five pure regressions for valid composition,
  duplicates/near-duplicates, unsupported kinds, player monopoly, team/subject floors, early pacing
  and preflight failure.
- `tests/lib.sportsBingo.nfl-prop-mix.test.ts` — provider players now carry real-shaped team objects;
  12 seeded rich boards require exactly eight props, six subjects, both teams, max two/player and
  early movement.
- `tests/lib.sportsBingo.win-rate-calibration.test.ts` — deterministic seed and diagnostic reasons;
  300-board historical acceptance now records the genuine 22% result and 7.236% unknowns. Hook
  timeout is 30 seconds because the six-special cap makes the 180-attempt search slower in a thin pool.
- `tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts` — deterministic seed and zero-unknown
  assertion across 156 boards.
- `tests/lib.sportsBingo.board-feasibility.test.ts` — four seeded resolver-returning boards each for
  NBA and WNBA, capability/axis/player audit plus all 12 winning-line feasibility checks.
- `tests/lib.sportsBingo.nfl-star-tilt.test.ts` and `tests/lib.sportsBingo.mlb-star-tilt.test.ts` —
  preserve Phase 4 snapshots as before-state, prove Phase 5 selection changed them, and replay the
  new seeded stream byte-identically. NFL flat-weight expectation accounts for the six-subject/team
  reservations while still proving material star lift.
- `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md` and the plan now point to this handoff and Phase 6.

## Measurements, facts and traps

### NFL historical paired sample

- Before Phase 5: predicted mean **25.594%**, range 20.08–29.92%; realized **48/300 = 16.0%**,
  Wilson 95% **12.29–20.57%**; **1,023/7,200 = 14.208%** unknown; specials 6–14, mean 10.067.
- Phase 5: predicted mean **25.698%**, range 14.72–35.60%; **277/300** in ideal band; realized
  **66/300 = 22.0%**, Wilson 95% **17.68–27.03%**; estimator error 3.698 points;
  **521/7,200 = 7.236%** unknown; exactly six specials; 12–19 early cells, mean 15.77.
- All 300 Phase 5 boards have zero duplicate keys, zero repeated player axes, zero unsupported cells
  and exactly 24 non-free cells.
- This fixture is prop-free because historical player-prop odds are unavailable. Its player-stat
  fixture deliberately drops all-zero rows. Most remaining voids are required player stats, passer
  position and kicker completeness. Never zero-fill them.

### Rich and cross-league samples

- Seeded rich NFL, 12 boards: eight props; six or seven subjects; both teams; max two/player;
  12–18 early cells; max label length 44–59. It is scheduled/current-shaped, not settled, so no
  realized/void claim is made.
- Seeded MLB, 156 boards/13 real games: predicted 20.08–29.88%, mean 25.743%; realized 50/156 =
  32.051%, Wilson 95% 25.24–39.73%; zero unknown; team-event mean 7.833 cells. The historical fixture
  omits modern props, so longer observation remains appropriate.
- Seeded NBA, four boards: predicted 22.833–30.0%, mean 26.375%. Seeded thin WNBA, four boards:
  26.667–33.5%, mean 29.458%. All eight pass quality and line-feasibility checks. These are
  composition samples, not realized calibration.
- Injury/off-roster behavior remains covered by 12 NFL inactive tests: Out/Doubtful/IR and wrong-team
  IDs are excluded; Questionable remains; DNP at Final voids.
- Labels: full text is available via title, expanded creation review wraps full labels, landscape
  has no character cap and clamps four rendered lines, portrait remains intentionally compact.
  No authenticated browser, physical device or installed-PWA visual check was performed.

### Operational traps

- `console.info("[sportsBingo] board_quality", …)` is one line per selected board, not per attempt.
  Test commands without `--silent` are verbose by design.
- Thin NFL generation now searches longer because special candidates cannot occupy eight extra
  slots. The deterministic calibration takes about 10–14 seconds depending on suite concurrency.
- The paired legacy mode must never become a request/env toggle. It exists only on the offline sync
  helper so before/after uses the same code and seed.
- The six full-suite failures are unrelated, unchanged date-sensitive dedicated Pick ’Em tests in
  `tests/lib.nfl-pickem-game-fetch.test.ts`. Their 2026-09-13 kickoff fixture is now in the past, so
  the odds-refresh branch correctly does not run. Do not change NFL scoring or Bingo to make them pass.
- The working tree includes tracked `* 2.ts` duplicates from before Phase 5. Vitest does not include
  those by its pattern. Do not delete them as cleanup during Phase 6.
- Build uses Next/Webpack and may exceed 30 seconds; wait for the final route table before recording
  success.

## Verification commands and results

Run from repository root with existing dependencies:

```sh
cd /Users/andrewserulneck/Documents/Trivia-Predictions
npm run bingo:audit:phase5 -- --output docs/phase5-artifacts/nfl-calibration-2026-09-19.json
npm run test:bingo-nfl -- --silent
npm run test:bingo-mlb -- --silent
npx tsc --noEmit
npm run lint
npm run test -- --silent
npm run build
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct
BINGO_PGLITE_MODULE=../tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite node scripts/test-bingo-atomic-grading.cjs
git diff --check
```

Results on 2026-09-19:

| Check | Result |
|---|---|
| Phase 5 audit | Pass; 300 before + 300 after boards; artifact above |
| `test:bingo-nfl` | **22 files, 288 tests pass** |
| `test:bingo-mlb` | **11 files, 142 tests pass** |
| Typecheck | Pass |
| Full lint | Pass; only Babel's >500KB `sportsBingo.ts` note |
| Production build | Pass; 179 static pages generated; no deploy |
| Full Vitest | **248 files pass, 1 fails, 1 skipped; 2,614 tests pass, 6 fail, 13 skipped**. Only the six known date-sensitive Pick ’Em failures remain. |
| Incident replay | Pass; 25/25 expected, 11 hit/14 miss, winning third column, one preserved label dispute |
| Isolated PostgreSQL/PGlite | Pass; migration, full batch, guards, atomic rejection, concurrency, one notification, terminal isolation, service-only execution |
| `git diff --check` | Pass |

PGlite is currently installed only under ignored `tmp/bingo-phase4-pg/`. If absent, recreate with
the Phase 4 handoff's exact command; do not add it to project dependencies.

## Incident state and Phase 6 inputs

- Venue slug: `brunswick-grove`; provider game **1392216**; card
  **`314a6a4f-762f-499c-ac3a-9ddc2a3cd63a`**.
- New England at Seattle; kickoff **2026-09-10T00:20:00Z**; final Seattle 13–New England 10.
- Stored card remains lost: 18 void, six miss, one FREE hit. Verified outcome is 11 hit / 14 miss,
  winning indices **[2, 7, 12, 17, 22]**. Stored records have 21 discrepancies; direct replay has 0.
- Square 1's stored resolver (`punts_inside_20`) is a hit, but literal “downed” prose is a miss.
  It is not in the winning column. Keep the dispute explicit in dry-run output.
- Normal atomic grading RPC rejects terminal cards and does not repair points/rewards. Phase 6 needs
  a separate bounded mechanism with backups, expected-state guards, undo and consequence analysis.

## Open questions and recommended first steps

No developer answer is required to begin the read-only Phase 6 report/tool implementation.
Production apply remains unauthorized.

1. Re-read the plan's Phase 6, this handoff, Phase 4 handoff, incident audit, sanitized incident
   fixture and protected before-state. Confirm the exact card/venue/game identifiers before coding.
2. Inventory point, leaderboard, challenge, reward-claim and notification write paths. Determine the
   original card's concrete consequence state read-only; preserve a new protected snapshot.
3. Produce a default-dry-run report for this one card, including both resolver and literal-label
   treatment of square 1. Do not ask the developer to choose until both consequence totals are shown.
4. Implement explicit-ID apply/undo with row/version guards and idempotency; test twice and under a
   competing ordinary sweep in isolated PostgreSQL.
5. Identify broader cohorts separately using demonstrated resolver/data defects; do not fold them
   into the authorized target.
6. Before any production mutation, present the exact report, backup path, undo plan and unresolved
   claimed-reward decisions and request explicit authorization.
7. Write `docs/bingo-pickem-reliability-plan_PHASE_6_HANDOFF.md` even if Phase 6 stops awaiting that
   authorization.
