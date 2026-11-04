import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The OAuth `state` for "Connect Instagram" (docs/partner-social-promo-plan.md Phase 5). Same three
// guarantees as lib/pos/oauthState.ts, with its own cookie and its own key derivation:
//   1. SIGNED with SESSION_SECRET (domain-separated: "social-oauth-state:"), so nobody can mint a state
//      for a venue they don't own.
//   2. BOUND to the owner and venue; the callback re-checks both against the live owner session.
//   3. SINGLE-USE: a random nonce that must equal the `tp_social_oauth` cookie set when the flow
//      started; the callback clears it. Stops replayed callback URLs and login-CSRF onto another venue.
// Expires after 10 minutes.

export const SOCIAL_OAUTH_COOKIE = "tp_social_oauth";
const COOKIE_PATH = "/api/owner/social";
const TTL_MS = 10 * 60 * 1000;

type StatePayload = { o: string; v: string; n: string; e: number };

export type SocialOAuthState = { ownerId: string; venueId: string };

const signingKey = (): string | null => {
  const secret = (process.env.SESSION_SECRET ?? "").trim();
  return secret ? `social-oauth-state:${secret}` : null;
};

const sign = (payload: string, key: string): string => createHmac("sha256", key).update(payload).digest("base64url");

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** A new signed state + the nonce cookie to set beside it. Null when SESSION_SECRET is unset (fail closed). */
export const createSocialOAuthState = (
  input: SocialOAuthState,
  nowMs: number = Date.now(),
): { state: string; cookie: string } | null => {
  const key = signingKey();
  if (!key) return null;
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ o: input.ownerId, v: input.venueId, n: nonce, e: nowMs + TTL_MS } satisfies StatePayload),
  ).toString("base64url");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    state: `${payload}.${sign(payload, key)}`,
    // SameSite=Lax: sent on Meta's top-level redirect back to us, never on a cross-site POST.
    cookie: `${SOCIAL_OAUTH_COOKIE}=${nonce}; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=${TTL_MS / 1000}${secure}`,
  };
};

export const clearSocialOAuthCookie = (): string =>
  `${SOCIAL_OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=0`;

const readNonceCookie = (request: Request): string | null => {
  const match = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SOCIAL_OAUTH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

/** The verified state, or null for anything wrong. Callers still compare it with the live owner session. */
export const verifySocialOAuthState = (
  request: Request,
  state: string | null,
  nowMs: number = Date.now(),
): SocialOAuthState | null => {
  const key = signingKey();
  if (!key || !state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  if (!safeEqual(state.slice(dot + 1), sign(payload, key))) return null;

  let parsed: StatePayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
  if (typeof parsed.e !== "number" || parsed.e < nowMs) return null;
  if (!parsed.o || !parsed.v || !parsed.n) return null;

  const cookieNonce = readNonceCookie(request);
  if (!cookieNonce || !safeEqual(cookieNonce, parsed.n)) return null;
  return { ownerId: parsed.o, venueId: parsed.v };
};
