import { NextResponse } from "next/server";
import { guardOwnerPosVenue } from "@/lib/pos/ownerPosGuard";
import { listRedeemedRewards } from "@/lib/pos/redeemedRewards";

/**
 * GET /api/owner/pos/redeemed?venueId= — the newest 50 redeemed rewards at this venue for the
 * Partner Dashboard's "Rewards redeemed" list (docs/pos-rewards-integration-plan.md Phase 2f).
 *
 * 404 while NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED is off. One bounded read per call, no Square
 * calls. Never returns a gift card id, card number, merchant id or user id.
 */
export async function GET(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const checked = await guardOwnerPosVenue(request, venueId);
  if ("response" in checked) return checked.response;

  try {
    const rewards = await listRedeemedRewards(venueId);
    return NextResponse.json({ ok: true, rewards });
  } catch (error) {
    console.error("[PosRedeemed] list-failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load redeemed rewards." }, { status: 500 });
  }
}
