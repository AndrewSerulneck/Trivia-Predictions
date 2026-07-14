import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  VENUE_PRESENCE_TTL_MS,
  getActiveVenuePresence,
  verifyVenuePresenceLocation,
} from "@/lib/venuePresence";
import {
  buildVenuePresenceFailure,
  mapVenuePresenceFailureToOverlay,
} from "@/lib/venuePresenceClient";

function buildMaybeSingleChain<T>(result: {
  data: T;
  error: { message?: string; code?: string } | null;
}) {
  const chain = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

function installPresenceVerificationMocks(params: {
  venue?: { id: string; latitude: number; longitude: number; radius: number } | null;
  belongs?: boolean;
  writes?: Array<Record<string, unknown>>;
  eventWrites?: Array<Record<string, unknown>>;
}) {
  const venue = params.venue ?? {
    id: "venue-1",
    latitude: 40,
    longitude: -74,
    radius: 100,
  };
  const writes = params.writes ?? [];
  const eventWrites = params.eventWrites ?? [];

  mocks.from.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        select: vi.fn().mockReturnValue(
          buildMaybeSingleChain({
            data: params.belongs === false ? null : { id: "user-1" },
            error: null,
          })
        ),
      };
    }

    if (table === "venues") {
      return {
        select: vi.fn().mockReturnValue(
          buildMaybeSingleChain({
            data: venue,
            error: null,
          })
        ),
      };
    }

    if (table === "venue_presence_sessions") {
      return {
        upsert: vi.fn(async (payload: Record<string, unknown>) => {
          writes.push(payload);
          return { data: payload, error: null };
        }),
      };
    }

    if (table === "venue_presence_events") {
      return {
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          eventWrites.push(payload);
          return { data: payload, error: null };
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { writes, eventWrites };
}

describe("venue presence phase 5 QA matrix", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps access active for an in-range mocked location", async () => {
    const { eventWrites, writes } = installPresenceVerificationMocks({ eventWrites: [], writes: [] });

    const result = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      status: "active",
      distanceMeters: 0,
      allowedDistanceMeters: 420,
      accuracyMeters: 25,
      lastVerifiedAt: "2026-07-13T16:00:00.000Z",
      expiresAt: "2026-07-13T16:03:00.000Z",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      user_id: "user-1",
      venue_id: "venue-1",
      status: "active",
      source: "heartbeat",
      last_distance_meters: 0,
      last_accuracy_meters: 25,
      expires_at: "2026-07-13T16:03:00.000Z",
    });
    expect(eventWrites).toHaveLength(1);
    expect(eventWrites[0]).toMatchObject({
      venue_id: "venue-1",
      event_type: "verified",
      status: "active",
      source: "heartbeat",
      distance_meters: 0,
      allowed_distance_meters: 420,
      accuracy_meters: 25,
      lease_ttl_ms: VENUE_PRESENCE_TTL_MS,
    });
  });

  it("marks access out of range after a mocked departure from the venue", async () => {
    const { eventWrites, writes } = installPresenceVerificationMocks({ eventWrites: [], writes: [] });

    const result = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40.01, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "VENUE_OUT_OF_RANGE",
      status: "out_of_range",
      allowedDistanceMeters: 420,
      accuracyMeters: 25,
    });
    expect(result.distanceMeters).toBeGreaterThan(result.allowedDistanceMeters ?? 0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      status: "out_of_range",
      source: "heartbeat",
      last_accuracy_meters: 25,
    });
    expect(eventWrites).toHaveLength(1);
    expect(eventWrites[0]).toMatchObject({
      venue_id: "venue-1",
      event_type: "out_of_range",
      presence_code: "VENUE_OUT_OF_RANGE",
      status: "out_of_range",
      source: "heartbeat",
      allowed_distance_meters: 420,
      accuracy_meters: 25,
    });
  });

  it("tolerates poor GPS accuracy when the expanded buffer still keeps the user in range", async () => {
    installPresenceVerificationMocks({ writes: [] });

    const result = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40.009, longitude: -74, accuracy: 700 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      status: "active",
      allowedDistanceMeters: 1350,
      accuracyMeters: 700,
    });
    expect(result.distanceMeters).toBeGreaterThan(900);
    expect(result.distanceMeters).toBeLessThan(result.allowedDistanceMeters ?? 0);
  });

  it("restores access on re-entry after a prior out-of-range heartbeat", async () => {
    const { writes } = installPresenceVerificationMocks({ writes: [] });

    const first = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40.01, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    vi.setSystemTime(new Date("2026-07-13T16:01:00.000Z"));

    const second = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(first.ok).toBe(false);
    expect(first).toMatchObject({ code: "VENUE_OUT_OF_RANGE", status: "out_of_range" });
    expect(second.ok).toBe(true);
    expect(second).toMatchObject({
      status: "active",
      lastVerifiedAt: "2026-07-13T16:01:00.000Z",
      expiresAt: "2026-07-13T16:04:00.000Z",
    });
    expect(writes.map((entry) => entry.status)).toEqual(["out_of_range", "active"]);
  });

  it("expires stale presence leases and persists the expired status", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const presenceSelect = buildMaybeSingleChain({
      data: {
        id: "presence-1",
        user_id: "user-1",
        venue_id: "venue-1",
        status: "active",
        expires_at: "2026-07-13T15:59:00.000Z",
        last_verified_at: "2026-07-13T15:56:30.000Z",
        last_distance_meters: 21,
        last_accuracy_meters: 18,
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "venue_presence_sessions") {
        return {
          select: vi.fn().mockReturnValue(presenceSelect),
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            writes.push(payload);
            return { data: payload, error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getActiveVenuePresence({
      userId: "user-1",
      venueId: "venue-1",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "VENUE_PRESENCE_EXPIRED",
      status: "expired",
      expiresAt: "2026-07-13T15:59:00.000Z",
      distanceMeters: 21,
      accuracyMeters: 18,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      user_id: "user-1",
      venue_id: "venue-1",
      status: "expired",
      source: "server",
      last_verified_at: "2026-07-13T15:56:30.000Z",
      last_distance_meters: 21,
      last_accuracy_meters: 18,
      expires_at: "2026-07-13T15:59:00.000Z",
    });
  });

  it("uses the shared TTL window for successful re-verification", async () => {
    installPresenceVerificationMocks({ writes: [] });

    const result = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`Expected active presence, received ${result.code}`);
    }
    expect(Date.parse(result.expiresAt) - Date.parse(result.lastVerifiedAt)).toBe(VENUE_PRESENCE_TTL_MS);
  });
});

describe("venue presence client-safe overlay mapping", () => {
  it("maps denied location permission into the friendly location-off overlay", () => {
    const overlay = mapVenuePresenceFailureToOverlay(
      buildVenuePresenceFailure("VENUE_LOCATION_UNAVAILABLE"),
      { permissionDenied: true }
    );

    expect(overlay).toEqual({
      kind: "location_off",
      title: "Location access is off",
      body: "To keep playing, turn location access back on and recheck from inside the venue.",
      primaryLabel: "Recheck Location",
      primaryAction: "recheck",
    });
  });

  it("maps temporary verification uncertainty into the checking overlay", () => {
    const overlay = mapVenuePresenceFailureToOverlay(
      buildVenuePresenceFailure("VENUE_PRESENCE_UNAVAILABLE")
    );

    expect(overlay).toEqual({
      kind: "checking",
      title: "Checking your venue access",
      body: "We're having trouble confirming you're still at the venue. Stay nearby while we recheck your location.",
      primaryLabel: "Recheck Location",
      primaryAction: "recheck",
    });
  });
});
