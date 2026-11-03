import { calculateDistanceMeters, isValidGeofenceCoordinates } from "@/lib/geofence";
import { SIGNUP_RADIUS_MAX, SIGNUP_RADIUS_MIN } from "@/lib/selfServeSignup";
import { isPlaceholderVenueRow } from "@/lib/venueClaim";

// What a partner may change about their venue's geofence (pin + radius), and nothing else.
// Pure — shared by PATCH /api/owner/venues/location (the authority) and the
// /owner/venue-location page (Phase 3, for early feedback only).
// Plan: docs/signup-price-copy-and-partner-geofence-plan.md, decisions D3, D4, D6, D7.
//
// There is no DB CHECK on venues.radius: this file is the only guard on what a partner writes.

/** D6 — the farthest a partner may move the pin from the SAVED pin in one save. */
export const OWNER_PIN_MOVE_MAX_METERS = 1000;

export type VenueLocation = { latitude: number; longitude: number; radius: number };

export type VenueLocationRefusalCode =
  | "invalid_coordinates"
  | "placeholder_pin"
  | "no_saved_pin"
  | "moved_too_far"
  | "invalid_radius"
  | "radius_out_of_range";

export type VenueLocationVerdict =
  | { ok: true; movedMeters: number }
  | { ok: false; code: VenueLocationRefusalCode; message: string };

/** Every partner-facing word for the Venue Location page and its route, in one place. */
export const VENUE_LOCATION_COPY = {
  invalidCoordinates: "That location isn't valid. Move the pin and try again.",
  placeholderPin: "That location isn't valid. Move the pin to your venue and try again.",
  noSavedPin: "Your venue doesn't have a location yet. Email support and we'll set it for you.",
  movedTooFar: "That's far from your saved location — email support and we'll move it for you.",
  invalidRadius: "The geofence must be a whole number of meters.",
  radiusOutOfRange: `The geofence must be between ${SIGNUP_RADIUS_MIN} and ${SIGNUP_RADIUS_MAX} m.`,
  saved: "Saved. New players can join from the new spot right away.",
  helper: "Players can't join? Stand inside your venue and tap Use my current location.",
} as const;

const refuse = (code: VenueLocationRefusalCode, message: string): VenueLocationVerdict => ({
  ok: false,
  code,
  message,
});

const isUsablePin = (pin: { latitude: number; longitude: number } | null): boolean =>
  pin !== null && isValidGeofenceCoordinates(pin) && !isPlaceholderVenueRow(pin);

/**
 * `saved` is the row as stored (any field may be null on a malformed row). `next` is what the
 * partner sent. The radius rule (D7): unchanged is always fine — even an admin-set 600 m — so a
 * pin-only save never shrinks it; a CHANGED radius must be a whole number within the signup range.
 */
export const validateOwnerVenueLocation = ({
  saved,
  next,
}: {
  saved: { latitude: number | null; longitude: number | null; radius: number | null };
  next: VenueLocation;
}): VenueLocationVerdict => {
  if (!isValidGeofenceCoordinates({ latitude: next.latitude, longitude: next.longitude })) {
    return refuse("invalid_coordinates", VENUE_LOCATION_COPY.invalidCoordinates);
  }
  if (isPlaceholderVenueRow(next)) {
    return refuse("placeholder_pin", VENUE_LOCATION_COPY.placeholderPin);
  }

  const savedPin =
    saved.latitude === null || saved.longitude === null
      ? null
      : { latitude: saved.latitude, longitude: saved.longitude };
  if (savedPin === null || !isUsablePin(savedPin)) {
    return refuse("no_saved_pin", VENUE_LOCATION_COPY.noSavedPin);
  }

  const movedMeters = calculateDistanceMeters(savedPin, next);
  if (!(movedMeters <= OWNER_PIN_MOVE_MAX_METERS)) {
    return refuse("moved_too_far", VENUE_LOCATION_COPY.movedTooFar);
  }

  if (!Number.isInteger(next.radius)) {
    return refuse("invalid_radius", VENUE_LOCATION_COPY.invalidRadius);
  }
  const unchanged = saved.radius !== null && next.radius === saved.radius;
  if (!unchanged && (next.radius < SIGNUP_RADIUS_MIN || next.radius > SIGNUP_RADIUS_MAX)) {
    return refuse("radius_out_of_range", VENUE_LOCATION_COPY.radiusOutOfRange);
  }

  return { ok: true, movedMeters };
};
