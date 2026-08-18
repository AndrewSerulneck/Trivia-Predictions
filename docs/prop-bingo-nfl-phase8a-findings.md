# Prop Bingo — NFL Phase 8a Findings

**Status:** Phase 8a complete, with one item (Q1) explicitly **not answerable from archived data**
and left open for whoever does 8b. **Ran:** 2026-08-17, against the live balldontlie API and this
repo's `.env.local` key. **Parent plan:** `docs/prop-bingo-nfl-plan.md` (Phase 8, "The flavor-square
slate").

**Tool built (reusable, not one-shot):** `npm run bingo:probe:nfl-flavor` →
`scripts/probe-nfl-flavor-squares.cjs`. Self-contained (plain `node --env-file`, no project TS
imports — team_stats/stats/plays field math doesn't need anything `lib/sportsBingo.ts` exports).
Re-run it after any BDL contract change, and definitely re-run it once a full season has passed
through the *fixed* pipeline (see "What's still open" below) to refresh the base rates before
retuning thresholds. Raw JSON archived at
`docs/phase0-artifacts/phase8a-nfl-flavor-squares-2026-08-17.json` — every number below is read off
that file, not re-derived.

---

## 0. Headline: a second data gap, found by accident, bigger than any one square

**`/nfl/v1/team_stats` and `/nfl/v1/stats` return zero rows for every 2025 postseason game.** All
13 playoff games (`postseason: true`, `status: "Final"`, real scores on `/nfl/v1/games`) come back
empty on both endpoints — checked individually, not just in a batch that could have silently
dropped them. This was not one of the plan's five questions; it turned up while assembling the
season game list for the base-rate measurement below.

**Consequence, and it's bigger than Phase 8:** every Tier 1/2 flavor square in this phase, plus the
*already-shipped* Phase 3/4 player-prop candidates and settlement path, cannot grade a postseason
NFL board today. This was true before Phase 8 existed; Phase 8 just found it, the same way Phase 7
found two pre-existing MLB bugs while measuring something else. **Not fixed here** — it's out of
scope for "probe and measure," and NFL is dark behind `NEXT_PUBLIC_BINGO_NFL_ENABLED` regardless, so
nothing in production is affected yet. Whoever flips that flag needs to know postseason boards will
currently be built (core markets from `/odds` still work) but will settle nothing beyond
score/quarter-based squares. Flagged in "What's still open."

All base rates below are measured on the **272-game 2025 regular season only**, which BDL does
have complete stats for.

---

## 1. The five unknowns

### Q1 — Is `team_stats` populated mid-game, or only at Final? **Not answerable from archived data.**

This is the single most important question in the phase and it cannot be checked right now,
structurally: BDL only ever returns `team_stats` for games it has already recorded, and it stores
no mid-game snapshot history to replay for a completed game. There is no way to ask "what did this
endpoint say for this game three hours ago." **It requires observing a real in-progress NFL game**,
and BDL has zero preseason games (confirmed in Phase 0) and the season doesn't start until
Week 1 2026 (~2026-09-10, per the season calendar in `lib/leagueSeasonStatus.ts`) — today is
2026-08-17. There is no NFL game happening anywhere in the world right now that this key has
access to.

**The exact live-check recipe for whoever does 8b, or picks this up closer to kickoff:**

```
node --env-file=.env.local scripts/probe-nfl-flavor-squares.cjs --season 2026 --tier3-sample 0
```

won't do it — that script only reads completed games. Instead, during a live Sunday window, poll
`/nfl/v1/games?dates[]=<today>` for a game with `status_state` other than `"scheduled"` or
`"final"`, grab its `id`, and hit `/nfl/v1/team_stats?game_ids[]=<id>` twice, a few minutes apart,
mid-game. If the two calls differ, it's live. If both calls return the Q1/Q2 numbers frozen at
whatever they were when you first checked (or return nothing at all until the final whistle), it's
Final-only and **Tier 1 must be capped at ~3 squares per board**, exactly as the plan's fallback
says. This is a 15-minute check with no script needed — don't over-engineer a poller for it.

### Q2 — Is `sacks` oriented to sacks *taken* (offense) or sacks *made* (defense)? **Answered: taken.**

Measured by summing each team's players' `defensive_sacks` (from `/nfl/v1/stats`) per game, then
comparing `team_stats.sacks` against both that team's own defensive total and the *opponent's*
defensive total, restricted to the 378 team-rows (of 544) where the two teams' defensive-sack
counts actually differed (an ambiguous 0-0 or equal split proves nothing either way, so those 95
rows were excluded from the count, not treated as evidence).

**370 of 378 (97.9%) matched the opponent's defensive sacks. Only 4 of 378 matched the team's own
defense.** `team_stats.sacks` is **sacks that team's offense took**, not sacks its defense made —
confirmed directly, not inferred from the docs' coincidental 2-2 sample. A concrete example from the
data (`gameId 423964`): CHI's `team_stats.sacks = 4`, CHI's own defense recorded 0 sacks that game,
the opponent's defense recorded 4 — i.e. Chicago's offense was sacked 4 times.

**Square 20 ("\<Team> sacked 4+ times") is now unblocked and graded correctly as
`team_stats.sacks >= 4` for the team named on the square** — the field already means what the
square's label says, no inversion needed.

### Q3 — Does `red_zone_scores` count red-zone TDs, or all red-zone points? **Answered: touchdowns only.**

Measured by summing each team's touchdowns from `/nfl/v1/stats` (rushing + receiving + kick-return +
punt-return + interception-return + fumble-return, i.e. every touchdown type a player row can carry)
and comparing against that team's `red_zone_scores`, across all 533 team-rows where both fields were
present.

