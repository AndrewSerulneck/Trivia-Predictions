# Sports Bingo — Three Correctness Repairs

Drafted 2026-08-18, out of the findings in `docs/mlb-prop-bingo-validation-plan.md` (Phases 5, 7 and
8) plus a live re-probe that corrected two of them. **Read that plan's Phase 5, 7 and 8 "done"
write-ups first** — they are the evidence base and are not repeated in full.

Supersedes `docs/bingo-correctness-and-wnba-removal-plan.md`, whose Phase 3 removed WNBA. **The
decision changed to repair.** Phases 1 and 2 carry over, Phase 2 with a materially widened scope
(see the correction below). Delete the superseded doc when this one is accepted, or mark it
withdrawn — do not leave two plans disagreeing about WNBA.

| phase | what | model | effort |
|---|---|---|---|
| **1** | MLB team-event base rates get a home/away split | Sonnet 5 | Medium (~2h) + API calls |
| **2a** | 21 resolver kinds void on a missing snapshot instead of missing | Sonnet 5 | Medium (~2h) |
| **2b** | A failed provider fetch stops looking like a real zero | Sonnet 5 | Medium (~2h) |
| **3** | Repair WNBA settlement | Sonnet 5 | Medium-High (~half day) + live verification |

---

## Two corrections to the record — read before anything else

### Correction 1 — Phase 7's Finding 3 is wrong. WNBA data exists.

Finding 3 said balldontlie offers no WNBA player or team stats and that WNBA squares are unfixable.
Re-probed live 2026-08-18 against a real completed game (`24996`, 2026-08-11):

| our code calls | result | what actually works |
|---|---|---|
| `/wnba/v1/stats` | **404** | **`/wnba/v1/player_stats`** → 200, 25 rows, full box score |
| `/wnba/v1/lineups` | **404** | nothing — genuinely absent, no starter data for WNBA |
| `/wnba/v1/plays?game_ids[]=` | **400** | **`/wnba/v1/plays?game_id=`** (singular) → 200, 423 rows |
| plays field `is_scoring_play` | absent | the field is named **`scoring_play`** |
| `/wnba/v1/player_stats?period=N` | 200, but **`period` is silently ignored** — periods 0/1/2 return identical numbers | no per-period player split exists; `plays` is the only quarter source |

The WNBA player row is a **near-exact match** for the NBA one — same field names, same `min` format:

```
NBA  /stats        id, min, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, ft_pct,
                   oreb, dreb, reb, ast, stl, blk, turnover, pf, pts, plus_minus, player, team, game
WNBA /player_stats      min, fgm, fga,         fg3m, fg3a,          ftm, fta,
                   oreb, dreb, reb, ast, stl, blk, turnover, pf, pts, plus_minus, player, team, game
```

Only `id` and the three `*_pct` convenience fields are missing, and no resolver reads them. **So the
box-score repair is an endpoint rename, not a row adapter.**

### Correction 2 — `/nba/v1/plays?game_ids[]=` returns 400 as well

This is not WNBA-specific. `lib/sportsBingo.ts:2466-2468` calls the plays endpoint with `game_ids[]`
for **both** leagues, and both reject it — NBA's plays endpoint also wants `game_id` singular
(verified: `game_ids[]` → 400, `game_id` → 200, 498 rows). So `firstScoringTeam`,
`homeHalftimeScore`, `awayHalftimeScore`, `homeMaxQuarterPoints` and `awayMaxQuarterPoints` have
**never** been populated for NBA either. Every square depending on them has been settling off
`null`/`0` defaults. Phase 3 fixes this once for both leagues.

### The finding that reshapes Phase 2 — a failed fetch is indistinguishable from a real zero

`fetchBallDontLieJson` returns `{}` on any non-OK response — it does not throw
(`lib/ballDontLieClient.ts:64-70`). So `fetchBallDontLieList` returns `[]`, and
`buildNBAGamePlayerStatsSnapshot` **always returns an object, never null**
(`lib/sportsBingo.ts:2380-2399`). The 404s above therefore did not produce a null snapshot. They
produced a **fully-formed snapshot containing zero data**, which every resolver reads as "this event
definitively did not happen."

That is worse than a null, because a null at least hits a guard. And it means the previous plan's
Phase 2 was wrong about what it would fix:

| production squares | actual mechanism | fixed by the `!snapshot → void` change? |
|---|---|---|
| 23 NBA (`sport_key = "nba"`) | `basketballApiPrefixForSportKey` returns `null` for that key → snapshot genuinely `null` | **yes** |
| 43 WNBA | endpoints 404 → snapshot present but **empty** | **no** |
| 42 MLB webhook | `currentCount ?? 0`, no snapshot involved at all | **no** (out of scope, see 2a) |

`BallDontLieFailureBox` already exists for exactly this distinction — its own doc comment says
*"'the provider said this league has no games' and 'the provider was down' must not be [treated] the
same"* — and it is used in precisely one place (`lib/sportsBingo.ts:1164`). **None of the five
fetches on the snapshot path pass one.** That is Phase 2b.

---

## Verified facts this plan is built on

All probed live 2026-08-18. Per this area's standing rule, **re-probe anything you are about to write
code against, in the same session.**

| source | fact |
|---|---|
| `/mlb/v1/games` | `seasons[]` **is** honoured. `season_type` is `"regular"` / `"spring_training"` / `"postseason"` — not `"regular_season"` |
| MLB box scores, 300 games of 2025 | home teams bat **8.62** innings vs away **9.12**; home batted fewer in **149/300**. All six measured events run home < away. Artifact: `docs/phase0-artifacts/phase5-mlb-home-away-split-2026-08-18.json` |
| `evaluateResolver` | **21 non-NFL resolver kinds** return `miss` on an absent stats snapshot. Every NFL kind returns `void` for the identical condition |
| `/wnba/v1/games` | honours `start_date` / `end_date` (unlike `/mlb/v1/games`). Already handled correctly |
| `/wnba/v1/player_stats` | honours `game_ids[]`, and `player_ids[]` + `start_date`/`end_date` for the historical candidate walk (verified: 7 rows across 7 games for one player) |
| WNBA stat rows | use **`null` where NBA uses `0`** — heavily (`pts` null in 11 of 25 rows). `parseStatNumber(null)` returns `0`, which is the correct reading; null here means zero, not missing |
| WNBA team objects | two expansion clubs return `full_name` as a bare mascot with `city: ""` — Toronto **"Tempo"**, Portland **"Fire"**. Production cards already store them that way, so they match, but any new exact-string comparison will break on them |
| production DB | 14 cards, 350 squares: 228 void, 108 miss, 14 free hits. **Zero `player_prop` squares.** All 14 cards `lost`; **no active cards** |
| WNBA production boards | contain **only** core-market and team-achievement squares — no player squares at all, because the historical `/stats` walk (`lib/sportsBingo.ts:4837`) 404s too |

---

## Phase 1 — Give the MLB team-event base rates a home/away split

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs) + ~300 API calls.
**Files:** `scripts/measure-mlb-event-rates.cjs`, `lib/mlbTeamEventRates.ts`, `lib/sportsBingo.ts`
(two call sites), `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`.
**Independent of Phases 2 and 3** — different files entirely.

### The problem

`predictMlbTeamEventRate` (`lib/mlbTeamEventRates.ts:122`) returns one `leagueMean` per event, pooled
across both teams. The home team does not bat in the bottom of the 9th when it is already ahead —
about half of all games — so its event totals run structurally below the away team's. Home squares
price too high, away too low, by roughly the same amount, so **every aggregate averages the error to
zero**: the pooled family rate, the board win rate, and `bingo:simulate --backtest` all look correct.
Only `byTeamEventSide` in `bingo:calibrate:mlb` shows it. Effect is ~2-5 points of probability,
largest on strikeouts (home 8.04/game vs away 8.73).

### Do this

**1a — teach the measurement script about sides.** `scripts/measure-mlb-event-rates.cjs` builds one
row per team per game (`teamGames`, ~170-215) but never records which side. The game object carries
top-level `home_team_name` / `away_team_name` and each stat row carries `team_name`. Match with
`teamsMatch`, **not `===`** — the mascot-only names in the facts table above are not hypothetical.

Emit a **third view** alongside the existing marginal and conditional ones: per event, mean, variance
and `P(X >= n)` split by side. Keep the existing two views byte-identical in shape so the archived
`docs/phase0-artifacts/mlb-event-rates-2026-08-17.json` stays comparable.

**1b — re-run and record.**

```
npm run bingo:measure:mlb -- --days 120 --json > docs/phase0-artifacts/mlb-event-rates-side-split-<date>.json
```

**Do not hand-copy the numbers out of Phase 5's artifact into the rate table.** Phase 5 measured 2025;
the shipped table is 2026, and they differ by up to 5% per event (walk: 3.275 shipped vs 3.120 in
2025). Mixing a 2026 pooled mean with a 2025 side ratio introduces a second error while fixing the
first. `lib/mlbTeamEventRates.ts`'s module comment already states this rule. Phase 5's artifact is
**corroboration that the effect is real**; the new run is the **source of the shipped numbers**.

**1c — widen the model.**

```ts
export type MlbTeamEventRateModel = {
  readonly leagueMean: number;      // keep — pooled, still the null-side fallback
  readonly homeMean: number;        // new
  readonly awayMean: number;        // new
  readonly variance: number;
  // … opponent fields unchanged
};
```

**On variance:** measure it per side in 1b and look before deciding. Within ~5% of pooled, keep one
`variance` and say so in the module comment — the negative-binomial fit is second-order and an
unjustified constant is worse than none. Split it only if the sides genuinely diverge.

