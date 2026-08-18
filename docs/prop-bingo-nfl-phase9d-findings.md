# Phase 9d findings — the MLB prop repair and the MLB star index

**Date:** 2026-08-17. **Plan:** `docs/prop-bingo-nfl-plan.md` §9d.
**Scope decided with Andrew before starting:** full fix first (repair the MLB player-prop path,
re-measure the win rate), then the star port. And one design question that Phase 9c left open was
answered once, for both sports: **a feed failure degrades to no tilt; the committed snapshot is
never read as a runtime fallback.**

---

## 1. Phase 7 note 4 was four bugs, not a dead endpoint

Two phases recorded that MLB named-player squares were absent from every production board
(`named_candidate_pool_size: 0`) and attributed it to "`/mlb/v1/player_props` 404s". Probed live
against the real balldontlie MLB surface on 2026-08-17, the endpoint is not missing — Prop Bingo was
asking for it four different ways wrong at once, which is exactly why no partial fix ever surfaced
it:

| # | Bug | Evidence |
| --- | --- | --- |
| 1 | **The route does not exist.** `/mlb/v1/player_props` → `404 {"error":"Route not found"}`. The real one is `/mlb/v1/odds/player_props`, mirroring NFL's `/nfl/v1/odds/player_props` exactly. | live probe |
| 2 | **The parameter is wrong.** That route takes a scalar `game_id`; `game_ids[]` is rejected with `400 game_id must be an integer`. | live probe |
| 3 | **The row schema is wrong.** The parser read `market_key` / `line` / `over_odds`; the payload is NFL-shaped — `prop_type` / `line_value` / `market.{type, odds \| over_odds, under_odds}` — and the vocabulary is `hits` / `home_runs` / `rbis`, not the internal `player_hits` keys it matched against. | live probe |
| 4 | **There is no player object on the row**, only `player_id`, so even a parsed row had no name to build a square from. | live probe |

A live game returns **718–1,621 prop rows across six sportsbooks** (fanduel, draftkings, betmgm,
caesars, fanatics, betrivers — all already on the odds vendor allowlist) covering ~28 prop types.
This is a rich surface Prop Bingo had simply never read.

**A fifth problem, fixed in the same change because shipping without it would have been worse than
shipping nothing:** the old path used **raw implied odds**, the pre-existing vig bug flagged in Phase
2's handoff note 2 and re-flagged in Phase 5. Routing MLB through the same
`computePlayerPropMarkets` consensus the NFL path uses de-vigs every two-way price. Turning the feed
back on without this would have put ~700 systematically overstated prop rows onto every MLB board.

### What shipped for it

- **`lib/sportsBingoOdds.ts`** — `computeNFLPlayerPropMarkets`'s body extracted into a sport-agnostic
  `computePlayerPropMarkets(rows, allowedPropTypes, milestoneDevigFactor)`; the NFL function is now a
  one-line wrapper and is byte-equivalent to what it did before. `resolveNFLPlayerProfiles` likewise
  became a wrapper over a shared `resolvePlayerProfiles(path, cache, ids, label)`.
  New MLB surface: `MLB_PROP_TYPE_TO_MARKET_KEY`, `MLB_CORE_PROP_TYPES`,
  `MLB_CORE_PLAYER_PROP_MARKET_KEYS`, `MLB_MILESTONE_DEVIG_FACTOR`, `MLBPlayerPropMarket`,
  `resolveMLBPlayerProfiles`, `fetchMLBPlayerPropMarkets`.
- **Each sport keeps its own player-profile memo.** Ids are only unique within a sport — BDL player
  490 is a real NFL player *and* a real MLB player — so a shared cache would name one after the
  other. Pinned by a test.
- **`buildMLBPlayerPropCandidates` rewritten** onto `fetchMLBPlayerPropMarkets`, following
  `buildNFLPlayerPropCandidates`: both sides of an over/under are emitted (sharing an axis key, so
  the duplicate-axis guard stops both landing while the generator still picks the side that moves
  the board toward target); milestone markets emit the "over" side only, because there is no
  complement price to de-vig against. The historical-stats path remains the fallback, unchanged.

