# Phase 1 handoff — Bingo and Pick ’Em reliability

Completed: **2026-09-13**. Production/provider evidence collected **2026-09-12**.
Plan: [bingo-pickem-reliability-plan.md](bingo-pickem-reliability-plan.md).

The investigation recovered the actual Brunswick Grove board and accounted for all 25 squares. It should have won, but the site recorded a loss. The main cause is a mismatch between the database's league name and the grading engine's expected name; a second defect prevents recognition of a participating player who had zero receptions. We also found missing-data, recovery, wording and screen-update problems. The original records are preserved, and an offline replay reproduces the stored result. **No gameplay fix, production data change, points award, configuration change or deployment was made.** Phase 2 is the league-availability implementation; grading fixes and the board/reward correction remain in Phases 4 and 6. Andrew does not need to answer anything to begin Phase 2.

## To the next agent — next goal and boundaries

Execute **Phase 2: Make Bingo availability consistent**, recommended **GPT-5.6 Sol (`gpt-5.6-sol`), High (`high`)**. These are the plan's recommendations, not an automatic model switch. No subagents were used or are required.

The visible Bingo league set must equal the leagues with at least one currently boardable, unlocked game on the player's local date. Share one server-side availability definition across league discovery, game selection, preview and creation, built on `listSportsBingoGames`. Remove obsolete Bingo season/NFL coming-soon gates, handle partial provider failures honestly, expire/revalidate stale selections, and enforce kickoff again on submit. Cover both standalone routes and `CreateBoardSheet`.

Out of scope for Phase 2: Pick ’Em selectors (Phase 3), grading/capability enforcement and live-delivery repair (Phase 4), board variety/calibration (Phase 5), historical board/points repair (Phase 6), deployment/release certification (Phase 7), unrelated Fantasy availability, auth, billing, database canonicalization, or broad engine rewrites. Do not turn discovery work into an unreviewed production repair. Preserve existing-board viewing/history even when no new games are available for that league.

Phase 1's completion means recovered-record reconciliation and source/fixture inventory are complete. It does **not** mean the incident is fixed or that historical live latency was measured.

## Starting repository, deployment and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `main`. Last commit: **`783ebd2f07bffef05e086ef0687ec53f99377dbc`**, `Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`.
- No commit or push was made. Remote branch alignment was not checked. Re-read `git status --short` before editing.
- Phase 0 already left modifications to `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`, plus untracked `docs/bingo-pickem-reliability-plan.md` and `docs/bingo-pickem-reliability-plan_PHASE_0_HANDOFF.md`. Preserve that work. Phase 1 updates the plan/instruction pointers and adds the files listed below. All remain uncommitted; all new Phase 1 files remain untracked at handoff. No runtime application source or package/lock file changed.
- Read-only Vercel inspection **on September 12** found production deployment **`dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`**, ready, created **`2026-09-09T17:55:25.369Z`**. URL: `https://hightop-challenge-fyzq2q4z1-andrewserulnecks-projects.vercel.app`; aliases included `hightopchallenge.com` and `play.hightopchallenge.com`.
- Its build log names commit **`d282bd35decbadbbf6d5924477361f6b82fe4e01`**. `git diff d282bd3 HEAD --stat` showed only two documentation/artifact files; the audited gameplay source matches that deployment's source. Historical alias movement during the game was not checked. Deployment was not rechecked September 13.
- No application endpoint that can grade, settle, claim or create was invoked against production. No remote rows were changed, no migrations ran, no flags changed, and no notifications/messages were sent. The collector uses GET against Supabase REST/provider endpoints only. GET on `/api/cron/bingo-progress` or refreshing `/api/bingo/cards` would **write** and is not a read-only diagnostic.

Protected evidence is in ignored `tmp/bingo-incident-private/`, not in the committed fixture tree:

