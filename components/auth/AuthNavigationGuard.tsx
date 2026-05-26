"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSelectedVenueLock, setSelectedVenueLock } from "@/lib/authFastPath";
import { logAuthIncident } from "@/lib/authIncidentDebug";

function getVenueIdFromPath(pathname: string): string {
  const match = pathname.match(/^\/venue\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
}

function isJoinRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/join";
}

function isInSessionGameRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/trivia") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/pickem") ||
    pathname.startsWith("/bingo") ||
    pathname.startsWith("/fantasy") ||
    pathname.startsWith("/active-games") ||
    pathname.startsWith("/pending-challenges") ||
    pathname.startsWith("/redeem-prizes") ||
    pathname.startsWith("/faqs") ||
    pathname.startsWith("/activity") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/advertise")
  );
}

function hasValidEntryHandoff(searchParams: URLSearchParams, venueId: string): boolean {
  const entryUser = (searchParams.get("entryUser") ?? "").trim();
  const entryVenue = (searchParams.get("entryVenue") ?? "").trim();
  const entryAtRaw = Number(searchParams.get("entryAt") ?? "");
  if (!entryUser || !entryVenue || !venueId) {
    return false;
  }
  if (entryVenue !== venueId) {
    return false;
  }
  if (!Number.isFinite(entryAtRaw)) {
    return false;
  }
  return Date.now() - entryAtRaw <= 60_000;
}

export function AuthNavigationGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useAuthSession();
  const lastRedirectRef = useRef("");

  useEffect(() => {
    // lastSyncedAt === 0 means the auth state is still the initial placeholder —
    // the useEffect in AuthSessionProvider hasn't read from storage yet.
    // Redirecting before that read completes causes valid sessions to be bounced.
    if (state.lastSyncedAt === 0) return;

    // If a fresh login handoff is in progress (entryAt < 10s old), be patient —
    // cookie and localStorage writes may not have propagated to the new page yet.
    const entryAtRaw = Number(searchParams?.get("entryAt") ?? "");
    if (Number.isFinite(entryAtRaw) && Date.now() - entryAtRaw <= 10_000) {
      logAuthIncident("auth-guard", "pause-for-fresh-entry-handoff", {
        currentPath: pathname ?? "/",
      });
      return;
    }

    const currentPath = pathname ?? "/";
    // Admin is protected by dedicated admin auth; never apply venue/session redirects here.
    if (currentPath.startsWith("/admin")) {
      return;
    }
    const query = searchParams?.toString() ?? "";
    const currentUrl = query ? `${currentPath}?${query}` : currentPath;
    if (lastRedirectRef.current === currentUrl) {
      return;
    }

    const venueIdFromPath = getVenueIdFromPath(currentPath);
    const lockedVenueId = getSelectedVenueLock();
    const enforcedVenueId = (lockedVenueId || state.venueId || "").trim();
    if (state.tokenVerified && enforcedVenueId && lockedVenueId !== enforcedVenueId) {
      setSelectedVenueLock(enforcedVenueId);
    }

    // Keep join/login surfaces stable. Do not auto-redirect away from "/" or
    // "/join" based on background auth/session refreshes.
    if (isJoinRoute(currentPath)) {
      logAuthIncident("auth-guard", "join-route-stable-no-redirect", {
        currentPath,
        tokenVerified: state.tokenVerified,
        venueId: state.venueId,
      });
      return;
    }

    if (state.tokenVerified && enforcedVenueId) {
      if (!venueIdFromPath && !isInSessionGameRoute(currentPath)) {
        const target = `/venue/${encodeURIComponent(enforcedVenueId)}`;
        logAuthIncident("auth-guard", "redirect-no-venue-in-path", {
          currentPath,
          target,
          enforcedVenueId,
        });
        console.warn(`[AuthNavigationGuard] Redirecting to venue home: no venue in path at '${currentPath}'`);
        lastRedirectRef.current = target;
        router.replace(target);
        return;
      }
      if (venueIdFromPath && venueIdFromPath !== enforcedVenueId) {
        const target = `/venue/${encodeURIComponent(enforcedVenueId)}`;
        logAuthIncident("auth-guard", "redirect-venue-mismatch", {
          currentPath,
          venueIdFromPath,
          target,
          enforcedVenueId,
        });
        console.warn(`[AuthNavigationGuard] Redirecting: path venue '${venueIdFromPath}' !== enforced '${enforcedVenueId}'`);
        lastRedirectRef.current = target;
        router.replace(target);
        return;
      }
    }

    if (venueIdFromPath) {
      if (state.tokenVerified) {
        if (enforcedVenueId && enforcedVenueId !== venueIdFromPath) {
          const target = `/?v=${encodeURIComponent(venueIdFromPath)}`;
          logAuthIncident("auth-guard", "redirect-to-join-venue-mismatch", {
            currentPath,
            venueIdFromPath,
            enforcedVenueId,
            target,
          });
          console.warn(`[AuthNavigationGuard] Redirecting to join: venue mismatch '${venueIdFromPath}' vs enforced '${enforcedVenueId}'`);
          lastRedirectRef.current = target;
          router.replace(target);
        }
        return;
      }
      if (hasValidEntryHandoff(searchParams ?? new URLSearchParams(), venueIdFromPath)) {
        return;
      }
      // Prioritize a fresh entryAt URL param for 15s — covers cases where the
      // sessionStorage handoff was consumed or cleared before this guard ran.
      const entryAtForPath = Number(searchParams?.get("entryAt") ?? "");
      if (Number.isFinite(entryAtForPath) && Date.now() - entryAtForPath <= 15_000) {
        return;
      }
      const fallback = `/?v=${encodeURIComponent(venueIdFromPath)}`;
      logAuthIncident("auth-guard", "redirect-to-login-unverified-venue-path", {
        currentPath,
        venueIdFromPath,
        fallback,
      });
      console.warn(`[AuthNavigationGuard] Redirecting to login: unverified session on venue path '${venueIdFromPath}'`);
      lastRedirectRef.current = fallback;
      router.replace(fallback);
      return;
    }

    const requestedVenueId = (searchParams?.get("v") ?? "").trim();
    const isJoinFlow = isJoinRoute(currentPath);
    if (isJoinFlow && requestedVenueId && state.tokenVerified && state.venueId === requestedVenueId) {
      const target = `/venue/${encodeURIComponent(requestedVenueId)}`;
      logAuthIncident("auth-guard", "redirect-from-join-to-verified-venue", {
        currentPath,
        requestedVenueId,
        target,
      });
      lastRedirectRef.current = target;
      router.replace(target);
    }
  }, [pathname, router, searchParams, state.lastSyncedAt, state.tokenVerified, state.venueId]);

  return null;
}
