import { NextResponse } from "next/server";
import { isPosTokenKeyConfigured } from "@/lib/pos/crypto";
import { clearPosOAuthCookie, verifyPosOAuthState } from "@/lib/pos/oauthState";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { exchangeSquareCode, isSquareGiftCardLocation, listSquareLocations, retrieveSquareMerchant } from "@/lib/pos/square";
import { squareAppConfig } from "@/lib/pos/squareConfig";
import { discardSquareGrant, markSquareLocationIneligible, saveSquareConnection } from "@/lib/pos/squareConnection";
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
 * sheet asks which one ("choose_location"); until then no gift card can be issued. A reconnect
 * to the same Square account keeps the location already chosen while it is still eligible
 * (Phase 2d: partners reconnect once to grant the catalog scopes for menu prizes).
 *
 * Eligibility (Phase 2c): prize amounts are US dollars, so at least one location must be a US
 * location in USD (isSquareGiftCardLocation; both fields come with the locations list, no extra
 * call). An account with none isn't saved at all — we give the grant back to Square
 * (discardSquareGrant) and the sheet says why ("not_eligible"). We don't keep a token we can't use.
 * A refused RECONNECT to the same account also flips the venue's old row to "Reconnect needed"
 * (markSquareLocationIneligible, R5): that account no longer has a location that can issue cards.
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
  // A refused reconnect to the same account also retires the venue's old connection (R5).
  const refused = { venueId: state.venueId, merchantId: tokens.merchantId, environment: config.environment };
  if (locations.length === 0) {
    await markSquareLocationIneligible(refused);
    return redirectToPosSheet(request, "no_location", clear);
  }
  if (!locations.some(isSquareGiftCardLocation)) {
    await discardSquareGrant({ config, accessToken: tokens.accessToken, merchantId: tokens.merchantId, venueId: state.venueId });
    await markSquareLocationIneligible(refused);
    console.info("[PosSquare] callback-not-eligible", {
      venueId: state.venueId,
      currencies: [...new Set(locations.map((location) => location.currency))],
    });
    return redirectToPosSheet(request, "not_eligible", clear);
  }
  // Exactly one location, and it is eligible (checked above): use it without asking.
  const onlyLocation = locations.length === 1 ? locations[0].id : null;

  const saved = await saveSquareConnection({
    venueId: state.venueId,
    ownerId: auth.ownerId,
    environment: config.environment,
    tokens,
    merchantName: "code" in merchant ? null : merchant.businessName,
    locationId: onlyLocation,
    // A reconnect to the same account keeps its chosen location if it is still eligible.
    eligibleLocationIds: locations.filter(isSquareGiftCardLocation).map((location) => location.id),
  });
  if (!saved.ok) return redirectToPosSheet(request, "error", clear);

  console.info("[PosSquare] connected", { venueId: state.venueId, environment: config.environment, locations: locations.length });
  return redirectToPosSheet(request, saved.locationId ? "connected" : "choose_location", clear);
}