| Path beneath that directory | Purpose |
|---|---|
| `2026-09-12T21-42-00-298Z/` | Initial sandbox attempt; DNS `ENOTFOUND`. Not a valid successful capture. |
| `2026-09-12T21-42-16-453Z/` | First successful venue/card/square before-state and provider capture. |
| `2026-09-12T21-44-20-968Z/` | Main complete capture: original card/squares, private consequence rows, final NFL feeds, game-specific participation, player directory and current injuries. |
| `2026-09-12T21-50-36-367Z/` | Representative NBA/WNBA/MLB provider-shape captures. |
| `deployment.json`, `deployment-build-stderr.txt` | Read-only deployment metadata/build evidence. Vercel wrote build logs to stderr. |
| `cron-logs-stderr.txt`, `cron-logs-retry-stderr.txt` | Historical runtime-log lookup errors; both HTTP 400. No runtime log contents recovered. |

Run directories are mode **0700**, capture files **0600**. Manifests record collection times, GET paths/queries, HTTP statuses, next cursors and SHA-256 hashes. **47 captured-file hashes** across the three successful run manifests were verified September 13; private snapshots are git-ignored. Card fields other than removed `user_id`, and every original field on all 25 squares, were compared with the sanitized fixture and match exactly. The private account ID was checked absent from public audit/fixture/script/test artifacts. Athlete names/IDs are public sports inputs and are intentionally retained.

These are sequential exports, not a transactional database backup. Preserve them for Phase 6, but requery and version-guard fresh rows before repair. There is no undo log because no writes occurred. Never commit raw venue history, private consequence rows, account identity or credentials.

## Decisions already made — do not re-ask

1. Creation availability means **at least 24 candidates**, unlocked at kickoff, **current local date**; retain the **36-hour upstream lookahead**. Do not expand the booking window. The browser's `getTimezoneOffset()` sign convention applies (`local = UTC - offset`). Normalize the supplied timezone consistently and use one evaluation time where practical.
2. Iterate the shared supported-league catalog, with no hardcoded NBA/WNBA exclusions, calendar-based availability guesses, disabled empty leagues, or static clickable fallback after an error. Show verified available leagues plus a concise retry message if other leagues failed; distinguish successful-empty from unknown.
3. The requested game-driven rule supersedes obsolete Bingo season/NFL activation gates. This is already authorized by the plan. Scope gate removal to Bingo creation callers and preserve unrelated Fantasy/Pick ’Em behavior. Do not edit environment values to make the rule work.
4. Existing board/history/settlement access is independent of whether that league has games available for **new** boards today. Revalidate preview/submit so a pre-kickoff request cannot create after lock.
5. Later Phase 3 filters NFL discovery from regular Pick ’Em while retaining dedicated `/nfl-pickem` and shared settlement/history. NFL week selection must reuse the shared branded dropdown and preserve week semantics.
6. Later grading work prioritizes correctness over variety/win rate. Odds availability is not grading support. Missing/partial evidence, explicit zero and DNP are distinct. Retain interpretation of stored resolvers when retiring unsupported new generation.
7. Preserve both interpretations of the incident's disputed punting label. Do not silently rewrite its resolver. The winning column is unaffected by that dispute.
8. This request authorized Phase 1 investigation and local artifacts, not a live repair/deployment. Any later approval still required must be for a concrete reviewed dry-run, after preparation is complete. No product decision or permission is currently waiting on Andrew for Phase 2's local implementation.

## Incident facts and priorities for later grading work

Full square table, original square IDs, exact resolution times and official evidence: [incident audit](bingo-brunswick-grove-2026-09-09-audit.md). Full resolver JSON: [incident fixture](../tests/fixtures/bingo-brunswick-grove-2026-09-09.json).

