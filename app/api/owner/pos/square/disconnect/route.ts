import { NextResponse } from "next/server";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { disconnectSquare } from "@/lib/pos/squareConnection";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * POST /api/owner/pos/square/disconnect { venueId } — "Disconnect Square"
 * (docs/pos-rewards-integration-plan.md Phase 2). Owner-only, venue-scoped, 404 with the flag off.
 *
 * Revokes our access at Square (best effort) and wipes the stored tokens. Gift cards already
 * issued keep working at the register — they are Square's — but guests can no longer open them
 * in the app until the venue reconnects the same Square account.
 */
export async function POST(request: Request) {
  if (!isPosIntegrationsEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => null)) as { venueId?: string } | null;
  const venueId = String(body?.venueId ?? "").trim();
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  const result = await disconnectSquare(venueId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Couldn't disconnect Square. Please try again." }, { status: 500 });
  }
  console.info("[PosSquare] disconnected", { venueId, revokedAtSquare: result.revokedAtSquare });
  return NextResponse.json({ ok: true });
}
