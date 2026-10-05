import { NextResponse } from "next/server";
import { openSquareGiftCard } from "@/lib/pos/squareGiftCards";
import { resolveRequestUserId } from "@/lib/serverSession";
import { maybeRequireActiveVenuePresence, venuePresenceErrorResponse } from "@/lib/venuePresence";

/**
 * POST /api/prizes/square-gift-card { venueId, redemptionId } — the guest's "Get my Square gift
 * card" / "Show gift card" tap (docs/pos-rewards-integration-plan.md Phase 2).
 *
 * The first call turns the gift-card coupon into a funded Square gift card (and redeems the
 * coupon, method pos_square); every later call shows it again. Returns the card number to its
 * winner only: the caller is bound to the signed session (a body userId that disagrees → 403),
 * and the coupon must belong to that user at that venue. Same venue-presence gate as
 * "Confirm Redemption". The number is never logged.
 */

const STATUS: Record<string, number> = {
  not_eligible: 409,
  not_found: 404,
  already_redeemed: 409,
  expired: 410,
  unavailable: 503,
  square_error: 502,
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      venueId?: string;
      redemptionId?: string;
    } | null;

    const actor = resolveRequestUserId(request, body?.userId);
    if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    const userId = actor.userId ?? "";
    const venueId = String(body?.venueId ?? "").trim();
    const redemptionId = String(body?.redemptionId ?? "").trim();
    if (!userId || !venueId || !redemptionId) {
      return NextResponse.json({ ok: false, error: "userId, venueId, and redemptionId are required." }, { status: 400 });
    }

    await maybeRequireActiveVenuePresence({ userId, venueId });

    const result = await openSquareGiftCard({ userId, venueId, redemptionId });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code, error: result.message }, { status: STATUS[result.code] ?? 500 });
    }
    return NextResponse.json(
      { ok: true, giftCard: result.giftCard },
      // A gift card number is money: never let a shared cache or the back/forward cache keep it.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;
    console.error("[PosSquare] gift-card-route-failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
