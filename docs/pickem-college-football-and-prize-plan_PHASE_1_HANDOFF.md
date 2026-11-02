# Pick 'Em plan: Phase 1 handoff (simpler scoring, automatic points)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 1 built 2026-10-31.

## For Andrew (plain English)

**What changed**
- Pick 'Em has no daily limit and no double/triple bonus. Every correct pick is worth 10 points.
- The "Collect points" step is gone. Points are added to the player's score automatically, a
  minute or so after the game ends.
- **NFL Pick 'Em is included, as you decided.** Before this change, NFL players only got their
  points if they also opened regular Pick 'Em and collected there. Now NFL picks are paid
  automatically too, 10 each.
- The Pick 'Em screen lost the "Pick Tracker" bar. In its place is one grey line: "Today: 7 right ·
  +70 points" (or "Every correct pick is worth 10 points, added automatically." before any picks).
  If a game ends while the screen is open, a small "+10 points" badge appears.
- The game card rules and the tutorial no longer mention 10 picks, double or triple.

**Superseded in Phase 2 (Andrew D12): the old backlog below is cancelled at 0 points, not paid; see the Phase 2 handoff.**
**Uncollected points (measured 2026-10-31):** 48 correct picks that were never collected, worth
**480 points**, held by 12 players at 5 bars (20 NBA, 17 NFL, 11 MLB). They get paid once, the first
minute after this goes live. Most are 1 to 3 months old. Old picks add points to the player's
score but do not count toward a bar's points-target Prize, so they can't hand anyone a free
prize today.

**Is it live?** No. Nothing is committed, pushed or deployed, and the database change (migration)
is not applied. `main` is frozen for App Store review.

**What needs you, after App Store approval:**
1. Apply the migration `supabase/migrations/20261031182914_pickem_automatic_points.sql`
   (`supabase db push`) **before or together with** deploying this code. If the code goes out
   first, no points are paid until the migration is applied. Nothing is lost: everything owed
   is paid the first minute after it's applied. But points-target Prize progress is skipped for
   picks graded more than 6 hours earlier.
2. Do a quick phone check (no checklist yet; Phase 7 writes one): open Pick 'Em, make more than
   10 picks, and after a game ends, see the points arrive without tapping anything.

## For the next agent (Phase 2: College Football in Pick 'Em)