### Two deliberate design calls inside the repair

1. **The offered set is defined by what settlement can grade.** `MLB_PROP_TYPE_TO_MARKET_KEY` admits
   only the 8 prop types `getMLBPlayerPropValue` can settle; the other ~20 the books post
   (`total_bases`, `hits_runs_rbis`, `singles`, `first_home_run`…) are dropped at parse time rather
   than offered and voided later. `MLB_SETTLABLE_PLAYER_PROP_MARKETS` now derives from that same
   table instead of restating a list — the discipline `NFL_SETTLABLE_PLAYER_PROP_MARKETS` already
   used. **This closed a real gap:** the hand-written list it replaces omitted
   `player_stolen_bases`, `player_earned_runs` and `player_pitcher_outs`, all three of which
   `getMLBPlayerPropValue` has always graded, so a square built on one of them would have voided at
   settlement for no reason.
2. **One square per market, not two.** The old code emitted both a `player-prop` square and an
   `mlb_achievement:` twin carrying the **identical resolver** under a different key. With the feed
   dead that never mattered; with it live it would put two squares on one board that win and lose
   together — invisible to the duplicate-key guard, invisible to the correlation estimator, and
   outside the star draw's bucket besides. The achievement *phrasing* is strictly better for a bingo
   square, so it is now applied as a **label** on the single player-prop square
   ("Ozzie Albies records a hit") rather than as a second candidate.

### `MLB_MILESTONE_DEVIG_FACTOR` = 0.95, and why it is not NFL's 0.92

An anytime-TD market is a ~30-runner field priced with one large overround spread across it, so each
individual price overstates badly. An MLB milestone row is almost always one side of a genuine
two-way market — measured live, FanDuel posts `hits 0.5` as a `milestone` while Fanatics posts the
same market as `over_under` on the same game — where the two-way hold is typically 8–12% and one side
overstates by roughly half of that. The factor is only consulted when *no ranked book* quoted the
modal line two-way; when one did, the real `deVigTwoWay` price wins. Like NFL's, it is the
least-evidenced number here and wants validating against realized hit rates.

---

## 2. The star port

`lib/sportsBingoMlbStars.ts` mirrors `lib/sportsBingoNflStars.ts` one-for-one — same three-signal
blend (`0.45 market + 0.35 usage + 0.20 production + capped brand bonus`), same percentile tiering
inside the game's own pool, same 24h-cached `resolveMLBStarIndex`, same generated snapshot, same
staleness tripwire. Four differences, each documented at its definition:

1. **`resolveCurrentMLBSeasonYear`** — MLB seasons are named for the calendar year they are played
   in, so NFL's "season starts the previous year" offset does not apply. January and February are
   attributed to the season that just ended.
2. **`MLB_STAR_PRIOR_SHRINKAGE_K` = 15**, against NFL's 3, because a season is 162 games not 17.
3. **Groups are batter/pitcher, not five positions.** `/mlb/v1/season_stats` reports batting and
   pitching volume in units (plate appearances vs. innings pitched) that are only comparable within
   their own kind. Batter usage = `batting_ab + batting_bb`; pitcher usage = `pitching_ip`.
   Production is two percentiles averaged: batters get total bases per game and (HR+RBI+R) per game,
   pitchers get strikeouts per game and K/9.
4. **The market signal's milestone analogue is the home-run price**, not anytime-TD, scaled against a
   0.25 reference because even an elite power hitter prices ~20–25% to go deep on a given night.

### A live probe changed one design decision

Running the real pipeline against ATL @ MIN (2026-08-17) showed **both starting pitchers scoring
below every starting position player**, and the cause was structural rather than about those
pitchers: breadth was normalised against a single constant, but the 8 gradeable prop types split
5 batting / 3 pitching, so a pitcher topped out at 3/5 = 0.6 **by construction** and no ace could
out-score a bench outfielder. Split into `MLB_STAR_MARKET_BREADTH_NORM_BATTER` (5) and
`..._PITCHER` (3), with the group inferred from the market keys themselves rather than from the
season index — a rookie call-up the stats feed has never seen still needs the right norm, and the
books posting `pitcher_outs` on someone is proof enough that he is pitching. Pitchers also score on
breadth alone: folding a missing home-run term in as a zero would hand every pitcher a flat 0.4
penalty rather than measuring anything.