- Venue name **Brunswick Grove**, ID **`brunswick-grove`**. All **9** venue cards were queried across all statuses and creation dates. Exactly **1** matched the incident: **`314a6a4f-762f-499c-ac3a-9ddc2a3cd63a`**.
- Provider game **1392216**, NE team **1** at SEA team **31**. Kickoff **`2026-09-10T00:20:00Z`** = September 9, 20:20 EDT. Card created **`2026-09-09T19:04:12.002533Z`**; persisted sport key **`nfl`** and bare-string game ID **`1392216`**.
- Stored: **lost**, **18 void / 6 miss / 1 FREE hit**, no pending/replaced squares, replacement links all null. In-place historical swaps cannot be ruled out from null links alone; no original-resolver history ledger was found. Captured persisted payloads are the audit's original records.
- `settled_at=2026-09-10T12:20:09.839Z`, exactly scheduled start + 12 hours + 9.839 seconds. Last cron processed **12:20:09.995Z**. Base reward **50**, claim/win/near-win/winning-line markers null. One loss notification recovered. Scoped campaign progress, cycle-winner and redemption queries each returned **0 rows**. The user's mutable cumulative points total is preserved privately and cannot establish an exact historical delta.
- Official final: **SEA 13–10**. Expected under original resolver meanings: **11 hits including FREE, 14 misses, 0 void**. Stored differs on **21/25** cells: 18 determinate voids and wrong misses at **17, 18, 22**. This is one board's reconciliation, not a general grading-accuracy rate.
- Winning third column, zero-based **[2, 7, 12, 17, 22]**: margin 3 < 9.5; NE 10 < 24.5; FREE; Elijah Arroyo zero receptions; Sam Darnold longest rush 0 < 5.5.
- Direct NFL replay (bypassing broken dispatch) yields **10 hits / 14 misses / 1 void**. Only Arroyo cell **17** disagrees. The actual sweep with persisted key reproduces **all 25 stored outcomes with zero provider calls**. A long-key-only grader test would have missed the principal incident cause.

| Defect | Reproducible evidence and required direction |
|---|---|
| **D1, critical: persisted key misses provider dispatch** | SQL `canonical_sport_key` maps long NFL/NBA to `nfl`/`nba`; card trigger enforces it. `listCardRows` casts without normalization; score paths and NFL/basketball dispatch accept long keys only. Pre-timeout sweep changes nothing; post-12h sweep reproduces all stored statuses. Fix read **and query/filter/channel** boundaries, test actual persisted keys, preserve shared database canonicalization. Source-level NBA exposure exists but the affected cohort is not sized. |
| **D2, critical: no-stat participant becomes void** | Arroyo **13874289** participated (official gamebook substitutions plus game-specific `did_not_play=false`), but has no player-stat row. Direct grader voids his zero-reception prop and blocks the win. `active=true` alone is insufficient; join participation and complete stat evidence. |
| **D3, high: absent field becomes zero** | Removing `long_rushing` from the real Holani row makes his under incorrectly hit. `parseStatNumber` collapses absence/null/malformed input to zero. Darnold's actual null rushing fields do represent zero after independent participation/gamebook corroboration; blanket null-is-missing is also insufficient. |
| **D4, high: failed later page looks complete** | Shared client retains page-one rows after page-two 503. NFL plays passes a truncation box without a failure box; truncation stays false. A partial prefix falsely proves a final first-TD miss. Constructed failure variant, not a claim the incident provider failed. |
| **D5, high: finalized cards cannot recover** | Sweep scans active cards only. Captured lost card with `bypassCache=true` scans zero. Even within active cards, hits/misses are skipped; only selected voids regrade. Need bounded delayed-final recovery plus explicit idempotent settled-result repair. |
| **D6, medium: label/resolver disagreement** | Cell 1 says 3+ punts **downed** inside 20; stat sums all inside-20 punts (6), while actual downed count is 1. Literal label miss / stored resolver hit preserved separately. Another source risk: `spread_keep_close` label says final margin, but resolver is one-sided handicap; test a large underdog win. |
| **D7, high: NFL square writes do not refresh the open board** | Dispatch-corrected in-memory sweep updates 24 squares but sends no `bingo-game:1392216` / `card_updated`. Only NBA/WNBA/MLB webhook route sends it. Client stat broadcasts animate events without reloading cards; no periodic card polling exists in `SportsBingoHome`. Add/review notification and reconnect recovery contract. |

