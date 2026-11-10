import { describe, expect, it, vi } from "vitest";
import { AWAY_PLAY_LABEL, playWhenPresent, venueDirectionsUrl } from "@/lib/venueAwayMode";

// Away mode (away-mode plan, Phase C1): nothing is played from Venue Home while away.
describe("playWhenPresent", () => {
  it("plays straight away at the bar, with no location check", async () => {
    const recheck = vi.fn(async () => true);
    const play = vi.fn();
    await expect(playWhenPresent(false, recheck, play)).resolves.toBe(true);
    expect(recheck).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledOnce();
  });

  it("away, never plays when the one re-check says the player is still away", async () => {
    const recheck = vi.fn(async () => false);
    const play = vi.fn();
    await expect(playWhenPresent(true, recheck, play)).resolves.toBe(false);
    expect(recheck).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
  });

  it("away, never plays when the re-check fails", async () => {
    const play = vi.fn();
    await expect(playWhenPresent(true, () => Promise.reject(new Error("no gps")), play)).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("away, plays once the re-check finds the player at the bar", async () => {
    const play = vi.fn();
    await expect(playWhenPresent(true, async () => true, play)).resolves.toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });

  it("labels play controls minimally", () => {
    expect(AWAY_PLAY_LABEL).toBe("Play at the bar");
  });
});

describe("venueDirectionsUrl", () => {
  it("points Google Maps directions at the bar's geofence centre", () => {
    expect(venueDirectionsUrl({ latitude: 40.68, longitude: -73.97 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=40.68%2C-73.97"
    );
  });

  it("adds the place id when there is one", () => {
    expect(venueDirectionsUrl({ latitude: 1, longitude: 2, placeId: "ChIJabc" })).toContain("destination_place_id=ChIJabc");
  });

  it("is null without coordinates", () => {
    expect(venueDirectionsUrl({ latitude: Number.NaN, longitude: 2 })).toBeNull();
  });
});
