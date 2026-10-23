// The app download link `hightopchallenge.com/app` (docs/native-app-store-plan.md Phase 9a).
// Pure; read by app/app/route.ts, the badge components (Phase 7) and the share cards (9b).
//
// PERMANENT: the PATH is printed on pictures people keep in their camera roll (a QR
// cannot be updated), so it is a literal, never env-derived. Only the store URLs below
// change, on launch day.

import { JOIN_QR_URL } from "@/lib/joinQr";
import { isNativeUserAgent } from "@/lib/nativeApp";

/** The permanent short path, and the value every share card's QR encodes. */
export const APP_DOWNLOAD_PATH = "/app";
export const APP_DOWNLOAD_URL = "https://hightopchallenge.com/app";
export const APP_DOWNLOAD_DISPLAY_URL = "hightopchallenge.com/app";

/**
 * Store listing URLs. EMPTY until each listing is live (Phase 6 approval); filling one in
 * is the only change needed for that store to start receiving /app taps.
 */
export const IOS_APP_STORE_URL = "";
export const ANDROID_PLAY_STORE_URL = "";

export type StoreUrls = { ios: string; android: string };

export const STORE_URLS: StoreUrls = { ios: IOS_APP_STORE_URL, android: ANDROID_PLAY_STORE_URL };

export type AppLinkDestination =
  | { kind: "external"; url: string }
  | { kind: "site"; path: string; host: "play" | "apex" }
  // Phase 9g: a phone with a live listing sees one small page first. `ipad-maybe` is a
  // Mac-looking Safari that might be an iPad (iPadOS sends a Mac User-Agent).
  | { kind: "ask"; device: "ios" | "android" | "ipad-maybe"; storeUrl: string };

/** Safari on a Mac UA: no other browser token. iPadOS 13+ Safari looks exactly like this. */
const looksLikeMacSafari = (ua: string): boolean =>
  /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|Firefox|FxiOS|Edg/.test(ua);

/**
 * Where a tap on /app goes. Never dead-ends:
 * - inside the app: its front door (the player sign-in), never a store;
 * - iPhone/iPad → the "Get the app?" page (App Store), Android → the same page (Google Play),
 *   once that store URL is set; a Mac-looking Safari gets the "maybe iPad" form of it;
 * - a store URL still unset → the player sign-in, so a share made today still works;
 * - anything else (desktop, unknown) → `/info#app`, or the sign-in while no listing is live.
 */
export const decideAppLinkDestination = (
  userAgent: string | null | undefined,
  stores: StoreUrls = STORE_URLS,
): AppLinkDestination => {
  const ua = userAgent ?? "";
  if (isNativeUserAgent(ua)) return { kind: "site", path: "/", host: "play" };

  const anyLive = Boolean(stores.ios || stores.android);
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return stores.ios
      ? { kind: "ask", device: "ios", storeUrl: stores.ios }
      : { kind: "external", url: JOIN_QR_URL };
  }
  if (/Android/i.test(ua)) {
    return stores.android
      ? { kind: "ask", device: "android", storeUrl: stores.android }
      : { kind: "external", url: JOIN_QR_URL };
  }
  if (stores.ios && looksLikeMacSafari(ua)) return { kind: "ask", device: "ipad-maybe", storeUrl: stores.ios };
  return anyLive ? { kind: "site", path: "/info#app", host: "apex" } : { kind: "external", url: JOIN_QR_URL };
};