**1d — thread the side through.** `predictMlbTeamEventRate` gains `teamSide: TeamSide | null`,
selecting `homeMean` / `awayMean` / `leagueMean`, with the existing opponent adjustment applied on
top unchanged. **A `null` side must return the pooled `leagueMean`** — today's exact behavior, and
the compatibility escape hatch. It needs its own test.

Two call sites, both already know the side:
- `lib/sportsBingo.ts:5309` — `buildMlbTeamEventCandidateTemplatesForBacktest`, inside the
  `for (const teamSide of ["home", "away"] as const)` loop.
- `lib/sportsBingo.ts:5769` — the live path in `buildMLBPlayerPropCandidatesFromRecentStats`. Re-grep
  and confirm which variable holds the side before editing.

`buildMlbTeamEventRungs` needs no signature change — it already takes `expectedRate`, which is why
this fix is small.

### Tests — proven failing first

Extend `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`:

1. `predictMlbTeamEventRate(event, null, 0, "home")` < `(…, "away")` for every event the measurement
   says so. **Assert direction, not a hardcoded number** — a re-measurement should not rewrite tests.
2. `(…, null)` **exactly equals** `leagueMean` for all six events.
3. The existing opponent-adjustment tests still pass with a side supplied — the two adjustments
   compose rather than one clobbering the other.
4. A generated MLB board's home and away rungs for the same event can differ in threshold.

### Verification

```
npm run bingo:calibrate:mlb -- --games 600 --boards 6
```

Compare `byTeamEventSide` against `docs/phase0-artifacts/phase5-mlb-calibration-2026-08-18.json`.
**Success is `team_event:ALL:home` and `team_event:ALL:away` both moving toward zero**, with
`byTeamEvent` (pooled) staying put — it is correct today and must not break. Board generation is
random per trial; compare signs and magnitudes, not third decimals.

---

## Phase 2a — 21 resolver kinds must void on an absent snapshot

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs).
**File:** `lib/sportsBingo.ts`, `evaluateResolver` (~8744-9300 — **re-grep, these move**).
**Independent of Phase 3.**

### The problem

The file states the rule for itself: *missing data voids, it never misses.* The NFL arm obeys it
everywhere. The NBA/WNBA arm does not, at 21 positions, all the same shape:

```ts
if (!nbaStatsSnapshot) {
  if (!completed) return { status: "pending", resolved: false };
  return { status: "miss", resolved: true };   // <- should be void
}
```

The trigger is `refreshSportsBingoProgress` (~`lib/sportsBingo.ts:10806`), which synthesizes a
fallback snapshot when the 12-hour force-finalize window passes with no score:

```ts
const effectiveScore: ScoreSnapshot = score ?? ({ …, homeScore: null, awayScore: null, completed: true });
```

Fed that, a market resolver reads `!hasGameScore` → `pending` → force-finalize writes `void`
(correct). A stats resolver reads `completed === true` with no snapshot → `miss`. **One settlement
pass, one missing-data condition, two different answers on the same card.**

It also kills the regrade seam: all 21 kinds are in `isResolverEligibleForVoidRegrade`
(`lib/sportsBingo.ts:9997+`), which reopens a `void` when a late box score lands. A `miss` is
terminal.

**Scope honestly:** per the correction above, this fixes the 23 `sport_key = "nba"` squares. It does
**not** fix the 43 WNBA ones — those had a present-but-empty snapshot, and are Phase 2b + Phase 3.

### The 21 positions

Enumerated 2026-08-18 by scanning every `case` in `evaluateResolver` for a bare `!nbaStatsSnapshot`
guard. **Re-derive rather than trusting this** — the scan takes two minutes and line numbers move:

```
nba_player_stat_at_least              nba_player_perfect_fg           nba_team_outrebounds
nba_player_double_double              nba_player_triple_threat        nba_player_bench_scores
team_triple_double / any_triple_double  nba_player_zero_turnovers     nba_team_scores_first
nba_team_stat_at_least                nba_player_plus_minus_at_least  nba_team_leads_at_halftime
nba_team_players_scored_at_least      nba_team_has_double_double      nba_team_points_in_any_quarter_at_least
nba_player_triple_double              nba_team_three_pt_scorers       nba_player_points_first_half_at_least
nba_player_perfect_ft                 nba_team_turnovers_at_most      nba_player_assists_in_any_quarter_at_least
                                                                      nba_player_steals_first_half_at_least
```

Two shapes: most are multi-line `if (!nbaStatsSnapshot) { … }`; several (from
`nba_player_bench_scores`, ~9195) are single-line ternaries. Both need changing.

### Scope decisions — deliberate, do not drift

**Change only the "no snapshot at all" guard.** Leave alone:

- `if (!line)` / `if (!playerId)` — a player absent from a box score that *did* arrive. Arguably
  should void too (NFL does), but it is a different condition and belongs to its own change. Note it.
- Value-comparison branches (`if (completed || snapshot.finalized) return miss`). Those are real
  misses.

**The three `mlb_webhook_*` resolvers are NOT in this phase.** They look similar but take no snapshot
(`lib/sportsBingo.ts:9263-9296`) — they read `resolver.currentCount ?? 0`, incremented only by the
live webhook stream. **A team that genuinely recorded zero and a team whose webhook never fired are
the same value.** Fixing it needs `currentCount` to become nullable (or gain an `observed` companion)
through the whole ingestion path plus a migration. Its own project.

Worth knowing while scoping that: **42 of the 108 mis-settled squares are
`mlb_webhook_team_event_at_least` at `currentCount: 0`**, and Phase 6 of the MLB plan explicitly could
not verify the live webhook stream ever calls the ingestion functions. Together that is decent
evidence the MLB webhook has **never** delivered an event on a real card. Confirm before building on
it.

### Also note, do not fix

`case "player_prop"`'s support gate (~`lib/sportsBingo.ts:8876`) returns a flat `miss` for an
unsupported `marketKey` on **both** NBA and MLB, while the NFL arm voids the identical condition
fourteen lines above. Inert today (zero `player_prop` squares in production). Mention in the
as-built; leave the code.

### Historical rows — Andrew's call, presented not chosen

108 rows are `miss` where the rule says `void`. **No card outcome changes** — all 14 are `lost`, and
`boardStatusesMakeALine` treats a void as a non-hit, so a fully-voided board makes no line either.
Nothing economic moves.

1. **Forward fix only** (this phase). The count stops growing.
2. **Forward fix + backfill.** One `UPDATE` over 108 rows scoped by resolver kind AND
   `status = 'miss'` AND card sport — never a blanket status rewrite. New timestamped migration under
   `supabase/migrations/` (creating one is expected; never edit an existing one).
3. **Leave it.**

**Do not write the backfill until Andrew picks.**

### Tests — proven failing first

New `tests/lib.sportsBingo.missing-data-voids.test.ts`, wired into **both** `test:bingo-nfl` and
`test:bingo-mlb` (it covers the shared arm).

1. **Reproduce production.** Build the exact `effectiveScore` shape `refreshSportsBingoProgress`
   synthesizes — `homeScore: null, awayScore: null, completed: true` — with `nbaStatsSnapshot: null`,
   and assert `void` across a representative sample of the 21 (a player kind, a team kind, a quarter
   kind, a halftime kind). Fails today with `miss`.
2. **The consistency property — the real point.** On that same snapshot, a market resolver and a
   stats resolver must agree: neither returns `miss`. This is the test that would have caught the bug
   originally, and it is worth more than the 21 individual assertions.
3. **No over-reach.** A snapshot that *is* present, player genuinely below threshold at Final, still
   returns `miss`. Guards against a global find-and-replace.
4. **Regrade reachable.** A square voiding under (1) is `isResolverEligibleForVoidRegrade`.

---

## Phase 2b — A failed provider fetch must not look like a real zero

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs).
**File:** `lib/sportsBingo.ts`, `getNBAGamePlayerStatsSnapshot` (~2402-2560).
**Land this AFTER Phase 3** — both edit the same function, and Phase 3 restructures the fetches this
phase then instruments. Doing it in the other order guarantees a conflict.

### The problem

See the third correction at the top. A non-OK response yields `{}` → `[]` → a snapshot object full of
zeros and empty maps, which reads as "the event definitively did not happen." Every WNBA square in
production settled `miss` this way.

Phase 3 makes the WNBA fetches succeed, which removes *this* instance. **It does not remove the
class:** a rate limit, an outage, a schema change or a future league added with the wrong path
reproduces it exactly, silently, on live cards.

### Do this

Thread a `BallDontLieFailureBox` through the five fetches in `getNBAGamePlayerStatsSnapshot` and
return `null` — not an empty snapshot — when a fetch that the board actually depends on failed.

The nuance worth getting right: **a failed fetch and a legitimately empty response are different, and
so are the five fetches.** Games failing means no match at all. Box score failing means no snapshot.
Plays failing means the quarter/halftime extras are unknown, but the box-score squares are still
perfectly gradeable — so a plays failure should degrade the extras to "unknown", not null the whole
snapshot. Decide per fetch; do not apply one rule to all five.

Where "unknown" is the right answer, it must be distinguishable from `0`/`null` at the resolver.
`homeMaxQuarterPoints: 0` currently means both "measured zero" and "never fetched". That is the same
bug one level down, and Phase 3's `nba_team_points_in_any_quarter_at_least` depends on the answer.

Also give the cache a **short negative TTL** on failure. `nbaPlayerStatsCache` currently caches a
null result for the full `NBA_PLAYER_STATS_CACHE_MS`, so one blip locks a card out for the whole
window. `BallDontLieFailureBox`'s own doc comment calls this out as its intended use.

### Tests

