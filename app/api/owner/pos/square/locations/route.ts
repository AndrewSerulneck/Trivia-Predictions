import { NextResponse } from "next/server";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { isSquareGiftCardLocation, listSquareLocations } from "@/lib/pos/square";
import { loadSquareTokenForSetup, setSquareLocation } from "@/lib/pos/squareConnection";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET  /api/owner/pos/square/locations?venueId=      → this venue's ACTIVE Square locations
 * POST /api/owner/pos/square/locations { venueId, locationId } → issue gift cards at that one
 *
 * Only needed when the connected Square account has more than one location
 * (docs/pos-rewards-integration-plan.md Phase 2: "Pick the Square location during connect").
 * Owner-only, venue-scoped, 404 with the flag off. The POST re-lists locations from Square and
 * refuses an id that isn't one of them, so a partner can't point the venue at a location from
 * someone else's account. One Square call per request; only while the partner is choosing.
 *
 * Phase 2c: each location carries `eligible` (US location, USD — isSquareGiftCardLocation), the
 * picker greys out the rest, and the POST refuses an ineligible one. Currency and country
 * themselves aren't sent.
 */

type Auth = { ownerId: string; venueIds: string[] };

const guard = async (request: Request, venueId: string): Promise<{ auth: Auth } | { response: Response }> => {
  if (!isPosIntegrationsEnabled()) {
    return { response: NextResponse.json({ ok: false, error: "Not found." }, { status: 404 }) };
  }
  let auth: Auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return { response: response as Response };
  }
  if (!venueId) return { response: NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 }) };
  if (!auth.venueIds.includes(venueId)) {
    return { response: NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 }) };
  }
  return { auth };
};

const LOAD_ERROR = "Couldn't load your Square locations.";
const NOT_ELIGIBLE_LOCATION = "That location can't issue Hightop gift cards: it must be a US location that uses US dollars.";

const loadLocations = async (venueId: string) => {
  const token = await loadSquareTokenForSetup(venueId);
  if (!token.ok) return null;
  const locations = await listSquareLocations(token.environment, token.accessToken);
  return Array.isArray(locations) ? locations : null;
};

export async function GET(request: Request) {
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const checked = await guard(request, venueId);
  if ("response" in checked) return checked.response;

  const locations = await loadLocations(venueId);
  if (!locations) return NextResponse.json({ ok: false, error: LOAD_ERROR }, { status: 502 });
  return NextResponse.json({
    ok: true,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      address: location.address,
      eligible: isSquareGiftCardLocation(location),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { venueId?: string; locationId?: string } | null;
  const venueId = String(body?.venueId ?? "").trim();
  const checked = await guard(request, venueId);
  if ("response" in checked) return checked.response;

  const locationId = String(body?.locationId ?? "").trim();
  if (!locationId) return NextResponse.json({ ok: false, error: "Choose a location." }, { status: 400 });

  const locations = await loadLocations(venueId);
  if (!locations) return NextResponse.json({ ok: false, error: LOAD_ERROR }, { status: 502 });
  const chosen = locations.find((location) => location.id === locationId);
  if (!chosen) {
    return NextResponse.json({ ok: false, error: "That location isn't on your Square account." }, { status: 400 });
  }
  if (!isSquareGiftCardLocation(chosen)) {
    return NextResponse.json({ ok: false, error: NOT_ELIGIBLE_LOCATION }, { status: 400 });
  }

  const saved = await setSquareLocation(venueId, locationId);
  if (!saved.ok) return NextResponse.json({ ok: false, error: "Couldn't save the location." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
