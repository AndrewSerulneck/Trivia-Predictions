import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isSocialTokenKeyConfigured } from "@/lib/social/crypto";
import { isSocialPostNowLive } from "@/lib/social/flags";
import {
  META_FACEBOOK_REQUIRED_PERMISSIONS,
  META_INSTAGRAM_REQUIRED_PERMISSIONS,
  metaAppSecret,
  metaRedirectUri,
} from "@/lib/social/metaConfig";
import {
  exchangeLongLivedMetaToken,
  exchangeMetaCode,
  fetchGrantedPermissions,
  fetchMetaPages,
  fetchMetaUserId,
  instagramAccountsOf,
  publishablePagesOf,
} from "@/lib/social/metaGraph";
import { clearSocialOAuthCookie, verifySocialOAuthState } from "@/lib/social/oauthState";
import { redirectToSocialSheet } from "@/lib/social/ownerSocialGuard";
import {
  connectionRow,
  facebookChoicesOf,
  facebookConnectedAccount,
  instagramChoicesOf,
  instagramConnectedAccount,
  markGoneReconnectNeeded,
  pendingChoiceRow,
  saveSocialConnections,
  type SocialConnectionRow,
} from "@/lib/social/socialConnections";
import { socialConnectOutcome, socialConnectResult, socialGoneConnections, type SocialConnectOutcome } from "@/lib/social/socialPublishRules";
import type { SocialConnectResult, SocialProvider } from "@/lib/social/socialTypes";

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
 * permissions → the granted Pages (one Graph call). From that one list, separately for each provider
 * whose permissions were granted (Phase 6: the same login connects the Facebook Page too):
 *   Instagram = Pages with a linked Instagram professional account; Facebook = Pages the partner may
 *   publish to (CREATE_CONTENT / MANAGE).
 * One → saved with that Page's token (a Page token made from a long-lived user token does not expire);
 * the user token is dropped. Several → kept (encrypted, per provider) for one hour while the sheet asks
 * which. None for either → nothing is stored and the sheet explains how to link Instagram to a Page.
 *
 * Phase 10 (plan §5.4): both providers' rows are built (and encrypted) first, then saved in ONE upsert,
 * so "Couldn't connect" always means nothing changed. The result names a provider the partner switched
 * off (`instagram_declined` / `facebook_declined`) instead of guessing "no account linked". Phase 15
 * (§5.9): Instagram saved with no Page to post to reads `facebook_no_page`, not plain "Connected". A
 * provider that is switched off OR has nothing linked in this login marks that venue's active row from
 * the same Facebook user "Reconnect" (best effort, after the save, never on an error).
 */
