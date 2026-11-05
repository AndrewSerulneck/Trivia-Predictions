// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, forwardRef, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";

// Venue Location page behavior (docs/signup-price-copy-and-partner-geofence-plan.md Phase 5).
// Uses the REAL GeofenceEditor + RadiusDial; the preview keeps the actual saved radius.
// Only the Google map is stubbed: its "Drag pin" button
// calls the editor's map-drag handler the way a real drag does.

// One stable router object, like Next's: the page's effects depend on `router`.
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/owner/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/admin/VenueMapPicker", () => ({
  VenueMapPicker: forwardRef<unknown, { latitude: number; longitude: number; radius: number; readOnly?: boolean; onChange: (lat: number, lng: number) => void }>(
    function MapStub(props, _ref) {
      return createElement(
        "button",
        { type: "button", disabled: props.readOnly, "data-radius": props.radius, "data-latitude": props.latitude, "data-longitude": props.longitude, onClick: () => props.onChange(props.latitude + 0.001, props.longitude) },
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
let stored: { latitude: number | null; longitude: number | null; radius: number | null };
let patchBodies: Array<Record<string, unknown>>;
let addressBodies: Array<Record<string, unknown>>;
const NEW_ADDRESS = { street: "10 Main St", city: "Boston", state: "MA", zipCode: "02108", country: "United States", latitude: 42.36, longitude: -71.06, placeId: "new-place" };
const NEW_LABEL = "10 Main St, Boston, MA 02108, United States";

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  patchBodies = [];
  addressBodies = [];
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
      if (url === "/api/owner/venues/address") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        addressBodies.push(body);
        return body.placeId ? json({ ok: true, details: NEW_ADDRESS, addressToken: "signed-test-selection" })
          : json({ ok: true, predictions: [{ placeId: "new-place", fullText: NEW_LABEL }] });
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
  it.each(["pin", "radius"])("closing preserves unsaved %s changes and Save still works", async (change) => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    await renderPage();
    const map = screen.getByRole("button", { name: "Drag pin" }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: change === "pin" ? "Drag pin" : /Patio and parking/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(map.disabled).toBe(true);
    expect((save() as HTMLButtonElement).disabled).toBe(false);
    expect(patchBodies).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit location & geofence" }));
    expect(screen.getByRole("button", { name: "Drag pin" })).toBe(map);
    expect(map.getAttribute("data-radius")).toBe(change === "pin" ? "600" : "200");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(save());
    await screen.findByText("Saved.", { exact: true });
    expect(patchBodies[0]?.radius).toBe(change === "pin" ? 600 : 200);
  });

  it("shows the saved circle before Edit, with mutation locked, both paragraphs absent and Save disabled", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    render(createElement(OwnerVenueLocationPage));
    const edit = await screen.findByRole("button", { name: "Edit location & geofence" });
    const map = screen.getByRole("button", { name: "Drag pin" }) as HTMLButtonElement;
    expect(map.disabled).toBe(true);
    expect(map.getAttribute("data-radius")).toBe("600");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText(/Locked so a stray tap|Players can't join/)).toBeNull();
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(edit);
    expect(screen.getByRole("button", { name: "Drag pin" })).toBe(map);
    expect(map.disabled).toBe(false);
    expect(map.getAttribute("data-radius")).toBe("600");
    expect(patchBodies).toHaveLength(0);
  });

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


describe("Venue Location usability Phase 2", () => {
  it("keeps only the map and Geofence Size controls after Edit, without the pin-details box", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    render(createElement(OwnerVenueLocationPage));
    const edit = await screen.findByRole("button", { name: "Edit location & geofence" });
    expect(screen.queryByText("Pin already on file")).toBeNull();
    fireEvent.click(edit);
    expect(screen.getByText("Geofence size *")).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Geofence radius" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Drag pin" })).not.toBeNull();
    expect(screen.queryByText(/Pin already on file|Drag the pin to the door|Standing inside the venue|40\.70000/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Check/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Use my current location/ })).toBeNull();
    expect(patchBodies).toHaveLength(0);
  });

  const switchTo = (name: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
    fireEvent.click(screen.getByRole("option", { name }));
  };

  it("uses the venue heading as the only selector and keeps it available after a load failure", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    venueList = [VENUE, VENUE_B];
    locationGetFails = true;
    render(createElement(OwnerVenueLocationPage));
    await screen.findByText("Couldn't load your venue location.");
    const selector = screen.getByRole("button", { name: "Select venue" });
    expect(screen.getAllByText("Test Bar")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2 }).contains(selector)).toBe(true);
    locationGetFails = false;
    switchTo("Other Bar");
    await screen.findByRole("button", { name: "Edit location & geofence" });
    expect(screen.getAllByText("Other Bar")).toHaveLength(1);
  });

  it.each([25, 50, 150, 200, 600, null])("previews stored %s without GPS or writes", async (radius) => {
    stored = { latitude: 40.7, longitude: -74, radius };
    const gps = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: gps } });
    render(createElement(OwnerVenueLocationPage));
    await screen.findByRole("button", { name: "Edit location & geofence" });
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-radius")).toBe(String(radius ?? 150));
    expect(screen.queryByRole("button", { name: /Use my current location/ })).toBeNull();
    expect(gps).not.toHaveBeenCalled();
    expect(patchBodies).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([[null, null], [0, 0]])("keeps unusable pin %s/%s in the support state", async (latitude, longitude) => {
    stored = { latitude, longitude, radius: 150 };
    render(createElement(OwnerVenueLocationPage));
    await screen.findByText(/email support/i);
    expect(screen.queryByRole("button", { name: "Drag pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit location & geofence" })).toBeNull();
    expect(patchBodies).toHaveLength(0);
  });

  it("drops the old preview immediately, ignores a late GET, and locks the newly selected venue", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    venueList = [VENUE, VENUE_B];
    await renderPage();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    let resolveOld!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).includes("venueId=venue-2")) return new Promise<Response>((resolve) => { resolveOld = resolve; });
      return originalFetch(input, init);
    });
    switchTo("Other Bar");
    expect(screen.queryByRole("button", { name: "Drag pin" })).toBeNull();
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    stored = { latitude: 40.71, longitude: -74.01, radius: 50 };
    switchTo("Test Bar");
    await screen.findByRole("button", { name: "Edit location & geofence" });
    await act(async () => resolveOld(json({ ok: true, venue: { latitude: 41, longitude: -75, radius: 200 } }) as Response));
    const map = screen.getByRole("button", { name: "Drag pin" }) as HTMLButtonElement;
    expect(map.disabled).toBe(true);
    expect(map.getAttribute("data-radius")).toBe("50");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Test Bar");
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it.each(["venues", "location", "save"])("recovers both auth codes from %s", async (route) => {
    for (const code of ["no_session", "no_venue"]) {
      stored = { latitude: 40.7, longitude: -74, radius: 600 };
      const originalFetch = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation((input, init) => {
        const matches = route === "venues" ? input === "/api/owner/venues"
          : route === "save" ? init?.method === "PATCH" : String(input).includes("/location?");
        if (matches) return Promise.resolve({ ok: false, status: 401, json: async () => ({ code }) } as Response);
        return originalFetch(input, init);
      });
      render(createElement(OwnerVenueLocationPage));
      if (route === "save") {
        fireEvent.click(await screen.findByRole("button", { name: "Edit location & geofence" }));
        fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
        fireEvent.click(save());
      }
      await waitFor(() => expect(router.push).toHaveBeenLastCalledWith(ownerAuthRecoveryPath(code)));
      cleanup();
      vi.mocked(fetch).mockImplementation(originalFetch);
    }
  });

  it("locks controls during save and preserves a failed draft for retry", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    venueList = [VENUE, VENUE_B];
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    let rejectSave!: (error: Error) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectSave = reject; }));
    fireEvent.click(save());
    expect((screen.getByRole("button", { name: "Drag pin" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Select venue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("slider").getAttribute("aria-disabled")).toBe("true");
    await act(async () => rejectSave(new Error("Offline")));
    await screen.findByText("Offline");
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-radius")).toBe("600");
    expect((save() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save());
    await screen.findByText("Saved.", { exact: true });
    expect(patchBodies[0]?.radius).toBe(600);
  });
});


