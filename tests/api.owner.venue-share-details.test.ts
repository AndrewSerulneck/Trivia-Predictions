import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/native-app-store-plan.md Phase 9e — GET/PATCH /api/owner/venues/share-details and the admin
// twin. Owner auth and "the venue is theirs" come BEFORE any read or write.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  requireAdminAuth: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.requireAdminAuth }));
vi.mock("@/lib/supabaseAdmin", () => {
  const chain = {
    select: () => chain,
    update: (values: Record<string, unknown>) => {
      mocks.update(values);
      return chain;
    },
    eq: (column: string, value: string) => {
      mocks.eq(column, value);
      return chain;
    },
    maybeSingle: () => mocks.maybeSingle(),
  };
  return { supabaseAdmin: { from: () => chain } };
});

import { GET, PATCH } from "@/app/api/owner/venues/share-details/route";
import { PATCH as ADMIN_PATCH } from "@/app/api/admin/venues/share-details/route";

const ROW = {
  instagram_handle: "thepourhouse",
  share_show_name: true,
  share_show_address: false,
  share_show_instagram: true,
};

const patch = (body: unknown) =>
  new Request("http://localhost/api/owner/venues/share-details", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID = { venueId: "venue-1", instagramHandle: "@ThePourHouse", showName: true, showAddress: false, showInstagram: true };

describe("owner share-details route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
    mocks.maybeSingle.mockResolvedValue({ data: ROW, error: null });
  });

  it("no session → the auth response, nothing read", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(new Response(JSON.stringify({ ok: false }), { status: 401 }));
    const res = await GET(new Request("http://localhost/api/owner/venues/share-details?venueId=venue-1"));
    expect(res.status).toBe(401);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("another partner's venue → 403, nothing read or written", async () => {
    const get = await GET(new Request("http://localhost/api/owner/venues/share-details?venueId=venue-9"));
    expect(get.status).toBe(403);
    const write = await PATCH(patch({ ...VALID, venueId: "venue-9" }));
    expect(write.status).toBe(403);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("GET returns the venue's choice", async () => {
    const res = await GET(new Request("http://localhost/api/owner/venues/share-details?venueId=venue-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      details: { instagramHandle: "thepourhouse", showName: true, showAddress: false, showInstagram: true },
    });
    expect(mocks.eq).toHaveBeenCalledWith("id", "venue-1");
  });

  it("PATCH stores the bare handle and the three flags", async () => {
    const res = await PATCH(patch(VALID));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      instagram_handle: "ThePourHouse",
      share_show_name: true,
      share_show_address: false,
      share_show_instagram: true,
    });
    expect(mocks.eq).toHaveBeenCalledWith("id", "venue-1");
  });

  it("refuses a bad handle or a missing flag (never defaults one to 'show')", async () => {
    expect((await PATCH(patch({ ...VALID, instagramHandle: "pour house" }))).status).toBe(400);
    const { showAddress: _omit, ...missing } = VALID;
    void _omit;
    expect((await PATCH(patch(missing))).status).toBe(400);
    expect((await PATCH(patch({ ...VALID, showName: "yes" }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("a blank handle clears it", async () => {
    await PATCH(patch({ ...VALID, instagramHandle: "" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ instagram_handle: null }));
  });

  it("a database error is a generic 500", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "boom: secret detail" } });
    const res = await PATCH(patch(VALID));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});

describe("admin share-details route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: ROW, error: null });
  });

  it("needs admin auth before any write", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: false, status: 401, error: "Admin login required." });
    expect((await ADMIN_PATCH(patch(VALID))).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("an admin can set any venue's choice", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, authUserId: "a", adminUsername: "andrew" });
    expect((await ADMIN_PATCH(patch({ ...VALID, venueId: "venue-9" }))).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("id", "venue-9");
  });
});
