import { NextResponse } from "next/server";
import {
  attachLeaderboardSnapshotsToCampaigns,
  getChallengeCampaignSnapshotForUser,
  listChallengeCampaigns,
} from "@/lib/challengeCampaigns";
import { attachRewardDescriptions } from "@/lib/rewards";
import { resolveRequestUserId } from "@/lib/serverSession";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("invalid") ||
    normalized.includes("must")
  ) {
    return 400;
  }
  return 500;
}

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // The query's userId is an unverified claim — a player's progress is theirs alone. A claim
    // the signed session doesn't back gets the public listing (no progress), not a 403, so the
    // venue page this route polls never goes blank (docs/reward-live-redemption-plan.md Phase 3).
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    const userId = viewer.forbidden ? "" : String(viewer.userId ?? "").trim();
    const venueId = String(searchParams.get("venueId") ?? "").trim();
    const includeInactive = normalizeBoolean(searchParams.get("includeInactive"), true);
    const includeResolved = normalizeBoolean(searchParams.get("includeResolved"), true);

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    if (userId) {
      const campaigns = await getChallengeCampaignSnapshotForUser({ userId, venueId });
      const filtered = campaigns.filter((campaign) => {
        if (!includeInactive && !campaign.isActive) return false;
        if (!includeResolved && campaign.winnerUserId) return false;
        return true;
      });
      // Each card's guest-facing description (when / how often / what to do /
      // what you win), plus an NFL reward's "Starts <date>" state from the same
      // read — see attachRewardDescriptions in lib/rewards.ts. The venue page
      // polls this every 30 s per player, so the schedule / NFL-week reads behind
      // the wording are reused for a few minutes per server instance.
      return NextResponse.json({
        ok: true,
        campaigns: await attachRewardDescriptions(filtered, venueId, new Date(), { cachedReads: true }),
      });
    }

    const campaigns = await listChallengeCampaigns({
      venueId,
      includeInactive,
      includeResolved,
    });

    const snapshots = campaigns.map((campaign) => ({ ...campaign, progressPoints: 0 }));
    const withLeaderboard = await attachLeaderboardSnapshotsToCampaigns({
      campaigns: snapshots,
      venueId,
    });
    return NextResponse.json({
      ok: true,
      campaigns: await attachRewardDescriptions(withLeaderboard, venueId, new Date(), { cachedReads: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load challenge campaigns.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
