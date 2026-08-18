# Prop Bingo — NFL Phase 8c Findings

**Status:** Phase 8c (recalibrate, then prove it) complete. **Ran:** 2026-08-17, against the live
balldontlie API and this repo's `.env.local` key. **Parent plan:** `docs/prop-bingo-nfl-plan.md`
(Phase 8, §8c). **Predecessors:** `docs/prop-bingo-nfl-phase8a-findings.md`,
`docs/prop-bingo-nfl-phase8b-findings.md`.

**Phase 9 is not started.** See "Handoff to Phase 9" at the bottom. Phase 6's open items — the live
board-render screenshot and the `NEXT_PUBLIC_BINGO_NFL_ENABLED` flip — are untouched and are still
the gate on anything reaching a venue.

---

## 0. Headline: the board was already in band, and half its squares were still mispriced

The plan's 8c deliverable was one number: re-earn the 20–30% realized win rate that 8b invalidated.
That number came back green on the first run and never moved:

| Measurement | Boards | Realized win rate |
| --- | --- | --- |
| **Phase 5 (before 8b), weeks 6/9/14** | 215 | 0.3023 |
| **Phase 8c, full 2025 regular season, before recalibration** | 1,140 | **0.2430** |
| **Phase 8c, full 2025 regular season, after recalibration** | 1,140 | **0.2561** |

So 8b's flavor slate moved NFL from the top of the band to the middle of it, which is the outcome
the plan hoped for and no further tuning was required to get there.

**That is also the least interesting thing this phase found.** A board can sit dead on 25% while
half its squares are individually mispriced, because errors in opposite directions cancel at the
board level — 24 squares, 12 possible lines, and a win rate is a summary statistic over all of it.
Confirming the band and stopping would have shipped a generator that is right on average and wrong
about nearly every square it prices.

So 8c built the instrument the plan did not ask for: **`npm run bingo:calibrate:nfl`**, which
replays the same backtest but records, per resolver family, the probability the generator *assigned*
against the rate the shipped graders *realized*. Sorted by that gap, the mispriced families fall
out of the top and bottom of the table immediately.

**What it found: every badly-priced family on an NFL board is a Phase 2 or Phase 3 square, and
every Phase 8b family is well calibrated.** The measure-before-shipping discipline 8b imposed on
itself worked, and it exposed by contrast the squares that were built before anyone was measuring.

---

## 1. The calibration table (before recalibration)

Full 2025 regular season, 272 games, 1,140 boards, 4 boards per game.
Archived at `docs/phase0-artifacts/phase8c-nfl-family-calibration-before-2026-08-17.json`.
`gap = realized − assigned`; a positive gap means the generator priced the square **harder** than it
turned out to be.

**Every family mispriced by more than 0.06 — six of the seven are Phase 2/3 squares:**

| Family | n | assigned | realized | gap | Origin |
| --- | --- | --- | --- | --- | --- |
| `nfl_team_quarter_points_at_least` | 447 | 0.189 | 0.371 | **+0.182** | Phase 2 normal tail |
| `nfl_fourth_down_conversion` | 173 | 0.750 | 0.861 | **+0.111** | Phase 3 flat constant |
| `nfl_team_shutout_quarter` | 349 | 0.765 | 0.662 | **−0.103** | Phase 2 quarter model |
| `nfl_team_scores_every_quarter` | 388 | 0.236 | 0.327 | **+0.092** | Phase 2 quarter model |
| `nfl_winner_trailed_in_fourth` | 206 | 0.254 | 0.165 | −0.089 | Phase 8b flat base rate |
| `nfl_second_half_higher_scoring` | 187 | 0.510 | 0.433 | −0.077 | Phase 2 flat constant |
| `nfl_any_quarter_scoreless` | 196 | 0.317 | 0.255 | −0.062 | Phase 2 quarter model |

**Phase 8b's families, for contrast — the four largest by sample size:**

| Family | n | assigned | realized | gap |
| --- | --- | --- | --- | --- |
| `nfl_team_stat_at_least` | 2,200 | 0.449 | 0.407 | −0.042 (−0.025 on graded squares only) |
| `nfl_game_max_stat_at_least` | 1,933 | 0.448 | 0.433 | −0.015 |
| `nfl_game_total_stat_at_least` | 546 | 0.495 | 0.484 | −0.012 |
| `nfl_combined_team_stat_at_least` | 261 | 0.453 | 0.437 | −0.016 |

