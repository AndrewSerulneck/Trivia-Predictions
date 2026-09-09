import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readOwnerSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/ownerSession", () => ({
  readOwnerSession: mocks.readOwnerSession,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

const mockOwnerVenueChains = (options: {
  linkedVenueIds: string[];
  linkedError?: { message: string } | null;
  liveVenueIds?: string[];
  liveError?: { message: string } | null;
}) => {
  const linkedEq = vi.fn().mockResolvedValue({
    data: options.linkedVenueIds.map((venueId) => ({ venue_id: venueId })),
    error: options.linkedError ?? null,
  });
  const linkedSelect = vi.fn().mockReturnValue({ eq: linkedEq });

  const liveIn = vi.fn().mockResolvedValue({
    data: (options.liveVenueIds ?? []).map((id) => ({ id })),
    error: options.liveError ?? null,
  });
  const liveSelect = vi.fn().mockReturnValue({ in: liveIn });

  mocks.from.mockImplementation((table: string) => {
    if (table === "venue_owner_venues") return { select: linkedSelect };
    if (table === "venues") return { select: liveSelect };
    throw new Error(`Unexpected table ${table}`);
  });
};

const request = new Request("http://localhost/api/owner/venues");

describe("requireOwnerAuth", () => {
  beforeEach(() => {
    mocks.readOwnerSession.mockReset();
    mocks.from.mockReset();
    mocks.readOwnerSession.mockReturnValue("owner-1");
  });

  it("returns only linked venues that still exist", async () => {
    mockOwnerVenueChains({
      linkedVenueIds: ["venue-1", "deleted-venue"],
      liveVenueIds: ["venue-1"],
    });

    await expect(requireOwnerAuth(request)).resolves.toEqual({
      ownerId: "owner-1",
      venueIds: ["venue-1"],
    });
  });

  it("rejects an owner session with no venue links", async () => {
    mockOwnerVenueChains({ linkedVenueIds: [] });

    await expect(requireOwnerAuth(request)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an owner session whose links point only at deleted venues", async () => {
    mockOwnerVenueChains({
      linkedVenueIds: ["deleted-venue"],
      liveVenueIds: [],
    });

    await expect(requireOwnerAuth(request)).rejects.toMatchObject({ status: 401 });
  });

  /**
   * docs/abandoned-signup-cleanup-plan.md Phase 3.1. The two 401s mean different
   * things and must be told apart: "not signed in" leads to /owner/login, while
   * "signed in, no venue" — what a purged pending signup looks like from the
   * browser — must lead to the signup flow instead. Before this, a purged
   * partner was offered a sign-in page for an account that no longer existed.
   */
  describe("the 401 says WHY", () => {
    const bodyOf = async (promise: Promise<unknown>): Promise<{ error?: string; code?: string }> => {
      try {
        await promise;
      } catch (thrown) {
        return (await (thrown as Response).json()) as { error?: string; code?: string };
      }
      throw new Error("expected requireOwnerAuth to reject");
    };

    it("no_session when the cookie is missing or fails its signature check", async () => {
      mocks.readOwnerSession.mockReturnValue(null);

      await expect(bodyOf(requireOwnerAuth(request))).resolves.toEqual({
        error: "Unauthorized",
        code: "no_session",
      });
    });

    it("no_venue for a VALID session whose owner has no venue link", async () => {
      mockOwnerVenueChains({ linkedVenueIds: [] });

      await expect(bodyOf(requireOwnerAuth(request))).resolves.toEqual({
        error: "Unauthorized",
        code: "no_venue",
      });
    });

    it("no_venue when the links survive but every venue is gone", async () => {
      mockOwnerVenueChains({ linkedVenueIds: ["deleted-venue"], liveVenueIds: [] });

      await expect(bodyOf(requireOwnerAuth(request))).resolves.toEqual({
        error: "Unauthorized",
        code: "no_venue",
      });
    });

    it("keeps `error` unchanged — every existing caller reads only the status", async () => {
      mocks.readOwnerSession.mockReturnValue(null);
      const body = await bodyOf(requireOwnerAuth(request));

      expect(body.error).toBe("Unauthorized");
    });
  });
});
