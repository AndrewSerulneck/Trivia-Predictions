# Rewards — "Terms Sentence" Rebuild Plan

Reorders the Create Reward wizard around the question that actually determines every
other answer ("How is this reward won?"), and replaces the cadence chips + trailing
quantity step with one plain-English contract the partner fills in:

> **I want to give out `[number]` of these rewards every `[day/week/month/year]`.**

Supersedes the wizard flow described in `docs/rewards-system-plan.md` §2. That doc
remains the source of truth for the engine mapping, prize shapes, and multi-winner
quota RPC — none of which change here.

---

## 1. Target flow

| # | Screen | Change |
|---|--------|--------|
| 1 | Venue | unchanged (only shown when >1 venue) |
| 2 | Definition tiles | tiles stay **enabled**; the "Schedule Live Trivia first" copy becomes an **error shown after the click**, not an always-visible block |
| 3 | **How is this reward won?** | **moved to first** — Points target \| Winner of the game |
| 4 | Points target | only when win condition = points target (unchanged content) |
| 5 | **Terms sentence** | **new** — replaces the Single Game / Recurring chips *and* the old Quantity step |
| 6 | Prize | unchanged |
| 7 | Confirm | restates the sentence; the "Rewards available per cycle" row is gone (it's in the sentence) |

Screens 3–5 render on one scrolling step, exactly as screens 3–4 do today.

**Deleted outright:** the `Competition: Single Game / Recurring` chip pair, the `quantity`
step, and the permanently-rendered amber "Schedule Live Trivia in order to create a
reward for Live Trivia" block.

### 1a. The sentence, by venue schedule

| Venue's Live Trivia schedule | Sentence |
|---|---|
| Recurring | `I want to give out [N▾] of these rewards every [period▾].` |
| One-off only (no recurrence) | `I want to give out [N▾] of these rewards at my next Live Trivia game.` + hint → *Schedule recurring Live Trivia to offer a recurring reward.* |

The one-off form maps to today's `cadence: "none"`. The recurring form maps to
`cadence: daily \| weekly \| monthly \| yearly` and `winnerQuota: N`.

### 1b. Which periods are offered

Derived from the venue's actual `trivia_schedules` rows — a period appears only if the
venue is **guaranteed** at least one Live Trivia game inside it.

Guaranteed game counts per schedule: daily → 1/day; weekly on *k* days → *k*/week;
monthly → 1/month; yearly → 1/year. Summed across schedules, then rolled up with
**conservative** conversions (a month always contains 4 whole weeks, never assume 5).

| Venue runs | day | week | month | year |
|---|---|---|---|---|
| Tuesdays only | ✕ | ✓ (1) | ✓ (≥4) | ✓ (≥52) |
| Tue + Thu | ✕ | ✓ (2) | ✓ (≥8) | ✓ (≥104) |
| Every day | ✓ (1) | ✓ (7) | ✓ (≥28) | ✓ (≥365) |
| One-off only | — one-off sentence, no dropdown — |

### 1c. Quantity, by win condition

- **Points target** — `N` is the partner's choice (1…25 in the dropdown, engine cap 100).
  Several guests can each clear a points target at the same game, so any N is coherent.
- **Winner of the game** — `N` is **locked** to the number of games in the chosen period
  and rendered read-only. A game has exactly one winner, so "3 rewards every week"
  is only truthful when 3 games run that week. *(Your decision: lock N to the game count.)*

  **Inference to confirm:** because "4 or 5 Tuesdays" is not a fixed promise, a
  game-winner reward only offers periods where the count is **exact** — i.e. periods that
  match the schedule's own recurrence granularity. A Tuesday-weekly venue offering a
  game-winner reward therefore sees **week** only, not month/year. A daily venue sees
  day (1) and week (7). Say the word and I'll instead offer month/year using the
  guaranteed minimum (4 Tuesdays), which under-promises rather than hides the option.

### 1d. Contradiction errors (all mirrored server-side)

| Situation | Message |
|---|---|
| Game-winner, N > games in period | *You run 1 Live Trivia game each week, so you can offer at most 1 "winner of the game" reward per week. Schedule more Live Trivia games to offer more.* |
| Period contains no scheduled game | *You don't run Live Trivia every day. Choose a longer period, or schedule daily Live Trivia.* |
| One-off schedule, recurring period requested | *Schedule recurring Live Trivia to offer a recurring reward.* |
| Definition clicked with nothing scheduled | *Schedule Live Trivia in order to create a reward for Live Trivia.* (now click-triggered) |

The client hides impossible options so these are mostly unreachable; `createReward`
re-validates every one of them because the client is never the only gate.

---

## 2. Phases

### Phase 1 — Engine: real daily / monthly / yearly cycle windows ✅ DONE (2026-07-25)
`lib/challengeCampaigns.ts` — **the blocker for everything else.**
`computeCycleStart` is hard-coded weekly-anchored for *any* recurring campaign (it walks
back to the most recent `activeDays[0]`), which is precisely why
`SUPPORTED_REWARD_CADENCES` ships as `["none","weekly"]` today. A day/month/year
dropdown is a lie until this is real.

- `computeCycleStart` switches on `recurringType`: **weekly path untouched**; daily → most
  recent local midnight; monthly → 1st of the local month; yearly → local Jan 1 (each at
  `startTime`, via the existing DST-aware `localDateTimeToUtc`).
- `computeCycleEnd` returns exactly one calendar period for the new types (not the
  current `endTime - startTime` duration); weekly path untouched.
- `getLeaderboardSnapshotForCampaign`'s `periodMs` map (the `30 * 86400000` month
  approximation) derives from `computeCycleEnd` instead, and learns `yearly`.
