import { describe, expect, it } from "vitest";
import { getGeofenceThresholdMeters, MIN_VENUE_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";

describe("geofence thresholds", () => {
  it("uses 500 meters as the minimum venue radius", () => {
    expect(MIN_VENUE_GEOFENCE_RADIUS_METERS).toBe(500);
    expect(getGeofenceThresholdMeters(100, 25)).toBe(620);
  });

  it("keeps larger venue radii and adds the location accuracy buffer", () => {
    expect(getGeofenceThresholdMeters(750, 40)).toBe(870);
  });
});
