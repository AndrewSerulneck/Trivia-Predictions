// Native plan Phase 7: one launch switch, one pair of URLs (appDownloadLink).
import { STORE_URLS, type StoreUrls } from "@/lib/appDownloadLink";
import { apexHost, isDomainSplitEnabled, playHost } from "@/lib/domainSplit";
import { nativeAppPrePaintGuard } from "@/lib/nativeApp";

export type StoreDevice = "ios" | "android" | "desktop";
export const APP_STORE_PROMOTION_DISMISSED_KEY = "htc:app-store-promotion-dismissed";
export const PLAYER_PROMOTION_PATH_PATTERN = "^/(?:owner|admin|tv|info|faqs|advertise|app|api|in-app-notice)(?:/|$)";

/** Build-time public switch. Keep off until both listings are approved and live. */
export const isAppStorePromotionEnabled = (): boolean =>
  /^(1|true|yes|on)$/i.test((process.env.NEXT_PUBLIC_APP_STORE_LINKS_ENABLED ?? "").trim());

export const iosStoreAppId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "apps.apple.com"
      ? parsed.pathname.match(/\/id([1-9]\d*)\/?$/)?.[1] ?? null : null;
  } catch { return null; }
};

export const appStorePromotionReady = (stores: StoreUrls = STORE_URLS, enabled = isAppStorePromotionEnabled()): boolean => {
  if (!enabled || !iosStoreAppId(stores.ios)) return false;
  try {
    const android = new URL(stores.android);
    return android.protocol === "https:" && android.hostname === "play.google.com"
      && android.pathname === "/store/apps/details" && android.searchParams.get("id") === "com.hightopchallenge.app";
  } catch { return false; }
};

export const storeDevice = (ua: string, touchPoints = 0): StoreDevice =>
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) ? "ios"
    : /Android/i.test(ua) ? "android" : "desktop";

/**
 * Hosts whose player pages show the app promotion: always the game host; also the apex (and www.)
 * while the domain split is off, because players use both then (10.3). Build-time values.
 */
export const promotionHosts = (): string[] => {
  const apex = apexHost();
  return isDomainSplitEnabled() ? [playHost()] : [...new Set([playHost(), apex, `www.${apex}`])];
};

export const isPromotionHost = (hostname: string | null | undefined): boolean =>
  promotionHosts().includes((hostname ?? "").toLowerCase());

export const isPlayerPromotionPath = (pathname: string): boolean =>
  !new RegExp(PLAYER_PROMOTION_PATH_PATTERN).test(pathname);

export const isSafariStoreBrowser = (ua: string, touchPoints = 0): boolean =>
  storeDevice(ua, touchPoints) === "ios" && /Safari/.test(ua)
  && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV/i.test(ua);

/** Runs in <head> before hydration. Host/UA checks keep the root layout static. */
export const smartAppBannerScript = (stores: StoreUrls = STORE_URLS, enabled = isAppStorePromotionEnabled()): string | null => {
  if (!appStorePromotionReady(stores, enabled)) return null;
  return `(function(){try{var u=navigator.userAgent;` +
    `if(${JSON.stringify(promotionHosts())}.indexOf(location.hostname)<0||${nativeAppPrePaintGuard()}||` +
    `new RegExp(${JSON.stringify(PLAYER_PROMOTION_PATH_PATTERN)}).test(location.pathname))return;` +
    `if(!(/iPhone|iPad|iPod/i.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1))||` +
    `!/Safari/.test(u)||/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV/i.test(u))return;` +
    `var m=document.createElement("meta");m.name="apple-itunes-app";` +
    `m.content="app-id=${iosStoreAppId(stores.ios)}";document.head.appendChild(m);` +
    `}catch(_){}})()`;
};
