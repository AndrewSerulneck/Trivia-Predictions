# Reward Descriptions Review Fixes — Phase 3 Handoff

**Phase:** 3 of 6 — "Guest cards and the admin edit form" (F5, F2). **Done 2026-10-04.**
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line points here).

---

## For Andrew (plain English)

**What changed:**
- **Older hand-written Live Trivia / game-winner rewards say "Awarded to the winner." again** on the
  venue Rewards panel, the reward pop-up and the redeem page. Rewards made from the wizard keep their
  new automatic wording and don't get the extra line.
- **Editing a wizard-made reward in Admin no longer shows an editable Rules box.** It shows what
  guests actually read (read-only) with the note "Guests see this automatic description. Change the
  schedule, prize or target to change it." Older hand-written rewards keep the editable Rules box.

**Live?** No. Nothing committed, pushed or deployed (Phases 1–3 are uncommitted in the working copy).
**Needs you:** nothing. Wording used is exactly what the plan spelled out (old sentence restored,
one admin note). A real-device look is still pending (Phase 6 updates the checklist).
**Left:** Phases 4–6.

---

## For the next agent

### 1. Next phase: Phase 4 — Coupon accuracy (F6, F7)
Model/effort per plan: **Opus 5.5, high.** Spec is plan §3 Phase 4, with D3 = default (no migration):
- **F6** (`lib/challengeCampaigns.ts` `rewardTerms` ~2593): show the "You won …" line only if the
  reward wasn't edited since the win — compare `challenge_campaigns.updated_at` to the coupon's win
  time (`claimed_at` / cycle-winner `finalized_at`); else fall back to "Won from: {name}"
  (`components/prizes/PrizeWalletPanel.tsx`, `wonForLine`, `win.winDescription ??`). **First verify
  `updated_at` exists and is really bumped on update** (look for a `set_updated_at` trigger in
  `supabase/migrations/` or the update code). If unreliable, STOP and tell Andrew.
- **F7** (`lib/rewardDescription.ts` `describeRewardWin`, game-winner branch): format the Live Trivia
  win date in the **schedule's** timezone: one batched `trivia_schedules` read per wallet load (only
  when a Live Trivia game-winner coupon exists) from `game_winner_slots[].scheduleId`; fall back to
  venue timezone then `America/New_York`, never UTC. Test 11:30 PM Central.
- Out of scope: F3 (Phase 5), review/commit (Phase 6), any migration / `supabase db push`.

### 2. Starting state
Branch `main`, HEAD `ee64a3d` (2 local commits ahead of origin, not pushed/deployed). Phases 1–3 are
**uncommitted** (≈19 files). Untracked `docs/pos-rewards-integration-plan.md`,
`docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md` are unrelated; leave
alone. No DB/env/migration changes. **Never `git checkout -- <file>` or stash** — it wipes uncommitted
Phase 1–3 work; undo by editing.

### 3. Decisions (don't re-ask)
D1–D3 = defaults (plan §5). No new guest sentences beyond approved copy; Phase 3 used only the old
"Awarded to the winner." and the plan's admin note.

### 4. Phase 3 changes
| File | Change |
|---|---|
| `components/challenges/ChallengeRedeemPanel.tsx` (~417) | `isGameWinner ? (description?.isCustom !== false ? <p>Awarded to the winner.</p> : null)` |
| `components/venue/VenueChallengesPanel.tsx` (~213) | same, in the game_winner body branch |
| `components/venue/VenueHubClient.tsx` (~1749) | same, in the modal's game_winner branch |
| `components/admin/sections/ChallengesSection.tsx` | `AdminChallengeCampaign.description?: RewardDescription`; `automaticDescription` derived from `campaigns.find(editingCampaignId)?.description` when `!isCustom`; the Rules block renders read-only summary/when/fineprint + note, else the textarea. `formRules` is still set in `beginEdit` and submitted, so "Rules are required" still passes. |
| `tests/components.reward-descriptions-surfaces.test.ts` | replaced "no longer prints" with: exactly one "Awarded to the winner." per surface + `isCustom !== false` guard; admin form static assertions |

### 5. Facts and traps
- A **missing** `description` (older payload) is treated as legacy → shows the sentence. Plan said
  `isCustom` only; this is the safe superset.
- Admin list items already carry `description` and `rewardDefinitionId` (`app/api/admin/route.ts`
  ~335 calls `attachRewardDescriptions`); no server change needed.
- `ChallengeRedeemPanel` lives in `components/challenges/` (plan's older path was wrong).
- Surface tests are mostly static-source assertions (readFileSync) plus `RewardRow` rendering;
  there is no rendered test of the three guest components or `ChallengesSection` (heavy to mount).
- Phase 1/2 traps still apply (`lib/rewardTerms.ts` must not import `rewardGameSlots` /
  `nflPickEmRewardWeeks`; use `vi.stubEnv` for the game-picker flag in wizard tests).
- Read-only prod query pattern: script in scratchpad,
  `NODE_PATH=$PWD/node_modules node --env-file=.env.local script.cjs`; never print env values.

### 6. Build / run / test
Gates, sequential: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`.
Phase 3 results: typecheck clean; lint clean (usual Babel sportsBingo note); Vitest **287 files
passed / 1 skipped, 3,142 tests passed / 13 skipped / 0 failed**; build OK.
Fast loop: `npx vitest run tests/components.reward-descriptions-surfaces.test.ts tests/lib.reward-description.test.ts tests/api.challenge-campaigns-descriptions.test.ts`.
Unverified: nothing seen in a browser/device.

### 7. Open questions
None. Commit/push/deploy remains Andrew's call (plan: commit in Phase 6).

### 8. First steps for Phase 4
1. `git status` — confirm Phases 1–3 files still modified. 2. Read `lib/challengeCampaigns.ts` around
`rewardTerms` (~2593), `components/prizes/PrizeWalletPanel.tsx`, and `describeRewardWin`.
3. Check `updated_at` reliability (grep migrations for `challenge_campaigns` + `updated_at`/trigger,
and the update paths). 4. Tests first, then implement; gates; write the Phase 4 handoff; update plan
status + "Phase 4 — as built". Phase 6 must update `docs/reward-descriptions-device-checklist.md` for
F5, F2, F4, F10b wording changes.
