# Super Bowl Squares + March Madness Brackets — phased plan

**Status (2026-10-19):** Phase 6's review step done (code review of Phases 0–5, findings checked, device
checklist written); the fixes, rehearsal and launch are sub-phases **6.1–6.9** (§4 Phase 6). **6.1 is built and
committed locally** (each prize sweep pays only its own kind of prize); it fixes a live problem with the NFL Pick 'Em
prize at Pacific Street (§13 F1) **once Andrew pushes and deploys**. Phases 1–5 + the Phase 6 docs (`0af6f13`) are
committed locally; their migrations are APPLIED to production; flags off; nothing pushed or deployed.
**6.2 is built and committed locally** (Squares event lifecycle); its migration `20261019142642` is APPLIED (seen in
`supabase migration list` on 2026-10-19). **6.3 is built and committed locally** (paying winners; no migration).
**6.4 is built and committed locally** (player screen keeps up with a void; no migration).
Andrew: push + deploy (6.1–6.4 ride together).
**6.5 in progress, parked** (live-game recorders restarted 2026-10-19; WSH @ SF Oct 19, NE @ CHI Oct 22) — finish it
after those games: `docs/squares-and-brackets-plan_PHASE_6.5_HANDOFF.md` (interim).
**Phase 7 (bracket engine) built 2026-10-19, not committed**; its migration `20261019203858` is NOT applied (Andrew:
`supabase db push`). Flag off. Handoff: `docs/squares-and-brackets-plan_PHASE_7_HANDOFF.md`.
**Phase 8 (bracket player screens) built 2026-10-19, not committed**, on top of Phase 7: `/bracket` + `components/bracket/`,
no new migration, flag still off. Latest handoff: `docs/squares-and-brackets-plan_PHASE_8_HANDOFF.md`. §15 below.
**Next:** finish 6.5 after the games; 6.6 (re-review, should now cover Phases 7 + 8); Phase 9 (bracket Prizes, Results, TV).
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

**Needs you:** now, a push + deploy of fix 6.1 (built 2026-10-19) (it protects the NFL Pick 'Em prize at Pacific Street from going to a
trivia winner). Later: one `supabase db push` (6.2), the rehearsal phone pass (6.8), and the launch (6.9). Your §7
answers are recorded in §1 (items 9–15).

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
| 6 | Squares review, rehearsal, launch (by Jan 25): review done; fixes and launch are 6.1–6.9 below | Opus 5.5 | high | 1–2 sessions + Andrew |
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
**Phase 6 itself (done 2026-10-19):** `/code-review high` over Phases 0–5 (`863a9b6~1..01b87ad`), each finding checked
against the code and production data, and the device checklist written
(`docs/squares-and-brackets-device-checklist.md`, section A). Findings are in §13. Per Andrew (2026-10-19), they are
**not** patched in place: each problem gets a designed fix, as one of the sub-phases below. Order matters: **6.1 first
and on its own**, because it is a production problem today; 6.2 → 6.3 → 6.4 in any order after it (6.3 uses 6.2's
migration); then 6.5–6.9.

| Sub-phase | What | Model | Effort | Needs Andrew |
|---|---|---|---|---|
| 6.1 | Each prize sweep pays only its own kind of prize (**live problem**) | Opus 5.5 | medium | push + deploy |
| 6.2 | Squares event lifecycle: rehearsal events, archive, late voids (one migration) | Opus 5.5 | high | `supabase db push` |
| 6.3 | Paying winners: chunked writes, stuck results, no idle reads | Opus 5.5 | medium | — |
| 6.4 | Player screen after the final keeps up with a void | Sonnet 5.5 | medium | — |
| 6.5 | Quarter rule checked against the live captures | Opus 5.5 | medium | Mac awake Oct 19 + 22 |
| 6.6 | Re-review of 6.1–6.5 (`/code-review high`) | Opus 5.5 | high | — |
| 6.7 | Rehearsal on `venue-hightop-test` with a real NFL game | Opus 5.5 | high | Preview env vars, phone pass |
| 6.8 | Andrew's phone + TV pass (checklist section A) | — | — | yes |
| 6.9 | Launch: flag on + redeploy by **Mon Jan 25, 2027**; watch Feb 14 | Opus 5.5 | medium | yes |

