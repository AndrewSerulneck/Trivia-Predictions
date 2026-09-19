# Bingo and Pick ’Em reliability plan — Phase 2 handoff

## Developer summary

Phase 2 is implemented and verified locally. Create Board now shows only NBA, WNBA, NFL, or MLB leagues that currently have at least one boardable, pre-kickoff game on the player's local date. The standalone flow and the in-place Create Board sheet use the same server rule, distinguish an empty day from a provider outage, and recheck stale league/game selections. Preview and Play also revalidate the game on the server, including the kickoff boundary. This is **not live**: nothing was committed, pushed, deployed, or changed in production, and no production data or environment value was touched. Phase 3 is next (remove football from regular Pick ’Em discovery and replace the dedicated NFL native week selector). Andrew does not need to provide anything for Phase 3.

## Next agent: Phase 3 goal and boundaries

Execute **Phase 3: Fix both Pick ’Em selectors**, recommended **GPT-5.6 Terra (`gpt-5.6-terra`), Medium (`medium`)**.

Phase 3 has two bounded goals:

1. Remove NFL/football from every regular Pick ’Em discovery surface without removing shared NFL types, provider mappings, old picks, settlement, history, rewards, or the dedicated `/nfl-pickem` game. Safely route a reachable old regular `/pickem/nfl` entry to the dedicated game and preserve venue context. A stale/default regular selection must not resolve to the now-hidden NFL choice.
2. Replace `components/nfl-pickem/WeekSelector.tsx`'s native `<select>` with `components/ui/Dropdown.tsx`, preserving week IDs/order/dates, `(Now)`, URL initialization, week switching, and locked-week viewing. Verify popup anchoring/clipping, keyboard behavior, Escape/outside dismissal, selected state, accessible naming, and focus return. Fix a missing accessibility behavior once in the shared primitive only if necessary, then regression-check its consumers.

Explicitly out of scope: Bingo grading/capability fixes (Phase 4), board variety/calibration (Phase 5), historical Brunswick board or points repair (Phase 6), production deployment/release certification (Phase 7), unrelated Fantasy behavior, auth/billing, database canonicalization, or changes to dedicated NFL settlement/scoring. Do not alter the completed Phase 2 creation-availability contract while doing the selector work.

