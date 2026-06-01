import { NextResponse } from "next/server";
import {
  attachLeaderboardSnapshotsToCampaigns,
  getChallengeCampaignSnapshotForUser,
  listChallengeCampaigns,
} from "@/lib/challengeCampaigns";

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
    const userId = String(searchParams.get("userId") ?? "").trim();
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
      return NextResponse.json({ ok: true, campaigns: filtered });
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
    return NextResponse.json({ ok: true, campaigns: withLeaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load challenge campaigns.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
