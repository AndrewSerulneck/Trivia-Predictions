import "server-only";
import {
  OWNER_AUTH_NO_SESSION,
  OWNER_AUTH_NO_VENUE,
  type OwnerAuthFailureCode,
} from "@/lib/ownerAuthCodes";
import { readOwnerSession } from "@/lib/ownerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OwnerAuthContext = {
  ownerId: string;
  venueIds: string[];
};

/**
 * The 401 body, carrying WHY (lib/ownerAuthCodes.ts). `error` is unchanged and
 * `code` is purely additive: every existing caller reads only `response.status`,
 * so nothing has to be updated in step with this.
 */
const unauthorized = (code: OwnerAuthFailureCode): Response =>
  new Response(JSON.stringify({ error: "Unauthorized", code }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

export async function requireOwnerAuth(request: Request): Promise<OwnerAuthContext> {
  const ownerId = readOwnerSession(request);
  if (!ownerId) {
    throw unauthorized(OWNER_AUTH_NO_SESSION);
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
    // A VALID session for an owner with no venue link at all — what a purged
    // pending signup looks like from the browser. Not "please sign in".
    throw unauthorized(OWNER_AUTH_NO_VENUE);
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
    // Links survive but every venue they point at is gone — a partially applied
    // purge, or an admin deletion. Same answer: there is nothing to sign in to.
    throw unauthorized(OWNER_AUTH_NO_VENUE);
  }

  return { ownerId, venueIds };
}
