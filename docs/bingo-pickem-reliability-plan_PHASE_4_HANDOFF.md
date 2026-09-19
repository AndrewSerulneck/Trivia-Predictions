# Bingo and Pick ’Em reliability plan — Phase 4 handoff

## Developer summary

Phase 4 is implemented and verified locally, completed September 15, 2026. Bingo now admits only square families with tested grading inputs, keeps missing final data pending while retrying, corrects provisional results before settlement, and saves a whole board and its notification atomically. The original Brunswick Grove board replays correctly: **11 hits, 14 misses, and a winning third column**. Client refresh and the misleading six-hour loss display are fixed. None of this is deployed, and the original lost board has not been repaired.

Phase 5 is next: improve board variety and recalibrate the smaller verified pool. Two NFL calibration assertions currently fail and must remain visible. Build, typecheck, full lint, the 197-test focused verification set and the isolated PostgreSQL check pass. The full suite also has six date-sensitive dedicated Pick ’Em failures outside this phase. No decision or authorization is needed to start Phase 5. Deployment will require the new database migration first; production repair and deployment still require separate authorization in their later phases.

## Next agent: goal and scope

Execute **Phase 5 — Improve variety and live pacing using verified props** in `docs/bingo-pickem-reliability-plan.md`. Recommended model: **GPT-5.6 Sol (`gpt-5.6-sol`), High**. No automatic delegation or model change occurred in this run.

Preserve 25 cells / one FREE, the capability gate, truthful missing-data behavior and correction policy. Review the current NFL 10 core / 6 special / 8 prop mix, at most two squares per player, six distinct prop subjects on a full eight-prop board, both teams where possible, and three safe opportunities for early movement. These are Phase 5 review targets, not claims that Phase 4 enforces all of them. Preserve the 20–30% probability target and distinguish estimated rates from real outcomes. Games lacking 24 quality composable supported candidates should become unavailable through the existing Phase 2 path.

Out of scope: adding leagues/subscriptions, restoring unverified squares merely to meet variety targets, changing dedicated NFL Pick ’Em scoring, auth/billing, silently rewriting stored rules, historical board/reward repair (Phase 6), production migration/deployment/live certification (Phase 7). Do not reopen terminal cards with the ordinary sweep.

## Starting repository, deployment and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch `main`; HEAD **`783ebd2f07bffef05e086ef0687ec53f99377dbc`**, subject `Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`.
- All Phase 0–4 changes remain **uncommitted and unpushed**. Remote alignment was not checked. Preserve the dirty tree; no reset/clean/revert of earlier work. `docs/phase4-artifacts/working-tree-2026-09-15.txt` records the complete end-of-phase status, including earlier changes.
- No production migration, board/square mutation, reward/point adjustment, notification send, flag/environment edit, deploy, or alias change was performed. Build used Next's existing environment loading but no secret values were inspected or printed. `lib/supabaseAdmin.ts`, `vercel.json`, and existing migrations were not edited.
- New local-only migration: `supabase/migrations/20260914010000_bingo_atomic_grading.sql`. It is **not applied**. The new application sweep requires its RPC and intentionally fails closed if absent. Apply migration before application rollout, after explicit production authorization; do not run `supabase db push` as a test.
- Existing production cadence was checked read-only via Vercel logs: deployment **`dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`**, 15 HTTP-200 cron requests from **2026-09-14 02:33:08.389 UTC through 02:47:08.317 UTC**, intervals **59.671–60.182 seconds**. This is the old deployment, not this code. Prior Phase 1 metadata identifies its source as `d282bd35decbadbbf6d5924477361f6b82fe4e01`; it was not redeployed here.
- Raw Vercel output: ignored `tmp/bingo-incident-private/phase4-cron-logs.jsonl` and its stderr companion. Sanitized cadence: `docs/phase4-artifacts/bingo-cron-cadence.json`. Its `analyzedAt` is September 14 11:15 UTC; request times are the actual observed cadence window.
- Protected before-state evidence remains under ignored `tmp/bingo-incident-private/`, including Phase 1 capture directory `2026-09-12T21-50-36-367Z/`. No before-state snapshot was rewritten. No repair undo log exists because no repair was applied. Never commit private player/consequence records.
- `next-env.d.ts` may appear dirty after Next build/dev regenerates the routes import; it is generated tooling output, not an intended feature change. Do not confuse it with app implementation.

