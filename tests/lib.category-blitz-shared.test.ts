import { afterEach, describe, expect, it } from "vitest";
import {
  categoryBlitzChannelName,
  isGlobalRoomEnabled,
  nextRoundStartAtMs,
} from "@/lib/categoryBlitzShared";
import { CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID, resolveCategoryBlitzRoomId } from "@/lib/categoryBlitzRoom";

// Regression coverage for the Phase 7 collapse (4 near-duplicate branches → 2):
// resolve { roundDurationSeconds, intermissionSeconds } once, then apply a
// single scored/unscored formula. These cases enumerate the original 4
// branches (continuous × scored/unscored, scheduled × scored/unscored) and
// pin their expected output so a future edit can't silently change the math.
describe("nextRoundStartAtMs", () => {
  const startedAt = "2026-07-02T20:00:00.000Z";
  const scoredAt = "2026-07-02T20:03:05.000Z";

  it("continuous timing, scored round: scoredAt + continuous intermissionSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, false, {
      roundDurationSeconds: 150,
      intermissionSeconds: 200,
    });
    expect(result).toBe(Date.parse(scoredAt) + 200 * 1000);
  });

  it("continuous timing, unscored round: startedAt + (round + intermission)", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, false, {
      roundDurationSeconds: 150,
      intermissionSeconds: 200,
    });
    expect(result).toBe(Date.parse(startedAt) + (150 + 200) * 1000);
  });

  it("scheduled timing (no continuousTiming), scored round: scoredAt + shared intermissionSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, false, null);
    // Shared constants: ROUND_DURATION_SECONDS=180, ROUND_INTERVAL_SECONDS=360 → intermission=180.
    expect(result).toBe(Date.parse(scoredAt) + 180 * 1000);
  });

  it("scheduled timing (no continuousTiming), unscored round: startedAt + shared roundIntervalSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, false, null);
    expect(result).toBe(Date.parse(startedAt) + 360 * 1000);
  });

  it("scheduled timing, test mode, unscored round: startedAt + test-mode interval", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, true, undefined);
    // TEST_MODE_ROUND_DURATION_SECONDS=30 + TEST_MODE_SECONDS=10 = 40.
    expect(result).toBe(Date.parse(startedAt) + 40 * 1000);
  });

  it("scheduled timing, test mode, scored round: scoredAt + test-mode intermission", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, true, undefined);
    // Test-mode intermission = roundIntervalSeconds(40) - roundDurationSeconds(30) = 10.
    expect(result).toBe(Date.parse(scoredAt) + 10 * 1000);
  });
});

// Reversibility contract for the global-room feature: the flag alone flips
// pooling on/off, and OFF must be the exact identity (today's per-venue
// isolation). See docs/category-blitz-global-room-plan.md.
describe("resolveCategoryBlitzRoomId (global-room flag)", () => {
  const original = process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
    else process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = original;
  });

  it("flag off (unset): identity — every venue is its own room", () => {
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
    expect(isGlobalRoomEnabled()).toBe(false);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe("venue-1");
    expect(resolveCategoryBlitzRoomId("some-other-venue")).toBe("some-other-venue");
  });

  it("flag explicitly falsy: still identity", () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = "0";
    expect(isGlobalRoomEnabled()).toBe(false);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe("venue-1");
  });

  it("flag on: every venue collapses onto the one shared hidden room", () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = "true";
    expect(isGlobalRoomEnabled()).toBe(true);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID);
    expect(resolveCategoryBlitzRoomId("some-other-venue")).toBe(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID);
  });
});

// Concealment contract: the realtime channel name is the one string derived
// from a (possibly pooled) room id that reaches the client, so it must never
// embed the raw id — least of all the hidden room id `hc-cbz-live`.
describe("categoryBlitzChannelName", () => {
  it("never embeds the raw venue/room id verbatim", () => {
    expect(categoryBlitzChannelName("venue-1")).not.toContain("venue-1");
    expect(categoryBlitzChannelName(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID)).not.toContain("hc-cbz-live");
    expect(categoryBlitzChannelName(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID)).not.toContain("global");
  });

  it("is deterministic and collision-distinct per id (so broadcaster and subscriber meet)", () => {
    expect(categoryBlitzChannelName("venue-1")).toBe(categoryBlitzChannelName("venue-1"));
    expect(categoryBlitzChannelName("venue-1")).not.toBe(categoryBlitzChannelName("venue-2"));
    expect(categoryBlitzChannelName("venue-1").startsWith("category-blitz-session:")).toBe(true);
  });
});
