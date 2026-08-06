// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActivateVenueFlow } from "@/components/admin/mobile/ActivateVenueFlow";
import { VenuesSection } from "@/components/admin/sections/VenuesSection";
import type { Venue } from "@/types";

// venue-activation Phase 5 (docs/venue-activation-map-radius-plan.md). Phase 4's
// as-built notes describe a 5-test throwaway jsdom probe, verified then
// deleted, with instructions to recreate it here: GeofenceEditor is now
// actually mounted on both surfaces (mobile ActivateVenueFlow, desktop
// VenuesSection), the old bare number-box/lat-long inputs and the mobile
// "Adjust pin" bottom sheet are gone, and placeId clearing still tracks pin
// `source` correctly through both call sites' handleGeofenceChange.
//
// VenueMapPicker calls /api/admin/maps-key on mount, so fetch is stubbed to
// fail and park it in its loadError state — no real map is exercised here,
// same as Phase 3's probe.

const venue: Venue = {
  id: "venue-1",
  name: "The Hightop",
  street: "123 Main St",
  city: "Springfield",
  state: "IL",
  zipCode: "62701",
  country: "US",
  latitude: 39.78,
  longitude: -89.65,
  radius: 150,
  placeId: "place-abc",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/admin/maps-key")) {
        return { ok: true, json: async () => ({ ok: false, error: "Maps key unavailable in tests." }) };
      }
      return { ok: true, json: async () => ({ ok: true, item: venue }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivateVenueFlow (mobile) — Phase 4 mount", () => {
  it("edit mode renders the slider at the venue's radius and no old controls", () => {
    render(
      createElement(ActivateVenueFlow, {
        mode: "edit",
        venue,
        busy: false,
        error: "",
        onSubmit: vi.fn(),
        onValidationError: vi.fn(),
        onCancel: vi.fn(),
      })
    );
    const slider = screen.getByRole("slider", { name: "Geofence radius" });
    expect(slider.getAttribute("aria-valuenow")).toBe("150");
    expect(screen.queryByText("Adjust pin on map")).toBeNull();
    expect(screen.queryByLabelText("Custom (m)")).toBeNull();
  });

  it("passes hideAdvanced — only the flow's own Advanced panel is present", () => {
    render(
      createElement(ActivateVenueFlow, {
        mode: "edit",
        venue,
        busy: false,
        error: "",
        onSubmit: vi.fn(),
        onValidationError: vi.fn(),
        onCancel: vi.fn(),
      })
    );
    expect(screen.queryByRole("button", { name: /Advanced — exact coordinates/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Advanced/ })).not.toBeNull();
  });

  it("ArrowRight on the dial then Save submits radius: 175 with the lat/lng unchanged", () => {
    const onSubmit = vi.fn();
    render(
      createElement(ActivateVenueFlow, {
        mode: "edit",
        venue,
        busy: false,
        error: "",
        onSubmit,
        onValidationError: vi.fn(),
        onCancel: vi.fn(),
      })
    );
    fireEvent.keyDown(screen.getByRole("slider", { name: "Geofence radius" }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.radius).toBe(175);
    expect(payload.latitude).toBe(venue.latitude);
    expect(payload.longitude).toBe(venue.longitude);
  });

  it("a dial move keeps source lookup (placeId preserved) while Advanced typing sets manual", () => {
    render(
      createElement(ActivateVenueFlow, {
        mode: "edit",
        venue: { ...venue, placeId: "place-abc" },
        busy: false,
        error: "",
        onSubmit: vi.fn(),
        onValidationError: vi.fn(),
        onCancel: vi.fn(),
      })
    );
    // Dial move: pin summary should still read "on file" provenance since a
    // dial-only move never touches source.
    fireEvent.keyDown(screen.getByRole("slider", { name: "Geofence radius" }), { key: "ArrowRight" });
    expect(screen.getByText("Pin already on file")).not.toBeNull();

    // Now open the flow's own Advanced panel and type a coordinate — that's
    // the "manual" source path, which must clear placeId. This panel's
    // Latitude/Longitude labels have no `for`/id association (unlike
    // GeofenceEditor's own Advanced inputs), so find the input by its
    // preceding label text instead of getByLabelText.
    fireEvent.click(screen.getByRole("button", { name: /^Advanced/ }));
    const latLabel = screen.getByText("Latitude");
    const latInput = latLabel.parentElement?.querySelector("input");
    if (!latInput) throw new Error("Latitude input not found");
    fireEvent.change(latInput, { target: { value: "41.0" } });
    expect(screen.getByText("Pin set from typed coordinates")).not.toBeNull();
  });
});

describe("VenuesSection (desktop) — Phase 4 mount", () => {
  it("GPS button emits source: gps and renders the accuracy label", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 39.9, longitude: -89.6, accuracy: 12 },
      } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    render(
      createElement(VenuesSection, {
        venues: [venue],
        onVenueCreated: vi.fn(),
        onVenueUpdated: vi.fn(),
        onVenueDeleted: vi.fn(),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add Venue" }));
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(await screen.findByText("Pin set from your phone (±12 m)")).not.toBeNull();
  });

  it("create button reads Activate Venue", () => {
    render(
      createElement(VenuesSection, {
        venues: [venue],
        onVenueCreated: vi.fn(),
        onVenueUpdated: vi.fn(),
        onVenueDeleted: vi.fn(),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add Venue" }));
    expect(screen.getByRole("button", { name: "Activate Venue" })).not.toBeNull();
  });
});