#### 6.1 — Each prize sweep pays only its own kind of prize (Opus 5.5 · medium) — do first
- **Problem (§13 F1):** the Live Trivia "winner of the game" sweep (`resolveGameWinnerRewards`,
  `lib/liveTriviaWinnerRewards.ts`) keeps every active `game_winner` prize at the venue and never checks
  `rewardDefinitionId`. A Squares prize is `game_winner` with `gameWinnerSlots: null` (= every game), so the next Live
  Trivia game at that venue would win it, and the sweep would then deactivate it before the Super Bowl. **The same gap
  exists today for the NFL "most picks" weekly prize at Pacific Street** (`ceceade0-…`, active since 2026-10-02,
  slots null, recurring weekly). Only its 3-player minimum has kept trivia winners from receiving it; the first
  trivia game there with 3+ players would award it, every week.
- **Solution:** one predicate `isLiveTriviaGameWinnerCampaign(campaign)` in `lib/liveTriviaWinnerRewards.ts`, the
  mirror of `isNFLWeekWinnerCampaign`: active, no winner, `game_winner`, `rewardDefinitionId ===
  "live_trivia_challenge"` (a named constant, like `NFL_PICKEM_REWARD_DEFINITION_ID`), non-empty `venueIds`. The sweep
  filters with it. Production on 2026-10-19 has no `game_winner` prize with a null definition, so the strict check
  drops nothing real. Audit the other `awardCycleWinner` callers (`lib/nflPickEmWinnerRewards.ts`,
  `lib/squaresPrizeAwards.ts`, any ranked-places sweep in `lib/challengeCampaigns.ts`) and give each the same
  own-definition guard.
- **Tests:** behaviour: a finished trivia game with 3+ players does not award a Squares prize or an NFL prize at the
  same venue, and still awards the Live Trivia one. Contract test `tests/prize-sweep-ownership-contract.test.ts`:
  every file that calls `awardCycleWinner` filters on its own definition id.
- **Ship it alone:** no migration. Commit, then ask Andrew to push and deploy before the next Pacific Street trivia
  night with 3+ players (weekly Friday game; next is **Fri Oct 23**). Afterwards check that the NFL prize's
  `challenge_cycle_winners` stays empty across a trivia night.
- **Built 2026-10-19 (committed locally, not deployed):** `isLiveTriviaGameWinnerCampaign` +
  `LIVE_TRIVIA_REWARD_DEFINITION_ID` (`lib/rewardDefinitions.ts`); the weekly-places sweep and its backfill got the
  same check (`isLiveTriviaRankedCampaign`); Squares got an in-memory check beside its filtered read; NFL was already
  guarded. The points-target path stays routed by game type (legacy points targets have no definition). Contract test
  `tests/prize-sweep-ownership-contract.test.ts`. Detail: `docs/squares-and-brackets-plan_PHASE_6.1_HANDOFF.md`.

#### 6.2 — Squares event lifecycle: rehearsal events, archive, late voids (Opus 5.5 · high)
- **Problems (§13 F3, F4, F5):** a rehearsal on any regular-season game pays real partner Squares prizes (and the
  Super Bowl pays them again); archiving the event during Feb 1–15 lets discovery re-create the same Super Bowl as a
  fresh, empty event that draws and grades at once, blanking every board; a void more than 12 h after kickoff is never
  re-graded although the admin message says it will be. Also, the TV read and settlement can't run outside Feb 1–15
  without the public flag, so a December/January rehearsal can't exercise them as built.
- **Migration (one new file; PGlite proof in `npm run test:squares-sql`; Andrew runs `supabase db push`):**
  - `squares_events.purpose text not null default 'super_bowl' check (purpose in ('super_bowl', 'rehearsal'))`.
    Production has 0 events (checked 2026-10-19), so no backfill.
  - `squares_events.reopened_at timestamptz`: set by `squares_void_moment` in the same write that clears
    `completed_at` (replace the function in the new file; never edit the old migration).
  - `squares_results.credit_blocked_at timestamptz` + `credit_blocked_note text` (used by 6.3; kept in this one
    migration so Andrew pushes once).
  - Replace `squares_claim`: on a `rehearsal` event, a claim at a venue that is not `hidden = true` returns a new
    outcome `rehearsal_only`. **This is the main guard**: a rehearsal can never create a board, points, a Prize or a
    Results row at a real venue.
