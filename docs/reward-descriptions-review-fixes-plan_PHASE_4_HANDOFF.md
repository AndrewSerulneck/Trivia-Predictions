# Reward Descriptions Review Fixes — Phase 4 Handoff

**Phase:** 4 of 6 — "Coupon accuracy" (F6, F7). **Done 2026-10-04** (one step waits on Andrew: the
database change below).
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line points here).

---

## For Andrew (plain English)

**What changed:**
- **Coupons no longer describe rules they weren't won under.** If a partner changes a reward's target
  or schedule after someone wins it, that person's coupon now says "Won from: {reward name}" instead
  of a sentence that's no longer true. Coupons for rewards that haven't changed keep the full
  "You won …" sentence.
- **Late-night Live Trivia wins show the right day.** A game at 11:30 PM Central used to show as the
  next day on the coupon. It now uses the game's own time zone. If that can't be found it uses the
  venue's time zone, and if that fails it uses New York time. It never uses UTC.

**You chose "Add edit stamp" for F6.** There was no record of when a reward was edited, so this
needed a small database change: a new "terms changed at" column that the database fills in only when
a reward's target, schedule type, scope or win condition actually changes. It ignores the database's
own writes when someone wins.

**Live?** No. Nothing is committed, pushed or deployed. **The database change is written but not
applied.** It needs your OK to run `supabase db push`, which applies only this one migration (I
checked: everything else is already applied). The app works safely either way. Until the push, coupons
behave as they do today.

**Needs you:** say "push the migration" when you're ready (it can wait until Phase 6/commit).
**Left:** Phase 5 (cost of the 30-second refresh), Phase 6 (review, checklist, commit).

---

## For the next agent

### 1. Next phase: Phase 5 — Polling cost (F3)
Model/effort per plan: **Opus 5.5, high.** Spec: plan §3 Phase 5, with D2 = default.
- **Baseline first** (global cost rule, `~/.claude/CLAUDE.md`). Count the reads per
  `GET /api/challenge-campaigns` for a venue with one Live Trivia and one NFL reward:
  `trivia_schedules` (via `loadVenueGameSlots`, `lib/rewards.ts:375`), `nfl_pickem_weeks` (via
  `loadNFLSeasonWeekDates`, `lib/rewards.ts:307`), `venues.timezone` (already cached 10 min in
  `lib/timezone.ts` since Phase 1, so not part of F3). The poll is
  `components/venue/VenueHubClient.tsx:1277` (`setInterval(... loadChallengeCampaigns({ silent: true }), 30000)`).
  Write per-hour numbers (1 player, 30 players) in the Phase 5 handoff.
  `tests/api.challenge-campaigns-descriptions.test.ts` already counts reads per table through a
  fake Supabase client (`readsOf(table)`). Reuse it to measure.
- **Implement D2:** a per-instance TTL cache in `lib/rewards.ts` for `loadVenueGameSlots` (key =
  sorted venue ids, **5 min**) and for the NFL season week dates (key = season, **10 min**). Cache
  **successes only**: a failed read must still degrade to "no time" and must not be cached. Use an
  injectable clock (pattern: `lib/timezone.ts` `VENUE_TIMEZONE_CACHE_TTL_MS` +
  `clearVenueTimezoneCache()`; see `tests/lib.timezone-venue-cache.test.ts`). Export a clear function
  for tests. Many existing tests in `tests/api.challenge-campaigns-descriptions.test.ts` assert exact
  read counts, so **clear the new caches in that file's `beforeEach`**, or they will interfere with
  each other.
- Re-measure and report before/after.
- **Out of scope:** the prize-wallet path (`attachRewardWinDescriptions`). It isn't polled: the
  wallet (`components/prizes/PrizeWalletPanel.tsx:449`, `ChallengeRedeemPanel.tsx:237`) fetches on
  open only. Also out of scope: commit, push, deploy and `supabase db push`.

