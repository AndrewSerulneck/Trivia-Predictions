# Reward Descriptions — Code Review Fixes Plan

**Status:** **All phases done 2026-10-04** — Phase 6 review was clean, all gates green, phone
checklist updated, committed as `5e34fdd`, **pushed and deployed to production 2026-10-04** on
Andrew's word (Vercel `hightop-challenge-3inwf4x8d`). Latest handoff:
`docs/reward-descriptions-review-fixes-plan_PHASE_6_HANDOFF.md`. Andrew answered D1–D3
on 2026-10-04: **use the defaults** (§5) — except D3, re-decided in Phase 4 (see §5). Migration
`20261004170244_challenge_campaigns_terms_updated_at.sql` **was applied to production** (linked
project `pkmxupsayzshvpirkaav`) on 2026-10-04 on Andrew's instruction, during Phase 5.
**Left:** Andrew's phone pass; post-deploy read-count and duration checks (Phase 6 handoff §1).
**Handoffs:** each phase ends with `docs/reward-descriptions-review-fixes-plan_PHASE_<N>_HANDOFF.md`
(global rule in `~/.claude/CLAUDE.md`). Update this status line to point at the latest one.
**Fixes the review of:** commit `3998529` ("Rewards: say when, how often, what to do and what you
win") from `docs/reward-descriptions-plan.md`. It shipped **together with** these fixes in one
push on 2026-10-04, so guests never saw the bugs.

---

## 1. Summary (plain English, for Andrew)

The code review of the new reward wording found 10 problems (an 11th, F11, turned up during
Phase 1). None of them loses data or money. They fall into four groups:

1. **Wrong or stale wording.** For example, the wizard's "What guests will see" box can say an NFL
   reward "Starts Thu, Oct 9" when guests will actually read "A new contest starts every Thursday";
   an ended reward can still promise "Next contest starts …"; a coupon can say you won at 1,000
   points when you won at 500.
2. **Edits that do nothing.** An admin can edit a reward's rules text, but guests no longer see that
   text, and nothing tells the admin.
3. **Extra database reads.** The venue page re-checks every reward every 30 seconds per player, and
   the new wording added a schedule lookup to each of those checks.
4. **Cleanup.** Two functions with the same name that behave differently, and the same reward-terms
   logic copied in three places.

Six build phases fix them. Before the agents start, you answer three questions (§4). Each has a
recommended default, so "use the defaults" is a complete answer.

---

## 2. The findings (what each phase fixes)

IDs are used throughout. Line numbers are as of commit `ee64a3d`.

| ID | Where | Problem | Phase |
|---|---|---|---|
| F1 | `components/rewards/CreateRewardWizard.tsx` ~637 (`guestPreview`) | NFL preview says "Starts {date}" from `nflSeason.fromWeekStartDate`. For a **weekly** scope the server (`applyNFLRewardUpcomingState` in `lib/rewards.ts` ~336, via `resolveNFLRewardStartDate` in `lib/nflPickEmRewardWeeks.ts` ~278) uses the **season's first week**, so mid-season the server says "every Thursday" while the preview says "Starts Thu, Oct 9". | 1 |
| F2 | `lib/rewardDescription.ts` ~486 (`describeReward`) + `components/admin/sections/ChallengesSection.tsx` ~557/590/699 | A definition-based reward's summary is always composed; the admin's edit to its `rules` is silently ignored on every guest surface. | 3 |
| F3 | `lib/rewards.ts` ~432 (`attachRewardDescriptions`) + `components/venue/VenueHubClient.tsx` ~1277 (30 s `setInterval`) | Each 30 s silent poll per player adds a `trivia_schedules` read (plus `nfl_pickem_weeks`, plus `venues.timezone` when a quota is full). The Phase 2 cost estimate counted page loads only. | 5 |
| F4 | `lib/rewardDescription.ts` ~463 (`nextContestLine`) | Shows "Next contest starts …" on any recurring reward whose quota is 0 — never checks `isActive` or `endDate`. The venue route defaults to `includeInactive=true`. | 2 |
| F5 | `ChallengeRedeemPanel.tsx` ~417, `VenueChallengesPanel.tsx`, `VenueHubClient.tsx` reward modal | "Awarded to the winner." was removed for all `game_winner` cards. Legacy (no `reward_definition_id`, `description.isCustom === true`) cards now say nothing about how the prize is won. | 3 |
| F6 | `lib/challengeCampaigns.ts` ~2593 (`rewardTerms`) | Coupon "what you won it for" reads the campaign **as it is now**, so a later threshold/scope edit rewrites history on old coupons. | 4 |
| F7 | `lib/rewardDescription.ts` ~539 (`describeRewardWin`, game-winner branch) | Live Trivia win date is formatted in the **venue** timezone (default New York; UTC if the read fails), not the **schedule's** timezone. An 11:30 PM Central game reads as the next day. | 4 |
| F8 | `lib/challengeCampaigns.ts` ~1878 vs `lib/timezone.ts` ~60 | Two exported `getVenueTimezone`s. The new one caches forever per instance and doesn't trim `''`. | 1 |
| F9 | `CreateRewardWizard.tsx` ~609 (`guestPreview`) vs ~708 (`handleSubmit`) vs `createReward` (`lib/rewards.ts`); `attachNFLRewardUpcomingState` (`lib/rewards.ts` ~372) | Cadence / activeDays / quota derivation is copied three times; `attachNFLRewardUpcomingState` has no production caller left. | 1 |
| F11 | `components/rewards/CreateRewardWizard.tsx` `guestPreview` (`if (!isNFLDefinition && !pickedSlotTerms && !period) return null`) | Found in Phase 1, behaviour preserved. A venue whose only Live Trivia game is a one-off has `period === null`, so the "What guests will see" box never renders, although the reward submits fine as a one-off (`cadenceForPeriod(null)` = `"none"`). Same for a legacy (picker-off) game-winner reward there. | 2 |
| F10 | `lib/liveShowdownAdmin.ts` ~505 (`listVenueLiveShowdownSchedules`); slot matching in `lib/rewardDescription.ts` ~318 | (a) Drops the missing-`recurring_type`-column fallback that `listAdminLiveShowdownSchedules` had. (b) A pinned slot still matches by `slotKey` after its schedule stops being weekly, so the card says "8:00 PM every Thursday" for a one-off game. | 2 |

---

## 3. Phases

Every phase: run the gates in §6 before reporting done; write the handoff note; do not push or
deploy (Andrew's call). Do not run `npx tsc --noEmit` at the same time as `npm run build`.

### Phase 0 — Andrew's answers (~5 min, no agent)
Answer D1–D3 in §4, or say "use the defaults". Record the answers in §5.

### Phase 1 — One source of truth (F8, F9, F1)
**Model / effort:** Opus 5.5, **high**. (Touches the code that decides what a saved reward's terms
are; a slip changes real rewards, not just wording.)

1. **F8 — one `getVenueTimezone`.** Keep `lib/timezone.ts` as the only export (it trims and
   defaults). Delete the copy in `lib/challengeCampaigns.ts` and repoint its callers
   (`grep -rn getVenueTimezone lib app components`). If a hot path relied on the cache, add a short
   TTL cache (≤10 min, trimmed values only) **inside** `lib/timezone.ts`, never a forever-cache.
2. **F9 — one terms derivation.** Extract a pure helper (suggested: `deriveRewardTerms()` in a
   client-safe lib file, e.g. `lib/rewardTerms.ts` if it fits, else a new file) that turns
   `{definition, period, nflTerms, pickedSlots, scheduleDays, quantity}` into
   `{cadence, activeDays, winnerQuota}`. Use it in `guestPreview`, `handleSubmit` and wherever
   `createReward` repeats the same ternaries. **Behaviour must not change** — pin the current
   outputs with tests first (`tests/lib.reward-terms.test.ts`,
   `tests/components.create-reward-wizard.test.ts`), then refactor.
3. **F9 — dead export.** Delete `attachNFLRewardUpcomingState` (confirm zero callers outside tests
   first; move or drop its tests in `tests/lib.rewards-nfl-upcoming.test.ts` so
   `applyNFLRewardUpcomingState` stays covered via `attachRewardDescriptions`).
4. **F1 — preview uses the server's rule.** Export one pure function from `lib/nflPickEmRewardWeeks.ts`
   (e.g. `nflRewardUpcomingStartDate(scope, {campaignStartDate, seasonFirstWeekStartDate}, today)`
   returning the date only if it is after `today`, Eastern) and call it from both
   `applyNFLRewardUpcomingState` and the wizard. The wizard needs the season's first-week start
   date: check what its `nflSeason` context already carries (it has `fromWeekStartDate` and
   `seasonEndDate`); add `seasonFirstWeekStartDate` to whatever API feeds it if missing.
   Test: weekly scope, Tuesday mid-season → preview has no "Starts …" and matches the server.

### Phase 1 — as built (2026-10-04)
Done; see the Phase 1 handoff for detail. Deviations from the steps above: `deriveRewardTerms`
lives in `lib/rewardTerms.ts` and takes `sentenceCadence` (not `period`) + `sentenceQuantity`,
because the server holds a cadence, not a period; it needs no `definition`. The NFL rule is
`nflRewardUpcomingStartDate(scope, dates, now: Date)` (computes Eastern "today" itself).
`NFLRewardSeasonContext` gained `seasonFirstWeekStartDate`. `getVenueTimezone` in `lib/timezone.ts`
now has a 10-minute success-only cache (it replaces the deleted forever-cache) — it also applies to
the leaderboard and NFL Pick 'Em callers that previously read uncached.

### Phase 2 — Composer state fixes (F4, F10, F11) — DONE 2026-10-04, see Phase 2 handoff
**Model / effort:** Sonnet 5.5, **high**.

1. **F4.** `nextContestLine` returns null when the campaign is inactive, or when `endDate` is set
   and the next cycle start is after it. Add `isActive` / `endDate` to `RewardDescriptionInput` if
   they aren't there; pass them from `attachRewardDescriptions`. Decide what an ended/inactive
   card's When line says: keep the normal When line (no new copy — Andrew approved §3 of the old
   plan only). Tests in `tests/lib.reward-description.test.ts`.
2. **F10b.** A pinned slot resolves only if its schedule still recurs weekly **and** its
   `recurring_days` still include that weekday (check what `enumerateGameSlots` /
   `slotKey` in `lib/rewardGameSlots.ts` emit for a one-off schedule). Otherwise treat it as
   "schedule no longer matches" → the approved copy "Check the Live Trivia schedule for the next
   game." Test the weekly→one-off case.
3. **F10a.** Do **not** blindly copy the legacy fallback. First run one read-only query against
   production (`node --env-file=.env.local`, see memory "query production") to confirm
   `trivia_schedules.recurring_type` / `recurring_days` exist. If they do (expected — the reward
   picker already depends on them), leave the code alone, add a one-line comment saying why there
   is no fallback, and mark F10a "no change needed" in the handoff. If they don't, add the
   fallback mirroring `listAdminLiveShowdownSchedules` (~line 296–302).
4. **F11.** Show the guest preview for a one-off-only venue: drop the `!period` early return in
   `guestPreview` when `facts.isOneOffOnly` (cadence is then `"none"`, which is what the server
   stores). Confirm `describeReward` already produces approved copy for a one-off Live Trivia
   reward (it does for the server's `rules` snapshot in `createReward`); if it would need new
   wording, stop and ask Andrew. Test in `tests/components.create-reward-wizard.test.ts`.

### Phase 2 — as built (2026-10-04)
F4: `nextContestLine` returns null when `isActive === false` or the next cycle's local date (venue
zone) is after `endDate`; `isActive`/`endDate` added to `RewardDescriptionInput` (already flowed
through the `...campaign` spread). F10b: a pinned slot resolves only if the live slot's `recurring`
matches the reward (recurring reward ↔ weekly slot, one-off reward ↔ one-off slot). F10a: production
has both columns → no fallback, comment added in `lib/liveShowdownAdmin.ts`. F11: wizard preview now
renders when `isOneOffOnly`. No new guest copy.

### Phase 3 — Guest cards and the admin edit form (F5, F2) — DONE 2026-10-04, see Phase 3 handoff
**Model / effort:** Sonnet 5.5, **medium**.

1. **F5.** Restore "Awarded to the winner." in all three surfaces **only** when
   `winCondition === "game_winner"` **and** `description.isCustom` (legacy text). Definition-based
   cards stay as they are. Extend `tests/components.reward-descriptions-surfaces.test.ts`.
2. **F2.** Implement Andrew's D1 answer. Default: in `ChallengesSection.tsx`, when the campaign has
   a known `rewardDefinitionId`, show the composed guest wording read-only in place of the Rules
   textarea, with a one-line note ("Guests see this automatic description. Change the schedule,
   prize or target to change it."), and keep submitting the stored `rules` unchanged so the
   "Rules are required" check still passes. Legacy campaigns keep the editable textarea.
   The admin list already receives `description` from `attachRewardDescriptions`; reuse it.

### Phase 3 — as built (2026-10-04)
F5: "Awarded to the winner." returns on `ChallengeRedeemPanel`, `VenueChallengesPanel` and the
`VenueHubClient` modal only when `winCondition === "game_winner"` and `description?.isCustom !== false`
(a missing description counts as legacy). F2: `ChallengesSection` shows summary/when/fineprint
read-only plus the plan's note when the edited campaign's `description.isCustom` is false; `rules`
still submit unchanged. Admin items already carry `description` (admin route calls
`attachRewardDescriptions`), so no server change.

### Phase 4 — Coupon accuracy (F6, F7) — DONE 2026-10-04, see Phase 4 handoff
**Model / effort:** Opus 5.5, **high**.

1. **F6.** Implement D3. Default (no migration): only show the "You won …" line when the reward
   has not been edited since the win — compare `challenge_campaigns.updated_at` with the coupon's
   win time (`claimed_at`, or the cycle-winner `finalized_at`); otherwise fall back to the existing
   "Won from: {name}". Verify `challenge_campaigns.updated_at` exists **and** is bumped on update
   (look for a `set_updated_at` trigger in `supabase/migrations/`, or confirm the update code sets
   it). If it isn't reliable, stop and tell Andrew before choosing another approach.
   (Alternative, if Andrew picks it: snapshot the terms onto the coupon inside `award_cycle_winner`,
   following `20260726120100_award_cycle_winner_prize_snapshot.sql` — new timestamped migration,
   same arity, `service_role` grant rules per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`;
   `supabase db push` only with Andrew's explicit OK.)
2. **F7.** Format the game-winner date in the **schedule's** timezone: resolve the schedule from
   the campaign's `game_winner_slots[].scheduleId` with **one** batched `trivia_schedules` read per
   wallet load (only when a Live Trivia game-winner coupon is present), falling back to the venue
   timezone, then `America/New_York` — **never UTC**. Test the 11:30 PM Central case.

### Phase 4 — as built (2026-10-04)
F6: `challenge_campaigns.updated_at` does not exist (verified in production), so per this step the
agent stopped and asked; Andrew chose a terms-only edit stamp. New migration
`20261004170244_challenge_campaigns_terms_updated_at.sql` adds nullable `terms_updated_at` + a
`BEFORE UPDATE` trigger that stamps it only when `reward_definition_id`, `win_condition`,
`recurring_type`, `points_required_to_win` or `nfl_week_scope` actually changes (`IS DISTINCT FROM`).
(Applied to production 2026-10-04 in Phase 5.) The wallet compares it with the redemption's `created_at` (award time — not
`claimed_at`, which moves when the guest claims) via `rewardTermsUnchangedSinceWin` and drops
`rewardTerms` when edited after the win. Code is safe before the migration (missing-column retry,
log `[ChallengeWallet] terms-updated-at-column-missing`). F7: one batched `trivia_schedules`
`id,timezone` read (`listScheduleTimezones`) when a Live Trivia game-winner coupon has pinned slots;
one shared zone → that zone, else venue zone; `describeRewardWin` now defaults to
`America/New_York`, never UTC (also for points coupons). No new guest copy.

### Phase 5 — Polling cost (F3) — DONE 2026-10-04, see Phase 5 handoff
**Model / effort:** Opus 5.5, **high**.

1. **Baseline first** (global cost rule). Count reads per `/api/challenge-campaigns` call today
   (schedules, NFL weeks, timezone) for a venue with one Live Trivia and one NFL reward, and write
   the per-hour numbers in the handoff. Note: since Phase 1, `venues.timezone` is already cached
   10 minutes per server instance (`lib/timezone.ts`), so it is not part of the F3 problem.
2. Implement D2. Default: a per-instance TTL cache in `lib/rewards.ts` for `loadVenueGameSlots`
   (keyed by sorted venue ids, **5 min**) and for the NFL season week dates (keyed by season,
   **10 min**). Cache successes only; a failed read must still degrade to "no time" and must not be
   cached. Use an injectable clock so tests can expire it.
3. Re-measure and report the before/after in the handoff.

### Phase 5 — as built (2026-10-04)
`lib/rewards.ts`: `readThroughCache` (per-instance `Map`, stores the in-flight promise so concurrent
misses share one read, drops the entry on a throw or when `keep` rejects the value, prunes expired
entries on write, expiry by `Date.now()`). `venueScheduleCache` caches the raw
`listVenueLiveShowdownSchedules` rows keyed by sorted venue ids for `REWARD_SCHEDULE_CACHE_TTL_MS`
(5 min); the "still on" filter and slots are recomputed against `now` every call.
`nflSeasonWeeksCache` caches `listNFLSeasonWeekDates` per season for `REWARD_NFL_WEEKS_CACHE_TTL_MS`
(10 min), but never an empty list (that function returns `[]` on a read error).
`clearRewardDescriptionCaches()` is the test hook. Deviation from the spec: caching is **opt-in** —
`attachRewardDescriptions(..., now, { cachedReads: true })` — and only the polled guest route
`app/api/challenge-campaigns/route.ts` (both branches) opts in. Admin and partner lists read fresh
(and refresh the cache), so a partner never sees their own edit lag. Measured (one player, one hour
of 30 s polls, one Live Trivia + one NFL reward): 120 + 120 reads → **12 + 6**.

### Phase 6 — Review, gates, commit — DONE 2026-10-04, see Phase 6 handoff
**Model / effort:** Opus 5.5, **medium**.

Run `/code-review` on the combined diff, fix anything real, run all gates (§6), update
`docs/reward-descriptions-device-checklist.md` if any visible wording changed (F5, F2, F4, F10b),
then commit locally. Push/deploy only on Andrew's word. Update the status lines of this plan and of
`docs/reward-descriptions-plan.md`.

---

## 4. Questions for Andrew (Phase 0)

**D1 — Admin edits a reward's rules (F2).** Guests now see automatic wording for rewards made from
the wizard. What should the admin's Rules box do for those rewards?
- **(Default) Show the automatic wording read-only**, with a note on how to change it. Hand-written
  older rewards keep the editable box.
- Add the admin's text as an extra line under the automatic wording.

**D2 — Extra reads every 30 seconds (F3).** Rough numbers: one player on the venue page for an hour
= 120 schedule lookups; 30 players = ~3,600 an hour per venue. Each lookup is tiny, so the dollar
cost at today's 11 venues is small, but it grows with every player.
- **(Default) Remember each venue's schedule for 5 minutes** on the server. Cuts lookups to about
  12 an hour per server, no matter how many players. Trade-off: after a partner changes a game
  time, guest cards can show the old time for up to 5 minutes.
- Have the 30-second check skip the wording entirely and keep what the page already has. Zero extra
  lookups and no delay, but a bigger change to the page code.

**D3 — Old coupons after a reward is edited (F6).**
- **(Default) If the reward was edited after the win, the coupon goes back to "Won from: {reward
  name}"** instead of a possibly wrong sentence. No database change.
- Save the reward's terms onto each coupon when it is won, so it always says exactly what you did.
  Needs a database change (you approve the `supabase db push`). Only new wins get it.

---

## 5. Andrew's decisions

- D1: **default** — admin Rules box shows the automatic wording read-only for definition-based
  rewards (Andrew, 2026-10-04: "Default is fine")
- D2: **default** — 5-min per-instance cache for venue game slots, 10-min for NFL season weeks
- D3: **default** — no migration; coupon falls back to "Won from: {name}" if the reward was edited
  after the win. **Superseded 2026-10-04 (Phase 4):** `challenge_campaigns` has no `updated_at`
  column, and the system itself writes the row at award time, so the no-migration default was
  impossible. Andrew chose **"Add edit stamp"**: a `terms_updated_at` column stamped by a trigger only
  when a win-sentence term changes (needs one `supabase db push`, Andrew's OK). **Applied
  2026-10-04** — Andrew: "run supabase db push" (Phase 5 request).

---

## 6. Gates and facts for every agent

- Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (never typecheck and
  build at the same time — `.next/types` is regenerated).
- Most relevant tests: `tests/lib.reward-description.test.ts`, `tests/lib.reward-terms.test.ts`,
  `tests/lib.timezone-venue-cache.test.ts`, `tests/lib.nfl-pickem-reward-weeks.test.ts`,
  `tests/lib.rewards-nfl-upcoming.test.ts`, `tests/lib.reward-game-slots.test.ts`,
  `tests/api.challenge-campaigns-descriptions.test.ts`,
  `tests/components.create-reward-wizard.test.ts`,
  `tests/components.reward-descriptions-surfaces.test.ts`, `tests/lib.owner-reward-flow.test.ts`.
- `CreateRewardWizard` stays **one** shared component for admin and owner hosts (project
  CLAUDE.md). Don't fork it.
- Copy in `docs/reward-descriptions-plan.md` §3 is **approved by Andrew**. Don't invent new
  guest-facing sentences; reuse approved ones. If a fix truly needs new wording, ask Andrew.
- No `any`, `@/` imports only, Tailwind only (project CLAUDE.md).
- Production had 5 campaigns on 2026-10-03 (1 Live Trivia game-winner, 1 NFL game-winner, 3
  legacy). Read-only production queries are allowed and preferred over asking Andrew.
- Never edit an existing migration; never `supabase db push` without Andrew's OK.
