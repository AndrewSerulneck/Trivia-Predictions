# Reward Descriptions Review Fixes — Phase 2 Handoff

**Phase:** 2 of 6 — "Composer state fixes" (F4, F10, F11). **Done 2026-10-04.**
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line updated to point here).

---

## For Andrew (plain English)

**What changed:**
- **Ended or paused rewards stop promising a "next contest".** A reward that is switched off, or
  whose end date has passed, used to be able to say "Next contest starts Thu, Oct 9." once its
  prizes ran out. It now shows its normal "when" line instead. No new wording.
- **A game that changed from weekly to one-time no longer says "every Thursday".** If a partner
  turned a weekly game into a one-off after a reward was tied to it, guests still read
  "8:00 PM every Thursday". Now they read the safe line "Check the Live Trivia schedule for the next
  game." (the reverse — one-off turned weekly — is handled too).
- **The "What guests will see" box now appears for a venue whose only Live Trivia game is a
  one-time game.** Before, the box was blank there even though the reward saved fine.
- **Checked production for the schedule-column worry (F10a): nothing to fix.** The schedule table
  has the recurring-type and recurring-days columns, so I added only a short code comment.

**Is it live?** No. Nothing is committed, pushed or deployed (Phases 1 and 2 are both sitting
uncommitted in the working copy; the two earlier reward-wording commits are also local only).

**Your answers D1–D3:** recorded as "use the defaults" in the plan (§5). No questions are open.

**What's left:** Phases 3–6. Phase 3 can start now.

---

## For the next agent

### 1. Next phase: goal and scope

**Phase 3 — Guest cards and the admin edit form (F5, F2).** Model/effort per plan: **Sonnet 5.5,
medium.** The plan's §3 Phase 3 is the spec; it is already written with Andrew's D1 default:

- **F5** — restore the sentence "Awarded to the winner." on the three guest surfaces **only** when
  `winCondition === "game_winner"` **and** `description.isCustom === true` (legacy hand-written
  text). Definition-based cards stay as they are. Surfaces to find (line numbers drift — search):
  `components/challenges/ChallengeRedeemPanel.tsx` (and its shell
  `ChallengeRedeemPageShell.tsx`), `components/venue/VenueChallengesPanel.tsx` (summary at ~179–182),
  and the reward modal in `components/venue/VenueHubClient.tsx` (~1735–1740 prints
  `selectedChallenge.description.when/fineprint`). Note the plan's older path
  `components/prizes/ChallengeRedeemPanel.tsx` is wrong — it lives in `components/challenges/`.
  Extend `tests/components.reward-descriptions-surfaces.test.ts` (currently tests `RewardRow`
  and static-source assertions; look at how it asserts "Awarded to the winner" is gone — it will
  need to change to "gone for definition-based, present for legacy game_winner").
- **F2** — D1 = **default**: in `components/admin/sections/ChallengesSection.tsx` (Rules textarea
  ~699–703, `formRules` state ~249, set on edit ~557, "Rules are required" check ~590, submitted
  ~597), when the campaign being edited has a known `rewardDefinitionId`, show the composed guest
  wording read-only **in place of** the Rules textarea with the note "Guests see this automatic
  description. Change the schedule, prize or target to change it." Keep submitting the stored
  `rules` unchanged so the required check still passes. Legacy campaigns (no/unknown
  `rewardDefinitionId`) keep the editable textarea. The admin list already receives `description`
  from `attachRewardDescriptions`; reuse it — don't recompute client-side.
  The note text is **new guest-adjacent admin copy** that the plan itself spells out; use it
  verbatim, invent nothing else.

**Out of scope for Phase 3:** F6/F7 (Phase 4), F3 (Phase 5), any commit/push/deploy.

### 2. Starting state

- Branch `main`, HEAD `ee64a3d`; `main` is 2 commits ahead of `origin/main` (`3998529`, `ee64a3d`),
  neither pushed nor deployed.
