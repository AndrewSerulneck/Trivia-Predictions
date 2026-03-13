import { beforeEach, describe, expect, it, vi } from "vitest";

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
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("re-geocodes when address changes but submitted coords still match old venue coords", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "venue-downtown",
        address: "Old Address",
        latitude: 40.712776,
        longitude: -74.005974,
      },
      error: null,
    });
    const selectExisting = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });

    const single = vi.fn().mockResolvedValue({
      data: {
        id: "venue-downtown",
        name: "Brunswick Grove",
        display_name: "Brunswick Grove",
        logo_text: null,
        icon_emoji: null,
        address: "327 Milltown Rd, East Brunswick, NJ",
        latitude: 40.4376405,
        longitude: -74.4264871,
        radius: 100,
      },
      error: null,
    });
    const selectUpdated = vi.fn().mockReturnValue({ single });
    const eqUpdate = vi.fn().mockReturnValue({ select: selectUpdated });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    mocks.from
      .mockReturnValueOnce({ select: selectExisting })
      .mockReturnValueOnce({ update });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "40.4376405", lon: "-74.4264871" }],
    } as Response);

    await updateAdminVenue({
      id: "venue-downtown",
      name: "Brunswick Grove",
      address: "327 Milltown Rd, East Brunswick, NJ",
      radius: 100,
      latitude: 40.712776,
      longitude: -74.005974,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "327 Milltown Rd, East Brunswick, NJ",
        latitude: 40.4376405,
        longitude: -74.4264871,
      })
    );
  });

  it("keeps supplied coords and skips geocoding when address is unchanged", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "venue-downtown",
        address: "327 Milltown Rd, East Brunswick, NJ",
        latitude: 40.4376405,
        longitude: -74.4264871,
      },
      error: null,
    });
    const selectExisting = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });

    const single = vi.fn().mockResolvedValue({
      data: {
        id: "venue-downtown",
        name: "Brunswick Grove",
        display_name: "Brunswick Grove",
        logo_text: null,
        icon_emoji: null,
        address: "327 Milltown Rd, East Brunswick, NJ",
        latitude: 40.4376405,
        longitude: -74.4264871,
        radius: 120,
      },
      error: null,
    });
    const selectUpdated = vi.fn().mockReturnValue({ single });
    const eqUpdate = vi.fn().mockReturnValue({ select: selectUpdated });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    mocks.from
      .mockReturnValueOnce({ select: selectExisting })
      .mockReturnValueOnce({ update });

    const fetchSpy = vi.spyOn(global, "fetch");

    await updateAdminVenue({
      id: "venue-downtown",
      name: "Brunswick Grove",
      address: "327 Milltown Rd, East Brunswick, NJ",
      radius: 120,
      latitude: 40.4376405,
      longitude: -74.4264871,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 40.4376405,
        longitude: -74.4264871,
      })
    );
  });
});
