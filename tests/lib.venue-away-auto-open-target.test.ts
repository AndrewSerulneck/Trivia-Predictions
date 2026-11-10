import { describe, expect, it } from "vitest";
import { awayAutoOpenTarget } from "@/lib/venueAwayMode";

// Away-mode plan R9 (third review, finding 6): `/?v=X` opens a bar by itself only after a real location check.
const bars = [{ id: "x" }, { id: "y" }];

describe("awayAutoOpenTarget", () => {
  it("a failed or timed-out location check (no list built) opens nothing", () => {
    expect(awayAutoOpenTarget({ venueParam: "x", awayVenues: bars, listBuilt: false })).toBeNull();
  });

  it("after Retry succeeds with X out of range, X opens", () => {
    expect(awayAutoOpenTarget({ venueParam: "x", awayVenues: bars, listBuilt: true })).toBe(bars[0]);
  });

  it("X in range (not among the away bars) opens nothing", () => {
    expect(awayAutoOpenTarget({ venueParam: "x", awayVenues: [bars[1]], listBuilt: true })).toBeNull();
  });

  it("no link param opens nothing", () => {
    expect(awayAutoOpenTarget({ venueParam: null, awayVenues: bars, listBuilt: true })).toBeNull();
    expect(awayAutoOpenTarget({ venueParam: "", awayVenues: bars, listBuilt: true })).toBeNull();
  });
});
