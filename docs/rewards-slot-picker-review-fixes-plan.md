# Rewards Slot-Picker Review Fixes — Plan

Fixes the six findings from the `/code-review` pass on the Rewards terms-sentence rebuild +
game-winner slot picker working tree (2026-07-26), plus one new capability the review
surfaced a decision on (partner-initiated hard delete of a reward that has paid out).

Companion docs: `docs/rewards-game-winner-picker-plan.md` (the feature being fixed),
`docs/rewards-terms-sentence-plan.md`, `docs/rewards-system-plan.md`. Not to be confused with
the earlier `docs/rewards-code-review-fixes-plan.md` or
`docs/rewards-game-winner-code-review-fixes-plan.md`, which cover prior passes.

## Decisions taken (from the user, 2026-07-26)

1. **Recurrence change on a pinned game → retire the reward.** If a pinned schedule flips
   between recurring and one-off, the reward is deactivated, not silently re-derived. The
   partner re-creates it deliberately.
2. **A moved one-off game → retire the reward, but tell the partner.** No auto re-pin.
   The cascade must stop being silent.
3. **Monthly/yearly schedules → fully supported as pinnable slots.** No fallback, no dead end.
4. **Deleting a reward that has paid out is the partner's call.** The confirm shows the real
   consequence and offers two buttons: **Archive (keep coupons)** as the safe default and
   **Delete anyway** as the opt-in. Hard delete voids *unredeemed* coupons only;
   **already-redeemed coupons survive as history.**

## Status — ALL PHASES DONE + BROWSER VERIFIED 2026-07-26

Phases 1–6 complete. `npx tsc --noEmit` clean, 893 tests pass, `npm run lint` clean on every
touched file, `npm run test:god-mode-join` passes. Both migrations applied to the linked project
and verified against the live catalog (FK `confdeltype = 'n'`, exactly one FK on `challenge_id`,
all pre-existing rows backfilled).

**One material correction to Phase 3, found while reading the engine.** The plan assumed monthly
Live Trivia schedules genuinely recur. They do not: `enumerateScheduleOccurrences`
(`lib/liveShowdownEngine.ts:1052`) — the single source of truth for when a game happens, shared by
the seeding cron, the live-state resolver, and the grader — returns monthly/yearly as **one fixed
occurrence at `start_time`**, and nothing advances them forward (asserted by
`tests/lib.live-trivia-occurrence-dates.test.ts`). `lib/rewards.ts`'s `rewardRecurringType` already
collapsed them to one-off for exactly this reason, and the owner scheduler already hides
Monthly/Yearly.

So "fully support pinning them" was implemented as: **monthly/yearly schedules are fully pinnable,
as the single dated game the engine will actually run** — not as recurring monthly rewards, which
would have promised a partner "1 winner every month" against a game that plays once. Building real
monthly recurrence would mean changing the game engine's occurrence enumeration for every venue,
which is well outside a review-fix. Flagged as available follow-on work if wanted.

## Phase order and why

Phases 1–2 are self-contained correctness/copy fixes with no schema impact — land them first so
the noisy phases below don't hide them. Phase 3 (monthly/yearly) widens the slot model that
Phase 4 (cascade) reconciles against, so it must precede it. Phase 5 is a new capability with a
migration and is independent of 1–4. Phase 6 verifies everything in a real browser.

---

## Phase 1 — One-off pinned rewards render an empty terms line

**Finding:** `lib/rewardGameSlots.ts:472` — `describeCampaignGameWinnerTerms` derives weekdays
from `campaign.activeDays`, but `createReward` writes `activeDays: []` for any `cadence: "none"`
reward (`lib/rewards.ts:541`), so the function returns `""` and the Partner Dashboard renders a
blank line (`app/owner/competitions/page.tsx:308`). The green test at
`tests/lib.reward-game-slots.test.ts:382` passes only because it feeds `activeDays: ["tue"]`, a
shape production cannot produce.

