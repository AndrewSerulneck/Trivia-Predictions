# Pick 'Em plan: Phase 7 handoff (review of Phases 1–6)

Plan: `docs/pickem-college-football-and-prize-plan.md` — findings in **§9**, fix sub-phases **7.1–7.6** under
"### Phase 7" in §7, new open questions **§8 Q4–Q5**. Phone checklist: `docs/pickem-college-football-and-prize-device-checklist.md`.
Review done 2026-11-01 (a first attempt on 2026-10-31 was cut off by rate limits before it saved anything).

## For Andrew (plain English)

**What happened:** I reviewed everything built in Phases 1–6 as one change. Nothing was changed in the code, nothing was
committed, pushed or deployed, and nothing was written to the database. The automated checks all pass (except the same
4 date-based Bingo checks that have failed since Phase 1).

**One serious problem, older than this plan but made worse by it (F1):** any player who knows how can write their own
Pick 'Em picks straight into the database using the public key every phone already has — for example, mark a lost pick
as won. Since Phase 1, a won pick pays 10 points automatically, and since Phase 4 it counts toward real Pick 'Em prizes.
The same hole lets a player change their own points on their profile (`users`), which has nothing to do with this plan
and needs your yes to fix (plan §8 Q4 — I recommend yes, soon). The app itself never writes these tables from the phone,
so closing the hole doesn't change anything players see. The fix is a small database change (7.1) that you apply; it
doesn't need the App Store freeze to end, but applying it is your call.

**Other things to fix before Phases 1–6 go live:**
- **F2:** the venue-home Prizes card gets Pick 'Em prizes wrong: it shows a "0 / 10 pts" bar that never moves, a tier
  winner never sees "You Won", and a one-day prize keeps saying "In Progress" forever. (The coupon in the prize wallet is
  right.) Fix 7.2.
- **F3:** if a college game is called off, the provider may report it as "finished 0–0", and spread picks would then be
  graded as wins or losses. Fix 7.3 cancels those picks instead.
- **F4:** picks whose game the provider can no longer find stay "pending" forever (4 NFL picks from July today). If 500
  ever pile up, grading stops for everyone. Fix 7.4 cancels any pick whose game started more than 8 days ago — that will
  cancel those 4 July picks (they were never going to pay).
- Small things (7.5) and a re-check of the fixes (7.6).

**Corrections you should know:**
- **All five database changes are already applied** (the plan said two weren't). Fine — they don't affect the live app.
- **Hightop Test Bar is not hidden** and has 48 player profiles. If you create a test prize there from the Partner
  Dashboard, those players get a "News from your bars" push. The checklist says to create test prizes from Admin instead.

**Is it live?** No. Phases 1–6 and this review are uncommitted on `after-app-review`. `main` stays frozen.

**What needs you:** (1) answer §8 Q4 (lock `users` too?) and, if you like, Q5 (TBA college kickoffs); (2) after 7.1 is
built, apply its database change; (3) the phone pass, once everything is deployed.

## For the next agent (Phase 7.1)

### 1. Goal and scope
**7.1 — lock players out of writing `pickem_picks` (finding F1).** New migration (via `supabase migration new`):
`revoke insert, update, delete, truncate on table public.pickem_picks from anon, authenticated;`, and
`drop policy if exists "Users can insert own pickem picks" on public.pickem_picks;` plus the same for
`"Users can update own pickem picks"` (both created in `supabase/migrations/20260427113000_add_pickem_tables.sql`).
Keep SELECT and the read policy "Users can read own pickem picks". Add a contract test (no migration newer than 7.1's
re-grants a write on `pickem_picks` to anon/authenticated; no file importing `@/lib/supabase` names `pickem_picks`), and
a PGlite proof that `authenticated` can't insert/update and `service_role` still can.
**7.1b (only if Andrew answers §8 Q4 yes):** the same for `public.users` in a SEPARATE migration file — policies
"Users can create own profiles" and "Users can update own profiles" (`20260214153000_initial_schema.sql`).
**Out of scope:** 7.2–7.5 (separate sub-phases, plan §7), any change to Phases 1–6 behaviour, applying migrations.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated Category Blitz). Phases 1–6 and the Phase 7 docs are all
  **uncommitted** (Andrew hasn't asked for a commit). Nothing pushed or deployed.
- `main` is frozen for App Store review: never push `main`, never `supabase db push`, never change Production env until
  Andrew confirms approval.
- **Production DB:** all five Pick 'Em migrations are applied (`20261031182914`, `185853`, `191250`, `200417`, `203914`;
  `supabase migration list`, 2026-11-01). Production still runs the OLD Pick 'Em code. No `pickem_challenge` campaign
  exists; `pickem_game_lines`, `pickem_prize_settlements`, `pickem_prize_tiebreakers` are empty. 135 picks all time.
