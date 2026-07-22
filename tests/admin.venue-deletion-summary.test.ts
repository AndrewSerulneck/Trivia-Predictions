import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: vi.fn(),
      retrieve: vi.fn(),
    },
  },
}));

import { getAdminVenueDeletionSummary } from "@/lib/admin";

type MockResult = { data: unknown; error: unknown; count?: number | null };

function mockSummaryChains(options: {
  venue?: MockResult;
  ownerLink?: MockResult;
  subscription?: MockResult;
  userCount?: MockResult;
}) {
  const venue = options.venue ?? { data: { id: "venue-1", name: "The Tap Room" }, error: null };
  const ownerLink = options.ownerLink ?? { data: null, error: null };
  const subscription = options.subscription ?? { data: null, error: null };
  const userCount = options.userCount ?? { data: null, error: null, count: 3 };

  mocks.from.mockImplementation((table: string) => {
    if (table === "venues") {
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(venue) }) }) };
    }
    if (table === "venue_owner_venues") {
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(ownerLink) }) }) };
    }
    if (table === "billing_subscriptions") {
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(subscription) }) }) };
    }
    if (table === "users") {
      return { select: () => ({ eq: vi.fn().mockResolvedValue(userCount) }) };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("getAdminVenueDeletionSummary", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("throws instead of silently reporting 0 users when the count query errors", async () => {
    mockSummaryChains({ userCount: { data: null, error: { message: "connection reset" }, count: null } });

    await expect(getAdminVenueDeletionSummary("venue-1")).rejects.toThrow(/connection reset/);
  });

  it("throws Venue not found. for a missing venue", async () => {
    mockSummaryChains({ venue: { data: null, error: null } });

    await expect(getAdminVenueDeletionSummary("venue-1")).rejects.toThrow("Venue not found.");
  });

  it("reads the owner name/email off the embedded venue_owners select (single round trip)", async () => {
    mockSummaryChains({
      ownerLink: {
        data: { owner_id: "owner-1", venue_owners: { name: "Jamie Rivera", email: "jamie@example.com" } },
        error: null,
      },
    });

    const summary = await getAdminVenueDeletionSummary("venue-1");

    expect(summary.owner).toEqual({ name: "Jamie Rivera", email: "jamie@example.com" });
    expect(summary.isPartnerVenue).toBe(true);
    // Only 4 tables are ever queried (no extra round trip for the owner lookup).
    expect(mocks.from).toHaveBeenCalledTimes(4);
  });

  it("reports no owner when the venue has no owner link", async () => {
    mockSummaryChains({});

    const summary = await getAdminVenueDeletionSummary("venue-1");

    expect(summary.owner).toBeNull();
  });
});
