import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  listAdminUsersByVenue: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/admin", () => ({
  listAdminUsersByVenue: mocks.listAdminUsersByVenue,
}));

import { GET } from "@/app/api/admin/users/route";

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    mocks.requireAdminAuth.mockReset();
    mocks.listAdminUsersByVenue.mockReset();
  });

  it("returns auth error for non-admin caller", async () => {
    mocks.requireAdminAuth.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const response = await GET(new Request("http://localhost/api/admin/users?venueId=v1"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.listAdminUsersByVenue).not.toHaveBeenCalled();
  });

  it("returns 400 when venueId is missing", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });

    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "venueId is required." });
    expect(mocks.listAdminUsersByVenue).not.toHaveBeenCalled();
  });

  it("returns users for valid venue", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.listAdminUsersByVenue.mockResolvedValue([
      {
        id: "u1",
        username: "player_one",
        venueId: "v1",
        points: 120,
        isAdmin: false,
        createdAt: "2026-02-16T10:00:00.000Z",
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/users?venueId=v1"));
    const body = (await response.json()) as {
      ok: boolean;
      users: Array<{ id: string; username: string }>;
    };

    expect(response.status).toBe(200);
    expect(mocks.listAdminUsersByVenue).toHaveBeenCalledWith("v1");
    expect(body.ok).toBe(true);
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.username).toBe("player_one");
  });
});
