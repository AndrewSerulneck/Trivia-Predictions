# Phase 7 — MLB team-event rebalance, before/after

Artifacts for Phase 7 of `docs/prop-bingo-nfl-plan.md`, measured 2026-08-17.

## 7c — `npm run bingo:simulate -- --sports baseball_mlb`

Three measurements, taken separately on purpose: the plan warns that changing the data feed and the
thresholds in one step makes the result uninterpretable, so the data-correctness fixes were landed
and measured on their own before any threshold moved.

| State | boards | mean | p25 | median | p75 | `inTargetBand` |
| --- | --- | --- | --- | --- | --- | --- |
| **Before** (as inherited) | 55 | 0.3191 | 0.2772 | 0.3108 | 0.3568 | **0.345** |
| After the two data-feed bug fixes only | 55 | 0.3286 | 0.2964 | 0.3264 | 0.3600 | 0.273 |
| **After the rebalance** | 55 | 0.2683 | 0.2532 | 0.2756 | 0.2896 | **1.000** |
| After the rebalance (6 boards/game re-run) | 66 | 0.2517 | 0.2288 | 0.2544 | 0.2816 | 0.985 |

The plan's 7c target was "a mean inside 20-30% and an `inTargetBand` share comparable to WNBA's
(1.00) and NFL's (0.99)". Both met.

Note the middle row: fixing the feed *worsened* the band share on its own, which is the expected
direction. Correct recent data produces more player-prop candidates than 26-year-old data did, and
those candidates were priced by the same optimistic estimator; the band share only moves once the
team-event thresholds are corrected. It is recorded here so the two effects are not conflated later.

## Other leagues — unchanged

Run at the same time, all leagues, 5 boards per game:

| League | games | mean | `inTargetBand` |
| --- | --- | --- | --- |
| `basketball_wnba` | 1 | 0.2654 | 1.00 |
| `baseball_mlb` | 11 | 0.2635 | 1.00 |
| `basketball_nba` | 0 | — | out of season |
| `americanfootball_nfl` | 0 | — | out of season |

## 7a — measured base rates

Full report: `mlb-event-rates-2026-08-17.json` (1,138 team-games, 2026-07-03 .. 2026-08-16,
569 completed regular-season games). Regenerate with `npm run bingo:measure:mlb -- --days 45 --json`.

Priced vs. realized for the squares that shipped before Phase 7:

| Square | Priced | Measured |
| --- | --- | --- |
| `hit` >= 5 | 0.78 | **0.865** |
| `walk` >= 2 | 0.62 | **0.812** |
| `hit_by_pitch` >= 1 | 0.38 | 0.338 |
| `strikeout` >= 5 | 0.67 | **0.917** |
| `groundout` >= 4 | 0.74 | **0.969** |
| `flyout` >= 4 | 0.74 | 0.764 |

Every one wrong in the same direction except hit-by-pitch, which was the block's one honest square
and is left near where it was.

## 7a — which per-game predictor is real

Slope and correlation of a team's count on each candidate trailing predictor, leak-free (earlier
games only):

| Event | own form | opponent allowed | best |
| --- | --- | --- | --- |
| `hit` | -0.161 / r=-0.041 | 0.552 / r=0.154 | opponent |
| `walk` | 0.306 / r=0.087 | 0.547 / r=0.174 | opponent |
| `hit_by_pitch` | 0.065 / r=0.019 | 0.496 / r=0.146 | opponent |
| `strikeout` | 0.329 / r=0.104 | 0.850 / r=0.292 | opponent |
| `groundout` | 0.234 / r=0.068 | 0.732 / r=0.245 | opponent |
| `flyout` | 0.208 / r=0.063 | 0.751 / r=0.197 | opponent |

A team's own trailing form is noise for all six events. The opposing staff's trailing rate allowed
is the signal for all six. The plan's assumption that the threshold should scale with the team's
implied run total was doubly unavailable — MLB has no market model, so its implied totals are the
same 5.75 / 2.25 constants for every game ever played.

## Sanity check — real generated boards, 2026-08-17

Squares from the block on three live boards, showing the threshold moving with the matchup:

```
Orioles vs. Rays        Rays: 8+ strikeouts (0.60)    Orioles: 10+ strikeouts (0.33)
                        Orioles: 5+ flyouts (0.59)    Orioles: 6+ flyouts (0.41)
Cardinals vs. Reds      Cardinals: 10+ groundouts (0.31)   Reds: 9+ hits (0.42)
Marlins vs. Phillies    Phillies: 9+ groundouts (0.43)     Phillies: 3+ walks (0.61)
```

7 to 10 of a board's 24 squares come from the block, against 6.3 before — it was re-priced, not
priced off the board.
