# Prop Bingo — NFL Phase 9b Findings

**Status:** Phase 9b (the selection rule) complete. **Ran:** 2026-08-17. **Parent plan:**
`docs/prop-bingo-nfl-plan.md` (Phase 9, §9b). **Predecessor:** Phase 9a's as-built notes at the
bottom of the plan (the star signal, signal-only, wired into nothing).

**Phase 9c is not started.** So is 9d. See "Handoff to Phase 9c" at the bottom. Phase 6's open
items — the live board-render screenshot and the `NEXT_PUBLIC_BINGO_NFL_ENABLED` flip — are
untouched and are still the gate on anything reaching a venue.

---

## 0. Headline

**NFL player-prop slots are now drawn, not taken in order, and the draw is tilted toward the
players a book posted the most markets on.** Phase 9a computed a `starScore`; this phase is the
first thing that reads it. An NFL board's eight prop slots now come out at roughly **4–5 star-tier
squares, 2–4 known-tier and 0–1 deep-tier**, against a hard ceiling of 5 star and a hard floor of 2
non-star.

Three properties are load-bearing and each has a test:

1. **Draw, never sort.** Two cards for the same game do not carry the same six names. A
   deterministic top-N would have handed every player at a venue an identical prop block, and the
   room comparing cards is half the product.
2. **Reservation, never a soft weight.** ≤5 star and ≥2 non-star are gates on what is *offered* to
   the draw. Phase 5's escalating `difficultyBias` can push a board's difficulty around all it
   likes; it cannot erode the mix, because the mix is not expressed as a weight.
3. **Selection, never pricing.** Nothing in this phase reads or writes `probability`. A star square
   is likelier to be *chosen* and exactly as hard to *win*. This is the line Phase 5 drew for
   `orderByDifficulty`, and it is what keeps every calibrated number from Phases 5, 7 and 8c valid.

**The measured tilt, on a controlled fixture:** twelve players, four posted markets each, identical
−110 prices — so an untilted draw seats the three star-tier players in exactly 25% of prop slots.
With the tier boosts live the star share is **0.379–0.408**; with the boosts set to 1 it falls back
to **0.242**, i.e. chance. The gap between those two runs *is* the phase.

---

## 1. What the rule actually is

Inside `pickCandidateSet` (`lib/sportsBingo.ts`), for NFL only:

```
tiers = assignNFLStarTiers(one score per player in THIS game's prop pool)
    star  = starScore percentile ≥ 0.75 within the pool
    known = ≥ 0.40
    deep  = the rest

repeat until 8 prop slots are filled:
    offered = every unselected, unrejected prop candidate
    if (stars already == 5) or (slots left == non-star squares still owed):
        offered = offered without star-tier candidates      ← the reservation
        if that is empty: offered = everything              ← degrade, never fail
    draw one from `offered` with weight
        difficultyWeight(candidate, difficultyBias) × tierBoost[tier]
    tryAdd() — the existing caps (≤2 squares per player, ≤2 per prop type,
               one square per axis) reject as they always did
```

Four decisions inside that, each of which could reasonably have gone the other way:

**Percentile within the game's own pool, not league-wide.** The plan is explicit about this and it
is right: on a thin Thursday slate the best available player should still read as *that board's*
star. A league-wide bar would produce boards with no star tier at all on two thirds of the schedule.

**Ranked over distinct players, not over candidate squares.** A quarterback with nine posted
markets would otherwise drag the percentile scale around by himself — the question being asked is
about people, not squares.

**Ties share a tier.** A pool where everyone scores identically produces *no* stars rather than an
arbitrary top quarter picked by map-iteration order.

**The boost is per tier, not a direct function of `starScore`.** This is a deviation in mechanism
from a literal reading of "draw with a boost", and it is deliberate. Until 9c wires in the season
index, scores are computed from market attention alone and compress into a narrow band (≈0.15–0.25
on a realistic slate). A multiplier read straight off a compressed score would tilt by a few
percent and look like it was working. A percentile tier is invariant to that compression — and it
will still be invariant when 9c widens the scores, so nothing has to be retuned when the season
index lands.

