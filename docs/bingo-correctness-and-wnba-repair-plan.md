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
