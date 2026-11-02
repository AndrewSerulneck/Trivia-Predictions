# Pick 'Em plan — Phase 7.6.2 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** an *Ended* Pick 'Em Prize card now leaves the venue Prizes panel 24 hours after its day ends
  (an archived one with no day to show leaves at once). The "Active · N Prizes" header no longer counts Ended cards.
  A bar that runs a one-day prize every Saturday no longer piles up "Ended" cards.
- **Live?** No. Uncommitted, unpushed, undeployed (main frozen). No database change.
- **What's left:** 7.6.3 (small). Your phone pass can still run.
- **Needs you:** the open question (plan §8 Q7) — hide archived prizes of *every other kind* too? Not changed; default is no.
  A winner's coupon is unaffected (the wallet reads redemptions, not this list).

## For the next agent

1. **Next: 7.6.3 (Sonnet 5.5 · medium)** — see plan §7. Out of scope: Q7, anything outside `lib/pickem.ts` settlement.
2. **State:** branch `after-app-review`, nothing committed by this phase. No data touched, no migration.
3. **Decisions:** 24 h grace = `PICKEM_PRIZE_ENDED_CARD_MS` (spec). Applies to ended = archived OR past the sweep's 5-day look-back.
   Unreadable-terms prizes (no `pickemWindow`) are never dropped (can't tell when they ended).
4. **Files:** `lib/pickemPrizeStandings.ts` (constant); `lib/challengeCampaigns.ts` (`PickEmPrizeSnapshotState.dropCard`,
   filter in `getChallengeCampaignSnapshotForUser` before `baseCampaigns`); `components/venue/venueHubShared.tsx`
   (`countActivePrizeCards`, mirrors the panel's won/ended logic); `components/venue/VenueChallengesPanel.tsx` (header count).
   Tests: `tests/lib.rewards-cycle-snapshot.test.ts` (ended at +23 h kept, +25 h gone; look-back; archived-with-no-period gone),
   new `tests/venue-active-prize-count.test.ts`.
5. **Traps:** the snapshot also feeds `/api/nfl-pickem/rewards` (filters afterward; unaffected). Zero extra requests.
6. **Verify:** `npx vitest run tests/lib.rewards-cycle-snapshot.test.ts tests/venue-active-prize-count.test.ts`, `npx tsc --noEmit` (clean).
   Full `npm run test`: 4 failures, all pre-existing date-based star-index freshness tripwires
   (`lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}`), unrelated. Not visually checked on a phone.
7. **Open:** Q7 above.
8. **First steps:** read plan §7 "Phase 7.6.3", then `recordSettlement` in `settlePendingPickEmPicks` (`lib/pickem.ts`).
