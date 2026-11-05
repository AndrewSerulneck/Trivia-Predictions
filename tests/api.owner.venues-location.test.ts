import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/signup-price-copy-and-partner-geofence-plan.md Phase 2 — GET/PATCH /api/owner/venues/location
// and GET /api/owner/maps-key. Owner auth and "the venue is theirs" come BEFORE any read or write.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  updateResult: vi.fn(),
  eq: vi.fn(),
  publicKey: vi.fn(),
  browserKey: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/googleMapsKeys", () => ({
  publicBrowserGoogleMapsKey: mocks.publicKey,
  browserGoogleMapsKey: mocks.browserKey,
  serverGoogleMapsKey: () => "server-key-never",
}));
vi.mock("@/lib/supabaseAdmin", () => {
  const from = () => {
    let updating = false;
    const chain = {
      select: (columns: string) => {
        mocks.select(columns);
        return chain;
      },
      update: (values: Record<string, unknown>) => {
        updating = true;
        mocks.update(values);
        return chain;
      },
      eq: (column: string, value: string) => {
        mocks.eq(column, value);
        return updating ? mocks.updateResult() : chain;
      },
      maybeSingle: () => mocks.maybeSingle(),
    };
    return chain;
  };
  return { supabaseAdmin: { from } };
});

import { createOwnerVenueAddressToken } from "@/lib/ownerVenueAddress";
import { GET, PATCH } from "@/app/api/owner/venues/location/route";
import { GET as MAPS_KEY_GET } from "@/app/api/owner/maps-key/route";

const URL_BASE = "http://localhost/api/owner/venues/location";
// decimal columns can come back as strings — the route must cope.
const ROW = { id: "venue-1", name: "The Pour House", latitude: "40.71280000", longitude: "-74.00600000", radius: 150 };
const ADDRESS = { street: "10 Main St", city: "Boston", state: "MA", zipCode: "02108", country: "United States", latitude: 42.36, longitude: -71.06, placeId: "new-place" };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const NEAR = { latitude: 40.7137, longitude: -74.006 };