And the core markets, which are the sanity check that the harness itself is honest:

| Family | n | assigned | realized | gap |
| --- | --- | --- | --- | --- |
| `moneyline` | 2,280 | 0.500 | 0.498 | −0.002 |
| `game_total_under` | 2,215 | 0.509 | 0.510 | +0.001 |
| `team_total_over` | 2,068 | 0.481 | 0.483 | +0.002 |
| `spread_keep_close` | 2,080 | 0.598 | 0.592 | −0.006 |

A moneyline square realizing 0.498 against an assigned 0.500 over 2,280 instances is what a
correctly-wired replay looks like. It also bounds how much of the flavor-square gaps can be blamed
on the retrodictive market: essentially none.

### Two ways to misread this table, both of which 8c walked into first

1. **`realized` counts an ungraded square as a non-hit.** Tier 1 voids whenever `team_stats` is
   absent, so a family with a 4% void share reads ~4% low. Divide by `1 − ungraded` before comparing.
   This is the whole of `nfl_team_stat_at_least`'s apparent −0.042.
2. **Boards for one game share that game's outcome.** The effective sample size is nearer the game
   count than the square count, so the plan's default three-week backtest slate is worth about ±0.07
   — wide enough to invent a mispricing that isn't there. The evidence, all of it from
   `npm run bingo:simulate -- --backtest --seasons 2025` on 43 games:

   | Run | Realized |
   | --- | --- |
   | Three weeks, before recalibration | 0.2674 |
   | Three weeks, before recalibration (identical command, second run) | 0.2004 |
   | Three weeks, after recalibration | 0.2151 |
   | **Full season (272 games), before / after** | **0.2430 / 0.2561** |

   Three runs of the same command spanning 0.20 to 0.27 is the whole argument. **Everything in this
   document is measured over the full 272-game season.** Both cautions are written into the script's
   header comment so the next reader doesn't have to rediscover them.

---

## 2. The fix: four Phase 2 quarter squares were never measured at all

Phase 8b measured every flavor square against a season before choosing a threshold. The quarter
squares Phase 2 shipped were built from a normal approximation of quarter scoring with hand-set
dependence fudges, and **were never checked against a single real game.** They are 4 of the ~6
special squares on every NFL board.

`npm run bingo:measure:nfl-quarters` (new) measures them directly. Every quarter score is already on
`/nfl/v1/games`, so the whole 2025 regular season costs three API calls.

### The methodological point that decides the numbers

Every rate is bucketed by a **pre-game implied team total**, not by the team's realized score.
Bucketing on the realized score is the obvious thing to do and it fits the wrong function: the
realized score is the outcome being predicted, and it ranges over ground the model's input never
occupies. 2025 team scores span 9.6 to 33.3 points per bucket where implied totals span 18.8 to
25.4, so "14+ in a quarter" runs **0.000 → 0.758** on the realized basis against **0.216 → 0.510**
on the implied one. Fit the first, price with the second, and you extrapolate a curve far outside
its own support — in the direction that makes favorites look like locks. The script emits both bases
side by side (`realized_basis_contrast`) so the difference is visible rather than argued.

The implied total is rebuilt exactly the way `scripts/simulate-bingo-boards.cjs` builds its
retrodictive market — shrunk prior-weeks scoring, no knowledge of the game itself. Weeks 1–4 are
dropped because the power ratings have no signal yet.

### What was wrong, and what it is now

