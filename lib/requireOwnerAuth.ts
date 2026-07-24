import "server-only";
import { readOwnerSession } from "@/lib/ownerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OwnerAuthContext = {
  ownerId: string;
  venueIds: string[];
};

export async function requireOwnerAuth(request: Request): Promise<OwnerAuthContext> {
  const ownerId = readOwnerSession(request);
  if (!ownerId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabaseAdmin) {
    throw new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("venue_id")
    .eq("owner_id", ownerId);

  if (error) {
    throw new Response(JSON.stringify({ error: "Failed to load owner venues" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const linkedVenueIds = (data ?? [])
    .map((row) => String(row.venue_id ?? "").trim())
    .filter(Boolean);

  if (linkedVenueIds.length === 0) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: liveVenues, error: liveVenueError } = await supabaseAdmin
    .from("venues")
    .select("id")
    .in("id", linkedVenueIds);

  if (liveVenueError) {
    throw new Response(JSON.stringify({ error: "Failed to load owner venues" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const venueIds = (liveVenues ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (venueIds.length === 0) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { ownerId, venueIds };
}
