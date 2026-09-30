// Partner Dashboard overlay timings (docs/partner-dashboard-app-redesign-plan.md §4d).
//
// Every duration here mirrors a keyframe class in app/globals.css. The JS side
// needs them because an exit animation must finish BEFORE React unmounts the
// element — the CSS class holds the last frame (`both`), the timer decides
// when to drop it. Change a duration in both places or neither.
//
// Under `prefers-reduced-motion` the CSS collapses every one of these to
// nothing, so the JS waits 0ms too — no invisible pause before focus returns.

/** .animate-tp-popup-sheet-down (and the scrim's .animate-tp-fade-out). */
export const SHEET_EXIT_MS = 270;

/** .animate-tp-drawer-out. */
export const DRAWER_EXIT_MS = 240;

/** .animate-tp-step-out-left / -right. The incoming step's 240ms runs after. */
export const STEP_OUT_MS = 120;

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** An exit duration, or 0 when the user asked for reduced motion. */
export const resolveExitMs = (durationMs: number = SHEET_EXIT_MS): number =>
  prefersReducedMotion() ? 0 : durationMs;
