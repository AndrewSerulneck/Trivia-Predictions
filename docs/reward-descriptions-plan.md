# Reward Descriptions — Plan A (say when, how often, what to do, what you win)

**Status:** Phase 3 done 2026-10-03 (the words are on every screen: venue card, details pop-up,
redeem screen, prize wallet, wizard Confirm, Partner Dashboard rows; uncommitted, not deployed) —
handoff: `docs/reward-descriptions-plan_PHASE_3_HANDOFF.md`. Earlier handoffs:
`…_PHASE_2_HANDOFF.md`, `…_PHASE_1_HANDOFF.md`. **Next:** Phase 4 (review + device pass; Opus 5.5, medium).
**Handoffs:** each phase ends with `docs/reward-descriptions-plan_PHASE_<N>_HANDOFF.md` (global rule
in `~/.claude/CLAUDE.md`). Update this status line to point at the latest handoff.
**Part of:** `docs/rewards-trust-and-pos-roadmap.md` (Plan A of three; do this one first).

---

## 1. Summary (plain English, for Andrew)

Every reward card a guest sees will answer four questions in one or two friendly sentences:

1. **When** is the contest? (e.g. "Tuesdays at 8 PM", "Thursday through Monday night")
2. **How often** does it run? (e.g. "every week", "once — this Tuesday only", "all season")
3. **What do I have to do?** (e.g. "win Live Trivia", "get the most NFL picks right this week")
4. **What do I win?** (e.g. "a $100 gift card")

Today the card says only "Get the most NFL picks right at this venue. Awarded to the winner." After
this plan it says, for example:

> **Get the most NFL picks right this week and win a $100 gift card.** A new contest starts every
> Thursday. Make your picks before each game kicks off.

The descriptions are built automatically from the choices the partner already made in the Create
Reward wizard, so partners don't type anything new, and **rewards that already exist get the new
wording too** — no partner has to recreate anything. The partner also sees the exact guest-facing
wording on the wizard's final "Confirm" screen before they publish.

Nothing about who wins, how many win, or when a reward resets changes. This is wording only.

---

## 2. Why the current copy is thin (facts for the agent)

- The guest-facing text is `challenge_campaigns.rules`, a **string frozen at creation** by
  `renderRewardRequirement()` in `lib/rewardDefinitions.ts` (called from `createReward()` in
  `lib/rewards.ts`, ~line 784). For game-winner rewards it is the fixed `gameWinnerRequirement`
  ("Win the Live Trivia game", "Get the most NFL picks right at this venue").
- The cards then append a hardcoded **"Awarded to the winner."** in three places:
  `components/venue/VenueChallengesPanel.tsx` (~line 221), `components/venue/VenueHubClient.tsx`
  (reward modal, ~line 1742), `components/challenges/ChallengeRedeemPanel.tsx` (~line 421).
- Everything needed to say more is already stored on the campaign: `recurring_type` (cadence),
  `active_days`, `winner_quota`, `win_condition`, `points_required_to_win`, `game_winner_slots`
  (`{scheduleId, weekday}[]`), `nfl_week_scope` (`weekly` | `season` + `fromWeek`),
  `start_date`/`end_date`, `reward_definition_id`, and the prize fields (`describeRewardPrize()`
  already turns them into "a $100 gift card"-style text).
