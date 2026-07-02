import { beforeEach, describe, expect, it, vi } from "vitest";

function installVenueScreenMocks(supabaseAdmin: unknown) {
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/categoryBlitz", () => ({
    driveVenueCategoryBlitz: vi.fn(),
    getRoundResults: vi.fn(),
  }));
  vi.doMock("@/lib/categoryBlitzSchedules", () => ({
    getNextScheduleOccurrence: vi.fn(),
    listSchedules: vi.fn(),
  }));
  vi.doMock("@/lib/liveShowdownEngine", () => ({
    getLiveShowdownState: vi.fn(),
  }));
  vi.doMock("@/lib/supabaseAdmin", () => ({
    supabaseAdmin,
  }));
  vi.doMock("@/lib/venues", () => ({
    getVenueById: vi.fn(),
  }));
}

function makeSponsorQueryResult(result: {
  data: unknown[] | null;
  error: { message: string } | null;
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  const supabaseAdmin = {
    from: vi.fn(() => builder),
  };
  return { builder, supabaseAdmin };
}

describe("getActiveVenueScreenSponsors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads active sponsor rows from the venue screen sponsor table", async () => {
    const { builder, supabaseAdmin } = makeSponsorQueryResult({
      data: [
        {
          title: "Miller Lite",
          image_url: "https://cdn.example.com/miller.png",
          link_url: null,
          display_order: 2,
          starts_at: null,
          ends_at: null,
        },
      ],
      error: null,
    });
    installVenueScreenMocks(supabaseAdmin);

    const { getActiveVenueScreenSponsors } = await import("@/lib/venueScreen");
    const sponsors = await getActiveVenueScreenSponsors(
      "venue-1",
      Date.parse("2026-07-02T20:00:00.000Z"),
    );

    expect(supabaseAdmin.from).toHaveBeenCalledWith("venue_screen_sponsors");
    expect(builder.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
    expect(sponsors).toEqual([
      {
        title: "Miller Lite",
        imageUrl: "https://cdn.example.com/miller.png",
        linkUrl: null,
      },
    ]);
  });

  it("returns an empty sponsor list when the table does not exist yet", async () => {
    const { supabaseAdmin } = makeSponsorQueryResult({
      data: null,
      error: { message: "relation public.venue_screen_sponsors does not exist" },
    });
    installVenueScreenMocks(supabaseAdmin);

    const { getActiveVenueScreenSponsors } = await import("@/lib/venueScreen");
    const sponsors = await getActiveVenueScreenSponsors("venue-1");

    expect(sponsors).toEqual([]);
  });
});