Boosts: `star = 2.6`, `known = 1.4`, `deep = 1.0`. `deep` sits at 1.0 rather than at 0 on purpose —
a lesser-known player is weighted **down relative to a star**, never removed. Zero unknowns and
zero stars are both failure states, and drawing rather than filtering rules out the second.

---

## 2. The one thing that is wired but not yet fed

`computeNFLStarScore` blends three inputs: market attention (0.45), season usage (0.35) and season
production (0.20). **This phase feeds it the first one only.**

The season components need `/nfl/v1/season_stats`, which is one league-wide paginated pull. Phase 9a
shipped `fetchNFLSeasonStats` deliberately **uncached** and named its 24h-TTL wrapper
(`resolveNFLStarIndex`) as 9c's job, on the grounds that calling it from board generation without a
cache is one league-wide pull per board. That reasoning still holds, so the seam is built and left
open:

```ts
// lib/sportsBingo.ts, getGameEntryWithCandidates
const nflPropCandidates = buildNFLPlayerPropCandidates(entry.game, nflPropMarkets, null);
//                                                                                  ^^^^ 9c
```

`buildNFLPlayerPropCandidates` takes an optional third argument
`{ current: Map<playerId, entry>, prior: Map<playerId, entry> }`. When 9c lands, **that `null` is
the only line that changes.**

**What this costs today, honestly stated:** the tilt runs on `0.45 × marketAttention + brandBonus`,
where `marketAttention = 0.6 × (breadth / 8) + 0.4 × P(anytime TD)`. That is the plan's own
*primary* signal and the only one of the three that self-updates same-week, so the product is
already doing the thing the ask asked for. What is missing is the corroboration: a genuine star who
is game-time-decision questionable and has only two markets posted this week will tier as `known`
until 9c gives the blend a season to lean on.

**And one thing this costs that is easy to miss:** the brand bonus is currently a larger share of
the score than intended. `NFL_BRAND_NAME_BONUS` adds up to +0.10 to a score whose non-brand part
currently tops out around 0.45 × 1.0 = 0.45 and in practice sits near 0.25. The plan's design has
it capped at +0.10 against a score built from three inputs, where it is a nudge. Until 9c, on a
compressed scale, it is closer to a thumb. It still cannot set a tier by itself on any realistic
pool, and 9c fixes it by widening the rest of the score rather than by changing the cap — **do not
"fix" it by lowering the cap.**

---

## 3. Breadth is counted over the gradeable allowlist, not over everything the book posted

`summarizeNFLStarMarketSignal` counts distinct prop types from the markets
`fetchNFLPlayerPropMarkets` returns — and that function has already filtered to the 14 over/under
types plus `anytime_td` (plus `first_td` when the 3b flag is on) that Prop Bingo can actually grade.
So a player with twelve posted markets, six of which are first-half splits we cannot settle, counts
as six.

Accepted rather than fixed, for two reasons. Counting the unfiltered set would need a second,
differently-parameterised fetch for no gain in *ranking*: the allowlist still cleanly separates a
six-market star from a one-market role player. And tiers are percentiles **inside one game's pool**,
so a uniform compression of the scale moves nobody between tiers.

It would matter if a position's coverage were systematically truncated by the allowlist more than
another's — a kicker has only `fg_made` and `kicking_points` available, so a kicker can never score
above 2/8 on breadth. In practice kickers are not who the ask is about, and the 9a position
normalisation that would correct for it lives in the season components 9c turns on.

---

## 4. Verification

### 4.1 Tests

New: `tests/lib.sportsBingo.nfl-star-tilt.test.ts`, **11 tests**, added to `npm run test:bingo-nfl`
(now **193 tests across 14 files**, green). Two fixtures, deliberately:

- **REALISTIC** — stars carry seven over/unders plus an anytime TD, known players three plus one,
  deep players one. This is the shape a real book slate has, and the one where the reservation, the
  ceiling and the diversity caps all bind at once. Used for the mix tests.
- **FLAT** — every player carries exactly four posted markets and identical −110 prices; the only
  thing separating the tiers is the anytime-TD price. Chance is then exactly 1-in-12, which is the
  only way to state "stars appear materially more often than chance" as a number.

