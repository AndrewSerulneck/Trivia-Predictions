import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_VENUE_BY_ID } from "@/lib/defaultVenues";

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { venueId?: string };
  const venueId = (body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }

  const fallbackVenue = DEFAULT_VENUE_BY_ID[venueId];
  if (!fallbackVenue) {
    // Ignore unknown ids to avoid creating arbitrary venues from public traffic.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: existingVenue, error: existingVenueError } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("id", fallbackVenue.id)
    .maybeSingle();

  if (existingVenueError) {
    return NextResponse.json({ ok: false, error: existingVenueError.message }, { status: 500 });
  }

  if (!existingVenue) {
    const { error } = await supabaseAdmin.from("venues").insert({
      id: fallbackVenue.id,
      name: fallbackVenue.name,
      address: fallbackVenue.address,
      latitude: fallbackVenue.latitude,
      longitude: fallbackVenue.longitude,
      radius: fallbackVenue.radius,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
