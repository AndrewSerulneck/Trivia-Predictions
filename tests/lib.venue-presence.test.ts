import { afterEach, describe, expect, it } from "vitest";
import {
  getVenuePresenceThresholdMeters,
  getVenuePresenceTuningConfig,
  getVenuePresenceTtlMs,
  isVenuePresenceMutationEnforcementEnabled,
} from "@/lib/venuePresence";

const ORIGINAL_ENFORCEMENT = process.env.VENUE_PRESENCE_ENFORCEMENT;
const ORIGINAL_TTL_MS = process.env.VENUE_PRESENCE_TTL_MS;
const ORIGINAL_MIN_RADIUS = process.env.VENUE_PRESENCE_MIN_RADIUS_METERS;
const ORIGINAL_BUFFER_MIN = process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS;
const ORIGINAL_BUFFER_DEFAULT = process.env.VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS;
const ORIGINAL_BUFFER_MAX = process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS;
const ORIGINAL_MULTIPLIER = process.env.VENUE_PRESENCE_ACCURACY_MULTIPLIER;
const ORIGINAL_FALSE_POSITIVE_WINDOW = process.env.VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

afterEach(() => {
  restoreEnv("VENUE_PRESENCE_ENFORCEMENT", ORIGINAL_ENFORCEMENT);
  restoreEnv("VENUE_PRESENCE_TTL_MS", ORIGINAL_TTL_MS);
  restoreEnv("VENUE_PRESENCE_MIN_RADIUS_METERS", ORIGINAL_MIN_RADIUS);
  restoreEnv("VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS", ORIGINAL_BUFFER_MIN);
  restoreEnv("VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS", ORIGINAL_BUFFER_DEFAULT);
  restoreEnv("VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS", ORIGINAL_BUFFER_MAX);
  restoreEnv("VENUE_PRESENCE_ACCURACY_MULTIPLIER", ORIGINAL_MULTIPLIER);
  restoreEnv("VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS", ORIGINAL_FALSE_POSITIVE_WINDOW);
});

describe("venue presence mutation enforcement flag", () => {
  it("requires an explicit on value", () => {
    delete process.env.VENUE_PRESENCE_ENFORCEMENT;
    expect(isVenuePresenceMutationEnforcementEnabled()).toBe(false);

    process.env.VENUE_PRESENCE_ENFORCEMENT = "1";
    expect(isVenuePresenceMutationEnforcementEnabled()).toBe(true);

    process.env.VENUE_PRESENCE_ENFORCEMENT = "true";
    expect(isVenuePresenceMutationEnforcementEnabled()).toBe(true);
  });

  it("keeps explicit off values disabled", () => {
    process.env.VENUE_PRESENCE_ENFORCEMENT = "0";
    expect(isVenuePresenceMutationEnforcementEnabled()).toBe(false);

    process.env.VENUE_PRESENCE_ENFORCEMENT = "false";
    expect(isVenuePresenceMutationEnforcementEnabled()).toBe(false);
  });
});

describe("venue presence production tuning", () => {
  it("uses the phase 5 threshold defaults when no tuning env is set", () => {
    delete process.env.VENUE_PRESENCE_MIN_RADIUS_METERS;
    delete process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS;
    delete process.env.VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS;
    delete process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS;
    delete process.env.VENUE_PRESENCE_ACCURACY_MULTIPLIER;

    expect(getVenuePresenceThresholdMeters(100, 25)).toBe(420);
    expect(getVenuePresenceThresholdMeters(100, undefined)).toBe(620);
    expect(getVenuePresenceThresholdMeters(100, 4000)).toBe(5300);
  });

  it("allows production threshold tuning without changing client geofence math", () => {
    process.env.VENUE_PRESENCE_MIN_RADIUS_METERS = "450";
    process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS = "160";
    process.env.VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS = "375";
    process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS = "900";
    process.env.VENUE_PRESENCE_ACCURACY_MULTIPLIER = "2";

    expect(getVenuePresenceThresholdMeters(100, 25)).toBe(610);
    expect(getVenuePresenceThresholdMeters(100, undefined)).toBe(825);
    expect(getVenuePresenceThresholdMeters(100, 1000)).toBe(1350);
  });

  it("clamps unsafe tuning values to bounded production ranges", () => {
    process.env.VENUE_PRESENCE_TTL_MS = "1";
    process.env.VENUE_PRESENCE_MIN_RADIUS_METERS = "10";
    process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS = "999999";
    process.env.VENUE_PRESENCE_ACCURACY_MULTIPLIER = "99";
    process.env.VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS = "1";

    const config = getVenuePresenceTuningConfig();
    expect(getVenuePresenceTtlMs()).toBe(30_000);
    expect(config.minRadiusMeters).toBe(100);
    expect(config.accuracyBufferMaxMeters).toBe(20_000);
    expect(config.accuracyMultiplier).toBe(5);
    expect(config.falsePositiveWindowMs).toBe(60_000);
  });
});
