// The app's status bar follows the light theme (docs/light-theme-plan.md Phase 7). App only: on
// the website, and in an app shell without the StatusBar plugin, every call is a silent no-op and
// the strip stays today's dark navy with white icons.
//
// The shell starts the web view BELOW the status bar and paints that strip itself
// (`overlaysWebView: false`, native/capacitor.config.json, native plan Phase 2D) — never flip that.
// On a light screen the strip turns white with dark icons; anywhere else it is the navy again.
//
// Rule: dark icons ONLY on a strip we know turned white. Android 15+ ignores the strip colour (the
// strip is the window's navy background there), so on Android the colour is read back from the
// plugin and the icons stay white unless it really is white. Each style change goes to both
// StatusBar and SystemBars: the two plugins share the icons, and SystemBars re-applies its own
// last style when an Android phone rotates.

import { callNative, hasNativeCapability, nativePlatform } from "@/lib/nativeApp";
import { THEME_COLOR, type ResolvedTheme } from "@/lib/theme";

// The plugins name a style after the strip's BACKGROUND: "DARK" = white icons, "LIGHT" = dark icons.
const setIconStyle = async (style: "DARK" | "LIGHT"): Promise<void> => {
  await callNative("StatusBar", "setStyle", { style });
  if (hasNativeCapability("SystemBars")) await callNative("SystemBars", "setStyle", { style, bar: "StatusBar" });
};

const sameColor = (a: unknown, b: string): boolean => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

const paintDark = async (): Promise<void> => {
  await callNative("StatusBar", "setBackgroundColor", { color: THEME_COLOR.dark });
  await setIconStyle("DARK");
};

const paintLight = async (): Promise<void> => {
  await callNative("StatusBar", "setBackgroundColor", { color: THEME_COLOR.light });
  if (nativePlatform() === "android") {
    const info = (await callNative("StatusBar", "getInfo")) as { color?: unknown } | null;
    if (!sameColor(info?.color, THEME_COLOR.light)) {
      await paintDark();
      return;
    }
  }
  await setIconStyle("LIGHT");
};

let painted: ResolvedTheme | null = null; // null = unknown (a fresh page load), so the first call always paints
let wanted: ResolvedTheme = "dark";
let running = false;

/**
 * Paints the status bar for `theme`. Never throws and never waits. Calls are serialised and only
 * the latest wish is painted, so quick navigations can't leave white icons on a white strip.
 */
export const syncNativeStatusBar = (theme: ResolvedTheme): void => {
  wanted = theme;
  if (running || painted === theme || !hasNativeCapability("StatusBar")) return;
  running = true;
  const run = async (): Promise<void> => {
    while (painted !== wanted) {
      const target = wanted;
      try {
        await (target === "light" ? paintLight() : paintDark());
      } catch {
        // An old or odd shell: try once to leave the safe navy look, then stop asking.
        await paintDark().catch(() => undefined);
      }
      painted = target;
    }
  };
  void run().finally(() => {
    running = false;
  });
};

/** Test-only: forget what was painted. */
export const resetNativeStatusBarForTests = (): void => {
  painted = null;
  wanted = "dark";
  running = false;
};