The client also displays an active card as lost after **6 hours** (`BINGO_GAME_BUFFER_MS`, `components/bingo/bingoBoardShared.tsx:244`, applied in `SportsBingoHome.tsx:1431`), while backend no-score timeout is **12 hours**. Reconcile this with Phase 4's retry/finalization policy. Stale comments claim card polling; the component's sole 60-second interval updates the date. No historical screenshots prove the exact client state the player saw.

The expected historical correction is **lost → won**, winning column and **50-base-point eligibility**. Phase 6 must recheck claim/multiplier/venue/notification state before deciding the exact delta. `claimSportsBingoReward` marks a claim before separate points operations; do not casually use it as a repair primitive or assume retrying is atomic. No points were awarded during Phase 1.

## Files created/updated and how to use them

| Path | Role / key functions |
|---|---|
| `docs/bingo-brunswick-grove-2026-09-09-audit.md` | Officially reconciled 25-cell table, evidence provenance, D1–D7, cache/delivery/settlement trace, reward consequences and gaps. |
| `docs/bingo-grading-capability-matrix.md` | All four leagues; generation/legacy classification, endpoint/tier/joins, exact field and parameter variants, hit/miss/push/period/OT/missing semantics, fixture status and KEEP/FIX/RETIRE recommendations. No runtime capability enforcement yet. |
| `docs/phase1-artifacts/bingo-resolver-inventory-2026-09-12.json` | Reviewed TypeScript AST kind inventory and generator origins. **74 typed kinds: 70 generated including FREE, 69 generated non-free, 4 legacy-only**. Every typed kind appears in the matrix; per-league/flag/parameter gates are documented there. |
| `docs/phase1-artifacts/brunswick-grove-incident-replay-2026-09-12.json` | Saved direct-grader reconciliation output; independently compared with September 13 replay and matches exactly. |
| `scripts/audit-bingo-brunswick-incident.cjs` | GET-only collector: `database` offset-paginates 500 rows/page, `provider` follows cursors, `request` records safe metadata, `save` writes protected timestamped JSON + hashes. No app imports. `--coverage-only` fetches representative NBA/WNBA/MLB final shapes. Terminal failures/incomplete walks set exit code 1; inspect feed manifests regardless. |
| `scripts/replay-bingo-brunswick-incident.cjs` | Offline `gradeResolversAgainstCompletedNFLGame` plus `boardStatusesMakeALine` with original resolvers. Completeness guard, fetch blocked, inherited service-role key deleted before importing app code. No board generation or sweep. `--assert-correct` intentionally exits 1 while discrepancies/dispute remain. |
| `tests/lib.sportsBingo.brunswick-incident.test.ts` | Actual sweep with existing in-memory `tests/helpers/bingoSupabaseDouble`, fixed clock and blocked/mock fetch; direct grader and deliberate partial-input variants. Five characterization passes + five `it.fails` requirements D1–D4/D7. Every expected failure was separately verified to fail at its intended final assertion. |
| `tests/fixtures/bingo-brunswick-grove-2026-09-09.json` | Sanitized original card/squares/resolvers, expected outcomes/evidence and `labelDispute`, final NFL game/player/team/plays/designations. No private account or consequence rows. |
| `tests/fixtures/bingo-capability-nba-2026.json` | NBA game **18448004**, Orlando at Boston, April 12: stats 33, plays 495, lineups 18, period 1–4 rows 17/16/17/16. |
| `tests/fixtures/bingo-capability-wnba-2026.json` | WNBA game **24999**, Washington at Las Vegas, August 12 UTC: stats 22, plays 386. No WNBA lineup/period endpoint was certified. |
| `tests/fixtures/bingo-capability-mlb-2026.json` | MLB game **5059967**, Cincinnati at Dodgers, September 10 UTC: stats 32, lineups 20, plays 572 across 6 pages. |
| `docs/bingo-pickem-reliability-plan.md`, `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md` | Phase 1 status and latest handoff pointers. Final verified as-built rules and supported-square maintenance procedure are still required in Phase 7. |
| `docs/bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md` | This standalone next-phase record. Phase 0 handoff retained unchanged. |

