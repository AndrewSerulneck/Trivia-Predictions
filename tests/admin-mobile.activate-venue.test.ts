import { describe, expect, it } from "vitest";
// Phase 2 hoisted RADIUS_PRESETS into lib/geofenceEditor.ts and Phase 4 dropped
// ActivateVenueFlow's compatibility re-export along with its preset chips — the
// dial in GeofenceEditor renders them now.
import { RADIUS_PRESETS } from "@/lib/geofenceEditor";
import {
  BLANK_VENUE_FORM,
  DEFAULT_VENUE_RADIUS,
  buildVenuePayload,
  validateVenueForm,
  venueToForm,
  type VenueFormState,
} from "@/lib/adminVenueForm";
import type { Venue } from "@/types";

// admin-mobile Phase 4. The mobile Activate-a-Venue flow is a shorter
// *presentation* of the venue form, not a shorter validation — these pin that
// contract, since the flow only ever shows a subset of the fields on screen.

const completeForm: VenueFormState = {
  ...BLANK_VENUE_FORM,
  name: "Murphy's Tap House",
  street: "1200 Main St",
  city: "Denver",
  state: "CO",
  zipCode: "80202",
  country: "United States",
  latitude: "39.7392",
  longitude: "-104.9903",
  radius: "150",
};

describe("validateVenueForm", () => {
  it("accepts the minimum the activation flow collects", () => {
    expect(validateVenueForm(completeForm)).toBeNull();
  });

  it("still requires the full address even though the flow fills it in one tap", () => {
    expect(validateVenueForm({ ...completeForm, city: "" })).toBe("City is required.");
    expect(validateVenueForm({ ...completeForm, zipCode: "" })).toBe("ZIP code is required.");
  });

  it("rejects a venue with no pin — the geofence is the whole point", () => {
    expect(validateVenueForm({ ...completeForm, latitude: "", longitude: "" })).toBe(
      "Latitude must be between -90 and 90."
    );
  });

  it("mirrors the server's 25–2000m radius bound", () => {
    expect(validateVenueForm({ ...completeForm, radius: "10" })).toContain("25m and 2000m");
    expect(validateVenueForm({ ...completeForm, radius: "5000" })).toContain("25m and 2000m");
  });
});

describe("geofence presets", () => {
  it("every preset passes server-side radius validation", () => {
    for (const preset of RADIUS_PRESETS) {
      expect(validateVenueForm({ ...completeForm, radius: String(preset.value) })).toBeNull();
    }
  });
});

describe("buildVenuePayload round trip", () => {
  // The mobile flow hides county/region/logoText/iconEmoji behind Advanced (or
  // not at all), so an edit made on a phone must still send them back unchanged
  // rather than blanking what a desktop admin set.
  it("preserves fields the mobile flow never puts on screen", () => {
    const venue: Venue = {
      id: "venue-1",
      name: "Murphy's Tap House",
      street: "1200 Main St",
      city: "Denver",
      state: "CO",
      zipCode: "80202",
      country: "United States",
      county: "Denver County",
      region: "Mountain",
      logoText: "MTH",
      iconEmoji: "🍺",
      latitude: 39.7392,
      longitude: -104.9903,
      radius: 150,
    };

    const payload = buildVenuePayload(venueToForm(venue));
    expect(payload.county).toBe("Denver County");
    expect(payload.region).toBe("Mountain");
    expect(payload.logoText).toBe("MTH");
    expect(payload.iconEmoji).toBe("🍺");
  });

  it("uppercases state and composes the display address label", () => {
    const payload = buildVenuePayload({ ...completeForm, state: "co" });
    expect(payload.state).toBe("CO");
    expect(payload.address).toBe("1200 Main St, Denver, CO 80202, United States");
  });

  it("falls back to the default radius, not a third magic number, on garbage input", () => {
    expect(buildVenuePayload({ ...completeForm, radius: "" }).radius).toBe(DEFAULT_VENUE_RADIUS);
    expect(buildVenuePayload({ ...completeForm, radius: "not-a-number" }).radius).toBe(DEFAULT_VENUE_RADIUS);
    expect(DEFAULT_VENUE_RADIUS).toBe(150);
  });
});