const patch = (body: unknown) =>
  new Request(URL_BASE, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("owner venue location route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SESSION_SECRET", "test-address-secret");
    mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
    mocks.maybeSingle.mockResolvedValue({ data: ROW, error: null });
    mocks.updateResult.mockResolvedValue({ error: null });
  });

  it("no session → 401, nothing read", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    expect((await GET(new Request(`${URL_BASE}?venueId=venue-1`))).status).toBe(401);
    expect((await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 150 }))).status).toBe(401);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("another owner's venue → 403 with no DB call", async () => {
    expect((await GET(new Request(`${URL_BASE}?venueId=venue-9`))).status).toBe(403);
    expect((await PATCH(patch({ venueId: "venue-9", ...NEAR, radius: 150 }))).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("GET returns the venue's pin and radius as numbers, no-store", async () => {
    const res = await GET(new Request(`${URL_BASE}?venueId=venue-1`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      venue: { id: "venue-1", name: "The Pour House", latitude: 40.7128, longitude: -74.006, radius: 150, address: "" },
    });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith("id", "venue-1");
  });

  it("PATCH happy path writes latitude, longitude and radius only, and logs one audit line", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 120 }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ latitude: 40.7137, longitude: -74.006, radius: 120 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toMatch(/^\[OwnerVenueLocation\] updated venue=venue-1 moved_m=100 radius=150->120$/);
    info.mockRestore();
  });

  it("refuses a move of more than 1 km", async () => {
    const res = await PATCH(patch({ venueId: "venue-1", latitude: 40.73, longitude: -74.006, radius: 150 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "moved_too_far" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses (0,0)", async () => {
    const res = await PATCH(patch({ venueId: "venue-1", latitude: 0, longitude: 0, radius: 150 }));
    expect(await res.json()).toMatchObject({ code: "placeholder_pin" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps an admin-set radius of 600 when unchanged", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...ROW, radius: 600 }, error: null });
    const res = await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 600 }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ radius: 600 }));
  });

  it("refuses a radius changed to 600, accepts one changed to 120", async () => {
    const bad = await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 600 }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "radius_out_of_range" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 120 }))).status).toBe(200);
  });

  it("refuses a non-integer or non-number radius", async () => {
    expect(await (await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 120.5 }))).json()).toMatchObject({
      code: "invalid_radius",
    });
    expect((await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: "120" }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("atomically relocates the address and pin over 1 km while retaining a legacy radius", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...ROW, radius: 600 }, error: null });
    const addressToken = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    const res = await PATCH(patch({ venueId: "venue-1", latitude: ADDRESS.latitude, longitude: ADDRESS.longitude, radius: 600, addressToken, name: "forged", street: "forged" }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ latitude: ADDRESS.latitude, longitude: ADDRESS.longitude, radius: 600,
      street: "10 Main St", address: "10 Main St, Boston, MA 02108, United States", city: "Boston", state: "MA", zip_code: "02108",
      country: "United States", place_id: "new-place", county: null, region: null });
    expect(await res.json()).toMatchObject({ venue: { address: "10 Main St, Boston, MA 02108, United States", radius: 600 } });
  });

  it("invalid, expired or other-scope address tokens cannot authorize relocation", async () => {
    const wrongOwner = createOwnerVenueAddressToken("other", "venue-1", ADDRESS);
    const wrongVenue = createOwnerVenueAddressToken("owner-1", "other", ADDRESS);
    vi.useFakeTimers();
    const expired = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    vi.advanceTimersByTime(30 * 60 * 1000);
    for (const addressToken of ["forged", wrongOwner, wrongVenue, expired, null]) {
      expect((await PATCH(patch({ venueId: "venue-1", latitude: ADDRESS.latitude, longitude: ADDRESS.longitude, radius: 150, addressToken }))).status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still caps pin adjustments relative to the selected address and enforces radius rules", async () => {
    const addressToken = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    expect((await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 150, addressToken }))).status).toBe(400);
    expect((await PATCH(patch({ venueId: "venue-1", latitude: ADDRESS.latitude, longitude: ADDRESS.longitude, radius: 600, addressToken }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await PATCH(patch({ venueId: "venue-1", latitude: ADDRESS.latitude + 0.0001, longitude: ADDRESS.longitude, radius: 200, addressToken }))).status).toBe(200);
  });

  it("a signed address cannot turn a system placeholder into an ordinary venue", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...ROW, latitude: 0, longitude: 0 }, error: null });
    const addressToken = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    expect((await PATCH(patch({ venueId: "venue-1", latitude: ADDRESS.latitude, longitude: ADDRESS.longitude, radius: 150, addressToken }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("a database error is a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateResult.mockResolvedValue({ error: { message: "boom: secret detail" } });
    const res = await PATCH(patch({ venueId: "venue-1", ...NEAR, radius: 150 }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});

describe("owner maps-key route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
  });

  it("no session → 401, no key", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(new Response("{}", { status: 401 }));
    expect((await MAPS_KEY_GET(new Request("http://localhost/api/owner/maps-key"))).status).toBe(401);
    expect(mocks.publicKey).not.toHaveBeenCalled();
  });

  it("serves the browser key", async () => {
    mocks.publicKey.mockReturnValue("browser-key");
    const res = await MAPS_KEY_GET(new Request("http://localhost/api/owner/maps-key"));
    expect(await res.json()).toEqual({ ok: true, apiKey: "browser-key" });
    expect(mocks.browserKey).not.toHaveBeenCalled();
  });

  it("503 when the browser key is unset — never the server key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.publicKey.mockReturnValue("");
    const res = await MAPS_KEY_GET(new Request("http://localhost/api/owner/maps-key"));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("server-key-never");
  });
});
