# Prop Bingo — NFL Phase 8b Findings

**Status:** Phase 8b (implementation) complete. **Ran:** 2026-08-17, against the live balldontlie
API and this repo's `.env.local` key. **Parent plan:** `docs/prop-bingo-nfl-plan.md` (Phase 8, "The
flavor-square slate"). **Predecessor:** `docs/prop-bingo-nfl-phase8a-findings.md`.

**8c (recalibration) is not started.** See "Handoff to 8c" at the bottom.

---

## 0. Headline: Tier 4 fails its own ship gate, decisively

The plan's gate for the drive-segmented squares (46–51) was: reconstruct drives over ≥200 archived
games, reconcile the count against the independently published `team_stats.total_drives`, and **ship
only if it reconciles on ≥98% of games**.

Measured over all **272** games of the 2025 regular season:

| Metric | Result |
| --- | --- |
| Exact drive-count match (both teams) | **32.0%** |
| Within one drive | 87.5% |
| Mean absolute delta | 0.81 drives |

That is not a near miss. Two of the six Tier-4 candidate rates came back at **exactly 0.000** —
"the game opens with a three-and-out" and "a team punts on its first two drives" — which is
independent evidence the reconstruction is wrong rather than merely imprecise: those events happen
constantly in real football.

**The cause is structural, not a bug to fix.** BDL exposes no drive id, so a "drive" has to be a
maximal run of plays sharing a possessing `team`. That merges a kickoff into the receiving team's
next drive, splits a drive across a change-of-possession penalty, and cannot see a drive that ends
and restarts for the same team (turnover on downs returned, onside kick recovered). The plan
anticipated exactly this: *"If it doesn't reconcile, ship squares 35–45 and drop Tier 4; squares 35
and 47 cover most of the same emotional ground with none of the risk."* **Tier 4 is dropped.**

Raw numbers: `tier4DriveReconstruction` in
`docs/phase0-artifacts/phase8b-nfl-threshold-sweep-2026-08-17.json`.

---

## 1. What shipped

**44 flavor squares** across three tiers, as **20 new resolver kinds** — parameterised by source,
not one kind per square, so a 45th square is a data-only edit in `lib/sportsBingoNflFlavor.ts`.

| Tier | Source | Squares | Kinds | New requests |
| --- | --- | --- | --- | --- |
| 1 | `/nfl/v1/team_stats` | 42 (19 × 2 teams + 4 game-level) | 7 | **one per game**, only when a board holds one |
| 2 | `/nfl/v1/stats` | 15 | 4 | zero — already fetched every tick |
| 3 | `/nfl/v1/plays` | 10 | 9 | zero — rides the Phase 4 walk |

Two squares from the plan's table are **not** shipped:

- **#45, "the winner was once under 25% to win."** Blocked on 8a's Q5: `home_win_probability` is
  98.2% populated in the *archive*, which proves BDL retains it, not that it is written while the
  game is being played. A comeback square that only resolves after the whistle is the one thing that
  square exists not to be. Ships when the Week-1 live check confirms live population.
- **#46–51 (Tier 4).** See §0.

---

## 2. The threshold sweep — 8a's guesses, measured

8a measured one hand-picked threshold per field and, where it missed, wrote a *guess* into its
findings ("~7", "~50 yards", "~340–350"). Those guesses are the "second unvalidated number" the plan
explicitly forbids shipping, so 8b extended the probe with `--sweep` and read every threshold off a
real curve. **Tool:** `npm run bingo:probe:nfl-flavor -- --season 2025 --sweep --tier4
--tier3-sample 272 --json`.

Every rate below is over **544 team-games** (Tier 1 per-team), **272 games** (Tier 1 game-level,
Tier 2, Tier 3).

### Where the plan's sketched threshold was wrong

