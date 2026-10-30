"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { STORE_URLS } from "@/lib/appDownloadLink";
import { gameHref } from "@/lib/domainSplit";
import { isNativeApp } from "@/lib/nativeApp";
import { isRunningAsInstalledPwa } from "@/lib/pwa";
import {
  APP_STORE_PROMOTION_DISMISSED_KEY, appStorePromotionReady, isPlayerPromotionPath,
  iosStoreAppId, isPromotionHost, isSafariStoreBrowser, storeDevice, type StoreDevice,
} from "@/lib/appStorePromotion";

// Build-time constants: parse the store URLs once, not in every getSnapshot (10.3 F10).
const PROMOTION_READY = appStorePromotionReady();

const subscribeBrowser = (): (() => void) => () => {};
// Three values, so "not known yet" is never read as "hide": "pending" (server + hydration),
// "" (hide: off, native app, installed PWA) and "device:host".
const PENDING = "pending";
const browserSnapshot = (): string => {
  if (!PROMOTION_READY || isNativeApp() || isRunningAsInstalledPwa()) return "";
  return `${storeDevice(navigator.userAgent, navigator.maxTouchPoints)}:${location.hostname}`;
};
const serverSnapshot = (): string => (PROMOTION_READY ? PENDING : "");
// Primitive snapshots are stable; SSR/hydration render "pending" without state-in-effect.
function useStoreSnapshot(): string {
  return useSyncExternalStore(subscribeBrowser, browserSnapshot, serverSnapshot);
}
function useStoreBrowser(): { device: StoreDevice; hostname: string } | null {
  const snapshot = useStoreSnapshot();
  if (!snapshot || snapshot === PENDING) return null;
  const [device, hostname] = snapshot.split(":");
  return { device: device as StoreDevice, hostname };
}

const readDismissed = (): boolean => {
  if (!PROMOTION_READY) return true;
  try { return localStorage.getItem(APP_STORE_PROMOTION_DISMISSED_KEY) === "true"; }
  catch { return false; }
};
const subscribeDismissed = (onChange: () => void): (() => void) => {
  if (!PROMOTION_READY) return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

function StoreBadges({ device }: { device: StoreDevice }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5 p-[12px]">
      {device !== "android" ? (
        <a href={STORE_URLS.ios} aria-label="Download Hightop Challenge on the App Store">
          <Image src="/brand/stores/app-store.svg" alt="Download on the App Store" width={120} height={40} unoptimized className="h-[40px] w-auto" />
        </a>
      ) : null}
      {device !== "ios" ? (
        <a href={STORE_URLS.android} aria-label="Get Hightop Challenge on Google Play">
          <Image src="/brand/stores/google-play.png" alt="Get it on Google Play" width={646} height={250} unoptimized className="h-[60px] w-auto" />
        </a>
      ) : null}
    </div>
  );
}

/**
 * Player section only, separate from /info's partner sales content. Rendered on the server in its
 * desktop form (so `/info#app` has a target in the static HTML), then narrowed to the visitor's device.
 */
export function AppStoreDownloadSection() {
  const snapshot = useStoreSnapshot();
  if (!snapshot) return null;
  const device: StoreDevice = snapshot === PENDING ? "desktop" : (snapshot.split(":")[0] as StoreDevice);
  return (
    <section id="app" className="px-5 py-16 text-center" aria-label="App for players">
      <h2 className="text-2xl font-black text-white">For players</h2>
      <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-4">
        <StoreBadges device={device} />
        <a href={gameHref("/")} className="rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950">Play in your browser</a>
        {device === "desktop" ? (
          <div className="flex flex-col items-center gap-2">
            <Image src="/share/app-download-qr-v1.png" alt="Scan to choose the app or browser on your phone" width={96} height={96} unoptimized />
            <span className="text-sm text-slate-300">Scan with your phone</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Quiet sign-in pointer, below the existing choices; never rendered for a native request. */
export function JoinAppStoreLink({ nativeAppRequest = false }: { nativeAppRequest?: boolean }) {
  const browser = useStoreBrowser();
  if (nativeAppRequest || !browser || !isPromotionHost(browser.hostname)) return null;
  return (
    <div className="flex flex-wrap items-center justify-center text-sm text-ht-fg-muted" aria-label="Get the app">
      <span>Get the app</span><StoreBadges device={browser.device} />
    </div>
  );
}

/** Android's small dismissible bar, only on player pages on the game host (and the apex while the split is off). Safari owns its native banner. */
export function PlayerAppStoreBanner() {
  const pathname = usePathname() ?? "/";
  const browser = useStoreBrowser();
  const [dismissed, setDismissed] = useState(false);
  const storedDismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);
  // Keep metadata scoped correctly across Next client navigation as well as full page loads. Effects run
  // only in the browser, so read it directly: the hydration render's snapshot is "pending", and reading
  // that as "not allowed" removed the tag the head script had just added (10.3 F8).
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]');
    const wanted = PROMOTION_READY && isPromotionHost(location.hostname) && isPlayerPromotionPath(pathname)
      && isSafariStoreBrowser(navigator.userAgent, navigator.maxTouchPoints)
      && !isNativeApp() && !isRunningAsInstalledPwa();
    if (!wanted) { existing?.remove(); return; }
    const content = `app-id=${iosStoreAppId(STORE_URLS.ios)}`;
    if (!existing) {
      const meta = document.createElement("meta");
      meta.name = "apple-itunes-app";
      meta.content = content;
      document.head.appendChild(meta);
    } else if (existing.content !== content) existing.content = content;
  }, [pathname]);
  if (!browser || browser.device !== "android" || !isPromotionHost(browser.hostname)
    || !isPlayerPromotionPath(pathname) || pathname === "/" || pathname === "/join" || dismissed || storedDismissed) return null;
  return (
    <aside aria-label="Hightop Challenge app" className="flex items-center justify-center gap-4 bg-slate-950 px-4 py-2 text-sm text-white">
      <a href={STORE_URLS.android} className="font-semibold underline underline-offset-4">Get the app</a>
      <button type="button" aria-label="Dismiss app download banner" className="min-h-11 px-3" onClick={() => {
        setDismissed(true);
        try { localStorage.setItem(APP_STORE_PROMOTION_DISMISSED_KEY, "true"); } catch { /* Dismissed for this visit. */ }
      }}>×</button>
    </aside>
  );
}