**`red_zone_scores` never once exceeded a team's total touchdown count — 0 violations across 533
rows.** That's the whole test: if red-zone field goals counted, plenty of teams would show more
red-zone "scores" than touchdowns (a team can easily kick 2 red-zone FGs and score 1 TD elsewhere).
None did. Separately, **427 of 533 rows had `red_zone_attempts > red_zone_scores`** — i.e. most
teams leave at least one red-zone trip unconverted for a touchdown, which is consistent with real
football and confirms the field isn't just mirroring attempts.

**Caveat for whoever builds square 10 ("\<Team> settles for a field goal in the red zone")**: the
plan's proxy, `red_zone_attempts > red_zone_scores`, is *necessary* but not *sufficient* — it's true
both when a team kicks a red-zone FG and when a team turns the ball over or fails on downs in the
red zone without scoring at all. The measured 0.785 rate for this proxy (see base rates below) is
therefore an overcount of "settled for a FG" specifically; it's the right rate for "didn't score a
TD on every red-zone trip," which is a different, easier square. 8b should either rename the square
to match what's actually measurable, or narrow it using `/nfl/v1/plays` (a red-zone drive ending in
a `field-goal-good` play) at the cost of a drive-segmentation dependency the plan already treats as
Tier-4-risk. Recommend the rename — it's free and honest.

### Q4 — Does `/nfl/v1/stats` return defensive player rows at all? **Answered: yes, richly.**

Not a coin-flip guess based on one game's 60 rows (Phase 0's sample) — measured across all 17,777
player-stat rows in the season:

| Field | Non-null rows | Non-zero rows |
| --- | --- | --- |
| `total_tackles` | 11,487 | 11,267 |
| `solo_tackles` | 11,487 | 8,903 |
| `defensive_sacks` | 11,487 | 1,212 |
| `tackles_for_loss` | 11,487 | 2,143 |
| `passes_defended` | 11,487 | 1,893 |
| `defensive_interceptions` | 367 | 366 |
| `interception_yards` | 367 | 212 |
| `interception_touchdowns` | 477 | 28 |

Two different population patterns worth knowing about, not just "populated: yes":

- **Tackle/sack/PD fields are populated broadly** (11,487 of 17,777 rows — every defender who took
  a snap, whether or not they recorded anything, gets a `0` rather than `null`). Squares 32/33 read
  straight off this: **unblocked**.
