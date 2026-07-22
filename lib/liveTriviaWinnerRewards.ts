import "server-only";

// ── Game-winner reward resolution ───────────────────────────────────────────
//
// A reward created with winCondition "game_winner" is NOT won by accruing
// points — it goes to whoever WINS a Live Trivia game, whatever the score. Live
// Trivia has no "game over" event (occurrences are time windows derived from
// trivia_schedules), so there is nothing to hook; instead this module sweeps for
// occurrences that have finished and awards their top scorer(s).
//
// Idempotency comes for free from the winner ledger: each occurrence is awarded
// under its OWN cycle_start (the occurrence start instant), and
// challenge_cycle_winners is unique on (challenge_id, cycle_start,
// winner_user_id). Re-running the sweep over an already-resolved game re-awards
// nobody — award_cycle_winner returns won:false for players already in the
// ledger. That is why the sweep can safely use a lookback window wider than the
// cron interval.
//
// TIES: Live Trivia ranks with competition ranking, so a tie for first is real
// (everyone answers the same questions). All players tied for the top score win
// — the quota passed to the RPC is widened to the tie count rather than picking
// an arbitrary single winner. A 4-way tie hands out 4 prizes; the alternative
// (silently denying three legitimate co-winners) creates a worse problem at the
// venue. Only players who actually scored above zero are eligible, so an empty
// or all-zero game awards nobody.

import {
  awardCycleWinner,
  listChallengeCampaigns,
} from "@/lib/challengeCampaigns";
import {
  findEndedOccurrences,
  loadOccurrenceFinalStandings,
} from "@/lib/liveShowdownEngine";
import { isRewardsEnabled } from "@/lib/rewardsFlags";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChallengeCampaign } from "@/types";

export type GameWinnerResolution = {
  scheduleId: string;
  occurrenceDate: string;
  venueId: string;
  campaignId: string;
  campaignName: string;
  /** Users newly awarded on this sweep (already-ledgered winners are excluded). */
  awardedUserIds: string[];
  topPoints: number;
  /** How many players tied for first (>1 means co-winners). */
  tiedCount: number;
};

export type ResolveGameWinnerRewardsReport = {
  occurrencesExamined: number;
  campaignsExamined: number;
  resolutions: GameWinnerResolution[];
  errors: Array<{ scope: string; message: string }>;
};

/** Does this campaign apply to the given venue? Mirrors campaignMatchesVenue's intent. */
function campaignCoversVenue(campaign: ChallengeCampaign, venueId: string): boolean {
  // A game-winner reward is always created with a non-empty venue_ids (createReward
  // enforces this). An empty list would mean "global", which we deliberately do NOT
  // honor here — a global game-winner reward would fire at every venue at once.
  return campaign.venueIds.length > 0 && campaign.venueIds.includes(venueId);
}

/**
 * Resolve every game-winner reward whose venue finished a Live Trivia game in
 * the lookback window. Safe to run repeatedly (see idempotency note above).
 *
 * One bad occurrence or campaign never aborts the sweep — failures are collected
 * into the report so the rest still resolve.
 */
export async function resolveGameWinnerRewards(
  nowMs: number = Date.now(),
): Promise<ResolveGameWinnerRewardsReport> {
  const report: ResolveGameWinnerRewardsReport = {
    occurrencesExamined: 0,
    campaignsExamined: 0,
    resolutions: [],
    errors: [],
  };

  // With the Rewards flag off, multi-winner behavior is clamped elsewhere; a
  // game-winner reward can't be created at all in that state, but an existing
  // row must not be resolved by a flag-off deployment either.
  if (!isRewardsEnabled()) return report;

  const occurrences = await findEndedOccurrences(nowMs);
  report.occurrencesExamined = occurrences.length;
  if (occurrences.length === 0) return report;

  const allCampaigns = await listChallengeCampaigns();
  const gameWinnerCampaigns = allCampaigns.filter(
    (campaign) => campaign.isActive && campaign.winCondition === "game_winner",
  );
  report.campaignsExamined = gameWinnerCampaigns.length;
  if (gameWinnerCampaigns.length === 0) return report;

  for (const occurrence of occurrences) {
    const campaigns = gameWinnerCampaigns.filter((campaign) =>
      campaignCoversVenue(campaign, occurrence.venueId),
    );
    if (campaigns.length === 0) continue;

    let standings: Array<{ userId: string; totalPoints: number }>;
    try {
      standings = await loadOccurrenceFinalStandings(
        occurrence.scheduleId,
        occurrence.occurrenceDate,
      );
    } catch (error) {
      report.errors.push({
        scope: `${occurrence.scheduleId}@${occurrence.occurrenceDate}`,
        message: error instanceof Error ? error.message : "Failed to load standings.",
      });
      continue;
    }

    // Nobody scored — no winner to award. Leave the reward active so the next
    // game can resolve it.
    const topPoints = standings[0]?.totalPoints ?? 0;
    if (topPoints <= 0) continue;

    const winners = standings.filter((entry) => entry.totalPoints === topPoints);

    // The occurrence's own start instant is the cycle key — one game, one cycle.
    // This is what makes re-running the sweep a no-op.
    const cycleStart = new Date(occurrence.startMs);
    const now = new Date(nowMs);

    for (const campaign of campaigns) {
      const awardedUserIds: string[] = [];
      try {
        for (const winner of winners) {
          const { won } = await awardCycleWinner({
            campaign,
            userId: winner.userId,
            venueId: occurrence.venueId,
            cycleStart,
            pointsEarned: winner.totalPoints,
            // Widen the quota to the tie count so every co-winner is honored.
            // The RPC still enforces this cap atomically.
            winnerQuota: winners.length,
            now,
          });
          if (won) awardedUserIds.push(winner.userId);
        }
      } catch (error) {
        report.errors.push({
          scope: `${campaign.id}@${occurrence.occurrenceDate}`,
          message: error instanceof Error ? error.message : "Failed to award winner.",
        });
        continue;
      }

      if (awardedUserIds.length > 0) {
        report.resolutions.push({
          scheduleId: occurrence.scheduleId,
          occurrenceDate: occurrence.occurrenceDate,
          venueId: occurrence.venueId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          awardedUserIds,
          topPoints,
          tiedCount: winners.length,
        });
      }

      // A one-off (non-recurring) game-winner reward is spent once its game has
      // produced winners: deactivate it so the next night's game doesn't award
      // it again. Recurring rewards stay active and resolve every occurrence.
      const isRecurring = Boolean(campaign.recurringType && campaign.recurringType !== "none");
      if (!isRecurring && awardedUserIds.length > 0) {
        try {
          await deactivateResolvedReward(campaign, awardedUserIds[0]);
        } catch (error) {
          report.errors.push({
            scope: `${campaign.id}:deactivate`,
            message: error instanceof Error ? error.message : "Failed to deactivate reward.",
          });
        }
      }
    }
  }

  return report;
}

/**
 * Mark a one-off game-winner reward as spent. winner_user_id is retained only as
 * a non-null "resolved" marker for legacy readers — under multi-winner it no
 * longer means "the winner" (see the same note in challengeCampaigns.ts).
 */
async function deactivateResolvedReward(
  campaign: ChallengeCampaign,
  fallbackWinnerId: string,
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("challenge_campaigns")
    .update({ is_active: false, winner_user_id: campaign.winnerUserId ?? fallbackWinnerId })
    .eq("id", campaign.id);
  if (error) throw new Error(error.message);
}