| Constant | Was | Now | Why |
| --- | --- | --- | --- |
| `NFL_QUARTER_SCORE_SLOPE` | 0.0195 | **0.023** | Weighted LS over 1,664 team-quarters fits `0.2025 + 0.0230x`. The intercept Phase 2 guessed was right; the slope was shallow. |
| `NFL_EVERY_QUARTER_DEPENDENCE_BOOST` | 1.3 | **1.05** | Against the corrected per-quarter rate the measured ratio of P(all four) to `p⁴` is 1.13 / 0.96 / 0.98 / 1.08 across the four implied buckets. Most of what 1.3 carried was the shallow slope, not dependence. |
| `NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS` | 2.6 | **3.13** | Solved, not guessed: the value that reproduces the measured 0.2316 rate of "a quarter ends 0–0" at a league-average game. It rose *because* the per-quarter rate rose — only the product of the two was ever observable. |
| `quarterPointsAtLeast` | normal tail | **measured table** | See below. |
| `NFL_SECOND_HALF_HIGHER_BASE` | 0.51 | **0.4853** | Measured, regulation halves only (matching the grader). 4.4% of games tie exactly, and a tie is a miss — which is most of why this sits below a coin flip rather than just above it. |
| `NFL_FOURTH_DOWN_CONVERSION_BASE` | 0.75 | **0.83** | 0.8272 of 2025 games had at least one fourth-down conversion, off `team_stats.fourth_down_conversions` — an independently published number, not the plays walk the square grades from. That walk realized 0.861. |

### The 14-point quarter square: the model was the wrong shape, not the wrong constant

`quarterPointsAtLeast` read a normal tail on a quarter's points. NFL quarter scoring is discrete and
hard right-skewed — a pile at 0, 3, 7, 10, 14 — so the normal understates **every** threshold:

| Threshold | Normal model | Measured (league) |
| --- | --- | --- |
| 7+ | 0.853 | 0.921 |
| 10+ | 0.568 | 0.632 |
| **14+ (the one on boards)** | **0.183** | **0.363** |
| 17+ | 0.049 | 0.106 |

No tuning of `NFL_BIG_QUARTER_EFFECTIVE_TRIALS` could have fixed it: reproducing 0.363 from that
normal needs **7.5 effective trials in a four-quarter game**, which is the model reporting that it
is the wrong shape. It is replaced by `NFL_QUARTER_POINTS_MEASURED` — a `{threshold, rate at the
league-average implied total, slope per implied point}` table fitted by weighted least squares.
Thresholds 7 / 10 / 14 / 17 / 21 are all measured even though only 14 is emitted today, so a future
rung is a data lookup rather than a new measurement. An unmeasured threshold still falls through to
the old normal tail, with a comment saying what that means.

---

## 3. What was deliberately not fixed

**`nfl_winner_trailed_in_fourth` (−0.089 before, n=206) — and this is the one to read carefully.**
8b measured it at 0.2537 over the full season with a probe whose definition is line-for-line the
same as the shipped grader's; that was checked against the source, not assumed. Yet the grader
realized 0.165 on the boards it actually landed on. Two candidate explanations: the price is wrong,
or the square is not landing in average games. The second one generalizes:

> Board selection is difficulty-biased. A flat, market-independent base rate therefore lands
> disproportionately in the games where the generator needed that particular difficulty — and if the
> square's true rate moves with the spread, the games it lands in are not average games. A big
> favorite rarely trails in the fourth quarter.

Guessing between the two would have been exactly the failure mode this plan keeps legislating
against, so the constant was left alone. **§4 then settled it for free:** with the constant
untouched at 0.254, the recalibration of the *other* squares moved this one's realized rate from
0.165 to 0.268 and its gap from −0.089 to +0.014. Nothing about the square changed; what changed is
which games it now competes for a slot in. The price was never wrong.

**The general lesson survives the specific square, and it is the most transferable thing here:** a
gap in this table is a joint property of the price and the selector, and a flat base rate's apparent
error can belong entirely to the latter. Every remaining market-independent constant on this page
(`NFL_FIRST_SCORER_WINS_BASE`, `NFL_NON_OFFENSIVE_TD_BASE`, `NFL_LONG_TOUCHDOWN_BASE`, and the
Phase 8b Tier-3 rates) has the same exposure. **Before "fixing" any of them, change something else
and re-run** — if the gap moves, it was never that square's price.

**`NFL_OVERTIME_KEY_NUMBER_MULTIPLIER` (2.2).** Prices overtime at 0.063 against a measured 0.0515.
Real, measured, and left alone: it is a 0.011 error on a long shot that lands on about a fifth of
boards, which is below the noise floor of the thing being calibrated. Recorded here so the next
person doesn't spend an afternoon rediscovering it.

