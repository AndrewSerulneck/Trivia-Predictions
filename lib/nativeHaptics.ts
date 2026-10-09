// Haptics (Phase 4a, docs/native-app-store-plan.md). A small tap or buzz on a correct answer, a bingo
// or a prize won. App only: on the website, and in an app shell built before the Haptics plugin
// existed, every call is a silent no-op. Respects the phone's Reduce Motion setting.

import { callNative, hasNativeCapability } from "@/lib/nativeApp";
import type { AnimationType } from "@/types/animation";

export type HapticKind = "tap" | "success" | "warning" | "celebrate";

const reduceMotionRequested = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** Gameplay animations that earn a haptic. Anything not listed is silent on purpose. */
const HAPTIC_BY_ANIMATION: Partial<Record<AnimationType, HapticKind>> = {
  BINGO_SQUARE: "tap",
  BINGO_WIN: "celebrate",
  BINGO_NEAR_WIN: "warning",
  SPEED_TRIVIA_CORRECT: "success",
  SPEED_TRIVIA_WRONG: "warning",
  LIVE_TRIVIA_CORRECT: "success",
  LIVE_TRIVIA_STREAK: "success",
  LIVE_TRIVIA_CHAMPION: "celebrate",
  CATEGORY_BLITZ_CHAMPION: "celebrate",
  FANTASY_SCORE_UP: "tap",
};

export const hapticForAnimation = (type: AnimationType): HapticKind | null => HAPTIC_BY_ANIMATION[type] ?? null;

/** Fires a haptic. Never throws and never waits: the game must not depend on it. */
export const playHaptic = (kind: HapticKind): void => {
  if (!hasNativeCapability("Haptics") || reduceMotionRequested()) return;
  const run = async (): Promise<void> => {
    if (kind === "tap") await callNative("Haptics", "impact", { style: "LIGHT" });
    else if (kind === "success") await callNative("Haptics", "notification", { type: "SUCCESS" });
    else if (kind === "warning") await callNative("Haptics", "notification", { type: "WARNING" });
    else {
      await callNative("Haptics", "impact", { style: "HEAVY" });
      await callNative("Haptics", "notification", { type: "SUCCESS" });
    }
  };
  void run().catch(() => undefined);
};