| Plan # | Square | Plan's threshold | Its measured rate | **Shipped** | Measured rate |
| --- | --- | --- | --- | --- | --- |
| 1 | Team commits N+ penalties | 3 | 0.941 | **7** | 0.426 |
| 2 | Team penalized N+ yards | 75 | 0.188 | **50** | 0.467 |
| 3 | Combined penalty yards | 120 | 0.320 | **95** | 0.493 |
| 7 | Team converts N+ third downs | 6 / 8 | 0.399 / 0.121 | **5** | 0.568 |
| 12 | Team holds the ball N+ | 35:00 | 0.134 | **30:00** | 0.506 |
| 13 | Team gains N+ total yards | 400 | 0.189 | **330** | 0.513 |
| 14 | Team held under N total yards | 250 | 0.176 | **≤300** | 0.373 |
| 15 | Team averages N+ Y/P | 6.0 | 0.292 | **5.4** | 0.500 |
| 16 | Team picks up N+ first downs | 25 | 0.156 | **20** | 0.480 |
| 17a | Team rushes for N+ | 150 | 0.233 | **115** | 0.496 |
| 17b | Team passes for N+ | 300 | 0.108 | **210** | 0.476 |
| 19 | Team runs N+ offensive plays | 70 | 0.156 | **62** | 0.517 |
| 20 | Team sacked N+ times | 4 | 0.235 | **3** | 0.406 |
| 21 | An N-yard rusher | 100 | 0.324 | **85** | 0.482 |
| 22 | An N-yard receiver | 100 | 0.426 | **75** | 0.750 |
| 23 | An N-yard passer | 300 | 0.221 | **260** | 0.482 |
| 24 | Both QBs throw for N+ | 250 | 0.151 | **180** | 0.485 |
| 30 | Punts downed inside the 20 | 1 (any) | 0.956 | **3 (game total)** | 0.559 |
| 33 | A defender records N+ tackles | 10 | 0.790 | **12** | 0.426 |
| 34 | A defender picks off a pass | 1 (any) | 0.787 | **2 (game total)** | 0.430 |
| 35 | First score inside N minutes | 5 | 0.191 | **6** | 0.467 |
| 44 | A touchdown from inside the N | 2 | 0.695 | **1** | 0.522 |

### Where the plan's sketch was already right (shipped unchanged)

| Plan # | Square | Threshold | Measured |
| --- | --- | --- | --- |
| 4 | Team turns it over 2+ | 2 | 0.327 |
| 5 | Neither team turns it over | combined ≤0 | 0.081 |
| 6 | 3+ combined turnovers | 3 | 0.401 |
| 8 | Team converts a fourth down | 1 | 0.568 |
| 9 | Team perfect in the red zone (3+ trips) | 3 | 0.086 |
| 18 | Team scores a defensive touchdown | 1 | 0.121 |
| 25 | A receiver catches 10+ | 10 | 0.140 |
| 26 | A player scores 2+ TDs | 2 | 0.526 |
| 27 | A 50+ yard FG made | 50 | 0.474 |
| 28 | A kicker makes 3+ FGs | 3 | 0.408 |
| 31 | A non-QB throws a pass | 1 | 0.074 |
| 32 | A defender records 2+ sacks | 2 | 0.386 |
| 36 | Score in the final minute of the 1st half | 1:00 | 0.647 |
| 37 | Score in the last 2:00 of the 4th | 2:00 | 0.412 |
| 38 | Both teams lead at some point | — | 0.596 |
| 39 | Lead change in the second half | — | 0.379 |
| 40 | The winner trailed in the fourth | — | 0.254 |
| 41 | Tied after halftime | — | 0.268 |
| 42 | A successful two-point conversion | — | 0.184 |
| 43 | A safety | — | 0.048 |

### Three squares added that the plan's table did not have

They were free once the parameterised kinds existed, and each is genuinely distinct from its
neighbours: **combined penalties ≥13** (0.471), **5+ sacks in the game** (0.507), and the per-team
**"never turns the ball over"** (0.346), which is a better square than the game-level version
because it can hit for one team while the other is coughing it up.

---

## 3. Four corrections to what 8a and the plan said

### 3a. Square 10 is renamed, not re-proxied

8a flagged that `red_zone_attempts > red_zone_scores` also fires on a red-zone turnover or a failed
set of downs, so it overcounts "settled for a field goal." **Shipped as the rename**, per 8a's own
recommendation: *"\<Team> leave a red-zone trip without a touchdown."* (0.801). No `/nfl/v1/plays`
drive reconstruction was attempted for the literal claim — §0 is why that would have been a bad bet.