### 2. Starting state
- Branch `main`, HEAD `ee64a3d` (2 local commits ahead of origin; not pushed or deployed).
  Phases 1–4 are **uncommitted** in the working tree (`git diff --stat`: 23 tracked files, plus
  untracked files listed below).
- Untracked files from this work: `docs/reward-descriptions-review-fixes-plan*.md` (plan +
  handoffs 1–4), `tests/lib.timezone-venue-cache.test.ts` (Phase 1),
  `supabase/migrations/20261004170244_challenge_campaigns_terms_updated_at.sql` and
  `scripts/test-campaign-terms-stamp.cjs` (Phase 4). The untracked files
  `docs/pos-rewards-integration-plan.md`, `docs/reward-live-redemption-plan.md` and
  `docs/rewards-trust-and-pos-roadmap.md` are unrelated. Leave them alone, and don't commit them with
  this work unless Andrew says so.
- **Database:** production is unchanged. `supabase migration list` (2026-10-04) shows every local
  migration applied except `20261004170244`, so `supabase db push` would apply exactly that one.
  Only Andrew can approve it. No data was written. Only read-only production queries were run
  (column listing of `challenge_campaigns`, `challenge_campaign_redemptions`,
  `challenge_cycle_winners`).
- **Never `git checkout -- <file>` or `git stash`.** That wipes uncommitted Phase 1–4 work. Undo by
  editing.

### 3. Decisions already made (don't re-ask)
- D1, D2 = defaults (plan §5).
- **D3 was re-decided in this phase.** The plan's default assumed `challenge_campaigns.updated_at`
  existed. It does **not** (verified in production: `column challenge_campaigns.updated_at does not
  exist`). A plain `updated_at` would also be wrong: the system writes the row when someone wins
  (`winner_user_id` / `is_active` in `lib/challengeCampaigns.ts` ~1108 and ~2132, and
  `deactivateResolvedReward` in `lib/liveTriviaWinnerRewards.ts`), so it would flag nearly every
  coupon. Andrew was asked (AskUserQuestion, 2026-10-04) and chose **"Add edit stamp
  (Recommended)"**: a column stamped only when the terms change. The other options he turned down
  were "snapshot terms on coupon" and "leave F6 as is". Recorded in plan §5.
- No new guest-facing wording. F6 reuses the existing "Won from: {name}" fallback. F7 changes only
  which time zone dates the existing sentence.

