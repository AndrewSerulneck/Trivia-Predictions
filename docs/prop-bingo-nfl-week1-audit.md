# Prop Bingo — NFL Week 1 Offline Board Audit (Phase 1)

**Ran:** 2026-09-05 ~20:05 ET, Sonnet 5. **Phase 1 of `docs/prop-bingo-nfl-activation-plan.md`.**
**Raw data:** `docs/phase0-artifacts/nfl-week1-board-audit-2026-09-05.json` (24 generated boards, full square lists).
**Tool:** `scripts/audit-nfl-week1-boards.cjs` (new this phase — join board preview → candidate pool by key, score against the parity bar).

> **Read this first:** the audit was run **4–8 days before kickoff**, not on Tue 9/8 as the plan's
> "earliest" guidance intended. That timing drives findings #1 and #2 below — the Sunday-slate prop
> markets (yardage over/unders) are **not posted yet**, so two of the four audited games have a
> TD-only prop pool. **The Phase 2 owner MUST re-run this audit on Tue 9/8** (see handoff). The
> opener (NE @ SEA), whose props *are* fully posted, is the clean read and it passes every offline
> parity item.

---

## How the audit was run

The forward pipeline (`getGameCatalog`) only serves games inside `BINGO_LOOKAHEAD_HOURS`, a
**hardcoded `const = 36`** in `lib/sportsBingo.ts` (not env-configurable in prod). To reach Week 1
from 4–8 days out, that const was temporarily changed to `240`, the audit run, and the change
**reverted** (confirmed: `git status` shows only the new untracked `.cjs` script; `lib/sportsBingo.ts`
is byte-clean). `generateSportsBingoBoard({ gameId })` takes an explicit id and bypasses the
"today only" filter in `listSportsBingoGames`, so game ids came from `npm run bingo:probe:nfl`.

`npm run bingo:simulate` (forward) **still cannot score NFL** even with the widened lookahead,
because `listSportsBingoGames` also filters to games whose local date equals *today* — none of the
Week 1 games are "today". Its `inTargetBand` metric is therefore unavailable until an actual NFL
game day (Wed 9/9 / Sun 9/13). The 24-board direct sample below is the substitute.

Games audited (6 boards each, `generationMode: "final"`):

| Game id | Matchup | Kickoff | Prop-pool size | Prop markets available |
|---|---|---|---|---|
| 1392216 | NE @ SEA | Wed 9/9 8:20pm ET | **59** | full — yardage O/U + anytime/first TD |
| 1392218 | TB @ CIN | Sun 9/13 1:00pm ET | 30 | full |
| 1392219 | NO @ DET | Sun 9/13 1:00pm ET | **18** | **TD-only** (no yardage O/U posted yet) |
| 1392221 | BAL @ IND | Sun 9/13 1:00pm ET | **16** | **TD-only** |

---

## Parity-bar verdict (offline-judgeable items: 1, 2, 3, 4, 8)

| # | Requirement | NE @ SEA | TB @ CIN | NO @ DET | BAL @ IND |
|---|---|---|---|---|---|
| 1 | 25 squares, mix **2 ml / 3 spread / 3 total / 2 tt / 6 special / 8 prop** | ✅ exact, all 6 boards | ✅ exact, all 6 | ❌ **4 prop / 8–10 special** | ❌ **4 prop / 8–10 special** |
| 2 | Board win rate 20–30% | ✅ 0.218–0.293 | ✅ 0.214–0.292 | ✅ 0.223–0.268 | ✅ 0.226–0.300 |
| 3 | De-vigged off real market consensus | ✅ 8 vendors; no priced-square anomaly; every core square 0.18–0.82 | ✅ | ✅ | ✅ |
| 4 | Star-tilted, ≥2 non-star, recognisable **2026** names | ✅ star 2–4 / known+deep 3–5 / reservation never degraded | ✅ star 3–4 / known 4–5 | ⚠️ star ~2–3 (thin pool) | ⚠️ star ~3–4 (thin pool) |
| 8 | Missing data voids, never mis-settles | n/a offline — unchanged from backtest coverage | | | |

**Median board probability across all 24 boards ≈ 0.25**, every board inside 20–30%. Item 2 passes
outright. Items 1/3/4 pass for the two games whose prop markets are posted; the two thin-pool
Sunday games fail item 1 for a **timing** reason that must be re-checked Tue 9/8.

**Phase 1 "done when" (three boards passing items 1,2,3,4,8):** met by the 12 NE @ SEA + TB @ CIN
boards. The Sunday-slate result is explicitly gated on the Tue 9/8 re-run.

---

## Findings, ranked

### 1. Thin prop pool → prop bucket underfilled, specials backfill to 8–10 (re-check Tue 9/8)

`data/live-trivia`… n/a. Games ≥5 days out only have `anytime_td` / `first_td` markets posted — no
yardage over/unders. `NO @ DET` (18 candidates) and `BAL @ IND` (16) cannot fill the 8 prop slots;
every board came back with **4 prop squares** and the shortfall silently absorbed by the `special`
bucket (avg 8.3 and 9.0 specials/board respectively, vs the target 6), plus spread/total/team-total
each running ~0.5–1 over target.