**Fix:** read weekdays from `campaign.gameWinnerSlots` — the slots already carry
`{ scheduleId, weekday }`, which is the authoritative record and survives `activeDays: []`.
Keep `activeDays` as a fallback only for legacy rows whose `gameWinnerSlots` is `null` (those
genuinely mean "every game" and should keep today's wording).

- `lib/rewardGameSlots.ts` — change the signature to accept `gameWinnerSlots`, normalize via
  `normalizeGameWinnerSlots`, order weekdays with `REWARD_WEEKDAY_KEYS`. Update the docstring:
  it currently claims `activeDays` is the freshest available summary, which is the belief that
  caused the bug.
- `app/owner/competitions/page.tsx` — pass the field through (already in scope at line 308).
- `tests/lib.reward-game-slots.test.ts:382` — rewrite the fixture to the production shape
  (`recurringType: "none"`, `activeDays: []`, slots set) so it would have caught this. Add a
  recurring case and a legacy `gameWinnerSlots: null` case.

**Model:** Sonnet 5, medium effort. Mechanical, single well-understood root cause.

---

## Phase 2 — Wizard copy regression

**Finding:** `components/rewards/CreateRewardWizard.tsx:580` renders
`{notScheduledError} {scheduleLink}.` where `notScheduledError` already ends with the link text,
producing "Schedule Live Trivia in order to create a reward for Live Trivia. Schedule Live
Trivia."

**Fix:** pick one owner of the call-to-action. Preferred: strip the trailing sentence from the
message source (`lib/rewardDefinitions.ts` / `lib/rewards.ts`) so the message states the problem
and the wizard owns navigation. Grep every consumer of that string before editing it — it may
also surface on the admin host and in API error responses.

**Model:** Sonnet 5, low effort. Copy-only, but touches a shared string — check callers.

---

## Phase 3 — Monthly/yearly schedules become pinnable slots

**Finding:** `lib/rewardGameSlots.ts:184` — `scheduleRunWeekdays` returns `[]` for
`monthly`/`yearly`, so `enumerateGameSlots` drops those schedules entirely while
`resolveRewardCreationContext` still reports `scheduled: true`. With the picker flag on, the
partner lands on a step that says "no games scheduled" behind a permanently disabled Next.

This is the largest phase: the slot model assumes *weekday* is the slot key, and a monthly game
recurs on a date-of-month, not a weekday.

**Work:**

1. **Read the real schema first.** Confirm how `trivia_schedules` expresses monthly/yearly
   recurrence (`recurring_type`, `recurring_days`, `start_time`) and whether monthly means "the
   3rd of the month" or "the first Tuesday." The whole phase hinges on this — do not assume.
   Note the legacy no-recurrence-columns database path already handled at
   `lib/liveShowdownAdmin.ts:762`.
2. **`scheduleRunWeekdays`** — return the weekday(s) a monthly/yearly schedule actually lands
   on, derived from `start_time` in the schedule's timezone.
3. **`enumerateGameSlots`** — emit one slot per monthly/yearly schedule, labeled so a partner
   can tell it apart from a weekly game ("Live Trivia — monthly, 3rd Tuesday, 7:00 PM").
4. **Cycle math** — the slot's cadence must map to a real cycle. `computeCalendarCycleStart` /
   `computeNextCycleStart` / `computePreviousCycleStart` already handle monthly and yearly
   (verified clean by the review); the work is making the picker *select* those cadences for a
   monthly/yearly-pinned reward instead of defaulting to weekly, and keeping `activeDays`
   consistent (monthly/yearly cycles are calendar-anchored, so `activeDays` only restricts
   accrual — `lib/rewards.ts:544`).
5. **Slot identity is the risk.** `{scheduleId, weekday}` would collide for two monthly
   schedules at the same venue on the same weekday if anything keys on weekday alone. Confirm
   the dedupe key in `enumerateGameSlots` and the filter in `lib/rewardGameSlotCascade.ts:89`
   both key on `scheduleId` first.
6. **Tests** — extend `tests/lib.reward-game-slots.test.ts` with monthly and yearly schedules:
   enumeration, label, resolver match, and one full cycle-boundary case per cadence.

**Model:** Opus 5, high effort. Design-shaped — it changes a core assumption of the slot model,
and the cycle math is where this feature has already produced two real bugs.

---

## Phase 4 — Cascade completeness + telling the partner

Two findings, one module (`lib/rewardGameSlotCascade.ts`), fixed together because both come from
the cascade's input being *only* `survivingWeekdays`.

**Finding A (`lib/rewardGameSlotCascade.ts:89`):** the cascade reconciles weekdays and nothing
else. A weekly Tuesday schedule flipped to a one-off Tuesday leaves its pinned reward weekly
forever — "In Progress" every week for a game that will never run again. The reverse leaves a
`"none"` reward that deactivates after the first of many games.

**Finding B (`lib/liveShowdownAdmin.ts:785`):** moving a one-off game to a different weekday
reads as a cancellation, deactivating every reward pinned to it, and
`cascadeScheduleChangeToRewards` swallows the report so nobody is told.

**Fix, per decisions 1 and 2:**

1. **Widen the cascade input** from `survivingWeekdays` to the schedule's full post-change shape
   — `{ scheduleId, venueId, survivingWeekdays, recurringType }` plus whatever Phase 3 adds.
   Update both call sites in `lib/liveShowdownAdmin.ts`, including the legacy
   no-recurrence-columns path and the `previousVenueId` venue-transfer path.
2. **Recurrence mismatch retires the reward.** If a pinned reward's `recurringType` no longer
   matches the schedule's, deactivate it (`is_active = false`, never DELETE — rule 2 of the
   module header) and record it. Add a distinct report bucket (`retiredForRecurrenceChange`) so
   it isn't conflated with `deactivated`; a moved one-off game (Finding B) lands here too rather
   than looking like a cancellation.