- `SUPPORTED_REWARD_CADENCES` opens to all five.
- **Audit first:** any existing `challenge_campaigns` row with
  `recurring_type in (daily, monthly, yearly)` silently behaves weekly today and will
  change behavior. Expect zero rows; confirm before merging.
- New `tests/lib.challenge-cycle-periods.test.ts`: DST spring-forward/fall-back, 28/30/31-day
  months, leap year, non-UTC venue timezones.

**Model: Opus 5 · Effort: high.** Calendar math inside the live scoring engine — a
subtle boundary bug silently mints or withholds real coupons.

**As built.** `computeCycleStart`/`computeCycleEnd` now branch on
`calendarRecurrenceOf(campaign)`; the weekly and one-off paths are byte-for-byte
unchanged. New helpers: `toLocalCalendar`, `calendarBoundary`,
`computeCalendarCycleStart`, `computeNextCycleStart`, `computePreviousCycleStart`.
The `30 * 86400000` month approximation in `getLeaderboardSnapshotForCampaign` and the
`ONE_WEEK_MS` step in `finalizeClosedRecurringCycles` both now use the real period
step, which also fixes those two for daily/monthly campaigns. `computeCycleStart` and
`computeCycleEnd` are exported solely for the new
`tests/lib.challenge-cycle-periods.test.ts` (19 tests: DST 23h/25h days, 28/29/30/31-day
months, leap year, non-UTC venues, non-midnight `startTime`).

**Still outstanding:** the production audit for existing rows with
`recurring_type in (daily, monthly, yearly)`. Those silently ran weekly before and now
run on their real calendar period. Rewards can't have created any (the wizard only ever
offered none/weekly) — but the admin raw-edit form could have.

### Phase 2 — Server: schedule feasibility + terms validation ✅ DONE (2026-07-25)
- New `lib/rewardTerms.ts` (client-safe, no `server-only` — shared by wizard and server,
  same split as `lib/rewardDefinitions.ts`): period list, `gamesInPeriod`,
  `allowedPeriodsFor(winCondition, counts)`, `lockedQuantityFor`, `validateRewardTerms`,
  and `renderTermsSentence` so UI and confirm screen can't drift.
