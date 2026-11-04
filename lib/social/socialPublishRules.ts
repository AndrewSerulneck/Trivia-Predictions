import type { SocialPostErrorCode, SocialPostFormat } from "@/lib/social/socialTypes";

// The rules of Instagram "Post now" (docs/partner-social-promo-plan.md Phase 5). Pure; shared by the
// routes, the sheet and the tests. Meta's limits are from its Instagram Graph API reference, read
// 2026-11-04 (ig-user/media, ig-container, error codes).

/** Instagram: "Maximum 2200 characters, 30 hashtags, and 20 @ tags." */
export const SOCIAL_CAPTION_MAX_CHARS = 2200;
export const SOCIAL_CAPTION_MAX_HASHTAGS = 30;
export const SOCIAL_CAPTION_MAX_MENTIONS = 20;

/** Instagram JPEG limit 8 MB; our bucket's per-file limit (migration) is 50 MB, well over a 15 s Reel. */
export const SOCIAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const SOCIAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Post now attempts per venue per rolling 24 h. Instagram allows 50 published posts a day per account;
 * this is far below it and stops a stuck button or a loop from spamming a partner's feed.
 */
export const SOCIAL_DAILY_POST_CAP = 10;

/**
 * The sheet checks a Reel every 10 s for at most 5 minutes (Meta: "once per minute, for no more than 5
 * minutes"; Reels of ≈11 MB usually finish in well under a minute). ≤30 checks per Reel, each one Graph
 * call. A post still processing after that is finished by the next sheet open (and, from Phase 7, the cron).
 */
export const SOCIAL_POLL_INTERVAL_MS = 10_000;
export const SOCIAL_POLL_MAX_MS = 5 * 60_000;

/** A request that claimed a post and then died leaves it "publishing"; after this, another may take over. */
export const SOCIAL_PUBLISH_LEASE_MS = 90_000;
/** An upload never finished (tab closed): the row fails and the file is deleted. */
export const SOCIAL_UPLOAD_ABANDON_MS = 60 * 60_000;
/** Meta: "Containers expire after 24 hours." */
export const SOCIAL_CONTAINER_TTL_MS = 24 * 60 * 60_000;
/** A pending "choose your account" row (holding a user token) is dropped after this. */
export const SOCIAL_PENDING_CHOICE_TTL_MS = 60 * 60_000;
/** How many recent posts the sheet lists. */
export const SOCIAL_RECENT_POSTS = 5;

export const SOCIAL_MEDIA_BUCKET = "social-media";

export const socialMediaType = (format: SocialPostFormat): "image/jpeg" | "video/mp4" =>
  format === "reel" ? "video/mp4" : "image/jpeg";

export const socialMediaPath = (postId: string, format: SocialPostFormat): string =>
  `posts/${postId}.${format === "reel" ? "mp4" : "jpg"}`;

export const socialMaxBytes = (format: SocialPostFormat): number =>
  format === "reel" ? SOCIAL_VIDEO_MAX_BYTES : SOCIAL_IMAGE_MAX_BYTES;

/** Null = fine; otherwise what's wrong, in the sheet's words. */
export const socialCaptionProblem = (caption: string): string | null => {
  if (caption.length > SOCIAL_CAPTION_MAX_CHARS) return `Captions can be at most ${SOCIAL_CAPTION_MAX_CHARS} characters.`;
  if ((caption.match(/#[^\s#]+/g) ?? []).length > SOCIAL_CAPTION_MAX_HASHTAGS) {
    return `Instagram allows at most ${SOCIAL_CAPTION_MAX_HASHTAGS} hashtags.`;
  }
  if ((caption.match(/@[A-Za-z0-9._]+/g) ?? []).length > SOCIAL_CAPTION_MAX_MENTIONS) {
    return `Instagram allows at most ${SOCIAL_CAPTION_MAX_MENTIONS} @ tags.`;
  }
  return null;
};

/** How a Graph error should be handled. `token` / `permission` mean the partner must reconnect. */
export type GraphErrorKind = "token" | "permission" | "not_ready" | "rate_limit" | "media" | "expired" | "network" | "other";

/** `code` / `subcode` from Meta's error object. A request that never reached Meta is "network" (metaGraph.ts). */
export const classifyGraphError = (code: number, subcode: number | null): GraphErrorKind => {
  if (code === 190 || code === 102 || code === 463 || code === 467) return "token";
  if (code === 10 || (code >= 200 && code <= 299)) return "permission";
  if (code === 9007 || subcode === 2207027) return "not_ready";
  if (subcode === 2207008 || subcode === 2207020) return "expired";
  if (subcode === 2207042 || code === 4 || code === 17 || code === 32 || code === 613) return "rate_limit";
  if (subcode !== null && subcode >= 2207000 && subcode < 2208000) return "media";
  return "other";
};

/** The partner-facing reason stored on a failed post. */
export const postErrorFor = (kind: GraphErrorKind): SocialPostErrorCode => {
  if (kind === "token" || kind === "permission") return "reconnect";
  if (kind === "rate_limit") return "rate_limit";
  if (kind === "media") return "media_rejected";
  if (kind === "expired") return "expired";
  return "failed";
};

/** What a container's status_code means for us. */
export type ContainerStep = "publish" | "wait" | "failed" | "expired" | "already_published";

export const containerStep = (statusCode: string | null): ContainerStep => {
  switch (statusCode) {
    case "FINISHED":
      return "publish";
    case "PUBLISHED":
      return "already_published";
    case "ERROR":
      return "failed";
    case "EXPIRED":
      return "expired";
    default:
      return "wait";
  }
};

/** Only Instagram post URLs are shown as "View on Instagram" links. */
export const safeInstagramPermalink = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)instagram\.com$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
};

export const isSocialPostFormat = (value: unknown): value is SocialPostFormat =>
  value === "post" || value === "story" || value === "reel";