The inventory's four globally legacy-only kinds are `nba_team_players_scored_at_least`, `nba_player_zero_turnovers`, `nba_team_has_double_double`, `replacement_auto`. A kind can be generated for one league and legacy-only for another; basketball `player_prop` is an example. Inventory counts do not certify family behavior or unobserved tiers.

## Evidence/tooling traps and unresolved limitations

- **Provider client filename:** Bingo imports `lib/ballDontLieClient.ts`; similarly named `lib/balldontlie.ts` is not D4's fix location. `lib/sportsBingoOdds.ts` shares the actual client, so failure propagation also affects Phase 2 availability.
- Source key mapping lives in `supabase/migrations/20260512021000_nba_provider_identity_bridge.sql`; trigger in `20260512024500_enforce_canonical_sport_keys.sql`. Existing migrations are read-only history. Normalizing returned rows alone misses `.eq/.in` filters. Existing history and webhook matching must continue to find persisted `nba`/`nfl` rows.
- The older `docs/bingo-correctness-and-wnba-repair-plan.md` already mentions the NBA key mismatch. Its prose is not evidence of a shipped fix.
- Main NFL feeds are HTTP 200 and cursor-complete: game 1, player stats **60**, team stats **2**, plays **179 on 2 pages (100+79)**, first next cursor **11235876**, then null. These are postgame snapshots, not evidence of historical live availability.
- NFL `player_designations` is now available and game-specific: **56 SEA / 55 NE** rows for 2026 week 1 regular season. Arroyo `active=true, starter=false, did_not_play=false`; `updated_at=2026-09-10T03:30:41.449Z` is not first-publication time. Shipped Bingo does not yet use this endpoint.
- NFL plays now contain `participants` with player IDs; engine comments saying IDs are unavailable are stale. Verify scorer roles and incomplete plays before replacing name parsing.
- `/nfl/v1/players?team_ids[]` returned **496 SEA / 373 NE** historical directory entries. This is not an active game-day roster. Current injuries **315 rows/4 pages** are not historical pre-kickoff evidence.
- NBA/WNBA plays returned **495/386 rows in a single response**, no next cursor, despite `per_page=100`. Do not truncate responses locally to requested page size. Provider paging completion is not semantic timeline completeness.
- Representative NBA/WNBA/MLB fixtures preserve provider shape and full plays; embedded game/profile copies are trimmed. They are not incident boards, official independently expected results, live delivery traces, or complete hit/miss/boundary suites for every family.
- Official outcome references are linked in the audit: Patriots box score and gamebook PDF `https://static.clubs.nfl.com/image/upload/patriots/lmdmzornxr5pgi90xvmi.pdf` pages 1–3. Public professional-athlete IDs are needed for joins; don't confuse them with private player-account identity.
- Shared cached NFL snapshot TTL is **5 seconds** despite `NBA_PLAYER_STATS_CACHE_MS` name; scores default **30 seconds** (20–30 clamp), fetch revalidation **15 seconds**, catalog default **90 seconds** (60–90 clamp), enriched candidates **60 seconds**. None explains D1 because no NFL fetch occurs for the short key. Phase 2 must inspect freshness/failure keys rather than blindly layer another full-catalog cache.
- Vercel CLI **59.11.7** was available. Historical runtime queries for the full incident window and narrow **12:19–12:22 UTC September 10** window both failed HTTP 400. Do not infer absent cron execution. No actual minute-by-minute cron/feed/client latency is certified.
- Sandbox DNS failed; automatic review approved network-enabled read-only capture/inspection. No approval rejection or pending permission exists. `.env.local` names-only inspection was used; values were never printed/inspected. Runtime `node --env-file=.env.local` consumes configuration without exposing it. No env file changes occurred.
- Do not modify `lib/supabaseAdmin.ts`, existing migration files or `vercel.json`. `supabase db push` targets linked production and was neither authorized nor run. Use existing auth flow for browser tests; do not weaken `proxy.ts`.
- No production cohort beyond the nine venue cards was queried. Broader NBA/NFL impact, historical swaps, runtime logs, exact first feed availability, historical client display, and live cadence remain unverified. These gaps do not block Phase 2.

