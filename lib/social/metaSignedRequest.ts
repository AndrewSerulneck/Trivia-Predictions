import { createHmac, timingSafeEqual } from "node:crypto";

// Meta "signed_request" check for the deauthorize and data-deletion callbacks
// (docs/partner-social-promo-plan.md Phase 4, §4.6). Pure: the app secret is passed in, so
// the only reader of the environment stays lib/social/metaConfig.ts.
//
// Format (Meta docs): `<signature>.<payload>`, both base64url. signature =
// HMAC-SHA256(app secret, the payload string exactly as received). The payload is JSON with
// `algorithm: "HMAC-SHA256"` and `user_id`. Anything else is rejected with no work done.

export type MetaSignedPayload = { userId: string; issuedAt: number | null };

const fromBase64Url = (value: string): Buffer | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
};

/** Verify a signed_request; returns the Meta user id, or null when anything is off. */
export const verifyMetaSignedRequest = (
  signedRequest: string | null | undefined,
  appSecret: string,
): MetaSignedPayload | null => {
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSignature, encodedPayload] = parts;
  const signature = fromBase64Url(encodedSignature);
  if (!signature || signature.length === 0) return null;

  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return null;
  let payload: { algorithm?: unknown; user_id?: unknown; issued_at?: unknown };
  try {
    payload = JSON.parse(payloadBytes.toString("utf8")) as typeof payload;
  } catch {
    return null;
  }
  if (typeof payload.algorithm !== "string" || payload.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  const userId = typeof payload.user_id === "string" || typeof payload.user_id === "number" ? String(payload.user_id) : "";
  if (!/^\d{1,40}$/.test(userId)) return null;
  const issuedAt = typeof payload.issued_at === "number" && Number.isFinite(payload.issued_at) ? payload.issued_at : null;
  return { userId, issuedAt };
};

/**
 * The confirmation code Meta shows the person after a deletion request. Derived (HMAC of the
 * Meta user id), so nothing is stored to hand it out, and it reveals nothing about the id.
 */
export const metaDeletionConfirmationCode = (userId: string, appSecret: string): string =>
  createHmac("sha256", appSecret).update(`hightop-social-deletion:${userId}`).digest("hex").slice(0, 20);
