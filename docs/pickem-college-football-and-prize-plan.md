# Pick 'Em: College Football, simpler scoring, and the Pick 'Em Prize — plan

**Status (2026-11-01):** Phases 1–6 built (uncommitted; not deployed). Phase 7 review done 2026-11-01: findings in §9,
fixes are sub-phases 7.1–7.6 (table at the top of "### Phase 7" in §7, with model and effort for each). **7.1 + 7.1b built
and APPLIED 2026-11-01** (`20261101150024`, `20261101150026`). **7.2 built 2026-11-01** (code only). **7.1c built
2026-11-01, NOT applied** (`20261101153306`; Andrew applies it, independent of the deploy). **7.3 built 2026-11-01** (code
only). **7.4 built 2026-11-01** (code only). **7.1c APPLIED (Andrew, 2026-11-01). 7.5 built 2026-11-01** (code only). Every SQL fix needs a NEW migration (the earlier seven are applied).
**Code review after 7.5 (2026-11-01, `/code-review`): nine more findings, F12–F20 in §10**, fixed as sub-phases
7.5.1–7.5.5 before the 7.6 re-review (table in "### Phase 7"). 7.5.1 and 7.5.2 must be done before Phases 1–6 deploy.
**7.5.1 built 2026-11-01** (code only; production check: 0 already-credited picks, nothing to stamp).
**7.5.2 built 2026-11-01** (code only) — the two pre-deploy fixes are now both done.
**7.5.3 built 2026-11-01** (migration `20261102021619_pickem_prize_save_leases.sql` — **found APPLIED in the 7.6 re-review**:
`supabase migration list` lists it on production and the lease table is readable, 0 rows).
**7.5.4 built 2026-11-01** (code only). **7.5.5 built 2026-11-01** (code only).
**7.6 re-review done 2026-11-01: four more findings, F21–F24 in §11** (F24 docs, fixed in 7.6). None blocks deploying
Phases 1–7.5.5; fixes are sub-phases 7.6.1–7.6.3 (table in "### Phase 7"). Every migration in this plan is now applied.
**7.6.1 built 2026-11-01** (code only, no migration).
Latest handoff: `docs/pickem-college-football-and-prize-plan_PHASE_7.6.3_HANDOFF.md` (7.6.1: `…_PHASE_7.6.1_HANDOFF.md`; 7.6: `…_PHASE_7.6_HANDOFF.md`; 7.5.5: `…_PHASE_7.5.5_HANDOFF.md`; 7.5.3: `…_PHASE_7.5.3_HANDOFF.md`; 7.1c: `…_PHASE_7.1c_HANDOFF.md`).
Phone checklist: `docs/pickem-college-football-and-prize-device-checklist.md` (Andrew; can run now). 7.6.2 built (handoff `…_PHASE_7.6.2_HANDOFF.md`). **7.6.3 built 2026-11-01 (handoff `…_PHASE_7.6.3_HANDOFF.md`) — the code plan is complete; only Andrew's phone pass, the deploy decision and open question Q7 remain.**
Branch `after-app-review` (main is frozen during App Store review — never push `main`, never
`supabase db push`, never change Production env until Andrew confirms approval). Each phase ends with
a handoff note `docs/pickem-college-football-and-prize-plan_PHASE_<N>_HANDOFF.md`; update this line to point at it.

**Timing note for Andrew:** the college regular season ends with conference championships on Dec 5,
2026; bowls and the playoff run to mid-January. Phases 1–3 (college football playable, with spreads)
are useful on their own and can ship before the Prize phases. Nothing ships while `main` is frozen.

---

## 1. What we're building (plain English)

1. **Pick 'Em gets simpler.** No 10-pick daily limit, no 2×/3× bonus, no "Collect points" button.
   Every correct pick is worth 10 venue points, paid automatically when the game is graded.
2. **College Football joins Pick 'Em** (FBS games). Players who come to Pick 'Em looking for the NFL are told
   that NFL Pick 'Em is its own game on the games menu, with a link straight to it.
3. **Spreads for college football, on by default.** A partner can switch their venue to "pick the
   winner" in Game Settings.
4. **A Pick 'Em Prize** partners create in the Prize wizard. They choose:
   - **Which games:** one or more leagues (e.g. Premier League), a whole sport (e.g. all soccer), or a mix.
   - **When:** one chosen day, a repeating day ("every Saturday"), each week (Mon–Sun), or a date range.
   - **How to win:** *Most picks right* (with a minimum number of picks, plus a tiebreaker
     question); *Get N picks right*; or *X out of N*, with up to three tiers, each with its own prize
     (e.g. 12/15/18 out of 20 → $10/$20/$50).

## 2. Andrew's decisions (2026-10-31): don't re-ask