What is asserted:

| Test | What it pins |
| --- | --- |
| tier split by percentile, at two different score scales | the split is a ranking, not a threshold on absolute score |
| a thin four-player pool still has a star | game-relative tiering, per the plan |
| an all-tied pool has **no** star | ties share a percentile; no accidental stars |
| `assignNFLStarTiers` returns `null` on an unscored pool | **the no-index fallback** — this null is what makes `pickCandidateSet` skip the star block entirely |
| boost ordering star > known > deep > 0 | a deep player is weighted down, never removed |
| 25 generated boards: `star ≤ 5` | the ceiling |
| 25 generated boards: `known + deep ≥ 2` | the reservation |
| an all-star pool still yields a 25-square board | degrade-to-take-what-exists, never fail generation |
| 30 boards on FLAT: star share > 0.30 vs 0.25 chance | the tilt is real |
| 30 boards boosted vs 30 unboosted | the tilt is the *boost*, not the fixture |
| 8 boards produce more than one distinct player set | draw, not sort |
| every prop square's board probability == its template probability | **selection, never pricing** |

Stability: the file was run five times end to end with no flake. The two statistical tests carry
real margin — the FLAT star share measures 0.379–0.408 against a 0.30 threshold (≈2.6σ at n=240),
and the boosted-vs-unboosted gap measures 0.167 against an 0.08 threshold.

`npx tsc --noEmit` and `npm run lint` are clean. `npm run test` shows the same **4 pre-existing,
unrelated failures** in `tests/admin-mobile.section-registry-split.test.ts` (1) and
`tests/venue-activation.phase4-mount.test.ts` (3) documented in the plan's Appendix — nothing else
changed.

### 4.2 The backtest, and what it cannot tell you

Both runs the plan's 8c handoff asked for, against the live balldontlie API:

| Run | Games | Boards | Realized win rate |
| --- | --- | --- | --- |
| `bingo:calibrate:nfl -- --weeks 1…18 --boards 4` (full 2025 season) | 272 | 1,140 | **0.2430** |
| `bingo:simulate -- --backtest --seasons 2025 --weeks 6,9,14 --boards 4` | 43 | 172 | 0.2791 |

Artifacts: `docs/phase0-artifacts/phase9b-nfl-family-calibration-2026-08-17.json` and
`phase9b-nfl-backtest-2026-08-17.json`.

**Read the 0.2430 as "unchanged", not as "down from 0.2561".** Board generation is stochastic —
`pickCandidateSet` shuffles and `generateBoardForGame` re-samples up to 180 times — so the same code
returns a different number on every replay. 8c itself measured 0.2430 and 0.2561 on two runs of this
exact command, and its own note records that at 272 games the noise floor on a win rate is ≈0.026.
The 43-game slate is even wider: 8c logged 0.2674, 0.2004 and 0.2151 from three runs of the same
three-week command, which is why that row is a smoke test and not a measurement. Every number here
is inside 20–30% and inside its own noise.

**These runs cannot see this phase at all, and that is not a hedge.** `/nfl/v1/odds/player_props` is
live-only (Phase 8c handoff note 4), so a historical NFL board has an empty player-prop pool ⇒
`assignNFLStarTiers` returns `null` ⇒ the star block does not execute. Confirmed by inspection as
well as by argument: the star branch is the only new code on the generation path, it adds no
`Math.random()` calls outside itself, and every other line this phase touched is either a type field
or a telemetry callback. So the two runs above are a **regression check on the parts of the board
this phase did not touch** — which is worth having, and is all it is.

#### The free by-product 8c asked for (its handoff note 5) — answered: both were noise

8c left two families outside ±0.05 and explicitly declined to spend a dedicated run on them,
because Phase 9 had to re-run the table anyway. This run is that second independent sample:

| Family | 8c gap | This run | n | Verdict |
| --- | --- | --- | --- | --- |
| `nfl_team_red_zone_trip_without_touchdown` | −0.134 | **−0.012** | 123 | **Noise.** Back well inside ±0.05. |
| `nfl_long_touchdown` | −0.063 | **−0.044** | 209 | **Noise.** Inside ±0.05. |

