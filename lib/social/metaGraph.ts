import "server-only";
import { META_GRAPH_VERSION, META_PARTNER_APP_ID, metaAppSecretProof } from "@/lib/social/metaConfig";
import { classifyGraphError, safeInstagramPermalink, type GraphErrorKind } from "@/lib/social/socialPublishRules";

// The Meta Graph API calls Instagram "Post now" makes (docs/partner-social-promo-plan.md Phase 5):
// Facebook Login for Business with a USER access token configuration (Andrew, 2026-11-04), then the
// Instagram API with Facebook Login on graph.facebook.com using the linked Page's token.
//
// Tokens go in the form body of POSTs and the query of GETs (Meta's documented way), always with
// appsecret_proof. Nothing here logs: callers log the error `kind` and `code` only, never a token, a
// URL or Meta's response body. Each call times out after 20 s.

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TIMEOUT_MS = 20_000;

export type GraphError = { kind: GraphErrorKind; code: number | null; subcode: number | null; httpStatus: number | null };
export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

type RawGraphError = { error?: { code?: unknown; error_subcode?: unknown } };

const toInt = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

const graphError = (httpStatus: number | null, body: unknown): GraphError => {
  const raw = (body as RawGraphError | null)?.error;
  const code = toInt(raw?.code);
  const subcode = toInt(raw?.error_subcode);
  // No Meta error object at all (an HTML error page, an empty body): "other", never "network".
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
    return { ok: false, error: { kind: "network", code: null, subcode: null, httpStatus: null } };
  }
  const body = (await response.json().catch(() => null)) as unknown;
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
    return { ok: false, error: { kind: "network", code: null, subcode: null, httpStatus: null } };
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
    return { ok: false, error: { kind: "network", code: null, subcode: null, httpStatus: null } };
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

/** One Facebook Page the partner granted that has an Instagram professional account linked. */
export type MetaInstagramAccount = {
  pageId: string;
  pageName: string | null;
  pageToken: string;
  instagramId: string;
  username: string | null;
};

/** The granted Pages with a linked Instagram account (Meta: "Business Login for Instagram", step 4). */
export const fetchInstagramAccounts = async (userToken: string, secret: string): Promise<GraphResult<MetaInstagramAccount[]>> => {
  const result = await call<{
    data?: { id?: unknown; name?: unknown; access_token?: unknown; instagram_business_account?: { id?: unknown; username?: unknown } }[];
  }>({
    method: "GET",
    path: "/me/accounts",
    params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" },
    token: userToken,
    secret,
  });
  if (!result.ok) return result;
  const accounts: MetaInstagramAccount[] = [];
  for (const page of result.data.data ?? []) {
    const pageId = str(page.id);
    const pageToken = str(page.access_token);
    const instagramId = str(page.instagram_business_account?.id);
    if (!pageId || !pageToken || !instagramId) continue;
    accounts.push({ pageId, pageName: str(page.name), pageToken, instagramId, username: str(page.instagram_business_account?.username) });
  }
  return { ok: true, data: accounts };
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