- **Phases 1 and 2 are both uncommitted** in the working tree (15 files modified, ~750 lines).
  Phase 2 touched: `lib/rewardDescription.ts`, `lib/liveShowdownAdmin.ts` (comment only),
  `components/rewards/CreateRewardWizard.tsx` (one `if` + one dependency),
  `tests/lib.reward-description.test.ts`, `tests/components.create-reward-wizard.test.ts`,
  and the plan file. Untracked docs `docs/pos-rewards-integration-plan.md`,
  `docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `docs/reward-descriptions-review-fixes-plan*.md` — the first three are unrelated to this work;
  leave them alone.
- **Never `git checkout -- <file>` / `git stash`** to undo something — it wipes all uncommitted
  Phase 1+2 work in that file (happened before in this repo). Undo by editing.
- No database changes, migrations, production writes or env changes. One read-only production query
  was run (see §5).

### 3. Decisions already made (don't re-ask)

- **D1, D2, D3 = the defaults** (Andrew, 2026-10-04: "Default is fine" to each). Recorded in plan §5.
  - D1 → Phase 3 as described above.
  - D2 → Phase 5: per-instance TTL cache, 5 min for `loadVenueGameSlots` (key = sorted venue ids),
    10 min for NFL season week dates (key = season), successes only, injectable clock.
  - D3 → Phase 4: no migration; compare `challenge_campaigns.updated_at` with the win time and fall
    back to "Won from: {name}" if the reward was edited after the win. Verify `updated_at` is
    actually bumped on update before relying on it; if not, stop and tell Andrew.
- Copy in `docs/reward-descriptions-plan.md` §3 is approved; no new guest sentences. Phase 2 added
  none (the ended/inactive card keeps its normal When line; a drifted pinned game uses the existing
  "Check the Live Trivia schedule for the next game.").
- Not committed: plan defers the commit to Phase 6 and Andrew's rule is commit-on-request.

### 4. What Phase 2 changed (files and logic)

| Where | Change |
|---|---|
| `lib/rewardDescription.ts` — `RewardDescriptionInput` | Added `"isActive" \| "endDate"` to the optional `Pick` of `ChallengeCampaign`. They already arrive via `attachRewardDescriptions`' `...campaign` spread (`lib/rewards.ts` ~486); no change needed there. The wizard doesn't pass them (not-yet-saved reward = active, no end date). |
| `lib/rewardDescription.ts` — `nextContestLine` | Returns null if `isActive === false` (undefined = active) or if `endDate` is set and the **local calendar date of `nextCycleStart` in the venue/fallback zone** is after `endDate` (inclusive end date, string compare of YYYY-MM-DD). Applies to both the NFL and Live Trivia callers. When null, the existing When line stays (the NFL branch's `?? when`; the schedule branch's `next ? … : description`). |
| `lib/rewardDescription.ts` — `describeScheduleReward` game-winner branch | Pinned slot match now also requires `current.recurring === (input.recurringType !== "none")`. Weekday is implicitly covered because `slotKey` = `scheduleId:weekday` and `enumerateGameSlots` only emits slots for weekdays the schedule still runs on (a one-off emits exactly one slot, on its start weekday). A mismatch → `resolved = null` → "Check the … schedule…" line, weekday-only summary. |
| `lib/liveShowdownAdmin.ts` ~505 | Comment only: why `listVenueLiveShowdownSchedules` has no missing-column fallback. |
| `components/rewards/CreateRewardWizard.tsx` — `guestPreview` | Early-return is now `!isNFLDefinition && !pickedSlotTerms && !period && !isOneOffOnly`; `isOneOffOnly` added to the memo deps. |

Tests added:
- `tests/lib.reward-description.test.ts`: two F10b cases in "schedule no longer matches" (weekly→one-off,
  one-off→weekly) and a new describe "a filled reward that won't run again…" with 5 F4 cases
  (inactive, unknown/true isActive, after endDate, end-date's own day in Chicago vs UTC, NFL inactive).
- `tests/components.create-reward-wizard.test.ts`: "guest preview at a one-off-only venue" (asserts the
  box text AND that submit sends `cadence: "none", winnerQuota: 1`). Verified to **fail** without the F11 fix.

### 5. Facts and traps

- **F10a result (read-only production query, 2026-10-04):** `trivia_schedules` returns
  `recurring_type` and `recurring_days` fine (6 rows: weekly with days, and a `none` with `[]`).
  Verdict: **no change needed** beyond the comment. Pattern for future reads:
  `NODE_PATH=$PWD/node_modules node --env-file=.env.local <script.cjs>` (the script must live in
  the scratchpad dir, and needs NODE_PATH to find `@supabase/supabase-js`). Never print env values.
- **F10b is mirrored on purpose** (one-off reward ↔ now-weekly slot), not just the reported
  direction; same bug, one line.
- A paused reward's `isActive:false` only affects the **next-contest** line. Its summary/fineprint
  are untouched (the plan said "keep the normal When line; no new copy").
- `RewardScheduleSlotFact` (`lib/rewardDescription.ts`) already carries `recurring`, which is what
  F10b reads — no type widening was needed.
- macOS `sed -i` needs `-i ''`; the first attempt in this session errored and did nothing. Prefer
  the Edit tool.
- The game name in `describeReward` copy is "Live Trivia" (not the schedule's title "Trivia Night").
- Phase 1 traps still apply (see Phase 1 handoff §5): `lib/rewardTerms.ts` must not import
  `rewardGameSlots`/`nflPickEmRewardWeeks` (circular); wizard picker time chips; `vi.stubEnv` for
  `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`; fake only `Date` in wizard tests.

### 6. Build / run / test

Gates (sequential — never typecheck and build at the same time):
```
npx tsc --noEmit
npm run lint
npm run test
npm run build
```
Phase 2 results (2026-10-04): typecheck clean; lint clean (only the usual Babel "deoptimised
sportsBingo.ts" note); **Vitest 287 files passed / 1 skipped, 3,141 tests passed / 13 skipped /
0 failed** (+8 over Phase 1); build completed (all routes listed, no errors).

Fast loop for Phase 3:
```
npx vitest run tests/components.reward-descriptions-surfaces.test.ts \
  tests/lib.reward-description.test.ts tests/components.create-reward-wizard.test.ts \
  tests/api.challenge-campaigns-descriptions.test.ts
