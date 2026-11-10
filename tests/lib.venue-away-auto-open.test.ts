// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearClientState } from "@/lib/storage";
import { AWAY_AUTO_OPEN_MIN_GAP_MS, awayAutoOpenAllowed, markAwayAutoOpen } from "@/lib/venueAwayMode";

// Opening a bar away keeps its once-a-minute limit (away-mode plan, Phase R3, review finding 4).
const NOW = 1_800_000_000_000;

beforeEach(() => {
  sessionStorage.clear();
});

describe("away auto-open throttle", () => {
  it("allows the first automatic open in a tab", () => {
    expect(awayAutoOpenAllowed(NOW)).toBe(true);
  });

  it("a stamp written after the session clear survives it, and a second open within 60 s is skipped", () => {
    clearClientState();
    markAwayAutoOpen(NOW);
    expect(awayAutoOpenAllowed(NOW + 1_000)).toBe(false);
    expect(awayAutoOpenAllowed(NOW + AWAY_AUTO_OPEN_MIN_GAP_MS - 1)).toBe(false);
    expect(awayAutoOpenAllowed(NOW + AWAY_AUTO_OPEN_MIN_GAP_MS)).toBe(true);
  });

  it("a stamp written before the clear is lost (why the join flow writes it after)", () => {
    markAwayAutoOpen(NOW);
    clearClientState();
    expect(awayAutoOpenAllowed(NOW + 1_000)).toBe(true);
  });

  it("ignores a junk or future stamp", () => {
    sessionStorage.setItem("ht:away-auto-open-at", "abc");
    expect(awayAutoOpenAllowed(NOW)).toBe(true);
    markAwayAutoOpen(NOW + 5_000);
    expect(awayAutoOpenAllowed(NOW)).toBe(true);
  });
});
