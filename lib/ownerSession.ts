import "server-only";
import { createHmac } from "node:crypto";

const COOKIE_NAME = "tp_owner_sess";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

type OwnerSessionPayload = { ownerId: string };

function secret(): string {
  return process.env.SESSION_SECRET?.trim() ?? "";
}

export function createOwnerSessionCookie(ownerId: string): string {
  const s = secret();
  const payload = Buffer.from(JSON.stringify({ ownerId } satisfies OwnerSessionPayload)).toString("base64url");
  const value = s
    ? `${payload}.${createHmac("sha256", s).update(payload).digest("base64url")}`
    : payload;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`;
}

export function clearOwnerSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readOwnerSession(request: Request): string | null {
  const s = secret();
  if (!s) return null;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)tp_owner_sess=([^;]+)/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", s).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OwnerSessionPayload;
    const ownerId = String(parsed.ownerId ?? "").trim();
    return ownerId || null;
  } catch {
    return null;
  }
}
