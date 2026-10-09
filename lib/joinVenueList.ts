import { calculateDistanceMeters, getGeofenceThresholdMeters, type GeofenceCoordinates } from "@/lib/geofence";
import type { Venue } from "@/types";

// The join flow's venue list, tagged with the build it belongs to.
//
// Every build (and every sign-out / back-to-sign-in) starts a new `generation`
// and empties the list. A list is shown only when it was committed for the
// CURRENT generation, and a build that finishes after a newer one has started
// is dropped. Together these stop one sign-in's list (e.g. a God Mode account's
// "every venue") from appearing behind the next player's location check
// (docs/native-app-store-plan.md Phase 2C, device report R4).
export type JoinVenueListState = {
  generation: number;
  builtForGeneration: number | null;
  venues: Venue[];
};

const NO_VENUES: Venue[] = [];

export const INITIAL_JOIN_VENUE_LIST: JoinVenueListState = {
  generation: 0,
  builtForGeneration: null,
  venues: NO_VENUES,
};

export const emptyJoinVenueList = (generation: number): JoinVenueListState => ({
  generation,
  builtForGeneration: null,
  venues: NO_VENUES,
});

export const commitJoinVenueList = (
  state: JoinVenueListState,
  generation: number,
  venues: Venue[]
): JoinVenueListState => {
  if (generation !== state.generation) return state;
  return { generation, builtForGeneration: generation, venues };
};

export const visibleJoinVenueList = (state: JoinVenueListState): Venue[] =>
  state.builtForGeneration === state.generation ? state.venues : NO_VENUES;

// In-range venues only, nearest first — the single geofence filter for the
// join venue list (normal players; God Mode never calls it).
export const filterVenuesInRange = (venues: Venue[], coords: GeofenceCoordinates): Venue[] =>
  venues
    .map((item) => ({
      venue: item,
      distance: calculateDistanceMeters(coords, { latitude: item.latitude, longitude: item.longitude }),
    }))
    .filter((item) => item.distance <= getGeofenceThresholdMeters(item.venue.radius, coords.accuracy))
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.venue);
