# Super Bowl Squares + March Madness Brackets — phased plan

**Status (2026-10-19):** Phase 5 done (Squares TV view), committed locally after the Phase 4 commit `8783a7c`;
Phases 1–5 are committed locally, their migrations are APPLIED to production, flags off, nothing pushed or
deployed. Latest handoff: `docs/squares-and-brackets-plan_PHASE_5_HANDOFF.md`. Phase 0's live NFL capture (MNF Oct 19,
Thu Oct 22) still has to be checked against the quarter rule. Next: Phase 6 (review, rehearsal, launch).
Each phase ends with a handoff note `docs/squares-and-brackets-plan_PHASE_<N>_HANDOFF.md` (global CLAUDE.md
rule). After each phase, update this status line to point at the latest handoff.

Model rule: **never more capable than Opus 5.5** (same as `docs/native-app-store-plan.md`). Models:
`claude-opus-5-5`, `claude-sonnet-5-5`. "Effort" is the Claude Code reasoning level (low / medium / high).

---

## For Andrew (plain English)

We're adding two seasonal games to the Venue Home page:

- **Super Bowl Squares**: one shared 10×10 board per venue. Guests claim up to 2 squares each, and everyone can
  see who holds every square. Shortly before
  kickoff the app draws the numbers at random. Whoever holds the square matching the last digit of each team's score
  at the end of Q1, halftime, Q3 and the final wins venue points (25/25/25/50), plus a Prize if the partner set one
  up. If nobody holds the winning square, nobody wins that moment.
- **March Madness Brackets**: each guest fills out a bracket at each venue. There are four brackets: men's,
  women's, and a second-chance (Sweet 16) bracket for each. Scoring is 10/20/40/80/160/320 points per correct pick
  by round. Each venue has its own standings, and partners can offer Prizes for 1st / 2nd / 3rd.

Both games run at every venue automatically while in season, with no partner setup. Both show on the TV screen and
on the Partner Dashboard's Results page. Both feed the venue points total, scaled down so they don't swamp nightly
games.

**Deadlines that drive the order:**

| Date (confirm in Phase 0) | Event |
|---|---|
| Sun Jan 31, 2027 | Conference championships. Both teams are known, so the Squares board opens. |
| **Sun Feb 14, 2027** | **Super Bowl LXI. Squares must be live (flag on) by Mon Jan 25.** |
| Sun Mar 14, 2027 | Selection Sunday (both tournaments). Brackets open that evening. |
| Tue Mar 16 – Thu Mar 18 | Opening round: **12 games per tournament** (both expand to 76 teams in 2027). |
| **Thu Mar 18, 2027** | **Men's Round of 64 tips off; men's brackets lock. Brackets must be live (flag on) by Mon Mar 8.** |
| Fri Mar 19, 2027 | Women's Round of 64 tips off; women's brackets lock. |
| Sun Apr 4 / Mon Apr 5, 2027 | Women's final (Columbus) / men's final (Detroit). Last scoring. |

Dates confirmed in Phase 0 (NCAA.com 2027 schedules, Super Bowl LXI = Feb 14, 2027 at SoFi). The NFL feed has the
2026 regular season ending Jan 10, 2027; the postseason rows don't exist yet.

**Data cost: no new subscription.** On 2026-10-19 the existing BallDontLie key returned the men's and women's
bracket feeds (the paid "GOAT" tier, $39.99/mo per sport) and NFL quarter-by-quarter scores. Each bracket feed is one
request. Running costs are estimated in §6.

**Needs you:** nothing right now. Your §7 answers are recorded in §1 (items 9–15).

---

## 1. Decisions already made (Andrew, 2026-10-19) — do not re-ask

