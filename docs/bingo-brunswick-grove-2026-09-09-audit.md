# Brunswick Grove Bingo audit — September 9, 2026

Evidence collected September 12, 2026; source review and checks completed September 13. Phase 1 of [the reliability plan](bingo-pickem-reliability-plan.md). **Investigation complete for the recovered board; historical live delivery remains unverified. No production repair or deployment performed.**

The recovered board should have a winning third column, but production recorded a loss. Two defects explain the result: the database's `nfl` sport key bypasses NFL fetching, and a participating player with zero receptions has no player-stat row, so the direct NFL grader cannot recognize his winning square. Current code reproduces every stored square outcome at the 12-hour timeout. The base reward on this board is **50 points**, unclaimed; restoring the win and awarding/claiming points belongs to Phase 6 after the grading fixes and repair review.

## Scope, identity, and preservation

- Venue confirmed by case-insensitive name search: **Brunswick Grove**, ID `brunswick-grove`.
- All **9** existing venue cards were retrieved, without a status or creation-date filter. Matching normalized game-ID text **or** NE/SEA matchup plus September 9–10 UTC start window yielded **one** original card: `314a6a4f-762f-499c-ac3a-9ddc2a3cd63a`.
- Provider game **1392216**, NE (team **1**) at SEA (team **31**), scheduled `2026-09-10T00:20:00Z` = September 9, 20:20 EDT. Stored `sport_key = nfl`, `game_id = 1392216` (bare string). No assumption about card creation date was used to filter records.
- Card created `2026-09-09T19:04:12.002533Z` (15:04 EDT), final status `lost`, probability `0.2972`, reward `50`, claimed/won-notified/near-win-notified/won-line fields all null. `settled_at = 2026-09-10T12:20:09.839Z`, last cron processed `12:20:09.995Z`, updated `12:20:10.045112Z`.
- All **25** squares recovered: **18 void, 6 miss, 1 free hit; 0 pending, 0 replaced**. Every `replaced_by_square_id` is null. In-place swaps have no historical resolver ledger here, so “original” means the actual persisted resolver captured now; absence of prior swaps cannot be proved solely from null replacement links. No generated sample substitutes for this board.
- Private snapshots: `tmp/bingo-incident-private/2026-09-12T21-42-16-453Z/` (first successful before-state) and `tmp/bingo-incident-private/2026-09-12T21-44-20-968Z/` (adds consequence/participation evidence). Files mode **0600**, run directories **0700**, under git-ignored `tmp/`. Each manifest records GET requests, statuses, page cursors, collection time, and SHA-256 of captured files. Preserve these for Phase 6; they contain the private player ID and unrelated venue history and must never be committed.
- The sanitized [fixture](../tests/fixtures/bingo-brunswick-grove-2026-09-09.json) retains the actual card/square IDs, labels, resolver JSON, probabilities, statuses, timestamps and provider fields. It excludes player-account identity and private consequence rows. Public professional-athlete names/IDs are required grading inputs.
- Snapshots are sequential read-only exports, not a transactional backup. Phase 6 must requery/version-guard the exact repair rows before apply. No undo log exists because no mutation occurred.

## Independent expected results

