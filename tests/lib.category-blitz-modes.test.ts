import { describe, expect, it } from "vitest";
import { isReverseRound, reverseRoundPoints, MODE_CONFIG } from "@/lib/categoryBlitzModes";

describe("isReverseRound", () => {
  it("is false for the first three rounds of a session (indices 0, 1, 2)", () => {
    expect(isReverseRound(0)).toBe(false);
    expect(isReverseRound(1)).toBe(false);
    expect(isReverseRound(2)).toBe(false);
  });

  it("is true on the 4th round (index 3) — the deterministic every-4th cadence", () => {
    expect(isReverseRound(3)).toBe(true);
  });

  it("repeats every 4 rounds (indices 7, 11, 15…), false in between", () => {
    expect(isReverseRound(4)).toBe(false);
    expect(isReverseRound(5)).toBe(false);
    expect(isReverseRound(6)).toBe(false);
    expect(isReverseRound(7)).toBe(true);
    expect(isReverseRound(10)).toBe(false);
    expect(isReverseRound(11)).toBe(true);
    expect(isReverseRound(15)).toBe(true);
  });

  it("never flips for a negative or non-multiple index", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isReverseRound(i)).toBe(i % 4 === 3);
    }
  });
});

describe("reverseRoundPoints", () => {
  it("is the identity function — exactly 1 point per matching player, uncapped", () => {
    expect(reverseRoundPoints(1)).toBe(1);
    expect(reverseRoundPoints(2)).toBe(2);
    expect(reverseRoundPoints(5)).toBe(5);
    expect(reverseRoundPoints(50)).toBe(50);
  });
});

describe("MODE_CONFIG", () => {
  it("defines exactly the standard and reverse modes with their locked puck labels", () => {
    expect(MODE_CONFIG.standard.puckLabel).toBe("Be Unique!");
    expect(MODE_CONFIG.reverse.puckLabel).toBe("Majority Rules!");
  });

  it("never surfaces a marketing/mode name field — puckLabel + rule are the only player-facing copy", () => {
    for (const mode of Object.values(MODE_CONFIG)) {
      expect(Object.keys(mode).sort()).toEqual(["puckLabel", "rule", "themeKey"]);
    }
  });

  it("points each mode at its own themeKey", () => {
    expect(MODE_CONFIG.standard.themeKey).toBe("blitzStandard");
    expect(MODE_CONFIG.reverse.themeKey).toBe("blitzReverse");
  });
});
