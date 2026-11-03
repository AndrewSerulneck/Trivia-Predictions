// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, forwardRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeofenceEditor, pinLabel } from "@/components/admin/GeofenceEditor";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import { SIGNUP_RADIUS_MAX, SIGNUP_RADIUS_MIN, SIGNUP_RADIUS_PRESETS } from "@/lib/selfServeSignup";

// venue-activation Phase 5 (docs/venue-activation-map-radius-plan.md). Phase 3's
// as-built notes describe an 8-test throwaway jsdom probe, verified then
// deleted, with instructions to recreate it here. VenueMapPicker calls
// /api/admin/maps-key on mount, so it is replaced by a stub (below) whose one
// button stands in for a pin drag — the real map is never exercised by this
// file (that's the device checklist's job); this file covers GeofenceEditor's own wiring:
// dial -> onChange with pin/source preserved, the no-pin disabled/placeholder
// state, Advanced commit parsing, GPS success/denied, hideAdvanced, and the
// pinLabel copy matrix.

// Map stub: the real VenueMapPicker needs Google Maps. A "Drag pin" button stands in for a pin drag
// so the radius-intent tests below can prove a drag never calls onRadiusChange (plan Phase 5).
vi.mock("@/components/admin/VenueMapPicker", () => ({
  VenueMapPicker: forwardRef<unknown, { onChange: (lat: number, lng: number) => void }>(function MapStub(props, _ref) {
    return createElement("button", { type: "button", onClick: () => props.onChange(40.71, -74.01) }, "Drag pin");
  }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: "Maps key unavailable in tests." }),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Props = {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  source: PinSource;
  onChange: (value: GeofenceEditorValue) => void;
  onRadiusChange?: (radius: number) => void;
  disabled?: boolean;
  hideAdvanced?: boolean;
};

function renderEditor(overrides: Partial<Props> & { onChange: (value: GeofenceEditorValue) => void }) {
  const props: Props = {
    latitude: 40.7,
    longitude: -74.0,
    radius: 150,
    source: "lookup",
    ...overrides,
  };
  return render(createElement(GeofenceEditor, props));
}

describe("GeofenceEditor", () => {
  it("dragging the dial (via arrow key) emits the pin unmoved with the new radius", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    const slider = await screen.findByRole("slider", { name: "Geofence radius" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ lat: 40.7, lng: -74.0, radius: 175, source: "lookup" });
  });

  it("disables the dial and shows the placeholder when there is no pin yet", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange, latitude: null, longitude: null, source: "none" });
    expect(screen.getByText("The map appears once there's a pin")).not.toBeNull();
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Advanced commits source: manual for a valid coordinate pair", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "41.5" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-73.5" } });
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ lat: 41.5, lng: -73.5, radius: 150, source: "manual" });
  });

  it("Advanced ignores unparseable input", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "-" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Advanced ignores out-of-range input", async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-73.5" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("GPS success emits source: gps", async () => {
    const onChange = vi.fn();
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 42.1, longitude: -71.1, accuracy: 12 },
      } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    renderEditor({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith({ lat: 42.1, lng: -71.1, radius: 150, source: "gps" });
  });

  it("GPS PERMISSION_DENIED surfaces the blocked-location copy", async () => {
    const onChange = vi.fn();
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    renderEditor({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(await screen.findByText(/Location is blocked for this browser/)).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hideAdvanced removes the Advanced disclosure", () => {
    renderEditor({ onChange: vi.fn(), hideAdvanced: true });
    expect(screen.queryByRole("button", { name: /Advanced/ })).toBeNull();
  });

  describe("onRadiusChange (owner Venue Location, plan Phase 5)", () => {
    const signupRange = { min: SIGNUP_RADIUS_MIN, max: SIGNUP_RADIUS_MAX, presets: SIGNUP_RADIUS_PRESETS };

    it("fires with the chip's value when a size chip is tapped, even when the shown radius is already that size", () => {
      const onChange = vi.fn();
      const onRadiusChange = vi.fn();
      // Stored 600 m on a 50–200 dial: the editor shows 200, and the 200 chip must still count as a pick.
      render(createElement(GeofenceEditor, { latitude: 40.7, longitude: -74.0, radius: 600, source: "existing", onChange, onRadiusChange, ...signupRange }));
      fireEvent.click(screen.getByRole("button", { name: /Patio and parking/ }));
      expect(onRadiusChange).toHaveBeenCalledWith(200);
      expect(onChange).toHaveBeenCalledWith({ lat: 40.7, lng: -74.0, radius: 200, source: "existing" });
    });

    it("fires when the dial moves", async () => {
      const onRadiusChange = vi.fn();
      renderEditor({ onChange: vi.fn(), onRadiusChange });
      fireEvent.keyDown(await screen.findByRole("slider", { name: "Geofence radius" }), { key: "ArrowRight" });
      expect(onRadiusChange).toHaveBeenCalledWith(175);
    });

    it("never fires for a map drag", () => {
      const onChange = vi.fn();
      const onRadiusChange = vi.fn();
      renderEditor({ onChange, onRadiusChange });
      fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
      expect(onChange).toHaveBeenCalledWith({ lat: 40.71, lng: -74.01, radius: 150, source: "map" });
      expect(onRadiusChange).not.toHaveBeenCalled();
    });

    it("never fires for Use my current location", async () => {
      const onChange = vi.fn();
      const onRadiusChange = vi.fn();
      const getCurrentPosition = vi.fn((success: PositionCallback) => {
        success({ coords: { latitude: 42.1, longitude: -71.1, accuracy: 12 } } as GeolocationPosition);
      });
      vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
      renderEditor({ onChange, onRadiusChange });
      fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(onRadiusChange).not.toHaveBeenCalled();
    });

    it("never fires for Advanced lat/long entry", () => {
      const onChange = vi.fn();
      const onRadiusChange = vi.fn();
      renderEditor({ onChange, onRadiusChange });
      fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
      fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "41.5" } });
      expect(onChange).toHaveBeenCalled();
      expect(onRadiusChange).not.toHaveBeenCalled();
    });
  });

  it("pinLabel covers all seven branches", () => {
    expect(pinLabel(false, "none", null)).toBe("No pin yet");
    expect(pinLabel(true, "gps", null)).toBe("Pin set from your phone");
    expect(pinLabel(true, "gps", 12.4)).toBe("Pin set from your phone (±12 m)");
    expect(pinLabel(true, "map", null)).toBe("Pin placed by hand on the map");
    expect(pinLabel(true, "manual", null)).toBe("Pin set from typed coordinates");
    expect(pinLabel(true, "existing", null)).toBe("Pin already on file");
    expect(pinLabel(true, "lookup", null)).toBe("Pin set from the address lookup");
  });
});