### 3b. Square 29 is a missed **field goal**, not "a missed field goal or extra point"

The plan sketched `field_goal_attempts > field_goals_made`, **or** `extra_points_made` behind
touchdowns. The second half is not gradable: the box score cannot distinguish a missed extra point
from a **successful two-point conversion**, so an XP clause would fire on a made play.

Worth stating plainly because it changes how 8a's number should be read: **8a's 0.460 was a
missed-field-goal rate all along.** Its extra-point clause was evaluated per player row, where it
compared a kicker's `extra_points_made` against that same kicker's (always zero) rushing and
receiving touchdowns — a condition that can never be true. The shipped square is
`nfl_game_missed_field_goal` at 0.460, which is the number that was actually measured.

### 3c. An absent `team_stats` field means **zero**, and the base rates depend on it

BDL omits `sacks` and `fourth_down_conversions` entirely for a team that recorded none — 71 and 125
of 544 team-games respectively. The sweep confirmed which reading the base rates assume: computing
`sacks >= 4` over only the 473 rows where the field is present gives 0.271, while counting the
absent rows as zeros gives **0.235 — exactly 8a's published number**. The grader reads an absent
field on an available row as `0`, and `tests/lib.sportsBingo.nfl-flavor-squares.test.ts` asserts it.

An absent *row* is a different thing entirely and voids. That distinction is the postseason case 8a
found (zero `team_stats` rows for every 2025 playoff game).

### 3d. Square 35's denominator

The sweep's `first_score_within_minutes` curve is computed over the 252 games whose first score came
in the first quarter with a parseable clock; the other 20 are misses at any threshold ≤15:00. The
shipped rate is scaled accordingly (0.504 × 252/272 = **0.467** at 6 minutes). Cross-check: the same
adjustment reproduces 8a's `first_score_within_5min` exactly.

---

## 4. Settlement asymmetry: which squares may settle early

This is the correctness contract of the phase, and it is not the same for all 44 squares.

**A monotone counter may settle an at-least square the instant the feed clears it** — nothing can
take it back, and the cron never reopens a settled hit. `NFL_MONOTONE_TEAM_STAT_FIELDS` in
`lib/sportsBingoNflFlavor.ts` is that list.

**Three families are Final-only despite looking like counters**, and each is a bug that would only
have shown up as a square that hit and then became false:

1. **`yards_per_play` is a ratio.** A team can average 6.1 at halftime and 5.2 at the whistle.
2. **Time-of-possession advantage is a differential.** Both inputs are counters; their difference is
   not — the other team gets the ball back.
3. **`red_zone_attempts > red_zone_scores` (square 10).** `red_zone_attempts` almost certainly
   increments on *entering* the red zone, before the trip has resolved, so a live `attempts >
   scores` can be a trip still in progress rather than a trip that failed.

Two settlements are earlier than the naive "wait for Final":

- An **at-most** square on a monotone counter **misses** the moment the counter blows past its
  bound.
- A **first-half** Tier-3 square misses the moment a third-quarter play appears, rather than waiting
  for the game to end.

---

## 5. Everything else that changed

