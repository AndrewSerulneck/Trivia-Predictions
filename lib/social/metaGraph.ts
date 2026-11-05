import "server-only";
import { META_GRAPH_VERSION, META_PARTNER_APP_ID, metaAppSecretProof } from "@/lib/social/metaConfig";
import {
  classifyGraphError,
  safeFacebookPermalink,
  safeInstagramPermalink,
  type FacebookReelStatus,
  type GraphError,
} from "@/lib/social/socialPublishRules";

// The Meta Graph API calls "Post now" makes (docs/partner-social-promo-plan.md Phases 5–6): Facebook
// Login for Business with a USER access token configuration (Andrew, 2026-11-04), then the Instagram API
// with Facebook Login and the Pages API on graph.facebook.com, both with the Page's token.
//
// Tokens go in the form body of POSTs and the query of GETs (Meta's documented way), always with
// appsecret_proof. Nothing here logs: callers log the error `kind` and `code` only, never a token, a
// URL or Meta's response body. Each call times out after 20 s. A call that gets no readable answer
// (never reached Meta, timed out, or a 2xx whose body was cut off) is "network": Meta may have done it
// (socialPublishRules.ts isUnsure).

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TIMEOUT_MS = 20_000;

export type { GraphError };
export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

type RawGraphError = { error?: { code?: unknown; error_subcode?: unknown } };

const toInt = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

const noAnswer = (httpStatus: number | null): GraphError => ({ kind: "network", code: null, subcode: null, httpStatus });

/**
 * The response's JSON. A 2xx whose body can't be read (cut off, or the 20 s timeout fired mid-body) is
 * no answer at all: Meta may have done it, so it must never read as a refusal or crash the caller.
 */
const readBody = async (response: Response): Promise<{ ok: true; body: unknown } | { ok: false; error: GraphError }> => {
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (response.ok && (body === undefined || body === null || typeof body !== "object")) return { ok: false, error: noAnswer(response.status) };
  return { ok: true, body: body ?? null };
};

const graphError = (httpStatus: number | null, body: unknown): GraphError => {
  const raw = (body as RawGraphError | null)?.error;
  const code = toInt(raw?.code);
  const subcode = toInt(raw?.error_subcode);
  // A refusal with no Meta error object (an HTML error page, an empty body): "other", never "network".
  return { kind: code === null ? "other" : classifyGraphError(code, subcode), code, subcode, httpStatus };
};

type CallInput = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  params?: Record<string, string>;
  /** User/Page token (gets appsecret_proof) — or an app token, which doesn't. */
  token: string;
  secret: string;
  appToken?: boolean;
};

