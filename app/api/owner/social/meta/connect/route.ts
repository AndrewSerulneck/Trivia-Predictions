import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isSocialTokenKeyConfigured } from "@/lib/social/crypto";
import { isSocialPostNowLive } from "@/lib/social/flags";
import { META_PARTNER_LOGIN_CONFIG_ID, metaAppSecret, metaAuthorizeUrl, metaRedirectUri } from "@/lib/social/metaConfig";
import { createSocialOAuthState } from "@/lib/social/oauthState";
import { redirectToSocialSheet } from "@/lib/social/ownerSocialGuard";

/**
 * GET /api/owner/social/meta/connect?venueId= — start "Connect Instagram"
 * (docs/partner-social-promo-plan.md Phase 5). A plain link from the Share to social sheet.
 *
 * 404 with the flag off. Owner-only and venue-scoped. Fails closed back to the sheet
 * ("not_configured") when the login configuration, the app secret or SOCIAL_TOKEN_KEY is missing —
 * nobody is sent to Meta for a token we couldn't encrypt. Otherwise sets the single-use nonce cookie and
 * sends the partner to Facebook Login for Business (config_id, User access token configuration).
 */
export async function GET(request: Request) {
  if (!isSocialPostNowLive()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch {
    return NextResponse.redirect(new URL("/owner/login", request.url), 303);
  }

  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId || !auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  if (!META_PARTNER_LOGIN_CONFIG_ID || !metaAppSecret() || !isSocialTokenKeyConfigured()) {
    console.error("[SocialInstagram] connect-not-configured", {
      config: Boolean(META_PARTNER_LOGIN_CONFIG_ID),
      secret: Boolean(metaAppSecret()),
      tokenKey: isSocialTokenKeyConfigured(),
    });
    return redirectToSocialSheet(request, "not_configured", venueId);
  }

  const started = createSocialOAuthState({ ownerId: auth.ownerId, venueId });
  if (!started) {
    console.error("[SocialInstagram] connect-no-session-secret");
    return redirectToSocialSheet(request, "not_configured", venueId);
  }

  const response = NextResponse.redirect(
    metaAuthorizeUrl({ configId: META_PARTNER_LOGIN_CONFIG_ID, redirectUri: metaRedirectUri(request), state: started.state }),
    303,
  );
  response.headers.append("Set-Cookie", started.cookie);
  return response;
}
