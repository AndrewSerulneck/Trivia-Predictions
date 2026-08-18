# Prop Bingo — Season Gating, NFL Activation, Real Prop Squares, Win-Rate Calibration

**Status: every phase in this plan is complete.** Phases 0, 1, 2, 3 (including Optional 3b), 4, 5
and 6 complete (2026-08-16), **Phase 7 complete (2026-08-17)**, **Phase 8 complete end-to-end (8a,
8b and 8c, 2026-08-17)**, and **Phase 9 complete end-to-end (9a, 9b, 9c and 9d, 2026-08-17)** — see
`docs/prop-bingo-nfl-phase0-findings.md` and the per-phase handoff notes at the bottom of this file.
NFL is still dark (`NEXT_PUBLIC_BINGO_NFL_ENABLED=false`) — **Phase 6 deliberately did not flip
it**; see its handoff notes for why and what's left before someone does. NFL boards now backtest at
a **0.2561 realized win rate over the full 2025 regular season** (1,140 boards, 272 games — a far
larger sample than the 27% figure this plan used to quote) and MLB simulates at **0.2648 with 100%
of boards in band** — re-measured after 9d put real book-posted props back on MLB boards — so every
league is inside 20–30%.

**Phase 9d complete (2026-08-17)** — see `docs/prop-bingo-nfl-phase9d-findings.md` and the 9d
as-built notes at the bottom of this file. Its stated prerequisite, Phase 7's note 4, turned out to
be **four stacked bugs rather than a dead endpoint**: `/mlb/v1/player_props` 404s because the real
route is `/mlb/v1/odds/player_props`, which takes a scalar `game_id` and returns an NFL-shaped
payload the old parser could not read, on rows that carry no player object. A live game serves
718–1,621 prop rows across six sportsbooks. MLB props are now fetched, **de-vigged** (retiring the
raw-implied-odds bug from Phase 2's note 2) and star-tilted by a self-updating
`lib/sportsBingoMlbStars.ts`, and `MLB_STAR_BRANDED_PLAYER_KEYS`'s flat 1.45× boost is retired.
**The one design question Phase 9c left open is answered, once, for both sports: a feed failure
degrades to no tilt; the committed snapshot is a human-readable diff artifact, never a runtime
fallback.**

**Phase 9a complete (2026-08-17)** — the
star signal (`lib/sportsBingoNflStars.ts`), signal-only. **Phase 9b complete (2026-08-17)** — NFL's
eight prop slots are now a tier-weighted **draw** against a hard ≤5-star / ≥2-non-star reservation,
so boards do change: a live NFL board comes out at roughly 4–5 star-tier props, 2–4 known and 0–1
deep. Selection only — not one price moved. **Phase 9c complete (2026-08-17)** — the season
usage/production half of the signal is now live: `resolveNFLStarIndex` (`lib/sportsBingoNflStars.ts`)
replaces the `null` Phase 9b left in `buildNFLPlayerPropCandidates`'s third argument with a real,
24h-cached `/nfl/v1/season_stats` pull, confirmed against the live feed (602 real players scored for
the 2025 season on the first live run). The generated snapshot
(`data/sports-bingo/nfl-star-index.json`, via `npm run bingo:stars:nfl`), its diff report, and the
staleness tripwire (`tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`) are all in place. See
the Phase 9c as-built notes at the bottom of this file for the one open design question it
surfaced (whether the snapshot should ever be read as a runtime fallback) and what 9d needs to know.
Phase 6's open items (the live board-render screenshot and the `NEXT_PUBLIC_BINGO_NFL_ENABLED` flip)
are still the gate on anything reaching a venue.

**Phase 8a complete (2026-08-17)** — the five unknowns are answered (four measured with high
confidence; the fifth, mid-game `team_stats` population, is structurally unanswerable until a real
NFL game is being played, earliest 2026-09-10) and every Tier 1/2/3 candidate square has a measured
base rate off the full 2025 regular season. See the Phase 8a as-built notes at the bottom of this
file and `docs/prop-bingo-nfl-phase8a-findings.md` for the full detail, including one significant
by-product finding (BDL has zero `team_stats`/`stats` rows for any 2025 postseason game — a
pre-existing gap, not something Phase 8 caused).

**Phase 8b complete (2026-08-17)** — **44 flavor squares shipped as 20 parameterised resolver
kinds**, every threshold read off a measured curve rather than guessed. **Tier 4 is dropped**: its
own ship gate (a ≥98% reconciliation of reconstructed drives against `team_stats.total_drives`)
came back at **32.0% over all 272 games**, so the plan's own instruction applies. Square 45 (the
win-probability comeback square) is deferred behind 8a's still-open live check. See the Phase 8b
as-built notes at the bottom of this file and `docs/prop-bingo-nfl-phase8b-findings.md`.

**Phase 8c complete (2026-08-17)** — the win rate is re-earned at **0.2561 over the full season**,
and it was in band (0.2430) before anything was tuned. The phase's real finding came from an
instrument the plan did not ask for: a **per-family assigned-vs-realized calibration replay**
(`npm run bingo:calibrate:nfl`), which showed the board could sit inside the band while **eight
square families were individually mispriced by more than 0.05** — every one of them a Phase 2 or
Phase 3 square, and not one of them a Phase 8b square. Six constants in `lib/sportsBingoOdds.ts` are
now measured rather than modelled; mispriced families went **8 → 2** and mean |gap| **0.0347 →
0.0193**. No resolver, grader or board-mix change. See the Phase 8c as-built notes at the bottom of
this file and `docs/prop-bingo-nfl-phase8c-findings.md`.
**Created:** 2026-08-16.

**Decision taken on the Phase 0 blocker (2026-08-16, Andrew):** BDL has zero preseason NFL game
data (not thin — zero). Andrew chose **"regular season + postseason only"** — NFL season status
now has no preseason branch anywhere, and this plan's Phase 3 "preseason behavior" section
(book-posted-only props, the empty-slate copy) is **struck, not implemented**. The
second option (pulling a separate vendor for preseason) was declined as out of scope.
**Scope:** four asks — (1) out-of-season leagues must be designated as such, (2) activate NFL for
preseason *and* regular season, (3) populate NFL boards with a real, interesting, auto-gradable
prop mix from balldontlie, (4) land boards at a 20–30% win rate.

---

## 0. What exists today (verified against the code, not assumed)

| Area | Today |
| --- | --- |
| League picker | `components/bingo/SportsBingoSelectSport.tsx` — a **hardcoded** four-entry array. NBA/WNBA/MLB `enabled: true`, NFL `enabled: false, note: "Coming soon"`. Nothing is season-aware, so out-of-season NBA is fully clickable and lands on an empty game list. |
| Game catalog | `loadGameCatalog()` in `lib/sportsBingo.ts:2560` — balldontlie `/{sport}/v1/games` by date. NFL already maps to `/nfl/v1/games`; it is **not** the blocker. |
| Core square probabilities | `buildGameAndCandidatesFromBallDontLie()` (`lib/sportsBingo.ts:2363`) invents them: `homeWinProb = 0.55`, `averageHomeSpread = -3.5`, `averageTotal = 45` for NFL. **No odds feed is consulted anywhere in Prop Bingo.** The Odds API is wired only into Predictions (`lib/polymarket.ts`); the bingo tests still reference `ODDS_API_KEY` as dead history. |
| Player props | NBA/WNBA via BDL stats + achievements; MLB via `/mlb/v1/player_props` + historical stat trends. **NFL: none.** |
| Board mix | `pickCandidateSet()` (`:4162`) plans 2 moneyline / 4 spread / 3 total / 3 team-total, plus basketball- and MLB-specific achievement blocks. For NFL those blocks are `0`, so a board would be 12 planned squares and 12 filler spreads/totals — technically it renders, and it is boring. |
| Win-rate targeting | `generateBoardForGame()` (`:4682`) samples up to 180 candidate sets and keeps the one closest to `BINGO_BOARD_TARGET_WIN_RATE` (**default 0.42**), measured by `estimateBoardWinProbabilityWithTrials()` (`:3879`). |
| **The estimator's flaw** | That Monte Carlo flips each of the 24 squares **independently** (`:3904`). Real squares are heavily correlated — "Home ML", "Home team total over", "Game total over" all resolve off one game state. A 5-square line is a conjunction, and conjunctions of positively-correlated events are far likelier than the independent product. Today's 42% "target" is therefore a number about a model, not about reality. |
| Settlement | `refreshSportsBingoProgress()` (`:6537`), cron `*/1 * * * *`. Score-based resolvers work for any sport; player-stat resolvers exist only for basketball (`getNBAGamePlayerStatsSnapshot`) and MLB (`getMLBGamePlayerStatsSnapshot`). **No NFL stats path.** |
| Win condition | Any of 12 lines (5 rows, 5 cols, 2 diagonals), free center — `LINE_PATTERNS` (`:611`). |

### balldontlie NFL surface we can actually use (from `BDL-API docs/NFL API .html`)

- `/nfl/v1/games` — `dates[]`, `seasons[]`, `weeks[]`, `postseason`. Response carries `week`, `season`,
  `postseason`, `status`, and **per-quarter scores** (`home_team_q1..q4`, `_ot`, and the visitor twins).
  There is no `preseason` flag — preseason detection has to be derived (Phase 0).
- `/nfl/v1/odds` — `season`+`week` **or** `game_ids[]`. One row per game per sportsbook with
  `spread_home_value`, `moneyline_home_odds`, `moneyline_away_odds`, `total_value` and the vig-side odds.
  **Already proven in production** by NFL Pick 'Em (`lib/nflPickEm.ts:975`), including its
  vendor-priority and page-cap handling — reuse that shape rather than reinventing it.
- `/nfl/v1/odds/player_props` — `game_id` (required), `player_id`, `prop_type`, `vendors[]`. Returns
  `{player_id, vendor, prop_type, line_value, market: {type: "over_under"|"milestone", over_odds/under_odds|odds}}`.
  ~35 prop types including `anytime_td`, `first_td`, `passing_yards(_1h/_1q..)`, `rushing_yards`,
  `receptions`, `longest_rush`, `fg_made`, `kicking_points`, `interceptions`.
  **Live only — balldontlie stores no history**, and books pull props as a game nears its end.
- `/nfl/v1/stats` — `game_ids[]`, `player_ids[]`. Per-player box score: passing completions/attempts/
  yards/TDs/interceptions, rushing attempts/yards/TDs/`long_rushing`, receptions/receiving yards/TDs/
  `long_reception`/targets, fumbles, tackles, sacks. This is the grading substrate.
- `/nfl/v1/players`, `/nfl/v1/player_injuries`, `/nfl/v1/plays` (play-by-play), `/nfl/v1/team_stats`.
- Props return `player_id` only — names need a `/nfl/v1/players` join, cached per team.
- Tiering is per sport: stats/injuries/standings are ALL-STAR, advanced stats are GOAT. Our NFL tier
  and whether props are gated is **unconfirmed** — Phase 0 answers it before anything is built on it.

### Decisions taken (2026-08-16)

1. **Win-rate target applies to all leagues** — retune the single global knob to ~0.25; NBA/WNBA/MLB get
   harder too. Existing active cards keep the boards they already have.
2. **Season status = live feed with a calendar fallback** — ask BDL whether a league has games in a
   lookahead window; fall back to a hardcoded season-window table when the feed is empty or erroring, so
   one bad API minute never blanks a live league.
3. **Out-of-season leagues stay visible**, greyed out and unclickable, badged with a return month.
4. **Preseason uses book-posted props only** — a player prop appears on a preseason board only if a
   sportsbook actually posted that player's line for that game. We never synthesize a prop for a player
   who may not take a snap.

---

## Phase 0 — Probe the NFL feeds and baseline the current boards

**Nothing downstream is safe to design against until the feed is observed.** Preseason coverage in
particular is an empirical question: whether BDL even lists preseason games, how it labels their `week`,
and whether books post props for them.

- Add `scripts/probe-nfl-bingo.cjs` following the existing convention
  (`node --env-file=.env.local scripts/probe-*.cjs`, as `apisports:probe:nba` does — `.env.local` is
  passed to node, never read by us). It reports, for the next 10 days of `/nfl/v1/games`:
  - which games come back, and their `week` / `season` / `postseason` / `status` values → **the preseason
    detection rule**;
  - `/nfl/v1/odds?game_ids[]=…` — vendor count, and whether preseason games have lines at all;
  - `/nfl/v1/odds/player_props?game_id=…` — prop count, distinct `prop_type`s, distinct players, vendors,
    and the preseason-vs-regular delta;
  - `/nfl/v1/stats?game_ids[]=…` on a *completed* 2025 game — which fields are populated (specifically
    whether kicking exists, since `fg_made`/`kicking_points` props are otherwise ungradable);
  - HTTP status per endpoint → **our tier**.
- Baseline the existing problem: generate N boards for real NBA/MLB games and record the estimator's
  win probability, so Phase 5 has a before/after.
- Cross-check the preseason rule against `lib/nflWeekUtils.ts` and `nfl_pickem_weeks.week_type`, which
  already model preseason for Pick 'Em (`docs/NFL_PICKEM_PRESEASON_ADDENDUM.md`).
- **Output:** `docs/prop-bingo-nfl-phase0-findings.md` — the prop-type allowlist, the preseason rule, the
  tier verdict, and a go/no-go on any prop family the box score can't grade.

**Model: Sonnet 5 · effort: medium.** Mechanical probing and tabulation. Escalate to Opus only if the
tier or preseason results contradict this plan's assumptions.

---

## Phase 1 — Season status (ask #1)

- New `lib/leagueSeasonStatus.ts`:
  - `LEAGUE_SEASON_WINDOWS` — per `sportKey`, the calendar window and a human return label
    (`"Returns October 2026"`). Hand-maintained, small, and only ever a *fallback*.
  - `resolveLeagueSeasonStatus(sportKey)` — in-season if the live catalog has any game inside a
    ~14-day lookahead; otherwise consult the calendar; on a feed error, **trust the calendar** rather
    than declaring the league dead. Server-cached (reuse the `GAME_CATALOG_CACHE_MS` pattern).
  - ~~NFL preseason counts as in-season.~~ **Struck per the 2026-08-16 decision above** — BDL has
    no preseason games, so NFL's calendar window models regular season + postseason only
    (roughly September through mid-February). See **Phase 1 handoff notes** at the bottom of this
    file for the as-built details.
- New `GET /api/bingo/leagues` → `[{key, label, icon, status, resumesLabel}]`.
- `SportsBingoSelectSport.tsx` becomes data-driven: fetch on mount, render a skeleton, disable
  out-of-season rows with an `Out of season · Returns Oct 2026` badge. Keep today's static list as the
  render fallback if the call fails, with every league enabled (fail open — today's behavior).
- Server-side guard so a deep link can't bypass the UI: `/api/bingo/games` and the board-generation
  routes reject an out-of-season `sportKey` with a clean message.
- Tests: `tests/lib.league-season-status.test.ts` (calendar fallback, feed-error path, NFL preseason
  in-season) and `tests/api.bingo.leagues.test.ts`.
- Flag: `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED`, off = today's always-clickable list, per the
  reversible-flag convention in `CLAUDE.md`.

**Model: Sonnet 5 · effort: medium.** Self-contained, well-specified, one new lib + one route + one
component rewrite.

---

## Phase 2 — NFL core squares off real market numbers (ask #2, part 1)

> **Complete (2026-08-16)** — see the Phase 2 as-built notes at the bottom of this file for what
> actually shipped and where it deviates from the sketch below.

The blocker for NFL is not the catalog, it's that every core probability is fiction. Fixing that for NFL
is also what makes ask #4 achievable.

- New `lib/sportsBingoOdds.ts`: fetch `/nfl/v1/odds` by `game_ids[]` for the slate (one call per slate,
  not per game), take a **vendor consensus** (median line, de-vigged two-way moneyline via the existing
  `impliedProbabilityFromAmericanOdds` at `:3101`), and return `{homeWinProb, spread, total}` per game.
  Lift the vendor-priority + page-cap handling from `lib/nflPickEm.ts` rather than duplicating its bugs.
- Rework the NFL branch of `buildGameAndCandidatesFromBallDontLie` to derive moneyline / spread /
  team-total / game-total probabilities from that consensus using a normal approximation of NFL scoring
  (margin σ ≈ 13.5, team total σ ≈ 10), instead of `0.55` and `45`.
- `loadGameCatalog` becomes slate-aware: one odds fetch per sport per refresh, joined onto the games.
  If odds are missing for a game (common in preseason), fall back to today's league-average path and
  mark those candidates `possible` rather than `supported`.
- Flip NFL to enabled in the picker — but gated by Phase 1's status resolver plus
  `NEXT_PUBLIC_BINGO_NFL_ENABLED`, so the switch is one env flip and one revert.
- Tests: consensus math, de-vigging, missing-odds fallback, preseason game with no book.

**Model: Opus 5 · effort: high.** Probability modeling plus surgery inside a 7,186-line file whose
candidate builder is shared by four leagues — regressions here hit live NBA/MLB boards.

---

## Phase 3 — The NFL prop mix (ask #3)

> **Complete, including Optional 3b (2026-08-16)** — see the Phase 3 as-built notes at the bottom
> of this file for what shipped, where it deviates from the sketch below, and why.

The goal is a board that reads like a sports bar argument, not a spreadsheet: some stars, some team
stuff, some "wait, that could actually happen" squares. Every square below is gradable from
`/nfl/v1/stats` or the game object — nothing depends on a human or a scraped page.

**Player props (book-posted, ~8 squares/board)** — `buildNFLPlayerPropCandidates(game)`, mirroring
`buildMLBPlayerPropCandidates`: pull `/nfl/v1/odds/player_props?game_id=`, resolve `player_id` → name
and team via a cached `/nfl/v1/players` join, take vendor consensus, de-vig `over_odds`/`under_odds`
into a true probability, and keep only prop types on the Phase-0-confirmed allowlist:

| Prop | Graded from |
| --- | --- |
| `passing_yards`, `passing_tds`, `passing_attempts`, `passing_completions`, `interceptions` | `passing_*` fields |
| `rushing_yards`, `rushing_attempts` | `rushing_*` |
| `receptions`, `receiving_yards` | `receptions`, `receiving_yards` |
| `rushing_receiving_yards` | sum of the two |
| `anytime_td` (milestone) | `rushing_touchdowns + receiving_touchdowns ≥ 1` |
| `longest_rush`, `longest_reception` | `long_rushing`, `long_reception` |
| `fg_made`, `kicking_points`, `first_td`, `longest_pass` | **only if Phase 0 finds the fields** — otherwise dropped, not guessed |

**Team & game squares (~5, no odds or props needed — pure game-object arithmetic, so they always exist
and they carry preseason boards):**

- Team scores in every quarter · team held scoreless in a quarter
- Either team scores 14+ in a single quarter · any quarter ends 0–0
- Team leads at halftime · team that scores first wins · lead changes after halftime
- Game goes to overtime · both teams score 20+ · winning margin ≤ 3 / ≥ 17
- Second half outscores the first half

**Structure work:** new resolver kinds (`nfl_player_prop`, `nfl_player_anytime_td`,
`nfl_quarter_*`, `nfl_margin_*`) added to `SportsBingoResolver`, its `parseResolver`, the
`SportsBingoSquareTemplatePreview.resolverKind` union, `buildSquareLabel`, and the axis/market-key
helpers so diversity caps apply. Add an NFL branch to `pickCandidateSet`'s `planByBucket`
(2 moneyline / 3 spread / 3 total / 3 team-total / 5 special / 8 player-prop) with a family cap so one
quarterback can't own six squares.

~~**Preseason behavior (decision 4):** props are included only when the book posted them, so a
starters-play-one-drive game naturally yields fewer player squares and more team/game squares. If a
preseason game still can't reach 24 candidates, today's `< 24 → null` guard already hides it — but the
game list needs a real empty state ("No NFL boards available for tonight's slate") instead of a blank
list.~~ **Struck per the 2026-08-16 decision — see the top of this file and the Phase 1 handoff
notes.** BDL carries no preseason games at all, so there is no preseason slate to degrade
gracefully; NFL simply reports out-of-season until Week 1. The `< 24 → null` empty-state guard is
still worth keeping for a thin *regular-season* slate, just not framed around preseason.

**Optional 3b — play-by-play squares.** `/nfl/v1/plays` would unlock first-score-is-a-field-goal,
a defensive or special-teams TD, a successful 4th-down conversion, a 50+ yard TD. These are the most
*fun* squares on the list. Gated on Phase 0 confirming GOAT-tier access; skip cleanly if not.

**Model: Opus 5 · effort: high.** Large surface (new resolver family threaded through ~8 call sites),
and the taste calls about what makes a board fun are the whole point.

---

## Phase 4 — NFL grading and settlement (ask #2, part 2)

> **Complete (2026-08-16)** — see the Phase 4 as-built notes at the bottom of this file for what
> shipped, the two pre-existing bugs it had to fix to work at all, and the live-feed validation.

- `getNFLGamePlayerStatsSnapshot(cardRow)` from `/nfl/v1/stats?game_ids[]=`, cached like its NBA/MLB
  siblings; `toNFLLiveScoreSnapshot` for quarter-by-quarter progress off `/nfl/v1/games`.
- Branch `refreshSportsBingoProgress` on `americanfootball_nfl` and implement each new resolver.
  Settlement rules that need to be right, not merely present:
  - an **over/at-least** square hits the moment the box score clears it, mid-game;
  - an **under/at-most** square only settles at `Final`;
  - a player who never appears in the box score (inactive, or a preseason DNP) **voids** the square —
    reuse the existing `void` + `replacement_auto` machinery rather than silently marking it a miss.
- Existing 1-minute cron (`vercel.json` → `/api/cron/bingo-progress`) already covers NFL cadence; no
  schedule change, but watch the added per-card `/nfl/v1/stats` call against BDL rate limits (one call
  per game, memoized across cards for the same game, exactly as the MLB path does).
- Tests: one per resolver family, including mid-game early-hit, at-most-holds-until-final, DNP-voids,
  and a full-board settlement against a real archived 2025 box score.

**Model: Opus 5 · effort: high.** Grading bugs are the ones players notice and don't forgive.

---

## Phase 5 — Land the win rate at 20–30% (ask #4)

> **Complete (2026-08-16)** — see the Phase 5 as-built notes at the bottom of this file for what
> shipped, the two deviations from the sketch below, and the one league that still misses the band.

Two separate problems. Only fixing the first is the trap.

**5a. The target.** Set `BINGO_BOARD_TARGET_WIN_RATE` to `0.25` (band 0.20–0.30 via
`BINGO_BOARD_TARGET_TOLERANCE = 0.05`), applied to all leagues per decision 1. One-line change.

**5b. The estimator, which is what actually decides realized win rate.** Replace the independent
coin-flip Monte Carlo with a **correlated, game-state simulation**:

1. Draw one game outcome per trial — home margin and total from a bivariate normal calibrated to the
   market spread and total from Phase 2.
2. Derive each team's score, and therefore every moneyline / spread / team-total / game-total /
   quarter square, from that single draw.
3. Draw player-prop outcomes **conditioned** on their team's simulated scoring (a shared team factor
   plus per-player idiosyncratic noise), so "Mahomes over 2.5 passing TDs" and "Chiefs team total over"
   move together the way they do in reality.
4. Grade all 24 squares against that one simulated world; count a line.

Then extend the existing mutual-exclusion machinery (`resolversAreMutuallyExclusive`,
`arrangeBoardSquaresForFeasibleLines` at `:4640`) with a **correlation cap**: no line may be built from
5 squares that all resolve off the same directional bet, which is precisely how a "25%" board silently
becomes a 45% board.

**5c. Validation, because a simulator agreeing with itself proves nothing.** Add
`scripts/simulate-bingo-boards.cjs` (`npm run bingo:simulate`, following `category-blitz:simulate`):

- *forward mode* — generate N boards for upcoming games and report the predicted win-rate distribution;
- *backtest mode* — generate boards against **completed** games (BDL has 2002–present) and grade them
  with the real Phase 4 resolvers to get a **realized** win rate. This is the only number that answers
  the actual question. Note the one honest limitation: props are live-only, so historical boards
  backtest on team/game squares plus stat-derived proxies for props.
- A test that asserts the realized rate over a fixed seeded slate lands in 20–30%.

**Model: Opus 5 · effort: high→max for 5b (correlated simulation and the correlation cap are the
hardest thinking in this plan). The harness in 5c is Sonnet 5 · medium** once the interfaces exist.

---

## Phase 6 — Verification and rollout

- `npm run test`, `npx tsc --noEmit`, `npm run lint`; new tripwire `npm run test:bingo-nfl` bundling
  the season-status, NFL-candidate, settlement and calibration tests.
- Browser verification with the `verify` skill (seeded auth, real Playwright pass):
  out-of-season NBA is greyed and unclickable → NFL is selectable → a preseason game produces a full
  24-square board → the board renders in landscape (`docs/bingo-fullscreen-pwa-device-checklist.md`).
- Rollout order: Phase 1 flag on (season gating, zero NFL risk) → observe → Phase 2–4 flag on for NFL →
  first live preseason slate audited square-by-square against the box score → Phase 5's target retune
  last, so calibration lands on real settled data rather than on model output.
- Post-slate audit: realized win rate per league vs the 20–30% band; feed it back into 5a's knob.

**Model: Sonnet 5 · effort: medium**, plus the manual device checks only Andrew can close.

---

## Phase 7 — Rebalance the MLB team-event block (the one league Phase 5 missed)

**Independent of Phase 6.** Phase 6 is the NFL rollout; this touches only MLB and no flag. Do them
in either order.

**The goal:** get MLB boards into the same 20–30% band every other league now lands in, *without*
throwing away the squares that make an MLB board fun to sit under.

### What the block is today

Fourteen candidates — seven events × two teams — built in `buildMLBPlayerPropCandidatesFromRecentStats`
(`lib/sportsBingo.ts:4650-4715`). Every one is a **hardcoded threshold with a hardcoded
probability**, identical for every game, every team, every night:

| Square | Threshold | Assigned probability |
| --- | --- | --- |
| `quick_out_under_3_pitches` | ≥ 1 | 0.58 |
| `groundout` | ≥ 4 | 0.74 |
| `flyout` | ≥ 4 | 0.74 |
| `strikeout` | ≥ 5 | 0.67 |
| `hit` | ≥ 5 | 0.78 |
| `walk` | ≥ 2 | 0.62 |
| `hit_by_pitch` | ≥ 1 | 0.38 |

Measured on a real board (Orioles/Rays, 2026-08-16): **6.3 of a board's 24 squares come from this
block, at a mean probability of 0.613.** With `/mlb/v1/player_props` currently returning 404, it is
the *entire* achievement bucket, and the catch-all fill reaches for it too because
`isMlbFallbackEventSquare` (`:4741`) returns true for every `mlb_webhook_team_event_at_least`.

### The actual diagnosis — they are mis-specified, not mis-selected

"Re-weight the block" is the right instinct but the wrong lever. These squares are not being *picked*
badly; they are *written* badly. A team makes roughly 27 outs and takes about 8 hits a game, so
"4+ groundouts" and "5+ hits" are close to automatic — and the assigned 0.74/0.78 probably still
flatter them. Phase 5's difficulty bias already asks this block for its hardest members and gets
0.58, because 0.58 is as hard as the block goes.

Two consequences, and the second is worse than the first:

1. A quarter of every MLB board is priced near a free square, which is why no 25% board can be built
   from it.
2. **The probabilities are fiction and always were.** They are seven constants that do not move with
   the pitchers, the lineups, the park, or the total. This is the same defect Phase 2 fixed for NFL
   by going to a real market, and it means the board's stated win rate is not a claim about this
   game — it's a claim about an average game that isn't being played.

### The work

**7a. Measure the real base rates first. Do not re-derive them from a hunch.** The current seven
numbers have never been checked against anything, and replacing unvalidated constants with different
unvalidated constants is not progress.

- Six of the seven events are ordinary box-score quantities and can be measured from
  `/mlb/v1/stats` over a few hundred completed games: hits, walks, hit-by-pitch, strikeouts,
  groundouts, flyouts, per team per game. Build `scripts/measure-mlb-event-rates.cjs` in the shape of
  `scripts/validate-nfl-bingo-grading.cjs` (`--conditions react-server --import tsx`, JSON to stdout,
  archived under `docs/phase0-artifacts/`).