- This review wrote nothing to production or to the provider. Reads only: row counts, column/table presence, public-key
  SELECT probes, three `/ncaaf/v1/games` requests.

### 3. Decisions already made (don't re-ask)
- Plan §2 D1–D14 and §4.
- Phase 7: the fixes are sub-phases 7.1–7.6 in plan order; no in-place patches. 7.1 first (security, independent of the
  code deploy). 7.3 and 7.4 both edit `settlePendingPickEmPicks` — do them one after the other.
- 7.4's expected effect (cancels the 4 NFL picks pending since 2026-07-30, 0 points) is stated in the plan; it is the
  correct outcome for picks that can never be graded. Report it in 7.4's handoff.
- F7 (TBA kickoffs) is a recommendation only (§8 Q5); build nothing for it unless Andrew says so.

### 4. Files changed in Phase 7 (docs only)
- `docs/pickem-college-football-and-prize-plan.md`: status line; "### Phase 7" now lists 7.1–7.6; §8 Q4–Q5; new **§9**
  (findings table F1–F10, what was checked and found sound, cost notes, the pre-deploy unpaid-report note).
- `docs/pickem-college-football-and-prize-device-checklist.md` (new): Andrew's phone pass, sections 1–9.
- `CLAUDE.md` (Pick 'Em section): heading says all five migrations applied; new Phase 7 bullet (F1 + "never add a
  browser write to `pickem_picks`"); 4a/4b bullets no longer say "NOT applied".
- This file.

### 5. Facts and traps
- **F1 evidence:** `20260923130841_explicit_api_grants_baseline.sql` lines 87–88 (`pickem_picks`) and 128–129 (`users`)
  grant ALL to anon/authenticated; a public-key SELECT on `pickem_picks`, `users`, `challenge_campaign_redemptions` is
  granted live (0 rows visible = RLS filtered). `challenge_cycle_winners` and `pickem_prize_tiebreakers` refuse the
  public key (42501). `challenge_campaign_redemptions` has RLS on and no policies (public key sees 0 of 28). The live
  policies themselves weren't read (`pg_policies` isn't exposed through the API); they come from the migration history,
  where nothing drops them. Players hold an `authenticated` JWT (`signInAnonymously`, `lib/auth.ts`); 195 of 265 `users`
  rows have `auth_id` (`app/api/join/profile/route.ts` line ~322 sets it).
- **The browser touches only `venues` and `live_player_stats`** through `@/lib/supabase` (no `.rpc`, no
  `postgres_changes`), so revoking writes on `pickem_picks`/`users` from anon/authenticated breaks nothing in the app.
  Re-run that grep before writing 7.1:
  `grep -rln '@/lib/supabase"' components app lib | xargs grep -hn '\.from("' | sort | uniq -c`.
- To re-check the grants after Andrew applies 7.1, a public-key SELECT still works (SELECT is kept); prove the write
  refusal in PGlite, never by writing to production. `scripts/test-pickem-lines-sql.cjs` already sets up the
  anon/authenticated/service_role roles — copy its harness.
