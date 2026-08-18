# Prop Bingo — NFL Phase 0 Findings

**Status:** Phase 0 complete. **Ran:** 2026-08-16, against the live balldontlie API and this
repo's `.env.local` key. **Parent plan:** `docs/prop-bingo-nfl-plan.md`.

**Tools built (reusable, not one-shot):**
- `npm run bingo:probe:nfl` → `scripts/probe-nfl-bingo.cjs` — self-contained (no project TS
  imports; `server-only` throws under plain node, same reason `probe-apisports-nba.cjs` is
  self-contained). Re-run this closer to Week 1 kickoff (see §5) and again after any BDL
  contract change.
- `npm run bingo:baseline` → `scripts/baseline-bingo-win-rates.cjs` — imports
  `lib/sportsBingo.ts` directly via `--conditions react-server --import tsx` (the
  `simulate-category-blitz.cjs` pattern), calls the real `generateSportsBingoBoard()` N times
  per today's NBA/WNBA/MLB game, and reports the `boardProbability` distribution. This is
  Phase 5's "before" number.
- Raw JSON from both runs archived at `docs/phase0-artifacts/nfl-probe-2026-08-16.json` and
  `docs/phase0-artifacts/win-rate-baseline-2026-08-16.json` — the numbers below are read off
  those files, not re-derived.

---

## 0. Headline: one plan assumption is wrong, and it's load-bearing

**BDL's `/nfl/v1/games` carries zero preseason games. Not "thin" — zero.**

Pulled the *entire* 2025 NFL season (`seasons[]=2025`, no other filter, all pages): **285
games**, sorted by date. The earliest one is `id 423945`, dated `2025-09-05`, `week: 1`,
`postseason: false` — i.e. Thursday Night Football, Week 1. Filtering the same 285 games for
any August-dated entry returns **0**. The official docs (`BDL-API docs/NFL API .html`) don't
mention the word "preseason" once. The `/nfl/v1/games` query parameters are `dates`, `seasons`,
`team_ids`, `postseason` (boolean), `weeks` — there is no schedule-type filter that would even
let a preseason game hide behind a different flag.

This isn't a coverage gap that book-posted-props-only (decision 4) can paper over — decision 4
assumes the **game itself** exists in the catalog with a thin props layer on top. Here the game
object doesn't exist at all: no score fields, no odds, no stats, nothing to build any square
(team/game squares included) against. `loadGameCatalog()` will return an empty list for the
entire preseason window, every year, regardless of what Phase 1's season-status flag says.

**This also explains something in the existing codebase, not just something new:** NFL Pick
'Em's `docs/NFL_PICKEM_PRESEASON_ADDENDUM.md` describes a full preseason data model
(`week_type` column, `calculatePreseasonWeekNumber`, etc.), but the actual sync path that
touches BDL — `syncNFLWeeks()` in `lib/nflPickEm.ts:2242` — hardcodes
`postseason: "false"` and only accepts `week >= 1`, i.e. it only ever syncs regular season. The
preseason addendum is a **plan that was written but never wired to real BDL data**, because
there was never any real BDL data for it to wire to. Prop Bingo would be inventing the same gap
a second time if Phase 1 assumes preseason games exist.

**Recommendation — needs Andrew's call before Phase 1 proceeds:**
1. **Scope ask #2 down to regular season + postseason only.** This is the only option that
   matches what BDL actually provides. `LEAGUE_SEASON_WINDOWS`/`resolveLeagueSeasonStatus`
   should treat "in season" for NFL as the regular-season + postseason calendar window, with no
   preseason branch — there is nothing to gate, because there is nothing to show.
2. Alternative: pull a second data source just for the preseason schedule. Out of scope for a
   plan built around "one vendor" (balldontlie); not recommended without a separate ask.
3. Do **not** silently drop this in code without flagging it — the original ask explicitly said
   "preseason *and* regular season," so this is a scope change, not an implementation detail.

Everything below (regular season) is fully supported and un-blocked.

---

## 1. Preseason detection rule

**There is no rule to write.** Per §0, BDL has no preseason games to detect. If decision 1 above
(scope to regular+postseason) is accepted, Phase 1 needs no preseason branch at all — a game's
`postseason` boolean plus its presence in `/nfl/v1/games` is the entire story.

If a future BDL contract change adds preseason coverage, re-run `npm run bingo:probe:nfl` — the
script already checks `dates[]` for the next 10 days and, as a fallback when that's empty (the
common case outside the two weeks before Week 1), pulls the full current-or-prior season and
reports `preseasonCatalogCoverage.verdict`. A change would show up as
`augustDatedGameCount > 0` instead of the current `"NO PRESEASON COVERAGE"` verdict.

**Regular-season / postseason rule (this part works exactly as planned):**
- `postseason: false` + `week` 1–18 → regular season.
- `postseason: true` → playoffs (`week` re-purposed as round; not depended on here).
- Games appear in the catalog **well before kickoff** — 2026 Week 1 games (Sept 10/11) were
  already present, with odds posted from 8 vendors, on 2026-08-16 — 25 days out. So Phase 1's
  ~14-day lookahead will correctly show NFL as "out of season" today and flip to "in season"
  automatically as Week 1 enters the window. No calendar-fallback edge case here; the calendar
  fallback's job for NFL is really "cover the entire off-season," which it already does per the
  plan's design.