Both moved back toward calibrated without anyone touching their prices, which is what noise at
n≈110–210 looks like. **The matter is closed — neither needs a measurement, and neither should get
a threshold change.**

For completeness, the two families outside ±0.05 on *this* run are
`nfl_first_score_within_minutes` (−0.064, n=183) and `nfl_first_score_is_field_goal` (+0.054,
n=185). Both are play-by-play squares at a sample size whose noise floor 8c put at ±0.045, both were
inside the band on 8c's run, and both are therefore the same phenomenon in the other direction.
**Do not "fix" either on this evidence.** Whoever runs the next full-season table gets the third
sample for free — record which way they went, the way this section records the previous pair.

Everything else is well inside ±0.05, and the two families this phase's mechanism would most
plausibly disturb through selection drift (`nfl_team_quarter_points_at_least` at −0.014,
`nfl_winner_trailed_in_fourth` at −0.015) both sit close to calibrated.

---

## 5. New and changed surface

| File | What changed |
| --- | --- |
| `lib/sportsBingoNflStars.ts` | **+ tier block:** `NFLStarTier`, `assignNFLStarTiers`, and Phase 9b's five tunables (`NFL_STAR_TIER_STAR_PERCENTILE`, `NFL_STAR_TIER_KNOWN_PERCENTILE`, `NFL_STAR_TIER_BOOST`, `NFL_STAR_MAX_STAR_SLOTS`, `NFL_STAR_MIN_NON_STAR_SLOTS`). Nothing from 9a was modified. |
| `lib/sportsBingo.ts` | `SportsBingoSquareTemplate.starScore?`; `buildNFLStarScoresByPlayerId`; a third argument on `buildNFLPlayerPropCandidates`; `buildNFLStarTiers`; `nflDifficultyDrawWeight`; the NFL branch of the prop fill in `pickCandidateSet`; the `onNflStarMix` telemetry callback and its `nfl_star_mix` log in `generateBoardForGame`. |
| `tests/lib.sportsBingo.nfl-star-tilt.test.ts` | New, 11 tests. |
| `package.json` | `test:bingo-nfl` gains the new file. |

**Five new env knobs**, all with working defaults, none required:
`BINGO_NFL_STAR_TIER_STAR_PERCENTILE` (0.75), `BINGO_NFL_STAR_TIER_KNOWN_PERCENTILE` (0.40),
`BINGO_NFL_STAR_TIER_BOOST_STAR` (2.6), `BINGO_NFL_STAR_TIER_BOOST_KNOWN` (1.4),
`BINGO_NFL_STAR_MAX_STAR_SLOTS` (5), `BINGO_NFL_MIN_NON_STAR_SLOTS` (2).

### The telemetry line, and why it moved

The plan puts `console.info("[sportsBingo] nfl_star_mix", …)` in 9c item 5 and says to match
`mlb_named_player_weighting`'s shape. It matches the shape. It does **not** match the placement,
and that is on purpose.

`mlb_named_player_weighting` logs from inside `pickCandidateSet`, which `generateBoardForGame` calls
**up to 180 times per board** while it hunts for the win-rate target. One of those attempts survives;
the other 179 describe boards nobody was ever dealt. So `pickCandidateSet` now reports its mix
through an optional `onNflStarMix` callback, `generateBoardForGame` keeps the mix belonging to the
board it actually kept, and exactly **one line is logged per board generated** — describing a board
a real player really got.

This is strictly better than the precedent it was told to match, and the MLB line has the same
problem today. Fixing MLB's is a one-line change in the same shape and belongs with **Phase 9d**,
which is already scheduled to touch that block.

---

## 6. What did NOT change

- Every price. No resolver, no base rate, no `lib/sportsBingoOdds.ts` constant, no probability
  anywhere. Phase 8c's 0.2561 stands on exactly the numbers it was measured on.
- `orderByDifficulty` — untouched, and still the only path for MLB, NBA, WNBA and for any NFL pool
  with no star scores.
- All three NFL diversity caps (≤2 squares per player, ≤2 per prop type, one per axis) and Phase
  8b's Tier-1 flavor caps. The star tilt pushes hard against the first two — a rejection there is
  now expected traffic, and the draw loop treats it as such rather than as an error.
