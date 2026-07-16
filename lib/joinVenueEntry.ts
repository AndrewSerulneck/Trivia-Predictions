import type { Coordinates } from "@/lib/geolocation";
import type { User, Venue } from "@/types";

export type VenueAccessResult = {
  allowed: boolean;
  location?: Coordinates;
};

/**
 * The exact 403 message `/api/join/profile` returns when a non-God-Mode account
 * reaches the geofence boundary WITHOUT a browser location (the expected first
 * response on the server-first join path). Shared between the server route and
 * the client matcher below so the two can never silently drift — if they did,
 * the browser-geolocation fallback would stop firing and normal users could no
 * longer join any venue. Deliberately distinct from the out-of-range 403
 * ("You are Nm away…"), which is a genuine denial and must NOT trigger a retry.
 */
export const JOIN_LOCATION_REQUIRED_MESSAGE =
  "Location verification is required to enter this venue.";

export function isJoinLocationRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(JOIN_LOCATION_REQUIRED_MESSAGE);
}

export async function resolveVenueProfileServerFirst(params: {
  selectedVenue: Venue;
  location?: Coordinates;
  resolveProfile: (location?: Coordinates) => Promise<User>;
  verifyVenueAccess: (selectedVenue: Venue) => Promise<VenueAccessResult>;
  onLocationBlocked?: () => void;
}): Promise<User | null> {
  const { selectedVenue, location, resolveProfile, verifyVenueAccess, onLocationBlocked } = params;

  // God Mode join contract: the server owns the first decision because it can
  // read `accounts.god_mode`. Browser geolocation is only a fallback after the
  // server says this specific user still needs location verification.
  try {
    return await resolveProfile(location);
  } catch (error) {
    if (location || !isJoinLocationRequiredError(error)) {
      throw error;
    }

    const access = await verifyVenueAccess(selectedVenue);
    if (!access.allowed) {
      onLocationBlocked?.();
      return null;
    }

    return resolveProfile(access.location);
  }
}