- `resolveRewardCreationContext` (`lib/rewards.ts`) gains `scheduleCounts`,
  `exactPeriods`, `isOneOffOnly`; `allowedCadences` stays for back-compat.
- `createReward` validates cadence + quota through `validateRewardTerms`; new sentinel
  messages wired into `app/api/owner/rewards/route.ts` status mapping.
- Tests: new `tests/lib.reward-terms.test.ts`; extend `tests/lib.rewards-definitions.test.ts`.

**Model: Opus 5 · Effort: medium-high.** Pure logic, but it's the contract every other
phase reads.

**As built.** `lib/rewardTerms.ts` is the single implementation both sides share.
`resolveRewardCreationContext` now returns `scheduleShapes` (each schedule reduced to
`{ recurringType, weekdayCount }`) and derives `allowedCadences` from
`allowedPeriodsFor` — a Tuesday-weekly venue now reports
`["none","weekly","monthly","yearly"]` instead of `["none","weekly"]`.
`createReward` routes cadence *and* quantity through `validateRewardTerms`, throwing the
new `RewardTermsError`, which both `/api/owner/rewards` and `/api/admin` map to 400 by
type (the messages are composed from the venue's own numbers, so string matching
wouldn't work). The `activeDays` non-empty guard is now weekly-only — calendar cycles
don't need a weekday anchor, and their `activeDays` correctly keep restricting *which
days points accrue on*.

**Phase 4 landed early, in part:** `createReward` no longer force-writes
`winnerQuota: 1` for game-winner rewards; it writes and validates the real number.
Inert until Phase 3, because today's wizard still sends 1. What remains for Phase 4 is
verifying `resolveGameWinnerRewards` against a quota > 1 and the tie-cap interaction.

Tests: new `tests/lib.reward-terms.test.ts` (42) + 7 new terms cases in
`tests/lib.rewards-definitions.test.ts`. Full suite 776 passing, typecheck clean, lint
unchanged from baseline.

### Phase 3 — Wizard rewrite ✅ DONE (2026-07-25)
`components/rewards/CreateRewardWizard.tsx` only. Reorder to §1, build the sentence with
two selects, delete the chips + quantity step, make the "schedule it first" copy
click-triggered, restate the sentence on Confirm. Both hosts (admin Rewards section and
`/owner/competitions`) inherit it — the component is shared by rule.

**Model: Sonnet 5 · Effort: medium.** (Opus 5 if you want the microcopy landed in one pass.)

**As built.** Steps are now `venue → definition → terms → prize → confirm`; the `cadence`
and `quantity` steps are gone, as are the Single Game / Recurring chips and the
always-visible amber block. The wizard computes **no** terms rules itself — `allowedPeriods`,
`lockedQuantity`, and the live error all come from `lib/rewardTerms.ts`, so it cannot drift
from the server. Two effects keep the sentence coherent: one snaps `period` to a still-valid
option when the win condition changes (a weekly venue offers month/year for a points target
but only "week" for a game-winner reward), the other syncs the partner's number to
`lockedQuantity`. Neither host page changed — both just pass the DTO through.

Details worth keeping: the inline `{" "}` separators are load-bearing (JSX strips whitespace
around an expression on its own line, so the sentence would render "give out1of these
rewards"); the schedule link is appended only to errors that actually mention scheduling;
and a venue whose schedule mixes granularities (weekly + monthly ⇒ no period holds a fixed
game count) now gets an explicit explanation instead of silently collapsing to the one-off
sentence.

### Phase 4 — Game-winner quantity lock, end to end ✅ DONE (2026-07-25)

`createReward` writes the locked per-period count instead of force-writing
`winnerQuota: 1`. `resolveGameWinnerRewards` needs **no** cap logic — it awards each
occurrence's winner, and N games per period yields exactly N rewards per period.

**Model: Opus 5 · Effort: medium.** Small diff, real money.

**As built.** The `createReward` half landed with Phase 2. What Phase 4 added was closing
a gap Phase 2 left open: `validateRewardTerms` was accepting a game-winner quantity
*below* the game count, which the resolver would silently violate — it awards every
finished game's winner and never reads `winner_quota`, so a stored "1 per week" at a
two-game venue hands out two. The count is now **locked, not capped**: `quantity < exact`
is refused with `fixedWinnerRewardsMessage`, pointing the partner at a points target if
they want to hand out fewer. Unreachable from the wizard (the number is read-only there),
but the API is not the wizard.

Three resolver tests now pin the invariants a quota > 1 puts at risk: a quota of 2 still
awards only the top scorer of a single game (the ledger quota is the *tie* count, never
the campaign's), a quota of 2 spends across two games rather than both at one, and each
award is still keyed on the occurrence start instant — not on Phase 1's new calendar
cycle boundaries.

Full suite 779 passing, typecheck clean, `npm run build` clean, lint unchanged from baseline.

### Phase 5 — Copy + display consistency ✅ DONE (2026-07-25)
Daily/Monthly/Yearly labels wherever cadence renders: venue Rewards panel,
`/redeem-prizes`, owner Rewards list, admin campaigns table; retire "per cycle" phrasing.

**Model: Sonnet 5 · Effort: low.**

**As built — audit found less to do than expected, plus one real gap.** Walked all four
named surfaces:
- Venue Rewards panel (`VenueChallengesPanel.tsx`) — already generic ("this cycle"),
  renders no cadence word. No change.
- `/redeem-prizes` (`PrizeWalletPanel.tsx`) — its "Weekly Prize Wins" section is a
  wholly separate legacy prize system (`/api/prizes`), not `challenge_campaigns` /
  Rewards. Out of scope; left untouched.
- Admin campaigns table (`ChallengesSection.tsx`) — already `capitalize`s the raw
  `recurringType` string directly, which reads correctly for all five values with zero
  changes needed.
- Owner Rewards list (`app/owner/competitions/page.tsx`) — **the real gap**: it rendered
  no cadence or quantity at all for any reward, so a partner had no way to review the
  terms of an already-created reward (the wizard's sentence only exists during
  creation). Added a `renderTermsSentence(competition.winnerQuota,
  periodForCadence(competition.recurringType))` readback under each reward-created
  card's Progress/Leaderboard badge — reuses the exact same `lib/rewardTerms.ts`
  function the wizard's confirm screen shows, so the list can't say something
  different than what the partner agreed to.

Also fixed one stale doc comment (`lib/rewards.ts`'s `winnerQuota` field) that still
described the removed "quantity" step.

### Phase 4.5 — Legacy-cadence audit (closes the Phase 2 gap) ✅ DONE (2026-07-25)
The one thing Phase 1 changed real behavior for without a migration: a
`challenge_campaigns` row already stored with `recurring_type` `daily`/`monthly`/`yearly`
ran on a silently-weekly cycle before this rebuild (computeCycleStart was
weekly-anchored for every recurring type) and now runs on its real calendar period. The
Rewards wizard could never have created such a row — `SUPPORTED_REWARD_CADENCES` only
ever offered none/weekly before Phase 1 — so any hit could only come from the admin raw
campaign form, which has always exposed all five values directly.

**Model: Haiku 4.5 · Effort: low.** A single read-only Supabase query with no judgment
calls beyond "does this table have any matching rows" — the admin-form ownership
narrows the blast radius to nearly nothing, and the query pattern already exists
(`scripts/audit-venues.cjs`) to copy.

**As built.** `scripts/audit-legacy-recurring-cadences.cjs` (wired as `npm run
rewards:audit-legacy-cadences`) selects every `challenge_campaigns` row with
`recurring_type in (daily, monthly, yearly)` and prints its cadence, schedule, quota,
owner, and reward-definition id for human review — it changes nothing. **Run against the
real database: zero hits.** Every existing recurring campaign is `none` or `weekly`, so
Phase 1's behavior change is confirmed inert in production. Gap closed.

### Phase 6 — Verification ✅ DONE (2026-07-25)
`npx tsc --noEmit`, `npm run lint`, `npm run test`, then a real browser pass (the `verify`
skill) across three seeded venues — one-off, Tuesday-weekly, daily — × both win
conditions, confirming each blocked combination shows its message.

**Model: Opus 5 · Effort: medium.**

**As built.** Seeded a throwaway owner (`zzverify-owner@example.com`, with the real
`auth.users` row `venue_owners.auth_id` requires) linked to three venues whose
`trivia_schedules` rows are one-off / Tuesday-weekly / daily. Verified in three layers,
then deleted every seeded row.

1. **Context API** — each venue's `allowedCadences` resolved exactly as designed; the
   weekly venue correctly omits `daily`.
2. **Server gate** (12 POSTs to `/api/owner/rewards`) — all 7 illegal combinations
   refused with HTTP 400 and the right composed message (over-promising game winners,
   a period with no game, an inexact game-winner period, a recurring period at a
   one-off venue, a multi-prize one-off game winner, the Phase 4 under-promise lock,
   and an out-of-range quantity); all 5 legal combinations created, with correct
   `recurring_type` / `winner_quota` / `active_days` verified directly in the database.
3. **Browser** (Playwright, 17/17 checks) — win-condition-first ordering, the sentence's
   period options per venue × win condition, the locked (non-editable) game-winner
   quantity, re-locking when the period changes (7/week → 1/day), the one-off nudge, the
   confirm screen restating the sentence verbatim, and the absence of the retired
   quantity row. Screenshots confirmed the `{" "}` spacing fix renders correctly.

**Found and fixed one real bug** (`lib/rewards.ts`'s `scheduleWeekdays`) — see below.

### Phase 6 finding — `activeDays` was wrong for daily/monthly/yearly schedules
`scheduleWeekdays` fell back to the weekday of a schedule's `start_time` whenever
`recurring_days` was empty. That is right for a weekly schedule and wrong for the two
recurrence types Phase 2 newly made reachable:

- **Daily** — a venue running Live Trivia *every day* reported `scheduleDays: ["tue"]`,
  which became the reward's `activeDays`. `isCampaignEligibleAtTime` gates point accrual
  on `activeDays`, so a "1 reward every day" reward accrued points **only on Tuesdays**
  while its quota reset daily — dead six days in seven. Confirmed live before the fix
  (`activeDays: ['tue']` on a daily reward at the daily venue).
- **Monthly / yearly** — the occurrence lands on a different weekday each period, so no
  single weekday is correct; a monthly reward whose game fell on a non-Tuesday would
  never accrue at all.

Compounding it, `toScheduleShapes` was calling `coerceRecurringType`, which narrows to
`CategoryBlitzRecurringType` (`none | daily | weekly`) and **silently collapses
monthly/yearly to `"none"`** — so a monthly-trivia venue was reported as having only a
one-off game. `AdminLiveShowdownSchedule.recurringType` is already the exact five-value
union, so the coercion was pure loss.

Fixed: `scheduleWeekdays` returns all seven weekdays for a daily schedule and none (no
restriction) for monthly/yearly, and both it and `toScheduleShapes` read the raw
`recurringType`. Four regression tests added. Re-verified live: the daily venue now
reports all seven `scheduleDays` and its daily reward expands with unrestricted
`activeDays`.

**Known pre-existing limitation, not fixed** (out of scope, fails closed):
`hasLiveOrUpcomingOccurrence` also routes through `coerceRecurringType` when building the
occurrence window, so a monthly/yearly `trivia_schedules` row is treated as a one-off for
"is this still upcoming?" purposes — once its single `start_time` passes it reads as
unscheduled. That under-reports rather than over-promises, and fixing it means widening
`getCurrentOrNextScheduleWindow`'s type surface.

**Model: Opus 5 · Effort: medium.**

---

## 3. Out of scope
- No new reward definitions; the registry stays one entry.
- No change to prize shapes, the `award_cycle_winner` RPC, or the redemption flow.
- No change to the venue Rewards panel's progress rendering beyond cadence labels.