## Decisions already made — do not re-ask

1. Correctness precedes variety. The provider offering odds is not evidence that a rule can be graded. Admission is a typed allowlist with real captured field shapes and boundary tests; pregame box scores need not exist.
2. Keep database canonical sport keys unchanged. Normalize `nfl`/`nba` at Bingo read/dispatch boundaries and query both short and long aliases. WNBA/MLB keep their existing long keys. Do not edit the shared SQL canonicalization function.
3. Missing/partial statistics are not zero. NFL sparse null counters can be zero only with the complete bilateral stat contract. An absent player's zero requires final game-specific `did_not_play === false` plus exact game/team/player join and offense reconciliation. `active: true` does not prove the player entered the game.
4. Chosen recovery policy: **60 seconds between first final observation and terminal settlement; 2 hours of final-data grace; absolute 48-hour no-final deadline from scheduled start**. A retracted final signal resets confirmation. Missing cells stay pending during grace and become reasoned voids at expiration. A visible winning line alone does not finalize a card with pending evidence. This deliberately postpones reward claimability until confirmed final settlement.
5. Reevaluate all provisional cells on every active sweep. A correction may change hit → miss or miss → hit before terminal settlement. Once won/lost, use a reviewed explicit repair (Phase 6). `previewBingoCorrection` is a pure status-diff seam, not an apply tool or a reward reconciler.
6. Persist all 25 statuses, card state and transition notification in a single service-role-only RPC with row locks, expected revision, observation-order and expected-resolver guards. Existing reward claim/point paths remain unchanged; no points are issued by the new sweep.
7. Webhooks wake the shared snapshot grader. NBA/WNBA event payloads no longer directly grade cells, and MLB incremental event counters are no longer authoritative. NFL remains cron-driven; its existing live-stat animation broadcasts remain.
8. Preserve original labels/resolvers in historical evidence. New NFL punts say “finish inside the 20”; the saved “downed” label remains a dispute. New spread-keep-close labels describe winning or losing by less than the line, matching the existing one-sided arithmetic.
9. Phase 2/3 decisions stand: league visibility uses actual current-local-day boardability; regular Pick ’Em excludes NFL while dedicated `/nfl-pickem` remains; shared dropdown behavior and existing venue scoping remain.

## Files and how they fit together

### New runtime and migration files

- `lib/sportsBingoIdentity.ts`: `normalizeBingoSportKey`, `bingoSportKeyAliases` centralize historical/runtime key handling.
- `lib/sportsBingoCapabilities.ts`: `bingoResolverCapability`, `supportedBingoCandidates`, and explicit basketball/NFL/MLB metric/market allowlists. **37 typed kinds admitted including FREE**, 36 non-free; all other 37 typed kinds are legacy-only. NBA/WNBA each admit 10 kinds, NFL 32, MLB 12, including FREE and overlapping core kinds.
- `lib/sportsBingoSettlement.ts`: `planBingoSettlement`, recovery constants, `BingoGradingState`, `BingoEvaluation`, and read-only `previewBingoCorrection`.
- `supabase/migrations/20260914010000_bingo_atomic_grading.sql`: additive `sports_bingo_cards.grading_state` and `apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb)`. Locks card/cells, requires active status and exactly 25 distinct matching cells, rejects stale/order/resolver mismatches, keeps FREE hit, validates terminal completeness and winning marked cells, updates notification atomically. Execute revoked from PUBLIC/anon/authenticated and granted only to service_role; fixed search_path, existing RLS retained.

### Changed runtime files

