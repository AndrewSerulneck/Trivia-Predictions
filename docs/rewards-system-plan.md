# Rewards System — Implementation Plan

> **Status:** Planning. No code written yet.
> **Owner:** Andrew
> **Created:** 2026-07-20

## 1. Summary

We are consolidating three overlapping concepts — the venue-home **Challenges** panel,
admin **Challenge Campaigns**, and the Partner Dashboard **Competitions** — into a single
customer-loyalty system called **Rewards**.

A **Reward** is a pre-set challenge a venue offers its guests: complete a requirement
(e.g. *"Earn 500 points in Live Trivia this week"*) within a time window and win a prize
(a discounted menu item or a gift card). Admins and partner venues don't author rewards
free-form — they pick from a **slate of pre-built reward definitions** and fill in a few
constrained choices (cadence, prize, quantity). The first definition is the
**Live Trivia Challenge**.

### Key architectural finding

This is **not a greenfield build.** The existing `challenge_campaigns` **progress mode**
already implements the core mechanic almost exactly:

- First user(s) to cross a point threshold within a time window/cycle win.
- One-time and recurring (daily/weekly/monthly/yearly) cadences.
- Prize storage, redemption ledger (`challenge_campaign_redemptions`), per-cycle winner
  ledger (`challenge_cycle_winners`), progress-gauge cards, and win notifications.

Rewards is therefore a **rename + constrained-wizard + multi-winner + richer-prize
extension** of `challenge_campaigns`, reusing the backend. See
[`lib/challengeCampaigns.ts`](../lib/challengeCampaigns.ts) (esp. the progress-mode win
path around line 1430), [`lib/ownerCompetitionTemplates.ts`](../lib/ownerCompetitionTemplates.ts)
(the template-registry pattern we mirror), and
[`components/venue/VenueChallengesPanel.tsx`](../components/venue/VenueChallengesPanel.tsx).

### Decisions locked (from clarifying Q&A, 2026-07-20)

1. **Unified** — reuse `challenge_campaigns` as the backend; the new **Create Reward**
   wizard **replaces** both the admin Challenges form and the owner Competitions template
   gallery. One system, one wizard, surfaced in both admin and the Partner Dashboard.
2. **Redemption = in-app coupon + staff-taps-redeemed.** Winner sees the reward as a
   coupon on the Redeem Prizes page; staff visually verify and mark it redeemed (or it
   expires). No POS / gift-card issuance integration in this scope.
3. **Recurring quota resets per cycle; repeat winners allowed.** A weekly reward with 5
   available crowns the first 5 to hit the threshold each week; a prior winner can win
   again next cycle.
4. **Leaderboard mode retired from creation.** New rewards are threshold+quantity
   (progress) only. In-flight leaderboard campaigns finish their current cycle naturally
   but their standings are no longer rendered on the venue panel.

## 2. The reward creation flow (normalized)

The spec's steps had duplicate numbering; here is the canonical linear wizard the plan
implements. It is one shared component used by **both** the admin UI and the Partner
Dashboard.

1. **Create Reward** → show the slate of reward definitions. First (only, for now):
   **Live Trivia Challenge**.
2. **Cadence** (definition-gated). The Live Trivia Challenge requires the venue to already
   have **Live Trivia scheduled**.
   - If Live Trivia is scheduled on **multiple days** → ask: **daily / weekly / monthly /
     yearly** competition.
   - If Live Trivia is on a **recurring** schedule → ask: **one-off** or **recurring**.
   - If Live Trivia is **not scheduled** → block with a clear message + link to schedule it.
3. **Prize type** → **Menu Item** or **Gift Card**.
   - **Menu Item** → choose item: *Whole Order · Appetizer · Entrée · Dessert · Bottle of
     Wine · Other (free-text name)* → choose **Dollar amount** or **Percentage discount**
     → enter the value. (e.g. *50% off Appetizer*.)
   - **Gift Card** → enter the dollar amount.