Extend `tests/lib.sportsBingo.missing-data-voids.test.ts` or add a sibling:

1. Box-score fetch fails → snapshot is `null` → squares `void` (via Phase 2a), **not** `miss`.
2. Box-score fetch succeeds but the game genuinely had no qualifying rows → that is a real result
   and must **not** be treated as failure.
3. Plays fetch fails, box score succeeds → box-score squares still grade normally; quarter squares
   go `void`/`pending`, not `miss`.
4. A failure gets the short negative TTL, not the full one.

---

## Phase 3 — Repair WNBA settlement

**Model:** Sonnet 5 · **Effort:** Medium-High (~half day) + a live verification pass.
**Files:** `lib/sportsBingo.ts` (`getNBAGamePlayerStatsSnapshot` ~2402-2560, the historical candidate
walk ~4837, the achievement-candidate block ~5059-5074), plus tests.

### What is actually broken

**Generation is already fine.** WNBA has its own calibrated constants throughout — `WNBA_CALIBRATION`
(`lib/sportsBingo.ts:182`), a 0.82 achievement-threshold scale (~5011), its own spread/total offsets
(~4485, 4520, 4554), its own triple-double bases (~4423), a lowered player-specific floor (~7286).
Somebody did that work properly. **Settlement is what treats WNBA as "NBA with a different
prefix"**, and every defect below is an endpoint or field-name divergence of exactly the kind this
plan family keeps finding.

### 3a — the box score

`lib/sportsBingo.ts:2451` calls `${basketballApiPrefix}/stats`. WNBA needs `/player_stats`; NBA needs
`/stats` (NBA's `/player_stats` is 404 — the naming is genuinely inverted, not a case of one name
serving both). Add a path resolver next to `basketballApiPrefixForSportKey` rather than inlining a
ternary at each of the three call sites.

The row shapes match (see Correction 1), so **no row adapter is needed** — but:

- WNBA sends `null` where NBA sends `0`, heavily. `parseStatNumber(null)` → `0`, which is the correct
  reading here (null means zero, not missing). **Confirm every read on this path goes through
  `parseStatNumber`** — `getNBAPlayerMilestoneValue`, `buildNBATeamAggregates`, `hasDoubleDouble` and
  the candidate-side reads at ~5038-5074. A raw `row.pts >= 10` on `null` is falsey and therefore
  accidentally right; a raw `Math.max` or a sum is also right; but do not leave it to luck — check
  and add a test.
- Drop the `period: "0"` param for WNBA, or leave it (it is ignored). Prefer dropping it, so the
  request says what it means.

### 3b — the plays walk, which fixes NBA too

`lib/sportsBingo.ts:2466-2468` sends `game_ids[]`. **Both leagues reject it** (400). Change to
`game_id` singular. Then, in the walk at ~2482-2505:

- The scoring flag is `play.is_scoring_play` in our code but **`scoring_play`** in the payload — for
  WNBA *and* NBA (check NBA's field name in the same session before assuming they now match). Read
  whichever exists; do not silently prefer one.
- Plays return **all** rows in a single response with no `meta.next_cursor` and `per_page` ignored
  (423 rows for WNBA, 498 for NBA). The existing `fetchBallDontLieList` walk handles that fine —
  no cursor means one page — but confirm `maxPages` is not masking a truncation.
- `BallDontLiePlay`'s type will need widening for the field-name variance.

**This is a live NBA fix riding along in a WNBA phase.** Call it out explicitly in the as-built and
in the commit message — an NBA reviewer must not have to discover it. Its own tests, separate from
the WNBA ones.

### 3c — the historical candidate walk

`lib/sportsBingo.ts:4837` hits `${basketballApiPrefix}/stats` for trailing player form. Same rename.
Verified working for WNBA with `player_ids[]` + `start_date`/`end_date` (7 rows across 7 games for
one player).

**This is why WNBA boards contain no player squares at all today** — the walk 404s, so no player has
history, so no player candidate is generated. Expect WNBA board composition to change noticeably once
this lands. That is the intended outcome, but it means the board a WNBA player sees after Phase 3 is
not the board they saw before, and the win rate should be re-checked (below).

### 3d — suppress the four families WNBA genuinely cannot support

There is no WNBA starter data and no per-period player split. These four must not be generated for
WNBA:

| family | needs | why unavailable |
|---|---|---|
| `nba_player_bench_scores` | starter flag | `/wnba/v1/lineups` 404, no substitute |
| `nba_player_points_first_half_at_least` | per-period player stats | `period` param ignored |
| `nba_player_assists_in_any_quarter_at_least` | per-period player stats | same |
| `nba_player_steals_first_half_at_least` | per-period player stats | same |

All four are pushed together at ~`lib/sportsBingo.ts:5059-5074`, in a block that already computes
`wnbaMode` (~5011). Gate their generation on `!wnbaMode`. **Gate generation, not settlement** — a
square that cannot be graded must never reach a board in the first place. Leave their
`evaluateResolver` arms alone (Phase 2a already makes them void safely if one ever appears).

The three *team*-level quarter families (`nba_team_scores_first`, `nba_team_leads_at_halftime`,
`nba_team_points_in_any_quarter_at_least`) **are** supported once 3b lands, because they come from
plays rather than per-period stats. Do not suppress those.

### 3e — team-name matching

Two expansion clubs return `full_name` as a bare mascot with `city: ""` — Toronto **"Tempo"**,
Portland **"Fire"**. Production cards already store the same strings, so `teamsMatch` works today.
**Do not introduce an exact-string comparison anywhere in this phase**, and add a fixture covering a
mascot-only team name. This is the same class of defect as MLB's `display_name` problem in R1.

### Verification — this phase is not done without a live pass

Offline tests cannot prove this. Required, in this order:

1. **Live settlement replay.** Take a completed WNBA game, build a card, run it through the shipped
   snapshot builder and `evaluateResolver`, and report: stat lines found, team-side resolution rate,
   `finalized`, score reconciliation, and per-family settled status. This is the WNBA counterpart of
   `npm run bingo:validate:mlb`, and **the honest thing to do is write it as one** —
   `scripts/validate-wnba-bingo-grading.cjs` + `npm run bingo:validate:wnba`, modelled on
   `scripts/validate-mlb-bingo-grading.cjs`. The whole reason MLB's four defects survived is that no
   harness ever ran a board end to end; shipping this repair without one repeats that mistake
   exactly.
2. **Confirm the NBA plays fix on a real NBA game** — `firstScoringTeam` non-null, halftime scores
   populated, max quarter points > 0. These have been `null`/`0` in production for the entire life of
   the feature, so "it changed" is the pass condition.
3. **Board win rate.** WNBA board composition changes materially once player squares appear (3c).
   Re-check against the 20-30% target band before this is considered safe to leave on.

### Tests

- `tests/lib.sportsBingo.wnba-row-shape.test.ts` already exists (Phase 7 follow-up). Extend it rather
  than adding a parallel file: endpoint selection per sport key, `null`-as-zero, mascot-only team
  names, the four suppressed families absent from a WNBA candidate set and present in an NBA one.
- A separate NBA-facing test for 3b's plays fix, so the NBA regression is visible on its own.
- All existing NBA tests must stay green — 3a/3b/3c touch shared code.

---

## Sequencing

```
1 ─────────────────────────────  independent, any time
2a ────────────────────────────  independent, any time
3 ──> 2b                         same function; 3 restructures, 2b instruments
```

**Suggested order: 2a → 3 → 2b → 1.** 2a is the cheapest player-facing correctness fix and is
disjoint from everything. 3 is the biggest piece and unblocks 2b. 2b generalizes what 3 fixed
specifically. 1 is independent and needs API budget, so it can slot anywhere.

**Commit between phases.** `lib/sportsBingo.ts` has already lost a day's work once to a mixed
uncommitted diff.

## Gate commands

```
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl     # 244 at time of writing
npm run test:bingo-mlb     # 123 at time of writing
npm run test               # 1859 passing / 13 skipped / 0 failing
npm run test:pwa-contract  # Phase 3 only — the bingo board is a PWA surface
```

**Every phase here changes behavior, so every phase needs a test proven to fail against the pre-fix
code.** None qualifies for the instrument exemption the MLB plan's Phases 1, 4a, 5 and 7 took.

## Standing rules inherited from the 2026-08-18 incident

**Never use `git checkout -- <file>` / `git restore <file>` to undo an edit you just made.** It resets
the file to `HEAD` and discards *all* uncommitted changes in it, not just yours. `lib/sportsBingo.ts`
routinely carries large uncommitted multi-phase work; that is what made the loss expensive. To prove
a test fails pre-fix, invert your own lines by hand and re-apply. If you must,
`git diff -- <file> > scratch.diff` first.

**Commit production fixes promptly.**

**Nothing is verified until it has been run against the live feed.** This plan family exists because
defects survived by having their row shapes assumed from a sibling league — five for MLB, now five
more for WNBA, plus one for NBA that nobody was even looking for. Any phase asserting a field name
re-probes it in the same session, and any phase reporting success says plainly which half of the path
it exercised: generation, settlement, or both.

## Branch state

All of this sits downstream of `restore/mlb-bingo-r1`, which as of 2026-08-18 carries **eight**
production-affecting changes and has never been merged to `main`. The merge decision is still open
and still Andrew's. Whoever picks up 2a in particular should ask again — a player-facing correctness
fix does nobody any good sitting on an unmerged branch.

---

## Phase 2a — done, 2026-08-18 — handoff to whoever picks up Phase 3 next

**Status: complete, all gates green, uncommitted on `restore/mlb-bingo-r1`.** Not yet committed —
see "What's not done" below before you commit or move on.

### What changed

`lib/sportsBingo.ts`, `evaluateResolver`: all 22 `if (!nbaStatsSnapshot)` guards (21 resolver
kinds — `team_triple_double`/`any_triple_double` share one guard) now return `{ status: "void" }`
instead of `{ status: "miss" }` when `completed` is true and no snapshot ever arrived. Re-derived
the guard list independently by grepping every `case` with a bare `!nbaStatsSnapshot` check rather
than trusting the plan's own enumeration — it matched exactly (mind the count: the plan's table
lists 23 kind-names because it splits `team_triple_double` / `any_triple_double`, but they are one
guard site, so 22 sites got edited).