```
Not verified: nothing in a real browser/device (all jsdom); the F4 `isActive`/`endDate` pass-through
through `attachRewardDescriptions` is covered by reading the spread, not by a dedicated API-level
test — Phase 3 or 6 could add one in `tests/api.challenge-campaigns-descriptions.test.ts` if wanted.

### 7. Open questions for Andrew

None blocking. Still his call: when to commit (plan default: Phase 6) and push/deploy.

### 8. Recommended first steps for Phase 3

1. `git status` — confirm the Phase 1+2 files are still modified (nothing lost).
2. Run the fast loop above to confirm green.
3. Read `tests/components.reward-descriptions-surfaces.test.ts` fully to see how the
   "Awarded to the winner" removal is asserted, then locate the three surfaces with
   `grep -rn "description" components/challenges/ChallengeRedeemPanel.tsx components/venue/VenueChallengesPanel.tsx components/venue/VenueHubClient.tsx`.
4. F5 first (smaller), tests first; then F2 in `ChallengesSection.tsx` — check how the edit form
   learns the campaign's `description` (the list items from the admin API carry it) and whether
   there is an existing admin component test to extend (`grep -rn ChallengesSection tests`).
5. Gates, then `docs/reward-descriptions-review-fixes-plan_PHASE_3_HANDOFF.md` (global rule: next
   agent has none of this context), then update the plan's status line and add a "Phase 3 — as built"
   paragraph. Phase 6 must also update `docs/reward-descriptions-device-checklist.md` for the
   visible wording changes (F5, F2, F4, F10b).
