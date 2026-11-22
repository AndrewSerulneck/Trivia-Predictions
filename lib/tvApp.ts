// The Hightop Challenge TV app (Fire TV, later Vega) — docs/fire-tv-app-plan.md D5, D6.
//
// The TV app is a thin native shell around /tv-app. It appends `HightopChallengeTV/<version>` to its WebView's
// user-agent. This file is the ONLY reader of that token and of the native bridge `window.HightopTV`
// (tests/tv-app-contract.test.ts). It is NOT the phone app: lib/nativeApp.ts must never match the TV token, or
// proxy.ts would swap the display for the "this is on our website" notice.
//
// Pure and client-safe; server code passes a request's UA to `isTvAppUserAgent`.

import { TV_VENUE_STORAGE_KEY } from "@/lib/tvConnectShared";

export const TV_APP_UA_TOKEN = "HightopChallengeTV/";
const UA_TOKEN_PATTERN = /HightopChallengeTV\/(\d+(?:\.\d+){0,2})/;

export const isTvAppUserAgent = (userAgent: string | null | undefined): boolean =>
  UA_TOKEN_PATTERN.test(String(userAgent ?? ""));

/** "1.0.0" inside the TV app; null anywhere else. */
export const tvAppVersion = (userAgent: string | null | undefined): string | null =>
  UA_TOKEN_PATTERN.exec(String(userAgent ?? ""))?.[1] ?? null;

/** True inside the TV app, false in every browser (and on the server). */
export const isTvApp = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return isTvAppUserAgent(window.navigator?.userAgent) || readBridge() !== null;
  } catch {
    return false;
  }
};

/**
 * The native bridge (Phase 4, Fire OS: an Android `addJavascriptInterface` named `HightopTV`). Backed by the app's
 * own storage, so the venue survives a cleared WebView. Every method is optional: old builds may lack one.
 */
type TvBridge = {
  getVenueId?: () => string | null | undefined;
  setVenueId?: (venueId: string) => void;
  clearVenueId?: () => void;
};

const readBridge = (): TvBridge | null => {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { HightopTV?: unknown }).HightopTV;
  return bridge && typeof bridge === "object" ? (bridge as TvBridge) : null;
};

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The TV's remembered venue: the native bridge first, then localStorage. */
export const readRememberedTvVenueId = (): string | null => {
  try {
    const fromBridge = String(readBridge()?.getVenueId?.() ?? "").trim();
    if (fromBridge) return fromBridge;
  } catch {
    // A broken bridge falls back to the page's own storage.
  }
  try {
    const stored = String(safeLocalStorage()?.getItem(TV_VENUE_STORAGE_KEY) ?? "").trim();
    return stored || null;
  } catch {
    return null;
  }
};

export const rememberTvVenueId = (venueId: string): void => {
  try {
    readBridge()?.setVenueId?.(venueId);
  } catch {
    // Keep going: localStorage below still remembers it.
  }
  try {
    safeLocalStorage()?.setItem(TV_VENUE_STORAGE_KEY, venueId);
  } catch {
    // Private mode or storage off: the TV will show the Connect screen next time.
  }
};

export const forgetTvVenueId = (): void => {
  try {
    readBridge()?.clearVenueId?.();
  } catch {
    // Fall through to localStorage.
  }
  try {
    safeLocalStorage()?.removeItem(TV_VENUE_STORAGE_KEY);
  } catch {
    // Nothing remembered to clear.
  }
};
