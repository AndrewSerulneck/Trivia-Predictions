# Pick 'Em plan: Phase 4a handoff (Pick 'Em Prize, data + rules, server only)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 4a built 2026-10-31.

## For Andrew (plain English)

**What changed**
- **The Pick 'Em Prize now exists on the server.** It can store which games count (whole sports like "all soccer",
  single leagues like EPL, or a mix; never NFL), when it runs (one day, every Saturday, each Monday–Sunday week, or a date
  range), and how it's won (most picks right, get N right, or "X out of N" with up to 3 tiers). All of it is judged in
  the bar's own time zone.
- **The server refuses bad setups**, with plain messages: a day that has passed, a range over 180 days, tiers that
  aren't rising or need more right answers than the picks allowed, "most picks right" on MMA/tennis only (no score for
  the tiebreaker), and so on.
- **The overlap rule (D6) is enforced.** A second "out of N" prize covering the same league on the same day is refused
  with the clashing prize named, e.g. "Your college football prize each Saturday already limits picks for some of these
  games on the same day." A "most right" prize can't require more picks than an overlapping limit gives.
- **The pick limit (D5) is enforced in Pick 'Em.** With an "out of 20" prize on, the 21st new pick in its games that day
  is refused: "This bar's prize counts your first 20 college football picks today, and you've already used all 20."
  Switching sides on a pick you already made never counts.
- **Partners can't create one yet.** The wizard doesn't show it until Phase 5 builds its screens, and nobody can win one
  until Phase 4b builds the awards.

**Is it live?** No. Nothing committed, pushed or deployed; no migration applied (`main` is frozen for App Store review).

**Cost:** nothing at all until a bar has a Pick 'Em Prize. When a player makes a new pick, the server reads the bar's
Pick 'Em Prizes at most once a minute per server; only if an "out of N" prize covers that game does it also count the
player's picks (one small indexed read). Creating a prize costs two small reads. No new scheduled job.

**What needs you, after App Store approval:** apply migration `20261031200417_pickem_prizes.sql` with the other three
(order: `20261031182914`, `20261031185853`, `20261031191250`, `20261031200417`). Three questions below (none blocking).

## For the next agent (Phase 4b: awards + tiebreaker)

