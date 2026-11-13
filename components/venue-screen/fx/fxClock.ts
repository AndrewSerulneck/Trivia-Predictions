// Wall-clock alignment for looping venue-display effects (docs/venue-display-hype-and-intro-stinger-plan.md §1
// decision 5). Loops are phased from the wall clock, not from page load, so two TVs in one bar move together and a
// reload continues where the loop was instead of restarting it. Pure.

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Seconds already into the current cycle of a `periodMs` loop (use as a negative animation delay). */
export const wallClockElapsedS = (periodMs: number, nowMs: number): number =>
  periodMs > 0 ? mod(nowMs, periodMs) / 1000 : 0;

/** Seconds until the next wall-clock slot `offsetMs` into a `periodMs` cycle (use as a positive delay). */
export const wallClockDelayS = (periodMs: number, offsetMs: number, nowMs: number): number =>
  periodMs > 0 ? mod(offsetMs - nowMs, periodMs) / 1000 : 0;