4. **Quantity** → how many of this prize are available per the competition's time frame
   (e.g. award the first 1 vs. first 5 users to reach the threshold that week).
5. **Confirm** → the reward card appears on that venue's **Rewards** panel with a progress
   gauge.

### Player-facing lifecycle on the card

- **In progress:** gauge fills toward the threshold.
- **Won (this user):** card flips to a "→ Check your Redeem Prizes page" state; the reward
  lands in [`/redeem-prizes`](../app/redeem-prizes/page.tsx) as a coupon.
- **Quota exhausted (this user didn't win):** card shows a message congratulating the
  winner(s) and noting all of that reward have been claimed.

## 3. Backend model changes

### 3a. `challenge_campaigns` new columns (new migration — additive, backward-compatible)

| Column | Type | Purpose |
|---|---|---|
| `winner_quota` | `int not null default 1` | Winners per cycle (one-time = total). Drives multi-winner + "all claimed". |
| `reward_definition_id` | `text null` | Which preset created it (`'live_trivia_challenge'`). Powers glyph/rendering + future filtering. |
| `prize_kind` | `text null` | `'menu_item' \| 'gift_card'`. |
| `prize_menu_item` | `text null` | `'whole_order' \| 'appetizer' \| 'entree' \| 'dessert' \| 'wine_bottle' \| 'other'`. |
| `prize_menu_item_name` | `text null` | Free-text label when `prize_menu_item = 'other'`. |
| `prize_discount_kind` | `text null` | `'dollar' \| 'percent'` (menu-item prizes). |
| `prize_discount_value` | `numeric null` | Dollar or percent value. |
| `prize_gift_card_amount` | `numeric null` | Gift-card dollar amount (may reuse existing `prize_gift_certificate_amount`). |

The legacy `prize_type` / `prize_gift_certificate_amount` columns stay for existing rows;
the mapping layer reads new fields first and falls back to legacy so in-flight campaigns
still render.

**Phase 2 as-built (2026-07-20):**
- Migration `supabase/migrations/20260720120000_rewards_prize_and_quota.sql` (additive,
  idempotent `add column if not exists`; **applied 2026-07-20** — confirmed via
  `supabase migration list`).
- Gift-card dollar amount **reuses** the existing `prize_gift_certificate_amount` column
  (no separate `prize_gift_card_amount` column) — set by either a legacy `gift_certificate`
  prizeType or a new `gift_card` prizeKind.
- `resolveRewardPrize()` in `lib/challengeCampaigns.ts` derives the new-model fields from
  legacy `prize_type` when `prize_kind` is null (`gift_certificate`→gift_card;
  `free_appetizer`→100% off appetizer; `wine_bottle`→100% off wine bottle), so downstream
  renderers (Phase 6) always see one consistent prize shape.
- `ChallengeCampaign.winnerQuota` is **required** (defaults to 1 everywhere) — new fixtures
  must set it.
- ⚠️ **Phase 3 gate to fix:** the win engine currently gates redemption creation on
  `if (campaign.prizeType)` (4 sites in `challengeCampaigns.ts`). New-model rewards have
  `prizeType = null` but `prizeKind` set, so Phase 3 must replace that gate with a "has any
  prize" predicate (legacy `prizeType` **or** new `prizeKind`) or those rewards won't mint
  coupons. No new-model prizes exist until the Phase 5 wizard ships, so this is inert today.

### 3b. Multi-winner engine

`challenge_cycle_winners` becomes the **canonical winners ledger for both cadences**:
recurring uses the real `cycle_start`; one-time uses the existing epoch sentinel
(`new Date(0)`). Winner recording changes from "first only" to **count-based against
`winner_quota`**:

> On threshold cross: if `count(winners for this cycle) < winner_quota` and this user
> hasn't already won this cycle → insert winner, create redemption row + notification.
> When the count reaches `winner_quota`, mark the campaign/cycle **exhausted**.

**Correctness is the crux of this phase.** The cap must be enforced atomically to avoid
over-awarding under concurrent submissions. Approach: a `unique (challenge_id, cycle_start,
winner_user_id)` constraint (prevents a user double-winning a cycle) plus a
count-guarded conditional insert implemented as a **Postgres function / RPC** so the
count-and-insert is a single atomic statement (the current single-winner path already
leans on `ON CONFLICT DO NOTHING`; we extend that idea to N). Vitest coverage must include
the quota boundary and concurrent-cross races.

**Phase 3 as-built (2026-07-20):**
- Migration `supabase/migrations/20260720130000_rewards_multi_winner.sql` (**applied
  2026-07-20** — confirmed via `supabase migration list`): re-keys `challenge_cycle_winners` from
  `unique(challenge_id, cycle_start)` → `unique(challenge_id, cycle_start, winner_user_id)`
  and adds the `award_cycle_winner(...)` RPC.
- **`award_cycle_winner` RPC** (`security definer`, granted to `service_role`) does the
  atomic count-guarded insert. Concurrency is serialized by a transaction-scoped
  `pg_advisory_xact_lock` keyed on `(challenge_id, cycle_start)`, so N concurrent
  crossings can never over-award past `winner_quota`. Returns `(won, exhausted)`.
- **One unified engine, not a flagged fork.** Because the migration's constraint swap
  applies regardless of the flag, the pre-Rewards recurring `ON CONFLICT` insert no longer
  caps a cycle — so **both** cadences now go through `awardCycleWinner()` →
  `award_cycle_winner` RPC. `applyChallengeCampaignPoints` clamps the quota to **1 when
  `NEXT_PUBLIC_REWARDS_ENABLED` is off** (`effectiveQuota = isRewardsEnabled() ?
  campaign.winnerQuota : 1`), so flag-off is observably exactly today's single-winner
  behavior. Flag lives in the new client-safe `lib/rewardsFlags.ts` (`isRewardsEnabled()`).
- **Ledger is now canonical for BOTH cadences:** one-time uses the epoch sentinel
  `new Date(0)` cycle_start; recurring uses the real cycle. A one-time reward that fills its
  quota is deactivated (`is_active = false`); `winner_user_id` is retained only as a
  non-null "resolved/exhausted" marker (§7) — the admin one-time winner column still reads
  it, and the admin cycle-winners history panel only fetches for recurring campaigns, so
  the new one-time epoch ledger row is inert for flag-off display.
- **Phase-2 prize gate fixed:** the 4 `if (campaign.prizeType)` sites now call
  `campaignHasPrize(campaign)` (legacy `prizeType` **or** new `prizeKind`), so new-model
  rewards mint coupons + notifications.
- Vitest: `tests/lib.rewards-multi-winner.test.ts` — quota boundary, duplicate-win,
  concurrent-cross (Promise.all, exactly-quota), recurring per-cycle reset, and the
  prize-gate fix. The fake `award_cycle_winner` mirrors the SQL's count-guard.

## 4. Reward definition registry

New client-safe module `lib/rewardDefinitions.ts`, mirroring
[`lib/ownerCompetitionTemplates.ts`](../lib/ownerCompetitionTemplates.ts) (no `server-only`
import; shared by the wizard UI and the server expansion). Each definition declares its
game type, requirement copy, threshold options, required scheduled game, glyph/accent, and
cadence rules.

```
REWARD_DEFINITIONS = [
  {
    id: "live_trivia_challenge",
    name: "Live Trivia Challenge",
    gameType: "live-trivia",
    challengeMode: "progress",
    requiresScheduledGame: "live-trivia",
    requirementTemplate: "Earn {threshold} points in Live Trivia",
    thresholdOptions: [300, 500, 750, 1000],   // or free entry
    accent: "trivia",
    glyph: "🧠",
  },
]
```

**Adding a future reward = one entry here + (only if it needs a new game) a schedule
lookup.** This is the process to document in Phase 7.

**Phase 4 as-built (2026-07-20):**
- **`lib/rewardDefinitions.ts`** (client-safe, mirrors `ownerCompetitionTemplates.ts`):
  `REWARD_DEFINITIONS` with the `live_trivia_challenge` preset (`gameType: "live-trivia"`,
  `challengeMode: "progress"`, `requiresScheduledGame: "live_trivia"`, `thresholdOptions`,
  glyph/accent), `getRewardDefinition`, `renderRewardRequirement`, and
  `SUPPORTED_REWARD_CADENCES = ["none", "weekly"]` (+ `isSupportedRewardCadence`).
- **Live Trivia schedule source of truth = the `trivia_schedules` table**, read via
  `lib/liveShowdownAdmin.listAdminLiveShowdownSchedules()` (returns `venueId`,
  `recurringType`, `recurringDays`, `startTime`, `timezone`).
- **`lib/rewards.ts`** (server, mirrors `ownerCompetitions.ts`):
  - `getVenueLiveTriviaSchedules(venueId)` — filters the admin schedule list to the venue.
  - `resolveRewardCreationContext(venueId, definitionId)` — gates on the required game
    being scheduled (blocks with `REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE` otherwise) and
    derives `allowedCadences`: `["none"]` for a one-off schedule, `["none", "weekly"]` when
    the schedule recurs. `scheduleDays` = `recurring_days` or the start_time weekday (the
    weekly-cycle anchor).
  - `createReward(params)` — validates definition/cadence/threshold/quantity/prize, then
    expands into `createChallengeCampaign`: weekly → `single_day` + `recurringType "weekly"`
    anchored on `activeDays = scheduleDays` (so the multi-winner quota resets each week);
    one-off → `recurringType "none"`, `activeDays: []`. Stamps `rewardDefinitionId` +
    `winnerQuota` + the Phase-2 prize-model fields. Sentinel messages for the route layer.
- **Cadence scope:** only `none` + `weekly` are offered — `computeCycleStart` is
  weekly-anchored, so daily/monthly/yearly cycle resets await the engine extension noted in
  §7 and are deliberately withheld rather than shipped subtly wrong.
- Vitest: `tests/lib.rewards-definitions.test.ts` (registry, cadence resolution incl.
  timezone-derived weekday, createReward expansion field-shape + all validation paths).

## 5. Surfaces touched

- **Venue home Rewards panel** — [`components/venue/VenueChallengesPanel.tsx`](../components/venue/VenueChallengesPanel.tsx)
  → rename to Rewards, delete the leaderboard-mode branch, add multi-winner card states.
  Card DTO ([`components/venue/venueHubShared.tsx`](../components/venue/venueHubShared.tsx))
  + the bootstrap that builds `challengeCards` gain `winnerUsernames`, `quotaRemaining`,
  and the new prize shape.
- **Admin** — [`components/admin/sections/ChallengesSection.tsx`](../components/admin/sections/ChallengesSection.tsx)
  (1285 lines) → becomes the Rewards section hosting the shared wizard + reward list.
- **Partner Dashboard** — [`app/owner/competitions/page.tsx`](../app/owner/competitions/page.tsx)
  → Rewards page; the `CompetitionForm` template gallery is replaced by the shared wizard.
  Server expansion parallels [`lib/ownerCompetitions.ts`](../lib/ownerCompetitions.ts).
- **Redeem Prizes** — [`components/prizes/PrizeWalletPanel.tsx`](../components/prizes/PrizeWalletPanel.tsx)
  → render the new prize shapes (menu item + dollar/percent, gift card).
- **Naming** — panel/tab labels, [`lib/pageNames.ts`](../lib/pageNames.ts), nav.

### Phase 5 as-built (2026-07-20)

- **`components/rewards/CreateRewardWizard.tsx`** — the ONE shared component (definition →
  cadence/threshold → prize → quantity → confirm), used by both hosts. It owns step flow +
  validation only; it does not know about `/api/admin` vs `/api/owner/rewards` — each host
  passes its own `fetchContext` (hits `resolveRewardCreationContext`) and `onSubmit` (hits
  `createReward`). No manual date/time entry — the window comes entirely from the venue's
  Live Trivia schedule via the Phase 4 context resolver. The two hosts have different visual
  systems (admin = plain slate/white Tailwind, Partner Dashboard = dark `ht-*` tokens), so a
  `variant: "admin" | "owner"` prop swaps a small class-token map rather than forking the
  component or inventing a third design system.
- **Owner routes:** `POST /api/owner/rewards` (create, owner-auth + venue-ownership gated,
  mirrors `/api/owner/competitions`) and `GET /api/owner/rewards/context` (cadence
  resolution for wizard Step 2).
- **Admin routes:** extended `app/api/admin/route.ts` with `resource: "rewards"` (POST,
  `createdByOwnerId: null`) and `resource: "reward-context"` (GET), mirroring the existing
  `challenge-campaigns` pattern 1:1.
- **`app/owner/competitions/page.tsx` → Rewards page:** `OwnerShell` title/subtitle renamed
  to Rewards copy; the `CompetitionForm` template gallery (3 steps of raw date/time/prize
  fields) is deleted entirely and replaced by `<CreateRewardWizard variant="owner" .../>`.
  Listing/delete/`CompetitionList` render are UNCHANGED — they already operate generically
  over `challenge_campaigns` rows regardless of whether a template or the new wizard created
  them, so no new list endpoint was needed. `glyphForCompetition` now checks
  `rewardDefinitionId` first (via the Phase 4 registry) before falling back to the retired
  `OWNER_COMPETITION_TEMPLATES` matching, so both eras render correctly side by side.
- **`components/admin/sections/ChallengesSection.tsx`:** the `mode === "create"` branch now
  renders `<CreateRewardWizard variant="admin" .../>`; `mode === "edit"` keeps the original
  1285-line raw-field form untouched (editing legacy/leaderboard-mode campaigns is out of
  scope for a wizard that only creates NEW rewards). List, pagination, bulk actions, and
  cycle-winner history panels are unchanged.
- **Venue selection:** the wizard shows a venue-picker step only when `venues.length > 1`
  and no `defaultVenueId` is supplied. The owner host always passes a length-1 `venues`
  array (venue already chosen via the page's own dropdown above the wizard), so it never
  re-asks; the admin host passes its full venue list and only supplies `defaultVenueId` when
  its own venue filter isn't `"all"`.
- Verified: `npx tsc --noEmit`, `npm run test` (583 passing), `npm run test:god-mode-join`,
  `npm run build` (confirms no `server-only` leakage from `lib/rewards.ts`'s type-only
  `RewardPrizeInput` import into the client wizard bundle), and a route-reachability smoke
  check (dev server + curl: new routes 401 unauthenticated as expected, not 500; owner
  Rewards page 200s with no compile errors). **Not yet done:** a full authenticated
  browser click-through of the wizard end-to-end (owner + admin login) — deferred to the
  Phase 7 `verify`-skill E2E pass per the plan's own phasing.

### Phase 6 as-built (2026-07-20)

- **The core gap this phase closed:** the panel's win/exhausted state previously read
  campaign-level `winnerUserId`, which (per §7) never identifies "the winner" once
  `winnerQuota > 1` — for recurring rewards it isn't even set. `getChallengeCampaignSnapshotForUser`
  (`lib/challengeCampaigns.ts`) now resolves each progress-mode campaign's **current cycle**
  from the `challenge_cycle_winners` ledger via a new `getCurrentCycleWinnerState` helper
  (one-time → epoch sentinel; recurring → `computeCycleStart` for "now"), reusing
  `listChallengeCycleWinners`. Each card in the snapshot gains `viewerWon` (is the requesting
  user among this cycle's winners), `winnerUsernames` (oldest-first, this cycle only), and
  `quotaRemaining` (`winnerQuota` minus this cycle's winner count, floored at 0).
  `prizeClaimedAt` is now looked up per `(challengeId, userId, cycleStart)` instead of a
  campaign-wide `claimed_at` — a user's claim in one cycle no longer bleeds into another.
- **Types:** `ChallengeCampaign` / `ChallengeCampaignCard` (`components/venue/venueHubShared.tsx`)
  gained `winnerUsernames`, `quotaRemaining`, `viewerWon` (+ `winnerQuota` on the card DTO).
  `ChallengeCampaignWin` (`types/index.ts`) gained the Phase-2 prize-model fields
  (`prizeKind`/`prizeMenuItem`/`prizeMenuItemName`/`prizeDiscountKind`/`prizeDiscountValue`)
  so redemption reads carry the same shape as campaign reads.
  `resolveRewardPrize`'s parameter was widened to a `Pick<...>` row shape so
  `listChallengeCampaignWinsForUser` (a narrower `challenge_campaigns` select) can reuse the
  same legacy-fallback derivation instead of re-deriving it inline.
- **`components/venue/VenueChallengesPanel.tsx`:** the three-state card render is now
  `viewerWon` (You Won → tap to claim, unchanged copy) / `!viewerWon && quotaRemaining <= 0`
  ("All Claimed" chip + "Congrats to `<usernames>` — the/all prize(s) for this cycle
  has/have been claimed.") / otherwise the progress gauge. `VenueHubClient`'s
  `challengeBadgeCount` switched from `winnerUserId === currentUserId` to `viewerWon`.
- **`components/prizes/PrizeWalletPanel.tsx`:** fixed a real bug where the `activeChallengeWins`
  filter required a legacy `prizeType`, silently hiding every new-model reward win (which
  carries `prizeKind` with `prizeType = null`) from the Redeem Prizes page. `ChallengeCoupon`
  now dispatches on `prizeKind` first (`gift_card` → renamed `GiftCardCoupon`; `menu_item` →
  new `MenuItemCoupon`, which keeps the existing rose/emerald theming for `wine_bottle`/
  `appetizer` and uses a generic indigo theme for entrée/dessert/whole-order/other, with a
  `discountLabel` helper rendering `"50% OFF"` / `"$10.00 OFF"` / `"FREE"` for 100% discounts),
  falling back to the legacy `prizeType` renderers only as a safety net (the backend always
  derives `prizeKind` now, so that path is normally dead).
- **`components/challenges/ChallengeRedeemPanel.tsx`** (the per-challenge claim page at
  `/venue/[venueId]/redeem`) was left untouched — it only renders progress gauges and a
  claim button, never a prize shape, so it was out of this phase's scope.
- Vitest: new `tests/lib.rewards-cycle-snapshot.test.ts` (5 tests) covers the gauge / you-won /
  quota-exhausted-congrats states, per-cycle `prizeClaimedAt` isolation between viewers, and
  that a recurring campaign's winner list resets on a new weekly cycle rather than leaking a
  prior cycle's winner. Verified: `npx tsc --noEmit`, `npm run test` (588 passing), `npm run lint`
  (pre-existing unrelated errors only — none introduced by this phase).

### Phase 7 as-built (2026-07-20)

- **Docs:** new `AGENTS.md` (repo root) documents the "add a new reward" process end to
  end; `CLAUDE.md` gained a "Rewards System" section (registry-driven creation, shared
  wizard, atomic multi-winner RPC, `NEXT_PUBLIC_REWARDS_ENABLED` convention, in-app-coupon
  redemption model); `SYSTEM_CONTEXT.md` renamed Challenges→Rewards throughout (§0 essence,
  §2 prize flow, §9 admin section list), rewrote §8 from "Upcoming — Not Yet Built" to the
  built system, and added a Rewards contract to §12's constraints list.
- **Migrations confirmed applied:** `supabase migration list` shows both
  `20260720120000_rewards_prize_and_quota.sql` and `20260720130000_rewards_multi_winner.sql`
  present in both local and remote columns — the "not yet applied" caveats in §3a/§3b are
  now stale and corrected in place.
- **E2E verify (real Supabase, real dev server, Playwright):** seeded a throwaway venue
  (`sim-rewards-e2e`) with a weekly Live Trivia schedule, called `createReward()` directly
  for a Live Trivia Challenge (weekly, 300-pt threshold, 50%-off-Appetizer menu-item prize,
  `winnerQuota: 3`), then drove 5 real seeded users past the threshold via
  `applyChallengeCampaignPoints`. Confirmed at the database layer: exactly 3 winners
  recorded in `challenge_cycle_winners` (4th/5th correctly `won: false`), 3 matching
  `challenge_campaign_redemptions` rows with the correct prize shape. Confirmed in the
  browser: the winner's Rewards panel card shows "YOU WON" / "PRIZE CLAIMED", their
  `/redeem-prizes` page renders the "50% OFF APPETIZER" coupon, and a non-winner's card
  shows "ALL CLAIMED — Congrats to `<the 3 winners>`."
- **Real bug found and fixed by this verification pass:** `getChallengeCampaignSnapshotForUser`
  (the function powering the Rewards panel + redeem page) compared `challenge_cycle_winners.cycle_start`
  (a Postgres/PostgREST timestamptz rendered as `"...+00:00"` text) against a JS
  `Date.toISOString()` value (`"...Z"`, millisecond-padded) using **string equality**. The two
  never matched for a real database row, so every winner showed as a non-winner (`viewerWon`
  false, `quotaRemaining` never decremented, `winnerUsernames` always empty, `prizeClaimedAt`
  always null) despite the ledger being correct — a real user would never see they'd won.
  Phase 6's own unit tests didn't catch this because their fixtures mocked `cycle_start` using
  `.toISOString()` too, matching by construction. **Fixed** in `lib/challengeCampaigns.ts`
  (`getCurrentCycleWinnerState` and the `claimedAtByKey` lookup in
  `getChallengeCampaignSnapshotForUser`) by comparing `new Date(...).getTime()` instead of raw
  strings. Re-verified against the same seeded data after the fix (all three winners, quota,
  and claimed-at now resolve correctly) and confirmed all existing Vitest suites (incl.
  `tests/lib.rewards-cycle-snapshot.test.ts`) still pass.
- Full suite green post-fix: `npx tsc --noEmit`, `npm run test` (588/588, 6 intentionally
  skipped), `npm run test:god-mode-join`.

## 6. Phases

Each phase is independently shippable and leaves the app green (`npx tsc --noEmit`,
`npm run test`, `npm run test:god-mode-join`). **Recommendation: gate the new wizard +
multi-winner behavior behind a reversible `NEXT_PUBLIC_REWARDS_ENABLED` flag** (same
convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`): off = today's Challenges/Competitions
behavior, fully inert. The rename is a straightforward cutover and need not be flagged.

| Phase | Scope | Model | Effort |
|---|---|---|---|
| **1. Rename + strip leaderboards** ✅ **DONE (2026-07-20)** | Rename Challenges→Rewards in panel, tabs, page names, admin + partner nav. Delete the leaderboard render branch (progress gauges only). Stop offering leaderboard mode in creation; in-flight ones finish naturally. | **Sonnet 5** | **Low** — mechanical, well-scoped, no schema. |
| **2. Data model: prizes + quota** ✅ **DONE (2026-07-20, migration applied)** | New additive migration (§3a). Extend `@/types`, `mapCampaignRow`, create/update paths in `challengeCampaigns.ts` with legacy fallback. | **Opus 4.8** | **Medium** — strict-typed mapping + backward-compat correctness. |
| **3. Multi-winner engine** ✅ **DONE (2026-07-20, migration applied)** | Count-based quota via `challenge_cycle_winners` ledger for both cadences; atomic cap (RPC + unique constraint); per-winner redemption + notification; exhausted state. Vitest: quota boundary, concurrent-cross race, duplicate-win. | **Opus 4.8** | **High** — concurrency correctness; real prizes at stake. |
| **4. Reward registry + Live Trivia preset** ✅ **DONE (2026-07-20)** | `lib/rewardDefinitions.ts` + server `createReward()` expansion. Read the venue Live Trivia schedule to gate creation and derive cadence options. *(First task: locate the Live Trivia schedule source of truth.)* | **Opus 4.8** | **Medium** — schedule lookup + expansion logic. |
| **5. Create Reward wizard (shared UI) + admin/partner wiring** ✅ **DONE (2026-07-20)** | Shared multi-step wizard (definition → cadence → prize → quantity → confirm). Replace admin Challenges form + owner Competitions gallery. API routes (`/api/owner/rewards`, admin equivalent). | **Sonnet 5** | **Medium-High** — UI-heavy, two host surfaces, but no novel logic. |
| **6. Panel card states + Redeem Prizes rendering** ✅ **DONE (2026-07-20)** | Multi-winner card states (gauge / you-won→redeem / quota-exhausted congrats-to-winners). Card DTO + bootstrap additions. `PrizeWalletPanel` renders new prize shapes. | **Sonnet 5** | **Medium** — display logic + data plumbing. |
| **7. Docs + process capture + E2E verify** ✅ **DONE (2026-07-20)** | Document "how to add a new reward" in **AGENTS.md** (new), **CLAUDE.md**, **SYSTEM_CONTEXT.md**. End-to-end browser verify with the `verify` skill (create Live Trivia reward, multi-winner win, redeem coupon). | **Sonnet 5** | **Low-Medium**. |

### Suggested build order note

Phases 2 and 3 are the risk core and should land (with tests) before the UI in 5–6 so the
wizard writes into a proven backend. Phase 1 can ship first as an immediate visible win.

## 7. Open considerations / risks

- **Live Trivia schedule source** — ✅ RESOLVED (Phase 4): the `trivia_schedules` table,
  read via `lib/liveShowdownAdmin.listAdminLiveShowdownSchedules()` and filtered to the
  venue by `getVenueLiveTriviaSchedules` in `lib/rewards.ts`. (Scheduling is admin + owner
  per the Partner Dashboard direction — `lib/ownerSchedule.ts` writes the same table.)
- **`winner_user_id` semantics** — with multiple winners, the campaign-level
  `winner_user_id` column no longer means "the winner." Keep it only as a one-time
  quota-exhausted marker (or stop reading it and derive exhaustion from the ledger count);
  audit every current read of `winnerUserId` in the panel and admin.
- **Yearly cadence** — `CampaignRecurringType` already includes `'yearly'`, but verify the
  cycle math in `computeCycleStart` / `computeCycleEnd` handles a 1-year period (the
  `getLeaderboardSnapshotForCampaign` period map only covers daily/monthly/weekly — extend
  if yearly rewards are actually offered).
- **Existing owner Competitions** — leaderboard-mode competitions created before cutover
  keep running; confirm they resolve cleanly with the leaderboard render removed.
- **Prize expiry** — reuse the existing 7-day `prize_expires_at` default unless a
  per-reward expiry is wanted.

## 8. Definition of done

- A partner can create a Live Trivia Challenge (50% off Appetizer, first 5 winners weekly)
  from their phone in the Partner Dashboard, contingent on Live Trivia being scheduled.
- The reward appears as a progress-gauge card on that venue's Rewards panel.
- Multiple users crossing the threshold each win (up to quota); each sees a redeemable
  coupon in Redeem Prizes; staff can mark it redeemed.
- Once quota is exhausted, non-winners see the congrats/all-claimed message.
- No per-challenge leaderboards render on the panel.
- Adding the *next* reward is a documented one-entry-in-the-registry process.
```
