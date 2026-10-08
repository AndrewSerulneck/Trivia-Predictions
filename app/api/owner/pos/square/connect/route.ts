import { NextResponse } from "next/server";
import { squareEnvironmentConflict } from "@/lib/pos/connections";
import { isPosTokenKeyConfigured } from "@/lib/pos/crypto";
import { createPosOAuthState } from "@/lib/pos/oauthState";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { squareAuthorizeUrl } from "@/lib/pos/square";
import { squareAppConfig } from "@/lib/pos/squareConfig";
import { redirectToPosSheet } from "@/lib/pos/squareRoutes";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET /api/owner/pos/square/connect?venueId= — start "Connect Square"
 * (docs/pos-rewards-integration-plan.md Phase 2). A plain link from the Point of Sale sheet.
 *
 * 404 with the flag off. Owner-only and venue-scoped. Fails closed back to the sheet
 * ("not_configured") when the Square app or POS_TOKEN_KEY is missing — tokens must never be
 * fetched if they can't be encrypted. Otherwise sets the single-use nonce cookie and sends the
 * partner to Square's consent screen.
 *
 * Environment guard (docs/square-dev-test-venue-plan.md Phase 1): when the venue's live Square
 * row was made by the OTHER server (the live site's real connection, seen from the dev server's
 * sandbox), nothing starts — back to the sheet with "other_environment". A failed check is
 * "error", never a go-ahead. The callback checks again before it writes anything.
 */
export async function GET(request: Request) {
  if (!isPosIntegrationsEnabled()) {
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

  const config = squareAppConfig();
  if (!config || !isPosTokenKeyConfigured()) {
    console.error("[PosSquare] connect-not-configured", { app: Boolean(config), tokenKey: isPosTokenKeyConfigured() });
    return redirectToPosSheet(request, "not_configured");
  }

  const guard = await squareEnvironmentConflict(venueId);
  if (!guard.ok) return redirectToPosSheet(request, "error");
  if (guard.conflict) {
    console.warn("[PosSquare] connect-other-environment", { venueId, row: guard.conflict, server: config.environment });
    return redirectToPosSheet(request, "other_environment");
  }

  const started = createPosOAuthState({ ownerId: auth.ownerId, venueId, provider: "square" });
  if (!started) {
    console.error("[PosSquare] connect-no-session-secret");
    return redirectToPosSheet(request, "not_configured");
  }

  const response = NextResponse.redirect(squareAuthorizeUrl(config, started.state), 303);
  response.headers.append("Set-Cookie", started.cookie);
  return response;
}
