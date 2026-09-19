# Bingo board quality and calibration audit — Phase 5

Date: 2026-09-19. Scope: local/offline implementation evidence only. Nothing in this audit was
deployed and no production board, square, point, reward, notification, flag or environment value
was changed.

## Enforced board contract

Every generated board still has one FREE cell and exactly 24 non-free cells. New selection now
requires all 24 to pass the Phase 4 capability gate and enforces:

- zero duplicate resolver keys;
- zero repeated player-stat axes, including alternate thresholds/directions and duplicate factory
  phrasing for the same player's same event;
- at most two squares for one provider player ID across all supported leagues and square families;
- for NFL, at most eight player props and at most six specials;
- for a full eight-prop NFL block, at least six distinct player IDs and both teams when the verified
  prop pool contains both sides;
- for NFL, at least three resolvers the shipped grader can settle before Final; and
- shared availability rejects a game when 24 supported cells cannot be composed under the axis,
  player and early-progress constraints.

The NFL 10-core / 6-special / 8-prop design is preserved on a rich market. Core ladder thresholds
remain distinct because the 20–30% estimator and line-correlation model were calibrated with those
rungs. Impossible pairs are still kept off each of the 12 winning lines by the existing board
arranger. Player-stat over/under variants now share one board-level diversity axis.

## Seeded samples

### NFL — checked-in real 2025 completed-game shapes

Command:

```sh
npm run bingo:audit:phase5 -- --output docs/phase5-artifacts/nfl-calibration-2026-09-19.json
```

The sample is 12 real completed games × 25 boards = 300 boards, seed `0x5eed2026`. The paired
`legacy-audit` mode disables only Phase 5 selection constraints; application generation cannot
request that mode. Both sides use the shipped generator, estimator and grader.

| Measure | Before | Phase 5 |
|---|---:|---:|
| Predicted mean | 25.594% | 25.698% |
| Predicted range | 20.08–29.92% | 14.72–35.60% |
| Boards inside ideal 20–30% band | 300/300 | 277/300 |
| Realized wins | 48/300 | 66/300 |
| Realized rate | 16.0% | 22.0% |
| Realized Wilson 95% interval | 12.29–20.57% | 17.68–27.03% |
| Absolute predicted/realized difference | 9.594 points | 3.698 points |
| Unknown/void outcomes | 1,023/7,200 (14.208%) | 521/7,200 (7.236%) |
| Special cells per board | 6–14, mean 10.067 | exactly 6 |
| Early-progress cells | 11–19, mean 15.627 | 12–19, mean 15.770 |
| Duplicate-key boards | 0 | 0 |
| Repeated-player-axis boards | 0 | 0 |
| Unsupported-candidate boards | 0 | 0 |

The wider per-board predicted range is the honest thin-pool tradeoff: historical player-prop odds
are unavailable, so capping specials at six forces supported core ladders to fill eight absent prop
slots. The aggregate estimator remains centered and realized performance improves into target. It
would be misleading to add unsupported props or restore 10–14 specials merely to make every thin
historical board land inside 20–30%.

The 521 unknown outcomes are retained as unknown. Primary reasons are dropped all-zero player rows
(`required_player_stat_missing`), missing passer position, incomplete kicker rows and a small number
of unavailable team-stat/red-zone facts. The audit does not zero-fill any of them.

### NFL — rich current-shaped prop market

`tests/lib.sportsBingo.nfl-prop-mix.test.ts` generates 12 boards from a seeded 2026 scheduled-game
fixture with eight provider player IDs, both team objects, two-book prop consensus and verified NFL
market types. Every board contains exactly eight props, six or seven distinct subjects, both teams,
no player above two cells, at least four non-player NFL specials, and 12–18 early-progress cells.
Maximum label length is 44–59 characters. The injury suite separately verifies that Out, Doubtful,
IR and off-matchup player IDs are excluded, Questionable remains eligible, a late inactive can be
swapped only inside the existing pregame policy, and a final DNP voids rather than misses.

This fixture is scheduled rather than settled, so it has no honest realized win or void rate. Live
current-season prop-rich observation remains required; a historical prop-free replay cannot supply
it.

### MLB

`tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts` is now seeded with `0x5eed2026`: 13 real
completed 2026 games × 12 boards = 156 boards. Predicted range is 20.08–29.88%, mean 25.743%; the
sample realizes 50/156 = 32.051%, Wilson 95% interval 25.24–39.73%, with zero pending/void outcomes.
The team-event block averages 7.833 cells. This historical fixture deliberately omits player-prop
odds; separate seeded MLB star/prop tests cover current-shaped prop selection and confirm the Phase
5 player-axis change is deterministic.

### NBA and WNBA

`tests/lib.sportsBingo.board-feasibility.test.ts` now runs four seeded boards for each league through
the full resolver-returning builder. All eight boards have 25 cells, pass the capability/duplicate/
player-cap audit and have no impossible winning line or retired combination-stat prop. NBA predicted
rates are 22.833–30.0% (mean 26.375%). The deliberately thin WNBA one-book fixture is 26.667–33.5%
(mean 29.458%); one board is above the ideal band but inside the generator's existing 15–35%
tolerance. Unsupported period/achievement props were not restored to force it below 30%.

Captured NBA/WNBA Phase 4 fixtures continue to replay hit, miss, boundary, missing and partial data
for every admitted cumulative family. The four-board samples are composition checks, not realized
league calibration; no suitable multi-game settled WNBA prop slate is checked in.

## Label and mobile review

The persisted full label remains available as the square `title`. Creation preview allows 70
characters and expanded review renders the complete label with wrapping. Active landscape renders
the full label and clamps by four real rendered lines rather than a character count. Compact
portrait play intentionally shortens text because its cells are much smaller. The longest seeded
NFL rich-market label is 59 characters and the longest historical label is 48; both fit the
expanded/landscape paths without character truncation. Existing PWA source-contract tests protect
the landscape behavior.

This was a code/test review, not an authenticated browser, installed-PWA or physical iOS/Android
certification. Phase 7 still owns those release checks.

## Interpretation and remaining observation

- The predicted 20–30% target remains the selection objective; predicted estimates and realized
  results are recorded separately.
- NFL's seeded prop-free point estimate is now in target, but its 95% interval extends below it and
  7.236% of square evidence is unavailable. This is evidence, not certification of live prop boards.
- MLB's point estimate is above target, but its interval includes the target and the 156-board
  historical sample excludes modern props. Continue observation rather than tuning against one
  small fixed slate.
- NBA/WNBA have composition/replay evidence, not a multi-game realized-rate claim.
- Release sign-off needs current-season stored boards with prop mix, complete provider evidence,
  first-resolution timing, void reasons and realized outcomes measured over multiple weeks.

The machine-readable NFL artifact is
`docs/phase5-artifacts/nfl-calibration-2026-09-19.json`.
