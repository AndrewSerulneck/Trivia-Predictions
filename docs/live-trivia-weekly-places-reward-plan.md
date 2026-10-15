# Live Trivia Weekly Places Reward (1st / 2nd / 3rd over the week) — Plan

> **Status:** Phases 1–4 **done** 2026-10-14 (data model, weekly resolver, server creation + wording, what players /
> partners / admins see). Phase 5 **done** 2026-10-14: Garden State Bar's reward is live in production
> (`677a214c-b859-4c17-8e4d-9889574516e1`, from the Oct 14 week) and Andrew approved + applied the backfill
> (13 coupons, $320, 10 weeks settled, expiry 2026-11-13; verified, re-run is a no-op). Wording changed to
> "1st place wins …, 2nd place wins … and 3rd place wins …" (Andrew, 2026-10-14). Phase 6 (Create Reward wizard) and Phase 8 (**Game Results**, renamed from "Past Winners" by Andrew) + D13 **deployed** 2026-10-14: migration `20261014213000_owner_past_winners_summaries.sql` applied to production, code pushed to `main`. Latest handoff:
> `docs/live-trivia-weekly-places-reward-plan_PHASE_8_HANDOFF.md`. Next: **Phase 7** (after Fri 2026-10-16's game).
> Each phase ends with `docs/live-trivia-weekly-places-reward-plan_PHASE_<N>_HANDOFF.md`; update this line to point at the latest.
> **Owner:** Andrew. **Trigger:** Garden State Bar promised posters with weekly 1st/2nd/3rd Live Trivia
> prizes but never set up a reward, and the system can't express one today.

---

## 1. Summary for Andrew (plain English)

**What we're building:** a new kind of Live Trivia reward. Today a reward goes to either (a) anyone who
reaches a points target, or (b) the winner of one game. The new kind adds up each player's points across
**every game in a week** (for Garden State Bar: Wednesday + Thursday + Friday) and gives **different prizes
to 1st, 2nd and 3rd place**. Coupons show up on the winner's Redeem Prizes page, like today.

**Garden State Bar's reward:** every week, $30 gift card for 1st, $20 for 2nd, $10 for 3rd.

**Paying past winners:** after the system can do this, a one-time script awards every past week since their
first game (Aug 5, 2026). Based on today's data that is **13 gift cards worth $320** (table in §4; an earlier draft said 11 — a counting slip, the table itself always added up to 13). The current
week (Oct 14–16) gets added once Friday's game ends.

**Two additions (Andrew, 2026-10-14):**
- **Minimum players, partner's choice.** When creating a competitive reward (this weekly one, or the
  existing "win the game" one), the partner can say "only pay out if at least N players took part". Off by
  default. A week (or game) below the minimum pays nobody, and that is recorded so the partner can see why.
- **Past winners on the Partner Dashboard.** A new menu row, **Game Results**, lists past Live Trivia games
  and rewards; tapping one shows its history (who won each game / each week, and what they won). Phase 8.

**What needs you:** the backfill dry-run approval (Phase 5), and the phone checks listed per phase.
Already given (2026-10-14): database change approved, push + deploy of Phases 1–4 approved, Garden State
Bar will honor the backfill.

## 2. Decisions locked (Andrew, 2026-10-14). Don't re-ask these.

