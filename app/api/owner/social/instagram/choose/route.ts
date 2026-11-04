import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { chooseInstagramAccount, connectionView, loadInstagramConnection } from "@/lib/social/socialConnections";

/**
 * POST /api/owner/social/instagram/choose { venueId, instagramId } — the partner granted several
 * Instagram accounts and picked one (docs/partner-social-promo-plan.md Phase 5). Only an id from the
 * venue's own pending list is accepted; one Graph call fetches that Page's token.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { venueId?: unknown; instagramId?: unknown } | null;
  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;

  const instagramId = typeof body?.instagramId === "string" ? body.instagramId.trim() : "";
  if (!/^\d{1,40}$/.test(instagramId)) return socialJsonError(400, "Pick an account.");

  try {
    const result = await chooseInstagramAccount({ venueId, ownerId: gate.auth.ownerId, instagramId });
    if (result === "expired") return socialJsonError(409, "That choice expired. Connect Instagram again.", "expired");
    if (result === "not_found") return socialJsonError(404, "That account isn't available any more. Connect Instagram again.", "not_found");
    if (result === "reconnect") return socialJsonError(409, "Facebook needs you to connect again.", "reconnect");
    if (result === "error") return socialJsonError(502, "Couldn't reach Instagram. Please try again.");
    return NextResponse.json({ ok: true, connection: connectionView(await loadInstagramConnection(venueId)) });
  } catch (error) {
    console.error("[SocialInstagram] choose-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't connect that account. Please try again.");
  }
}