| # | Decision |
|---|----------|
| D1 | Remove the 10-pick daily cap **and** the 2×/3× bonus from Pick 'Em entirely (not just college). |
| D2 | Remove the "Collect points" button. Points land automatically, 10 per correct pick, when the pick is graded. Points already graded but never collected are paid once at cutover. |
| D3 | College football = **FBS only**. In spread mode, a game with no line yet shows "Line coming soon" and can't be picked. |
| D4 | Tiered prizes: a player wins **only the top tier they reached** (one prize per player per prize window). |
| D5 | An "X out of N" prize **limits players to N picks** in that prize's leagues during its window, at that venue. The player is told why on the Pick 'Em screen, and the partner is told in the wizard. |
| D6 | Two "out of N" prizes at one venue may not cover the same league on the same day: **the wizard (and the server) refuse the overlap** and name the clashing prize. Prizes without a limit may overlap freely. A "most right" prize may not require more picks than an overlapping limit allows. |
| D7 | Prize windows: **one chosen day, a repeating day, each week (Mon–Sun), a date range.** All four. |
| D8 | "Most picks right" ties are broken by a **tiebreaker question**, like NFL Pick 'Em: guess the total points in the window's last game. |
| D9 | Spreads: **on by default for college football**, changeable per venue in Game Settings. No spreads for other sports (see §3). |
| D10 | (2026-10-31, answering Phase 1's question) **NFL Pick 'Em loses its bonus too.** Every correct pick in `pickem_picks`, NFL included, pays a flat 10 venue points automatically when graded. NFL spread/standard grading is unchanged. |
| D11 | (2026-10-31) Paying the uncollected backlog once at cutover is approved (measured 2026-10-31: 48 picks, 480 points, 12 players, 5 venues). The §4 defaults are approved as written. |
| D12 | (2026-10-31, replaces D11's backlog payout) **Don't pay the old backlog: "Just get rid of them. Most of them are test points or test users."** Migration `20261031182914` marks every won pick graded more than 24 h before it runs as handled with 0 points; only last night's wins are paid. The §4 defaults stay approved. |
| D13 | (2026-10-31, answering 4b) A player who reaches the top tier when its prizes are gone **gets the next tier down that still has prizes** (as built). |
| D14 | (2026-10-31, answering 4b) A partner archiving a prize mid-day/week means **nobody wins that period** (as built). |

## 3. Spreads in other sports: recommendation (D9)

- **Soccer: no.** The data provider has **no soccer spread lines** (probed 2026-10-31: `/epl/v2/odds`
  returns only win/draw/win odds). Soccer also has draws, which already grade as a push, and
  handicap lines like "−0.5 / +1.5" confuse casual players.
- **MLB / NHL: no.** Run lines and puck lines are almost always ±1.5, which adds confusion without
  making the picks more interesting.
- **MMA / tennis: no.** There is no meaningful spread.
- **NBA / WNBA: possible later, not in this plan.** Some games are lopsided, but the provider's NBA odds
  query returned no rows on 2026-10-31 (unverified, possibly the query shape). If Andrew wants it, it's
  a small follow-up phase that reuses Phase 3's machinery.

## 4. Defaults chosen without asking (Andrew can override)

- **"FBS only" = a game where at least one team is FBS** (so Alabama vs an FCS team is included).
  FBS conference ids from the provider: 1 ACC, 2 American, 3 Big 12, 4 Big Ten, 5 CUSA, 6 FBS Indep.,
  7 MAC, 8 Mountain West, 9 Pac-12, 10 SEC, 11 Sun Belt. All other ids are FCS. Re-check these ids in code. Never hard-code them from memory.
- **The NFL stays out of the Pick 'Em Prize.** NFL Pick 'Em has its own prize. The Pick 'Em Prize's
  league picker lists only regular Pick 'Em leagues.
- **"X out of N" counts any correct picks up to the limit.** A player who makes 15 picks and gets 12
  right reaches the "12 of 20" tier. N is a ceiling, not a requirement. Tier prizes are awarded when the
  window ends, or once all N of the player's picks are graded, whichever comes first.
- **"Get N right" with no "out of"** is awarded the moment the player reaches N, up to the prize's
  quantity (same as NFL's picks target).
- **Tiebreaker game = the last-starting game in the prize's leagues during the window** (or during
  each repeat of the window). Score games only. A "most right" prize whose leagues are only MMA and/or
  tennis can't have a tiebreaker game, so the wizard doesn't offer "most right" for it.
- **Minimum players** (the existing `players` step) applies to "most right", never to targets/tiers
  (same rule as today: `guardRewardWizardStep`).
- **The venue's spread setting at the moment a pick is made is the rule for that pick.** It is
  stamped on the pick, so changing the setting mid-day never re-grades picks already made.
- **Prize days follow the venue's time zone** (`venues.timezone`), not the player's phone.

## 5. Facts from the code (2026-10-31)

- Regular Pick 'Em: `lib/pickem.ts` (2,788 lines). Sports list `PICKEM_SPORTS`; provider map
  `BDL_PATH_BY_SPORT_KEY`; cap `PICKEM_DAILY_PICK_LIMIT = 10` (enforced in `submitPickEmPick`, counted
  per user + venue + local day **across all sports**); bonus `getPickEmRoundMultiplier`; Collect =
  `claimPickEmPoints` → RPC `claim_pickem_points` (migration `20260513002000`); grading
  `settlePendingPickEmPicks`, run every minute by `/api/cron/pickem-settle`.
- UI: `components/pickem/` (`PickEmSportSelect`, `PickEmGameList`, `PickEmRecentPicks`, `PointsBank`);
  routes `app/api/pickem/{sports,games,picks}`; card + tutorial copy in `lib/venueGameCards.ts`
  ("10 picks total", "7 correct wins double" — must change).
- **TRAP: NFL Pick 'Em picks live in the same `pickem_picks` table** (`sport_slug = 'nfl'`) and are
  graded by the same `settlePendingPickEmPicks`. Spread grading for NFL reads
  `getVenueNFLPickEmScoringMode` + `nfl_pickem_game_lines`. Phases 1 and 3 must leave NFL Pick 'Em's
  scoring and points exactly as they are unless Andrew says otherwise. Find out how NFL picks are paid
  before removing `claim_pickem_points`.
- Venue setting store: `lib/venueGameSettings.ts` (`venue_game_settings.nfl_pickem_scoring_mode`);
  pages `app/owner/game-settings/page.tsx`, admin `components/admin/sections/GameSettingsSection.tsx`;
  routes `app/api/{owner,admin}/game-settings`.
- NFL spread lesson (`docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`): settle only on a
  line row that existed before kickoff. Settlement may lock an existing row but never fetches odds or
  creates a row. Copy that contract for college.
- Provider (BallDontLie, probed 2026-10-31 with the production key): `/ncaaf/v1/games?dates[]=` → 98
  games that Saturday, fields `home_team`/`visitor_team` (with `conference`), `home_score`,
  `away_score`, `status`, `status_state`, `week`, `season`. `/ncaaf/v1/odds` **requires `season`+`week`
  or `game_ids`**, one row per sportsbook per game, `spread_home_value`/`spread_away_value`; 271 rows for
  week 9, of which 40 games that day had a spread. `/ncaaf/v1/conferences` lists the ids above.
- Prize registry `lib/rewardDefinitions.ts` (`REWARD_DEFINITIONS`, `offeredRewardDefinitions`,
  description templates by `calendar`). Shared wizard `components/rewards/CreateRewardWizard.tsx`
  (admin + owner; never fork). Quotas only through `award_cycle_winner` /
  `award_ranked_cycle_places`. `tests/prize-sweep-ownership-contract.test.ts` requires every sweep to
  pay only its own `rewardDefinitionId`. Squares/Brackets show the pattern for per-definition columns
  kept **out of** `CAMPAIGN_SELECT_COLUMNS` (deploy-skew safety).
- New `public` tables need an explicit `service_role` grant in the same migration
  (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; contract test enforces it).
- Screen words say **Prize**, never "Reward" (`tests/prizes-wording-contract.test.ts`). Pick 'Em has a
  light theme: colours are tokens only (`AGENTS.md` "Adding a colour").

## 6. Cost (estimate; measure a baseline in Phase 1)

- **College games:** one `/ncaaf/v1/games` call per date viewed, cached like the other sports. **Odds:**
  one paged call per week (≈3 pages), refreshed at most every 10 min, and only while someone has the
  college list open before kickoff. No new cron.
- **No cap:** more `pickem_picks` rows. A heavy Saturday player might make 50 picks instead of 10, and the
  existing every-minute settlement already batches. Automatic points add one batched RPC per settlement
  run that grades anything, not one call per pick.
- **Prize sweep:** rides on the existing `/api/cron/pickem-settle`. One small read of active Pick 'Em
  prizes per run (returns at once when there are none), then one bounded read of in-scope picks per prize
  whose window is open or just closed **and** had picks graded this run. At 20 venues × 2 prizes, that's
  ≲ 40 small reads per minute on a busy Saturday and ≈ 1 read per minute otherwise. No new cron.
- **The pick-limit check** adds one indexed count read per pick, made only when the venue has an
  "out of N" prize covering that league that day (the active-prize lookup is cached briefly per instance).

---

## 7. Phases

Every phase: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (never typecheck
and build at the same time). Run `npm run test:bingo-nfl` / NFL Pick 'Em tests whenever settlement is
touched. Write migrations with `supabase migration new` and **don't apply them**: applying is Andrew's call after
the freeze lifts. Browser checks run from a scratchpad clone (Andrew's `next dev` holds the lock).

### Phase 1: Simpler Pick 'Em scoring (no cap, no bonus, automatic points)
**Model: Opus 5.5 · high.** Points are currency at the venue; paying once matters.
- Remove `PICKEM_DAILY_PICK_LIMIT` enforcement and `getPickEmRoundMultiplier` from regular Pick 'Em.
- Pay 10 points per correct pick **inside settlement**, exactly once per pick: a new RPC that credits
  the venue points and stamps `reward_claimed_at` in one conditional update (`… where
  reward_claimed_at is null`). Batched per settlement run. Keep `applyChallengeCampaignPoints` (points-target
  prizes on Pick 'Em) receiving the same points it does today.
- Cutover: points already graded but never collected are paid once by the same RPC (the first
  settlement run after deploy picks them up because `reward_claimed_at` is null). Measure in
  production how many rows and points that is **before** building (read-only query), and report it to Andrew.
- Delete `PointsBank` and the Collect UI. Replace with one muted line ("Today: 7 right · +70
  points") and a "+10" toast when a pick is graded while the screen is open (no new polling: use the
  existing refresh). Retire `claim_pickem_points` callers and keep the SQL function (old app builds).
- Rewrite the card rules and tutorial in `lib/venueGameCards.ts` (no "10 picks", no "double/triple").
- **Leave NFL Pick 'Em untouched**: verify how its points are paid and pin it with a test.
- Tests: once-only payment (rerun settlement → no double credit), cutover payout, no cap, NFL unchanged.

### Phase 2: College Football in Pick 'Em (pick the winner)
**Model: Opus 5.5 · medium.**
- Add `americanfootball_ncaaf` → `/ncaaf/v1/games` to `BDL_PATH_BY_SPORT_KEY`, league label "College
  Football", and a `PICKEM_SPORTS` entry (slug `ncaaf`, label "College Football", subtitle "FBS", 🏈).
  Normalise the provider's shape (`visitor_team`, `status`/`status_state`, quarter scores), with a captured
  fixture from a real Saturday as the test input.
- FBS filter (§4 default) in one named function with a test. Hide FCS-only games.
- Grading through the existing outright path. Confirm a final is real before grading (status + both
  scores), as other sports do.
- **NFL signpost:** on the sport-select screen, a muted card: "Looking for the NFL? NFL Pick 'Em is its
  own game. Find it in the games menu." Tapping it opens `/nfl-pickem`. Show the same line at the top of the
  College Football games list. Player-only screens, so it is fine inside the app.
- Tests: normalisation from the fixture, FBS filter, grading, sport list, signpost renders.

### Phase 3: College Football spreads + Game Settings
**Model: Opus 5.5 · high.** Grading-rule correctness, and the NFL line-locking lessons apply.
- Migration: `venue_game_settings.cfb_pickem_scoring_mode text not null default 'spread'` (check
  `standard|spread`); `pickem_picks.scoring_mode` (nullable; null = standard, so old rows are unchanged);
  new table `pickem_game_lines` (`sport_key`, `game_id`, home/away spread, `source_vendor`,
  `locked_at`, timestamps) **with the service_role grant**.
- Lines: fetched by the college list only before kickoff (`/ncaaf/v1/odds?season&week`, one vendor
  rule shared with NFL's), upserted unlocked, never changed after `locked_at`. Settlement locks an existing
  row at kickoff and never fetches or creates one (NFL contract). A spread pick with no locked line stays
  pending with one warning per game, as NFL does today. Add a 48-hour "no line ever" rule that cancels the pick
  rather than leaving it stuck. In spread mode, a game without a line shows "Line coming soon" and can't be picked.
- `submitPickEmPick` stamps `scoring_mode` from the venue setting. Settlement grades by the stamped mode.
- UI: line on each team button ("ALA −13.5"), and a one-line explainer in spread mode.
- Game Settings (owner page + admin section + both routes): a "College Football Pick 'Em" choice, Spread
  (default) / Pick the winner, next to the NFL one. Owner route keeps `requireOwnerAuth` + venue check first.
- Tests: line lock contract, mode stamping, push on integer lines, setting round-trip, NFL unchanged.

### Phase 4a: Pick 'Em Prize, data + rules (server only)
**Model: Opus 5.5 · high.**
- Migration on `challenge_campaigns` (kept out of `CAMPAIGN_SELECT_COLUMNS`): `pickem_scope jsonb`
  (`{ sports: [], leagues: [] }`, where a sport means every league in it, including ones added later),
  `pickem_window jsonb` (`{ kind: "day"|"weekday"|"week"|"range", date?, weekday?, from?, to? }`),
  `pickem_pick_limit int null` (N), `pickem_tiers jsonb null` (1–3 × `{ correct, prize… }`), and
  `pickem_min_picks int null` (for "most right"). Win conditions map onto existing ones: most right →
  `game_winner` (quota 1); get N right → points-target style progress (quota = quantity); tiers →
  a new `pickem_tiers` path awarded through the existing quota RPCs.
- `lib/pickemPrizes.ts` (a leaf, imported by the registry): scope matching, window → venue-local
  periods, **the one cycle key** `pickemPrizeCycleStart`, validation (tiers ascending and ≤ N; window
  sane; most-right needs a team sport in scope), and the **overlap rule (D6)**. Definition
  `pickem_challenge` in `lib/rewardDefinitions.ts` with a new `calendar: "pickem_window"` description set.
- `createReward` / edit: server-side validation + overlap refusal (409 naming the clashing prize).
- **Pick limit (D5):** `submitPickEmPick` looks up the venue's active "out of N" prize covering this
  game's league and day (short per-instance cache). At N it refuses with a clear message ("This bar's prize
  counts your first 20 college picks today, and you've used all 20"). Changing an existing pick never counts against the limit.
- Tests: scope/window/cycle-key, overlap matrix, limit enforcement, validation refusals.

### Phase 4b: Pick 'Em Prize awards + tiebreaker
**Model: Opus 5.5 · high.**
- Sweep `lib/pickemPrizeAwards.ts` called at the end of `/api/cron/pickem-settle` (§6 cost shape):
  get N right → award on reaching N; tiers → at window end, or once all N of a player's picks are graded,
  award the **top tier only** (D4), with each tier as its own quota; most right → after the window's last
  in-scope game is final, rank by correct picks among players with ≥ `pickem_min_picks`, apply
  `min_players`, then the tiebreaker, then (still tied) the earliest guess, as NFL does. Pays only
  `pickem_challenge` campaigns (add it to the ownership contract test).
- Tiebreaker: new table `pickem_prize_tiebreakers` (campaign, cycle, user, venue, game, guess, actual)
  **with the service_role grant**. Route to read/save a guess (signed session, locks at that game's start).
  Reuse the NFL tiebreaker's shape (`lib/nflPickEmTiebreaker.ts`). Never import its NFL calendar logic.
- Results page: a Pick 'Em Prize appears as a prize row through the existing "anything else → a day row"
  rule. A Pick 'Em standings adapter is **out of scope** unless Andrew asks.
- Tests: each win path, top-tier-only, quotas under concurrency, tiebreaker ordering, min players/picks, no double award.

### Phase 5: Prize wizard (partner + admin)
**Model: Opus 5.5 · medium.**
- In `CreateRewardWizard` (one component, both hosts), choosing Pick 'Em adds these steps: **Games**
  (sports as whole-sport toggles that expand to leagues), **When** (the four window kinds, with a date picker
  and weekday chips), **How to win** (Most right + minimum picks / Get N right / X out of N with 1–3 tiers),
  then the existing `players` (most right only), **Prize** (one prize per tier, using the per-place prize UI
  pattern), and Review. Mirror steps in the URL as the wizard does today, and add a `guardRewardWizardStep` rule.
- Partner notice on the "out of N" step and Review: "Players at your bar will be limited to 20 college
  football picks on Sat Nov 7, so everyone plays the same 20." An overlap refusal from the server shows inline.
- Copy only through `lib/rewardDefinitions.ts` templates. Text ≥ 12 px; "Prize" wording.
- Tests: wizard steps/guards, admin snapshots unchanged for other prizes, wording contract.

### Phase 6: Player screens for the Prize
**Model: Sonnet 5.5 · high.**
- Prizes tab cards describe Pick 'Em prizes from the templates ("Get 15 of 20 college football picks
  right this Saturday and win $20").
- Pick 'Em games list: a slim prize line for prizes covering the shown league and day, with picks left
  when a limit applies ("Prize: 12/15/18 of 20 · 14 picks left"), and the limit-reached message. Tiebreaker
  card for "most right" prizes on the tiebreaker game. Prize-wallet coupon text ("You got 15 of 20 college
  football picks right on Sat Nov 7"). Tokens only (light + dark). Every closable popup registers native Back.
- No new polling. Data rides on the existing games response.

### Phase 7: Review + fixes
**Model: Opus 5.5 · xhigh** (review), fixes as sub-phases 7.1, 7.2, … (no in-place patches),
typically **Opus 5.5 · high**. Then Andrew's phone pass, from a checklist the reviewer writes at
`docs/pickem-college-football-and-prize-device-checklist.md`: a college Saturday in spread and winner
modes, NFL signpost, a tiered prize end-to-end on a hidden test venue (`venue-hightop-test`), and the overlap refusal.

**Review done 2026-11-01 (findings F1–F11 in §9).** The fixes are their own phases below, in this order. Each ends with
its own handoff `…_PHASE_7.<n>_HANDOFF.md`; no in-place patches to Phases 1–6. Don't deploy Phases 1–6 before 7.4 is done
**and** 7.5.1 + 7.5.2 are done (the `/code-review` findings in §10: F12 double-pays every admin-settled win from the first
cron run after deploy; F15 adds a payment transaction to every Pick 'Em screen load).

| Phase | What it fixes | Model · effort | Status |
|-------|---------------|----------------|--------|
| 7.1 | Players can't write `pickem_picks` (F1) | Opus 5.5 · high | Done, applied 2026-11-01 |
| 7.1b | Players can't write `users` (F1, §8 Q4) | Opus 5.5 · high | Done, applied 2026-11-01 |
| 7.2 | Venue Prizes card tells the truth about Pick 'Em Prizes (F2) | Opus 5.5 · high | Done 2026-11-01 (code only) |
| 7.1c | Players can't call `settle_prediction_market` + 9 more server-only functions (F11, §8 Q6) | Opus 5.5 · high | Built and APPLIED 2026-11-01 |
| 7.3 | Never grade a called-off college game (F3) | Opus 5.5 · high | Built 2026-11-01 (code only) |
| 7.4 | Stuck pending picks can't stop settlement (F4) | Opus 5.5 · high | Built 2026-11-01 (code only) |
| 7.5 | Small fixes (F5, F6, F10) | Sonnet 5.5 · medium | Built 2026-11-01 (code only) |
| 7.5.1 | Admin "settle game" pays through `pay_pickem_points`, once (F12) | Opus 5.5 · high | Built 2026-11-01 (code only) |
| 7.5.2 | Settlement can't be clogged by waiting picks; pay only when needed; "+10" only once paid (F14, F15, F19) | Opus 5.5 · high | Built 2026-11-01 (code only) |
| 7.5.3 | One Pick 'Em Prize save at a time per bar, so the overlap rule holds (F17) | Opus 5.5 · high | Built 2026-11-01 (migration `20261102021619` applied — found in 7.6) |
| 7.5.4 | Games list runs its independent reads together (F16) | Sonnet 5.5 · medium | Built 2026-11-01 |
| 7.5.5 | Cleanups: dead Collect panel, stable ledger paging, stale comments (F13, F18, F20) | Sonnet 5.5 · medium | Built 2026-11-01 |
| 7.6 | Re-review of 7.1–7.5.5 | Opus 5.5 · xhigh | Done 2026-11-01 (F21–F24, §11) |
| 7.6.1 | Admin can't turn a Pick 'Em Prize back on or edit its terms past the overlap rule (F21) | Opus 5.5 · high | Built 2026-11-01 (code only) |
| 7.6.2 | An ended Pick 'Em Prize card leaves the venue Prizes panel (F22) | Sonnet 5.5 · medium | Built 2026-11-01 (code only) |
| 7.6.3 | Count a win (and send its notification) only when this run graded it (F23) | Sonnet 5.5 · medium | Built 2026-11-01 (code only) |
| Phone pass | `docs/pickem-college-football-and-prize-device-checklist.md` | Andrew | Now (independent of 7.6.1–7.6.3) |

### Phase 7.1: Lock players out of writing `pickem_picks` (F1)
**Model: Opus 5.5 · high. Status: built and APPLIED 2026-11-01.** New migration: revoke INSERT, UPDATE, DELETE, TRUNCATE
on `public.pickem_picks` from `anon` and `authenticated`; drop the policies "Users can insert own pickem picks" and "Users
can update own pickem picks" (keep SELECT and its read policy). No app code changes: the browser never writes this table
(only the server, as `service_role`). Contract test: no migration newer than 7.1's re-grants a write on `pickem_picks` to
anon/authenticated, and no file importing `@/lib/supabase` names `pickem_picks`. PGlite proof: as `authenticated`,
insert/update are refused; `service_role` still works. Built as `20261101150024_pickem_picks_server_only_writes.sql`,
`tests/player-table-write-lockdown-contract.test.ts`, `npm run test:player-write-lockdown-sql`. Handoff
`…_PHASE_7.1_HANDOFF.md` (covers 7.1b too). Found while there: F11 (§9).

### Phase 7.1b: Lock players out of writing `users` (F1, §8 Q4)
**Model: Opus 5.5 · high. Status: built and APPLIED 2026-11-01.** Same lockdown for `public.users` in a separate file
(`20261101150026_users_server_only_writes.sql`), dropping "Users can create own profiles" and "Users can update own
profiles". Same contract test and SQL proof as 7.1.

### Phase 7.2: The venue Prizes panel tells the truth about Pick 'Em Prizes (F2)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (no migration).** In `getChallengeCampaignSnapshotForUser` /
`resolveCurrentCycleWinnersForSnapshot` (`lib/challengeCampaigns.ts`), a `pickem_challenge` campaign's "current cycle"
is its current period (venue zone), and its winners are the rows at that period's tier-0..3 keys, read inside the existing
batched ledger read (no new request on the 30-second poll). The card shows no points gauge for any Pick 'Em Prize,
"Upcoming" before its first period, and stops saying "In Progress" once its last period is settled. A tier or one-day
winner sees "You Won". As built: the terms ride the snapshot's own campaign read (`withPickEmTerms`); keys from
`pickemPrizeCardPeriod` (`lib/pickemPrizeStandings.ts`); "ended" = the sweep sets `is_active = false` on a one-day/range
prize once its only period is settled (`endPickEmPrize`), so the partner's list files it under Ended too — no
settlements read on the poll. Handoff `…_PHASE_7.2_HANDOFF.md`.

### Phase 7.1c: Lock players out of calling server-only SECURITY DEFINER functions (F11, §8 Q6)
**Model: Opus 5.5 · high. Status: built 2026-11-01, NOT applied (Andrew applies it; independent of the code deploy).**
A NEW migration revoking EXECUTE from `public, anon, authenticated` (keeping `service_role`, granted explicitly) on both
`settle_prediction_market` overloads, `prune_user_analytics_raw_events(interval)` and `refresh_user_analytics_rollups()`,
after re-scanning every SECURITY DEFINER function for the same gap. The re-scan found six more, added to the same file:
both `get_challenge_leaderboard_snapshot` overloads (never revoked from anyone; returns every player id, username and
points for any prize) and the four `refresh_live_trivia_inventory_summary*` functions (full recomputes on demand). Left
alone on purpose: trigger functions and the three RLS helpers (`current_admin_venue_ids`,
`is_current_user_for_analytics`, `is_current_admin_for_analytics_venue`). Built as
`20261101153306_server_only_security_definer_functions.sql`, `npm run test:security-definer-sql` (PGlite), and
`tests/security-definer-execute-contract.test.ts`, which replays every migration and fails if ANY SECURITY DEFINER
function (not a trigger, not an allowlisted RLS helper) ends up executable by anon or authenticated. Handoff
`…_PHASE_7.1c_HANDOFF.md`.

### Phase 7.3: Never grade a called-off college game (F3)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (code only, no migration).** In `lib/pickemCollegeFootball.ts`
`collegeFootballGradeGate` (and its caller in `settlePendingPickEmPicks`): a college pick grades only when the provider's
own fields say final (`status` "post" and `status_state` "final", as in the captured fixtures, overtime included) with
both scores; `status`/`status_state` cancelled (either spelling), postponed, forfeit or abandoned → cancel at once; a
0–0 "final" → not final (waits, then the 48-hour cancel). `status`/`status_state` ride on the score event. Tests with
synthetic cancelled/postponed/0–0 payloads; spread and winner modes; NFL untouched. As built: the gate returns
`"called_off"` for a called-off game (its own log line); a suspended or delayed game waits (it may resume); a game the
provider calls "post" that isn't a gradeable final logs once per game per run. Handoff `…_PHASE_7.3_HANDOFF.md`.

### Phase 7.4: Stuck pending picks can't stop settlement (F4)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (code only, no migration).** In `settlePendingPickEmPicks`: a pending pick whose game started more than 8 days
ago (past the ±7-day score window, so it can never be found) is cancelled, with one `[Pick 'Em] stale-pending-canceled`
log line per run (count + oldest); a college pick whose game is not found at all still gets its 48-hour cancel. Expected
effect on first run: the 4 NFL picks pending since 2026-07-30 (measured 2026-11-01) are cancelled at 0 points. Tests:
head-of-queue (600 stuck + 1 fresh → the fresh one grades), college missing-event cancel, NFL grading unchanged.
As built: only when the oldest row of the 500-row read is past the cutoff does ONE bulk update cancel every such pick
(`PICKEM_UNFINDABLE_PENDING_MS`, scoped to the player on a per-player call), then the read runs again — a normal run makes
no extra request. The college missing-game cancel (`collegeFootballMissingGameGate`) fires only when that sport's ±7-day
fetch was complete: `fetchBallDontLieList` (`lib/balldontlie.ts`) gained an optional `failure` box, because a failed or
non-2xx provider reply reads as "no games"; a failed, thrown or page-capped day waits. Handoff `…_PHASE_7.4_HANDOFF.md`.

### Phase 7.5: Small fixes (F5, F6, F10)
**Model: Sonnet 5.5 · medium. Status: built 2026-11-01 (code only).** F5: the limit message a blocked game shows is the prize covering THAT game
(server sets it per game). F6: the sweep's "graded in the last 5 minutes" read is ordered and paged (or capped per venue)
so a busy minute can't hide a venue. F10: the tiebreaker card's "Saved!" flash uses tokens, not `bg-emerald-400`, when
the light theme is turned on (can wait for the light-theme release).

### Phase 7.5.1: Admin "settle game" pays through `pay_pickem_points`, once (F12)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (code only, no migration).** As built: grading is one conditional update
per (result, scoring-mode stamp) group in `chunkIds` chunks, counting only rows it actually changed; NFL picks at a
standard venue are stamped `standard` (as the cron does); an unreadable NFL rule is its own count,
`scoringModeUnresolvedLeft`; a failed payment comes back as `payoutError` (grades kept, the cron pays). There is no
admin panel calling `resource: "pickem-settle"` today, so no success line to change. Production check 2026-11-02 01:50Z:
`alreadyCreditedByAdminSettle.picks` = 0 — nothing to stamp. Handoff `…_PHASE_7.5.1_HANDOFF.md`. Original spec:
In `settleAdminPickEmGame`
(`lib/admin.ts`, called only by `POST /api/admin` `resource: "pickem-settle"`):
- Delete the `users.points` read-then-update loop. The function only grades: one conditional update per pick
  (`status` won/lost, `winning_team_id`, `resolved_at`, `reward_points = PICKEM_REWARD_POINTS`, `.eq("status", "pending")`
  as today), then ONE `payPickEmPoints()` call (global, so it also pays anything the cron left). Money moves only in the RPC,
  as CLAUDE.md requires; the cron's next run can't pay again because the RPC stamped `reward_claimed_at`.
- Picks scored by the spread can't be graded from a winning team alone. Leave them pending for automatic grading and say so
  in the result (`spreadPicksLeft: n`): a college pick stamped `scoring_mode = 'spread'`, and an NFL pick at a venue whose
  `getVenueNFLPickEmScoringMode` is `spread` (NFL picks are stamped at settlement, not when made). A failed mode read leaves
  that venue's NFL picks pending (never grade on a guess). The admin panel shows the count in its success line.
- Return the payout report's `picksPaid` / `pointsPaid` in the result so the admin sees the money moved.
- Contract: extend `tests/pickem-automatic-points-contract.test.ts` so no file other than the RPC migration and
  `lib/pickemPoints.ts` writes `points` on `users` next to a `pickem_picks` grade (a static scan of `lib/admin.ts` for
  `.from("users").update` inside `settleAdminPickEmGame` is enough). Unit test: admin-settled winners are paid exactly once
  across the admin call plus a following `settlePendingPickEmPicks()` (mock RPC that honours the stamp).
- **Production check before deploy (read-only, report to Andrew):** won picks with `reward_claimed_at IS NULL` that the OLD
  admin path already credited would be paid again by the first cron run. They look like `status = 'won'`, `home_score IS
  NULL`, `scoring_mode IS NULL`, `resolved_at` within 24 h of the 2026-10-31 cut or later. Add that count to
  `scripts/pickem-unpaid-points-report.cjs` (a separate line, "already credited by admin settle"). If non-zero, ask Andrew
  before stamping them (`reward_claimed_at = now()`, `reward_points` unchanged) — a production write.
- Cost: removes one `users` read + write per winner; adds one RPC call per admin settle (rare, manual).

### Phase 7.5.2: Settlement can't be clogged; pay only when needed; "+10" only once paid (F14, F15, F19)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (code only, no migration).** As built: `PICKEM_SETTLE_PAGE_SIZE` = 500,
`PICKEM_SETTLE_PAGE_CAP` = 6; the cursor is `.or('starts_at.gt."S",and(starts_at.eq."S",id.gt."I")')` with values
double-quoted (checked read-only against production, including a cursor inside a tie). Production baseline 2026-11-02
02:11Z: 6 started pending picks → one read per run. Handoff `…_PHASE_7.5.2_HANDOFF.md`. Original spec:
All three touch the grading/payment
path in `settlePendingPickEmPicks` (`lib/pickem.ts`) and its screen, so one phase.
- **F14 — page the pending read.** Replace the single oldest-first `limit(500)` read with keyset pages ordered by
  `(starts_at, id)` (`gt` on the last row's pair), up to `PICKEM_SETTLE_PAGE_CAP` = 6 pages (3,000 picks) per run; keep the
  7.4 stale cancel on the first page only. Collect every page first, then run the existing body once, so each sport key's
  scores are still fetched once per run. When the cap is hit, log `[Pick 'Em] settle-page-cap scanned=<n> oldest=<iso>` once
  per run. Picks legitimately waiting (no locked line, "post" but not final, NFL spread with no line) can then sit at the
  head for their full 48 h without hiding later finished games. Test: 600 waiting college picks + 1 finished later game → the
  later one grades and is paid; a normal run (< 500 pending) makes exactly one read (assert the mock's call count).
  Cost: unchanged at today's volume (one read); one extra indexed read per 500 started pending picks, max 6 per minute.
- **F15 — a player's own call pays only when it graded a win.** `settlePendingPickEmPicks({ userId })` (the games and picks
  GETs) calls `payPickEmPoints({ userId })` only when that call recorded `won > 0`; the no-pending early return pays nothing.
  Global callers (the every-minute cron and the balldontlie webhook, no `userId`) always pay, so a failed or capped payment is
  still retried within a minute. Update the function's doc comment to say so. Test both branches. Cost: today every Pick 'Em
  screen load and every 60-second live-game poll runs one write transaction per player (≈ 60/hour per open screen; 50 players
  on a busy Saturday ≈ 3,000/hour); after this, only calls that graded a win pay.
- **F19 — show "+10" only for a pick that is paid.** `newlyWonPointsOf` (`components/pickem/PickEmGameList.tsx`) counts a game
  only when the pick is `won` AND `userPickRewardClaimedAt` went from null to set between refreshes (it already rides on every
  game). A graded-but-unpaid pick shows its result but no toast and no `tp:points-updated` delta; the next refresh after
  payment shows it. Update `tests/pickem-today-win-points.test.ts` (won-unpaid → 0; won-then-paid → 10 once; paid on first
  sight → 0). `todayWinPointsOf` (the day's total) is unchanged.

### Phase 7.5.3: One Pick 'Em Prize save at a time per bar (F17)
**Model: Opus 5.5 · high. Status: built 2026-11-01; migration `20261102021619_pickem_prize_save_leases.sql` NOT applied
(Andrew's call; apply it BEFORE the code — the code fails closed without it).** As built: helper `lib/pickemPrizeSaveLease.ts`
(`claimPickEmPrizeSave` → held/busy/failed, `releasePickEmPrizeSave` never throws), TTL 30 s, the holder may renew its own
lease; `REWARD_PICKEM_SAVE_BUSY_MESSAGE` in `lib/rewards.ts`. Tests in `tests/lib.pickem-prizes.test.ts` ("save lease") and
`npm run test:pickem-prize-lease-sql`. Handoff `…_PHASE_7.5.3_HANDOFF.md`. Original spec:
The overlap rule (D6) stays in TypeScript (`findPickEmPrizeConflict`); what's missing is that two saves can both read
"no clash" before either inserts. Serialise them with a short per-venue lease (an advisory lock can't span PostgREST calls):
- Table `pickem_prize_save_leases (venue_id text primary key references venues(id) on delete cascade, token uuid not null,
  expires_at timestamptz not null)`, RLS on, no policies; grants per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`
  (`service_role` only).
- RPC `claim_pickem_prize_save(p_venue_id text, p_token uuid, p_ttl_seconds int default 30) returns boolean`: under
  `pg_advisory_xact_lock(hashtext('pickem_prize_save:' || p_venue_id))`, insert or take over an expired row; false if a live
  lease is held. RPC `release_pickem_prize_save(p_venue_id text, p_token uuid)`: delete only its own token. Both `revoke all …
  from public, anon, authenticated` + `grant execute … to service_role` (7.1c's contract test fails otherwise).
- In `lib/rewards.ts`, the Pick 'Em Prize branch claims the lease BEFORE `listActivePickEmPrizeCampaigns`, holds it through
  `createChallengeCampaign`, and releases it in `finally`. A held lease → `RewardConflictError` (409) "Another Pick 'Em Prize is
  being saved for this bar. Try again in a moment." (copy next to `REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE`). A missing RPC or
  a failed claim fails closed with that same unchecked message (`isMissingFunction`, log `[PickEmPrize] save-lease-missing`)
  — never create without the check. Owner and admin both reach this through the same function. Any future edit path that
  changes a Pick 'Em Prize's scope, window or pick limit must take the same lease (say so in the code comment).
- Tests: two concurrent creates with a mocked lease → one 201, one 409; release runs on a thrown insert; SQL proof on PGlite
  (`npm run test:pickem-prize-lease-sql`): second claim false while live, true after expiry, release by a stranger's token
  does nothing. Cost: two extra RPC calls per Pick 'Em Prize save (a partner action, a few a week); nothing on any poll.

### Phase 7.5.4: Games list runs its independent reads together (F16)
**Model: Sonnet 5.5 · medium. Status: built 2026-11-01 (code only; handoff `…_PHASE_7.5.4_HANDOFF.md`).** In `listPickEmGames` (`lib/pickem.ts`): `applyCollegeFootballLines`,
`loadPickEmGamePrizes` and `getPickEmTodaySummary` don't depend on each other — run them with `Promise.all`. First confirm
the two that mutate `games` write different fields (lines: line/rule/pickable fields; prizes: `pickLimitReached`) and that
`loadPickEmGamePrizes` doesn't read anything the lines step sets; if it does, keep those two in order and only parallelise
the today summary. Each keeps its own failure handling (today's `.catch(() => undefined)`, the lines' default rule).
The college rule read for DISPLAY (`resolveCollegeScoringModeForDisplay`) gets a 30-second per-instance cache keyed by venue
(same shape as the prize cache); `resolvePickScoringMode` in `submitPickEmPick` keeps reading fresh, because that read is the
stamp of record for the pick (one read per pick is cheap). Test: the three run concurrently (mocks resolve out of order,
result unchanged); a cached display read makes no second settings request within 30 s. Cost: removes one DB read per list
view per instance-minute; latency drops from the sum of three waits to the longest one.

### Phase 7.5.5: Cleanups — dead Collect panel, stable ledger paging, stale comments (F13, F18, F20)
**Model: Sonnet 5.5 · medium. Status: built 2026-11-01 (code only; handoff `…_PHASE_7.5.5_HANDOFF.md`).**
- **F13:** `components/activity/ActiveGamesPanel.tsx` is mounted nowhere (`/activity` renders only `ActivityTimeline`;
  confirmed by a repo-wide search 2026-11-01) and still offers a Pick 'Em "Claim Points!" button posting `action: "claim"`.
  Delete the file (re-check for importers first). Extend `tests/pickem-automatic-points-contract.test.ts`: no file under
  `components/` or `app/` sends `action: "claim"` or `"claim_points"` to `/api/pickem/picks`. Leave the route's
  `claimed: false` answer in place for old app builds.
- **F18:** the winners-ledger read in `settlePickEmPrizes` (`lib/pickemPrizeAwards.ts`) adds `id` to the select and
  `.order("id", { ascending: true })` after `cycle_start`, so pages never skip or repeat rows; the deleted-player placeholder
  becomes `deleted:${row.id}` (stable across pages and runs). Test: two pages whose boundary falls inside equal `cycle_start`
  values → every winner counted once.
- **F20:** fix the doc comments in `lib/pickemPoints.ts` (header) and on `settlePendingPickEmPicks` (`lib/pickem.ts`): the
  pre-release backlog is NOT paid — migration `20261031182914` stamped every won pick graded more than 24 h before it ran with
  `reward_points = 0` (Andrew, D12); only wins graded since then on the old code are paid at the first run.

### Phase 7.6: Re-review of 7.1–7.5.5
**Model: Opus 5.5 · xhigh. Status: done 2026-11-01** (findings F21–F24 in §11; F24 fixed in-phase, docs only). Covers 7.1–7.5 and the §10 fixes 7.5.1–7.5.5. Then Andrew's phone pass (checklist). F7 (TBA kickoffs) is a recommendation
only (§9): build it only if Andrew says so (§8 Q5: he said leave the default). Handoff `…_PHASE_7.6_HANDOFF.md`.

### Phase 7.6.1: Admin can't bypass the Pick 'Em Prize rules (F21)
**Model: Opus 5.5 · high. Status: built 2026-11-01 (code only, no migration; handoff `…_PHASE_7.6.1_HANDOFF.md`).** As built: the
allowlist helper `pickemPrizeAdminPatchRefusal` + `PICKEM_PRIZE_ADMIN_EDIT_MESSAGE` in `lib/pickemPrizes.ts` (re-exported as
`REWARD_PICKEM_ADMIN_EDIT_MESSAGE` in `lib/rewards.ts`); the route reads the row (`getChallengeCampaignDefinitionId`,
`lib/challengeCampaigns.ts`) ONLY when the body would be refused, so Disable, rename and reorder cost no read; a failed read → 500,
nothing written. POST needed no guard (it can't set `reward_definition_id`). Tests `tests/pickem-prize-admin-patch-guard.test.ts`.
Original spec: In `POST`/`PATCH /api/admin` `resource: "challenge-campaigns"` (the
`updateChallengeCampaign` branch of `app/api/admin/route.ts`): read the row's `reward_definition_id` first (one read by id). For a
Pick 'Em Prize (`PICKEM_PRIZE_DEFINITION_ID`), accept ONLY `name`, image fields, `displayOrder` and `isActive: false`; anything else
(`isActive: true`, `venueIds`, `scheduleType`, `activeDays`, dates/times, `gameTypes`, `pointsRequiredToWin`, `recurringType`,
`winnerQuota`, prize fields, `challengeMode`, `winnerUserId`) → 409 with one message in `lib/rewards.ts` ("A Pick 'Em Prize can't be
turned back on or have its games, dates or numbers changed. Create a new one."). Do it in a pure helper (e.g.
`pickemPrizeAdminPatchRefusal(body)` in `lib/pickemPrizes.ts`) so the bulk Enable (`bulkPatch(true)`) gets the same refusal per row.
Admin UI (`components/admin/sections/ChallengesSection.tsx`): for a Pick 'Em Prize row hide Edit and show Enable disabled (with a
title explaining why); Disable and Delete stay. The edit form also re-sends every generic field on save, so a rename alone must send
only `name` for these rows (or keep Edit hidden). Tests: the helper (each refused field, the allowed set), the route (409 vs 200,
`updateChallengeCampaign` not called on a refusal), and a contract line that the Pick 'Em sweep's "exactly one venue" rule can't be
broken through this route. Leave Squares/Bracket prizes alone (same legacy path; not this plan — note it in the handoff). Cost: one
indexed read per admin PATCH (manual, rare); nothing on any poll.

### Phase 7.6.2: An ended Pick 'Em Prize card leaves the venue Prizes panel (F22)
**Model: Sonnet 5.5 · medium. Status: built 2026-11-01 (code only; handoff `…_PHASE_7.6.2_HANDOFF.md`).** Spec: In `getChallengeCampaignSnapshotForUser` (`lib/challengeCampaigns.ts`),
drop a Pick 'Em Prize from the result when `pickemPrizeSnapshotState(...).prizeEnded` and its shown period ended more than
`PICKEM_PRIZE_ENDED_CARD_MS` = 24 h ago (an archived one with no shown period: drop it at once). The viewer's coupon is unaffected (the
wallet reads `challenge_campaign_redemptions`, not this list). In `VenueChallengesPanel.tsx`, the "Active · N Prizes" header counts
only cards that are not `prizeEnded`. Tests: a one-day prize settled yesterday → card shown with "Ended"; 25 h after its day ended →
gone; header count excludes ended cards. Zero extra requests (all from data the poll already reads). Archived prizes of OTHER kinds
also stay on the panel today (the hub asks for `includeInactive=true`; live check 2026-11-01: Pacific Street's archived Live Trivia
Challenge is returned) — not changed here; §8 Q7.

### Phase 7.6.3: Count a win only when this run graded it (F23)
**Model: Sonnet 5.5 · medium. Status: built 2026-11-01 (code only; handoff `…_PHASE_7.6.3_HANDOFF.md`).** In `settlePendingPickEmPicks` (`lib/pickem.ts`), `recordSettlement`'s
conditional update adds `.select("id")`; when it returns no row (a concurrent cron, webhook or player-screen run graded the pick
first) count nothing and add nothing to `winGroups` — the same rule 7.5.1 uses in `settleAdminPickEmGame`. Keeps the F15 rule honest
too (a player's call pays only when it really graded a win). Test: a mock whose conditional update returns `[]` → `won` 0, no
notification row, `payPickEmPoints` not called on a per-player call. Cost: each grading update returns its id (bytes, no extra
request).

## 8. Open questions (defaults in §4 apply unless Andrew changes them)

1. NBA/WNBA spreads as a later follow-up? (§3, not in this plan.)
2. Should the "Get N right" and tier prizes also require a minimum number of players? (Default: no,
   matching today's points-target rule.)
3. A Pick 'Em standings view in Partner Results? (Default: out of scope.)
4. (Phase 7, 2026-11-01) **Lock players out of writing `users` too?** Recommended yes, urgently, as 7.1b (F1): today any
   signed-in player can change their own `users` row, including `points`, straight through the public API. It's older
   than this plan and wider than Pick 'Em, which is why it needs your yes. **Answered 2026-11-01: Yes** — built as 7.1b.
5. (Phase 7) **TBA college kickoffs (F7):** show games with no TV time yet as "Time TBA" and not pickable? Default: no
   change (the "picks only for today" rule already keeps it rare). **Answered 2026-11-01: leave the default** (no change).
6. (Phase 7.1, 2026-11-01) **Lock players out of calling `settle_prediction_market` too (F11)?** Recommended yes, as a
   7.1c migration (`revoke execute … from authenticated` on both overloads, plus the two analytics functions). Not
   Pick 'Em, so it needs your yes. **Answered 2026-11-01: Yes** — 7.1c in §7.
7. (Phase 7.6, 2026-11-01) **Archived prizes of every kind stay on the venue Prizes panel.** The venue page asks for inactive
   prizes too, so an archived prize keeps its card (live: Pacific Street's archived Live Trivia Challenge is still returned). 7.6.2
   fixes it for Pick 'Em Prizes only. Hide archived prizes of every kind from the panel? Older than this plan and wider than Pick
   'Em, so it needs your yes. Default: no change outside Pick 'Em.

## 9. Phase 7 review (2026-11-01): findings

Reviewed Phases 1–6 as one change (`git diff` + every new file, the five migrations, the four SQL proofs, the full test
suite, typecheck, lint on the 59 changed files, build). Production was only read (row counts, column/table presence,
public-key SELECT grants, `supabase migration list`) and the provider was asked 3 times for college schedules. Nothing
was written anywhere. Gates at the review: `npx tsc --noEmit` clean; eslint clean on every changed file; `npm run build`
passes; `npm run test` 5,956 pass / 13 skipped / 4 fail (the same four date-based Prop Bingo star-index tripwires as
Phases 1–6); `test:pickem-points-sql`, `test:pickem-lines-sql`, `test:pickem-prizes-sql`,
`test:pickem-prize-awards-sql` pass.

**Looked at and sound:** `pay_pickem_points` (one statement, skip-locked candidates, conditional stamp, the credit CTE
runs even though it isn't selected); `award_pickem_tier_prize` (its lock keys are byte-for-byte `award_cycle_winner`'s,
D4 under the period lock, D13 fall-down, prize copied from the tier); line upsert/lock (DB clock, never after kickoff);
the overlap rule (D6) and its fail-closed read; the pick limit failing open + "first N by `created_at`" in the sweep; the
cycle key (venue-local midnight via `zonedDateTimeToUtcMs`, correct across today's DST change); the tiebreaker route
(session-bound, own guess only); the sweep's ownership filter; the deploy order (old production code runs fine against
all five applied migrations).

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| F1 | **Critical (money/prizes)** | Players can write `pickem_picks` directly. `anon`/`authenticated` hold ALL privileges on it (live: a public-key SELECT is granted, 2026-11-01) and the RLS policies from `20260427113000` let a signed-in player INSERT and UPDATE their own rows. Every player has a signed-in Supabase session in the browser (`signInAnonymously`; 195 of 265 profiles have `auth_id`). So a player can insert `status = 'won'` rows, or set `reward_claimed_at` back to null on paid ones: `pay_pickem_points` pays 10 points per row every minute, and the Pick 'Em Prize sweep counts them toward real gift cards. Older than this plan (the retired Collect paid forged rows too), but Phases 1 and 4 made it automatic and attached real prizes. The same pattern on `users` ("Users can update own profiles") lets a player set their own `points` — wider than this plan (§8 Q4). The browser reads only `venues` and `live_player_stats` directly, so nothing in the app needs these writes. `challenge_campaign_redemptions` is safe (RLS on, no policy: the public key sees 0 of 28 rows). | 7.1 (+7.1b if Andrew says yes) |
| F2 | **High (players)** — fixed in 7.2 | The venue-home Prizes panel misreads every Pick 'Em Prize except recurring "most right": (a) "Get N right" and "X out of N" show a points gauge ("0 / 10 pts") that never moves (the progress table is never written for this prize, by design); (b) a tier winner never sees "You Won" and "All Claimed" never shows (tier wins are keyed +1–3 s, the panel reads only the tier-0 instant); (c) a one-day or date-range target/tier prize never shows any winner (the panel reads the epoch key for one-off prizes, the sweep writes the period's midnight); (d) a prize for a future day says "In Progress" from creation, and a finished one-off keeps saying it forever (nothing ever ends it). The coupon in the wallet is right in every case. | 7.2 |
| F3 | Medium (money) | A called-off college game can be graded. `isBallDontLieFinalStatus` counts `canceled`/`cancelled` as final, not-started college games report 0–0, and `collegeFootballGradeGate` grades any "completed" game with two numeric scores. A spread pick on a cancelled game would then grade 0 + line vs 0 (home −7 → every away picker "covers" and is paid); a winner-mode pick becomes a push instead of cancelled. How the provider marks a cancelled/postponed college game is unverified (both fixtures only have `post`/`final`). | Fixed in 7.3 |
| F4 | Medium (latent outage) | Settlement reads only the 500 OLDEST started pending picks (`order by starts_at limit 500`), and a pick whose game isn't in the ±7-day score fetch is skipped forever — before the college 48-hour cancel can run. Unfindable picks pile up at the head of the queue; at 500, the cron grades and pays no one. Today: 4 (NFL, pending since 2026-07-30). No cap (D1) and a new sport raise the inflow. Each stuck pick also uses up one "X out of N" slot and holds every prize final pass in its scope for the full 3-day grace. | Fixed in 7.4 |
| F5 | Low | The games list's blocked-game message is the FIRST prize's `limitMessage`; with two limit prizes on one list (EPL and La Liga, say), a tap can quote the wrong prize. | 7.5 |
| F6 | Low | The sweep's "graded in the last 5 minutes" read is one unordered `.limit(1000)`; on a very busy minute some venues miss their mid-period pass (they are still paid at the period's end). | 7.5 |
| F7 | Low (recommendation) | The provider sends kickoffs with no TV time as 05:00Z (midnight Eastern): 39 of 57 FBS games on Nov 21 (asked 2026-11-01), 6 of Nov 7's. The game id embeds the kickoff, so when the real time is set a pick made under the old id no longer matches its game (it shows unpicked, a second pick on the same game is possible, and for a Central/Pacific venue the placeholder lands on Friday's prize period). The "picks only for today" rule makes it rare: times are set well before game day. Older id scheme, all sports. | §8 Q5 |
| F8 | Low (docs) | The plan status and `CLAUDE.md` said `20261031200417`/`20261031203914` were not applied; production has all five. | Fixed in Phase 7 |
| F9 | Info (checklist) | `venue-hightop-test` is NOT hidden (`hidden = false`) and has 48 player profiles. A prize a PARTNER creates there pushes "News from your bars" to them; one created from Admin doesn't. | Checklist §A |
| F10 | Low (cosmetic) | `PickEmPrizeTiebreakerCard`'s "Saved!" flash is `bg-emerald-400 text-emerald-950` (copied from `NFLTiebreakerCard`), not a dark/light token. Invisible while the light theme flag is off. | 7.5 |
| F11 | **Likely high (money), unverified live** — found in 7.1 | `settle_prediction_market` (SECURITY DEFINER; settles a market and credits `users.points`) had EXECUTE revoked from `public` (`20260227152000`, `20260421113000`) and from `anon` (`20260602140000`), but never from `authenticated`. Supabase's default privileges grant EXECUTE on new functions to anon/authenticated/service_role explicitly (functions were NOT covered by `20260923130842`), so every signed-in player can probably call it through `/rest/v1/rpc/`. Same pattern: `prune_user_analytics_raw_events`, `refresh_user_analytics_rollups` (no money; deletes/cost). Not checked live: `supabase db dump` needs Docker, and calling the RPC on production would be a write. 7.1/7.1b do NOT close it (SECURITY DEFINER runs as the owner). The 7.1c re-scan found the same gap on both `get_challenge_leaderboard_snapshot` overloads (never revoked from anyone, anon included) and the four `refresh_live_trivia_inventory_summary*` functions. | Fixed in 7.1c (applied 2026-11-01) |

**Cost notes (no change needed):** per games view, one extra `pay_pickem_points` call scoped to the player and, with a
Pick 'Em Prize at the bar, the shared 60-second prize read plus one indexed count per "out of N" prize. The cron adds one
prize read per minute (0 rows today: no Pick 'Em Prize exists). Production volume is small (135 picks all time, 87 in 90
days, max 12 per player per day).

**Before deploying Phases 1–6:** wins graded on the old code since the 2026-10-31 backlog cut that nobody collected
will be paid at the first run (10 each; no prize progress when graded more than 6 h earlier). Run
`npm run pickem:unpaid-report` right before the deploy to see the number.

## 10. Code review after 7.5 (2026-11-01, `/code-review`): findings

Run on the working tree after 7.5. Each finding was re-checked against the code before it was planned (2026-11-01).
Numbering continues from §9. Fixes are sub-phases 7.5.1–7.5.5 (§7); 7.6 re-reviews them with 7.1–7.5.

| # | Severity | Finding (where) | Fix |
|---|----------|-----------------|-----|
| F12 | **High (money)** | `settleAdminPickEmGame` (`lib/admin.ts`) marks picks `won` and adds `reward_points` straight to `users.points` without stamping `reward_claimed_at`, so `pay_pickem_points` pays the same picks again on the next cron run (each winner gets 20, not 10). Breaks "money moves ONLY in the RPC". Also grades spread picks by winning team alone. | 7.5.1 |
| F13 | Low (dead code) | `components/activity/ActiveGamesPanel.tsx` still offers "Claim Points!" for won, unpaid picks and posts `action: "claim"`, which now returns `claimed: false`. Verified: the panel is mounted nowhere, so no player sees it today. | 7.5.5 |
| F14 | Medium (latent outage) | The settlement read is the 500 oldest started pending picks. Picks that legitimately wait up to 48 h (no locked line, "post" but not final, NFL spread with no line) can fill it, so later finished games are never graded or paid until they age out. 7.4's 8-day cancel doesn't reach them; no daily cap (D1) raises the volume. | 7.5.2 |
| F15 | Medium (cost) | Every `GET /api/pickem/picks` and `GET /api/pickem/games` with a `userId` runs `pay_pickem_points` (a write transaction with row locks) even when the player has nothing to pay; the games list repeats it every 60 s while games are live. The cron already pays every minute. | 7.5.2 |
| F16 | Low (latency/cost) | `listPickEmGames` awaits the college lines, the prize loader and the today summary one after another, though they are independent, and reads the venue's college rule uncached on every list view. | 7.5.4 |
| F17 | Low (rule integrity) | The Pick 'Em Prize overlap rule (D6, `lib/rewards.ts`) is read-then-insert with no lock: two saves at the same bar (two tabs, or admin + owner) can both pass and create two overlapping "X out of N" prizes. | 7.5.3 |
| F18 | Low | The winners-ledger read in `settlePickEmPrizes` pages with `.range` ordered only by the non-unique `cycle_start`, so rows can be skipped or repeated between pages; the deleted-player placeholder key also depends on page order. | 7.5.5 |
| F19 | Low (display) | `newlyWonPointsOf` shows "+10" and sends a `tp:points-updated` delta when a pick turns `won`, but grading and payment are separate steps; a failed or capped payment makes the header show points the server hasn't paid. | 7.5.2 |
| F20 | Low (docs) | The comments in `lib/pickemPoints.ts` and on `settlePendingPickEmPicks` say the first run pays the pre-release backlog (48 picks / 480 points); migration `20261031182914` actually stamps it with 0 points (D12). | 7.5.5 |

## 11. Phase 7.6 re-review (2026-11-01): findings

Re-reviewed 7.1–7.5.5 as one change on top of Phases 1–6: the four new migrations, `settlePendingPickEmPicks` (stale cancel,
keyset pages, who pays), the college grade/missing-game gates and `fetchBallDontLieList`'s `failure` box, `settleAdminPickEmGame`,
`payPickEmPoints`, the venue Prizes snapshot and card, the prize sweep (F6/F18 reads, `endPickEmPrize`), the per-game limit message,
the parallel games-list reads and the display cache, the save lease and `createPickEmReward`, `newlyWonPointsOf`, and every path
that can change a Pick 'Em Prize after it is created. Production was only read: `supabase migration list`, row counts, and one
public GET of the live venue Prizes route. Nothing was written anywhere.

Gates at the re-review: `npx tsc --noEmit` clean; eslint clean on every changed and new `.ts`/`.tsx` file; `npm run build`
passes; `npm run test` 6,038 pass / 13 skipped / 4 fail (the same four date-based Sports Bingo star-index tripwires as every
phase since 1); all seven SQL proofs pass (`test:pickem-points-sql`, `test:pickem-lines-sql`, `test:pickem-prizes-sql`,
`test:pickem-prize-awards-sql`, `test:pickem-prize-lease-sql`, `test:player-write-lockdown-sql`, `test:security-definer-sql`).

**Production, read 2026-11-01:** every migration in this plan is applied, `20261102021619` included (the plan said it wasn't).
6 started pending picks, all NFL: 4 from 2026-07-30/08-02 (the 7.4 stale cancel ends them at the first run of the new code) and 2
for tonight's game. 13 won picks unpaid (graded on the old code since the 2026-10-31 cut; paid 10 each at the first run). 0 Pick
'Em Prizes, 0 lease rows. 0 duplicate "won. +N pts." notifications among the last 24.

**Looked at and sound:** 7.1/7.1b (no browser file writes `users`/`pickem_picks`; the only non-admin client reads `venues`); 7.1c
(the three inventory trigger functions that call the revoked refreshers are SECURITY DEFINER, so they keep working; the two revoked
functions the app calls go through `supabaseAdmin`); the lease (advisory lock per venue, renew-own-token, stranger can't release,
claimed before the overlap read, released in `finally`, busy → 409, failed → refuse); 7.3's gate order (called off → cancel, real
final → grade, 48 h → cancel; no 4-hour shortcut for college); 7.4's cancel (first page only, one bulk update, scoped per player)
and the complete-fetch rule for the college missing-game cancel; 7.5.1 (grades only, counts only changed rows, one global payment);
7.5.2's cursor (quoted values, `(starts_at, id)` order, read once per run below 500 rows) and the F15/F19 rules; 7.2's tier keys,
"Upcoming"/"Ended" states and the coupon still working after `endPickEmPrize`; 7.5's per-game limit message; 7.5.4's disjoint
fields; 7.5.5's ledger order.

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| F21 | Medium-low (rule integrity; admin only) | Admin Rewards' **Enable** (single and bulk) and **Edit** act on a Pick 'Em Prize through the legacy `challenge-campaigns` PATCH (`updateChallengeCampaign`), which knows nothing of Pick 'Em: no save lease, no overlap check (D6). Enabling a prize the sweep ended (`endPickEmPrize`) or an archived one can leave two overlapping prizes counting the same picks. Edit re-sends every generic field on save, so even a rename can change "Get N right"'s N (`points_required_to_win`), the generic schedule, or the venues — and a second venue makes the sweep skip the prize for good ("prize is not for exactly one venue"). Partners can't reach it (owners only create and archive). Same legacy path exists for Squares/Bracket prizes (not this plan). | Fixed in 7.6.1 |
| F22 | Low (display) | An ended Pick 'Em Prize card never leaves the venue Prizes panel: the venue page asks for inactive prizes too (`includeInactive=true`), and 7.2 labels them "Ended" but keeps them. A bar that makes a one-day prize every Saturday collects one more "Ended" card a week, all counted in the "Active · N Prizes" header. Archived prizes of other kinds behave the same today (live: Pacific Street's archived Live Trivia Challenge is still returned) — §8 Q7. | Fixed in 7.6.2 |
| F23 | Low (pre-existing; notifications) | `recordSettlement` (`settlePendingPickEmPicks`) counts a win and queues its "X won. +10 pts." notification even when its conditional update changed no row. The cron, the webhook and every open Pick 'Em screen all settle, so two runs overlapping on a game's final can both count it: a duplicate notification (and, through the push outbox, a duplicate phone push), and a player's call can pay "because it graded a win" when it didn't (harmless: the RPC pays once). Measured: 0 duplicates in the last 24 win notifications. | Fixed in 7.6.3 |
| F24 | Low (docs) | The plan and `CLAUDE.md` said `20261102021619` was NOT applied; production has it. `CLAUDE.md` still said 7.1c was not applied, and §9's F11 row said "not applied". | Fixed in 7.6 |

**Cost:** nothing in 7.6.1–7.6.3 adds a request on any poll or cron (7.6.1 adds one indexed read per manual admin PATCH).
**Deploy:** none of F21–F23 blocks deploying Phases 1–7.5.5; 7.6.1 should land before the first Pick 'Em Prize is created.


---

## Standing rules (moved from CLAUDE.md, 2026-11-03)

> These rules were in the project `CLAUDE.md` until 2026-11-03 and still apply. CLAUDE.md now keeps a
> one-line pointer here. Keep this section current when the feature changes.

### Pick 'Em scoring + College Football (Phases 1–7.5.5 built 2026-10-31/11-01, uncommitted; ALL NINE migrations applied to production)
Plan: `docs/pickem-college-football-and-prize-plan.md` (Andrew's decisions in §2; latest handoff on its status line).
- **Phase 7 review (2026-11-01): findings F1–F11 in plan §9, fixes 7.1–7.6.** Don't deploy Phases 1–6 before 7.1–7.4.
  F1: players can write `pickem_picks` (and `users`) straight through the public API (RLS "own row" insert/update
  policies + full grants); a forged `won` row is paid and counts toward prizes. The browser never writes either table —
  never add a browser write to `pickem_picks` or `users`. Every SQL fix is a NEW migration (all seven are applied).
  **7.1/7.1b APPLIED 2026-11-01:** `20261101150024_pickem_picks_server_only_writes.sql` and
  `20261101150026_users_server_only_writes.sql` revoke anon/authenticated writes and drop the "own row" write policies
  (SELECT stays). **7.2 (2026-11-01, no migration):** the venue Prizes card reads a Pick 'Em Prize's own period
  (`pickemPrizeCardPeriod`, tier 0–3 keys inside the one batched ledger read; terms ride the snapshot's campaign read via
  `listChallengeCampaigns({ withPickEmTerms })`), never a points gauge; the sweep ends a one-day/range prize once its only
  period is settled (`endPickEmPrize`, is_active = false) — that is the card's and the partner list's "Ended". **7.1c (2026-11-01, migration `20261101153306` applied):** players can't EXECUTE server-only SECURITY DEFINER
  functions (`settle_prediction_market`, `get_challenge_leaderboard_snapshot`, analytics/inventory refreshes) — a new one
  must `revoke all … from public, anon, authenticated` + `grant execute … to service_role` in its own migration, or
  `tests/security-definer-execute-contract.test.ts` fails (`revoke … from public` alone is NOT enough on Supabase). **7.3
  (2026-11-01, code only):** a college pick grades only on `status` "post" + `status_state` "final" with a non-0–0 score;
  cancelled/postponed/forfeit → cancelled at once (`collegeFootballGradeGate`). **7.4 (2026-11-01, code only):** a pending
  pick whose game started > 8 days ago (`PICKEM_UNFINDABLE_PENDING_MS`, outside the ±7-day score fetch) is cancelled in one
  bulk update before grading (`[Pick 'Em] stale-pending-canceled`); a college pick whose game the provider doesn't list gets
  its 48 h cancel ONLY on a complete fetch (`collegeFootballMissingGameGate`; `fetchBallDontLieList`'s `failure` box — a
  failed provider reply reads as "no games", never cancel on it). **7.5.1 (2026-11-01, code only):** admin "settle game"
  (`settleAdminPickEmGame`, `lib/admin.ts`) only grades, then calls `payPickEmPoints()` — never credits `users.points`; spread
  picks stay pending for the cron. **7.5.2 (2026-11-01, code only):** settlement reads started pending picks in keyset pages by
  `(starts_at, id)` (`PICKEM_SETTLE_PAGE_SIZE` 500 × `PICKEM_SETTLE_PAGE_CAP` 6, log `settle-page-cap`); a player's own
  `settlePendingPickEmPicks({ userId })` (games/picks GETs) pays ONLY when it graded a win — cron + webhook always pay; the
  screen's "+10" (`newlyWonPointsOf`) fires only when `userPickRewardClaimedAt` goes null → set. **7.5.3 (2026-11-01, migration `20261102021619`
  applied — found in 7.6; the code fails closed without it):** a Pick 'Em Prize save holds a per-venue lease
  (`lib/pickemPrizeSaveLease.ts` → `claim_pickem_prize_save` / `release_pickem_prize_save`, 30 s) from before the overlap read
  until after the insert; busy → 409. Any new path that changes a Pick 'Em Prize's scope/window/pick limit takes it too
  (`npm run test:pickem-prize-lease-sql`). **7.5.4 (2026-11-01, code only):** `listPickEmGames` runs the college lines, the prize loader and today's summary with `Promise.all` (they write disjoint game fields); the college rule for DISPLAY is cached 30 s per venue per instance (`clearCollegeScoringModeDisplayCache` in tests) while `submitPickEmPick` still reads it fresh. **7.5.5 (2026-11-01, code only):** dead `ActiveGamesPanel` (Collect button) deleted, contract test bans `action: "claim"` to the picks route; the prize winners-ledger read pages by `(cycle_start, id)`. **7.6 re-review (2026-11-01): F21–F24 in plan §11, none blocks deploy;
  fixes 7.6.1–7.6.3.** **7.6.1 (2026-11-01, code only):** the admin `challenge-campaigns` PATCH skips the lease and D6, so on a
  Pick 'Em Prize it accepts ONLY name, image fields, `displayOrder` and `isActive: false` — `pickemPrizeAdminPatchRefusal`
  (`lib/pickemPrizes.ts`, an allowlist) → 409 `REWARD_PICKEM_ADMIN_EDIT_MESSAGE`; the row is read (`getChallengeCampaignDefinitionId`)
  only when the body would be refused. Admin list: no Edit, Enable disabled on those rows (`tests/pickem-prize-admin-patch-guard.test.ts`).
  Squares/Bracket prizes still go through the same unguarded PATCH (not this plan). `tests/player-table-write-lockdown-contract.test.ts` fails if a later migration re-opens them or a
  browser-client file names either table; SQL proof `npm run test:player-write-lockdown-sql`.
- **No daily cap, no 2×/3× bonus, no Collect button.** Every correct pick in `pickem_picks` — NFL Pick 'Em included
  (Andrew, D10) — is paid a flat 10 venue points automatically after grading. The money moves ONLY in the
  `pay_pickem_points` RPC (conditional `reward_claimed_at` stamp + `users.points` in one statement), called ONLY by
  `payPickEmPoints` in `lib/pickemPoints.ts`, which `settlePendingPickEmPicks` runs on every path. Never pay a pick with a
  plain update, never call the retired `claim_pickem_points` (`tests/pickem-automatic-points-contract.test.ts`).
- The old uncollected backlog is NOT paid (Andrew D12): the migration stamps won picks graded > 24 h before it runs
  `reward_claimed_at` + `reward_points = 0`.
- **College Football (Phase 2, 2026-10-31, migration `20261031185853` applied 2026-10-31 — needed before the code or college picks
  are refused):** slug `ncaaf`, key `americanfootball_ncaaf`. FBS rule, live label and grade gate live ONLY in
  `lib/pickemCollegeFootball.ts` (FBS = at least one team in conference ids 1–11, pinned by a captured fixture). A college
  pick grades only on a real final (status + both scores) — never the 4 h staleness shortcut — and is cancelled 48 h after
  kickoff with no final. `tests/lib.pickem-college-football.test.ts`.
- **College spreads (Phase 3, 2026-10-31, migration `20261031191250` applied 2026-10-31):** venue rule
  `venue_game_settings.cfb_pickem_scoring_mode` (default `spread`; Game Settings owner + admin). A college pick is stamped
  `pickem_picks.scoring_mode` WHEN MADE (switching sides keeps it) and graded by that stamp. Lines live in
  `pickem_game_lines`, written ONLY by `upsert_pickem_game_lines` (before kickoff, never once locked/started) from the
  games list, and locked ONLY by `lock_pickem_game_lines` in settlement (never fetches/creates) — both via
  `lib/pickemGameLines.ts`. One sportsbook rule for NFL + college: `lib/spreadLines.ts`. Provider asked ≤ once per
  10 min (`PICKEM_LINE_REFRESH_MS`). No line = "Line coming soon", can't pick; final with no locked line → cancelled at
  48 h; a failed lock read never cancels. Tests `tests/lib.pickem-college-spreads.test.ts`, `npm run test:pickem-lines-sql`.
- **Pick 'Em Prize data + rules (Phase 4a, 2026-10-31, migration `20261031200417` applied; the wizard offers it
  since Phase 5, `isPickEmPrizeOffered` = true).** Definition `pickem_challenge`, `game_types ['pickem']`. Its terms are the
  `challenge_campaigns.pickem_*` columns (NOT in `CAMPAIGN_SELECT_COLUMNS`; read only via `listActivePickEmPrizeCampaigns` /
  `loadPickEmPrizeTerms`). ALL rules live in the leaf `lib/pickemPrizes.ts` (scope = sport slugs + league SPORT KEYS, window →
  venue-local periods, the ONE cycle key `pickemPrizeCycleStart` = period start + tier seconds, validation, overlap rule D6);
  sports/leagues list = `lib/pickemSports.ts` (shared with `lib/pickem.ts`); tier prizes = `lib/pickemPrizeTiers.ts`. The generic
  10-points accrual SKIPS this definition (`isPointsAccrualExempt`). A clash is `RewardConflictError` → 409. Pick limit (D5) =
  `lib/pickemPrizeLimit.ts`, new picks only, fails OPEN on a read error (the prize counts only the first N picks).
- **Pick 'Em Prize awards (Phase 4b, 2026-10-31, migration `20261031203914` applied).** Sweep `settlePickEmPrizes`
  (`lib/pickemPrizeAwards.ts`) at the end of `/api/cron/pickem-settle`; ALL award rules are pure in `lib/pickemPrizeStandings.ts`.
  "X out of N" pays ONLY via RPC `award_pickem_tier_prize` (`awardPickEmTierPrize`; top tier reached with a prize left, one per
  player per period, counts only a player's first N picks by `created_at`); target / most right via `award_cycle_winner` at the
  tier-0 key. A settled period has a `pickem_prize_settlements` row and is never re-read. Tiebreaker guesses
  (`pickem_prize_tiebreakers`) are written only by `savePickEmPrizeGuess` (`lib/pickemPrizeTiebreaker.ts`), route
  `/api/pickem/prize-tiebreaker` (session-bound, locks at the game's start). SQL proof `npm run test:pickem-prize-awards-sql`.
- **Pick 'Em Prize wizard (Phase 5, 2026-10-31).** Steps `games` → `when` → `terms` ("How to win") come before the usual
  `players` (most right only) / `prize` (one per tier) / `confirm`, in the ONE `CreateRewardWizard`; `games`/`when` exist
  only for this definition (`guardRewardWizardStep` sends them to `terms` otherwise, and a later step back to the first
  unanswered Pick 'Em question). Rules = `lib/pickemPrizeWizard.ts` (feeds `validatePickEmPrizeTerms`, same as the
  server); partner words = `PICKEM_PRIZE_PARTNER_COPY` in `lib/rewardDefinitions.ts` (never in `description`, which guests read).
- **Pick 'Em Prize player screens (Phase 6, 2026-10-31).** The games response carries `prizes` (`PickEmGamePrize`, client-safe in
  `lib/pickemPrizeLine.ts`; built by `loadPickEmGamePrizes`, `lib/pickemGamePrizes.ts`, from the limit's 60 s per-instance prize cache +
  one `countPickEmPicksInPrizePeriod` per "out of N" prize) — the screen makes no request of its own for the prize line. A used-up
  limit sets `pickLimitReached` on games not yet picked (changing/clearing a pick is always allowed). `PickEmPrizeTiebreakerCard`
  (inline, no Back) calls `/api/pickem/prize-tiebreaker` once and only when a "most right" prize runs TODAY (`hasTiebreaker`).
  Coupon words: `listChallengeCampaignWinsForUser` adds the prize's `pickem*` terms to `rewardTerms` (one `loadPickEmPrizeTerms` read,
  only when the wallet holds such a coupon). Period words have one home, `describePickEmPrizePeriodPhrase`.
- `pickem` points-target prizes get 10 per correct REGULAR pick at payment; NFL picks feed only `nfl-pickem` (their own
  sweep), and picks graded > 6 h earlier add points but no prize progress. SQL proof: `npm run test:pickem-points-sql`.
