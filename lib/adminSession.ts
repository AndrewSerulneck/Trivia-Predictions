import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "admin_session";

type AdminSessionPayload = {
  u: string;
  exp: number;
};

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ??
    process.env.CRON_SECRET?.trim() ??
    process.env.ADMIN_LOGIN_PASSWORD?.trim() ??
    ""
  );
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function createAdminSessionToken(username: string, ttlSeconds = 60 * 60 * 12): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload: AdminSessionPayload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function validateAdminSessionToken(token: string, expectedUsername: string): boolean {
  const secret = getSessionSecret();
  if (!secret) return false;

  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) return false;

  const expectedSignature = sign(encodedPayload, secret);
  const providedBytes = Buffer.from(providedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  if (!timingSafeEqual(providedBytes, expectedBytes)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<AdminSessionPayload>;
    if (!payload || typeof payload.u !== "string" || typeof payload.exp !== "number") {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return false;
    }
    return payload.u === expectedUsername;
  } catch {
    return false;
  }
}

export function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";").map((item) => item.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;

  const value = match.slice(name.length + 1).trim();
  return value || null;
}
