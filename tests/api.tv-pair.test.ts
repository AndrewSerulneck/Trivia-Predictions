import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  mintPairingCode: vi.fn(),
  pollPairingCode: vi.fn(),
  claimPairingCode: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/tvPairing", () => ({
  mintPairingCode: mocks.mintPairingCode,
  pollPairingCode: mocks.pollPairingCode,
  claimPairingCode: mocks.claimPairingCode,
}));

import { POST as MINT } from "@/app/api/tv-pair/route";
import { GET as POLL } from "@/app/api/tv-pair/[code]/route";
import { POST as CLAIM } from "@/app/api/owner/tv-pair/claim/route";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

const paramsFor = (code: string) => ({ params: Promise.resolve({ code }) });
const claimRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/owner/tv-pair/claim", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  mocks.requireOwnerAuth.mockReset();
  mocks.mintPairingCode.mockReset();
  mocks.pollPairingCode.mockReset();
  mocks.claimPairingCode.mockReset();

  mocks.requireOwnerAuth.mockResolvedValue(OWNER);
  mocks.mintPairingCode.mockResolvedValue({ code: "XK49PM", expiresAt: "2026-08-01T00:10:00.000Z" });
  mocks.claimPairingCode.mockResolvedValue({ ok: true });
});

describe("POST /api/tv-pair (mint)", () => {
  it("returns a fresh code (public — no auth)", async () => {
    const res = await MINT();
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.code).toBe("XK49PM");
  });
});

describe("GET /api/tv-pair/[code] (poll)", () => {
  it("returns 200 + venueId once claimed", async () => {
    mocks.pollPairingCode.mockResolvedValue({ status: "claimed", venueId: "venue-1" });
    const res = await POLL(new Request("http://localhost/api/tv-pair/XK49PM"), paramsFor("XK49PM"));
    const body = (await res.json()) as { ok: boolean; status: string; venueId: string };
    expect(res.status).toBe(200);
    expect(body.status).toBe("claimed");
    expect(body.venueId).toBe("venue-1");
  });

  it("returns 200 while pending", async () => {
    mocks.pollPairingCode.mockResolvedValue({ status: "pending" });
    const res = await POLL(new Request("http://localhost/api/tv-pair/XK49PM"), paramsFor("XK49PM"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");
  });

  it("returns 404 for an unknown/swept code", async () => {
    mocks.pollPairingCode.mockResolvedValue({ status: "not_found" });
    const res = await POLL(new Request("http://localhost/api/tv-pair/NOPE00"), paramsFor("NOPE00"));
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/owner/tv-pair/claim", () => {
  it("claims a code for a venue the owner controls", async () => {
    const res = await CLAIM(claimRequest({ code: "XK49PM", venueId: "venue-1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mocks.claimPairingCode).toHaveBeenCalledWith("XK49PM", "venue-1");
  });

  it("403s a venue the owner does not control and never touches the code", async () => {
    const res = await CLAIM(claimRequest({ code: "XK49PM", venueId: "venue-999" }));
    expect(res.status).toBe(403);
    expect(mocks.claimPairingCode).not.toHaveBeenCalled();
  });

  it("400s when the code or venueId is missing", async () => {
    expect((await CLAIM(claimRequest({ venueId: "venue-1" }))).status).toBe(400);
    expect((await CLAIM(claimRequest({ code: "XK49PM" }))).status).toBe(400);
    expect(mocks.claimPairingCode).not.toHaveBeenCalled();
  });

  it("404s an unknown code", async () => {
    mocks.claimPairingCode.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await CLAIM(claimRequest({ code: "NOPE00", venueId: "venue-1" }));
    expect(res.status).toBe(404);
  });

  it("409s an expired or already-used code", async () => {
    mocks.claimPairingCode.mockResolvedValue({ ok: false, reason: "expired" });
    expect((await CLAIM(claimRequest({ code: "XK49PM", venueId: "venue-1" }))).status).toBe(409);

    mocks.claimPairingCode.mockResolvedValue({ ok: false, reason: "already_used" });
    expect((await CLAIM(claimRequest({ code: "XK49PM", venueId: "venue-1" }))).status).toBe(409);
  });

  it("propagates the auth failure Response when unauthenticated", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await CLAIM(claimRequest({ code: "XK49PM", venueId: "venue-1" }));
    expect(res.status).toBe(401);
    expect(mocks.claimPairingCode).not.toHaveBeenCalled();
  });
});
