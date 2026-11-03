// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, forwardRef, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Venue Location page behavior (docs/signup-price-copy-and-partner-geofence-plan.md Phase 5).
// Uses the REAL GeofenceEditor + RadiusDial, so a pin drag really emits the dial's clamped radius
// (200 for a stored 600) through onChange. Only the Google map is stubbed: its "Drag pin" button
// calls the editor's map-drag handler the way a real drag does.

// One stable router object, like Next's: the page's effects depend on `router`.
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/owner/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/admin/VenueMapPicker", () => ({
  VenueMapPicker: forwardRef<unknown, { latitude: number; longitude: number; onChange: (lat: number, lng: number) => void }>(
    function MapStub(props, _ref) {
      return createElement(
        "button",
        { type: "button", onClick: () => props.onChange(props.latitude + 0.001, props.longitude) },
        "Drag pin",
      );
    },
  ),
}));

const { default: OwnerVenueLocationPage } = await import("@/app/owner/venue-location/page");

const VENUE = { id: "venue-1", name: "Test Bar" };
const VENUE_B = { id: "venue-2", name: "Other Bar" };
let venueList: Array<{ id: string; name: string }> = [VENUE];
let venuesStatus = 200;
let locationGetFails = false;
let patchFails = false;
let stored: { latitude: number; longitude: number; radius: number | null };
let patchBodies: Array<Record<string, unknown>>;

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  patchBodies = [];
  venueList = [VENUE];
  venuesStatus = 200;
  locationGetFails = false;
  patchFails = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/owner/venues") {
        if (venuesStatus !== 200) return { ok: false, status: venuesStatus, json: async () => ({ ok: false }) };
        return json({ ok: true, venues: venueList });
      }
      if (url.startsWith("/api/owner/venues/location") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patchBodies.push(body);
        if (patchFails) return { ok: false, status: 504, json: async () => JSON.parse("<html>") as unknown };
        return json({
          ok: true,
          venue: { id: String(body.venueId), name: VENUE.name, latitude: body.latitude, longitude: body.longitude, radius: body.radius },
        });
      }
      if (url.startsWith("/api/owner/venues/location")) {
        // A gateway error page: not JSON, so res.json() throws.
        if (locationGetFails) return { ok: false, status: 502, json: async () => JSON.parse("<html>") as unknown };
        const id = new URL(url, "http://x").searchParams.get("venueId") ?? VENUE.id;
        return json({ ok: true, venue: { id, name: VENUE.name, ...stored } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Opens the page and taps through the editor's lock, as a partner does.
const renderPage = async () => {
  render(createElement(OwnerVenueLocationPage));
  fireEvent.click(await screen.findByRole("button", { name: /Edit location & geofence/ }));
};
const dialValue = () => screen.getByRole("slider", { name: "Geofence radius" }).getAttribute("aria-valuenow");
const save = () => screen.getByRole("button", { name: "Save location" });

describe("owner Venue Location page radius intent", () => {
  it("stored 600 m: a pin drag saves radius 600, not the dial's 200", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: 600 };
    await renderPage();
    expect(screen.getByText(/Your geofence is 600 m, set by Hightop/)).not.toBeNull();
    expect(dialValue()).toBe("200");
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    fireEvent.click(save());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]?.radius).toBe(600);
  });

  it("stored 600 m: tapping the 200 m chip saves 200 and hides the 'set by Hightop' note", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: 600 };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Patio and parking/ }));
    expect(screen.queryByText(/set by Hightop/)).toBeNull();
    fireEvent.click(save());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]?.radius).toBe(200);
  });

  it("stored null radius: the editor shows 150, opening alone doesn't enable Save, and a pin drag saves 150", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: null };
    await renderPage();
    expect(dialValue()).toBe("150");
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    fireEvent.click(save());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]?.radius).toBe(150);
  });
});

describe("owner Venue Location page load and venue switching (Phase 6)", () => {
  it("a 500 from /api/owner/venues shows an error with Try again, not 'No venue found'; Try again recovers", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: 150 };
    venuesStatus = 500;
    render(createElement(OwnerVenueLocationPage));
    expect(await screen.findByText("Couldn't load your venues.")).not.toBeNull();
    expect(screen.queryByText(/No venue found/)).toBeNull();
    venuesStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Edit location & geofence/ })).not.toBeNull();
    expect(screen.queryByText("Couldn't load your venues.")).toBeNull();
  });

  it("an empty successful list says 'No venue found'", async () => {
    venueList = [];
    render(createElement(OwnerVenueLocationPage));
    expect(await screen.findByText(/No venue found/)).not.toBeNull();
  });

  describe("switching venues with an unsaved edit", () => {
    const switchTo = (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
      fireEvent.click(screen.getByRole("option", { name }));
    };

    it("asks first; Cancel keeps the venue and its edit, OK switches", async () => {
      stored = { latitude: 40.7, longitude: -74.0, radius: 150 };
      venueList = [VENUE, VENUE_B];
      const confirm = vi.fn(() => false);
      vi.stubGlobal("confirm", confirm);
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
      switchTo("Other Bar");
      expect(confirm).toHaveBeenCalledWith("Discard your unsaved location changes?");
      expect(screen.getByRole("button", { name: "Save location" })).not.toBeNull();
      confirm.mockReturnValue(true);
      switchTo("Other Bar");
      expect(confirm).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(screen.getByRole("button", { name: /Edit location & geofence/ })).not.toBeNull());
    });

    it("does not ask when nothing was edited", async () => {
      stored = { latitude: 40.7, longitude: -74.0, radius: 150 };
      venueList = [VENUE, VENUE_B];
      const confirm = vi.fn(() => false);
      vi.stubGlobal("confirm", confirm);
      await renderPage();
      switchTo("Other Bar");
      expect(confirm).not.toHaveBeenCalled();
    });
  });
});

describe("owner Venue Location page error recovery (Phase 8)", () => {
  it("a non-JSON 502 on the location load shows our copy and Try again, which recovers", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: 150 };
    locationGetFails = true;
    render(createElement(OwnerVenueLocationPage));
    expect(await screen.findByText("Couldn't load your venue location.")).not.toBeNull();
    expect(screen.queryByText(/JSON/)).toBeNull();
    locationGetFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Edit location & geofence/ })).not.toBeNull();
  });

  it("a non-JSON 504 on save shows our save copy, not a parse error", async () => {
    stored = { latitude: 40.7, longitude: -74.0, radius: 150 };
    patchFails = true;
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    fireEvent.click(save());
    expect(await screen.findByText("Couldn't save your venue location.")).not.toBeNull();
    expect(screen.queryByText(/JSON/)).toBeNull();
  });
});
