import { hasNativeCapability } from "@/lib/nativeApp";
import { playHaptic, type HapticKind } from "@/lib/nativeHaptics";

/** Best-effort feedback. Never let device support or permissions block an action. */
export type HapticPattern = "selection" | "commit" | "success" | "warning";
const PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 14,
  commit: 22,
  success: [14, 35, 14],
  warning: [22, 40, 22],
};

/** In the app these go through the native Haptics plugin (the only native call site, `playHaptic`). */
const NATIVE_KIND: Record<HapticPattern, HapticKind> = {
  selection: "tap",
  commit: "tap",
  success: "success",
  warning: "warning",
};

export function haptic(pattern: HapticPattern): void {
  try {
    // App with the Haptics plugin: native only, so iPhone gets a buzz and Android never double-buzzes.
    // `playHaptic` honours Reduce Motion. The website and older app builds keep `navigator.vibrate`.
    if (hasNativeCapability("Haptics")) {
      playHaptic(NATIVE_KIND[pattern]);
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[pattern]);
    }
  } catch {
    // Unsupported/denied vibration is intentionally silent.
  }
}