- **NE @ SEA (59 candidates) hits 8/8 props on every board** with an exact 2/3/3/2/6/8 mix. This
  strongly suggests the pool fills out as books post props during kickoff week and the issue
  self-resolves.
- **If it does NOT self-resolve by Tue 9/8, this is a real bug:** the special-backfill path has no
  cap, so a board can ship with 9–10 mostly-correlated game-script squares (red-zone trips,
  scoreless quarters, fourth-down conversions) — a wall of squares that all move together on one
  blowout. The fix would be a cap on special substitution (e.g. never exceed target + 2) with the
  board accepting <24 live squares before it floods specials, or a lower `desiredPlayerPropCount`
  floor for thin pools.
- Not fixed in Phase 1 because the correct fix depends on the Tue 9/8 re-run telling us whether
  there's anything to fix.

### 2. No roster / team gate on prop candidates (fold into Phase 4; re-check Tue 9/8)

The per-game `/nfl/v1/odds/player_props` list, 4–8 days out, contains players on **neither team**:

| Game | Off-roster players in the candidate pool |
|---|---|
| NE @ SEA | **A.J. Brown** (PHI), **Romeo Doubs** (GB), **Rashid Shaheed** (NO), Emanuel Wilson (GB), Corey Kiner (CIN) |
| NO @ DET | **Audric Estime** (DEN), Jacob Saylors, Bryce Lance |
| BAL @ IND | **Ja'Kobi Lane** |

A.J. Brown, Romeo Doubs and Rashid Shaheed each **landed on generated NE @ SEA boards** — they'd
read as marquee names on a game they're not in. `fetchNFLPlayerPropMarkets` is correctly
game-scoped (`game_id=<id>`), so this is upstream feed noise. `teamName` *is* resolved from the
player profile (`lib/sportsBingoOdds.ts:1014`) but is used only by the Phase 5b correlated
estimator — never as a filter.

- **Fold into Phase 4** ("a prop is never assigned to a player who won't play"): drop a prop whose
  resolved `teamName` matches neither `game.homeTeam` nor `game.awayTeam` — **only when `teamName`
  is present** (a missing team is explicitly tolerated today and must stay tolerated).
- The feed is otherwise **2026-roster-aware** — Sam Darnold and Cooper Kupp resolve to SEA, Daniel
  Jones to IND, all correct for 2026 — so a team gate is safe and won't strip legitimate players.
- Re-check Tue 9/8: the off-roster contamination may clean up as books finalize their prop sheets.

### 3. `anytime_td_1q…4q` markets exist in the feed but are never turned into squares (decision needed)