- What is NOT on the campaign is the **game time**. That lives in `trivia_schedules`
  (`start_time`, `timezone`, `recurring_type`, `recurring_days`), already read by
  `getVenueLiveTriviaSchedules()` / `enumerateGameSlots()` (`lib/rewards.ts`,
  `lib/rewardGameSlots.ts`, which already formats "Tue 8:00 PM" in the schedule's own timezone).
  NFL week dates live in `nfl_pickem_weeks` (read by `resolveNFLSeasonContext()` in `lib/rewards.ts`).
- Production on 2026-10-03 (read-only query): **5 campaigns total** — 1 Live Trivia game-winner
  (weekly, slot-pinned, partner-created), 1 NFL game-winner (weekly, partner-created), 3 legacy
  admin campaigns with hand-written rules (e.g. "Earn the most points before last call on Saturday.
  Winner gets a $20 gift card."). 11 visible venues.

**Design decision (made here, don't re-litigate):** compose the description **at read time** from
structured fields, in one pure function. Stop treating `rules` as the source of truth for
definition-based rewards. Reasons: (a) existing rewards get fixed without a data migration; (b) the
schedule can change after the reward was made ("Tuesday 8 PM" moves to 9 PM) and frozen text would
lie; (c) relative words like "this week" / "tonight" must be computed at view time. Legacy campaigns
with no `reward_definition_id` keep showing their hand-written `rules` unchanged.

---

## 3. The copy (Andrew approves in Phase 0)

Tone: second person, conversational, short. **Never say "this venue" / "at this venue"** (the guest
is standing in it). Times are always the **venue's** local time (the schedule's `timezone`), never
the phone's. `{prize}` = `describeRewardPrize()` output with an article ("a $100 gift card",
"a free appetizer", "20% off your whole order").

The card shows **Line 1** (the "what to do + what you win" sentence). The details modal shows
Line 1 plus the **When / How often / Fine print** lines. Partner Confirm screen shows all of it.

| Reward | Line 1 (card + modal) | When / how often (modal) | Fine print (modal) |
|---|---|---|---|
| NFL · most picks · weekly | Get the most NFL picks right this week and win {prize}. | A new contest starts every Thursday of the NFL season. Make your picks before each game kicks off. | Ties are broken by this week's tiebreaker question. At least 3 players need to make picks for a winner to be named. |
| NFL · most picks · rest of season | Get the most NFL picks right from Week {fromWeek} through the end of the regular season and win {prize}. | One contest, all season long. Make your picks every week before kickoff. | Same as above (season tiebreaker wording per `lib/nflPickEmTiebreaker.ts`). |
| NFL · picks target · weekly | Get {N} NFL picks right this week and win {prize}. | Resets every Thursday during the NFL season. | The first {quota} players to get there each week win. |
| NFL · picks target · season | Get {N} NFL picks right by the end of the regular season and win {prize}. | Counts from Week {fromWeek} on. | The first {quota} players to get there win. |
| Live Trivia · game winner · pinned slots, recurring | Win Live Trivia on {Tuesday} night and win {prize}. | Live Trivia starts at {8:00 PM} every {Tuesday}. Be here and signed in when it starts. | One winner per game. (If several slots: "Win any of these games: Tuesday 8 PM or Thursday 9 PM.") |
| Live Trivia · game winner · one-off | Win Live Trivia on {Tuesday, Oct 7} and win {prize}. | It starts at {8:00 PM}. One game only. | One winner. |
| Live Trivia · game winner · legacy unpinned weekly | Win any Live Trivia game this week and win {prize}. | Live Trivia runs {Tuesdays at 8 PM and Thursdays at 9 PM}. | One winner per game. |
| Live Trivia · points target · weekly/daily/monthly/yearly | Earn {N} points in Live Trivia this {week/day/month/year} and win {prize}. | Live Trivia runs {Tuesdays at 8 PM}. Your points reset every {Tuesday / day / 1st of the month / Jan 1}. | The first {quota} players to hit {N} each {period} win. |
| Live Trivia · points target · one-off | Earn {N} points at Live Trivia on {Tuesday, Oct 7} and win {prize}. | It starts at {8:00 PM}. | The first {quota} players to hit {N} win. |
| Legacy (no `reward_definition_id`) | the stored `rules` text, unchanged | — | — |

State overrides (replace the When line, keep Line 1):
- **Upcoming NFL** (`upcomingStartDate` set): "Starts {Thu, Sep 4}. Get your picks in early." (keeps
  today's behavior).
- **Quota filled this cycle:** existing "Congrats to …" copy stays; add "Next contest starts
  {next cycle start}." when the reward recurs.
- **Schedule no longer matches** (a pinned `scheduleId` was deleted or moved): drop the time and say
  "Check the Live Trivia schedule for the next game." — never show a stale time.
- **Off-season NFL:** "Back when the NFL season starts." (only reachable if a reward outlives the season.)

The "Awarded to the winner." line is **deleted everywhere** — Line 1 now says it.

---

## 4. Phases

### Phase 0 — Copy sign-off (Andrew, ~15 min; no agent needed)
Andrew reads §3 and replies with edits or "approved". Record his answers verbatim in §6 below.
Nothing is built until this is done.

### Phase 1 — The composer (pure function + tests)
**Model / effort:** Opus 5.5, **high**.
- New client-safe module `lib/rewardDescription.ts` (no `server-only`, no Supabase), exporting
  `describeReward(input: RewardDescriptionInput, now: Date): RewardDescription` where
  `RewardDescription = { summary: string; when: string | null; fineprint: string | null; isCustom: boolean }`.
  Input = the campaign's structured fields + a pre-resolved `schedule` fact block
  (`{ slots: { weekdayLabel, timeLabel, dateLabel? }[]; timezone } | null`) and an NFL fact block
  (`{ fromWeek, seasonEndLabel, upcomingStartDate } | null`). The function does no I/O.
- Reuse, don't copy: `describeRewardPrize()` (add an `withArticle` helper beside it),
  `REWARD_WEEKDAY_LABEL` / `enumerateGameSlots()` formatting from `lib/rewardGameSlots.ts`.
- Add one entry per definition in `lib/rewardDefinitions.ts` (e.g. `describe` templates) so
  **adding a future reward still = one registry entry** (keep the AGENTS.md rule true; update
  AGENTS.md's "add a reward" steps to mention the description templates).
- Also `describeRewardWin(input, cycleStart)` — the past-tense "what you won it for" line for the
  prize wallet coupon (§6, Andrew said yes).
- Tests `tests/lib.reward-description.test.ts`: one case per row of §3, plus: never contains
  "this venue"; never contains "Awarded to the winner"; times rendered in the schedule timezone
  (test an `America/Chicago` schedule viewed with `TZ=UTC`); plural slot lists; deleted-slot
  fallback; legacy passthrough; prize with/without article; quota 1 vs many.
- Out of scope: any UI or API change.

### Phase 2 — Serve it (server enrichment)
**Model / effort:** Opus 5.5, **high**.
- Add `attachRewardDescriptions(campaigns, venueId)` in `lib/rewards.ts`, called in
  `app/api/challenge-campaigns/route.ts` right beside the existing `attachNFLRewardUpcomingState`
  call (both response branches). It adds `description: RewardDescription` to each campaign.
- **Cost rule:** at most **one** `trivia_schedules` read per request (by `venue_id`, only when at
  least one Live Trivia reward is present) and **one** `nfl_pickem_weeks` read (only when an NFL
  reward is present; reuse/extend the read `attachNFLRewardUpcomingState` already does so it is
  not doubled). No per-campaign queries. Estimate: today ≤2 extra small reads per venue-home load;
  at 100 venues × 500 loads/day ≈ 100k small reads/day — negligible on Supabase, but record a
  before/after `console.time` in the handoff.
- Add `description` to the `ChallengeCampaignCard` type (`components/venue/venueHubShared.tsx`) and
  `ChallengeCampaign` (`types/index.ts`) as optional, so an old client/new server skew is safe.
- Also enrich the Partner Dashboard rewards list (`/api/owner/competitions` and the
  `/api/owner/dashboard` rewards slice) and the admin Rewards list, so partners see the same words.
- Keep writing `rules` at creation (as a frozen fallback snapshot) but generate it with
  `describeReward(...).summary` so legacy readers get the better text too.
- Tests: route-level test that the payload carries `description`; query-count test (mock
  supabase) proving one schedule read regardless of reward count.

### Phase 3 — Show it
**Model / effort:** Sonnet 5.5, **high**.
- `VenueChallengesPanel.tsx` card: render `description.summary` (fall back to `rules`); delete
  "Awarded to the winner."
- `VenueHubClient.tsx` reward modal: summary + `when` + `fineprint`; delete "Awarded to the winner."
- `ChallengeRedeemPanel.tsx`: same.
- `components/prizes/PrizeWalletPanel.tsx` coupons (**required** — Andrew said yes 2026-10-03):
  replace "Won from: {challengeName}" with what the guest won it for, in the past tense, e.g.
  "You got the most NFL picks right in Week 5" / "You won Live Trivia on Tue, Oct 7". Needs the
  redemption's `cycle_start` + the campaign's fields; add a `describeRewardWin()` beside
  `describeReward()` in Phase 1's module (add it to Phase 1's tests). Deleted campaigns (no
  `challengeId`) keep "Won from: {reward_name}".
  *(As built in Phase 2: `GET /api/challenge-campaigns/redeem` already returns each win's
  `winDescription` — render it, falling back to "Won from: {challengeName}" when null.)*
- `components/rewards/CreateRewardWizard.tsx` Confirm step: add a "What guests will see" preview
  built from the same `describeReward()` with the wizard's in-progress answers (both `variant`s;
  admin snapshots must still pass — update them deliberately, don't delete them).
- Partner Dashboard rewards list rows (`app/owner/competitions/page.tsx` + dashboard card): show
  the summary under the prize.
- Styling: Tailwind only; follow existing card styles. No new navigation controls.
- Run: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not typecheck and build
  at the same time). Screenshot each surface with the `verify` skill.

### Phase 4 — Review and device pass
**Model / effort:** Opus 5.5, **medium** (+ Andrew on a phone).
- Run `/code-review high` on the plan's diff; fix findings.
- Write `docs/reward-descriptions-device-checklist.md` (one line per §3 row: create it on a test
  venue, open the card, open the modal, check wording and time). Andrew closes it.
- Commit; push/deploy only on Andrew's word.

---

## 5. Out of scope
Changing who wins, quotas, cadences, the wizard's questions, or the prize model. Translating copy.
Notifications/push wording (a later, separate pass may reuse `describeReward`).

## 6. Andrew's decisions
- (Phase 0) Copy approval: **approved as written, 2026-10-03** (Andrew: "I approve the language for plan A."). Build §3 exactly; don't re-ask.
- (Phase 0) Should the prize wallet coupon say what the guest won it for? **Yes** (Andrew, 2026-10-03). Phase 1 adds `describeRewardWin()`; Phase 3 shows it. Plan B's live-coupon work touches the same coupon component — coordinate, don't duplicate.