---

## 2. Tier verdict: **GOAT, confirmed**

| Endpoint | Status | Notes |
| --- | --- | --- |
| `/nfl/v1/games` | 200 | Free tier, as expected. |
| `/nfl/v1/odds` (game_ids[], 6 future games) | 200, 8 vendors/game | GOAT-gated per docs; live. |
| `/nfl/v1/odds/player_props` (game_id, 6 future games) | 200 | GOAT-gated; see §3 for why row counts were 0. |
| `/nfl/v1/stats` (game_ids[], 1 completed game) | 200, 60 player rows | GOAT-gated; live. |
| `/nfl/v1/plays` (1 future game_id, 1 completed game_id) | 200 / 200 | GOAT-gated; confirms Optional 3b (play-by-play squares) is unblocked too. |

This matches what NFL Pick 'Em already proves in production for odds (`lib/nflPickEm.ts:975`).
No tier upgrade needed for any phase of this plan, including Optional 3b.

---

## 3. Player props: allowlist verdict (documentation + stats-field cross-reference)

Player props for the nearest real games (2026 Week 1, kicking off in 25 days) came back `200 OK`
with **0 rows** — matches the docs exactly ("Player prop betting data is LIVE... books pull
props as a game nears its end" — read: nears its *start*; BDL doesn't carry props this far out).
So the allowlist below is derived by cross-referencing BDL's documented `prop_type` list against
the fields actually present on a real settled game's `/nfl/v1/stats` response (60-row sample,
`docs/phase0-artifacts/nfl-probe-2026-08-16.json` → `statsFieldPresence`). **Action item:**
re-run `npm run bingo:probe:nfl` within ~48h of Week 1 kickoff (game_ids from that run's
`upcomingGames`) to confirm live prop counts/players/vendors match this table before Phase 3
ships.

