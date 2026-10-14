import { describe, expect, it } from "vitest";
import { isReverseRound, reverseRoundPoints, MODE_CONFIG, MAJORITY_RULES_EVERY_N_ROUNDS } from "@/lib/categoryBlitzModes";

describe("isReverseRound", () => {
  it("is false for the first four rounds of a session (indices 0–3)", () => {
    for (const i of [0, 1, 2, 3]) expect(isReverseRound(i)).toBe(false);
  });

  it("is true on the 5th round (index 4) — the deterministic every-5th cadence", () => {
    expect(isReverseRound(4)).toBe(true);
    expect(MAJORITY_RULES_EVERY_N_ROUNDS).toBe(5);
  });

  it("repeats every 5 rounds (rounds 5, 10, 15… = indices 4, 9, 14…), false in between", () => {
    expect(isReverseRound(9)).toBe(true);
    expect(isReverseRound(14)).toBe(true);
    for (const i of [5, 6, 7, 8, 10, 11, 12, 13]) expect(isReverseRound(i)).toBe(false);
  });

  it("never puts two Majority Rules rounds back to back", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isReverseRound(i)).toBe(i % 5 === 4);
      expect(isReverseRound(i) && isReverseRound(i + 1)).toBe(false);
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