**`NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE`, `NFL_FIRST_SCORER_WINS_BASE`, `NFL_NON_OFFENSIVE_TD_BASE`,
`NFL_LONG_TOUCHDOWN_BASE`.** Replay gaps of −0.012, +0.011, −0.036 and −0.029 respectively. All
inside the ±0.04 the sample supports at those counts. Left alone.

**`BINGO_BOARD_TARGET_WIN_RATE`.** Untouched, as both Phase 7 and Phase 8 instruct. It is global.

**The specials/props split in `planByBucket` and `BINGO_NFL_TIER1_MAX_PER_BOARD`.** The plan's
tuning order names these first, ahead of any base rate. Neither was needed — the board was in band
before recalibration and stayed there after — so both are unchanged.

---

## 4. Proof that the recalibration landed

The same full-season replay, re-run against the recalibrated constants. Archived at
`docs/phase0-artifacts/phase8c-nfl-family-calibration-after-2026-08-17.json`.

| | Before | After |
| --- | --- | --- |
| Realized board win rate | 0.2430 | **0.2561** |
| Mean \|gap\| across 43 families | 0.0347 | **0.0193** |
| Sample-weighted mean \|gap\| | 0.0218 | **0.0119** |
| Families mispriced by more than 0.05 | **8** | **2** |
| Worst three \|gap\| | 0.182 / 0.111 / 0.103 | 0.134 / 0.063 / 0.040 |

Per family:

| Family | assigned before → after | gap before → after |
| --- | --- | --- |
| `nfl_team_quarter_points_at_least` | 0.189 → 0.352 | **+0.182 → −0.006** |
| `nfl_fourth_down_conversion` | 0.750 → 0.830 | **+0.111 → +0.016** |
| `nfl_team_shutout_quarter` | 0.765 → 0.700 | **−0.103 → −0.018** |
| `nfl_team_scores_every_quarter` | 0.236 → 0.293 | **+0.092 → −0.014** |
| `nfl_second_half_higher_scoring` | 0.510 → 0.485 | **−0.077 → +0.001** |
| `nfl_any_quarter_scoreless` | 0.317 → 0.240 | **−0.062 → −0.025** |
| `nfl_winner_trailed_in_fourth` | 0.254 → 0.254 | **−0.089 → +0.014** (price untouched) |

The board win rate moved *toward* the 0.25 target while the squares underneath it got individually
honest, which is the outcome worth having: 0.243 and 0.256 are both fine, but only one of them is
built out of squares that mean what they say.

**The last row is the most informative one in this document.** `nfl_winner_trailed_in_fourth` was
not touched — its constant is the same 0.254 it was — and its gap went from −0.089 to +0.014 anyway.
That is the selection mechanism in §3 caught in the act: fixing the *other* squares changed which
squares compete for a board slot, which changed the mix of games this one lands in, which moved its
realized rate by 0.10 with no price change at all. It is the cleanest available evidence that a flat
base rate's apparent error can belong to the selector rather than the number.

**Two families remain outside ±0.05, both left alone deliberately:**

- `nfl_team_red_zone_trip_without_touchdown` (−0.134, n=111 with a 9% void share; −0.068 on graded
  squares only). It read −0.030 on the graded basis in the before run, so this is a family whose
  measurement is bouncing around inside its own noise at n≈111 across ~110 games — about ±0.045.
  Worth re-checking on a second season before anyone touches its threshold.
- `nfl_long_touchdown` (−0.063, from −0.029). Same story, same conclusion.

Neither has a measurement behind a change, so neither gets one. That is the rule this phase is
built on.

**One footnote on the artifact.** The "after" replay was launched before a final 0.005 refinement to
`NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS` (3.19 → 3.13, re-anchoring it from the weeks-5+ subsample
to the full-season 0.2316), so the archived run priced `nfl_any_quarter_scoreless` at 0.2356 rather
than the 0.2306 the shipped code produces. It is a 0.005 difference on one square and is not worth
several hundred API calls to re-run; recorded here rather than papered over.

---

## 5. Other leagues are unmoved

Every board-composition and pricing change in 8b and 8c is behind `isNfl` or in NFL-only constants.
The all-league forward run confirms it:

