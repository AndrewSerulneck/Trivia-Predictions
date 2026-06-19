import { describe, expect, it } from "vitest";
import {
  calculateDistanceMeters,
  getGeofenceThresholdMeters,
  isValidGeofenceCoordinates,
  MIN_VENUE_GEOFENCE_RADIUS_METERS,
} from "@/lib/geofence";

describe("MIN_VENUE_GEOFENCE_RADIUS_METERS", () => {
  it("is 300 meters", () => {
    expect(MIN_VENUE_GEOFENCE_RADIUS_METERS).toBe(300);
  });
});

describe("calculateDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(calculateDistanceMeters({ latitude: 40, longitude: -74 }, { latitude: 40, longitude: -74 })).toBe(0);
  });

  it("returns a positive distance between different coordinates", () => {
    const d = calculateDistanceMeters({ latitude: 40, longitude: -74 }, { latitude: 40.003, longitude: -74 });
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(360);
  });

  it("is symmetric", () => {
    const a = { latitude: 40, longitude: -74 };
    const b = { latitude: 41, longitude: -74 };
    expect(calculateDistanceMeters(a, b)).toBeCloseTo(calculateDistanceMeters(b, a), 5);
  });

  it("returns approximately 111km per degree of latitude", () => {
    const d = calculateDistanceMeters({ latitude: 40, longitude: -74 }, { latitude: 41, longitude: -74 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(113_000);
  });
});

describe("isValidGeofenceCoordinates", () => {
  it("accepts typical coordinates", () => {
    expect(isValidGeofenceCoordinates({ latitude: 40, longitude: -74 })).toBe(true);
  });

  it("accepts boundary extremes", () => {
    expect(isValidGeofenceCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidGeofenceCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
    expect(isValidGeofenceCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it("rejects latitude out of range", () => {
    expect(isValidGeofenceCoordinates({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGeofenceCoordinates({ latitude: -91, longitude: 0 })).toBe(false);
  });

  it("rejects longitude out of range", () => {
    expect(isValidGeofenceCoordinates({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidGeofenceCoordinates({ latitude: 0, longitude: -181 })).toBe(false);
  });

  it("rejects NaN coordinates", () => {
    expect(isValidGeofenceCoordinates({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidGeofenceCoordinates({ latitude: 0, longitude: NaN })).toBe(false);
  });
});

describe("getGeofenceThresholdMeters", () => {
  it("enforces the 300m minimum when venue radius is smaller", () => {
    expect(getGeofenceThresholdMeters(100, 25)).toBe(420); // 300 + 120 (buffer floor)
    expect(getGeofenceThresholdMeters(0, 25)).toBe(420);   // 300 + 120
  });

  it("uses the venue radius when it exceeds 300m", () => {
    expect(getGeofenceThresholdMeters(750, 40)).toBe(870); // 750 + 120
    expect(getGeofenceThresholdMeters(600, 25)).toBe(720); // 600 + 120
  });

  it("uses the default accuracy buffer when accuracy is not provided", () => {
    expect(getGeofenceThresholdMeters(100, undefined)).toBe(620); // 300 + 320 (default)
  });

  it("clamps accuracy buffer to a minimum of 120m for high-quality GPS", () => {
    expect(getGeofenceThresholdMeters(100, 10)).toBe(420); // 300 + max(120, 15)
    expect(getGeofenceThresholdMeters(100, 80)).toBe(420); // 300 + max(120, 120)
  });

  it("clamps accuracy buffer to 5000m for very poor GPS", () => {
    expect(getGeofenceThresholdMeters(100, 4000)).toBe(5300); // 300 + min(5000, 6000)
    expect(getGeofenceThresholdMeters(100, 3334)).toBe(5300); // 300 + min(5000, 5001)
  });

  it("adds a proportional buffer for moderate GPS accuracy", () => {
    expect(getGeofenceThresholdMeters(100, 200)).toBe(600); // 300 + round(200*1.5)=300
  });
});