| Prop type | Gradable? | From | Notes |
| --- | --- | --- | --- |
| `passing_yards`, `passing_tds`→`passing_touchdowns`, `passing_attempts`, `passing_completions` | ✅ | `passing_*` | Populated 2/60 rows sampled = 1 QB/team, as expected. |
| `interceptions` | ✅ | `passing_interceptions` | Docs say "Total interceptions **thrown**" — unambiguously the QB stat, not a defender's `defensive_interceptions`. |
| `rushing_yards`, `rushing_attempts` | ✅ | `rushing_*` | |
| `receptions`, `receiving_yards` | ✅ | `receptions`, `receiving_yards` | |
| `rushing_receiving_yards` | ✅ | sum of the two | |
| `anytime_td` (+ half/quarter variants) | ✅ overall; ⚠️ half/quarter variants | `rushing_touchdowns + receiving_touchdowns ≥ 1` | Only the whole-game `anytime_td` is gradable from the box score; `anytime_td_1h/1q/etc.` need play-by-play (fold into Optional 3b if wanted, not core Phase 3). |
| `longest_rush` | ✅ | `long_rushing` | |
| `longest_reception` | ✅ | `long_reception` | |
| `fg_made` | ✅ | `field_goals_made` | Populated 2/60 rows = 1 kicker/team. |
| `kicking_points` | ✅ **derived, not a direct field** | `3 × field_goals_made + extra_points_made` | **No `kicking_points` or `total_points` field exists** (`total_points` was present in the schema but populated in 0/60 sampled rows — a dead field, don't use it). Standard scoring assumption (all FGs = 3, regardless of distance); flag this formula for validation against a real settled `kicking_points` line the first time one is observed. |
| `longest_pass` | ❌ **drop** | — | Confirmed absent: no `long_passing`/longest-completion field anywhere in `/nfl/v1/stats`. Per the plan's own contingency ("only if Phase 0 finds the fields — otherwise dropped"), this one is dropped, not guessed. |
| `first_td` | ⚠️ **move to Optional 3b, not core Phase 3** | needs `/nfl/v1/plays`, chronological scoring order | The aggregate box score has no notion of *order* — `/nfl/v1/stats` can tell you a player scored, never whether it was first. `/nfl/v1/plays` is confirmed accessible (§2) so this is buildable, but it belongs with the other play-by-play squares in Optional 3b, not the box-score-only core scope Phase 3 was designed around. |

**Net effect on Phase 3's plan:** the core (box-score-gradable) player-prop table needs exactly
two edits — drop `longest_pass`, move `first_td` down to Optional 3b. Everything else in the
plan's table checks out.

**Vendor note for Phase 2/3's de-vig consensus:** the 6 future games probed all returned 8
odds vendors: `draftkings, fanduel, fanatics, caesars, betrivers, betmgm, kalshi, polymarket`.
`kalshi` and `polymarket` are prediction markets, not sportsbooks — their
`moneyline_home/away_odds` are symmetric (e.g. `-182`/`182`), which reads as synthesized from a
probability rather than a real two-sided vig line. `lib/nflPickEm.ts`'s
`NFL_SPREAD_VENDOR_PRIORITY` list already excludes both (falls to lowest priority, `length`,
still usable as a last resort) — reuse that list as instructed and this is a non-issue, just
confirming the existing exclusion is correct and current.

---

## 4. Team/game squares

All confirmed buildable purely off `/nfl/v1/games` fields already observed in live responses:
`home_team_score`/`visitor_team_score`, `home_team_q1..q4`/`visitor_team_q1..q4` (+`_ot`),
`status`. No odds or props dependency, so — regular season only, per §0 — these are the
most reliable Phase 3 squares, exactly as the plan intended.

---

## 5. Win-rate baseline (Phase 5's "before" number)

Ran `npm run bingo:baseline -- --trials-per-game 3` on 2026-08-16 (today's real games). Full
per-game/per-trial output: `docs/phase0-artifacts/win-rate-baseline-2026-08-16.json`.

| League | Games today | Board trials | `boardProbability` min–max | mean | median |
| --- | --- | --- | --- | --- | --- |
| NBA | 0 | — | — (off-season; no games to sample) | — | — |
| WNBA | 3 | 9 | 0.370 – 0.446 | 0.3955 | 0.3883 |
| MLB | 15 | 45 | 0.381 – 0.464 | 0.4325 | 0.4342 |

Current global target: `BINGO_BOARD_TARGET_WIN_RATE = 0.42` (unset in `.env.local`, code
default). Both leagues sampled land close to that target, which is exactly what's expected —
`boardProbability` is the *independent-coin-flip* estimator's own opinion of itself
(`estimateBoardWinProbabilityWithTrials`), not a realized win rate. This number says nothing
about how often a real board actually wins; that's precisely the gap Phase 5b's correlated
simulator + `bingo:simulate` backtest mode is for. Keep this file as the pre-5b snapshot to diff
against post-5b.

**Follow-up before Phase 5 lands:** NBA is off-season right now (August), so there's no NBA
sample. Re-run `npm run bingo:baseline` on any day with live NBA games (season runs
October–June) before treating the baseline as complete across all three currently-active
leagues.

---

## 6. Go/no-go summary

| Item | Verdict |
| --- | --- |
| GOAT tier (odds, player_props, stats, plays) | **GO** — all confirmed 200, matches Pick 'Em precedent. |
| Regular-season + postseason NFL activation | **GO** — full pipeline (games, odds, stats, plays) available today. |
| Preseason NFL activation | **NO-GO as scoped** — BDL has zero preseason game data, not thin data. Needs Andrew's decision (see §0) before Phase 1 writes any preseason-aware code. |
| Core (box-score) player-prop allowlist | **GO with two edits** — drop `longest_pass`; move `first_td` to Optional 3b. |
| Team/game squares | **GO**, unconditionally (regular season). |
| `kicking_points` | **GO, but derived** — no direct field; compute `3×fg_made + xp_made`, validate against a real line once observed live. |
| Win-rate baseline | **Partial** — WNBA + MLB captured; NBA needs a re-run in season. |

---

## Handoff notes for whoever runs Phase 1

1. **Stop and get a decision on preseason scope (§0) before writing `lib/leagueSeasonStatus.ts`.**
   If Andrew accepts "regular season + postseason only" for NFL, `LEAGUE_SEASON_WINDOWS`'s NFL
   entry should model the regular-season calendar window (roughly early September through the
   Super Bowl in February) with no preseason carve-out, and Phase 3/4/the plan's "preseason
   behavior" section (lines 175–178 of the parent plan) should be struck, not implemented.
2. **Don't re-derive the preseason finding by re-probing `/nfl/v1/games` with a `dates[]`
   window in August** — you'll get the same empty result Phase 0 got, for the same reason
   (games don't exist, not "games didn't return today"). The proof that this is structural, not
   a fluke of today's date, is in §0's full-2025-season pull. Re-run `bingo:probe:nfl` only to
   re-confirm the *regular season* pipeline (odds/props/stats/plays) is still live, or to check
   whether BDL has since added preseason coverage (`preseasonCatalogCoverage.verdict` in the
   output will say so plainly if it has).
3. **The 14-day lookahead in the plan's `resolveLeagueSeasonStatus` will correctly show NFL as
   out-of-season for most of the year and flip in-season automatically** as the live catalog
   picks up Week 1 (games appear ~4 weeks pre-kickoff per §1) — no special-casing needed for
   that transition.
4. **`nfl_pickem_weeks.week_type`'s preseason story is aspirational, not as-built** — don't use
   it as a reference implementation for anything preseason-related in Prop Bingo; its own sync
   path never populates preseason weeks either (§0).
5. Phase 2 onward can proceed exactly as written in the parent plan for regular season +
   postseason, with the two Phase 3 allowlist edits from §3 folded in.
6. Re-run `npm run bingo:probe:nfl` within ~48h of the first real Week 1 kickoff to confirm
   live player-prop volume/diversity before Phase 3 ships to real venues — today's run could
   only confirm the allowlist by field cross-reference, not by observing live prop rows (see §3).
