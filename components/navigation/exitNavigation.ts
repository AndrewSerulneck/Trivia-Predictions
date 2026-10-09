"use client";

import { haptic } from "@/lib/haptics";

import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { VENUE_HOME_GAME_KEYS, inferVenueGameKeyFromPath } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { homeHref } from "@/lib/domainSplit";
import { isNativeApp } from "@/lib/nativeApp";

// ─────────────────────────────────────────────────────────────────────────────
// exitNavigation — the single source of truth for what "exit-back" DOES.
//
// Extracted verbatim from components/navigation/BackButton.tsx so the legacy
// warm-pill BackButton and the new ExitBackButton cannot drift while call sites
// migrate across phases. Nothing here renders; styling lives in the components.
//
// Three behaviours, in precedence order:
//   1. onExit           — caller owns the navigation entirely (e.g. GameAppBar's
//                         parent-injected exit that runs the venue return anim)
//   2. venueHomeFallback— resolve the player's venue home and run the venue-game
//                         return transition when leaving a venue-home game
//   3. history          — history.back() with PWA + no-op hardening, falling
//                         through to `href`
//
// DO NOT reimplement any of this inline. See docs/navigation-unification-plan.md §3.
//
// `handleExit({ replace: true })` — Android's Back button inside the app
// (ExitBackButton's native registration). Every navigation this hook makes
// itself then REPLACES the current entry instead of pushing one: a pushed parent
// would become the next Back's history.back() target and Back would bounce
// between the two screens. A tap calls `handleExit()` and pushes, exactly as the
// website always has. `history.back()` paths and `onExit` are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

export type ExitNavigationOptions = {
  /** Parent destination used whenever history can't be trusted. */
  href?: string;
  /**
   * The parent is the HOME page: `/info` on the website, the app's front door
   * inside the native app (`homeHref()` in lib/domainSplit.ts). Replaces `href`.
   * Use this instead of passing `marketingHref("/info")`.
   */
  home?: boolean;
  /** Skip history entirely and push `href` (or the resolved venue home). */
  preferHref?: boolean;
  /** Resolve the destination from the stored venue id and run the game→venue transition. */
  venueHomeFallback?: boolean;
  /** Caller-owned exit. When supplied it wins over everything else. */
  onExit?: () => void;
};

export type ExitRunOptions = {
  /** Replace the current history entry instead of pushing one (Android Back in the app). */
  replace?: boolean;
};

/** `navigator.vibrate(14)` — the standard back-press haptic. Safe on every platform. */
export function triggerBackHaptic(): void {
  haptic("selection");
}

/**
 * Same-origin referrer path, or "" when there isn't a usable one. Used as the
 * first fallback when `history.back()` can't or didn't work.
 */
export function getInternalReferrerPath(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }
  const referrer = document.referrer?.trim();
  if (!referrer) {
    return "";
  }

  try {
    const parsedReferrer = new URL(referrer);
    if (parsedReferrer.origin !== window.location.origin) {
      return "";
    }

    const nextPath = `${parsedReferrer.pathname}${parsedReferrer.search}${parsedReferrer.hash}`;
    if (!nextPath || nextPath.startsWith("/api/") || nextPath.startsWith("/advertise")) {
      return "";
    }

    return nextPath;
  } catch {
    return "";
  }
}

/**
 * In the native app, how long Back waits for `history.back()` to start leaving
 * before it falls back to the parent. See the in-app branch in handleExit.
 */
export const IN_APP_BACK_FALLBACK_MS = 2000;

export function useExitNavigation({
  href = "/",
  home = false,
  preferHref = false,
  venueHomeFallback = false,
  onExit,
}: ExitNavigationOptions = {}) {
  const router = useRouter();

  const resolveHref = () => {
    const parentHref = home ? homeHref(isNativeApp()) : href;
    if (!venueHomeFallback) {
      return parentHref;
    }
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) {
      return parentHref;
    }
    return `/venue/${encodeURIComponent(venueId)}`;
  };

  const handleExit = ({ replace = false }: ExitRunOptions = {}) => {
    if (onExit) {
      onExit();
      return;
    }

    const goTo = (target: string) => {
      if (replace) {
        router.replace(target);
        return;
      }
      router.push(target);
    };
    const fallbackHref = resolveHref();

    if (venueHomeFallback) {
      const pathname = typeof window !== "undefined" ? window.location.pathname : "";
      const gameKey = inferVenueGameKeyFromPath(pathname);
      if (gameKey && VENUE_HOME_GAME_KEYS.includes(gameKey)) {
        void runVenueGameReturnTransition({
          gameKey,
          navigate: () =>
            navigateBackToVenue({
              venuePath: fallbackHref,
              fallbackNavigate: () => {
                goTo(fallbackHref);
              },
            }),
        });
        return;
      }
      void navigateBackToVenue({
        venuePath: fallbackHref,
        fallbackNavigate: () => {
          goTo(fallbackHref);
        },
      });
      return;
    }

    if (preferHref) {
      goTo(fallbackHref);
      return;
    }

    if (typeof window !== "undefined") {
      // Installed-PWA hardening: a standalone launch starts with a fresh
      // history stack and no browser back button, so at the entry point
      // `history.back()` is a no-op and the player has nothing to fall back
      // on. When there is demonstrably no entry to go back to, route to the
      // parent instead of burning 150ms waiting for a navigation that will
      // never happen. Browser behaviour with real history is unchanged.
      if (window.history.length <= 1) {
        goTo(getInternalReferrerPath() || fallbackHref);
        return;
      }

      const currentUrl = window.location.href;

      // Native app only (docs/native-app-store-plan.md Phase 2E, R6). A Back that
      // crosses documents (a legal page on the apex back to a `play.` page) only
      // starts leaving when the previous page's response arrives — measured at
      // +150 ms in the simulator, longer on a phone network. The 150 ms fallback
      // below then fires a SECOND navigation that cancels the first, and the app
      // shell used to show "No connection" for the cancelled one. In the app,
      // wait for `pagehide` (the page really leaving) with a longer ceiling, so
      // Back is one navigation. WebKit fires no `beforeunload` for history
      // traversal, so `pagehide` is the earliest signal there is. The website
      // keeps its 150 ms behaviour unchanged.
      if (isNativeApp()) {
        let leaving = false;
        const markLeaving = () => {
          leaving = true;
        };
        window.addEventListener("pagehide", markLeaving, { once: true });
        window.history.back();
        window.setTimeout(() => {
          window.removeEventListener("pagehide", markLeaving);
          if (leaving || window.location.href !== currentUrl) {
            return;
          }
          goTo(getInternalReferrerPath() || fallbackHref);
        }, IN_APP_BACK_FALLBACK_MS);
        return;
      }

      window.history.back();

      window.setTimeout(() => {
        if (window.location.href !== currentUrl) {
          return;
        }
        const referrerPath = getInternalReferrerPath();
        goTo(referrerPath || fallbackHref);
      }, 150);
      return;
    }

    goTo(fallbackHref);
  };

  return { handleExit, triggerBackHaptic, resolveHref };
}
