# Game-winner reward: pick specific games, not just a period

Two changes to the Create Reward wizard's terms step (`docs/rewards-terms-sentence-plan.md`
is the prior work this extends — read that first for how the terms sentence and
`lib/rewardTerms.ts` work today):

1. **Points-target wording.** "I want to give out N of these rewards every [period]" reads
   like giving something away for free. Reword to "I want to make N of these rewards
   available every [period]" — same contract, promotion framing instead of giveaway framing.
2. **Game-winner rewards stop using a period entirely.** Instead of "winner of the game,
   every week" (which locks N to *however many games happen to fall in a week*), the
   partner directly picks which scheduled games the reward applies to — down to the
   individual game slot, not just the weekday (a venue running 6pm and 9pm Tuesday trivia
   can offer the reward at one and not the other). A checkbox — "Offer this reward to the
   winner of any Live Trivia game" — selects every game currently on the schedule as a
   shorthand; it does **not** mean "and any future game too."

## Decisions locked in (2026-07-25/26)

- **Granularity: individual scheduled game**, not weekday. New `game_winner_slots` field
  identifies `{ scheduleId, weekday }` pairs, not just weekdays — two schedules landing on
  the same weekday must stay independently selectable.
- **No period control for game-winner.** Cadence and quantity are *derived* from the
  selection: any recurring slot → weekly cadence, quantity = slot count. All slots one-off →
  one-time cadence, quantity 1. Mixing a recurring slot and a one-off game in the same
  reward is **not allowed** — it reintroduces the "how many is that really, per week"
  ambiguity Phases 1-3 of the code-review fixes just removed. The picker UI separates
  recurring slots (calendar) from one-off games (its own list, mutually exclusive).
- **"Any game" checkbox = select-all over TODAY's schedule**, expanded immediately into a
  pinned slot list. It is a convenience button, not a standing "whatever runs in the
  future" offer. A game added to the schedule later does not retroactively start awarding
  on an existing reward.
- **Schedule drift, partial:** if a reward is pinned to several slots and the partner
  cancels one of the underlying games, the reward survives with that slot dropped and its
  quota reduced. It is only deactivated once its LAST slot is gone.
- **Already-won prizes are never touched.** "If someone has won a reward, they have won
  the reward — period." Any code path that reacts to a game/slot disappearing must
  **deactivate** the campaign (`is_active = false`), and must NEVER hard-delete a
  `challenge_campaigns` row that has ANY associated `challenge_campaign_redemptions` —
  because `challenge_campaign_redemptions.challenge_id` is `on delete cascade`
  (`supabase/migrations/20260509024500_add_challenge_campaign_redemptions.sql:2`), so a
  real `DELETE` on the campaign silently destroys coupons players already won, including
  ones sitting unredeemed in a wallet right now. This rule applies everywhere a reward can
  go away, including the **existing** partner-facing "Delete" button
  (`app/owner/competitions/page.tsx` → `deleteChallengeCampaign`,
  `lib/challengeCampaigns.ts:1477`), which does a hard delete today and predates this
  plan — fixing it is in scope here as Phase 4b since it violates the same rule.

## Phases

### Phase 1 — Points-target wording
Change `renderTermsSentence`'s non-null-period branch
(`lib/rewardTerms.ts:207`) from "give out ... of these rewards every ..." to "make ...
of these rewards available every ...". Update the literal JSX sentence in
`components/rewards/CreateRewardWizard.tsx:570`, the module/function header comments that
quote the old sentence, and the string assertions in `tests/lib.reward-terms.test.ts`.
Game-winner's one-off sentence and Phase 5's picker are unaffected by this change.

**Model/effort: Sonnet, low.**