Only full-game `anytime_td` (`NFL_CORE_MILESTONE_PROP_TYPES`) and `first_td`
(`NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES`) are in the allowlist. `bingo:probe:nfl` confirms
`anytime_td_1q…4q` are posted 5 days out. Consequence for pacing (parity item 5, "resolve
*through* the game"): a typical board has **~2 squares that definitely resolve before Q4**
(first-TD squares) plus **~3 that can** (anytime-TD props, scoreless-quarter, defensive TD) out of
24. Three NE @ SEA boards had **zero** definite-early squares.

- Not a Phase 1 fix (needs a new quarter-scoped resolver variant + `/nfl/v1/plays` or a quarter
  box-score read).
- **Decision for Andrew / the Phase 3 owner:** either accept that early movement rides on first-TD
  squares + first-half specials, or add `anytime_td_1q` (and maybe `_2q`) to the milestone
  allowlist with a quarter-scoped `nfl_player_anytime_td` resolver. This is the single clearest
  pacing lever left unused.

### 4. Up to 2 prop squares per player — by design, but conflicts with the Phase 1 checklist wording

`pickCandidateSet` caps at "max 2 squares per player, max 2 per prop type"
(`lib/sportsBingo.ts:7278`) — a **shared** rule, same for NBA/MLB. Boards routinely place a player
twice: Cade Otton on two yardage lines (5 of 6 TB @ CIN boards); **Chase Brown on
`first_td` + `anytime_td` at once** (board 1) — that pair is near-perfectly correlated, lower value
than two independent lines. Jonathan Taylor ×2, Sam Darnold ×2, Drake Maye ×2 also seen.

- Phase 1's checklist bullet says "no player appears on two squares." The implementation says ≤2.
- Tightening to 1-per-player for NFL means editing the shared `pickCandidateSet`, which
  "what must not break" puts off-limits for anything but Phases 0/3. **Andrew's call:** loosen the
  bullet to "≤2, and never the same player on two *correlated* markets (first-TD + anytime-TD)", or
  schedule a shared-function change.

### 5. Label length — longest of any league (SHORTENED 2026-09-05; one family remains)

Original max was 61–63 chars (`"Seahawks score a touchdown on every red-zone trip (3+ trips)."`,
`"Jaxon Smith-Njigba scores the game's first touchdown."`). **13 `nfl_*` label templates were
shortened** in `buildSquareLabel` (`lib/sportsBingo.ts`), plus an NFL-only short form for the
shared `spread_keep_close` label (`"Final margin under 7.5 points."` — NBA/MLB byte-unchanged).
Verified over 60 historical boards: **max label 63 → 48, p90 44 → 36, median 28.** `first_td`
label test updated (`tests/lib.sportsBingo.nfl-prop-mix.test.ts:186`).

**Remaining ≥43-char outlier — one family only:** `"<Team> are held to 300 total yards or fewer."`
(43–48), from `describeNFLTeamStat` in `lib/sportsBingoNflFlavor.ts`. Left alone — that module
carries the Phase 8b threshold sweep and its own tests; a 4-char win isn't worth the churn. Fold
it into any future Phase 8b flavor pass.

Phase 2's device pass should still eyeball the ~48-char specials and the longest prop labels
(`"<Full Name> scores the game's first TD."`) in a real 5×5 cell.

---

## Addendum — historical (2025) backtest of board composition + settlement (2026-09-05)

Ran `scripts/audit-nfl-historical-boards.cjs` over **2025 Weeks 1 / 10 / 18, 15 games, 60 boards**
(`docs/phase0-artifacts/nfl-historical-board-audit-2025-weeks-1-10-18.json`). This is the "test on
last season's data" path. **What it can and cannot cover:**

- **Cannot:** player-prop squares. `/nfl/v1/odds/player_props` is live-only — balldontlie stores no
  history and books post props only in game week, so there is *no* historical source for the 8 prop
  slots. A historical board is core markets + special/quarter/team-stat squares only. (Documented at
  `lib/sportsBingo.ts:7959`.)
- **Can, and did, verify on real completed games:**
  - **Settlement is clean.** 626 hit / 801 miss / **13 void (0.9%)** / **0 pending** across ~1,440
    graded squares. Parity item 8 holds up on historical data — squares resolve, almost nothing
    voids, nothing hangs.
  - **Pricing hits the band without props.** All 60 prop-free boards priced 0.207–0.298 (target
    20–30%). The core + special engine is sound on its own; props are additive texture, not load-
    bearing for the win rate.
  - **Label length** — confirmed with real data. Worst offenders are a small fixed set of
    templates: `"<Team> score a touchdown on every red-zone trip (3+ trips)."` (58–63),
    `"Someone scores in the final 2 minutes of the fourth quarter."` (60),
    `"The first score comes inside the opening 6 minutes."` (51),
    `"<Team> win or lose by less than N.5 points."` (44–47, and many per board). Shortening these
    needs no live data and can be done now (finding #5).
  - **Early-resolvability is thin in 2025 too** (~1–3 definite + 0–2 "can-go-early" of 24 per
    board) — confirms finding #3 (no quarter-scoped TD squares) is a season-independent pacing gap,
    not a 2026-data artifact.

**Bottom line:** the parts of an NFL board that historical data *can* test (pricing, the 16
core/special squares, grading, settlement) are proven on 2025 games. The prop slots can only be
proven live — and the opener's boards already look right today (perfect 8/8 mix, recognisable
2026 names), so the Tue 9/8 re-run is the last check needed, not a rebuild.

### Full-season 2025 backtest (`npm run bingo:simulate -- --backtest`, 2026-09-05)

18 weeks, every completed game, 4 boards each — **1,140 prop-free boards**:

| Metric | Value |
|---|---|
| **Realized win rate** | **0.2667** — inside the 20–30% band, near the 0.25 target (matches the original plan's 0.2561) |
| Predicted median / mean | 0.2552 / 0.2534, **`inTargetBand: 1.0`** (every board) |
| Ungraded square share | **0.64%** — settlement clean across the whole season |
| Legacy independent estimate | mean 0.2477, only 0.667 in-band — confirms the Phase 5b correlated estimator still earns its keep |

Nothing regressed; the NFL board prices and settles correctly end-to-end on a full season. This
is prop-free (the "floor on realism"); the original prop-inclusive full-season backtest tracked
similarly.

## What was verified clean

- **Mix is exact when the pool is full:** NE @ SEA and TB @ CIN produced 2/3/3/2/6/8 on all 12
  boards. 1 free + 24 live, every board.
- **Win rate:** all 24 boards 0.214–0.300, median ~0.25. Comfortably inside the band.
- **No core square outside 0.18–0.82.** Out-of-band squares exist but are all `special` /
  first-TD / anytime-TD longshots (overtime 0.063, safety 0.05, "scores first TD" 0.11–0.15) —
  which is the intended long-tail texture, not the dead 85–93% ladder rungs the plan warned about.
- **Star tilt is 2026-roster-aware and never degraded its reservation.** `nfl_star_mix` telemetry:
  star 2–5 (mostly 3–4), known+deep 3–5, `reservation_degraded: 0` on every board.
- **Gates** (vs Phase 0 baseline): `npx tsc --noEmit` exit 0 after `rm -rf .next`; `npm run lint`
  exit 0; `npm run test:bingo-nfl` **257/257**; `npm run test` 1920 passed / 1 failed / 13 skipped
  — the 1 failure is the pre-existing `tests/lib.billingDiscounts.test.ts` date time-bomb Phase 0
  already documented, unrelated to bingo.
