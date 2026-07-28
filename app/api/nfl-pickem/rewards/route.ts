import { NextResponse } from "next/server";
import {
  getChallengeCampaignSnapshotForUser,
  listChallengeCampaigns,
  listChallengeCycleWinners,
} from "@/lib/challengeCampaigns";
import { getNFLPickEmLeaderboard, getNFLWeekById } from "@/lib/nflPickEm";
import { NFL_PICKEM_REWARD_DEFINITION_ID, nflWinnerCycleStart } from "@/lib/nflPickEmWinnerRewards";
import { resolveRequestUserId } from "@/lib/serverSession";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

// Thin wrapper for Phase 8's player-facing surfaces (the /nfl-pickem reward
// banner and the leaderboard's per-week winner marker). Reuses the existing
// Rewards read path (getChallengeCampaignSnapshotForUser) for campaign/progress
// data rather than re-deriving it, and adds the two things nothing else exposes
// to a guest: a week's live participant count and its resolved winner(s), read
// straight from challenge_cycle_winners via the same accessor the admin panel
// uses (listChallengeCycleWinners).
type NFLRewardWinner = {
  campaignId: string;
  campaignName: string;
  winnerUserId: string;
  winnerUsername: string | null;
  prizeKind?: ChallengeCampaign["prizeKind"];
  prizeMenuItem?: ChallengeCampaign["prizeMenuItem"];
  prizeMenuItemName?: ChallengeCampaign["prizeMenuItemName"];
  prizeDiscountKind?: ChallengeCampaign["prizeDiscountKind"];
  prizeDiscountValue?: ChallengeCampaign["prizeDiscountValue"];
  prizeGiftCertificateAmount?: ChallengeCampaign["prizeGiftCertificateAmount"];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = (searchParams.get("venueId") ?? searchParams.get("venue") ?? "").trim();
    const weekId = (searchParams.get("weekId") ?? "").trim();
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required" }, { status: 400 });
    }

    const campaigns = viewer.userId
      ? (await getChallengeCampaignSnapshotForUser({ userId: viewer.userId, venueId })).filter(
          (campaign) => campaign.rewardDefinitionId === NFL_PICKEM_REWARD_DEFINITION_ID && campaign.isActive
        )
      : (await listChallengeCampaigns({ venueId, includeInactive: false, includeResolved: false }))
          .filter((campaign) => campaign.rewardDefinitionId === NFL_PICKEM_REWARD_DEFINITION_ID)
          .map((campaign) => ({ ...campaign, progressPoints: 0 }));

    let participantCount: number | null = null;
    let hasActiveGameWinnerReward = false;
    const winners: NFLRewardWinner[] = [];

    if (weekId) {
      const leaderboard = await getNFLPickEmLeaderboard({ venueId, mode: "week", weekId, userId: undefined });
      participantCount = leaderboard.entries.length;

      // Every game-winner NFL campaign at this venue, active or not — a past
      // week's winner can belong to a season reward already deactivated by the
      // resolver, which must still show on that week's leaderboard.
      const week = await getNFLWeekById(weekId);
      if (week) {
        const timezone = await getVenueTimezone(venueId);
        const gameWinnerCampaigns = (await listChallengeCampaigns({ venueId, includeInactive: true, includeResolved: true })).filter(
          (campaign) =>
            campaign.rewardDefinitionId === NFL_PICKEM_REWARD_DEFINITION_ID &&
            campaign.winCondition === "game_winner" &&
            Boolean(campaign.nflWeekScope)
        );
        hasActiveGameWinnerReward = gameWinnerCampaigns.some((campaign) => campaign.isActive);

        // This is a hot read path (both the reward banner and the leaderboard
        // re-poll it on every week switch), so fan the per-campaign winner reads
        // out in parallel rather than stacking a round-trip per campaign.
        const resolved = await Promise.all(
          gameWinnerCampaigns.map(async (campaign): Promise<NFLRewardWinner | null> => {
            const cycleStartMs = nflWinnerCycleStart(campaign, week, timezone).getTime();
            const cycleWinners = await listChallengeCycleWinners(campaign.id);
            // String equality on a Postgres-returned timestamptz can't be trusted
            // to match a freshly-formatted toISOString() — compare parsed instants.
            const match = cycleWinners.find((winner) => Date.parse(winner.cycleStart) === cycleStartMs);
            if (!match) {
              return null;
            }
            return {
              campaignId: campaign.id,
              campaignName: campaign.name,
              winnerUserId: match.winnerUserId,
              winnerUsername: match.winnerUsername,
              prizeKind: campaign.prizeKind,
              prizeMenuItem: campaign.prizeMenuItem,
              prizeMenuItemName: campaign.prizeMenuItemName,
              prizeDiscountKind: campaign.prizeDiscountKind,
              prizeDiscountValue: campaign.prizeDiscountValue,
              prizeGiftCertificateAmount: campaign.prizeGiftCertificateAmount,
            };
          })
        );
        winners.push(...resolved.filter((entry): entry is NFLRewardWinner => entry !== null));
      }
    }

    return NextResponse.json({
      ok: true,
      campaigns,
      weekId: weekId || null,
      participantCount,
      winners,
      hasActiveGameWinnerReward,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching rewards:", error);
    const message = error instanceof Error ? error.message : "Failed to load NFL Pick 'Em rewards";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
