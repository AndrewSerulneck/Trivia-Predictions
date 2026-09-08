import { NextResponse } from "next/server";

import { getAddressDetails, getAddressPredictions } from "@/lib/geolocation";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isSelfServeSignupEnabled, SIGNUP_PLACES_QUERY_MAX_LENGTH } from "@/lib/selfServeSignup";

// Public sibling of app/api/geolocation/predict + /details — the two routes
// useAddressLookup actually calls (plan §4 Phase 1 names /api/admin/places, but
// that route serves the older suggestion shape and no admin UI uses it for the
// wizard's autocomplete). One route serves both halves, discriminated by the
// body, so the hook can point both of its fetches at a single endpoint and one
// Places billing session spans the whole lookup:
//
//   { query, sessionToken }   → { ok, predictions }   (Autocomplete, billed per session)
//   { placeId, sessionToken } → { ok, details }       (Place Details, billed per call)
//
// Details is limited harder than predict per §4 Phase 1's "rate limited harder
// than maps-key": see SIGNUP_RATE_LIMITS in lib/rateLimit.ts.

const notFound = () =>
  NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

const MAX_QUERY_LENGTH = SIGNUP_PLACES_QUERY_MAX_LENGTH;
const MAX_PLACE_ID_LENGTH = 512;

export async function POST(request: Request) {
  if (!isSelfServeSignupEnabled()) return notFound();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      placeId?: string;
      sessionToken?: string;
    };
    const query = String(body.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const placeId = String(body.placeId ?? "").trim().slice(0, MAX_PLACE_ID_LENGTH);
    const sessionToken = String(body.sessionToken ?? "").trim() || undefined;

    // Details branch: the user tapped a prediction.
    if (placeId) {
      const limit = await rateLimit(request, "placesDetails");
      if (!limit.allowed) return rateLimitResponse(limit);

      const details = await getAddressDetails(placeId, sessionToken);
      return NextResponse.json({ ok: true, details }, { headers: { "Cache-Control": "no-store" } });
    }

    // Autocomplete branch. Short queries never reach Google, and never spend a
    // rate-limit slot — the client debounces but also fires on every keystroke
    // once it clears the minimum.
    if (query.length < 3) {
      return NextResponse.json({ ok: true, predictions: [] });
    }

    const limit = await rateLimit(request, "placesPredict");
    if (!limit.allowed) return rateLimitResponse(limit);

    const predictions = await getAddressPredictions(query, sessionToken);
    return NextResponse.json({ ok: true, predictions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // GENERIC BODY, DETAILED LOG (Finding #7). The thrown message here comes
    // from lib/geolocation's Google client and can carry the upstream status
    // text, the request URL, or a key-configuration complaint. This route is
    // unauthenticated, so none of that may reach the caller — the admin
    // siblings keep the diagnostic because requireAdminAuth already stands in
    // front of them.
    console.error("[SignupPlaces] lookup-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Address lookup is unavailable right now." },
      { status: 500 }
    );
  }
}
