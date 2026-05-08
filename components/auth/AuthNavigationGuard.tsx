"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSelectedVenueLock, setSelectedVenueLock } from "@/lib/authFastPath";

function getVenueIdFromPath(pathname: string): string {
  const match = pathname.match(/^\/venue\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
}

function isInSessionGameRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/trivia") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/pickem") ||
    pathname.startsWith("/bingo") ||
    pathname.startsWith("/fantasy") ||
    pathname.startsWith("/active-games") ||
    pathname.startsWith("/pending-challenges") ||
    pathname.startsWith("/redeem-prizes") ||
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

    const currentPath = pathname ?? "/";
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

    if (state.tokenVerified && enforcedVenueId) {
      if (!venueIdFromPath && !isInSessionGameRoute(currentPath)) {
        const target = `/venue/${encodeURIComponent(enforcedVenueId)}`;
        lastRedirectRef.current = target;
        router.replace(target);
        return;
      }
      if (venueIdFromPath && venueIdFromPath !== enforcedVenueId) {
        const target = `/venue/${encodeURIComponent(enforcedVenueId)}`;
        lastRedirectRef.current = target;
        router.replace(target);
        return;
      }
    }

    if (venueIdFromPath) {
      if (state.tokenVerified) {
        if (enforcedVenueId && enforcedVenueId !== venueIdFromPath) {
          const target = `/?v=${encodeURIComponent(venueIdFromPath)}`;
          lastRedirectRef.current = target;
          router.replace(target);
        }
        return;
      }
      if (hasValidEntryHandoff(searchParams ?? new URLSearchParams(), venueIdFromPath)) {
        return;
      }
      const fallback = `/?v=${encodeURIComponent(venueIdFromPath)}`;
      lastRedirectRef.current = fallback;
      router.replace(fallback);
      return;
    }

    const requestedVenueId = (searchParams?.get("v") ?? "").trim();
    const isJoinFlow = currentPath === "/" || currentPath === "/join";
    if (isJoinFlow && requestedVenueId && state.tokenVerified && state.venueId === requestedVenueId) {
      const target = `/venue/${encodeURIComponent(requestedVenueId)}`;
      lastRedirectRef.current = target;
      router.replace(target);
    }
  }, [pathname, router, searchParams, state.lastSyncedAt, state.tokenVerified, state.venueId]);

  return null;
}
