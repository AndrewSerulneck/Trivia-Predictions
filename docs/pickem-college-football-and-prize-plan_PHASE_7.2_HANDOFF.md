# Pick 'Em plan: Phase 7.2 handoff (the venue Prizes card tells the truth about Pick 'Em Prizes)

Plan: `docs/pickem-college-football-and-prize-plan.md` — finding **F2** in §9, the 7.2 and new 7.1c bullets under
"### Phase 7" in §7, §8 Q6 (answered). Previous handoff: `docs/pickem-college-football-and-prize-plan_PHASE_7.1_HANDOFF.md`.
Built 2026-11-01.

## For Andrew (plain English)

**What changed:** the Prizes list on a bar's home screen now shows Pick 'Em Prizes correctly:
- No more "0 / 10 pts" bar that never moved. A Pick 'Em Prize says "Make your picks in Pick 'Em." instead.
- A player who wins a prize tier ("X out of N") now sees **You Won**, and **All Claimed** shows once every prize is gone.
- A one-day or date-range prize now shows its winners (before, it never did).
- A prize for a future day says **Upcoming** with the date. A "every Saturday" prize says Upcoming (next Saturday) on the
  days in between, and still shows last Saturday's winners until then.
- A one-day or date-range prize says **Ended** once it's finished, and it also moves to "Ended" in your partners'
  dashboard list (before, it stayed "active" forever). Archived Pick 'Em Prizes also say Ended.

The prize coupon in the wallet was already right; this only fixes the list. Nothing extra is asked of the database when
players' phones refresh the list every 30 seconds.

**Is it live?** No. Code only, no database change. Still uncommitted on `after-app-review` with Phases 1–7.1, and nothing
ships while `main` is frozen.

**Your Q6 answer (yes)** is recorded: the `settle_prediction_market` lockdown is now sub-phase **7.1c**, the next thing to build.

**Confirmed:** your two 7.1 migrations are applied (`supabase migration list`, 2026-11-01).

**Needs you:** nothing for 7.2. The phone pass at the end will cover how the cards look.

## For the next agent