const call = async <T>(input: CallInput): Promise<GraphResult<T>> => {
  const params = new URLSearchParams(input.params);
  params.set("access_token", input.token);
  if (!input.appToken) params.set("appsecret_proof", metaAppSecretProof(input.token, input.secret));
  const url = `${GRAPH}${input.path}`;
  let response: Response;
  try {
    response =
      input.method === "POST"
        ? await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: params,
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        : await fetch(`${url}?${params.toString()}`, {
            method: input.method,
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
  } catch {
    return { ok: false, error: noAnswer(null) };
  }
  const read = await readBody(response);
  if (!read.ok) return read;
  const body = read.body;
  if (!response.ok || (body as RawGraphError | null)?.error) return { ok: false, error: graphError(response.status, body) };
  return { ok: true, data: body as T };
};

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

// ── Login ────────────────────────────────────────────────────────────────────────────────

export type MetaUserToken = { accessToken: string; expiresInS: number | null };

const readToken = (data: { access_token?: unknown; expires_in?: unknown }): MetaUserToken | null => {
  const accessToken = str(data.access_token);
  if (!accessToken) return null;
  return { accessToken, expiresInS: toInt(data.expires_in) };
};

/** The login dialog's `code` → a short-lived user token. Server-side only (uses the app secret). */
export const exchangeMetaCode = async (input: { code: string; redirectUri: string; secret: string }): Promise<GraphResult<MetaUserToken>> => {
  const params = new URLSearchParams({
    client_id: META_PARTNER_APP_ID,
    client_secret: input.secret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  try {
    const response = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    const token = response.ok && body ? readToken(body) : null;
    return token ? { ok: true, data: token } : { ok: false, error: graphError(response.status, body) };
  } catch {
    return { ok: false, error: noAnswer(null) };
  }
};

/** Short-lived → long-lived (≈60 days) user token. Page tokens fetched with it do not expire. */
export const exchangeLongLivedMetaToken = async (input: { token: string; secret: string }): Promise<GraphResult<MetaUserToken>> => {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_PARTNER_APP_ID,
    client_secret: input.secret,
    fb_exchange_token: input.token,
  });
  try {
    const response = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    const token = response.ok && body ? readToken(body) : null;
    return token ? { ok: true, data: token } : { ok: false, error: graphError(response.status, body) };
  } catch {
    return { ok: false, error: noAnswer(null) };
  }
};

/** The app-scoped Facebook user id (what Meta's deauthorize / data-deletion callbacks name). */
export const fetchMetaUserId = async (token: string, secret: string): Promise<GraphResult<string>> => {
  const result = await call<{ id?: unknown }>({ method: "GET", path: "/me", params: { fields: "id" }, token, secret });
  if (!result.ok) return result;
  const id = str(result.data.id);
  return id && /^\d+$/.test(id) ? { ok: true, data: id } : { ok: false, error: graphError(200, null) };
};

/** The permissions the partner actually granted (they can untick some in the dialog). */
export const fetchGrantedPermissions = async (token: string, secret: string): Promise<GraphResult<string[]>> => {
  const result = await call<{ data?: { permission?: unknown; status?: unknown }[] }>({ method: "GET", path: "/me/permissions", token, secret });
  if (!result.ok) return result;
  const granted = (result.data.data ?? [])
    .filter((entry) => entry.status === "granted")
    .map((entry) => str(entry.permission))
    .filter((value): value is string => Boolean(value));
  return { ok: true, data: granted };
};

/** One Facebook Page the partner granted, with its Page token and linked Instagram account (if any). */
export type MetaPage = {
  pageId: string;
  pageName: string | null;
  pageToken: string;
  /** The partner's tasks on the Page; null when Meta didn't say (then Meta decides at publish time). */
  tasks: string[] | null;
  instagram: { id: string; username: string | null } | null;
};

/** One Facebook Page the partner granted that has an Instagram professional account linked. */
export type MetaInstagramAccount = {
  pageId: string;
  pageName: string | null;
  pageToken: string;
  instagramId: string;
  username: string | null;
};

/** The granted Pages (GET /me/accounts), one Graph call. Pages Meta returns without a token are skipped. */
export const fetchMetaPages = async (userToken: string, secret: string): Promise<GraphResult<MetaPage[]>> => {
  const result = await call<{
    data?: {
      id?: unknown;
      name?: unknown;
      access_token?: unknown;
      tasks?: unknown;
      instagram_business_account?: { id?: unknown; username?: unknown };
    }[];
  }>({
    method: "GET",
    path: "/me/accounts",
    params: { fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100" },
    token: userToken,
    secret,
  });
  if (!result.ok) return result;
  const pages: MetaPage[] = [];
  for (const page of result.data.data ?? []) {
    const pageId = str(page.id);
    const pageToken = str(page.access_token);
    if (!pageId || !pageToken) continue;
    const instagramId = str(page.instagram_business_account?.id);
    pages.push({
      pageId,
      pageName: str(page.name),
      pageToken,
      tasks: Array.isArray(page.tasks) ? page.tasks.map(str).filter((task): task is string => Boolean(task)) : null,
      instagram: instagramId ? { id: instagramId, username: str(page.instagram_business_account?.username) } : null,
    });
  }
  return { ok: true, data: pages };
};

/** The Pages with a linked Instagram professional account (Meta: "Business Login for Instagram", step 4). */
export const instagramAccountsOf = (pages: MetaPage[]): MetaInstagramAccount[] =>
  pages.flatMap((page) =>
    page.instagram
      ? [{ pageId: page.pageId, pageName: page.pageName, pageToken: page.pageToken, instagramId: page.instagram.id, username: page.instagram.username }]
      : [],
  );

/** Pages the partner may publish to: CREATE_CONTENT (or MANAGE, which admins have). Unknown tasks = let Meta decide. */
export const publishablePagesOf = (pages: MetaPage[]): MetaPage[] =>
  pages.filter((page) => page.tasks === null || page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE"));

/** The granted Pages with a linked Instagram account. */
export const fetchInstagramAccounts = async (userToken: string, secret: string): Promise<GraphResult<MetaInstagramAccount[]>> => {
  const pages = await fetchMetaPages(userToken, secret);
  return pages.ok ? { ok: true, data: instagramAccountsOf(pages.data) } : pages;
};

/**
 * Remove the app for this Facebook user entirely (DELETE /{user-id}/permissions with the app token).
 * Only when the user has no other connection left with us. Best effort: a failure is logged by the caller.
 */
export const revokeMetaApp = async (metaUserId: string, secret: string): Promise<GraphResult<unknown>> =>
  call({ method: "DELETE", path: `/${encodeURIComponent(metaUserId)}/permissions`, token: `${META_PARTNER_APP_ID}|${secret}`, secret, appToken: true });

// ── Publishing ───────────────────────────────────────────────────────────────────────────

export type InstagramContainerInput =
  | { kind: "image"; imageUrl: string; caption: string }
  | { kind: "story"; imageUrl: string }
  | { kind: "reel"; videoUrl: string; caption: string; coverMs: number | null };

const containerParams = (input: InstagramContainerInput): Record<string, string> => {
  if (input.kind === "image") return { image_url: input.imageUrl, caption: input.caption };
  // Stories take no caption (Meta's Story examples omit it; the sheet says so).
  if (input.kind === "story") return { media_type: "STORIES", image_url: input.imageUrl };
  const params: Record<string, string> = { media_type: "REELS", video_url: input.videoUrl, caption: input.caption, share_to_feed: "true" };
  // The end card is the cover (plan §4.1, D17).
  if (input.coverMs !== null) params.thumb_offset = String(input.coverMs);
  return params;
};

/** POST /{ig-user-id}/media → the container id. Meta fetches the file from the (signed) URL. */
export const createInstagramContainer = async (input: {
  instagramId: string;
  pageToken: string;
  secret: string;
  media: InstagramContainerInput;
}): Promise<GraphResult<string>> => {
  const result = await call<{ id?: unknown }>({
    method: "POST",
    path: `/${encodeURIComponent(input.instagramId)}/media`,
    params: containerParams(input.media),
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  const id = str(result.data.id);
  return id ? { ok: true, data: id } : { ok: false, error: graphError(200, null) };
};

/** GET /{container-id}?fields=status_code — IN_PROGRESS, FINISHED, PUBLISHED, ERROR or EXPIRED. */
export const fetchContainerStatus = async (input: { containerId: string; pageToken: string; secret: string }): Promise<GraphResult<string | null>> => {
  const result = await call<{ status_code?: unknown }>({
    method: "GET",
    path: `/${encodeURIComponent(input.containerId)}`,
    params: { fields: "status_code" },
    token: input.pageToken,
    secret: input.secret,
  });
  return result.ok ? { ok: true, data: str(result.data.status_code) } : result;
};

/** POST /{ig-user-id}/media_publish creation_id → the published media id. */
export const publishInstagramContainer = async (input: {
  instagramId: string;
  containerId: string;
  pageToken: string;
  secret: string;
}): Promise<GraphResult<string>> => {
  const result = await call<{ id?: unknown }>({
    method: "POST",
    path: `/${encodeURIComponent(input.instagramId)}/media_publish`,
    params: { creation_id: input.containerId },
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  const id = str(result.data.id);
  return id ? { ok: true, data: id } : { ok: false, error: graphError(200, null) };
};

/** GET /{ig-media-id}?fields=permalink. Null if Meta doesn't give one (Stories have none worth linking). */
export const fetchInstagramPermalink = async (input: { mediaId: string; pageToken: string; secret: string }): Promise<string | null> => {
  const result = await call<{ permalink?: unknown }>({
    method: "GET",
    path: `/${encodeURIComponent(input.mediaId)}`,
    params: { fields: "permalink" },
    token: input.pageToken,
    secret: input.secret,
  });
  return result.ok ? safeInstagramPermalink(result.data.permalink) : null;
};

// ── Facebook Page publishing (Phase 6) ───────────────────────────────────────────────────

/**
 * POST /{page-id}/photos url + caption, published now (Pages API, read 2026-11-04). One call: the photo
 * is on the Page when it returns. Answers the Page post id (permalink = facebook.com/<post id>).
 */
export const publishFacebookPhoto = async (input: {
  pageId: string;
  pageToken: string;
  secret: string;
  imageUrl: string;
  caption: string;
}): Promise<GraphResult<{ postId: string; permalink: string | null }>> => {
  const params: Record<string, string> = { url: input.imageUrl, published: "true" };
  if (input.caption) params.caption = input.caption;
  const result = await call<{ id?: unknown; post_id?: unknown }>({
    method: "POST",
    path: `/${encodeURIComponent(input.pageId)}/photos`,
    params,
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  const postId = str(result.data.post_id) ?? str(result.data.id);
  if (!postId) return { ok: false, error: graphError(200, null) };
  return { ok: true, data: { postId, permalink: safeFacebookPermalink(`https://www.facebook.com/${postId}`) } };
};

/** Reels step 1: POST /{page-id}/video_reels upload_phase=start → the video id. */
export const startFacebookReel = async (input: { pageId: string; pageToken: string; secret: string }): Promise<GraphResult<string>> => {
  const result = await call<{ video_id?: unknown }>({
    method: "POST",
    path: `/${encodeURIComponent(input.pageId)}/video_reels`,
    params: { upload_phase: "start" },
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  const id = str(result.data.video_id);
  return id && /^\d+$/.test(id) ? { ok: true, data: id } : { ok: false, error: graphError(200, null) };
};

/**
 * Reels step 2, a HOSTED file: POST rupload.facebook.com/video-upload/<version>/<video-id> with headers
 * `Authorization: OAuth <page token>` and `file_url` (our 1-hour signed URL). Meta fetches the file.
 * The token travels in the header, never the URL. appsecret_proof isn't documented for this host.
 */
export const uploadFacebookReel = async (input: { videoId: string; pageToken: string; fileUrl: string }): Promise<GraphResult<true>> => {
  let response: Response;
  try {
    response = await fetch(`https://rupload.facebook.com/video-upload/${META_GRAPH_VERSION}/${encodeURIComponent(input.videoId)}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${input.pageToken}`, file_url: input.fileUrl },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: noAnswer(null) };
  }
  const read = await readBody(response);
  if (!read.ok) return read;
  const body = read.body as ({ success?: unknown } & RawGraphError) | null;
  return response.ok && body?.success === true ? { ok: true, data: true } : { ok: false, error: graphError(response.status, body) };
};

/** Reels step 3: POST /{page-id}/video_reels upload_phase=finish video_state=PUBLISHED. Meta then processes it. */
export const finishFacebookReel = async (input: {
  pageId: string;
  videoId: string;
  pageToken: string;
  secret: string;
  description: string;
}): Promise<GraphResult<true>> => {
  const params: Record<string, string> = { upload_phase: "finish", video_id: input.videoId, video_state: "PUBLISHED" };
  if (input.description) params.description = input.description;
  const result = await call<{ success?: unknown }>({
    method: "POST",
    path: `/${encodeURIComponent(input.pageId)}/video_reels`,
    params,
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  return result.data.success === true ? { ok: true, data: true } : { ok: false, error: graphError(200, null) };
};

type RawPhase = { status?: unknown; publish_status?: unknown } | undefined;

/** GET /{video-id}?fields=status,permalink_url — where the Reel is, and its link once published. */
export const fetchFacebookReelStatus = async (input: {
  videoId: string;
  pageToken: string;
  secret: string;
}): Promise<GraphResult<{ status: FacebookReelStatus; permalink: string | null }>> => {
  const result = await call<{
    status?: { video_status?: unknown; uploading_phase?: RawPhase; processing_phase?: RawPhase; publishing_phase?: RawPhase };
    permalink_url?: unknown;
  }>({
    method: "GET",
    path: `/${encodeURIComponent(input.videoId)}`,
    params: { fields: "status,permalink_url" },
    token: input.pageToken,
    secret: input.secret,
  });
  if (!result.ok) return result;
  const raw = result.data.status;
  return {
    ok: true,
    data: {
      status: {
        videoStatus: str(raw?.video_status),
        uploading: str(raw?.uploading_phase?.status),
        processing: str(raw?.processing_phase?.status),
        publishing: str(raw?.publishing_phase?.status),
        publishStatus: str(raw?.publishing_phase?.publish_status),
      },
      permalink: safeFacebookPermalink(result.data.permalink_url),
    },
  };
};