export async function GET(request: Request) {
  if (!isSocialPostNowLive()) {
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
    console.warn("[SocialMeta] callback-bad-state");
    return done("expired", null);
  }
  const venueId = state.venueId;

  if (params.get("error")) {
    // access_denied = the partner cancelled. Anything else is logged by its code only.
    console.info("[SocialMeta] callback-denied", { error: params.get("error")?.slice(0, 40) });
    return done("denied", venueId);
  }

  const code = params.get("code")?.trim() ?? "";
  const secret = metaAppSecret();
  if (!code) return done("error", venueId);
  if (!secret || !isSocialTokenKeyConfigured()) return done("not_configured", venueId);

  const short = await exchangeMetaCode({ code, redirectUri: metaRedirectUri(request), secret });
  if (!short.ok) {
    console.error("[SocialMeta] callback-code-exchange-failed", { kind: short.error.kind, code: short.error.code });
    return done("error", venueId);
  }
  const long = await exchangeLongLivedMetaToken({ token: short.data.accessToken, secret });
  if (!long.ok) {
    console.error("[SocialMeta] callback-long-lived-failed", { kind: long.error.kind, code: long.error.code });
    return done("error", venueId);
  }
  const userToken = long.data.accessToken;

  const [metaUser, granted] = await Promise.all([fetchMetaUserId(userToken, secret), fetchGrantedPermissions(userToken, secret)]);
  if (!metaUser.ok || !granted.ok) {
    console.error("[SocialMeta] callback-me-failed", {
      user: metaUser.ok ? "ok" : metaUser.error.kind,
      permissions: granted.ok ? "ok" : granted.error.kind,
    });
    return done("error", venueId);
  }
  const instagramGranted = META_INSTAGRAM_REQUIRED_PERMISSIONS.every((permission) => granted.data.includes(permission));
  const facebookGranted = META_FACEBOOK_REQUIRED_PERMISSIONS.every((permission) => granted.data.includes(permission));
  // Best effort, after the save: an earlier row this login shows can't post any more becomes "Reconnect".
  const markGone = async (outcomes: Record<SocialProvider, SocialConnectOutcome>): Promise<void> => {
    const gone = socialGoneConnections(outcomes);
    if (gone.length === 0) return;
    try {
      const marked = await markGoneReconnectNeeded(venueId, metaUser.data, gone);
      if (marked > 0) console.info("[SocialMeta] gone-marked-reconnect", { venueId, gone, marked });
    } catch (error) {
      console.warn("[SocialMeta] gone-mark-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    }
  };
  if (!instagramGranted && !facebookGranted) {
    console.info("[SocialMeta] callback-missing-permissions", {
      missing: [...new Set([...META_INSTAGRAM_REQUIRED_PERMISSIONS, ...META_FACEBOOK_REQUIRED_PERMISSIONS])].filter(
        (permission) => !granted.data.includes(permission),
      ),
    });
    await markGone({ instagram: "not_granted", facebook: "not_granted" });
    return done("missing_permissions", venueId);
  }

  const pages = await fetchMetaPages(userToken, secret);
  if (!pages.ok) {
    console.error("[SocialMeta] callback-accounts-failed", { kind: pages.error.kind, code: pages.error.code });
    return done("error", venueId);
  }
  // Trap (Phase 15): /me/accounts is read once with limit=100 and paging isn't followed, so a user with
  // over 100 Pages could read `none_linked` and get a wrong "Reconnect" on an old row. Accepted: Reconnect
  // fixes it and no partner has 100 Pages. Don't add paging for this.
  const accounts = instagramGranted ? instagramAccountsOf(pages.data) : [];
  const facebookPages = facebookGranted ? publishablePagesOf(pages.data) : [];
  const instagram = socialConnectOutcome(instagramGranted, accounts.length);
  const facebook = socialConnectOutcome(facebookGranted, facebookPages.length);
  const result = socialConnectResult(instagram, facebook);

  // Build every row first (encryption throws here, before any write), then one all-or-nothing upsert.
  const base = { venueId, ownerId: auth.ownerId, metaUserId: metaUser.data, scopes: granted.data };
  const pending = { userToken, expiresInS: long.data.expiresInS };
  try {
    const rows: SocialConnectionRow[] = [];
    if (instagram === "saved") rows.push(connectionRow("instagram", base, instagramConnectedAccount(accounts[0])));
    if (instagram === "choose") rows.push(pendingChoiceRow("instagram", base, pending, instagramChoicesOf(accounts)));
    if (facebook === "saved") rows.push(connectionRow("facebook", base, facebookConnectedAccount(facebookPages[0])));
    if (facebook === "choose") rows.push(pendingChoiceRow("facebook", base, pending, facebookChoicesOf(facebookPages)));
    await saveSocialConnections(rows);
  } catch (error) {
    console.error("[SocialMeta] callback-save-failed", { venueId, error: error instanceof Error ? error.message : "unknown" });
    return done("error", venueId);
  }
  await markGone({ instagram, facebook });
  console.info("[SocialMeta] connected", { venueId, instagram, facebook, result });
  return done(result, venueId);
}
