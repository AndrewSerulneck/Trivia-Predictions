// Native app detection — the ONE place that knows how to tell the Hightop
// Challenge iPhone/Android app (the Capacitor shell in `native/`) from a browser.
// docs/native-app-store-plan.md Phase 2E item 1 (pulled forward from Phase 3).
//
// Two signals, both set by the shell:
//   1. the user-agent token `HightopChallengeApp/<version> (ios|android)`
//      (`appendUserAgent` in native/capacitor.config.json) — present on every
//      request and every page, on both hosts;
//   2. `window.Capacitor`, the bridge the shell injects into each page.
//
// RULE: nothing else in app/, components/ or lib/ may read the token or
// `window.Capacitor` — call these helpers. `tests/native-app-contract.test.ts`
// fails the build otherwise.
//
// Website visitors download nothing extra: there is no `@capacitor/*` package
// in the web bundle. The shell injects `window.Capacitor` (and one
// `Capacitor.Plugins.<Name>` entry per native plugin it contains) into every
// page, and these helpers talk to that bridge directly (Phase 3).
//
// OLD APP VERSIONS STAY IN USE. Before calling a native feature, check
// `hasNativeCapability(name)`: a shell built before the plugin existed simply
// doesn't have it, and the web must fall back to the website behaviour.
//
// Pure and dependency-free: no `server-only`, no React, so the server (which
// passes the request's User-Agent) and the browser can both use it.

/** The user-agent token the shell appends. Never parse the OS version from the UA. */
export const NATIVE_APP_UA_TOKEN = "HightopChallengeApp/";

/** Minimal shape of the bridge the shell injects. Only what this file uses. */
type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;
  addListener?: (plugin: string, eventName: string, callback: (data: unknown) => void) => { remove?: () => unknown };
};

export type NativePlatform = "ios" | "android";

/**
 * Native plugins the web may ask about. Each is compiled into the shell; a
 * shell from before a plugin was added doesn't have it.
 * - `App`: @capacitor/app (back button, minimise).
 * - `Geolocation`: @capacitor/geolocation (one location prompt on iOS, not two).
 * - `HightopShell`: our own plugin (native/…/HightopShellPlugin) — opens a URL
 *   in the phone's browser.
 * - `Share`: @capacitor/share (the phone's share sheet; Phase 4a).
 * - `Haptics`: @capacitor/haptics (taps and buzzes; Phase 4a).
 * - `Filesystem`: @capacitor/filesystem (saves the story picture to the app's cache so the share
 *   sheet can attach it on Android; Phase 4a.1).
 */
export type NativeCapability = "App" | "Geolocation" | "HightopShell" | "Share" | "Haptics" | "Filesystem";

const UA_TOKEN_PATTERN = /HightopChallengeApp\/(\d+(?:\.\d+){0,2})\s*\((ios|android)\)/;

const readBridge = (): CapacitorBridge | null => {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return bridge && typeof bridge === "object" ? bridge : null;
};

/** True when a User-Agent string comes from the app. Safe on the server. */
export const isNativeUserAgent = (userAgent: string | null | undefined): boolean =>
  typeof userAgent === "string" && userAgent.includes(NATIVE_APP_UA_TOKEN);

/**
 * The app version and platform from a User-Agent, or null for a browser.
 * The version is the shell's (native/package.json), never the OS's. Pure.
 */
export const parseNativeUserAgent = (
  userAgent: string | null | undefined,
): { version: string; platform: NativePlatform } | null => {
  if (typeof userAgent !== "string") return null;
  const match = userAgent.match(UA_TOKEN_PATTERN);
  if (!match) return null;
  return { version: match[1], platform: match[2] as NativePlatform };
};

const browserUserAgent = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.navigator?.userAgent ?? null;
  } catch {
    return null;
  }
};

/**
 * Compares two dotted versions numerically ("1.10.0" > "1.9.2"); a missing
 * part counts as 0. Negative when a < b, 0 when equal, positive when a > b.
 * A part that isn't a number counts as 0, so junk never throws.
 */
export const compareAppVersions = (a: string, b: string): number => {
  const parts = (value: string) => value.trim().split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/**
 * True inside the iPhone/Android app, false in every browser (and always false
 * on the server — server code passes the request's UA to `isNativeUserAgent`).
 */
export const isNativeApp = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    if (isNativeUserAgent(window.navigator?.userAgent)) return true;
    return readBridge()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

/** "ios" or "android" inside the app; null in a browser and on the server. */
export const nativePlatform = (): NativePlatform | null => {
  if (!isNativeApp()) return null;
  return parseNativeUserAgent(browserUserAgent())?.platform ?? null;
};

/** The app's own version (e.g. "1.0.0") inside the app; null in a browser and on the server. */
export const nativeAppVersion = (): string | null => {
  if (!isNativeApp()) return null;
  return parseNativeUserAgent(browserUserAgent())?.version ?? null;
};

/**
 * True when this copy of the app contains the native plugin. Always false on
 * the website. Check it before every native call: old app versions stay in use.
 */
export const hasNativeCapability = (name: NativeCapability): boolean => {
  if (!isNativeApp()) return false;
  try {
    return readBridge()?.isPluginAvailable?.(name) === true;
  } catch {
    return false;
  }
};

/**
 * Calls a native plugin method. Rejects when the plugin is missing (so callers
 * can fall back to the website behaviour) or when the plugin itself rejects.
 */
export const callNative = async (
  plugin: NativeCapability,
  method: string,
  options: Record<string, unknown> = {},
): Promise<unknown> => {
  const bridge = readBridge();
  if (!hasNativeCapability(plugin) || !bridge?.nativePromise) {
    throw new Error(`Native ${plugin} is not available.`);
  }
  return bridge.nativePromise(plugin, method, options);
};

/**
 * Listens to a native plugin event (e.g. App "backButton"). Returns the
 * unsubscribe function, or null when the plugin is missing.
 */
export const addNativeListener = (
  plugin: NativeCapability,
  eventName: string,
  callback: (data: unknown) => void,
): (() => void) | null => {
  const bridge = readBridge();
  if (!hasNativeCapability(plugin) || !bridge?.addListener) return null;
  try {
    const handle = bridge.addListener(plugin, eventName, callback);
    return () => {
      try {
        void handle?.remove?.();
      } catch {
        // The page is going away anyway.
      }
    };
  } catch {
    return null;
  }
};

/**
 * Opens an https URL in the phone's own browser (Safari / Chrome), leaving the
 * app where it is. Used for everything that must not happen inside the app:
 * partner signup, billing, /admin (docs/native-app-store-plan.md §2 item 2).
 * Returns false when the shell can't do it (not in the app, or an old shell);
 * the caller then shows the URL so the partner can open it themselves.
 */
export const openInSystemBrowser = async (url: string): Promise<boolean> => {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    await callNative("HightopShell", "openInBrowser", { url });
    return true;
  } catch {
    return false;
  }
};
