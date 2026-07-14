import { NextResponse } from "next/server";
import { isSessionEnforced, readSession } from "@/lib/serverSession";
import { venuePresenceResponse, verifyVenuePresenceLocation } from "@/lib/venuePresence";
import type { GeofenceCoordinates } from "@/lib/geofence";

export async function POST(request: Request) {
  try {
    const sessionUserId = readSession(request);
    if (isSessionEnforced() && !sessionUserId) {
      return NextResponse.json(
        {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Please sign in again to continue playing.",
          userMessage: "Please sign in again to continue playing.",
        },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      venueId?: string;
      location?: GeofenceCoordinates;
    };

    const userId = sessionUserId ?? String(body.userId ?? "").trim();
    const venueId = String(body.venueId ?? "").trim();

    const result = await verifyVenuePresenceLocation({
      userId,
      venueId,
      location: body.location,
      source: "heartbeat",
    });

    return venuePresenceResponse(result);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "VENUE_PRESENCE_UNAVAILABLE",
        error: "We could not confirm venue access. Please recheck your location to keep playing.",
        userMessage: "We could not confirm venue access. Please recheck your location to keep playing.",
      },
      { status: 503 }
    );
  }
}