- **Code:**
  - Who decides `purpose`: automatic discovery (the season's Super Bowl) → `super_bowl`; admin "create from game" →
    `super_bowl` only when that game is the season's Super Bowl (postseason, week 5), otherwise `rehearsal`. The admin
    panel shows a REHEARSAL badge. The claim route maps `rehearsal_only` to plain copy.
  - Prizes, as a second guard: `squaresPrizeCoversEvent` pays on a `rehearsal` event only at a hidden venue (one
    extra read of `venues.hidden`, only for a rehearsal event with a winner).
  - Discovery never re-creates a game that already has an archived event (one read by `bdl_game_id`, only on the
    15-minute discovery runs). An admin can still create it explicitly.
  - Archive of a drawn `super_bowl` event is refused until the card window has closed (after Feb 15, Eastern), with
    the reason in the panel: players' screens read the current event, so archiving early blanks them. Before the draw,
    archive stays allowed (wrong-game fix-up; `set_game` usually suffices).
  - Late voids: the tick keeps reading the feed while `completed_at` is null and `now − reopened_at <
    SQUARES_POST_FINAL_WATCH_MS` (3 h), even past the 12 h no-final deadline. Admin message: "It will re-grade from
    the feed within the next few minutes; if the feed no longer shows this game, enter the scores instead."
  - Rehearsal switch, one reader `isSquaresRehearsalEnabled()`: settlement, the board/score/claim routes, `/squares`
    and the TV read (`lib/squaresTvRead.ts`) run outside the window when the public flag AND the rehearsal switch are
    both on. Rehearsal never auto-discovers (no Super Bowl in the feed yet); the event is created by an admin.
    Recommended setup for 6.7: both vars on **Preview only** for the UI, and on **Production** only the server-side
    `SQUARES_REHEARSAL_ENABLED` plus a settlement gate that accepts the switch alone, because Vercel crons run only on
    Production. Decide the exact gate in this phase and record it; the public flag must never be on in Production
    before 6.9, or the Squares prize appears in every partner's wizard (`isSquaresPrizeOffered` has no start date).
- **Tests:** SQL (rehearsal claim refused at a visible venue, accepted at a hidden one; void sets `reopened_at`);
  unit (purpose decision, discovery skip, archive refusal, late-void tick reads the feed, prize guard).
- **Built 2026-10-19 (committed locally; migration not applied, not deployed).** Gate decided: the settlement runs on
  `SQUARES_REHEARSAL_ENABLED` ALONE (`squaresSettlementMode` = `rehearsal`: no discovery, so one event read per cron
  minute with no event), so Production's cron drives a rehearsal with the public flag off. The TV read needs the public
  flag AND (window or switch) (`isSquaresServerLive`). The player routes and `/squares` were already gated on the public
  flag only, so they work on a Preview with it on — unchanged. Also: `set_game` refuses a change of purpose (a Super
  Bowl event re-pointed at a regular-season game would have kept playing at every venue); a late void past the
  deadline is read at the post-final pace (every 5 min), not every minute; the void message says "press Run settlement
  now" when the settlement is off. Detail: `docs/squares-and-brackets-plan_PHASE_6.2_HANDOFF.md`.

#### 6.3 — Paying winners: chunked writes, stuck results, no idle reads (Opus 5.5 · medium)
- **Problems (§13 F2, F7, F8, F9):** `payUnpaidSquaresResults` marks up to 1,000 ids in one `.in()` (PostgREST URL
  limit ≈ 150 UUIDs), so a big moment can never be marked paid and is re-sent every minute; a result whose credit key
  is already paid to someone else (only possible through a bug) is re-sent forever and blocks archive; settlement runs
  three empty reads every minute for days after the game; a stale comment says coupons are never taken back.
- **Solution:**
  - Mark paid in chunks of 150 (share one constant with `PRIZE_STAMP_CHUNK` in `lib/squaresPrizeAwards.ts`, e.g.
    `POSTGREST_ID_CHUNK` in a small shared module); keep `PAY_PER_RUN` but never send an id list over the chunk size.
  - A result answered `already_credited` to another user, or `user_not_found`, is stamped `credit_blocked_at` + a
    note (6.2's columns), logged once (`[Squares] credit-blocked`), and excluded from the unpaid read. The admin panel
    shows blocked results; Archive counts them separately ("1 result needs a look", not "unpaid").
  - In `tick`, return before `settleSquaresWinners` once the watch is over or past the no-final deadline (and no
    `reopened_at` watch is running). Admin actions keep calling it directly, so an admin fix still pays.
  - Fix the `squaresPrizeCycleStart` comment in `lib/squaresPrizes.ts` (a void now takes back an unused coupon).
- **Cost after:** zero Squares reads per cron minute once the event's watch has ended (today ≈ 3 × 1,440 per day
  until Feb 15).
- **Built 2026-10-19 (committed locally, not deployed; no migration).** `lib/postgrestIds.ts` (`POSTGREST_ID_CHUNK`,
  `chunkIds`) is used by the mark-paid and block writes, both prize stamps, the rehearsal venues read — and
  `listActiveSquaresPrizeCampaigns`, whose `.overlaps("venue_ids", …)` sent every winning venue (up to 500) in one URL
  (same bug class as F2, found here; now one read per 150 venues, deduped, oldest first). Blocked results:
  `squaresCreditBlockNote` (already paid to a different player, or `user_not_found`; an `already_credited` with no
  visible owner is retried, not blocked); the admin panel shows "N result(s) need a look" with the first 10 rows;
  Archive refuses only on unpaid (blocked excluded) and names the blocked count. Idle: `idleReason` in the tick
  (`watch_over` / `no_final_deadline`, not during a late-void watch, never with `force`). Honest cost note: the one
  event read per cron minute remains (≈ 1,440/day until Feb 15); the three settlement reads are gone. Detail:
  `docs/squares-and-brackets-plan_PHASE_6.3_HANDOFF.md`.

#### 6.4 — Player screen after the final keeps up with a void (Sonnet 5.5 · medium)
- **Problem (§13 F6):** at phase `complete`, `useSquaresData` stops reading; an admin void later changes the winners
  but open screens keep the old ones until reloaded.
- **Solution:** while `complete`, read the shared CDN-cached score (`/api/squares/score`) every 5 min while the page
  is visible and once on returning to the tab; if the revision differs, re-read the board (the existing path). Add
  `gradeNo` to `squaresRevision` so a re-grade is always a new revision. Cost: CDN hits (one origin read per 15 s
  nationwide at most), no per-player function calls. Pin the cadence in `tests/squares-screen.test.ts`.
- **Built 2026-10-19 (committed locally, not deployed; no migration).** `SQUARES_COMPLETE_POLL_MS` (300 s, `lib/squaresView.ts`);
  at `complete`, `useSquaresData` calls `fetchScore` when 5 min have passed or the tab returns (the existing
  revision check then re-reads the board); hidden tab reads nothing. `gradeNo` is now in both payloads' moment `result`
  (`lib/squaresBoard.ts`, `lib/squaresScore.ts`) and in `squaresRevision` (`winningCell#gradeNo`). Tests: screen cadence +
  re-grade re-read in `tests/squares-screen.test.ts`, revision in `tests/squares-view.test.ts`. Detail:
  `docs/squares-and-brackets-plan_PHASE_6.4_HANDOFF.md`.

#### 6.5 — Quarter rule checked against the live captures (Opus 5.5 · medium)
- Phase 2 §8.1, still open. Pollers PID 71943 (WSH @ SF, `1392308`, Oct 19 8:15 PM ET) and 71944 (NE @ CHI,
  `1392309`, Oct 22) write `tests/fixtures/squares/nfl-live-capture-<id>.json`; the Mac must stay awake. Run
  `npx vitest run tests/squares-engine.test.ts` (it replays any capture), adjust `quartersFinishedFromStatus` in
  `lib/squares.ts` if the live `status` strings differ, and record the real strings in §8. If a capture failed,
  re-run `node --env-file=.env.local scripts/capture-nfl-live-game.cjs <id>` on a later game.

#### 6.6 — Re-review (Opus 5.5 · high)
- `/code-review high` over the 6.1–6.5 commits. New findings become 6.6.1, 6.6.2, … in the same style (designed fix,
  not an in-place patch).

#### 6.7 — Rehearsal (Opus 5.5 · high)
- Needs 6.2's migration applied and its rehearsal gate deployed. Pick a December 2026 game (regular season ends
  Jan 10, 2027; leave slack before Jan 25). Admin creates a `rehearsal` event from that game at hidden venue
  `venue-hightop-test`, with a test Squares prize there. Run claim → lock → draw → live → each moment graded →
  points → prize coupon → Results → TV, plus one void + re-grade. Record actual BDL requests, cron actions and DB
  reads against §6. Andrew does checklist section A on the Preview during it.

