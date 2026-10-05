import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_AUTH_NO_SESSION } from "@/lib/ownerAuthCodes";

// GET /api/owner/pos (docs/pos-rewards-integration-plan.md Phase 1): flag-gated, owner-only,
// venue-scoped, and never returns anything token-shaped.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  listPosConnectionStatuses: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/pos/connections", () => ({ listPosConnectionStatuses: mocks.listPosConnectionStatuses }));

import { GET } from "@/app/api/owner/pos/route";

const STATUSES = [
  { provider: "square", label: "Square", pitch: "…", state: "coming_soon", merchantName: null, connectedAt: null },
];

const get = (search = "?venueId=venue-1") => GET(new Request(`http://localhost/api/owner/pos${search}`));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  mocks.requireOwnerAuth.mockReset().mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
  mocks.listPosConnectionStatuses.mockReset().mockResolvedValue({ ok: true, statuses: STATUSES });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/owner/pos", () => {
  it("404s with the flag off, before any auth or read", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    const res = await get();
    expect(res.status).toBe(404);
    expect(mocks.requireOwnerAuth).not.toHaveBeenCalled();
    expect(mocks.listPosConnectionStatuses).not.toHaveBeenCalled();
  });

  it("passes an auth failure through", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized", code: OWNER_AUTH_NO_SESSION }), { status: 401 }),
    );
    expect((await get()).status).toBe(401);
  });

  it("requires a venueId and refuses someone else's venue", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?venueId=venue-9")).status).toBe(403);
    expect(mocks.listPosConnectionStatuses).not.toHaveBeenCalled();
  });

  it("returns the venue's statuses", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, statuses: STATUSES });
    expect(mocks.listPosConnectionStatuses).toHaveBeenCalledWith("venue-1");
  });

  it("500s with a generic message when the read fails", async () => {
    mocks.listPosConnectionStatuses.mockResolvedValue({ ok: false });
    const res = await get();
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("Couldn't load your point-of-sale connections.");
  });
});
