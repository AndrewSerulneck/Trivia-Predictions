import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/bootstrap/route";

describe("POST /api/admin/bootstrap", () => {
  beforeEach(() => {
    process.env.ADMIN_LOGIN_USERNAME = "admin";
    process.env.ADMIN_LOGIN_PASSWORD = "top-secret";
    process.env.ADMIN_SESSION_SECRET = "test-secret";
  });

  it("returns 403 when credentials are missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when password is wrong", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      })
    );

    expect(response.status).toBe(403);
  });

  it("creates a session cookie when credentials are valid", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "top-secret" }),
      })
    );

    const body = (await response.json()) as { ok: boolean };
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(setCookie).toContain("admin_session=");
  });

  it("supports the secondary admin login credentials", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "marc", password: "MeMarc25" }),
      })
    );

    const body = (await response.json()) as { ok: boolean };
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(setCookie).toContain("admin_session=");
  });
});
