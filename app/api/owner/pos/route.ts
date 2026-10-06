import { NextResponse } from "next/server";
import { listPosConnectionStatuses } from "@/lib/pos/connections";
import { guardOwnerPosVenue } from "@/lib/pos/ownerPosGuard";

/**
 * GET /api/owner/pos?venueId= — this venue's point-of-sale connection statuses for the
 * Partner Dashboard's Point of Sale sheet (docs/pos-rewards-integration-plan.md Phase 1).
 *
 * 404 while NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED is off. Returns provider, label, state,
 * merchant name and connected-at only — never a token, merchant id or location id.
 */
export async function GET(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const checked = await guardOwnerPosVenue(request, venueId);
  if ("response" in checked) return checked.response;

  const result = await listPosConnectionStatuses(venueId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Couldn't load your point-of-sale connections." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, statuses: result.statuses });
}