describe("owner Change address", () => {
  const openAndSearch = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Change address" }));
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "10 Main St Boston" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
  };
  const selectAddress = async () => {
    await openAndSearch();
    fireEvent.click(await screen.findByRole("button", { name: NEW_LABEL }));
    await screen.findByRole("button", { name: "Undo" });
  };

  it("does no lookup on entry, opening, typing or closing; search is explicit", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    render(createElement(OwnerVenueLocationPage));
    const open = await screen.findByRole("button", { name: "Change address" });
    expect(screen.queryByLabelText("New address")).toBeNull();
    fireEvent.click(open);
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "10 Main St" } });
    expect(addressBodies).toHaveLength(0);
    fireEvent.click(open);
    expect(screen.queryByLabelText("New address")).toBeNull();
    expect(addressBodies).toHaveLength(0);
    expect(patchBodies).toHaveLength(0);
  });

  it("previews the new pin, retains radius 600, then saves the signed selection and says only Saved.", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    render(createElement(OwnerVenueLocationPage));
    await selectAddress();
    const map = screen.getByRole("button", { name: "Drag pin" });
    expect(map.getAttribute("data-latitude")).toBe("42.36");
    expect(map.getAttribute("data-radius")).toBe("600");
    expect(patchBodies).toHaveLength(0);
    expect(addressBodies).toHaveLength(2);
    expect(addressBodies[0]?.sessionToken).toBe(addressBodies[1]?.sessionToken);
    fireEvent.click(save());
    await screen.findByText("Saved.", { exact: true });
    expect(patchBodies[0]).toEqual({ venueId: VENUE.id, latitude: 42.36, longitude: -71.06, radius: 600, addressToken: "signed-test-selection" });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(addressBodies).toHaveLength(2);
  });

  it("Undo restores the pin draft from before selection, preserving other unsaved edits", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    const before = screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude");
    await selectAddress();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude")).toBe(before);
    fireEvent.click(save());
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).not.toHaveProperty("addressToken");
    expect(patchBodies[0]?.radius).toBe(600);
  });

  it("preserves the selection on failed save and retries without another lookup", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    patchFails = true;
    render(createElement(OwnerVenueLocationPage));
    await selectAddress();
    fireEvent.click(save());
    await screen.findByText("Couldn't save your venue location.");
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();
    patchFails = false;
    fireEvent.click(save());
    await screen.findByText("Saved.", { exact: true });
    expect(addressBodies).toHaveLength(2);
    expect(patchBodies[0]).toEqual(patchBodies[1]);
  });

  it("surfaces a non-JSON lookup failure and keeps the original pin unchanged", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    render(createElement(OwnerVenueLocationPage));
    await screen.findByRole("button", { name: "Change address" });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new Error("html"); } } as unknown as Response);
    await openAndSearch();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude")).toBe("40.7");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(patchBodies).toHaveLength(0);
  });

  it("ignores a delayed selection after switching venues", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    venueList = [VENUE, VENUE_B];
    render(createElement(OwnerVenueLocationPage));
    await openAndSearch();
    await screen.findByRole("button", { name: NEW_LABEL });
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: NEW_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
    fireEvent.click(screen.getByRole("option", { name: VENUE_B.name }));
    await screen.findByRole("button", { name: "Edit location & geofence" });
    await act(async () => finish(json({ ok: true, details: NEW_ADDRESS, addressToken: "late" }) as Response));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude")).toBe("40.7");
  });

  it("asks before discarding an address selection on venue switch", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    venueList = [VENUE, VENUE_B];
    const confirm = vi.fn(() => false); vi.stubGlobal("confirm", confirm);
    render(createElement(OwnerVenueLocationPage));
    await selectAddress();
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
    fireEvent.click(screen.getByRole("option", { name: VENUE_B.name }));
    expect(confirm).toHaveBeenCalledWith("Discard your unsaved location changes?");
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude")).toBe("42.36");
  });

  it.each(["no_session", "no_venue"])("recovers %s from address search", async (code) => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    render(createElement(OwnerVenueLocationPage));
    await screen.findByRole("button", { name: "Change address" });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ code }) } as Response);
    await openAndSearch();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(ownerAuthRecoveryPath(code)));
  });
  it("disables Save during lookup and Undo preserves pin edits made while details were loading", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 600 };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    await openAndSearch();
    await screen.findByRole("button", { name: NEW_LABEL });
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: NEW_LABEL }));
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Drag pin" }));
    const before = screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude");
    await act(async () => finish(json({ ok: true, details: NEW_ADDRESS, addressToken: "selected" }) as Response));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Drag pin" }).getAttribute("data-latitude")).toBe(before);
    expect(patchBodies).toHaveLength(0);
  });

  it("ignores a stale search after editing the query and reports an empty explicit search", async () => {
    stored = { latitude: 40.7, longitude: -74, radius: 150 };
    render(createElement(OwnerVenueLocationPage));
    await screen.findByRole("button", { name: "Change address" });
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await openAndSearch();
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "Different address" } });
    await act(async () => finish(json({ ok: true, predictions: [{ placeId: "new-place", fullText: NEW_LABEL }] }) as Response));
    expect(screen.queryByRole("button", { name: NEW_LABEL })).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: true, predictions: [] }) as Response);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("No addresses found.");
    expect(patchBodies).toHaveLength(0);
  });

});