- **Interception fields are populated narrowly** (367 rows) — BDL only emits a non-null
  `defensive_interceptions` row for a player who actually intercepted a pass (366 of the 367 are
  non-zero; the one zero is presumably a credited-then-overturned or multi-defender edge case, not
  investigated further since it's one row out of 17,777). **Square 34 ("A defender picks off a
  pass") is unblocked**, but implementers should not expect a `0` row for every defensive back —
  the resolver needs `rows.some(r => r.defensive_interceptions >= 1)`, not a per-player scan
  assuming every defender has a row for this field.

### Q5 — Is `home_win_probability` populated, and by whom? **Partially answered: populated in the archive; live-population still unconfirmed, same structural gap as Q1.**

Across a 90-game, 16,256-play sample: `home_win_probability` populated on **98.2%** of plays,
`clock_display` on **100%**, `start_yards_to_endzone` on **85.7%**. These are all comfortably usable
for Tier 3 grading against *completed* games — Optional 3b already leans on this same feed with the
same completeness profile. But this is the archived record, not a live observation, so it answers
"does BDL keep this data" (yes) without answering "is it there while the game is still being played"
(unconfirmed) — the vendor field is explicitly the one the plan calls out as a *model*, not a fact,
so it's worth the same live check as Q1 rather than assuming it inherits Q1's answer. Same live
Week-1 check applies; no separate script needed.

---

## 2. Base rates — 272-game 2025 regular season (Tier 1/2), 90-game sample (Tier 3)

Read `sportsBingo`-flavored plan text ("coin-flip" / "lean-lock" / "long shot") as **design intent**
being checked against **measured reality** — not the other way around. Numbers that land far from
their intended feel are called out; that's the actual output of this phase, per the plan's own
warning that "hand-guessed base rates in this codebase have a measured failure rate of 40%."

### Tier 1 — `/nfl/v1/team_stats` (per-team unless noted; `n` = team-games or game count)

| # | Square (plan's phrasing) | Measured predicate | Rate | Plan's feel | Read |
| --- | --- | --- | --- | --- | --- |
| 1 | Team commits N+ penalties | `penalties >= 3` | **0.941** | coin-flip | **way off** — 3 is nearly automatic. `>=7` measures **0.426**, `>=8`/`>=9` needed for true 50%; the threshold in the table (unspecified N) has to be chosen from this curve, not guessed |
| 2 | Team penalized 75+ yards | `penalty_yards >= 75` | 0.188 | coin-flip | off, too hard — needs a lower bar, ~50 yards, to hit 50% |
| 3 | Combined penalty yards over N | `combined >= 120` | 0.320 | coin-flip | off, too hard at 120; try ~95–100 |
| 4 | Team turns it over 2+ | `turnovers >= 2` | 0.327 | coin-flip | somewhat off; `turnovers >= 1` is the one closer to 50% (see below) |
| 5 | Neither team turns it over | both `turnovers === 0` (game-level) | **0.081** | long shot | on target |
| 6 | 3+ combined turnovers | `combined >= 3` | 0.401 | coin-flip | close, slightly under |
| 7 | Team converts N+ third downs | `>=6` | 0.399 / `>=8` 0.121 | coin-flip | `>=6` is closer to the intended feel than `>=8` |
| 8 | Team converts on 4th down | `fourth_down_conversions >= 1` (unconditional) | 0.568 | lean-lock | actually closer to coin-flip than lean-lock — most teams don't even get a clean 4th-down conversion in a given game once no-attempt games are included |
| 9 | Team perfect in red zone (3+ trips, all TDs) | as specified | 0.085 | long shot | on target |
| 10 | Team settles for a FG in red zone | `attempts > scores` | 0.785 | lean-lock | **overcounts, see Q3 caveat above** — this proxy also fires on red-zone turnovers/failed downs, not just FGs; real rate is lower and needs a play-level definition |
| 11 | Team wins TOP by 5+ min | `|diff| >= 300s` (game-level) | 0.592 | coin-flip | reasonably close |
| 12 | Team holds ball 35+ min | `>= 2100s` | 0.134 | coin-flip | off, too hard; ~1900s (31:40) would be closer to 50% |
| 13 | Team gains 400+ total yards | as specified | 0.189 | coin-flip | off, too hard; ~340–350 yards is nearer 50% |
| 14 | Team held under 250 total yards | as specified | 0.176 | coin-flip | off, too rare; ~300 yards is nearer 50% |
| 15 | Team averages 6.0+ Y/P | as specified | 0.292 | coin-flip | off; ~5.4–5.5 is nearer 50% |
| 16 | Team picks up 25+ first downs | as specified | 0.156 | coin-flip | off, too hard; ~20 is nearer 50% |
| 17 | Team rushes 150+ / passes 300+ | separate: 0.233 / 0.108 | coin-flip | both off, too hard as written; rushing ~110–115, passing ~230–240 for 50% | |
| 18 | Team scores a defensive TD | as specified | 0.121 | long shot | slightly high for "long shot" but not unreasonable |
| 19 | Team runs 70+ offensive plays | as specified | 0.156 | coin-flip | off, too hard; ~62–63 plays is nearer 50% |
| 20 | Team sacked 4+ times | as specified (now unblocked, see Q2) | 0.235 | coin-flip | off, too hard; ~2 sacks is nearer 50% |

### Tier 2 — `/nfl/v1/stats` game-level "any player" (`n` = 272 games)

| # | Square | Predicate | Rate | Plan's feel | Read |
| --- | --- | --- | --- | --- | --- |
| 21 | A 100-yard rusher | max `rushing_yards >= 100` | 0.324 | coin-flip | off, needs a lower bar (~75–80) |
| 22 | A 100-yard receiver | max `receiving_yards >= 100` | 0.426 | lean-lock | wrong direction — it's *not* a lean-lock, it's near coin-flip |
| 23 | A 300-yard passer | max `passing_yards >= 300` | 0.221 | coin-flip | off, needs a lower bar (~250) |
| 24 | Both QBs throw 250+ | per-team max, both >= 250 | 0.151 | coin-flip | off, too hard; ~200 each is nearer 50% |
| 25 | A receiver catches 10+ | max `receptions >= 10` | 0.140 | long shot | actually closer to long shot than the "coin-flip"-adjacent number a naive guess might pick — good sign this one was already well-calibrated by feel |
| 26 | A player scores 2+ TDs | max rushing+receiving TD >= 2 | 0.526 | coin-flip | **on target** |
| 27 | A 50+ yard FG made | max `long_field_goal_made >= 50` | 0.474 | coin-flip | **on target** |
| 28 | A kicker makes 3+ FGs | max `field_goals_made >= 3` | 0.408 | coin-flip | close |
| 29 | A missed FG or XP | as specified | 0.460 | coin-flip | **on target** |
| 30 | A punt downed inside the 20 | `punts_inside_20 >= 1` | **0.956** | lean-lock | badly off — this is nearly automatic, not a lean-lock; consider `>=2` or dropping it as too easy to be interesting |
| 31 | A non-QB throws a pass | as specified | 0.074 | long shot | on target |
| 32 | A defender records 2+ sacks | `defensive_sacks >= 2` (now unblocked, see Q4) | 0.386 | coin-flip | close |
| 33 | A defender records 10+ tackles | `total_tackles >= 10` (now unblocked, see Q4) | **0.790** | coin-flip | badly off — too common, more like a lean-lock; needs a much higher bar (~13–14) for coin-flip |
| 34 | A defender picks off a pass | `defensive_interceptions >= 1` (now unblocked, see Q4) | 0.787 | coin-flip | badly off, same direction as #33 — nearly a lean-lock as written |

### Tier 3 — plays-walk arithmetic, 90-game sample (`n` = 90; note the smaller sample, see below)

| # | Square | Predicate | Rate | Plan's feel | Read |
| --- | --- | --- | --- | --- | --- |
| 35 | First score inside opening 5 min | as specified | 0.178 | coin-flip | off, too rare — most opening drives don't score inside 5:00; not a coin-flip as worded |
| 36 | Score in final minute of 1st half | as specified | 0.656 | coin-flip | reasonably close, slightly over |
| 37 | Score in last 2 min of 4th | as specified | 0.411 | lean-lock | wrong direction, it's under coin-flip, not a lean-lock |
| 38 | Both teams lead at some point | as specified | 0.622 | coin-flip | reasonably close |
| 39 | Lead change in 2nd half | as specified | 0.367 | coin-flip | somewhat off |
| 40 | Winner trailed in the 4th | as specified | 0.222 | long shot | reasonably close to intended feel already |
| 41 | Tied after halftime | as specified | 0.300 | coin-flip | somewhat off |
| 42 | Successful 2-pt conversion | delta === 8 | 0.178 | long shot | on target |
| 43 | Safety | delta === 2 | 0.044 | long shot | on target, matches the commonly-cited real-world rate (~1 in 20-25 games) |
| 44 | TD from inside the 2-yard line | as specified | **0.678** | coin-flip | badly off — this is closer to a lean-lock; goal-line sneaks are common, not 50/50 |
| 45 | Winner was once under 25% to win | needs `home_win_probability` | not measured | — | blocked on Q5's live confirmation, not on data availability — the field is there (98.2%), the question is *when* it's populated |

**Sample-size note, stated the way the plan asks:** Tier 3 is measured on 90 of 272 regular-season
games (a stride sample spread across every week, not the first 90 chronologically), because each
game costs up to 4 paginated `/nfl/v1/plays` calls and the full season would be ~1,000+ calls for
this step alone. 90 games is roughly **2x** the 43-game sample Phase 4 itself called "thin," so this
is a real improvement, not a repeat of that mistake — but it is not the full season Tier 1/2 got.
Whoever runs 8b should decide whether to spend the extra calls for a full-season Tier 3 pass before
locking thresholds; the script supports it via `--tier3-sample 272`.

---

## 3. What's still open

1. **Q1 and the live half of Q5 are unanswered and cannot be answered until an NFL game is actually
   being played.** Earliest opportunity is 2026 Week 1 (~2026-09-10). The exact check is in §1 above
   — it needs no new tooling, just two API calls a few minutes apart during a live window. **This is
   the one blocking decision for 8b's Tier 1 board-cap** (3 squares if Final-only, more if live).
2. **The postseason `team_stats`/`stats` gap (§0) predates Phase 8 and is bigger than Phase 8.** Not
   fixed here — it's a Phase 3/4 regression surface, not a Phase 8a deliverable. Whoever owns the
   NFL flag flip should know postseason boards currently can't settle player-prop or flavor squares,
   only score/quarter-based ones, and should decide whether that's an acceptable gap for a Week-19+
   launch or needs its own fix first.
3. **Square 10's proxy (`red_zone_attempts > red_zone_scores`) measures the wrong thing** — see the
   Q3 caveat. 8b should rename it to what's actually measured ("didn't score a TD on every red-zone
   trip") or accept the Tier-4-style risk of a `/nfl/v1/plays` red-zone drive reconstruction to grade
   the literal "settled for a field goal" claim.
4. **Roughly half the Tier 1/2/3 base rates in §2 are meaningfully off their intended "feel."** That
   is expected and is the point of measuring first — 8b's job is to pick real thresholds off these
   curves (the script prints multiple thresholds per field on request; extend it rather than
   hand-picking a second unvalidated number). The table above flags every square that needs a
   different number than the plan sketched, so 8b shouldn't have to re-derive which ones.
5. **The base rates are a single completed season (2025) and will drift**, the same caveat Phase 7
   put on its MLB numbers. Re-run `npm run bingo:probe:nfl-flavor -- --season <latest> --json` and
   diff against the archived 2026-08-17 file before trusting these numbers a year from now.
6. **Q2/Q3/Q4 are answered with high confidence (370/378, 0/533 violations, and a clean 366/367
   pattern respectively) and should not need re-verification** unless BDL changes its NFL data
   contract — these are structural facts about the feed, not something that drifts season to season
   the way a scoring rate does.

**Model: Sonnet 5 · effort: medium**, as the plan specified. No escalation to Opus was needed — none
of the five answers came back "Final-only" (Q1 came back "unanswerable, not contradictory"), which
is the plan's own stated trigger for escalating.
