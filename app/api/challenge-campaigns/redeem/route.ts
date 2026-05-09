import { NextResponse } from "next/server";
import { claimChallengeCampaignPrize, listChallengeCampaignWinsForUser } from "@/lib/challengeCampaigns";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("required") || normalized.includes("invalid") || normalized.includes("not found") || normalized.includes("only")) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") ?? "").trim();
    const venueId = String(searchParams.get("venueId") ?? "").trim();

    if (!userId || !venueId) {
      return NextResponse.json({ ok: false, error: "userId and venueId are required." }, { status: 400 });
    }

    const wins = await listChallengeCampaignWinsForUser({ userId, venueId });
    return NextResponse.json({ ok: true, wins });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load redeemable challenge wins.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      venueId?: string;
      challengeId?: string;
    } | null;

    const userId = String(body?.userId ?? "").trim();
    const venueId = String(body?.venueId ?? "").trim();
    const challengeId = String(body?.challengeId ?? "").trim();

    if (!userId || !venueId || !challengeId) {
      return NextResponse.json({ ok: false, error: "userId, venueId, and challengeId are required." }, { status: 400 });
    }

    const result = await claimChallengeCampaignPrize({ userId, venueId, challengeId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to claim challenge prize.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
