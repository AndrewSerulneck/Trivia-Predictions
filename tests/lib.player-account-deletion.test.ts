import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/playerAccountDeletion.ts — the RPC is the all-or-nothing step; this pins what happens
// around it, above all that an auth.users row is deleted ONLY when it is unreferenced AND has no
// email (CLAUDE.md: "auth.users is SHARED WITH PLAYERS").

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  authUserIsUnreferenced: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    auth: { admin: { getUserById: mocks.getUserById, deleteUser: mocks.deleteUser } },
  },
}));
vi.mock("@/lib/signupSweep", () => ({ authUserIsUnreferenced: mocks.authUserIsUnreferenced }));

import { deletePlayerAccount } from "@/lib/playerAccountDeletion";

const USER = "11111111-1111-1111-1111-111111111111";
const AUTH_ANON = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AUTH_EMAIL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const AUTH_REFERENCED = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("deletePlayerAccount", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authUserIsUnreferenced.mockImplementation(async (id: string) =>
      id === AUTH_REFERENCED
        ? { ok: true, unreferenced: false, referencedBy: "venue_owners" }
        : { ok: true, unreferenced: true, referencedBy: null }
    );
    mocks.getUserById.mockImplementation(async (id: string) => ({
      data: { user: { id, email: id === AUTH_EMAIL ? "owner@example.com" : undefined } },
      error: null,
    }));
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
  });

  it("calls the RPC with the user id and deletes only unreferenced, emailless auth users", async () => {
    mocks.rpc.mockResolvedValue({
      data: { outcome: "deleted", users_deleted: 2, unreferenced_auth_ids: [AUTH_ANON, AUTH_EMAIL, AUTH_REFERENCED] },
      error: null,
    });
    const result = await deletePlayerAccount(USER);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("delete_player_account", { p_user_id: USER });
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(AUTH_ANON);
    expect(result).toEqual({ ok: true, outcome: "deleted", authUsersDeleted: 1, authUsersKept: 2 });
  });

  it("re-checks references before deleting and never deletes on a failed check", async () => {
    mocks.authUserIsUnreferenced.mockResolvedValue({ ok: false, error: "users: timeout" });
    mocks.rpc.mockResolvedValue({ data: { outcome: "deleted", unreferenced_auth_ids: [AUTH_ANON] }, error: null });
    const result = await deletePlayerAccount(USER);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, outcome: "deleted", authUsersDeleted: 0, authUsersKept: 1 });
  });

  it("touches no auth user when the RPC fails (the transaction rolled back)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "boom" } });
    expect(await deletePlayerAccount(USER)).toEqual({ ok: false, error: "rpc-failed" });
    expect(mocks.authUserIsUnreferenced).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("reports a missing function as rpc-missing (deploy skew)", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.delete_player_account(p_user_id)" },
    });
    expect(await deletePlayerAccount(USER)).toEqual({ ok: false, error: "rpc-missing" });
  });

  it("passes through not_found and rejects a non-uuid without calling the database", async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: "not_found" }, error: null });
    expect(await deletePlayerAccount(USER)).toEqual({ ok: true, outcome: "not_found" });
    mocks.rpc.mockClear();
    expect(await deletePlayerAccount("not-a-uuid")).toEqual({ ok: false, error: "invalid-user-id" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats an unexpected RPC payload as a failure", async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: "weird" }, error: null });
    expect(await deletePlayerAccount(USER)).toEqual({ ok: false, error: "rpc-failed" });
  });
});