3. **Stop swallowing the report.** `cascadeScheduleChangeToRewards` must keep never *failing*
   the schedule write — that reasoning in its docstring stands — but the report has to reach the
   partner. Return it up through `lib/liveShowdownAdmin.ts`'s update/delete results into the
   `/api/owner` and `/api/admin` responses, then surface it in the schedule editor as a plain
   notice: "2 rewards pinned to this game were retired because the game changed." Show the same
   notice on the admin host.
4. **Tests** — extend `tests/lib.reward-slot-cascade.test.ts`: weekly→none, none→weekly, one-off
   moved weekday, and an assertion that the retirement reaches the caller instead of being
   logged and dropped.

**Model:** Opus 5, high effort for the cascade logic (steps 1–2, 4 — the correctness core, on a
destructive path). If step 3's UI plumbing is split out after the report shape is settled,
Sonnet 5 at medium effort is enough for it.

---

## Phase 5 — Partner-initiated hard delete (new capability)

**Today (`lib/challengeCampaigns.ts:1517`):** `deleteChallengeCampaign` silently downgrades to
`is_active = false` when redemption history exists but returns `void`, so `/api/admin` answers
`ok: true` and the row is still in the admin list (which fetches `includeInactive: "true"`)
after a "This cannot be undone" confirm. That's the reported bug. Per decision 4 we fix it by
making the choice explicit and real, not by hiding the downgrade better.

**Target behavior:** the confirm states the facts — "N prizes awarded, M still unredeemed" — and
offers **Archive (keep coupons)** as the default and **Delete anyway** as the opt-in. Hard delete
removes the reward and its **unredeemed** coupons; **already-redeemed coupons survive as
history**, detached from the deleted reward.

**Work:**

