// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeofenceEditor } from "@/components/admin/GeofenceEditor";
import { VenueMapPicker } from "@/components/admin/VenueMapPicker";
import { SIGNUP_RADIUS_PRESETS } from "@/lib/selfServeSignup";

// Real editor + map lifecycle; only Google's API and element sizing are faked.
const map = { panTo: vi.fn(), setZoom: vi.fn(), getZoom: vi.fn(), fitBounds: vi.fn() };
const bounds = { extend: vi.fn() };
const listeners: Record<string, () => void> = {};
const marker = {
  setPosition: vi.fn(), setDraggable: vi.fn(),
  getPosition: vi.fn(() => ({ lat: () => 40.701, lng: () => -74 })),
  addListener: vi.fn((event: string, callback: () => void) => { listeners[event] = callback; }),
};
const circle = { setCenter: vi.fn(), setRadius: vi.fn(), setOptions: vi.fn(), getBounds: vi.fn(() => bounds) };
const constructMap = vi.fn();
const constructMarker = vi.fn();
const constructCircle = vi.fn();
let resize: (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

beforeEach(() => {
  vi.clearAllMocks();
  for (const event of Object.keys(listeners)) delete listeners[event];
  window.google = {
    maps: {
      Map: class { constructor(...args: unknown[]) { constructMap(...args); return map; } },
      Marker: class { constructor(...args: unknown[]) { constructMarker(...args); return marker; } },
      Circle: class { constructor(...args: unknown[]) { constructCircle(...args); return circle; } },
      LatLngBounds: class { constructor() { return bounds; } },
      event: { trigger: vi.fn() },
    },
  } as unknown as typeof window.google;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: typeof resize) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, apiKey: "fake-test-key" }) })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.google;
  delete window.__htcMapsCallback;
  delete window.__htcMapsReadyQueue;
  document.querySelectorAll("script[data-htc-maps]").forEach((script) => script.remove());
});

const base = { latitude: 40.7, longitude: -74, radius: 600, onChange: vi.fn() };
const ready = async () => { await waitFor(() => expect(constructMap).toHaveBeenCalledTimes(1)); };

