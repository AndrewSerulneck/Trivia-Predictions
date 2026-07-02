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

import { updateAdminVenue } from "@/lib/admin";

describe("updateAdminVenue address/coordinate behavior", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.restoreAllMocks();
  });

  function mockUpdateChain(venueRow: Record<string, unknown>) {
    const single = vi.fn().mockResolvedValue({ data: venueRow, error: null });
    const selectUpdated = vi.fn().mockReturnValue({ single });
    const eqUpdate = vi.fn().mockReturnValue({ select: selectUpdated });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });
    mocks.from.mockReturnValue({ update });
    return { update, eqUpdate, single };
  }

  it("updates venue with provided coordinates", async () => {
    const { update } = mockUpdateChain({
      id: "brunswick-grove",
      name: "Brunswick Grove",
      display_name: "Brunswick Grove",
      logo_text: null,
      icon_emoji: null,
      street: "327 Milltown Rd",
      address: "327 Milltown Rd, East Brunswick, NJ",
      city: "East Brunswick",
      state: "NJ",
      zip_code: null,
      country: null,
      county: null,
      region: null,
      latitude: 40.4376405,
      longitude: -74.4264871,
      radius: 100,
      screen_enabled: true,
      screen_brand_image_url: null,
      screen_brand_primary: null,
      screen_brand_secondary: null,
      screen_sponsor_rotation_enabled: false,
    });

    await updateAdminVenue({
      id: "brunswick-grove",
      name: "Brunswick Grove",
      address: "327 Milltown Rd, East Brunswick, NJ",
      radius: 100,
      latitude: 40.4376405,
      longitude: -74.4264871,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Brunswick Grove",
        latitude: 40.4376405,
        longitude: -74.4264871,
        radius: 100,
      })
    );
  });

  it("falls back display_name to name when displayName is not provided", async () => {
    const { update } = mockUpdateChain({
      id: "brunswick-grove",
      name: "The Anchor",
      display_name: "The Anchor",
      logo_text: null,
      icon_emoji: null,
      street: "10 Main St",
      address: "10 Main St, Springfield, IL",
      city: "Springfield",
      state: "IL",
      zip_code: null,
      country: null,
      county: null,
      region: null,
      latitude: 39.7817,
      longitude: -89.6501,
      radius: 150,
      screen_enabled: true,
      screen_brand_image_url: null,
      screen_brand_primary: null,
      screen_brand_secondary: null,
      screen_sponsor_rotation_enabled: false,
    });

    await updateAdminVenue({
      id: "brunswick-grove",
      name: "The Anchor",
      address: "10 Main St, Springfield, IL",
      radius: 150,
      latitude: 39.7817,
      longitude: -89.6501,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "The Anchor",
        display_name: "The Anchor",
      })
    );
  });

  it("persists venue screen settings", async () => {
    const { update } = mockUpdateChain({
      id: "brunswick-grove",
      name: "The Anchor",
      display_name: "The Anchor",
      logo_text: null,
      icon_emoji: null,
      street: "10 Main St",
      address: "10 Main St, Springfield, IL",
      city: "Springfield",
      state: "IL",
      zip_code: null,
      country: null,
      county: null,
      region: null,
      latitude: 39.7817,
      longitude: -89.6501,
      radius: 150,
      screen_enabled: false,
      screen_brand_image_url: "https://cdn.example.com/brand.png",
      screen_brand_primary: "#112233",
      screen_brand_secondary: "#445566",
      screen_sponsor_rotation_enabled: true,
    });

    await updateAdminVenue({
      id: "brunswick-grove",
      name: "The Anchor",
      address: "10 Main St, Springfield, IL",
      radius: 150,
      latitude: 39.7817,
      longitude: -89.6501,
      screenEnabled: false,
      screenBrandImageUrl: "https://cdn.example.com/brand.png",
      screenBrandPrimary: "#112233",
      screenBrandSecondary: "#445566",
      screenSponsorRotationEnabled: true,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        screen_enabled: false,
        screen_brand_image_url: "https://cdn.example.com/brand.png",
        screen_brand_primary: "#112233",
        screen_brand_secondary: "#445566",
        screen_sponsor_rotation_enabled: true,
      })
    );
  });
});
