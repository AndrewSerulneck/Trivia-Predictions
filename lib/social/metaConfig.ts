import "server-only";
import { createHmac } from "node:crypto";

// The ONE reader of the partner Meta app's environment (docs/partner-social-promo-plan.md Phases 4–5).
// Server-side only; never NEXT_PUBLIC_.
//
//   META_PARTNER_APP_SECRET   Meta app dashboard → App settings → Basic → App secret, of the NEW
//                             partner app (not the player app in capacitor.config.json). Signs the
//                             deauthorize / data-deletion `signed_request`, exchanges login codes, and
//                             makes every Graph call's appsecret_proof.
//   NEXT_PUBLIC_APP_URL       Already set; the base of the deletion status URL.

const clean = (value: string | undefined): string => (value ?? "").trim();

/** App ID of "Hightop Challenge for Venues" (public; App settings → Basic). Never the player app's ID (D27). */
export const META_PARTNER_APP_ID = "870343082807996";

/**
 * The Facebook Login for Business **configuration** partners log in with (public: it appears in the
 * login URL). Andrew creates it (runbook "Phase 5 setup"): token type **User access token**, the
 * permissions in META_LOGIN_PERMISSIONS and nothing else — NOT Meta's default system-user preset.
 * Null until then: "Connect Instagram" answers "not set up yet" and sends nobody to Meta.
 */
export const META_PARTNER_LOGIN_CONFIG_ID: string | null = "1880579456453786";

/** Graph API version for every call (Meta's current docs' examples, 2026-11-04). One place to bump. */
export const META_GRAPH_VERSION = "v26.0";

/**
 * What the configuration asks for (Andrew, 2026-11-04: both Instagram and the Page in one login, so
 * Phase 6 needs no reconnect). Instagram needs the first four; the Facebook Page needs the last three.
 */
export const META_LOGIN_PERMISSIONS = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export const META_INSTAGRAM_REQUIRED_PERMISSIONS = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
] as const;

/** Phase 6: what posting to a Facebook Page needs (Pages API: Page token from a CREATE_CONTENT holder). */
export const META_FACEBOOK_REQUIRED_PERMISSIONS = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"] as const;

/** Where Meta sends the partner back. Must be listed exactly in Facebook Login for Business → Settings. */
export const META_CALLBACK_PATH = "/api/owner/social/meta/callback";

export const metaAppSecret = (): string | null => clean(process.env.META_PARTNER_APP_SECRET) || null;

/** The redirect URI for this server: the origin the partner is on (production, a Preview, or localhost:3000). */
export const metaRedirectUri = (request: Request): string => new URL(META_CALLBACK_PATH, request.url).toString();

/** Facebook Login for Business dialog (manual web flow, `config_id` instead of `scope`). */
export const metaAuthorizeUrl = (input: { configId: string; redirectUri: string; state: string }): string => {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", META_PARTNER_APP_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("config_id", input.configId);
  url.searchParams.set("response_type", "code");
  return url.toString();
};

/** appsecret_proof for a Graph call made with `token` (Meta: HMAC-SHA256 of the token, keyed by the app secret). */
export const metaAppSecretProof = (token: string, secret: string): string =>
  createHmac("sha256", secret).update(token).digest("hex");

/** Public page Meta shows after a deletion request (the partner section of /delete-account). */
export const metaDeletionStatusUrl = (code: string): string | null => {
  const base = clean(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "");
  return base ? `${base}/delete-account?code=${encodeURIComponent(code)}#partner-social` : null;
};
