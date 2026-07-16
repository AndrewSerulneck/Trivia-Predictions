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
  getActiveVenuePresence,
  isGodModeUser,
  maybeRequireActiveVenuePresence,
  verifyVenuePresenceLocation,
} from "@/lib/venuePresence";

const ORIGINAL_ENFORCEMENT = process.env.VENUE_PRESENCE_ENFORCEMENT;

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

/**
 * The god-mode lookup issues TWO queries: `users` (for `account_id`) and then
 * `accounts` (for `god_mode`). This installer wires both, plus the venue/lease/event
 * tables so the full non-god control flow also runs. `sessionsSelectShouldThrow` proves
 * the getActiveVenuePresence god short-circuit returns BEFORE the lease row is ever read.
 */
function installGodModeMocks(params: {
  accountId?: string | null;
  godMode?: boolean;
  belongs?: boolean;
  venue?: { id: string; latitude: number; longitude: number; radius: number } | null;
  writes?: Array<Record<string, unknown>>;
  eventWrites?: Array<Record<string, unknown>>;
  sessionsSelectShouldThrow?: boolean;
}) {
  const accountId = params.accountId === undefined ? "account-1" : params.accountId;
  const godMode = params.godMode ?? false;
  const venue = params.venue ?? { id: "venue-1", latitude: 40, longitude: -74, radius: 100 };
  const writes = params.writes ?? [];
  const eventWrites = params.eventWrites ?? [];

  mocks.from.mockImplementation((table: string) => {
    if (table === "users") {
      // Serves both isGodModeUser (select account_id) and userBelongsToVenue (select id).
      return {
        select: vi.fn().mockReturnValue(
          buildMaybeSingleChain({
            data: params.belongs === false ? null : { id: "user-x", account_id: accountId },
            error: null,
          })
        ),
      };
    }

    if (table === "accounts") {
      return {
        select: vi.fn().mockReturnValue(
          buildMaybeSingleChain({
            data: accountId ? { god_mode: godMode } : null,
            error: null,
          })
        ),
      };
    }

    if (table === "venues") {
      return {
        select: vi.fn().mockReturnValue(buildMaybeSingleChain({ data: venue, error: null })),
      };
    }

    if (table === "venue_presence_sessions") {
      return {
        select: vi.fn(() => {
          if (params.sessionsSelectShouldThrow) {
            throw new Error("venue_presence_sessions must not be read for a god account");
          }
          return buildMaybeSingleChain({ data: null, error: null });
        }),
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

beforeEach(() => {
  mocks.from.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T16:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_ENFORCEMENT === undefined) {
    delete process.env.VENUE_PRESENCE_ENFORCEMENT;
  } else {
    process.env.VENUE_PRESENCE_ENFORCEMENT = ORIGINAL_ENFORCEMENT;
  }
});

describe("isGodModeUser lookup", () => {
  it("returns true when the linked account has god_mode", async () => {
    installGodModeMocks({ accountId: "account-god", godMode: true });
    expect(await isGodModeUser("god-lookup-true")).toBe(true);
  });

  it("returns false when the linked account is not god mode", async () => {
    installGodModeMocks({ accountId: "account-normal", godMode: false });
    expect(await isGodModeUser("god-lookup-false")).toBe(false);
  });

  it("fails closed to false when the user has no linked account_id", async () => {
    installGodModeMocks({ accountId: null });
    expect(await isGodModeUser("god-lookup-null-account")).toBe(false);
  });
});

describe("god mode presence bypass", () => {
  it("keeps a god account active on a heartbeat from far outside the venue", async () => {
    const { writes } = installGodModeMocks({ accountId: "account-god", godMode: true, writes: [] });

    // ~5.5km north of the venue — comfortably out of any geofence radius.
    const result = await verifyVenuePresenceLocation({
      userId: "god-heartbeat-far",
      venueId: "venue-1",
      location: { latitude: 40.05, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      status: "active",
      expiresAt: "2026-07-14T16:15:00.000Z",
      lastVerifiedAt: "2026-07-14T16:00:00.000Z",
    });
    // A verified lease is still written for diagnostics coherence.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      user_id: "god-heartbeat-far",
      venue_id: "venue-1",
      status: "active",
      source: "heartbeat",
    });
  });

  it("returns active from getActiveVenuePresence without ever reading the lease row", async () => {
    installGodModeMocks({
      accountId: "account-god",
      godMode: true,
      sessionsSelectShouldThrow: true,
    });

    const result = await getActiveVenuePresence({
      userId: "god-active-no-lease",
      venueId: "venue-1",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      status: "active",
      expiresAt: "2026-07-14T16:15:00.000Z",
    });
  });

  it("passes the mutation guard for a god account with no lease and enforcement on", async () => {
    process.env.VENUE_PRESENCE_ENFORCEMENT = "1";
    installGodModeMocks({
      accountId: "account-god",
      godMode: true,
      sessionsSelectShouldThrow: true,
    });

    const result = await maybeRequireActiveVenuePresence({
      userId: "god-mutation-guard",
      venueId: "venue-1",
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({ ok: true, status: "active" });
  });
});

describe("non-god enforcement is not weakened by the bypass", () => {
  it("still blocks a non-god user who is far outside the venue", async () => {
    const { writes } = installGodModeMocks({
      accountId: "account-normal",
      godMode: false,
      writes: [],
    });

    const result = await verifyVenuePresenceLocation({
      userId: "normal-far",
      venueId: "venue-1",
      location: { latitude: 40.05, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VENUE_OUT_OF_RANGE", status: "out_of_range" });
    expect(writes[0]).toMatchObject({ status: "out_of_range" });
  });

  it("still keeps a non-god user in range active", async () => {
    installGodModeMocks({ accountId: "account-normal", godMode: false });

    const result = await verifyVenuePresenceLocation({
      userId: "normal-in-range",
      venueId: "venue-1",
      location: { latitude: 40, longitude: -74, accuracy: 25 },
      source: "heartbeat",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ status: "active" });
  });
});