### Phase 2 — Slot model + schema
Add nullable `game_winner_slots jsonb` to `challenge_campaigns` (migration). `null` means
"award at every game" — the legacy behavior, so every in-flight game-winner reward keeps
working with zero backfill and the feature is reversible by construction. New
`lib/rewardGameSlots.ts` (client-safe, mirrors `lib/rewardTerms.ts`'s split): enumerates a
venue's live-or-upcoming schedules into `{ scheduleId, weekday, label }` slots, and derives
`{ cadence, quota }` from a selection (all-recurring → weekly + count; all-one-off → none +
1; mixed → invalid).

**Model/effort: Opus, medium.** Schema/shape decisions are expensive to unwind later even
though the module itself is pure and easy to test.

**As built (2026-07-25) — DONE, migration applied.**
- `supabase/migrations/20260725120000_rewards_game_winner_slots.sql` — nullable
  `game_winner_slots jsonb` + a check constraint that permits only null or a NON-EMPTY
  array. Empty array is refused deliberately: null already means "every game", so a reward
  pinned to nothing must be deactivated, never stored as `[]`.
- `lib/rewardGameSlots.ts` (client-safe, no `server-only`): `enumerateGameSlots` (schedules →
  `{scheduleId, weekday, recurring, title, timeLabel, dateLabel, label}`),
  `normalizeGameWinnerSlots` / `serializeGameWinnerSlots` (jsonb ⇄ typed, **malformed reads
  as null = every game**, failing OPEN so an existing reward keeps paying out),
  `occurrenceMatchesSlots` (the Phase 3 resolver filter), `deriveGameWinnerTerms`
  (all-recurring → weekly + slot count; single one-off → `none` + 1; mixed or multi-one-off →
  refused), `validateGameWinnerSlots` (Phase 3's authoritative gate — recurrence is re-read
  from the venue's real schedule, never trusted from the client), plus
  `selectAllRecurringSlots` ("any game" shorthand) and `describeGameWinnerSlots` (Phase 6
  readback).
- Multi-one-off is refused because a `none`-cadence campaign is spent at its FIRST resolved
  game (`spentCampaignIds` in `lib/liveTriviaWinnerRewards.ts`) — storing two would quietly
  award at one and never the other.
- Plumbing: `ChallengeGameWinnerSlot` + `ChallengeCampaign.gameWinnerSlots` in `types/index.ts`;
  row type, `CAMPAIGN_SELECT_COLUMNS`, `mapCampaignRow`, and the create/update inputs in
  `lib/challengeCampaigns.ts`; `toGameScheduleShapes` / `getVenueGameSlots` in `lib/rewards.ts`
  (recurrence normalization factored into a shared `rewardRecurringType`, so the picker and
  the terms sentence can't drift).
- `tests/lib.reward-game-slots.test.ts` (30 tests). Full suite green (821 passed), `tsc` clean.
- Not in Phase 2: `createReward` still ignores `gameWinnerSlots` and the resolver still awards
  at every game — that's Phase 3.

### Phase 3 — Server: creation + resolver slot filtering
`createReward` (`lib/rewards.ts`) accepts `gameWinnerSlots`, validates against the venue's
real schedule via Phase 2's module, and derives cadence/quota instead of trusting client
input for them. `resolveGameWinnerRewards`
(`lib/liveTriviaWinnerRewards.ts:127`) gains a slot filter: a game-winner campaign with
non-null `game_winner_slots` only resolves for occurrences whose `{scheduleId, weekday}`
is in the set. `findEndedOccurrences` already returns `scheduleId` and a
timezone-correct `occurrenceDate`, so the weekday is a same-day lookup, no additional tz
math.

**Model/effort: Opus, high.** This path mints real coupons — an over-broad match spends
the partner's money without their consent.

**As built (2026-07-25) — DONE.**
- `RewardCreationContext.gameSlots` (`lib/rewards.ts`) — the venue's pickable games, computed
  from the same `getVenueLiveTriviaSchedules` read the terms sentence uses, so the picker can
  never offer a game the venue doesn't have. This is also what Phase 5's wizard renders.
- `createReward` takes `gameWinnerSlots`. When present (and `winCondition === "game_winner"`)
  it calls `validateGameWinnerSlots(context.gameSlots, …)` and DERIVES `recurringType`,
  `winnerQuota` and `activeDays` from the result — `params.cadence` and `params.winnerQuota`
  are discarded, and the terms-sentence validation is skipped (the selection *is* the terms).
  `activeDays` comes from the picked weekdays, not `context.scheduleDays`: using the latter
  would re-open the games the partner deliberately left out. Absent selection → the legacy
  path, byte-for-byte unchanged, storing `game_winner_slots = null`.
- A selection sent with a points-target reward is ignored (slots only describe who wins a
  *game*); an empty array is a 400, not "every game".
- Resolver: `campaignCoversOccurrenceSlot` in `lib/liveTriviaWinnerRewards.ts` gates each
  `(campaign, occurrence)` pair on `occurrenceMatchesSlots`. The weekday comes from
  `weekdayForOccurrenceDate` (new in `lib/rewardGameSlots.ts`), which parses `occurrenceDate`
  as a plain calendar date — it is ALREADY zoned by `findEndedOccurrences`, and re-applying a
  timezone would slide a 9pm game onto the next weekday. An unreadable date fails **closed**
  against a pinned campaign and still awards for a null (legacy) one.
- Routes pass `gameWinnerSlots` through: `app/api/owner/rewards/route.ts` and the
  `resource: "rewards"` POST branch in `app/api/admin/route.ts`.
- Tests: 11 new in `tests/lib.rewards-definitions.test.ts` (derivation, same-weekday
  independence, discarding client cadence/quota, unknown slot, mixed selection, legacy null),
  4 new in `tests/lib.live-trivia-winner-rewards.test.ts` (pinned game only, legacy every-game,
  wrong weekday, unreadable date), 2 for `weekdayForOccurrenceDate`. Full suite green (837),
  `tsc` clean.
- Still inert end-to-end: nothing sends `gameWinnerSlots` yet — the wizard is Phase 5.

### Phase 4 — Schedule-change cascade (create/delete/edit)
Hook into `deleteAdminLiveShowdownSchedule` (`lib/liveShowdownAdmin.ts:768`, the single
funnel both admin and owner deletes already go through) and
`updateAdminLiveShowdownSchedule` (recurring_days shrinking is the same event as a
delete, just partial). For every game-winner campaign whose `game_winner_slots`
references the affected `{scheduleId, weekday}`:
- Prune the slot(s); recompute `winner_quota` to match the remaining slot count.
- If zero slots remain, **deactivate** the campaign (`is_active = false`) — never `DELETE`.

**Model/effort: Opus, high.** The exact boundary between "this campaign survives smaller"
and "this campaign is fully retired" is where a mistake either keeps paying for a game
that no longer exists or kills a reward the partner never touched.

**As built (2026-07-25) — DONE.**
- New `lib/rewardGameSlotCascade.ts`: `applyScheduleChangeToGameWinnerRewards({scheduleId,
  venueId, survivingWeekdays})` prunes slots for the changed schedule, recomputes
  `winner_quota` AND `activeDays` from what remains, and `is_active = false`s the campaign
  only when its last slot is gone. Slots on OTHER schedules are never touched — that's what
  keeps a 6pm and a 9pm game on the same weekday independent. `cascadeScheduleChangeToRewards`
  is the wrapper the funnels call: it logs and swallows, because the schedule write has
  already committed and surfacing a cascade failure would invite a destructive retry.
- `activeDays` is recomputed, not left alone: it gates which days the reward is live and
  anchors the weekly cycle (`activeDays[0]`), so a cancelled game's weekday would otherwise
  keep the reward "on" on a night the venue no longer plays. Re-anchoring can shift the
  current cycle boundary — the correct consequence of the schedule actually changing.
- Call sites in `lib/liveShowdownAdmin.ts` (the funnel both admin and owner use):
  `deleteAdminLiveShowdownSchedule` → `survivingWeekdays: []`;
  `updateAdminLiveShowdownSchedule` → the post-edit weekdays (both the normal and the
  legacy no-recurring-columns branch). One case beyond the plan: an edit that MOVES a
  schedule to a different venue also cascades against the *previous* venue with `[]`, since
  from that venue's side the game is simply gone (`previousVenueId`, read from the existing
  row alongside `num_rounds`).
- Growing a schedule is deliberately not a cascade, and neither is creating one: the "any
  game" checkbox snapshots today's schedule, so a game added later never starts awarding on
  an existing reward.
- Weekday derivation moved into `scheduleRunWeekdays` in `lib/rewardGameSlots.ts` and is now
  shared by the picker, `createReward`'s activeDays, and this cascade (`lib/rewards.ts`'s
  private `scheduleWeekdays` delegates to it) — two copies would eventually disagree about
  which games a reward covers.
- `tests/lib.reward-slot-cascade.test.ts` (12 tests) incl. a static guard that both funnels
  still call the cascade and that `lib/liveShowdownAdmin.ts` never references
  `deleteChallengeCampaign`; 5 more for `scheduleRunWeekdays`. Full suite green (854),
  `tsc` + lint clean, `npm run test:god-mode-join` green.

### Phase 4b — Fix the existing hard-delete on the partner Delete button
`deleteChallengeCampaign` (`lib/challengeCampaigns.ts:1473`) does a real `DELETE` on
`challenge_campaigns`. Change the owner-facing delete flow
(`app/owner/competitions/page.tsx` → `handleDelete` → whichever API route it calls) to
deactivate instead of delete when the campaign has any redemption history, consistent
with the same "already-won prizes are never touched" rule. Add a regression test that
creates a campaign, records a redemption, calls delete, and asserts the redemption row
still exists and is fetchable from `/redeem-prizes`.

**Model/effort: Sonnet, medium.** Small, isolated change, but the coupon-loss failure
mode is exactly the kind of thing worth a dedicated regression test rather than trusting
manual review.

**As built (2026-07-26) — DONE.**
- Fixed at the shared root instead of only the owner flow: `deleteChallengeCampaign`
  (`lib/challengeCampaigns.ts:1498`) now checks `challenge_campaign_redemptions` for any row
  referencing the campaign first. None → the original hard `DELETE`, unchanged. Any → `UPDATE
  is_active = false` instead, and the function returns normally either way (callers don't
  need to branch on which happened). This covers every call site with one change:
  `deleteOwnerCompetition` (`lib/ownerCompetitions.ts:205`, the owner Rewards "Delete" button)
  AND the admin `resource: "challenge-campaigns"` DELETE branch
  (`app/api/admin/route.ts:1110`), both of which call this same function — a per-caller fix
  would have left the other one still hard-deleting.
- `tests/lib.challenge-campaign-delete.test.ts` (new): a fake chainable `supabaseAdmin.from()`
  covering `.select/.update/.delete/.eq` against an in-memory campaign + redemption store.
  Asserts a redemption-free campaign is still hard-deleted (no behavior change for the common
  case), and a campaign with a redemption is deactivated with the row untouched — the
  regression case from the plan (create → redeem → delete → redemption still present).
- Full suite green (856, up from 854), `tsc` clean.

### Phase 5 — Wizard: the game picker
Replace the terms sentence for `game_winner` with: a weekly calendar of slots (for
recurring venues) or a flat list (for one-off-only venues), plus the "Offer this reward to
the winner of any Live Trivia game" checkbox that select-alls the current list. Points-target
keeps the terms sentence with Phase 1's new wording. Gate behind
`NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` (same reversible-flag convention as
`NEXT_PUBLIC_REWARDS_ENABLED`) — off means today's period-based sentence for game-winner,
fully inert.

**Model/effort: Sonnet, medium-high.** Largest diff by line count, lowest correctness
risk — the server (Phase 3) re-validates everything the wizard sends.

**As built (2026-07-26) — DONE.**
- `isGamePickerEnabled()` added to `lib/rewardGameSlots.ts` (client-safe, same
  truthy-string convention as `isContinuousDefaultEnabled` /
  `isGlobalRoomEnabled` in `lib/categoryBlitzShared.ts`), reading
  `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`.
- `components/rewards/CreateRewardWizard.tsx`'s terms step now branches on
  `useGamePicker = isGamePickerEnabled() && isGameWinner`. Off (or points-target):
  byte-for-byte the prior sentence UI, untouched. On: a weekly grid (one column per
  weekday, one chip per `{scheduleId, weekday}` slot that lands on it — two
  schedules on the same weekday get independent chips) for recurring slots, a flat
  chip list for one-off games, and the "Offer this reward to the winner of any Live
  Trivia game" checkbox (`selectAllRecurringSlots`). Selection lives as a
  `Set<"scheduleId:weekday">`; `toggleGameSlot` enforces the recurring/one-off
  mutual exclusion in the UI itself (picking a recurring slot drops any one-off
  pick and vice versa) rather than only surfacing the server's rejection message.
  `deriveGameWinnerTerms` runs on every selection change to preview the readback
  (`describeGameWinnerSlots`) and gate the Next button — no separate "submit and
  find out" round trip for an invalid combination.
- Selection resets (`useEffect` on `[context, isGameWinner]`) whenever the venue,
  definition, or win-condition changes, so a stale pick from a different schedule
  can't silently carry forward.
- `handleSubmit` sends `gameWinnerSlots` (as `{scheduleId, weekday}[]`) plus the
  *locally derived* `cadence`/`winnerQuota` only when the picker produced a valid
  selection; the server (Phase 3's `createReward`) re-derives and overwrites both
  from the venue's real schedule regardless, so the client values are a preview,
  never trusted. Off-picker path is unchanged — `gameWinnerSlots: undefined`, same
  legacy request shape as before this phase.
- No route changes needed: `RewardCreationContext.gameSlots` (Phase 2/3) was
  already returned as part of the whole `context` object by both
  `/api/owner/rewards/context` and the admin `reward-context` resource, and both
  `POST /api/owner/rewards` and the admin `resource: "rewards"` branch already
  read `body.gameWinnerSlots` (Phase 3) — Phase 5 only had to add the `gameSlots`
  field to the wizard's own `RewardCreationContextDTO` type and the
  `gameWinnerSlots` field to `CreateRewardSubmission` to pick up data that was
  already flowing over the wire.
- Full suite still green (856), `tsc` clean, `lint` clean for the touched files
  (pre-existing unrelated errors elsewhere untouched). No browser verification yet
  — that's Phase 6, which also needs the schedule-drift cascade check (create a
  multi-slot reward, cancel one game, confirm reduced quota + surviving coupon).

### Phase 6 — Display, tests, browser verification
Terms readback on the owner Rewards list and the wizard's confirm screen ("Winners of your
Tuesday and Thursday Live Trivia games get this reward — 2 per week"). Full `npm run test`
+ `npx tsc --noEmit` pass. Browser-verify: create a multi-slot reward, cancel one of its
games, confirm the reward survives with the correct reduced quota and a previously-won
coupon is still redeemable.

**Model/effort: Sonnet for the work, Opus for the browser verification pass** — the last
two browser-verification passes on this feature area each found a real bug that the test
suite missed.

**As built (2026-07-26) — work part DONE, browser verification pending (Opus).**
- `describeCampaignGameWinnerTerms` (new, `lib/rewardGameSlots.ts`) is the owner-Rewards-list
  readback for an EXISTING slot-pinned campaign. Deliberately built ONLY from what's already
  persisted on the campaign (`activeDays`, `winnerQuota`, `recurringType`) rather than
  re-fetching the venue's live schedule: the Phase 4 cascade already keeps those three fields
  in lockstep with reality whenever a pinned game is edited or cancelled, so they're the
  freshest summary available with zero network round trips. The one thing it can't reproduce
  without a live-schedule fetch is a one-off game's friendly label (title/date/time) — that
  degrades to stating just the weekday, since `describeGameWinnerSlots` (the picker's own
  confirm-screen readback, which always has the live selection in hand) already owns the rich
  version.
- Refactored the day-listing/pluralization sentence logic (shared by both readbacks) into a
  private `describeRecurringWinnerTerms(weekdays, quota)` in the same file, so the picker's
  live-selection readback and the persisted-campaign readback can't drift into two different
  sentences for the same shape of reward.
- Wired into `app/owner/competitions/page.tsx`'s `CompetitionList`: a `game_winner` campaign
  with `gameWinnerSlots` set now shows `describeCampaignGameWinnerTerms(competition)` instead
  of the old `renderTermsSentence(...)` period-based line; every other reward (points-target,
  or a legacy null-slots game-winner) is unchanged.
- `tests/lib.reward-game-slots.test.ts`: 5 new tests for `describeCampaignGameWinnerTerms`
  (multi-day, single-day, one-off-by-weekday, out-of-order `activeDays` sorted into calendar
  order, and the empty/no-resolvable-weekday case). Full suite green (861, up from 856), `tsc`
  clean, lint clean on touched files.
- NOT done in this pass, deliberately deferred to the Opus browser-verification pass per the
  plan: creating a multi-slot reward, cancelling one of its games, and confirming in a real
  browser that the reward survives with the reduced quota and a previously-won coupon is still
  redeemable on `/redeem-prizes`. The wizard itself (Phase 5) and this readback are also
  unverified in an actual browser — only unit-tested so far.

## Known interaction with prior work

`exactGameCountForPeriod`'s one-off-contamination fix
(`lib/rewardTerms.ts`, code-review fix #2, `docs/rewards-code-review-fixes-plan.md`)
becomes dead code for game-winner rewards once Phase 5 ships behind its flag at 100%. It
must stay in place as the gate for the flag-off path and any pre-existing period-based
game-winner reward until that flag is retired — do not remove it as part of this plan.
