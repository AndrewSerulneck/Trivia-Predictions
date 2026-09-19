# Bingo and Pick ’Em reliability plan

Created: 2026-09-12. Requested by Andrew Serulneck.

**Status: Complete and developer-accepted, 2026-09-19. Andrew confirmed authenticated Prop Bingo works after the atomic-grading migration and explicitly closed the plan. Phase 6 historical reconciliation was intentionally skipped; no past results will be repaired. All offline gates pass (2,620 tests, zero failures; NFL 288/288; MLB 142/142; build 179 pages), and the 16-game NFL provider validator passes. The additive migration is applied and verified on linked Supabase project `pkmxupsayzshvpirkaav`; no board/reward result was changed. Physical-device layout and real-game timing remain useful routine operational monitoring, not open phases or release blockers. Final handoff: [Phase 7](bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md). Release record: [2026-09-19](bingo-pickem-reliability-release-record-2026-09-19.md). Phase 6 decision: [skipped handoff](bingo-pickem-reliability-plan_PHASE_6_HANDOFF.md). Earlier handoffs: [Phase 5](bingo-pickem-reliability-plan_PHASE_5_HANDOFF.md), [Phase 4](bingo-pickem-reliability-plan_PHASE_4_HANDOFF.md), [Phase 3](bingo-pickem-reliability-plan_PHASE_3_HANDOFF.md), [Phase 2](bingo-pickem-reliability-plan_PHASE_2_HANDOFF.md), [Phase 1](bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md), [Phase 0](bingo-pickem-reliability-plan_PHASE_0_HANDOFF.md).**

This plan addresses league availability in Bingo, removing football from the regular Pick ’Em sports menu, matching the NFL week selector to the shared dropdown style, and making Bingo squares reliably gradable and interesting. Phases 0–1 changed no application behavior; Phases 2–5 changes are local only; Phase 6 was skipped; Phase 7 verified the local candidate and documentation. No phase has changed production data.

## Product decisions already made

1. A supported Bingo league appears in Create Board if and only if it has at least one game available for creating a board. No disabled empty leagues, season-calendar guesses, hardcoded NBA/WNBA exclusions, or static fallback lists. A league returns automatically when eligible games return.
2. For this plan, “available” follows the existing game chooser: a boardable game on the player's current local date that has not locked at kickoff. Keep the existing 36-hour upstream lookahead and local-day restriction; expanding the booking window is outside this request. Use the same timezone and predicate at every creation entry point.
3. The requested availability rule supersedes the old Bingo season/coming-soon presentation. Remove obsolete Bingo-specific season and NFL activation gates from normal creation eligibility as part of implementation; do not leave a hidden flag exception that contradicts decision 1. Do not change unrelated Fantasy or Pick ’Em availability behavior or edit environment values to achieve this.
4. Football disappears from the regular Pick ’Em selection menus. Dedicated `/nfl-pickem`, its week navigation, existing picks, settlement, rewards, history, and points remain supported.
5. Reuse the shared branded dropdown for NFL week selection. Preserve week IDs, ordering, dates, current-week marking, URL initialization, and existing locked-week viewing semantics.
6. Every generated non-free Bingo square needs a precise rule and a verified data-backed grading path. A provider returning odds for a prop does not prove it supplies the stats needed to settle that prop.
7. Missing evidence is not zero and not a loss. Correctness comes before variety or the target win rate. Unsupported families must leave new candidate pools; their legacy resolvers remain readable for existing boards.
8. Audit the actual Brunswick Grove test boards from Wednesday September 9, 2026. Newly generated sample boards cannot substitute for those records. Treat unavailable evidence explicitly as unknown.

## Model and effort choices

