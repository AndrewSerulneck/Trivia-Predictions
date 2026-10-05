import { NextResponse } from "next/server";
import { PrizeRedeemUnavailableError, redeemChallengePrize } from "@/lib/challengeCampaigns";
import { resolveRequestUserId } from "@/lib/serverSession";
import { maybeRequireActiveVenuePresence, venuePresenceErrorResponse } from "@/lib/venuePresence";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("no redemption record") ||
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
      redemptionId?: string;
    } | null;

    // The body's userId is an unverified claim — bind the redeem to the signed session so
    // nobody can spend another player's coupon (docs/reward-live-redemption-plan.md Phase 1).
    const actor = resolveRequestUserId(request, body?.userId);
    if (actor.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = actor.userId ?? "";
    const venueId = String(body?.venueId ?? "").trim();
    const challengeId = String(body?.challengeId ?? "").trim();
    const redemptionId = String(body?.redemptionId ?? "").trim() || null;

    if (!userId || !venueId || !challengeId) {
      return NextResponse.json(
        { ok: false, error: "userId, venueId, and challengeId are required." },
        { status: 400 }
      );
    }

    await maybeRequireActiveVenuePresence({ userId, venueId });

    const result = await redeemChallengePrize({ userId, venueId, challengeId, redemptionId });
    if (!result.redeemed) {
      // Never a second success screen for one coupon: a re-shown "Redeemed!" is exactly what
      // a guest would replay to staff.
      return NextResponse.json(
        { ok: false, code: "already_redeemed", error: "This prize was already redeemed.", result },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;

    if (error instanceof PrizeRedeemUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : "Failed to redeem challenge prize.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