- `lib/sportsBingo.ts`: aliases in `listCardRows`/`mapCardRow`, filtered catalogs and `pickCandidateSet`, strict stat builders, participation/identity/completeness checks before `evaluateResolverUnchecked`, verified NFL play evidence, fresh game-specific scores preferred over the shared score cache, box-score MLB event reconciliation, shared `gradeMlbEventCount`, and whole-board atomic `refreshSportsBingoProgress`. `evaluateResolver` adds diagnostic reason/retryability. The public pure NFL grader now accepts designation rows and completeness flags. `gradeResolversAgainstCompletedMLBGame` uses explicitly supplied complete historical team totals rather than pretending they are delivered webhook events.
- `lib/ballDontLieClient.ts`: failed/malformed/repeated-cursor/capped pagination returns no partial prefix; failure/truncation boxes propagate. Structured `[BallDontLie][feed_failure]` includes league/feed_family/reason/count without query strings or exception payloads.
- `lib/sportsBingoNflFlavor.ts`: cumulative yardage removed from monotone early-settlement fields; punt label fixed. Existing flavor factories still contain legacy templates; the central admission gate controls emitted catalogs/boards.
- `app/api/webhooks/balldontlie/route.ts`: removed private NBA direct-grading helper and normal MLB calls to `applyMlbWebhookPropEvent` / `applyMlbPlayerSnapshotEvent`; shared sweep performs grading. Fantasy and Pick ’Em paths remain. The old exported MLB helpers still exist for legacy callers/tests; do not reintroduce them into normal grading.
- `components/bingo/SportsBingoHome.tsx`: `card_updated` plus subscription/focus/online/visibility and 30-second visible read-only refresh; removed six-hour invented loss. `components/bingo/bingoBoardShared.tsx`: history trusts persisted server status; removed `BINGO_GAME_BUFFER_MS`.
- `app/api/bingo/leagues/route.ts`: fixed inherited Phase 2 build issue by making GET's Request argument required. Next rejected the default/optional Request signature even though earlier typecheck passed. Updated `tests/api.bingo.leagues.test.ts` callers with actual Requests.

### Tests, scripts and evidence

- `tests/lib.sportsBingo.phase4-capabilities.test.ts`: 136 cases covering all admitted kind families and parameter sets with real NFL/NBA/WNBA/MLB fixtures, explicit opposite/boundary/missing/partial variants; both scopes of NFL maxima are covered. NFL combined-stat admission is restricted to tested penalties/penalty_yards/turnovers.
- `tests/lib.sportsBingo.phase4-recovery.test.ts`: six policy tests for confirmation, late final data, grace/deadline edges, correction preview and retracted final.
- `tests/lib.sportsBingo.brunswick-incident.test.ts`: 12 tests; former Phase 1 expected failures now pass. Uses original persisted `nfl` in actual mocked sweeps, verifies 25 correct outcomes, partial → complete win, provisional wrong hit correction, grace-expired void reason, no 12-hour loss, delivery broadcast, one terminal notification, and no revisit of original lost state.
- `tests/helpers/bingoSupabaseDouble.ts`: simulates the atomic RPC's revision/order/resolver guards for app tests. Some legacy tests intentionally have fewer than 25 cells; this double permits those. The SQL test below verifies the real 25-cell requirement.
- `tests/helpers/bingoProviderFixtures.ts`: **synthetic** complete shapes for isolated rule tests, derived from captured field names; never apply this zero-filling helper to real historical calibration fixtures. Complete synthetic play fixtures explicitly include kickoff and matching final; selected old confidence tests re-chain captured fragments with explicit synthetic chronology/final scores.
- Updated existing missing-data, NFL settlement/confidence/flavor/inactive, WNBA/MLB row-shape, date-parameter, and history-stack tests for truthful unknowns, final grace, provider completeness and no client timeout. Several preexisting tracked `* 2.ts` duplicates received matching assertion updates; Vitest's include pattern does not run them. No duplicate files were removed.
- Updated NFL prop-mix assertions to require exclusion of unverified first-TD/play families. NFL/MLB star-tilt seeded snapshots were intentionally recaptured after capability filtering; they are now named `*_CAPABILITY_SNAPSHOT`. No calibration tolerance was changed. NBA player-prop/board-feasibility mocks now represent future scheduled games and assert retired triple-double exclusion.
- `scripts/replay-bingo-brunswick-incident.cjs`: offline/no env/no network/no DB; passes game-specific participation to the grader. `--assert-correct` rejects resolver discrepancies while separately reporting the preserved label dispute. Output: `docs/phase4-artifacts/brunswick-grove-incident-replay-2026-09-14.json`.
- `scripts/test-bingo-atomic-grading.cjs`: applies the actual original Bingo tables migration and new migration to isolated in-memory PGlite; checks atomic batches, resolver/version/order guards, competing transitions, exactly one notification, terminal isolation and grants. Minimal synthetic user/venue/auth/notification tables are local only.
- `docs/bingo-grading-capability-matrix.md`: new executable contract supersedes old Phase 1 tables but preserves historical evidence. Audit appended with local verification only. Plan, `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md` updated to verified local behavior and Phase 5 pointer.