| Area | Change |
| --- | --- |
| Board mix | NFL takes one slot from the **team-total** ladder and gives it to specials: 2/3/3/**2** core = 10, specials **6**, props 8. The plan's own donor choice; that ladder is the block Phase 3 note 11 and Phase 4 note 3 both flagged for dead-weight 85–93% rungs. |
| Tier-1 caps | Max **3** per board (`BINGO_NFL_TIER1_MAX_PER_BOARD`), max **2** per team (`BINGO_NFL_TIER1_MAX_PER_TEAM`). Both env-tunable. The board cap is the plan's Final-only fallback, taken because 8a's Q1 is still open — see §6. |
| Feed | `/nfl/v1/team_stats` joins `NFLGameStatsSnapshot`, memoized per game, fetched **only** when a card holds a Tier-1 square. Tested both ways. |
| Plays walk | Ten new facts off the same loop (clock, period, `start_yards_to_endzone`, running-lead bookkeeping). `npm run bingo:validate:nfl` still reports **43/43** on all three integrity checks after the change. |
| Kill switch | `BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` now gates Tier 3 as well as Optional 3b — twice the surface behind one flag, as the plan requires. |
| Correlation | All 20 kinds have `exposureForResolver` entries. Tier-1 wiring is per *field* (`NFL_TEAM_STAT_WIRING`), so `total_yards` loads on team scoring and `penalties` barely loads at all. A **static test** now fails if any `nfl_*` kind in `lib/sportsBingo.ts` lacks a `case` in `lib/sportsBingoCorrelation.ts`. |
| Exclusions | Five new mutual-exclusion pairs (perfect red zone vs. a trip without a touchdown; opposite-team possession advantage; combined-at-most vs. per-team-at-least on the same field; and the same field pulled both ways for one team). |
| Backtest seam | `gradeResolversAgainstCompletedNFLGame` takes `teamStatRows`, and `npm run bingo:simulate --backtest` fetches them when a board needs them. Without this 8c would grade every Tier-1 square `void`. |
| Fixtures | `tests/fixtures/nfl-team-stats-2025.json` and `nfl-player-stats-2025.json` — real BDL rows for the same twelve games the Phase 5 slate uses, trimmed to the fields the graders read. |

**Realized win rate on the frozen twelve-game slate** (300 boards, play-by-play squares off, which
is how that test runs): **0.260 realized against 0.254 predicted, with 0.08% of squares ungraded.**
Inside the 20–30% band, and the estimator agrees with reality to within 0.006. That is a tripwire,
not 8c's answer — see below.

---

## 6. What's still open

1. **8a's Q1 is still unanswered and still gates the Tier-1 board cap.** Nobody can tell whether
   `team_stats` is populated mid-game or only at Final until a real NFL game is in progress
   (earliest 2026-09-11). The recipe is two API calls, in `docs/prop-bingo-nfl-phase8a-findings.md`
   §1. If it comes back live, raise `BINGO_NFL_TIER1_MAX_PER_BOARD` — no deploy needed.
2. **Q5's live half, same gate, and it blocks square 45** (the comeback square). Same check.
3. **The postseason `team_stats`/`stats` gap is unchanged and still not fixed.** Every Tier-1 and
   Tier-2 square now voids on a postseason board, which is the correct behavior for a missing feed
   but is still a product gap for a Week-19+ launch. Pre-existing; 8b did not make it worse or
   better.
4. **8c has not run.** The realized number in §5 is a twelve-game fixture with no player props and
   no play-by-play squares. The plan's actual acceptance is `npm run bingo:simulate -- --backtest
   --seasons 2025` across every league.
5. **These are single-season (2025) rates and they drift.** Re-run
   `npm run bingo:probe:nfl-flavor -- --season <latest> --sweep --json` and diff against the
   archived artifact. Reassuringly, the 8a-vs-8b comparison suggests the drift is small: re-running
   Tier 3 at 272 games instead of 90 moved every rate by at most **0.032** (`winner_trailed_in_
   fourth`, 0.222 → 0.254), so 8a's "thin sample" caveat turned out to be conservative.
6. **Tier 4 is dropped, not deferred.** Do not re-attempt it against `team` runs. If drive-level
   squares are ever wanted, they need a provider that publishes a drive id.

---

## Handoff to 8c

Everything 8c needs exists and is wired:

- `npm run bingo:simulate -- --backtest --seasons 2025` now fetches `/nfl/v1/team_stats` per game
  when a board holds a Tier-1 square, and passes it through the shipped grader. Archive before/after
  under `docs/phase0-artifacts/`.
- Confirm NBA/WNBA/MLB are **unmoved**. Everything 8b changed to board composition is behind
  `isNfl`, and the all-league simulate run is what proves it.
- The plan's "quiet bonus" is now real and measurable: on the fixture slate, 99.9% of squares graded
  against a completed game (props are live-only, so on a *live* board the number will be lower).
- **Do not touch `BINGO_BOARD_TARGET_WIN_RATE`.** It is global.
- If NFL lands outside 20–30%, the tuning knobs in preference order are the specials/props split in
  `planByBucket`, then `BINGO_NFL_TIER1_MAX_PER_BOARD`, then the per-square base rates — but a base
  rate is a *measurement*, so changing one means re-running the sweep, not editing the constant.

**Model: Opus 5 · effort: high**, as the plan specified for 8b.
