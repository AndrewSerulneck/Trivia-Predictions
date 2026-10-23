import "server-only";
import { createSign } from "node:crypto";

// Firebase Cloud Messaging sender (docs/native-app-store-plan.md Phase 5.1) — the ONLY reader of
// FCM_SERVICE_ACCOUNT_JSON and the only code that talks to Google.
//
// No SDK: one OAuth token (a JWT signed with the service account's key, cached for its hour) and one
// HTTP v1 `messages:send` call per phone. FCM has no batch endpoint any more, so a batch is sent with a
// small fixed concurrency. Firebase delivers to iPhones through the APNs key uploaded to the Firebase
// project (Phase 5.2), so this file is the same for both platforms.
//
// FCM_SERVICE_ACCOUNT_JSON is the service account's JSON key, base64-encoded (raw JSON also accepted).
// The account `hightop-push-sender@hightop-challenge-fdca1.iam.gserviceaccount.com` holds only
// "Firebase Cloud Messaging API Admin". Unset → push is off: every sweep returns before any database
// read. Never log the value, a token's full text, or Google's raw error body (it can echo the token).

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const SEND_TIMEOUT_MS = 10_000;
export const FCM_SEND_CONCURRENCY = 8;

type FcmCredentials = { projectId: string; clientEmail: string; privateKey: string };

let cachedCredentials: { raw: string; value: FcmCredentials | null } | null = null;
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

const readFcmCredentials = (): FcmCredentials | null => {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim() ?? "";
  if (cachedCredentials && cachedCredentials.raw === raw) return cachedCredentials.value;
  let value: FcmCredentials | null = null;
  if (raw) {
    try {
      const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const parsed = JSON.parse(text) as { project_id?: unknown; client_email?: unknown; private_key?: unknown };
      const projectId = typeof parsed.project_id === "string" ? parsed.project_id : "";
      const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
      const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
      if (projectId && clientEmail && privateKey) value = { projectId, clientEmail, privateKey };
    } catch {
      value = null;
    }
    if (!value) console.error("[Push] fcm-credentials-unreadable");
  }
  cachedCredentials = { raw, value };
  return value;
};

/** True when the sender credential is present and readable. Every sweep checks this first. */
export const isPushSendingConfigured = (): boolean => readFcmCredentials() !== null;

const base64Url = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

const getAccessToken = async (credentials: FcmCredentials): Promise<string> => {
  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > nowMs) {
    return cachedAccessToken.token;
  }
  const issuedAt = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${base64Url(signer.sign(credentials.privateKey))}`;

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`FCM auth failed (${response.status}).`);
  }
  const expiresInS = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cachedAccessToken = { token: body.access_token, expiresAtMs: nowMs + expiresInS * 1000 };
  return body.access_token;
};

export type PushMessage = {
  /** The phone's FCM registration token. */
  token: string;
  /** Optional bold first line. Body-only pushes show the app name as their header. */
  title?: string;
  body: string;
  /** A path on our site, opened when the push is tapped (validated again in the app). */
  path?: string | null;
};

export type PushSendResult =
  | { ok: true }
  /** dead = the token will never work again (uninstalled, rotated, another project's): disable it. */
  | { ok: false; dead: boolean; status: number; code: string };

// Tokens Firebase will never accept again. INVALID_ARGUMENT also covers a malformed message, so it
// only counts as dead when Google's message is about the registration token.
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

/** Exported for tests: is this FCM error response a dead token? */
export const classifyFcmError = (
  status: number,
  body: unknown,
): { dead: boolean; code: string } => {
  const error = (body as { error?: { status?: unknown; message?: unknown; details?: unknown } } | null)?.error;
  const details = Array.isArray(error?.details) ? (error?.details as Array<{ errorCode?: unknown }>) : [];
  const fcmCode = details.map((detail) => detail?.errorCode).find((code): code is string => typeof code === "string");
  const code = fcmCode ?? (typeof error?.status === "string" ? error.status : `HTTP_${status}`);
  if (DEAD_TOKEN_CODES.has(code)) return { dead: true, code };
  // A bare 404 is NOT treated as dead: a wrong project id would otherwise disable every phone at once.
  const message = typeof error?.message === "string" ? error.message : "";
  if (code === "INVALID_ARGUMENT" && /registration token/i.test(message)) return { dead: true, code };
  return { dead: false, code };
};

/** Exported for tests: the HTTP v1 message body for one phone. */
export const buildFcmMessage = (message: PushMessage): Record<string, unknown> => ({
  message: {
    token: message.token,
    notification: { ...(message.title ? { title: message.title } : {}), body: message.body },
    ...(message.path ? { data: { path: message.path } } : {}),
    android: { priority: "HIGH", notification: { sound: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  },
});

const sendOne = async (credentials: FcmCredentials, accessToken: string, message: PushMessage): Promise<PushSendResult> => {
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildFcmMessage(message)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null);
    return { ok: false, status: response.status, ...classifyFcmError(response.status, body) };
  } catch {
    // Network failure or timeout: not the token's fault, and never retried (no retry storms).
    return { ok: false, dead: false, status: 0, code: "NETWORK" };
  }
};

/**
 * Sends each message once, FCM_SEND_CONCURRENCY at a time, and returns the results in the same order.
 * Never retries: a failed push is dropped (the in-app notification list still has it). Throws only when
 * push isn't configured or Google refuses the sender's own login — the caller logs and moves on.
 */
export const sendPushMessages = async (messages: readonly PushMessage[]): Promise<PushSendResult[]> => {
  if (messages.length === 0) return [];
  const credentials = readFcmCredentials();
  if (!credentials) throw new Error("Push sending is not configured.");
  const accessToken = await getAccessToken(credentials);
  const results: PushSendResult[] = new Array(messages.length);
  let next = 0;
  const worker = async () => {
    while (next < messages.length) {
      const index = next;
      next += 1;
      results[index] = await sendOne(credentials, accessToken, messages[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FCM_SEND_CONCURRENCY, messages.length) }, worker));
  return results;
};

/** Test hook: forget the cached credential and OAuth token. */
export const resetFcmCacheForTests = (): void => {
  cachedCredentials = null;
  cachedAccessToken = null;
};
