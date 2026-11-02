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
  getVenueCollegeFootballPickEmScoringMode,
  getVenueGameSettings,
  getVenueNFLPickEmScoringMode,
  readGameSettingsChanges,
  setVenueNFLPickEmScoringMode,
  updateVenueGameSettings,
} from "@/lib/venueGameSettings";

describe("venueGameSettings", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("defaults missing venue settings rows to standard NFL and spread college football", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    await expect(getVenueGameSettings("venue-1")).resolves.toEqual({
      venueId: "venue-1",
      nflPickEmScoringMode: "standard",
      cfbPickEmScoringMode: "spread",
      createdAt: null,
      updatedAt: null,
    });
    await expect(getVenueNFLPickEmScoringMode("venue-1")).resolves.toBe("standard");
    await expect(getVenueCollegeFootballPickEmScoringMode("venue-1")).resolves.toBe("spread");
  });

  it("persists spread mode via upsert", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        venue_id: "venue-1",
        nfl_pickem_scoring_mode: "spread",
        cfb_pickem_scoring_mode: "standard",
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
      cfbPickEmScoringMode: "standard",
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

  it("saves only the college rule when only it is sent", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { venue_id: "venue-1", nfl_pickem_scoring_mode: "spread", cfb_pickem_scoring_mode: "standard", created_at: null, updated_at: null },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });

    await expect(updateVenueGameSettings("venue-1", { cfbPickEmScoringMode: "standard" })).resolves.toMatchObject({
      nflPickEmScoringMode: "spread",
      cfbPickEmScoringMode: "standard",
    });
    expect(upsert).toHaveBeenCalledWith({ venue_id: "venue-1", cfb_pickem_scoring_mode: "standard" }, { onConflict: "venue_id" });
  });

  it("keeps NFL settings working before the college column exists (migration not applied yet)", async () => {
    const missing = { code: "42703", message: "column venue_game_settings.cfb_pickem_scoring_mode does not exist" };
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: { venue_id: "venue-1", nfl_pickem_scoring_mode: "spread", created_at: null, updated_at: null }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    await expect(getVenueNFLPickEmScoringMode("venue-1")).resolves.toBe("spread");
    expect(select).toHaveBeenLastCalledWith("venue_id, nfl_pickem_scoring_mode, created_at, updated_at");

    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: { venue_id: "venue-1", nfl_pickem_scoring_mode: "standard", created_at: null, updated_at: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: missing });
    const upsertSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
    mocks.from.mockReturnValue({ upsert });
    await expect(setVenueNFLPickEmScoringMode("venue-1", "standard")).resolves.toMatchObject({ nflPickEmScoringMode: "standard" });
    await expect(updateVenueGameSettings("venue-1", { cfbPickEmScoringMode: "standard" })).rejects.toThrow("not available yet");
  });

  it("reads a save body: either mode alone, both, never neither or a bad value", () => {
    expect(readGameSettingsChanges({ cfbPickEmScoringMode: "standard" })).toEqual({ cfbPickEmScoringMode: "standard" });
    expect(readGameSettingsChanges({ nflPickEmScoringMode: "spread", cfbPickEmScoringMode: "spread" })).toEqual({
      nflPickEmScoringMode: "spread",
      cfbPickEmScoringMode: "spread",
    });
    expect(readGameSettingsChanges({})).toBeNull();
    expect(readGameSettingsChanges({ cfbPickEmScoringMode: "moneyline" })).toBeNull();
    expect(readGameSettingsChanges({ nflPickEmScoringMode: "spread", cfbPickEmScoringMode: 3 })).toBeNull();
  });
});
