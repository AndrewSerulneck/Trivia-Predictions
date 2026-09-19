# Bingo grading capability matrix

Phase 1 inventory, **2026-09-12**, source `783ebd2f07bffef05e086ef0687ec53f99377dbc`. This records what generation can emit and what evidence grading needs. **The historical rows are not a certification that every family is safe.** The Phase 4 executable contract immediately below now controls admission and grading. [Incident findings](bingo-brunswick-grove-2026-09-09-audit.md) establish the highest-priority fixes.

## Phase 4 executable contract — 2026-09-15 (local, not deployed)

This section supersedes the Phase 1 generation/defect descriptions below; those tables remain an audit of the old implementation. **37 of 74 typed kinds are admitted, including FREE (36 non-free); 37 are legacy-only.** Per-league counts including FREE: NBA 10, WNBA 10, NFL 32, MLB 12. These counts describe kinds, not square templates or calibration quality.

`lib/sportsBingoCapabilities.ts:bingoResolverCapability` is the admission authority. `supportedBingoCandidates` runs at base catalog construction, enriched catalog return and final selection in `lib/sportsBingo.ts`. Pregame stats are not required. Every new named-player rule requires a positive encoded provider ID (`name::ID`); numeric thresholds must be finite and new market lines must be half-points. Feature flags and odds cannot bypass admission. Phase 2 availability inherits the filtered catalog's existing minimum of 24 non-free candidates. Phase 5 must still prove composition quality and fallback feasibility.

All admitted kinds have captured-provider-shape tests in `tests/lib.sportsBingo.phase4-capabilities.test.ts` (136 cases, plus multiple parameter assertions per case). They use the four fixtures listed below. Tests cover determinate final results, complementary results, threshold equality, missing fields, appropriate partial/team/identity variants, OT/period boundaries, and corrections. The NFL original board also passes the offline replay and full mocked sweep. This is local grading-contract verification, **not live-feed delivery certification or a win-rate claim**.

### Admitted families and required evidence

Detailed field meanings and strict/inclusive comparisons in the original family tables still apply except where this section overrides them. Every whole-game stat includes overtime/extra innings; regulation-quarter/half rules exclude overtime.

| League | Admitted kind(s) | Required evidence / scope |
|---|---|---|
| All four | `free` | Center index 12 is hit without a feed. |
| All four | `moneyline`, `spread_more_than`, `spread_keep_close` | Matched game and both numeric scores; final. Moneyline tie is explicit void. Spread-keep-close is selected score + line > opponent, not absolute margin. |
| All four | `game_total_over`, `game_total_under`, `team_total_over`, `team_total_under` | Both scores known. Strict > / <; equality is miss for stored integer lines. Threshold crossing can update a provisional cell; final card waits for confirmation. |
| NBA/WNBA | `nba_player_stat_at_least` | Exact player ID and one of points/pts, rebounds/reb, assists/ast, steals/stl, blocks/blk, threes/fg3m, offensive_rebounds/oreb, defensive_rebounds/dreb, minutes_played/min. >= threshold. Absent field/player is unknown. Sparse null becomes 0 only with positive recorded minutes; missing minutes stay unknown. Minute parser output is minutes; normalized `minSeconds` now multiplies by 60. |
| NBA/WNBA | `nba_team_stat_at_least` | Only made_threes, total_assists, total_rebounds. Sum the corresponding counters of participating rows. Both teams need >=5 active rows and player point sums matching game scores. Every required counter must be known. |
| NFL | `player_prop` | Only the 14 `BINGO_NFL_PROP_MARKETS` listed in code and mapped in the original table. Both teams, unique positive player IDs, complete fetch and required numeric fields. Four cumulative yardage markets are final-only in both directions; other count thresholds can update provisionally. Passing TDs are not scorer TDs. Kicking points = 3 × field_goals_made + extra_points_made. |
| NFL | `nfl_player_anytime_td` | Required rushing/receiving/return/defensive TD fields, excluding passing TDs; complete player-stat contract. |
| NFL | `nfl_team_scores_every_quarter`, `nfl_team_shutout_quarter`, `nfl_team_quarter_points_at_least`, `nfl_any_quarter_scoreless` | Known regulation quarter columns and period closure. Team-shutout means the selected team scores zero in a quarter. Missing properties are unknown; explicit null can mean zero only when the score breakdown reconciles. |
| NFL | `nfl_team_leads_at_halftime`, `nfl_halftime_leader_loses` | Closed first half with both known scores; comparative final outcome also needs final game. Tied halftime is a miss for “leads,” explicit `tied_halftime` void for “halftime leader loses.” |
| NFL | `nfl_overtime`, `nfl_both_teams_score_at_least`, `nfl_margin_at_most`, `nfl_margin_at_least`, `nfl_second_half_higher_scoring` | Game scores / reconciled regulation columns as required. OT requires positive OT score or explicit OT status; a final reconciling regulation breakdown proves no OT. Populated zero OT alone proves nothing. Halves exclude OT. |
| NFL | `nfl_team_stat_at_least`, `nfl_team_stat_at_most` | Exactly two matched team rows and the requested field from all 16 `NFL_TEAM_STAT_FIELDS`. Missing is unknown. Yardage and ratios can fall and are final-only. |
| NFL | `nfl_combined_team_stat_at_least`, `nfl_combined_team_stat_at_most` | Both teams' penalties, penalty_yards or turnovers only; sum compared inclusively. Other combined fields are not admitted. |
| NFL | `nfl_team_perfect_red_zone`, `nfl_team_red_zone_trip_without_touchdown`, `nfl_team_possession_advantage` | Red-zone attempts/scores (scores means TDs), minimum trips, or both possession_time_seconds values. Final-only. |
| NFL | `nfl_game_max_stat_at_least`, `nfl_game_total_stat_at_least` | All 11 `NFL_PLAYER_STAT_FIELDS`; complete bilateral player rows with each required counter present. Maximum supports any_player and both_teams; both scopes have tests. Cumulative yardage is final-only. |
| NFL | `nfl_game_missed_field_goal`, `nfl_non_quarterback_pass_attempt` | Complete field_goal_attempts/field_goals_made or passing_attempts plus actual passer position. Unknown position cannot prove non-QB. |
| MLB | `player_prop` | Eight `BINGO_MLB_PROP_MARKETS`: hits, home runs, RBIs, runs, stolen bases, pitcher strikeouts, earned runs, pitcher outs. Exact player ID + required box-score field. `pitching_outs: 0` is preserved; fallback `ip` is baseball notation (5.2 = 17 outs), never decimal innings. |
| MLB | `mlb_webhook_player_event_at_least` | Box-score events hit/hits, home_run/hr, strikeout/k (batter), walk/bb, hit_by_pitch, rbi, stolen_base/stolen_bases, pitcher_out/pitching_outs or ip. Required count >= threshold; missing is unknown. |
| MLB | `mlb_webhook_player_event_at_most` | earned_run/er or hit_allowed/p_hits only, count <= threshold. Missing is unknown. |
| MLB | `mlb_webhook_team_event_at_least` | groundout/ground_outs, flyout/fly_outs, strikeout/k, walk/bb, hit_by_pitch, hit/hits. Sum batting rows with plate_appearances > 0; require runs and hits to reconcile with game team totals before grading. |