| # | Question | Answer |
|---|---|---|
| D1 | Ties on weekly points | **Whoever got there first.** Of two tied players, the one whose last point-scoring answer of the week came first wins the higher place. Each place has exactly one winner, so the bar's cost is fixed. |
| D2 | Fewer than 3 players | **Pay every filled place.** Any player with **more than 0** points can place. Nobody needs a minimum number of players. |
| D3 | Expiry of backfilled coupons | **30 days from the day issued** (normal coupons: 7 days, `PRIZE_EXPIRY_MS` in `lib/challengeCampaigns.ts`). |
| D4 | Prize flexibility | **Any prize per place.** Each place gets its own full prize (gift card, or menu item with a $ or % discount), for example 1st = $30 gift card, 2nd = free appetizer. |
| D5 | Garden State Bar prizes | Weekly gift cards: 1st **$30**, 2nd **$20**, 3rd **$10**. |
| D6 | Backfill start | From their first Live Trivia game, **2026-08-05**. **Confirmed by Andrew 2026-10-14.** |
| D7 | Minimum players | **Partner's choice, per reward.** Optional "pay out only if at least N players took part" (N = 2–100) on competitive rewards: ranked places and game winner. Off = no minimum (D2 still holds). Not offered on points-target rewards (a personal goal) or NFL Pick 'Em (it already has a fixed 3+ pickers rule). A "player who took part" = anyone who answered at least one question in that week (ranked) or game (game winner), scored or not. |
| D8 | Reward created mid-week | **Starts immediately.** The week it is created in counts (all of that week's games, including nights already played), as long as the reward existed before that week's last game ended. Created after the week's last game ended → starts the next week. |
| D9 | Past winners for partners | A **Game Results** row in the Partner Dashboard menu → list of past games and rewards → tap one for its history (Phase 8). Renamed from "Past Winners" to **Game Results** (Andrew, 2026-10-14); component `GameResultsSheet`, sheet id still `history`. |
| D10 | Defaults confirmed | Weekly only, 1–3 places; players see their live standing on the Rewards card; no feature flag. |
| D11 | Approvals | DB change in Phase 1 approved. Push + deploy of Phases 1–4 approved. Backfill dry run is shown to Andrew and approved before any coupon is issued. Garden State Bar confirmed it will honor ~$320 plus up to $60 for the Oct 14 week. **Phase 8 push + deploy approved too (Andrew, 2026-10-14).** |
| D12 | Category Blitz in Game Results | **No** (Andrew, 2026-10-14). Game Results = Live Trivia games + rewards only. |
| D13 | Single-game venues | **"Top players this week" is always an option** once the venue has a Live Trivia game, even a single non-repeating one (Andrew, 2026-10-14). The week anchors on the repeating nights, else the one-off games' nights (`rankedNightsForVenue`, `lib/rankedPlaceRewards.ts`); every game in the week still counts. Pinned games must still repeat weekly. With no repeating game, the guest wording names no weekday. |

### Defaults (planner's, confirmed by Andrew 2026-10-14 except where D7/D8 changed them)

- **Weekly only, 1–3 places.** A partner chooses 1, 2 or 3 places. Other cadences (one night, monthly) are out of scope.
- **A week = the reward's game nights in one week**, anchored on the first night (Garden State Bar: Wed 00:00
  America/New_York through the next Wed). It resolves on the first cron sweep after that week's **last**
  scheduled game ends, so Friday's winners get their coupon Friday night.
- **Missed nights count as 0.** No one has to play all three nights; their points are simply added up.
- **One place per player per week.** Repeat winners in later weeks are allowed.
- ~~On offer only from the first full week.~~ **Replaced by D8:** a reward created mid-week starts that week,
  provided it existed before the week's last game ended. Weeks before the first live week are paid only by
  the explicit backfill script (Phase 5).
