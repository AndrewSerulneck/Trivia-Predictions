import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CreateProfileBody = {
  username?: string;
  venueId?: string;
};

type UserRow = {
  id: string;
  auth_id: string | null;
  username: string;
  venue_id: string;
  points: number;
  created_at: string;
};

const DEFAULT_VENUES: Record<
  string,
  { id: string; name: string; address: string; latitude: number; longitude: number; radius: number }
> = {
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

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing auth token." }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const authUserId = authData.user?.id;
  if (authError || !authUserId) {
    return NextResponse.json({ ok: false, error: "Invalid auth token." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateProfileBody;
  const username = (body.username ?? "").trim();
  const venueId = (body.venueId ?? "").trim();

  if (!username) {
    return NextResponse.json({ ok: false, error: "Username is required." }, { status: 400 });
  }
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }

  // Ensure default demo venues are present when selected from public links.
  const defaultVenue = DEFAULT_VENUES[venueId];
  if (defaultVenue) {
    const { error: upsertVenueError } = await supabaseAdmin.from("venues").upsert(
      {
        id: defaultVenue.id,
        name: defaultVenue.name,
        address: defaultVenue.address,
        latitude: defaultVenue.latitude,
        longitude: defaultVenue.longitude,
        radius: defaultVenue.radius,
      },
      { onConflict: "id" }
    );
    if (upsertVenueError) {
      return NextResponse.json({ ok: false, error: upsertVenueError.message }, { status: 500 });
    }
  }

  const { data: existingByUsername, error: existingUsernameError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("venue_id", venueId)
    .ilike("username", username)
    .limit(1);
  if (existingUsernameError) {
    return NextResponse.json({ ok: false, error: existingUsernameError.message }, { status: 500 });
  }
  if ((existingByUsername?.length ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: "That username is already taken at this venue." }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      auth_id: authUserId,
      username,
      venue_id: venueId,
      points: 0,
    })
    .select("id, auth_id, username, venue_id, points, created_at")
    .single<UserRow>();

  if (error || !data) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "23503") {
      return NextResponse.json(
        { ok: false, error: "Selected venue is unavailable right now. Refresh and choose again." },
        { status: 409 }
      );
    }
    if (code === "23505") {
      return NextResponse.json({ ok: false, error: "That username is already taken at this venue." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create profile." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.id,
      authId: data.auth_id ?? undefined,
      username: data.username,
      venueId: data.venue_id,
      points: data.points,
      createdAt: data.created_at,
    },
  });
}
