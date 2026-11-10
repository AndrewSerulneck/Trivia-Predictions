import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));

import {
  VENUE_PRESENCE_TTL_MS,
  getActiveVenuePresence,
  getVenuePresenceTuningConfig,
  isVenuePresenceLive,
  presenceRowAllowsPlay,
} from "@/lib/venuePresence";

// R10 (away-mode plan, third review finding 8): writes and Category Blitz decide "at the bar" with one rule,
// presenceRowAllowsPlay — an `active` row whose lease hasn't ended. Neither adds a grace of its own.

const NOW = "2026-11-10T16:00:00.000Z";
const NOW_MS = Date.parse(NOW);

type Row = { status: string; expires_at: string; last_verified_at: string | null };

const ROWS: Array<{ name: string; row: Row; allowed: boolean }> = [
  { name: "active, inside its lease", row: { status: "active", expires_at: "2026-11-10T16:05:00.000Z", last_verified_at: "2026-11-10T15:49:00.000Z" }, allowed: true },
  { name: "active, 1 ms left", row: { status: "active", expires_at: "2026-11-10T16:00:00.001Z", last_verified_at: "2026-11-10T15:44:00.001Z" }, allowed: true },
  { name: "active, lease ends now", row: { status: "active", expires_at: NOW, last_verified_at: "2026-11-10T15:44:00.000Z" }, allowed: false },
  { name: "active, past its lease", row: { status: "active", expires_at: "2026-11-10T15:59:00.000Z", last_verified_at: "2026-11-10T15:43:00.000Z" }, allowed: false },
  { name: "active, unreadable lease", row: { status: "active", expires_at: "not-a-date", last_verified_at: null }, allowed: false },
  { name: "expired, checked in 5 min ago", row: { status: "expired", expires_at: "2026-11-10T15:59:00.000Z", last_verified_at: "2026-11-10T15:55:00.000Z" }, allowed: false },
  { name: "expired, future expires_at", row: { status: "expired", expires_at: "2026-11-10T16:10:00.000Z", last_verified_at: "2026-11-10T15:54:00.000Z" }, allowed: false },
  { name: "out of range", row: { status: "out_of_range", expires_at: "2026-11-10T16:10:00.000Z", last_verified_at: "2026-11-10T15:59:00.000Z" }, allowed: false },
  { name: "location unavailable", row: { status: "location_unavailable", expires_at: "2026-11-10T16:10:00.000Z", last_verified_at: "2026-11-10T15:59:00.000Z" }, allowed: false },
  { name: "revoked", row: { status: "revoked", expires_at: "2026-11-10T16:10:00.000Z", last_verified_at: "2026-11-10T15:59:00.000Z" }, allowed: false },
];

const maybeSingle = <T>(data: T) => {
  const chain = { eq: vi.fn(), maybeSingle: vi.fn() };
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data, error: null });
  return chain;
};

const installRow = (row: Row | null) => {
  mocks.from.mockImplementation((table: string) => {
    if (table === "users") return { select: vi.fn().mockReturnValue(maybeSingle({ account_id: null })) };
    if (table === "venue_presence_sessions") {
      return {
        select: vi.fn().mockReturnValue(maybeSingle(row ? { id: "p1", user_id: "user-1", venue_id: "venue-1", last_distance_meters: 10, last_accuracy_meters: 20, ...row } : null)),
        upsert: vi.fn(async () => ({ data: null, error: null })),
      };
    }
    if (table === "venue_presence_events") return { insert: vi.fn(async () => ({ data: null, error: null })) };
    throw new Error(`Unexpected table: ${table}`);
  });
};

describe("presenceRowAllowsPlay", () => {
  it.each(ROWS)("$name → $allowed", ({ row, allowed }) => {
    expect(presenceRowAllowsPlay(row as Parameters<typeof presenceRowAllowsPlay>[0], NOW_MS)).toBe(allowed);
  });
});

describe("writes and Category Blitz agree on every row", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it.each(ROWS)("$name", async ({ row, allowed }) => {
    installRow(row);
    const write = await getActiveVenuePresence({ userId: "user-1", venueId: "venue-1" });
    installRow(row);
    const live = await isVenuePresenceLive({ userId: "user-1", venueId: "venue-1" });
    expect(write.ok).toBe(allowed);
    expect(live).toBe(allowed);
  });

  it("no row is neither", async () => {
    installRow(null);
    expect((await getActiveVenuePresence({ userId: "user-1", venueId: "venue-1" })).ok).toBe(false);
    installRow(null);
    expect(await isVenuePresenceLive({ userId: "user-1", venueId: "venue-1" })).toBe(false);
  });
});

describe("the lease outlives the heartbeat (contract)", () => {
  const boundary = readFileSync(join(process.cwd(), "components/venue/VenuePresenceBoundary.tsx"), "utf8");
  const match = boundary.match(/const PRESENCE_CHECK_INTERVAL_MS = (\d+) \* 60 \* 1000;/);

  it("TTL is exactly 1 minute longer than PRESENCE_CHECK_INTERVAL_MS", () => {
    expect(match).not.toBeNull();
    const intervalMs = Number(match?.[1]) * 60 * 1000;
    expect(VENUE_PRESENCE_TTL_MS - intervalMs).toBe(60 * 1000);
  });

  it("the env clamp allows the default lease", () => {
    const original = process.env.VENUE_PRESENCE_TTL_MS;
    delete process.env.VENUE_PRESENCE_TTL_MS;
    try {
      expect(getVenuePresenceTuningConfig().ttlMs).toBe(VENUE_PRESENCE_TTL_MS);
      process.env.VENUE_PRESENCE_TTL_MS = String(VENUE_PRESENCE_TTL_MS);
      expect(getVenuePresenceTuningConfig().ttlMs).toBe(VENUE_PRESENCE_TTL_MS);
    } finally {
      if (original === undefined) delete process.env.VENUE_PRESENCE_TTL_MS;
      else process.env.VENUE_PRESENCE_TTL_MS = original;
    }
  });
});
