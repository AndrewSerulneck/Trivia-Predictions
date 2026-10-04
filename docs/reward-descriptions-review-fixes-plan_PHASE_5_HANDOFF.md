# Reward Descriptions Review Fixes — Phase 5 Handoff

**Phase:** 5 of 6 — "Polling cost" (F3). **Done 2026-10-04.** Also in this session: the Phase 4
database migration was applied to production on Andrew's instruction.
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line points here).

---

## For Andrew (plain English)

**What changed:**
- **The venue page's 30-second refresh no longer re-reads the trivia schedule and NFL calendar
  every time.** Each server now remembers a venue's schedule for 5 minutes and the NFL weeks for
  10 minutes. One player sitting on the venue page for an hour used to cause 120 schedule lookups
  and 120 NFL-calendar lookups; now it's 12 and 6. With 30 players it used to be 3,600 + 3,600 an
  hour; now it's still about 12 + 6 per server, however many players there are.
- **The trade-off you accepted (D2):** after a partner changes a game time, guests' reward cards
  can show the old time for up to 5 minutes. The partner's own dashboard and the admin page always
  read fresh, so a partner never sees their own change lag.
- If a lookup fails, nothing is remembered. The card just leaves the time out (as before), and the
  next refresh tries again.

**Database:** you said "run supabase db push", so it ran. It applied exactly one change
(`20261004170244_challenge_campaigns_terms_updated_at.sql` from Phase 4, the "terms changed at"
stamp on rewards). I checked afterwards: the new column is there and empty on all 5 rewards, as
expected.

**Live?** The database change is live in production. The code is **not** committed, pushed or
deployed. The code that uses the new column still works safely with or without it.
**Left:** Phase 6 (review, device checklist, commit). Push/deploy remains your call.

---

## For the next agent

### 1. Next phase: Phase 6 — Review, gates, commit
Model/effort per plan: **Opus 5.5, medium.** Spec: plan §3 Phase 6.
- Run `/code-review` on the combined uncommitted diff (Phases 1–5), fix anything real, run all
  gates.
- Update `docs/reward-descriptions-device-checklist.md` for wording changes from F5, F2, F4, F10b,
  **plus** F6 (an edited reward's old coupon says "Won from: {name}") and F7 (a late-night Live
  Trivia game shows the right day). Optionally note F3: after a partner edits a game time, guest
  cards may lag up to 5 minutes (expected, not a bug).
- Commit locally (include the migration, `scripts/test-campaign-terms-stamp.cjs`, plan + handoffs
  1–5, `tests/lib.timezone-venue-cache.test.ts`). **Do not** include the unrelated untracked files
  `docs/pos-rewards-integration-plan.md`, `docs/reward-live-redemption-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md` unless Andrew says so.