- **`quick_out_under_3_pitches` is the exception and it is a real blocker for that one square.** It
  is not a balldontlie field — it is derived from our own MLB webhook stream, so its distribution can
  only be measured from settlement history (`sports_bingo_squares` rows whose resolver carries that
  event) or by instrumenting the webhook. Check whether enough MLB squares have settled to give a
  usable sample. **If they haven't, leave that square exactly as it is and say so** rather than
  guessing a new threshold for it — it is one square of fourteen.
- Report the full distribution per event, not just the mean, since the whole point is choosing a
  threshold at a given percentile.

**7b. Re-threshold each square into a live band.** Target **0.35–0.55, centred near 0.45**, chosen
so the block sits just below the core markets (which average ~0.50) instead of well above them.
Arithmetic behind that band: moving 6.3 squares from 0.613 to ~0.45 drops a board's mean square
probability from 0.524 to ~0.481, which is where NFL and WNBA boards sit when they land in the
20–30% band. Don't push to 0.30 — see the tension below.

- **Scale the threshold with the game, not just the league.** `impliedHomeTotal` / `impliedAwayTotal`
  are already in scope in the candidate builder. A team implied for 3 runs should not get the same
  hit threshold as one implied for 6. This is the part that turns seven constants into an actual
  per-game price, and it matters more than the exact band.
- Emit **two or three rungs per event** (as the spread/total ladders already do) rather than one, so
  Phase 5's `orderByDifficulty` has something to choose between. Rungs outside the band are fine —
  `preferLiveRungs` already sinks dead weight to the back of the pool.

**7c. Verify with the Phase 5 harness.** `npm run bingo:simulate -- --sports baseball_mlb --boards 5`
should report a mean inside 20–30% and an `inTargetBand` share comparable to WNBA's (1.00) and NFL's
(0.99). It is at **0.328 / 0.32** today. Archive the before/after under `docs/phase0-artifacts/`.

### What must not break

- **Grading needs no change at all, and that is the nice part.** `evaluateResolver`'s
  `mlb_webhook_team_event_at_least` case (`:7403`) is a bare `currentCount >= threshold`, and
  `buildSquareLabel` (`:1700`) renders the threshold, so a new number settles and reads correctly
  with zero further work.
- **Active cards are safe without a migration.** `resolverKey` embeds the threshold
  (`:1495`), so re-thresholded squares get new keys and cannot collide with squares already
  snapshotted onto issued cards. Existing cards keep the board they were dealt, exactly as decision 1
  intends.
- **`mlbResolverFamilyKey`'s 2-per-family cap stays.** It is what stops one event owning six squares,
  and with multiple rungs per event it becomes *more* load-bearing, not less. Note it collapses
  `strikeout` across team and player events into one family on purpose.
- **Don't touch the named-player weighting in the same change.** `pickCandidateSet`'s MLB block
  weights toward likelier, star-branded *player* events; Phase 5 already flips it under difficulty
  pressure. It is a separate block from this one, and changing both at once makes the measurement
  uninterpretable.
- **Don't chase the number with `BINGO_BOARD_TARGET_WIN_RATE`.** It is global; moving it to fix MLB
  breaks the three leagues that are already correct.

### The product tension, which is Andrew's call and not the implementer's

Harder squares light up later. A "5+ hits" square is boring precisely *because* it hits in the
fourth inning and makes the card feel alive; a 40% square leaves a board mostly empty for an hour.
Rebalancing this block trades early card movement for a real 25% win rate, and there is no setting
that gives both.

If that trade feels wrong once it's on a screen, the alternative is to keep the block easy and accept
MLB running at a higher win rate than the other leagues — which is a legitimate answer, just a
different one from what decision 1 currently says. **Get a read on this before doing 7b**, because it
decides whether the target band is 0.45 or something gentler.

### Tests

- `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`: every emitted team-event candidate lands in
  the intended band; thresholds move with the implied team total (a 3-run team and a 6-run team get
  different numbers); the 2-per-family cap still holds over a dozen generated boards; labels render
  the new thresholds.
- Extend `tests/lib.sportsBingo.win-rate-calibration.test.ts` with an MLB slate mirroring the NFL
  one — a frozen fixture of completed MLB games under `tests/fixtures/`, boards settled by the real
  graders. That test is where "MLB is in band" becomes a tripwire instead of a one-off measurement.
- Keep the NFL and WNBA assertions green; this phase must not move them.

**Model: Opus 5 · effort: high.** The mechanical part (new thresholds) is small; the judgement calls
— what an honest base rate is when one event can only be measured from our own settlement history,
and how hard a "fun" square is allowed to be — are the phase.

---

## Phase 8 — The flavor-square slate (adopted from "Suggested extras")

**The ask:** as many additional flavor squares as is practical, with one hard constraint — *every
square must settle automatically and reliably off a feed we already pay for.* Nothing that needs a
human, a scraped page, a second vendor, or a judgement call. That constraint is what this phase is
mostly about; the list of fun ideas is the easy part.

**Why this is worth a phase.** A board today is 10 core-market squares, 5 team/game squares and 8
book props. Twenty-three of the 24 are, in the end, restatements of the spread and the total — which
is exactly why Phase 5 had to invent a correlation cap to stop five of them landing on one line. The
squares people actually shout at a TV about (*"they got flagged again"*, *"that's four straight
punts"*, *"he's got the ball on the 1"*) are absent, and the reason they're absent is that nobody
looked past `/games`, `/odds` and `/stats`.

### The finding that makes this phase big: `/nfl/v1/team_stats` is unused

Prop Bingo has never called it. It is **per game, per team**, accepts `game_ids[]` (so one call per
*slate*, not per game), sits on the same GOAT tier Phase 0 confirmed, and carries every field below
— read off the live docs sample in `BDL-API docs/NFL API .html`, not assumed:

```
first_downs, first_downs_passing/rushing/penalty, third_down_conversions/attempts,
fourth_down_conversions/attempts, total_offensive_plays, total_yards, yards_per_play,
total_drives, net_passing_yards, passing_completions/attempts, yards_per_pass, sacks,
sack_yards_lost, rushing_yards/attempts, yards_per_rush_attempt, red_zone_scores,
red_zone_attempts, penalties, penalty_yards, turnovers, fumbles_lost, interceptions_thrown,
defensive_touchdowns, possession_time_seconds
```

Second finding, smaller but free: **the play rows carry four fields the Phase 4 walk never reads** —
`period`, `clock_display`, `start_yards_to_endzone` and `home_win_probability`. Clock-and-score
arithmetic over the walk we already do unlocks comebacks, lead changes and last-minute scores with
**no new request and no drive-segmentation risk**.

### 8a — Probe and measure before designing a single square

> **Complete (2026-08-17)** — see the Phase 8a as-built notes at the bottom of this file and
> `docs/prop-bingo-nfl-phase8a-findings.md` for what was actually found, including one unknown
> (mid-game `team_stats` population) that could not be answered from archived data and is now a
> named handoff item for 8b.

Non-negotiable, and the plan has receipts for why: Phase 3 hand-priced five play-derived squares and
Phase 4's 43-game replay found **two of them off by ~0.10** (`nfl_non_offensive_touchdown` priced
60% too high). Hand-guessed base rates in this codebase have a measured failure rate of 40%.

**Five unknowns, each of which changes the slate. Answer them first.**

1. **Is `team_stats` populated mid-game, or only at Final?** This is the single most important
   question in the phase. If it only publishes at Final, every Tier-1 square below settles in one
   lump at the whistle and a board full of them is dead for three hours — the exact product tension
   Phase 7 hit from the other direction. Check by hitting a game in progress. **If it is Final-only,
   cap Tier 1 at ~3 squares per board and lead the mix with Tier 2/3 instead.**
2. **What is `sacks` oriented to — sacks taken by this team's offense, or sacks made by its
   defense?** The docs' sample is a coincidental 2/2 tie and settles nothing. Find a game with an
   asymmetric sack count and confirm against a known box score. **Do not ship a sack square until
   this is answered** — a backwards square is worse than a missing one.
3. **Does `red_zone_scores` count red-zone touchdowns or all red-zone points?** The docs' sample
   strongly implies touchdowns (Miami: `red_zone_scores: 0, red_zone_attempts: 3`, yet scored 6
   points), which would make "settled for a field goal in the red zone" gradable as
   `attempts > scores`. Confirm on three games.
4. **Does `/nfl/v1/stats` return defensive player rows at all?** Phase 0 sampled 60 rows for one
   game and probed only offensive/kicking fields; 60 rows is about right for offense + specialists
   alone, so `total_tackles` / `defensive_sacks` / `defensive_interceptions` may simply never be
   populated. Every Tier-2 defensive square below is contingent on this.
5. **Is `home_win_probability` populated live, and by whom?** It drives the best square on the list
   (the comeback square) and is the only field here that is a vendor *model* rather than a fact.

**Then measure every candidate's real base rate.** Extend `scripts/validate-nfl-bingo-grading.cjs`
(`npm run bingo:validate:nfl`) — it already replays archived games through the *shipped* graders,
which is the right pattern — to emit a realized rate per proposed square over **a full season, not
43 games**. Phase 4's own note 2 says 43 is thin. Archive to `docs/phase0-artifacts/`.

**Model: Sonnet 5 · effort: medium.** Mechanical probing and tabulation, same shape as Phase 0.
Escalate to Opus only if answer 1 comes back "Final-only", which is a design decision, not a
measurement.

### The slate

Four tiers, ordered by grading reliability. **Feel** is design intent, not a claim about frequency —
every threshold and every probability comes from 8a's measurement, never from this table.

**Tier 1 — `/nfl/v1/team_stats` (one new call per slate; joined onto the snapshot at settlement).**
Pure box-score arithmetic on a single published number: the most reliable squares on this page.

| # | Square | Graded from | Feel |
| --- | --- | --- | --- |
| 1 | \<Team> commits N+ penalties | `penalties` | coin-flip |
| 2 | \<Team> penalized 75+ yards | `penalty_yards` | coin-flip |
| 3 | Combined penalty yards over N | both `penalty_yards` | coin-flip |
| 4 | \<Team> turns it over 2+ times | `turnovers` | coin-flip |
| 5 | **Neither team turns it over** | both `turnovers === 0` | long shot |
| 6 | 3+ combined turnovers | both `turnovers` | coin-flip |
| 7 | \<Team> converts N+ third downs | `third_down_conversions` | coin-flip |
| 8 | \<Team> goes for it on 4th down and converts | `fourth_down_conversions ≥ 1` | lean-lock |
| 9 | **\<Team> is perfect in the red zone** (3+ trips, all TDs) | `red_zone_scores === red_zone_attempts && attempts ≥ 3` | long shot |
| 10 | \<Team> settles for a field goal in the red zone | `red_zone_attempts > red_zone_scores` | lean-lock |
| 11 | \<Team> wins time of possession by 5+ minutes | `possession_time_seconds` diff ≥ 300 | coin-flip |
| 12 | \<Team> holds the ball 35+ minutes | `possession_time_seconds ≥ 2100` | coin-flip |
| 13 | \<Team> gains 400+ total yards | `total_yards` | coin-flip |
| 14 | \<Team> held under 250 total yards | `total_yards` | coin-flip |
| 15 | \<Team> averages 6.0+ yards per play | `yards_per_play` | coin-flip |
| 16 | \<Team> picks up 25+ first downs | `first_downs` | coin-flip |
| 17 | \<Team> rushes for 150+ / passes for 300+ | `rushing_yards` / `net_passing_yards` | coin-flip |
| 18 | \<Team> scores a **defensive** touchdown | `defensive_touchdowns ≥ 1` | long shot |
| 19 | \<Team> runs 70+ offensive plays | `total_offensive_plays` | coin-flip |
| 20 | \<Team> sacked 4+ times | `sacks` | **blocked on 8a#2** |

**Tier 2 — `/nfl/v1/stats` player box score (zero new calls — already fetched every tick).** These
are *game-level* "any player" squares, which the books do not post, so none of them can collide with
a prop axis. That is exactly what makes them additive rather than a second copy of the prop block.

| # | Square | Graded from | Feel |
| --- | --- | --- | --- |
| 21 | A 100-yard rusher | max `rushing_yards ≥ 100` | coin-flip |
| 22 | A 100-yard receiver | max `receiving_yards ≥ 100` | lean-lock |
| 23 | A 300-yard passer | max `passing_yards ≥ 300` | coin-flip |
| 24 | Both quarterbacks throw for 250+ | per-team max `passing_yards` | coin-flip |
| 25 | A receiver catches 10+ passes | max `receptions ≥ 10` | long shot |
| 26 | **A player scores 2+ touchdowns** | `nflPlayerTouchdowns ≥ 2` (already written) | coin-flip |
| 27 | **A made field goal of 50+ yards** | `long_field_goal_made ≥ 50` (populated 2/60 = kickers) | coin-flip |
| 28 | A kicker makes 3+ field goals | `field_goals_made ≥ 3` | coin-flip |
| 29 | **A missed field goal or extra point** | `field_goal_attempts > field_goals_made`, `extra_points_made` vs TDs | coin-flip |
| 30 | A punt downed inside the 20 | `punts_inside_20 ≥ 1` | lean-lock |
| 31 | **A non-quarterback throws a pass** | `passing_attempts ≥ 1` on a row whose `position_abbreviation` ≠ QB | long shot |
| 32 | A defender records 2+ sacks | `defensive_sacks ≥ 2` | **blocked on 8a#4** |
| 33 | A defender records 10+ tackles | `total_tackles ≥ 10` | **blocked on 8a#4** |
| 34 | A defender picks off a pass | `defensive_interceptions ≥ 1` | **blocked on 8a#4** |

Squares 31–34 need the `/nfl/v1/players` position join, which **already exists and is already
memoized** (`resolveNFLPlayerProfiles`, Phase 5) — no new request.

**Tier 3 — clock-and-score arithmetic over the existing plays walk (no new call; needs the four
unread fields).** `buildNFLPlayDerivedFacts` already walks every play in order with a validated
running score; these are extra facts off the same loop.

| # | Square | Derived from | Feel |
| --- | --- | --- | --- |
| 35 | The first score comes inside the opening 5 minutes | first scoring play `period === 1 && clock_display > 10:00` | coin-flip |
| 36 | A score in the **final minute of the first half** | `period === 2 && clock ≤ 1:00` | coin-flip |
| 37 | A score in the **last two minutes** of the fourth | `period === 4 && clock ≤ 2:00` | lean-lock |
| 38 | **Both teams lead at some point** | running score crosses zero in both directions | coin-flip |
| 39 | A lead change in the second half | running score sign flip, `period ≥ 3` | coin-flip |
| 40 | **The winner trailed in the fourth quarter** | running score vs final | long shot |
| 41 | The game is tied at some point after halftime | running score `=== 0`, `period ≥ 3` | coin-flip |
| 42 | A successful two-point conversion | a scoring delta of exactly **8** — arithmetic the walk already computes | long shot |
| 43 | A safety | a scoring delta of exactly **2** *plus* a safety-typed play — see the amendment below | long shot |
| 44 | A touchdown from inside the 2-yard line | `start_yards_to_endzone ≤ 2` on a TD play | coin-flip |
| 45 | **The eventual winner was once under 25% to win** | `home_win_probability` min/max vs the winner | **still blocked — deferred by 8b** |

**Amendment, 2026-08-17 (Phase 3 of `docs/prop-bingo-code-review-fix-plan.md`):** square 43 no
longer settles on the +2 alone. A touchdown row of +6 followed by a separate +2 graded as a safety,
so the +2 is now attributed by play type (`type_slug: "safety"`, or the penalty variant whose
`short_text` reads `"… for a Safety"`), and a +2 nothing types leaves **both** 42 and 43 unknown,
which voids. Typing alone is not enough either: the live feed types nullified safeties `"safety"`
too, so the delta is still required.

**Squares 35–44 shipped in 8b at measured thresholds; 45 did not.** 8a proved the field is retained
in the archive (98.2% of plays) but not that it is written *during* play, and a comeback square that
only resolves after the whistle is the one thing this square exists not to be. It ships when the
Week-1 live check confirms live population — a 15-minute, two-call check, recipe in
`docs/prop-bingo-nfl-phase8a-findings.md` §1.

