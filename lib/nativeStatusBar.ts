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
const setIconStyle = (style: "DARK" | "LIGHT"): Promise<unknown> =>
  Promise.all([
    callNative("StatusBar", "setStyle", { style }),
    hasNativeCapability("SystemBars") ? callNative("SystemBars", "setStyle", { style, bar: "StatusBar" }) : null,
  ]);

const sameColor = (a: unknown, b: string): boolean => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

// Colour and icons go over the bridge together (Phase 8.3): waiting for one before sending the
// other left a frame of white icons on a white strip (or dark icons on navy).
const paint = async (theme: ResolvedTheme): Promise<void> => {
  await Promise.all([
    callNative("StatusBar", "setBackgroundColor", { color: THEME_COLOR[theme] }),
    setIconStyle(theme === "light" ? "LIGHT" : "DARK"),
  ]);
};

// Android only: does this phone let the app colour the strip? Learnt on the first light paint of a
// page load, so only that one paint waits for the read-back; later ones are a single step.
let androidStripTakesColor: boolean | null = null;

const paintLight = async (): Promise<void> => {
  if (nativePlatform() !== "android" || androidStripTakesColor === true) return paint("light");
  if (androidStripTakesColor === false) return paint("dark");
  await callNative("StatusBar", "setBackgroundColor", { color: THEME_COLOR.light });
  const info = (await callNative("StatusBar", "getInfo")) as { color?: unknown } | null;
  androidStripTakesColor = sameColor(info?.color, THEME_COLOR.light);
  await (androidStripTakesColor ? setIconStyle("LIGHT") : paint("dark"));
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
        await (target === "light" ? paintLight() : paint("dark"));
      } catch {
        // An old or odd shell: try once to leave the safe navy look, then stop asking.
        await paint("dark").catch(() => undefined);
      }
      painted = target;
    }
    // Cleared in the same step as the last check (Phase 8.2): a call landing after it starts a
    // new run instead of being dropped.
    running = false;
  };
  void run();
};

/** Test-only: forget what was painted. */
export const resetNativeStatusBarForTests = (): void => {
  painted = null;
  androidStripTakesColor = null;
  wanted = "dark";
  running = false;
};
