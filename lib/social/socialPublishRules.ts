import type { SocialConnectResult, SocialPostErrorCode, SocialPostFormat, SocialPostStatus, SocialProvider } from "@/lib/social/socialTypes";

// The rules of Instagram and Facebook Page "Post now" (docs/partner-social-promo-plan.md Phases 5–6). Pure; shared by the
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

/**
 * The routes that can claim a post (publish, the poll, Recent posts) export `maxDuration = 90`: Vercel
 * stops them there, so no request can outlive its claim. Next.js needs the literal in each route; a
 * contract test (tests/social-publish-contract.test.ts) checks each one says this number.
 */
export const SOCIAL_ROUTE_MAX_DURATION_S = 90;

/**
 * A request that claimed a post and then died leaves it "publishing"; after this, another may take over.
 * Kept at least a minute above SOCIAL_ROUTE_MAX_DURATION_S (contract test), so a live request always
 * still holds its claim (plan §5.3, Phase 9).
 */
export const SOCIAL_PUBLISH_LEASE_MS = 150_000;
/** An upload never finished (tab closed): the row fails and the file is deleted. */
export const SOCIAL_UPLOAD_ABANDON_MS = 60 * 60_000;
/** Meta: "Containers expire after 24 hours." */
export const SOCIAL_CONTAINER_TTL_MS = 24 * 60 * 60_000;
/** A pending "choose your account" row (holding a user token) is dropped after this. */
export const SOCIAL_PENDING_CHOICE_TTL_MS = 60 * 60_000;
/** How many recent posts the sheet lists. */
export const SOCIAL_RECENT_POSTS = 5;
/** Meta's numeric id: the only id either provider accepts for a pending choice (a pick, or a stored choice). */
export const META_ID = /^\d{1,40}$/;

export const SOCIAL_MEDIA_BUCKET = "social-media";

export const socialMediaType = (format: SocialPostFormat): "image/jpeg" | "video/mp4" =>
  format === "reel" ? "video/mp4" : "image/jpeg";

export const socialMediaPath = (postId: string, format: SocialPostFormat): string =>
  `posts/${postId}.${format === "reel" ? "mp4" : "jpg"}`;

export const socialMaxBytes = (format: SocialPostFormat): number =>
  format === "reel" ? SOCIAL_VIDEO_MAX_BYTES : SOCIAL_IMAGE_MAX_BYTES;

/**
 * Null = fine; otherwise what's wrong, in the sheet's words. The length limit applies to both providers (one
 * caption box); the hashtag and @ limits are Instagram's only (Phase 20), so Facebook's button isn't blocked by them.
 */
export const socialCaptionProblem = (caption: string, provider: SocialProvider): string | null => {
  if (caption.length > SOCIAL_CAPTION_MAX_CHARS) return `Captions can be at most ${SOCIAL_CAPTION_MAX_CHARS} characters.`;
  if (provider !== "instagram") return null;
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
  // 80001 = a Facebook Page's rate limit (Pages API overview, read 2026-11-04).
  if (subcode === 2207042 || code === 4 || code === 17 || code === 32 || code === 613 || code === 80001) return "rate_limit";
  if (subcode !== null && subcode >= 2207000 && subcode < 2208000) return "media";
  // Facebook Pages: 324 = missing/invalid image, 368 = blocked as disallowed; 1363xxx = the Reel's
  // aspect ratio / resolution / duration / frame rate (Reels publishing guide, read 2026-11-04).
  if (code === 324 || code === 368) return "media";
  if ([code, subcode].some((value) => value !== null && value >= 1363000 && value < 1364000)) return "media";
  return "other";
};

/** A Graph call that didn't succeed. A request that got no readable answer from Meta is "network" (metaGraph.ts). */
export type GraphError = { kind: GraphErrorKind; code: number | null; subcode: number | null; httpStatus: number | null };

/**
 * Meta may have done it anyway: no readable answer (never reached Meta, timed out, a cut-off body), a 2xx
 * or 5xx with no Graph error code, or Graph's own "unknown error" / "service unavailable" codes (1, 2).
 * Used only for calls Meta can't undo (media_publish, the Facebook photo, the Reel upload and finish).
 * Calling a real refusal "unsure" only makes the post wait for the poll; the reverse can post twice.
 */
export const isUnsure = (error: GraphError): boolean => {
  if (error.kind === "network") return true;
  if (error.code === 1 || error.code === 2) return true;
  return error.code === null && error.httpStatus !== null && (error.httpStatus >= 500 || error.httpStatus < 300);
};

