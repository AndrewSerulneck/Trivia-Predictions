import "server-only";

import { SIGNUP_DUPLICATE_RADIUS_METERS } from "@/lib/selfServeSignup";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { VENUE_CLAIM_COLUMNS, claimableDistanceMeters, type ClaimableVenueRow } from "@/lib/venueClaim";

// "Is there already a venue at this pin?" — shared by POST /api/owner/signup (Partner Self-Serve
// Signup Phase 5) and POST /api/owner/venues/add (multi-venue billing Phase 3), which must answer
// it identically: a second venue row for one bar splits its leaderboard in two. Moved here
// verbatim from the signup route in multi-venue billing Phase 3 (an App Router route file may only
// export HTTP handlers, so a second route could not import it from there).
//
// The eligibility rule is NOT written here — it is `claimableDistanceMeters` in lib/venueClaim.ts.

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** "12 Main St, Denver, CO" — the address a duplicate-venue answer shows the partner. */
export const venueAddressLabel = (venue: ClaimableVenueRow): string =>
  text(venue.address) || [text(venue.street), text(venue.city), text(venue.state)].filter(Boolean).join(", ");

/**
 * Nearest existing venue within SIGNUP_DUPLICATE_RADIUS_METERS of the pin, or
 * null.
 *
 * Postgres has no geo index here, so this is a latitude/longitude bounding box
 * (cheap, index-friendly) narrowed by real haversine distance in JS. The box is
 * a superset of the circle, never a subset, so nothing inside the radius is
 * missed.
 *
 * HIDDEN VENUES ARE INCLUDED on purpose. A hidden row is usually somebody
 * else's abandoned self-serve signup at this same address; offering it as a
 * claim is right, and the Stripe webhook reveals it on first payment exactly as
 * it would a fresh one. A hidden row this flow did NOT create is a different
 * animal — it is still returned, so the caller can refuse instead of creating a
 * duplicate, but the caller must never offer it as a claim
 * (`isAdminHiddenVenueRow`).
 *
 * Which rows qualify is `claimableDistanceMeters`, in lib/venueClaim.ts, and
 * NOT a rule written here: rows with no coordinates, and the literal (0, 0)
 * placeholder both Category Blitz global rooms use, are excluded there so the
 * claim branch gets exactly the same answer this scan does.
 *
 * Throws on a read error — callers turn that into a generic 500.
 */
export async function findNearbyVenue(latitude: number, longitude: number): Promise<ClaimableVenueRow | null> {
  const latDelta = SIGNUP_DUPLICATE_RADIUS_METERS / 111_320;
  const cosLat = Math.abs(Math.cos((latitude * Math.PI) / 180));
  const lngDelta = cosLat < 1e-6 ? 360 : SIGNUP_DUPLICATE_RADIUS_METERS / (111_320 * cosLat);

  let query = supabaseAdmin!
    .from("venues")
    .select(VENUE_CLAIM_COLUMNS)
    .gte("latitude", latitude - latDelta)
    .lte("latitude", latitude + latDelta);

  // Near a pole, or across the antimeridian, the longitude box stops being a
  // simple interval. Dropping the bound there keeps the result a superset (the
  // latitude band alone is still tiny) rather than silently missing a match.
  if (longitude - lngDelta >= -180 && longitude + lngDelta <= 180) {
    query = query.gte("longitude", longitude - lngDelta).lte("longitude", longitude + lngDelta);
  }

  // `.order` before `.limit` so a box that somehow held more than 200 venues
  // returns a deterministic, reproducible-from-a-log slice rather than an
  // arbitrary one. A 300 m box does not hold 200 venues in this product — this
  // is robustness, not a live bug — but an arbitrary slice could miss the
  // nearest match and create a duplicate venue instead of offering the claim.
  const { data, error } = await query.order("latitude", { ascending: true }).limit(200);
  if (error) {
    throw new Error(error.message ?? "Failed to check for an existing venue.");
  }

  let nearest: ClaimableVenueRow | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const row of (data ?? []) as ClaimableVenueRow[]) {
    const distance = claimableDistanceMeters(row, { latitude, longitude });
    if (distance !== null && distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/** Does any owner already hold this venue? Throws on a read error. */
export async function venueHasOwner(venueId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from("venue_owner_venues")
    .select("id")
    .eq("venue_id", venueId)
    .limit(1);
  if (error) {
    throw new Error(error.message ?? "Failed to check venue ownership.");
  }
  return (data ?? []).length > 0;
}