### 4. Files changed in Phase 4
| File | Change |
|---|---|
| `supabase/migrations/20261004170244_challenge_campaigns_terms_updated_at.sql` (new) | Adds nullable `terms_updated_at timestamptz`, function `challenge_campaigns_stamp_terms_updated_at()` (plpgsql, `search_path = public`, execute revoked from public/anon/authenticated and granted to service_role), and a `BEFORE UPDATE` trigger. It stamps `now()` only when `reward_definition_id`, `win_condition`, `recurring_type`, `points_required_to_win` or `nfl_week_scope` `IS DISTINCT FROM` the old value. It does **not** stamp on `game_winner_slots`, `active_days`, `winner_quota`, name, rules, prize, `is_active` or `winner_user_id`, because the "You won …" sentence doesn't read them. It is idempotent and creates no table, view or sequence, so no Data API grant is needed. |
| `scripts/test-campaign-terms-stamp.cjs` (new) | An isolated PGlite check of the trigger (no network). See §6. |
| `lib/rewardDescription.ts` | New export `rewardTermsUnchangedSinceWin(termsUpdatedAt, wonAt)` (~136). No stamp → true. Stamp ≤ win → true. Stamp > win, or either value unparseable → false. New `DEFAULT_VENUE_TIMEZONE = "America/New_York"` (~121). In `describeRewardWin`, the non-NFL `zone` is now `win.timezone \|\| DEFAULT_VENUE_TIMEZONE` (it was `\|\| null`, which meant UTC). This applies to **both** the game-winner and the points-coupon branches. The `RewardWinFacts.timezone` doc was updated. |
| `types/index.ts` | `ChallengeCampaignWinTerms` now also picks `gameWinnerSlots` (optional, like on `ChallengeCampaign`). The `rewardTerms` doc mentions the edited-after-win null. |
| `lib/challengeCampaigns.ts` | In `listChallengeCampaignWinsForUser`, the redemption select adds `created_at` (the award time; all insert paths are insert-or-ignore, so it never moves). The campaign read moved to `loadWalletCampaignRows` (~2618), which selects `WALLET_CAMPAIGN_COLUMNS` (it now includes `game_winner_slots`) plus `terms_updated_at`. On a missing-column error (`isMissingTermsStampColumn`: 42703, or the column name plus "does not exist"/"schema cache"/"could not find") it logs `[ChallengeWallet] terms-updated-at-column-missing` and retries once without the column. Any other error returns `[]`, the same as before (the old code ignored the error). `rewardTerms` is null unless `rewardTermsUnchangedSinceWin(campaign.terms_updated_at, row.created_at ?? row.claimed_at)`, and now carries `gameWinnerSlots`. |
| `lib/liveShowdownAdmin.ts` | New export `listScheduleTimezones(scheduleIds)` (~530). It runs ONE `trivia_schedules` `select("id, timezone").in("id", ids)` (deduped), drops blank zones, and **throws** on a read error. |
| `lib/rewards.ts` | In `attachRewardWinDescriptions` (~525), `gameSlotsOf(win)` returns the pinned slots only for a describable, `game_winner`, non-`nfl_season` coupon. When any exist, it runs one `listScheduleTimezones` call in the existing `Promise.all`. On error it logs `[RewardDescriptions] schedule-timezone-read-failed` and uses an empty map. `winTimezone(win)`: if every pinned slot's schedule has the same zone, use it; otherwise use the venue zone. Cost doc comment updated. |
| `tests/lib.reward-description.test.ts` | 11:30 PM Central → "Wed, Oct 7". No zone → New York, not UTC (game-winner and daily points). Four `rewardTermsUnchangedSinceWin` cases. |
| `tests/api.challenge-campaigns-descriptions.test.ts` | New `F7` describe block in the redeem suite: one batched schedule read for 3 coupons (`in id [sched-late]`), read failure → venue zone + log, disagreeing zones → venue zone, and no schedule read for unpinned / points / NFL coupons. Calls `clearVenueTimezoneCache()` around the block. |
| `tests/lib.rewards-cycle-snapshot.test.ts` | The fake Supabase gained `missingColumns` (a select naming one returns 42703) and `selectLog`. A new F6 describe block covers: never edited → terms with `gameWinnerSlots`; edited before the win → terms; edited after the win (between award and claim) → `rewardTerms` null while name and prize stay live; column missing → 2 selects (with, then without), plus a warning. |

How they fit: wallet route `app/api/challenge-campaigns/redeem/route.ts` →
`listChallengeCampaignWinsForUser` (rewardTerms, or null if edited after the win) →
`attachRewardWinDescriptions` (venue zone + schedule zones + NFL weeks) → `describeRewardWin` →
`PrizeWalletPanel` `wonForLine` shows `winDescription ?? "Won from: {challengeName}"`.

### 5. Facts and traps
- `challenge_campaigns` has **no `updated_at`**. `challenge_campaign_progress` does, which is why
  grep finds `set_updated_at` near it. Don't confuse the two.
- **The win time is `challenge_campaign_redemptions.created_at`, not `claimed_at`.** `claimed_at`
  defaults to `now()` on insert, but `claimChallengePrize` (~2697) overwrites it when the guest taps
  claim. `challenge_cycle_winners.finalized_at` also exists, but the wallet reads redemptions only, so
  `created_at` avoids a second read.
- The game-winner `cycle_start` is the game's start instant (`lib/liveTriviaWinnerRewards.ts`,
  `cycleStart = new Date(occurrence.startMs)`). That is why the schedule's own zone is the right one.
- A pre-migration edit can't be detected. `terms_updated_at` is NULL for every existing row, so
  those coupons behave as before. This was accepted with the option.