/** The partner-facing reason stored on a failed post. */
export const postErrorFor = (kind: GraphErrorKind): SocialPostErrorCode => {
  if (kind === "token" || kind === "permission") return "reconnect";
  if (kind === "rate_limit") return "rate_limit";
  if (kind === "media") return "media_rejected";
  if (kind === "expired") return "expired";
  return "failed";
};

/**
 * After media_publish got no clear answer, how long a container that still reads FINISHED is given for
 * Meta's read to catch up before the post ends "unconfirmed" (plan §5.8, Phase 14). The sheet polls for
 * 5 minutes (SOCIAL_POLL_MAX_MS) and Recent posts moves open posts on open. Lower it only if Hightop's own
 * account shows PUBLISHED is always immediate.
 */
export const SOCIAL_INSTAGRAM_CONFIRM_MS = 10 * 60_000;

/** What a container's status_code means for us. */
export type ContainerStep = "publish" | "wait" | "failed" | "expired" | "already_published" | "unconfirmed";

/**
 * `publishSent`: media_publish has already been sent for this post (the Phase 14 mark), so it is never sent
 * again. FINISHED then means Meta's read hasn't caught up, or the call never arrived: wait until
 * SOCIAL_INSTAGRAM_CONFIRM_MS has passed since it was sent (`sinceSentMs`), then "unconfirmed".
 */
export const containerStep = (statusCode: string | null, input: { publishSent: boolean; sinceSentMs: number }): ContainerStep => {
  switch (statusCode) {
    case "FINISHED":
      if (!input.publishSent) return "publish";
      return input.sinceSentMs >= SOCIAL_INSTAGRAM_CONFIRM_MS ? "unconfirmed" : "wait";
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

/**
 * A Facebook Reel's status (GET /{video-id}?fields=status; Reels publishing guide, read 2026-11-04 and
 * again 2026-11-04 for Phase 9). `video_status`: uploading, upload_complete, upload_failed, processing,
 * ready, error, expired. Each phase's `status`: not_started, in_progress, complete(d), error (Meta's
 * examples say "complete", its table "completed"). `publishing_phase.publish_status`: draft, scheduled,
 * published, error.
 */
export type FacebookReelStatus = {
  videoStatus: string | null;
  uploading: string | null;
  processing: string | null;
  publishing: string | null;
  publishStatus: string | null;
};

/**
 * `send_finish`: Meta has the whole file but our finish call never went out (the upload's answer was
 * lost). It is the FIRST finish, never a second one: Meta's docs don't say a repeated finish is harmless,
 * and a second upload of the same video id isn't documented either, so neither is ever sent (plan §5.3).
 */
export type FacebookReelStep = "published" | "wait" | "send_finish" | "failed" | "expired";

export const facebookReelStep = (status: FacebookReelStatus, input: { finishSent: boolean }): FacebookReelStep => {
  const done = (value: string | null) => value === "complete" || value === "completed";
  if (status.videoStatus === "expired") return "expired";
  if (
    status.videoStatus === "error" ||
    status.videoStatus === "upload_failed" ||
    [status.uploading, status.processing, status.publishing, status.publishStatus].includes("error")
  ) {
    return "failed";
  }
  if (status.publishStatus === "published" || done(status.publishing)) return "published";
  const uploaded = done(status.uploading) || status.videoStatus === "upload_complete" || status.videoStatus === "ready";
  const notPublishing = status.publishing === null || status.publishing === "not_started";
  if (!input.finishSent && uploaded && notPublishing) return "send_finish";
  return "wait";
};

// ── Sent to Meta: the marks, and "may be live" (Phases 9, 14, 19) ────────────────────────────

/** The few social_posts columns the "already sent to Meta" rules read (a whole row fits too). */
export type SocialPostMarks = {
  provider: SocialProvider;
  status: SocialPostStatus;
  container_id: string | null;
  external_post_id: string | null;
};

/**
 * Instagram: media_publish has been sent for this post (Phase 14). Marked by external_post_id =
 * container_id in the lease-renewing write just before the call, so it goes out at most once. (A
 * published post's external_post_id is the media id instead, which never equals the container id.)
 */
export const publishSent = (row: SocialPostMarks): boolean =>
  row.provider === "instagram" && row.external_post_id !== null && row.external_post_id === row.container_id;

/**
 * Facebook Reel: its finish has been sent (Phase 9). Marked by external_post_id = the video id in the fenced
 * write just before the call, so it goes out at most once. For a post that isn't final yet.
 */
export const finishSent = (row: SocialPostMarks): boolean => row.provider === "facebook" && row.external_post_id !== null;

/**
 * An open post that may already be on Instagram or the Page (plan §5.13, Phase 19): a request holds it
 * ("publishing", maybe in the middle of a call Meta can't undo), or media_publish / the Reel finish was
 * sent. Ending such a post without Meta's answer (Disconnect, Meta's deauthorize / data deletion) says
 * "unconfirmed", never "cancelled". On an open post external_post_id is set only by those two marks, so
 * "not publishing and external_post_id is null" is the same test in a database filter.
 * For a post that isn't final yet (callers pass only open posts).
 */
export const socialPostMayBeLive = (row: SocialPostMarks): boolean => row.status === "publishing" || publishSent(row) || finishSent(row);

/**
 * A Facebook Reel Meta hasn't reported on within this is ended. A 15 s Reel normally takes a few minutes.
 * Past it, a Reel whose finish was sent is "unconfirmed" (it may be on the Page); one whose finish never
 * went out is "expired" (it can't be). Meta's own answer, when it gives one, always wins.
 */
export const SOCIAL_FACEBOOK_REEL_TTL_MS = 60 * 60_000;

/** Only facebook.com links are shown as "View on Facebook"; a relative permalink_url is made absolute. */
export const safeFacebookPermalink = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), "https://www.facebook.com");
    return url.protocol === "https:" && /(^|\.)facebook\.com$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
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

