import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
    auth: { admin: { deleteUser: mocks.deleteAuthUser } },
  },
}));

vi.mock("@/lib/stripe", () => ({ stripe: null }));

import { listOrphanedOwnerAccounts, deleteOrphanedOwnerAccount } from "@/lib/admin";

describe("listOrphanedOwnerAccounts", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("returns only owners with zero venue_owner_venues links", async () => {
    const links = [{ owner_id: "owner-linked" }];
    const owners = [
      { id: "owner-linked", email: "linked@test.com", name: "Linked Owner", auth_id: "auth-linked" },
      { id: "owner-orphan", email: "orphan@test.com", name: "Orphan Owner", auth_id: "auth-orphan" },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === "venue_owner_venues") {
        return { select: () => ({ returns: vi.fn().mockResolvedValue({ data: links, error: null }) }) };
      }
      if (table === "venue_owners") {
        return { select: () => ({ returns: vi.fn().mockResolvedValue({ data: owners, error: null }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listOrphanedOwnerAccounts();

    expect(result).toEqual([
      { ownerId: "owner-orphan", email: "orphan@test.com", name: "Orphan Owner", authId: "auth-orphan" },
    ]);
  });

  it("returns an empty list when every owner has a link", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "venue_owner_venues") {
        return {
          select: () => ({ returns: vi.fn().mockResolvedValue({ data: [{ owner_id: "owner-1" }], error: null }) }),
        };
      }
      if (table === "venue_owners") {
        return {
          select: () => ({
            returns: vi
              .fn()
              .mockResolvedValue({ data: [{ id: "owner-1", email: "a@test.com", name: "A", auth_id: null }], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listOrphanedOwnerAccounts();

    expect(result).toEqual([]);
  });
});

describe("deleteOrphanedOwnerAccount", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.deleteAuthUser.mockReset();
    mocks.deleteAuthUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  function mockChains(ownerLinks: Array<{ id: string }>, ownerRow: { auth_id: string | null } | null) {
    const linkLimit = vi.fn().mockResolvedValue({ data: ownerLinks, error: null });
    const linkEq = vi.fn().mockReturnValue({ limit: linkLimit });

    const ownerMaybeSingle = vi.fn().mockResolvedValue({ data: ownerRow, error: null });
    const ownerEq = vi.fn().mockReturnValue({ maybeSingle: ownerMaybeSingle });

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: deleteEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "venue_owner_venues") return { select: () => ({ eq: linkEq }) };
      if (table === "venue_owners") return { select: () => ({ eq: ownerEq }), delete: del };
      throw new Error(`Unexpected table ${table}`);
    });

    return { del };
  }

  it("refuses when the owner still has a linked venue", async () => {
    const { del } = mockChains([{ id: "link-1" }], null);

    const result = await deleteOrphanedOwnerAccount("owner-1");

    expect(del).not.toHaveBeenCalled();
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(result).toEqual({ blocked: true, ownerAccountDeleted: false, authUserDeleted: false });
  });

  it("deletes the auth login and the owner row when no link exists", async () => {
    const { del } = mockChains([], { auth_id: "auth-1" });

    const result = await deleteOrphanedOwnerAccount("owner-1");

    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-1");
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ blocked: false, ownerAccountDeleted: true, authUserDeleted: true });
  });

  it("still deletes the owner row if the auth login is already gone", async () => {
    const { del } = mockChains([], { auth_id: null });

    const result = await deleteOrphanedOwnerAccount("owner-1");

    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ blocked: false, ownerAccountDeleted: true, authUserDeleted: false });
  });
});