describe("VenueMapPicker", () => {
  it("reframes an externally relocated pin without another key request or map construction", async () => {
    const { rerender } = render(createElement(VenueMapPicker, { ...base, readOnly: true }));
    await ready();
    act(() => resize([{ contentRect: { width: 300, height: 320 } }]));
    rerender(createElement(VenueMapPicker, { ...base, latitude: 42.36, longitude: -71.06, readOnly: true }));
    expect(circle.setCenter).toHaveBeenLastCalledWith({ lat: 42.36, lng: -71.06 });
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("locks the marker initially, updates it without rebuilding, and blocks stale drag callbacks while locked/saving", async () => {
    const onChange = vi.fn();
    const props = { ...base, onChange };
    const { rerender } = render(createElement(VenueMapPicker, { ...props, readOnly: true }));
    await ready();
    expect(constructMarker).toHaveBeenCalledWith(expect.objectContaining({ draggable: false }));
    expect(screen.queryByText(/Drag the red pin/)).toBeNull();
    act(() => { listeners.dragstart(); listeners.dragend(); });
    expect(onChange).not.toHaveBeenCalled();
    rerender(createElement(VenueMapPicker, { ...props, readOnly: false }));
    expect(marker.setDraggable).toHaveBeenLastCalledWith(true);
    act(() => { listeners.dragstart(); });
    rerender(createElement(VenueMapPicker, { ...props, readOnly: true }));
    act(() => { listeners.dragend(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(marker.setPosition).toHaveBeenLastCalledWith({ lat: 40.7, lng: -74 });
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fits the full initial circle only once a usable size arrives, and defers material dial refits", async () => {
    const { rerender } = render(createElement(VenueMapPicker, base));
    await ready();
    expect(map.fitBounds).not.toHaveBeenCalled();
    act(() => resize([{ contentRect: { width: 0, height: 0 } }]));
    expect(map.fitBounds).not.toHaveBeenCalled();
    act(() => resize([{ contentRect: { width: 300, height: 320 } }]));
    expect(map.fitBounds).toHaveBeenCalledExactlyOnceWith(bounds, 40);
    rerender(createElement(VenueMapPicker, { ...base, radius: 150, radiusEditing: true }));
    expect(circle.setRadius).toHaveBeenLastCalledWith(150);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    rerender(createElement(VenueMapPicker, { ...base, radius: 150, radiusEditing: false }));
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("defaults to an editable marker and emits actual drag coordinates", async () => {
    const onChange = vi.fn();
    render(createElement(VenueMapPicker, { ...base, onChange }));
    await ready();
    expect(constructMarker).toHaveBeenCalledWith(expect.objectContaining({ draggable: true }));
    act(() => { listeners.dragend(); });
    expect(onChange).toHaveBeenCalledWith(40.701, -74);
  });

  it.each(["key503", "network", "sdk"])("shows an honest %s failure without retrying", async (failure) => {
    if (failure === "key503") vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    if (failure === "network") vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    if (failure === "sdk") delete window.google;
    render(createElement(VenueMapPicker, base));
    if (failure === "sdk") {
      await waitFor(() => expect(document.querySelector("script[data-htc-maps]")).not.toBeNull());
      fireEvent.error(document.querySelector("script[data-htc-maps]")!);
    }
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("Map unavailable"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(constructMap).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading map...")).toBeNull();
  });

  it("bounds a stalled SDK load and ignores a late callback", async () => {
    vi.useFakeTimers();
    delete window.google;
    render(createElement(VenueMapPicker, base));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(screen.getByRole("status").textContent).toContain("Map unavailable");
    act(() => window.__htcMapsCallback?.());
    expect(constructMap).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("GeofenceEditor map presentation", () => {
  it("ignores pending GPS results after closing and reopening the shared map editor", async () => {
    let finish!: PositionCallback;
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (success: PositionCallback) => { finish = success; } } });
    const onChange = vi.fn();
    render(createElement(GeofenceEditor, { ...base, onChange, source: "existing", startLocked: true, lockedView: "map" }));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    act(() => finish({ coords: { latitude: 42, longitude: -71, accuracy: 10 } } as GeolocationPosition));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Use my current location/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("closes to a locked preview, preserves the draft and map, restores focus and blocks stale drags", async () => {
    const onChange = vi.fn();
    function Editor() {
      const [radius, setRadius] = useState(600);
      return createElement(GeofenceEditor, {
        ...base, radius, source: "existing", startLocked: true, lockedView: "map", hidePinDetails: true,
        hideAdvanced: true, min: 50, max: 200, presets: SIGNUP_RADIUS_PRESETS,
        onRadiusChange: setRadius, onChange,
      });
    }
    render(createElement(Editor));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    fireEvent.click(screen.getByRole("button", { name: /Patio and parking/ }));
    expect(circle.setRadius).toHaveBeenLastCalledWith(200);
    const changes = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const edit = screen.getByRole("button", { name: "Edit location & geofence" });
    expect(document.activeElement).toBe(edit);
    expect(edit.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(marker.setDraggable).toHaveBeenLastCalledWith(false);
    act(() => { listeners.dragstart(); listeners.dragend(); });
    expect(onChange).toHaveBeenCalledTimes(changes);
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(edit);
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("200");
    expect(marker.setDraggable).toHaveBeenLastCalledWith(true);
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("disables Close while saving and leaves default create controls without a close action", async () => {
    const props = { ...base, source: "existing" as const, startLocked: true, lockedView: "map" as const };
    const { rerender } = render(createElement(GeofenceEditor, props));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    rerender(createElement(GeofenceEditor, { ...props, disabled: true }));
    const close = screen.getByRole("button", { name: "Close" }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.click(close);
    expect(screen.getByRole("slider")).not.toBeNull();
    cleanup();
    render(createElement(GeofenceEditor, { ...base, source: "existing" }));
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("omits partner pin details and map instructions while retaining one editable map and radius controls", async () => {
    const onChange = vi.fn();
    render(createElement(GeofenceEditor, {
      ...base, onChange, source: "existing", startLocked: true, lockedView: "map",
      hidePinDetails: true, hideAdvanced: true, min: 50, max: 200,
    }));
    await ready();
    expect(screen.queryByText(/Pin already on file|Geofence radius:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    expect(screen.queryByText(/Drag the red pin|Drag the pin to the door|Standing inside the venue|40\.70000/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Check/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Use my current location/ })).toBeNull();
    expect(screen.getByRole("slider", { name: "Geofence radius" })).not.toBeNull();
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => listeners.dragend());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 600, source: "map" }));
  });

  it("does not suggest a removed GPS control when the compact map is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(createElement(GeofenceEditor, {
      ...base, source: "existing", startLocked: true, lockedView: "map", hidePinDetails: true, hideAdvanced: true,
    }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Map unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    expect(screen.getByRole("slider")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Use my current location/ })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([25, 50, 150, 200, 600])("shows stored %i m while locked and retains one map across unlocking", async (radius) => {
    const onChange = vi.fn();
    const gps = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: gps } });
    render(createElement(GeofenceEditor, {
      ...base, radius, onChange, source: "existing", startLocked: true, lockedView: "map", min: 50, max: 200,
    }));
    await ready();
    expect(constructCircle).toHaveBeenCalledWith(expect.objectContaining({ radius }));
    expect(screen.getByText(`Geofence radius: ${radius} m`)).not.toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText(/Locked so a stray tap/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    expect(marker.setDraggable).toHaveBeenLastCalledWith(true);
    expect(constructMap).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(gps).not.toHaveBeenCalled();
  });

  it("keeps 600 through pin/GPS edits until an explicit replacement size is selected", async () => {
    const onChange = vi.fn();
    const onRadiusChange = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (success: PositionCallback) => {
      success({ coords: { latitude: 40.702, longitude: -74, accuracy: 10 } } as GeolocationPosition);
    } } });
    function Editor() {
      const [radius, setRadius] = useState(600);
      return createElement(GeofenceEditor, {
        ...base, radius, onChange, source: "existing", startLocked: true, lockedView: "map", min: 50, max: 200,
        presets: SIGNUP_RADIUS_PRESETS,
        onRadiusChange: (value) => { onRadiusChange(value); setRadius(value); },
      });
    }
    render(createElement(Editor));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    act(() => listeners.dragend());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 600, source: "map" }));
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 600, source: "gps" }));
    expect(onRadiusChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Patio and parking/ }));
    expect(onRadiusChange).toHaveBeenCalledExactlyOnceWith(200);
    expect(circle.setRadius).toHaveBeenLastCalledWith(200);
  });

  it("keeps the default locked admin summary free of map loads", () => {
    render(createElement(GeofenceEditor, { ...base, source: "existing", startLocked: true }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Locked so a stray tap/)).not.toBeNull();
  });

  it("keeps the edit action and 600 m draft available after a key failure", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const onChange = vi.fn();
    render(createElement(GeofenceEditor, {
      ...base, onChange, source: "existing", startLocked: true, lockedView: "map", min: 50, max: 200,
    }));
    expect(await screen.findByRole("status")).not.toBeNull();
    expect(screen.getByText("Geofence radius: 600 m")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    expect(screen.getByRole("button", { name: /Use my current location/ })).not.toBeNull();
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("200");
    expect(onChange).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
