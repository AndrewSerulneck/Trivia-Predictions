import { NextResponse } from "next/server";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { connectionView, facebookConnectionView, loadConnection } from "@/lib/social/socialConnections";
import { listRecentSocialPosts, postsLeftToday } from "@/lib/social/socialPosts";
import type { SocialStatusResponse } from "@/lib/social/socialTypes";

/**
 * Vercel stops this request at 90 s (SOCIAL_ROUTE_MAX_DURATION_S), well inside the 150 s claim lease, so it can
 * never write to a post another request has taken over (docs/partner-social-promo-plan.md §5.3, Phase 9).
 */
export const maxDuration = 90;

/**
 * GET /api/owner/social/status?venueId= — the Post now panel, once per sheet open
 * (docs/partner-social-promo-plan.md Phases 5–6): the Instagram and Facebook Page connections (no
 * token), the last five posts on either (at most two unfinished ones moved forward side by side, each
 * normally one Graph status call) and how many posts are left today. Two connection reads + one posts
 * read + one count.
 */
export async function GET(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;

  try {
    // The day's count needs neither connection, so it runs alongside them (Phase 21); the posts read needs both.
    const connectionsAndPosts = async () => {
      const [instagram, facebook] = await Promise.all([loadConnection(venueId, "instagram"), loadConnection(venueId, "facebook")]);
      return { instagram, facebook, posts: await listRecentSocialPosts(venueId, { instagram, facebook }) };
    };
    const [{ instagram, facebook, posts }, left] = await Promise.all([connectionsAndPosts(), postsLeftToday(venueId)]);
    const body: SocialStatusResponse = {
      ok: true,
      instagram: connectionView(instagram),
      facebook: facebookConnectionView(facebook),
      posts,
      postsLeftToday: left,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[SocialPost] status-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't load your connections.");
  }
}
