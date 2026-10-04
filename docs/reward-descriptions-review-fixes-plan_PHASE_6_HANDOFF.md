# Reward Descriptions Review Fixes — Phase 6 Handoff

**Phase:** 6 of 6 — "Review, gates, commit". **Done 2026-10-04.** The plan is complete.
**Plan:** `docs/reward-descriptions-review-fixes-plan.md` (status line points here).

---

## For Andrew (plain English)

**What changed in this phase:** nothing in the app's behaviour. A final code review of all the
Phase 1–5 fixes found no bugs. All checks pass. The phone checklist now also covers what the
fixes changed (see below), and everything is saved in one local commit.

**Live?** The database change (the "terms changed at" stamp) has been live in production since
Phase 5. The code is **committed on your Mac only — not pushed, not deployed.** That covers both
this fix commit and the earlier reward-wording commit `3998529`. Guests see none of it until you
push and deploy.

**What needs you:**
1. Say the word to push and deploy (both commits go together; the fixes should ship with the
   wording, never after it).
2. The phone pass: `docs/reward-descriptions-device-checklist.md`. New rows were added for: ended
   rewards (no "Next contest starts"), a weekly game changed to one-off, the NFL mid-season
   preview, a one-off-only venue's preview, the up-to-5-minute lag after a partner changes a game
   time, "Awarded to the winner." on older hand-written rewards only, the admin's read-only
   wording, and the two coupon fixes (edited reward → "Won from: …"; late-night game → right day).

---

## For the next agent

### 1. Next work
No phase remains in this plan. What's left is Andrew's: push/deploy (his word only) and the phone
checklist. After deploy, the Plan A post-deploy duration check (`docs/reward-descriptions-plan.md`)
and comparing real `/api/challenge-campaigns` read counts with the Phase 5 baseline (global cost
rule — Phase 5 handoff §6 has the table: 12 `trivia_schedules` + 6 `nfl_pickem_weeks` reads per
warm instance-hour expected). Out of scope unless Andrew asks: the unrelated untracked plans
`docs/pos-rewards-integration-plan.md`, `docs/reward-live-redemption-plan.md`,
`docs/rewards-trust-and-pos-roadmap.md` (left uncommitted on purpose).

### 2. Starting state
- Branch `main`. Commits on top of `origin/main`: two earlier (`3998529`, `ee64a3d`) plus this
  phase's commit "Rewards: review fixes for reward descriptions (F1–F11)" (check `git log -1`).
  Nothing pushed or deployed.
- Production DB: migration `20261004170244_challenge_campaigns_terms_updated_at.sql` applied
  2026-10-04 (Phase 5). No data was written in Phase 6. Do not re-run `supabase db push`.

### 3. Decisions (don't re-ask)
D1/D2 defaults, D3 = terms edit stamp (plan §5). Caching is opt-in for the guest route only
(Phase 5 deviation, deliberate). No new guest copy anywhere.

### 4. Files changed in Phase 6
- `docs/reward-descriptions-device-checklist.md` — "Updated" line; section B gained 5 rows
  (F4 ended reward, F10b weekly→one-off, F1 NFL preview, F11 one-off-only preview, F3 lag);
  section C's "Awarded to the winner. appears nowhere" row split into new-style (absent) vs
  hand-written (present) per F5, plus an F2 admin row and F6/F7 coupon rows.
- `docs/reward-descriptions-review-fixes-plan.md`, `docs/reward-descriptions-plan.md` — status lines.
- This handoff.

### 5. Review result and residual notes
`/code-review medium` on the full uncommitted diff: **no findings.** Two judgement calls it noted
and deliberately did not flag (accepted, not bugs):
- The `terms_updated_at` trigger also stamps on a `points_required_to_win` change, which a
  game-winner coupon's sentence doesn't read → such coupons fall back to "Won from: …" more often
  than strictly needed. Safe direction.
- Re-pinning a reward's `game_winner_slots` to a schedule in a different timezone isn't stamped,
  so an older Live Trivia coupon could show its win date in the new zone. Rare (all of a venue's
  schedules normally share one zone).

### 6. Gates (run sequentially, 2026-10-04)
- `npx tsc --noEmit`: clean. `npm run lint`: clean (usual Babel note on `lib/sportsBingo.ts`).
- `npm run test`: 287 files passed / 1 skipped; **3,166 passed / 13 skipped / 0 failed**.
- `npm run build`: OK.
- Unverified: real device/browser; real cache hit rates after deploy.

### 7. Open questions
None. Waiting on Andrew for push/deploy and the phone pass.

### 8. Traps (still true)
Never `git checkout -- <file>` / `git stash` to undo work. Never typecheck and build at once.
`challenge_campaigns` has no `updated_at`; win time is `challenge_campaign_redemptions.created_at`.
