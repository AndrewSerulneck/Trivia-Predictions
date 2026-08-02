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
  getVenueGameSettings,
  getVenueNFLPickEmScoringMode,
  setVenueNFLPickEmScoringMode,
} from "@/lib/venueGameSettings";

describe("venueGameSettings", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("defaults missing venue settings rows to standard", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    await expect(getVenueGameSettings("venue-1")).resolves.toEqual({
      venueId: "venue-1",
      nflPickEmScoringMode: "standard",
      createdAt: null,
      updatedAt: null,
    });
    await expect(getVenueNFLPickEmScoringMode("venue-1")).resolves.toBe("standard");
  });

  it("persists spread mode via upsert", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        venue_id: "venue-1",
        nfl_pickem_scoring_mode: "spread",
        created_at: "2026-08-02T12:00:00.000Z",
        updated_at: "2026-08-02T12:05:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });

    await expect(setVenueNFLPickEmScoringMode("venue-1", "spread")).resolves.toEqual({
      venueId: "venue-1",
      nflPickEmScoringMode: "spread",
      createdAt: "2026-08-02T12:00:00.000Z",
      updatedAt: "2026-08-02T12:05:00.000Z",
    });
    expect(upsert).toHaveBeenCalledWith(
      {
        venue_id: "venue-1",
        nfl_pickem_scoring_mode: "spread",
      },
      { onConflict: "venue_id" },
    );
  });
});
