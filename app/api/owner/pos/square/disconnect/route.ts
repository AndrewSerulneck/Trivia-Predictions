import { NextResponse } from "next/server";
import { guardOwnerPosVenue } from "@/lib/pos/ownerPosGuard";
import { disconnectSquare } from "@/lib/pos/squareConnection";

/**
 * POST /api/owner/pos/square/disconnect { venueId } — "Disconnect Square"
 * (docs/pos-rewards-integration-plan.md Phase 2). Owner-only, venue-scoped, 404 with the flag off.
 *
 * Revokes our access at Square (best effort) and wipes the stored tokens. Gift cards already
 * issued keep working at the register — they are Square's — but guests can no longer open them
 * in the app until the venue reconnects the same Square account.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { venueId?: string } | null;
  const venueId = String(body?.venueId ?? "").trim();
  const checked = await guardOwnerPosVenue(request, venueId);
  if ("response" in checked) return checked.response;

  const result = await disconnectSquare(venueId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Couldn't disconnect Square. Please try again." }, { status: 500 });
  }
  console.info("[PosSquare] disconnected", { venueId, revokedAtSquare: result.revokedAtSquare });
  return NextResponse.json({ ok: true });
}