- New tables/views/sequences need an explicit `service_role` grant (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`,
  enforced by `tests/supabase-migration-grants-contract.test.ts`). 7.1 creates none; a revoke-only migration passes it.
- **F2 mechanics** (for 7.2): `resolveCurrentCycleWinnersForSnapshot` reads one-off `points_threshold` campaigns at the
  epoch key (`new Date(0)`), recurring ones at `computeCycleStart`; the sweep writes `pickemPrizeCycleStart(period, 0..3)`.
  `computeCycleStart` itself matches tier 0 (one-off: start date midnight; weekly: the anchor day) — the epoch choice is in
  the snapshot. `RewardProgressGauge` prints "N / M pts". The guest route polls every 30 s per player.
- **F3 mechanics** (for 7.3): `isBallDontLieFinalStatus` (`lib/pickem.ts` ~line 640) reads `status`, `match_status`, `time`,
  `game.status`, `game_state`, `event.status` — not `status_state` — and accepts "canceled"/"cancelled". College fixtures
  have only `post|final`, `in|in_progress`, `pre|scheduled`. Not-started college games report 0–0.
- **F4 mechanics** (for 7.4): the pending read is `.eq("status","pending").lte("starts_at", now).order("starts_at").limit(500)`;
  a row with no score event hits `if (!scoreEvent) continue;` before any gate. `fetchScoresForSportKey` covers ±7 days.
- **TBA kickoffs (F7):** the provider sends `05:00:00Z` with `time "0:00"`, `status "pre"`, `status_state "scheduled"` —
  no TBA flag. 39 of 57 FBS games on 2026-11-21, 6 on 2026-11-07 (asked 2026-11-01). During EDT the same placeholder would
  presumably be 04:00Z (unverified).
- `npm run lint` still reports pre-existing errors in git-ignored `tmp/group-games-phase-4/release/`; lint changed files
  with `npx eslint <files>` (skip the two deleted files, `components/animations/PickEmCollectAnimation.tsx` and
  `components/pickem/PointsBank.tsx`, or eslint errors on the missing paths).
- Typecheck and build must not run at the same time (`.next/types`).
- `supabase migration list` works without `timeout` (not installed on this Mac); it takes ~20 s.

### 6. Build / test / verification
- At the review (2026-11-01): `npx tsc --noEmit` clean; `npx eslint` on all 59 changed files clean; `npm run build`
  passes; `npm run test` 5,956 pass / 13 skipped / 4 fail (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`, the
  same date-based tripwires since Phase 1); `npm run test:pickem-points-sql`, `test:pickem-lines-sql`,
  `test:pickem-prizes-sql`, `test:pickem-prize-awards-sql` all pass.
- 7.1 must re-run all of those plus its own PGlite proof.
- **Unverified:** the live RLS policy list (see §5); how the provider marks a cancelled/postponed college game; true
  concurrency of the RPCs (PGlite is one connection); everything on a real phone (checklist).

### 7. Open questions for Andrew
- **§8 Q4:** lock `users` writes too (7.1b)? Recommended yes, soon. Blocks only 7.1b.
- **§8 Q5:** TBA college kickoffs as "Time TBA", not pickable? Default no change.
- Still open from before: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings in Partner Results; default no).

### 8. Recommended first steps for 7.1 (Opus 5.5 · high)
1. Read plan §9 F1 and the 7.1 bullet in §7. Re-run the browser-table grep in §5 above.
2. `supabase migration new pickem_picks_server_only_writes`; write the revoke + two `drop policy` lines with a header
   comment (why, what stays, that it is independent of the code deploy, and that applying is Andrew's call).
3. Add the contract test and the PGlite proof (copy `scripts/test-pickem-lines-sql.cjs`'s role setup; add an
   `npm run` script). Run the full gate list in §6.
4. If Andrew has said yes to Q4, do 7.1b as a separate migration with its own proof.
5. Write `docs/pickem-college-football-and-prize-plan_PHASE_7.1_HANDOFF.md` and update the plan's status line.