| League | Games | Boards | Predicted mean | In target band |
| --- | --- | --- | --- | --- |
| `basketball_wnba` | 1 | 6 | 0.2519 | 1.00 |
| `baseball_mlb` | 11 | 66 | 0.2648 | 0.98 |
| `basketball_nba` | 0 | — | — | out of season |
| `americanfootball_nfl` | 0 | — | — | out of season |

Archived at `docs/phase0-artifacts/phase8c-all-league-forward-2026-08-17.json`. MLB's 0.2648 against
Phase 7's 0.2517 is a different night's slate, not a drift — both are inside the band with the same
0.98 in-band share, and the frozen-fixture tripwires (`npm run test:bingo-mlb`, 18 tests) are green
and unchanged, which is the comparison that actually controls for the slate.

NBA and NFL have no games on 2026-08-17, so the forward mode says nothing about either. NFL's number
is the backtest above; NBA's last stands at Phase 5's.

---

## 6. New surface

| File | What it is |
| --- | --- |
| `scripts/calibrate-nfl-square-families.cjs` | New. `npm run bingo:calibrate:nfl`. Per-family assigned-vs-realized calibration over a replayed season. The instrument that found everything in §1. Its header documents the two ways to misread its own output. |
| `scripts/measure-nfl-quarter-rates.cjs` | New. `npm run bingo:measure:nfl-quarters`. The season measurement behind every constant in §2, including the implied-vs-realized basis contrast. Three API calls, plus one per game for the fourth-down number (`--no-team-stats` to skip). |
| `tests/lib.sportsBingo.nfl-quarter-recalibration.test.ts` | New, 5 tests. Pins each recalibrated constant to its measured rate, guards the 14+ square against a revert to the normal tail, and holds the quarter-points curve monotone in both the threshold and the implied total. Added to `npm run test:bingo-nfl`. |
| `docs/phase0-artifacts/phase8c-nfl-quarter-rates-2026-08-17.json` | New. The season measurement. |
| `docs/phase0-artifacts/phase8c-nfl-family-calibration-before-2026-08-17.json` / `-after-` | New. The calibration table, both sides of the change. |
| `docs/phase0-artifacts/phase8c-nfl-backtest-prerecal-3wk-`/`-5wk-`, `-postrecal-3wk-` | New. The plan's literal deliverable — `bingo:simulate --backtest --seasons 2025` — three runs. Kept mainly as the evidence for the sample-size caution in §1. |
| `docs/phase0-artifacts/phase8c-nfl-family-calibration-prerecal-5wk-2026-08-17.json` | New. A superseded 79-game calibration run, kept because it is half of that same evidence. |
| `docs/phase0-artifacts/phase8c-all-league-forward-2026-08-17.json` | New. The other-leagues-unmoved run. |

Also changed: `lib/sportsBingoOdds.ts` (six constants and one function body — no new exports, no
resolver, no grader, no board-mix change), `package.json` (two script entries plus the new test file
in the `test:bingo-nfl` bundle), and `scripts/validate-nfl-bingo-grading.cjs`, whose "priced vs
realized" column carried a hand-copied `0.75` for the fourth-down square and would otherwise have
reported a `+0.09` delta against a price that no longer ships. Its header now says plainly that its
43-game sample is a smoke test and points at `bingo:calibrate:nfl` for the real measurement.

`npx tsc --noEmit` and `npm run lint` are clean. `npm run test` has the **same four failures it had
before this phase** — the Appendix A/B debt in the plan (one mobile-admin-allowlist test, three
edit-mode geofence tests), untouched — and nothing else. `npm run test:bingo-nfl` is green at 162
tests, `npm run test:bingo-mlb` at 18, and `npm run bingo:validate:nfl` still reports **43/43** on
all three grading-integrity checks.

One honest caveat on that: across six full-suite runs, five reported 4 failures in 2 files and
**one reported 5 in 3**. The extra failure did not reproduce in five subsequent runs, including two
deliberately run under CPU contention to provoke it, and its file was not captured. So it is an
unidentified intermittent, not a known-good suite — worth knowing if the next phase sees a fifth
failure and starts hunting for what it broke.

---

