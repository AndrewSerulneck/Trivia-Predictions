import type { Transition, Variants } from "framer-motion";

/**
 * The forward/back panel swipe used when a player progresses through a step flow — a new panel
 * enters from the right and the old one exits to the left; reverse when going back.
 *
 * Lifted out of `components/join/JoinFlow.tsx` (the sign-in username → PIN transition) so the
 * board-creation sheet (`components/bingo/CreateBoardSheet.tsx`) uses the exact same motion.
 * Plain objects, client-safe — no `server-only`.
 *
 * Usage: keep a `direction: 1 | -1` in state (1 = forward, -1 = back), pass it as `custom` to
 * both `<AnimatePresence>` and each panel `<motion.div>`, and collapse the transition to
 * `{ duration: 0 }` when `useReducedMotion()` is true.
 */
export const SWIPE_PANEL_VARIANTS: Variants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 1,
  }),
  center: {
    x: "0%",
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 1,
  }),
};

export const SWIPE_TWEEN: Transition = {
  type: "tween",
  duration: 0.22,
  ease: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
};
