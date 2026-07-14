import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
};

/**
 * GET /api/owner/venues — list the venues this owner controls (id + display name),
 * scoped to the caller's venue_owner_venues. Powers the Partner Dashboard venue
 * switcher and hub header.
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

  if (auth.venueIds.length === 0) {
    return NextResponse.json({ ok: true, venues: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, name, display_name")
    .in("id", auth.venueIds)
    .returns<VenueRow[]>();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const venues = (data ?? []).map((v) => ({
    id: v.id,
    name: v.display_name ?? v.name,
  }));

  return NextResponse.json({ ok: true, venues });
}