#### 6.8 — Phone + TV pass (Andrew)
- `docs/squares-and-brackets-device-checklist.md` section A, during 6.7. Any failure becomes 6.8.x.

#### 6.9 — Launch (Opus 5.5 · medium)
- Turn on `NEXT_PUBLIC_SQUARES_ENABLED` in Production and redeploy by **Mon Jan 25, 2027**; bump
  `LEGAL_LAST_UPDATED`; turn the rehearsal switch off; **archive the rehearsal event first** (discovery only runs with
  no current event, and players' screens would show the rehearsal board — 6.2). On Jan 31 confirm the event is discovered with the right AFC/NFC
  axes. Watch logs on Feb 14 and record actual request counts against §6.

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
- **Built 2026-10-19 (not committed; migration `20261019203858` not applied).** As built and deviations: §14.
  Detail: `docs/squares-and-brackets-plan_PHASE_7_HANDOFF.md`.

### Phase 8 — Bracket player screens (Sonnet 5.5 · high)
- Route `/bracket` with a tournament switcher (Men's / Women's, Main / Second chance) that shows only the open or
  graded ones.
- **Filling it out on a phone:** one region at a time (15 picks), then the Final Four (3 picks). Choosing a later-round
  pick that conflicts with an earlier one clears the later ones (logic from `lib/brackets/`). Progress shows as "41 of
  63". Then the tiebreaker, then Save. Drafts save to the server on each step.
- Read-only bracket view after lock, with right/wrong marks and "still alive" counts. Venue standings with "Find a
  player". "Copy my picks from <Venue>" when the player has an entry elsewhere.
- Same native, back-handler, text-floor and statement-layout rules as Phase 3.
- **Built 2026-10-19 (not committed; no migration).** As built and deviations: §15.
  Detail: `docs/squares-and-brackets-plan_PHASE_8_HANDOFF.md`.

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


## 13. Phase 6 code review (2026-10-19) — the findings behind 6.1–6.4

`/code-review high` over `863a9b6~1..01b87ad` (Phases 0–5). Every finding was then checked against the code; F1 also
against production. Full detail: `docs/squares-and-brackets-plan_PHASE_6_HANDOFF.md`.

| # | Finding | Checked | Severity | Fix |
|---|---|---|---|---|
| F1 | Live Trivia winner sweep awards any active `game_winner` prize, so a Squares prize (and today's live NFL "most picks" prize) goes to a trivia winner (`lib/liveTriviaWinnerRewards.ts:213`) | Confirmed in code + production: NFL prize `ceceade0-…` at Pacific Street is exposed, held back only by its 3-player minimum; ledger empty so far | **High, live now** | 6.1 |
| F2 | `payUnpaidSquaresResults` marks ≤ 1,000 ids in one `.in()`, past the ≈ 150-UUID URL limit; such rows are re-sent forever | Confirmed; needs > ~150 winners in one run (≈ 150+ venues, or a backlog) | Medium (at scale) | 6.3 |
| F3 | A void more than 12 h after kickoff is never re-graded (`no_final_deadline`), though the admin message promises it | Confirmed | Medium | 6.2 |
| F4 | Archiving the event in Feb 1–15 lets discovery re-create the same Super Bowl as an empty event that draws and grades at once | Confirmed (unique index covers non-archived rows only) | Medium | 6.2 |
| F5 | A rehearsal event pays real partner Squares prizes; the Super Bowl pays them again | Confirmed (`squaresPrizeCoversEvent` checks only dates) | Medium | 6.2 |
| F6 | `/squares` stops reading at `complete`, so a later void never reaches open screens | Confirmed | Low | 6.4 |
| F7 | `settleSquaresWinners` (3 reads) runs every cron minute for the rest of Feb 1–15 after the watch ends | Confirmed (≈ 35k empty reads) | Low (cost rule) | 6.3 |
| F8 | A result whose key is already paid to another user, or whose user is gone, is re-sent forever and blocks Archive | Reachable only through another bug (results cascade on user delete; keys are unique per board/moment/grade) | Low (hardening) | 6.3 |
| F9 | `squaresPrizeCycleStart` comment says a coupon is never taken back; a void now does | Confirmed | Low (docs) | 6.3 |

Found while checking, not raised by the review: the TV read (`lib/squaresTvRead.ts`), `/squares` and settlement are
all gated on Feb 1–15 + the public flag, so the planned December/January rehearsal could not exercise them; 6.2 adds
the rehearsal gate.

## 14. Phase 7 as built (2026-10-19) — read before Phases 8–10

Full detail: `docs/squares-and-brackets-plan_PHASE_7_HANDOFF.md`.
- **Picks are SEATS.** `lib/brackets/tree.ts` is the one definition: slots 0–62 round by round, seats 0–63 = the
  Round-of-64 positions. A pick = the seat whose team wins that slot, so an entry is one `smallint[63]`, grading is
  `pick = winning seat`, and an opening-round seat means "whoever wins that opener" with no special case.
- **Tables (deviation from the §4 proposal):** `bracket_tournaments` is one row per REAL tournament (gender + season
  + purpose), holding `winner_seats[63]`, locks, region names; the plan's four brackets are 2 tournaments × entry
  `kind` (`main` | `second`). Also `bracket_games` (the feed's 67–79 records), `bracket_rounds` (per-round
  `grade_no` / paid), `bracket_entries`, `bracket_admin_log`.
- **RPCs:** `bracket_save_entry` (only entry writer: open / lock on the DB clock, own venue, rehearsal = hidden
  venues, picks re-checked in SQL) and `bracket_record_results` (only writer of winner seats + scores; set-based
  re-grade of every entry; a changed decided result needs an admin and spends that round's old keys first).
- **Venue points per entry per ROUND,** once the round is complete: key `entry:r<round>:<grade_no>` (≤ 6 rows per
  entry). An admin correction in a complete round spends the old key for EVERY entry scoring that round (reversed if
  paid, burned if not), so a payment racing the correction can't pay twice.
- **Rehearsal + replay clock built in:** `purpose = 'rehearsal'` (hidden venues only) and `clock_offset_seconds`
  (the tournament's clock = now − offset; the sync masks the feed to that moment). Switch `BRACKETS_REHEARSAL_ENABLED`
  (server-only, one reader) drives rehearsals without the public flag. This is what Phase 10's replay uses.
- **Sync** rides on `/api/cron/pickem-settle` (`lib/bracketsSync.ts`): zero I/O outside Mar 14 – Apr 6 (flag on) or
  the switch; one tournaments read per minute inside; feed only when `next_sync_at` is due (2 min live, else next tip
  or hourly). Replay of both 2026 tournaments: **6,411 feed requests** (plan §6 estimate 6–8k).
- **Player API built now** (Phase 8 only builds screens): `GET /api/bracket/state`, `POST /api/bracket/entry`,
  `POST /api/bracket/copy`, `GET /api/bracket/standings`; all 404 with the flag off, no player id in any response.

## 15. Phase 8 as built (2026-10-19) — read before Phases 9–10

Full detail: `docs/squares-and-brackets-plan_PHASE_8_HANDOFF.md`.
- Page `/bracket` (`app/bracket/page.tsx`, `notFound()` with the flag off; `GameLandingExperience gameKey="bracket"`,
  background `bg-[#431407]`; statement-layout tutorial with art `BracketIllustration` in `GameIdentityPanel.tsx`) →
  `components/bracket/`: `BracketGame` (switcher, modes), `BracketEditor`, `BracketMatchups`, `BracketReview`,
  `BracketStandings`, `BracketStepChips`, `useBracketData`. All decisions are pure in `lib/bracketsView.ts`.
- **Switcher** shows only brackets that are open, locked or complete (`selectableBrackets`): Men's / Women's chips and
  Bracket / Second chance chips, each row only when there is a choice. Opens on a bracket the player has not finished.
- **Fill-out** (`bracketSteps`): main = East… one region per step (15 picks), Final Four (3), Finish; second chance = one
  "Sweet 16 & Elite Eight" step grouped by region (12 picks), Final Four, Finish. A game is two side-by-side tap
  targets; a later game offers the teams you picked before it (`bracketMatchupSides` → the Phase 7 `setBracketPick`
  clears dependants). Partial brackets save and count (Phase 7 decision). While filling out, the switcher and headline are
  hidden so the games start near the top.
- **Drafts:** sent when the step changes, when the tab hides (`keepalive`), and before leaving via the app bar's Back
  (wait ≤ 3 s). A tap sends nothing. A save patches the state held in the page (`withSavedEntry`): no re-read.
- **After the lock:** tabs My bracket (score, best possible, right / wrong / still alive, each pick with its result in
  words) and Standings (`GET /api/bracket/standings`, 50 rows + "Show more", "Find a player" filters the loaded list,
  Refresh). No pick of anyone else is ever shown.
- **Cost:** no polling. State read: on open, on return to a tab away > 5 min (only while something can change), once at a
  live bracket's lock time, once after a copy. Standings: on opening the tab and on Refresh.
- **Not changed:** every rule (lib/brackets/*, SQL), the Phase 7 routes, the engine. Tests: `tests/brackets-view.test.ts`
  (25), `tests/bracket-screen.test.ts` (20, jsdom), `tests/bracket-screen-contract.test.ts` (10), fixture helper
  `tests/fixtures/brackets/view.ts`.
