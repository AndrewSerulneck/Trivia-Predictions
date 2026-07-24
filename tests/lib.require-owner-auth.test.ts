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
});