- An unpinned game-winner reward (`gameWinnerSlots` null, which awards at every game) has no
  schedule to read, so it uses the venue zone. That's the plan's fallback, by design.
- This Mac has no local Postgres or Docker, and `psql` is not installed. For SQL checks, install PGlite
  into the scratchpad (see §6).
- `supabase/migrations/Warnings` is a stray non-migration file; the CLI skips it. Not ours, leave it.
- `supabase migration list` talks to the linked production database (read-only). There is no
  `timeout` binary on this Mac.
- Earlier traps still apply. `lib/rewardTerms.ts` must not import `rewardGameSlots` /
  `nflPickEmRewardWeeks`. Use `vi.stubEnv` for the game-picker flag in wizard tests. For read-only
  production queries, put the script in the scratchpad and run
  `NODE_PATH=$PWD/node_modules node --env-file=.env.local script.cjs`. Never print env values.

### 6. Build / run / test
Run the gates one after another, never typecheck and build at the same time: `npx tsc --noEmit`,
`npm run lint`, `npm run test`, `npm run build`.
Phase 4 results:
- Typecheck: clean.
- Lint: clean (only the usual Babel note about `lib/sportsBingo.ts`).
- Vitest: **287 files passed / 1 skipped; 3,157 tests passed / 13 skipped / 0 failed** (Phase 3 had
  3,142).
- Build: OK.
- The migration-grants contract test (part of `npm run test`) passes with the new migration.

SQL trigger check (passes):
```
(cd <scratch>/pg && npm init -y && npm i @electric-sql/pglite)
CAMPAIGN_PGLITE_MODULE=<scratch>/pg/node_modules/@electric-sql/pglite node scripts/test-campaign-terms-stamp.cjs
```

Fast loop: `npx vitest run tests/lib.reward-description.test.ts tests/api.challenge-campaigns-descriptions.test.ts tests/lib.rewards-cycle-snapshot.test.ts`.

**Cost of Phase 4:**
- F6 adds no reads: the same single campaign read with two extra columns. Before the migration it
  adds one retry per wallet open.
- F7 adds at most one tiny `trivia_schedules` read per wallet open, and only when a pinned Live
  Trivia game-winner coupon exists. Production had 1 such reward on 2026-10-03. The wallet isn't
  polled.

**Unverified:**
- The migration against real production Postgres. It ran only in PGlite (Postgres 16 semantics),
  and the trigger behaviour there was verified.
- Nothing has been checked in a browser or on a device.

### 7. Open questions / waiting on Andrew
- **OK to run `supabase db push`** for `20261004170244_challenge_campaigns_terms_updated_at.sql`.
  Ask before running it. After it's applied, check with a read-only select of
  `challenge_campaigns.terms_updated_at` (expect all NULL). Until then the code falls back safely.
  Phase 6 should ask about the push together with the commit.
- Commit, push and deploy remain Andrew's call (the plan commits in Phase 6).

### 8. First steps for Phase 5
1. Run `git status` and confirm the Phase 1–4 files are still modified or untracked.
2. Read `lib/rewards.ts` `loadVenueGameSlots` (~375), `loadNFLSeasonWeekDates` (~307) and
   `attachRewardDescriptions` (~422), plus the caching pattern in `lib/timezone.ts`.
3. Measure the baseline with the fake client in `tests/api.challenge-campaigns-descriptions.test.ts`
   and write down the reads per call.
4. Write tests for the cache first: hit within the TTL, miss after the TTL with the injected clock,
   errors not cached, key by sorted venue ids.
5. Implement, run the gates, write `docs/reward-descriptions-review-fixes-plan_PHASE_5_HANDOFF.md`,
   then update the plan's status line and add "Phase 5 — as built".

For Phase 6: update `docs/reward-descriptions-device-checklist.md` for the wording changes from F5,
F2, F4 and F10b, **and** add F6 (an edited reward's old coupon says "Won from") and F7 (a late-night
game shows the right day). Include the new migration and script in the commit, and ask Andrew about
`supabase db push`.
