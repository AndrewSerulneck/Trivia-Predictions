import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SIGNUP_EASE,
  SIGNUP_REDUCED_DURATION,
  SIGNUP_STAGGER_DELAY,
  SIGNUP_STEP_DURATION,
  signupProgressFraction,
  signupStaggerDelay,
  signupTransition,
} from "@/components/signup/signupMotion";

/**
 * Partner Self-Serve Signup, Phase 3 — the shell + motion system.
 * docs/partner-self-serve-signup-plan.md §4.
 *
 * Phase 3 is the phase headless tooling can least verify: whether the thing
 * FEELS right is Andrew's call on a real phone
 * (docs/self-serve-signup-device-checklist.md). What IS mechanically checkable
 * is that the system stays a system — one ease, one duration, one reduced-motion
 * rule, and the navigation primitives composed rather than re-implemented. Those
 * are the regressions the six screens of Phase 4 could quietly introduce.
 *
 * Phase 8 owns the broader tests/self-serve-signup-contract.test.ts (rate
 * limiter, radius bounds, route auth). Keep this file scoped to motion + shell
 * composition so the two don't overlap.
 */

const SIGNUP_DIR = join(__dirname, "..", "components", "signup");

const readSignup = (file: string): string => readFileSync(join(SIGNUP_DIR, file), "utf8");

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SIGNUP_TSX = readdirSync(SIGNUP_DIR).filter((f) => f.endsWith(".tsx"));

describe("signup motion tokens", () => {
  it("collapses every transition to a plain fade under prefers-reduced-motion", () => {
    expect(signupTransition(false).duration).toBe(SIGNUP_STEP_DURATION);
    expect(signupTransition(true).duration).toBe(SIGNUP_REDUCED_DURATION);
    expect(SIGNUP_REDUCED_DURATION).toBeLessThan(SIGNUP_STEP_DURATION);
    // A stagger IS motion — reduced motion means everything fades in at once.
    expect(signupStaggerDelay(false)).toBe(SIGNUP_STAGGER_DELAY);
    expect(signupStaggerDelay(true)).toBe(0);
  });

  it("uses one non-overshooting cubic-bezier, never a spring", () => {
    expect(SIGNUP_EASE).toHaveLength(4);
    // Overshoot is what "bouncy" means numerically: a control point outside 0..1
    // on the OUTPUT axis (indices 1 and 3). The x controls may be anything in 0..1.
    expect(SIGNUP_EASE[1]).toBeLessThanOrEqual(1);
    expect(SIGNUP_EASE[3]).toBeLessThanOrEqual(1);
    expect(SIGNUP_EASE[1]).toBeGreaterThanOrEqual(0);
    expect(SIGNUP_EASE[3]).toBeGreaterThanOrEqual(0);
  });

  it("shows the progress rail already moving on step 1 and full on the last step", () => {
    expect(signupProgressFraction(0, 6)).toBeCloseTo(1 / 6);
    expect(signupProgressFraction(5, 6)).toBe(1);
    // Out-of-range input must never produce a rail wider than the track.
    expect(signupProgressFraction(99, 6)).toBe(1);
    expect(signupProgressFraction(-3, 6)).toBeCloseTo(1 / 6);
    expect(signupProgressFraction(0, 0)).toBe(0);
  });
});

describe("signup shell composition", () => {
  it("composes the navigation primitives instead of re-implementing them", () => {
    const shell = stripComments(readSignup("SignupShell.tsx"));
    expect(shell).toContain("<ExitBackButton");
    expect(shell).toContain("<WizardFooter");
    // The one rule tests/navigation-controls-contract.test.ts also enforces
    // globally; asserted here too so a failure names the signup shell directly.
    expect(shell).not.toContain("<StepBackButton");
    expect(shell).not.toContain("<NextButton");
  });

  it("sizes itself off --tp-vh so the sticky footer clears the iOS keyboard", () => {
    const shell = stripComments(readSignup("SignupShell.tsx"));
    expect(shell).toContain("h-[var(--tp-vh,100dvh)]");
    expect(shell).not.toMatch(/\bh-screen\b/);
  });

  it("never hand-rolls a duration, ease or stagger in a signup component", () => {
    // Every animated value comes from signupMotion.ts. A literal `duration:` or
    // `ease:` in a component is the start of six hand-tuned screens.
    const offenders = SIGNUP_TSX.filter((file) => {
      const src = stripComments(readSignup(file));
      return (
        /\bduration\s*:\s*[\d.]/.test(src) ||
        /\bease\s*:\s*\[/.test(src) ||
        /\bstaggerChildren\s*:\s*[\d.]/.test(src) ||
        /\btype\s*:\s*"spring"/.test(src)
      );
    });
    expect(offenders, "import the token from @/components/signup/signupMotion").toEqual([]);
  });

  it("gives every animated signup component a reduced-motion branch", () => {
    const offenders = SIGNUP_TSX.filter((file) => {
      const src = stripComments(readSignup(file));
      if (!src.includes("framer-motion")) return false;
      return !src.includes("useReducedMotion");
    });
    expect(offenders, "prefers-reduced-motion must collapse the transition").toEqual([]);
  });

  it("keeps the step transition's direction derived, not passed in", () => {
    const transition = stripComments(readSignup("SignupStepTransition.tsx"));
    // `custom` is the only channel that reaches an EXITING child, so a direction
    // that isn't threaded through it makes Back animate forwards on the way out.
    expect(transition).toContain('mode="wait"');
    expect(transition).toContain("custom={direction}");
    expect(transition).toMatch(/setDirection\(/);
    // Direction is NOT part of the public prop surface — a screen that could
    // pass it could get it wrong, and five of the six would have to repeat it.
    expect(transition).not.toMatch(/direction\??:\s*SignupDirection;/);
  });
});
