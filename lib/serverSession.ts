import "server-only";
import { createHmac } from "node:crypto";

const COOKIE_NAME = "tp_sess";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

type SessionPayload = { uid: string };

function secret(): string {
  return process.env.SESSION_SECRET?.trim() ?? "";
}

export function isSessionEnforced(): boolean {
  return secret().length > 0;
}

export function createSessionCookie(userId: string): string {
  const s = secret();
  const payload = Buffer.from(JSON.stringify({ uid: userId } satisfies SessionPayload)).toString("base64url");
  const value = s
    ? `${payload}.${createHmac("sha256", s).update(payload).digest("base64url")}`
    : payload;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  // Phase 6 domain split: scope to the parent domain (e.g. `.hightopchallenge.com`)
  // when configured so the session survives apex ↔ `play.` navigation. Empty by
  // default → host-only cookie (localhost/preview unaffected).
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  const domainAttr = domain ? `; Domain=${domain}` : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}${domainAttr}`;
}

/**
 * Resolve the acting user for a request that also carries a client-supplied
 * `userId` (query param or body field).
 *
 * A raw `userId` param is an unauthenticated claim — every `/api/*` path is
 * public in `proxy.ts`, so anything that widens a response based on it (e.g.
 * un-hiding a player's un-kicked-off picks) is spoofable by definition. When
 * sessions are enforced the signed `tp_sess` cookie is the ONLY source of
 * truth here; a mismatched or unbacked claim is rejected rather than honoured.
 * With no `SESSION_SECRET` (local dev) there is nothing to verify against, so
 * the claim passes through as-is — same degradation as the rest of the app.
 */
export function resolveRequestUserId(
  request: Request,
  claimedUserId: string | null | undefined
): { userId: string | null; forbidden: boolean } {
  const claimed = String(claimedUserId ?? "").trim();

  if (!isSessionEnforced()) {
    return { userId: claimed || null, forbidden: false };
  }

  const sessionUserId = readSession(request);
  if (!sessionUserId) {
    // No claim + no session is a legitimate anonymous read; a claim without a
    // session is someone asserting an identity they can't prove.
    return { userId: null, forbidden: claimed.length > 0 };
  }
  if (claimed && claimed !== sessionUserId) {
    return { userId: null, forbidden: true };
  }
  return { userId: sessionUserId, forbidden: false };
}

export function readSession(request: Request): string | null {
  const s = secret();
  if (!s) return null;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)tp_sess=([^;]+)/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", s).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    const uid = String(parsed.uid ?? "").trim();
    return uid || null;
  } catch {
    return null;
  }
}
