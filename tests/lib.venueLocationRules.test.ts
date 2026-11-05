import { describe, expect, it } from "vitest";
import { calculateDistanceMeters } from "@/lib/geofence";
import { SIGNUP_RADIUS_MAX, SIGNUP_RADIUS_MIN } from "@/lib/selfServeSignup";
import {
  isUsableVenuePin,
  OWNER_PIN_MOVE_MAX_METERS,
  VENUE_LOCATION_COPY,
  validateOwnerVenueLocation,
} from "@/lib/venueLocationRules";

// docs/signup-price-copy-and-partner-geofence-plan.md Phase 2 — D6 (1 km move cap) and D7
// (an unchanged out-of-range radius is kept; a changed one must be within the signup range).

const SAVED = { latitude: 40.7128, longitude: -74.006, radius: 150 };
// ~0.0009° latitude ≈ 100 m.
const NEAR = { latitude: 40.7137, longitude: -74.006, radius: 150 };

describe("validateOwnerVenueLocation", () => {
  it("accepts a small move with the same radius and reports the distance", () => {
    const v = validateOwnerVenueLocation({ saved: SAVED, next: NEAR });
    expect(v.ok).toBe(true);
    if (v.ok) expect(Math.round(v.movedMeters)).toBe(Math.round(calculateDistanceMeters(SAVED, NEAR)));
  });

  it("accepts a radius-only change inside the range", () => {
    expect(validateOwnerVenueLocation({ saved: SAVED, next: { ...SAVED, radius: SIGNUP_RADIUS_MIN } }).ok).toBe(true);
    expect(validateOwnerVenueLocation({ saved: SAVED, next: { ...SAVED, radius: SIGNUP_RADIUS_MAX } }).ok).toBe(true);
  });

  it("refuses a move over the cap, accepts one just under", () => {
    // 1° latitude ≈ 111,195 m.
    const step = (meters: number) => ({ ...SAVED, latitude: SAVED.latitude + meters / 111195 });
    expect(validateOwnerVenueLocation({ saved: SAVED, next: step(OWNER_PIN_MOVE_MAX_METERS - 5) }).ok).toBe(true);
    const far = validateOwnerVenueLocation({ saved: SAVED, next: step(OWNER_PIN_MOVE_MAX_METERS + 5) });
    expect(far).toEqual({ ok: false, code: "moved_too_far", message: VENUE_LOCATION_COPY.movedTooFar });
  });

  it("refuses a (0,0) pin and invalid coordinates", () => {
    expect(validateOwnerVenueLocation({ saved: SAVED, next: { latitude: 0, longitude: 0, radius: 150 } })).toMatchObject({
      ok: false,
      code: "placeholder_pin",
    });
    for (const bad of [
      { latitude: 91, longitude: 0.5, radius: 150 },
      { latitude: 40, longitude: -181, radius: 150 },
      { latitude: Number.NaN, longitude: -74, radius: 150 },
    ]) {
      expect(validateOwnerVenueLocation({ saved: SAVED, next: bad })).toMatchObject({ ok: false, code: "invalid_coordinates" });
    }
  });

  it("refuses any save when the saved pin is missing or (0,0)", () => {
    for (const saved of [
      { latitude: null, longitude: null, radius: 150 },
      { latitude: 0, longitude: 0, radius: 150 },
    ]) {
      expect(validateOwnerVenueLocation({ saved, next: NEAR })).toMatchObject({ ok: false, code: "no_saved_pin" });
    }
  });

  it("D7: an unchanged admin-set radius (600) is kept on a pin-only save", () => {
    const saved = { ...SAVED, radius: 600 };
    expect(validateOwnerVenueLocation({ saved, next: { ...NEAR, radius: 600 } }).ok).toBe(true);
  });

  it("D7: a changed radius outside the range is refused, inside is accepted", () => {
    const saved = { ...SAVED, radius: 600 };
    expect(validateOwnerVenueLocation({ saved, next: { ...NEAR, radius: 601 } })).toMatchObject({
      ok: false,
      code: "radius_out_of_range",
    });
    expect(validateOwnerVenueLocation({ saved: SAVED, next: { ...NEAR, radius: SIGNUP_RADIUS_MIN - 1 } })).toMatchObject({
      ok: false,
      code: "radius_out_of_range",
    });
    expect(validateOwnerVenueLocation({ saved, next: { ...NEAR, radius: 120 } }).ok).toBe(true);
  });

  it("refuses a non-integer radius, even one equal-ish to the saved value", () => {
    expect(validateOwnerVenueLocation({ saved: SAVED, next: { ...NEAR, radius: 150.5 } })).toMatchObject({
      ok: false,
      code: "invalid_radius",
    });
  });
});

describe("isUsableVenuePin", () => {
  it("is false for null, (0,0), out-of-range and NaN", () => {
    expect(isUsableVenuePin(null, -75)).toBe(false);
    expect(isUsableVenuePin(40, null)).toBe(false);
    expect(isUsableVenuePin(0, 0)).toBe(false);
    expect(isUsableVenuePin(91, 10)).toBe(false);
    expect(isUsableVenuePin(Number.NaN, 10)).toBe(false);
  });
  it("is true for a real pin", () => {
    expect(isUsableVenuePin(40.7128, -74.006)).toBe(true);
  });
});
