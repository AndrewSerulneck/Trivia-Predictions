// What the "Post now" routes and the Share to social sheet exchange (docs/partner-social-promo-plan.md
// Phase 5). Pure types: no token, no Meta user id, no Page id ever appears in any of them.

export type SocialProvider = "instagram" | "facebook";
export type SocialPostFormat = "post" | "story" | "reel";
export type SocialPostStatus = "scheduled" | "uploading" | "publishing" | "processing" | "published" | "failed" | "cancelled";

/** Why a post didn't go out, as the sheet explains it (lib/promo/promoCopy.ts SOCIAL_POST_COPY.errors). */
export type SocialPostErrorCode = "reconnect" | "rate_limit" | "media_rejected" | "expired" | "upload_missing" | "failed";

export type InstagramAccountChoice = { instagramId: string; username: string | null; pageName: string | null };

export type InstagramConnectionView =
  | { state: "not_connected" }
  | { state: "choose_account"; choices: InstagramAccountChoice[] }
  | { state: "reconnect_needed"; username: string | null }
  | { state: "connected"; username: string | null };

export type SocialPostView = {
  id: string;
  format: SocialPostFormat;
  templateId: string;
  status: SocialPostStatus;
  permalink: string | null;
  error: SocialPostErrorCode | null;
  createdAt: string;
};

export type InstagramStatusResponse = {
  ok: true;
  connection: InstagramConnectionView;
  posts: SocialPostView[];
  postsLeftToday: number;
};

/** POST /api/owner/social/posts — create the row and get somewhere to upload the file. */
export type CreateSocialPostBody = {
  venueId: string;
  provider: "instagram";
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

/** Where Meta sent the partner back to (`?socialResult=` on the dashboard). */
export type SocialConnectResult =
  | "connected"
  | "choose_account"
  | "no_instagram"
  | "missing_permissions"
  | "denied"
  | "expired"
  | "not_configured"
  | "error";
