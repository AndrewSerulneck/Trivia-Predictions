import { NextResponse } from "next/server";
import { isPosTokenKeyConfigured } from "@/lib/pos/crypto";
import { clearPosOAuthCookie, verifyPosOAuthState } from "@/lib/pos/oauthState";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { exchangeSquareCode, listSquareLocations, retrieveSquareMerchant } from "@/lib/pos/square";
import { squareAppConfig } from "@/lib/pos/squareConfig";
import { saveSquareConnection } from "@/lib/pos/squareConnection";
import { redirectToPosSheet } from "@/lib/pos/squareRoutes";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET /api/owner/pos/square/callback?code=&state= (or ?error=access_denied) — Square sends the
 * partner back here after the consent screen (docs/pos-rewards-integration-plan.md Phase 2).
 * This exact URL must be the app's Redirect URL in the Square Developer Console.
 *
 * Order matters: verify the state (signature, expiry, single-use nonce cookie) and bind it to
 * the live owner session and that owner's venues BEFORE the code is exchanged, so a forged or
 * replayed callback never fetches a token. The nonce cookie is cleared on every outcome.
 *
 * One active Square location → used automatically. Several → saved with no location and the
 * sheet asks which one ("choose_location"); until then no gift card can be issued.
 */
export async function GET(request: Request) {
  if (!isPosIntegrationsEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  const clear = { "Set-Cookie": clearPosOAuthCookie() };

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch {
    const response = NextResponse.redirect(new URL("/owner/login", request.url), 303);
    response.headers.append("Set-Cookie", clearPosOAuthCookie());
    return response;
  }

  const params = new URL(request.url).searchParams;
  const state = verifyPosOAuthState(request, params.get("state"));
  if (!state || state.provider !== "square" || state.ownerId !== auth.ownerId || !auth.venueIds.includes(state.venueId)) {
    console.warn("[PosSquare] callback-bad-state");
    return redirectToPosSheet(request, "expired", clear);
  }

  if (params.get("error")) {
    // access_denied = the partner pressed Deny. Anything else is logged by code only.
    console.info("[PosSquare] callback-denied", { error: params.get("error") });
    return redirectToPosSheet(request, "denied", clear);
  }

  const code = params.get("code")?.trim() ?? "";
  const config = squareAppConfig();
  if (!code || !config || !isPosTokenKeyConfigured()) {
    return redirectToPosSheet(request, code ? "not_configured" : "error", clear);
  }

  const tokens = await exchangeSquareCode(config, code);
  if ("code" in tokens) {
    console.error("[PosSquare] callback-token-exchange-failed", { code: tokens.code, message: tokens.message });
    return redirectToPosSheet(request, "error", clear);
  }

  const [merchant, locations] = await Promise.all([
    retrieveSquareMerchant(config.environment, tokens.accessToken),
    listSquareLocations(config.environment, tokens.accessToken),
  ]);
  if (!Array.isArray(locations)) {
    console.error("[PosSquare] callback-locations-failed", { code: locations.code });
    return redirectToPosSheet(request, "error", clear);
  }
  if (locations.length === 0) return redirectToPosSheet(request, "no_location", clear);

  const saved = await saveSquareConnection({
    venueId: state.venueId,
    ownerId: auth.ownerId,
    environment: config.environment,
    tokens,
    merchantName: "code" in merchant ? null : merchant.businessName,
    locationId: locations.length === 1 ? locations[0].id : null,
  });
  if (!saved.ok) return redirectToPosSheet(request, "error", clear);

  console.info("[PosSquare] connected", { venueId: state.venueId, environment: config.environment, locations: locations.length });
  return redirectToPosSheet(request, locations.length === 1 ? "connected" : "choose_location", clear);
}