These are task-specific recommendations, checked against [OpenAI's Codex model guidance](https://learn.chatgpt.com/docs/models) on 2026-09-12. Astra is the strongest choice for difficult investigations; Sol suits complex implementation; Terra suits bounded changes. Effort names are the Codex settings (`medium`, `high`, `xhigh` = Extra High). Account availability may differ. These are recommendations for subsequent runs, not a claim that this conversation switches models automatically.

| Phase | Deliverable | Recommended model | Effort | Reason |
|---|---|---|---|---|
| 0 | Repository findings and this executable plan | GPT-6 Astra (`gpt-6-astra`) | High | Trace shared boundaries and prior evidence |
| 1 | Brunswick Grove incident audit and all-league grading inventory | GPT-6 Astra (`gpt-6-astra`) | Extra High | Reconstruct real results across provider data, stored boards, and settlement |
| 2 | Bingo leagues driven by actual game availability | GPT-5.6 Sol (`gpt-5.6-sol`) | High | Shared eligibility, caching, timezone, and API/UI consistency |
| 3 | Regular Pick ’Em menu and NFL dropdown fixes | GPT-5.6 Terra (`gpt-5.6-terra`) | Medium | Bounded UI changes using existing components |
| 4 | Reliable grading and generation capability checks | GPT-6 Astra (`gpt-6-astra`) | Extra High | Multi-sport correctness, partial feeds, finalization, and recovery |
| 5 | Interesting, varied, calibrated boards | GPT-5.6 Sol (`gpt-5.6-sol`) | High | Balance verified props, pacing, player variety, and correlation |
| 6 | Reconcile affected stored boards and results | GPT-6 Astra (`gpt-6-astra`) | Extra High | Idempotent repair with venue-scoped points and auditability |
| 7 | Integrated verification, release record, and final documentation | GPT-5.6 Sol (`gpt-5.6-sol`) | High | Cross-feature regressions, live evidence, and accurate handoff |

The original order was 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. On 2026-09-19 Andrew explicitly skipped Phase 6 because past boards/rewards do not need reconciliation, then directed Phase 7 execution. Phase 3's UI work did not depend technically on grading. No automatic subagent delegation is required.

## Phase 0 repository findings (historical planning baseline)

The following records what was known before the live read-only audit. Phase 1's [incident report](bingo-brunswick-grove-2026-09-09-audit.md) and [capability matrix](bingo-grading-capability-matrix.md) supply the recovered IDs, deployment evidence and grading findings.

- Starting branch: `main`; HEAD `783ebd2` (`Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`). Working tree was clean before this planning pass. Production deployment identity was not checked.
- `app/api/bingo/leagues/route.ts` reports a static catalog using season and NFL flags. `components/bingo/SportsBingoSelectSport.tsx` renders unavailable leagues and falls back to enabled NBA/WNBA/MLB options on request failure.
- `listSportsBingoGames` in `lib/sportsBingo.ts` already filters candidate count (at least 24), local day, and kickoff lock. `SportsBingoSelectGame.tsx` requests `includeLocked=false` and the browser timezone offset. The league endpoint does neither.
- `lib/leagueSeasonStatus.ts` consults a 14-day games signal, then calendar windows; that is not the board-creation rule. Its gate is called by Bingo games/cards routes. Audit all callers before changing it.
- The horizontal regular Pick ’Em menu is in `components/pickem/PickEmGameList.tsx`, fed by `/api/pickem/sports` → `listPickEmSports` in `lib/pickem.ts`. `PickEmSportSelect.tsx` is another discovery surface. NFL settlement is intertwined with shared Pick ’Em code: deleting NFL from the shared sport registry indiscriminately would be unsafe.
- `components/nfl-pickem/WeekSelector.tsx` uses a native `<select>` with literal colors. `components/ui/Dropdown.tsx` already renders a styled popup positioned below its trigger. Browser reproduction is still needed to confirm the reported placement problem and any ancestor clipping.
- Prior activation records identify NE @ SEA on September 9 as provider game **1392216**. Verify that ID against stored boards and provider data before treating it as the incident identifier. Brunswick Grove's venue ID and affected card IDs have not been queried.
- `docs/prop-bingo-nfl-activation-plan.md` has completed offline generation work but no completed Phase 5 live-observation record. Earlier “flag off” statements in `SYSTEM_CONTEXT.md` are historical documentation, not proof of today's configuration.
- `docs/prop-bingo-nfl-week1-audit.md` explicitly says historical player-prop odds were unavailable; its historical boards could not validate those prop slots. Existing 2025 backtests cannot close this incident.
- NFL grading is cron/poll driven, not an NFL BallDontLie webhook. `refreshSportsBingoProgress` scans active cards, skips most already-settled squares, and only reopens selected void resolver types. Investigate premature card finalization and permanently skipped incorrect results.
- No incident root cause, grading accuracy percentage, current game counts, or production repair is established by this planning pass.

## Phase 1 — Reconstruct the incident and inventory grading coverage

**Status: Complete, 2026-09-13. Model recommendation: GPT-6 Astra / Extra High. Handoff: [Phase 1](bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md).**

Recovered one original Brunswick Grove card and all 25 squares; independently established a winning column recorded as lost. Delivered protected snapshots, sanitized fixtures, offline sweep/grader reproductions, seven ranked findings and an inventory of all 74 typed resolver kinds (70 generated including FREE). Historical runtime/feed timing and client-display evidence remain unavailable; this is not a claim of complete live observation or an incident repair. See the [audit](bingo-brunswick-grove-2026-09-09-audit.md) and [matrix](bingo-grading-capability-matrix.md).

Goal: explain each square on the actual test boards and establish the coverage requirements for every supported Bingo league: NBA, WNBA, MLB, NFL. This phase is read-only against production.

1. Read `CLAUDE.md`, `AGENTS.md`, `SYSTEM_CONTEXT.md`, this plan, and Phase 0 handoff. Record branch, HEAD, deployment if accessible, and baseline focused test results.
2. Resolve Brunswick Grove by venue name, then confirm its venue ID. Query `sports_bingo_cards` and `sports_bingo_squares` for the venue, matching teams, provider game ID, and September 9 local game date. Include active, won, lost, void/replaced squares, and boards created before game day. Search a UTC window covering the ET evening rollover: September 9 20:20 EDT corresponds to September 10 00:20 UTC. Do not rely on card `created_at` alone or require `game_id` to equal a bare numeric string without checking stored normalization.
3. Save protected before-state snapshots and a sanitized incident report. Enumerate every affected card/square ID, original label/resolver, status/timestamp, free-space status, and card/points/reward consequences. Do not commit player identities or credentials; keep private repair backups separate from sanitized fixtures.
4. Retrieve paginated provider game, player stats, team stats, plays, roster/injury evidence, and surviving logs/snapshots. Record endpoint, game/team/player ID mapping, collection timestamp, pagination completeness, and whether each payload reflects live or final data. A final payload does not establish what was available during the game.
5. Produce a square-level reconciliation table: displayed rule, evidence, independently expected outcome, stored outcome, current-code replay outcome, first valid resolution point where knowable, and discrepancy category. Separate legitimate miss, wrong hit/miss, stuck pending, void, stale client display, absent input, and unsupported rule. Confirm expected outcomes using official box-score/play evidence rather than using the current grader as its own oracle.
6. Trace data fetch → normalization → `evaluateResolver` → progress sweep → square persistence → card finalization → client refresh. Inspect cron invocation/errors, cache TTL/invalidation, finalized signals, forced timeouts, play attribution, unavailable vs zero stats, injury handling, and resolved-square skipping. Preserve evidence before any repair.
7. Inventory every resolver family reachable from new board generation across all four leagues. Create `docs/bingo-grading-capability-matrix.md`: league/family, generator, exact required fields, supported provider endpoint/tier, identity joins, hit/miss/push rule, earliest safe resolution, overtime/period scope, missing-data policy, real fixture, coverage status, and keep/fix/retire decision. Distinguish generated families from legacy-only resolvers.
8. Create a replay harness/fixtures using the original stored resolver payloads. Keep replay offline and side-effect-free; do not invoke `refreshSportsBingoProgress` against production as a diagnostic because it writes.

Likely source files: `lib/sportsBingo.ts`, `lib/sportsBingoOdds.ts`, `lib/sportsBingoNflFlavor.ts`, `lib/sportsBingoNflInjuries.ts`, `lib/sportsBingoLiveEvents.ts`, `lib/ballDontLieClient.ts` (the actual shared Bingo client), `lib/webhooks/balldontlie.ts`, `app/api/cron/bingo-progress/route.ts`, `app/api/bingo/cards/route.ts`.

Deliverables: `docs/bingo-brunswick-grove-2026-09-09-audit.md`, capability matrix, sanitized fixtures, reproducible replay command, ranked defects with failing cases, and Phase 1 handoff.

**Done when:** every recovered incident square is accounted for, every generated family has a matrix row, and identified defects have reproducible evidence. If live access or historical evidence is missing, explicitly record the gap; do not call the incident resolved or claim a complete live audit. Continue independent UI work while that evidence remains pending.

## Phase 2 — Make Bingo availability consistent

**Status: Complete, 2026-09-13. Implemented and verified locally; not committed, pushed, or deployed. Model recommendation: GPT-5.6 Sol / High. Handoff: [Phase 2](bingo-pickem-reliability-plan_PHASE_2_HANDOFF.md).**

1. Establish one server-side creation-availability helper built on `listSportsBingoGames` and its boardability/day/lock rules. Use the shared supported-league catalog for iteration, not a hand-maintained season whitelist. When Phase 4 tightens candidate capability, availability must automatically inherit it.
2. Make `/api/bingo/leagues` return only leagues with a nonempty eligible game list for the supplied normalized timezone. Match `/api/bingo/games?includeLocked=false&tzOffsetMinutes=…`. Capture one evaluation time where practical to avoid internal boundary disagreement.
3. Remove obsolete season and NFL coming-soon gates from Bingo creation callers, including preview/squares/cards paths found by search. Preserve supported-sport validation and server-side kickoff checks. Existing-board viewing, history, and settlement must not depend on today's league availability.
4. Change `SportsBingoSelectSport` for both standalone routes and `CreateBoardSheet`: loading skeleton → available choices, successful-empty message, or retryable failure. Never restore static clickable leagues on errors. In partial provider failure, show verified available leagues and a concise retry message for incomplete availability; do not mislabel failure as “no games.”
5. Revalidate on reopening/resuming creation and relevant date/focus changes. Cache with bounded freshness keyed by sport and timezone/local date as needed; expire at the earliest eligibility boundary. Inspect `bingoPrefetchCache.ts`, `bingoSelectedGameCache.ts`, and catalog cache behavior. If a selected league loses its final game, clear stale selection and return safely to the chooser.
6. On preview/submit, revalidate the selected game server-side. A request started just before kickoff must not create a board after lock. Preserve readable messages for stale selection.

Verification: NBA/WNBA/NFL/MLB each hidden at zero and visible at one eligible game; no global-empty failure when one league fails; provider error distinct from empty; only locked/cancelled/final/unboardable games means no creation option; timezone/midnight and kickoff boundary; stale cache and direct URL; flag combinations cannot override available games; existing board resumes when its league has no new games.

Extend relevant `tests/api.bingo.leagues.test.ts`, `tests/api.bingo.games.test.ts`, `tests/api.bingo.cards.test.ts`, `tests/api.bingo.squares.test.ts`, and existing Bingo selector/cache tests. Test behavior, not source spelling. Benchmark provider request count and response time to avoid four redundant full catalog builds per click.

**Done when:** the visible league set equals the nonempty eligible-game set, including failure/boundary cases, for both creation hosts. Write Phase 2 handoff.

## Phase 3 — Fix both Pick ’Em selectors

**Status: Complete (2026-09-13), locally verified and not deployed. See [Phase 3 handoff](bingo-pickem-reliability-plan_PHASE_3_HANDOFF.md).**

Regular Pick ’Em:

- Trace all consumers of `listPickEmSports` and the shared sport definitions before choosing the narrowest discovery filter. Exclude NFL from the regular horizontal menu and alternate regular sport chooser. Keep NFL types/provider mappings used by settlement and the dedicated game.
- Ensure initial/fallback selection cannot become hidden NFL (including stale selection state). For an old regular `/pickem/nfl` entry, use a deliberate route to dedicated `/nfl-pickem` if that route is still reachable; preserve venue context and existing history access. Do not alter already-placed picks or scoring.

NFL week selector:

- Replace native `<select>` in `WeekSelector.tsx` with `components/ui/Dropdown.tsx`. Build option labels using existing `formatCalendarDate`; keep `week.label`, `(Now)`, IDs, order, and selection callback.
- Use existing `lib/themeTokens.ts`/Tailwind tokens and Nunito UI typography. Consult canonical `design-system/hightop-challenge-design-system/project/colors_and_type.css`; if a missing token is genuinely necessary, define it centrally first. Avoid a new dropdown implementation or unrelated redesign.
- Inspect `NFLPickEmGameList` and ancestor stacking/overflow. Confirm the list anchors to the trigger, fits the viewport, scrolls long week lists, and is not clipped by game/ad layers.
- Verify keyboard operation, accessible naming/selected state, Escape/outside dismissal, and focus return. If the shared primitive lacks keyboard behavior required after removing native select, fix that once in the shared primitive and regression-check its other consumers.

Verification: regular menu has no football; all other sport choices work; dedicated NFL game, historical picks, deep-linked `?week=…`, date labels, current indicator, week switching and locked-week viewing work. Browser check at desktop and narrow mobile widths; device check for iOS/Android popup placement. Headless screenshots alone cannot certify installed-PWA/browser-chrome behavior.

**Done when:** both requested UI changes pass behavior checks and available visual checks, with any real-device gap explicitly recorded. Write Phase 3 handoff.

## Phase 4 — Fix grading and admit only supported squares

**Status: Complete locally, 2026-09-15. Recommended model: GPT-6 Astra / Extra High. Handoff: [Phase 4](bingo-pickem-reliability-plan_PHASE_4_HANDOFF.md).**

37 typed resolver kinds including FREE have executable admission and captured-provider-shape coverage across all four leagues. All 25 original incident outcomes match; missing final data recovers under the documented 60-second confirmation / 2-hour grace / 48-hour deadline policy. Whole-card grading and notification use a new local-only atomic RPC migration. Focused verification: 197 tests pass; MLB suite, build, typecheck, full lint and isolated PostgreSQL checks pass. The NFL calibration suite retains two failures for Phase 5; full suite also has six date-sensitive dedicated Pick ’Em failures. No production migration/deployment/repair or live client-latency certification is claimed. See the handoff and updated [matrix](bingo-grading-capability-matrix.md) for limits and commands.

1. Fix Phase 1's demonstrated causes, starting with wrong hit/miss and ungradable generated squares. Add meaningful regression fixtures before the fix for each defect.
2. Implement a typed capability check at candidate construction/selection (or extend an existing equivalent): every emitted resolver must have verified inputs and settlement semantics in the matrix. Do not require pregame box scores to exist; capability means a proven provider contract and valid identities, with live/final completeness checked at grading time. Reuse existing factories; avoid rewriting the entire large Bingo engine.
3. Remove unsupported families from new pools or replace them with proven alternatives. Retain backward-compatible parsing/evaluation and a documented resolution path for stored legacy squares. Never silently reinterpret an old label or substitute another rule after its outcome becomes known.
4. Preserve distinct missing/partial/zero states. Check pagination, per-team completeness, normalized player IDs, cumulative vs period stats, overtime, pushes, corrected/reversed plays, scorer attribution, and market semantics. Threshold hits may resolve early only when evidence makes them safely determined under the existing correction policy; “under,” totals, comparative and negative conditions need their appropriate period/game closure.
5. Use pending while evidence is incomplete, bounded retries for delayed final data, and explicit void reasons when a supported rule cannot be determined after the documented grace policy. Do not turn absent data into a miss or conceal unsupported generation by routinely voiding it.
6. Review force-finalization and card aggregation so a transient empty feed does not irreversibly lose a card before supported regrading can occur. Preserve idempotent scoring/notifications and design an explicit correction mechanism for already-settled errors.
7. Verify actual NFL cron delivery using existing cadence; do not change `vercel.json` unasked. NBA/WNBA/MLB webhook and fallback behavior must retain parity. Add focused counts for pending age, unavailable-input reasons, hit/miss/void outcomes, and provider failure by league/family without logging secrets or personal details.

Verification: every admitted family has observed provider-shape evidence plus hit/miss/boundary/missing/partial cases as applicable; incident replay agrees with independently established expected results; partial→complete final payload recovers; duplicate/out-of-order sweeps cannot double award; no healthy complete final fixture remains pending. Run all four leagues' grading regressions because resolver infrastructure is shared.

**Done when:** 100% of new candidate families have documented grading coverage; all determinate incident fixtures are correct; unknown cases are honestly classified; deferred data converges under the documented policy. Update the matrix and write Phase 4 handoff.

## Phase 5 — Improve variety and live pacing using verified props

**Status: Complete locally, 2026-09-19. Not committed, pushed or deployed. Evidence: [board quality and calibration audit](bingo-board-quality-calibration-2026-09-19.md). Handoff: [Phase 5](bingo-pickem-reliability-plan_PHASE_5_HANDOFF.md). Model recommendation was GPT-5.6 Sol / High.**

The final enforced NFL rich-market mix is 10 core / 6 special / 8 verified props. A full prop block
has at least six provider-ID subjects, both teams when the pool permits, no player above two cells,
and at least three early-progress opportunities. Player-stat near-duplicates share one diversity
axis; unsupported or non-composable games inherit Phase 2 unavailability. Thin prop-free boards cap
specials at six and fill only from supported core candidates. The seeded 300-board historical NFL
audit realizes 22.0% (Wilson 95% 17.68–27.03%), while explicitly retaining 7.236% unknown square
outcomes. Current-season prop-rich live timing and longer multi-week calibration remain Phase 7
observation, not an unearned pass.

- Review generated board samples with readable square labels, not only predicted win probabilities. Favor recognizable current players, both teams, varied events and several opportunities for the board to move before the final whistle.
- Examples are conditional on Phase 4 evidence: player passing/rushing/receiving milestones, scorer touchdowns, team/half/quarter achievements; basketball points/rebounds/assists; baseball hits/strikeouts/home runs. Do not add a quarter prop simply because its odds market exists.
- Enforce roster/injury eligibility using verified current IDs. Avoid duplicate or near-duplicate thresholds, contradictory entries, repeated player monopolies, and highly redundant pairs such as one player's first-TD plus anytime-TD. Retain appropriate recognizable/non-star variety.
- Keep 25 cells (1 free + 24 supported non-free). Audit the current NFL 10 core / 6 special / 8 prop mix and shared maximum-two-per-player rule; change those only with explicit evidence and document the chosen numeric caps. Do not flood specials when a prop pool is thin. If 24 quality supported candidates cannot be composed, make that game unavailable through Phase 2's shared rule.
- Provisional measurable review targets: zero duplicate resolver keys, zero unsupported candidates, no player above the existing two-square ceiling, both teams represented where player pools permit, and at least six distinct player-prop subjects on a full eight-prop NFL board. Review at least three opportunities for progress before the final whistle per NFL board; measure actual feasibility and record final enforced targets without admitting unsafe props to meet a quota.
- Preserve the existing 20–30% board-win probability target, validate correlation effects, and compare seeded samples before/after. Separate predicted estimates from realized outcomes. Historical prop-free backtests cannot establish modern player-prop accuracy or live timing; collect current-season stored boards to measure those separately.

Verification: seeded multi-game samples including rich/thin markets, known injuries, long names and every supported league; full resolver replay for sampled supported families; narrow/mobile board label review; no feasibility exceptions created by composition limits. Record sample sizes, mix, unique players, early opportunities, void rates, predicted/realized rates and uncertainty.

**Done when:** quality targets and fallback behavior are documented and tested, sample boards remain fully gradable, and any extended multi-week calibration is identified as ongoing observation rather than an unearned pass. Write Phase 5 handoff.

## Phase 6 — Reconcile affected boards and rewards safely

**Status: Intentionally skipped by Andrew, 2026-09-19. No repair tool was built and no historical or production data was changed. Past boards/rewards remain unchanged by product decision. Handoff: [Phase 6](bingo-pickem-reliability-plan_PHASE_6_HANDOFF.md). Model recommendation was GPT-6 Astra / Extra High.**

- Use Phase 1's original records and Phase 4's verified graders to build a read-only dry-run report. Start with Brunswick Grove/game 1392216 only after confirming IDs; identify broader affected cohorts separately from demonstrated defect conditions.
- Compute before/after square statuses, winning lines, card outcomes, reward-claim state, point/leaderboard changes, and any dependent challenge accrual. Do not assume reopening a lost card through the normal active-card sweep repairs all consequences.
- Prepare a bounded repair tool that defaults to dry-run and requires explicit IDs for apply. Include before-state backup, expected-row/version guards, idempotency keys where required, concurrency protection, per-row undo log, and a restore procedure verified on fixtures or an isolated database. A second run must have zero additional effect.
- Preserve claimed reward history. Do not silently claw back redeemed value, delete history, double issue points, or send duplicate win notifications. Surface any already-claimed incorrect win as a concrete case needing a developer decision after quantifying it.
- This request authorizes a plan, not production data mutation. During execution, finish the concrete dry-run and repair artifact before requesting any remaining authorization. Apply only within subsequently authorized scope; then requery and compare with the expected report.

Verification: correct→unchanged, miss→hit, hit→miss, pending/void recovery, previously lost/won card, claimed/unclaimed rewards, repeated apply, concurrent progress sweep, unrelated venue isolation, rollback. No production apply required merely to test the script.

**Done when:** approved repairs are verified, or explicitly marked awaiting authorization/evidence with the exact prepared report and no misleading “repaired” claim. Write Phase 6 handoff even if partial.

## Phase 7 — Integrated checks, release, and final documentation

**Status: Complete and developer-accepted, 2026-09-19. All offline gates and the 16-game NFL provider validator pass; the required atomic-grading migration is applied and verified on linked project `pkmxupsayzshvpirkaav`; Andrew confirmed authenticated Prop Bingo works. Physical-device and real-game timing checks are non-blocking operational monitoring. Handoff: [Phase 7](bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md). Release record: [2026-09-19](bingo-pickem-reliability-release-record-2026-09-19.md). Model recommendation was GPT-5.6 Sol / High.**

Phase 7 fixed two test-harness defects without weakening assertions: the historical NFL Pick ’Em
fixture now runs under its intended pre-kickoff clock, and the 25-board NFL flavor sample uses a fixed
random stream. Final local results are 2,620 passing tests with 13 environment-gated skips and zero
failures, NFL 288/288, MLB 142/142, PWA contract 20/20, clean typecheck/lint and a 179-page production
build. The read-only 2026 Week 1 validator reproduced all 16 final scores and quarter totals and parsed
all 16 first-touchdown scorers. See the linked release record for current-slate simulation results,
deployment prerequisites, rollback guidance and named owners for remaining live/manual checks.

Run required commands from the repository root after relevant implementation changes:

```sh
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl
npm run test:bingo-mlb
npm run test
npm run build
```

Use targeted commands in earlier phases, for example:

```sh
npx vitest run tests/api.bingo.leagues.test.ts tests/api.bingo.games.test.ts tests/api.bingo.cards.test.ts tests/api.bingo.squares.test.ts tests/components.bingo.SportsBingoSelectSport.test.ts tests/components.bingo.CreateBoardSheet.test.ts
npx vitest run tests/api.nfl-pickem.test.ts tests/lib.nfl-pickem.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts tests/nfl-pickem-exit-navigation-contract.test.ts
```

Add the new replay/selector tests to these commands as they are created. Run `npm run test:pwa-contract` if landscape/PWA files change. Do not repeat the entire suite without new changes or a specific unresolved concern. Existing reports of stale snapshot/date tests and duplicated `* 2.ts` artifacts are historical leads, not today's baseline; record actual failures without weakening assertions or deleting unrelated files.

Provider-backed checks are separate from offline tests. Existing examples, only after inspecting scripts for side effects and with approved runtime environment loading:

```sh
npm run bingo:validate:nfl -- --seasons 2026 --weeks 1
npm run bingo:simulate
npm run dev
```

The validator is a limited play/score check, not full incident replay. Record the new replay command in the handoffs. Scripts can consume credentials through the project's existing runtime environment mechanism without printing values; never inspect secret contents. Environment/deployment limits must be stated if they block live verification.

Release checks:

- Verify all three selectors in both creation hosts/mobile/desktop contexts. Recheck NFL week popup placement on a real device; have Andrew close any physical-device checks the environment cannot perform, following `CLAUDE.md`'s PWA rule.
- Observe a real NFL game and one webhook-driven league through live → final → delayed-data recovery. Record feed-to-square latency and final convergence. Use the existing one-minute NFL sweep as the operational baseline; separate provider delay from application delay. A replay alone does not certify live delivery.
- Recheck availability after kickoff and local midnight; inspect aggregate grading/void/error counts. Record deployed commit and deployment URL if released, flag changes if any, and the rollback commit/runbook. Do not claim changes are live from a local build.
- Preserve old plans as dated history; add cross-references resolving overlapping unfinished activation/live-observation items so the next agent does not repeat outdated work.
- **Update all three actual repository files:** `CLAUDE.md`, `AGENTS.md`, `SYSTEM_CONTEXT.md` (uppercase filenames; do not create case-variant copies). Replace this plan's “planned” pointers with verified as-built contracts and paths. `CLAUDE.md`: availability/gradation/correction boundaries and commands. `AGENTS.md`: adding a supported square requires capability evidence and regression fixtures; phase handoff procedure. `SYSTEM_CONTEXT.md`: actual eligibility path, supported leagues/flags, shared dropdown, regular-vs-NFL Pick ’Em split, grading/retry pipeline, and deployment state.
- Write the final Phase 7 handoff for maintenance even though no new implementation phase is planned. List any remaining monitoring or device check with its owner. On 2026-09-19 Andrew accepted the verified implementation and made those observations non-blocking operational monitoring.

## Mandatory handoff contract — every phase, including partial phases

Before marking phase N finished, create `docs/bingo-pickem-reliability-plan_PHASE_<N>_HANDOFF.md` and update that phase's status and the top status line with a link. A missing note means the phase is unfinished. Do not prefill future handoffs with invented outcomes.

Each note must stand alone for an agent with only the repository:

1. Open with a developer summary: what changed, whether live, what remains, and what needs Andrew.
2. Address the next agent: next goal/scope and explicit exclusions; exact model ID and effort.
3. Record branch, full/short commit, dirty files, committed/pushed/deployed facts, deployment ID if verified, data snapshots/scripts/mutations and undo-log locations. Say “not checked” when appropriate.
4. Repeat decisions already made and developer answers with reasons; do not ask again.
5. List created/changed paths, key functions, and how they connect.
6. Document concrete facts/traps: dates, IDs, provider gaps, stale docs, tool failures/workarounds, credentials/permissions available or missing. Never include secrets.
7. Give exact setup/build/run/replay/test commands, results/counts, fixture paths, unverified risks, and manual checks.
8. List open questions, authorization/evidence dependencies, partially finished work, and recommended first steps.

## Scope and operational boundaries

This is an implementation plan, not authorization to deploy or mutate production today. Routine implementation, investigation, and tests should proceed when that phase is requested; do not insert redundant approval stops for reversible local work. Follow `CLAUDE.md` for `.env.local`, `lib/supabaseAdmin.ts`, existing migrations, and `vercel.json`. If a new schema is actually needed, read `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`, create a new timestamped migration only, and obtain the required explicit authorization before `supabase db push`.

No new sports/provider subscription, broad sports-engine rewrite, billing/auth redesign, service worker, NFL Pick ’Em scoring redesign, or fabricated sports data. The capability matrix covers all currently supported Bingo leagues; adding another league is a separate feature.
