import { NextResponse } from "next/server";
import { listOwnerVenues } from "@/lib/ownerVenueList";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

/**
 * GET /api/owner/venues — list the venues this owner controls (id + display name),
 * scoped to the caller's venue_owner_venues. Powers the Partner Dashboard venue
 * switcher and hub header.
 *
 * The dashboard's FIRST load no longer calls this route — it gets the same list
 * from `GET /api/owner/dashboard` in one round trip (Phase 5). This route is
 * still live for /owner/display, /owner/game-settings and /owner/category-blitz,
 * and shares its query with the dashboard route via `listOwnerVenues`.
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const venues = await listOwnerVenues(auth.venueIds);
    return NextResponse.json({ ok: true, venues });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load venues." },
      { status: 500 },
    );
  }
}
