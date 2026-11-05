import "server-only";
import { NextResponse } from "next/server";
import { metaAppSecret, metaDeletionStatusUrl } from "@/lib/social/metaConfig";
import { metaDeletionConfirmationCode, verifyMetaSignedRequest } from "@/lib/social/metaSignedRequest";
import { removeMetaUserSocialConnections } from "@/lib/social/socialConnections";

// Shared body of POST /api/social/meta/deauthorize and /data-deletion
// (docs/partner-social-promo-plan.md Phase 4). Meta posts `signed_request` as a form field.
//
// Not behind a flag: Meta must be able to reach these during App Review, and they do nothing
// but verify and (from Phase 5) disconnect. Unverified = 401 with no work done; no secret
// configured = 503. We log the kind only, never the signed_request or the Meta user id.

export type MetaCallbackKind = "deauthorize" | "data-deletion";

/**
 * Remove every stored connection for this Meta user, on every venue: the token and account name go,
 * open posts are ended and their files deleted (cancelled, or "unconfirmed" when they may already be live;
 * lib/social/socialConnections.ts, Phase 19). Returns the number of connections removed. A database
 * failure throws → 500, so Meta retries.
 */
export const removeMetaUserConnections = async (metaUserId: string): Promise<number> =>
  removeMetaUserSocialConnections(metaUserId);

export const handleMetaCallback = async (request: Request, kind: MetaCallbackKind): Promise<Response> => {
  const secret = metaAppSecret();
  if (!secret) {
    console.error("[SocialMeta] callback-not-configured", { kind });
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 });
  }

  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    signedRequest = typeof value === "string" ? value : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const verified = verifyMetaSignedRequest(signedRequest, secret);
  if (!verified) {
    console.warn("[SocialMeta] callback-bad-signature", { kind });
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  let removed: number;
  try {
    removed = await removeMetaUserConnections(verified.userId);
  } catch (error) {
    console.error("[SocialMeta] callback-remove-failed", { kind, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  console.info("[SocialMeta] callback-handled", { kind, removed });

  if (kind === "deauthorize") return NextResponse.json({ ok: true });

  const code = metaDeletionConfirmationCode(verified.userId, secret);
  const url = metaDeletionStatusUrl(code);
  if (!url) {
    console.error("[SocialMeta] callback-no-app-url");
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 });
  }
  return NextResponse.json({ url, confirmation_code: code });
};
