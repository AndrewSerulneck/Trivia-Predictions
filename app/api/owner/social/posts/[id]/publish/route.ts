import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { publishSocialPost } from "@/lib/social/socialPosts";
import type { SocialPostResponse, SocialPublishUnsureResponse } from "@/lib/social/socialTypes";

/**
 * Vercel stops this request at 90 s (SOCIAL_ROUTE_MAX_DURATION_S), well inside the 150 s claim lease, so it can
 * never write to a post another request has taken over (docs/partner-social-promo-plan.md §5.3, Phase 9).
 */
export const maxDuration = 90;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/owner/social/posts/[id]/publish { venueId } — step 2 of "Post now", after the upload
 * (docs/partner-social-promo-plan.md Phases 5–6), Instagram or Facebook Page. Claims the post (a double tap gets "busy", never a second
 * post), checks the file arrived, hands Meta a 1-hour signed URL and creates the container. A picture is
 * published in this call; a Reel answers "processing" and the sheet polls GET /api/owner/social/posts/[id].
 *
 * Phase 19 (plan §5.13): a failure once the post was claimed may come after Meta took it, so it answers 500
 * `code: "unsure"` with the `postId` and the panel polls that post; only a failure before the claim (nothing can
 * have reached Meta) says "try again", since that makes a new post.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as { venueId?: unknown } | null;
  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return socialJsonError(404, "Post not found.");

  try {
    const outcome = await publishSocialPost({ venueId, postId: id });
    if (!outcome.ok) {
      if (outcome.code === "unsure") {
        const unsure: SocialPublishUnsureResponse = { ok: false, error: "We couldn't confirm the post yet.", code: "unsure", postId: outcome.postId };
        return NextResponse.json(unsure, { status: 500 });
      }
      if (outcome.code === "not_found") return socialJsonError(404, "Post not found.");
      if (outcome.code === "not_uploaded") return socialJsonError(409, "The file didn't finish uploading. Please try again.", "not_uploaded");
      if (outcome.code === "busy") return socialJsonError(409, "This post is already being sent.", "busy");
      if (outcome.code === "not_connected") return socialJsonError(409, "Connect again.", "reconnect");
      return socialJsonError(503, "Posting isn't set up yet.", "not_configured");
    }
    const response: SocialPostResponse = { ok: true, post: outcome.post };
    return NextResponse.json(response);
  } catch (error) {
    // Only before the claim (load, connection, upload check): publishSocialPost answers "unsure" for anything after.
    console.error("[SocialPost] publish-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't send the post. Please try again.");
  }
}