### 1. Next phase goal and scope
**Next: Phase 7.1c — revoke EXECUTE on `settle_prediction_market` (+ the two analytics functions) from players (F11).
Opus 5.5 · high.** Andrew said yes (§8 Q6, 2026-11-01). Exact scope, files and traps: `…_PHASE_7.1_HANDOFF.md` §1 ("If
Andrew answers §8 Q6 yes…") and §5. Its own handoff `…_PHASE_7.1c_HANDOFF.md`. Then 7.3 (F3), 7.4 (F4), 7.5, 7.6.
Out of scope for 7.1c: everything Pick 'Em; any write to production (Andrew applies the migration).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). Phases 1–6, the Phase 7 docs, 7.1/7.1b and this phase are
  all **uncommitted** (Andrew hasn't asked for a commit). Nothing pushed or deployed. `main` frozen for App Store review.
- **Production DB:** all seven Pick 'Em migrations applied (`20261031182914`, `…185853`, `…191250`, `…200417`, `…203914`,
  `20261101150024`, `20261101150026` — `supabase migration list` 2026-11-01). Nothing written by this phase. No Pick 'Em
  Prize exists in production yet (0 as of the Phase 7 review), so the sweep's new "end" step has nothing to do today.

### 3. Decisions made in 7.2 (and why)
- **No settlements read on the poll.** The plan said the card stops "In Progress" once the last period is settled
  (`pickem_prize_settlements`). Instead of reading that table on every 30-second poll, the sweep ends a one-day/range prize
  (`is_active = false`) on the run after its only period is settled. Same truth, zero extra requests, and it also fixes the
  partner list (`splitCompetitions` / `RewardStepScreens` already treat `!isActive` as Ended). Fallback when the sweep never
  settled it (outage past `PICKEM_PRIZE_LOOKBACK_MS` = 5 days after the period): the card reads Ended anyway (`pastLookback`);
  the partner list would then still say active — accepted edge.
- **The end step is self-healing and separate from payment:** it runs from the "drop settled periods" step, for every
  candidate one-off period already in the settled set, so a failed write is retried next minute. Repeating windows
  (weekday/week) never end on their own.
- **Terms come from the snapshot's own campaign read** (`listChallengeCampaigns({ withPickEmTerms: true })` adds
  `PICKEM_PRIZE_COLUMNS` to the same select — the plan's second option). `attachRewardDescriptions` then skips its own terms
  read for those campaigns (it only reads campaigns without `pickemScope`), so the guest route makes one FEWER request when a
  Pick 'Em Prize is listed. Missing columns → one retry without them (`[PickEmPrize] terms-columns-missing`).
- **Keys:** the shown period's tier 0–3 keys (`pickemPrizeCycleStart`), added to the existing batched
  `challenge_cycle_winners` `.in("cycle_start", …)` read. Pick 'Em "most right" (game_winner) no longer goes through the
  per-campaign game-winner path. Terms unreadable → keys from `computeCycleStart` (equal to tier 0 by the tested invariant in
  `tests/lib.pickem-prizes.test.ts`), no upcoming/ended state beyond `!isActive`.
- **A weekday prize between its days** shows the last counted day's winners (so "You Won" / "All Claimed" persist) and
  "Upcoming" with the next day. A prize created after its last day shows Upcoming with nothing won. The plan only named
  "before its first period"; this is the same rule applied between periods (nothing can be earned on a Tuesday for a
  Saturday prize). Weekly (Mon–Sun) prizes always have a running period.
- **After a one-off's day, before it's settled** (late games still grading): "In Progress", as the plan says.
- Card copy (inline in the panel, like its other lines): "Make your picks in Pick 'Em.", chip "Ended", body "Congrats to
  {names}." or "This prize has ended." An ended card is not tappable (same as All Claimed). The detail modal hides the gauge
  for Pick 'Em Prizes too.

### 4. Files changed
- `lib/pickemPrizeStandings.ts`: new pure `pickemPrizeCardPeriod(window, createdAt, nowMs, timeZone)` →
  `{ shown, nextStartDate, pastLookback }` + type `PickEmPrizeCardPeriod`. Same "counts if it ends after creation" rule as
  `pickemPrizeCandidatePeriods`; unreadable `created_at` counts every period.
- `lib/challengeCampaigns.ts`:
  - `listChallengeCampaigns` option `withPickEmTerms` (query built by `readCampaigns(columns)`; retry on missing column;
    attaches `mapPickEmPrizeTerms` to Pick 'Em rows only).
  - `resolveCurrentCycleWinnersForSnapshot` takes `pickemKeysById`; targets are now a `Set<number>` per campaign.
  - New `pickemPrizeSnapshotState` + `getChallengeCampaignSnapshotForUser` adds `upcomingStartDate` / `prizeEnded` to Pick 'Em
    cards (return type widened). `attachLeaderboardSnapshotsToCampaigns` is now generic (`<T>`), behaviour unchanged.
  - New `endPickEmPrize(campaignId)` (conditional update: id + `reward_definition_id = 'pickem_challenge'` + `is_active`).
- `lib/pickemPrizeAwards.ts`: ends settled one-off prizes (`report.ended`, log `[PickEmPrize] prize-ended`); header updated.
- `components/venue/VenueChallengesPanel.tsx`: `isEnded`, `isPickEmPrize`, "Ended" chip/body, Pick 'Em text line instead of
  the gauge. `components/venue/venueHubShared.tsx`: `prizeEnded?` on `ChallengeCampaignCard`.
  `components/venue/VenueHubClient.tsx`: modal `showGauge` false for Pick 'Em Prizes.
- Tests: `tests/lib.rewards-cycle-snapshot.test.ts` (11 new, "Pick 'Em Prizes (Phase 7.2)"),
  `tests/lib.pickem-prize-awards.test.ts` (3 new end-step tests; `endPickEmPrize` mocked; empty report has `ended: 0`).
- Docs: plan status line, 7.2 bullet (built), new 7.1c bullet, §8 Q6 answer, F2 row; `CLAUDE.md` Pick 'Em Phase 7 bullet.

### 5. Facts and traps
- The snapshot's fake Supabase in `tests/lib.rewards-cycle-snapshot.test.ts` matches `.in("cycle_start", …)` by STRING, so
  test rows must use `toISOString()` form ("…Z"). Real PostgREST matches by instant.
- I verified the new snapshot tests fail on the old behaviour (7 of 11 fail with `pickemKeysById` emptied), then restored.
- `isMissingColumn(error, "pickem_")` relies on the 42703 message naming the column; the fake does the same.
- Typecheck and build must not run at the same time (`.next/types`). `npm run lint` has pre-existing errors in git-ignored
  `tmp/`; lint changed files with `npx eslint <files>`.

### 6. Verification (2026-11-01)
- `npx tsc --noEmit` clean; `npx eslint` clean on the 8 changed files; `npm run build` passes.
- `npm run test`: 5,978 pass / 13 skipped / **4 fail** — the same four date-based Prop Bingo star-index tripwires as every
  phase since 1.
- No SQL changed, so the PGlite proofs weren't re-run.
- **Unverified:** how the cards look on a phone (phone pass, checklist); the end step against production (no Pick 'Em Prize
  exists yet).

### 7. Open questions for Andrew
- None new. Still open from before: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings in Partner Results; default no).

### 8. Recommended first steps for 7.1c (Opus 5.5 · high)
1. Read `…_PHASE_7.1_HANDOFF.md` §1 and §5 (F11 evidence, the comma-separated revoke trap).
2. Re-scan every `security definer` function in `supabase/migrations/` for a missing `authenticated` revoke; list them.
3. `supabase migration new <name>`; revoke EXECUTE from `public, anon, authenticated`, keep `grant execute … to service_role`
   (only caller of `settle_prediction_market`: `lib/admin.ts` via `supabaseAdmin`). Add a PGlite proof
   (`scripts/test-*.cjs`, an `npm run test:*` entry) and extend `tests/player-table-write-lockdown-contract.test.ts` or add a
   sibling contract test. Never call the RPC on production to "check".
4. Then 7.3 (F3).
