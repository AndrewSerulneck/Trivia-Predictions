import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/fire-tv-app-plan.md Phase 3 — the TV connect routes: rate limits, the secret header, owner auth and the
// "venue id only" answer. The lifecycle itself is covered by tests/lib.tvConnect.test.ts.

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireOwnerAuth: vi.fn(),
  createTvPairing: vi.fn(),
  readTvPairingStatus: vi.fn(),
  claimTvPairing: vi.fn(),
  findVenueIdByDisplayCode: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/displayCodeLookup", () => ({ findVenueIdByDisplayCode: mocks.findVenueIdByDisplayCode }));
vi.mock("@/lib/tvConnect", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tvConnect")>("@/lib/tvConnect");
  return {
    parsePollSecret: actual.parsePollSecret,
    createTvPairing: mocks.createTvPairing,
    readTvPairingStatus: mocks.readTvPairingStatus,
    claimTvPairing: mocks.claimTvPairing,
  };
});

import { POST as createRoute } from "@/app/api/tv-app/pairings/route";
import { GET as statusRoute } from "@/app/api/tv-app/pairings/status/route";
import { POST as displayCodeRoute } from "@/app/api/tv-app/display-code/route";
import { POST as connectRoute } from "@/app/api/owner/tv-app/connect/route";

const SECRET = "s".repeat(43);
const allowed = { allowed: true, retryAfterSeconds: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue(allowed);
  mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
});

describe("POST /api/tv-app/pairings", () => {
  it("creates a code behind the per-IP limit, no-store", async () => {
    mocks.createTvPairing.mockResolvedValue({ pairCode: "7K3M9Q", pollSecret: SECRET, expiresAt: "2026-11-22T20:10:00.000Z" });
    const res = await createRoute(new Request("https://x/api/tv-app/pairings", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, pairCode: "7K3M9Q", pollSecret: SECRET, expiresAt: "2026-11-22T20:10:00.000Z" });
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "tvPairCreate");
  });

  it("429s over the limit without creating anything", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const res = await createRoute(new Request("https://x/api/tv-app/pairings", { method: "POST" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(mocks.createTvPairing).not.toHaveBeenCalled();
  });
});

describe("GET /api/tv-app/pairings/status", () => {
  it("reads the secret from the header only, with no rate limit", async () => {
    mocks.readTvPairingStatus.mockResolvedValue({ ok: true, state: "connected", venueId: "venue-1" });
    const res = await statusRoute(new Request("https://x/api/tv-app/pairings/status", { headers: { "x-tv-pair-secret": SECRET } }));
    expect(await res.json()).toEqual({ ok: true, state: "connected", venueId: "venue-1" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.readTvPairingStatus).toHaveBeenCalledWith(SECRET);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("ignores a secret in the URL", async () => {
    const res = await statusRoute(new Request(`https://x/api/tv-app/pairings/status?secret=${SECRET}`));
    expect(res.status).toBe(400);
    expect(mocks.readTvPairingStatus).not.toHaveBeenCalled();
  });
});

describe("POST /api/tv-app/display-code", () => {
  const call = (body: unknown) =>
    displayCodeRoute(new Request("https://x/api/tv-app/display-code", { method: "POST", body: JSON.stringify(body) }));

  it("answers the venue id only", async () => {
    mocks.findVenueIdByDisplayCode.mockResolvedValue("venue-9");
    const res = await call({ code: "k7m2" });
    expect(await res.json()).toEqual({ ok: true, venueId: "venue-9" });
    expect(mocks.findVenueIdByDisplayCode).toHaveBeenCalledWith("K7M2");
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "tvDisplayCode");
  });

  it("reads O as 0 before the lookup", async () => {
    mocks.findVenueIdByDisplayCode.mockResolvedValue("venue-9");
    await call({ code: "KOM2" });
    expect(mocks.findVenueIdByDisplayCode).toHaveBeenCalledWith("K0M2");
  });

  it("404s an unknown code", async () => {
    mocks.findVenueIdByDisplayCode.mockResolvedValue(null);
    const res = await call({ code: "ZZZZ" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Code not found." });
  });

  it("a malformed code costs no read and no rate-limit slot", async () => {
    for (const body of [{ code: "K7M" }, { code: 1234 }, {}, "x".repeat(400)]) {
      const res = await call(body);
      expect(res.status).toBe(400);
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.findVenueIdByDisplayCode).not.toHaveBeenCalled();
  });

  it("429s over the limit before the lookup", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const res = await call({ code: "K7M2" });
    expect(res.status).toBe(429);
    expect(mocks.findVenueIdByDisplayCode).not.toHaveBeenCalled();
  });
});

describe("POST /api/owner/tv-app/connect", () => {
  const call = (body: unknown) =>
    connectRoute(new Request("https://x/api/owner/tv-app/connect", { method: "POST", body: JSON.stringify(body) }));

  it("needs a partner session", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(new Response("{}", { status: 401 }));
    const res = await call({ pairCode: "7K3M9Q", venueId: "venue-1" });
    expect(res.status).toBe(401);
    expect(mocks.claimTvPairing).not.toHaveBeenCalled();
  });

  it("is limited per owner, not per IP", async () => {
    mocks.claimTvPairing.mockResolvedValue({ ok: true });
    await call({ pairCode: "7K3M9Q", venueId: "venue-1" });
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "tvConnectOwner", { identity: "owner-1", ignoreIp: true });
  });

  it("passes the owner's venues for the ownership check", async () => {
    mocks.claimTvPairing.mockResolvedValue({ ok: true });
    const res = await call({ pairCode: "7K3M9Q", venueId: "venue-1" });
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.claimTvPairing).toHaveBeenCalledWith({ rawPairCode: "7K3M9Q", venueId: "venue-1", ownerVenueIds: ["venue-1"] });
  });

  it.each([
    ["expired", 410],
    ["not_your_venue", 403],
    ["invalid", 400],
  ] as const)("maps %s to %i", async (code, status) => {
    mocks.claimTvPairing.mockResolvedValue({ ok: false, code, error: "x" });
    const res = await call({ pairCode: "7K3M9Q", venueId: "venue-1" });
    expect(res.status).toBe(status);
  });

  it("429s over the limit without claiming", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const res = await call({ pairCode: "7K3M9Q", venueId: "venue-1" });
    expect(res.status).toBe(429);
    expect(mocks.claimTvPairing).not.toHaveBeenCalled();
  });
});
