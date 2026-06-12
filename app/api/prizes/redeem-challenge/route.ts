import { NextResponse } from "next/server";
import { redeemChallengePrize } from "@/lib/challengeCampaigns";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("only") ||
    normalized.includes("expired") ||
    normalized.includes("does not have")
  ) {
    return 400;
  }
  return 500;
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
      return NextResponse.json(
        { ok: false, error: "userId, venueId, and challengeId are required." },
        { status: 400 }
      );
    }

    const result = await redeemChallengePrize({ userId, venueId, challengeId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to redeem challenge prize.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
