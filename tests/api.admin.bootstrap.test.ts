import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

import { POST } from "@/app/api/admin/bootstrap/route";

describe("POST /api/admin/bootstrap", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    process.env.ADMIN_LOGIN_USERNAME = "admin";
    process.env.ADMIN_LOGIN_PASSWORD = "top-secret";
  });

  it("returns 401 when bearer token is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "top-secret" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when password is wrong", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      })
    );

    expect(response.status).toBe(403);
  });

  it("promotes linked profiles to admin", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });

    const usersSelectLimit = vi.fn().mockResolvedValue({
      data: [{ id: "u1" }, { id: "u2" }],
      error: null,
    });
    const usersSelectEq = vi.fn().mockReturnValue({ limit: usersSelectLimit });
    const usersSelect = vi.fn().mockReturnValue({ eq: usersSelectEq });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const from = vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: usersSelect,
          update,
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.from.mockImplementation(from);

    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ username: "admin", password: "top-secret" }),
      })
    );

    const body = (await response.json()) as { ok: boolean; promotedProfiles: number };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.promotedProfiles).toBe(2);
    expect(update).toHaveBeenCalledWith({ is_admin: true });
  });
});