## Starting repository, deployment, and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `main`.
- HEAD: **`783ebd2f07bffef05e086ef0687ec53f99377dbc`**, subject `Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`.
- No Phase 0, 1, or 2 work is committed or pushed. Remote alignment was not checked. The working tree is intentionally dirty; preserve all listed work.
- Modified tracked files at handoff: `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, the four `app/api/bingo/*` routes listed below, four Bingo selector/sheet components, `lib/bingoSelectedGameCache.ts`, `lib/sportsBingo.ts`, `lib/sportsBingoOdds.ts`, the Phase 2 test files listed below, and both `tests/lib.sportsBingo.sport-path-keys.test.ts` plus the pre-existing duplicate `tests/lib.sportsBingo.sport-path-keys.test 2.ts`.
- Untracked Phase 2 files: `lib/sportsBingoAvailability.ts`, `tests/api.bingo.availability-cache.test.ts`, `tests/lib.sportsBingo-availability.test.ts`, `tests/lib.sportsBingo-creation-games.test.ts`, and this handoff.
- Untracked Phase 0/1 files that must remain: `docs/bingo-pickem-reliability-plan.md`, both earlier handoffs, the Brunswick audit and capability matrix, `docs/phase1-artifacts/`, both audit/replay scripts, the Brunswick/capability fixtures, and `tests/lib.sportsBingo.brunswick-incident.test.ts`.
- No package, lockfile, migration, environment file, database row, provider record, flag, notification, or private incident snapshot changed in Phase 2. No production endpoint was invoked. Protected Phase 1 evidence remains ignored under `tmp/bingo-incident-private/`; never commit its private player/consequence records.
- No commit, push, deployment, live smoke test, or alias movement occurred. The last known production deployment remains the **September 12 read-only observation** from Phase 1: Vercel deployment `dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`, created `2026-09-09T17:55:25.369Z`, build commit `d282bd35decbadbbf6d5924477361f6b82fe4e01`, with aliases including `hightopchallenge.com` and `play.hightopchallenge.com`. It was not rechecked on September 13 and does not contain these Phase 2 changes.

## Decisions implemented and why

1. Creation availability is exactly: a supported catalog league with at least one game that has 24 or more candidate squares, is on the player's supplied local date, and has not reached kickoff. This implements the developer's explicit rule and keeps the existing 36-hour upstream fetch window.
2. `lib/sportsBingoAvailability.ts` is the single server creation policy. It iterates `SPORTS_BINGO_LEAGUES` and delegates boardability/day/kickoff to `listSportsBingoGames`; Phase 4 candidate restrictions will therefore flow into discovery automatically.
3. Old Bingo season and NFL coming-soon flags no longer participate in leagues, games, squares, preview, or Play. `lib/leagueSeasonStatus.ts` remains because other product surfaces and its tests still use it; environment values were not edited.
4. A verified empty response is a normal empty day. A provider failure is incomplete/unknown, never an authoritative empty day. If one or more leagues still have verified games, the API returns those choices with a warning. If nothing can be verified because every requested provider evaluation failed, it returns HTTP 503 and no static fallback.
5. Raw game catalogs remain cached by sport, not timezone: timezone/local-date/kickoff filtering runs on every `listSportsBingoGames` call. Successful catalogs retain the existing bounded 60–90 second TTL; failure/partial catalogs retry after 1 second. Same-sport concurrent catalog builds share one in-flight promise.
6. Browser-selected game cache remains only an optimistic rendering handoff. Its TTL is 2 minutes and it now records timezone/local date, rejects timezone/date/kickoff mismatches, and is always followed by server revalidation before preview generation.
7. Creation routes ignore the historical `includeLocked=true` option and always return unlocked creation games. Existing-card history/resume GET paths and settlement do not call creation availability and remain accessible when today's league list is empty.
8. Preview and Play each call the same exact-game server guard. The lower-level preview generator and card creator retain independent current-time kickoff checks, preventing a request that began before kickoff from completing after lock.

## Phase 2 files and how they fit together

### Server policy and provider/cache behavior

- `lib/sportsBingoAvailability.ts` (new): `resolveSportsBingoCreationAvailability`, `requireSportsBingoCreationGame`, timezone normalization, typed availability errors/status mapping, and stable empty/partial/failure messages.
- `lib/sportsBingo.ts`: `loadGameCatalog` now records BallDontLie failures, excludes final/cancelled/postponed/suspended/abandoned rows, and uses a caller-supplied evaluation time; `getGameCatalog` carries failure state through cache hits, uses a 1-second failure TTL, and deduplicates in-flight builds; `listSportsBingoGames` accepts one evaluation time/failure box and performs current local-date/kickoff filtering; `generateSportsBingoBoard` rechecks kickoff immediately before generation.
- `lib/sportsBingoOdds.ts`: `fetchNFLOddsConsensus` accepts the shared failure box so NFL odds failure cannot masquerade as a verified empty/complete availability result.
- `app/api/bingo/leagues/route.ts`: supplies browser timezone to the shared resolver and emits only nonempty leagues, plus explicit incomplete warning or 503 failure.
- `app/api/bingo/games/route.ts`: uses the same resolver for one supported sport and only unlocked creation games. The old `includeLocked` query value is deliberately non-authoritative.
- `app/api/bingo/squares/route.ts`: revalidates the exact eligible game before producing preview templates.
- `app/api/bingo/cards/route.ts`: both `generate` and `play` revalidate the exact game and map unsupported/provider/stale errors to 400/503/409. Card-history GET and claim paths were not gated.

### Client creation flow and cache

- `components/bingo/SportsBingoSelectSport.tsx`: API-only choices; four-league skeleton while loading; distinct successful-empty, partial-warning, and retryable-error states; no static fail-open fallback; refresh on focus/visibility and local-date rollover.
- `components/bingo/SportsBingoSelectGame.tsx`: sends browser timezone, handles partial/failure results, revalidates on focus/visibility/date rollover, writes timezone-aware selection cache, and returns to league selection if the chosen league loses its last game.
- `components/bingo/SportsBingoSelectBoard.tsx`: treats cached game data as optimistic only, always verifies the exact game with the server before auto-generation, clears stale cache, safely returns to game selection, renders partial availability as a warning, refreshes on focus/visibility/date rollover, and sends timezone on preview and Play.
- `components/bingo/CreateBoardSheet.tsx`: provides stable callbacks that move a stale league to step 1 and a stale game to step 2 without closing the sheet.
- `lib/bingoSelectedGameCache.ts`: stores local date/timezone, validates TTL/local date/timezone/kickoff, and exports exact-key clearing.
- `lib/bingoPrefetchCache.ts` was inspected but intentionally unchanged: it caches existing card data consumed by `SportsBingoHome`, not league/game creation eligibility.

### Tests added or updated

- New: `tests/lib.sportsBingo-availability.test.ts`, `tests/lib.sportsBingo-creation-games.test.ts`, `tests/api.bingo.availability-cache.test.ts`.
- Updated: `tests/api.bingo.leagues.test.ts`, `tests/api.bingo.games.test.ts`, `tests/api.bingo.cards.test.ts`, `tests/api.bingo.squares.test.ts`, `tests/components.bingo.SportsBingoSelectSport.test.ts`, `tests/components.bingo.CreateBoardSheet.test.ts`, `tests/lib.bingo-selected-game-cache.test.ts`, and both sport-path-key copies.
- Coverage includes zero and one eligible game for all four leagues; exact kickoff, final/cancelled/wrong-local-day/unboardable cases; partial vs empty vs failure; timezone midnight; stale cache/direct server requests; obsolete flag combinations; exact-game preview/Play checks; existing history without availability; and in-sheet stale selection recovery with no generation POST.

## Facts, traps, and implementation cautions

- `fetchBallDontLieList` normally returns `[]` on non-2xx/network failure. Availability must pass and inspect its `BallDontLieFailureBox`; catching exceptions alone will mislabel outages as empty schedules.
- NFL boardability also depends on odds. `sportsBingoOdds.ts` used to swallow that failure independently; removing or bypassing the new failure propagation recreates the false-empty bug.
- The upstream lookahead spans three UTC date keys at some local times. The local-date filter belongs after catalog retrieval. Do not key the raw catalog by browser timezone or assume an upstream UTC day equals the player day.
- Catalog contents may outlive kickoff, but eligibility does not: every list call re-filters using its evaluation time, and both lower-level create functions check `Date.now()` again.
- A partial catalog may contain trustworthy games and a failure bit. Do not discard those verified games, and do not cache the result for the normal 60–90 seconds.
- Persisted card keys use short `nba`/`nfl` at some database boundaries while creation uses long catalog keys such as `basketball_nba` and `americanfootball_nfl`. Phase 2 deliberately did not normalize grading/query/channel boundaries; that is Phase 4 defect D1. The incident suite confirms D1–D7 remain characterized.
- `tests/lib.sportsBingo.sport-path-keys.test 2.ts` is a pre-existing oddly named duplicate. It was kept in sync with the canonical static-catalog guard so TypeScript does not retain obsolete source-spelling assumptions. Do not delete it casually in this dirty tree.
- Vitest's Create Board component test prints harmless jsdom `Window.scrollTo()` warnings and a reduced-motion notice. They are not failures.
- The request-count benchmark is mocked/offline, not live provider latency. It observes 13 first-discovery calls at the fixed test timestamp (three game-date requests for each of four sports plus one NFL odds request), then zero additional provider calls for the immediately following `/games` request; the test completed in about 265 ms and asserts under one second.
- No browser, physical-device, live-provider, production, deployment, or installed-PWA verification was performed. Phase 3 needs desktop/narrow browser checks for its dropdown, and Phase 7 owns integrated live/release certification.

## Build, run, and verification record

Environment used: repository's installed Node/npm dependencies; no `.env.local` values were read and no network/provider credentials were required for the offline tests.

```bash
cd /Users/andrewserulneck/Documents/Trivia-Predictions
npx tsc --noEmit
npx eslint app/api/bingo/cards/route.ts app/api/bingo/games/route.ts app/api/bingo/leagues/route.ts app/api/bingo/squares/route.ts components/bingo/CreateBoardSheet.tsx components/bingo/SportsBingoSelectBoard.tsx components/bingo/SportsBingoSelectGame.tsx components/bingo/SportsBingoSelectSport.tsx lib/bingoSelectedGameCache.ts lib/sportsBingo.ts lib/sportsBingoAvailability.ts lib/sportsBingoOdds.ts tests/api.bingo.availability-cache.test.ts tests/api.bingo.cards.test.ts tests/api.bingo.games.test.ts tests/api.bingo.leagues.test.ts tests/api.bingo.squares.test.ts tests/components.bingo.CreateBoardSheet.test.ts tests/components.bingo.SportsBingoSelectSport.test.ts tests/lib.bingo-selected-game-cache.test.ts tests/lib.sportsBingo-availability.test.ts tests/lib.sportsBingo-creation-games.test.ts tests/lib.sportsBingo.sport-path-keys.test.ts
npx vitest run tests/lib.sportsBingo-availability.test.ts tests/lib.sportsBingo-creation-games.test.ts tests/api.bingo.availability-cache.test.ts tests/api.bingo.leagues.test.ts tests/api.bingo.games.test.ts tests/api.bingo.cards.test.ts tests/api.bingo.squares.test.ts tests/components.bingo.SportsBingoSelectSport.test.ts tests/components.bingo.CreateBoardSheet.test.ts tests/lib.bingo-selected-game-cache.test.ts tests/lib.sportsBingo.sport-path-keys.test.ts --silent=passed-only --reporter=dot
npm run test:bingo-nfl -- --silent=passed-only --reporter=dot
npm run test:bingo-mlb -- --silent=passed-only --reporter=dot
npx vitest run tests/lib.sportsBingo.nba-fetch-failure.test.ts tests/lib.sportsBingo.nba-plays-fix.test.ts tests/lib.sportsBingo.wnba-row-shape.test.ts tests/api.cron.bingo-progress.test.ts
npx vitest run tests/lib.sportsBingo.brunswick-incident.test.ts --reporter=dot
git diff --check
```

Results on **2026-09-13**:

- TypeScript: passed with no output.
- Targeted ESLint over every Phase 2 source/test path: passed with no output.
- Phase 2 focused suite: **11 files / 69 tests passed**.
- NFL regression suite: **22 files / 288 tests passed**.
- MLB regression suite: **11 files / 142 tests passed**.
- NBA/WNBA/fetch/cron regression set: **4 files / 33 tests passed**.
- Brunswick incident suite: **1 file / 10 tests passed**, including its five expected-failure requirements; no Phase 4 grading fix was accidentally introduced.
- `git diff --check`: passed.

Still unverified/risky: real BallDontLie latency and mixed live partial responses, visual/browser/device behavior, production deployment, and all D1–D7 grading/live-refresh fixes. A full `npm run lint`, `npm run test`, `npm run build`, and release smoke suite were not run; Phase 7 owns the complete release gate. Phase 3 should run the focused Pick ’Em/UI tests it changes plus typecheck/lint, and should record any real-device gap honestly.

## Open questions and items waiting on the developer

None for Phase 3. No authorization to deploy or repair production should be inferred from this local implementation.

## Recommended first steps for Phase 3

1. Re-read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, the plan's Phase 3 section, and this handoff. Run `git status --short` before touching the intentionally dirty tree.
2. Trace all consumers of `listPickEmSports`, `/api/pickem/sports`, `components/pickem/PickEmGameList.tsx`, and `PickEmSportSelect.tsx`. Choose a discovery-only NFL exclusion; do not delete shared registry/provider/settlement support.
3. Find how regular Pick ’Em initializes its selected sport and handles `/pickem/nfl`. Add tests first for hidden NFL, stale/default state, redirect/preserved venue context, and unchanged existing-history access.
4. Read `components/ui/Dropdown.tsx`, every relevant existing consumer/test, `components/nfl-pickem/WeekSelector.tsx`, its parents, `lib/themeTokens.ts`, and `design-system/hightop-challenge-design-system/project/colors_and_type.css`. Check ancestor `overflow` and stacking before changing the week selector.
5. Preserve exact option IDs/labels/order/current marker/query initialization/locked viewing in component tests; then do desktop and narrow-mobile browser checks. Installed iOS/Android behavior needs a real-device check or an explicit handoff gap.
6. Before marking Phase 3 complete, write `docs/bingo-pickem-reliability-plan_PHASE_3_HANDOFF.md` and update the plan plus the latest-handoff pointers in `AGENTS.md`, `CLAUDE.md`, and `SYSTEM_CONTEXT.md`.