After the fix, the same game's pool tiers as: **Matt Olson, Michael Harris II, Byron Buxton, Ozzie
Albies, Austin Riley** as `star`; Bailey Ober and Martín Pérez (the two starters) mid-pack; the
day's call-ups (Jim Jarvis, Alan Roden, Kaelen Culpepper) as `deep`. 5 star / 7 known / 8 deep.

### The hardcoded list is retired as a selection signal, and one of its entries never worked

`MLB_STAR_BRANDED_PLAYER_KEYS` was eleven names carrying a flat 1.45× draw boost, with no owner, no
expiry and no test. The eleven names survive as `MLB_BRAND_NAME_BONUS` — capped at **+0.10**, dated
with a `reviewBy`, size-asserted, and **provably unable to set a tier on its own** (a test shows a
branded player with no market coverage scores below an unbranded player with full coverage). The
`mlb_star_hr:` branded-square feature now reads the same list, so the two cannot drift.

**Writing the test for it found a live bug in the original list.** `normalizeNameKey` strips
generational suffixes, but the hardcoded set stored `"fernando tatis jr"` and
`"vladimir guerrero jr"` — so `MLB_STAR_BRANDED_PLAYER_KEYS.has(normalizeNameKey(name))` could never
match either, and both were silently inert for as long as that list has existed. The keys are now
`"fernando tatis"` / `"vladimir guerrero"`, and a test asserts no key carries a suffix the normalizer
would remove.

---

## 3. The star ceiling had to become board-level for MLB

The plan's rule is "at most 5 of the 8 prop slots may be `star`, at least 2 reserved for
`known`/`deep`". NFL seats every player square in one block, so its ceiling lives inside that block.
**MLB seats them in two** — the named-player achievement draw and the player-prop draw — and a third
path (`preferLiveRungs`) tops up any board still short of 24. Bounding only the prop draw left the
exact failure the plan names reachable through the other two: measured, boards came out with **7–8
star squares against a ceiling of 5.**

So `mlbTierCounts` is shared state read by all three, and:

- **The ceiling is hard; the floor degrades.** The plan gives the reservation a "take what exists"
  degrade and gives the ceiling none, so when the ceiling is reached and only stars remain the prop
  draw **stops** rather than seating a sixth star.
- **The last-resort top-up runs two passes** — first skipping blocked stars, then allowing anything —
  because a board that cannot reach 24 squares is a worse outcome than a sixth star. For every other
  league, and for MLB with no star index, the first pass takes everything and the second finds
  nothing left, so it is byte-equivalent to the single loop it replaces.

Telemetry was unified rather than duplicated: `pickCandidateSet`'s `onNflStarMix` became `onStarMix`
carrying a `sport` tag, and `generateBoardForGame` logs `nfl_star_mix` or `mlb_star_mix`. That keeps
both leagues on the same "log the board that was actually kept" discipline — `pickCandidateSet` runs
up to 180 times per board and only one attempt survives.

---

## 4. Verification

- **`npx tsc --noEmit`, `npm run lint`: clean.**
- **`npm run test:bingo-mlb`: 76 passed / 6 files** (up from 18 / 2). Extended with the four new
  files. **`npm run test:bingo-nfl`: 200 passed / 15 files**, unchanged.
- **`npm run test`: 1,736 passed**, with exactly the **4 pre-existing failures** documented in the
  plan's Appendix (`admin-mobile.section-registry-split`, ×3 `venue-activation.phase4-mount`).
  Nothing new.