## Incident facts and correction boundary

- Venue `brunswick-grove`, provider game **1392216**, card **`314a6a4f-762f-499c-ac3a-9ddc2a3cd63a`**.
- New England (team 1) at Seattle (team 31), kickoff **2026-09-10T00:20:00Z = September 9 20:20 EDT**, final Seattle 13–New England 10.
- Stored card is lost; original cells: 18 void, 6 miss, 1 FREE hit. Expected resolver outcomes: **11 hit / 14 miss**, winning indices **[2, 7, 12, 17, 22]**. Direct replay now has **0 resolver discrepancies**; stored records still have 21 discrepancies and were not changed.
- Elijah Arroyo **13874289** has no stat row but did play; exact designation plus reconciled offenses proves zero receptions, fixing square 17. Wrong game/team, unknown participation, DNP, missing fields, duplicate IDs or partial data do not prove zero.
- Square 1: the saved rule counts all punts inside 20 (hit); saved prose says “downed” (literal miss). The replay retains **one label dispute**; Phase 6 must explicitly present it. It is outside the winning third column.
- Normal RPC refuses terminal cards. Phase 6 must prepare explicit dry-run before/after statuses, lines, points/reward/claim consequences, expected-row guards, idempotency and undo/restore. Do not silently make `bypassCache` include won/lost boards or call ordinary sweep against production for diagnosis.

## Exact setup, commands and results

Run from repository root. Existing dependencies were installed. Versions: **Node v24.19.0, npm 11.17.0**, PGlite **0.5.8**. No package.json or lockfile change was made. PGlite was installed under ignored `tmp/` after network escalation was approved; raw npm output contains no credentials. Recreate only if missing:

```bash
cd /Users/andrewserulneck/Documents/Trivia-Predictions
npm install --prefix tmp/bingo-phase4-pg --no-save --package-lock=false @electric-sql/pglite@0.5.8
BINGO_PGLITE_MODULE=../tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite node scripts/test-bingo-atomic-grading.cjs
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct
npx vitest run tests/lib.sportsBingo.phase4-capabilities.test.ts tests/lib.sportsBingo.phase4-recovery.test.ts tests/lib.sportsBingo.brunswick-incident.test.ts tests/lib.sportsBingo.wnba-row-shape.test.ts tests/lib.sportsBingo.nfl-settlement-confidence.test.ts tests/components.bingo.historyStack.test.ts tests/lib.sportsBingo.board-feasibility.test.ts tests/lib.sportsBingo.player-props.test.ts
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl
npm run test:bingo-mlb
npm run test
npm run build
git diff --check
```

Results (September 14–15):

| Check | Result |
|---|---|
| Focused command above | **8 files, 197 tests pass**; includes all four leagues and UI history. |
| Direct incident replay | Pass; 25/25 expected, zero resolver discrepancies, one preserved label dispute. |
| Actual migration in isolated PostgreSQL/PGlite | Pass; schema, full batch, stale revision/order/resolver guards, atomic invalid payload, competing transition, one notification, terminal isolation, service-only grant. |
| Typecheck / full lint / production build | **Pass**. Lint emits only Babel's large-file note. Build initially caught the optional Request route signature, which was fixed before the passing build. |
| `test:bingo-mlb` | **11 files, 142 tests pass**. |
| `test:bingo-nfl` (September 15) | **21 files pass, 1 fails; 286 pass / 2 fail**. Both failures are in win-rate calibration, not the grading regression set. |
| Full `npm run test` (September 15) | **246 files pass, 2 fail, 1 skipped; 2606 tests pass, 8 fail, 13 skipped**. Six dedicated Pick ’Em date-sensitive failures plus the two NFL calibration failures. |
| `git diff --check` | Pass at completion. |