## Exact run/test commands and results

Run from repository root. Existing dependencies were used; Node **v24.19.0**. No install or dependency update was needed. Offline tests/replay require no credentials or network. The read-only collector requires runtime `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BALLDONTLIE_API_KEY`; optional `BALLDONTLIE_API_BASE_URL`. Never print values.

```sh
git status --short
git branch --show-current
git rev-parse HEAD

# Actual original resolvers through the current NFL grader, network prohibited.
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct

# In-memory sweep and expected-failure requirements; no live DB writes.
npx vitest run tests/lib.sportsBingo.brunswick-incident.test.ts

# Baseline sports regressions.
npm run test:bingo-nfl
npm run test:bingo-mlb
npx vitest run tests/lib.sportsBingo.nba-fetch-failure.test.ts tests/lib.sportsBingo.nba-plays-fix.test.ts tests/lib.sportsBingo.wnba-row-shape.test.ts tests/api.cron.bingo-progress.test.ts

npx tsc --noEmit
npx eslint scripts/audit-bingo-brunswick-incident.cjs scripts/replay-bingo-brunswick-incident.cjs tests/lib.sportsBingo.brunswick-incident.test.ts
git diff --check

# Optional fresh read-only captures, not required to start Phase 2.
# Writes new private local files; all remote requests are GET.
node --env-file=.env.local scripts/audit-bingo-brunswick-incident.cjs
node --env-file=.env.local scripts/audit-bingo-brunswick-incident.cjs --coverage-only

# Local application, when implementing Phase 2 UI/API behavior.
npm run dev
```

| Verification | Result |
|---|---|
| NFL baseline, September 12 | **22 files / 289 tests passed**; `/tmp/bingo-phase1-nfl-tests.log`. |
| MLB baseline, September 12 | **11 files / 142 tests passed**; `/tmp/bingo-phase1-mlb-tests.log`. Suites overlap; don't sum them as unique tests. |
| Additional NBA/WNBA/fetch/cron, September 12 | **4 files / 33 tests passed**; `/tmp/bingo-phase1-basketball-tests.log`. |
| Final incident suite, September 13 | **1 file / 10 tests passed**, including **5 expected failures**; `/tmp/bingo-phase1-incident-tests.log`. These are evidence of unfixed requirements, not ten correctness passes. |
| Expected-failure assertion review, September 13 | Temporary copy changed `it.fails` to ordinary `it`: exactly **5 failed / 5 passed**, failures at intended D1/D2/D3/D4/D7 assertions. Temporary test deleted. Log `/tmp/bingo-phase1-required-failures.log`. |
| Offline replay | Normal mode exits 0; `--assert-correct` exits **1 intentionally**: 21 stored discrepancies, 1 direct-grader discrepancy, 1 label dispute, expected winning line true. Output matches saved artifact. |
| TypeScript + targeted ESLint | Both **passed September 13**; `/tmp/bingo-phase1-typecheck.log`, `/tmp/bingo-phase1-lint.log`. |
| Inventory/preservation/privacy checks | All 74 type kinds present in artifact/matrix, 25 original square payloads preserved, card preserved except account ID, 47 snapshot hashes/permissions verified, private account ID absent from public artifacts, `tmp/` ignored. |
| Documentation whitespace | `git diff --check` passed. New documentation links reviewed separately because new files are untracked. |

