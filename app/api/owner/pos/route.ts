import { NextResponse } from "next/server";
import { listPosConnectionStatuses } from "@/lib/pos/connections";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET /api/owner/pos?venueId= — this venue's point-of-sale connection statuses for the
 * Partner Dashboard's Point of Sale sheet (docs/pos-rewards-integration-plan.md Phase 1).
 *
 * 404 while NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED is off. Returns provider, label, state,
 * merchant name and connected-at only — never a token, merchant id or location id.
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

  const result = await listPosConnectionStatuses(venueId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Couldn't load your point-of-sale connections." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, statuses: result.statuses });
}
