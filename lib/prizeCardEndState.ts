/**
 * When a Venue Home prize card reads "Ended" and when it leaves the Prizes panel — the ONE rule for
 * every prize type (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase A1).
 *
 * - **Retired** = `is_active = false` with `winner_user_id` null: archived by the partner/admin, or its
 *   last game slot cancelled (lib/rewardGameSlotCascade.ts). It leaves the panel unless the viewer won
 *   it in the current cycle; that card stays so they can claim it. Coupons won earlier stay in the
 *   wallet either way.
 * - **Won out** = `is_active = false` with `winner_user_id` set: not retired; keeps its "congrats" card.
 * - **A Pick 'Em Prize** brings its own state (its period + PICKEM_PRIZE_ENDED_CARD_MS grace,
 *   `pickemPrizeSnapshotState` in lib/challengeCampaigns.ts), which wins over the generic rule.
 *
 * "The viewer won it" comes from the viewer's own cycle-winner ledger rows, never from
 * `winner_user_id` (a multi-winner prize stamps it as a "resolved" marker only).
 */
export type PrizeCardEndState = {
  /** Nothing more to run: the card says "Ended" unless the viewer won it. */
  prizeEnded: boolean;
  /** The card leaves the panel. */
  dropCard: boolean;
};

type PrizeActiveState = { isActive: boolean; winnerUserId?: string | null };

export const isRetiredPrize = (campaign: PrizeActiveState): boolean =>
  !campaign.isActive && !campaign.winnerUserId;

export const prizeCardEndState = (params: {
  campaign: PrizeActiveState;
  /** The viewer is among the current cycle's winners (ledger rows). No viewer → false. */
  viewerWon: boolean;
  /** A Pick 'Em Prize's own end state; absent for every other prize. */
  pickemPrize?: PrizeCardEndState;
}): PrizeCardEndState => {
  if (params.pickemPrize) {
    return { prizeEnded: params.pickemPrize.prizeEnded, dropCard: params.pickemPrize.dropCard };
  }
  if (!isRetiredPrize(params.campaign)) return { prizeEnded: false, dropCard: false };
  return { prizeEnded: true, dropCard: !params.viewerWon };
};
