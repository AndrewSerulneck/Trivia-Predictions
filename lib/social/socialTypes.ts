// What the "Post now" routes and the Share to social sheet exchange (docs/partner-social-promo-plan.md
// Phases 5–6). Pure types: no token and no Meta user id ever appears in any of them. A Facebook Page id
// appears only as a choice the partner picks from (they granted us that Page; it is public on Facebook).

export type SocialProvider = "instagram" | "facebook";
export type SocialPostFormat = "post" | "story" | "reel";
export type SocialPostStatus = "scheduled" | "uploading" | "publishing" | "processing" | "published" | "failed" | "cancelled";

/**
 * Why a post didn't go out, as the sheet explains it (lib/promo/promoCopy.ts SOCIAL_POST_COPY.errors).
 * `unconfirmed` (Phase 9): we can't tell whether Meta posted it — a Facebook photo whose one publish call
 * got no answer, or a Facebook Reel Meta never reported on after its finish was sent; from Phase 14 also
 * an Instagram post whose media_publish was sent but never confirmed (plan §5.8).
 */
export type SocialPostErrorCode = "reconnect" | "rate_limit" | "media_rejected" | "expired" | "upload_missing" | "unconfirmed" | "failed";

export type InstagramAccountChoice = { instagramId: string; username: string | null; pageName: string | null };

export type InstagramConnectionView =
  | { state: "not_connected" }
  | { state: "choose_account"; choices: InstagramAccountChoice[] }
  | { state: "reconnect_needed"; username: string | null }
  | { state: "connected"; username: string | null };

/** A Facebook Page the partner granted, offered when they granted several (Phase 6). */
export type FacebookPageChoice = { pageId: string; pageName: string | null };

export type FacebookConnectionView =
  | { state: "not_connected" }
  | { state: "choose_page"; choices: FacebookPageChoice[] }
  | { state: "reconnect_needed"; pageName: string | null }
  | { state: "connected"; pageName: string | null };

export type SocialPostView = {
  id: string;
  provider: SocialProvider;
  format: SocialPostFormat;
  templateId: string;
  status: SocialPostStatus;
  permalink: string | null;
  error: SocialPostErrorCode | null;
  createdAt: string;
};

/** GET /api/owner/social/status — both connections from the one Facebook login, recent posts, today's count. */
export type SocialStatusResponse = {
  ok: true;
  instagram: InstagramConnectionView;
  facebook: FacebookConnectionView;
  posts: SocialPostView[];
  postsLeftToday: number;
};

/** Facebook Pages take Posts and Reels; Page Stories aren't published through the API here (plan §4.6 table). */
export const providerSupportsFormat = (provider: SocialProvider, format: SocialPostFormat): boolean =>
  provider === "instagram" || format !== "story";

/** POST /api/owner/social/posts — create the row and get somewhere to upload the file. */
export type CreateSocialPostBody = {
  venueId: string;
  provider: SocialProvider;
  format: SocialPostFormat;
  templateId: string;
  scheduleId: string | null;
  prizeIds: string[];
  musicId: string | null;
  caption: string;
  withPrize: boolean;
  byteSize: number;
};

/** `uploadUrl`: a signed, single-path upload URL for the private bucket (PUT the file to it, ≈2 h). */
export type CreateSocialPostResponse = { ok: true; postId: string; uploadUrl: string };

export type SocialPostResponse = { ok: true; post: SocialPostView };

/**
 * POST /api/owner/social/posts/[id]/publish answered 500 after the claim (Phase 19): Meta may already have the
 * post, so the panel polls `postId` (as for "processing") and never offers "try again".
 */
export type SocialPublishUnsureResponse = { ok: false; error: string; code: "unsure"; postId: string };

/** Where Meta sent the partner back to (`?socialResult=` on the dashboard). */
export type SocialConnectResult =
  | "connected"
  | "choose_account"
  | "no_instagram"
  /** The Page connected, but no Instagram professional account is linked to it. */
  | "facebook_only"
  /** The Page connected; the partner switched Instagram off in Meta's dialog (Phase 10). */
  | "instagram_declined"
  /** Instagram connected; the partner switched posting to the Page off in Meta's dialog (Phase 10). */
  | "facebook_declined"
  /** Instagram connected; posting to the Page was allowed, but no Page they can post to was found (Phase 15). */
  | "facebook_no_page"
  /** Nothing connected: Instagram switched off, and no Page to post to (Phase 20). */
  | "instagram_declined_no_page"
  /** Nothing connected: the Page switched off, and no Instagram account linked (Phase 20). */
  | "facebook_declined_no_instagram"
  | "missing_permissions"
  | "denied"
  | "expired"
  | "not_configured"
  | "error";
