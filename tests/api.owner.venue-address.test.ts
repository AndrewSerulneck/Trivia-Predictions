import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), predict: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/lib/geolocation", () => ({ getAddressPredictions: mocks.predict, getAddressDetails: mocks.details }));
import { POST } from "@/app/api/owner/venues/address/route";
import { createOwnerVenueAddressToken, readOwnerVenueAddressToken } from "@/lib/ownerVenueAddress";

const ADDRESS = { street: "10 Main St", city: "Boston", state: "MA", zipCode: "02108", country: "United States", latitude: 42.36, longitude: -71.06, placeId: "new-place" };
const request = (body: unknown) => new Request("http://localhost/api/owner/venues/address", { method: "POST", body: JSON.stringify(body) });
const base = { venueId: "venue-1", sessionToken: "test-session" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-address-signing-secret");
  mocks.auth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
  mocks.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.predict.mockResolvedValue([{ placeId: "new-place", fullText: "10 Main St, Boston", mainText: "10 Main St", secondaryText: "Boston" }]);
  mocks.details.mockResolvedValue(ADDRESS);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("owner address lookup", () => {
  it("authenticates and checks ownership before any limiter or paid lookup", async () => {
    mocks.auth.mockRejectedValueOnce(new Response("{}", { status: 401 }));
    expect((await POST(request({ ...base, query: "Boston" }))).status).toBe(401);
    expect((await POST(request({ ...base, venueId: "other", placeId: "x" }))).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.details).not.toHaveBeenCalled(); expect(mocks.predict).not.toHaveBeenCalled();
  });
  it.each([null, [], { ...base, query: "x".repeat(201) }, { ...base, placeId: "x".repeat(513) }, { ...base, query: "Boston", placeId: "x" }, { ...base, query: "Boston", sessionToken: "invalid token!" }])("rejects malformed input before spending", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.predict).not.toHaveBeenCalled(); expect(mocks.details).not.toHaveBeenCalled();
  });
  it("short queries do not spend a quota slot or Google call", async () => {
    expect(await (await POST(request({ ...base, query: "ab" }))).json()).toEqual({ ok: true, predictions: [] });
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("makes one explicit search, returns at most five results and no Details fan-out", async () => {
    mocks.predict.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ placeId: String(i), fullText: String(i) })));
    const res = await POST(request({ ...base, query: " Boston " }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).predictions).toHaveLength(5);
    expect(mocks.predict).toHaveBeenCalledExactlyOnceWith("Boston", "test-session");
    expect(mocks.limit).toHaveBeenCalledWith(expect.any(Request), "venueAddressSearchOwner", { identity: "owner-1", ignoreIp: true });
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("resolves one selection and signs it for the current owner and venue", async () => {
    const res = await POST(request({ ...base, placeId: "new-place" }));
    const body = await res.json();
    expect(body.details).toEqual(ADDRESS);
    expect(readOwnerVenueAddressToken(body.addressToken, "owner-1", "venue-1")).toEqual(ADDRESS);
    expect(mocks.details).toHaveBeenCalledExactlyOnceWith("new-place", "test-session");
    expect(mocks.limit).toHaveBeenCalledWith(expect.any(Request), "venueAddressDetailsOwner", { identity: "owner-1", ignoreIp: true });
  });
  it.each([{ allowed: false, retryAfterSeconds: 20 }, { allowed: false, retryAfterSeconds: 2, unavailable: true }])("fails closed if the quota is denied or unavailable", async (limit) => {
    mocks.limit.mockResolvedValue(limit);
    const res = await POST(request({ ...base, placeId: "x" }));
    expect(res.status).toBe(limit.unavailable ? 503 : 429);
    expect(res.headers.get("Retry-After")).toBe(String(limit.retryAfterSeconds));
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("does not leak upstream diagnostics or retry failures", async () => {
    mocks.predict.mockRejectedValue(new Error("https://private.example?key=SECRET"));
    const res = await POST(request({ ...base, query: "Boston" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Address search unavailable." });
    expect(mocks.predict).toHaveBeenCalledTimes(1);
  });
  it.each([{ city: "" }, { zipCode: "" }, { latitude: NaN }, { latitude: 0, longitude: 0 }, { country: "Canada" }])("refuses incomplete or invalid provider addresses", async (patch) => {
    mocks.details.mockResolvedValue({ ...ADDRESS, ...patch });
    expect((await POST(request({ ...base, placeId: "new-place" }))).status).toBe(400);
  });
});

describe("signed address selection", () => {
  it("rejects tampering, another owner/venue, oversized and malformed tokens", () => {
    const token = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    for (const [value, owner, venue] of [[token + "x", "owner-1", "venue-1"], [token, "other", "venue-1"], [token, "owner-1", "other"], ["x".repeat(9000), "owner-1", "venue-1"], ["bad", "owner-1", "venue-1"]]) {
      expect(readOwnerVenueAddressToken(value, owner, venue)).toBeNull();
    }
  });
  it("expires after 30 minutes and fails closed without the signing secret", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    const token = createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS);
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(readOwnerVenueAddressToken(token, "owner-1", "venue-1")).toBeNull();
    vi.stubEnv("SESSION_SECRET", "");
    expect(readOwnerVenueAddressToken(token, "owner-1", "venue-1")).toBeNull();
    expect(() => createOwnerVenueAddressToken("owner-1", "venue-1", ADDRESS)).toThrow();
  });
});