// ── Connect callback (plan §5.4, Phase 10) ────────────────────────────────────────────────

/**
 * What one Facebook login did for one provider: `not_granted` = the partner switched that provider's
 * permissions off in Meta's dialog; `none_linked` = granted, but no account / Page to post to;
 * `saved` = exactly one, connected; `choose` = several, the sheet asks which.
 */
export type SocialConnectOutcome = "saved" | "choose" | "not_granted" | "none_linked";

export const socialConnectOutcome = (granted: boolean, found: number): SocialConnectOutcome =>
  !granted ? "not_granted" : found === 0 ? "none_linked" : found === 1 ? "saved" : "choose";

/**
 * The one result the sheet shows for a login (the table in plan §5.4; Phase 15 added `facebook_no_page`, Phase 20
 * the two "declined, and nothing linked on the other side" results).
 * A declined provider is named (`instagram_declined` / `facebook_declined`), never mistaken for "no
 * account linked".
 *
 * Kept on purpose (D37): `choose` on either side reads `choose_account` even when the other provider was
 * declined or has nothing linked. The redirect carries one result, picking an account is what the partner
 * must do now, and the status row right under the picker shows the other provider as "Not connected".
 */
export const socialConnectResult = (instagram: SocialConnectOutcome, facebook: SocialConnectOutcome): SocialConnectResult => {
  if (instagram === "not_granted" && facebook === "not_granted") return "missing_permissions";
  if (instagram === "choose" || facebook === "choose") return "choose_account";
  if (instagram !== "saved" && facebook !== "saved") {
    // Phase 20: a decline plus "nothing linked" names the decline; only "nothing linked" twice reads no_instagram.
    if (instagram === "not_granted") return "instagram_declined_no_page";
    if (facebook === "not_granted") return "facebook_declined_no_instagram";
    return "no_instagram";
  }
  if (instagram === "saved") return facebook === "not_granted" ? "facebook_declined" : facebook === "none_linked" ? "facebook_no_page" : "connected";
  return instagram === "not_granted" ? "instagram_declined" : "facebook_only";
};

/** A venue's earlier active row that this login shows can no longer post (Phase 15): which, and why. */
export type SocialGoneConnection = { provider: SocialProvider; reason: string };

/** The `last_error` a gone row gets, by this login's outcome for its provider. `saved` / `choose` replace the row instead. */
export const SOCIAL_GONE_REASONS = { not_granted: "declined at reconnect", none_linked: "no account at reconnect" } as const;

/**
 * Each provider whose outcome in this login means the same Facebook user's earlier row for it can't post
 * any more: `not_granted` (the permission is off for that user, so for the old Page token too) and
 * `none_linked` (granted, but that user no longer has the account / a Page they may post to).
 */
export const socialGoneConnections = (outcomes: Record<SocialProvider, SocialConnectOutcome>): SocialGoneConnection[] =>
  (["instagram", "facebook"] as const).flatMap((provider) => {
    const outcome = outcomes[provider];
    return outcome === "not_granted" || outcome === "none_linked" ? [{ provider, reason: SOCIAL_GONE_REASONS[outcome] }] : [];
  });
