import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  updateAdminUser: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/admin", () => ({
  updateAdminUser: mocks.updateAdminUser,
}));

import { PUT } from "@/app/api/admin/users/[userId]/route";

describe("PUT /api/admin/users/[userId]", () => {
  beforeEach(() => {
    mocks.requireAdminAuth.mockReset();
    mocks.updateAdminUser.mockReset();
  });

  it("returns auth error when requester is not admin", async () => {
    mocks.requireAdminAuth.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Admin access required.",
    });

    const response = await PUT(
      new Request("http://localhost/api/admin/users/u1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "NewName" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) }
    );

    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: "Admin access required." });
    expect(mocks.updateAdminUser).not.toHaveBeenCalled();
  });

  it("returns 400 when route userId is missing", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });

    const response = await PUT(
      new Request("http://localhost/api/admin/users/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "NewName" }),
      }),
      { params: Promise.resolve({ userId: "   " }) }
    );

    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "userId is required." });
    expect(mocks.updateAdminUser).not.toHaveBeenCalled();
  });

  it("updates user and returns payload", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.updateAdminUser.mockResolvedValue({
      id: "u1",
      username: "updated_name",
      venueId: "v1",
      points: 250,
      isAdmin: false,
      createdAt: "2026-02-16T10:00:00.000Z",
    });

    const response = await PUT(
      new Request("http://localhost/api/admin/users/u1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "updated_name", points: 250 }),
      }),
      { params: Promise.resolve({ userId: "u1" }) }
    );

    const body = (await response.json()) as {
      ok: boolean;
      user: { id: string; username: string; points: number };
    };

    expect(response.status).toBe(200);
    expect(mocks.updateAdminUser).toHaveBeenCalledWith({
      userId: "u1",
      username: "updated_name",
      points: 250,
    });
    expect(body.ok).toBe(true);
    expect(body.user.username).toBe("updated_name");
    expect(body.user.points).toBe(250);
  });

  it("returns 500 when validation fails in updateAdminUser", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.updateAdminUser.mockRejectedValue(
      new Error("Username must be 3-20 characters and use letters, numbers, or underscore.")
    );

    const response = await PUT(
      new Request("http://localhost/api/admin/users/u1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "bad name" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) }
    );

    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: "Username must be 3-20 characters and use letters, numbers, or underscore.",
    });
  });
});
