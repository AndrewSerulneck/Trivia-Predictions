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

import { repairOrphanedVenueOwnerLink } from "@/lib/admin";

type OwnerLink = { owner_id: string; venue_owners: { auth_id: string | null; email: string } | null } | null;

// Builds the from(...) chains repairOrphanedVenueOwnerLink uses, in order:
//   1. venues -> select -> eq -> maybeSingle                      (live-venue guard)
//   2. venue_owner_venues -> select -> eq -> maybeSingle          (link lookup)
//   3. venue_owner_venues -> delete -> eq -> eq (resolves)        (delete the link)
//   4. venue_owner_venues -> select -> eq -> limit                (remaining links)
//   5. venue_owners -> delete -> eq (resolves)                    (only if none remain)
function mockChains(
  ownerLink: OwnerLink,
  remainingOwnerLinks: Array<{ id: string }> = [],
  venueRow: { id: string } | null = null
) {
  const venueMaybeSingle = vi.fn().mockResolvedValue({ data: venueRow, error: null });
  const venueEq = vi.fn().mockReturnValue({ maybeSingle: venueMaybeSingle });
  const venuesSelect = vi.fn().mockReturnValue({ eq: venueEq });

  const lookupMaybeSingle = vi.fn().mockResolvedValue({ data: ownerLink, error: null });
  const lookupEq = vi.fn().mockReturnValue({ maybeSingle: lookupMaybeSingle });

  const remainingLimit = vi.fn().mockResolvedValue({ data: remainingOwnerLinks, error: null });
  const remainingEq = vi.fn().mockReturnValue({ limit: remainingLimit });

  const vovSelect = vi
    .fn()
    .mockReturnValueOnce({ eq: lookupEq })
    .mockReturnValueOnce({ eq: remainingEq });

  // delete().eq("venue_id", id).eq("owner_id", ...) — two chained eqs
  const linkDeleteSecondEq = vi.fn().mockResolvedValue({ error: null });
  const linkDeleteFirstEq = vi.fn().mockReturnValue({ eq: linkDeleteSecondEq });
  const linkDel = vi.fn().mockReturnValue({ eq: linkDeleteFirstEq });

  const ownerDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const ownerDel = vi.fn().mockReturnValue({ eq: ownerDeleteEq });

  mocks.from.mockImplementation((table: string) => {
    if (table === "venues") return { select: venuesSelect };
    if (table === "venue_owner_venues") return { select: vovSelect, delete: linkDel };
    if (table === "venue_owners") return { delete: ownerDel };
    throw new Error(`Unexpected table ${table}`);
  });

  return { linkDel, ownerDel, venuesSelect };
}

describe("repairOrphanedVenueOwnerLink", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.deleteAuthUser.mockReset();
    mocks.deleteAuthUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("refuses to touch anything when the venue still exists (not an orphan)", async () => {
    const { linkDel, ownerDel } = mockChains(
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1", email: "live@test.com" } },
      [],
      { id: "venue-test" }
    );

    const result = await repairOrphanedVenueOwnerLink("venue-test");

    // Neither the link nor the owner/auth account is touched — the venue lookup
    // short-circuits before any of that logic runs.
    expect(linkDel).not.toHaveBeenCalled();
    expect(ownerDel).not.toHaveBeenCalled();
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: false,
      blocked: true,
      linkDeleted: false,
      ownerAccountDeleted: false,
      authUserDeleted: false,
      ownerEmail: null,
    });
  });

  it("reports nothing to do when there is no stale link", async () => {
    const { linkDel, ownerDel } = mockChains(null);

    const result = await repairOrphanedVenueOwnerLink("venue-test");

    expect(linkDel).not.toHaveBeenCalled();
    expect(ownerDel).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: false,
      blocked: false,
      linkDeleted: false,
      ownerAccountDeleted: false,
      authUserDeleted: false,
      ownerEmail: null,
    });
  });

  it("deletes the stale link and the orphaned owner + auth login", async () => {
    const { linkDel, ownerDel } = mockChains(
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1", email: "old@test.com" } },
      []
    );

    const result = await repairOrphanedVenueOwnerLink("venue-test");

    expect(linkDel).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-1");
    expect(ownerDel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      found: true,
      blocked: false,
      linkDeleted: true,
      ownerAccountDeleted: true,
      authUserDeleted: true,
      ownerEmail: "old@test.com",
    });
  });

  it("keeps the owner account when the owner still owns another venue", async () => {
    const { linkDel, ownerDel } = mockChains(
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1", email: "shared@test.com" } },
      [{ id: "other-link" }]
    );

    const result = await repairOrphanedVenueOwnerLink("venue-test");

    expect(linkDel).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(ownerDel).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: true,
      blocked: false,
      linkDeleted: true,
      ownerAccountDeleted: false,
      authUserDeleted: false,
      ownerEmail: "shared@test.com",
    });
  });
});
