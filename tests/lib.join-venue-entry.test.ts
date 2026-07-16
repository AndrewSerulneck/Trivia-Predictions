import { describe, expect, it, vi } from "vitest";
import { resolveVenueProfileServerFirst } from "@/lib/joinVenueEntry";
import type { Coordinates } from "@/lib/geolocation";
import type { User, Venue } from "@/types";

const venue: Venue = {
  id: "venue-anywhere",
  name: "Anywhere Venue",
  latitude: 40,
  longitude: -74,
  radius: 100,
};

const user: User = {
  id: "user-god-mode",
  username: "Andrew",
  venueId: venue.id,
  points: 0,
};

const location: Coordinates = {
  latitude: 41,
  longitude: -74,
  accuracy: 25,
};

describe("resolveVenueProfileServerFirst", () => {
  it("does not call browser geofence when the server resolves the venue immediately", async () => {
    const resolveProfile = vi.fn<(profileLocation?: Coordinates) => Promise<User>>().mockResolvedValue(user);
    const verifyVenueAccess = vi.fn().mockResolvedValue({ allowed: true, location });

    const result = await resolveVenueProfileServerFirst({
      selectedVenue: venue,
      resolveProfile,
      verifyVenueAccess,
    });

    expect(result).toBe(user);
    expect(resolveProfile).toHaveBeenCalledTimes(1);
    expect(resolveProfile).toHaveBeenCalledWith(undefined);
    expect(verifyVenueAccess).not.toHaveBeenCalled();
  });

  it("runs browser geofence and retries only after the server says location is required", async () => {
    const resolveProfile = vi
      .fn<(profileLocation?: Coordinates) => Promise<User>>()
      .mockRejectedValueOnce(new Error("Location verification is required to enter this venue."))
      .mockResolvedValueOnce(user);
    const verifyVenueAccess = vi.fn().mockResolvedValue({ allowed: true, location });

    const result = await resolveVenueProfileServerFirst({
      selectedVenue: venue,
      resolveProfile,
      verifyVenueAccess,
    });

    expect(result).toBe(user);
    expect(verifyVenueAccess).toHaveBeenCalledTimes(1);
    expect(verifyVenueAccess).toHaveBeenCalledWith(venue);
    expect(resolveProfile).toHaveBeenCalledTimes(2);
    expect(resolveProfile).toHaveBeenNthCalledWith(1, undefined);
    expect(resolveProfile).toHaveBeenNthCalledWith(2, location);
  });

  it("returns null when a normal user is blocked by the fallback browser geofence", async () => {
    const onLocationBlocked = vi.fn();
    const resolveProfile = vi
      .fn<(profileLocation?: Coordinates) => Promise<User>>()
      .mockRejectedValueOnce(new Error("Location verification is required to enter this venue."));
    const verifyVenueAccess = vi.fn().mockResolvedValue({ allowed: false });

    const result = await resolveVenueProfileServerFirst({
      selectedVenue: venue,
      resolveProfile,
      verifyVenueAccess,
      onLocationBlocked,
    });

    expect(result).toBeNull();
    expect(verifyVenueAccess).toHaveBeenCalledTimes(1);
    expect(resolveProfile).toHaveBeenCalledTimes(1);
    expect(onLocationBlocked).toHaveBeenCalledTimes(1);
  });

  it("propagates non-location server errors without calling browser geofence", async () => {
    const error = new Error("Account not found.");
    const resolveProfile = vi.fn<(profileLocation?: Coordinates) => Promise<User>>().mockRejectedValue(error);
    const verifyVenueAccess = vi.fn().mockResolvedValue({ allowed: true, location });

    await expect(
      resolveVenueProfileServerFirst({
        selectedVenue: venue,
        resolveProfile,
        verifyVenueAccess,
      })
    ).rejects.toThrow("Account not found.");

    expect(verifyVenueAccess).not.toHaveBeenCalled();
  });

  it("does not loop when location was already supplied and the server still rejects it", async () => {
    const resolveProfile = vi
      .fn<(profileLocation?: Coordinates) => Promise<User>>()
      .mockRejectedValue(new Error("Location verification is required to enter this venue."));
    const verifyVenueAccess = vi.fn().mockResolvedValue({ allowed: true, location });

    await expect(
      resolveVenueProfileServerFirst({
        selectedVenue: venue,
        location,
        resolveProfile,
        verifyVenueAccess,
      })
    ).rejects.toThrow("Location verification is required");

    expect(resolveProfile).toHaveBeenCalledTimes(1);
    expect(resolveProfile).toHaveBeenCalledWith(location);
    expect(verifyVenueAccess).not.toHaveBeenCalled();
  });
});
