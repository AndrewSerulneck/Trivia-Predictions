"use client";

// This module exports React hooks, so it must declare the client boundary itself.
// Everything here reads `navigator` / `matchMedia` / `window`, so there is nothing a
// server component could correctly call anyway. The directive matters because
// `lib/socialShare/deviceCapabilities.ts` imports `isRunningAsInstalledPwa` from here,
// which pulls this file into the previously React-free `lib/socialShare/*` chain — without
// it, the first server component that touches that chain fails the build with
// "You're importing a component that needs `useState`."

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for the "Add to Home Screen" install prompt UX (Phase 5 of
 * docs/bingo-fullscreen-pwa-plan.md). Off = today's behavior, fully inert: no
 * `beforeinstallprompt` listener, no coach card, no copy. Same reversible
 * convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` /
 * `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`. Must not be flipped on before the
 * domain split ships — see docs/pwa-install-rollout-runbook.md.
 */
export function isInstallPromptEnabled(): boolean {
  return truthy(process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED);
}

/**
 * True only for actual mobile Safari on iOS/iPadOS. Every other iOS browser
 * (Chrome, Firefox, Edge, in-app webviews) is a WebKit wrapper that cannot
 * install a standalone PWA even though it shares Safari's UA tokens — only
 * bare Safari's Share sheet has "Add to Home Screen".
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const isIOSDevice = /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
  if (!isIOSDevice) {
    return false;
  }
  return !/crios|fxios|edgios|opios|mercury|duckduckgo|gsa|fban|fbav/i.test(ua);
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * Android/Chromium install path. Only arms its listeners when the flag above
 * is on and the player isn't already standalone — otherwise a no-op so it's
 * safe to mount unconditionally. `promptInstall` must only be called from a
 * real user gesture (a click handler), per the Fullscreen/install-prompt spec.
 */
export function usePwaInstallPrompt(): {
  canInstallOnDevice: boolean;
  promptInstall: () => void;
} {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isInstallPromptEnabled() || isRunningAsInstalledPwa()) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferredEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(() => {
    if (!deferredEvent) {
      return;
    }
    void deferredEvent.prompt();
    void deferredEvent.userChoice.then(() => {
      setDeferredEvent(null);
    });
  }, [deferredEvent]);

  return { canInstallOnDevice: deferredEvent !== null, promptInstall };
}