**Tier 4 — drive-segmented (the user's own example), gated behind a validation pass.**

> **DROPPED (2026-08-17, Phase 8b).** The ship gate below was run over all 272 games of the 2025
> regular season and came back at **32.0% exact reconciliation** against `team_stats.total_drives`
> (87.5% within one drive), against a required 98%. Two candidate rates measured exactly 0.000,
> confirming the reconstruction is wrong rather than imprecise. **Do not re-attempt this against a
> `team`-run reconstruction** — the cause is that BDL publishes no drive id. See
> `docs/prop-bingo-nfl-phase8b-findings.md` §0.

BDL exposes
no drive id, so a "drive" has to be reconstructed as a maximal run of plays sharing the same
possessing `team`. The docs' kickoff sample attributes the play to the **receiving** team, which
suggests `team` is reliably the possessing side — but *suggests* is not the standard the rest of
this plan holds itself to.

| # | Square | Feel |
| --- | --- | --- |
| 46 | **Both teams score on their opening drive** | long shot |
| 47 | \<Team> scores on its opening drive | coin-flip |
| 48 | The game opens with a three-and-out | coin-flip |
| 49 | A touchdown drive of 75+ yards | coin-flip |
| 50 | A drive ends in a turnover inside the red zone | long shot |
| 51 | \<Team> punts on its first two drives | coin-flip |

**Ship gate for Tier 4:** reconstruct drives over ≥200 archived games and reconcile the drive count
against `team_stats.total_drives`, which is an independent published number. **Ship Tier 4 only if
it reconciles on ≥98% of games** — the same bar Phase 4 set for the play walk (43/43) and the same
independent-cross-check discipline. If it doesn't reconcile, ship squares 35–45 and drop Tier 4;
squares 35 and 47 cover most of the same emotional ground with none of the risk.

**Divisional / rivalry flavor is copy, not a resolver.** `game.home_team.division` /
`.conference` are already on every game object, so a divisional detector is free — but every
"divisional games stay close" idea reduces to a margin square wearing a costume, and the margin
squares already exist. Use the flag for **labeling** (a `Division rival` chip on the board header)
and, if 8a's measurement supports it, as a small documented shade on the close-margin base rates.
Do not add a resolver for it.

### 8b — Implementation

> **Complete (2026-08-17)** — 44 squares as 20 kinds. Tier 4 dropped on its own ship gate (32.0%
> reconciliation vs. the required 98%), square 45 deferred behind 8a's live check, square 10 renamed
> and square 29 narrowed to what the box score can actually prove. See the Phase 8b as-built notes
> at the bottom of this file and `docs/prop-bingo-nfl-phase8b-findings.md`.

- **New resolver kinds, one per family** (~20 after the blocked ones are resolved), threaded through
  the **eight** call sites Phase 3 catalogued: the `SportsBingoResolver` union, `resolverKey`,
  `buildSquareLabel`, `parseResolver`, `SportsBingoSquareTemplatePreview.resolverKind`,
  `evaluateResolver`, `isResolverEligibleForVoidRegrade`, and — the one Phase 3 did not have to
  worry about — **`lib/sportsBingoCorrelation.ts`'s `exposureForResolver`**. See "what must not
  break" below; this is the sharp edge of the whole phase.
- **Prefer one parameterised kind per *source* over one kind per square.** Twenty of these are
  "a team-stat field cleared a threshold". A single `nfl_team_stat_at_least` /
  `_at_most` carrying `{field, team, threshold}` collapses Tier 1 into two kinds with one
  `evaluateResolver` case, one label template and one exposure entry, and makes a 21st square a
  data-only change. The field name is validated against an allowlist at parse time so a typo can't
  reach the grader. Tier 2 collapses the same way (`nfl_game_max_stat_at_least`
  `{field, threshold, scope: "game" | "team"}`).
- **`team_stats` joins the existing snapshot, it does not get its own fetch path.**
  `NFLGameStatsSnapshot` gains a `teamStats` member, fetched inside `getNFLGameStatsSnapshot`
  alongside `/games` and `/stats`, memoized by game id exactly as its siblings are, and **only when
  the card actually holds a Tier-1 square** — the same conditional the plays walk already uses.
- **Board mix.** The board is fixed at 24 and something has to give. Take one slot from the
  **team-total** ladder (2/3/3/**2** core = 10) and give the specials bucket **6**, leaving 8 props:
  10 + 6 + 8 = 24. The team-total ladder is the right donor — it is the block Phase 3 note 11 and
  Phase 4 note 3 both flagged for emitting dead-weight 85–93% rungs.
- **Cap the flavor block by source, not just by count**, in `tryAdd` beside the existing NFL caps:
  max 2 Tier-1 squares per team, and — if 8a#1 says `team_stats` is Final-only — max 3 Tier-1
  squares per board, so a card still lights up during the game.
- **Settlement asymmetry is unchanged and still easy to get wrong:** an at-least square hits the
  instant the feed clears it; an at-most / "neither team" / "perfect red zone" square settles **only
  at Final**; a missing `team_stats` row **voids** rather than missing. Register every new kind in
  `isResolverEligibleForVoidRegrade`.

**Model: Opus 5 · effort: high.** The mechanical part is wide but shallow; the parts that are
neither are the correlation exposures, the mutual-exclusion pairs below, and the taste call about
which 6 of ~50 squares land on a given board.

### 8c — Recalibrate, then prove it

> **Complete (2026-08-17)** — and it says yes, twice over: **0.2430 realized before recalibration,
> 0.2561 after**, both over all 272 games of the 2025 regular season rather than the three-week
> slates this plan had been quoting. The sketch below is what was asked for; what the phase actually
> spent its time on is the thing the sketch does not mention — **the board being in band says
> nothing about whether the individual squares are priced right**, and eight families were not. See
> the Phase 8c as-built notes at the bottom of this file and
> `docs/prop-bingo-nfl-phase8c-findings.md`.

Adding ~50 candidates to a pool of ~45 changes board composition, so **the 27% realized rate is
invalidated the moment 8b lands** and has to be re-earned, not assumed.

- Re-run `npm run bingo:simulate -- --backtest --seasons 2025` and confirm NFL is back inside
  20–30%. Archive before/after under `docs/phase0-artifacts/`.
- Confirm NBA/WNBA/MLB are **unmoved** — the bucket-plan edit above is behind `isNfl`, and the
  all-league simulate run is what proves it, the way Phase 7's artifact does.
- **A quiet bonus worth stating:** props are live-only, so today's backtest can only grade ~16 of 24
  squares. Every Tier 1–4 square is fully backtestable, so after this phase the realized number is
  measured on ~20 of 24 — the win-rate figure gets *more* trustworthy, not less.

**Model: Opus 5 · effort: medium.** The tooling exists; the judgement is in reading the numbers.

### What must not break

- **`lib/sportsBingoCorrelation.ts`'s `default` case treats an unknown resolver kind as
  independent.** Ship a new kind without an `exposureForResolver` entry and it silently re-creates
  the exact defect Phase 5 existed to fix — for the new squares only, invisibly, with the estimator
  still reporting a confident number. **Every new kind gets an exposure entry and a
  marginal-preservation test in the same commit.** Consider making the `default` case log loudly.
- **New mutual-exclusion pairs, none of which the existing machinery infers**: "neither team turns
  it over" vs "\<team> turns it over 2+"; "perfect in the red zone" vs "settled for a field goal in
  the red zone" (same team); "\<team> wins time of possession by 5+" for both teams; "\<team> scores
  a defensive touchdown" **nested inside** the existing `nfl_non_offensive_touchdown` (which also
  counts return TDs — a strictly weaker square, so the pair is a near-duplicate line, not a
  contradiction, and belongs in the correlation model rather than the exclusion list); "both teams
  lead at some point" vs a large `nfl_margin_at_least`.
- **The Phase 4 corrupt-play guard.** Tier 3 rides the same walk. The forward-by-at-most-8 rule is
  what makes 43/43 true; anything added inside that loop must respect it, and a delta of exactly 8
  (square 42) is *specifically* the boundary the guard permits — do not tighten the guard to 7 to
  "clean up" two-point conversions.
- **`BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` (default ON) must gate Tier 3 and Tier 4 too.** It is
  the kill switch for everything that depends on the plays walk, and Tier 3/4 double the surface
  behind it.
- **No square may depend on `total_points`** — Phase 0 found it populated in 0/60 rows and Phase 4
  confirmed it dead.
- **Do not touch `BINGO_BOARD_TARGET_WIN_RATE`.** It is global; Phase 7 says the same thing.

### Explicitly rejected, so nobody re-proposes them

Coin toss, weather, injuries occurring mid-game, coach challenges, penalty *types* (the counts are
published; the types live only in play prose), "first player to X" beyond the first touchdown
(ordering needs prose parsing per player, and Phase 4 got 43/43 on the first-TD prose precisely
because a scoring play *leads* with the scorer — nothing else in the feed has that property),
snap counts, personnel groupings, anything about the broadcast or the crowd, and any square whose
truth depends on a stat a provider might restate after the fact.

### Tests

- `tests/lib.sportsBingo.nfl-flavor-squares.test.ts` — one grading test per family, each covering
  the hit / miss / void triple, plus the mid-game-early-hit and holds-until-Final asymmetries.
- `tests/lib.sportsBingoCorrelation.test.ts` — extend with a marginal-preservation case for every
  new kind (the existing file already does this for seven families; match its shape).
- A test asserting the `team_stats` call is **not** issued for a board with no Tier-1 square, and is
  issued **once** per game across multiple cards — the same discipline Phase 4's call-volume tests
  already enforce for `/plays`.
- Extend `npm run test:bingo-nfl` with the new file.

---

## Phase 9 — Star-tilted prop selection, with a star index that maintains itself

**The ask, both halves:** names people recognise should be more likely to appear on a board — but
not to the point where every board is six famous names and no unknowns — **and** there must be a way
to check in and update, so a player who becomes a star in Week 6 is not still invisible in Week 12.

**The second half is the important one, and it is where the existing precedent fails.**
`MLB_STAR_BRANDED_PLAYER_KEYS` (`lib/sportsBingo.ts:148`) is eleven hardcoded lowercase names with a
1.45× boost. It has no owner, no expiry, no test, and no mechanism by which a rookie who breaks out
in June ever enters it. It is a snapshot of one afternoon's opinion, decaying silently. **Copying
that shape to NFL is the one design this phase must not produce.**

### 9a — The star signal

> **Complete (2026-08-17), signal-only** — see the Phase 9a as-built notes at the bottom of this
> file.

Three inputs, blended. The first is the interesting one because it costs **nothing**.

1. **Market attention (primary, zero new requests).** Books post eight prop types for a star and one
   for a role player. The breadth of a player's prop coverage in *this game*, plus how short his
   anytime-TD price is, is a live market consensus on who the room came to watch — and Phase 3
   already fetches exactly this data (`fetchNFLPlayerPropMarkets`) for every NFL game. It self-updates
   by construction: the week a rookie becomes famous is the week the books post six markets on him.
2. **Season usage (secondary).** `/nfl/v1/season_stats?season=<current>` — one league-wide paginated
   pull, cached for a day. Volume is what fame is downstream of, so score it **position-normalised**:
   QB → pass + rush attempts; RB → carries + targets; WR/TE → targets; K → FG attempts. Take a
   percentile within position, never a raw number across positions.
3. **Production (tertiary).** Total touchdowns and yards per game from the same pull.

`starScore = 0.45 × market + 0.35 × usage + 0.20 × production`, every weight in one documented
constants block and env-tunable, exactly as `lib/sportsBingoOdds.ts` and
`lib/sportsBingoCorrelation.ts` already do it.

**Early season is a real problem and shrinkage is the answer already used in this codebase.** In
Week 1 the current season's stats are empty and every score would be noise. Blend toward the *prior*
season's index with `w = gamesPlayed / (gamesPlayed + 3)` — the same estimator Phase 7 uses for
opponent rates (`games / (games + 6)`). A rookie has no prior and therefore scores on market
attention alone, **which is the correct answer**: a hyped first-rounder the books post six markets
on *is* a name people know, and no stats-based signal could have told you that in Week 1.

**A hand-maintained brand list still earns its place, but only as a capped bonus.** Some players are
famous well beyond their production. `NFL_BRAND_NAME_BONUS` adds at most **+0.10** to `starScore`,
never sets a tier on its own, carries a `reviewBy` date in the file, and is asserted by a test to be
under ~25 entries. If the list is doing the work, the signal is broken — fix the signal.

**Model: Sonnet 5 · effort: medium.** Data plumbing over an endpoint we already know how to call.

### 9b — The selection rule

> **Complete (2026-08-17)** — see the Phase 9b as-built notes at the bottom of this file and
> `docs/prop-bingo-nfl-phase9b-findings.md`. Two deliberate deviations are recorded there: the tier
> boost is per *tier* rather than a function of the raw score (scores are compressed until 9c feeds
> the season index in), and the `nfl_star_mix` log moved to `generateBoardForGame` so it fires once
> per board rather than once per generation attempt.

Today the eight prop slots are filled by `orderByDifficulty(grouped["player-prop"], difficultyBias)`
taken in order (`pickCandidateSet`, ~`:5673`). The change is a weighted draw, in the shape of the
MLB named-player block that is already there — with three differences that matter:

- **Tier, then draw.** Split the prop pool into `star` / `known` / `deep` by `starScore` percentile
  within the *game's own* pool (not league-wide — on a thin Thursday slate the best available player
  should still read as the star of that board). Draw with a boost, don't sort: a deterministic
  top-N gives every card at a venue the same six names, and the room comparing cards is half the fun.
- **The floor is a hard reservation, not a soft weight.** Of the 8 slots, **at most 5 may be `star`
  and at least 2 are reserved for `known`/`deep`**. Soft weights drift under Phase 5's escalating
  `difficultyBias`; a reservation does not. If the pool genuinely has no non-star props, the
  reservation degrades to "take what exists" rather than failing generation — the same
  preference-not-requirement discipline `arrangeBoardSquaresForFeasibleLines` uses for the
  correlation cap.
- **Selection only. Never pricing.** The de-vigged market probability on a square is untouched — a
  star square is not made easier or harder, only likelier to be *chosen*. This is the same line
  Phase 5 drew for `orderByDifficulty` and it is what keeps the win-rate work valid.

The existing NFL caps (max 2 squares per player, max 2 per prop type) stay and become more
load-bearing, since star tilt pushes directly against both.

**Model: Opus 5 · effort: high.** It is a small diff inside the function that decides what a board
*is*, interacting with the difficulty bias, both diversity caps and the reservation — and getting it
wrong shows up as a win-rate drift nobody attributes to this change.

### 9c — The check-in mechanism (the half of the ask that is easy to under-build)

> **Complete (2026-08-17)** — see the Phase 9c as-built notes at the bottom of this file. All four
> layers shipped as specified below; the fifth (observability) already shipped in 9b.

Four layers, deliberately redundant, because the failure mode here is silent:

1. **Live and automatic (the actual answer).** `resolveNFLStarIndex(season)` reads
   `/nfl/v1/season_stats` behind a 24h cache (`BINGO_NFL_STAR_INDEX_CACHE_MS`, env-tunable, same
   pattern as `SEASON_STATUS_CACHE_MS`). A player who breaks out on Sunday is in the star tier by
   Tuesday **with no deploy and no human**. Market attention (9a#1) moves even faster — same-week.
2. **A generated snapshot, never hand-edited.** `data/sports-bingo/nfl-star-index.json`, produced by
   `npm run bingo:stars:nfl` → `scripts/refresh-nfl-star-index.cjs`. It is the cold-start fallback
   when the feed errors, the diff baseline, and the artifact a human can actually read. **This is
   the `category-blitz:build` convention** from `CLAUDE.md` — generated file, generating script,
   never a hand edit — and it should be documented the same way.
3. **The diff is the check-in.** `npm run bingo:stars:nfl` prints entrants, drop-offs and biggest
   movers versus the committed snapshot, with `--dry-run` to preview. Running it weekly during the
   season is a two-minute job that answers "are we ignoring anyone?" out loud.
4. **A staleness tripwire, so nobody has to remember.** A test that fails when the snapshot's
   `generatedAt` is older than 14 days **and** `resolveLeagueSeasonStatus("americanfootball_nfl")`
   reports in-season. Off-season it is inert. This is how the check-in gets enforced by CI instead of
   by discipline.
   - A cron would automate step 3 further, but `vercel.json` is a hard boundary in `CLAUDE.md` —
     **propose it to Andrew, don't add it.** The live path in layer 1 means the product is already
     correct without one; the cron would only automate the *audit*.
5. **Observability.** Log the realised mix per board —
   `console.info("[sportsBingo] nfl_star_mix", { star, known, deep, pool })` — matching the existing
   `mlb_named_player_weighting` log, so a real Sunday slate can be audited from production logs
   rather than by re-running a simulator.

**Model: Sonnet 5 · effort: medium.** One script, one generated file, one test, one log line.

### 9d — Optional: port the same machinery back to MLB

> **Complete (2026-08-17)** — see `docs/prop-bingo-nfl-phase9d-findings.md` and the Phase 9d
> as-built notes at the bottom of this file. It was not optional in the end: the prerequisite below
> ("fix that first") was the larger half of the work, and fixing it turned MLB boards from
> zero-named-player into a full book-posted, de-vigged prop surface.

`MLB_STAR_BRANDED_PLAYER_KEYS` has the exact rot problem this phase solves, and MLB has the same
season-stats surface. **Do it as its own change, after 9a–9c are settled** — Phase 7's own
instruction was "don't touch the named-player weighting in the same change," and Phase 7's note 4
records that MLB's named-player pool is currently empty in production for unrelated reasons
(`/mlb/v1/player_props` 404s). Fix that first; a star tilt over an empty pool tilts nothing.

**Model: Opus 5 · effort: medium**, and only once Phase 7's note 4 is understood.

### What must not break

- **Zero unknown names is a failure state, and so is zero stars.** The reservation guarantees the
  first; the second is guaranteed by drawing rather than filtering — a `deep`-tier player is never
  removed from the pool, only weighted down.
- **The win-rate band.** Star props are not systematically easier or harder, but nothing about that
  is guaranteed by construction, so re-run `bingo:simulate` and confirm NFL is still in band. If
  Phase 8 has landed, this re-run supersedes 8c's.
- **`resolveNFLPlayerProfiles` is already memoized per process** — the star index must not add a
  second per-player lookup path. Positions come off the row the name join already reads.
- **A feed failure must degrade to today's behavior**, not to a broken board: no index → no tilt →
  `orderByDifficulty` as it works now. Every BDL helper in this codebase already resolves failures
  to empty rather than throwing (`fetchBallDontLieJson`); match it.
- **Don't let the star tilt fight the difficulty bias.** The star weight *multiplies* the difficulty
  weight (as MLB's `starBoost` does) rather than replacing it, so Phase 5's escalation still reaches
  its target when a board is stuck above band.

### Tests

- `tests/lib.sportsBingo.nfl-star-tilt.test.ts` — the tier split; the ≥2 non-star reservation holding
  over 25 generated boards; the ≤5 star ceiling; stars appearing materially more often than chance;
  two boards for the same game differing in their star set (the draw is not deterministic); the
  no-index fallback being byte-identical to today's ordering; the brand bonus capped at +0.10.
- `tests/lib.sportsBingo.nfl-star-index.test.ts` — position-normalised percentiles; the early-season
  shrinkage blend; a rookie with no prior scoring on market attention alone; the snapshot staleness
  tripwire.
- Extend `npm run test:bingo-nfl` with both.

---

## Risks and open questions

| Risk | Handling |
| --- | --- |
| **BDL tier may not cover NFL props or stats** | Phase 0 answers it before any dependent code exists. Odds access is already proven by Pick 'Em; stats is ALL-STAR; props is unconfirmed. If props are unavailable, Phase 3 falls back to the team/game/quarter squares, which need no props at all — the boards get less starry, not broken. |
| **Preseason odds and props are genuinely thin** | Book-posted-only (decision 4) plus team/game squares means thin coverage degrades the board rather than corrupting it. Games under 24 candidates are hidden, with a real empty state. |
| **Props are live-only, no history** | Lines are snapshotted into `sports_bingo_squares.resolver` at card creation, which already happens — a square grades against the line the player accepted, not a later one. |
| **Backtesting props is impossible** | Stated plainly in 5c: historical validation covers team/game squares fully and props by stat-derived proxy. |
| **Retuning to 25% makes NBA/MLB harder mid-season** | Per decision 1. Boards already issued keep their odds; only newly generated boards change. Worth a player-facing note if the drop is noticeable. |
| **API call volume per board** | One odds call per slate (cached), one props call per game (cached 60s), one stats call per game per cron tick (memoized across cards). Should stay within current patterns; measure during the first live slate. |

## Suggested extras

- ~~**Star-tilted prop selection**, like the existing `MLB_STAR_BRANDED_PLAYER_KEYS`~~ — **adopted
  2026-08-17, now Phase 9**, with the addition Andrew asked for: a star index that updates itself
  during the season instead of a hardcoded name list.
- ~~**Divisional/rivalry flavor squares** (e.g. "both teams score on their opening drive")~~ —
  **adopted 2026-08-17, now Phase 8**, widened from the rivalry framing to a ~50-square slate off
  `/nfl/v1/team_stats`, the player box score and the existing plays walk. Phase 8 explains why the
  divisional angle itself is *labeling*, not a resolver.
- **A "board of the night" shared square** — one square identical across every board at the venue, so
  the room reacts together. Trivially gradable, big room-energy payoff. **Still not committed** —
  it is a venue/session-scoping change rather than a square-authoring one, so it does not belong
  inside Phase 8.

---

## Phase 1 — as-built notes and handoff (2026-08-16)

**Status: complete.** `npm run test`, `npx tsc --noEmit`, and `npm run lint` are all clean on top
of this work (one pre-existing, unrelated failure in `tests/venue-activation.phase4-mount.test.ts`
— confirmed present on `main` before this change too, not caused by it).

### What shipped

- **`lib/leagueSeasonStatus.ts`** (new) — `resolveLeagueSeasonStatus(sportKey)`: in-season if
  `hasUpcomingGamesInWindow(sportKey, 14)` (new export in `lib/sportsBingo.ts`) finds any game in
  the next 14 days; otherwise falls back to the hand-maintained `LEAGUE_SEASON_WINDOWS` calendar.
  A feed error and a genuinely empty feed are **indistinguishable from the caller's side**
  (`fetchBallDontLieJson` swallows both into `{}`) — this is intentional, matches decision 2
  exactly ("fall back... when the feed is empty **or** erroring"), and needs no special-casing.
  A `sportKey` with no calendar entry fails open (always in-season).
  - `LEAGUE_SEASON_WINDOWS` currently covers `basketball_nba`, `basketball_wnba`, `baseball_mlb`,
    `americanfootball_nfl`. **NFL's window is regular season + postseason only** (Sept 1 – Feb 15,
    wrapping the New Year) — no preseason branch, per Andrew's decision at the top of this file.
    The other three windows are reasonable hand-picked approximations (NBA Oct–June, WNBA
    May–Oct, MLB late-Mar–early-Nov); they're only a *fallback* behind the live feed, so precision
    here matters less than it would if they were primary — tighten them later if a real edge case
    surfaces (e.g. All-Star break false-negatives, which the live feed should paper over anyway
    since regular-season games still exist in the catalog during breaks).
  - `isSeasonGatingEnabled()` reads `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED` — off (default) =
    every league always in-season, i.e. today's behavior, fully inert.
- **`hasUpcomingGamesInWindow(sportKey, days)`** (new export in `lib/sportsBingo.ts`) — a
  lightweight existence check (`per_page=1`, breaks on first non-empty day) over a wider window
  than the existing 36h `loadGameCatalog` lookahead, since BDL lists games well ahead of kickoff
  (NFL Week 1 was visible 25 days out per Phase 0). Cached separately
  (`seasonStatusCache`, `SEASON_STATUS_CACHE_MS`, default 6h, env-tunable via
  `BINGO_SEASON_STATUS_CACHE_MS`) — deliberately much longer-lived than the game-catalog cache,
  since season status doesn't need near-real-time freshness. `SPORT_PATH_BY_KEY` and the day-set
  builder were hoisted out of `loadGameCatalog` into module scope (`dayKeysForWindow`) so both
  functions share one source of truth for BDL's per-sport paths — **if you add a new league's BDL
  path, add it here, not inside `loadGameCatalog`.**
- **`GET /api/bingo/leagues`** (new route) → `{ ok, leagues: [{key, label, icon, status,
  resumesLabel}] }`. Two independent gates, don't conflate them:
  1. `isSeasonGatingEnabled()` — whether season status is computed at all vs. everything reported
     in-season.
  2. **A separate, NFL-only override**: `isNflGameplayEnabled()` reads
     `NEXT_PUBLIC_BINGO_NFL_ENABLED` (not yet referenced anywhere else — **this is the flag Phase
     2 is supposed to flip**, per this plan's Phase 2 section: "gated by Phase 1's status resolver
     plus `NEXT_PUBLIC_BINGO_NFL_ENABLED`"). While it's off, NFL is *always* reported
     `out_of_season` / `"Coming soon"` regardless of the real season status — added because the
     live-feed check will start returning real NFL games as Week 1 enters the 14-day window
     (automatically, no code change needed), and without this override the picker would start
     offering NFL boards the moment that happens, weeks before Phase 2–4 exist. **When Phase 2
     lands, flipping `NEXT_PUBLIC_BINGO_NFL_ENABLED=true` is the entire activation switch for the
     picker** — no code changes needed in this route or the component.
- **`components/bingo/SportsBingoSelectSport.tsx`** rewritten as data-driven: fetches
  `/api/bingo/leagues` on mount, renders a 4-row skeleton while loading, disables out-of-season
  rows with an `Out of season · <resumesLabel>` badge. On fetch failure, falls back to a static
  `FALLBACK_SPORT_OPTIONS` array with every league enabled **except NFL** (`enabled: false,
  note: "Coming soon"`) — this matches the pre-Phase-1 hardcoded list exactly, so a flaky
  `/api/bingo/leagues` call degrades to *today's* behavior, not a broken one.
- **Server-side guards** (deep-link bypass protection) in `GET /api/bingo/games` and both
  season-relevant branches of `POST /api/bingo/cards` (`action=generate` and `action=play` — the
  latter matters because it's the actual card-creation path a scripted client could hit directly,
  skipping `action=generate`'s preview). Both reject an out-of-season `sportKey` with `400` and a
  human-readable message, only when `isSeasonGatingEnabled()` is on. **Note (superseded by Phase 2
  — both guards now route through `resolveLeagueBlockReason`, which does enforce the NFL flag):**
  these guards check
  season status only, not `NEXT_PUBLIC_BINGO_NFL_ENABLED` — NFL board generation still runs on
  today's fictional constants (`homeWinProb=0.55`, `total=45`) if hit directly, exactly as it did
  before this phase. That's pre-existing behavior Phase 1 didn't touch; Phase 2 replaces the
  constants, and NFL stays off the picker in the meantime via the `/api/bingo/leagues` override
  above, so this gap has no real surface today.
- Tests: `tests/lib.league-season-status.test.ts` (calendar fallback, feed-error/empty
  indistinguishability, NFL no-preseason-branch across the New Year wrap, fail-open for an
  unlisted league) and `tests/api.bingo.leagues.test.ts` (flag combinations, the NFL override,
  error path).

### Handoff notes for Phase 2

1. **The `NEXT_PUBLIC_BINGO_NFL_ENABLED` flag already exists and is already wired into the
   picker** (`app/api/bingo/leagues/route.ts`) — Phase 2 does not need to add it, just flip it (and
   reference it if any other NFL-specific surface needs the same gate).
2. **Phase 2/3 should build against `resolveLeagueSeasonStatus`'s regular-season-only NFL window,
   not re-derive a preseason story.** If a future BDL contract change adds preseason coverage
   (Phase 0 findings §1 describes how `bingo:probe:nfl` would surface that), extending
   `LEAGUE_SEASON_WINDOWS`'s NFL entry is a small, isolated change — don't assume it requires
   touching Phase 2/3/4 candidate-building code, since none of that is preseason-aware by design.
3. **`hasUpcomingGamesInWindow` and `SPORT_PATH_BY_KEY` are now reusable** — Phase 2's odds
   consensus work (`lib/sportsBingoOdds.ts`) fetches by `game_ids[]` from the slate, not by sport
   path directly, so this likely doesn't need touching, but know it's there if a similar
   existence-check is needed.
4. **The `< 24 candidates → null` guard mentioned in Phase 3 still needs a real empty state** —
   that's still open, just no longer framed around preseason (see the struck paragraph above).
5. No new Supabase migrations, no schema changes in Phase 1 — nothing to reconcile there.

---

## Phase 2 — as-built notes and handoff (2026-08-16)

**Status: complete.** `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.
`npm run test` is at **4 failures, all pre-existing on `main`** — verified by stashing this
work and re-running: 1 in `tests/admin-mobile.section-registry-split.test.ts` and 3 in
`tests/venue-activation.phase4-mount.test.ts`. Neither is related to Prop Bingo. (Phase 1's
notes mentioned only the venue-activation one; the admin-mobile failure is also pre-existing,
just wasn't called out then.)

### What shipped

- **`lib/sportsBingoOdds.ts`** (new) — the whole Phase 2 model, and the only NFL-aware file
  outside the one branch in `sportsBingo.ts`:
  - `fetchNFLOddsConsensus(gameIds[])` — **one** `/nfl/v1/odds?game_ids[]=…` call for the
    whole slate, 8-page cap with a truncation warning (same arithmetic as
    `NFL_SPREAD_LINES_MAX_PAGES` in `lib/nflPickEm.ts`). Never throws: a provider failure
    resolves to an empty map.
  - `computeNFLOddsConsensus(rows)` — pure, so it's directly testable. **Median** (not mean)
    per market across vendors, so one stale or fat-fingered book can't drag the number.
    `NFL_ODDS_VENDOR_ALLOWLIST` is lifted from `NFL_SPREAD_VENDOR_PRIORITY` in
    `lib/nflPickEm.ts` and used as an *allowlist*: `kalshi`/`polymarket` (prediction markets,
    symmetric un-vigged moneylines — Phase 0 §3) are excluded whenever a real book quoted the
    market, and used only as a last resort when none did.
  - **A game needs BOTH a spread and a total or it gets no consensus at all.** Half a market
    is worse than none — it would silently mix a real spread with the fictional 45-point
    league average this phase exists to delete. The moneyline is optional and refines only the
    moneyline square.
  - `buildNFLMarketModel(consensus)` — normal approximation of NFL scoring. Margin ~
    `N(-homeSpread, 13.5)`, team score ~ `N(implied team total, 10)`, game total ~
    `N(total, NFL_GAME_TOTAL_SIGMA)`. **The game-total sigma is derived, not a third free
    parameter**: `Var(A+B) + Var(A-B) = 4·teamSigma²` holds for any correlation, so
    `totalSigma = sqrt(4·teamSigma² − marginSigma²)` ≈ 14.8. Don't "fix" this by hardcoding a
    third constant — that's what makes the three distributions describe one game instead of
    three. Both inputs are env-tunable (`BINGO_NFL_MARGIN_SIGMA`,
    `BINGO_NFL_TEAM_TOTAL_SIGMA`) for Phase 5's calibration.
  - **One deliberate inconsistency, documented in the code:** `winProbability` returns the
    **de-vigged moneyline price** when the books quoted one, rather than `P(margin > 0)` from
    the normal model. NFL margins clump hard on 3 and 7, so at that one line the market price
    beats a continuous approximation (live check below: DET −7 prices at 73.9% vs the model's
    69.8%). Spread/total squares stay anchored on the spread/total, which are sharper for
    those. **Phase 5b should anchor its correlated simulator on the spread-derived margin
    distribution and treat the ML gap as a known, small discrepancy — not try to reconcile
    them by moving the spread.**
- **`lib/ballDontLieClient.ts`** (new) — `fetchBallDontLieJson` / `fetchBallDontLieList` /
  `isBallDontLieConfigured` moved verbatim out of `lib/sportsBingo.ts` so `sportsBingoOdds.ts`
  can use them without importing `sportsBingo.ts` (which imports the odds module — that would
  be a cycle). `fetchBallDontLieList` gained optional `{ maxPages, truncation }`; the default
  is still 12 pages with no truncation signal, i.e. every existing caller is byte-identical.
  **New BDL fetching belongs here, not back in `sportsBingo.ts`.**
- **`buildGameAndCandidatesFromBallDontLie`** takes a third param,
  `marketModel: NFLMarketModel | null = null`. **It is non-null only for NFL games whose slate
  odds came back.** Every other league passes `null` and takes the byte-identical legacy path —
  there is a regression test (`leaves NBA on its untouched league-average path`) asserting NBA
  still gets exactly `0.55` and never issues an `/odds` call. When the model is present it
  drives all four core buckets: moneyline, spread (`marginMoreThan`), game total
  (`gameTotalOver`) and team total (`teamTotalOver`).
  - Note `favorite` is derived from the **spread** when a model exists, not from the moneyline
    comparison — on a near-pick'em the de-vigged ML can disagree by a hair and would center the
    spread ladder on the wrong team.
  - Every board line is a half-point (`roundLine` → `normalizeNoPushLine`), so there is **no
    push mass**: "favorite by more than L" and "underdog within L" partition exactly, and
    `1 - p` is the correct complement. Don't add a continuity correction; it would be wrong.
- **`loadGameCatalog` is slate-aware** — for `americanfootball_nfl` only, it makes one
  `fetchNFLOddsConsensus` call for every game id in the refresh and joins the models back on.
  It sits inside the existing `GAME_CATALOG_CACHE_MS` (90s) cache, so there's no separate odds
  cache to reason about or invalidate. Other sports skip the call entirely.
- **Missing-odds fallback:** an NFL game the books haven't priced still builds candidates off
  the league-average path, but they're tagged `supportLevel: "possible"`. With
  `BINGO_ALLOW_POSSIBLE_SQUARES` unset (the default) those are filtered out in
  `getGameEntryWithCandidates`, so **an unpriced NFL game yields no board rather than a board
  built on fiction** — `generateSportsBingoBoard` throws "Not enough candidate squares".
  This is intentional and tested. It's also the behavior change that broke the one pre-existing
  NFL test (`tests/lib.sportsBingo.player-props.test.ts` → "builds NFL board using spread and
  total markets"), which now supplies real odds rows.
- **`NEXT_PUBLIC_BINGO_NFL_ENABLED` is now enforced server-side, not just in the picker.**
  New `resolveLeagueBlockReason(sportKey)` in `lib/leagueSeasonStatus.ts` is the single place
  that decides whether a league is usable right now; `/api/bingo/games` and both branches of
  `POST /api/bingo/cards` call it, and the leagues route imports the same
  `isNflGameplayEnabled()`. Phase 1's note that "these guards check season status only, not
  `NEXT_PUBLIC_BINGO_NFL_ENABLED`" is **no longer true** — that deep-link gap is closed.
- **`.env.example`** now documents `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED`,
  `NEXT_PUBLIC_BINGO_NFL_ENABLED` and the two sigma knobs. Both flags default off.
- Tests: `tests/lib.sportsBingo-odds.test.ts` (de-vigging, median-vs-mean consensus,
  prediction-market exclusion + last-resort fallback, junk-value rejection, half-a-market
  rejection, slate-wide single fetch, provider-failure degradation, the scoring model, the
  sigma identity) and `tests/lib.sportsBingo.nfl-core-squares.test.ts` (the same thing end to
  end through `listSportsBingoSquareTemplates` / `generateSportsBingoBoard`, plus the
  no-odds-no-board case and the NBA no-regression case) and
  `tests/lib.league-availability.test.ts` (the server-side NFL gate).

### Live-feed verification (2026-08-16)

Ran `fetchNFLOddsConsensus` + `buildNFLMarketModel` against the real BDL feed for 2026 Week 1
(throwaway script, not committed — the committed tools are `bingo:probe:nfl` and
`bingo:baseline`). **8/8 games resolved a consensus, 8 books each**, e.g.:

| Game | Spread | Total | de-vigged home ML | implied team totals |
| --- | --- | --- | --- | --- |
| NE @ SEA | −3.5 | 44.5 | 63.3% | 24.0 / 20.5 |
| NO @ DET | −7 | 49.5 | 73.9% | 28.3 / 21.3 |
| NYJ @ TEN | −2.5 | 38.75 | 56.9% | 20.6 / 18.1 |
| BAL @ IND | +3.5 | 48.5 | 37.8% (road favorite) | 22.5 / 26.0 |

That spread of numbers is the point of the phase: under the old constants all eight of those
games produced the same board.

### Handoff notes for Phase 3

1. **NFL is still dark, on purpose.** `NEXT_PUBLIC_BINGO_NFL_ENABLED` stays `false`. Phase 2
   gives NFL real *core* squares but no player props and — importantly — **no NFL settlement**
   (that's Phase 4). Score-based resolvers are sport-agnostic and would in fact grade NFL core
   squares today, but don't flip the flag on that basis: the plan's rollout order is
   Phases 2–4 together, then the Phase 5 retune. Flipping the env var is the entire switch in
   both directions; no code change is needed on either side.
2. **`buildNFLPlayerPropCandidates` should live in `lib/sportsBingoOdds.ts`, not
   `sportsBingo.ts`.** Everything it needs is already there — `impliedProbabilityFromAmericanOdds`,
   `deVigTwoWay`, `median`, the vendor allowlist, and the page-capped `fetchBallDontLieList`.
   Mirror `buildMLBPlayerPropCandidates`'s *shape* (`lib/sportsBingo.ts`, the `byAxis` map and
   the over/under pairing) but source the probabilities through `deVigTwoWay(over_odds,
   under_odds)` rather than raw implied odds — MLB's path uses raw implieds and therefore
   carries the vig, which is a real (pre-existing, out-of-scope) calibration bug. Don't copy it.
3. **Fold in Phase 0 §3's two allowlist edits**: drop `longest_pass` (no field exists), and
   move `first_td` to Optional 3b (needs `/nfl/v1/plays` for ordering). `kicking_points` is
   derived as `3×field_goals_made + extra_points_made` — flag that formula for validation the
   first time a real settled line is observed.
4. **Player props are live-only.** Phase 0 got `200 OK` with **0 rows** 25 days out. Re-run
   `npm run bingo:probe:nfl` within ~48h of Week 1 kickoff to confirm live prop volume,
   diversity and vendors before Phase 3 ships to venues — the allowlist is currently confirmed
   by field cross-reference, not by observing live prop rows.
5. **The `< 24 candidates → null` empty state is still open** (carried over from Phase 1's
   note 4). It now has a second, more likely trigger: an NFL game with no book-posted market
   produces zero candidates and `generateSportsBingoBoard` throws
   *"Not enough candidate squares are available for this game."* — which the game list surfaces
   as a raw error rather than "No boards available for this game." Worth fixing in Phase 3
   since the prop mix changes how often it fires.
6. **Don't add a second odds cache.** The slate fetch is inside `loadGameCatalog`, behind
   `GAME_CATALOG_CACHE_MS`. Phase 3's per-game props call is a *different* endpoint
   (`/nfl/v1/odds/player_props`, requires `game_id`, one call per game) — the plan's 60s cache
   for that is still right, but it should be its own cache, not bolted onto the slate one.
7. **`resolveLeagueBlockReason` is the single availability gate.** If Phase 3/4 adds another
   NFL-touching route, call that — don't re-derive the flag check.
8. No Supabase migrations and no schema changes in Phase 2. Resolver kinds are unchanged;
   Phase 3 is the phase that adds new ones.

---

## Phase 3 — as-built notes and handoff (2026-08-16)

**Status: complete, including Optional 3b.** `npx tsc --noEmit`, `npm run lint` and `npm run build`
are clean. `npm run test` is at **4 failures, all pre-existing on `main`** — the exact four
catalogued in this file's Appendix (1 in `tests/admin-mobile.section-registry-split.test.ts`,
3 in `tests/venue-activation.phase4-mount.test.ts`). Nothing new went red.

**NFL is still dark.** `NEXT_PUBLIC_BINGO_NFL_ENABLED` stays `false`. Do not flip it after this
phase — see handoff note 1.

### The one structural deviation from the sketch above

**Player over/under props reuse the existing `player_prop` resolver kind rather than adding an
`nfl_player_prop` twin.** The plan named `nfl_player_prop`; the shape turned out to be identical
(`{marketKey, player, line, direction}`), and reusing it inherits four things for free that a twin
would have had to re-implement: the over/under mutual-exclusion rule in
`resolversAreMutuallyExclusive`, `getPlayerPropAxisKey`'s duplicate-axis guard,
`getPlayerPropMarketKey`'s diversity counting, and `buildSquareLabel`'s player-prop phrasing.
balldontlie's NFL `prop_type` values (`passing_yards`, `receptions`, …) do not collide with the
NBA/MLB `player_*` market keys, and `evaluateResolver`'s `player_prop` branch already switches on
`snapshot.sportKey`. Everything the existing kinds genuinely could not express — milestone markets,
quarter squares, margin bands, the play-by-play family — did get new kinds.

### What shipped

**`lib/sportsBingoOdds.ts` (extended)** — all the market math and every calibration constant:

- `fetchNFLPlayerPropMarkets(gameId, {includePlayByPlay})` — one `/nfl/v1/odds/player_props` call
  per game, **its own 60s cache** (`BINGO_NFL_PLAYER_PROPS_CACHE_MS`), never bolted onto the
  slate-wide odds cache, per Phase 2's handoff note 6. Never throws; an outage is an empty list.
- `computeNFLPlayerPropMarkets(rows, allowed)` — pure, so it is directly testable. Two decisions
  worth knowing:
  1. **Modal line first, then a median price among only the books quoting that line.** Vendors
     disagree about the *line*, not just the price; averaging across 85.5 and 89.5 produces a
     probability belonging to no line anyone posted. Only allowlisted books get a vote on where
     the line is, so `kalshi`/`polymarket` can't move it.
  2. **De-vigged via `deVigTwoWay`, not raw implied odds** — per Phase 2's handoff note 2. The MLB
     path's raw-implied numbers carry the hold and overstate every square; that pre-existing bug
     was deliberately not copied.
- `NFL_CORE_OVER_UNDER_PROP_TYPES` / `NFL_CORE_MILESTONE_PROP_TYPES` /
  `NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES` — Phase 0 §3's allowlist with both of its edits folded
  in: `longest_pass` dropped (no field exists), `first_td` moved into the 3b set. `sportsBingo.ts`
  imports `NFL_CORE_OVER_UNDER_PROP_TYPES` **as** its settlement allowlist rather than re-listing
  it, so "what we offer" and "what we can settle" cannot drift apart.
- `resolveNFLPlayerNames(playerIds)` — the `player_id` → name join via
  `/nfl/v1/players?player_ids[]=`, batched and memoized for the process lifetime. Verified against
  the live feed (`490 → Jonathan Taylor`, `33 → Lamar Jackson`, bogus id silently dropped). A prop
  whose player can't be named is **dropped**, not shipped as "Player 490".
- `NFL_MILESTONE_DEVIG_FACTOR` (0.92, env-tunable) — a milestone market quotes one side only, so
  there is no complement to normalize against. **Field normalization was considered and rejected**:
  scaling prices so the anytime-TD field sums to the expected number of scorers is textbook, but it
  silently *inflates* every price when the book has posted only part of the field, which is exactly
  what a thin or partially-pulled slate looks like. A flat factor cannot fail in that direction.
  This is the least-evidenced number in the module — flagged for Phase 5.
- **`NFLMarketModel` gained eight team/game/quarter methods** (`marginAbsAtMost`, `marginAbsAtLeast`,
  `leadsAtHalftime`, `overtime`, `bothTeamsScoreAtLeast`, `scoresEveryQuarter`,
  `quarterPointsAtLeast`, `anyQuarterScoreless`) plus `nflHalftimeLeaderLosesProbability` and
  `shadeByTotal`. These are what make a 54-point shootout and a 38-point slog produce different
  quarter squares instead of one shared league constant.

**Calibration constants are all in one documented block** in `lib/sportsBingoOdds.ts`, each with the
base rate it targets written next to it (`NFL_HALFTIME_TIE_BAND`,
`NFL_OVERTIME_KEY_NUMBER_MULTIPLIER`, `NFL_CLOSE_MARGIN_KEY_NUMBER_MULTIPLIER`,
`NFL_QUARTER_SCORE_BASE`/`_SLOPE`, `NFL_*_EFFECTIVE_TRIALS`, the four 3b base rates, …).
**Every one of them is a Phase 5 recalibration candidate** — that block says so explicitly. The
three non-obvious modelling choices:
- Halftime margin uses `marginSigma / sqrt(2)` (variance scales with elapsed game), with a ±1.2
  point tie band so halftime ties land near their real ~10% rate instead of ~0%.
- "At least one quarter does X" is **not** four independent trials — quarters inside one game are
  positively correlated, so it uses a fractional effective-trials exponent (2.6 for scoreless
  quarters, 3.4 for explosion quarters).
- `marginAbsAtMost` carries a 1.25 key-number boost (NFL margins pile on 3); `marginAbsAtLeast`
  deliberately does **not**, since that boost is about near-zero margins only.

**`lib/sportsBingo.ts`:**

- **18 new resolver kinds**, threaded through all seven call sites: the union, `resolverKey`,
  `buildSquareLabel`, `parseResolver`, `SportsBingoSquareTemplatePreview.resolverKind`,
  `evaluateResolver`, and `isResolverEligibleForVoidRegrade`.
- `buildNFLTeamGameCandidates(game, marketModel, supportLevel)` — 20 team/game/quarter candidates,
  built inside `buildGameAndCandidatesFromBallDontLie` (sync, no API call). Covers every square
  the plan listed, plus `nfl_team_shutout_quarter` and `nfl_first_scorer_wins`.
- `buildNFLPlayerPropCandidates(game, markets)` — **lives in `sportsBingo.ts`, not
  `sportsBingoOdds.ts`**, contrary to Phase 2's handoff note 2. The *market math* did go in the odds
  module as instructed; the template assembly cannot, because it needs `resolverKey` /
  `buildSquareLabel` / `SportsBingoSquareTemplate` and `sportsBingo.ts` already imports the odds
  module — reaching back would be an import cycle, the exact thing `lib/ballDontLieClient.ts` was
  extracted to avoid. The seam is `NFLPlayerPropMarket`.
- **Both sides of an over/under are emitted** (unlike the MLB path, which pre-selects the
  coin-flippiest). They share an axis key, so `pickCandidateSet`'s duplicate-axis guard already
  stops both landing on one board; emitting both simply lets the board generator pick whichever
  side moves that board toward the win-rate target.
- **Whole-number prop lines are skipped, not rounded.** `roundLine` would turn "more than 2 TDs,
  push at 2" into "at least 3 TDs" — a different square than the one the book priced.
- **NFL bucket plan** in `pickCandidateSet`: 2 moneyline / 3 spread / 3 total / 3 team-total /
  5 special / 8 player-prop. One fewer spread than the other leagues because the spread ladder is
  the most self-similar block on a board.
- **Two hard NFL diversity caps** in `tryAdd`, checked *before* any bookkeeping mutates state: max
  2 squares per player (so one quarterback can't own the board's outcome) and max 2 per prop type.
  Note the pre-existing MLB ordering bug — a rejected MLB candidate still consumes an axis — was
  left exactly as it was rather than silently "fixed" as a side effect.
- **Mutual exclusion extended**: `nfl_margin_at_most` joins `marginBoundsForResolver` (it is the
  single interval `(-L, L)`, so it composes with the spread/moneyline bounds for free);
  `nfl_margin_at_least` is a two-tailed union and cannot, so its conflicts are stated explicitly,
  alongside both-teams-lead-at-halftime, scores-every-quarter vs shut-out-in-a-quarter, and
  overtime vs a 17+ margin.
- **`getGameEntryWithCandidates`** fetches props for NFL only when `entry.marketModel` is non-null —
  an unpriced game has no board to hang props on, so this also saves a live-feed call.
  `GameCatalogEntry` gained `marketModel` so that async pass can see the same consensus the core
  squares came from.

**The `< 24 candidates` empty state is closed** (carried over from the Phase 1 and Phase 2 handoff
notes). Two changes: `listSportsBingoGames` now filters to games with ≥24 *boardable* (support-level
surviving) candidates, so an unpriced NFL game never appears in the list at all; and the thrown
message is now player-facing — *"No bingo board is available for this game yet. Check back closer to
kickoff."* — because `SportsBingoSelectBoard` renders `payload.error` verbatim. The list filter is a
no-op for NBA/WNBA/MLB, whose core squares are always `supported`.

**Optional 3b shipped** (Phase 0 §2 confirmed `/nfl/v1/plays` returns 200 on our tier): first score
is a field goal, the first scorer wins, a defensive/special-teams TD, a fourth-down conversion, a
50+ yard TD, and the `first_td` player prop. It has a kill switch,
`BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED`, **defaulting ON** — it removes the whole family from new
boards without a code change if plays-derived grading proves unreliable during Phase 4.

**Tests:** `tests/lib.sportsBingoOdds.nfl-player-props.test.ts` (14: de-vig vs raw implied, modal
line, prediction-market exclusion from the line vote, milestone de-vig, allowlist enforcement,
unusable rows, the name join + caching, provider failure, and the eight model methods) and
`tests/lib.sportsBingo.nfl-prop-mix.test.ts` (10, end to end: prop squares with real names and
labels, the longest-rush/reception phrasing, milestones, dropped prop types, a full board from
team/game squares with zero props, the 3b kill switch, the per-player and per-market caps over 12
generated boards, contradiction-free lines over 12 more, the hidden-unpriced-game empty state, and
an NBA no-regression case asserting no props call and no NFL squares).

### Live-feed verification (2026-08-16)

- `/nfl/v1/odds` for 2026 Week 1: **16/16 games priced** (Phase 2 saw 8/8 on a partial pull).
- `/nfl/v1/odds/player_props` 25 days out: **200 OK, 0 rows** — exactly what Phase 0 §3 predicted
  and the docs describe. The prop path is therefore **still unverified against live prop rows**;
  see handoff note 3.
- `/nfl/v1/players?player_ids[]=` name join: works, verified against real ids.

### Handoff notes for Phase 4

1. **`evaluateResolver` has an explicit Phase 3/Phase 4 seam — read it before writing any grading
   code.** Every new NFL kind, plus NFL `player_prop`, currently returns `pending` while the game is
   live and `void` at Final. That block exists **only** because `evaluateResolver`'s `default` case
   returns `{status: "void", resolved: true}` unconditionally, which would have voided every NFL
   square on the first cron tick, mid-game, on a card the player could still be winning — and the
   `player_prop` branch was worse: it would have settled NFL props as an immediate **miss**. Replace
   each case with real grading; **do not delete the block and let them fall through to `default`.**
2. **This is why the flag must stay off.** Phase 3 gives NFL a genuinely good-looking board that
   cannot be won — every square voids at Final. `NEXT_PUBLIC_BINGO_NFL_ENABLED=true` is the entire
   activation switch in both directions and belongs at the *end* of Phase 4, not before it.
3. **Re-run `npm run bingo:probe:nfl` within ~48h of Week 1 kickoff (2026-09-10/11) before Phase 4
   ships.** The allowlist is still confirmed only by field cross-reference, never by observing live
   prop rows. Two things to check against reality: that the `prop_type` values and `market.type`
   shape match what `computeNFLPlayerPropMarkets` parses, and how many books actually quote each
   prop (the modal-line logic assumes several).
4. **`kicking_points` is derived, not a field** — `3 × field_goals_made + extra_points_made`
   (Phase 0 §3). `total_points` exists in the schema but was populated in 0/60 sampled rows; it is
   a dead field, do not use it. Validate the formula against the first real settled `kicking_points`
   line observed.
5. **Quarter fields are `null`, not `0`, for a scoreless quarter** — the BDL docs' own sample shows
   a Final game with `home_team_q3: null` and `home_team_q4: null` where the team simply didn't
   score. Every quarter resolver must read `null` as zero **once that quarter has been played**, and
   must not mistake "not played yet" for "scored nothing". `nfl_any_quarter_scoreless` and
   `nfl_team_shutout_quarter` both hinge on getting this right.
6. **Settlement asymmetry the plan already specifies, restated because it is easy to get wrong:**
   an over/at-least square hits the moment the box score clears it, mid-game; an under/at-most
   square only settles at Final; a player absent from the box score (inactive, DNP) **voids** —
   `nfl_player_anytime_td` and `nfl_player_first_td` are already registered in
   `isResolverEligibleForVoidRegrade` for exactly that path.
7. **`getSquareMetadataForResolver` still returns `generic`/`null` for NFL player squares.** It is
   currently MLB-webhook-specific (it is what populates `square_type` / `player_id` / `event_type`).
   If Phase 4 wants per-player NFL progress rows, that function is where to extend — no schema
   change needed, the columns already exist.
8. **`resolverProgressPayload` returns `null` for every NFL kind**, so NFL squares show no
   "3 of 5" progress bar today. Wiring one up for over/at-least props is a natural Phase 4 addition
   (the box-score value is already being fetched to grade them) but is not required.
9. **One call per game per cron tick, memoized across cards** — same discipline as the MLB path.
   `/nfl/v1/plays` is the new risk here: it *is* paginated and a full game runs ~150-180 plays, so
   cap the walk and cache per game rather than per card.
10. **Don't re-derive the availability gate.** `resolveLeagueBlockReason` in
    `lib/leagueSeasonStatus.ts` is still the single place that decides whether a league is usable.
11. **Phase 5 notes worth carrying forward:** the Phase 2 caveat still stands (anchor the correlated
    simulator on the spread-derived margin distribution and treat the moneyline gap as a known small
    discrepancy). New for Phase 5: the team-total ladder still emits rungs at 85-93% probability
    ("Cowboys: under 35.5 points"), which are dead-weight squares that inflate board win rate — that
    is a candidate-generation problem, not an estimator problem, and 5b should look at both.
12. No Supabase migrations and no schema changes in Phase 3.

---

## Phase 4 — as-built notes and handoff (2026-08-16)

**Status: complete.** `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.
`npm run test` is at **4 failures, all pre-existing on `main`** — the exact four catalogued in
this file's Appendix (1 in `tests/admin-mobile.section-registry-split.test.ts`, 3 in
`tests/venue-activation.phase4-mount.test.ts`). Nothing new went red; 25 new tests are green.

**NFL is still dark.** `NEXT_PUBLIC_BINGO_NFL_ENABLED` stays `false` — see handoff note 1 for why
the flip is now *unblocked* but deliberately not taken here.

### Two pre-existing bugs Phase 4 had to fix before any of this could work

Both were latent because no league had a square that could notice. Both are **cross-league
behavior changes** — read these before assuming this phase only touched NFL.

1. **`getScoresBySportKey` declared every NFL game complete at halftime.** Its completion test was
   `status.includes("final") || status.includes("ft")`. `"ft"` is soccer's full-time marker — and
   it is also a substring of **`"halftime"`**. Every square on every NFL board would have settled
   against a two-quarter score the moment the half ended. Now `/\bft\b/`. Caught by the halftime
   test in `tests/lib.sportsBingo.nfl-settlement.test.ts`, which failed for exactly this reason.
   *Cross-league impact:* none expected — no other status string in the feed contains a bare `ft`
   token that isn't full-time — but it is the one change in this phase that touches a shared code
   path for all five sports.
2. **A voided square left a card stuck `active` forever.** `refreshSportsBingoProgress` settles a
   loss on `pending === 0`, and `summarizeCard` counted `void` as pending. So a card carrying one
   voided square never settled after Final and its owner was never notified. This has been true on
   every league since voids existed (an NBA prop for a late scratch does it too); Phase 4 would
   have made it *routine* on NFL, where inactive lists mean DNP voids are ordinary. `summarizeCard`
   now returns `voided` separately, so `pending` counts only genuinely-pending squares. A void can
   never become a hit, so once nothing is pending the card is decided.
   *Cross-league impact:* real and intended — NBA/MLB cards that would previously have hung will
   now settle as `lost` and notify. Worth watching the first settlement sweep after deploy for a
   burst of belated "did not win" notifications on old stuck cards.

### What shipped

**`lib/sportsBingo.ts` — the grading substrate:**

- **`NFLGameStatsSnapshot`** — one snapshot per game from up to three calls: `/nfl/v1/games` (score
  + per-quarter columns), `/nfl/v1/stats` (box score), and — **only when a card actually holds an
  Optional-3b square** — `/nfl/v1/plays`. `getNFLGameStatsSnapshot(card, {includePlays})` caches it
  in `nflGameStatsCache` beside its NBA/MLB siblings, and the cache entry records whether plays were
  included so a plays-free snapshot never satisfies a card that needs them.
- **`NFLQuarterScores.quartersCompleted` is the whole answer to handoff note 5.** BDL writes `null`
  both for "shut out in this quarter" and for "quarter not played", and `nflQuartersCompleted()` is
  what separates them: Final → 4; otherwise the status string (`"Halftime"`, `"End of 3rd Quarter"`,
  `"3rd Quarter"`, overtime); otherwise a **deliberately conservative** fallback of "every quarter
  strictly before the last one carrying data". Guessing high would settle a scoreless-quarter square
  on a quarter still being played, so every unknown resolves to `pending`, never to a hit or miss.
  - Plus a data-integrity guard: a game with a **non-zero score and not one populated quarter
    column** reports `quartersCompleted = 0`, which routes every quarter square to `void` rather
    than reading eight `null`s as eight real zeros. A genuinely 0-0 game is excluded from the guard.
    - **Superseded 2026-08-17 (Phase 3 of `docs/prop-bingo-code-review-fix-plan.md`).** The all-or-
      nothing guard missed the *partial* breakdown, which is the case that actually bites. Presence
      is now decided per side by the row's own arithmetic — if the quarters plus overtime do not add
      up to the published score, that side's `null` columns are unknown rather than zero — and
      `wentToOvertime` became tri-state, because a shortfall is either an unpublished overtime
      column or an unpublished quarter and the row cannot say which.
- **`buildNFLPlayDerivedFacts`** — scoring is derived from **score deltas**, not from BDL's
  `type_slug` vocabulary, because arithmetic cannot drift when a provider renames a slug. +3 is a
  field goal and +6/+7/+8 a touchdown (**the extra point is folded into the touchdown
  row — a touchdown usually reads as a delta of 7, not 6**; do not "fix" the `>= 6` test to `=== 6`).
  Slugs answer only what arithmetic cannot: was it a *return* touchdown, was it a fourth-down
  conversion.
  - **The live plays feed contains corrupt rows and the guard against them is not optional.**
    Sampling real 2025 games found (a) a mid-game play carrying `home_score: 0, away_score: 0` in a
    21-14 game, which makes the *next*, ordinary play look like a 21-point score, and (b) stray
    duplicated rows appended after `end-of-game` carrying a first-quarter score. A play's scores are
    therefore accepted only when they move the running total **forwards by at most 8**. With the
    guard, the walk reproduces the real final score in **43/43** archived games; without it, four
    games produce phantom touchdowns.
- **`extractNFLTouchdownScorerName`** — plays carry **no `player_id`**, so `nfl_player_first_td` is
  graded off `short_text` prose. Verified against 35 real touchdowns: a scoring play always *leads*
  with the scorer (`"Mark Andrews 20 Yd pass from Lamar Jackson (Tyler Loop Kick)"`,
  `"Chimere Dike 67 Yd Punt Return (Joey Slye Kick)"`). **Note the trap:** the passing template names
  the **receiver first** and the passer after `from`, which is the *opposite* of the non-scoring
  reception template in BDL's own docs (`"Tua Tagovailoa Pass Complete for 20 Yds to Jaylen Waddle"`).
  An implementation written from the docs' sample credits the quarterback on every passing
  touchdown. Anything that does not parse returns `null` → the square **voids**, never guesses.
- **`getNFLPlayerPropValue`** covers the full Phase 0 §3 allowlist. `kicking_points` is the one
  **derived** entry (`3 × field_goals_made + extra_points_made`); `total_points` remains dead, as
  Phase 0 found. **That formula is still unvalidated against a settled book line** — it is the one
  number in the grader with no empirical check.
- **`nflPlayerTouchdowns`** counts rushing + receiving **+ kick-return + punt-return +
  interception-return + fumble-return** touchdowns. This is a deliberate widening of Phase 0's
  `rushing + receiving` formula: books settle `anytime_td` on any touchdown the player scores, and
  Phase 3 priced these squares off book anytime-TD prices, so the grader has to match the price.
- **18 resolver kinds + NFL `player_prop` are really graded.** The Phase 3/4 seam block in
  `evaluateResolver` is gone, replaced case by case; `evaluateResolver` takes a fifth
  `nflStatsSnapshot` parameter. Every NFL kind that can void on missing data is now registered in
  `isResolverEligibleForVoidRegrade`, so a late-arriving feed reopens the square.
- **`refreshSportsBingoProgress`** branches on `americanfootball_nfl` first, memoizes the snapshot
  per game (keyed by game id *and* whether plays were included), and merges
  `toNFLLiveScoreSnapshot` into the score chain.

**The settlement rules, since they are the part players notice:**

| Square | Hits | Misses | Voids |
| --- | --- | --- | --- |
| prop over / at-least, anytime TD, quarter points, both teams score N+, 2nd half outscores 1st, non-offensive TD, 4th-down conversion, 50+ yd TD | the instant the feed shows it, **mid-game** | at Final | no box score / no plays / player absent from the box score |
| prop under / at-most | at Final | the instant the box score clears the line | same |
| team shut out in a quarter, any quarter scoreless | as soon as a **completed** quarter shows it | at Final | quarter columns absent |
| leads at halftime | as soon as the half is over (a **tie is a miss**, not a void) | " | halftime unknown at Final |
| halftime leader loses | at Final | at Final | **tied at the half** — the one NFL void by design |
| final margin ≤ / ≥ L | Final only (a margin grows *and* shrinks) | Final only | never |
| first score is a FG, first scorer wins, first TD scorer | as soon as the plays fix it | " | plays walk unavailable, or the prose does not parse |

### Live-feed validation (2026-08-16)

New reusable tool: **`npm run bingo:validate:nfl`** → `scripts/validate-nfl-bingo-grading.cjs`.
It replays completed games through the **shipped** `buildNFLPlayDerivedFacts` /
`buildNFLQuarterScores` (imported via the `--conditions react-server --import tsx` pattern, not
re-implemented — a mirrored copy would validate the mirror, not the grader) and exits non-zero on
disagreement. Output archived at `docs/phase0-artifacts/nfl-grading-validation-2026-08-16.txt`.

Over **43 completed 2025 games** (weeks 6, 9, 14):

- play walk reproduces the real final score: **43/43**
- quarter columns (with `null` read as zero) sum to the final score: **43/43**
- first-touchdown scorer parsed from prose: **43/43**

It also reports realized rates against the base rates Phase 3 *priced* — this is Phase 5's
calibration input, and Phase 3's own notes flagged every one of these as a guess:

| Square | Phase 3 priced | Realized (43 games) | Delta |
| --- | --- | --- | --- |
| first score is a field goal | 0.38 | 44.2% | +0.06 |
| first scorer wins | 0.65 | 55.8% | **−0.09** |
| non-offensive touchdown | 0.26 | 16.3% | **−0.10** |
| fourth-down conversion | 0.75 | 83.7% | **+0.09** |
| 50+ yard touchdown | 0.34 | 27.9% | −0.06 |

For reference, unpriced but measured: home team scores every quarter 37.2%, a quarter scoreless for
both teams 23.3%, overtime 4.7%.

`npm run bingo:probe:nfl` was also re-run: tier verdict still **GOAT**, all six endpoints 200.

### Handoff notes for Phase 5

1. **`NEXT_PUBLIC_BINGO_NFL_ENABLED` is now unblocked but deliberately not flipped.** Phase 4 was
   the last thing standing between a good-looking NFL board and a winnable one. The flip is a
   one-line env change in `.env.local` / Vercel (`.env.example` still documents it as off, which is
   correct — that file is the default, not the deploy). It is **not urgent**: NFL Week 1 is
   2026-09-10, so `resolveLeagueSeasonStatus` reports NFL out-of-season until roughly 2026-08-27
   regardless of the flag. The plan's own rollout order (Phase 6) puts the flip behind browser
   verification, and Phase 5's target retune deliberately lands *after* NFL has settled real data.
   **Recommendation: flip it during Phase 6, not before, and audit the first live slate
   square-by-square against the box score as Phase 6 already specifies.**
2. **The five realized rates in the table above are free, measured calibration input for 5b** —
   `bingo:validate:nfl` produces them on demand for any season/week range
   (`-- --seasons 2025 --weeks 1,2,3`). Two are meaningfully mispriced: "non-offensive touchdown"
   is priced ~60% too high and "first scorer wins" ~9 points too high, both of which *inflate*
   board win rate, which is the direction Phase 5 is trying to correct. 43 games is a thin sample —
   re-run over a full season before moving the constants in `lib/sportsBingoOdds.ts`.
3. **Phase 3's handoff note 11 still stands and is still the biggest 5b lever:** the team-total
   ladder emits rungs at 85-93% probability ("Cowboys: under 35.5 points"), which are dead-weight
   squares that inflate board win rate. That is a candidate-*generation* problem, not an estimator
   problem.
4. **Phase 2's caveat still stands:** anchor 5b's correlated simulator on the spread-derived margin
   distribution and treat the de-vigged moneyline gap as a known small discrepancy — do not
   reconcile them by moving the spread.
5. **5b's simulator now has real resolvers to grade against.** The plan's 5c backtest mode ("generate
   boards against completed games and grade them with the real Phase 4 resolvers") is unblocked:
   `buildNFLPlayDerivedFacts` and `buildNFLQuarterScores` are exported, and
   `scripts/validate-nfl-bingo-grading.cjs` is a working example of driving them from a script over
   archived games. The honest limitation from the plan is unchanged — props are live-only, so
   historical boards backtest on team/game/quarter squares plus stat-derived proxies for props.
6. **`kicking_points` is the one grading formula with no empirical check.** `3 × FGM + XPM` — it
   assumes every field goal is worth three, which no NFL rulebook has ever contradicted, but it has
   never been compared against a settled book line. Check it the first time a real `kicking_points`
   square settles.
7. **Player props are STILL unverified against live prop rows.** Carried forward unchanged from
   Phase 2 note 4 and Phase 3 note 3: `/nfl/v1/odds/player_props` returns `200 OK` with **0 rows**
   this far out, so `computeNFLPlayerPropMarkets`'s parsing of `prop_type` / `market.type` / vendor
   count is confirmed only by documentation cross-reference. **Re-run `npm run bingo:probe:nfl`
   within ~48h of Week 1 kickoff (2026-09-10/11) before any venue sees an NFL board.** This is the
   single largest remaining unknown in the whole plan.
8. **`getSquareMetadataForResolver` still returns `generic`/`null` for NFL player squares**, and
   **`resolverProgressPayload` still returns `null` for every NFL kind**, so NFL squares show no
   "3 of 5" progress bar. Both remain optional (carried from Phase 3 notes 7 and 8). Progress bars
   are not free here: MLB's payload works because the current count is persisted *inside the
   resolver JSON* by the webhook path, and NFL has no equivalent — wiring one means either
   persisting box-score values onto the square row each tick or recomputing on read.
9. **The plays walk is capped at 4 pages** (`NFL_PLAYS_MAX_PAGES`, `per_page=100`). Real games ran
   167-206 plays, so 400 is comfortable headroom, but a long overtime game is the case to watch —
   the validator prints `[validate] truncated` if a cap is ever hit.
10. **Call volume per cron tick, measured by the new tests:** one `/nfl/v1/games` + one
    `/nfl/v1/stats` per *game* (memoized across every card holding it — asserted), plus
    `/nfl/v1/plays` only when a board actually carries an Optional-3b square (asserted that it is
    *not* fetched otherwise). Mixed boards for one game can cost two round trips in a tick; the
    module cache absorbs the repeat.
11. **`BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` (default ON) is still the kill switch** for the whole
    3b family. Phase 3 shipped it precisely in case plays-derived grading proved unreliable in
    Phase 4. It did not — 43/43 on every integrity check — so leave it on.
12. **Don't re-derive the availability gate.** `resolveLeagueBlockReason` in
    `lib/leagueSeasonStatus.ts` is still the single place that decides whether a league is usable.
13. **Phase 6's `npm run test:bingo-nfl` tripwire should bundle** `tests/lib.league-season-status`,
    `tests/api.bingo.leagues`, `tests/lib.league-availability`, `tests/lib.sportsBingo-odds`,
    `tests/lib.sportsBingo.nfl-core-squares`, `tests/lib.sportsBingoOdds.nfl-player-props`,
    `tests/lib.sportsBingo.nfl-prop-mix` and `tests/lib.sportsBingo.nfl-settlement`.
14. No Supabase migrations and no schema changes in Phase 4.

---

## Phase 5 — as-built notes and handoff (2026-08-16)

**Status: complete, with one league short of target.** `npx tsc --noEmit`, `npm run lint` and
`npm run build` are clean. `npm run test` is at **4 failures, all pre-existing on `main`** — the
exact four catalogued in this file's Appendix (1 in `tests/admin-mobile.section-registry-split.test.ts`,
3 in `tests/venue-activation.phase4-mount.test.ts`). Nothing new went red; 23 new tests are green.

**NFL is still dark.** `NEXT_PUBLIC_BINGO_NFL_ENABLED` stays `false`. The flip belongs to Phase 6,
exactly as Phase 4's handoff note 1 recommended — nothing in Phase 5 changes that.

### The headline numbers

**NFL boards backtest at a 27% realized win rate** — inside the plan's band. Four independent runs
of 215 boards each over 43 completed 2025 games (weeks 6, 9, 14): 0.242, 0.267, 0.279, 0.298.
99% of generated boards land inside 20–30%.

**The estimator is honest, which is the part that took the work.** Predicted vs realized across
three different targets, same 43 games, with the pre-Phase-5 independent estimator scored on the
*same boards* for comparison:

| Target | Realized | Correlated predicted | Legacy independent predicted |
| --- | --- | --- | --- |
| 0.15 | 0.128 | 0.162 (+0.034) | 0.212 (**+0.084**) |
| 0.25 | 0.267 | 0.255 (−0.012) | 0.263 (−0.004) |
| 0.40 | 0.401 | 0.395 (−0.006) | 0.347 (**−0.054**) |

Mean absolute error **0.017 vs 0.047**. The legacy estimator's error changes *sign* across the
range — it over-prices easy boards and under-prices hard ones — so it is a slope error, not an
offset, and **no value of `BINGO_BOARD_TARGET_WIN_RATE` could have absorbed it.** That is precisely
the trap this phase's own preamble names. Full artifact:
`docs/phase0-artifacts/phase5-estimator-calibration-2026-08-16.md`, raw backtest at
`docs/phase0-artifacts/phase5-nfl-backtest-2026-08-16.json`.

### What shipped

**5a — the target.** `BINGO_BOARD_TARGET_WIN_RATE` default `0.42` → `0.25`; tolerance was already
`0.05`. Both documented in `.env.example`. **The old 0.42 and the new 0.25 are not comparable
numbers** — they are measured by different estimators, and the code comment says so. Don't "restore"
0.42 on its own.

**5b — `lib/sportsBingoCorrelation.ts` (new), the correlated estimator.** A **Gaussian copula**,
not the literal "draw a margin and a total, derive every square" simulator the sketch above
describes. That deviation is forced and is the module's first design note: the literal version needs
a market model, and only NFL has one (Phase 2). Decision 1 applies the target to *all* leagues, so
NBA/WNBA/MLB need the same correction with nothing to simulate from. A copula gets there from the
resolver alone.

- Four latent factors per trial: `zHome`, `zAway` (each team's scoring vs. its implied total),
  `zClose` (how tight the final margin is), and one `zPlayer[k]` per named player. Margin and total
  fall out of the first two as `(zHome ∓ zAway)/√2` and are automatically uncorrelated, which is the
  right assumption for a spread/total pair.
- A square hits when its latent value clears `Φ⁻¹(1 − p)`, so **every marginal probability is
  preserved exactly**. The de-vigged market numbers Phase 2 and Phase 3 worked for are never
  re-derived or perturbed — the copula only changes how squares move *together*. There is a test per
  resolver family for this.
- `zClose` is *derived* from the margin as `Φ⁻¹(2Φ(−|margin|))` rather than drawn. That remap is
  what keeps it exactly standard normal, which is what lets `nfl_margin_at_most` keep an exact
  marginal; a raw `−|margin|` loading would have skewed it. It is uncorrelated with `zHome`/`zAway`
  by symmetry and independent of the total.
- Core markets get `systematic: 1` — under a normal scoring model they genuinely *are* exact
  functions of the two team-score factors. Consequences, all correct and all free: home ML and home
  −3.5 come out perfectly rank-correlated (properly nested), home ML and game-total-over come out
  uncorrelated, home team-total-over sits at 0.71 with home ML.
- **Performance**: a precomputed 16,384-entry stratified normal pool makes a normal draw cost one
  `Math.random()` and one array read — the same price as the old coin flip. Its moments are exact
  rather than sampled, so it adds no bias. This is what keeps a 180-attempt board generation inside
  its old time budget while drawing about twice as many variates per trial.
- Every constant is in one documented block with the correlation it targets written beside it, and
  every one is env-tunable. **They are all recalibration candidates.**

**5b — the correlation cap.** `boardRespectsDirectionalCap`: no line may carry more than
`BINGO_LINE_MAX_SAME_DIRECTION` (default 3) squares sharing one directional bet. Signatures
(`margin±`, `total±`, `close±`) are **derived from the exposure vector, not hand-listed**, so the cap
can never drift out of sync with the model; a team total emits *both* `margin+` and `total+` because
it is genuinely both. Only squares with `systematic ≥ 0.8` count — that admits the core markets,
margin bands, overtime and both-teams-score, and deliberately excludes player props and halftime
leaders at 0.7. Counting props would make the cap bind on nearly every arrangement and push
generation onto its fallback, leaving the cap doing nothing for the core-market stacks it exists to
catch.

`arrangeBoardSquaresForFeasibleLines` applies the cap as a **preference, not a requirement**: if no
arrangement in 120 shuffles satisfies it, the first merely-feasible arrangement is returned. The cap
can therefore only improve a board — it can never introduce an "unable to generate" failure that did
not exist before Phase 5.

**5b — candidate generation, which turned out to matter more than the cap.** Phase 3's handoff note
11 and Phase 4's note 3 both flagged the dead-weight ladder rungs; two changes address them, plus a
third the measurements forced:

1. **A live-probability band for core markets** (`BINGO_CORE_SQUARE_MIN/MAX_PROBABILITY`, 0.18–0.82).
   Spread/total/team-total rungs outside it are sunk to the back of the pool — a preference, not a
   filter, so the templates endpoint still shows the full ladder and a thin pool still fills a board.
   Applied to the **catch-all fill as well as the planned buckets**, which is where they actually
   leaked: a game with no player props leaves eight slots for that fill to satisfy from the whole
   pool. Missing that path left 8.8% of core squares above 0.82 and is what the test caught.
2. **`orderByDifficulty` + an escalating `difficultyBias` in `generateBoardForGame`.** Re-sampling a
   uniformly-shuffled pool cannot reach a target the pool is not centred on. Every 24 fruitless
   attempts the generator leans candidate *selection* (never pricing) toward harder or easier
   squares, depending on which side of the target the best board so far sits, capped at ±0.8. Bias
   stays at exactly 0 — today's byte-identical behaviour — for any board that finds its target
   promptly, which is most NFL and all WNBA boards.
3. **MLB's market-free ladders were using basketball-shaped dispersion.** The shared constants
   (spread 3.2 / game total 8.5 / team total 7.8) are roughly right for basketball and were being
   applied to baseball: 7.8 on a team's runs implies a standard deviation of **14 runs** against a
   real MLB figure near 3. Not conservative — a 4.7x error, and the reason every MLB ladder rung came
   out between 0.38 and 0.62. `MARKET_FREE_*_SCALE` now carries a `baseball_mlb` entry derived from
   published run distributions (team runs σ≈3.1, total and margin σ≈4.4). **NBA/WNBA are untouched.**
   Measured A/B with the difficulty bias in place: in-band share 31.7% corrected vs 11.7% with the
   old constants.

**5c — `scripts/simulate-bingo-boards.cjs` + `npm run bingo:simulate` / `bingo:simulate:backtest`.**
Forward mode reports the predicted distribution per league for the live slate. Backtest mode builds
boards for completed games and settles them with the shipped Phase 4 graders. Both drive the real
pipeline through three narrow new exports — `buildSportsBingoBoardFromBallDontLieGame`,
`gradeResolversAgainstCompletedNFLGame`, `boardStatusesMakeALine` — rather than mirroring it, the
same discipline `scripts/validate-nfl-bingo-grading.cjs` follows. Both modes also print what the
legacy independent estimator would have said about the identical boards, which is how the table
above was produced.

**A finding that changes how backtesting works: balldontlie retains no historical *game* odds.**
`/nfl/v1/odds?season=2025&week=6` returns `200 OK` with **zero rows** — the same live-only behaviour
as player props, verified 2026-08-16. The plan assumed props were the only backtesting gap. So
backtest mode builds a **retrodictive market** per game from both teams' scoring through the
*previous* weeks of that season, shrunk toward the league mean (`NFL_SHRINKAGE_GAMES = 3`) so early
weeks behave. It is leak-free — nothing reads the game being priced or anything after it — and gives
realistic spread/total dispersion, but it is softer than a real closing line, so realized rates from
it are a close estimate rather than a Vegas-grade replay.

**Tests.** `tests/lib.sportsBingoCorrelation.test.ts` (19: probit accuracy and its asymptotes,
marginal preservation across seven resolver families at four probabilities each, an aligned board
beating independence, same-player props correlating more than different-player ones, the team-hint
behaviour, over/under sign symmetry, every directional signature, and the cap accepting/rejecting)
and `tests/lib.sportsBingo.win-rate-calibration.test.ts` (4, end to end over a frozen slate of 12
real completed 2025 games checked in at `tests/fixtures/nfl-completed-games-2025.json`: boards land
in band, the realized rate lands in band, everything settles, and no dead-weight rungs reach a
board).

**Player props now carry a team.** `/nfl/v1/players` already returns it on the row the name join
was reading, so `resolveNFLPlayerProfiles` (new) picks it up for free and `NFLPlayerPropMarket`
gained `teamName`. `buildNFLPlayerPropCandidates` maps it to a board side and sets a `teamHint` on
the square template. **`teamHint` is deliberately not part of the resolver** — resolvers are
snapshotted into `sports_bingo_squares.resolver` at card creation and read back by the grader, so
widening them is a persisted-shape change. It is generation-time metadata; a missing hint costs
realism, never correctness. `resolveNFLPlayerNames` is retained as a thin wrapper, so no existing
caller or test changed.

### The one thing Phase 5 did not deliver: MLB

**MLB boards land at a median 0.33, with only ~32% inside the 20–30% band.** WNBA is at 0.266 with
100% in band; NFL at 0.257 with 99%. NBA had no games on 2026-08-16 and is untested — WNBA is its
closest proxy and it is fine.

This is not a search failure and it is not the estimator. Measured on a real MLB game
(Orioles/Rays, 2026-08-16), with the corrected dispersion in place and the difficulty bias escalated
to its cap, the *hardest board buildable in 180 attempts* still had a median of 0.31. Three causes,
in order of size:

1. **The achievement block.** With `/mlb/v1/player_props` currently returning 404, an MLB board fills
   with **6.3 `mlb_webhook_team_event_at_least` squares priced around 0.61** — the single biggest and
   easiest block on the board. Worse, `pickCandidateSet`'s MLB named-player weighting deliberately
   *prefers likelier* events (`base = clamp(item.probability, …)`, plus a 1.45x star boost) because
   likelier events are more fun. Phase 5 flips that weight when the difficulty bias is positive, but
   the 2-per-family cap then forces breadth over difficulty and the block stays easy.
2. **No market model.** MLB probabilities are hand-picked sigmoids, not a consensus. Phase 5
   corrected their *dispersion* but they remain invented numbers.
3. **The raw-implied-odds vig bug** flagged in Phase 2's handoff note 2 — MLB's prop path uses raw
   implied odds and therefore overstates every prop square. Untouched here; it is pre-existing and
   out of scope, and props are 404 today anyway.

**This was deliberately not "fixed" by pushing further.** Getting MLB to 25% from here means changing
what an MLB board is *made of* — dropping or re-weighting the team-event achievement block — and that
is a product decision about the character of MLB boards, not a calibration one. It belongs with
Andrew, and the plan's Phase 6 already owns the per-league post-slate audit.

### Handoff notes for Phase 6

1. **`NEXT_PUBLIC_BINGO_NFL_ENABLED` is still `false` and Phase 6 owns the flip**, behind the browser
   verification this plan's Phase 6 section already specifies. `resolveLeagueSeasonStatus` reports
   NFL out-of-season until roughly 2026-08-27 regardless, and Week 1 is 2026-09-10.
2. **Phase 4's handoff note 7 is still the single largest unknown in the whole plan, and Phase 5 did
   not touch it.** `/nfl/v1/odds/player_props` still returns `200 OK` with 0 rows this far out, so
   `computeNFLPlayerPropMarkets`'s parsing of `prop_type` / `market.type` / vendor count remains
   confirmed only by documentation cross-reference. **Re-run `npm run bingo:probe:nfl` within ~48h of
   Week 1 kickoff before any venue sees an NFL board.** Phase 5 adds a second reason: props are the
   eight squares the backtest cannot cover, so the 27% realized figure is measured on a board that is
   two-thirds of the real thing.
3. **`npm run bingo:simulate` is the audit tool Phase 6 asks for.** Forward mode gives the per-league
   predicted distribution in one command; backtest mode gives realized rates over any season/week
   range (`-- --backtest --seasons 2025 --weeks 1,2,3`). Phase 6's "post-slate audit: realized win
   rate per league vs the 20–30% band" is exactly `--backtest` over the settled slate.
4. **Phase 6's `test:bingo-nfl` tripwire should add two files** to Phase 4's list of eight:
   `tests/lib.sportsBingoCorrelation` and `tests/lib.sportsBingo.win-rate-calibration`.
5. **MLB is the open item, and it now has a written plan: Phase 7.** See the section above for the
   diagnosis and Phase 7 for the work. The short version is that the team-event squares are
   mis-*specified* rather than mis-selected — their thresholds are set so low the events are close to
   automatic — so the fix is re-thresholding them against measured base rates, not re-weighting the
   selection. The larger fix behind it, still unwritten, is a Phase-2-style odds consensus for MLB,
   which would retire the hand-picked sigmoids *and* the raw-implied vig bug in one go. Do not chase
   MLB with the target knob — 5a's number is global.
6. **The correlated estimator leans ~1.5 points below realized on NFL**, consistently across four
   runs though well inside sampling error. If a full-season backtest confirms it, the lever is
   `BINGO_CORR_PLAYER_PROP_SYSTEMATIC` and its neighbours in `lib/sportsBingoCorrelation.ts`, not the
   target. Re-measure over a full season before moving anything.
7. **Player-prop team hints are NFL-only.** NBA and MLB player squares pass `teamHint: null` and fall
   back to a symmetric game-pace loading, which understates the prop-vs-team-total correlation. The
   NBA/MLB builders do have a `teamSide` available on their stat-line snapshots; wiring it through is
   a small, isolated improvement if a per-league audit shows those leagues mispredicting.
8. **The realized-rate test's band is wider than the plan's 20–30% on purpose.** The frozen 12-game
   slate settles at 0.275 ± 0.021 over 12 repeats, so the assertion is ±4 standard deviations of the
   measured value. Asserting the plan's literal band there would fail roughly one run in eight
   without meaning anything. If you tighten it, re-measure the deviation first.
9. **Optional 3b squares are switched off inside the calibration test** (via `vi.stubEnv` before a
   dynamic import — the flag is read at module load). They settle off a `/nfl/v1/plays` walk and
   checking in ~2,000 play rows would bloat the fixture; that family already has 43/43 coverage from
   `npm run bingo:validate:nfl` and is covered end to end by `bingo:simulate --backtest`.
10. **`estimateBoardWinProbability` (the no-trials variant) is gone**, folded into
    `estimateBoardWinProbabilityWithTrials`, which now **requires a resolver per square** — an
    estimate cannot be made from a bare probability any more. Card creation
    (`createSportsBingoCard`) was moved onto it too, so the number shown in the preview, the number
    the generator optimises against, and the number persisted to `sports_bingo_cards.board_probability`
    are all the same quantity.
11. **Cards already issued keep their boards and their stored `board_probability`.** Nothing in this
    phase rewrites existing rows. Newly generated boards get harder across every league — per
    decision 1, and worth the player-facing note the plan's risk table already suggests.
12. **`SportsBingoResolver` is now exported as a type.** It exists so
    `lib/sportsBingoCorrelation.ts` can describe exposures without importing this module's runtime;
    `import type` is erased, so there is no cycle even though `sportsBingo.ts` imports the
    correlation module for values. Keep it that way.
13. No Supabase migrations and no schema changes in Phase 5.

---

## Phase 6 — as-built notes and handoff (2026-08-16)

**Status: complete, with the NFL flag deliberately left off.** All of Phase 6's mechanical checks
are green; the one thing this phase could not do is watch a real NFL board render, because no NFL
game is inside the season-status lookahead window yet (see below) — that part is now Phase 6's
own unfinished business, carried forward explicitly rather than declared done on partial evidence.

### What was verified

**Static checks — all clean, on the working tree as it stood at the start of this phase (Phases
1–5, uncommitted):**
- `npm run test` — **exactly the 4 pre-existing failures** catalogued in this file's Appendix
  (1 `admin-mobile.section-registry-split`, 3 `venue-activation.phase4-mount`), nothing else red.
  Appendix Phases A/B are still open — see the note below on why they weren't folded into this
  phase.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean, full route manifest, no new warnings.
- **New tripwire `npm run test:bingo-nfl`** added to `package.json`, bundling the exact ten files
  Phase 4's handoff note 13 and Phase 5's handoff note 4 specified: `tests/lib.league-season-status`,
  `tests/api.bingo.leagues`, `tests/lib.league-availability`, `tests/lib.sportsBingo-odds`,
  `tests/lib.sportsBingo.nfl-core-squares`, `tests/lib.sportsBingoOdds.nfl-player-props`,
  `tests/lib.sportsBingo.nfl-prop-mix`, `tests/lib.sportsBingo.nfl-settlement`,
  `tests/lib.sportsBingoCorrelation`, `tests/lib.sportsBingo.win-rate-calibration`. Green on the
  first three runs; **flaky on a fourth** — see the flakiness note below, not fixed here.

**Browser verification — real Playwright pass against a real dev server with real BDL data, not a
mock.** Since `resolveLeagueSeasonStatus` reads the actual clock and the actual live feed with no
test-override hook (confirmed by reading `lib/leagueSeasonStatus.ts`), this required an actual
second `next dev` instance with both flags set for real, rather than stubbing anything:
- Ran a second dev server (port 3055, `.next-verify` dist dir via a **temporary** `next.config.ts`
  edit reverted immediately after — `git status` confirms the working tree is byte-identical to
  before this phase started except for `package.json`'s new script) with
  `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED=true NEXT_PUBLIC_BINGO_NFL_ENABLED=true`, and a real
  test user/venue (`3be3b704-1696-4097-817f-abefff808b51` / `venue-pacific-street`) authenticated
  via `scripts/print-test-auth-cookies.cjs`, per `CLAUDE.md`'s auth-storage contract.
- **`GET /api/bingo/leagues` confirmed live, real response:** NBA `out_of_season · Returns October
  2026`, NFL `out_of_season · Returns September 2026`, WNBA and MLB both `in_season`. This is the
  real calendar fallback firing for NBA (genuinely off-season in mid-August) and the real
  flag-plus-calendar path firing for NFL (flag on, but the live feed has no Week 1 game inside the
  14-day lookahead yet, so it falls to the Sept 1 calendar window) — not a canned fixture.
- **Picker UI confirmed live and screenshotted:** NBA and NFL rows render disabled
  (`disabled=true` on the `<button>`, confirmed via the DOM, not just visually) with the correct
  `OUT OF SEASON · RETURNS <month>` badge; WNBA and MLB rows render enabled and clickable. This is
  exactly the plan's own Phase 6 checklist item ("out-of-season NBA is greyed and unclickable").
  Screenshot on file in the session transcript (not committed — throwaway verification artifact).
- **Board generation + landscape render: NOT verified live, and here's exactly why, checked three
  independent ways, not assumed:**
  1. `GET /api/bingo/games?sportKey=baseball_mlb` / `basketball_wnba` both returned `games: []` at
     verification time (Sunday 2026-08-16, ~8:20pm ET).
  2. Queried balldontlie directly for MLB: every game dated 2026-08-16 was `STATUS_FINAL` except
     one `STATUS_IN_PROGRESS`; the next scheduled games are dated 2026-08-17 (tomorrow). WNBA had
     zero games at all on 2026-08-16.
  3. `npm run bingo:simulate` (forward mode) — the plan's own audit tool — corroborates from a
     third angle: `games: 0` for all four leagues at that instant.
  This is **the real product doing the real, correct thing**: `listSportsBingoGames` only shows
  today's not-yet-started games (`isLocked` excluded), and every one of today's games had already
  either finished or tipped off. It is a Sunday-evening scheduling gap, not a bug — the empty-state
  copy ("No upcoming games are available right now") that Phase 1/2/3's handoff notes closed out
  is exactly what rendered, correctly. **I deliberately did not fabricate a workaround** (e.g.
  seeding a fake game into the client cache for an already-started/finished game) because
  `readSelectedBingoGame`'s own TTL/`startsAt > now` check exists specifically to prevent exactly
  that — bypassing it to force a screenshot would validate a state the product is designed to
  never reach.

### What's still open — read this before flipping the flag

1. **The board-render + landscape screenshot is genuinely unverified, and needs a live re-run at a
   better time.** Best next window: any weekday afternoon/evening before first pitch, when MLB or
   WNBA has a real not-yet-started game — should work on essentially any day this week. Re-run the
   exact same Playwright pass (dev server + both flags + the same test user); it should take
   under 10 minutes once a game exists. This is the one item that was in Phase 6's original
   checklist and is not done.
2. **NFL itself cannot be exercised this way at all yet — that's expected, not a gap in this
   phase's work.** `resolveLeagueSeasonStatus` will keep reporting NFL `out_of_season` until
   roughly **2026-08-27** (14 days before Week 1's 2026-09-10 kickoff, per the live-feed lookahead
   window observed in Phase 0/2/3). Before then, there is no way to see a real NFL row become
   selectable short of faking the clock or the BDL response — which this phase declined to do for
   the same reason as above (validating a state the product doesn't reach today would prove
   nothing about production). **Re-run the full picker + board-generation + landscape Playwright
   pass, this time with NFL specifically, any time after 2026-08-27** — that's when
   `NEXT_PUBLIC_BINGO_NFL_ENABLED=true` will actually produce a selectable NFL row against real
   data for the first time.
3. **Do not flip `NEXT_PUBLIC_BINGO_NFL_ENABLED` (or `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED`) in
   `.env.local` or Vercel from this phase's work.** Both stay off in `.env.example`, correctly.
   The plan's own rollout order (top of this file) puts the flip behind browser verification, and
   item 1 above is verification that didn't happen. Flip NFL only after both (a) a real NFL row is
   confirmed selectable live per item 2, and (b) a real generated board is confirmed to render
   correctly in landscape per item 1 — ideally the same pass, once both conditions are true
   together after 2026-08-27.
4. **~~`npm run test:bingo-nfl` is flaky on `win-rate-calibration.test.ts`'s first assertion.~~
   RESOLVED — verified closed 2026-08-17.** A later phase already fixed this: the bound in
   `tests/lib.sportsBingo.win-rate-calibration.test.ts` ("generates every board inside the 20-30%
   target band") was widened from `< 0.05` to `< 0.06`, with a measured justification in the test's
   own comment (over 12 repeats of the slate the out-of-band share lands at 0.031 ± 0.0065, so the
   old 0.05 bound sat only 3 SD out and the new one sits at 4 SD). The comment also records that the
   codebase has **no RNG-seeding convention for Monte Carlo tests** — checked — which is why
   widening with measured data was taken over seeding.

   **Confirmed empirically, not just by reading the comment:** 10 consecutive runs of that file,
   10/10 green. The MLB sibling (`tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts`, "predicts
   every board inside the 20-30% target band") still carries a bare `< 0.05` bound, so it was
   instrumented and measured over 12 repeats as well: out-of-band share is **0.0053 ± 0.0048, max
   observed 0.0128** — roughly 9 SD inside its bound, and 10/10 green over 10 consecutive runs.
   **It is not flaky and was deliberately left alone**; widening a bound that is nowhere near its
   edge would only weaken a real assertion. Do not "fix" it.

5. **Appendix Phases A and B (the 4 pre-existing `main`-branch failures) were deliberately left
   alone.** The Appendix's own closing note recommends doing them before Phase 3 for a clean
   baseline; that ship sailed three phases ago and Phase 6 is verification/rollout for Prop Bingo
   specifically, not a good moment to pick up unrelated admin-mobile/venue-activation test debt.
   Nothing about Phase 6 depends on them being fixed — they're irrelevant to the four `npm run
   test:bingo-nfl` runs and to the build. Still worth doing at some point; just not folded in here.
6. **The post-slate audit `npm run bingo:simulate -- --backtest` and the live forward-mode run are
   both wired and working** (confirmed: forward mode ran clean above, backtest mode was already
   exercised in Phase 5). Nothing further to build here — the tool Phase 6's own plan text asks
   for ("post-slate audit: realized win rate per league vs the 20–30% band") already exists and
   works; running it against the real Week 1 slate is a Phase 7-or-later action item once real
   games have been played, not a code task.
7. No Supabase migrations, no schema changes, and no product code changes in Phase 6 — the only
   tracked diff from this phase is `package.json`'s new `test:bingo-nfl` script. `next.config.ts`
   and `tsconfig.json` were touched transiently for the second dev-server instance and reverted
   before finishing; confirm with `git status` if picking this up cold, since a stray leftover
   `distDir` edit would be a real (if harmless) bug to catch before it ships.

### Recommended order for whoever picks this up

1. Any day this week: re-run the browser pass for WNBA/MLB board-generation + landscape render
   (item 1). This closes out the one thing genuinely missing from Phase 6's own checklist.
2. On/after 2026-08-27: re-run it again including NFL specifically (item 2), then decide on the
   flag flip (item 3) — this is the actual go/no-go moment for the plan's headline ask.
3. Whenever convenient, independently: fix the `win-rate-calibration` flake (item 4).
4. Phase 7 (MLB rebalancing) is unblocked and can happen in parallel with any of the above — it
   touches none of this phase's surface.

---

## Phase 7 — as-built notes and handoff (2026-08-17)

**Status: complete.** `npm run test` shows **exactly the 4 pre-existing failures** from the Appendix
below (1 `admin-mobile.section-registry-split`, 3 `venue-activation.phase4-mount`) and nothing else;
`npx tsc --noEmit`, `npm run lint` and `npm run build` are all clean. `npm run bingo:simulate --
--sports baseball_mlb` reports **mean 0.2683, `inTargetBand` 1.00**, from 0.3191 / 0.345 before —
which is 7c's target ("comparable to WNBA's 1.00 and NFL's 0.99") met.

Full before/after artifacts: `docs/phase0-artifacts/phase7-mlb-rebalance-2026-08-17.md` and
`docs/phase0-artifacts/mlb-event-rates-2026-08-17.json`.

### The product-tension question was put to Andrew and answered

The plan says to get a read before 7b, and that happened with the measured numbers in hand. **Andrew
chose the full rebalance to 0.35–0.55** — MLB in the 20–30% band with the other leagues, accepting
that squares light up later. Andrew also approved fixing the two pre-existing data-feed bugs found
during 7a (below), on the condition they were measured as their own step. Both were.

### 7a — what the measurement actually found

`scripts/measure-mlb-event-rates.cjs` (new, `npm run bingo:measure:mlb`) over **1,138 team-games**
from 569 completed regular-season games, 2026-07-03 .. 2026-08-16. Two findings, and the second one
overturned the plan's design for 7b.

**1. Every shipped square was easier than priced, and by more than the plan estimated.** The block's
real mean is ~0.71, not the 0.613 the plan measured off assigned probabilities. `4+ groundouts`
settles **0.969**. `5+ strikeouts` settles **0.917**. Hit-by-pitch was the only honest one (0.38
priced, 0.338 real) and is deliberately left near where it was.

**2. `impliedHomeTotal` / `impliedAwayTotal` cannot scale these thresholds, and a team's own form
cannot either.** The plan's 7b is wrong on both counts, checked rather than assumed:

- **MLB has no market model at all.** `buildGameAndCandidatesFromBallDontLie` builds one only for
  NFL. For MLB, `averageTotal` and `averageHomeSpread` are the hardcoded constants 8 and -3.5, so
  `impliedHomeTotal`/`impliedAwayTotal` are **5.75 and 2.25 for every MLB game ever played**.
  Scaling on them would have been decoration over a constant, and would have looked like it worked.
- **A team's own trailing form does not predict its own counts** (|r| = 0.02–0.10; for hits it is
  *negative*). What predicts them is **the opposing staff's trailing rate allowed** — r = 0.15–0.29
  across all six events, with a tercile spread large enough to move a threshold two rungs (facing a
  top-third strikeout staff moves P(8+ Ks) from 0.46 to 0.73).

So the per-game input shipped here is the opponent's trailing rate allowed, which costs no extra
request: it is the *other* side's counts in the `/mlb/v1/stats` rows the builder already fetches, and
before Phase 7 those rows were being filtered away before anyone looked at them.

**`quick_out_under_3_pitches` was left exactly as it was**, per the plan's own instruction. It is
derived from our webhook stream, has no balldontlie column, and one square of fourteen is not worth
a guessed threshold.

### 7b — how a threshold is now chosen

`lib/mlbTeamEventRates.ts` (new) holds the measured table and the pricing. Per event per team:

1. Predict the team's rate: `leagueMean + opponentSlope * (opponentAllowedRate - opponentMean)`,
   with the predictor bounded at ±2 SD and the adjustment shrunk by `games / (games + 6)`. No
   opponent history → the league mean, and the square prices as if there were no per-game input.
2. Price `P(X >= n)` from a **negative binomial** fitted to the measured mean and variance by
   moments. Poisson was rejected on evidence (variance runs ~1.44× the mean for hits, ~1.25× for
   walks). The fit reproduces the measured table to within **0.014 for five of six events** (0.042
   for groundouts, which are under-dispersed and take the Poisson branch) — the measurement script
   prints fit-vs-measured side by side so this stays auditable.
3. Emit up to **three rungs** at targets 0.55 / 0.45 / 0.35, deduplicated, dropping anything outside
   0.10–0.90.

**The threshold moves, not the difficulty.** A lineup facing a strikeout-heavy staff is asked for
`10+ strikeouts` where another gets `8+`, both priced near the same target. That is the honest form
of "scales with the game": the square stays as hard as it claims while the number on it reflects the
game being played.

Live boards on 2026-08-17 carry **7–10 of 24** squares from the block (6.3 before), so it was
re-priced rather than priced off the board. Labels render the new thresholds with no further work,
exactly as the plan predicted.

### The two pre-existing bugs found during 7a — both fixed, both measured separately

These were live defects in the MLB path, unrelated to thresholds, found because 7a needed the same
feed. Verified against the live API on 2026-08-17.

**Bug 1 — `/mlb/v1/games` and `/nfl/v1/games` silently ignore `start_date`/`end_date`.** They do not
error. They return the **oldest rows in the archive** as though no filter had been applied — year-2000
spring training for MLB, 2002 for NFL. `dates[]` is the parameter those endpoints honour. NBA and
WNBA honour both, which is why this never showed up before. Consequence: the MLB candidate builder's
"last 21 days of form" was reading **26-year-old spring training games**.

Fixed via `buildBallDontLieDatesQuery` (`lib/sportsBingo.ts`, delegating to the existing
`dayKeysForWindow`) at the two MLB call sites. **See "still open" item 1 — three more call sites have
the same bug and were deliberately not touched here.**

**Bug 2 — three `/mlb/v1/stats` field names never matched the API.** The live payload uses terse
keys; the code read spellings that do not exist on it, so `parseStatNumber` returned 0 every time:

| Code read | Actual field | Effect |
| --- | --- | --- |
| `row.strikeouts ?? row.so` | `k` | every batter strikeout aggregated to zero |
| `row.pitcher_strikeouts ?? row.p_strikeouts ?? row.so_pitcher` | `p_k` | every pitcher strikeout zero — **including in the live settlement snapshot**, so `player_strikeouts_pitcher` squares could never settle true |
| `row.hits_allowed ?? row.ha` | `p_hits` | hits-allowed zero |

Fixed at both the candidate-builder and the settlement-snapshot call sites, with the real field first
and the old spellings kept as fallbacks. A fourth, smaller issue was fixed in passing:
`plateAppearances` was adding walks and hit-by-pitches on top of `plate_appearances`, which already
counts them — the addition now applies only to the `at_bats` fallback.

**Measured on its own, as agreed:** the bug fixes alone moved MLB from 0.3191 / 0.345 to
**0.3286 / 0.273** — i.e. they made the band share *worse*, which is the expected direction and is
why they were measured separately. Correct recent data yields more player-prop candidates than
26-year-old data did, priced by the same optimistic estimator; the band only lands once the
thresholds are fixed too. Do not read that middle row as a regression.

### New surface

| File | What it is |
| --- | --- |
| `lib/mlbTeamEventRates.ts` | Measured rate table + negative-binomial pricing + rung selection. The one place to edit when re-measuring. |
| `scripts/measure-mlb-event-rates.cjs` | 7a. `npm run bingo:measure:mlb`. Marginal distributions, NB fit vs measured, and the three-predictor regression. |
| `tests/lib.sportsBingo.mlb-event-rebalance.test.ts` | 11 tests on the pricing module. |
| `tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts` | 7 tests, real slate settled by real graders. |
| `tests/fixtures/mlb-completed-games-2026.json` | 13 completed games, margins 1–6, final scores + real per-team event totals. 6.9 KB. |
| `npm run test:bingo-mlb` | Tripwire bundling the two test files, mirroring `test:bingo-nfl`. |
| `gradeResolversAgainstCompletedMLBGame` | Exported grading seam, the MLB counterpart to the NFL one. |
| `buildSportsBingoBoardWithResolvers` | Exported board builder that runs the **async** candidate path and keeps resolvers attached. |

Two deviations from the plan's text worth knowing:

1. **The MLB calibration slate is a separate file, not an extension of
   `tests/lib.sportsBingo.win-rate-calibration.test.ts`.** An MLB board is mostly the team-event
   block, which is assembled asynchronously from `/mlb/v1/stats`, so the slate has to mock
   `@/lib/ballDontLieClient` — and `vi.mock` is file-scoped, so putting it in the NFL file would drag
   the currently mock-free, network-free NFL slate through the same stub.
2. **`buildSportsBingoBoardWithResolvers` had to be added** because
   `buildSportsBingoBoardFromBallDontLieGame` only sees the synchronous core-market candidates, and
   `generateSportsBingoBoard` deliberately strips resolvers from its client-facing payload (it should
   stay that way — the resolver is grading internals). Measuring an MLB win rate through either would
   have measured a board no player is ever dealt.

### Phase 6's flaky test is fixed (its handoff item 4)

`win-rate-calibration`'s "generates every board inside the 20-30% target band" tripped every few
runs. The codebase has **no RNG-seeding convention** for Monte Carlo tests (checked — the three test
files using `Math.random` all use it raw), so this took Phase 6's stated alternative: widen the bound
with a measured justification, the same discipline its neighbour already used. Over 12 repeats of the
whole slate the out-of-band share lands at **0.031 with SD 0.0065**, so the old 0.05 bound sat only
3 SD out. It is now 0.06, which is 4 SD. Five consecutive green runs after the change.

### What is still open

1. **Three more call sites still pass `start_date`/`end_date` to endpoints that ignore them, and one
   of them is worse than what Phase 7 fixed.** Deliberately not touched: two of them span leagues
   (NHL, MLS, EPL and the other soccer feeds) that are out of season right now, so a blind swap could
   not be verified, and changing NFL behaviour mid-rollout is exactly the "two things at once" the
   plan warns against. `buildBallDontLieDatesQuery` already exists for whoever picks this up.
   - `lib/sportsBingo.ts:~2615` — the **NFL** per-card stats lookup. Same bug, same league as the
     pending flag flip. Worth doing before that go/no-go.
   - `lib/sportsBingo.ts:~8165` — `getScoresBySportKey`, the **live score source for settlement**,
     for every league. For MLB and NFL this currently fetches year-2000/2002 games. See item 2.
   - `lib/fantasy.ts:1404` — not investigated; flagged only because it matches the pattern.
2. **MLB core-square settlement looks broken through two further layers, independent of anything
   Phase 7 changed. This is the most important thing in this list and it was not in scope.** Traced,
   not fixed:
   - `pickBestMatchingBallDontLieGame` (`:1822`) reads only `game.visitor_team`. MLB and NFL payloads
     use `away_team`. The codebase already knows this — line 1180 does `event.visitor_team ??
     event.away_team` — but this function does not, so the away-team name comes back empty and the
     match **always fails** for MLB.
   - `getScoresBySportKey` (`:8172`) reads `visitor_team_score` / `home_team_score`. The MLB payload
     carries runs at `home_team_data.runs` / `away_team_data.runs`.
   Net effect to verify: MLB cards may reach the force-finalize window with a null score rather than
   settling from the real one. **The team-event squares Phase 7 re-priced are not affected** — they
   settle by counting webhook events through `applyMlbWebhookPropEvent`, which is a separate path —
   but the moneyline/spread/total squares on the same board plausibly are. Confirm against a real
   settled MLB card before assuming either way.
3. **`quick_out_under_3_pitches` is still an unmeasured constant** (0.58, threshold 1). Measuring it
   needs either enough settled `sports_bingo_squares` history carrying that resolver, or webhook
   instrumentation. It is one square of the block and was correctly deferred, not forgotten.
4. **MLB named-player squares are absent in production.** Live generation on 2026-08-17 logs
   `named_candidate_pool_size: 0` and `mlb_player_achievement_shortfall { selected: 0, desired: 2 }`
   on every board — `/mlb/v1/player_props` 404s, and the historical-stat path is not filling the gap
   even now that it reads real recent games. This is why the team-event block is the whole
   achievement bucket. Phase 7 deliberately did not touch the named-player weighting (the plan
   forbids changing it in the same change), but somebody should find out why that pool is empty.
5. **The base rates are a 45-day summer window and will drift.** Re-run `npm run bingo:measure:mlb --
   --days 45 --json`, archive it, and update the table in `lib/mlbTeamEventRates.ts` — do not
   hand-adjust a constant. Worth doing at least once per season, and once after any rule change that
   moves league offence.
6. **The product tension is now real and unobserved.** Andrew chose harder squares knowing cards
   light up later. Nobody has yet watched an MLB board under the new thresholds on a screen for a
   full game. If it feels dead in the first hour, the lever is `MLB_TEAM_EVENT_RUNG_TARGETS` in
   `lib/mlbTeamEventRates.ts` — **not** `BINGO_BOARD_TARGET_WIN_RATE`, which is global and would
   break the three leagues that are now correct.

### What Phase 7 did not touch, on purpose

`mlbResolverFamilyKey`'s 2-per-family cap (unchanged, and more load-bearing now that there are
multiple rungs per event); `pickCandidateSet`'s named-player weighting; `evaluateResolver`'s
`mlb_webhook_team_event_at_least` case (a bare `currentCount >= threshold`, which needed nothing);
`isMlbFallbackEventSquare`; `BINGO_BOARD_TARGET_WIN_RATE`; and the NFL/WNBA/NBA paths, confirmed
unmoved by the all-league simulate run in the artifact file. No Supabase migrations, no schema
changes. Active cards are safe without one: `resolverKey` embeds the threshold, so re-thresholded
squares get new keys and cannot collide with squares already snapshotted onto issued cards.

**Model: Opus 5 · effort: high.**

---

## Phase 8a — as-built notes and handoff (2026-08-17)

**Status: complete**, as scoped — the plan's 8a deliverable is "probe the five unknowns, then
measure a base rate per candidate square," and that's what shipped. **8b (implementation) and 8c
(recalibration) were not started** — this phase deliberately touches no resolver, no
`SportsBingoResolver` union member, no board-mix constant, and no test file. `npm run test`,
`npx tsc --noEmit`, and `npm run lint` were not re-run as part of this phase because nothing they
cover changed; the only new surface is a probing script and two docs.

Full detail, all five answers with their evidence, and the complete base-rate tables (with a
"measured vs. intended feel" column for every one of the ~44 gradable candidate squares) live in
**`docs/prop-bingo-nfl-phase8a-findings.md`** — this section is the short version for someone
scanning the plan, not a replacement for that file.

### The headline finding wasn't one of the five questions

While assembling the season game list for the base-rate measurement, the probe found that
**`/nfl/v1/team_stats` and `/nfl/v1/stats` return zero rows for all 13 games of the 2025
postseason**, despite those games showing `status: "Final"` with real final scores on
`/nfl/v1/games`. Checked individually per game, not just observed in a batch call that could have
silently dropped them. This is a pre-existing gap in the Phase 3/4 surface, not something Phase 8
caused, and it means every Tier 1/2 flavor square — plus the already-shipped player-prop candidates
and settlement path — cannot grade a postseason NFL board today. **Not fixed here**, matching the
plan's own discipline (Phase 7's two bugs were measured, not silently patched, while doing
something else). Base rates below are therefore measured on the **272-game regular season only**.

### The five unknowns, in one line each (full evidence in the findings doc)

1. **Team_stats mid-game population — unanswered, and structurally so.** Archived data cannot
   distinguish "populated live" from "populated only at Final," because BDL keeps no mid-game
   snapshot history to replay. The findings doc has the exact two-API-call live check to run once a
   real NFL game exists to check against it (earliest 2026-09-10). **This is the one open decision
   that changes 8b's board-mix cap** — 3 Tier-1 squares if Final-only, more if live.
2. **Sack orientation — answered: `sacks` is sacks *taken*, not sacks *made*.** 370 of 378 team-
   games with an unambiguous defensive-sack split matched "opponent's summed defensive sacks";
   only 4 matched the team's own defense. Square 20 is unblocked with no field inversion needed.
3. **`red_zone_scores` semantics — answered: touchdowns only, never all points.** Zero violations
   across 533 team-games where a team's red-zone scores exceeded its total touchdown count. One
   real bug found in the plan's own square 10 sketch: `red_zone_attempts > red_zone_scores` also
   fires on a red-zone turnover or failed set of downs, not just a field goal — it overcounts what
   the square's label claims. 8b should rename the square rather than ship a proxy that's wider
   than its own text.
4. **Defensive rows in `/nfl/v1/stats` — answered: yes, and richly.** Tackle/sack/pass-defended
   fields are populated broadly (11,487 of 17,777 rows, every defender who played gets a real `0`
   rather than `null`); interception fields are populated narrowly (367 rows, only for a player who
   actually intercepted a pass — 366 of 367 non-zero). Squares 32–34 are all unblocked, but 34
   needs `rows.some(...)`, not an assumption that every defender carries an interception field.
5. **`home_win_probability` — partially answered.** 98.2% populated across a 16,256-play sample of
   *archived* games, which proves BDL retains it, not that it's live during play. Same live check
   as #1 resolves this too; the plan is right to flag it as the one vendor-model field here.

### Base rates: what changed since the plan's table

Roughly half the ~44 measured squares land meaningfully off the "coin-flip / lean-lock / long shot"
feel the plan sketched for them — expected, and exactly why the plan insisted on measuring before
designing. Some examples worth knowing before 8b picks thresholds: `penalties >= 3` is 94.1% (not
a coin-flip — needs `>=7` or higher), `punts_inside_20 >= 1` is 95.6% (not a lean-lock — nearly
automatic), `total_tackles >= 10` for any defender is 79.0% and `defensive_interceptions >= 1` is
78.7% (both nearer lean-locks than the coin-flips the plan sketched, now that Q4 has unblocked
them). The full table in the findings doc has a per-square read and, where the plan's exact
threshold missed, a rough corrected number. **8b's job is to read thresholds off these curves, not
to re-guess a second unvalidated number** — that would repeat the exact failure mode Phase 4's
retrospective already measured at 40%.

### New surface

| File | What it is |
| --- | --- |
| `scripts/probe-nfl-flavor-squares.cjs` | New. `npm run bingo:probe:nfl-flavor`. Answers the five unknowns and tabulates base rates for every Tier 1/2/3 candidate. Self-contained (no project TS imports), same convention as `probe-nfl-bingo.cjs`. |
| `docs/prop-bingo-nfl-phase8a-findings.md` | New. Full findings, evidence, and base-rate tables. |
| `docs/phase0-artifacts/phase8a-nfl-flavor-squares-2026-08-17.json` | New. Raw output archived per the plan's own convention. |

One bug worth flagging for anyone extending the script: `/nfl/v1/plays` paginates with
`cursor`/`next_cursor`, **not** `page`/`next_page` — an earlier draft of this script used the wrong
pair and silently truncated every game's plays at 100 rows (page 1 only), which produced a
`score_last_2min_fourth` rate of exactly 0.000 across 90 games before the fix. That number looking
suspiciously round is what caught it. `lib/sportsBingo.ts`'s own `/nfl/v1/plays` fetch already uses
`cursor` correctly — worth checking against production code next time an endpoint's pagination
convention is assumed rather than confirmed.

### What's still open (also in the findings doc, repeated here for the plan's own tracking)

1. **Q1 and the live half of Q5** — needs a real NFL game. Earliest 2026-09-10.
2. **The postseason stats gap** — pre-existing, bigger than Phase 8, not fixed here. Whoever flips
   `NEXT_PUBLIC_BINGO_NFL_ENABLED` should know postseason boards currently can't settle player-prop
   or flavor squares.
3. **Square 10's proxy measures the wrong thing** (see finding 3 above) — rename or rebuild before
   shipping it.
4. **Tier 3 is measured on a 90-game sample, not the full 272**, because each game costs up to 4
   paginated `/plays` calls. 90 is roughly 2x Phase 4's own "thin" 43-game sample, but 8b should
   decide whether to spend the extra calls (`--tier3-sample 272`) before locking Tier-3 thresholds.
5. **These are single-season (2025) rates and will drift** — re-run before trusting them a year out.

**Model: Sonnet 5 · effort: medium**, as the plan specified. No Opus escalation was needed — the
plan's stated trigger ("Q1 comes back Final-only") didn't fire; Q1 came back unanswerable, not
contradictory, which is a different outcome the plan didn't anticipate but which doesn't call for
more modeling firepower, just a live game to observe.

---

## Phase 8b — as-built notes and handoff (2026-08-17)

**Status: complete.** 44 flavor squares shipped as 20 parameterised resolver kinds, threaded through
all eight call sites plus `exposureForResolver`. **8c (recalibration) was not started.** Full detail,
every threshold with its measured rate, and the four places this deviates from the plan's table live
in **`docs/prop-bingo-nfl-phase8b-findings.md`** — this section is the short version.

`npx tsc --noEmit`, `npm run lint` and `npm run build` are clean. `npm run test` has the **same four
failures it had before this phase** — the pre-existing Appendix A/B debt below, untouched — and
nothing else. `npm run test:bingo-nfl` (157 tests, now including the new file) and
`npm run test:bingo-mlb` are green, and `npm run bingo:validate:nfl` still reports **43/43** on all
three grading-integrity checks after the plays walk was extended.

### Tier 4 is dropped, on its own gate

The plan's ship gate was a ≥98% reconciliation of reconstructed drives against the independently
published `team_stats.total_drives`. Measured over all 272 games of the 2025 regular season:
**32.0% exact, 87.5% within one drive, mean absolute delta 0.81.** Two candidate rates came back at
exactly 0.000 ("opens with a three-and-out", "a team punts on its first two drives"), which is
independent evidence the reconstruction is wrong rather than imprecise. The cause is structural —
BDL has no drive id, so a kickoff merges into the receiving team's next drive and a change of
possession inside a penalty splits one — so this is not a bug to fix. The plan's instruction for
this outcome is followed exactly: ship 35–44, drop Tier 4.

### The thresholds are measured, not guessed — and about half of 8a's were wrong

8a measured one hand-picked threshold per field, then *guessed* corrections in prose ("~7",
"~50 yards", "~340–350"). Those guesses are the second unvalidated number this plan forbids, so 8b
extended the probe with a `--sweep` mode that emits the whole rate curve per field, and read every
shipped threshold off it. **22 of the plan's 44 sketched thresholds moved.** The biggest:
`penalties >= 3` (0.941) → **7** (0.426); "a punt downed inside the 20" (0.956) → **3 punts in the
game** (0.559); "a defender picks off a pass" (0.787) → **2 interceptions in the game** (0.430);
"a touchdown from inside the 2" (0.695) → **from the 1** (0.522).

### Four corrections to what 8a and the plan said

1. **Square 10 renamed, per 8a's own recommendation** — "\<Team> leave a red-zone trip without a
   touchdown", which is what `red_zone_attempts > red_zone_scores` actually measures.
2. **Square 29 narrowed to a missed *field goal*.** The plan's extra-point clause is not gradable:
   the box score cannot tell a missed XP from a successful two-point conversion. On inspection,
   8a's 0.460 was a missed-field-goal rate all along — its XP clause compared a kicker's extra
   points against that same kicker's (always zero) rushing and receiving touchdowns.
3. **An absent `team_stats` field means zero, and the base rates depend on that reading.**
   `sacks >= 4` computed over only the rows where the field is present is 0.271; counting absent
   rows as zeros gives 0.235, which is exactly 8a's published number. An absent *row* is different
   and voids.
4. **Three squares are Final-only despite looking like counters**, and each would otherwise have
   settled `hit` and then become false: `yards_per_play` is a ratio, time-of-possession advantage is
   a differential, and `red_zone_attempts` increments on *entering* the red zone, before the trip
   resolves.

### New surface

| File | What it is |
| --- | --- |
| `lib/sportsBingoNflFlavor.ts` | New. The catalog: every square's resolver, threshold and measured base rate, plus the label vocabulary and the monotonicity contract. Adding a 45th square is a data-only edit here. |
| `tests/lib.sportsBingo.nfl-flavor-squares.test.ts` | New, 26 tests. Hit/miss/void per family, the mid-game vs. holds-until-Final asymmetries, the ratio square that must not settle early, the corrupt-play guard's 8-point boundary, and the call-volume discipline. |
| `tests/fixtures/nfl-team-stats-2025.json`, `nfl-player-stats-2025.json` | New. Real BDL rows for the twelve games the Phase 5 slate already uses. Without them the flavor squares grade `void` and that slate measures the fixture, not the generator. |
| `docs/phase0-artifacts/phase8b-nfl-threshold-sweep-2026-08-17.json` | New. The full sweep, the full-season Tier-3 pass, and the Tier-4 reconciliation. |
| `scripts/probe-nfl-flavor-squares.cjs` | Extended with `--sweep` and `--tier4`, both opt-in so an 8a-shaped run still reproduces 8a's numbers. |
| `docs/prop-bingo-nfl-phase8b-findings.md` | New. The findings doc. |

Also changed: `lib/sportsBingo.ts` (the union and all eight call sites, `NFLGameStatsSnapshot.teamStats`, ten new plays-walk facts, the board mix and the Tier-1 caps), `lib/sportsBingoCorrelation.ts` (20 exposure entries plus per-field Tier-1 wiring), `scripts/simulate-bingo-boards.cjs` (fetches `team_stats` so 8c can grade Tier 1), `tests/lib.sportsBingoCorrelation.test.ts`, `tests/lib.sportsBingo.win-rate-calibration.test.ts`, `package.json`, `.env.example`.

### Handoff — what 8c needs to know

1. **Run `npm run bingo:simulate -- --backtest --seasons 2025` and confirm NFL is back inside
   20–30%.** The 27% figure this plan quotes is invalidated by 8b, exactly as the plan predicted.
   The seam is wired: the simulate script now fetches `/nfl/v1/team_stats` per game when a board
   holds a Tier-1 square, and `gradeResolversAgainstCompletedNFLGame` takes it. Archive before/after
   under `docs/phase0-artifacts/`.
2. **The network-free tripwire already agrees.** On the frozen twelve-game slate (300 boards,
   play-by-play squares off): **0.260 realized vs 0.254 predicted, 0.08% of squares ungraded.** That
   is a good sign, not the answer — it has no player props and no Tier-3 squares.
3. **Confirm NBA/WNBA/MLB are unmoved.** Every board-composition change is behind `isNfl`; the
   all-league run is what proves it.
4. **Tuning order if NFL lands out of band:** the specials/props split in `planByBucket`, then
   `BINGO_NFL_TIER1_MAX_PER_BOARD`, then — last — a base rate. A base rate is a *measurement*, so
   changing one means re-running `npm run bingo:probe:nfl-flavor -- --sweep`, not editing a
   constant. **Do not touch `BINGO_BOARD_TARGET_WIN_RATE`**; it is global.
5. **Two things are still waiting on a real NFL game** (earliest 2026-09-11, recipe in
   `docs/prop-bingo-nfl-phase8a-findings.md` §1): whether `team_stats` is live mid-game, which is
   what `BINGO_NFL_TIER1_MAX_PER_BOARD=3` is conservatively assuming *against*; and whether
   `home_win_probability` is live, which is what square 45 is blocked on. Both are 15-minute checks
   and the first one needs no deploy to act on.
6. **The postseason `team_stats`/`stats` gap is unchanged.** Tier 1 and Tier 2 squares now void on a
   postseason board, which is correct behavior for a missing feed and still a product gap for a
   Week-19+ launch. Whoever flips `NEXT_PUBLIC_BINGO_NFL_ENABLED` owns that decision.

**Model: Opus 5 · effort: high**, as the plan specified.

---

## Phase 8c — as-built notes and handoff (2026-08-17)

**Status: complete.** The win rate is re-earned and every constant behind an NFL board is now either
measured or knowingly left alone with the measurement written down. **Phase 9 is not started.** Full
detail — every number, both calibration tables, and the one finding worth carrying forward — lives
in **`docs/prop-bingo-nfl-phase8c-findings.md`**; this section is the short version.

`npx tsc --noEmit` and `npm run lint` are clean. `npm run test` has the **same four failures it had
before this phase** (the Appendix A/B debt below, untouched) and nothing else.
`npm run test:bingo-nfl` is green at **162 tests** (157 + the 5 new ones), `npm run test:bingo-mlb`
at 18, and `npm run bingo:validate:nfl` still reports **43/43**. One caveat recorded in the findings
doc: across six full-suite runs, one reported a fifth failure that never reproduced and whose file
was not captured — an unidentified intermittent, not something this phase introduced.

### The plan's deliverable, answered on a much larger sample

| Measurement | Boards | Realized |
| --- | --- | --- |
| Phase 5 (before 8b), weeks 6/9/14 | 215 | 0.3023 |
| **Full 2025 regular season, before recalibration** | 1,140 | **0.2430** |
| **Full 2025 regular season, after recalibration** | 1,140 | **0.2561** |

8b's flavor slate moved NFL from the top of the band to the middle of it with no tuning at all —
which is what the plan hoped for, and which would have been a perfectly defensible place to stop.

### The finding: a board can be in band while half its squares are wrong

A win rate is a summary statistic over 24 squares and 12 lines, so pricing errors in opposite
directions cancel inside it. Confirming the band and stopping would have shipped a generator that is
right on average and wrong about nearly every square it prices.

So 8c built **`npm run bingo:calibrate:nfl`** — the same backtest, but recording per resolver family
the probability the generator *assigned* against the rate the shipped graders *realized*. Over the
full season it found **eight families mispriced by more than 0.05**, and the pattern in them is the
point: **every badly-priced family is a Phase 2 or Phase 3 square, and not one is a Phase 8b
square.** 8b's discipline of measuring before shipping worked, and the contrast is what exposed the
squares built before anyone was measuring.

| Family | assigned → realized | gap | Origin |
| --- | --- | --- | --- |
| `nfl_team_quarter_points_at_least` | 0.189 → 0.371 | **+0.182** | Phase 2 normal tail |
| `nfl_fourth_down_conversion` | 0.750 → 0.861 | **+0.111** | Phase 3 flat constant |
| `nfl_team_shutout_quarter` | 0.765 → 0.662 | **−0.103** | Phase 2 quarter model |
| `nfl_team_scores_every_quarter` | 0.236 → 0.327 | **+0.092** | Phase 2 quarter model |
| `nfl_winner_trailed_in_fourth` | 0.254 → 0.165 | −0.089 | Phase 8b flat base rate |
| `nfl_second_half_higher_scoring` | 0.510 → 0.433 | −0.077 | Phase 2 flat constant |
| `nfl_any_quarter_scoreless` | 0.317 → 0.255 | −0.062 | Phase 2 quarter model |

For scale, `moneyline` realized 0.498 against an assigned 0.500 over 2,280 instances, which is both
the proof the harness is wired correctly and the bound on how much of the above can be blamed on the
backtest's retrodictive market: essentially none.

### What changed: six constants, no resolver, no grader, no board mix

The four quarter squares Phase 2 shipped were built from a normal approximation with hand-set
dependence fudges and **had never been checked against a real game.** `npm run bingo:measure:nfl-quarters`
(new) measures them off `/nfl/v1/games`, which already carries every quarter score — the whole
season costs three API calls.

- `NFL_QUARTER_SCORE_SLOPE` 0.0195 → **0.023** (the fitted intercept ratified Phase 2's 0.2)
- `NFL_EVERY_QUARTER_DEPENDENCE_BOOST` 1.3 → **1.05**
- `NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS` 2.6 → **3.13** (solved against a measured rate)
- `quarterPointsAtLeast` normal tail → **`NFL_QUARTER_POINTS_MEASURED`**, a measured table
- `NFL_SECOND_HALF_HIGHER_BASE` 0.51 → **0.4853**
- `NFL_FOURTH_DOWN_CONVERSION_BASE` 0.75 → **0.83**

The 14-point quarter square is the one that could not have been fixed by tuning: reproducing its
measured 0.363 out of Phase 2's normal needs **7.5 effective trials in a four-quarter game**, which
is a model reporting that it is the wrong shape, not the wrong constant.

**The methodological call that decides all six numbers:** every rate is bucketed by a *pre-game
implied* team total, never by the realized score. The realized score is the outcome being predicted
and ranges over ground the model's input never occupies (9.6–33.3 points per bucket against
18.8–25.4 implied), so a curve fitted on it is applied far outside its own support. The script emits
both bases side by side so this is visible rather than argued.

### Proof

| | Before | After |
| --- | --- | --- |
| Realized board win rate | 0.2430 | **0.2561** |
| Mean \|gap\| across 43 families | 0.0347 | **0.0193** |
| Families mispriced by more than 0.05 | **8** | **2** |
| Worst three \|gap\| | 0.182 / 0.111 / 0.103 | 0.134 / 0.063 / 0.040 |

All six recalibrated families landed inside ±0.03. The two still outside ±0.05
(`nfl_team_red_zone_trip_without_touchdown`, `nfl_long_touchdown`) sit at n≈110 where the noise
floor is ±0.045 and both moved *away* from calibrated between the two runs — no measurement supports
a change, so neither got one.

### The one result worth carrying into every later phase

**`nfl_winner_trailed_in_fourth` was never touched, and its gap went from −0.089 to +0.014 anyway.**
Its constant is the same 0.254 it always was; recalibrating the *other* squares changed which
squares compete for a board slot, which changed the mix of games this one lands in, which moved its
realized rate by 0.10.

> A gap in the calibration table is a joint property of the price **and the selector**. Board
> selection is difficulty-biased, so a flat, market-independent base rate lands disproportionately
> in the games where the generator needed that difficulty — and if the square's truth moves with the
> market, those are not average games. Before "fixing" a flat base rate, change something else and
> re-run: if the gap moves, it was never that square's price.

This matters most for **Phase 9**, which is a selection change by construction.

### New surface

| File | What it is |
| --- | --- |
| `scripts/calibrate-nfl-square-families.cjs` | New. `npm run bingo:calibrate:nfl`. Per-family assigned-vs-realized calibration over a replayed season. Its header documents the two ways to misread its own output. |
| `scripts/measure-nfl-quarter-rates.cjs` | New. `npm run bingo:measure:nfl-quarters`. The season measurement behind every constant above, including the implied-vs-realized basis contrast. |
| `tests/lib.sportsBingo.nfl-quarter-recalibration.test.ts` | New, 5 tests, added to `npm run test:bingo-nfl`. Pins each recalibrated constant to its measured rate and guards the 14+ square against a revert to the normal tail. |
| `docs/prop-bingo-nfl-phase8c-findings.md` | New. The findings doc. |
| `docs/phase0-artifacts/phase8c-*.json` (6 files) | New. Quarter-rate measurement, both calibration tables, two backtests, the all-league forward run. |

Also changed: `lib/sportsBingoOdds.ts` (six constants and one function body), `package.json`, and
`scripts/validate-nfl-bingo-grading.cjs` — its "priced vs realized" column hand-copies the base
rates and would have kept reporting against the retired `0.75`.

### Two decisions Andrew took on this phase (2026-08-17) — do not re-litigate either

1. **The scope expansion is kept.** 8c's literal deliverable (re-run the backtest, confirm the band)
   was satisfied at **0.2430 before anything was changed**. The phase then went further on its own
   judgement — two new measurement scripts, six recalibrated constants in `lib/sportsBingoOdds.ts`,
   one new test file — on the grounds that this plan's standing rule is that a base rate is a
   measurement, and four Phase 2 quarter squares had never been checked against a real game. That
   was put to Andrew as a keep-or-revert with the revert cost stated (one file plus one test file,
   nothing committed, NFL still flag-dark) and **he chose to keep it**. The board therefore ships at
   0.2561 with measured squares rather than 0.2430 with squares wrong by up to 0.18 individually.
   The accepted trade is a mild change in how a card *feels* — "14+ in a quarter" now prices 0.352
   instead of 0.189, "a quarter ends 0–0" 0.240 instead of 0.317 — which is the same product tension
   Phase 7 put to him from the MLB side, answered the same way.
2. **A second-season (2024) measurement was offered and declined.** It would have settled whether
   the two families still outside ±0.05 — `nfl_team_red_zone_trip_without_touchdown` (−0.134) and
   `nfl_long_touchdown` (−0.063) — are real or noise. Both sit at n≈110 where the noise floor is
   ±0.045 and both moved *away* from calibrated between the two runs, which is what noise looks
   like. **Phase 9 picks this up for free**, because it has to re-run the calibration table anyway:
   if either family is still outside ±0.05 on a second independent run, it is real and worth
   measuring properly; if it has wandered back inside, it never was. Do not spend a dedicated run on
   it beforehand.

### Handoff — what Phase 9 needs to know

1. **Its baseline is 0.2561 over the full season**, not the 27% this plan used to quote. Run
   `npm run bingo:calibrate:nfl -- --weeks 1,2,…,18 --boards 4` *alongside*
   `npm run bingo:simulate -- --backtest --seasons 2025`, not instead of it — the board win rate
   cannot tell you whether star-tilting broke a family's price, and the calibration table can.
2. **Never read a three-week slate as a measurement.** Three runs of the plan's own default command
   (`bingo:simulate --backtest --seasons 2025`, 43 games) produced **0.2674, 0.2004 and 0.2151**;
   the full 272-game season produced 0.2430 and 0.2561. Boards within one game share that game's
   outcome, so **games** are the sample size, not boards.
3. **Star-tilting is exactly the selection change the finding above is about.** Expect flat base
   rates to drift in the calibration table as a side effect and do not read that drift as a pricing
   bug without changing something else and re-running.
4. **Player props still cannot be backtested at all** (`/nfl/v1/odds/player_props` is live-only), so
   the harness validates the board Phase 9 changes *around* the props, never the props themselves.
   A star index that changes which props are selected is not covered by a green backtest — say so in
   the Phase 9 findings rather than letting the number imply coverage it doesn't have.
5. **Read two families off your calibration run as a free by-product** (decision 2 above):
   `nfl_team_red_zone_trip_without_touchdown` and `nfl_long_touchdown` were −0.134 and −0.063 at the
   end of 8c, at a sample size whose noise floor is ±0.045. Your run is the second independent
   sample. Still outside ±0.05 → real, and worth a proper measurement. Back inside → it was noise
   and the matter is closed. Either way, record which, so this stops being an open question.
6. **Unchanged and still open:** the two live checks waiting on a real NFL game (mid-game
   `team_stats`, live `home_win_probability` / square 45), the postseason `team_stats` gap, and
   Phase 6's flag flip and board-render screenshot.

**Model: Opus 5 · effort: medium**, as the plan specified — though the measurement work ran closer
to high than the plan's "the tooling exists; the judgement is in reading the numbers" anticipated,
because the tooling that mattered did not exist.

---

## Phase 9a — as-built notes and handoff (2026-08-17)

**Status: complete, signal-only.** New module `lib/sportsBingoNflStars.ts` implements the three
blended star-signal inputs and the shrinkage/brand-bonus math from the plan's 9a section, as pure,
independently-testable functions. **It is not wired into board generation** — no board looks any
different after this phase, on purpose. `pickCandidateSet`'s player-prop draw still runs
`orderByDifficulty` exactly as it did before. That wiring, the tier split, the ≥2/≤5 reservation
and the interaction with `difficultyBias` are Phase 9b. Caching, the generated snapshot, the
`bingo:stars:nfl` script and the staleness tripwire are Phase 9c. Both are unstarted.

`npx tsc --noEmit` and `npm run lint` are clean. New test file
`tests/lib.sportsBingo.nfl-star-index.test.ts` (20 tests, added to `npm run test:bingo-nfl`, now
**182 tests** across 13 files) is green. `npm run test` shows the same pre-existing, unrelated
4 failures in `tests/venue-activation.phase4-mount.test.ts` documented in the Appendix at the
bottom of this file (`git stash -u && npm run test` before touching anything confirmed they predate
this phase) — nothing else changed.

### What shipped

- **Three signal functions, each independently testable:**
  - `summarizeNFLStarMarketSignal` / `nflMarketAttentionScore` — reduces a player's
    `NFLPlayerPropMarket[]` (already fetched by Phase 3's `fetchNFLPlayerPropMarkets`, so this adds
    **zero new requests**) into `0.6 × breadth/8 + 0.4 × anytimeTdProbability`, both clamped 0-1.
  - `computeNFLSeasonStarIndex` — pure function over a `/nfl/v1/season_stats` pull. Position-
    normalised **within game position group** for both usage volume (QB: pass+rush attempts; RB:
    carries+targets; WR/TE: targets; K: FG attempts) and production (mean of the touchdown-rate and
    yards-per-game percentiles). Rows at any position Prop Bingo never posts props for (defense,
    special teams) are dropped, not scored to 0 — they should never enter a star-tier draw at all.
  - `fetchNFLSeasonStats(season)` — the actual `/nfl/v1/season_stats` call, one league-wide
    paginated pull (`maxPages: 40` at `per_page: 100`), never throws (same
    fetch-fails-to-empty convention as every other BDL helper in this codebase). **Not cached** —
    that 24h TTL is explicitly Phase 9c's `resolveNFLStarIndex`, named in the plan's 9c section;
    calling this directly on every board generation would be one league-wide pull per board, which
    is the thing 9c exists to prevent.
- **`computeNFLStarScore`** — the blend: `starScore = 0.45×market + 0.35×usage + 0.20×production +
  brandBonus`, weights each an env-tunable constant (`BINGO_NFL_STAR_WEIGHT_MARKET` /
  `_USAGE` / `_PRODUCTION`) summing to 1 (asserted by test), clamped to `[0, 1 + 0.10]`.
- **Early-season shrinkage**, `w = gamesPlayed / (gamesPlayed + K)` with `K = 3`
  (`BINGO_NFL_STAR_PRIOR_SHRINKAGE_K`), blending the current season's percentile toward the prior
  season's. **Deviation from the plan's literal reading:** the plan's shrinkage formula (`w` weights
  *toward* the prior, i.e. `w→0` at 0 games means "trust the prior entirely") is exactly what's
  implemented, but the edge case needed a decision the plan states as an outcome without stating the
  mechanism: *"A rookie has no prior and therefore scores on market attention alone."* Implemented as
  `blendSeasonComponent`: if there's no prior-season row, the current season's value is used
  **outright** (not shrunk toward a nonexistent prior) — so a drafted rookie with 2 games of real
  usage this season is not artificially zeroed, while a *true* rookie with no current-season row
  either (nothing played yet) correctly falls all the way through to 0, leaving `starScore` as pure
  market signal. Both cases have tests (`"a rookie with no prior season scores on market attention
  alone"` and `"a drafted rookie with early-season stats but no BDL prior-season row is not shrunk
  toward nothing"`).
- **`NFL_BRAND_NAME_BONUS`** — 14 hand-picked current offensive skill-position stars (well under the
  plan's ~25 ceiling, tested), each capped at `NFL_STAR_BRAND_BONUS_MAX = 0.10`, each carrying a
  `reviewBy: "2027-02-01"` date (end of the 2026 season) as the plan requires — nothing reads or
  enforces that date yet; it's a marker for whoever runs the next off-season audit, not a tripwire.
  Names normalized via a **local copy** of `lib/sportsBingo.ts`'s unexported `normalizeNameKey`
  (10 lines, documented as intentionally duplicated) rather than an import, for the same
  cycle-avoidance reason `lib/ballDontLieClient.ts` was extracted out of `lib/sportsBingo.ts` in
  Phase 2: `lib/sportsBingo.ts` imports `lib/sportsBingoOdds.ts`, which this module also imports
  (for the `NFLPlayerPropMarket` type), so `lib/sportsBingoNflStars.ts` cannot import
  `lib/sportsBingo.ts` without creating one.
- **`resolveCurrentNFLSeasonYear` / `resolvePriorNFLSeasonYear`** — BDL's `season` param is the year
  the season *started*; January/February belong to the season that started the previous calendar
  year, matching `lib/nflWeekUtils.ts`'s convention. No existing helper did this league-wide (it's
  usually derived from a specific known week), so this is new, small, and pure-tested.

### What Phase 9b needs to know before wiring this in

1. **The inputs `computeNFLStarScore` wants are not yet assembled anywhere.** A caller needs, per
   player per game: `market` (from `summarizeNFLStarMarketSignal` over that player's rows in the
   game's already-fetched `fetchNFLPlayerPropMarkets` result), `current` (that player's entry from
   `computeNFLSeasonStarIndex(await fetchNFLSeasonStats(resolveCurrentNFLSeasonYear()))`), and
   `prior` (same, one season back). Phase 9b is the first caller and will need to decide *where* in
   `pickCandidateSet` (or a helper it calls) this assembly happens — nothing here presumes an
   answer, on purpose, since 9c's caching wrapper will change the fetch call shape anyway.
2. **Tiering is not implemented here.** The plan's 9b splits the prop pool into `star`/`known`/`deep`
   by `starScore` **percentile within the game's own pool**, not against a league-wide distribution.
   `computeNFLStarScore` returns a raw score per player; ranking that within one game's ~15-20
   candidate props is 9b's own small function, not something this module should own (it has no
   notion of "a game's pool" — it scores one player at a time).
3. **The ≥2 non-star / ≤5 star reservation, the draw-not-sort selection, and the multiplication
   against `difficultyBias`** (per the plan's "must not break" list) are all unbuilt. This phase
   changes nothing about `difficultyBias`, `orderByDifficulty`, or any diversity cap.
4. **`resolveNFLPlayerProfiles` is untouched** — deliberately. The plan's "must not break" note says
   the star index must not add a second per-player lookup path; `computeNFLStarScore` takes a
   `playerName: string` directly (whatever the caller already resolved via
   `resolveNFLPlayerProfiles`) rather than resolving anything itself.
5. **No `console.info` log line yet.** The plan's 9c item 5 (`nfl_star_mix` observability log,
   matching `mlb_named_player_weighting`'s shape) belongs with 9b/9c's actual selection code, once
   there's a real `{ star, known, deep, pool }` mix to log.

### What Phase 9c needs to know

1. **`fetchNFLSeasonStats` has no cache.** Wrap it, don't rewrite it — `resolveNFLStarIndex(season)`
   should call this function and cache `computeNFLSeasonStarIndex`'s *output* (or the raw rows,
   either works) behind `BINGO_NFL_STAR_INDEX_CACHE_MS`, following the exact pattern
   `SEASON_STATUS_CACHE_MS` / `resolveLeagueSeasonStatus` already establishes one file over in
   `lib/leagueSeasonStatus.ts`.
2. **The generated snapshot (`data/sports-bingo/nfl-star-index.json`) does not exist yet.** Its
   producer script (`scripts/refresh-nfl-star-index.cjs` → `npm run bingo:stars:nfl`) should import
   `fetchNFLSeasonStats` + `computeNFLSeasonStarIndex` from this module directly — both are already
   exported and season-stats fetching needs no board/game context, so the script should be a thin
   wrapper, not a reimplementation.
3. **The staleness tripwire test** (`generatedAt` older than 14 days **and**
   `resolveLeagueSeasonStatus("americanfootball_nfl")` reports in-season) needs the snapshot file to
   exist first; nothing in 9a blocks it, but nothing in 9a builds it either.
4. **Field-count sanity check for whoever builds the snapshot script:** `/nfl/v1/season_stats`
   returned player rows with `games_played`, `position_abbreviation` and the per-position volume
   fields confirmed against the live docs sample (`BDL-API docs/NFL API .html`), but 9a's tests run
   entirely against hand-built fixtures — **no live call to `/nfl/v1/season_stats` has been made by
   this phase.** 9c's first live run is also the first real confirmation that the response shape
   matches the docs sample, the same "probe before trusting" discipline every prior phase in this
   plan has applied to a new endpoint. Budget a few minutes for field-name surprises.

### What must not break (unaffected by this phase, confirmed)

- `pickCandidateSet`, `orderByDifficulty`, every resolver kind, every existing NFL square's pricing,
  and `lib/sportsBingoCorrelation.ts`'s exposures are all untouched — this phase added one new file
  and one new test file, and edited nothing else except `package.json`'s `test:bingo-nfl` script
  list.
- `MLB_STAR_BRANDED_PLAYER_KEYS` (`lib/sportsBingo.ts:163`) is untouched. Phase 9d (porting this
  machinery to MLB) is explicitly out of scope until 9a-9c are settled and Phase 7 note 4's
  `/mlb/v1/player_props` 404 is understood.

**Model: Sonnet 5 · effort: medium**, as the plan specified.

---

## Phase 9b — as-built notes and handoff (2026-08-17)

**Status: complete.** NFL boards now look different. The eight player-prop slots are filled by a
**tier-weighted draw against a hard reservation** instead of by `orderByDifficulty` taken in order,
so the players a book posted the most markets on are materially likelier to be dealt — while a
floor of two non-star squares and a ceiling of five star squares stop a board becoming six famous
names. Full findings, including the measured tilt and every decision that could have gone the other
way: **`docs/prop-bingo-nfl-phase9b-findings.md`**.

**Not one price moved.** No resolver, no base rate, no constant in `lib/sportsBingoOdds.ts`, no
probability anywhere. This is a selection change, exactly as Phase 5 drew that line for
`orderByDifficulty`, and it is what keeps 8c's 0.2561 valid.

`npx tsc --noEmit` and `npm run lint` are clean. New test file
`tests/lib.sportsBingo.nfl-star-tilt.test.ts` (11 tests, added to `npm run test:bingo-nfl`, now
**193 tests across 14 files**) is green and was run five times end to end with no flake.
`npm run test` shows the same pre-existing, unrelated 4 failures documented in the Appendix below —
nothing else changed.

### What shipped

- **`assignNFLStarTiers`** (`lib/sportsBingoNflStars.ts`) — splits a set of per-player `starScore`s
  into `star` / `known` / `deep` by percentile **within that set**: this game's own prop pool, never
  a league-wide distribution, so a thin Thursday slate still has a star of its own. Ranked over
  distinct *players*, not candidate squares, so a quarterback with nine posted markets cannot drag
  the scale around by himself. Ties share a percentile, so an all-tied pool produces **no** stars
  rather than an arbitrary top quarter. Returns `null` when nothing carries a finite score.
- **That `null` is the whole fallback contract.** No score → no tiers → `pickCandidateSet` skips the
  star block entirely and runs its original ordered fill. That covers a provider outage, a game with
  no posted props, every non-NFL league, and every historical/backtest board.
- **The draw**, in `pickCandidateSet`'s NFL branch: weight is
  `nflDifficultyDrawWeight(candidate, difficultyBias) × NFL_STAR_TIER_BOOST[tier]`. The star boost
  **multiplies** the difficulty weight rather than replacing it (as MLB's `starBoost` does), so
  Phase 5's escalation still reaches its target on a board stuck above band.
  `nflDifficultyDrawWeight` carries `orderByDifficulty`'s meaning across: uniform at bias 0, favouring
  hard squares above 0, easy squares below.
- **The reservation is a gate on what is *offered*, not a weight.** Once five star squares are
  seated, or the remaining slots equal the non-star squares still owed, star candidates are removed
  from the offer set. Soft weights drift under an escalating `difficultyBias`; a gate does not. If
  the offer set would be empty, it degrades to "take what exists" and increments
  `reservation_degraded` in the telemetry — a mix rule must never cost a player their card.
- **Boosts are per tier, not a function of the raw score.** This is a deliberate deviation from a
  literal reading of the plan's "draw with a boost". Until 9c wires in the season index, scores are
  market-attention-only and compress into ≈0.15–0.25 on a realistic slate; a multiplier read off a
  compressed score would tilt by a couple of percent and still look like it was working. A
  percentile tier is invariant to that compression — **and stays invariant when 9c widens the
  scores, so nothing needs retuning when the season index lands.**
  Values: `star 2.6`, `known 1.4`, `deep 1.0`. `deep` is 1.0 and not 0 on purpose: a lesser-known
  player is weighted down relative to a star, never removed from the pool.
- **`starScore` on `SportsBingoSquareTemplate`** — optional, generation-time metadata only, exactly
  like `teamHint` and for the same stated reason: it is deliberately **not** part of `resolver`, so
  it never reaches `sports_bingo_squares.resolver` and never reaches the grader.
- **`buildNFLStarScoresByPlayerId`** scores each player once, over that player's *whole* market list
  before any per-square filtering, because market attention is a property of the player in the game
  rather than of a square.
- **Telemetry: one `nfl_star_mix` line per board, not per attempt.** See the deviation note below.

### Verification, and 8c's open question closed

Both runs 8c's handoff asked for, live against balldontlie:
**`bingo:calibrate:nfl --weeks 1…18 --boards 4`** → 272 games, 1,140 boards, **0.2430**; and
**`bingo:simulate --backtest --seasons 2025 --weeks 6,9,14 --boards 4`** → 43 games, 172 boards,
0.2791. Artifacts: `docs/phase0-artifacts/phase9b-nfl-family-calibration-2026-08-17.json`,
`phase9b-nfl-backtest-2026-08-17.json`.

**Read 0.2430 as "unchanged", not "down from 0.2561".** 8c measured both numbers from two runs of
this same command; board generation is stochastic and the noise floor at 272 games is ≈0.026. And
per the note above, neither run can see this phase at all.

**8c handoff note 5 is now answered, and the answer is "noise" for both.** This run was the second
independent sample it asked for: `nfl_team_red_zone_trip_without_touchdown` went **−0.134 → −0.012**
(n=123) and `nfl_long_touchdown` **−0.063 → −0.044** (n=209). Both back inside ±0.05 with no price
change. **Closed — do not measure or re-threshold either.** Two *different* families sit just
outside on this run (`nfl_first_score_within_minutes` −0.064, `nfl_first_score_is_field_goal` +0.054,
both n≈185, both inside the band on 8c's run), which is the same phenomenon pointing the other way.
Whoever runs the next full-season table gets the third sample for free; record which way they go.

### The two deviations, both deliberate

1. **The telemetry line moved out of `pickCandidateSet`.** The plan (9c item 5) says to match
   `mlb_named_player_weighting`'s shape — it does — and that log sits inside `pickCandidateSet`,
   which `generateBoardForGame` calls **up to 180 times per board**. 179 of those describe boards
   nobody was dealt. So `pickCandidateSet` reports its mix through an optional `onNflStarMix`
   callback, `generateBoardForGame` keeps the mix belonging to the board it actually kept, and one
   line is logged per board generated. The MLB line still has the original problem; fixing it is a
   one-line change in the same shape and belongs with **Phase 9d**, which is already going to touch
   that block.
2. **The tier boost is per tier rather than per score.** Reasoned above.

### What Phase 9c needs to know

1. **It is one argument.** `buildNFLPlayerPropCandidates(game, markets, starIndex)` already accepts
   `{ current, prior }` as `Map<playerId, NFLSeasonStarIndexEntry>`; `getGameEntryWithCandidates`
   passes `null` today with a comment pointing here. `resolveNFLStarIndex` should return that pair
   and replace the `null`. Everything downstream — blend, tiering, draw, reservation, telemetry — is
   already wired and tested.
2. **Put the 24h TTL on the season index, not on the game entry.**
   `getGameEntryWithCandidates` is already memoized 60s *per game*, and a Sunday slate is 13 games;
   that is 13 league-wide pulls a minute without a cache one level down. Follow
   `SEASON_STATUS_CACHE_MS` / `resolveLeagueSeasonStatus` in `lib/leagueSeasonStatus.ts`.
3. **Players will change tier when the index turns on, and that is not a bug.** Today's score is 45%
   of one signal; tomorrow's is 100% of three. What must not change is the *mix* — `star ≤ 5`,
   `known + deep ≥ 2`. **Re-run `tests/lib.sportsBingo.nfl-star-tilt.test.ts` after wiring the index
   in**; its REALISTIC-fixture assertions are 9c's regression net.
4. **The brand bonus is currently louder than designed, and 9c is the fix.** `+0.10` against a
   market-only score that tops out near 0.45 is a bigger share than `+0.10` against a full
   three-signal blend. It still cannot set a tier alone on any realistic pool. **Widen the score;
   do not lower the cap.**
5. **Breadth is counted over the gradeable allowlist**, because `fetchNFLPlayerPropMarkets` already
   filtered to it. Accepted, not fixed: ranking is unaffected by a uniform compression, and tiers
   are percentiles inside one pool. It does mean a kicker can never score above 2/8 on breadth —
   the position normalisation that would correct for that lives in the season components 9c turns
   on.
6. **9a note 4 is still unpaid.** No live call to `/nfl/v1/season_stats` has ever been made. 9c's
   first live run is also the first confirmation the response shape matches the docs sample.

### What must not break

- **This phase is invisible to every backtest.** `/nfl/v1/odds/player_props` is live-only, so a
  historical NFL board has an empty prop pool, `assignNFLStarTiers` returns `null`, and the star
  block does not execute. `bingo:simulate` and `bingo:calibrate:nfl` are therefore regression checks
  on the parts of the board this phase did not touch — they **cannot** measure star tilt, and no
  green number from either should be read as covering it. The first real evidence is the
  `nfl_star_mix` log on a live Sunday, which needs Phase 6's flag flip and a real game.
- The three NFL diversity caps (≤2 squares per player, ≤2 per prop type, one per axis) and Phase
  8b's Tier-1 flavor caps are untouched and are now much more load-bearing — star tilt pushes
  directly against the first two, so a rejection there is expected traffic, and the draw loop treats
  it as such.
- `orderByDifficulty` is untouched and is still the only path for MLB, NBA and WNBA.
- `resolveNFLPlayerProfiles` is untouched — no second per-player lookup path was added. `starScore`
  is keyed off the `playerId` the prop market already carried.
- `MLB_STAR_BRANDED_PLAYER_KEYS` and the MLB named-player block are untouched. Phase 9d.

**Model: Opus 5 · effort: high**, as the plan specified.

---

## Phase 9c — as-built notes and handoff (2026-08-17)

**Status: complete.** All four check-in layers the plan asked for are live: the 24h-cached season
pull, the generated snapshot, the diff-as-check-in report, and the CI staleness tripwire. The one
line Phase 9b's handoff flagged as "the one line that changes" has changed —
`getGameEntryWithCandidates` now passes a real `NFLSeasonStarIndexPair` instead of `null`, so a real
board's star tilt is the full three-signal blend (market + season usage + season production), not
market-attention-only.

`npx tsc --noEmit` and `npm run lint` are clean. `npm run test:bingo-nfl` is green — **200 tests
across 15 files** (12 new tests: 6 in an extended `tests/lib.sportsBingo.nfl-star-index.test.ts`, 1
in a new `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`, both added to the script list).
One pre-existing statistical test in `tests/lib.sportsBingo.nfl-star-tilt.test.ts`
("stops tilting when the tier boosts are turned off") failed once on a tight margin (0.2542 vs. a
0.2533 threshold) and passed clean on immediate rerun — a draw-count flake in a stochastic test, not
a regression from this phase; nothing in this phase changed that test's fixtures, mocks, or the
function under test. `npm run test` shows **1,678 passed**, the same pre-existing 4 failures in
`tests/venue-activation.phase4-mount.test.ts` documented in the Appendix at the bottom of this file
(unrelated to Prop Bingo), and nothing else red.

### What shipped

- **`resolveNFLStarIndex(now, fetchSeasonStats?)`** (`lib/sportsBingoNflStars.ts`) — the live,
  automatic layer. Caches the `{current, prior}` `NFLSeasonStarIndexPair` by **season year**, not by
  `now`, behind a 24h TTL (`BINGO_NFL_STAR_INDEX_CACHE_MS`, clamped 1h–48h, same
  `cacheMsInWindow` shape `lib/sportsBingo.ts` already uses for `SEASON_STATUS_CACHE_MS` — a small
  local copy of that 4-line helper, not an import, for the same cycle-avoidance reason
  `normalizeNameKey` is already duplicated in this file: `lib/sportsBingo.ts` imports this module,
  so the reverse import would cycle). One cache entry serves every game in a 13-game Sunday slate.
  The second parameter is an injectable `fetchSeasonStats`, defaulting to the real
  `fetchNFLSeasonStats` — added purely so tests never touch the network; production callers never
  pass it.
- **`NFLSeasonStarIndexPair` moved here from `lib/sportsBingo.ts`** and is now exported — it was
  declared locally in `lib/sportsBingo.ts` as a placeholder shape before 9c had a real producer for
  it. `lib/sportsBingo.ts` now imports the type instead of redeclaring it.
- **The one call-site change**: `getGameEntryWithCandidates`'s NFL branch
  (`lib/sportsBingo.ts`, in the `includePlayerProps && entry.game.sportKey === "americanfootball_nfl"`
  block) now calls `await resolveNFLStarIndex()` and passes the result as
  `buildNFLPlayerPropCandidates`'s third argument, replacing Phase 9b's `null`. Nothing else in
  that function changed.
- **The generated snapshot** — `data/sports-bingo/nfl-star-index.json`, produced by
  `npm run bingo:stars:nfl` → `scripts/refresh-nfl-star-index.cjs` (`--dry-run` to preview without
  writing). Follows the `category-blitz:build` convention exactly: generated file, generating
  script, never hand-edited. The script is a thin wrapper — it imports `fetchNFLSeasonStats` and
  `computeNFLSeasonStarIndex` directly from `lib/sportsBingoNflStars.ts` rather than
  reimplementing either, per the Phase 9a handoff's explicit instruction.
- **The diff is the check-in.** Every run prints entrants, drop-offs and the biggest movers (by the
  mean of `usagePercentile`/`productionPercentile`) versus the previously committed snapshot, for
  both slates. Running it weekly during the season is the two-minute "are we ignoring anyone?"
  read the plan asks for.
- **The staleness tripwire, in two parts** (see "the schema deviation" below for why generatedAt is
  the only field the tripwire looks at):
  - `isNFLStarIndexSnapshotStale(generatedAt, now?)` (`lib/sportsBingoNflStars.ts`) — pure,
    dependency-free, unit-tested with fixed dates in `tests/lib.sportsBingo.nfl-star-index.test.ts`.
    An unparsable date counts as stale rather than silently passing.
  - `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts` — the actual CI gate, in its **own
    file** rather than folded into `nfl-star-index.test.ts`, so a live network hiccup only ever
    widens this one test's timeout rather than the fast pure-math suite it sits next to. Calls the
    real, unmocked `resolveLeagueSeasonStatus("americanfootball_nfl")`; asserts freshness only when
    it reports `in_season`, exactly the plan's "off-season it is inert" instruction. Verified both
    branches manually (forcing `in_season` locally reproduces a failure against a stale date;
    today, 2026-08-17, is genuinely out-of-season per the real calendar, so the live run currently
    takes the inert branch — see the live-verification note below for why that's expected, not a
    gap in coverage).

### Live verification — closes 9a note 4 and 9b note 6

Both handoffs flagged the same unpaid item: **no live call to `/nfl/v1/season_stats` had ever been
made**, only hand-built fixtures. `npm run bingo:stars:nfl` (unprefixed, writing) was run for real
against the live feed:

```
current: 0 rows, prior: 1828 rows
current (season 2026): 0 players scored.
prior (season 2025): 602 players scored.
```

**Season 2026 (current) is genuinely empty** — the 2026 season hasn't started (today is 2026-08-17,
before the Sept 1 window), so there is no usage/production signal yet. That is the plan's own
early-season-shrinkage scenario playing out for real, not a bug: `resolveNFLStarIndex` returns an
empty `current` map today, and `computeNFLStarScore`'s shrinkage math already handles that (falls
through to market attention, per 9a). **Season 2025 (prior) returned 1,828 raw rows, 602 scored
after position-filtering** — confirming the response shape matches the docs sample end to end
(`player.id`, `player.position_abbreviation`, `player.first_name`/`last_name`, `games_played`, and
every volume/production field `buildNFLSeasonUsageRows` reads). The top of the scored list is a
clean sanity check on its own: Christian McCaffrey, Trey McBride, Puka Nacua, Amon-Ra St. Brown,
Jonathan Taylor — real 2025 skill-position leaders, in a plausible order, with no field-name
surprises. Budget from the Phase 9a handoff ("a few minutes for field-name surprises") was not
needed.

### A design question surfaced, not resolved: does the snapshot ever feed the runtime path?

The plan's 9c #2 calls the generated snapshot "the cold-start fallback when the feed errors," which
could be read as instructing `resolveNFLStarIndex` (or its caller) to read
`data/sports-bingo/nfl-star-index.json` off disk when the live `/nfl/v1/season_stats` pull fails,
rather than degrading to empty maps. This phase **did not build that** — `resolveNFLStarIndex`'s
only failure behavior is "empty maps in, market-attention-only tilt out," identical to Phase 9b's
`null` placeholder. Two reasons:

1. The plan's own "what must not break" list (Phase 9's, not 9c's specifically) restates the
   existing contract verbatim: *"A feed failure must degrade to today's behavior... no index → no
   tilt."* Reading a possibly-days-old static file on a live failure is a **richer** fallback than
   that contract describes, and richer-than-specified is still a behavior change worth a deliberate
   decision, not an assumption made mid-implementation.
2. `fetchNFLSeasonStats` already degrades a feed failure to `[]` internally (never throws), so
   `resolveNFLStarIndex` never actually observes "the feed errored" as a distinct event from "the
   feed returned nothing" — there is no clean signal to key a fallback-to-file decision on without
   plumbing a new error channel through `fetchBallDontLieList`, which is out of this phase's stated
   scope.

Read the plan's phrase more charitably as "the fallback for a human reading this by eye, since the
live layer already has its own fallback" — the three benefits in that sentence (fallback / diff
baseline / human-readable artifact) are listed as one clause, and the snapshot genuinely does serve
the latter two. If Andrew wants the file wired into the actual runtime failure path, that is a
small, well-scoped follow-up (read the file in `resolveNFLStarIndex`'s catch path, parse into a
`NFLSeasonStarIndexPair`, cache it same as a live result) — flagging it here rather than guessing.

### A schema deviation, and why

The plan doesn't specify the snapshot's shape. The obvious first draft — one `players` array for
"the current season" — was tried and rejected after the live run above: on 2026-08-17, `current` is
empty by construction (no 2026 games played yet), so that draft would have committed an all-empty
file, which fails the plan's own "the artifact a human can actually read" bar on day one. Shipped
instead: `{ generatedAt, season, priorSeason, current: { players }, prior: { players } }` — both
slates, always. Right now `prior` (602 real, ranked 2025 players) is what's actually informative to
read; once the 2026 season is underway, `current` fills in week over week and becomes the
interesting one to diff, exactly as the plan's "weekly during the season" framing anticipates.
`isNFLStarIndexSnapshotStale` only reads `generatedAt`, so this schema choice doesn't touch the
tripwire.

### What Phase 9d needs to know

1. **The template is `scripts/refresh-nfl-star-index.cjs` end to end**, not just
   `lib/sportsBingoNflStars.ts`'s exported functions. A parallel MLB script would: dynamic-import
   an MLB star-index module, pull two seasons, join names back from the raw rows (MLB's
   `/mlb/v1/season_stats`-equivalent — confirm the actual endpoint name before assuming parity),
   build the same `{current, prior}` snapshot shape, diff, write. Reuse the shape, don't
   reimplement the diff/print logic from scratch.
2. **Phase 7 note 4 is still the real blocker, unchanged by this phase**: `/mlb/v1/player_props`
   404s in production, so MLB's named-player pool the star tilt would draw against is currently
   empty. Building the MLB star signal before that's fixed tilts a pool of nothing.
3. **The runtime-fallback design question above needs one decision, made once**, before it's
   independently re-litigated for MLB. Whatever Andrew decides for NFL should be the same answer
   for MLB — don't let 9d default to a different behavior just because nobody re-asked.
4. **Naming convention to mirror, not reinvent**: `NFLSeasonStarIndexPair` /
   `resolveNFLStarIndex` / `NFL_STAR_INDEX_CACHE_MS` / `NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS` →
   `MLBSeasonStarIndexPair` / `resolveMLBStarIndex` / etc., each with its own module-level cache
   variable (do not share `nflStarIndexCache` across sports — different TTL needs, different
   season-year math).

### What must not break (unaffected by this phase, confirmed)

- `pickCandidateSet`, `orderByDifficulty`, every resolver kind, every existing NFL square's
  pricing, and `lib/sportsBingoCorrelation.ts`'s exposures are all untouched. This phase's only
  edit inside `lib/sportsBingo.ts` is the import list and the single `null` → `resolveNFLStarIndex()`
  call site; `buildNFLStarScoresByPlayerId`, `assignNFLStarTiers`, the reservation and the draw are
  byte-identical to Phase 9b.
- **A feed failure still degrades to empty maps → no tilt**, confirmed by a new test
  ("degrades to empty maps when the injected fetch returns no rows, same as a real feed error").
- `resolveNFLPlayerProfiles` is untouched — `resolveNFLStarIndex` adds no second per-player lookup
  path; it keys off `playerId`, the same key the market signal already used.
- `MLB_STAR_BRANDED_PLAYER_KEYS` and the MLB named-player block are untouched. Phase 9d, still
  gated on Phase 7 note 4.

**Model: Sonnet 5 · effort: medium**, as the plan specified.

---

## Phase 9d — as-built notes (2026-08-17)

**Status: complete.** Full findings, with the live probe evidence, are in
`docs/prop-bingo-nfl-phase9d-findings.md`; this is the short version and the handoff.

`npx tsc --noEmit` and `npm run lint` are clean. `npm run test:bingo-mlb` is green — **76 tests
across 6 files**, up from 18 across 2. `npm run test:bingo-nfl` is unchanged at **200 across 15**.
`npm run test` shows **1,736 passed** with exactly the 4 pre-existing failures documented in the
Appendix below and nothing else red.

### Phase 7's note 4 was four bugs, not a dead endpoint

Two phases recorded `named_candidate_pool_size: 0` on every MLB board and attributed it to
"`/mlb/v1/player_props` 404s". Probed live, Prop Bingo was asking wrong four ways at once — which is
precisely why no partial fix ever surfaced it:

1. the route does not exist (`/mlb/v1/odds/player_props` does, mirroring NFL exactly);
2. it takes a scalar `game_id`, and rejects `game_ids[]` with `400 game_id must be an integer`;
3. the payload is NFL-shaped (`prop_type` / `line_value` / `market.{…}`) with a `hits` / `home_runs`
   vocabulary, not the `market_key` / `line` / `player_hits` the parser matched;
4. rows carry no player object, only `player_id`, so nothing could be named.

A live game serves **718–1,621 rows across six sportsbooks** (all already on the odds allowlist).
**A fifth thing was fixed in the same change**: MLB props used raw implied odds — Phase 2's note 2
vig bug — so turning the feed on without de-vigging would have shipped ~700 systematically
overstated rows onto every board. MLB now runs through the same `computePlayerPropMarkets` consensus
NFL uses.

### What shipped

- **`lib/sportsBingoOdds.ts`** — `computeNFLPlayerPropMarkets` and `resolveNFLPlayerProfiles` became
  thin wrappers over sport-agnostic cores (`computePlayerPropMarkets`, `resolvePlayerProfiles`);
  both are byte-equivalent for NFL. New: `MLB_PROP_TYPE_TO_MARKET_KEY`, `MLB_CORE_PROP_TYPES`,
  `MLB_CORE_PLAYER_PROP_MARKET_KEYS`, `MLB_MILESTONE_DEVIG_FACTOR` (0.95, deliberately gentler than
  NFL's 0.92 — an MLB milestone is one side of a real two-way market, not one runner in a 30-way
  field), `MLBPlayerPropMarket`, `resolveMLBPlayerProfiles`, `fetchMLBPlayerPropMarkets`. **Each
  sport keeps its own player-profile memo** — ids are only unique within a sport.
- **`lib/sportsBingoMlbStars.ts`** — the full 9a–9c stack for MLB: three-signal blend, percentile
  tiering, 24h-cached `resolveMLBStarIndex`, generated snapshot, staleness tripwire. Four documented
  differences from NFL: calendar-year seasons, `MLB_STAR_PRIOR_SHRINKAGE_K` = 15 (162 games, not
  17), batter/pitcher groups instead of five positions, and the home-run price as the milestone
  analogue.
- **`buildMLBPlayerPropCandidates` rewritten** onto the repaired feed, following
  `buildNFLPlayerPropCandidates` (both over/under sides sharing an axis key; milestone emits "over"
  only). The historical-stats path remains the fallback, unchanged.
- **`MLB_SETTLABLE_PLAYER_PROP_MARKETS` now derives from the prop-type table**, closing a real gap:
  the hand-written list it replaces omitted `player_stolen_bases`, `player_earned_runs` and
  `player_pitcher_outs`, all three of which `getMLBPlayerPropValue` has always been able to grade.
- **`scripts/refresh-mlb-star-index.cjs`** + `npm run bingo:stars:mlb` / `:dry-run`, and
  `data/sports-bingo/mlb-star-index.json`. Four new test files, all added to `test:bingo-mlb`.

### Three things the implementation found that the plan could not have

1. **A single breadth norm was structurally unfair to pitchers.** The 8 gradeable prop types split
   5 batting / 3 pitching, so against one constant a pitcher topped out at 0.6 **by construction**
   and no ace could out-score a bench outfielder. Split into per-group norms, with the group inferred
   from the market keys (not the season index, so a rookie call-up still gets the right norm).
2. **The star ceiling had to become board-level.** NFL seats player squares in one block; MLB seats
   them in two, plus a last-resort top-up. Bounding only the prop draw let boards reach **7–8 stars
   against a ceiling of 5**. `mlbTierCounts` is now shared across all three. **The ceiling is hard
   and the floor degrades** — the plan gives the reservation a "take what exists" clause and gives
   the ceiling none — with the last-resort fill running two passes so a board still always reaches 24.
3. **One square per market, not two.** The old code emitted an `mlb_achievement:` twin carrying the
   **identical resolver** under a different key. Dead while the feed was dead; live, it would put two
   squares on a board that win and lose together. The achievement phrasing is now a **label** on the
   single player-prop square.

### Two bugs found by writing the tests

- **Two of the eleven hardcoded brand names never matched anything.** `normalizeNameKey` strips
  generational suffixes, but the set stored `"fernando tatis jr"` / `"vladimir guerrero jr"`, so
  `has(normalizeNameKey(name))` could never hit either. Fixed, and pinned by a test that rejects any
  key carrying a suffix the normalizer would remove.
- **`tests/lib.sportsBingo.mlb-win-rate-calibration.test.ts` was deterministically red before this
  phase** — confirmed by reverting every 9d change that touches MLB generation and reproducing it
  unchanged. Its mock served history games under each *fixture* game's clubs, but `relatedGameIds`
  keeps only history involving the **active** matchup's clubs; fixture game 0 is Dodgers @
  Diamondbacks and no other fixture game involves either club, so it got no history, no team-event
  block, and threw on its first game. Fixed in the mock (history rows now wear the active matchup's
  nameplate, keeping thirteen real box-score lines), which is what makes its 20–30% band assertion
  actually run.

### Verification, including live

`npm run bingo:stars:mlb` pulled **1,405 rows for 2026 and 1,792 for 2025** (1,403 / 1,487 scored);
the 2025 top reads Juan Soto, Pete Alonso, Francisco Lindor, Rafael Devers, Matt Olson. A live probe
of the repaired prop path returned **94 de-vigged, named markets across 20 players and 8 market
keys** for ATL @ MIN. **`npm run bingo:simulate` gives MLB 44 boards over 11 live games, median
0.2644, `inTargetBand: 1.0`** — every board inside 20–30%, now with real props on it (Phase 7 had
measured MLB stuck near a 0.31 median).

### What a future phase should know

1. **Nobody has watched a real MLB board with props on it.** Phase 7's note 6 asked how a
   re-thresholded MLB board *feels* over a full game; that is now a different board, still unobserved.
2. **`MLB_MILESTONE_DEVIG_FACTOR` (0.95) is this phase's least-evidenced constant**, exactly as NFL's
   0.92 is for NFL. Validate against realized hit rates once settled boards carry real props.
3. **MLB's freshness tripwire is live for two thirds of the year**, unlike NFL's — MLB runs
   March–November and reports `in_season` today, so `npm run bingo:stars:mlb` is a real fortnightly
   obligation in season. **With two leagues now on the same manual refresh, a cron for the audit is
   worth proposing to Andrew** — `vercel.json` remains a hard boundary, and the live 24h-cached layer
   means the product is already correct without one.
4. **`buildMLBPlayerPropCandidatesFromRecentStats` still returns `[]` for any game whose clubs have
   no trailing history in the window**, and it builds the entire team-event block most of an MLB
   board is made of. That early return is a real generation cliff — it is what made Phase 7's test
   fail — and deserves a look on its own.
5. **The raw-implied vig bug is fixed for MLB *props* only.** `defaultMlbOverProbability` and the MLB
   achievement pricing are still hand-picked sigmoids; Phase 5's note 5 called for a Phase-2-style
   odds consensus for MLB, and this phase delivers half of it.

---

# Appendix — pre-existing test debt found during Phase 2

> **Extracted 2026-08-17 → `docs/admin-test-debt-phases-a-b-plan.md`.** These two phases now have
> their own standalone plan, re-verified against current source, to be executed **after** the Prop
> Bingo code review lands. Use that file; the text below is kept as the original diagnosis record.

The two phases below are **not Prop Bingo work.** They're the four `npm run test` failures that
were already red on `main` before any of this plan's work started, investigated on 2026-08-16
because Phase 2 needed to distinguish "I broke this" from "this was already broken." They're
recorded here so the next agent can clear the suite to green instead of re-diagnosing them, and
so nobody mistakes a red baseline for a Phase 2 regression.

**Both have the same root cause: commit `6c2ff46` "Tweaking Admin Mobile View" (Andrew, 2026-08-07).**
That commit made two deliberate, coherent product changes to the admin mobile surface and updated
zero tests and zero docs (`git show 6c2ff46 --stat -- docs/` is empty). Neither change is wrong —
the *tests* are stale, and one of the two changes shipped with no coverage at all.

**Do these in either order; they don't interact.** Neither touches Prop Bingo, so they can also be
done before Phase 3 to get a clean baseline first — which is the recommendation, since a green
suite makes Phase 3's own regressions obvious.

---

## Phase A — mobile admin tab allowlist went 3 → 2 (1 failing test)

**Failing:** `tests/admin-mobile.section-registry-split.test.ts` →
*"keeps the mobile allowlist a literal 3-item array, never derived"*
(`AssertionError: expected [...] to have a length of 3 but got 2`).

**Diagnosis: the test is stale, the code is correct.** `6c2ff46` intentionally removed
`"game-settings"` from the mobile admin tab bar, and did so *completely and coherently* —
all four call sites moved together:

| File | Change in `6c2ff46` |
| --- | --- |
| `components/admin/adminSectionMeta.ts:97` | `MOBILE_SECTION_ORDER` lost `"game-settings"` |
| `components/admin/AdminMobileShell.tsx` | dropped `GameSettingsSection` from its import |
| " | `TAB_ICON` lost the `"game-settings": "🎮"` entry |
| " | `renderSection`'s `case "game-settings"` removed |
| " | nav grid `grid-cols-3` → `grid-cols-2`, tabs enlarged to `min-h-[104px]` |

That is a finished change, not a half-done one. Only the test's hardcoded `3` was left behind.

**The fix — do NOT just change `3` to `2`.** Read the test's own comment (lines 114–117): the
invariant it exists to protect is *"adding a section to `ADMIN_SECTION_OPTIONS` must never make it
reachable on mobile — only editing this literal list does."* The count was never the point; it was
a proxy for "this is a hand-written literal." Hardcoding `2` just re-arms the same tripwire to
fire on the next intentional edit. Instead assert the property directly:

- the match against `/MOBILE_SECTION_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/` still succeeds (that
  regex only matches an inline array literal — a derived value like `ADMIN_SECTION_OPTIONS.filter(…)`
  cannot match it, which is the real guard);
- every entry is a quoted string literal (`/^"[a-z-]+"$/`), i.e. no spreads, no identifiers, no
  computed members;
- the array is non-empty and small — assert a bound like `≤ 5` rather than an exact count, since
  the tab bar is a fixed-width grid and "small" is the actual product constraint;
- keep the existing `expect(stripped).not.toMatch(/MOBILE_SECTION_ORDER[\s\S]{0,80}ADMIN_SECTION_OPTIONS/)`
  line exactly as-is — that's the second half of the derived-value guard.
- Rename the test (it says "3-item" in its own title) to something like
  *"keeps the mobile allowlist a literal string-array, never derived"*.

**Also worth adding while you're here (currently uncovered):** nothing asserts that
`MOBILE_SECTION_ORDER`, `TAB_ICON` and `AdminMobileShell`'s `renderSection` switch stay in sync.
`TAB_ICON` is typed `Record<MobileSection, string>` so `tsc` catches that one, but the switch is
not exhaustive-checked. A one-line test that every id in `MOBILE_SECTION_ORDER` appears as a
`case "<id>":` in `AdminMobileShell.tsx` would have caught a half-done version of `6c2ff46`.

**Model: Sonnet 5 · effort: low.** One test file, no product code changes.

---

## Phase B — the edit-mode geofence lock (3 failing tests)

**Failing:** all three in `tests/venue-activation.phase4-mount.test.ts` →
*"edit mode renders the slider at the venue's radius and no old controls"*,
*"ArrowRight on the dial then Save submits radius: 175…"*,
*"a dial move keeps source lookup (placeId preserved)…"*.
All three fail identically: `TestingLibraryElementError: Unable to find an accessible element with
the role "slider" and name "Geofence radius"`.

**Diagnosis: one root cause, and the tests are stale.** `6c2ff46` added a `startLocked` prop to
`components/admin/GeofenceEditor.tsx` (`:57`, `:73`, `:81`). When locked, the component
**returns early** (`:169`) and renders a read-only summary card — pin label, `Geofence radius: 150 m`,
coordinates, a "Check ↗" maps link, and a `🔒 Edit location & geofence` button — instead of the
map and radius dial. Its rationale, quoted from the prop's own docstring: *"so a thumb scrolling
past the map can't nudge the pin or resize the geofence by accident."*

`components/admin/mobile/ActivateVenueFlow.tsx:432` passes `startLocked={mode === "edit"}`. All
three failing tests render `mode: "edit"`, so the slider genuinely is not in the DOM. The lock is
uncontrolled and one-way — once opened it stays open for that form mount.

The three tests that still pass in that file are the ones that never reach the slider: the
`hideAdvanced` test asserts on `ActivateVenueFlow`'s *own* Advanced panel (not the editor's), and
both `VenuesSection` desktop tests use the create flow, which passes no `startLocked`.

**The fix:** add one unlock click before each slider query:

```ts
fireEvent.click(screen.getByRole("button", { name: /Edit location & geofence/ }));
```

**Verified working** — a throwaway probe (rendered `mode: "edit"`, asserted the slider is absent,
clicked unlock, then read `aria-valuenow === "150"`) passes. Prefer a small local
`renderUnlockedEditFlow()` helper over three copy-pasted clicks, since all three tests need the
identical two steps.

**The more important half: the lock has ZERO test coverage anywhere.** Grepped every test that
touches `GeofenceEditor` / `ActivateVenueFlow` — `tests/venue-activation.geofence-editor.test.ts`
renders the editor directly and never passes `startLocked` (so it defaults to `false` and passes),
and `tests/admin-mobile.activate-venue.test.ts` never reaches the dial. That is precisely why this
shipped as three red tests rather than one clear signal. Add, in the same file:

- **locked is the default in edit mode** — `mode: "edit"` renders no `role="slider"`, and the
  summary card shows `Geofence radius: 150 m`;
- **create mode is NOT locked** — `mode: "create"` exposes the slider immediately (this is the
  documented asymmetry: "Omit (or false) for the create flow, where there's nothing destructive to
  protect yet"). Confirm the create flow's exact props first;
- **unlock is one-way** — after clicking through, the slider stays mounted across a re-render;
- **the locked summary is read-only** — it must not be possible to change radius or coordinates
  without unlocking first. This is the actual product guarantee, and it's the one thing no test
  asserts today.

**Then update the owning docs, which are also stale.** `6c2ff46` documented nothing.
`docs/venue-activation-map-radius-plan.md` (whose Phase 5 these tests belong to) describes the
edit surface with no mention of a lock, and `docs/venue-activation-device-checklist.md` has no
manual check for it. Add a short as-built note to the plan and a checklist line for the lock's
touch behavior on a real phone — the "stray thumb" case it exists to prevent is exactly the kind
of thing jsdom cannot verify.

**Model: Sonnet 5 · effort: medium.** The test repair is mechanical; the new coverage and the doc
reconciliation are the substance.

---

### Handoff notes for whoever does Phase A / Phase B

1. **Confirm the baseline before you start:** `git stash -u && npm run test && git stash pop`
   should show exactly these 4 failures and nothing else. If you see more, something landed
   between 2026-08-16 and now — re-diagnose rather than assuming this appendix is current.
2. **Do not "fix" the product code in either phase.** Both product changes in `6c2ff46` are
   intentional and internally consistent (Phase A verified across four call sites, Phase B
   documented in the prop's own docstring). Reverting either to satisfy a test would be backwards.
   If you think one of them is actually wrong, that's a conversation with Andrew, not a code change.
3. **`6c2ff46` was a direct hand-edit with no doc updates.** Treat any other assertion about the
   admin-mobile or venue-activation surfaces written before 2026-08-07 as suspect until checked
   against the current source — these four failures may not be the only stale ones, they're just
   the only ones that happen to be *failing*. A test that passes for the wrong reason is worse.
4. **After both phases, `npm run test` should be fully green.** That's the acceptance criterion —
   and it's worth landing before Phase 3 of the Prop Bingo plan, so the next NFL change has an
   unambiguous baseline.
5. Neither phase touches Prop Bingo, `lib/sportsBingo.ts`, `lib/sportsBingoOdds.ts`, or any flag.
   They can be committed separately from the Phase 1/2 work sitting in the tree.
