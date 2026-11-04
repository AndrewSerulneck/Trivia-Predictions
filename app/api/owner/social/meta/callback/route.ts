import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isSocialTokenKeyConfigured } from "@/lib/social/crypto";
import { isSocialPublishEnabled } from "@/lib/social/flags";
import { META_INSTAGRAM_REQUIRED_PERMISSIONS, metaAppSecret, metaRedirectUri } from "@/lib/social/metaConfig";
import {
  exchangeLongLivedMetaToken,
  exchangeMetaCode,
  fetchGrantedPermissions,
  fetchInstagramAccounts,
  fetchMetaUserId,
} from "@/lib/social/metaGraph";
import { clearSocialOAuthCookie, verifySocialOAuthState } from "@/lib/social/oauthState";
import { redirectToSocialSheet } from "@/lib/social/ownerSocialGuard";
import { savePendingInstagramChoice, saveInstagramConnection } from "@/lib/social/socialConnections";
import type { SocialConnectResult } from "@/lib/social/socialTypes";

/**
 * GET /api/owner/social/meta/callback?code=&state= (or ?error=…) — Facebook Login for Business sends
 * the partner back here (docs/partner-social-promo-plan.md Phase 5). This exact URL, on each host that
 * uses it, must be a Valid OAuth Redirect URI in the Meta app (runbook "Phase 5 setup").
 *
 * Order matters: verify the state (signature, expiry, single-use nonce cookie) and bind it to the live
 * owner session and that owner's venues BEFORE the code is exchanged, so a forged or replayed callback
 * never fetches a token. The nonce cookie is cleared on every outcome.
 *
 * Then: code → short-lived user token → long-lived user token → the Facebook user id and granted
 * permissions → the granted Pages with a linked Instagram professional account. One account → saved
 * with that Page's token (a Page token made from a long-lived user token does not expire); the user
 * token is dropped. Several → kept (encrypted) for one hour while the sheet asks which. None → nothing
 * is stored and the sheet explains how to link Instagram to a Page.
 */
export async function GET(request: Request) {
  if (!isSocialPublishEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const done = (result: SocialConnectResult, venueId: string | null): Response => {
    const response = redirectToSocialSheet(request, result, venueId);
    response.headers.append("Set-Cookie", clearSocialOAuthCookie());
    return response;
  };

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch {
    const response = NextResponse.redirect(new URL("/owner/login", request.url), 303);
    response.headers.append("Set-Cookie", clearSocialOAuthCookie());
    return response;
  }

  const params = new URL(request.url).searchParams;
  const state = verifySocialOAuthState(request, params.get("state"));
  if (!state || state.ownerId !== auth.ownerId || !auth.venueIds.includes(state.venueId)) {
    console.warn("[SocialInstagram] callback-bad-state");
    return done("expired", null);
  }
  const venueId = state.venueId;

  if (params.get("error")) {
    // access_denied = the partner cancelled. Anything else is logged by its code only.
    console.info("[SocialInstagram] callback-denied", { error: params.get("error")?.slice(0, 40) });
    return done("denied", venueId);
  }

  const code = params.get("code")?.trim() ?? "";
  const secret = metaAppSecret();
  if (!code) return done("error", venueId);
  if (!secret || !isSocialTokenKeyConfigured()) return done("not_configured", venueId);

  const short = await exchangeMetaCode({ code, redirectUri: metaRedirectUri(request), secret });
  if (!short.ok) {
    console.error("[SocialInstagram] callback-code-exchange-failed", { kind: short.error.kind, code: short.error.code });
    return done("error", venueId);
  }
  const long = await exchangeLongLivedMetaToken({ token: short.data.accessToken, secret });
  if (!long.ok) {
    console.error("[SocialInstagram] callback-long-lived-failed", { kind: long.error.kind, code: long.error.code });
    return done("error", venueId);
  }
  const userToken = long.data.accessToken;

  const [metaUser, granted] = await Promise.all([fetchMetaUserId(userToken, secret), fetchGrantedPermissions(userToken, secret)]);
  if (!metaUser.ok || !granted.ok) {
    console.error("[SocialInstagram] callback-me-failed", {
      user: metaUser.ok ? "ok" : metaUser.error.kind,
      permissions: granted.ok ? "ok" : granted.error.kind,
    });
    return done("error", venueId);
  }
  const missing = META_INSTAGRAM_REQUIRED_PERMISSIONS.filter((permission) => !granted.data.includes(permission));
  if (missing.length > 0) {
    console.info("[SocialInstagram] callback-missing-permissions", { missing });
    return done("missing_permissions", venueId);
  }

  const accounts = await fetchInstagramAccounts(userToken, secret);
  if (!accounts.ok) {
    console.error("[SocialInstagram] callback-accounts-failed", { kind: accounts.error.kind, code: accounts.error.code });
    return done("error", venueId);
  }
  if (accounts.data.length === 0) return done("no_instagram", venueId);

  const base = { venueId, ownerId: auth.ownerId, metaUserId: metaUser.data, scopes: granted.data };
  try {
    if (accounts.data.length === 1) {
      await saveInstagramConnection({ ...base, account: accounts.data[0] });
      console.info("[SocialInstagram] connected", { venueId });
      return done("connected", venueId);
    }
    await savePendingInstagramChoice({ ...base, userToken, expiresInS: long.data.expiresInS, accounts: accounts.data });
    console.info("[SocialInstagram] choose-account", { venueId, accounts: accounts.data.length });
    return done("choose_account", venueId);
  } catch (error) {
    console.error("[SocialInstagram] callback-save-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return done("error", venueId);
  }
}
