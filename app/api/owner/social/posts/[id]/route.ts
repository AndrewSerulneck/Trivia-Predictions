import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { pollSocialPost } from "@/lib/social/socialPosts";
import type { SocialPostResponse } from "@/lib/social/socialTypes";

/**
 * Vercel stops this request at 90 s (SOCIAL_ROUTE_MAX_DURATION_S), well inside the 150 s claim lease, so it can
 * never write to a post another request has taken over (docs/partner-social-promo-plan.md §5.3, Phase 9).
 */
export const maxDuration = 90;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/owner/social/posts/[id]?venueId= — the sheet's Reel check, Instagram or Facebook (every 10 s, at most 5 minutes;
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
    const post = await pollSocialPost({ venueId, postId: id });
    if (!post) return socialJsonError(404, "Post not found.");
    const body: SocialPostResponse = { ok: true, post };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[SocialPost] poll-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't check the post.");
  }
}
