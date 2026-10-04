# Reward Descriptions Review Fixes — Phase 1 Handoff

**Phase:** 1 of 6 — "One source of truth" (F8, F9, F1). **Done 2026-10-04.**
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line updated to point here).

---

## For Andrew (plain English)

**What changed:**
- **The wizard's NFL preview no longer lies.** When a partner creates an "every week" NFL reward
  mid-season, the "What guests will see" box used to say "Starts Thu, Oct 8" while guests would
  actually see "A new contest starts every Thursday". The box and the venue page now use the
  exact same rule, so they always say the same thing.
- **One rule for a reward's terms.** How often a reward resets, which days it counts, and how many
  prizes it gives out was worked out in three separate places (the preview, the Create button, and
  the server). It is now worked out in one place, so they can't drift apart. Nothing a partner
  creates comes out differently — tests prove the old and new results match.
- **One "what time zone is this venue in" lookup** instead of two that behaved differently. It now
  remembers the answer for 10 minutes instead of forever, so a time-zone change takes effect
  within 10 minutes instead of only after a server restart. Cost effect is negligible (at most a
  few tiny reads per venue per hour per server); some screens that used to look it up every time
  (leaderboards, NFL Pick 'Em) now look it up less.
- Removed one leftover function nothing used.

**Is it live?** No. Nothing is committed, pushed or deployed. The earlier reward-wording commits
(`3998529`, `ee64a3d`) are also still only on this computer.

**What's left:** Phases 2–6 of the plan. Phase 2 can start now. Phases 3, 4 and 5 each need one
answer from you (D1, D3, D2 in §4 of the plan) — "use the defaults" covers all three.

**One new small finding (F11, added to Phase 2):** at a venue whose only Live Trivia game is a
one-off, the "What guests will see" box doesn't appear at all. Creating the reward still works.
I left it as-is because this phase must not change behaviour.

---

## For the next agent

### 1. Next phase: goal and scope

**Phase 2 — Composer state fixes (F4, F10, F11).** Model/effort per plan: **Sonnet 5.5, high.**
Read §2 (findings table) and §3 Phase 2 of the plan; they are the spec.

- **F4** — `nextContestLine` (`lib/rewardDescription.ts`, search `const nextContestLine` /
  "Next contest starts") must return null when the campaign is inactive or its `endDate` is before
  the next cycle start. Keep the normal When line otherwise; no new copy.
- **F10b** — a pinned game-winner slot must only resolve while its schedule is still weekly and its
  `recurring_days` still include that weekday; otherwise the approved fallback "Check the Live
  Trivia schedule for the next game."
- **F10a** — read-only production check that `trivia_schedules.recurring_type` /
  `recurring_days` exist; expected result is "no change needed" + a one-line code comment.
- **F11** — show the wizard guest preview for one-off-only venues (details in plan §3 Phase 2
  step 4).

**Out of scope for Phase 2:** F2/F5 (Phase 3, needs D1), F6/F7 (Phase 4, needs D3), F3 polling
cache (Phase 5, needs D2), commit/push/deploy (Phase 6 / Andrew).

### 2. Starting state

- Branch `main`. HEAD = `ee64a3d` ("Reward descriptions: Phase 4 handoff and plan status").
  `main` is **2 commits ahead of `origin/main`** (`3998529`, `ee64a3d`) — neither pushed nor deployed.
- **Phase 1 is entirely uncommitted** in the working tree. Modified: `components/rewards/CreateRewardWizard.tsx`,
  `components/venue/venueHubShared.tsx` (comment only), `lib/challengeCampaigns.ts`,
  `lib/nflPickEmRewardWeeks.ts`, `lib/rewardDescription.ts` (comment only), `lib/rewardTerms.ts`,
  `lib/rewards.ts`, `lib/timezone.ts`, and tests `tests/components.create-reward-wizard.test.ts`,
  `tests/lib.nfl-pickem-reward-weeks.test.ts`, `tests/lib.reward-terms.test.ts`,
  `tests/lib.rewards-definitions.test.ts`, `tests/lib.rewards-nfl-upcoming.test.ts`.
  New: `tests/lib.timezone-venue-cache.test.ts`, this handoff. The plan file itself
  (`docs/reward-descriptions-review-fixes-plan.md`) is also untracked, as are three unrelated
  untracked docs (`docs/pos-rewards-integration-plan.md`, `docs/reward-live-redemption-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`) — not part of this work; leave them alone.
- **Do not `git checkout -- <file>` / `git stash` to undo anything** — it wipes all uncommitted
  Phase 1 work in that file (this has happened before in this repo). Undo by editing.
- No database changes, no migrations, no production writes, no env changes. No production reads
  were needed in Phase 1.

### 3. Decisions already made (don't re-ask)

- Andrew's D1–D3 are **still pending** (plan §5). Phase 2 does not need them.
- Copy in `docs/reward-descriptions-plan.md` §3 is approved by Andrew; never invent new guest
  sentences — ask first.
- Phase 1 was a no-behaviour-change refactor except F1 (preview now matches server) and the
  timezone cache semantics (forever → 10 min, success-only). Andrew was not asked about the
  10-minute TTL; the plan allowed "≤10 min" and it is cheaper than or equal to before in every path.
- Did **not** commit: the plan defers commit to Phase 6 and the user's rules say commit only on
  request.

### 4. Files changed and how they fit

| File | Change |
|---|---|
| `lib/timezone.ts` | `getVenueTimezone(venueId)` is the **only** exported venue-timezone reader. Trims the id and the value, defaults to `America/New_York`. New per-instance cache: `VENUE_TIMEZONE_CACHE_TTL_MS = 10 min`, successes only (an `error` from Supabase returns the default and is not cached). New test hook `clearVenueTimezoneCache()`. |
| `lib/challengeCampaigns.ts` | Deleted its own `getVenueTimezone` + forever `venueTimezoneCache`; now imports from `@/lib/timezone`. Callers unchanged: `getLeaderboardSnapshotForCampaign` (~1047), cycle sweep (~1162), `getActiveChallengeMultiplier` (~1890), point accrual (~2045), snapshot (~2397). |
| `lib/rewardTerms.ts` | New `deriveRewardTerms({ nflTerms, pickedSlots, sentenceCadence, sentenceQuantity, scheduleDays })` → `{ cadence, activeDays, winnerQuota }` + types `DeriveRewardTermsInput`, `DerivedRewardTerms`. Pure, client-safe. Input types are structural (no import of `rewardGameSlots`/`nflPickEmRewardWeeks`, which both import this file). |
| `lib/rewards.ts` | `createReward` calls `deriveRewardTerms` (replacing three inline ternaries for cadence/winnerQuota/activeDays; validation order unchanged). `getVenueTimezone` now imported from `@/lib/timezone`. `resolveNFLSeasonContext` adds `seasonFirstWeekStartDate`. `applyNFLRewardUpcomingState` (private) now delegates to `nflRewardUpcomingStartDate`. **`attachNFLRewardUpcomingState` deleted** (zero production callers; `attachRewardDescriptions` is the only path). `resolveNFLRewardStartDate` import replaced by `nflRewardUpcomingStartDate`. Cost doc comments updated for the 10-minute cache. |
| `lib/nflPickEmRewardWeeks.ts` | `NFLRewardSeasonContext.seasonFirstWeekStartDate: string \| null` (new, required). New `nflRewardUpcomingStartDate(scope, { campaignStartDate, seasonFirstWeekStartDate }, now: Date)` → YYYY-MM-DD or null; computes Eastern "today" internally (private `nflCalendarToday`, null for an invalid Date). |
| `components/rewards/CreateRewardWizard.tsx` | New `nflTerms`, `pickedSlotTerms`, memoized `derivedTerms` (via `deriveRewardTerms`), shared by `guestPreview` and `handleSubmit`. Preview's NFL start date now `nflRewardUpcomingStartDate(nflScope, { campaignStartDate: nflTerms.startDate, seasonFirstWeekStartDate: nflSeason.seasonFirstWeekStartDate }, now)`. The en-CA "easternToday" hack is gone. Still ONE shared component for admin + owner. |
| `lib/rewardDescription.ts`, `components/venue/venueHubShared.tsx` | Comments only: point at `nflRewardUpcomingStartDate` instead of the deleted export. |

Tests:
- `tests/components.create-reward-wizard.test.ts` — new "submitted terms" block (4 pins of the exact
  `onSubmit` payload: points-target sentence, game picker with `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`
  stubbed on, NFL weekly most-picks, NFL whole season). **These were written and passed against the
  pre-refactor code first.** New "NFL guest preview start date" block (3 tests; the weekly-Tuesday
  one failed before the F1 fix, passes after). Reusable fixtures there: `NFL_CONTEXT`,
  `PICKER_CONTEXT`, `renderForSubmit`, `walkToConfirm`.
- `tests/lib.reward-terms.test.ts` — `deriveRewardTerms` unit tests (6).
- `tests/lib.nfl-pickem-reward-weeks.test.ts` — `nflRewardUpcomingStartDate` (5).
- `tests/lib.rewards-nfl-upcoming.test.ts` — same 8 cases, now through `attachRewardDescriptions`
  with full `ChallengeCampaign` fixtures (`reward()` helper); also asserts the When line.
- `tests/lib.rewards-definitions.test.ts` — season-context expectation gained `seasonFirstWeekStartDate`.
- `tests/lib.timezone-venue-cache.test.ts` (new) — TTL, ≤10 min, trim/default, failure not cached,
  blank id never queries.

### 5. Facts and traps

- `lib/rewardGameSlots.ts` and `lib/nflPickEmRewardWeeks.ts` both import from `lib/rewardTerms.ts`;
  don't import them back into `rewardTerms.ts` (circular). That's why `deriveRewardTerms` takes
  structural input types.
- The wizard's picker renders recurring games as **time chips** in weekday columns (button name is
  just "8:00 PM"); one-off games render their full `label`. Select by `findAllByRole("button",
  { name: "8:00 PM" })`, ordered Sun→Sat.