1. **New migration** (new files are allowed; never alter an existing one).
   `challenge_campaign_redemptions.challenge_id` is `not null references challenge_campaigns(id)
   on delete cascade` (`supabase/migrations/20260509024500_add_challenge_campaign_redemptions.sql`)
   — exactly what destroys history today. Make it nullable + `on delete set null`, and add
   snapshot columns so a detached row still means something once its campaign is gone:
   `reward_name text`, `prize_type text`, `prize_gift_certificate_amount numeric(10,2)`
   (`venue_id` is already there).
   - Backfill the snapshot columns for existing rows from their campaign.
   - Check `challenge_campaign_redemptions_unique_cycle`
     (`challenge_id, winner_user_id, cycle_start`, from `20260617000003_challenge_cycle_winners.sql`):
     with a nullable `challenge_id`, NULLs no longer collide in Postgres — which is the behavior
     we want for detached history. Confirm, don't assume.
   - `challenge_cycle_winners` cascades on the campaign too. Its rows should go with a hard
     delete: the quota guard is meaningless without the campaign, and the coupon history is the
     record being preserved. State this explicitly in the migration comment.
2. **Write the snapshot at award time**, so it's never reconstructed after the fact — both
   upsert sites (`lib/challengeCampaigns.ts:1007` and `:1095`) and the `award_cycle_winner` RPC
   (a *new* migration replacing the function, not an edit to
   `20260720150000_rewards_atomic_redemption.sql`).
3. **The wallet must survive a detached coupon.** `components/prizes/PrizeWalletPanel.tsx` and
   its data path read the campaign for name/prize; fall back to the snapshot columns when
   `challenge_id` is null. This is the phase's real regression risk — a redeemed-prize list that
   throws on a null join is worse than the bug being fixed.
4. **`deleteChallengeCampaign` gets an explicit mode.**
   `deleteChallengeCampaign(id, { mode: "archive" | "delete" })` returning
   `{ outcome: "archived" | "deleted", awardedCount, unredeemedCount, redeemedKept }` — no more
   `void` with a hidden downgrade. Delete unredeemed coupon rows explicitly, then the campaign;
   `on delete set null` detaches the redeemed ones.
5. **A counts read for the confirm.** The dialog needs awarded/unredeemed counts *before* the
   partner chooses — add a read or extend the existing campaign fetch rather than guessing
   client-side.
6. **Both hosts.** `app/api/owner/rewards/route.ts` and `app/api/admin/route.ts` accept the mode
   and return the outcome; `app/owner/competitions/page.tsx` and
   `components/admin/sections/ChallengesSection.tsx` render the two-button confirm and report
   what actually happened. Keep the ownership check (`getChallengeCampaignOwnership`,
   `lib/challengeCampaigns.ts:1537`) in front of *both* modes — delete must not be the looser path.
7. **Tests** — extend `tests/lib.challenge-campaign-delete.test.ts`: archive keeps everything;
   delete removes campaign + unredeemed and keeps redeemed with snapshot fields intact; the
   returned outcome is truthful in both; a delete with zero redemptions still hard-deletes.

**Model:** Opus 5, high effort. Irreversible data path, a schema change with a backfill, and a
security boundary — the phase where a mistake is unrecoverable. The migration must be reviewed
before it is applied; do not apply it in the same step it is written.

---

## Phase 6 — Browser verification

The picker's own plan still has an unverified browser pass
(`docs/rewards-game-winner-picker-plan.md`), so verify the feature and these fixes in one sitting
rather than twice.

Use the `verify` skill (real Playwright, real cookies — `proxy.ts` redirects on missing cookies
even with localStorage populated; `CLAUDE.md` § Manual Testing & Auth Storage).

Cover, on both the owner and admin hosts:

- A one-off slot-pinned reward shows a real terms sentence on the Partner Dashboard (Phase 1).
- The not-scheduled wizard step reads correctly, once (Phase 2).
- A monthly Live Trivia schedule appears as a pinnable slot, and a reward pinned to it shows the
  right cycle (Phase 3).
- Editing a pinned schedule's recurrence, and moving a one-off game's day, each retire the reward
  *and* show the partner a notice (Phase 4).
