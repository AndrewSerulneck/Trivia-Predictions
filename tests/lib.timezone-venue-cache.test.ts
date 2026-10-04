import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getVenueTimezone (lib/timezone.ts) is the ONE venue-timezone reader — the
// review-fixes plan Phase 1 (F8) deleted a second copy in lib/challengeCampaigns.ts
// that cached forever and didn't trim. The point-accrual and Rewards-snapshot paths
// call it on every award / 30-second poll, so successes are cached briefly; a
// failed read must never be cached.

const fake = vi.hoisted(() => {
  const state = {
    reads: 0,
    row: { timezone: "America/Chicago" } as { timezone: string | null } | null,
    error: null as { message: string } | null,
  };
  const client = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => {
          state.reads += 1;
          return Promise.resolve({ data: state.error ? null : state.row, error: state.error });
        },
      };
      return builder;
    },
  };
  return { state, client };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: fake.client }));

import { VENUE_TIMEZONE_CACHE_TTL_MS, clearVenueTimezoneCache, getVenueTimezone } from "@/lib/timezone";

const START = new Date("2026-10-04T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  clearVenueTimezoneCache();
  fake.state.reads = 0;
  fake.state.row = { timezone: "America/Chicago" };
  fake.state.error = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getVenueTimezone", () => {
  it("reads once, then serves the cache until the TTL passes", async () => {
    expect(await getVenueTimezone("venue-1")).toBe("America/Chicago");
    expect(await getVenueTimezone("venue-1")).toBe("America/Chicago");
    expect(fake.state.reads).toBe(1);

    fake.state.row = { timezone: "America/Denver" };
    vi.setSystemTime(new Date(START.getTime() + VENUE_TIMEZONE_CACHE_TTL_MS + 1));
    expect(await getVenueTimezone("venue-1")).toBe("America/Denver");
    expect(fake.state.reads).toBe(2);
  });

  it("caches for at most ten minutes", () => {
    expect(VENUE_TIMEZONE_CACHE_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
  });

  it("trims, and defaults a blank or missing timezone to New York", async () => {
    fake.state.row = { timezone: "  America/Chicago  " };
    expect(await getVenueTimezone("venue-trim")).toBe("America/Chicago");
    fake.state.row = { timezone: "   " };
    expect(await getVenueTimezone("venue-blank")).toBe("America/New_York");
    fake.state.row = null;
    expect(await getVenueTimezone("venue-missing")).toBe("America/New_York");
  });

  it("does not cache a failed read — the next call retries", async () => {
    fake.state.error = { message: "boom" };
    expect(await getVenueTimezone("venue-1")).toBe("America/New_York");
    fake.state.error = null;
    expect(await getVenueTimezone("venue-1")).toBe("America/Chicago");
    expect(fake.state.reads).toBe(2);
  });

  it("never queries for a blank venue id", async () => {
    expect(await getVenueTimezone("  ")).toBe("America/New_York");
    expect(fake.state.reads).toBe(0);
  });
});
