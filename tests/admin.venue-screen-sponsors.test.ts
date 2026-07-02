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

import {
  createAdminVenueScreenSponsor,
  listAdminVenueScreenSponsors,
  updateAdminVenueScreenSponsor,
} from "@/lib/admin";

describe("venue screen sponsor admin helpers", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("lists venue sponsors in display order", async () => {
    const order = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnValue({
      order,
      then: undefined,
    });
    order.mockReturnValueOnce({ order }).mockReturnValueOnce(Promise.resolve({
      data: [
        {
          id: "s1",
          venue_id: "venue-1",
          title: "Local Brew",
          image_url: "https://cdn.example.com/brew.png",
          link_url: null,
          display_order: 1,
          is_active: true,
          starts_at: null,
          ends_at: null,
          created_at: "2026-07-02T12:00:00.000Z",
        },
      ],
      error: null,
    }));
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    const items = await listAdminVenueScreenSponsors("venue-1");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "s1",
      venueId: "venue-1",
      title: "Local Brew",
      imageUrl: "https://cdn.example.com/brew.png",
      displayOrder: 1,
      isActive: true,
    });
  });

  it("validates sponsor URLs before insert", async () => {
    await expect(
      createAdminVenueScreenSponsor({
        venueId: "venue-1",
        title: "Bad Sponsor",
        imageUrl: "notaurl",
      })
    ).rejects.toThrow("Sponsor image URL must be a valid http(s) URL.");
  });

  it("creates and updates sponsor rows with normalized payloads", async () => {
    const singleInsert = vi.fn().mockResolvedValue({
      data: {
        id: "s2",
        venue_id: "venue-1",
        title: "Pizza Night",
        image_url: "https://cdn.example.com/pizza.png",
        link_url: "https://example.com",
        display_order: 2,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: "2026-07-02T12:00:00.000Z",
      },
      error: null,
    });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleInsert }) });

    const singleUpdate = vi.fn().mockResolvedValue({
      data: {
        id: "s2",
        venue_id: "venue-1",
        title: "Pizza Night",
        image_url: "https://cdn.example.com/pizza-new.png",
        link_url: null,
        display_order: 3,
        is_active: false,
        starts_at: null,
        ends_at: null,
        created_at: "2026-07-02T12:00:00.000Z",
      },
      error: null,
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleUpdate }) }),
    });

    mocks.from
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ update });

    await createAdminVenueScreenSponsor({
      venueId: "venue-1",
      title: " Pizza Night ",
      imageUrl: "https://cdn.example.com/pizza.png",
      linkUrl: "https://example.com",
      displayOrder: 2,
      isActive: true,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_id: "venue-1",
        title: "Pizza Night",
        image_url: "https://cdn.example.com/pizza.png",
        link_url: "https://example.com",
        display_order: 2,
        is_active: true,
      })
    );

    await updateAdminVenueScreenSponsor({
      id: "s2",
      venueId: "venue-1",
      title: "Pizza Night",
      imageUrl: "https://cdn.example.com/pizza-new.png",
      displayOrder: 3,
      isActive: false,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_id: "venue-1",
        image_url: "https://cdn.example.com/pizza-new.png",
        link_url: null,
        display_order: 3,
        is_active: false,
      })
    );
  });
});