- Archive vs Delete-anyway on a reward that has paid out: coupons behave as promised in
  `/redeem-prizes` for a still-unredeemed winner and an already-redeemed winner (Phase 5).

Then: `npx tsc --noEmit`, `npm run lint`, `npm run test`, and `npm run test:god-mode-join` if
anything in the auth/venue path moved.

**Model:** Opus 5, high effort. Browser verification on this feature has twice found real bugs
the tests missed (the `cycle_start` string-compare bug, the daily-venue `activeDays` bug); a
headless pass that "looks fine" is not verification.

---

## As-built verification results (Phase 6)

Driven with real Playwright against a throwaway `verify-rewards-venue` + owner + two players,
with `NEXT_PUBLIC_REWARDS_ENABLED` / `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` passed to the dev
server's process env (never written to `.env.local`). All seeded rows torn down afterward;
confirmed zero residue, including zero orphaned detached coupons.

| Item | Result |
|---|---|
| 1 — one-off pinned reward's terms line | "Winner of your Tuesday Live Trivia game gets this reward." on the Partner Dashboard, against the real production row shape (`recurring_type: "none"`, `active_days: []`) that previously rendered blank |
| 2 — wizard copy | "Live Trivia isn't scheduled at this venue yet. Schedule Live Trivia." — the CTA appears exactly once |
| 3 — monthly schedule pinnable | Monthly schedule surfaces under "One-off game" as "Tue, Aug 4 7:00 PM — Verify Trivia Night", selectable, with a live Next button (was: empty picker + permanently disabled Next) |
| 4a — recurrence change | Reward retired (`is_active = false`, row + slots preserved); notice: "1 reward pinned to this game was retired because **how often the game repeats changed**. Re-create it to match the new schedule." |
| 4b — cancelled game | Reward retired; notice distinguishes the cause: "…retired because **the game no longer runs**." |
| 5 — archive | Campaign preserved, both coupons intact, moved to "Ended"; message: "Reward archived. Prizes already awarded still work." |
| 5 — delete anyway | Campaign row gone, `challenge_cycle_winners` gone, unredeemed coupon voided, redeemed coupon **detached and still readable** — `/redeem-prizes` shows "50% OFF APPETIZER / Won from: Live Trivia Challenge / REDEEMED" from the snapshot, no JS errors |
| 5 — safe default | `DELETE` with no `mode` archives on **both** hosts (owner + admin); an unrecognized mode also archives |

Also confirmed empirically rather than assumed: two detached rows sharing `winner_user_id` +
`cycle_start` coexist without violating `challenge_campaign_redemptions_unique_cycle`, because
Postgres treats NULL `challenge_id` as distinct — the behavior the migration comment predicted.

The one console error seen on `/redeem-prizes` was a 403 from
`/api/venue-presence/heartbeat` — the synthetic player is outside the venue geofence. Unrelated
to these changes.

## Model/effort summary

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Empty terms line for one-off pinned rewards | Sonnet 5 | medium |
| 2 | Wizard copy regression | Sonnet 5 | low |
| 3 | Monthly/yearly pinnable slots | Opus 5 | high |
| 4 | Cascade recurrence + surfacing the report | Opus 5 | high (UI plumbing: Sonnet 5, medium) |
| 5 | Partner hard delete + redemption detach migration | Opus 5 | high |
| 6 | Browser verification | Opus 5 | high |

## Standing constraints

- Never alter an existing migration; new files only.
- Retiring a reward is `is_active = false`, never a DELETE — except in Phase 5's explicit,
  partner-chosen delete path.
- `NEXT_PUBLIC_REWARDS_ENABLED` stays the reversible flag; off must remain inert.
- Multi-winner quota stays enforced by `award_cycle_winner`; never re-implement it in app code.
- One shared wizard (`components/rewards/CreateRewardWizard.tsx`) for both hosts — do not fork.