### Missing inputs, recovery and legacy rules

- Shared pagination discards **all** rows when any page fails, JSON/list shape is malformed, a cursor repeats, or the page cap is exhausted. A partial prefix is never treated as a complete list. Empty successful feeds remain distinguishable through failure boxes/telemetry.
- NFL zero inference for an absent row requires final game, exact game/team/player designation with `did_not_play === false`, complete unique bilateral player rows, and offense reconciliation against both team box scores (passing attempts/completions, rushing attempts/yards, receptions vs completions). `active: true`, an injury listing, or a roster alone cannot prove participation or zero. Current designation schema/filter meanings are documented by [BallDontLie](https://nfl.balldontlie.io/#get-player-designations).
- Pure `evaluateResolver` exposes missing final evidence as void + reason; **the persistence policy keeps it pending during recovery**. `planBingoSettlement` persists first final observation, last observation and square-index reasons. Final confirmation is >=60 seconds; incomplete final data gets 2 hours after first observed final. If the provider retracts final, confirmation resets. Absolute no-final deadline is 48 hours after scheduled start, replacing the old 12-hour cutoff. At expiration, undetermined cells become void with `grace_expired:<reason>`; voids do not count as marks.
- All provisional cell statuses are reevaluated on each active-card sweep. A winning line alone does not finalize the card while evidence is pending. Card finalization requires every square determined/explicitly void and confirmed final (or the 48-hour deadline). Terminal won/lost cards require explicit reviewed repair; `bypassCache` does not reopen them.
- All other typed kinds are excluded from new generation: basketball achievements/comparisons/plays/lineup/period families beyond the two rows above; all NFL play-derived kinds including first-TD; MLB quick-out and unsupported event parameters; `replacement_auto`. Stored payload parsing/evaluation stays available. Existing name-only joins retain legacy behavior and need individual review during repair; new rules require IDs.
- Legacy NFL play evaluation additionally requires a 0–0 kickoff prefix, a final marker matching the final score, plausible score evolution, and deduplication by play ID / provider chronology. Receiver/rusher participant IDs take priority. Reversed scoring evidence is unknown; an enforced end-zone safety can legitimately say “No Play.” Ambiguous or absent legacy evidence follows the same pending → reasoned void policy. MLB quick-out requires reviewed play evidence and is not inferred from counts.
- Persisted MLB `currentCount` is no longer authoritative in normal grading. Webhooks wake the same snapshot sweep as cron; admitted event counters derive from reconciled box scores. The historical MLB calibration adapter explicitly accepts complete `teamEventTotals` and shares `gradeMlbEventCount`; an absent total is not seeded to zero.
- New punt labels say “finish inside the 20.” The saved incident's “downed” wording is unchanged and remains a Phase 6 review dispute. New spread-keep-close wording describes winning or losing by less than the line.

### Persistence, delivery and maintenance

`supabase/migrations/20260914010000_bingo_atomic_grading.sql` adds `grading_state` and service-role-only `apply_sports_bingo_grading`. It locks the active card and all 25 cells, checks card revision, observation order and exact original resolvers, then updates cells/card/notification in one transaction. Invalid/stale/competing observations cannot partly update a board or repeat a win notification. Points remain in the existing claim path. Apply the migration **before** deploying the application, only after separate production authorization. No migration or production repair has been applied.

Each accepted changed game emits `bingo-game:<id>` / `card_updated`; the client reloads on subscription/reconnection/focus/online/visibility and every 30 seconds while visible. UI history trusts server status instead of inventing a loss at 6 hours. NFL live-stat animations are retained. Existing cron delivery was observed at 59.671–60.182-second intervals on September 14 UTC; see `phase4-artifacts/bingo-cron-cadence.json`. This proves the old deployment's cadence, not new-code latency.

Telemetry: `[sportsBingo][telemetry]` groups outcomes/reasons by league/kind, unavailable snapshots and maximum pending age by league; `[BallDontLie][feed_failure]` counts failures by league/feed family/reason without query strings or player identities. Use provider feed-family failures together with resolver-family unavailable reasons; these are structured logs, not a new metrics database.

To admit or change a square: retain its precise label and ID/field contract in this matrix; add a sanitized real provider capture and hit/miss/equality/missing/partial/correction tests; update `bingoResolverCapability` and only then its existing generator; replay all four leagues and the original incident; measure composition/calibration separately. Odds or synthetic-only tests do not establish capability. Preserve legacy parsing and document existing-board consequences. Phase 5 must fix the currently failing NFL calibration checks (trimmed 2025 fixtures cannot justify missing→zero); Phase 7 must verify actual webhook/cron-to-client latency and device behavior.

## Historical Phase 1 inventory (retained)

## How to read the inventory

Every row inherits its endpoint contract, identity joins, missing-data policy and period scope from the source code below unless explicitly overridden. This keeps the tables readable without hiding a missing-input policy behind “supported.”

- **S** = emitted by normal generation; **P** = emitted only with `BINGO_ALLOW_POSSIBLE_SQUARES=true`; **L** = legacy parse/evaluate only, no current generator. S is an existing label, not our verdict.
- **KEEP/FIX** = retain the useful rule after fixing the identified boundaries and proving required inputs. **RETIRE** = exclude from new generation until evidence exists; retain interpretation of stored resolvers. No pool was changed in Phase 1.
- **F** = final with complete required inputs. **Q/H** = closed regulation quarter/half. **E** = earliest evidence crossing a threshold, subject to corrections. Under/negative/comparative conditions generally need closure; an early irreversible failure is allowed only when the quantity truly cannot decrease.
- **Observed shape** means a real payload has the named fields. It does not prove live delivery, completeness in all games, corrections, all hit/miss edges, or statistical calibration. Synthetic and historical tests are distinguished from actual captures.
- The source of all resolver types is `lib/sportsBingo.ts:394` (`SportsBingoResolver`). Builders, typed fields and evaluator switch were inventoried, including flag-dependent branches and legacy-only kinds. Parameter variants are enumerated below the family rows.

The [source inventory artifact](phase1-artifacts/bingo-resolver-inventory-2026-09-12.json) accounts for **74 typed kinds: 70 generated including FREE (69 non-free), and 4 legacy-only kinds**. It records generator/file/line origins; league-specific gates and parameter variants remain in this matrix. The four kinds without current generation are `nba_team_players_scored_at_least`, `nba_player_zero_turnovers`, `nba_team_has_double_double`, and `replacement_auto`. A kind generated in one league can still be legacy-only in another (for example, basketball `player_prop`). Source review finished September 13; artifact names retain the September 12 evidence date.

**Global blocker D1:** the database trigger stores `nfl` and `nba`, but the engine's provider dispatch accepts `americanfootball_nfl` and `basketball_nba`. Every NFL/NBA row below inherits **FIX dispatch before claiming end-to-end support**. `listCardRows` also filters sport keys before reading; fixing an output mapping alone will not fix webhook/query filtering. WNBA/MLB are not shortened by the inspected canonical SQL function. Do not change the shared database function to fix Bingo.

**Delivery blocker D7:** the NFL cron can update cells without sending the `card_updated` event that reloads the client board; live-stat animations do not reload it, and the component has no periodic card polling. The UI's six-hour active-to-lost fallback also precedes the backend's twelve-hour timeout. Correct resolver output alone cannot certify visible live grading; Phase 4 must verify delivery, reconnect recovery and aligned finalization.

## Provider contracts and fixture evidence

Provider tier claims checked against official [NBA](https://docs.balldontlie.io/), [WNBA](https://wnba.balldontlie.io/), [MLB](https://mlb.balldontlie.io/), and [NFL](https://nfl.balldontlie.io/) documentation on September 12. Games are free-tier endpoints; player stats require ALL-STAR or GOAT; NBA/NFL plays and lineups/odds require GOAT where offered. Successful GETs below establish access for those endpoints in this environment, not account billing configuration. No subscription was purchased or changed.

| Source code | Endpoint and joins | Complete/missing/period contract | Actual fixture / observed coverage |
|---|---|---|---|
| G | `/{nba,wnba,mlb,nfl}/v1/games`; provider game ID + home/away team names/IDs + start time | Both scores and valid final status; NBA/NFL flat team scores, WNBA `home_score/away_score`, MLB `home_team_data.runs/away_team_data.runs`. Whole game includes OT/extra innings. Missing scores remain pending until timeout currently voids. | All four fixtures below, final games. No live cadence proof. |
| B | NBA `/nba/v1/stats?game_ids[]&period=0`; WNBA `/wnba/v1/player_stats?game_ids[]`; `player.id`, name ref `Name::id`, team identity | Cumulative game stats including OT. Distinguish absent row, explicit 0, nullable sparse field and failed/partial page. Current normalizer collapses numeric absence to 0; many absent-player outcomes miss at F. Desired: pending, bounded retry, reasoned void if still unknowable. | NBA 18448004: 33 rows; WNBA 24999: 22 rows. Full stat-key evidence captured; per-family behavior still needs Phase 4 tests. |
| BP | NBA/WNBA `/plays?game_id=<scalar>`; chronological period + scores + `scoring_play`, team | Need ordered complete prefix for first scorer; complete period for half/quarter conclusions. OT excluded for regulation quarters. Current `quarterExtrasAvailable` guards fetch failure but not every semantic gap. | NBA 495 plays, WNBA 386 plays, each one response without next cursor despite `per_page=100`; do not truncate locally to requested page size. |
| BL | NBA `/lineups?game_ids[]`; player ID, team, `starter` | Must establish actual non-starter, not assume missing lineup = bench. WNBA has no supported lineup path in shipped code. | NBA 18 rows captured. WNBA deliberately not requested; historical 404 evidence in older repair plan. |
| BQ | NBA `/stats?game_ids[]&period=1..4`; player ID across periods | First half = periods 1+2; any quarter = max 1..4, no OT. Do not treat missing period row or ignored filter as zero. | NBA period rows 17/16/17/16 captured. WNBA period filters historically ignored; generator already excludes these families. |
| M | MLB `/stats?game_ids[]` and `/lineups?game_ids[]`; player ID preferred then normalized name, team side | Whole game including extra innings; hitter versus pitcher fields must not mix. `ip` is baseball outs notation, not decimal innings. Null/DNP needs lineup/participation and completeness. | MLB 5059967: 32 stats, 20 lineup rows; `p_k`, `p_hits`, `er`, `pitching_outs`, `ip`, `k`, `bb`, `rbi`, `hr`, `ground_outs`, `fly_outs` observed. |
| ME | MLB webhook-derived resolver `currentCount`; `applyMlbWebhookPropEvent`, `applyMlbPlayerSnapshotEvent`; game+player ID/event or team-side join | Counts need snapshot reconciliation or durable deduped complete events. Current missing count defaults 0, final miss/hit follows from it. Polling a box score alone does not repair every event-counter resolver. Entire game includes extras. | MLB 572 raw plays/6 pages captured for future reconstruction; **not evidence of webhook delivery or event deduplication**. Existing `tests/lib.sportsBingo.mlb-webhook-events.test.ts` is controlled input coverage. |
| N | NFL `/stats?game_ids[]`; encoded player ID first, normalized-name fallback, team name/side | Cumulative including OT. Current absent row voids at F; null/undefined stat becomes 0. Need game-specific participation + completeness; D2/D3 show why neither absence nor every null can be uniformly zero-filled. | Original incident fixture: 60 rows, both teams; direct grader plus known failing absence tests. Historical `nfl-player-stats-2025.json` provides additional real shapes. |
| NT | NFL `/team_stats?game_ids[]`; join `team` to home/away | Require actual needed fields, both teams for combined/comparative rules. `parseNullableStatNumber` preserves missing fields; final unavailable currently voids. Whole game including OT. `sacks` = offense sacks taken; `red_zone_scores` = red-zone TDs. | Incident 2 rows; `nfl-team-stats-2025.json` and historical threshold-sweep artifacts. Postseason completeness not certified. |
| NP | NFL `/plays?game_id=<scalar>`; ordered `wallclock`, `period`, scores, clock and scorer/team attribution | Entire required prefix/period/game, not merely nonempty. Current cap=4×100; cap sets truncation, failed later page does not unless caller passes failure box (D4). Do not infer final misses from a partial feed. | Incident 179 plays/2 pages. `nfl-settlement-confidence.json` has historical scoring/safety examples. `participants` now observed; role completeness needs examination. |
| ND | NFL `/player_designations?season=2026&week=1&season_types[]=2&team_ids[]`; game ID+team ID+player ID | `active`, `starter`, `did_not_play` distinguish different facts; null means unknown. Updated timestamp is not first-publication timestamp. Must pair a confirmed participant with complete stat evidence to infer a legitimate zero. | Incident NE 55 and SEA 56 rows; Arroyo played but has no stats row. Not consumed by shipped Bingo. |

New real capture files (sanitized sports data, no player accounts):

- [bingo-brunswick-grove-2026-09-09.json](../tests/fixtures/bingo-brunswick-grove-2026-09-09.json): original board + NFL game **1392216**, final feeds and participation, captured **21:44 UTC September 12**. Also known as **I** below.
- [bingo-capability-nba-2026.json](../tests/fixtures/bingo-capability-nba-2026.json): Orlando at Boston **18448004**, April 12, final 108–113, stats/lineups/periods/plays.
- [bingo-capability-wnba-2026.json](../tests/fixtures/bingo-capability-wnba-2026.json): Washington at Las Vegas **24999**, August 12 UTC, final 76–86, stats/plays.
- [bingo-capability-mlb-2026.json](../tests/fixtures/bingo-capability-mlb-2026.json): Cincinnati at Los Angeles Dodgers **5059967**, September 10 UTC, final 1–14, stats/lineups/plays.

The last three are **representative final data**, not user boards and not independently officiated expected-result fixtures. Raw capture/HTTP manifests: ignored `tmp/bingo-incident-private/2026-09-12T21-50-36-367Z/`. Every endpoint completed successfully, including all six MLB play pages. NBA/WNBA returned >100 rows on one plays page with no continuation token. Do not equate requested page size with returned length or missing metadata with a proven complete football/baseball timeline.

## Common generated core families

Generator **C** = `buildGameAndCandidatesFromBallDontLie` (`lib/sportsBingo.ts:4644`). Every row uses G, home/away identity, whole game including OT/extras. Real fixtures exist for each league, but only incident determinate core outcomes were independently reconciled in Phase 1. Core half-point ladders generally avoid equality; existing integer resolvers still need explicit policy.

| League / family | Generator / new? | Required fields and exact hit/miss/push rule | Earliest safe / missing | Coverage / decision |
|---|---|---|---|---|
| All / `moneyline` | C / S | Selected score > opponent; equal = void | F; G missing policy | I matches; KEEP/FIX dispatch/recovery |
| All / `spread_more_than` | C / S | Selected minus opponent > line; equality currently miss | F | I matches; KEEP/FIX equality policy |
| All / `spread_keep_close` | C / S | Selected score + line > opponent, **not absolute margin**; equality miss | F | I matches, NFL label disagrees for large underdog win; FIX wording |
| All / `game_total_over` | C / S | Home+away > line; otherwise F miss | E hit/F miss; correction-aware | I matches; KEEP/FIX corrections |
| All / `game_total_under` | C / S | Home+away < line; >= line miss, no push | E irreversible miss/F hit | I matches; KEEP/FIX corrections |
| All / `team_total_over` | C / S | Selected score > line; otherwise F miss | E hit/F miss | I matches; KEEP/FIX corrections |
| All / `team_total_under` | C / S | Selected score < line; >= line miss | E irreversible miss/F hit | I matches; KEEP/FIX corrections |
| All / `free` | `buildBoardSquares` / S | Center always hit, no provider data | Creation | I verifies one at index 12; KEEP |

## Basketball families (NBA and WNBA unless narrowed)

Generator **BA** = `buildNBAAchievementCandidates` (`lib/sportsBingo.ts:5300`). B/BP/BL/BQ identify endpoint, tier, identity, real fixture, scope and missing policy above. All cumulative player/team stats include OT; period conditions below explicitly exclude it. Existing tests: `lib.sportsBingo.wnba-row-shape`, `nba-plays-fix`, `nba-fetch-failure`, `missing-data-voids`; these are not full real-fixture coverage for every family.

| League / family | Generator / new? | Exact required fields / rule | Earliest safe / missing exception | Coverage / decision |
|---|---|---|---|---|
| NBA+WNBA / `team_triple_double` | C / S | B: some player on selected team has >=10 in >=3 of pts,reb,ast,stl,blk | E hit/F miss; missing team completeness cannot prove no triple-double | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `any_triple_double` | C / S | Same as above, either team | E/F | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `nba_player_stat_at_least` | BA / S+P | B: selected metric >= threshold; metrics mapped below | E/F; absent player often currently miss | Observed fields; KEEP/FIX participation |
| NBA+WNBA / `nba_player_double_double` | BA / P | B: >=10 in >=2 of pts,reb,ast,stl,blk | E/F | Observed fields; KEEP/FIX participation |
| NBA+WNBA / `nba_player_triple_double` | BA / P | B: >=10 in >=3 of same stats | E/F | Observed fields; KEEP/FIX participation |
| NBA+WNBA / `nba_player_perfect_ft` | BA / P | B: ftm=fta and fta>=3 | First known missed FT → miss; F hit; require both fields | Observed fields; KEEP/FIX missing evidence |
| NBA+WNBA / `nba_player_perfect_fg` | BA / P | B: fgm=fga and fga>=4 | First known miss → miss; F hit | Observed fields; KEEP/FIX missing evidence |
| NBA+WNBA / `nba_player_triple_threat` | BA / P | B: pts,reb,ast all >=5 | E/F | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `nba_player_plus_minus_at_least` | BA / P | B: plus_minus>=threshold | **F**, plus/minus can fall; current early hit unsafe | Observed field; FIX settlement timing |
| NBA+WNBA / `nba_team_stat_at_least` | BA / S | B: generated made_threes=sum fg3m, total_assists=sum ast, total_rebounds=sum reb | E/F; require whole selected team for F miss | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `nba_team_three_pt_scorers` | BA / S | B: count players with fg3m>0 >= threshold | E/F | Observed fields; KEEP/FIX complete team |
| NBA+WNBA / `nba_team_outrebounds` | BA / S | B: selected sum reb > opponent sum reb, tie miss | F, both teams | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `nba_team_turnovers_at_most` | BA / P | B: sum turnover <= threshold | Above bound miss; F hit | Observed fields; KEEP/FIX completeness |
| NBA+WNBA / `nba_team_scores_first` | BA / S | BP: first real scoring play's team | First confirmed scoring prefix; unavailable F void | Observed plays; KEEP/FIX prefix completeness |
| NBA+WNBA / `nba_team_leads_at_halftime` | BA / S | BP: selected Q1+Q2 score > opponent; tie miss | H; never infer closure from current first-half lead | Observed plays; FIX verify half-closure semantics |
| NBA+WNBA / `nba_team_points_in_any_quarter_at_least` | BA / P | BP: max regulation-quarter score >= threshold | E hit/end Q4 miss; explicit complete periods | Observed plays; KEEP/FIX period completeness |
| NBA only / `nba_player_bench_scores` | BA / P | B+BL: actual starter=false and pts>=threshold | E hit after verified lineup; F miss; unknown lineup void | NBA real lineup; KEEP/FIX participation; WNBA RETIRE new (already excluded) |
| NBA only / `nba_player_points_first_half_at_least` | BA / P | BQ: sum pts periods1+2 >= threshold | E hit/H miss; not absent-row zero | NBA real periods; KEEP/FIX completeness; WNBA L |
| NBA only / `nba_player_assists_in_any_quarter_at_least` | BA / P | BQ: max ast periods1..4 >= threshold | E hit/end Q4 miss | NBA real periods; KEEP/FIX completeness; WNBA L |
| NBA only / `nba_player_steals_first_half_at_least` | BA / P | BQ: sum stl periods1+2 >= threshold | E hit/H miss | NBA real periods; KEEP/FIX completeness; WNBA L |

Basketball parameter inventory: generated `nba_player_stat_at_least` metrics **points→pts, rebounds→reb, assists→ast, steals→stl, blocks→blk, threes→fg3m, offensive_rebounds→oreb, defensive_rebounds→dreb, minutes_played→min** (parse `MM:SS`). Some larger thresholds and rebound splits are P. Typed **free_throws_made→ftm** and **two_point_fg→fgm−fg3m** have no current literal generator. Team metrics **points, blocks, steals, offensive_rebounds, field_goal_pct, free_throw_pct** are parseable legacy variants; generated team metric set is the three listed in the table. Percentage variants need final closure and attempted-shot denominators, not the common early threshold branch.

## MLB generated families

Generator **MP** = `buildMLBPlayerPropCandidates` (`:6278`, market feed plus fallback); **MH** = `buildMLBPlayerPropCandidatesFromRecentStats` (`:5631`); **MEG** = `buildMlbTeamEventCandidateTemplatesForBacktest` (`:5578`) mirrors MH's team events. G/M/ME contracts apply, including extra innings. Historical backtest counting is a different adapter from the live webhook counter path; do not certify one using only the other.

| Family / league | Generator / new? | Required fields / exact rule | Earliest safe / missing | Coverage / decision |
|---|---|---|---|---|
| MLB / `player_prop` | MP+MH / S | M, market mapping below; over > line, under < line; equality currently miss | E over hit/under miss, F opposite; missing row/snapshot F void | Real stats, existing prop tests; KEEP/FIX field completeness/participation |
| MLB / `mlb_webhook_player_event_at_least` | MH, `toMlbPlayerAchievementCandidate` / S | ME `currentCount >= threshold`; player ID + event hit/home_run/strikeout/walk/hit_by_pitch/rbi/stolen_base/pitcher_out | E hit/F miss; missing count presently 0 | Real underlying stats/plays, controlled webhook tests; FIX full recovery/dedupe |
| MLB / `mlb_webhook_player_event_at_most` | MH / S | ME `currentCount <= threshold`; generated earned_run/hit_allowed; strikeout is legacy-only parameter | E over-bound miss/F hit; missing count presently 0 creates false hit | Real p_hits/er, controlled events; FIX complete snapshots |
| MLB / `mlb_webhook_team_event_at_least` | MH+MEG / S | ME team-side count >=threshold for groundout/flyout/strikeout/walk/hit_by_pitch/hit/quick_out_under_3_pitches | E/F; requires complete count | Real stats for six regular events; FIX counters; RETIRE quick-out until pitch/at-bat attribution & recovery proven |

MLB prop mapping (from `MLB_PROP_TYPE_TO_MARKET_KEY` + actual normalizer):

| Provider market → resolver market | Required stat fields (current fallback aliases) |
|---|---|
| hits → `player_hits` | hits (h) |
| home_runs → `player_home_runs` | home_runs or hr |
| rbis → `player_rbis` | runs_batted_in or rbi |
| runs_scored → `player_runs` | runs (r) |
| stolen_bases → `player_stolen_bases` | stolen_bases (sb) |
| pitcher_strikeouts → `player_strikeouts_pitcher` | p_k (pitcher_strikeouts/p_strikeouts/so_pitcher), **not hitter k** |
| pitcher_earned_runs → `player_earned_runs` | earned_runs or er |
| pitcher_outs → `player_pitcher_outs` | pitcher_outs/p_outs/outs_recorded/pitching_outs, otherwise ip converted to outs |

ME hitter strikeout uses `k`, walks `bb`, hits allowed `p_hits`; never sum hitter and pitcher versions together. Team `home_run` is allowed by the union/parser but not emitted by current measured team-event lists. Quick-out needs a correctly completed out on fewer than three pitches; a generic pitch or a box-score out does not prove that rule.

## NFL generated player families

Generator **NPGen** = `buildNFLPlayerPropCandidates` (`lib/sportsBingo.ts:6498`), BDL `/nfl/v1/odds/player_props` quotes plus current injury exclusion and star selection. Odds access does not prove grading capability. N/ND/NP joins apply; all ordinary props include OT. Available new market list has **14 over/under types**, anytime TD, plus first TD when play families enabled. Legacy Odds API `player_pass_*`, `player_rush_*` etc labels do not imply supported new markets.

| Family | Generator / new? | Required fields / exact rule | Earliest safe / missing | Coverage / decision |
|---|---|---|---|---|
| `player_prop` (NFL) | NPGen / S | N+ND, mapping below, over > line / under < line, equality currently miss | E only for truly nondecreasing values; F opposite; D2 absent row void and D3 absent field zero are unsafe | I original props; FIX dispatch, participation/completeness and corrections |
| `nfl_player_anytime_td` | NPGen / S | N: rushing_touchdowns + receiving_touchdowns + kick_return_touchdowns + punt_return_touchdowns + interception_touchdowns + fumbles_touchdowns >=1; excludes passing TDs | E/F; absent row F void | I Maye correctly misses in direct replay; KEEP/FIX input proof |
| `nfl_player_first_td` | NPGen / S, play flag | NP: first actual 6-point scoring event, scorer-name ref; current parser leading scorer before yardage | First complete TD prefix; missing scorer void; no TD at F miss; OT included | I Raridon versus Stevenson; FIX prefix/completeness; investigate observed participants IDs |

| NFL prop market | Required N fields |
|---|---|
| passing_yards | passing_yards |
| passing_tds | passing_touchdowns |
| passing_attempts | passing_attempts |
| passing_completions | passing_completions |
| interceptions | passing_interceptions |
| rushing_yards | rushing_yards |
| rushing_attempts | rushing_attempts |
| receptions | receptions |
| receiving_yards | receiving_yards |
| rushing_receiving_yards | rushing_yards + receiving_yards, both need justified values |
| longest_rush | long_rushing |
| longest_reception | long_reception |
| fg_made | field_goals_made |
| kicking_points | 3 × field_goals_made + extra_points_made |

## NFL quarter, score and play specials

Generator **NS** = `buildNFLTeamGameCandidates` (`:4560`). S throughout. Play rows require `BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` (default on). G quarter fields are `home_team_q1..q4`, `visitor_team_q1..q4`, `home_team_ot`, `visitor_team_ot`; status/score reconciliation determines closed quarters. Null is not automatically a known scoreless quarter. Fixture I contains complete regulation columns; `nfl-settlement-confidence.json` supplies historical edge cases, but no live-proof blanket pass.

| Family | Source / exact rule | Earliest safe / scope / missing | Coverage / decision |
|---|---|---|---|
| `nfl_team_scores_every_quarter` | G: selected q1..q4 all >0 | Closed zero Q → miss; end Q4 hit; no OT; unknown F void | I quarter shape + tests; KEEP/FIX closure |
| `nfl_team_shutout_quarter` | G: selected one q1..q4=0 | Closed Q hit/end Q4 miss; no OT | Same; KEEP/FIX closure |
| `nfl_team_quarter_points_at_least` | G: selected max q1..q4 >=threshold (generated 14) | E/end Q4; no OT | Same; KEEP/FIX completeness |
| `nfl_any_quarter_scoreless` | G: both teams zero in same closed regulation Q | Q hit/end Q4 miss | Same; KEEP/FIX completeness |
| `nfl_team_leads_at_halftime` | G: selected q1+q2 > opponent; tie miss | H; unknown F void | I halftime scores; KEEP/FIX closure |
| `nfl_halftime_leader_loses` | G: halftime leader not final winner; halftime tie void, final tie counts leader not winning | F incl OT; needs known H | I cell9; KEEP/FIX recovery |
| `nfl_overtime` | G: OT columns/status/score consistency proves OT | OT confirmed hit/F miss; inconsistent breakdown void | I no-OT + historical tests; KEEP/FIX evidence |
| `nfl_both_teams_score_at_least` | G: min(home,away)>=threshold (20) | E/F, incl OT | I score shape; KEEP/FIX corrections |
| `nfl_margin_at_most` | G: abs(home−away)<line (3.5/7.5) | F incl OT; equality miss | I score shape; KEEP |
| `nfl_margin_at_least` | G: abs(home−away)>line (16.5) | F incl OT; equality miss | I score shape; KEEP |
| `nfl_second_half_higher_scoring` | G: total q3+q4 > total q1+q2; tie miss | H complete then E hit/end Q4 miss; **no OT** | I quarters; KEEP/FIX completeness |
| `nfl_first_score_is_field_goal` | NP: first actual score kind=FG | Complete scoring prefix; scoreless F miss; missing feed void | I first-score evidence; FIX D4 |
| `nfl_first_scorer_wins` | NP+G: first scoring team=final winner | F incl OT; scoreless/tied final miss | I evidence; FIX D4 |
| `nfl_non_offensive_touchdown` | NP: actual TD score delta and defensive/return type | E hit/F miss incl OT | Historical safety/scoring fixtures; FIX completeness/attribution |
| `nfl_fourth_down_conversion` | NP: fourth-down conversion detection from down/type/text/result | E hit/F miss incl OT | I plays; FIX validate penalty/no-play reversals |
| `nfl_long_touchdown` | NP: TD yardage>=resolver.yards | E hit/F miss incl OT | I plays + historical fixtures; FIX attribution/corrections |

## NFL flavor families

Generator **NF** = `buildNFLFlavorSquares` (`lib/sportsBingoNflFlavor.ts:537`) → `nflTeamFlavorSquares` / `nflGameFlavorSquares` (`:362,416`), S. Tier 3 obeys the same play flag. NT/N/NP contracts define endpoint, identity, real fixture and missing policy. Threshold registry has historical calibration artifacts, **not live delivery proof**.

| Family | Exact inputs / hit rule | Earliest safe / scope / current missing | Coverage / decision |
|---|---|---|---|
| `nfl_team_stat_at_least` | NT selected field>=threshold | E for allowlisted monotone fields/F otherwise; incl OT; missing F void | I net passing/possession; FIX yards can decrease |
| `nfl_team_stat_at_most` | NT selected field<=threshold | E over-bound miss if monotone/F hit; incl OT | I NT fields; FIX yards/corrections |
| `nfl_combined_team_stat_at_least` | NT both fields summed>=threshold | E/F, both teams required; incl OT | I NT + historical; KEEP/FIX completeness |
| `nfl_combined_team_stat_at_most` | NT both fields summed<=threshold | E over-bound miss/F hit; incl OT | Same; KEEP/FIX completeness |
| `nfl_team_perfect_red_zone` | NT red_zone_scores=red_zone_attempts and attempts>=minTrips | First failed trip miss/F hit; incl OT | I NT shape; KEEP/FIX synchronized inputs |
| `nfl_team_red_zone_trip_without_touchdown` | NT attempts>scores (not necessarily FG) | E hit/F miss; incl OT | I NT shape; KEEP/FIX synchronized inputs |
| `nfl_team_possession_advantage` | NT selected possession_time_seconds−other>=seconds | F incl OT, both sides required | I NT; KEEP |
| `nfl_game_max_stat_at_least` | N max across any player, or max on **each** team for both_teams, >=threshold | E/F incl OT; partial players cannot prove miss | I N + historical; FIX completeness and yards monotonicity |
| `nfl_game_total_stat_at_least` | N sum field across both teams>=threshold | E/F incl OT; empty F void, partial currently can miss | I punts; FIX D3 + downed label |
| `nfl_game_missed_field_goal` | N any field_goal_attempts>field_goals_made | E/F incl OT; missing fields currently 0 | I kickers; FIX synchronized completeness |
| `nfl_non_quarterback_pass_attempt` | N passing_attempts>=1 and known position_abbreviation !=QB | E/F incl OT; unknown positions skipped, no complete-miss proof | I cell20; FIX missing-position policy |
| `nfl_first_score_within_minutes` | NP firstScoreElapsedSeconds<=minutes×60 | Complete first-score prefix; no-score needs elapsed evidence; OT cannot qualify opening window | I cell6; FIX D4 |
| `nfl_score_in_final_minutes` | NP score clock within minutes of Q2 or Q4 end | E hit/closed target segment miss; **no OT**; clock unknown must remain unknown | I full play shape; FIX incomplete clocks/feed |
| `nfl_both_teams_lead` | NP homeLed and awayLed at some point | E/F incl OT | I full score sequence; FIX D4 |
| `nfl_lead_change_second_half` | NP lead change after halftime | E/F; current NP walk includes period>=3, **including OT** | I sequence + tests; KEEP/FIX document OT wording |
| `nfl_tied_after_halftime` | NP tie after halftime | E/F; period>=3 **including OT** in current walk | I sequence; KEEP/FIX OT wording |
| `nfl_winner_trailed_in_fourth` | NP winning team trailed in regulation Q4 + G final winner | F; final winner includes OT | I sequence; FIX completeness |
| `nfl_two_point_conversion` | NP real +2 paired with conversion evidence, not safety | E/F incl OT | I + historical `nfl-settlement-confidence`; KEEP/FIX D4 |
| `nfl_safety` | NP real +2 paired with safety evidence, not conversion/nullified play | E/F incl OT | Historical real safety fixtures; KEEP/FIX D4 |
| `nfl_goal_line_touchdown` | NP actual TD with start_yards_to_endzone<=yards | E/F incl OT; missing distance can't prove negative | I + historical; FIX completeness/penalty attribution |

NT generated field variants: `nfl_team_stat_at_least` uses **penalties, penalty_yards, turnovers, third_down_conversions, fourth_down_conversions, possession_time_seconds, total_yards, yards_per_play, first_downs, rushing_yards, net_passing_yards, total_offensive_plays, sacks, defensive_touchdowns**. `at_most` uses **turnovers, total_yards**. Combined-at-least uses **penalty_yards, penalties, turnovers**; combined-at-most uses **turnovers**. Dedicated red-zone families need **red_zone_attempts/red_zone_scores**. Registry has exactly **16** NT fields. All observed in I; numeric presence alone is not completeness proof. The monotone set currently includes net/rushing/total yards, which can fall on negative plays; Phase 4 must correct that assumption.

N flavor field variants: `max` uses **rushing_yards, receiving_yards, passing_yards, receptions, touchdowns, long_field_goal_made, field_goals_made, defensive_sacks, total_tackles**. Both-teams max currently emits passing_yards. `total` uses **punts_inside_20, defensive_interceptions, defensive_sacks**. `touchdowns` is the six-field sum listed for anytime TD. Registry has **11** fields in total. Each field exists (possibly null) in I or is derived; not every event occurs in I.

## Legacy-only families and parameters

These are not generation-capability evidence. Keep old resolver parsing and an explicit recovery/void policy; do not silently give them a different meaning.

| Family / league | Current rule / source | New-generation decision / missing behavior |
|---|---|---|
| `replacement_auto` / all | Always void, no provider | L, RETIRE from ordinary new generation; retained parser |
| `nba_player_zero_turnovers` / NBA+WNBA | B turnover=0 at F; missing player currently immediate miss | L, no current BA emission; FIX if retained for old boards |
| `nba_team_has_double_double` / NBA+WNBA | B some selected-team player double-double | L, no current BA emission; evidence/completeness required |
| `nba_team_players_scored_at_least` / NBA+WNBA | B number of players with pts>0 >=threshold | L, no current BA emission; evidence/completeness required |
| `player_prop` / NBA | B, `player_points/rebounds/assists/steals/blocks/threes/turnovers` and pts+reb/pts+ast/reb+ast/pts+reb+ast | L: no NBA player_prop generator remains in `getGameEntryWithCandidates`; BA milestone kinds supply players instead. Absent snapshot/row currently F miss; FIX legacy missing-data policy |
| `player_prop` / WNBA | No WNBA arm in generic prop support gate | L/unsupported; currently immediate miss. RETIRE new, explicit legacy void/recovery needed |
| NBA-only BL/BQ kinds on WNBA | Four BA branches deliberately gated `!wnbaMode` | L on WNBA; current missing unavailable inputs void at F. Preserve exclusion until provider evidence changes |
| Additional typed parameter values | Basketball metrics above; MLB team home_run, MLB at-most strikeout; old NFL Odds API names | L parameters, not a new supported family simply because parser accepts them |

## Maintenance and Phase 4 acceptance

1. Fix D1 across creation persistence, query filters, snapshot dispatch, webhook matching and live channel keys; test database-returned values, not only idealized generated keys. Keep Phase 2 availability built on the shared candidate path so capability exclusions affect game boardability automatically.
2. Use fixture provenance plus literal-label semantics to approve each generator family/parameter. Require missing/partial/zero, hit/miss/boundary and correction cases. Real final payloads must not be converted into invented historical live samples.
3. Add participation and completeness evidence where a stats row cannot prove a zero (I Arroyo). ND is available, but no blanket active→played or null→false conversion is safe.
4. Provide bounded delayed-final recovery and a deliberate settled-result repair path. Current active-only scans and hit/miss skipping mean direct correct evaluation does not imply corrected production state.
5. Recheck real NBA period/lineup scope, basketball half-closure logic, MLB webhook counter reconstruction and quick-out semantics. Family rows marked FIX/RETIRE remain unverified until these checks pass.
6. Keep this matrix beside the executable capability check and fixtures. Phase 7 must update `AGENTS.md`, `CLAUDE.md`, and `SYSTEM_CONTEXT.md` with the verified supported-square procedure. No runtime enforcement is introduced by this document.

Commands and final verification results: [Phase 1 handoff](bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md). Offline incident replay: `node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs`. Real-shape recapture: `node --env-file=.env.local scripts/audit-bingo-brunswick-incident.cjs --coverage-only` (GET only; private output; manually review/sanitize before committing).
