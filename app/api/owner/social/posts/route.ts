import { NextResponse } from "next/server";
import { SOCIAL_POST_COPY } from "@/lib/promo/promoCopy";
import { reelCoverMs, reelPlan } from "@/lib/promo/promoReel";
import { PROMO_MUSIC } from "@/lib/promo/promoSounds";
import { PROMO_TEMPLATES } from "@/lib/promo/promoTemplates";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { loadConnection } from "@/lib/social/socialConnections";
import { createSocialPost, postsLeftToday } from "@/lib/social/socialPosts";
import { isSocialPostFormat, socialCaptionProblem, socialMaxBytes } from "@/lib/social/socialPublishRules";
import { providerSupportsFormat, type CreateSocialPostResponse } from "@/lib/social/socialTypes";

/**
 * POST /api/owner/social/posts — step 1 of "Post now" (docs/partner-social-promo-plan.md Phases 5–6).
 * Body: CreateSocialPostBody, `provider` "instagram" or "facebook" (Facebook: Post or Reel, no Story).
 * Checks the venue's connection for that provider is active, the daily cap, the
 * caption and the file size, makes the social_posts row and answers a signed upload path + token for
 * the PRIVATE social-media bucket. The browser uploads the file straight to storage (never through
 * Vercel), then calls POST /api/owner/social/posts/[id]/publish.
 */

const ID_PATTERN = /^[A-Za-z0-9_:-]{1,80}$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const gate = await guardOwnerSocialVenue(request, venueId);
  if ("response" in gate) return gate.response;

  const format = body?.format;
  const templateId = typeof body?.templateId === "string" ? body.templateId : "";
  const scheduleId = typeof body?.scheduleId === "string" && ID_PATTERN.test(body.scheduleId) ? body.scheduleId : null;
  const prizeIds = Array.isArray(body?.prizeIds)
    ? body.prizeIds.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id)).slice(0, 10)
    : [];
  const musicId = typeof body?.musicId === "string" && PROMO_MUSIC.some((track) => track.id === body.musicId) ? body.musicId : null;
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const byteSize = typeof body?.byteSize === "number" ? body.byteSize : 0;

  const provider = body?.provider;
  if (provider !== "instagram" && provider !== "facebook") return socialJsonError(400, "Pick Instagram or Facebook.");
  if (!isSocialPostFormat(format)) return socialJsonError(400, "Pick Post, Story or Reel.");
  if (!providerSupportsFormat(provider, format)) return socialJsonError(400, "Facebook Stories can't be posted from here. Pick Post or Reel.", "format");
  if (!PROMO_TEMPLATES.some((template) => template.game === templateId)) return socialJsonError(400, "Unknown design.");
  const captionProblem = socialCaptionProblem(caption, provider);
  if (captionProblem) return socialJsonError(400, captionProblem, "caption");
  if (!(byteSize > 0 && byteSize <= socialMaxBytes(format))) {
    return socialJsonError(413, format === "reel" ? "This Reel is too large to post." : "This picture is too large to post.", "too_large");
  }

  try {
    const connection = await loadConnection(venueId, provider);
    const name = SOCIAL_POST_COPY.providers[provider];
    if (!connection || connection.status !== "active") {
      return socialJsonError(409, `Connect ${name} first.`, connection?.status === "reconnect_needed" ? "reconnect" : "not_connected");
    }
    if ((await postsLeftToday(venueId)) <= 0) {
      return socialJsonError(429, "You've reached today's limit for Post now. Try again tomorrow, or Share it yourself.", "daily_cap");
    }
    const input = {
      venueId,
      ownerId: gate.auth.ownerId,
      format,
      templateId,
      scheduleId,
      prizeIds,
      musicId,
      caption,
      coverMs: format === "reel" ? reelCoverMs(reelPlan(body?.withPrize === true)) : null,
    };
    const created = await createSocialPost({ ...input, connection });
    const response: CreateSocialPostResponse = { ok: true, ...created };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[SocialPost] create-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return socialJsonError(500, "Couldn't start the post. Please try again.");
  }
}
