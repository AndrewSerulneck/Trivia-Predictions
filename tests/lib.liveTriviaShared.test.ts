import { describe, expect, it, vi } from "vitest";

// The client-safe mirror (lib/liveTriviaShared.ts) duplicates the Live Trivia
// round-length constant so the scheduling FORM can compute its end-time preview
// without importing the server-only engine. This test imports the REAL engine
// timing and asserts the mirror matches, so any drift fails CI instead of
// silently mis-sizing scheduled windows / the overlap guard.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { LIVE_TRIVIA_ROUND_MS, REVEAL_HOLD_SECONDS, liveTriviaDurationMinutes, clampLiveTriviaRounds } from "@/lib/liveTriviaShared";
import { LIVE_SHOWDOWN_TIMING } from "@/lib/liveShowdownEngine";

describe("liveTriviaShared drift guard", () => {
  it("mirrors the engine's ROUND_MS exactly", () => {
    expect(LIVE_TRIVIA_ROUND_MS).toBe(LIVE_SHOWDOWN_TIMING.ROUND_MS);
  });

  it("mirrors the engine's REST_WARNING_MS exactly", () => {
    expect(REVEAL_HOLD_SECONDS * 1000).toBe(LIVE_SHOWDOWN_TIMING.REST_WARNING_MS);
  });
});

describe("liveTriviaDurationMinutes", () => {
  it("derives duration as rounds × ROUND_MS, matching the engine's occurrence end math", () => {
    // enumerateScheduleOccurrences uses endMs = startMs + rounds * ROUND_MS.
    for (const rounds of [1, 3, 5, 12]) {
      expect(liveTriviaDurationMinutes(rounds)).toBe((rounds * LIVE_SHOWDOWN_TIMING.ROUND_MS) / 60_000);
    }
  });

  it("clamps rounds to [1, 24] like the engine's clampRounds", () => {
    expect(clampLiveTriviaRounds(0)).toBe(1);
    expect(clampLiveTriviaRounds(-5)).toBe(1);
    expect(clampLiveTriviaRounds(999)).toBe(24);
    expect(clampLiveTriviaRounds(Number.NaN)).toBe(1);
    // duration floors sub-1 rounds to a single round's length
    expect(liveTriviaDurationMinutes(0)).toBe(LIVE_SHOWDOWN_TIMING.ROUND_MS / 60_000);
  });
});