- Update the status lines of this plan and of `docs/reward-descriptions-plan.md`.
- **Out of scope:** push and deploy (Andrew's word only). The `supabase db push` is **done** — do
  not ask about it again and do not re-run it.

### 2. Starting state
- Branch `main`, HEAD `ee64a3d` (2 local commits ahead of origin; not pushed or deployed). Phases
  1–5 are **uncommitted** in the working tree (24 tracked files modified + the untracked files
  above).
- **Database (production, linked project `pkmxupsayzshvpirkaav`):** `supabase db push` applied
  `20261004170244_challenge_campaigns_terms_updated_at.sql` on 2026-10-04 (dry run first showed it
  was the only pending migration). Verified read-only via service role:
  `challenge_campaigns` → 5 rows, `terms_updated_at` selectable, 0 non-null. No data was written by
  this phase besides the migration itself. Every local migration is now applied.
- **Never `git checkout -- <file>` or `git stash`** — that wipes the uncommitted Phase 1–5 work.

### 3. Decisions already made (don't re-ask)
- D1, D2 = defaults; D3 = "Add edit stamp" (plan §5). Migration push: approved and done.
- **Phase 5 deviation from the spec, deliberately:** caching is **opt-in** per caller
  (`{ cachedReads: true }`), not global. Only the polled guest route uses it. Reason:
  `attachRewardDescriptions` is also called by the admin Rewards list (`app/api/admin/route.ts:335`)
  and the Partner Dashboard (`lib/ownerCompetitions.ts:191`); with a global cache a partner who just
  changed a game time would see their own reward still showing the old time for 5 minutes. Those
  callers read fresh and also refresh the cache (write-through).
- The cache stores **raw schedule rows**, not computed slots, so "is this game still on" is
  recomputed against `now` every call — a one-off game that just ended drops off immediately.
- No new guest-facing wording.

### 4. Files changed in Phase 5
| File | Change |
|---|---|
| `lib/rewards.ts` | New block "Description read cache" above `loadNFLSeasonWeekDates`: exports `REWARD_SCHEDULE_CACHE_TTL_MS` (5 min), `REWARD_NFL_WEEKS_CACHE_TTL_MS` (10 min), `clearRewardDescriptionCaches()`; private `readThroughCache(cache, key, ttlMs, reuse, load, keep)` and two `Map`s (`venueScheduleCache` keyed by sorted venue ids joined with `,`; `nflSeasonWeeksCache` keyed by season). `loadNFLSeasonWeekDates(campaigns, cachedReads = false)` keeps only non-empty week lists. `loadVenueGameSlots(venueIds, now, cachedReads = false)` caches `listVenueLiveShowdownSchedules` rows (now called with the sorted, deduped ids). `attachRewardDescriptions(campaigns, venueId, now = new Date(), { cachedReads = false } = {})`; cost doc comment updated. The wallet path (`attachRewardWinDescriptions`) calls `loadNFLSeasonWeekDates` without the flag — unchanged behaviour (it still refreshes the cache). |
| `app/api/challenge-campaigns/route.ts` | Both branches (viewer snapshot and anonymous list) call `attachRewardDescriptions(..., venueId, new Date(), { cachedReads: true })`. |
| `tests/api.challenge-campaigns-descriptions.test.ts` | Imports the TTLs, `clearRewardDescriptionCaches` and `liveTriviaDurationMinutes`. Global `beforeEach` clears the caches. New describe "F3 — the 30-second venue poll reuses recent schedule / NFL-week reads" (9 tests): an hour of polls = 12 + 6 reads; TTL hit/miss on both route branches; partner's new time appears after expiry; failed schedule read not cached and wording recovers; empty NFL season not cached; key by sorted venue ids; uncached callers read fresh and warm the cache; concurrent polls share one read; a cached one-off game drops off when it ends with no re-read. |
| `docs/reward-descriptions-review-fixes-plan.md` | Status line, "Phase 5 — as built", Phase 4 as-built and §5 D3 note the migration is applied. |

### 5. Facts and traps
- `listNFLSeasonWeekDates` (`lib/nflPickEm.ts:750`) swallows read errors and returns `[]`, so the
  cache can't tell "failed" from "season not synced". It therefore never caches `[]`. An NFL reward
  for a season with no synced weeks will re-read every poll — harmless (that state is pre-season
  setup only) and preferred over caching a failure.
- `readThroughCache` stores the **promise**; on rejection the entry is removed only if it is still
  the same entry (identity check), so a fresh caller's newer entry is never clobbered.
- A fresh (uncached) caller always replaces the cache entry, even if the current one is unexpired.
- Expiry uses `Date.now()`, matching `lib/timezone.ts`; tests drive it with
  `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime`. The `now` argument is not the
  cache clock (it only drives the "still on" filter and wording).
- Caches are per server instance (Vercel Fluid Compute reuses instances); cold instances start empty.
  The "12 + 6 per hour" figure is per warm instance.
- The guest snapshot itself (`getChallengeCampaignSnapshotForUser`) has its own reads per poll; they
  pre-date this work and are outside F3.
- `supabase db push` asks for confirmation; piping `echo Y |` answers it. `supabase migration list`
  and `supabase db push --dry-run` are read-only checks against production.
- Earlier traps still apply (Phase 4 handoff §5): no `updated_at` on `challenge_campaigns`; win time
  is `challenge_campaign_redemptions.created_at`; `lib/rewardTerms.ts` must not import
  `rewardGameSlots` / `nflPickEmRewardWeeks`; read-only production scripts go in the scratchpad and
  run with `NODE_PATH=$PWD/node_modules node --env-file=.env.local script.cjs`; never print env values.

### 6. Build / run / test — results
Run sequentially (never typecheck and build at once):
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (only the usual Babel note about `lib/sportsBingo.ts`).
- `npm run test`: **287 files passed / 1 skipped; 3,166 tests passed / 13 skipped / 0 failed**
  (Phase 4: 3,157; +9 new).
- `npm run build`: OK.
- Mutation check: switching the route to `{ cachedReads: false }` fails 6 of the new tests (the 3
  that call `attachRewardDescriptions` directly with the flag are unaffected, as expected); restored.

**Baseline vs after** (measured with the fake Supabase client in the test file; one player, 120 polls
30 s apart = one hour; venue with one Live Trivia game-winner reward and one weekly NFL reward):

| Table | Before / player-hour | Before, 30 players | After / instance-hour (any player count) |
|---|---|---|---|
| `trivia_schedules` | 120 | 3,600 | 12 |
| `nfl_pickem_weeks` | 120 | 3,600 | 6 |
| `venues.timezone` (quota filled only) | 6 (already cached since Phase 1) | 6 per instance | 6 |

Each read is one small indexed query (a few rows). At today's 11 venues the dollar change is tiny;
the point is that it no longer scales with players. Production usage after deploy has not been
measured (nothing deployed).

Fast loop: `npx vitest run tests/api.challenge-campaigns-descriptions.test.ts tests/lib.rewards-nfl-upcoming.test.ts`.

**Unverified:** no browser/device check; real-instance cache hit rates after deploy.

### 7. Open questions / waiting on Andrew
- None for Phase 6 to start. Push/deploy after the Phase 6 commit is Andrew's call.

### 8. First steps for Phase 6
1. `git status` — confirm the Phase 1–5 files are still modified/untracked.
2. Run `/code-review` on the working-tree diff; fix real findings.
3. Update `docs/reward-descriptions-device-checklist.md` (see §1).
4. Run all gates, commit locally with the attribution line, update both plans' status lines, write
   `docs/reward-descriptions-review-fixes-plan_PHASE_6_HANDOFF.md`.