- `resolveNFLPlayerProfiles`. The plan forbids a second per-player lookup path; `starScore` is keyed
  off the `playerId` the prop market already carried, and the tier map is keyed off the same
  normalized name the existing per-player cap already computes.
- `MLB_STAR_BRANDED_PLAYER_KEYS` and the MLB named-player block. Phase 9d, not before.
- `NFL_BRAND_NAME_BONUS` — 14 entries, unchanged, `reviewBy: 2027-02-01`.

---

## 7. Handoff to Phase 9c

**9c is: the cache, the generated snapshot, the diff script, the staleness tripwire.** Phase 9a's
handoff notes (in the plan) still describe items 1–4 accurately; this phase changes only what item 1
plugs into.

1. **The one-line seam.** `buildNFLPlayerPropCandidates(game, markets, starIndex)` already accepts
   `{ current, prior }` as maps of `playerId → NFLSeasonStarIndexEntry`. `resolveNFLStarIndex`
   should return exactly that pair, and `getGameEntryWithCandidates` should pass it instead of
   `null`. Everything downstream — the score blend, the tiering, the draw, the reservation, the
   telemetry — is already wired and tested.
2. **Cache at the right level.** `getGameEntryWithCandidates` is already memoized for 60s per game,
   but that is per *game*, and a Sunday slate is 13 of them. The 24h TTL belongs on the season
   index itself (`BINGO_NFL_STAR_INDEX_CACHE_MS`, the `resolveLeagueSeasonStatus` pattern in
   `lib/leagueSeasonStatus.ts`), not on the game entry.
3. **Expect the tier boundaries to move when you turn the season index on, and do not read that as
   a bug.** Today's scores are 45% of one signal; tomorrow's are 100% of three. Players will change
   tier. What must *not* change is the mix — `star ≤ 5`, `known + deep ≥ 2` — and
   `tests/lib.sportsBingo.nfl-star-tilt.test.ts` will tell you if it does. **Re-run that file after
   wiring the index in**; its REALISTIC-fixture assertions are the regression net for 9c.
4. **The brand bonus gets quieter for free.** See §2 — its +0.10 cap is a bigger share of a
   market-only score than of a full blend. Widening the score is the fix; lowering the cap is not.
5. **Read the `nfl_star_mix` log, not a simulator.** One line per board, in production, with
   `{ star, known, deep, pool, star_players_in_pool, max_star_slots, min_non_star_slots,
   reservation_degraded, difficulty_bias }`. A nonzero `reservation_degraded` means a real slate
   had no non-star props to reserve — worth knowing, and invisible to any test.
6. **The staleness tripwire needs a snapshot file that does not exist yet.** Unchanged from 9a's
   note 3.
7. **9a note 4 still stands and is still unpaid:** nobody has made a live call to
   `/nfl/v1/season_stats`. Every test on both sides of the star signal runs on hand-built fixtures.
   9c's first live run is also the first confirmation that the response shape matches the docs
   sample. Budget for field-name surprises.

### And one gap this phase inherits and cannot close

**Player props cannot be backtested** (`/nfl/v1/odds/player_props` is live-only, Phase 8c handoff
note 4). Star-tilted selection only ever touches player props. Therefore **no backtest, calibration
table, or win-rate number can measure this phase's effect at all** — a historical NFL board has an
empty prop pool, `assignNFLStarTiers` returns `null`, and the star block does not execute.

That is not a hedge, it is the actual coverage boundary: everything in §4.1 is fixture-driven, and
everything in §4.2 is a regression check on the parts of the board this phase did not touch. The
first real evidence that star tilt does what it should on a live slate is **the `nfl_star_mix` log
on a real Sunday**, which cannot happen before 2026-09-11 and cannot happen at all until Phase 6
flips `NEXT_PUBLIC_BINGO_NFL_ENABLED`.

### Still open, unchanged by this phase

The two live checks waiting on a real NFL game (mid-game `team_stats`; live `home_win_probability`
/ square 45), the postseason `team_stats` gap, and Phase 6's flag flip and board-render screenshot.
