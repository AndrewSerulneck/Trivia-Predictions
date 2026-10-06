import { NextResponse } from "next/server";
import { listRedeemedRewards } from "@/lib/pos/redeemedRewards";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET /api/owner/pos/redeemed?venueId= — the newest 50 redeemed rewards at this venue for the
 * Partner Dashboard's "Rewards redeemed" list (docs/pos-rewards-integration-plan.md Phase 2f).
 *
 * 404 while NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED is off. One bounded read per call, no Square
 * calls. Never returns a gift card id, card number, merchant id or user id.
 */
export async function GET(request: Request) {
  if (!isPosIntegrationsEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  try {
    const rewards = await listRedeemedRewards(venueId);
    return NextResponse.json({ ok: true, rewards });
  } catch (error) {
    console.error("[PosRedeemed] list-failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load redeemed rewards." }, { status: 500 });
  }
}
