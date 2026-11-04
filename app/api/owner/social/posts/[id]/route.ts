import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { loadInstagramConnection } from "@/lib/social/socialConnections";
import { pollInstagramPost } from "@/lib/social/socialPosts";
import type { SocialPostResponse } from "@/lib/social/socialTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/owner/social/posts/[id]?venueId= — the sheet's Reel check (every 10 s, at most 5 minutes;
 * docs/partner-social-promo-plan.md Phase 5). Moves the post one step forward (one Graph status call
 * while Meta is still processing) and answers it. Venue-scoped: another venue's post id is a 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return socialJsonError(404, "Post not found.");

  try {
    const post = await pollInstagramPost({ venueId, postId: id, connection: await loadInstagramConnection(venueId) });
    if (!post) return socialJsonError(404, "Post not found.");
    const body: SocialPostResponse = { ok: true, post };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[SocialInstagram] poll-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't check the post.");
  }
}