- `isGamePickerEnabled()` reads `process.env.NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` at call time,
  so `vi.stubEnv(...)` + `vi.unstubAllEnvs()` works in jsdom tests.
- Wizard tests that depend on "today" use `vi.useFakeTimers({ toFake: ["Date"] })` +
  `vi.setSystemTime(...)`; faking only `Date` keeps RTL's `waitFor` working.
- Production NFL weeks may have gaps (e.g. Thu–Mon weeks), so on a Tuesday the server's
  "current, else next" `fromWeek` is NEXT week — that's what produced F1. The fixture in the
  wizard test models it (fromWeekStartDate Thu 2026-10-08, "now" Tue 2026-10-06).
- `guestPreview` still returns null when `!isNFLDefinition && !pickedSlotTerms && !period` —
  that's F11, deliberately untouched in Phase 1.
- In `tests/api.challenge-campaigns-descriptions.test.ts` the timezone read counts still pass with
  the new module-level cache; if you add a test that needs a fresh read, call
  `clearVenueTimezoneCache()` from `@/lib/timezone` in `beforeEach`.
- zsh: `echo =====` errors (`=` expansion). Use `echo ---`.
- Historical docs (`docs/reward-descriptions-plan_PHASE_*_HANDOFF.md`,
  `docs/nfl-pickem-week1-early-access-plan.md`) still mention `attachNFLRewardUpcomingState`; they
  are dated history — leave them.

