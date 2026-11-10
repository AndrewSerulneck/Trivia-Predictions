import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));

import { isVenuePresenceLive, verifyVenuePresenceLocation } from "@/lib/venuePresence";

// "Your bars" reads `venue_presence_sessions.last_verified_at` as the last check-in (away-mode plan D6).
// A failed check (away, or no location) must keep it; only a passed check moves it.

const maybeSingle = <T>(data: T) => {
  const chain = { eq: vi.fn(), maybeSingle: vi.fn() };
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data, error: null });
  return chain;
};

const install = (writes: Array<Record<string, unknown>>) => {
  mocks.from.mockImplementation((table: string) => {
    if (table === "users") return { select: vi.fn().mockReturnValue(maybeSingle({ id: "user-1", account_id: null })) };
    if (table === "venues") {
      return { select: vi.fn().mockReturnValue(maybeSingle({ id: "venue-1", latitude: 40, longitude: -74, radius: 100 })) };
    }
    if (table === "venue_presence_sessions") {
      return {
        upsert: vi.fn(async (payload: Record<string, unknown>) => {
          writes.push(payload);
          return { data: payload, error: null };
        }),
      };
    }
    if (table === "venue_presence_events") return { insert: vi.fn(async () => ({ data: null, error: null })) };
    throw new Error(`Unexpected table: ${table}`);
  });
};

describe("presence check-in time", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T16:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("a failed check away from the bar leaves the last check-in alone", async () => {
    const writes: Array<Record<string, unknown>> = [];
    install(writes);
    const result = await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 41, longitude: -74, accuracy: 20 },
    });
    expect(result.ok).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ status: "out_of_range" });
    expect(writes[0]).not.toHaveProperty("last_verified_at");
  });

  it("a check with no location leaves the last check-in alone", async () => {
    const writes: Array<Record<string, unknown>> = [];
    install(writes);
    await verifyVenuePresenceLocation({ userId: "user-1", venueId: "venue-1" });
    expect(writes[0]).toMatchObject({ status: "location_unavailable" });
    expect(writes[0]).not.toHaveProperty("last_verified_at");
  });

  it("a passed check records the check-in", async () => {
    const writes: Array<Record<string, unknown>> = [];
    install(writes);
    await verifyVenuePresenceLocation({
      userId: "user-1",
      venueId: "venue-1",
      location: { latitude: 40, longitude: -74, accuracy: 20 },
    });
    expect(writes[0]).toMatchObject({ status: "active", last_verified_at: "2026-11-09T16:00:00.000Z" });
  });
});

describe("isVenuePresenceLive (read-only, for polls)", () => {
  const writes: string[] = [];
  const installRow = (row: { status: string; expires_at: string } | null) => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "users") return { select: vi.fn().mockReturnValue(maybeSingle({ account_id: null })) };
      if (table === "venue_presence_sessions") return { select: vi.fn().mockReturnValue(maybeSingle(row)) };
      writes.push(table);
      throw new Error(`Unexpected table: ${table}`);
    });
  };
  beforeEach(() => {
    mocks.from.mockReset();
    writes.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T16:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("is true only for an active lease that hasn't ended (R10: no grace)", async () => {
    installRow({ status: "active", expires_at: "2026-11-09T16:11:00.000Z" });
    await expect(isVenuePresenceLive({ userId: "user-2", venueId: "venue-1" })).resolves.toBe(true);
  });

  it("is false away, with location off, lapsed, or never checked in, and never writes", async () => {
    for (const row of [
      { status: "out_of_range", expires_at: "2026-11-09T16:10:00.000Z" },
      { status: "location_unavailable", expires_at: "2026-11-09T16:10:00.000Z" },
      { status: "expired", expires_at: "2026-11-09T15:59:00.000Z" },
      { status: "active", expires_at: "2026-11-09T15:59:59.000Z" },
      null,
    ]) {
      installRow(row);
      await expect(isVenuePresenceLive({ userId: "user-2", venueId: "venue-1" })).resolves.toBe(false);
    }
    expect(writes).toEqual([]);
  });
});
