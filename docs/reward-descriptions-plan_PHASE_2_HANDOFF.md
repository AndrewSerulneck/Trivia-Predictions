# Reward Descriptions — Phase 2 handoff (serve it)

**Date:** 2026-10-03 · **Plan:** `docs/reward-descriptions-plan.md` · **Previous:** `docs/reward-descriptions-plan_PHASE_1_HANDOFF.md`
**Next:** Phase 3 — Show it (Sonnet 5.5, high)

## For Andrew (plain English)

- **What changed:** the server now sends the new reward wording with every reward. The venue page,
  the "redeem" screen, the Partner Dashboard reward list and the admin Rewards list all get the
  same sentences (e.g. *"Win Live Trivia on Friday night and win a $50 gift card."* plus *"Live
  Trivia starts at 5:30 PM every Friday. Be here and signed in when it starts."*). Prize-wallet
  coupons also get their "what you won it for" line (*"You got the most NFL picks right in
  Week 2"*). New rewards also store the new sentence instead of the old "…at this venue" text.
- **Is it live?** **No.** Nothing is committed, pushed or deployed. And even once deployed, guests
  see no difference until Phase 3 puts the words on screen — the screens don't read them yet.
- **Checked against your real data (read-only):** Pacific Street's two rewards read correctly
  (the NFL and Friday Live Trivia sentences above). General Saloon's three older hand-written
  rewards keep their own words, unchanged — as planned.
- **Cost:** about one extra tiny database read per venue-page load, and only at venues with a
  Live Trivia reward (today: one venue). Details in §6 below. No new cron jobs, no new API calls.
- **What's left:** Phase 3 (put the words on the cards, pop-up, prize wallet and wizard Confirm
  screen), Phase 4 (review + your phone check).
- **Needs you:** nothing.

---

## For the next agent

### 1. Phase 3 goal and scope

Plan §4 Phase 3, unchanged except where noted. Render what the server now sends:

| Surface | File | What to render |
|---|---|---|
| Venue Rewards card | `components/venue/VenueChallengesPanel.tsx` (~line 221) | `challenge.description?.summary ?? challenge.rules`; delete "Awarded to the winner." |
| Reward details modal | `components/venue/VenueHubClient.tsx` (~line 1742) | summary + `when` + `fineprint` (skip null lines); delete "Awarded to the winner." |
| Redeem screen | `components/challenges/ChallengeRedeemPanel.tsx` (~line 421) | same as modal; delete "Awarded to the winner." |
| Prize wallet coupons | `components/prizes/PrizeWalletPanel.tsx` (5 places print `Won from: {win.challengeName}` — lines ~93, 132, 176, 220, 301) | `win.winDescription ?? \`Won from: ${win.challengeName}\`` — **already served** (see §4), no client composition needed |
| Wizard Confirm preview | `components/rewards/CreateRewardWizard.tsx` (uses `renderRewardRequirement` at ~lines 820, 902, 1245) | "What guests will see": call `describeReward()` client-side with the wizard's in-progress answers + `context.gameSlots` (as `schedule: { slots }`) + `context.nflSeason` |
| Partner Dashboard rows | **`components/owner/rewards/RewardRow.tsx`** and **`components/owner/dashboard/RewardsSection.tsx`** (the plan names `app/owner/competitions/page.tsx`; the dashboard's rows actually live in these two) | summary under the prize |

All three venue surfaces fetch `GET /api/challenge-campaigns` (VenueHubClient ~line 905,
ChallengeRedeemPanel ~line 241), which now carries `description`. The Partner Dashboard reads
`/api/owner/dashboard` (first load) and `/api/owner/competitions` (refetch); both carry it.

**Out of scope for Phase 3:** any server/API change (done here), who wins, quotas, cadences,
notifications wording.

### 2. Starting state

- Branch `main`, HEAD `2d216ae5c416c98d76eda018767ef4d6121b5010` (unchanged since Phase 1).
- **Everything from Phases 1 and 2 is uncommitted** in the working tree. Plan §4 Phase 4 is where
  the commit happens; push/deploy only on Andrew's word. Don't commit unless asked.
- `next-env.d.ts` showed as modified before Phase 1 (not ours). After this phase's `npm run build`
  it no longer shows as modified — the build regenerated it. Leave it alone either way.
- **No database writes, no migrations, no env changes, nothing deployed.** Two read-only scripts
  were run against production (§6); both were temporary files under `scripts/` and were deleted.

### 3. Decisions made in Phase 2 (don't re-litigate)

1. **`attachRewardDescriptions` REPLACES `attachNFLRewardUpcomingState` at call sites — it does
   not sit beside it.** The plan said "beside", but the NFL read must not be doubled, so
   `attachRewardDescriptions` loads the season's weeks once and computes BOTH `upcomingStartDate`
   (same logic, via the shared `applyNFLRewardUpcomingState`) and the description's
   `seasonEndDate`. Calling both would read the season twice. This is written in both functions'
   doc comments. `attachNFLRewardUpcomingState` stays exported (and tested) but no route uses it now.
2. **Venue-scoped schedule read.** Phase 1 trap 1 confirmed: `getVenueLiveTriviaSchedules` reads the
   200 newest `trivia_schedules` rows platform-wide. Descriptions use the new
   `listVenueLiveShowdownSchedules(venueIds)` (one `.in("venue_id", …)` read). The **wizard/creation
   path still uses the old global-200 read** — deliberately not changed here (out of scope; it is
   not a hot path). Worth a separate small fix later.
3. **Ended one-off games are dropped** (Phase 1 trap 2): descriptions use the same
   `hasLiveOrUpcomingOccurrence` filter as the reward picker, so a one-off game that already played
   reads "Check the Live Trivia schedule for the next game." Accepted — such a reward is spent.
4. **Coupon `winDescription` is served now (pulled forward from Phase 3's server needs).** The
   wallet's wins come from `GET /api/challenge-campaigns/redeem`, which had none of the reward's
   terms, and NFL week numbers need `nfl_pickem_weeks` — neither is possible client-side. So the
   server attaches `winDescription` (§4). Phase 3 only renders it.
5. **Failures degrade wording, never the response.** A failed schedule read → no time shown
   (logs `[RewardDescriptions] schedule-read-failed`); failed timezone read → no "Next contest
   starts" line (`[RewardDescriptions] timezone-read-failed`); failed NFL weeks read → empty
   (no upcoming state, no off-season line), same as before.
6. **Admin list is described per page**, after slicing, so cost is bounded by `pageSize`. "All
   venues" (`venueId` absent) describes each reward against its own `venueIds[0]`, still with one
   schedule read covering every venue on the page.
7. **`createReward` now writes `rules` = `describeReward(...).summary`** (a frozen fallback
   snapshot; e.g. "Earn 500 points in Live Trivia this week and win 50% off an appetizer."). Note
   it freezes relative words ("this week") — fine for a fallback, which is why readers should use
   `description`.

### 4. Files changed (all uncommitted)

| File | Change |
|---|---|
| `lib/rewards.ts` | **New** `attachRewardDescriptions(campaigns, venueId \| null, now?)` and `attachRewardWinDescriptions(wins, venueId)`. Internal helpers: `loadNFLSeasonWeekDates`, `seasonFirstWeekStartDate`, `seasonLastWeekEndDate`, `applyNFLRewardUpcomingState`, `loadVenueGameSlots`. `attachNFLRewardUpcomingState` refactored onto the shared helpers (same behaviour). `createReward` writes `rules` from `describeReward`. `renderRewardRequirement` import removed (still re-exported for the wizard). |
| `lib/liveShowdownAdmin.ts` | **New** `listVenueLiveShowdownSchedules(venueIds, limit=200)` — one venue-filtered `trivia_schedules` read, all rows (caller filters ended games), throws on error. |
| `lib/nflPickEm.ts` | `getSeasonFirstWeekStartDate` **replaced** by `listNFLSeasonWeekDates(season)` → `NFLWeekDates[]` (`{weekNumber, weekStartDate, weekEndDate}`), one read, `[]` on error. Its only caller was `lib/rewards.ts`. (Name chosen because `NFLWeekSpan` already exists in that file.) |
| `lib/challengeCampaigns.ts` | **New export** `computeUpcomingCycleStart(campaign, now, tz)` (next cycle boundary, null for one-off / unanchorable weekly). `getVenueTimezone` is now **exported** (unchanged, per-instance cache). `listChallengeCampaignWinsForUser` selects 7 more columns in its existing campaigns query and returns `rewardTerms` per win (null for a deleted reward). |
| `lib/rewardDescription.ts` | `RewardDescription` type moved to `types/index.ts` and re-exported (no behaviour change). |
| `types/index.ts` | New `RewardDescription`; `ChallengeCampaign.description?`; `ChallengeCampaignWin.rewardTerms?` + `winDescription?`; new `ChallengeCampaignWinTerms`. All optional (old server / new client skew safe). |
| `components/venue/venueHubShared.tsx` | `ChallengeCampaignCard.description?: RewardDescription` (type only). |
| `app/api/challenge-campaigns/route.ts` | Both branches: `attachRewardDescriptions(x, venueId)` replaces `attachNFLRewardUpcomingState(x)`. |
| `app/api/challenge-campaigns/redeem/route.ts` | GET wraps the wins in `attachRewardWinDescriptions`. POST unchanged. |
| `lib/ownerCompetitions.ts` | `listOwnerCompetitions` ends with `attachRewardDescriptions` → covers `/api/owner/competitions` GET **and** the `/api/owner/dashboard` rewards slice. |
| `app/api/admin/route.ts` | `resource=challenge-campaigns` GET describes the current page. |
| `tests/api.challenge-campaigns-descriptions.test.ts` | **New**, 18 tests. Fakes the Supabase client (`@/lib/supabaseAdmin`) so the real readers run and every table read is logged. Covers: payload in both route branches; legacy passthrough; NFL upcoming from one read; one schedule read for 6 rewards; one NFL read for 3 rewards; zero reads for legacy/empty; cross-venue admin list = one read; schedule-read failure; deleted pinned slot; ended one-off; "Next contest starts Tue, Oct 6." in Chicago; no timezone read while quota remains; off-season line; no "this venue"/"Awarded to the winner"; coupon lines (Live Trivia date, NFL Week 1/2 from one read, deleted/legacy → null with zero reads). |
| `tests/lib.rewards-nfl-upcoming.test.ts` | Mock switched to `listNFLSeasonWeekDates`; fixture lists Week 2 first to prove the opener is the earliest date. |
| `tests/lib.rewards-definitions.test.ts` | `rules` expectation updated; new describe "createReward — rules is the composer's Line 1" (4 tests). |

How it fits: route → `attachRewardDescriptions` → (parallel) `loadNFLSeasonWeekDates` /
`loadVenueGameSlots` / `getVenueTimezone` → per campaign `describeReward({...campaign, schedule,
nfl, timezone, nextCycleStart}, now)` (pure, Phase 1).

### 5. Facts and traps

1. **Responses that are NOT enriched:** the create/update responses (`POST /api/owner/competitions`,
   the reward-create routes, admin create/update) return a campaign with no `description`. If a
   Phase 3 surface inserts a freshly created reward from a POST response without refetching, it
   must fall back to `rules` (which is now the composer's summary, so it still reads well). Also
   not enriched: `app/api/nfl-pickem/rewards/route.ts` (NFL page banner/leaderboard; not in the
   plan's surface list).
2. **`getVenueTimezone` is cached per server instance** (module-level `Map`, never invalidated). The
   tests depend on that: the quota-filled test warms `venue-1`, so the coupon test allows ≤1
   `venues` read. A venue that changes its timezone keeps the old one until the instance recycles —
   pre-existing behaviour, not new.
3. **The venue-snapshot path already calls `getVenueTimezone`**, so on the viewer branch the
   "Next contest starts" line costs no extra read on a warm instance.
4. **`quotaRemaining` only exists on the viewer branch** (`getChallengeCampaignSnapshotForUser`). The
   anonymous list, owner list and admin list never show "Next contest starts …" — correct, since
   they don't know the cycle's winners.
5. **NFL coupon week mapping:** a weekly NFL `cycle_start` is the week's first day 00:00 in the
   venue zone (`nflWinnerCycleStart` → `computeCycleStart`), so the server takes the cycle start's
   local date in the venue zone and finds the week whose `[weekStartDate, weekEndDate]` contains it.
   Season-scope coupons need no week ("in the 2026 season").
6. **Production has no definition-based coupons yet** (all 6 recent winner/venue pairs were
   General Saloon legacy wins → `winDescription: null`). So the coupon line has only been verified
   by tests, not on real rows.
7. **5:30 PM still reads "Friday night"** — Phase 1 drops "night" only before 4 PM. That's the
   approved rule; flag to Andrew only if he comments on it.
8. Don't run `npx tsc --noEmit` and `npm run build` concurrently (`.next/types` is regenerated).
9. Vitest partial module mocks: `tests/api.challenge-campaigns-descriptions.test.ts` mocks
   `@/lib/challengeCampaigns` with `importOriginal` + overrides, so the real
   `computeUpcomingCycleStart` / `getVenueTimezone` run against the fake client. Other test files
   that mock `@/lib/challengeCampaigns` without those exports are fine as long as their campaigns
   never need a timezone (missing mock exports throw only when accessed).

### 6. Build / test / measurements (2026-10-03)

Gates, run sequentially:
- `npx tsc --noEmit` → clean.
- `npm run lint` → clean (only the usual Babel "deoptimised styling" note for `lib/sportsBingo.ts`).
- `npm run test` (`vitest run`) → **285 files pass, 1 skipped; 3,102 tests pass, 13 skipped, 0 fail.**
- `npm run build` → compiled successfully; `Proxy (Middleware)` listed.
- Targeted: `npx vitest run tests/api.challenge-campaigns-descriptions.test.ts` → 18/18.

Cost baseline vs after (read-only against production, from a laptop, 7 runs each, median of the
enrichment step only — `attachNFLRewardUpcomingState` (old) vs `attachRewardDescriptions` (new) on
the same campaign list):

| Venue | Campaigns | Old | New | Reads old → new |
|---|---|---|---|---|
| Pacific Street | 2 (NFL weekly + Live Trivia Fri) | 67 ms | 107 ms | 1 → 2 (NFL weeks + venue schedules, in parallel) |
| General Saloon | 3 legacy | 0 ms | 0 ms | 0 → 0 |

Latency is laptop→Supabase WAN; inside Vercel's region it will be smaller. Volume estimate: +1
small read (a venue's few `trivia_schedules` rows) per venue-page load, only at venues with a Live
Trivia reward (1 of 11 visible venues today). At 100 venues × 500 loads/day ≈ 50k extra small
reads/day (~1.5M/month, ≈100 MB/month egress at ~2 KB each) — negligible on Supabase. The NFL read
grew from 1 row to ~18–23 rows (~1.5 KB) but is still one read. Response payload grows ~350 bytes
per definition-based campaign. No new invocations, crons or external API calls. **Phase 4 should
re-measure after deploy** (Vercel function duration for `/api/challenge-campaigns`) and report any
material difference.

Real wording observed (Pacific Street, production, 2026-10-03):
- NFL: "Get the most NFL picks right this week and win a $100 gift card." / "A new contest starts
  every Thursday of the NFL season. Make your picks before each game kicks off." / "Ties are broken
  by this week's tiebreaker question. At least 3 players need to make picks for a winner to be named."
- Live Trivia: "Win Live Trivia on Friday night and win a $50 gift card." / "Live Trivia starts at
  5:30 PM every Friday. Be here and signed in when it starts." / "One winner per game."

Unverified: nothing renders the descriptions yet (Phase 3); real definition-based coupons
(none exist); deployed latency.

### 7. Open questions for Andrew

None blocking. (Phase 1's optional copy choices, §7 of its handoff, still stand.)

### 8. Recommended first steps for Phase 3 (Sonnet 5.5, high)

1. Read this note, plan §3 + §4 Phase 3, and the top of `lib/rewardDescription.ts`.
2. Venue card / modal / redeem screen: render `description` with a `rules` fallback; delete the
   three "Awarded to the winner." lines (grep confirms exactly three).
3. Prize wallet: swap the five `Won from:` lines for `win.winDescription ?? …`. Coordinate with Plan
   B (`docs/reward-live-redemption-plan.md`), which touches the same coupon component.
4. Wizard Confirm step: build a `RewardDescriptionInput` from the wizard's answers; for slot-pinned
   game-winner rewards pass `gameWinnerSlots` + `schedule: { slots: context.gameSlots }`; for NFL
   pass `nflWeekScope` (`{kind, season, fromWeek}` from `context.nflSeason`) and
   `nfl: { upcomingStartDate: <fromWeekStartDate if in the future>, seasonEndDate }`. Then remove
   the wizard's `renderRewardRequirement` uses; once the wizard no longer uses it,
   `gameWinnerRequirement` / `renderRewardRequirement` in `lib/rewardDefinitions.ts` can be deleted
   (check `rg renderRewardRequirement` first — `lib/rewards.ts` re-exports it and
   `tests/lib.rewards-definitions.test.ts` imports it). Admin snapshots: update deliberately.
5. Partner Dashboard: `RewardRow.tsx` / `RewardsSection.tsx` — summary under the prize.
6. Gates (sequential): `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`; then the
   `verify` skill for screenshots; run `npm run test:pwa-contract` only if landscape bingo CSS is
   touched (it shouldn't be).
7. Write `docs/reward-descriptions-plan_PHASE_3_HANDOFF.md` and update the plan's status line.