### 6. Build / run / test

Gates (run sequentially — never typecheck and build at the same time):
```
npx tsc --noEmit
npm run lint
npm run test
npm run build
```
Phase 1 results (2026-10-04): typecheck clean; lint clean (only the usual Babel "deoptimised
lib/sportsBingo.ts" note); **Vitest 287 files passed / 1 skipped, 3,133 tests passed / 13 skipped
/ 0 failed**; build compiled, 180/180 pages generated.

Fast loop for this area:
```
npx vitest run tests/components.create-reward-wizard.test.ts tests/lib.reward-terms.test.ts \
  tests/lib.reward-description.test.ts tests/lib.rewards-nfl-upcoming.test.ts \
  tests/lib.nfl-pickem-reward-weeks.test.ts tests/api.challenge-campaigns-descriptions.test.ts \
  tests/lib.rewards-definitions.test.ts tests/lib.timezone-venue-cache.test.ts
```
Not verified: no browser/device check of the wizard (the preview change is covered by jsdom tests
only); no production measurement of timezone reads.

### 7. Open questions for Andrew

- D1, D2, D3 (plan §4) — needed before Phases 3, 5, 4 respectively. Defaults are documented.
- Whether to commit Phase 1 now or keep accumulating until Phase 6 (plan default: Phase 6).

### 8. Recommended first steps for Phase 2

1. `git status` — confirm the Phase 1 files above are still modified (nothing lost).
2. Run the fast loop above to confirm green.
3. F10a first (one read-only query, e.g.
   `node --env-file=.env.local -e "…supabase-js select('id,recurring_type,recurring_days').limit(1) on trivia_schedules…"`
   — never print env values).
4. F4: read `nextContestLine` and `RewardDescriptionInput` in `lib/rewardDescription.ts`; check
   whether `isActive`/`endDate` already flow through `attachRewardDescriptions` (`...campaign` is
   spread into the input, so they may already be there — just unused).
5. F10b: read slot matching in `lib/rewardDescription.ts` (~line 318 at `ee64a3d`) and
   `enumerateGameSlots` / `toGameScheduleShapes` (`lib/rewards.ts`, uses `rewardRecurringType`).
6. F11: wizard `guestPreview`; reuse the test helpers listed in §4.
7. Gates, then `docs/reward-descriptions-review-fixes-plan_PHASE_2_HANDOFF.md`, then update the
   plan's status line.
