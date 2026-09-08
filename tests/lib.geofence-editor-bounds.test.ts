import { describe, expect, it } from "vitest";
import {
  RADIUS_MAX,
  RADIUS_MIN,
  clampRadius,
  dialFractionToRadius,
  radiusKeyStep,
  radiusToDialFraction,
  snapRadius,
} from "@/lib/geofenceEditor";
import { SIGNUP_RADIUS_MAX, SIGNUP_RADIUS_MIN } from "@/lib/selfServeSignup";

// Partner self-serve signup Phase 2 (docs/partner-self-serve-signup-plan.md §4).
// The radius math grew an optional (min, max) domain so the signup wizard can
// bound its geofence to 50–200 m without touching admin's 25–2000 m. Two things
// this file pins:
//   1. Default-args regression — passing no bounds is bit-identical to before.
//   2. The signup domain — 50/200 clamping, the 10 m snap grid, and a clean
//      dial-fraction round-trip inside 50–200.

describe("default-args regression (no bounds passed)", () => {
  it("clampRadius still clamps to [25, 2000]", () => {
    expect(clampRadius(10)).toBe(RADIUS_MIN);
    expect(clampRadius(5000)).toBe(RADIUS_MAX);
    expect(clampRadius(300)).toBe(300);
  });

  it("snapRadius still uses the 25 m (<500) / 50 m (>=500) grid", () => {
    expect(snapRadius(212)).toBe(200);
    expect(snapRadius(263)).toBe(275);
    expect(snapRadius(612)).toBe(600);
    expect(snapRadius(637)).toBe(650);
  });

  it("dialFractionToRadius endpoints and midpoint are unchanged", () => {
    expect(dialFractionToRadius(0)).toBe(RADIUS_MIN);
    expect(dialFractionToRadius(1)).toBe(RADIUS_MAX);
    expect(dialFractionToRadius(0.5)).toBe(225);
  });

  it("radiusToDialFraction still inverts at the domain edges", () => {
    expect(radiusToDialFraction(RADIUS_MIN)).toBeCloseTo(0, 5);
    expect(radiusToDialFraction(RADIUS_MAX)).toBeCloseTo(1, 5);
  });

  it("radiusKeyStep still steps by the 25/50 grid and clamps", () => {
    expect(radiusKeyStep(RADIUS_MAX, 1)).toBe(RADIUS_MAX);
    expect(radiusKeyStep(RADIUS_MIN, -1)).toBe(RADIUS_MIN);
    expect(radiusKeyStep(100, 1)).toBe(125);
    expect(radiusKeyStep(600, 1)).toBe(650);
  });

  it("passing the admin constants explicitly matches passing nothing", () => {
    for (const r of [10, 40, 137, 212, 499, 500, 613, 1999, 5000]) {
      expect(snapRadius(r, RADIUS_MIN, RADIUS_MAX)).toBe(snapRadius(r));
      expect(clampRadius(r, RADIUS_MIN, RADIUS_MAX)).toBe(clampRadius(r));
    }
    for (const t of [-1, 0, 0.13, 0.5, 0.87, 1, 2]) {
      expect(dialFractionToRadius(t, RADIUS_MIN, RADIUS_MAX)).toBe(dialFractionToRadius(t));
    }
  });
});

describe("signup domain (50–200 m)", () => {
  const MIN = SIGNUP_RADIUS_MIN;
  const MAX = SIGNUP_RADIUS_MAX;

  it("plan constants are 50 and 200", () => {
    expect(MIN).toBe(50);
    expect(MAX).toBe(200);
  });

  it("clampRadius pins to [50, 200]", () => {
    expect(clampRadius(10, MIN, MAX)).toBe(50);
    expect(clampRadius(25, MIN, MAX)).toBe(50);
    expect(clampRadius(500, MIN, MAX)).toBe(200);
    expect(clampRadius(2000, MIN, MAX)).toBe(200);
    expect(clampRadius(125, MIN, MAX)).toBe(125);
  });

  it("snaps to a 10 m grid across the whole range", () => {
    expect(snapRadius(52, MIN, MAX)).toBe(50);
    expect(snapRadius(83, MIN, MAX)).toBe(80);
    expect(snapRadius(137, MIN, MAX)).toBe(140);
    expect(snapRadius(196, MIN, MAX)).toBe(200);
    // never leaves the domain even after rounding
    expect(snapRadius(204, MIN, MAX)).toBe(200);
    expect(snapRadius(46, MIN, MAX)).toBe(50);
  });

  it("radiusKeyStep moves by 10 m and clamps at both ends", () => {
    expect(radiusKeyStep(MAX, 1, MIN, MAX)).toBe(200);
    expect(radiusKeyStep(MIN, -1, MIN, MAX)).toBe(50);
    expect(radiusKeyStep(100, 1, MIN, MAX)).toBe(110);
    expect(radiusKeyStep(100, -1, MIN, MAX)).toBe(90);
  });

  it("dial fraction round-trips inside 50–200", () => {
    expect(dialFractionToRadius(0, MIN, MAX)).toBe(50);
    expect(dialFractionToRadius(1, MIN, MAX)).toBe(200);
    expect(dialFractionToRadius(0.5, MIN, MAX)).toBe(100); // sqrt(50*200)

    expect(radiusToDialFraction(50, MIN, MAX)).toBeCloseTo(0, 5);
    expect(radiusToDialFraction(200, MIN, MAX)).toBeCloseTo(1, 5);
    expect(radiusToDialFraction(100, MIN, MAX)).toBeCloseTo(0.5, 5);

    for (const r of [50, 60, 90, 100, 140, 180, 200]) {
      const back = dialFractionToRadius(radiusToDialFraction(r, MIN, MAX), MIN, MAX);
      expect(back).toBe(r);
    }
  });

  it("gives more than a handful of stops across the range", () => {
    const stops = new Set<number>();
    for (let t = 0; t <= 1.0001; t += 0.01) {
      stops.add(dialFractionToRadius(t, MIN, MAX));
    }
    // 25 m grid would give ~7; the 10 m grid gives 16 (50,60,…,200).
    expect(stops.size).toBeGreaterThanOrEqual(15);
  });
});