The [official Patriots box score](https://www.patriots.com/game-day/2026/reg-week1/patriots-at-seahawks/box-score) confirms SEA **13–10**, Holani's longest rush **9**, Shaheed **4** receiving yards, Henry **3** receptions, and Darnold's participation without a rush. The [official gamebook](https://static.clubs.nfl.com/image/upload/patriots/lmdmzornxr5pgi90xvmi.pdf), pages 1–3, supplies the missing participation, first-score, possession and punting evidence: Arroyo appears among substitutions (not DNP), NE led **7–0** at half, and Raridon scored first at **Q2 9:11**. The final receiving ledger has no Arroyo reception.

The independently checked winning column is zero-based **[2, 7, 12, 17, 22]**: margin below 9.5, Patriots below 24.5, FREE, Arroyo zero receptions, Darnold longest rush below 5.5. It does **not** depend on the disputed punting wording below. A direct current-code NFL replay gets four hits and a void in that column; the stored board gets one hit, two voids and two misses.

Under the **stored resolver meanings**, the expected total is **11 hits (including FREE), 14 misses, no voids**. Direct NFL replay is **10 hits, 14 misses, 1 void** (Arroyo). Production differs from expected on **21/25** cells, including **3 wrong misses** (17, 18, 22); the other 18 differences are voids with determinate expected results. Correct misses 13, 15 and 23 match by coincidence: the persisted-key path never loaded their stats. This is not a grading accuracy estimate for other games.

**Punting wording dispute (cell 1):** the resolver counts `punts_inside_20` (six), while the label says “downed” (one actual downed punt). Inside-20 includes fair catches and out-of-bounds punts. Literal-label expected result is **miss**; stored-resolver expected result is **hit**. Both interpretations are retained in the fixture. Phase 4 must clarify future wording, and Phase 6 must explicitly choose treatment for this historical cell; never silently rewrite the original. The winning column is unchanged either way.

## Every recovered square

Indices are zero-based. “Expected” means original resolver semantics; the punting exception is above. “Replay” calls the real NFL normalizers/grader directly on complete final provider input, **bypassing the broken stored-key routing**. Original complete resolver objects and all timestamps are in the linked fixture. Non-free square creation time is `2026-09-09T19:04:12.091954Z`; all non-free resolutions below are on **2026-09-10 UTC**. FREE resolved `2026-09-09T19:04:12.062Z`.

| Cell / original square ID | Displayed rule / resolver kind | Stored → expected / direct replay | Evidence | Stored resolution time UTC | Earliest safe football point |
|---|---|---|---|---|---|
| 0 / `4c5c76fd-059a-48b8-a03f-011fe79df0c8` | Patriots pass for 210+ yards. / `nfl_team_stat_at_least` | void → **miss** / miss | NE net passing 168 < 210 (gross 178 also below threshold). | 2026-09-10T12:20:08.761+00:00 | final |
| 1 / `535237b8-7dfe-404f-a4db-53d6fb0826d0` | 3+ punts downed inside the 20. / `nfl_game_total_stat_at_least` | void → **hit** / hit | 6 punts inside the 20 (3 per punter). Literal downed wording differs: only one downed punt; see labelDispute. | 2026-09-10T12:20:08.801+00:00 | Q1 1:28 third inside-20 punt |
| 2 / `a577d075-3a89-426d-9646-35cd181532bd` | Final margin under 9.5 points. / `spread_keep_close` | void → **hit** / hit | Final margin 3 < 9.5; NE + 9.5 > SEA. | 2026-09-10T12:20:08.643+00:00 | final |
| 3 / `c1e9ebe9-9ef1-4f3e-a6b7-732143351885` | Total points: over 50.5. / `game_total_over` | void → **miss** / miss | Final combined score 23 <= 50.5. | 2026-09-10T12:20:08.685+00:00 | final |
| 4 / `cb98a377-0022-4bc1-8077-36ef36d9bc1c` | Seahawks win by 5.5+ points. / `spread_more_than` | void → **miss** / miss | SEA wins by 3, not more than 5.5. | 2026-09-10T12:20:08.845+00:00 | final |
| 5 / `29458800-c870-4a84-b906-997efada9861` | Patriots hold the ball for 30+ minutes. / `nfl_team_stat_at_least` | void → **hit** / hit | NE possession 34:17 = 2057 seconds >= 1800. | 2026-09-10T12:20:08.921+00:00 | threshold time unknown; final proves hit |
| 6 / `1d6447af-53c7-4e29-8961-512105433f7b` | First score inside the opening 6 min. / `nfl_first_score_within_minutes` | void → **miss** / miss | First score Q2 9:11, elapsed 20:49, after opening six minutes. | 2026-09-10T12:20:08.963+00:00 | Q1 9:00 scoreless |
| 7 / `29ed638f-2f66-48f6-8ed8-4b0fc5ceda93` | Patriots: under 24.5 points. / `team_total_under` | void → **hit** / hit | NE final score 10 < 24.5. | 2026-09-10T12:20:09.005+00:00 | final |
| 8 / `8564ac9b-0aa7-4d85-968d-18168de70a57` | Seahawks: over 18.5 points. / `team_total_over` | void → **miss** / miss | SEA final score 13 <= 18.5. | 2026-09-10T12:20:09.043+00:00 | final |
| 9 / `36c3b4f2-3345-40eb-b564-b41fb51a8d09` | The halftime leader does not win. / `nfl_halftime_leader_loses` | void → **hit** / hit | NE led 7-0 at half; SEA won 13-10. | 2026-09-10T12:20:09.109+00:00 | final |
| 10 / `02832456-37b9-4077-ab46-2725b5d34cfe` | Patriots to beat Seahawks. / `moneyline` | void → **miss** / miss | NE lost 10-13. | 2026-09-10T12:20:09.193+00:00 | final |
| 11 / `ba9d57f5-e4f1-4473-b202-8170df0a7ada` | Total points: under 44.5. / `game_total_under` | void → **hit** / hit | Final combined score 23 < 44.5. | 2026-09-10T12:20:09.232+00:00 | final |
| 12 / `e4872204-17af-4a5e-b00d-022408beb99c` | FREE / `free` | hit → **hit** / hit | Original free center. | 2026-09-09T19:04:12.062+00:00 | creation |
| 13 / `da77da61-d92e-4576-819e-c2cec870db53` | George Holani is held under 8.5 yards on his longest run. / `player_prop` | miss → **miss** / miss | Holani longest rush 9 >= 8.5. | 2026-09-10T12:20:09.275+00:00 | first 9-yard run; exact feed availability unknown |
| 14 / `0fbaa82d-2de2-49dd-9427-70c5fd4990be` | Drake Maye scores a touchdown. / `nfl_player_anytime_td` | void → **miss** / miss | Maye threw a TD but scored no rushing/receiving/return TD. | 2026-09-10T12:20:09.321+00:00 | final |
| 15 / `f8427bca-245d-4726-85eb-da2b25344448` | Rashid Shaheed: at least 32 receiving yards. / `player_prop` | miss → **miss** / miss | Shaheed receiving yards 4 <= 31.5. | 2026-09-10T12:20:09.416+00:00 | final |
| 16 / `d7c141b8-40a6-4048-ad92-67d66ca6654d` | Seahawks win by 7.5+ points. / `spread_more_than` | void → **miss** / miss | SEA margin 3 <= 7.5. | 2026-09-10T12:20:09.462+00:00 | final |
| 17 / `3ecbb999-957f-4808-b328-d7656c423806` | Elijah Arroyo: 0 receptions. / `player_prop` | miss → **hit** / void | Arroyo participated (gamebook substitutions; designation did_not_play=false), zero receptions; absent from stat rows. | 2026-09-10T12:20:09.512+00:00 | final plus participation evidence |
| 18 / `dcaab1a1-ca3a-4dae-bc1f-8e555fdc6cdf` | Sam Darnold: under 2.5 rushing attempts. / `player_prop` | miss → **hit** / hit | Darnold started, attempted two passes, no rushes before injury; null provider rushing fields require corroboration. | 2026-09-10T12:20:09.55+00:00 | final |
| 19 / `e3b79065-1345-4de7-91ff-e65946285361` | Total points: over 41.5. / `game_total_over` | void → **miss** / miss | Final combined score 23 <= 41.5. | 2026-09-10T12:20:09.621+00:00 | final |
| 20 / `729b5bb2-3ba4-4357-a106-5e2dff3bb6d1` | A non-quarterback throws a pass. / `nfl_non_quarterback_pass_attempt` | void → **miss** / miss | Only Maye, Darnold and Lock attempted passes; all QBs. | 2026-09-10T12:20:09.662+00:00 | final |
| 21 / `8f052a24-05dc-4066-8066-4aeef090b1a1` | Seahawks to beat Patriots. / `moneyline` | void → **hit** / hit | SEA won 13-10. | 2026-09-10T12:20:09.707+00:00 | final |
| 22 / `a29f0626-1a95-4d40-914d-5484d00db213` | Sam Darnold is held under 5.5 yards on his longest run. / `player_prop` | miss → **hit** / hit | Darnold had no rushing attempt; longest rush zero under milestone semantics, supported by complete gamebook. | 2026-09-10T12:20:09.752+00:00 | final |
| 23 / `cffce68f-bd7b-4f56-ba91-0eb20c74ddc3` | Hunter Henry: at least 4 receptions. / `player_prop` | miss → **miss** / miss | Henry caught 3, below 4. | 2026-09-10T12:20:09.797+00:00 | final |
| 24 / `4f8e8688-b1f9-4bec-9b95-a2c289ff023d` | Rhamondre Stevenson scores the game's first TD. / `nfl_player_first_td` | void → **miss** / miss | First touchdown scorer was Eli Raridon, not Stevenson. | 2026-09-10T12:20:09.844+00:00 | Q2 9:11 first TD |


The last column is a rule/evidence boundary, **not a measurement of provider publication time or client latency**. No historical minute-by-minute feeds or browser screenshots survived in the inspected artifacts. For final-only conditions, the postgame gamebook and final provider rows establish the outcome, not exactly when the application could first have known it. Darnold leaving injured does not itself safely settle an under before final; return to play remained possible.

## Evidence acquisition and completeness

Collector: [scripts/audit-bingo-brunswick-incident.cjs](../scripts/audit-bingo-brunswick-incident.cjs). Uses only GET, no application imports, no RPCs or writes. Configuration is consumed with the repository's `node --env-file=.env.local` convention without inspecting/printing values. Sandbox DNS initially returned `ENOTFOUND`; the network-enabled read-only run succeeded through automatic approval review. Nothing was rejected by approval review.

Successful main capture started **2026-09-12T21:44:20.968Z**. Exact per-request timestamps and final cursor metadata are in its private manifest and per-feed envelopes:

| Provider endpoint / filters | Rows / pages | Result and limitations |
|---|---|---|
| `/nfl/v1/games/1392216` | 1 / 1 | HTTP 200, final status; teams and date match stored board |
| `/nfl/v1/stats?game_ids[]=1392216` | 60 / 1 | HTTP 200, complete pagination; presence does not establish every player's participation or non-null field |
| `/nfl/v1/team_stats?game_ids[]=1392216` | 2 / 1 | HTTP 200, both teams, all incident-required fields populated |
| `/nfl/v1/plays?game_id=1392216` | 179 / 2 (100 + 79) | HTTP 200 both pages, first next cursor **11235876**, terminal cursor null; raw play IDs/wallclocks preserved |
| `/nfl/v1/player_designations?season=2026&week=1&season_types[]=2&team_ids[]=31` | 56 / 1 | HTTP 200; game-specific SEA participation, including Arroyo/Darnold |
| Same designations query, `team_ids[]=1` | 55 / 1 | HTTP 200; NE participation |
| `/nfl/v1/players?team_ids[]=31` | 496 / 5 | HTTP 200; historical player directory, **not current active roster** |
| Same player directory, `team_ids[]=1` | 373 / 4 | HTTP 200; cannot certify game-day availability |
| `/nfl/v1/player_injuries` | 315 / 4 | HTTP 200; current snapshot only, not September 9 pre-kickoff evidence |

The provider's [game-specific designation contract](https://nfl.balldontlie.io/#player-designations) distinguishes active from participated and exposes game/team/player IDs. Arroyo **13874289**, Darnold **70**, Holani **278427**, Maye **279866**, Henry **911**, Shaheed **640**, Stevenson **499** match original encoded player refs. Arroyo's `active=true`, `starter=false`, `did_not_play=false`; no row exists for him in the complete player-stat response. Designation `updated_at=2026-09-10T03:30:41.449Z` is not proof of the first availability time.

**Important newly available contract:** current NFL play responses include `participants` with player IDs, and the docs expose `player_designations`. The older engine comments say plays have no player-ID route. Phase 4 should inspect which participant roles are reliable before replacing scorer-name parsing; don't trust old “unavailable” prose or assume every play supplies a scorer participant.

## Deployed code and logs

- Local branch `main`, HEAD `783ebd2f07bffef05e086ef0687ec53f99377dbc`.
- Read-only Vercel inspection on **September 12** identified production as **`dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`**, ready, created **2026-09-09T17:55:25.369Z**, URL `https://hightop-challenge-fyzq2q4z1-andrewserulnecks-projects.vercel.app`, aliases include `hightopchallenge.com` and `play.hightopchallenge.com`. Deployment was not rechecked on September 13.
- Build log identifies branch `main`, commit **`d282bd35decbadbbf6d5924477361f6b82fe4e01`**. `git diff d282bd3 HEAD --stat` shows only two documentation/artifact files; the gameplay code used in this audit is identical to that deployment's repository source. Deployment history/alias movements during the game were not separately audited.
- Protected metadata/build logs: `tmp/bingo-incident-private/deployment.json`, `deployment-build-stderr.txt` (Vercel prints build logs on stderr), and related files.
- Historical runtime-log lookups both failed **HTTP 400**, for the full incident window and a three-minute settlement window without a text query. Files: `cron-logs-stderr.txt`, `cron-logs-retry-stderr.txt`. No runtime log contents recovered; **do not infer that the cron did not run**. Card timestamps and the matching offline timeout reproduction establish persistence behavior, but do not certify the one-minute cadence or historical provider health.

## Pipeline and ranked defects for Phase 4

1. **D1 — Critical, proven incident cause: database/engine sport-key mismatch.** `supabase/migrations/20260512021000_nba_provider_identity_bridge.sql:13` maps `basketball_nba → nba` and `americanfootball_nfl → nfl`. `20260512024500_enforce_canonical_sport_keys.sql` adds the card INSERT/UPDATE trigger. `listCardRows` (`lib/sportsBingo.ts:9020`) casts fetched rows without normalizing. `SPORT_PATH_BY_KEY` (`:1149`), `isBasketballSportKey` (`:1319`) and the NFL branch in `refreshSportsBingoProgress` (`:11289`) accept long keys only. `getScoresBySportKey` (`:10803`) returns an empty map for `nfl`; NFL stats/injuries/broadcasts never run. Before 12 hours the sweep returns without resolving a cell; at 12 hours its null-score fallback reproduces **all 25 stored statuses exactly**. NBA has the same source-level mismatch; its incident cohort is not sized here. Fix the read/query boundaries deliberately; do not change the shared database canonicalization ad hoc. Test actual persisted keys and webhook filters as well as long-key synthetic fixtures.
2. **D2 — Critical, proven second blocker for this winning board: no-stat participant versus DNP.** `findNFLPlayerStatLine` + `player_prop` (`:9213`) void any absent row at final. Arroyo participated with zero catches, and his square is required for the winning column. Join game-specific participation with complete statistic evidence. `active=true` alone is insufficient; never zero-fill every absent player.
3. **D3 — High, reproduced input defect: absent field becomes zero.** `parseStatNumber` (`:2368`) collapses null, undefined and malformed values to zero in `buildNFLGameStatsSnapshot`. A deliberately incomplete variant of the real Holani row with `long_rushing` removed falsely turns his under square from miss to hit. Darnold's *actual* null rushing values correspond to zero only after official corroboration; don't forbid all null-as-zero interpretation or assume all nulls mean zero. Add participation/completeness-aware semantics across leagues.
4. **D4 — High, reproduced fetch defect: partial page failure appears complete.** The shared client returns accumulated rows after a failed page and only sets `failure` if supplied. NFL plays supplies a `truncation` box but no failure box (`:3585`). The reproduction serves an initial prefix of real plays and then HTTP 503; `truncation=false`, and the grader falsely settles a first-TD event as miss from the partial walk. This is a constructed failure case, not evidence the incident feed failed. Propagate failure and completeness separately from cap truncation; also inspect player/team-stat callers.
5. **D5 — High, proven recovery limitation: settled cards are never revisited.** The sweep requests `activeOnly=true`; even `bypassCache=true` scans zero rows for this stored `lost` card. Within an active card, hits/misses are skipped; only selected void families regrade (`:11433`). Final with no pending cells records loss even if the only unavailable cells could recover. Fixing dispatch alone will not repair the historical card. Design bounded late-data recovery plus explicit idempotent Phase 6 reconciliation of status, notifications and points.
6. **D6 — Medium, observed rule/copy mismatch:** “punts downed inside the 20” counts all `punts_inside_20`. Fixture preserves literal miss and resolver hit. Another source-level wording risk is NFL `spread_keep_close`: “Final margin under N” is rendered from a one-sided handicap resolver, which would hit on a large underdog win. It happens to agree on this game (margin 3); add a counterexample before changing future labels.
7. **D7 — High, reproduced delivery defect independent of D1:** an NFL progress sweep can persist square changes without broadcasting `bingo-game:1392216` / `card_updated`. The client reloads cards on that event, but only the NBA/WNBA/MLB webhook route sends it (`app/api/webhooks/balldontlie/route.ts:137,288`). NFL `stat_update` broadcasts animate player events without reloading square statuses. A dispatch-corrected in-memory variant of the incident updates all 24 non-free squares but sends no card update. Fix the server/client delivery contract and recovery after missed events. This is source/replay evidence, not a historical screenshot of the incident.

Additional matrix review risks, not incident causes: yards and plus/minus can decrease (early monotone settlement assumptions); NBA percentage milestones are not monotone; missing player/team completeness can produce false negative game-wide aggregates; MLB event counters need proven delivery/deduplication and recovery. These need Phase 4 evidence/tests, not an unsupported claim that every family is broken.

## Cache, delivery, finalization, and client observations

- NFL snapshot cache: **5 seconds** (`NBA_PLAYER_STATS_CACHE_MS`, shared name), game + optional-play/team-stat coverage. Score cache **20–30 seconds** (default 30); fetch cache revalidation **15 seconds**. Catalog cache **60–90 seconds** (default 90), enriched candidate entry **60 seconds**. These do not explain this incident: the bad key avoids all NFL provider calls.
- Cron `/api/cron/bingo-progress` invokes `refreshSportsBingoProgress({limit:500})`; `vercel.json` configures every minute. No configuration was changed or live cron endpoint invoked during audit (GET would write too).
- NBA/WNBA/MLB webhook integration remains separate; no NFL webhook handler. `lib/ballDontLieClient.ts` is the Bingo client's actual import; similarly named `lib/balldontlie.ts` is not the client to patch for D4.
- Null-score timeout is **12 hours after scheduled start**; fallback forces unresolved cells to void. NFL `player_prop` with key `nfl` instead hits the unsupported generic branch and returns miss. Card `settled_at` is scheduled start + **12:00:09.839**, consistent with that branch.
- `SportsBingoHome.tsx:1334` subscribes to `bingo-game:<id>` / `card_updated` to call `loadCards`; `live-stats:<sportKey>` / `stat_update` only queues animations. **There is no periodic card polling in this component**: its 60-second interval updates the local date, despite stale comments referring to card polling. Cards load initially and on explicit actions/kickoff refreshes. A short stored sport key can also select the wrong live-stat channel. D7 leaves an open NFL board without a reliable trigger to fetch changed cells.
- A separate UI fallback treats an active card as lost after **6 hours** from scheduled start (`BINGO_GAME_BUFFER_MS`, `components/bingo/bingoBoardShared.tsx:244`; `SportsBingoHome.tsx:1431`), earlier than the backend's 12-hour timeout. Phase 4 must align display and settlement/retry semantics. No historical screenshot/telemetry establishes which display path the player saw.
- Current `claimSportsBingoReward` atomically marks a claim then separately applies campaign points and updates user totals. Phase 6 must not casually call it as a repair primitive: partially failed claims, duplicate notifications, venue attribution, and existing claims need explicit before/after guards.

## Reward and points consequences (read-only)

The card has no claim or win notification. One stored loss notification was recovered for its player in the incident window. Venue-scoped campaign progress, cycle winners, and redemptions queries each returned **0 rows**. Current player points are preserved privately; they are a cumulative total, not a before-game ledger. No exact historical points delta can be reconstructed from a mutable total alone. The expected correction is **lost → won**, winning third column, and eligibility for the card's **50 base points**; no points were issued by this audit. Phase 6 must recheck multipliers, claims and all dependent state at repair time. No redeemed prize clawback case was found in these scoped records.

## Offline reproduction and checks

```sh
# No .env.local and no network: real original resolvers through the shipped NFL grader.
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs
# Intentionally exits 1 today: one grader discrepancy plus one label dispute remain.
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct
# Actual progress sweep writes ONLY to the mocked in-memory database.
npx vitest run tests/lib.sportsBingo.brunswick-incident.test.ts
# Read-only fresh private evidence capture (network access required).
node --env-file=.env.local scripts/audit-bingo-brunswick-incident.cjs
node --env-file=.env.local scripts/audit-bingo-brunswick-incident.cjs --coverage-only
```

The direct replay output is saved as [sanitized reconciliation JSON](phase1-artifacts/brunswick-grove-incident-replay-2026-09-12.json). Ten incident tests pass, including **five `it.fails` known failing requirements** (D1–D4 and D7). These expected failures document unfixed defects; remove `.fails` and update the characterization assertions as Phase 4 fixes them. They are not ten correctness passes.

Baseline: NFL **22 files / 289 tests passed**, MLB **11 files / 142 tests passed**. Additional NBA/WNBA/provider/cron checks **4 files / 33 tests passed**. `npx tsc --noEmit` passed. Targeted ESLint passed for the new scripts/test. No application source changed, so full app build/lint/test release checks remain Phase 7. See [Phase 1 handoff](bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md) for final command results and next steps.

Remaining evidence gaps: historical runtime logs and feed availability, historical client rendering, definitive live cadence/latency, and broader affected NBA/NFL cohort. These do not block Phase 2 availability work or the demonstrated Phase 4 fixes. No production repair is represented as complete.


## Phase 4 local verification update — 2026-09-15

The original sanitized board and saved resolver/label evidence remain unchanged. The repaired
local evaluator plus complete captured participation evidence returns **11 hit / 14 miss**,
zero resolver discrepancies, and the winning column **[2, 7, 12, 17, 22]**. The offline output
is `docs/phase4-artifacts/brunswick-grove-incident-replay-2026-09-14.json`; assertion command:
`node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct`.
The original persisted-short-key sweep is covered by `tests/lib.sportsBingo.brunswick-incident.test.ts`,
including delayed final participation, provisional corrections, bounded void recovery and delivery.

The square-1 downed/inside-20 wording dispute remains explicit and unchanged. No production card,
points, reward or notification was repaired, and none of the new code/migration is deployed.
Read-only cron logs establish the existing deployment's roughly one-minute cadence on September 14
UTC; they do not establish the incident's historical feed state or new-code client latency.
See `docs/bingo-pickem-reliability-plan_PHASE_4_HANDOFF.md` and the updated capability matrix for
as-built contracts, migration order, remaining calibration/test failures and Phase 5/6/7 boundaries.