The collector was successfully exercised with live GETs September 12. Final local hardening adds nonzero exit status for incomplete captures and distinct consequence filenames for multiple players; those additional error/multi-player branches were syntax/lint reviewed, not exercised against live failure cases. They do not alter saved evidence. Logs in `/tmp` are ephemeral; durable results are the audit, fixtures and artifacts.

No full application build, full lint/test release suite, browser/device verification, production replay, repair or deployment was performed in Phase 1. Application source is unchanged. Phase 2 needs its own behavior checks; Phase 7 still requires the plan's complete release checks. When Phase 4 fixes defects, remove `.fails` for the corresponding requirements and revise assertions that characterize the old timeout result. D2's fixture contains designations but the current pure-grader API does not accept them; evolve the input deliberately instead of special-casing Arroyo's name.

## Recommended first steps for Phase 2

1. Read `CLAUDE.md`, `AGENTS.md`, `SYSTEM_CONTEXT.md`, the plan, this handoff, the audit and capability matrix. Confirm branch/status and preserve all uncommitted Phase 0/1 work. No need to repeat live incident capture to implement availability.
2. Trace `listSportsBingoGames` (`lib/sportsBingo.ts:8258`), `lib/sportsBingoLeagues.ts`, `app/api/bingo/{leagues,games,squares,cards}/route.ts`, and all `resolveLeagueBlockReason` callers. Follow actual imports to preview/submit paths; don't stop after editing the league endpoint.
3. Design a single creation-availability result that retains verified games and failure/completeness information. The shared provider client currently swallows failures into empty data unless the caller observes a failure box; Phase 2 must not claim successful-empty from a provider failure. Reuse candidate/catalog work so four leagues do not trigger redundant full builds on every click. Record provider request counts and elapsed time.
4. Follow both hosts: `components/bingo/SportsBingoSelectSport.tsx`, `SportsBingoSelectGame.tsx`, `CreateBoardSheet`, `lib/bingoPrefetchCache.ts`, `lib/bingoSelectedGameCache.ts`. Revalidate on reopen/resume/focus/local-date change, expire at kickoff/date boundaries, and clear a league/game that lost eligibility. The server remains authoritative at preview and submit.
5. Test zero/one eligible games for each league, locked/cancelled/final/unboardable games, timezone/midnight and kickoff crossing, partial failure, all-provider failure versus successful-empty, stale cache/direct URLs, old flag combinations, both creation hosts, and existing-board access when a league has no new games. Extend existing API and selector/cache tests named in the plan.
6. Keep D1's sport-key boundary in view: availability uses long supported keys while persisted board history uses `nba`/`nfl`. Preserve history filters and do not broadly change SQL or grading during Phase 2. If a narrow shared boundary change is necessary for creation, explicitly record it and run the incident suite; do not suppress a newly passing expected-failure test without understanding what changed.
7. Write `docs/bingo-pickem-reliability-plan_PHASE_2_HANDOFF.md` before marking Phase 2 complete or stopping part-way; update top/phase status and latest pointers. The next phase after it is Phase 3, recommended GPT-5.6 Terra / Medium. Phase 4 should consume D1–D7 and the matrix; final Phase 7 must publish verified behavior and the supported-square maintenance procedure in all three instruction/context files.

## Open questions / anything waiting on Andrew

**Nothing blocks Phase 2.** Historical log/provider/client gaps are documented evidence limits, not a request to repeat the audit. Phase 6 will need an explicit historical treatment for the punting label if still unresolved, and any production repair approval required by the current session after a concrete idempotent dry-run is prepared. That wording choice does not affect the independently established winning column. Real-device checks belong to the later UI/release phases; none was requested for this read-only investigation.