- **Players see the prize ladder and their own standing** on the Rewards card ("You're 2nd with 140 pts
  this week"). That costs one small aggregate query per panel load, cached (§6).
- **The option appears for every partner when Phase 6 deploys, with no feature flag** (confirmed, D10).
- **Coupons are in-app gift-card coupons.** Garden State Bar has no POS connection (`pos_connections` is empty
  for the venue), so staff honor the coupon the same way as every gift-card reward today.

## 3. How the current system works, and what's missing (verified 2026-10-14)

- Rewards = rows in `challenge_campaigns` created through `createReward` (`lib/rewards.ts`) from the registry
  `lib/rewardDefinitions.ts` (`live_trivia_challenge`). `win_condition` is `'points_threshold' | 'game_winner'`
  with a DB check constraint (migration `20260721120000_rewards_game_winner_condition.sql`).
- **The prize is one per campaign.** Prize columns live on `challenge_campaigns` (`prize_kind`, `prize_menu_item`,
  `prize_menu_item_name`, `prize_discount_kind`, `prize_discount_value`, `prize_gift_certificate_amount`,
  `prize_pos_value_cents`, `prize_pos_delivery`). The coupon (`challenge_campaign_redemptions`) **snapshots**
  them at award time.
- **Awarding is the `award_cycle_winner` RPC.** Latest definition is in
  `20261007030714_square_scannable_prizes.sql`. It uses a count-guarded insert into `challenge_cycle_winners`
  (unique `(challenge_id, cycle_start, winner_user_id)`) under `pg_advisory_xact_lock(hashtextextended(id||':'||epoch(cycle_start)))`,
  then inserts the coupon copied from the campaign row. It can't give different prizes per winner, except for
  the gift-card amount override `p_prize_gift_certificate_amount`. The TS wrapper `awardCycleWinner` in
  `lib/challengeCampaigns.ts` (~line 2042) sets the expiry and creates the win notification.
- **The "game winner" sweep** (`lib/liveTriviaWinnerRewards.ts`, cron `/api/cron/resolve-live-trivia-winners`,
  `*/5 * * * *` in `vercel.json`) handles **one game**: `findEndedOccurrences` (6h lookback) →
  `loadOccurrenceFinalStandings` (sums `live_showdown_answers.points_awarded` per user for one
  `(schedule_id, occurrence_date)`) → awards ties for first. **Nothing adds up points across a week.**
- **Weekly cycle math exists:** `computeCycleStart` / `computeCycleEnd` (`lib/challengeCampaigns.ts` ~682)
  anchor a weekly cycle on `activeDays[0]` at `startTime` in the venue timezone.
- **Score data:** `live_showdown_answers(user_id, schedule_id, occurrence_date, points_awarded, answered_at, …)`,
  index `idx_lsa_occurrence (schedule_id, occurrence_date)`. `user_id` → `users.id` (venue-scoped player row,
  `users.username` is the display name). Venue ↔ schedule via `trivia_schedules.venue_id`.
- **Leaderboard mode is retired** (`docs/rewards-system-plan.md` decision 4). This plan does not bring it back.
  It adds a new `win_condition` that the resolver settles once, at the end of the week.

## 4. Garden State Bar facts (production, read-only queries, 2026-10-14)

- Venue `venue-garden-state-bar`, timezone `America/New_York`, visible, billing `active`, one owner link.
- One schedule: `78a0e374-f3f1-4605-af35-89deb8040660` "Weekday Trivia", `recurring_type weekly`,
  `recurring_days [wed, thu, fri]`, `start_time 2026-08-05T19:00:00Z`, 14 rounds.
- **Zero** `challenge_campaigns` for the venue. No POS connection. God Mode accounts (Andrew, marc) have
  player rows at the venue but **no** Live Trivia scores there, so there's no test data to exclude.
- 375 answer rows. Weekly totals (Wed-anchored) and the **expected backfill under D1–D5**:

| Week of (Wed) | Nights played | 1st ($30) | 2nd ($20) | 3rd ($10) |
|---|---|---|---|---|
| 2026-08-05 | Wed/Thu/Fri | Snooker 410 | Kuch 140 | fast76 50 |
| 2026-08-12 | Fri | jparadise 50 | — | — |
| 2026-08-19 | Wed/Fri | Sweetgurly35 210 | Owen McSullivan 30 | — |
| 2026-08-26 | Fri | shrimpsalaad 110 | — (ashdawnhutch scored 0) | — |
| 2026-09-02 | none | — | — | — |
| 2026-09-09 | Fri | lego05 240 | Abby72 180 | — |
| 2026-09-16 | Thu | shrimpsalaad 80 | ana 40 | — |
| 2026-09-23, 09-30 | none | — | — | — |
| 2026-10-07 | Fri | murph 90 | kellygurl 10 | — |
| **Total** | | 7 × $30 | 5 × $20 | 1 × $10 = **$320, 13 coupons** |
| 2026-10-14 (in progress) | Wed so far | JKem5 200 and holloway456 200 tied after Wed (D1 decides once Fri ends) | | |

Phase 5 must re-run these numbers from the shared code before issuing anything. This table is a
check, not the source.

## 5. Design

### 5a. Data model: one additive migration (Phase 1) — AS BUILT

File: `supabase/migrations/20261014010000_live_trivia_ranked_places.sql` (applied to production 2026-10-14).
Proven on PGlite by `npm run test:ranked-places-sql` (`scripts/test-ranked-places-sql.cjs`).

1. `challenge_campaigns.win_condition` check now allows `'ranked_places'` (old inline check dropped by catalog
   lookup, re-added as `challenge_campaigns_win_condition_check`).
2. `challenge_campaigns.place_prizes jsonb`: non-null **iff** `win_condition = 'ranked_places'`, an array of
   1–3 elements (`challenge_campaigns_place_prizes_check`). Element (snake_case, one per place):
   `{ place, prize_kind, prize_gift_certificate_amount, prize_menu_item, prize_menu_item_name,
   prize_discount_kind, prize_discount_value, prize_pos_value_cents, prize_pos_delivery }`. Parsed by
   `normalizePlacePrizes` / written by `serializePlacePrizes` (`lib/rankedPlaceRewards.ts`). Campaign-level
   prize columns stay null on a ranked reward.
3. `challenge_campaigns.min_players smallint` (D7): null or 2–100, and only on `game_winner`/`ranked_places`
   (`challenge_campaigns_min_players_check`).
4. `place smallint` (null or 1–3) on `challenge_cycle_winners` and `challenge_campaign_redemptions`.
5. **New table `challenge_cycle_settlements`** — PK `(challenge_id, cycle_start)`, `venue_id`, `outcome`
   (`awarded | no_scorers | below_minimum`), `participant_count`, `winner_count`, `min_players` (at settlement
   time), `settled_at`. One row per settled week **including weeks nobody won**. Why it was added (not in the
   original plan): without it a week with no winners leaves no trace, so the 5-minute resolver would re-read
   its scores on every sweep for the whole lookback (~4,000 aggregate calls per empty week per reward), and
   the Phase 8 history couldn't say "no winner — only 2 players". RLS on, service_role only; cascades with
   the reward.
6. **RPC `award_ranked_cycle_places(p_challenge_id uuid, p_cycle_start timestamptz, p_venue_id text,
   p_winners jsonb, p_participant_count integer, p_prize_expires_at timestamptz)` → `(status text,
   winners_awarded integer)`.** `p_winners` = `[{user_id, place, points}]`.
   - Same advisory lock key as `award_cycle_winner` (test proves the expressions are identical).
   - If a settlement **or** any ledger row exists for `(challenge_id, cycle_start)` → `already_resolved`, writes nothing.
   - Otherwise writes the settlement + one ledger row and one coupon per winner (coupon snapshots that place's
     prize, `reward_name`, `place`) in one transaction. Empty `p_winners` → `no_scorers`, or `below_minimum`
     when the reward has a minimum the week didn't reach.
   - **Raises (full rollback)** on: not a ranked reward / unknown reward; malformed winner; duplicate place or
     player; places not exactly 1..k or k > place count; a winner with 0 points; fewer participants than
     winners; winners sent while below the minimum; missing expiry; a place with no prize.
   - `security definer`, `search_path = public`, execute for `service_role` only.
7. **RPC `live_trivia_week_totals(p_schedule_ids uuid[], p_dates date[])`** → `(user_id, total_points bigint,
   reached_at timestamptz)`. The two arrays are **paired** (`schedule_ids[i]` with `dates[i]`), so a pinned
   reward passes exactly its games. Returns one row per player who answered at least once **including 0-point
   players** (needed for the minimum-player count); `reached_at` = last point-scoring answer (null at 0).
   service_role only. TS wrapper: `loadLiveTriviaWeekTotals` (`lib/liveTriviaWeekTotals.ts`).
8. `award_cycle_winner` re-created with one added guard: a `ranked_places` reward → `won=false,
   exhausted=true`, nothing written. Otherwise byte-for-byte the 20261007030714 version.
9. Partial index `idx_challenge_campaigns_ranked_places` for the resolver's scan (moved here from Phase 2).
10. No FK to `users`/`auth.users` added; account deletion needs no change (it blanks the ledger's
    `winner_user_id` and deletes coupons; `place` rides along).

### 5b. Ranking rules (one pure module, Phase 1): `lib/rankedPlaceRewards.ts`

`rankWeekPlaces({ totals, placeCount, minPlayers })` → `{ places, participantCount, outcome,
tiebreakUnresolved }` (as built in Phase 1): if `minPlayers` is set and fewer players took part →
`below_minimum`, no places. Else filter `total_points > 0` → sort by `total_points` desc, then `reached_at`
asc (D1), then `user_id` asc as the last-resort fallback (flag `tiebreakUnresolved` only when it decided a
paid place) → take the first `placeCount`. `orderWeekStandings(totals)` gives every scorer in order (for the
card's "You're 2nd"). This module is
pure (no Supabase). The resolver, the backfill script and the Rewards card all import it, so they can never
disagree. "Reached at" = the `answered_at` of the player's last point-scoring answer in the week, which is
the moment they reached their final total.

### 5c. Weekly resolver (Phase 2): `lib/liveTriviaRankedRewards.ts`

- Added to the existing `/api/cron/resolve-live-trivia-winners` route **after** `resolveGameWinnerRewards`,
  each in its own try/catch so one can't block the other. **No `vercel.json` change.**
- Load active `win_condition = 'ranked_places'` campaigns **directly** (filtered query; the partial index
  `idx_challenge_campaigns_ranked_places` exists since Phase 1), not through `listChallengeCampaigns()` and its 200-row cap.
- For each campaign, find the most recent **ended** weeks (lookback: 2 cycles, so a missed run self-heals):
  a week is due once `now` ≥ the end of the last pinned game in it (enumerate with
  `enumerateScheduleOccurrences`, honor `gameWinnerSlots` via `occurrenceMatchesSlots`). It must also have
  started after the reward was created (§2 default).
- **Settlements first:** one read of `challenge_cycle_settlements` for the due `(challenge_id, cycle_start)`
  keys. Skip settled weeks before touching any scores, which is what keeps the 5-minute cadence cheap.
- For an unsettled week: `loadLiveTriviaWeekTotals` → `rankWeekPlaces` (with the reward's `minPlayers`) →
  `awardRankedCyclePlaces` (`lib/challengeCampaigns.ts`, sends win notifications itself). A week with no
  scorers or below the minimum is **recorded** by the same call (empty places) and reported as `noScorers` /
  `belowMinimum`.
- **Created mid-week (D8):** a week is the reward's first live week if the reward's `created_at` is before
  the end of that week's last game. Earlier weeks are never settled by the resolver.
- **Game-winner minimum (D7):** `lib/liveTriviaWinnerRewards.ts` gets the same check — if the reward has
  `minPlayers` and the occurrence's participant count (rows in `loadOccurrenceFinalStandings`, scored or not)
  is below it, award nobody and log `[GameWinnerReward] below-minimum`. That sweep has no settlement row; its
  6h lookback re-checks the game a few times, which is cheap (one bounded read per game).
- `cycle_start` **must** equal `computeCycleStart(campaign, <any instant in the week>, tz)`. If the resolver
  computes its own key, re-sweeps mint a second set of prizes and the Rewards panel shows no winners (see the
  same trap in `lib/nflPickEmWinnerRewards.ts` header).
- Phase 2 must check whether any path changes `points_awarded` **after** a game ends (manual review, regrade).
  If one does, add a grace window before settling and record it. Settled weeks are final; corrections are a
  reviewed manual repair, never an automatic re-award.

### 5d. Creating a ranked reward (Phase 3 server, Phase 6 wizard)

- `RewardDefinition` gains `supportsRankedPlaces: boolean` (true only for `live_trivia_challenge`) plus
  description templates: `rankedPlacesWeekly`, e.g. "Finish top 3 in Live Trivia across Wednesday, Thursday
  and Friday nights each week. 1st wins a $30 gift card, 2nd a $20 gift card, 3rd a $10 gift card", and
  `wonRankedPlace`, e.g. "You finished 1st in Live Trivia the week of Oct 7". Fine print: "Ties go to whoever
  reached their score first."
- `createReward` accepts `winCondition: "ranked_places"` + `placePrizes` (1–3) and optional `minPlayers`
  (2–100; also accepted for `game_winner` Live Trivia rewards; refused for points targets and NFL). The
  reward must be for exactly one venue (settlements are keyed per reward, not per venue). The cadence is forced to `weekly`,
  `activeDays` come from the schedule's nights (or the pinned slots) through the existing `deriveRewardTerms`,
  and `winnerQuota` = place count. It refuses with clear copy when the venue's Live Trivia isn't weekly.
- Both hosts of `components/rewards/CreateRewardWizard.tsx` (admin + owner, **one component**,
  `variant` prop) get: "How do guests win?" → new option **"Top players this week (1st, 2nd, 3rd)"** → "How
  many places?" (1–3) → a prize step **per place**, reusing the existing prize step, with a "Same as 1st place"
  shortcut → **"Minimum players?"** (off by default; a number stepper 2–100; also shown for "Win the game")
  → Confirm shows the ladder and the minimum. Step ids live in `lib/rewardWizardSteps.ts`. Follow the `?step=`
  mirroring, `DiscardGuard` and the light/dark tone rules in CLAUDE.md. The admin snapshot tests must stay
  unchanged for the existing paths.

### 5e. Where it shows (Phase 4)

- **Venue Rewards panel** (`components/venue/VenueChallengesPanel.tsx` / `components/rewards/VenueChallengesPanel.tsx`
  and the hub data in `components/venue/venueHubShared.tsx`): a card with the prize ladder, the nights, and
  "You're 2nd with 140 pts. Friday's game decides it." The player's own rank comes from
  `live_trivia_week_totals` + `rankWeekPlaces`. Once settled, it shows "Your $20 gift card is in Redeem Prizes"
  or the week's winners.
- **Prize wallet** (`components/prizes/PrizeWalletPanel.tsx`): show "1st place" from the coupon's `place`.
  Backfilled coupons pick this up automatically because it's read from the snapshot.
- **Partner/admin lists** (`lib/ownerRewardDisplay.ts`, `components/admin/sections/ChallengesSection.tsx`
  cycle-winners panel): show the ladder and, per settled week, the winners by place.
- Text-size floor (12px), `text-caption`/`text-footnote` inside games, no inline styles.

### 5f. Past winners for partners (Phase 8, D9) — AS BUILT 2026-10-14

- **Menu row** "Game Results" (hint "Games & rewards history", Lucide `Trophy`) in
  `components/owner/menu/ownerMenuItems.ts`, after Order Join Merch (pinned in `tests/owner-menu-contract.test.ts`).
  It opens a URL-mirrored dark `OwnerSheet` `?sheet=history[&step=game|reward]`
  (`components/owner/history/GameResultsSheet.tsx`), hosted by the dashboard page (`HistorySheetHost`, keyed by
  venue) so it opens while venues load. Which game/reward is open lives in memory: a reload on a detail step
  corrects back to the list (`nav.correctStep`).
- **List**, two tabs, newest first, 20 per page with "Show more": **Live Trivia games** (date, schedule name, player
  count, winner(s) + points; "Playing now" names nobody) and **Rewards** (every reward that ever paid or settled a
  week **at this venue**: name, how it's won, latest cycle + its winners). The Rewards tab loads only when chosen.
- **Detail**: a game → final standings (scorers only, competition-ranked, top 10 + ties); a reward → its newest
  52 cycles with winners by place, prize, Redeemed / Not redeemed yet (unknown for a deleted player), and why a
  week paid nobody (`challenge_cycle_settlements`, shared wording `lib/rankedWeekHistory.ts`). Usernames only.
- **Server** (`lib/ownerHistory.ts`, display shapes + pure rules `lib/ownerHistoryDisplay.ts`, gate
  `lib/ownerHistoryRoute.ts` `withOwnerVenue` = `requireOwnerAuth` + venue in `auth.venueIds` BEFORE any read):
  `GET /api/owner/history?venueId&kind=games|rewards&before`, `GET /api/owner/history/games/[scheduleId]?venueId&date`,
  `GET /api/owner/history/rewards/[rewardId]?venueId`. 401/400/403/404, 503 while an RPC is missing.
- **Migration** `20261014213000_owner_past_winners_summaries.sql` (renamed from `…013000` so it sorts after
  Speed Trivia's `20261014020000`): `live_trivia_occurrence_summaries(p_schedule_ids, p_before date, p_limit)`
  (index walk on `idx_lsa_occurrence`, a page never splits a date) and
  `challenge_reward_history_summaries(p_venue_id, p_before_at, p_before_id, p_limit)` (rewards found from the
  venue's own ledger + settlements, keyset-paged in SQL, returns `p_limit + 1` rows) + index
  `idx_challenge_cycle_winners_venue`. service_role only. PGlite: `npm run test:owner-history-sql`.
- **Cost:** only on demand, no cron, no polling. A list page = 3 bounded reads; a detail = 3–5.
- **Out of scope:** Category Blitz (D12), editing or re-awarding anything from this screen, CSV export.

## 6. Cost estimate (CLAUDE.md "cost-conscious engineering")

- **Resolver:** it runs inside an existing 5-minute cron, so no new invocations. Each run adds 1 indexed query
  for ranked campaigns, plus 1 settlements read per campaign with a due week. Scores are read **once per reward per
  week** (one aggregate RPC returning ≤ players rows). At 1 reward that's ~576 tiny reads/day; at 100 ranked
  rewards it's still ≤ ~29k tiny reads/day, mostly skipped by the ledger-first check.
- **Rewards card:** 1 aggregate RPC per panel load at venues with an active ranked reward. Cache per
  instance for 60s keyed by `(campaignId, cycleStart)` (same pattern as `ReadCacheEntry` in `lib/rewards.ts`).
  Garden State Bar traffic is single digits per night. If a venue had 100 players × 3 nights × 70 answers,
  one call scans ~21k indexed rows and returns ~100 rows. That's acceptable with the cache. Don't ship it
  uncached.
- **Backfill:** one-off, ~8 weeks × 1 RPC. Negligible.
- No new external API spend. Phase 7 compares actual Vercel/Supabase usage against this estimate.

## 7. Phases

Every phase: read this file + the previous handoff, follow CLAUDE.md (no `any`, `@/` imports, Tailwind only,
`.env.local` append-only, never edit an existing migration), run `npx tsc --noEmit`, `npm run lint`,
`npm run test` (not typecheck and build at the same time), and finish with the handoff note required by the
global CLAUDE.md. **Never run `supabase db push` without Andrew's explicit go-ahead.**

### Phase 1: Data model, atomic award RPC, ranking rules — DONE 2026-10-14
**Model: Claude Opus 5.5 · Effort: high** (money-moving SQL under concurrency)
- As built: §5a and §5b. Handoff: `docs/live-trivia-weekly-places-reward-plan_PHASE_1_HANDOFF.md`.

### Phase 2: Weekly resolver in the existing cron — DONE 2026-10-14
**Model: Claude Opus 5.5 · Effort: high**
- **As built** (handoff `docs/live-trivia-weekly-places-reward-plan_PHASE_2_HANDOFF.md`):
  `resolveRankedPlaceRewards(nowMs)` + pure `planDueRankedWeeks` / `rankedRewardConfigError` in
  `lib/liveTriviaRankedRewards.ts`; reads via new `listActiveRankedPlaceCampaigns` / `listChallengeCycleSettlements`
  (`lib/challengeCampaigns.ts`) and `loadLiveTriviaSchedulesForVenues` (`lib/liveShowdownEngine.ts`); the cron
  route runs it after the game-winner sweep (each in its own try/catch; weekly report under `rankedPlaces`).
  Settlements are matched within ±12h of the key (`SETTLED_WEEK_MATCH_TOLERANCE_MS`) to absorb a key computed
  in the wrong timezone (`getVenueTimezone` silently falls back to New York on a read error).
- **Regrade question — answered: no grace window.** Nothing changes `live_showdown_answers.points_awarded` after a
  game's window ends: answers are graded on submit (`lib/liveShowdownSubmission.ts`), and closest-guess points are
  settled by live-state polls only while the game is active (`settleClosestGuessQuestion` via
  `getLiveShowdownState`). The only post-game writers are deletes (admin schedule reset/delete in
  `lib/liveShowdownAdmin.ts`; player account deletion).
- `lib/liveTriviaRankedRewards.ts` + wiring in `app/api/cron/resolve-live-trivia-winners/route.ts` (§5c).
  Report shape like `ResolveGameWinnerRewardsReport` (`weeksSettled`, `noScorers`, `belowMinimum`,
  `tiebreakUnresolved`, `errors`).
- The game-winner minimum-player check (§5c, D7) in `lib/liveTriviaWinnerRewards.ts`.
- Answer the post-game regrade question (§5c) and record it.
- Tests: week due only after the last pinned game ends; cycle key equals `computeCycleStart`; idempotent
  re-sweep; reward created mid-week settles that week (D8) but one created after the week's last game ended
  doesn't; below-minimum and no-scorer weeks are recorded once and never re-read; one failing campaign
  doesn't stop others; the game-winner sweep still runs if this one throws; game-winner minimum.
- Out of scope: UI; any Garden State Bar data.

### Phase 3: Server-side creation + reward copy — DONE 2026-10-14
**Model: Claude Opus 5.5 · Effort: medium** · As built: `docs/live-trivia-weekly-places-reward-plan_PHASE_3_HANDOFF.md`.
Player panels render a ranked reward as **text only** (no gauge, no quota line); the wallet reads a ranked coupon's
own prize snapshot. `terms_updated_at` trigger left as is (the win sentence reads only the coupon's place + week).
- §5d server half: registry fields, `createReward` + validation (each place prize through the existing prize
  validator, 1–3 places, weekly Live Trivia only), admin + owner API routes (`app/api/admin/route.ts`,
  `app/api/owner/rewards/route.ts`) accept and return `placePrizes`. Description and fine-print templates in
  `lib/rewardDescription.ts`. Notification copy.
- Until Phase 4 ships, the venue panel must **not** mis-render a ranked reward (e.g., as a points gauge).
  Either hide `ranked_places` on the player panel or render the description text only. Pick one and pin it
  with a test.
- Tests: create/refuse cases (incl. `minPlayers` range, refused on points targets and NFL, multi-venue
  refused), terms-sentence output.
- `terms_updated_at` trigger: Phase 1 decided **not** to stamp on `place_prizes`/`min_players`. The trigger
  tracks only what the coupon's "You won …" sentence reads; a ranked coupon reads its own `place` and prize
  snapshot, so editing the ladder or the minimum can't make an old coupon's sentence wrong. Revisit only if
  Phase 3's win sentence reads either column from the live reward.

### Phase 4: What players, partners and admins see — DONE 2026-10-14
**Model: Claude Sonnet 5.5 · Effort: high** · As built: `docs/live-trivia-weekly-places-reward-plan_PHASE_4_HANDOFF.md`.
- **Rewards card** (`components/venue/VenueChallengesPanel.tsx`): the route attaches `rankedPlaces`
  (`RankedPlaceCardState`, `lib/rankedPlaceCard.ts`; words from the pure `composeRankedCard`) built by
  `attachRankedPlaceCards` (`lib/rankedPlaceCardData.ts`). One cached "board" per reward per server instance
  (60 s live, 10 min once settled, never past its week); a player's own rank is a lookup. It reuses the
  resolver's own week/game planner (`planCurrentRankedWeek`, same file as `planDueRankedWeeks`) and
  `orderWeekStandings`, so the card's rank is the rank the resolver pays. States: no scores, ranked (and
  outside the places), not scored, games left / last game, minimum so far / reached, settled won, settled not
  won (winners by place), no scorers, below minimum, starts next week. A ranked card never says "All Claimed"
  and stays openable.
- **Wallet:** a coupon with a `place` and no reward sentence reads "1st place: {reward}"; the wallet list key is now
  the coupon's own id (a player with two weeks' coupons from one reward used to collide on the reward id).
- **Partner/admin lists:** `rewardTermsText` prints the ladder (+ minimum; game-winner terms also print a minimum);
  admin shows a Weekly Places badge, a ladder line, a per-week History (`lib/rankedWeekHistory.ts`, reused by
  Phase 8) with the reason a week had no winner, and "no points target" on edit. `GET /api/admin?resource=
  challenge-cycle-winners` now also returns `settlements`; `listChallengeCycleWinners` returns `place`.
- Not changed: the resolver's behavior, `createReward`, the Redeem Prizes "Active Rewards" list (text only), the
  reward Details popup (no new popup, so nothing added to `tests/native-back-review-fixes.test.ts`).

### Phase 5: Garden State Bar: create the reward and pay past weeks
**Model: Claude Opus 5.5 · Effort: high** (real money; needs Phases 1–4 **deployed**)
1. Create the reward for `venue-garden-state-bar` through `createReward` (admin route or a one-off
   `node --import tsx` script): Live Trivia, ranked places, weekly Wed/Thu/Fri (all games), places
   1 = $30 gift card, 2 = $20, 3 = $10. **As built (Andrew, 2026-10-14):** created as Garden State Bar's partner
   account (so it shows on their Partner Dashboard) with the default name "Live Trivia Challenge".
2. `scripts/backfill-ranked-reward.cjs --campaign <id> --from 2026-08-05 --expiry-days 30 [--apply]`
   (dry run by default). It imports `rankWeekPlaces` + `loadLiveTriviaWeekTotals` and calls
   `awardRankedCyclePlaces` (with `prizeExpiresAt` = now + 30 days) per week, with
   `cycle_start = computeCycleStart(...)`. It covers every completed week from `--from` up to the week
   **before** the reward's first live week (D8: the resolver owns the creation week, unless the reward was
   created after that week's last game ended, in which case the backfill covers it too). Add an `npm run` entry.
3. Show Andrew the dry-run table and compare it with §4 (expected $320 / 13 coupons; plus the Oct 14 week
   if the backfill owns it). Explain any difference. **Apply only after Andrew approves** (D11). Garden State
   Bar's reward has no minimum (D2) unless Andrew says otherwise.
4. Verify: 13 coupons in `challenge_campaign_redemptions` with `place` set, expiry ≈ issue date + 30 days,
   notifications created; a re-run of the script is a no-op.
5. Give Andrew a winners list (username, week, place, prize) to share with Garden State Bar so staff know
   what to honor. **We can't message these players outside the app.** Most have no email, so they see the
   coupon on their next visit.
6. If the reward is created during the Oct 14 week before Friday's game ends, the resolver settles that week
   on its own (D8). Otherwise run the script again after Friday's game for that week (idempotent).

### Phase 6: Create Reward wizard (admin + Partner Dashboard)
**Model: Claude Sonnet 5.5 · Effort: high**
- §5d wizard half in the one shared `CreateRewardWizard.tsx`. Pin the new steps in the wizard tests
  (`tests/components.create-reward-wizard.test.ts`) and keep the admin snapshots of existing paths unchanged.
  Run `npm run test` (owner-menu/dashboard contracts).
- Copy: ~~mid-week creation says "Starts next Wednesday"~~ — **replaced (D8 supersedes it):** the wizard says "Starts
  right away. Created mid-week, this week still counts … as long as this week's last game hasn't finished. If it has,
  it starts next week."
- Andrew: phone pass on the Partner Dashboard flow (`docs/reward-descriptions-device-checklist.md` §C).
- **As built:** `docs/live-trivia-weekly-places-reward-plan_PHASE_6_HANDOFF.md`. Minimum players and the per-place prize
  tabs live inside the existing Terms and Prize steps (no new step ids).

### Phase 8: Past winners on the Partner Dashboard (D9) — BUILT 2026-10-14 (not deployed)
**Model: Claude Sonnet 5.5 · Effort: high** · As built: §5f; handoff `…_PHASE_8_HANDOFF.md`.
- §5f. Can start any time after Phase 2 (it reads settlements); needs Phase 4's display helpers for the
  reward detail if they exist by then, otherwise build them here and let Phase 4 reuse them.
- Migration for `live_trivia_occurrence_summaries` (service_role only) + PGlite test; routes + owner-scope
  tests (a partner can't read another venue's history: 403); sheet + steps; menu row + contract tests;
  device-checklist section for Andrew.
- Deploy: **approved by Andrew 2026-10-14** (D11). Category Blitz is NOT included (D12).

### Phase 7: First live week, docs, cost check
**Model: Claude Sonnet 5.5 · Effort: medium**
- Watch Garden State Bar's first live week (the first full Wed–Fri after the reward was created): confirm it
  settles on the first sweep after Friday's game, with the right places and prizes, and nothing is
  double-awarded.
- Add a "Weekly places rewards" section to CLAUDE.md and AGENTS.md (one home for the ranking rules, the RPC is
  the only writer, settled weeks are final). Update `docs/rewards-system-plan.md` with a pointer.
- Compare actual usage with §6 and report differences.

## 8. Risks and traps

- **Double payout** is the main risk. It's prevented by the all-or-nothing RPC + ledger check, both under
  the shared advisory lock. Never award places one by one through `award_cycle_winner`.
- **Cycle-key drift** (§5c). Always use `computeCycleStart`.
- **Timezone:** `occurrence_date` is already local (venue tz). Never convert it again (see the note in
  `weekdayForOccurrenceDate`).
- **Dev shares the production DB.** Don't create test rewards for real venues from a dev server. Use
  `venue-hightop-test` (hidden) for any live smoke test.
- The 6h `ENDED_OCCURRENCE_LOOKBACK_MS` belongs to the game-winner sweep. The ranked sweep has its own
  2-cycle lookback. Don't widen the shared constant.

## 9. Open items for Andrew

Answered 2026-10-14: Garden State Bar honors the backfill (D11); defaults kept (D10); mid-week start (D8);
**backfill starts Aug 5 (D6)**; **Category Blitz is not in Game Results (D12)**; **Phase 8 may be deployed (D11)**;
**single-game venues get the option (D13)**.

Still open: pushing Phases 6 + 8 and applying the Phase 8 migration (Phase 8 handoff §7), and the phone checks
(`docs/reward-descriptions-device-checklist.md` §B, §C, §D).