Logs are ignored in `tmp/`: `bingo-phase4-verified-final.log/.json`, `bingo-phase4-nfl-final.log`, `bingo-phase4-mlb.log`, `bingo-phase4-suite-final.log`, `bingo-phase4-typecheck-final.log`, `bingo-phase4-lint-full.log`, `bingo-phase4-build-final.log`. Sanitized durable summary is `docs/phase4-artifacts/validation-summary-2026-09-15.json`. Test counts overlap; do not sum them into a unique coverage count. Older interim logs include failures subsequently fixed.

### Remaining failures and limitations — not release-ready

- `tests/lib.sportsBingo.win-rate-calibration.test.ts` intentionally remains unchanged. Last NFL command: **46/300 realized wins (15.3333%)**, below existing >18% assertion; **1074/7200 ungraded cells (14.9167%)**, above existing <5%. Its 12 real 2025 games use trimmed player/team fixtures (including dropped all-zero rows), omit modern prop odds and lack the current full evidence contract. Earlier runs varied around 12–15% wins with unseeded randomness. Do not restore unknown fields as zero or widen thresholds to turn this green. Phase 5 should inventory missing evidence by family, capture complete appropriate current/historical data where available, then calibrate the supported pool and measure uncertainty.
- Six full-suite failures in unchanged `tests/lib.nfl-pickem-game-fetch.test.ts`: `fetches BallDontLie NFL spreads by season and week`; `pages the odds fetch well past the old 4-page cap, which truncated a full week`; `warns and still returns games when the odds fetch hits the page cap`; `upserts unlocked spread lines using the stored Pick 'Em game id`; `still refreshes lines for a spread-mode venue`; `refreshes lines when there is no venue context at all`. These use September 2026 kickoff dates while runtime time has advanced; two failed September 14 and six September 15. The test mocks the provider client and its production target was not changed in Phase 4. Treat date sensitivity as the investigation lead; do not modify NFL scoring to satisfy stale expectations.
- PGlite runs real PostgreSQL semantics on one embedded connection. Competing-call tests prove guards/idempotency, not multi-backend lock timing on deployed Supabase. Verify migration compatibility/concurrency in an isolated Supabase/Postgres environment before release.
- No authenticated browser/PWA/device visual certification, live provider-to-cell timing, webhook final-data convergence or post-deployment observation was performed. Phase 7 owns those checks. Historical cadence proves only existing invocation delivery. A final capture cannot establish what the provider had during the incident.
- Some legacy kinds and name-only resolvers retain old interpretation and are excluded from new boards. Reviewed repair must distinguish determinate fields from unverified legacy play/lineup/period evidence. Missing or unverified inputs may legitimately expire to void; do not claim all old boards automatically repair themselves.
- Normal grading retains earlier kickoff-window scratch replacement behavior. Historical terminal repair must not replace a resolver after learning its outcome. Phase 5 should review duplication/quality of preexisting scratch substitutes along with composition constraints.

## Recommended first steps / open questions

1. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, the plan's Phase 5, this handoff and the new matrix section; inspect dirty state first. Preserve earlier work and protected evidence.
2. Run the focused 197-test command and incident replay to establish a safe baseline. Do not spend time repeating the already understood full-suite date/calibration failures without a concrete change or new evidence.
3. Diagnose the historical NFL unknowns by resolver/field, and build seeded readable samples of the **admitted** pool across all leagues. Measure candidate feasibility, mix, per-player caps, team representation, early opportunities, duplicate/correlated pairs and labels before tuning probabilities.
4. Keep real data and synthetic boundary variants clearly separate. Missing quarter/player fields in old trimmed snapshots are not proof that the current provider contract is absent or safely zero. Collect only read-only data with the established runtime credential mechanism; never print secrets or commit private accounts.
5. Fix the two calibration failures with evidence or explicitly document longer observation requirements under Phase 5's acceptance criteria. Do not admit NFL plays, basketball achievement/period families, or MLB quick-outs to meet a quota without new captures/tests and matrix/admission updates.
6. Before concluding Phase 5, create `docs/bingo-pickem-reliability-plan_PHASE_5_HANDOFF.md`, update all current pointers, and retain the explicit Phase 6 historical repair and Phase 7 release boundaries.

No open developer question blocks Phase 5. Later concrete decisions: historical “downed” wording treatment if it changes a proposed repair; any already-claimed erroneous win consequences after quantification; authorization to apply the prepared migration/repair/deployment; real-device checks. Prepare reviewable artifacts before asking for those later approvals.
