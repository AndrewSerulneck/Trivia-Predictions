# Reward Descriptions — Phase 1 handoff (the composer)

**Date:** 2026-10-03 · **Plan:** `docs/reward-descriptions-plan.md` · **Next:** Phase 2 (Opus 5.5, high)

## For Andrew (plain English)

- **What changed:** I built the "sentence writer" — the piece of code that turns a reward's
  settings into the friendly wording you approved (e.g. *"Get the most NFL picks right this week
  and win a $100 gift card."*). It also writes the past-tense coupon line you said yes to
  (*"You got the most NFL picks right in Week 5"*). It is fully tested (55 new checks).
- **Is it live?** **No.** Nothing on any screen uses it yet; guests and partners see exactly what
  they saw before. Nothing was committed, pushed or deployed, and no data was touched.
- **What's left:** Phase 2 feeds this writer the real schedule/NFL facts on the server; Phase 3
  puts the words on the cards, the details pop-up, the prize wallet and the wizard's Confirm
  screen; Phase 4 is review plus your phone check.
- **Needs you (optional, not blocking):** a few small wording choices the approved table left
  open — listed under "Copy choices I made" below. If any reads wrong, say so and it's a one-line
  change. Otherwise no action needed.

---

## For the next agent

### 1. Phase 2 goal and scope

Serve the description from the server (plan §4 Phase 2, unchanged):
- `attachRewardDescriptions(campaigns, venueId)` in `lib/rewards.ts`, called in
  `app/api/challenge-campaigns/route.ts` next to `attachNFLRewardUpcomingState` in **both**
  response branches (lines ~51 and ~67). Adds `description: RewardDescription` to each campaign.
- Same enrichment for `/api/owner/competitions`, the `/api/owner/dashboard` rewards slice, and the
  admin Rewards list.
- Optional `description?: RewardDescription` on `ChallengeCampaignCard`
  (`components/venue/venueHubShared.tsx`) and `ChallengeCampaign` (`types/index.ts`).
- `createReward()` (`lib/rewards.ts` ~line 784) writes `rules` from `describeReward(...).summary`
  instead of `renderRewardRequirement(...)`.
- Tests: route payload carries `description`; mocked-supabase query-count test (one schedule read
  regardless of reward count).
- **Out of scope:** any UI (Phase 3); the prize-wallet coupon wiring of `describeRewardWin`
  (Phase 3 — but see trap 6, Phase 2/3 must supply `nflWeekNumber`); changing who wins, quotas,
  cadences.

### 2. Starting state

- Branch `main`, HEAD `2d216ae5c416c98d76eda018767ef4d6121b5010` ("Partner dashboard: shared
  loader, faster first load, Shop button"). **Phase 1 is uncommitted** in the working tree, and so
  are the plan docs themselves (`docs/reward-descriptions-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `docs/pos-rewards-integration-plan.md`,
  `docs/reward-live-redemption-plan.md` were already untracked before this phase).
  `next-env.d.ts` was already modified before this phase — not mine, leave it.
- Plan §4 Phase 4 says commit happens there; push/deploy only on Andrew's word. Don't commit
  unless asked.
- No database reads or writes, no migrations, no env changes. Nothing deployed.

### 3. Decisions already made (don't re-ask)

- Andrew approved §3's copy as written (2026-10-03) and said **yes** to the coupon line.
- Compose at **read time** from structured fields (plan §2 design decision). Legacy campaigns (no
  `reward_definition_id`, or an id not in the registry) show their stored `rules` verbatim with
  `isCustom: true`.
- Signature deviation from the plan's sketch, on purpose: the schedule fact block carries
  `scheduleId`/`weekday`/`recurring` per slot (it's `Pick<RewardGameSlot, …>`), because the
  composer must match pinned `game_winner_slots` against the live schedule to detect the
  "schedule no longer matches" state. `timezone` is a top-level input, not inside the block.
  `describeRewardWin(input, win)` takes a facts object (`{ cycleStart, timezone?, nflWeekNumber? }`)
  rather than a bare `cycleStart`.

### 4. Files created / changed

| File | What |
|---|---|
| `lib/rewardDescription.ts` (**new**, client-safe, no I/O) | `describeReward(input, now)` → `{ summary, when, fineprint, isCustom }`; `describeRewardWin(input, win)` → past-tense coupon line or `null`. Types: `RewardDescription`, `RewardDescriptionInput`, `RewardScheduleSlotFact`, `RewardDescriptionSchedule`, `RewardDescriptionNFLFacts`, `RewardWinFacts`. |
| `lib/rewardDefinitions.ts` | New `RewardDescriptionTemplates` type + required `description` field on `RewardDefinition`, filled for both definitions (`calendar: "venue_schedule"` for Live Trivia, `"nfl_season"` for NFL). New `describeRewardPrizeInSentence()` ("a $100 gift card", "20% off your whole order", never empty → "a prize") and `withIndefiniteArticle()`. `describeRewardPrize()` is **unchanged** (its Title Case output is still used by `rewardHeadline`, `NFLPickEmLeaderboard`, `NFLPickEmRewardBanner`). |
| `tests/lib.reward-description.test.ts` (**new**) | 55 cases: every §3 row, overrides, invariants, prize phrases, coupon lines, registry check. |
| `AGENTS.md` | "Adding a new Reward definition" steps now mention `description` templates and the new test file. |

How it fits: `describeReward` looks up the definition by `rewardDefinitionId`, builds the prize
phrase, then branches on `definition.description.calendar`. The registry holds the Line 1 and
coupon sentences (placeholders `{prize} {threshold} {nights} {date} {period} {fromWeek} {when}`);
`lib/rewardDescription.ts` holds the structural When / Fine-print copy and the state overrides.

**Input contract (what Phase 2 must supply)** — a `ChallengeCampaign` spreads straight in, plus:
- `schedule: { slots }` — for Live Trivia rewards. Build it with
  `enumerateGameSlots(toGameScheduleShapes(schedules))` (`lib/rewardGameSlots.ts`,
  `lib/rewards.ts`) — `RewardGameSlot[]` is a superset of `RewardScheduleSlotFact[]`. Times arrive
  pre-formatted in each schedule's own timezone. `null` = unknown → composer never states a time.
- `nfl: { upcomingStartDate, seasonEndDate }` — `upcomingStartDate` is exactly what
  `attachNFLRewardUpcomingState` already computes; `seasonEndDate` = max `week_end_date` for the
  scope's season (drives the "Back when the NFL season starts." override, weekly scope only).
- `timezone` — venue IANA zone; only used to format `nextCycleStart`. `getVenueTimezone(venueId)`
  exists and is used by `lib/challengeCampaigns.ts` (~line 1033). NFL falls back to
  `America/New_York`.
- `quotaRemaining` (already on campaigns from the GET route) + `nextCycleStart` (ISO) — when
  `quotaRemaining === 0` on a recurring reward, When becomes "Next contest starts Tue, Oct 13.".
  Cycle math (`computeCycleStart` / `computeNextCycleStart`) is in **server-only**
  `lib/challengeCampaigns.ts`; the leaderboard path already computes a `nextCycleStart` there.
- `now` — the request time.

### 5. Facts and traps

1. **`getVenueLiveTriviaSchedules` is not a venue-scoped read.** It calls
   `listAdminLiveShowdownSchedules(200)` (`lib/liveShowdownAdmin.ts:451`), which reads the 200 most
   recent `trivia_schedules` rows **globally** (newest `start_time` first) and filters by venue in
   memory. The plan's cost rule wants one read **by `venue_id`**. Add a venue-filtered query
   (same columns, `.eq("venue_id", …)`) rather than reusing it — otherwise cost grows with the whole
   platform and an old recurring schedule can fall outside the 200.
2. **Ended one-off games disappear from that helper** (`hasLiveOrUpcomingOccurrence`). A one-off
   game-winner reward whose game already played will then read "Check the Live Trivia schedule for
   the next game." That's acceptable (the reward is spent), but if you want the date kept, build the
   slot facts from the venue's schedules *without* the live-or-upcoming filter for matching pinned
   slots. Decide and note it.
3. **A one-time points-target reward has no date of its own** — `createReward` writes no
   `startDate` for it (only NFL season rewards get dates). The composer names a date only when the
   venue has exactly one game and it's a dated one-off; otherwise it uses the undated sentence.
4. **For a Live Trivia game winner, `cycle_start` is the game's own start instant**
   (`lib/liveTriviaWinnerRewards.ts` ~line 247), so `describeRewardWin` formats it in the venue
   zone to get the game date. For NFL, `cycle_start` comes from `nflWinnerCycleStart`
   (`lib/nflPickEmWinnerRewards.ts:651`) — the **week number is not derivable without
   `nfl_pickem_weeks`**, so pass `nflWeekNumber`; without it the line falls back to
   "the week of Oct 1".
5. `gameWinnerRequirement` in the registry still says "…at this venue". It's only used by
   `renderRewardRequirement` (wizard lines 820/902/1245 and `createReward`). Phase 2 replaces the
   `createReward` use; Phase 3 replaces the wizard's. The composer never uses it. Don't delete it
   until both are gone.
6. `ChallengeCampaignCard` (the venue-home card type) does **not** carry `recurringType`,
   `activeDays`, `gameWinnerSlots` or `nflWeekScope` — the client can't compose descriptions for
   cards itself, which is why Phase 2 attaches `description` server-side.
7. Tests force `process.env.TZ = "UTC"` and check Chicago-authored times stay "8:00 PM Tuesday";
   one test flips to `Asia/Tokyo` mid-run and expects identical output. Node honours runtime TZ
   changes, so this genuinely exercises it.
8. Don't run `npx tsc --noEmit` and `npm run build` concurrently (`.next/types` is regenerated).

### 6. Build / test — what was run (2026-10-03)

- `npx vitest run tests/lib.reward-description.test.ts` → **55/55 pass**.
- `npx tsc --noEmit` → clean.
- `npm run lint` → clean.
- `npm run test` → **284 files pass, 1 skipped; 3,080 tests pass, 13 skipped, 0 fail.**
- `npm run build` → **not run** (no app code imports the new module yet; run it in Phase 2).
- Unverified: nothing renders this yet, so no visual check exists.

### 7. Copy choices I made (approved table left them open) — for Andrew's eye, not blocking

- Daily points reward says "**today**" (not "this day"): "Earn 500 points in Live Trivia today…".
- Reset wording: "every Tuesday", "every day", "**on the 1st of every month**", "**every January 1**".
- Times use the picker's existing format "**8:00 PM**" (reused from `enumerateGameSlots`).
- Several games at the same time are grouped: "Live Trivia starts at 8:00 PM every Monday,
  Wednesday and Friday"; a daily schedule reads "every day at 8:00 PM".
- "night"/"nights" is dropped when a pinned game is known to start before 4 PM ("Win Live Trivia
  on Tuesday and win…").
- Free whole order reads "**your whole order free**"; other free items "a free appetizer".
- Coupon lines for rows the plan didn't spell out: points weekly "You earned 500 points in Live
  Trivia the week of Oct 6"; daily "on Tue, Oct 6"; monthly "in October 2026"; yearly "in 2026";
  one-time "You earned 500 points in Live Trivia"; NFL season "…in the 2026 season".
- The off-season override applies to **weekly** NFL rewards only (a season-long reward doesn't
  "come back").
- A one-off game-winner reward whose game vanished keeps its weekday: "Win Live Trivia on Tuesday
  night…" + "Check the Live Trivia schedule for the next game."

### 8. Open questions

None blocking. Andrew may tweak §7 wording; each is a one-line change in
`lib/rewardDescription.ts` or the registry templates, plus the matching test.

### 9. Recommended first steps for Phase 2 (Opus 5.5, high)

1. Read this note, plan §3–§4, then `lib/rewardDescription.ts` (top of file: the input contract).
2. Measure a baseline: wrap the current `GET /api/challenge-campaigns` handler in `console.time`
   locally (plan cost rule asks for before/after numbers in the Phase 2 handoff).
3. Add a venue-scoped `trivia_schedules` read (trap 1); extend the NFL read inside
   `attachNFLRewardUpcomingState` to also return the season's last `week_end_date` in the same
   query so it isn't doubled.
4. Write `attachRewardDescriptions`, wire both route branches + owner/admin lists, switch
   `createReward`'s `rules` to `describeReward(...).summary` (it already has `context.gameSlots`
   and `context.nflSeason` in hand).
5. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, then `npm run build` (not
   concurrently with typecheck). Write `docs/reward-descriptions-plan_PHASE_2_HANDOFF.md` and
   update the plan's status line.
