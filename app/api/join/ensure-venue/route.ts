import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FallbackVenue = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
};

const ALLOWED_FALLBACK_VENUES: Record<string, FallbackVenue> = {
  "venue-downtown": {
    id: "venue-downtown",
    name: "Downtown Sports Bar",
    address: "Downtown Manhattan, New York, NY",
    latitude: 40.712776,
    longitude: -74.005974,
    radius: 100,
  },
  "venue-uptown": {
    id: "venue-uptown",
    name: "Uptown Taproom",
    address: "Uptown Manhattan, New York, NY",
    latitude: 40.73061,
    longitude: -73.935242,
    radius: 100,
  },
  "venue-riverside": {
    id: "venue-riverside",
    name: "Riverside Grill",
    address: "Midtown West, New York, NY",
    latitude: 40.758896,
    longitude: -73.98513,
    radius: 100,
  },
};

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { venueId?: string };
  const venueId = (body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }

  const fallbackVenue = ALLOWED_FALLBACK_VENUES[venueId];
  if (!fallbackVenue) {
    // Ignore unknown ids to avoid creating arbitrary venues from public traffic.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error } = await supabaseAdmin.from("venues").upsert(
    {
      id: fallbackVenue.id,
      name: fallbackVenue.name,
      address: fallbackVenue.address,
      latitude: fallbackVenue.latitude,
      longitude: fallbackVenue.longitude,
      radius: fallbackVenue.radius,
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
