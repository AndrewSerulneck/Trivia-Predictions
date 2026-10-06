import { NextResponse } from "next/server";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

type OwnerAuth = { ownerId: string; venueIds: string[] };

/**
 * The gate every venue-scoped `/api/owner/pos/**` route shares, in this order:
 * flag off → 404, no owner session → whatever `requireOwnerAuth` throws, no `venueId` → 400,
 * a venue the owner doesn't hold → 403. A route whose failure shape differs (the Square connect and
 * callback routes redirect instead of answering JSON) doesn't use this.
 */
export const guardOwnerPosVenue = async (
  request: Request,
  venueId: string,
): Promise<{ auth: OwnerAuth } | { response: Response }> => {
  if (!isPosIntegrationsEnabled()) {
    return { response: NextResponse.json({ ok: false, error: "Not found." }, { status: 404 }) };
  }
  let auth: OwnerAuth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return { response: response as Response };
  }
  if (!venueId) return { response: NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 }) };
  if (!auth.venueIds.includes(venueId)) {
    return { response: NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 }) };
  }
  return { auth };
};