| # | Decision |
|---|---|
| 1 | Squares: **one shared 10×10 board per venue**, first come first served, with a per-player cap. Numbers drawn at a set time before kickoff. |
| 2 | Squares: **Super Bowl only** (no playoff or regular-season boards in v1). |
| 3 | Squares win: **venue points per quarter (Q1, half, Q3, final) + an optional partner Prize** through the existing Prizes wizard. |
| 4 | Both games are **automatic at every venue** in season (like Pick 'Em). No partner opt-in setting. |
| 5 | Brackets: **one bracket per player per venue** (not one global bracket). |
| 6 | Bracket scoring: **standard doubling** (10/20/40/80/160/320, max 1,920). Tiebreaker: championship-game total points. |
| 7 | Both games **feed the venue points total, scaled** (scale: decision 11), and each game also has its own standings. |
| 8 | In v1: **TV screen view, Partner Results page, women's tournament, second-chance (Sweet 16) bracket.** |

Answers to the §7 questions (Andrew, 2026-10-19):

| # | Decision |
|---|---|
| 9 | **Names:** use the real names ("Super Bowl Squares", "March Madness") for now; change later if it becomes a problem. Keep every on-screen name in one copy file so a rename is one edit. |
| 10 | **Legal:** venue Prizes for free games are OK in every state we operate in. |
| 11 | **Points:** Squares 25 each for Q1, halftime, Q3, and 50 for the final. Brackets = bracket points ÷ 10 (max 192 main, 128 second chance). |
| 12 | **Card windows:** Squares Feb 1–15, 2027. Brackets Mar 14–Apr 6, 2027, with an "Opens Selection Sunday" teaser card from Mar 1. |
| 13 | **Squares cap: 2 per player** (not 5). |
| 14 | **Empty winning square: nobody wins** that moment (no roll-forward, no reversed digits). |
| 15 | **Every square's owner is visible to everyone** — players see the whole board with usernames, and partners see every owner. |

Implied by existing rules (CLAUDE.md), also not up for debate:
- Free to play. There is no player payment anywhere in the app.
- On-screen wording says **Prize**, never "Reward".
- Text is never smaller than 12px.
- The native app gets both games automatically: they're player pages, not `/owner/*`.
- Each game is behind its own reversible `NEXT_PUBLIC_*` flag, off by default.

## 2. Facts found while planning (verified 2026-10-19)

- **Bracket feed:** `GET /ncaab/v1/bracket?season=2025` and `/ncaaw/v1/bracket?season=2025` each return **67 games in
  one request** (round 0 = First Four ×4, rounds 1–6 = 32/16/8/4/2/1). Fields: `game_id, season, round,
  bracket_location, date, location, status, status_state, status_detail, home_team{id, seed, score, winner, …},
  away_team{…}`. Note: `season=2025` is the **2026** tournament, so the 2027 tournament is `season=2026`.
- **The feed has no region names.** In round 1, `bracket_location` 1–8, 9–16, 17–24 and 25–32 are the four regions
  (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 in each), and `location` is the host city, not the region. Region
  names (East/West/South/Midwest) and which regions meet in each national semifinal must come from somewhere else.
  Phase 0 decides where: an admin entry on Selection Sunday, or derived from the round-4 site.
- **Unknown until March 2027:** how the feed shows a round-1 slot whose team is still a First Four winner, and how far
  ahead of Selection Sunday the bracket appears. The engine must accept an empty team in a slot, and admins need a
  fix-up tool (Phase 7).
- **NFL feed:** `/nfl/v1/games?seasons[]=2025&postseason=true` has the Super Bowl as `week: 5, postseason: true` with
  `home_team_q1..q4, home_team_ot` and visitor equivalents. **Trap:** a quarter where a team scored 0 comes back
  `null` (2026 SB: Patriots q1–q3 `null`, q4 13, total 13). So `null` means 0 only once a later quarter or the final
  is known. While the game is live, `null` can also mean "not played yet". Phase 0 must capture live snapshots to learn
  how the feed reports the current quarter.
- **The existing BDL webhook** (`app/api/webhooks/balldontlie/route.ts`) handles NBA/MLB player events only. Neither
  game can rely on it.
- **Venue Home today:** every card in `VENUE_HOME_GAME_KEYS` (`lib/venueGameCards.ts`) always shows. Nothing turns a
  card on and off by season, so Phase 1 builds that. Order: `VENUE_HUB_GAME_ORDER` in
  `components/venue/VenueHubClient.tsx`.
- **Venue points** live on the venue-scoped `users.points` row and are credited through RPCs (e.g.
  `claim_pickem_points`). Bracket and Squares credits need the same once-only guarantee.

## 3. Game rules (what Phase 2 / Phase 7 build)

### Squares
- One board per venue for the Super Bowl. Columns = AFC team's last digit, rows = NFC team's last digit. Axis labels
  use the real team names once known.
- Opens when the card window opens (Feb 1). A player claims up to **2** squares and can release a square until
  lock.
- **Lock + draw at kickoff − 30 min.** The server draws two random permutations of 0–9 (`crypto`), stores them and
  shows them. Nobody sees numbers before claiming. Unclaimed squares stay empty.
- **Scoring moments:** end of Q1, halftime, end of Q3 and final (OT counts toward final), using **cumulative** score
  digits. A quarter is confirmed the way Bingo confirms a final: the feed must show the game past that point, held for
  60 seconds (`lib/sportsBingoSettlement.ts` pattern).
- **Empty winning square:** nobody wins that moment (Andrew). Nothing rolls forward.
- **Axes come from `conference`, never home/away:** columns = AFC, rows = NFC. The Super Bowl's designated home team
  alternates by year (AFC was home in Feb 2026).
- A player can win more than one moment.

### Brackets
- Four tournaments per year: men's main, women's main, men's second chance, women's second chance. One entry per
  player per venue per tournament.
- **Main bracket:** 63 picks, opens Selection Sunday, locks at the first Round-of-64 tip **of that tournament**
  (men's and women's lock on different days). In 2027 there are **12** opening-round games per tournament, not 4, so
  up to 12 round-1 slots are "A / B" pairs on Selection Sunday. An opening-round slot shows
  "Team A / Team B", and picking it means picking whichever of the two wins (ESPN's convention).
- **Second chance:** 15 picks from the Sweet 16, opens when the Round of 32 ends and locks at the first Sweet 16 tip.
  Same per-round values (40/80/160/320).
- **Copy picks:** because entries are per venue, a regular at three bars gets a one-tap "Copy my picks from <Venue>"
  button. Same picks, separate entries.
- Graded as each game goes final. Standings = points, then tiebreaker distance, then earliest submit.

## 4. Phases

| Phase | What | Model | Effort | Size |
|---|---|---|---|---|
| 0 | Data spike: fixtures, feed traps, confirm dates | Opus 5.5 | medium | 1 session + 1 live Sunday |
| 1 | Shared foundation: seasonal cards, game keys, flags, scaled points credit | Opus 5.5 | high | 1–2 sessions |
| 2 | Squares engine: tables, claim RPC, draw, settlement, admin panel | Opus 5.5 | high | 2 sessions |
| 3 | Squares player screens | Sonnet 5.5 | high | 2 sessions |
| 4 | Squares Prizes + Results page | Opus 5.5 | high | 1–2 sessions |
| 5 | Squares TV view | Sonnet 5.5 | medium | 1 session |
| 6 | Squares review, rehearsal, launch (by Jan 25) | Opus 5.5 | high | 1–2 sessions + Andrew |
| 7 | Bracket engine: 4 tournaments, sync, grading, admin fix-ups | Opus 5.5 | high | 2–3 sessions |
| 8 | Bracket player screens: fill out, copy, view, standings | Sonnet 5.5 | high | 2–3 sessions |
| 9 | Bracket Prizes + Results + TV | Opus 5.5 (9a) / Sonnet 5.5 (9b) | high / medium | 2 sessions |
| 10 | Bracket review, replay rehearsal, launch (by Mar 8), live watch | Opus 5.5 | high | 1–2 sessions + Andrew |
| 11 | Post-season usage vs estimate, clean-up | Sonnet 5.5 | low | 1 session |

### Phase 0 — Data spike (Opus 5.5 · medium)
- Save fixtures under `tests/fixtures/squares/` and `tests/fixtures/brackets/`: the 2026 Super Bowl record, the full
  2025-season men's and women's bracket responses, and the NCAAB `/games` records for the same game ids.
- **Live NFL capture:** on one Sunday (any regular-season game), poll that game once a minute from kickoff to final
  (≈200 requests). Record what `status`/`status_detail` say at each quarter break, and when q-fields go from `null` to
  numbers. This decides the quarter-confirmation rule.
- Decide where region names and Final Four pairings come from (§2). Map `bracket_location` per round into a fixed
  63-slot tree (`slot → child slots`) and prove it against the 2025 fixture.
- Confirm the §0 dates from the feeds or the leagues' published schedules.
- Out of scope: any production code.

### Phase 1 — Shared foundation (Opus 5.5 · high)
- **Seasonal cards:** one new file, `lib/seasonalGames.ts`, holds each seasonal game's card window as plain dates.
  Showing or hiding a card is a pure date check, so the high-traffic hub makes **zero extra requests**. Add
  `"squares"` and `"bracket"` to `VenueGameKey`, `VENUE_GAME_CARDS`, `VENUE_HOME_GAME_KEYS`,
  `VENUE_HUB_GAME_ORDER`, the AppBar title map, `GameChrome` and `GameIdentityPanel` (statement layout:
  add to `STATEMENT_LAYOUT_GAMES`). Copy goes in `lib/venueGameCards.ts`.
- **Flags:** `NEXT_PUBLIC_SQUARES_ENABLED` and `NEXT_PUBLIC_BRACKETS_ENABLED`, one reader each (`lib/seasonalGames.ts`).
  Off = no card, the routes 404, inert. A card shows only when its flag is on and today is inside its window.
- **Scaled points credit, one home:** `lib/seasonalPoints.ts` plus a migration with a service-only RPC
  `credit_seasonal_points(user_id, source, source_key, points)`. Its ledger has a unique `(source, source_key)`, so a
  retried settlement never pays twice. It adds to `users.points` in the same transaction. Scale constants live in the
  same file (decision 11).
- **Account deletion:** every new table that references `users` must be handled in `delete_player_account`, through a
  new migration that replaces the function. `tests/account-deletion-contract.test.ts` fails until it is. Then run
  `npm run test:account-deletion-sql`.
- **Grants:** every new table gets an explicit `service_role` grant (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`).
- Add `ChallengeGameType` values for both games (`types/index.ts`).
- Legal: add the two games to the official contest rules (`lib/legalInfo.ts`, `/rules`).

### Phase 2 — Squares engine (Opus 5.5 · high)
- Tables (proposal):
  - `squares_events`: season, BDL game id, teams, lock time, drawn digits, per-moment status.
  - `squares_boards`: one per venue per event, created lazily on first open.
  - `squares_claims`: board, cell 0–99, venue user id, unique `(board, cell)`.
  - `squares_results`: moment, winning cell, user, points credited.
- **Claim/release RPC:** a count-guarded insert under a per-board advisory lock, the same pattern as
  `award_cycle_winner`. It enforces the cap, the lock time and cell uniqueness. Never a TypeScript read-then-write.
- **Draw:** a cron-driven step at lock time. It is idempotent: it draws once and never re-draws.
- **Settlement:** one BDL request per run, **only inside the game window** (lock → final + 3 h). Each confirmed moment
  is graded for every board in one set-based SQL statement, then credits go through `credit_seasonal_points`. No
  per-board loops calling the API. Hook it into an existing every-minute cron (`/api/cron/pickem-settle`) behind a
  date check that costs nothing outside the window. A new `vercel.json` entry needs Andrew's explicit OK.
- **Event auto-create:** the event row is created from the NFL feed once the Super Bowl matchup exists. An admin panel
  shows status and has fix-ups: set the game id, move the lock time, and void and re-grade a moment (logged).
- Unit tests replay the Phase 0 fixtures, including null-quarter and OT cases.

### Phase 3 — Squares player screens (Sonnet 5.5 · high)
- Route `/squares` with `GameLandingExperience` + tutorial cards (statement layout), the venue-home card, and the
  return transition.
- **The grid on a phone:** at 289 px wide, a cell is about 26 px, too small for names at 12px. So cells show colour
  only: mine, taken, open, winner. Tapping a cell opens a small sheet with the owner's username (every owner is
  public, decision 15). Check at 350 px and 289 px.
- Before lock: claim/release with haptics (`haptic()` only) and a "x of 2 used" line. After lock: digits on the axes,
  live score, the current leading square, and each moment's winner.
- Every closable popup calls `useNativeBackHandler` and is added to `tests/native-back-review-fixes.test.ts`.
- **Freshness without cost:** while the game is live, the score comes from one shared endpoint that every venue reads,
  CDN-cached for 15 s (`s-maxage`, not user-specific). The board (per venue) is polled every 30 s only while the page is
  open and before lock. See §6.

### Phase 4 — Squares Prizes + Results (Opus 5.5 · high)
- New entry in `lib/rewardDefinitions.ts` (follow `AGENTS.md`). The partner chooses which moments pay a Prize (any of
  Q1 / half / Q3 / final). Each moment is one winner, awarded through `award_cycle_winner`. No points target, no
  minimum players. If `guardRewardWizardStep` would show `players`, skip it. `CreateRewardWizard` stays one shared
  component.
- Results page: register `squares` in `lib/results/competitions.ts` (`hasBreakdown: false`), add an adapter, and add a
  placement rule (Prize → that game's card). The privacy contract still holds: no player ids leave the server.

### Phase 5 — Squares TV view (Sonnet 5.5 · medium)
- During the event window the venue screen shows the grid, digits, live score, leading square and moment winners.
  It replaces the idle attract screen, and scheduled Live Trivia still wins. Reuse the existing screen status polling.
  Add no new per-TV request loop.

### Phase 6 — Squares review, rehearsal, launch (Opus 5.5 · high)
- Run `/code-review high` on Phases 1–5 and fix the findings.
- **Rehearsal:** point a test event at a late-season or playoff NFL game on hidden venue `venue-hightop-test` and
  run claim → draw → live → settle → points → Prize → Results → TV for real.
- Andrew does the phone pass (new device checklist `docs/squares-and-brackets-device-checklist.md`, section A).
- Turn on `NEXT_PUBLIC_SQUARES_ENABLED` and redeploy by **Mon Jan 25, 2027**. Watch the logs on Feb 14 and record
  actual request counts.

### Phase 7 — Bracket engine (Opus 5.5 · high)
- Tables (proposal):
  - `bracket_tournaments`: gender, season, kind main/second_chance, opens/locks, region names, status.
  - `bracket_games`: the 63 slots, teams, seeds, winner, tip time.
  - `bracket_entries`: venue user, tournament, **picks as one compact array**, tiebreaker, score, submitted_at.
    Unique `(user, tournament)`.
- Picks live in one array per entry rather than one row per pick. That's about 20k entry rows instead of 1.3M pick
  rows at 100 venues (§6), and grading is one set-based UPDATE per finished game.
- **Pure logic in `lib/brackets/`:** slot tree, pick validation (a later-round pick must follow from earlier picks),
  scoring, tiebreaker, and "copy picks". The UI only calls these, so Phase 8 has no rules to get wrong.
- **Sync cron:** two requests per run (men's + women's), every 2 min while a game is live, hourly otherwise inside the
  tournament window, and nothing outside it. On each newly final game: grade, recompute affected scores, and credit
  scaled venue points (decision 11) through `credit_seasonal_points`.
- Lock is enforced server-side at the stored lock time (never the client clock).
- Admin panel: tournament status, region names, and fix-ups (set a slot's team, override a result and re-grade, all
  logged), plus a "replay fixture" dry run.
- Tests replay the full 2025 men's and women's fixtures game by game and check the final standings.

### Phase 8 — Bracket player screens (Sonnet 5.5 · high)
- Route `/bracket` with a tournament switcher (Men's / Women's, Main / Second chance) that shows only the open or
  graded ones.
- **Filling it out on a phone:** one region at a time (15 picks), then the Final Four (3 picks). Choosing a later-round
  pick that conflicts with an earlier one clears the later ones (logic from `lib/brackets/`). Progress shows as "41 of
  63". Then the tiebreaker, then Save. Drafts save to the server on each step.
- Read-only bracket view after lock, with right/wrong marks and "still alive" counts. Venue standings with "Find a
  player". "Copy my picks from <Venue>" when the player has an entry elsewhere.
- Same native, back-handler, text-floor and statement-layout rules as Phase 3.

### Phase 9 — Bracket Prizes, Results, TV
- **9a (Opus 5.5 · high):** a reward definition with ranked places 1st/2nd/3rd per tournament at the venue, using the
  existing `players` minimum step. It's resolved when that tournament's final is graded. Results: register `bracket`
  (`hasBreakdown: true`, a player's 63 picks right/wrong) plus a placement rule (week row of the final).
- **9b (Sonnet 5.5 · medium):** TV view in the tournament window: the venue's top 10, today's games, and the biggest
  upset busting brackets. Same no-new-polling rule as Phase 5.

### Phase 10 — Bracket review, rehearsal, launch (Opus 5.5 · high)
- Run `/code-review high` on Phases 7–9 and fix the findings.
- Replay the 2025 tournament on `venue-hightop-test` with time travel (admin dry run), including second chance.
- Andrew does the phone pass (device checklist section B). Turn on `NEXT_PUBLIC_BRACKETS_ENABLED` and redeploy by
  **Mon Mar 8, 2027**.
- **Selection Sunday (Mar 14):** check the feed and region names the same evening, and use the fix-up tool for any
  First Four placeholder issue before the lock on Mar 18.

### Phase 11 — Post-season (Sonnet 5.5 · low)
- Compare actual requests, DB rows and function time with §6. Report differences to Andrew.
- Roll the dates in `lib/seasonalGames.ts` forward for 2028 (or make them data-driven if Andrew wants more events).

## 5. Traps to keep in front of every phase
- `null` quarter scores (§2). Never convert null → 0 while the game is live.
- `season` in the bracket feed is the year the season **started**.
- Unknown First Four representation, so build in admin fix-ups and tolerate empty slots.
- A new `users` FK must be added to `delete_player_account`, and a new table needs an explicit grant.
- Don't edit existing migrations. `supabase db push` is Andrew's call.
- Don't test against production data from a dev server without the hidden test venue. Dev shares the production DB.

## 6. Cost estimate (at 100 venues; today it's far fewer)

| Item | Squares (one evening) | Brackets (≈3 weeks) |
|---|---|---|
| BDL requests | 1/min × ~8 h ≈ **500** total | 2 per run; ~30/h live, 2/h idle ≈ **6–8k** total. Within the current tier. |
| Cron runs | Rides on the existing every-minute cron. 0 extra invocations. | Same: rides on an existing cron. |
| DB rows | ≤10k claims + 4 results/board | ~20k entries (array picks) vs 1.3M if one row per pick |
| Settlement writes | 4 set-based statements + ≤ 400 credits | 67 set-based grading statements + credits per final |
| Player traffic | Score endpoint CDN-cached 15 s ≈ **4 origin hits/min nationwide**. Board polls only before lock. | On demand only. Standings are read when opened, no polling. |
| New subscriptions | None | None (the key already has GOAT NCAAB + NCAAW) |

Estimated recurring cost change: close to zero outside the windows, and small during them. The one expensive trap is
per-player live polling of the board during the Super Bowl (≈1.4M function calls in an evening at 100 venues × 30
players). The 15 s CDN-cached shared score endpoint avoids it. Don't replace that with per-user realtime without
telling Andrew.

## 7. Open questions for Andrew

All seven answered 2026-10-19 — see §1, decisions 9–15. None open.

## 8. Phase 0 findings (2026-10-19) — read before Phases 2 and 7

Full detail: `docs/squares-and-brackets-plan_PHASE_0_HANDOFF.md`. Proven by `tests/brackets-feed-fixture.test.ts`.
- **Bracket tree is implicit in the feed:** round r location k is fed by round r-1 locations 2k-1 (home) and 2k
  (away), for rounds 2–6 — including the Final Four pairings (round 5 location 1 = regions 1+2, location 2 = 3+4). No
  outside source is needed for pairings. Regions = round-1 locations 1–8 / 9–16 / 17–24 / 25–32 = round-4 locations 1–4.
- **Region names: admin enters them on Selection Sunday** (the round-4 site can't be used: the women's regionals
  put two regions in one city). Until entered, show "Region 1–4".
- **`/bracket` pages at 25 by default** — always send `per_page=100` (67 games in one request today; 75 in 2027).
- **`/games` ignores `game_ids[]` and `ids[]`** and returns everything. Use `/games/{id}` or the bracket feed (which
  already carries scores and status). A bracket `game_id` is the `/games` id.
- **A loser's `winner` is `null`, never `false`.** Status values: `post/final/Final`, `Final/OT`, `Final/2OT`.
- **Opening-round winners land in an AWAY slot of round 1, matched only by team id** — no location mapping
  (men's FF 1→r1 21, 4→r1 9). How a not-yet-played opener appears in round 1 is still unknown (March 2027).
- **NFL null vs 0:** finished 2025 postseason records store a scoreless quarter as `null`; a 2026 regular-season final
  (DAL @ GB, id 1392307) stores `0`. Accept both. Quarters + OT always sum to the final score.
- **NFL has `status_state`** (`scheduled` / `final` seen so far); `status` is a display string ("10/19 - 8:15 PM EDT",
  "Final", "Final/OT"). Live values come from the capture in the handoff.

## 9. Phase 1 as built (2026-10-19) — read before Phases 2, 4, 7

Full detail: `docs/squares-and-brackets-plan_PHASE_1_HANDOFF.md`.
- Cards, windows, flags: `lib/seasonalGames.ts` (Eastern-time dates; bracket teaser from Mar 1). Names live only in
  `lib/venueGameCards.ts` (`SQUARES_GAME_NAME`, `BRACKET_GAME_NAME`); `tests/seasonal-games.test.ts` fails on a copy.
- Points: scale in `lib/seasonalPoints.ts`; the only writer is `creditSeasonalPoints` (`lib/seasonalPointsCredit.ts`)
  → **batched** RPC `credit_seasonal_points(p_source, p_credits jsonb)`, ≤ 500 per call (deviation from the
  one-credit signature above, for cost). Ledger `seasonal_points_credits`, unique `(source, source_key)`, user FK
  CASCADE (no `delete_player_account` change needed). **No reversal yet** — Phase 2 adds a logged one.
- Seasonal credits count in the timed venue leaderboards (`lib/leaderboard.ts`, "all" filter).
- `game_sessions_type_valid` allows `squares`/`bracket`. Campaign game types (`VALID_GAME_TYPES`,
  `challenge_campaigns_game_types_valid`) do NOT yet — Phases 4/9.
- Official Rules sections are flag-gated; bump `LEGAL_LAST_UPDATED` when a flag goes on.

## 10. Phase 2 as built (2026-10-19) — read before Phases 3–6

Full detail: `docs/squares-and-brackets-plan_PHASE_2_HANDOFF.md`.
- Migration `20261019051458_squares_engine.sql`: `squares_events` (one current), `squares_event_moments`,
  `squares_boards` (created by the first claim), `squares_claims`, `squares_results`, `squares_admin_log`; RPCs
  `squares_claim` (cap 2, per-board advisory lock, DB-clock lock, own venue only), `squares_draw` (once),
  `squares_grade_moment` (all boards in one statement), `squares_void_moment` (logged; reverses paid / burns unpaid;
  optional admin re-grade); plus `reverse_seasonal_points` on Phase 1's ledger. Credit keys `board:moment:grade_no`.
- One draw per event for every venue. Columns = AFC, `cell = row * 10 + col`.
- Quarter rule (positive evidence only + 60 s hold) in `lib/squares.ts`; **not yet checked against a live game** —
  `tests/squares-engine.test.ts` replays any `nfl-live-capture-*.json` automatically.
- Settlement `runSquaresTick` (`lib/squaresSettlement.ts`) rides on `/api/cron/pickem-settle`; zero I/O unless the
  flag is on and today is in Feb 1–15 (or `SQUARES_REHEARSAL_ENABLED`). ≈ 600 BDL requests per Super Bowl.
- Player API (flag-gated): `GET /api/squares/board`, `POST /api/squares/claim`. Admin: `/api/admin/squares` + the
  "Squares" admin section.

## 11. Phase 3 as built (2026-10-19) — read before Phases 4–6

Full detail: `docs/squares-and-brackets-plan_PHASE_3_HANDOFF.md`.
- Page `/squares` (`app/squares/page.tsx`, `notFound()` with the flag off; statement-layout tutorial with art
  `SquaresIllustration` in `GameIdentityPanel.tsx`) → `components/squares/` (`SquaresGame`, `SquaresGrid`,
  `SquaresCellSheet`, `useSquaresData`). Every decision is a pure function in `lib/squaresView.ts`.
- **Two reads.** Per-venue BOARD (`/api/squares/board`, uncached, every 30 s, only before the lock) and the shared
  SCORE (`GET /api/squares/score`, `lib/squaresScore.ts`: `s-maxage=15`, one DB request per cache miss, no player,
  no sports-feed call) every 15 s after the lock. The board is re-read after the lock only when the draw or a graded
  moment changes (`squaresRevision`). Hidden tab = no requests; game complete = no requests.
- Squares are colour-only `role="gridcell"` divs (NOT buttons: the phone button rules would swell them); a tap opens
  `SquaresCellSheet` (Claim / Release, owner name). Measured: 27.5 px cells at 350 px, 21.4 px at 289 px.
- App-bar label is `SQUARES_SHORT_NAME` ("Squares") — the full name truncated beside the points pill.

## 12. Phase 4 as built (2026-10-19) — read before Phases 5–6, 9

Full detail: `docs/squares-and-brackets-plan_PHASE_4_HANDOFF.md`.
- Migration `20261019131139_squares_prizes.sql` (PGlite-proven, applied 2026-10-19): `'squares'` in `challenge_campaigns_game_types_valid`;
  `challenge_campaigns.squares_moments text[]` (checked by `squares_moments_valid`); `squares_results.prize_checked_at`
  and `prize_withdrawn_at` + partial indexes; RPC `squares_withdraw_prize_coupons`. No new table, no users FK.
- Prize definition `squares_challenge` (`lib/rewardDefinitions.ts`, description `calendar: "super_bowl_squares"`). Pure
  rules in `lib/squaresPrizes.ts`. Offered in the wizard while the flag is on and until Feb 15 (Eastern); the server
  also refuses once the numbers are drawn (`resolveRewardCreationContext`, 409). Partner picks the moments (nothing
  pre-selected); no points target, no minimum players (the Players step never shows). One-off, `winner_quota` = moments,
  `end_date` = Feb 15.
- Each moment is its own prize cycle: `squaresPrizeCycleStart` = kickoff minute + moment (1–4) in seconds + grade_no in
  ms; quota 1 via `award_cycle_winner`. Awarded by `awardSquaresPrizes` (`lib/squaresPrizeAwards.ts`), called through
  `settleSquaresWinners` after points are paid (settlement and admin grade/void). A prize counts only if active, at that
  venue, covering that moment, created before the lock, and not closed before kickoff. **A void + re-grade pays the
  corrected winner and takes back the old coupon if it is unused** (Andrew, 2026-10-19): `withdrawVoidedSquaresPrizes`
  → RPC `squares_withdraw_prize_coupons` (a redeemed coupon is kept), with a notice to that guest.
- Results: `squares` registered (`hasBreakdown: false`), adapter `lib/results/adapters/squares.ts` (inert with the flag
  off), placement rule (prize → the Squares game card, labelled with the moment; a prize repeated on one game shows its
  moment, `rewardTitleAt`).

