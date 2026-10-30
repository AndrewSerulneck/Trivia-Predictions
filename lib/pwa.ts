"use client";

// This module exports React hooks, so it must declare the client boundary itself.
// Everything here reads `navigator` / `matchMedia` / `window`, so there is nothing a
// server component could correctly call anyway. The directive matters because
// `lib/socialShare/deviceCapabilities.ts` imports `isRunningAsInstalledPwa` from here,
// which pulls this file into the previously React-free `lib/socialShare/*` chain — without
// it, the first server component that touches that chain fails the build with
// "You're importing a component that needs `useState`."

import { useSyncExternalStore } from "react";

// Single source of truth for "is this player running the installed PWA."
// iOS Safari only ever reports this via the legacy `navigator.standalone`
// flag; every other standalone-capable browser reports it via matchMedia.
// Both must be checked to catch every platform.
type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  if ((navigator as NavigatorWithStandalone).standalone === true) {
    return true;
  }

  if (typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches;
}

function subscribeToDisplayMode(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/**
 * React binding for the check above. `useSyncExternalStore` rather than
 * state-in-an-effect: the server snapshot is pinned to `false` (there is no
 * display mode to read during SSR), so the first client render matches the
 * server and React swaps in the real value without a hydration mismatch.
 */
export function useIsRunningAsInstalledPwa(): boolean {
  return useSyncExternalStore(subscribeToDisplayMode, isRunningAsInstalledPwa, () => false);
}
