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
      pickWindows: {},
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
      pickWindows: {},
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
    // Both newer column sets name the college column, so each fails before the legacy one answers.
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
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
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: { venue_id: "venue-1", nfl_pickem_scoring_mode: "standard", created_at: null, updated_at: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: null, error: missing });
    const upsertSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
    mocks.from.mockReturnValue({ upsert });
    await expect(setVenueNFLPickEmScoringMode("venue-1", "standard")).resolves.toMatchObject({ nflPickEmScoringMode: "standard" });
    await expect(updateVenueGameSettings("venue-1", { cfbPickEmScoringMode: "standard" })).rejects.toThrow("not available yet");
    // The college save never fell back to the legacy columns, which can't hold it.
    expect(upsertSelect).toHaveBeenCalledTimes(5);
  });

  it("reads pick windows from the stored jsonb, dropping malformed entries (= always open)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        venue_id: "venue-1",
        nfl_pickem_scoring_mode: "standard",
        cfb_pickem_scoring_mode: "spread",
        pickem_pick_windows: {
          ncaaf: { open_day: "mon", open_time: "00:00", close_day: "wed", close_time: "23:59" },
          nba: { open_day: "mon", open_time: "25:00", close_day: "wed", close_time: "23:59" },
          curling: { open_day: "mon", open_time: "00:00", close_day: "wed", close_time: "23:59" },
        },
        created_at: null,
        updated_at: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    const settings = await getVenueGameSettings("venue-1");
    expect(settings.pickWindows).toEqual({
      ncaaf: { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" },
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select.mock.calls[0][0]).toContain("pickem_pick_windows");
  });

  it("reads settings before the pick-windows column exists: every sport always open", async () => {
    const missing = { code: "42703", message: "column venue_game_settings.pickem_pick_windows does not exist" };
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({
        data: { venue_id: "venue-1", nfl_pickem_scoring_mode: "spread", cfb_pickem_scoring_mode: "standard", created_at: null, updated_at: null },
        error: null,
      });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    await expect(getVenueGameSettings("venue-1")).resolves.toMatchObject({
      nflPickEmScoringMode: "spread",
      cfbPickEmScoringMode: "standard",
      pickWindows: {},
    });
    expect(select).toHaveBeenLastCalledWith("venue_id, nfl_pickem_scoring_mode, cfb_pickem_scoring_mode, created_at, updated_at");
  });

  it("saves pick windows per sport, merged into the saved ones; null clears a sport", async () => {
    const saved = {
      venue_id: "venue-1",
      nfl_pickem_scoring_mode: "standard",
      cfb_pickem_scoring_mode: "spread",
      pickem_pick_windows: {
        nba: { open_day: "fri", open_time: "12:00", close_day: "sun", close_time: "18:00" },
        nfl: { open_day: "tue", open_time: "09:00", close_day: "thu", close_time: "20:00" },
      },
      created_at: null,
      updated_at: null,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: saved, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const single = vi.fn((): Promise<unknown> => Promise.resolve({ data: { ...saved, ...upsert.mock.calls[0][0] }, error: null }));
    const upsertSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
    mocks.from.mockReturnValue({ select, upsert });

    const result = await updateVenueGameSettings("venue-1", {
      pickWindows: { ncaaf: { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" }, nfl: null },
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        venue_id: "venue-1",
        pickem_pick_windows: {
          nba: { open_day: "fri", open_time: "12:00", close_day: "sun", close_time: "18:00" },
          ncaaf: { open_day: "mon", open_time: "00:00", close_day: "wed", close_time: "23:59" },
        },
      },
      { onConflict: "venue_id" },
    );
    expect(Object.keys(result.pickWindows).sort()).toEqual(["nba", "ncaaf"]);
  });

  it("refuses a pick-window save before the column exists; nothing falls back", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'pickem_pick_windows' column of 'venue_game_settings'" };
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const single = vi.fn().mockResolvedValue({ data: null, error: missing });
    const upsertSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
    mocks.from.mockReturnValue({ select, upsert });

    await expect(
      updateVenueGameSettings("venue-1", {
        pickWindows: { ncaaf: { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" } },
      }),
    ).rejects.toThrow("Pick windows are not available yet.");
    expect(upsertSelect).toHaveBeenCalledTimes(1);
  });

  it("reads a save body's pick windows: known sports, valid windows or null, never empty", () => {
    const window = { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" };
    expect(readGameSettingsChanges({ pickWindows: { ncaaf: window, nfl: null } })).toEqual({
      pickWindows: { ncaaf: window, nfl: null },
    });
    expect(readGameSettingsChanges({ cfbPickEmScoringMode: "standard", pickWindows: { nba: window } })).toEqual({
      cfbPickEmScoringMode: "standard",
      pickWindows: { nba: window },
    });
    expect(readGameSettingsChanges({ pickWindows: {} })).toBeNull();
    expect(readGameSettingsChanges({ pickWindows: { curling: window } })).toBeNull();
    expect(readGameSettingsChanges({ pickWindows: { ncaaf: { ...window, openTime: "24:00" } } })).toBeNull();
    expect(readGameSettingsChanges({ pickWindows: { ncaaf: { ...window, closeDay: "mon", closeTime: "00:00" } } })).toBeNull();
    expect(readGameSettingsChanges({ pickWindows: [window] })).toBeNull();
    // A bad window refuses the whole body, even beside a valid mode.
    expect(readGameSettingsChanges({ nflPickEmScoringMode: "spread", pickWindows: { ncaaf: "mon" } })).toBeNull();
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
