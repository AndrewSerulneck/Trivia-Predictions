import { NextResponse } from "next/server";
import { ensureSquarePrizeDiscount } from "@/lib/pos/squareDiscounts";
import { rateLimitSquareDiscount } from "@/lib/rateLimit";
import { resolveRequestUserId } from "@/lib/serverSession";

/**
 * POST /api/prizes/square-discount { venueId, redemptionId } — an open menu-item coupon at a
 * Square-connected venue asks which ready-made Square discount staff should tap
 * (docs/pos-rewards-integration-plan.md Phase 2d). Finds it in the partner's Square catalog, or
 * creates it, and returns `{ discount: { name } }`.
 *
 * Redeems nothing: the coupon is still redeemed only by "Confirm Redemption". The caller is
 * bound to the signed session (a body userId that disagrees → 403) and the coupon must belong to
 * that user at that venue. Rate-limited per user, then per IP, before any database or Square
 * work; fails closed (503). No venue-presence gate: the answer is a discount name, worth nothing
 * on its own, and Confirm Redemption keeps its own gate.
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

    const limit = await rateLimitSquareDiscount(request, userId);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: limit.unavailable ? "unavailable" : "rate_limited",
          error: limit.unavailable ? "Please try again in a minute." : "Too many tries. Please wait a few minutes and try again.",
        },
        {
          status: limit.unavailable ? 503 : 429,
          headers: { "Retry-After": String(Math.max(1, limit.retryAfterSeconds)), "Cache-Control": "no-store" },
        },
      );
    }

    const result = await ensureSquarePrizeDiscount({ userId, venueId, redemptionId });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code, error: result.message }, { status: STATUS[result.code] ?? 500 });
    }
    return NextResponse.json({ ok: true, discount: result.discount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[PosSquare] discount-route-failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
