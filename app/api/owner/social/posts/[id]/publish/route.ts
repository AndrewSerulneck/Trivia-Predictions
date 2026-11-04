import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { loadInstagramConnection } from "@/lib/social/socialConnections";
import { publishInstagramPost } from "@/lib/social/socialPosts";
import type { SocialPostResponse } from "@/lib/social/socialTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/owner/social/posts/[id]/publish { venueId } — step 2 of "Post now", after the upload
 * (docs/partner-social-promo-plan.md Phase 5). Claims the post (a double tap gets "busy", never a second
 * post), checks the file arrived, hands Meta a 1-hour signed URL and creates the container. A picture is
 * published in this call; a Reel answers "processing" and the sheet polls GET /api/owner/social/posts/[id].
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as { venueId?: unknown } | null;
  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return socialJsonError(404, "Post not found.");

  try {
    const connection = await loadInstagramConnection(venueId);
    if (!connection) return socialJsonError(409, "Connect Instagram first.", "not_connected");
    const outcome = await publishInstagramPost({ venueId, postId: id, connection });
    if (!outcome.ok) {
      if (outcome.code === "not_found") return socialJsonError(404, "Post not found.");
      if (outcome.code === "not_uploaded") return socialJsonError(409, "The file didn't finish uploading. Please try again.", "not_uploaded");
      if (outcome.code === "busy") return socialJsonError(409, "This post is already being sent.", "busy");
      if (outcome.code === "not_connected") return socialJsonError(409, "Connect Instagram again.", "reconnect");
      return socialJsonError(503, "Posting isn't set up yet.", "not_configured");
    }
    const response: SocialPostResponse = { ok: true, post: outcome.post };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[SocialInstagram] publish-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't send the post. Please try again.");
  }
}
