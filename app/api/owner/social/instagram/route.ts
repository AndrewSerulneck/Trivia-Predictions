import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { connectionView, disconnectInstagram, loadInstagramConnection } from "@/lib/social/socialConnections";
import { listRecentInstagramPosts, postsLeftToday } from "@/lib/social/socialPosts";
import type { InstagramStatusResponse } from "@/lib/social/socialTypes";

/**
 * GET /api/owner/social/instagram?venueId= — the Share to social sheet's Instagram panel, once per open
 * (docs/partner-social-promo-plan.md Phase 5): the connection (no token, no ids), the last five posts
 * (at most two unfinished ones moved forward, ≤2 Graph calls) and how many posts are left today.
 *
 * DELETE /api/owner/social/instagram?venueId= — Disconnect: deletes the token and row, cancels open
 * posts and deletes their files, and removes the app from the partner's Facebook login when no venue
 * still uses it.
 */
export async function GET(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;

  try {
    const connection = await loadInstagramConnection(venueId);
    const [posts, left] = await Promise.all([listRecentInstagramPosts(venueId, connection), postsLeftToday(venueId)]);
    const body: InstagramStatusResponse = { ok: true, connection: connectionView(connection), posts, postsLeftToday: left };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[SocialInstagram] status-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't load your Instagram connection.");
  }
}

export async function DELETE(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;

  try {
    await disconnectInstagram(venueId);
    console.info("[SocialInstagram] disconnected", { venueId });
    return NextResponse.json({ ok: true, connection: { state: "not_connected" } });
  } catch (error) {
    console.error("[SocialInstagram] disconnect-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't disconnect Instagram. Please try again.");
  }
}