## 7. What's still open

1. **The two live checks still waiting on a real NFL game** (earliest 2026-09-11, recipe in
   `docs/prop-bingo-nfl-phase8a-findings.md` §1) — whether `team_stats` publishes mid-game, which
   `BINGO_NFL_TIER1_MAX_PER_BOARD=3` is conservatively assuming against, and whether
   `home_win_probability` is live, which square 45 is blocked on. Unchanged by this phase.
2. **The postseason `team_stats`/`stats` gap.** BDL returns zero rows for all 13 games of the 2025
   postseason, so Tier 1 and Tier 2 squares void on a postseason board. Pre-existing, found in 8a,
   still unfixed, and owned by whoever flips `NEXT_PUBLIC_BINGO_NFL_ENABLED`.
3. **Flat base rates and difficulty-biased selection** (§3, §4). Not a defect to fix so much as a
   property to remember: a gap in the calibration table belongs jointly to the price and the
   selector, and `nfl_winner_trailed_in_fourth` demonstrated it by self-correcting by 0.10 with no
   price change. Any phase that changes selection — Phase 9 explicitly does — should expect flat
   base rates to move in this table and should not read that movement as a pricing bug.
4. **Two families still outside ±0.05** (`nfl_team_red_zone_trip_without_touchdown` −0.134,
   `nfl_long_touchdown` −0.063), both at n≈110 where the noise floor is ±0.045 and both of which
   moved *away* from calibrated between the two runs. Neither has a measurement behind a change, so
   neither got one. **A dedicated second-season (2024) run to settle it was offered to Andrew and
   declined (2026-08-17)** — Phase 9's own calibration run is a second independent sample and gets
   the answer for free. Still outside ±0.05 there → real; back inside → it was noise.
5. **These are single-season (2025) rates and will drift.** Fourth-down aggression in particular has
   risen every year this decade. Re-run both new scripts before trusting any of it a year out.
6. **Phase 6's rollout items** — the live board-render screenshot and the flag flip — are still the
   gate on anything reaching a venue. Nothing in Phase 7, 8a, 8b or 8c has touched them.

---

## Decisions Andrew took (2026-08-17)

1. **Keep the scope expansion.** 8c's literal deliverable was met at 0.2430 before anything changed;
   the recalibration that follows was this phase's own judgement, offered as a keep-or-revert with
   the revert cost stated (one file plus one test file, nothing committed, NFL still flag-dark).
   Kept. The accepted trade is a mild change in card *feel* against squares that mean what they say.
2. **Decline the optional second-season measurement** (§7 item 4). Phase 9's calibration run covers
   it at no extra cost.

Both are recorded in the parent plan's Phase 8c handoff section so they are not re-litigated.

---

## Handoff to Phase 9

Phase 9 is star-tilted prop selection with a self-maintaining star index. Four things it should know
before starting:

1. **Its win-rate re-check has a fresh baseline and a better instrument than the plan assumes.** The
   number to beat is the "after" row in §0, measured over the full season. Run
   `npm run bingo:calibrate:nfl -- --weeks 1,2,…,18 --boards 4` alongside
   `npm run bingo:simulate -- --backtest --seasons 2025`, not instead of it: the board win rate will
   not tell you whether star-tilting broke a family's price, and the calibration table will.
2. **Do not read a three-week slate as a measurement.** Two identical three-week runs during this
   phase produced 0.2674 and 0.2004. The full season produced 0.2430 twice. Boards within a game
   share that game's outcome, so games are the sample, not boards.
3. **Star-tilting is a selection change, which is exactly the mechanism §3 warns about.** Tilting
   toward star players tilts *which games* get which squares. Any flat base rate whose truth moves
   with the market will drift in the calibration table as a result, and that drift is a real
   pricing error, not an artifact. Check the table before and after.
4. **Player props are still unbacktestable** — `/nfl/v1/odds/player_props` is live-only — so the
   backtest grades the board Phase 9 changes *around* the props, not the props themselves. A star
   index that changes which props are selected cannot be validated by the harness. Say so in the
   Phase 9 findings rather than letting a green backtest imply coverage it doesn't have.

**Model: Opus 5 · effort: high**, as the plan specifies.
