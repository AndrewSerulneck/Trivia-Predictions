# Pick 'Em plan: Phase 4b handoff (Pick 'Em Prize awards + tiebreaker)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 4b built 2026-10-31.

## For Andrew (plain English)

**What changed**
- **Pick 'Em Prizes can now be won.** Every minute, after Pick 'Em grades games, the server checks each bar's Pick 'Em
  Prizes and pays the winners a coupon:
  - **Get N right:** the moment a player has N correct picks in the prize's games, until the prizes run out.
  - **X out of N:** once a player's first N picks are all graded (or when the day/week ends), they get the **top tier
    they reached** — one prize per player per day/week. Only their first N picks count, in the order they made them.
  - **Most picks right:** after the day/week ends and its games are graded. Ties go to the tiebreaker guess (closest to
    the total points in the last game), then the earliest guess.
- **The tiebreaker exists on the server** (save a guess, locked when that game starts). Players can't see it yet: the
  Pick 'Em screen part is Phase 6.
- Your three answers are built in: "Get 25 right" can overlap an "out of 20" limit (allowed); a repeating prize created on
  a Saturday afternoon counts that Saturday; picks made earlier that day count toward the N.

**Is it live?** No. Nothing committed, pushed or deployed. Partners still can't create a Pick 'Em Prize (the wizard is
Phase 5), so nothing can pay until then anyway.

**Migrations (checked in production 2026-10-31):** `20261031182914`, `20261031185853` and `20261031191250` are applied
(you applied them). Not applied: `20261031200417` (4a) and the new **`20261031203914_pickem_prize_awards.sql`** (4b).
Both only ADD things the live site never touches, so applying them early is harmless; they must be applied before this
code is deployed. Order: `…200417`, then `…203914`.

**Cost:** while no bar has a Pick 'Em Prize, one small read a minute (the same read the plan promised). With prizes: two
more small reads a minute, plus a read of a period's picks only when one of its picks was just graded, right after it
ends, and every 10 minutes until it's settled. A tie adds one guesses read and one sports-data request. No new cron.

**One choice I made that you may want to change (question 1 below):** if a player reached the top tier but its prizes
are all gone, they get the next tier down that still has prizes, rather than nothing.

## For the next agent (Phase 5: Prize wizard)