### 1. Goal and scope of Phase 2
Plan §7 "Phase 2": add College Football (FBS, pick the winner) to regular Pick 'Em: provider map
entry `americanfootball_ncaaf` → `/ncaaf/v1/games`, a `PICKEM_SPORTS` entry (slug `ncaaf`), shape
normalisation from a captured real-Saturday fixture, the FBS filter in one named function
(at least one FBS team; conference ids from `/ncaaf/v1/conferences`, never hard-coded from memory),
grading through the existing outright path, and the NFL signpost card. **Out of scope:**
spreads (Phase 3), any Prize work (Phases 4–6), changes to Phase 1's payment.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated Category Blitz work). **Phase 1 is
  uncommitted** in the working tree (Andrew hasn't asked for a commit). `docs/pickem-college-football-and-prize-plan.md`
  was already untracked before this phase.
- Nothing pushed, nothing deployed, the migration is **not applied** (main frozen during App Store
  review: never push `main`, never `supabase db push`, never change Production env until Andrew
  confirms approval).
- No production data was changed. The only production access was the read-only
  `npm run pickem:unpaid-report` (results above).

### 3. Decisions already made (don't re-ask)
- D1/D2 (plan §2): no cap, no bonus, no Collect; 10 per correct pick paid automatically.
- **D10 (2026-10-31): NFL Pick 'Em loses its bonus too.** Every correct pick in `pickem_picks`, NFL
  included, is paid a flat 10. NFL spread/standard *grading* is unchanged.
- **D11:** paying the uncollected backlog once is approved. The plan's §4 defaults are approved as
  written (FBS = at least one FBS team; "out of N" is a ceiling; tiebreaker = last game in the prize's
  leagues in the window; prize days follow the venue's time zone).
- Choices made in Phase 1 without asking (reasoned below, Andrew can override):
  - Points-target prizes with game type `pickem` still get 10 per correct **regular** pick, at
    payment time (same as when the player collected). **NFL picks no longer feed `pickem` prizes:**
    they already feed `nfl-pickem` prizes through `lib/nflPickEmRewardAccrual.ts`. Before Phase 1, an
    NFL pick collected through regular Pick 'Em fed both prizes, so one pick counted twice.
  - Picks graded more than 6 h before payment (`PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS`) are paid points
    but add no prize progress. This keeps the backlog from crediting today's prize cycles.
  - The old `claim_pickem_points` RPC stays installed, but the migration revokes it from
    `anon`/`authenticated`: with the public key, anyone could still have applied the retired bonus
    in the minute before automatic payment.
  - `POST /api/pickem/picks` `action: "claim_points" | "claim"` now returns
    `{ ok: true, result: { claimed: false, pointsAwarded: 0, automatic: true } }` for tabs opened
    before the release.

### 4. Files created or changed
- **`supabase/migrations/20261031182914_pickem_automatic_points.sql`** (new, NOT applied):
  `pay_pickem_points(p_user_id uuid default null, p_limit int default 500)`, `language sql`,
  security definer, service_role only. A single statement: lock the candidates (won, `reward_claimed_at is null`,
  oldest `resolved_at` first, `for update skip locked`, limit clamped 1..1000), stamp
  `reward_claimed_at = now(), reward_points = 10` (re-checking the null), add `10 × picks` per user to
  `users.points`, and return one row per paid pick. Also revokes `claim_pickem_points` from public/anon/authenticated.
- **`lib/pickemPoints.ts`** (new, leaf): `payPickEmPoints({ userId? })` is the ONLY caller of the RPC.
  It never throws, and it logs `[PickEmPoints] pay_pickem_points-missing` once per instance when the
  migration is missing. Also `pickEmPrizeAccrualGroups` (pure: drops NFL and old picks, groups per user
  and venue) and the constants `PICKEM_POINTS_PER_CORRECT_PICK = 10`, `PICKEM_PAYOUT_BATCH = 500` and
  `PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS = 6 h`.
- **`lib/pickem.ts`**: removed `PICKEM_DAILY_PICK_LIMIT` (and the count query in `submitPickEmPick`),
  `getPickEmRoundMultiplier`, the points-bank summary (and its `pickem_daily_snapshots` upsert on every
  games load), `claimPickEmPoints` and `claimPickEmReward`. Added `getPickEmTodaySummary` (one read,
  regular sports only, no writes; returned as `today` from `listPickEmGames`). `settlePendingPickEmPicks` now
  calls `payPickEmPoints({ userId })` after grading, **including the early return when nothing is pending**,
  and returns `payout`. Grading logic is otherwise unchanged.
- **`app/api/pickem/picks/route.ts`**: claim actions are a no-op (above).
- **`components/pickem/PickEmGameList.tsx`**: removed the tracker, cap checks, the count/limit pop-ups,
  the double/triple pop, auto-collect and the per-load `loadDailyPickCount` fetch. Added the muted "Today"
  line (today's date only), `newlyWonPointsOf` (exported, pure), and the "+N points" badge, which fires
  only on a background refresh of the same list and dispatches `tp:points-updated` (`source: "pickem-graded"`)
  so the header catches up.
- Deleted `components/pickem/PointsBank.tsx` (already unused) and `components/animations/PickEmCollectAnimation.tsx`.
- **`lib/venueGameCards.ts`**: Pick 'Em rules and tutorial copy.
- `scripts/pickem-unpaid-points-report.cjs` (`npm run pickem:unpaid-report`, read-only production report)
  and `scripts/test-pickem-points-sql.cjs` (`npm run test:pickem-points-sql`, PGlite).
- Tests: new `tests/lib.pickem-points.test.ts` and `tests/pickem-automatic-points-contract.test.ts`. Extended
  `tests/lib.pickem-nfl-scoring-mode.test.ts` (settlement pays via the RPC on every path; a failed payment never
  fails grading) and `tests/pickem-today-win-points.test.ts`. `tests/lib.nfl-pickem-reward-accrual.test.ts`'s
  static tripwire now reads `lib/pickemPoints.ts` for the `pickem` accrual and pins the NFL skip.

### 5. Facts and traps
- **How NFL picks were paid before (the plan's open question):** never automatically. `claim_pickem_points`
  counted every pick of the local day at the venue, NFL included. So NFL wins were paid only when the player
  tapped Collect in *regular* Pick 'Em (and they also counted toward the 10-pick cap and the bonus). NFL-only
  players were never paid. Now every won pick is paid by `pay_pickem_points`.
- `settlePendingPickEmPicks` also runs per player, inside `GET /api/pickem/games` and `GET /api/pickem/picks`
  (refreshSettlement). The payment runs there too, scoped to that player. Concurrent payers are safe: `skip locked`
  plus the re-checked `reward_claimed_at is null`. A deadlock between two payers aborts one statement, which
  pays nothing and is retried next run.
- `pickem_picks.reward_points` defaults to **50** in the table (old migration). Inserts set 10 and the RPC writes 10.
- `users` here is the per-venue profile row (`users.id` = `pickem_picks.user_id`), so `users.points` is that venue's balance.
- `isMissingFunction` (`lib/supabaseRpcErrors.ts`) is reused for the missing-RPC log.
- `pickem_daily_snapshots` is now unused (left in place, no migration).
- The win notification ("X won. +10 pts.") is written at grading, unchanged. If the migration is missing,
  that message goes out before the points do.

### 6. Build / test / verification
- Commands: `npx tsc --noEmit` (clean), `npx eslint <changed files>` (clean), `npm run test`,
  `npm run build` (passes), `npm run test:pickem-points-sql` (passes), `npm run test:bingo-nfl`.
- `npm run lint` reports 309 errors, **all in `tmp/group-games-phase-4/`** (a git-ignored scratch copy, not
  touched here). The changed files lint clean.
- `npm run test`: 5,773 pass / 13 skipped / **4 fail**. All four are Prop Bingo star-index snapshot staleness
  tripwires (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`). They depend on the date, and Phase 1 didn't
  touch them; the same two NFL ones are the only failures in `npm run test:bingo-nfl` (292/294).
- Proven: pay-once, flat 10 (NFL included, no bonus), backlog drains oldest first, per-player scope, batch limit,
  grants (PGlite). TS side: RPC-only payment, NFL never fed to `pickem` prizes, old grades get no prize progress,
  and a payment failure never fails grading. NFL grading tests are unchanged and passing.
- **Unverified:** the screen in a real browser or phone (no browser pass was run: the DB is shared with
  production and the RPC isn't applied there); real concurrency against Postgres (PGlite is one connection);
  the RPC against the real schema (it will be when Andrew applies the migration).

### 7. Open questions for Andrew
None blocking Phase 2. He must apply the migration together with the deploy (above).

### 8. Recommended first steps for Phase 2 (Opus 5.5 · medium)
1. Read plan §4–§5 and §7 Phase 2. Capture a real `/ncaaf/v1/games?dates[]=<a Saturday>` response into a
   fixture (key via `node --env-file=.env.local`, never print it) and `/ncaaf/v1/conferences` for the FBS ids.
2. Add the sport (`lib/pickem.ts` `BDL_PATH_BY_SPORT_KEY`, `PICKEM_SPORTS`; `components/pickem/PickEmGameList.tsx`
   `SPORT_ICONS` and its `PickEmSportSlug` union; `pickem_picks_sport_slug_valid` CHECK needs a new migration
   for `ncaaf`, see `20260524113000_add_tennis_to_pickem_sport_slug_constraint.sql`).
3. Payment needs nothing new: college picks are `won` rows like any other and `pay_pickem_points` pays them.
