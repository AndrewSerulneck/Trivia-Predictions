"use client";

import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { VENUE_HOME_GAME_KEYS, inferVenueGameKeyFromPath } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";

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
// ─────────────────────────────────────────────────────────────────────────────

export type ExitNavigationOptions = {
  /** Parent destination used whenever history can't be trusted. */
  href?: string;
  /** Skip history entirely and push `href` (or the resolved venue home). */
  preferHref?: boolean;
  /** Resolve the destination from the stored venue id and run the game→venue transition. */
  venueHomeFallback?: boolean;
  /** Caller-owned exit. When supplied it wins over everything else. */
  onExit?: () => void;
};

/** `navigator.vibrate(14)` — the standard back-press haptic. Safe on every platform. */
export function triggerBackHaptic(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(14);
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

export function useExitNavigation({
  href = "/",
  preferHref = false,
  venueHomeFallback = false,
  onExit,
}: ExitNavigationOptions = {}) {
  const router = useRouter();

  const resolveHref = () => {
    if (!venueHomeFallback) {
      return href;
    }
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) {
      return href;
    }
    return `/venue/${encodeURIComponent(venueId)}`;
  };

  const handleExit = () => {
    if (onExit) {
      onExit();
      return;
    }

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
                router.push(fallbackHref);
              },
            }),
        });
        return;
      }
      void navigateBackToVenue({
        venuePath: fallbackHref,
        fallbackNavigate: () => {
          router.push(fallbackHref);
        },
      });
      return;
    }

    if (preferHref) {
      router.push(fallbackHref);
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
        router.push(getInternalReferrerPath() || fallbackHref);
        return;
      }

      const currentUrl = window.location.href;
      window.history.back();

      window.setTimeout(() => {
        if (window.location.href !== currentUrl) {
          return;
        }
        const referrerPath = getInternalReferrerPath();
        router.push(referrerPath || fallbackHref);
      }, 150);
      return;
    }

    router.push(fallbackHref);
  };

  return { handleExit, triggerBackHaptic, resolveHref };
}