**Nothing else in `evaluateResolver` changed.** In particular, left untouched, per the plan's scope
decisions:
- `if (!line)` / `if (!playerId)` branches — a player absent from a box score that *did* arrive.
  Still returns `miss`. Arguably should also void (NFL does this), but that's a different
  condition and its own change; noted here for whoever eventually picks it up.
- Value-comparison branches (`completed || snapshot.finalized → miss`) — real misses, left alone.
- `case "player_prop"`'s unsupported-`marketKey` gate (~line 8877-8884) — still a flat `miss` on
  both NBA and MLB, NFL voids the identical condition 14 lines above it. Inert today (zero
  `player_prop` squares in production per the facts table). Not fixed, per plan.
- The three `mlb_webhook_*` resolvers — out of scope for 2a entirely, per plan (they read
  `currentCount ?? 0`, no snapshot involved).

**One incidental export added:** `isResolverEligibleForVoidRegrade` (~line 9997) is now
`export function` instead of `function`. It was already correct — all 21/22 touched kinds were
already registered in it, so the regrade seam needed no code change — but it was private, and the
new test needs to call it directly to prove the regrade path is actually reachable rather than
asserting it by reading the source. Pure visibility change, zero behavior difference.

### Tests

New `tests/lib.sportsBingo.missing-data-voids.test.ts`, 6 tests, wired into both
`npm run test:bingo-nfl` and `npm run test:bingo-mlb` (package.json scripts updated). Calls
`evaluateResolver` directly (it's exported) rather than routing through
`refreshSportsBingoProgress` + a mocked Supabase/balldontlie double the way
`nfl-settlement.test.ts` does — the bug and the fix live entirely inside one pure function, so a
direct unit call is more direct proof and needs no fixture plumbing. If Phase 3's WNBA validation
work wants an end-to-end harness, that's `scripts/validate-wnba-bingo-grading.cjs` per the plan,
not this file.

**Proven failing first, verified by hand:** reverted the `lib/sportsBingo.ts` diff with
`git apply -R` (never `git checkout -- <file>` — see the standing rule below and the memory it's
drawn from), reran the new test file, confirmed 4 of 6 tests failed for the right reasons (3 on
`miss` vs `void`, 1 because `isResolverEligibleForVoidRegrade` wasn't exported yet), then
`git apply`'d the diff back and reran to confirm all 6 pass again.

Test coverage maps to the plan's four asks:
1. Reproduces production (`FORCE_FINALIZED_NO_SCORE` = the exact
   `{ homeScore: null, awayScore: null, completed: true }` shape `refreshSportsBingoProgress`
   synthesizes) across a representative sample (player/team/quarter/halftime kinds), plus a second
   test running the same assertion across all 22 guard sites.
2. The consistency property: a market resolver (`moneyline`) and every sampled stats resolver
   agree — neither returns `miss` — on the identical missing-data condition.
3. No over-reach, two angles: (a) snapshot absent but game still in progress → stays `pending`,
   not `void`; (b) snapshot *present* with genuinely-below-threshold values at Final → still
   `miss`. (b) needed a hand-built minimal `NBAGamePlayerStatsSnapshot`-shaped fixture (not
   exported from `lib/sportsBingo.ts`, so it's a structurally-typed `as any` object listing every
   field `findNBAPlayerStatLine`/`buildNBATeamAggregates` touch — `lines`, `byPlayerKey`,
   `lineupByPlayerId`, `firstHalfByPlayerId`, `maxQuarterAssistsByPlayerId`, the two
   `*MaxQuarterPoints`, the two `*HalftimeScore`, `firstScoringTeam`, the three triple-double
   flags, `finalized`). If you add a field to that type, this fixture will not fail loudly — it'll
   just read `undefined` for the new field via `as any`. Worth revisiting if that type grows before
   Phase 3 (which does touch it — see below).
4. Regrade reachability: every touched kind passes `isResolverEligibleForVoidRegrade`.

### Gates run, all green

```
npx tsc --noEmit                      # clean
npm run lint                          # clean (fixed one unused eslint-disable in the new test file)
npm run test:bingo-nfl                # 250 passed (was 244 — +6 from the new file)
npm run test:bingo-mlb                # 129 passed (was 123 — +6 from the new file)
npm run test                          # 1865 passed / 13 skipped / 0 failing (was 1859/13/0)
```
`test:pwa-contract` not run — Phase 3 only, per the plan's gate table, and this phase touches no
PWA/manifest surface.

### What's not done — do not treat 2a as fully closed

1. **Not committed.** `lib/sportsBingo.ts`, `tests/lib.sportsBingo.missing-data-voids.test.ts`, and
   `package.json` all carry uncommitted 2a changes right now, on top of the *other*, unrelated
   uncommitted work already on this branch (`lib/fantasy.ts`, `lib/sportsBingoNflFlavor.ts`,
   `lib/thesportsdb.ts`, the NFL flavor/simulate scripts, `lib/envNumber.ts`, two new phaseE
   artifacts, two new unrelated test files). **Commit 2a on its own** before starting Phase 3 —
   don't let it get swept into an unrelated commit, and don't `git add -A`. Suggested scope:
   `lib/sportsBingo.ts` (the guard changes + the `export` on
   `isResolverEligibleForVoidRegrade`), the new test file, and the two `package.json` script-line
   edits.
2. **The historical-rows decision is still Andrew's, unmade.** The plan lays out three options —
   forward-fix only / forward-fix + scoped backfill migration / leave it — for the 108
   already-mis-settled rows. This phase took option 1 (forward fix only) by default, per the
   plan's explicit instruction ("do not write the backfill until Andrew picks"). If Andrew wants
   the backfill, that's a new timestamped migration under `supabase/migrations/`, scoped by
   resolver kind AND `status = 'miss'` AND card sport — flag this back to Andrew, don't infer an
   answer.
3. **43 WNBA squares are still wrong** — this phase only fixes NBA's genuinely-null-snapshot case
   (23 squares). WNBA's snapshot is present-but-empty (endpoints 404 into a zero-filled object),
   which 2a's `!nbaStatsSnapshot` guards never see. That's Phase 3 (endpoint fixes) + Phase 2b
   (make a failed fetch return `null` instead of zeros). **Do not describe 2a as "fixing WNBA"** —
   it doesn't touch a single WNBA square.

### Handoff to Phase 3 (next up per the plan's suggested order: 2a → 3 → 2b → 1)

- Phase 3 edits `getNBAGamePlayerStatsSnapshot` (~2402-2560), the historical candidate walk
  (~4837), and the achievement-candidate block (~5059-5074) — none of which 2a touched, so no
  merge conflict expected, but re-grep the line numbers anyway; they will have moved by the time
  you land 3a-3e, since 2a didn't touch this file's line count meaningfully (net +0 lines — every
  edit was `"miss"` → `"void"` in place) but Phase 3 will add real code before them.
- 2a's void-on-no-snapshot fix is exactly what makes Phase 3's four suppressed families (3d:
  `nba_player_bench_scores`, `nba_player_points_first_half_at_least`,
  `nba_player_assists_in_any_quarter_at_least`, `nba_player_steals_first_half_at_least`) safe to
  leave un-suppressed at the `evaluateResolver` layer if one somehow still reaches a WNBA board —
  the plan says as much ("Phase 2a already makes them void safely if one ever appears"). That's
  now true; verified by this phase's test 2 (all 22 kinds, including those four, void correctly).
- The NBA-side fixture built for this phase's "no over-reach" test (see item 3 above) is a decent
  starting point if Phase 3 needs a similar hand-built `NBAGamePlayerStatsSnapshot` for its own
  tests — but Phase 3's real work is on `getNBAGamePlayerStatsSnapshot`'s *construction* path
  (`buildNBAGamePlayerStatsSnapshot`, the fetch calls, endpoint selection), not on
  `evaluateResolver`'s consumption of it, so you'll likely be building fixtures at a different
  layer (raw balldontlie JSON rows) rather than reusing this one directly.
- Re-probe live before writing code against any endpoint/field-name claim in Phase 3's "Correction
  1" and "Correction 2" — this session did not re-verify those against the live balldontlie API
  (2a's scope never called an external endpoint), so treat them as unconfirmed-by-this-session,
  consistent with the plan's own standing rule.

### Handoff to Phase 2b (after Phase 3, same function conflict reason per the plan)

- 2b threads a `BallDontLieFailureBox` through `getNBAGamePlayerStatsSnapshot`'s five fetches —
  untouched by 2a. No interaction with 2a's changes; 2b's `null`-snapshot output is exactly what
  2a's guards now correctly void on. The two phases compose as designed: 2b makes more cases reach
  `!nbaStatsSnapshot`, 2a makes that guard do the right thing. Nothing further needed from 2a's
  side.

### Handoff to Phase 1 (independent, any time, needs API budget)

- No interaction with 2a at all — different files (`scripts/measure-mlb-event-rates.cjs`,
  `lib/mlbTeamEventRates.ts`, two MLB call sites in `lib/sportsBingo.ts` far from
  `evaluateResolver`). Nothing to hand off.

---

## Phase 3 — done, 2026-08-18 — handoff to whoever picks up Phase 2b next

**Status: complete, all gates green including a live verification pass, uncommitted on
`restore/mlb-bingo-r1`.** Landed after 2a per the plan's suggested order. Every endpoint/field-name
claim in this write-up was re-probed live in this session — see `scripts/probe-wnba-bingo-settlement.cjs`
(new, checked in as `npm run bingo:probe:wnba`) — none of it was trusted from the plan's own
Corrections 1/2, which themselves were confirmed exactly as written.

### What changed

**3a — box score.** New `basketballStatsPathForSportKey(sportKey)` next to
`basketballApiPrefixForSportKey`, returning `"player_stats"` for WNBA and `"stats"` for NBA
(**exported**, `lib/sportsBingo.ts` — used at the box-score fetch in `getNBAGamePlayerStatsSnapshot`
and the historical walk in `getNBAPlayerProfilesForGame`). The `period: "0"` param is now omitted
for WNBA at both call sites (confirmed live: WNBA's `/player_stats` returns identical rows for
`period=0` and `period=1` — the param is silently ignored, not honored-as-zero). No row adapter
needed, confirmed exactly as the plan predicted: `buildNBAGamePlayerStatsSnapshot`'s per-row parsing
already routes every counting stat through `parseStatNumber`, which already treats `null` as `0`
correctly (new test: `tests/lib.sportsBingo.wnba-row-shape.test.ts`, "null-as-zero" describe block).

**3b — the plays walk (a live NBA fix riding along, confirmed live for both leagues this
session).** `/plays` now sends a scalar `game_id`, not `game_ids[]` (both leagues 400 on the
plural — verified live against a real NBA game for the first time; the plan's Correction 2 had
only inferred this from the WNBA case). The scoring-play read is now `play.scoring_play ??
play.is_scoring_play` — **live probing found `scoring_play` is the real field for both NBA and
WNBA**, and `is_scoring_play` does not exist on either league's rows at all (not "NBA still uses
the old name" — it never did). Pulled the whole play-walk out of
`getNBAGamePlayerStatsSnapshot` into a new exported pure function,
`buildBasketballPlayWalkExtras(plays, card)`, specifically so 3b is unit-testable without mocking
network — see `tests/lib.sportsBingo.nba-plays-fix.test.ts` (new, NBA-only, separate file per the
plan's explicit ask so this doesn't get buried in a WNBA-titled file). Confirmed live via
`npm run bingo:validate:wnba`: `firstScoringTeam`, halftime scores, and max-quarter-points are now
populated 100% of the time on both a 15-game WNBA sample and a 15-game NBA sample (from 0% before —
these fields have been null/0 in production for the life of the feature on both leagues).

**3c — the historical candidate walk** (`getNBAPlayerProfilesForGame`, the function whose body
also contains 3a's second call site). Same endpoint-path fix, same conditional `period` drop. This
is the walk that was 404ing for WNBA and is why **no WNBA board has ever carried a player square**
(per the plan's own facts table). Confirmed unlocked live: `npm run bingo:simulate -- --sports
basketball_wnba --boards 6` against 4 real upcoming WNBA games now generates player-specific
squares (`nba_player_stat_at_least`, etc.) where it previously could not.

**3d — suppressed the four data-unavailable families for WNBA generation only**
(`buildNBAAchievementCandidates`, now **exported** for its own test — bench scores, first-half
points, any-quarter assists, first-half steals — gated on `!wnbaMode`, settlement arms untouched
per the plan). Also skipped the per-period player-stats fetch loop in
`getNBAGamePlayerStatsSnapshot` entirely for WNBA (`if (!wnbaMode)`), rather than fetching it and
discarding the result — WNBA's `/player_stats` ignores `period`, so fetching it would silently
write full-game totals into every quarter bucket; there is no correct data to get, so the two maps
(`firstHalfByPlayerId`, `maxQuarterAssistsByPlayerId`) now stay empty for WNBA rather than wrong.
Proven failing first by temporarily forcing the 3d gate to `true`: the WNBA-absence test failed for
the right reason (all four kinds present), reverted, reran green.

**3e — mascot-only team names.** No new string comparison was introduced anywhere in this phase
(the endpoint/query changes never touch team-name matching), so `teamsMatch` needed no code change.
Added a regression fixture (`tests/lib.sportsBingo.wnba-row-shape.test.ts`) plus **live
confirmation this genuinely occurs in production data right now**: the live validator run below hit
three real games carrying `"Fire"` and `"Tempo"` as bare `full_name` with `city: ""`, and matched
all of them correctly.

### Live verification (all three of the plan's required steps)

**1. Live settlement replay — new `scripts/validate-wnba-bingo-grading.cjs` / `npm run
bingo:validate:wnba`.** Modeled on `scripts/validate-mlb-bingo-grading.cjs`: imports the shipped
`pickBestMatchingBallDontLieGame`, `buildNBAGamePlayerStatsSnapshot`, `evaluateResolver` rather than
mirroring their logic, and re-derives its own endpoint/query choices independently (matching that
script's own pattern) rather than importing this phase's new helpers — so it's checking the fix,
not agreeing with it by construction. Run against 15 real completed WNBA games (last 10 days) and
15 real completed NBA games (last 200 days — NBA is off-season in August):

```
match rate 15/15, score reconciliation 15/15, finalized rate 15/15,
team-side resolution 100%, play-walk populated 15/15   (both leagues)
```

Per-family settled status showed a healthy hit/miss mix with **no family stuck at all-void or
all-pending** for either league, across market kinds and the newly-unlocked team quarter/halftime/
scores-first families. Full output not reproduced here — rerun `npm run bingo:validate:wnba` for a
fresh read; it hits the live feed every time by design.

**2. NBA plays fix confirmed on real NBA games** — folded into the same script rather than a
separate throwaway one (item 2 of the plan's verification order): `firstScoringTeam` non-null,
halftime scores populated, max quarter points > 0 on 15/15 real NBA games. These have been
null/0 in production for the entire life of the feature — "it changed" was the pass condition, and
it changed.

**3. Board win rate** — `npm run bingo:simulate -- --sports basketball_wnba --boards 6` against 4
real upcoming WNBA games, 24 boards: `inTargetBand: 1.0` (every board landed in the 20-30% target
band), mean 26.6%, min 20.3%, max 29.6%. Player squares are now part of the mix (3c) and the board
generator's existing simulation-based rebalancing absorbed them without needing any change.

### New findings this session, not in the original plan

- **`/wnba/v1/season_averages/general` also 404s.** Discovered via the `bingo:simulate` run above
  (visible in its stderr). This is a *different* endpoint from anything Corrections 1/2 named, feeds
  `getNBAPlayerProfilesForGame`'s season-stat fallback (`p.stats`, used only when a player's
  historical sample is thin), and is **not fixed here** — out of scope for a settlement-repair
  phase, and low-impact in practice: 3c's fixed historical walk (`/player_stats` with
  `start_date`/`end_date`) is what actually populates `p.historical.rates`, and
  `buildNBAAchievementCandidates` prefers that empirical rate over the season-stat fallback whenever
  `sampleSize >= 6`. Worth a future one-line fix (same `basketballStatsPathForSportKey`-shaped
  rename, presumably) but does not block this phase or bias settlement.
- **A real, scoped, accepted gap in the four suppressed families' settlement path.** Diagnostic
  section of `bingo:validate:wnba`'s output: build one of the four suppressed-family resolvers
  against a real, populated WNBA snapshot (now that 3a makes WNBA snapshots non-null) and it settles
  `"miss"` on all 15 games, not `"void"` — because `firstHalfByPlayerId`/`maxQuarterAssistsByPlayerId`
  are correctly empty (3d's reasoning above) but `evaluateResolver`'s arms for these four kinds treat
  "snapshot present, player entry absent" as a real miss once `completed` is true (the same `if
  (!line)`/`if (!playerId)` class of branch 2a explicitly left alone, "a different condition and
  belongs to its own change"). **Not production-affecting today** — the facts table confirms zero
  WNBA player squares exist on any current board, and 3d stops new ones of these four kinds from
  ever being generated — but if a next phase ever revisits 2a's noted-and-deferred `if (!line)`
  branches, these four are exactly the case that motivates it. Flagging forward rather than fixing:
  it's a settlement-layer nuance adjacent to 2b's whole subject (distinguishing "unknown" from a
  real value), not this phase's.
- **`tests/lib.sportsBingo.player-props.test.ts`'s NBA board test is flaky, pre-existing, unrelated
  to this phase.** Failed once in a full-suite run. Bisected with `git stash` (isolated
  lib/sportsBingo.ts to pre-Phase-3 state): still reproduces at roughly the same rate (2/20 runs)
  with Phase 3's changes fully reverted, so this is not a regression — it's Monte Carlo board
  generation (180 random attempts, unseeded) against a 3-player fixture pool tight enough
  (`hard_floor: 8`, `player_specific_selected_count: 7`, `shortfall: 1`) that a specific named
  player's square isn't always among the ones selected. Not fixed here — flagging for whoever next
  touches that file or the board-selection RNG.

### Tests

- `tests/lib.sportsBingo.wnba-row-shape.test.ts` extended from 4 tests to 11: endpoint selection
  (`basketballStatsPathForSportKey`), null-as-zero row parsing, the Tempo/Fire mascot-only fixture,
  and the 3d generation-suppression pair (WNBA absent / NBA present, built from an identical mocked
  player pool via a new `vi.mock("@/lib/ballDontLieClient", ...)` — file-scoped, confirmed not to
  affect this file's pre-existing network-free tests).
- `tests/lib.sportsBingo.nba-plays-fix.test.ts` (new, 6 tests): `buildBasketballPlayWalkExtras`
  directly — the real `scoring_play` field, the `is_scoring_play` fallback ordering ("read whichever
  exists" means fall back only when `scoring_play` is absent, not prefer `is_scoring_play`),
  halftime-score and max-quarter-points arithmetic, and the empty-response safe-default case.
  Proven failing first: temporarily reverted the field read to `is_scoring_play`-only, confirmed the
  2 tests targeting that fix failed for the right reason, reverted back, reran green.
- Neither new/extended file is wired into `test:bingo-nfl` / `test:bingo-mlb` — this is basketball,
  not NFL or MLB, and `npm run test` already picks up every `tests/**/*.test.ts` file by default
  (see `vitest.config.ts`), same as `wnba-row-shape.test.ts` was before this phase.

### Gates run, all green

```
npx tsc --noEmit                      # clean
npm run lint                          # clean
npm run test:bingo-nfl                # 250 passed (unchanged from 2a — this phase doesn't touch NFL)
npm run test:bingo-mlb                # 129 passed (unchanged from 2a — this phase doesn't touch MLB)
npm run test                          # 1877 passed / 13 skipped / 0 failing (was 1865/13/0 after 2a)
npm run test:pwa-contract             # 20 passed — required for Phase 3 per the plan's gate table
```

### What's not done — do not treat Phase 3 as fully closed

1. **Not committed.** Same situation 2a left: this phase's changes to `lib/sportsBingo.ts`,
   `package.json`, the two test files, and the two new scripts
   (`scripts/validate-wnba-bingo-grading.cjs`, `scripts/probe-wnba-bingo-settlement.cjs`) sit
   uncommitted on top of 2a (already committed, `c838320`) and the *other*, still-unrelated
   uncommitted work already on this branch (`lib/fantasy.ts`, `lib/sportsBingoNflFlavor.ts`,
   `lib/thesportsdb.ts`, the NFL flavor/simulate scripts, `lib/envNumber.ts`, two new phaseE
   artifacts, two new unrelated test files). **Commit Phase 3 on its own** before starting 2b —
   don't let it get swept into an unrelated commit, and don't `git add -A`.
2. **Andrew's historical-rows decision (raised in 2a) is still unmade** and Phase 3 doesn't change
   the calculus — see 2a's write-up above. Not this phase's call to make.
3. **The two new findings above are flagged, not fixed** — `/wnba/v1/season_averages/general`'s 404
   and the four-suppressed-families settlement gap. Both are low-impact and out of this phase's
   explicit scope; don't let either block moving on to 2b.
4. **Board win rate was checked once, live, against whatever WNBA games happened to be scheduled
   2026-08-18.** The plan calls this "safe to leave on," but it's a point-in-time sample of 4 games
   — if WNBA board composition drifts as the season progresses (more/fewer player squares depending
   on roster/injury news feeding the historical walk), it's worth another `bingo:simulate` pass
   before or shortly after this ships to production.

### Handoff to Phase 2b (up next, same function conflict reason the plan calls out)

- 2b threads a `BallDontLieFailureBox` through `getNBAGamePlayerStatsSnapshot`'s five fetches. All
  five still exist after this phase, at the same conceptual steps (games, box score, lineups, plays,
  per-period stats), but **line numbers moved substantially** — this phase added the
  `basketballStatsPathForSportKey` helper, the `wnbaMode` conditionals, and pulled the whole
  play-walk out into `buildBasketballPlayWalkExtras` sitting just above the function. Re-grep before
  editing.
- The play-walk extraction changes *where* 2b's plays-failure handling needs to live: the fetch
  call itself (`const plays = await fetchBallDontLieList<BallDontLiePlay>(...)`) is still inline in
  `getNBAGamePlayerStatsSnapshot`, but what happens with a failed fetch's result now flows into
  `buildBasketballPlayWalkExtras(plays, card)` rather than an inline loop. The plan's guidance
  ("plays failing should degrade the extras to unknown, not null the whole snapshot") still applies
  identically — 2b's failure box on the plays fetch should gate what gets passed as `extras` to
  `buildNBAGamePlayerStatsSnapshot`, same as before, just one function boundary earlier now.
- The periodStats loop 2b also needs to instrument is now inside an `if (!wnbaMode)` block (3d) —
  a plays/periodStats failure box for that loop only needs to apply to the NBA branch; WNBA already
  skips it unconditionally for a different reason (the endpoint ignores `period`, not "it failed").
  Don't conflate the two — a WNBA periodStats "failure" box would be reporting on a fetch that
  Phase 3 made this function stop making at all.
- The negative-TTL cache fix (`nbaPlayerStatsCache`) is untouched by this phase — same cache, same
  full `NBA_PLAYER_STATS_CACHE_MS` on every write, exactly as 2b's plan section describes.
- This phase's two new findings (season_averages 404, the four-families settlement gap) are both
  adjacent to 2b's subject matter but out of its stated scope (2b is specifically about
  `getNBAGamePlayerStatsSnapshot`'s five fetches, not `getNBAPlayerProfilesForGame`'s or
  `evaluateResolver`'s). Worth a mention in 2b's own write-up as "still open" rather than silently
  dropped.

### Handoff to Phase 1 (independent, any time, needs API budget)

- No interaction with Phase 3 at all — confirmed unchanged from 2a's note. Different files
  entirely.

---

## Phase 2b — done, 2026-08-18 — handoff to whoever picks up Phase 1 next

**Status: complete, all gates green, uncommitted on `restore/mlb-bingo-r1` until this write-up
lands with it in the same commit (matching 2a/3's pattern).** Landed after Phase 3 per the plan's
suggested order and its own explicit sequencing note (both phases edit
`getNBAGamePlayerStatsSnapshot`; Phase 3 restructured the fetches, this phase instruments them).

### What changed

**`lib/sportsBingo.ts`, `getNBAGamePlayerStatsSnapshot`** — all five fetches (games, box score,
lineups, plays, the four-call NBA-only per-period-stats loop) now pass a `BallDontLieFailureBox`
and react to it individually, per the plan's explicit "decide per fetch" instruction:

- **Box score (`stats`) fails → the whole snapshot is `null`.** This is the core fix. Before this
  phase, `fetchBallDontLieList` degrading a failed box-score fetch to `[]` produced a fully-formed,
  zero-filled `NBAGamePlayerStatsSnapshot` that every resolver read as "this event definitively did
  not happen" — the mechanism that mis-settled all 43 WNBA squares before Phase 3's endpoint fixes,
  and one Phase 3 only removed one instance of, not the general case (a rate limit, an outage, a
  schema change, or a future league on the wrong path reproduces it identically). On a stats
  failure the function now bails immediately — the remaining four fetches never run, since a null
  snapshot needs none of their output.
- **Games fetch fails → also `null`**, same as a genuine "no matching game in the lookup window"
  (unchanged behavior there), but now tagged so the cache TTL below knows it was a failure, not a
  real answer.
- **Lineups fetch fails → `lineupDataAvailable: false`** (new snapshot field). Only
  `nba_player_bench_scores` reads it. Box score and plays data are untouched.
- **Plays fetch fails → `quarterExtrasAvailable: false`** (new snapshot field), and the
  play-walk-derived fields (`firstScoringTeam`, both halftime scores, both max-quarter-points) are
  forced to their empty defaults regardless of what `buildBasketballPlayWalkExtras([], card)` would
  have computed from an empty array — the two states (walk found nothing yet vs. walk never ran)
  must not be conflated, so the override is on the failure box, not on `plays.length`. Box score
  squares still grade normally.
- **Any one of the four per-period-stats fetches fails (NBA only) → `periodStatsAvailable:
  false`** for the whole game, not just that quarter — a partial quarter walk is not trustworthy
  for a `_first_half_at_least` or `_in_any_quarter_at_least` square. The loop continues to the next
  period on a failure (`continue`) rather than aborting, since a later quarter's data is still
  worth having for whichever families actually need it, but the flag downgrades the whole set.
  Unaffected by WNBA — the loop is skipped there entirely by Phase 3d for an unrelated reason ("the
  endpoint ignores `period`," not "it failed"), and `periodStatsAvailable` stays `true` in that
  case by design (see the in-code comment) — this is a *different condition* from a fetch failure,
  and Phase 3's already-flagged "four suppressed families settle miss on a populated snapshot" gap
  is explicitly **not** touched by this phase (still open, still low-impact, still just flagged).

**Distinguishing "unknown" from a real value, without widening any field to nullable.** The plan
called out `homeMaxQuarterPoints: 0`/`awayMaxQuarterPoints: 0` meaning both "measured zero" and
"never fetched" as the same bug one level down. Rather than making those two fields (and
`lineupByPlayerId`, and the two per-player maps) nullable/sentinel-valued one at a time, this phase
added three sibling booleans to `NBAGamePlayerStatsSnapshot` — `lineupDataAvailable`,
`quarterExtrasAvailable`, `periodStatsAvailable` — one per fetch-failure domain, each defaulting to
`true` when not explicitly supplied (so every other caller of `buildNBAGamePlayerStatsSnapshot` —
the WNBA row-shape tests, the validator script — is unaffected). This mirrors a pattern **already
established elsewhere in this same file**: `NFLPlayDerivedFacts.available` and
`NFLTeamStatsFacts.available` do exactly this for NFL's own optional-fetch legs
(`lib/sportsBingo.ts:904-959`), and `evaluateResolver`'s NFL arm already gates on them
(`if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available)`). This phase's NBA/WNBA gates
(below) are the same shape. Chose this over nullable fields because it's directly testable, doesn't
require every existing reader of `homeMaxQuarterPoints` etc. to add a null-check, and matches
precedent already in the codebase rather than inventing a second convention next to it.

**`evaluateResolver`** — seven resolver kinds gained an availability check ahead of their existing
`!nbaStatsSnapshot` guard (same `void`-if-completed-else-`pending` shape as that guard, just also
firing when the snapshot is present but the relevant fetch failed):

```
nba_player_bench_scores                    → !lineupDataAvailable
nba_team_scores_first                       → !quarterExtrasAvailable
nba_team_leads_at_halftime                  → !quarterExtrasAvailable
nba_team_points_in_any_quarter_at_least     → !quarterExtrasAvailable
nba_player_points_first_half_at_least       → !periodStatsAvailable
nba_player_assists_in_any_quarter_at_least  → !periodStatsAvailable
nba_player_steals_first_half_at_least       → !periodStatsAvailable
```

All seven were already in `isResolverEligibleForVoidRegrade` from Phase 2a (they were among the 22
guard sites), so the regrade seam needed no further change — a square voided by one of these new
gates is exactly as reopenable as one voided by the original `!nbaStatsSnapshot` guard.

**Cache TTL split.** New `NBA_PLAYER_STATS_FAILURE_CACHE_MS = 1_000` (exported), alongside
`NBA_PLAYER_STATS_CACHE_MS = 5_000` (now also exported, for the test below). A local
`anyFetchFailed` boolean is set by any of the five fetches' failure boxes and checked at every
`nbaPlayerStatsCache.set(...)` call site (there are three: the two early-`null` returns and the
success path) — same pattern as the pre-existing `SEASON_STATUS_FAILURE_CACHE_MS` /
`hasUpcomingGamesInWindow` (`lib/sportsBingo.ts:1146`). Worth knowing: the *full* TTL here was
already only 5 seconds (much shorter than the season-status cache's 6 hours), so the practical
blast radius this closes is smaller than the plan's framing suggested — a bad blip was never going
to lock a card out for long either way. Implemented anyway, per the plan's explicit test ask (#4)
and because "a failure and a real answer share a TTL" is the same category of bug regardless of the
window size.

### What was deliberately not changed

- **`nba_player_bench_scores`'s missing-`completed`-gate on the `!lineup || lineup.starter → miss`
  branch** (`lib/sportsBingo.ts`, same case). Noticed while touching this case: unlike every other
  branch in `evaluateResolver`, this one settles `miss` immediately on an empty/non-starter lineup
  entry with no `completed` check at all — so a game whose lineups haven't posted yet (normal
  pre-tip-off state, not a failure) would settle `miss` early instead of `pending`. This is a real
  bug, but it's a *different* condition from Phase 2b's subject (a fetch that failed vs. a fetch
  that succeeded and correctly found nothing yet), it's the same class of thing Phase 2a explicitly
  left alone (`if (!line)`/`if (!playerId)` branches — "a different condition and belongs to its
  own change"), and fixing it isn't needed for this phase's tests to pass. Flagging forward rather
  than fixing, same as Phase 3 did for its two new findings.
- **The two Phase 3 findings** (`/wnba/v1/season_averages/general` 404, the four-suppressed-families
  settlement gap) — still open, still out of scope, mentioned here only so they don't get lost
  between write-ups.
- **No row adapter, no nullable-field widening** on `homeMaxQuarterPoints`/`awayMaxQuarterPoints` —
  see the `available`-boolean reasoning above.

### Tests

New `tests/lib.sportsBingo.nba-fetch-failure.test.ts` (6 tests) — drives the real, now-exported
`getNBAGamePlayerStatsSnapshot` under a per-endpoint-controllable mock of
`@/lib/ballDontLieClient` (a `failing` set that makes a given path's `options.failure.failed = true`
and returns `[]`, and a separate `emptying` set that returns `[]` *without* setting the failure box,
so "the provider said empty" and "the provider was down" are independently triggerable — the exact
distinction this phase's subject depends on). Uses `vi.useFakeTimers()` to prove the TTL split
behaviorally (a second call inside the short window refetches; inside the long window it doesn't)
rather than reading the cache's internal state directly, since the cache map itself stays private.

Maps directly to the plan's four test asks:
1. Box-score fetch fails → snapshot is `null` (not zero-filled).
2. Box-score fetch succeeds with a genuine `emptying`-triggered `[]` → snapshot is non-null with
   `lines: []` — proves the distinguishing signal is the failure box, not row count.
3. Plays fetch fails, box score succeeds → `lines` still populated and correct;
   `quarterExtrasAvailable: false`; `firstScoringTeam`/`homeMaxQuarterPoints` sit at their empty
   defaults rather than a stale/wrong computed value; `lineupDataAvailable` unaffected (proves the
   per-fetch isolation, not just "one flag for everything").
4. TTL split, both directions: a success survives a `NBA_PLAYER_STATS_FAILURE_CACHE_MS + 1` advance
   with zero new network calls (full TTL still in effect); a failure does not (refetches).

Also added a lineups-fetch-failure test (not one of the plan's four named asks, but the same shape
of gap on the fifth fetch) — `lineupDataAvailable: false`, box score and plays data unaffected.

**`tests/lib.sportsBingo.missing-data-voids.test.ts` (Phase 2a's file) extended, not replaced** —
its "no over-reach: present snapshot, genuinely below threshold" fixture is a hand-built
`as any` `NBAGamePlayerStatsSnapshot`-shaped object (Phase 2a's write-up already flagged this as
fragile to type growth). Added the three new fields there set to `true`, since that test's whole
point is "data is available and the answer is a real miss," not "data is unavailable" — without the
addition, the fixture's missing fields would read as `undefined` → falsy → the new availability
gates would fire and turn the test's expected `miss`/`hit` into an unexpected `void`. This is
exactly the fragility Phase 2a's write-up predicted ("worth revisiting if that type grows before
Phase 3" — it grew again, in 2b, and needed the same manual sync).

**Proven failing first, verified by hand:** `git diff lib/sportsBingo.ts > phase2b.diff`,
`git apply -R` (never `git checkout -- <file>` — see the standing rule), reran both test files: the
new file failed all 6 (the export doesn't exist pre-fix, so every call throws
`TypeError: ... is not a function` — a real failure, not a vacuous one, since the test file's whole
premise is calling that exported function), the extended existing file's 6 tests still passed
unchanged (expected — that file's assertions don't exercise the new gates, only the fixture needed
updating so *later* runs wouldn't spuriously break). `git apply`'d the diff back, reran, all 12
passed.

### Gates run, all green

```
npx tsc --noEmit                      # clean
npm run lint                          # clean
npm run test:bingo-nfl                # 250 passed (unchanged — this phase touches no NFL code)
npm run test:bingo-mlb                # 129 passed (unchanged — this phase touches no MLB code)
npm run test                          # 1883 passed / 13 skipped / 0 failing (was 1877/13/0 after Phase 3; +6 from the new file)
```
`test:pwa-contract` not run — per the plan's gate table this is required for Phase 3 only, and this
phase touches no PWA/manifest surface.

### What's not done — do not treat 2b as fully closed

1. **Not committed as of this write-up being drafted** — will land in the same commit as this
   section, per the pattern 2a/3 both established (docs + code + tests together). If you're reading
   this from a diff instead of `git log`, the commit didn't happen yet; don't start Phase 1 without
   checking `git status` first, same standing instruction as always.
2. **The `nba_player_bench_scores` missing-`completed`-gate bug (see "deliberately not changed"
   above) is real and still there.** Not this phase's to fix, but worth a line in whatever tracks
   open items for this feature area if one exists outside this plan doc.
3. **Andrew's historical-rows decision (raised in 2a) is still unmade.** Unrelated to this phase's
   files, mentioned here only so it doesn't get lost across three write-ups now.
4. **The negative TTL's practical impact is smaller than it might sound** — full TTL here was
   already 5 seconds pre-existing, not the hours-long window the `SEASON_STATUS_FAILURE_CACHE_MS`
   precedent this pattern is modeled on protects against. Implemented per the plan's explicit ask
   anyway (see "Cache TTL split" above) — just don't oversell this bullet point if summarizing the
   phase's impact to anyone.

### Handoff to Phase 1 (up next — the only phase left; independent, any time, needs API budget)

- **No interaction with 2b at all.** Phase 1 touches `scripts/measure-mlb-event-rates.cjs`,
  `lib/mlbTeamEventRates.ts`, and two MLB call sites in `lib/sportsBingo.ts` —
  `buildMlbTeamEventCandidateTemplatesForBacktest` (now defined at line 5424, was 5309 in the
  plan's original text) and `buildMLBPlayerPropCandidatesFromRecentStats` (now at 5477, was 5769).
  **Re-grep before editing regardless** — this phase's edits sit entirely above 2507 in the file, so
  every later line number moved, but by an amount that varies through the file rather than a flat
  offset; don't assume a constant shift. Nothing in 2b touches MLB rate models, team-event candidate
  generation, or the calibration script.
- **This is the last phase in the plan's table.** After Phase 1 lands (with its own live-measured
  artifact per its own "do not hand-copy" rule), the whole `docs/bingo-correctness-and-wnba-repair-plan.md`
  plan is complete: 2a (NBA void-on-null), 3 (WNBA settlement + the NBA plays fix), 2b (fetch-failure
  hardening), 1 (MLB home/away split) will all be done. At that point the open items still
  outstanding across all four write-ups are: Andrew's historical-rows backfill decision (2a), the
  bench-scores completed-gate bug (2b, this write-up), and Phase 3's two flagged findings
  (`/wnba/v1/season_averages/general` 404, the four-suppressed-families settlement gap). None of
  those block calling the plan done — they're all explicitly scoped out, not overlooked.
- **The branch-merge question the plan's "Branch state" section raises is still open and still
  Andrew's** — worth re-raising once Phase 1 lands and this plan is fully done, since by then the
  branch will carry nine production-affecting changes never merged to `main`.

---

## Phase 1 — done, 2026-08-18 — the plan is now complete

**Status: complete, all gates green, uncommitted on `restore/mlb-bingo-r1`.** Last phase in the
plan's table. Landed independently of 2a/3/2b, as the plan said it could.

### What changed

**1a — the measurement script.** `scripts/measure-mlb-event-rates.cjs` gained a third view,
`bySide`, alongside the existing marginal and conditional-on-trailing-form views (kept
byte-identical in shape, per the plan's explicit ask). Team side is resolved per team-game by
matching `entry.teamName` against the game row's top-level `home_team_name` / `away_team_name`
(confirmed live this session — MLB's `/games` rows do carry those two flat string fields, exactly
as the plan's 1a section named them) through a **locally reimplemented** `teamsMatch` /
`normalizeTeamKey` / `toMascotDisplayName` — not imported from `lib/sportsBingo.ts`, since this
script runs as plain `node` with no TS build step and those three functions are self-contained.
Matched with `teamsMatch`, never `===`, per the plan's explicit instruction. Text-mode output
gained a home/away summary table; JSON output gained `bySide` and `coverage.gamesWithUnresolvedSide`.

**1b — re-measured, not hand-copied.** `npm run bingo:measure:mlb -- --days 120 --json`, live,
this session: 3,102 team-games from 1,551 completed games (2026-04-21 .. 2026-08-17),
`gamesWithUnresolvedSide: 0` — every team-game's side resolved. Archived at
`docs/phase0-artifacts/mlb-event-rates-side-split-2026-08-18.json`. **The whole table in
`lib/mlbTeamEventRates.ts` was replaced wholesale from this one run** — `leagueMean`, `variance`,
and the four `opponent*` fields too, not just the two new `homeMean`/`awayMean` fields — per the
plan's "do not hand-copy" rule: mixing this run's side ratio onto the old 2026-08-17 pooled numbers
would have introduced a second error while fixing the first. All six events confirmed home mean <
away mean, largest on strikeouts (home 8.006 vs away 8.635 — close to Phase 5's corroborating
8.04/8.73, as expected from an independent live sample, not identical).

**1c — the model.** `MlbTeamEventRateModel` gained `homeMean`/`awayMean`; `leagueMean` stays as the
`teamSide: null` fallback, unchanged in meaning. **Variance was measured per side and left pooled**
— every event's home/away variance sits within ~5% of the pooled figure (hit and walk are right at
that boundary, ~5.0-5.3%; the rest are 1-4%), so per the plan's explicit instruction ("within ~5%
of pooled, keep one variance... an unjustified constant is worse than none") `variance` stays one
number shared by both sides. Recorded in the module comment, not silently decided.

**1d — threaded through.** `predictMlbTeamEventRate` gained a fourth parameter,
`teamSide: TeamSide | null = null` (default `null` so every untouched caller keeps calling it with
three arguments and gets exactly today's pooled behavior — the compatibility escape hatch the plan
asked for, verified by test, not just by inspection). Selects `homeMean` / `awayMean` /
`leagueMean` as the base the opponent adjustment is applied on top of; the adjustment math itself
is untouched. `TeamSide` is declared locally in `lib/mlbTeamEventRates.ts` (`"home" | "away"`)
rather than imported from `lib/sportsBingo.ts`, to avoid a circular import — it's structurally
identical to that module's own `TeamSide`, so every existing call site's value is assignable
without a cast. Both call sites now pass their loop's `teamSide` variable:
`buildMlbTeamEventCandidateTemplatesForBacktest` (line ~5454, confirmed already inside a
`for (const teamSide of ["home", "away"])` loop, just wasn't threading it) and the live path in
`buildMLBPlayerPropCandidatesFromRecentStats` (line ~5914, same shape). `buildMlbTeamEventRungs`
needed no signature change, as the plan predicted — it only ever saw `expectedRate`.

### Tests

Extended `tests/lib.sportsBingo.mlb-event-rebalance.test.ts` with a new `describe` block, six
tests, none hardcoding a measured number (assert direction/equality against `MLB_TEAM_EVENT_RATES`
itself, so a re-measurement doesn't rewrite them, per the plan's explicit ask):

1. Every measured event's `homeMean < awayMean`.
2. `teamSide: null` (both explicit and via the default parameter) returns exactly `leagueMean`,
   with no opponent data.
3. `teamSide: null` still returns `leagueMean` even *with* opponent data supplied — the side gate
   is checked before the opponent branch, not only in the no-opponent-data path.
4. `teamSide: "home"` / `"away"` with no opponent data reproduce `homeMean` / `awayMean` exactly.
5. The side base and the opponent adjustment compose: same tough-opponent input, home stays below
   away by exactly the gap between their base means, and each side's price still moves *up* from
   its own base mean rather than the opponent adjustment being discarded when a side is supplied.
6. A generated board's home/away rungs for the same event can actually differ in threshold (at
   least one of the six events must, board-wide — not every event necessarily rounds to a
   different integer at every target).

All 17 tests in the file pass (11 pre-existing + 6 new).

**Proven failing first:** ran the new tests against the pre-Phase-1 three-argument
`predictMlbTeamEventRate` and the pooled-only `MlbTeamEventRateModel` (by temporarily reverting
`lib/mlbTeamEventRates.ts`) — TypeScript itself refuses to compile tests 1 and 4-6 (`homeMean`/
`awayMean` don't exist on the type, `predictMlbTeamEventRate` doesn't accept a fourth argument),
which is a real failure, not a vacuous one. Reapplied, reran, all green.

### An incidental fixture repair, not a regression

`tests/lib.sportsBingo.mlb-star-tilt.test.ts`'s `MLB_HOIST_SNAPSHOT` — a byte-identical-board
regression pin from an unrelated earlier phase (`docs/prop-bingo-code-review-fix-plan.md`'s
star-tier hoist) — failed once this landed. Board 1 of its 3-board seeded snapshot carries
`mlb_webhook_team_event_at_least` squares whose thresholds are a direct function of
`predictMlbTeamEventRate`'s output, which this phase intentionally changed. **This is the fix
working, not a regression**: re-captured board 1's signature against the new code (boards 2 and 3
came back byte-identical to before — their seeded draws never happened to select a team-event
square whose threshold moved) and recorded why in a comment on the constant, so a future reader
doesn't mistake it for hoist drift.

### Verification

```
npm run bingo:calibrate:mlb -- --games 600 --boards 6 --json
```

Archived at `docs/phase0-artifacts/phase1-mlb-calibration-after-side-split-2026-08-18.json`,
compared against the pre-Phase-1 baseline `docs/phase0-artifacts/phase5-mlb-calibration-2026-08-18.json`:

| metric | before | after |
|---|---|---|
| `team_event:ALL:home` gap | -0.020 | -0.008 |
| `team_event:ALL:away` gap | +0.016 | -0.008 |
| `byTeamEvent` (pooled) gaps | -0.024 .. +0.013 | -0.032 .. +0.006 |

**Success condition met**: both `team_event:ALL:home` and `team_event:ALL:away` moved toward zero
(home's gap shrank from -0.020 to -0.008; away's flipped sign and shrank from +0.016 to -0.008 in
magnitude). `byTeamEvent` (pooled) stayed in the same small range it was in before — no systematic
degradation from the split, as the plan required. Per the plan's own caveat, board generation is
random per trial, so this compares signs and magnitudes, not third decimals — both sides now sit
closer to zero and closer to each other than before, which is the whole claim Phase 1 makes.

### Gates run, all green

```
npx tsc --noEmit                      # clean
npm run lint                          # clean
npm run test:bingo-nfl                # 250 passed (unchanged — this phase touches no NFL code)
npm run test:bingo-mlb                # 135 passed (was 129; +6 from the new describe block)
npm run test                          # 1889 passed / 13 skipped / 0 failing (was 1883/13/0 after 2b)
```
`test:pwa-contract` not run — required for Phase 3 only per the plan's gate table, and this phase
touches no PWA/manifest surface.

### What's not done — do not treat Phase 1 as fully closed

1. **Not committed.** Same pattern as every prior phase in this plan: `lib/mlbTeamEventRates.ts`,
   `lib/sportsBingo.ts` (two call sites), `scripts/measure-mlb-event-rates.cjs`,
   `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`,
   `tests/lib.sportsBingo.mlb-star-tilt.test.ts` (the incidental snapshot repair), this doc, and the
   two new artifacts (`docs/phase0-artifacts/mlb-event-rates-side-split-2026-08-18.json`,
   `docs/phase0-artifacts/phase1-mlb-calibration-after-side-split-2026-08-18.json`) all sit
   uncommitted on top of 2a/3/2b (already committed) and the *other*, still-unrelated uncommitted
   NFL-flavor work already on this branch. **Commit Phase 1 on its own**, don't `git add -A`.
2. **This is the last phase — the whole plan is now done**, but three items flagged across the four
   write-ups remain genuinely open, none blocking: Andrew's historical-rows backfill decision (2a),
   the `nba_player_bench_scores` missing-`completed`-gate bug (2b), and Phase 3's two findings
   (`/wnba/v1/season_averages/general` 404, the four-suppressed-families settlement gap).
3. **The branch-merge question is now the only thing left.** After this phase's commit, the branch
   carries nine production-affecting changes never merged to `main` — still Andrew's call, per the
   plan's "Branch state" section, and worth raising now that nothing else in this plan is blocking
   it.
