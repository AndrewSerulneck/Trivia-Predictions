import { NextResponse } from "next/server";
import { getAddressDetails, getAddressPredictions } from "@/lib/geolocation";
import { createOwnerVenueAddressToken, normalizeOwnerVenueAddress } from "@/lib/ownerVenueAddress";
import { rateLimit } from "@/lib/rateLimit";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: Request): Promise<Response> {
  let auth;
  try { auth = await requireOwnerAuth(request); } catch (response) { return response as Response; }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "Invalid request." }, 400);
  const input = body as Record<string, unknown>;
  const venueId = typeof input.venueId === "string" ? input.venueId.trim() : "";
  if (!auth.venueIds.includes(venueId)) return json({ ok: false, error: "You do not have access to this venue." }, 403);
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
  const sessionToken = typeof input.sessionToken === "string" ? input.sessionToken : "";
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(sessionToken) || query.length > 200 || placeId.length > 512 || Boolean(query) === Boolean(placeId)) {
    return json({ ok: false, error: "Enter an address." }, 400);
  }
  if (query && query.length < 3) return json({ ok: true, predictions: [] });
  try {
    const limit = await rateLimit(request, placeId ? "venueAddressDetailsOwner" : "venueAddressSearchOwner", { identity: auth.ownerId, ignoreIp: true });
    if (!limit.allowed) return json({ ok: false, error: limit.unavailable ? "Address search unavailable." : "Try again shortly." }, limit.unavailable ? 503 : 429,
      { "Retry-After": String(Math.max(1, limit.retryAfterSeconds)) });
    if (placeId) {
      const details = normalizeOwnerVenueAddress(await getAddressDetails(placeId, sessionToken));
      if (!details) return json({ ok: false, error: "Choose a complete street address." }, 400);
      const addressToken = createOwnerVenueAddressToken(auth.ownerId, venueId, details);
      return json({ ok: true, details, addressToken });
    }
    return json({ ok: true, predictions: (await getAddressPredictions(query, sessionToken)).slice(0, 5) });
  } catch {
    console.error("[OwnerVenueAddress] lookup-failed");
    return json({ ok: false, error: "Address search unavailable." }, 503);
  }
}