- **Live end-to-end**, not fixtures: `npm run bingo:stars:mlb` pulled **1,405 rows for season 2026
  and 1,792 for 2025** (1,403 / 1,487 players scored) and wrote
  `data/sports-bingo/mlb-star-index.json`. The top of the 2025 slate reads Juan Soto, Pete Alonso,
  Francisco Lindor, Rafael Devers, Matt Olson — a clean sanity check on its own. A separate probe ran
  the repaired prop path against a live game and produced 94 de-vigged, named markets across 20
  players and 8 market keys.
- **The win-rate band, which is the assertion that matters most:** `npm run bingo:simulate` over the
  live slate gives MLB **44 boards across 11 games, median 0.2644, mean 0.2648, `inTargetBand: 1.0`**
  — every board inside 20–30%, now *with* book-posted player props on it. For contrast, Phase 7
  measured MLB stuck around a 0.31 median with the team-event block as the entire achievement bucket.
  WNBA is also 1.0 (median 0.284); NBA and NFL had no live games in the window.

### A pre-existing red test, found and fixed

`tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts` (Phase 7's) was failing **deterministically
and before any 9d code existed** — confirmed by reverting every 9d change that touches MLB
generation and reproducing it unchanged. Its `/mlb/v1/games` mock served history games carrying each
*fixture* game's own two clubs, but `relatedGameIds` keeps only history involving the **active**
matchup's clubs. Fixture game 0 is Dodgers @ Diamondbacks and **no other game in the frozen
thirteen-game fixture involves either club**, so it got an empty history, no team-event block, 46
candidates in three buckets, and threw on its very first game.

Fixed in the mock, not the product: history rows are now labelled with the active matchup's clubs
while keeping thirteen different real box-score lines. The file is green for the first time (7
passed), which is what makes the 20–30% band assertion above actually run. Its stale docstring
("MLB player-prop squares are absent, because `/mlb/v1/player_props` returns 404 live") was corrected
in the same change.

---

## 5. Open items and what a future phase should know

1. **Nobody has watched a real MLB board with props on it.** Every number above is a predicted
   distribution or a unit test. The product question Phase 7's note 6 raised — how a re-thresholded
   MLB board *feels* on a screen for a full game — is now a different board than the one that
   question was asked about, and still unobserved.
2. **`MLB_MILESTONE_DEVIG_FACTOR` (0.95) is the least-evidenced constant in this phase**, exactly as
   `NFL_MILESTONE_DEVIG_FACTOR` is for NFL. Validate against realized hit rates once settled MLB
   boards carry real props.
3. **The MLB freshness tripwire is live for two thirds of the year**, unlike NFL's. MLB runs
   March–November, and `resolveLeagueSeasonStatus("baseball_mlb")` reports `in_season` today, so
   `npm run bingo:stars:mlb` is a real fortnightly obligation during the season rather than a
   theoretical one. The cron that would automate the audit is still a proposal, not a change —
   `vercel.json` is a hard boundary in `CLAUDE.md`.
4. **A cron for both sports is now worth proposing to Andrew.** With two leagues on the same
   fortnightly manual refresh, the case for automating the *audit* is stronger than it was at 9c.
   The product is correct without one — the live 24h-cached layer is what actually feeds boards.
5. **`buildMLBPlayerPropCandidatesFromRecentStats` is now the fallback path only**, but it still
   builds the entire team-event block that most of an MLB board is made of, and it still returns `[]`
   for any game whose two clubs have no trailing history in the window. That early return is a real
   generation cliff — it is what made Phase 7's test fail — and it is worth a look on its own.
6. **The raw-implied vig bug is fixed for MLB props but the hand-picked sigmoids remain.**
   `defaultMlbOverProbability` and the MLB achievement pricing are still invented numbers. Phase 5's
   handoff note 5 called for a Phase-2-style odds consensus for MLB; this phase delivers that for the
   *prop* half only.
7. **An identical duplicate file, `scripts/refresh-mlb-star-index 2.cjs`, appeared next to the script
   I wrote.** It matches a pre-existing pattern in the working tree (`lib/sportsBingoOdds 2.ts`,
   `scripts/baseline-bingo-win-rates 2.cjs`, and others), so it looks like a file-sync artifact
   rather than anything this phase did. Left in place rather than deleted.
