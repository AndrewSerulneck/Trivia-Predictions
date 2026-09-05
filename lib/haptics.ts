/** Best-effort feedback. Never let device support or permissions block an action. */
export type HapticPattern = "selection" | "commit" | "success" | "warning";
const PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 14,
  commit: 22,
  success: [14, 35, 14],
  warning: [22, 40, 22],
};

export function haptic(pattern: HapticPattern): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[pattern]);
    }
  } catch {
    // Unsupported/denied vibration is intentionally silent.
  }
}
