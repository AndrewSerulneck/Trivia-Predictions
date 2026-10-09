import { calculateDistanceMeters, getGeofenceThresholdMeters, type GeofenceCoordinates } from "@/lib/geofence";
import { NOT_A_HIGHTOP_CODE_MESSAGE } from "@/lib/nativeQrScan";
import { getVenueDisplayName } from "@/lib/venueDisplay";
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

// A venue QR scanned on the signed-in venue list (docs/native-app-review-fixes-plan.md R2).
// A QR proves nothing about where the player is, so the geofence rule is unchanged: the scan
// selects a venue only when it is in the list this sign-in already built (a God Mode list holds
// every venue). `joinableVenues` is the public venue list (listVenues(), hidden venues excluded),
// used only to name an out-of-range venue — a hidden or unknown id is "not found", worded like a
// bad code so a scan can't tell a hidden venue from a missing one.
export type ScannedVenueDecision =
  | { kind: "select"; venue: Venue }
  | { kind: "not-ready" }
  | { kind: "out-of-range"; venueName: string }
  | { kind: "not-found" };

export const decideScannedVenue = (
  venueId: string,
  state: JoinVenueListState,
  joinableVenues: readonly Venue[]
): ScannedVenueDecision => {
  const inList = visibleJoinVenueList(state).find((item) => item.id === venueId);
  if (inList) return { kind: "select", venue: inList };
  const known = joinableVenues.find((item) => item.id === venueId);
  if (!known) return { kind: "not-found" };
  // No list for this sign-in yet (location still running, or it failed): "out of range" would be a guess.
  if (state.builtForGeneration !== state.generation) return { kind: "not-ready" };
  return { kind: "out-of-range", venueName: getVenueDisplayName(known) };
};

export const scannedVenueMessage = (
  decision: Exclude<ScannedVenueDecision, { kind: "select" }>,
  locationLoading: boolean
): string => {
  if (decision.kind === "out-of-range") return `You need to be at ${decision.venueName} to join.`;
  if (decision.kind === "not-found") return NOT_A_HIGHTOP_CODE_MESSAGE;
  return locationLoading
    ? "Still checking your location. Try again in a moment."
    : "We need your location to check you're at the venue. Allow location, then scan again.";
};
