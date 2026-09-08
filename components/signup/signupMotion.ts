// Partner Self-Serve Signup — the motion vocabulary.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4). Every animated value the
// signup wizard uses lives here, so all six screens inherit ONE feel instead of
// six hand-tuned ones. A screen that needs a different duration or ease is a
// screen that is about to break the system — change the token, not the call
// site.
//
// House rules encoded below:
//   - One directional slide + fade between steps, ~260 ms, custom cubic-bezier.
//   - Content enters staggered, ~40 ms per element, never all at once.
//   - `prefers-reduced-motion` collapses EVERY transition to a plain fade:
//     no transform, no stagger, shorter duration.
//   - No spring, no bounce, no overshoot. Restrained = official.
//
// Pure data + pure helpers: no React, no framer-motion import, so tests can read
// these numbers directly instead of scanning JSX strings.

/**
 * Decisive ease-out with no overshoot. Deliberately not a spring — a bouncing
 * signup form reads as a toy, and this flow ends at a $100/mo Checkout.
 */
export const SIGNUP_EASE: [number, number, number, number] = [0.22, 0.9, 0.24, 1];

/** Step-to-step slide + fade. */
export const SIGNUP_STEP_DURATION = 0.26;

/** Reduced-motion duration — a plain fade, fast enough to read as instant. */
export const SIGNUP_REDUCED_DURATION = 0.12;

/** Delay between staggered children entering a step. */
export const SIGNUP_STAGGER_DELAY = 0.04;

/**
 * Held-back start for a step's content, so the stagger begins as the step's
 * own slide is landing rather than racing it.
 */
export const SIGNUP_CONTENT_DELAY = 0.06;

/** Entering content's rise, in px. Paired with the fade, never used alone. */
export const SIGNUP_ITEM_RISE = 10;

/** Horizontal travel of the outgoing/incoming step, in px. */
export const SIGNUP_STEP_TRAVEL = 28;

/** Progress-rail fill. Slightly longer than the slide so the rail lands last. */
export const SIGNUP_RAIL_DURATION = 0.34;

/** Forward (`1`) advances; back (`-1`) reverses every direction-aware value. */
export type SignupDirection = 1 | -1;

export type SignupTransition = {
  duration: number;
  ease: [number, number, number, number];
};

/** The one transition object. `reduce` is `useReducedMotion()`'s value. */
export const signupTransition = (reduce: boolean, duration = SIGNUP_STEP_DURATION): SignupTransition => ({
  duration: reduce ? SIGNUP_REDUCED_DURATION : duration,
  ease: SIGNUP_EASE,
});

/** Stagger interval — collapsed to zero under reduced motion (all at once, fading). */
export const signupStaggerDelay = (reduce: boolean): number => (reduce ? 0 : SIGNUP_STAGGER_DELAY);

/**
 * Fraction of the flow completed, `0..1`, for the progress rail's `scaleX`.
 * Step 1 of 6 is already 1/6 filled — a rail that starts empty reads as "you
 * have done nothing", which is wrong the moment the screen appears.
 */
export const signupProgressFraction = (stepIndex: number, stepCount: number): number => {
  if (!Number.isFinite(stepIndex) || !Number.isFinite(stepCount) || stepCount <= 0) {
    return 0;
  }
  const clampedIndex = Math.min(Math.max(stepIndex, 0), stepCount - 1);
  return (clampedIndex + 1) / stepCount;
};