### 1. Goal and scope
Plan §7 "Phase 4b": the award sweep `lib/pickemPrizeAwards.ts` at the end of `/api/cron/pickem-settle`, the tiebreaker
table + route, the ownership contract test. Out of scope: the wizard (5), player screens and coupon text (6), a Results
standings adapter (plan §8 Q3).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1, 2, 3 and 4a are all uncommitted** in the
  working tree (Andrew hasn't asked for a commit). Nothing pushed or deployed.
- Migrations NOT applied anywhere: `20261031182914`, `20261031185853`, `20261031191250`, `20261031200417` (new). Never
  `supabase db push` / push `main` / change Production env until Andrew confirms App Store approval.
- No production data read or changed this phase.

### 3. Decisions already made (don't re-ask)
Plan §2 D4–D8 and §4 apply. Chosen in 4a without asking (all in code comments):
- **A league is its provider sport key** (`soccer_epl`, `americanfootball_ncaaf`), not the label — stable, and stored on
  every pick as `pickem_picks.sport_key`. (The Phase 3 handoff suggested the label "College Football"; the key is safer.)
  A sport is its slug (`pickem_picks.sport_slug`) and covers later leagues automatically.
- **A pick belongs to the period containing its GAME's start, read in the venue's time zone.** Prize weeks run Mon–Sun.
- **Limits:** range ≤ 180 days; a day/range may start ≤ 365 days ahead and never in the past (venue's today); N and the
  minimum picks 1–100; "get N right" N ≤ 500; quantity 1–100 (tiers' total ≤ 100).
- **Win kind is derived, never sent:** `winCondition "game_winner"` = most right; `points_threshold` + tiers = X out of N;
  else get N right (`pickemPrizeWinKind`).
- **Storage mapping** (`createPickEmReward` in `lib/rewards.ts`): most right → `game_winner`, quota 1, threshold sentinel
  1, `pickem_min_picks`, optional `min_players`; get N right → `points_threshold`, threshold = N, quota = quantity; tiers →
  `points_threshold`, threshold = lowest tier, quota = sum of tier quantities, campaign prize columns NULL, each tier's prize
  in `pickem_tiers`. Calendar from `pickemPrizeCampaignCalendar` (day/range = one-off with start/end dates; weekday = weekly on
  that day; week = weekly, `mon` first), so `computeCycleStart` = `pickemPrizeCycleStart(period, 0)` (tested).
- **The pick limit fails OPEN** on any read error (logged `[PickEmPrize] limit-prizes-read-failed` / `limit-count-failed`),
  and two simultaneous picks can both pass at N−1. Safe ONLY because of the 4b contract below. Cancelled picks don't count.
  Picks made earlier in the period, even before the prize existed, do count toward N.
- **The overlap read fails CLOSED** at creation (`REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE`, 500). Two creates racing at once are
  not locked against each other (partner-only action; accepted).
- **D6 applies literally:** limit vs limit; most-right `min_picks` > an overlapping N. A "get N right" target above an
  overlapping limit is NOT refused (see open question 1).
- `isPickEmPrizeOffered()` returns `false` (wizard hidden); `createReward` still accepts the definition.

### 4. Files created or changed
- **`supabase/migrations/20261031200417_pickem_prizes.sql`** (new): `challenge_campaigns.pickem_scope jsonb`, `pickem_window
  jsonb`, `pickem_pick_limit smallint`, `pickem_tiers jsonb`, `pickem_min_picks smallint`; one NULL-safe check
  `challenge_campaigns_pickem_prize_check` (scope+window exactly on `pickem_challenge` rows; window kind; limit ⇔ tiers, 1–3
  tiers, on `points_threshold`; min picks only on `game_winner`); indexes `idx_challenge_campaigns_pickem_prizes` (partial) and
  `idx_pickem_picks_venue_starts_at (venue_id, starts_at)`. No table/view/sequence → no grants.
- **`lib/pickemSports.ts`** (new leaf): `PICKEM_SPORT_CATALOG` (slug, label, subtitle, phrase, `hasScores`, leagues
  `{sportKey,label}`), `pickEmSportBySlug`, `pickEmSportOfLeague`, `pickEmLeagueByKey`, `PickEmSportSlug`. `lib/pickem.ts` now
  builds `PICKEM_SPORTS` from it (identical list, pinned by `tests/lib.pickem-regular-sports.test.ts`, which also pins every
  league label = `getLeagueLabelForSportKey`, now exported).
- **`lib/pickemPrizes.ts`** (new leaf, client-safe): definition id, `isPickEmPrizeOffered`, limits + messages; scope
  (`normalizePickEmPrizeScope`, `pickemScopeCovers`, `pickemScopesOverlap`, `pickemScopeLeagueKeys`, `pickemScopeHasScoreGames`,
  `describePickEmPrizeScope`); window (`normalizePickEmPrizeWindow`, `validatePickEmPrizeWindow`, `pickemWindowCoversDate`,
  `pickemWindowsShareADay`, `describePickEmPrizeWindow`); periods (`pickemPrizePeriodForDate`, `pickemPrizePeriodAt`) and **THE
  cycle key** `pickemPrizeCycleStart(period, tier)` / `pickemPrizeTierOfCycle` / `pickemPrizeCycleDate`; `pickemPrizeCampaignCalendar`;
  `pickemPrizeWinKind`, `validatePickEmPrizeTerms`; `findPickEmPrizeConflict` (D6); `pickemPickLimitMessage`;
  `describePickEmPrizePeriodWon`. Uses `formatZonedDate` / `zonedDateTimeToUtcMs` from `lib/categoryBlitzScheduleTime.ts`.
- **`lib/pickemPrizeTiers.ts`** (new, client-safe, not a leaf): `normalizePickEmPrizeTiers` / `serializePickEmPrizeTiers`. A stored
  tier = a `place_prizes` element (`place` = tier 1–3, lowest first) + `correct` + `quantity`.
- **`lib/pickemPrizeLimit.ts`** (new, server-only): `checkPickEmPrizePickLimit({ userId, venueId, game })`,
  `PICKEM_PRIZE_LIMIT_CACHE_TTL_MS` (60 s per venue per instance), `clearPickEmPrizeLimitCache`.
- **`lib/pickem.ts`**: `submitPickEmPick` calls the limit only when there is no existing pick (after `resolvePickScoringMode`).
  The refusal message contains "already" → the picks route answers 400.
- **`lib/challengeCampaigns.ts`**: `isPointsAccrualExempt` — both accrual eligibility functions skip `pickem_challenge` (else
  every correct pick's 10 points would feed it). `createChallengeCampaign` writes the five columns only when set.
  New `PickEmPrizeTerms` type, `listActivePickEmPrizeCampaigns(venueId)` (throws on any error, skips unreadable rows with
  `[PickEmPrize] terms-unreadable`), `loadPickEmPrizeTerms(ids)` (never throws).
- **`lib/rewards.ts`**: `RewardConflictError` (409); `RewardPickEmContext` + creation-context branch (`pickem: { today, timezone }`);
  `CreateRewardParams.pickemScope/pickemWindow/pickemPickLimit/pickemTiers/pickemMinPicks`; `createPickEmReward`;
  `attachRewardDescriptions` loads pickem terms (one read, cached 10 min on the guest route) and attaches them to each campaign.
- **`lib/rewardDefinitions.ts`**: definition `pickem_challenge` ("Pick 'Em Challenge", glyph 🎯), `calendar: "pickem_window"`
  templates (`mostRight`, `target`, `tierOne`, `tierMany`, `tierLadderItem`, `wonMostRight`, `wonTarget`, `wonTier`).
- **`lib/rewardDescription.ts`**: `describePickEmReward` + the coupon line in `describeRewardWin`.
- **`types/index.ts`**: `PickEmPrizeSportSlug`, `PickEmPrizeScope`, `PickEmPrizeWindow`, `PickEmPrizeTier`; five optional
  `pickem*` fields on `ChallengeCampaign`.
- **Routes** `app/api/owner/rewards/route.ts`, `app/api/admin/route.ts` (resource `rewards`): pass the five fields; map
  `RewardConflictError` → 409.
- Tests: **`tests/lib.pickem-prizes.test.ts`** (53), **`scripts/test-pickem-prizes-sql.cjs`** → `npm run test:pickem-prizes-sql`
  (29 PGlite checks), + `tests/lib.pickem-regular-sports.test.ts` (catalog parity) and `tests/lib.pickem-college-spreads.test.ts`
  (new pick asks the limit; side switch doesn't; it now mocks `@/lib/pickemPrizeLimit`).

### 5. Facts and traps
- **`award_cycle_winner` mints the CAMPAIGN's prize** (copies `c.prize_*`). A tier prize's campaign prize columns are NULL, so
  4b needs a tier-aware award: a new RPC (new migration) that copies the tier's prize from `pickem_tiers` (match `place` =
  tier) exactly the way `award_ranked_cycle_places` copies a place from `place_prizes`. Keep quota per tier by cycle key
  (`pickemPrizeCycleStart(period, tier)`), and enforce D4 (one prize per player per period: no winner row for that user at
  any of the period's 4 keys) **in SQL under the same advisory lock**, since the tiers are different `cycle_start`s.
- **4b contract the fail-open limit relies on:** for "X out of N", count only a player's **first N in-scope picks of the
  period, ordered by `created_at`**. Never all of them.
- `award_cycle_winner` refuses only `ranked_places` campaigns; most right (`game_winner`) and get N right can use it as is.
- `listActivePickEmPrizeCampaigns` is per venue (`venue_ids @> [venue]`); the sweep needs every venue — add a list across
  venues (the partial index covers it).
- A repeating window's FIRST period can begin before the prize was created (`pickemPrizePeriodForDate` is shape-only). 4b
  must decide whether that first period pays (see open question 2).
- Generic code that reads a Pick 'Em Prize (venue panel progress, `computeCycleStart`) agrees on tier 0's key, but nothing
  generic writes its progress: the accrual skips it.
- Coupon text: `attachRewardWinDescriptions` doesn't load pickem terms yet → coupons say "Won from: Pick 'Em Challenge"
  until Phase 6 wires `describeRewardWin` (already supports it).
- No reward EDIT exists for partners. Admin `PATCH resource=challenge-campaigns` can re-activate an archived prize without
  re-running D6 (pre-existing generic path; noted, not changed).
- `npm run lint` still reports the pre-existing errors inside git-ignored `tmp/group-games-phase-4/release/`; use `npx eslint <files>`.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean; `npm run build` passes (218 pages).
- `npm run test`: 5,874 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as Phases 1–3
  (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched. `npm run test:pickem-prizes-sql` passes.
- **Unverified:** nothing ran against a real database (migration not applied; PGlite proves the SQL). The PostgREST
  `.or("sport_slug.in.(…),sport_key.in.(…)")` count and the `.contains("venue_ids", …)` filter are tested against stand-ins only.

### 7. Open questions for Andrew (defaults as built; none block 4b)
1. A "Get 25 right" prize overlapping an "out of 20" limit on the same games can't be won that day. Refuse it like D6 does for
   "most right"? (Built: allowed.)
2. A repeating prize created on a Saturday afternoon: does that Saturday count? (Suggested for 4b: yes, picks made that day count.)
3. Picks a player made earlier in the day, before an "out of N" prize was created, count toward their N. OK? (Built: yes.)

### 8. Recommended first steps for Phase 4b (Opus 5.5 · high)
1. Read this note §5, `lib/pickemPrizes.ts` (header + cycle key) and `lib/squaresPrizeAwards.ts` / `lib/bracketPrizeAwards.ts` for
   the sweep pattern; `lib/nflPickEmTiebreaker.ts` for the tiebreaker shape (never its NFL calendar).
2. Write the tier-award RPC migration first, with a PGlite proof (copy `scripts/test-pickem-prizes-sql.cjs`).
3. Add the sweep to the ownership contract test (`tests/prize-sweep-ownership-contract.test.ts`).
