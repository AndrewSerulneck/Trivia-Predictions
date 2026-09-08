import { NextResponse } from "next/server";

import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { SIGNUP_RADIUS_MAX, SIGNUP_RADIUS_MIN, isSelfServeSignupEnabled } from "@/lib/selfServeSignup";
import { fetchVenueStaticMap } from "@/lib/venueStaticMap";

// Public sibling of app/api/admin/venue-map/route.ts — the Static Maps thumbnail
// on the signup wizard's review screen (plan §4 Phase 4 item 6). Same gate as
// its two /api/signup/* siblings: the flag, then the rate limiter, never
// requireAdminAuth.
//
// WHY A ROUTE AND NOT THE LIVE MAP. Re-mounting GeofenceEditor's Google Maps JS
// map on the review screen would bill a second Maps JS load and hand a
// signed-out caller an interactive, draggable pin on a screen whose entire job
// is "confirm what you already set". One Static Maps image is cheaper and is not
// editable by definition.
//
// The radius is clamped to the SIGNUP bounds, not admin's 25–2000: this route's
// caller is a stranger, and a query string is trivially edited. Nothing here can
// be steered into rendering a 2 km circle.
//
// The API key never leaves the server on this path — unlike /api/signup/maps-key,
// which must hand it to the browser. The Google referrer restriction (Risk #1)
// therefore does not protect this route; the rate limiter is the whole defence.
//
// The Static Maps builder is shared with app/api/admin/venue-map/route.ts via
// lib/venueStaticMap.ts (Finding #10). This route differs only in its SIGNUP
// radius bounds and its cyan circle colour.

const notFound = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

export async function GET(request: Request) {
  if (!isSelfServeSignupEnabled()) return notFound();

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const radius = Math.max(
    SIGNUP_RADIUS_MIN,
    Math.min(SIGNUP_RADIUS_MAX, Number(searchParams.get("radius")) || SIGNUP_RADIUS_MIN)
  );

  // Validate BEFORE spending a rate-limit slot: a malformed request never
  // reaches Google, so it must not consume the partner's quota either. Same
  // reasoning as the sub-3-character early return in /api/signup/places.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ ok: false, error: "Invalid coordinates." }, { status: 400 });
  }

  const limit = await rateLimit(request, "venueMap");
  if (!limit.allowed) return rateLimitResponse(limit);

  const result = await fetchVenueStaticMap({
    lat,
    lon,
    radiusMeters: radius,
    size: "600x260",
    strokeColor: "0x22d3eeff",
    fillColor: "0x22d3ee26",
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    },
  });
}
