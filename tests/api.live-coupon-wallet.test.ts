import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/reward-live-redemption-plan.md Phase 2: the wallet response carries the SERVER's time and
// the venue's name for the live coupon — with zero extra requests, and at most one cheap venues
// read per server instance per 10 minutes.

const state = vi.hoisted(() => ({
  row: null as { name: string | null; display_name: string | null } | null,
  error: null as { message: string } | null,
  reads: 0,
  wins: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "venues") throw new Error(`unexpected table ${table}`);
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => {
          state.reads += 1;
          return Promise.resolve({ data: state.row, error: state.error });
        },
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  claimChallengeCampaignPrize: vi.fn(),
  listChallengeCampaignWinsForUser: async () => state.wins,
}));
vi.mock("@/lib/rewards", () => ({ attachRewardWinDescriptions: async (wins: unknown[]) => wins }));

import { GET } from "@/app/api/challenge-campaigns/redeem/route";
import {
  VENUE_NAME_CACHE_TTL_MS,
  clearVenueDisplayNameCache,
  getVenueDisplayName,
} from "@/lib/venueDisplayName";

const NOW = new Date("2026-10-05T18:30:00.000Z");
const wallet = () => GET(new Request("http://localhost/api/challenge-campaigns/redeem?userId=u1&venueId=venue-1"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  clearVenueDisplayNameCache();
  state.row = { name: "tap-room", display_name: "The Tap Room" };
  state.error = null;
  state.reads = 0;
  state.wins = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/challenge-campaigns/redeem — live coupon fields", () => {
  it("carries the server's time and the venue's name next to the wins", async () => {
    state.wins = [{ challengeId: "camp-1" }];
    const body = (await (await wallet()).json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      wins: [{ challengeId: "camp-1" }],
      serverNowMs: NOW.getTime(),
      venueName: "The Tap Room",
    });
  });

  it("still answers when the venue name can't be read", async () => {
    state.error = { message: "boom" };
    const body = (await (await wallet()).json()) as { ok: boolean; venueName: string | null };
    expect(body.ok).toBe(true);
    expect(body.venueName).toBeNull();
  });
});

describe("getVenueDisplayName", () => {
  it("prefers the display name, then the plain name", async () => {
    expect(await getVenueDisplayName("venue-1")).toBe("The Tap Room");
    clearVenueDisplayNameCache();
    state.row = { name: "tap-room", display_name: "  " };
    expect(await getVenueDisplayName("venue-1")).toBe("tap-room");
  });

  it("reads once per instance inside the TTL, and again after it", async () => {
    await getVenueDisplayName("venue-1");
    await getVenueDisplayName("venue-1");
    vi.setSystemTime(new Date(NOW.getTime() + VENUE_NAME_CACHE_TTL_MS - 1));
    await getVenueDisplayName("venue-1");
    expect(state.reads).toBe(1);

    vi.setSystemTime(new Date(NOW.getTime() + VENUE_NAME_CACHE_TTL_MS));
    await getVenueDisplayName("venue-1");
    expect(state.reads).toBe(2);
  });

  it("never caches a failed read — the next call retries", async () => {
    state.error = { message: "boom" };
    expect(await getVenueDisplayName("venue-1")).toBeNull();
    state.error = null;
    expect(await getVenueDisplayName("venue-1")).toBe("The Tap Room");
    expect(state.reads).toBe(2);
  });

  it("returns null for a blank id without touching the database", async () => {
    expect(await getVenueDisplayName("  ")).toBeNull();
    expect(state.reads).toBe(0);
  });

  it("returns null for a venue that has no row", async () => {
    state.row = null;
    expect(await getVenueDisplayName("venue-1")).toBeNull();
  });
});
