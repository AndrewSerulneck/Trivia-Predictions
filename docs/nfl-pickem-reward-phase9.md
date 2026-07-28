# Phase 9 — Review and end-to-end browser verification

Read `docs/nfl-pickem-reward-plan.md` and the full
`docs/nfl-pickem-reward-run-log.md` first — the run log is where earlier phases
recorded deviations, and any of them may invalidate an assumption below.

This phase writes as little code as possible. Its job is to prove the feature
works in a real browser and to close whatever the earlier phases left open.

## 1. Verify the locked product decisions actually hold

Check each against the code as built, not against the plan:

- [ ] A partner **cannot** express a week range. Grep the whole diff for anything
      resembling `weekNumbers`, `startWeek`, `endWeek`, or a multi-week selector.
      There must be exactly two scope shapes: `weekly` and `season`.
- [ ] A "most picks right" reward stores `winnerQuota: 1` and the server
      **refuses** (not clamps) any other value.
- [ ] A weekly NFL campaign's `activeDays` is
      `["thu","fri","sat","sun","mon","tue","wed"]` — seven entries, `"thu"` at
      index 0.
- [ ] A season NFL campaign has non-null `startDate` and `endDate`.
- [ ] Points accrue at **1 per correct pick**, not 10.
- [ ] The 3-player minimum is enforced in the resolver **and** stated in the
      wizard **and** shown to players.
- [ ] Prizes behave identically to Live Trivia rewards (same normalization, same
      coupon flow).

## 2. Confirm the `vercel.json` cron entry

Phase 7 was pre-authorized to add exactly one entry:

```json
{ "path": "/api/cron/resolve-nfl-pickem-winners", "schedule": "0 13 * * *" }
```

Verify it is present and that `git diff vercel.json` shows **only** that added
object — no reordering, no schedule changes to existing crons. Without this entry
the week-winner reward never resolves in production, so if it is missing, add it
and say so in the final summary.

## 3. Browser verification (use the `verify` skill)

Invoke the `verify` skill for `/nfl-pickem`. Full path:

1. Seed: `node --env-file=.env.local scripts/seed-nfl-pickem-test-data.cjs <venueId>`.
2. As a **partner** (`/owner/competitions`), create an NFL Pick 'Em Challenge:
   "Most picks right", "Every week". Confirm the quantity control is absent, the
   readback says 1 winner, and the 3-player rule appears on both the terms and
   confirm steps.
3. As an **admin** (Admin → Rewards), create a second one: "Points target",
   10 picks, 3 available, "Whole season". Confirm both hosts use the same wizard.
4. As a **player**, open `/nfl-pickem`: the reward banner renders, the tiebreaker
   card renders below the slate, and a tiebreaker answer saves.
5. Run the settle cron, then the resolver cron. Confirm:
   - the clear-winner week awards exactly one user,
   - the tied week is decided by the tiebreaker,
   - the 2-picker week awards nobody and says why,
   - the points-target reward's progress is in correct-picks units.
6. As a winner, open `/redeem-prizes` and confirm the coupon is present and
   redeemable (`components/prizes/PrizeWalletPanel.tsx`).
7. Re-run both crons and confirm **no** duplicate awards and **no** progress
   inflation.
8. Unseed: `node --env-file=.env.local scripts/unseed-nfl-pickem-test-data.cjs`.

Capture screenshots of the wizard's scope step, the player banner in its
"2 of 3 players needed" state, and the resolved leaderboard.

## 4. Regression sweep — Live Trivia must be untouched

The Phase 3 `thresholdStep` refactor and the `rewardTerms.ts` copy
parameterization both touched shared code. Verify in the browser that creating a
**Live Trivia Challenge** still works end to end — points target and game-winner,
including the game picker if `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` is on.

Also run `npm run test:god-mode-join` — not because this feature touches auth, but
because it is the repo's named tripwire and the diff is large.

## 5. Final code review

Review the accumulated diff for:

- Any `any` that crept in (the repo forbids it; `lib/nflPickEm.ts` has
  pre-existing ones in `fetchNFLGamesFromBDL` / `syncNFLWeeks` — leave those,
  add none).
- Relative imports (`../`) instead of `@/`.
- Inline `style={{}}` outside `components/venue-screen/*`.
- Any place the multi-winner quota is checked outside the `award_cycle_winner`
  RPC.
- Any query on picks, standings, tiebreakers or campaigns missing a `venue_id`
  filter.
- Non-deterministic ordering anywhere an award is decided.

## 6. Clean up the phase docs

Once everything above passes, the per-phase instruction docs have served their
purpose and should not linger as stale guidance:

- **Delete** `docs/nfl-pickem-reward-phase0.md` … `phase9.md` and
  `docs/nfl-pickem-reward-run-log.md`.
- **Keep** `docs/nfl-pickem-reward-plan.md`, but first fold into it: the locked
  product decisions (already there), the as-built architecture (which modules own
  what), any deviation the run log recorded, and the outcome of the `vercel.json`
  question. It becomes the single durable record, matching how
  `docs/rewards-system-plan.md` carries as-built notes.
- Add a short "NFL Pick 'Em Challenge" note to the Rewards section of `CLAUDE.md`
  pointing at the plan doc, in the style of the existing Rewards bullets.

Do the deletion only after the browser verification passes. If anything is still
open, leave the docs in place and say what remains.

## Acceptance

- `npm run build`, `npm test`, `npx tsc --noEmit`, `npm run lint`, and
  `npm run test:god-mode-join` all pass.
- Every checkbox in section 1 is verified against the code.
- The full browser path in section 3 completes, with screenshots.
- Phase docs are cleaned up and `docs/nfl-pickem-reward-plan.md` reflects the
  as-built system.