### 1. Goal and scope
Plan §7 "Phase 5": the Pick 'Em steps in `components/rewards/CreateRewardWizard.tsx` (both hosts), a
`guardRewardWizardStep` rule, the partner notice about the pick limit, inline overlap refusals, and flipping
`isPickEmPrizeOffered()` (`lib/pickemPrizes.ts`) to true. Out of scope: player screens, the tiebreaker card and coupon
words (Phase 6), a Results standings adapter (plan §8 Q3).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1, 2, 3, 4a and 4b are all uncommitted** in the
  working tree (Andrew hasn't asked for a commit). Nothing pushed or deployed. `main` stays frozen for App Store review
  (never push `main`, never `supabase db push`, never change Production env until Andrew confirms approval).
- Production database (`supabase migration list`, 2026-10-31): `20261031182914`, `20261031185853`, `20261031191250`
  APPLIED by Andrew; `20261031200417` and `20261031203914` NOT applied. The live site (main, `7aacf153`) is compatible
  with the applied three: it still calls `claim_pickem_points` through the service role, which keeps its grant; the
  automatic-points backlog cancel (D12) already ran at apply time.
- No production data read or changed this phase (only the read-only `supabase migration list`).

### 3. Decisions already made (don't re-ask)
- Andrew, 2026-10-31, answering 4a's questions: (1) "Get N right" overlapping an "out of N" limit stays allowed; (2) a
  repeating prize created mid-period pays that period; (3) picks made before the prize existed count toward N.
- Chosen in 4b without asking (in code comments):
  - **Which periods:** begun, ending after `created_at`, looked at until 5 days after the end
    (`PICKEM_PRIZE_LOOKBACK_MS`). Final pass when the period has ended and no pick in its games is pending at the venue,
    or 3 days after the end (`PICKEM_PRIZE_SETTLE_GRACE_MS`; a still-pending pick then doesn't count).
  - **Tiers:** a player is paid once their first N (by `created_at`, then id) are graded, or at the final pass with what
    they have. Earliest finisher first. The RPC pays the highest tier reached **that still has a prize left** (falls down
    a tier when the top one is gone — open question 1). One prize per player per period at any tier (D4, in SQL).
  - **Get N right:** first come first served by when the N-th correct pick was graded; no first-N rule (no limit).
  - **Most right:** minimum players counts everyone with ≥ 1 pick in scope; ranked among players with ≥ `pickem_min_picks`;
    needs > 0 right. Tie order: closest guess → lower guess → guessers before non-guessers → earliest saved guess →
    user id. A tie waits for the guessed game's final score until the grace runs out, then ranks without it.
  - **Tiebreaker game:** last-starting game in the scope's score leagues on the period's last day with games (stepping back
    ≤ 7 days), ties by id. A guess stores its game (league, id, start); the sweep scores THAT game (latest one named if
    guesses differ). Guess range 0–400. Guesses lock at that game's start.
  - **Archiving a prize mid-period stops it** (the list read is active prizes only); a multi-venue prize is skipped and
    reported (createReward only makes single-venue ones).
  - **Settlement marker:** a new table `pickem_prize_settlements`, not `challenge_cycle_settlements` (that one caps
    `winner_count` at 3).
  - Tier wins leave `place` NULL on the ledger/coupon (place means "1st/2nd/3rd" elsewhere); the tier is the key's seconds
    (`pickemPrizeTierOfCycle`).

### 4. Files created or changed
- **`supabase/migrations/20261031203914_pickem_prize_awards.sql`** (new): table `pickem_prize_settlements` (PK challenge +
  period_start, outcome `awarded|no_winner|below_minimum`, shape check); table `pickem_prize_tiebreakers` (unique challenge +
  period_start + user; `sport_key`, `game_id`, `game_starts_at`, `predicted_total` 0–400; users/venues/campaign FKs all
  CASCADE); function `award_pickem_tier_prize(challenge, period_start, user, venue, correct, expires_at)` → `(status, tier)`,
  statuses `awarded|already_won|not_reached|exhausted`; partial index `idx_pickem_picks_resolved_at`. service_role-only
  grants, RLS forced. Lock: one per (prize, period) + each tier's `award_cycle_winner` key ascending.
- **`lib/pickemPrizeStandings.ts`** (new, pure): constants (grace, lookback, recent window, retry), `pickemPrizeCandidatePeriods`,
  `picksForPickEmPrizePeriod`, `isPickEmPrizeFinalPassReady`, `isPickEmPrizePeriodDue`, `pickemPrizeTierStandings`,
  `planPickEmTierAwards`, `planPickEmTargetAwards`, `planPickEmMostRight`, `rankPickEmPrizeTiebreak`.
- **`lib/pickemPrizeAwards.ts`** (new, server-only): `settlePickEmPrizes(now)` → `PickEmPrizeSweepReport`; never throws.
- **`lib/pickemPrizeTiebreaker.ts`** (new, server-only): `findPickEmPrizeTiebreakerGame`, `lastPickEmPrizeGame`,
  `pickemPrizeGameTotal`, `getPickEmPrizeGuess`, `listPickEmPrizeGuesses`, `savePickEmPrizeGuess` (the only writer of
  `pickem_prize_tiebreakers`), messages, 5-min per-instance game cache.
- **`lib/pickem.ts`**: new export `listPickEmProviderGames(sportKeys, fromIso, toIso)` (same ids + FBS filter as the list).
- **`lib/challengeCampaigns.ts`**: `listAllActivePickEmPrizeCampaigns()` (shares the query with the per-venue list, cap 500,
  logs `[PickEmPrize] active-list-capped`); `awardPickEmTierPrize()` (the RPC wrapper + best-effort notification).
- **`app/api/cron/pickem-settle/route.ts`**: runs `settlePickEmPrizes()` after grading; report key `pickemPrizes`.
- **`app/api/pickem/prize-tiebreaker/route.ts`** (new): GET `?venueId&campaignId` → `{ game, guess }` (own guess only);
  POST `{ venueId, campaignId, predictedTotal }` → session-bound (403 forged, 401 none), venue presence check, 404 when the
  prize isn't an active "most right" at the venue or doesn't run today, 409 after kickoff, 400 bad total. Today's period only.
- Tests: **`tests/lib.pickem-prize-awards.test.ts`** (23), **`tests/pickem-prize-tiebreaker.test.ts`** (8),
  **`tests/prize-sweep-ownership-contract.test.ts`** (now includes the Pick 'Em sweep and `awardPickEmTierPrize`),
  **`scripts/test-pickem-prize-awards-sql.cjs`** → `npm run test:pickem-prize-awards-sql` (PGlite).

### 5. Facts and traps
- The provider client (`lib/balldontlie.ts`) swallows failures and returns empty results, so "no tiebreaker game" can mean
  an outage. The sweep therefore scores the game the guesses name, and waits (inside the grace) when it has no final score.
- PostgREST timestamps come back as `+00:00` strings; compare with `Date.parse`, never string equality (done in the sweep).
- PostgREST returns at most 1,000 rows per request: the picks and winners reads page with `.range()`; a period over 20,000
  picks refuses to judge (logged error) rather than paying on part of the data.
- `award_cycle_winner` does not refuse a tier prize; only this sweep pays one, and the tier RPC takes the same tier keys'
  locks, so the two can't interleave. The ownership test pins that only `lib/pickemPrizeAwards.ts` calls
  `awardPickEmTierPrize`.
- Coupon text still says "Won from: Pick 'Em Challenge" until Phase 6 wires pickem terms into `attachRewardWinDescriptions`.
- The win notification for a tier says "You got N picks right and won a prize in "<name>"!".
- Partner Results shows tier wins as separate cycles (keys differ by seconds) through the generic "day row" rule.
- `npm run lint` still reports the pre-existing errors in git-ignored `tmp/group-games-phase-4/release/`; use `npx eslint <files>`.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean; `npm run build` passes (219 pages, new route
  `/api/pickem/prize-tiebreaker`).
- `npm run test`: 5,908 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as Phases 1–4a
  (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched.
- `npm run test:pickem-prize-awards-sql`, `test:pickem-prizes-sql`, `test:pickem-points-sql`, `test:pickem-lines-sql` pass.
- **Unverified:** nothing ran against the real database (4a/4b migrations not applied); true concurrency of the tier RPC
  (PGlite is single-connection — the lock design mirrors `award_ranked_cycle_places`); the provider's game ids for the
  tiebreaker lookup are exercised only with stand-ins.

### 7. Open questions for Andrew (defaults as built; none block Phase 5)
1. A player reaches the top tier but its prizes are all gone: give them the next tier down that still has prizes (built),
   or nothing?
2. A partner archives a prize in the middle of a day/week: that period pays nobody (built). OK?

### 8. Recommended first steps for Phase 5 (Opus 5.5 · medium)
1. Read `components/rewards/CreateRewardWizard.tsx`, `lib/rewardDefinitions.ts` (`pickem_challenge`, `calendar: "pickem_window"`),
   and `createPickEmReward` in `lib/rewards.ts` for the exact fields the server accepts.
2. Reuse the per-place prize UI for tier prizes; the server derives the win kind (`pickemPrizeWinKind`), never send it.
3. Flip `isPickEmPrizeOffered()` only in the same change that ships the steps; keep the admin snapshots unchanged.
