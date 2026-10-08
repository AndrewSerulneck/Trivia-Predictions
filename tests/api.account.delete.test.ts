import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/account/delete — native app store plan Phase 1b. The REAL serverSession runs here
// with a SESSION_SECRET set, exactly as in production; only the deletion itself is mocked (its
// all-or-nothing behaviour is proven against real PostgreSQL by `npm run test:account-deletion-sql`).

const mocks = vi.hoisted(() => ({ deletePlayerAccount: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/playerAccountDeletion", () => ({ deletePlayerAccount: mocks.deletePlayerAccount }));

import { createSessionCookie } from "@/lib/serverSession";
import { POST } from "@/app/api/account/delete/route";

const ME = "11111111-1111-1111-1111-111111111111";
const VICTIM = "22222222-2222-2222-2222-222222222222";

const sessionCookieFor = (userId: string): string => createSessionCookie(userId).split(";")[0];

const post = (body: unknown, cookie?: string) =>
  new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /api/account/delete", () => {
  const savedSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-for-account-delete";
    mocks.deletePlayerAccount.mockReset();
    mocks.deletePlayerAccount.mockResolvedValue({ ok: true, outcome: "deleted", authUsersDeleted: 1, authUsersKept: 0 });
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = savedSecret;
  });

  it("deletes the signed session's account and expires the session cookie", async () => {
    const response = await POST(post({ userId: ME, confirm: "DELETE" }, sessionCookieFor(ME)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, alreadyDeleted: false });
    expect(mocks.deletePlayerAccount).toHaveBeenCalledExactlyOnceWith(ME);
    expect(response.headers.get("set-cookie")).toMatch(/tp_sess=;.*Max-Age=0/);
  });

  it("uses the session when the body carries no userId", async () => {
    const response = await POST(post({ confirm: "delete " }, sessionCookieFor(ME)));
    expect(response.status).toBe(200);
    expect(mocks.deletePlayerAccount).toHaveBeenCalledExactlyOnceWith(ME);
  });

  it("refuses a forged userId with 403 and deletes nothing", async () => {
    const response = await POST(post({ userId: VICTIM, confirm: "DELETE" }, sessionCookieFor(ME)));
    expect(response.status).toBe(403);
    expect(mocks.deletePlayerAccount).not.toHaveBeenCalled();
  });

  it("refuses a claim with no session (403) and no claim with no session (401)", async () => {
    expect((await POST(post({ userId: VICTIM, confirm: "DELETE" }))).status).toBe(403);
    expect((await POST(post({ confirm: "DELETE" }))).status).toBe(401);
    expect(mocks.deletePlayerAccount).not.toHaveBeenCalled();
  });

  it("refuses a tampered session cookie", async () => {
    const forged = sessionCookieFor(VICTIM).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const response = await POST(post({ userId: VICTIM, confirm: "DELETE" }, forged));
    expect(response.status).toBe(403);
    expect(mocks.deletePlayerAccount).not.toHaveBeenCalled();
  });

  it("requires the typed confirmation", async () => {
    for (const confirm of [undefined, "", "yes", "DELET"]) {
      const response = await POST(post({ userId: ME, confirm }, sessionCookieFor(ME)));
      expect(response.status).toBe(400);
    }
    expect(mocks.deletePlayerAccount).not.toHaveBeenCalled();
  });

  it("is unavailable (503) when sessions are not enforced, because dev talks to the production database", async () => {
    delete process.env.SESSION_SECRET;
    const response = await POST(post({ userId: ME, confirm: "DELETE" }));
    expect(response.status).toBe(503);
    expect(mocks.deletePlayerAccount).not.toHaveBeenCalled();
  });

  it("reports a failed deletion as nothing changed and keeps the session", async () => {
    mocks.deletePlayerAccount.mockResolvedValue({ ok: false, error: "rpc-failed" });
    const response = await POST(post({ userId: ME, confirm: "DELETE" }, sessionCookieFor(ME)));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/Nothing was changed/);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 503 while the migration is not applied yet", async () => {
    mocks.deletePlayerAccount.mockResolvedValue({ ok: false, error: "rpc-missing" });
    const response = await POST(post({ confirm: "DELETE" }, sessionCookieFor(ME)));
    expect(response.status).toBe(503);
  });

  it("treats an already-deleted account as done", async () => {
    mocks.deletePlayerAccount.mockResolvedValue({ ok: true, outcome: "not_found" });
    const response = await POST(post({ confirm: "DELETE" }, sessionCookieFor(ME)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, alreadyDeleted: true });
  });
});
