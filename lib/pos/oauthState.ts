import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PosProviderId } from "@/lib/pos/providers";

// The OAuth `state` for "Connect Square/Clover" (docs/pos-rewards-integration-plan.md §3).
//
// Three guarantees, no database table:
//   1. SIGNED — HMAC-SHA256 with SESSION_SECRET (domain-separated from the session cookies), so
//      nobody can mint a state for a venue they don't own.
//   2. BOUND — it names the owner, the venue and the provider; the callback re-checks the owner
//      against the signed owner session and the venue against that owner's venues.
//   3. SINGLE-USE — it carries a random nonce that must equal the `tp_pos_oauth` cookie set
//      when the flow started. The callback clears the cookie, so a replayed callback URL (from
//      browser history, a log, a shoulder-surfer) fails, and a state started in someone else's
//      browser can't be completed in yours (login-CSRF onto the wrong venue).
// Expires after 10 minutes.

export const POS_OAUTH_COOKIE = "tp_pos_oauth";
const COOKIE_PATH = "/api/owner/pos";
const TTL_MS = 10 * 60 * 1000;

type StatePayload = { o: string; v: string; p: PosProviderId; n: string; e: number };

export type PosOAuthState = { ownerId: string; venueId: string; provider: PosProviderId; nonce: string };

const signingKey = (): string | null => {
  const secret = (process.env.SESSION_SECRET ?? "").trim();
  return secret ? `pos-oauth-state:${secret}` : null;
};

const sign = (payload: string, key: string): string => createHmac("sha256", key).update(payload).digest("base64url");

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** A new signed state + the nonce cookie to set beside it. Null when SESSION_SECRET is unset (fail closed). */
export const createPosOAuthState = (
  input: { ownerId: string; venueId: string; provider: PosProviderId },
  nowMs: number = Date.now(),
): { state: string; cookie: string } | null => {
  const key = signingKey();
  if (!key) return null;
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ o: input.ownerId, v: input.venueId, p: input.provider, n: nonce, e: nowMs + TTL_MS } satisfies StatePayload),
  ).toString("base64url");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    state: `${payload}.${sign(payload, key)}`,
    // SameSite=Lax: sent on Square's top-level redirect back to us, never on a cross-site POST.
    cookie: `${POS_OAUTH_COOKIE}=${nonce}; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=${TTL_MS / 1000}${secure}`,
  };
};

export const clearPosOAuthCookie = (): string =>
  `${POS_OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=0`;

const readNonceCookie = (request: Request): string | null => {
  const match = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${POS_OAUTH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * The verified state, or null for anything wrong: bad signature, expired, malformed, or no
 * matching nonce cookie. Callers still compare `ownerId` with the live owner session.
 */
export const verifyPosOAuthState = (request: Request, state: string | null, nowMs: number = Date.now()): PosOAuthState | null => {
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
  if (!parsed.o || !parsed.v || !parsed.p || !parsed.n) return null;

  const cookieNonce = readNonceCookie(request);
  if (!cookieNonce || !safeEqual(cookieNonce, parsed.n)) return null;

  return { ownerId: parsed.o, venueId: parsed.v, provider: parsed.p, nonce: parsed.n };
};
