# Reward Minimum Players — Phase 3 Handoff (2026-10-17)

Plan: `docs/reward-minimum-players-plan.md`. Phase 3 = release and check. Final handoff of the plan.

## For Andrew (plain English)

**What changed.** Nothing new was built. I re-checked everything, then saved Phases 1 and 2 as one commit on
`main` (your unrelated tutorial-card edits were left out on purpose).

**Is it live?** **No.** It is committed locally only — not pushed, not deployed. The only live piece is the database
update from Phase 1 (your one NFL "most picks" reward is stored as "at least 3 players"; checked again today: 1
reward, 0 without a minimum). Until you push, the website still runs the old code, which behaves the same for that reward.

**Checks today:** typecheck clean, lint clean, 4,791 tests pass (13 database-only ones skipped as always), production
build passes.

**What's left, all yours:**
1. Push to deploy when you're ready.
2. Phone pass: section **K** of `docs/partner-dashboard-app-redesign-device-checklist.md`.
3. After deploy, tell the next agent (or run the command below) to re-check; optionally have a test reward of each
   kind created on the hidden test venue and deleted afterwards (needs your yes, because it writes to production).
4. After the next NFL Tuesday settlement, confirm your NFL reward behaved as "3 or more".

## For the next agent

### 1. Scope
Only post-deploy verification. No code is expected to change. Out of scope: editing live rewards (A3), a player
counter (A5), anything else in the plan.

### 2. Starting state
- Branch `main`; parent commit `938c744`; this work is one commit on top (`git log -1`). **Not pushed, not deployed.**
- Production DB: migration `20261017191219` applied (Phase 1). No Phase 2/3 data changes.
- Still uncommitted and NOT this plan's: `components/ui/AccountMenu.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `components/venue/VenueHubClient.tsx`, `lib/venueGameCards.ts`, `tests/lib.category-blitz-how-to-play.test.ts`,
  `tests/tutorial-statement-layout-contract.test.ts`, and the "Game tutorial cards" section of `CLAUDE.md`. Don't revert.

### 3. Decisions
Plan §2 (A1–A6, D1–D4) and the Phase 2 handoff §3 stand. Andrew decides push/deploy timing.

### 4. Files
No source files changed in Phase 3; only this note and the plan's status line.

### 5. Traps
- `tsc` shows iCloud duplicate files (`.next/types/* 2.ts`): filter with `grep -v "^.next/types/.* 2.ts"`.
- Don't run `tsc` and `build` at the same time.
- Rewards created between the Phase 1 migration and a deploy come from the OLD wizard (no minimum for NFL) and would
  show `min_players` null — the count below catches them; fix with a one-row update after asking Andrew.

### 6. Commands
- Count: `node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs` → expect `min_players null: 0`
  (today: `NFL most-picks rewards: 1 | min_players null: 0`, reward `ceceade0-d224-4b6d-8181-3f41b1b826f6`, min 3).
- Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (run sequentially; all passed 2026-10-17).
- Unverified: no browser/phone pass of the new step; no live NFL settlement with per-reward minimums yet.

### 7. Open questions for Andrew
Push timing; permission to create/delete test rewards on `venue-hightop-test`; phone pass.

### 8. First steps
1. Confirm with Andrew it's pushed/deployed; re-run the count.
2. If he agrees, create one reward of each kind on `venue-hightop-test` from the live site and delete it.
3. After the next NFL Tuesday settlement, check Vercel logs for `[NFLPickEmWinner]` lines: the reward with min 3 either
   paid (3+ pickers) or was listed in `skippedBelowMinimum` with its own `minPlayers`.
4. Mark the plan "complete" in its status line.
