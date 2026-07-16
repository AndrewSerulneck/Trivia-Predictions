"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { VenueAccessOverlay } from "@/components/venue/VenueAccessOverlay";
import { getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import {
  AUTH_STATE_CHANGED_EVENT,
  getGodMode,
  getUserId,
  getVenueId,
} from "@/lib/storage";
import {
  buildVenuePresenceFailure,
  extractVenuePresenceFailure,
  mapVenuePresenceFailureToOverlay,
  type VenueAccessOverlayContent,
  type VenuePresenceClientFailure,
} from "@/lib/venuePresenceClient";

// How often the client re-verifies venue presence (browser geolocation +
// server heartbeat). Deliberately coarse (15 min) — paired with the matching
// server-side lease TTL (VENUE_PRESENCE_TTL_MS in lib/venuePresence.ts) — to
// avoid the old continuous watchPosition()/45s-heartbeat battery drain and
// repeated permission prompts.
//
// TRADEOFF (product sign-off): this widens the window in which a user who has
// physically LEFT the venue retains access from ~1–3 min (the old TTL) to up to
// 15 min. That is acceptable for the current casual-venue threat model; if
// tighter geofence enforcement is ever required, lower this AND
// VENUE_PRESENCE_TTL_MS together (they must stay in sync).
const PRESENCE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const PRESENCE_CHECK_STORAGE_PREFIX = "ht:venue-presence:last-check";
const GEOLOCATION_PERMISSION_DENIED = 1;

type VenuePresenceContextValue = {
  capturePresenceFailure: (payload: unknown) => VenuePresenceClientFailure | null;
  isAccessPaused: boolean;
  isInteractionBlocked: boolean;
  isCheckingAccess: boolean;
  lastFailure: VenuePresenceClientFailure | null;
  recheckLocation: () => Promise<boolean>;
};

const DEFAULT_CONTEXT: VenuePresenceContextValue = {
  capturePresenceFailure: () => null,
  isAccessPaused: false,
  isInteractionBlocked: false,
  isCheckingAccess: false,
  lastFailure: null,
  recheckLocation: async () => false,
};

const VenuePresenceContext = createContext<VenuePresenceContextValue>(DEFAULT_CONTEXT);

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return Number((error as { code?: unknown }).code) === GEOLOCATION_PERMISSION_DENIED;
}

function toHeartbeatLocation(location: Coordinates) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
  };
}

function getPresenceCheckStorageKey(userId: string, venueId: string): string {
  return `${PRESENCE_CHECK_STORAGE_PREFIX}:${userId}:${venueId}`;
}

function readLastPresenceCheckAt(userId: string, venueId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(getPresenceCheckStorageKey(userId, venueId));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastPresenceCheckAt(userId: string, venueId: string, checkedAt: number): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(getPresenceCheckStorageKey(userId, venueId), String(checkedAt));
}

function shouldShowVenueAccessOverlay(failure: VenuePresenceClientFailure): boolean {
  return (
    failure.code === "AUTH_REQUIRED" ||
    failure.code === "VENUE_OUT_OF_RANGE" ||
    failure.code === "VENUE_PROFILE_MISMATCH"
  );
}

export function VenuePresenceBoundary({
  children,
  enabled = true,
  venueId: routeVenueId,
}: {
  children: ReactNode;
  enabled?: boolean;
  venueId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState(() => String(getUserId() ?? "").trim());
  const [storedVenueId, setStoredVenueId] = useState(() => String(getVenueId() ?? "").trim());
  // God Mode accounts are enforced server-side (lib/venuePresence.ts); this local flag is
  // a UX optimization only — it suppresses the overlay flicker and skips the watchPosition/
  // heartbeat loop so god accounts don't burn battery/network polling location they don't need.
  const [isGodMode, setIsGodMode] = useState(() => getGodMode());
  const [overlay, setOverlay] = useState<VenueAccessOverlayContent | null>(null);
  const [lastFailure, setLastFailure] = useState<VenuePresenceClientFailure | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const lastHeartbeatAtRef = useRef(0);
  const heartbeatInFlightRef = useRef<Promise<boolean> | null>(null);
  const locationErrorRef = useRef<unknown>(null);
  const activeVenueId = String(routeVenueId ?? storedVenueId ?? "").trim();
  const venueHomeHref = activeVenueId ? `/venue/${encodeURIComponent(activeVenueId)}` : "/";
  const showSecondaryAction = pathname !== venueHomeHref;

  useEffect(() => {
    const syncSession = () => {
      setUserId(String(getUserId() ?? "").trim());
      setStoredVenueId(String(getVenueId() ?? "").trim());
      setIsGodMode(getGodMode());
    };

    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncSession as EventListener);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncSession as EventListener);
    };
  }, []);

  const applyFailure = useCallback((failure: VenuePresenceClientFailure) => {
    setLastFailure(failure);
    if (shouldShowVenueAccessOverlay(failure)) {
      setOverlay(
        mapVenuePresenceFailureToOverlay(failure, {
          permissionDenied: isPermissionDeniedError(locationErrorRef.current),
        })
      );
    }
  }, []);

  const capturePresenceFailure = useCallback(
    (payload: unknown) => {
      const failure = extractVenuePresenceFailure(payload);
      if (!failure) {
        return null;
      }
      applyFailure(failure);
      return failure;
    },
    [applyFailure]
  );

  const sendHeartbeat = useCallback(
    async (location: Coordinates | null) => {
      if (!enabled || !userId || !activeVenueId) {
        return false;
      }
      if (isGodMode) {
        return true;
      }
      if (heartbeatInFlightRef.current) {
        return heartbeatInFlightRef.current;
      }

      const request = (async () => {
        setIsCheckingAccess(true);
        try {
          const response = await fetch("/api/venue-presence/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              venueId: activeVenueId,
              location: location ? toHeartbeatLocation(location) : undefined,
            }),
          });
          const payload = (await response.json().catch(() => null)) as unknown;
          const failure = extractVenuePresenceFailure(payload);
          if (failure) {
            applyFailure(failure);
            return false;
          }
          locationErrorRef.current = null;
          setLastFailure(null);
          setOverlay(null);
          lastHeartbeatAtRef.current = Date.now();
          writeLastPresenceCheckAt(userId, activeVenueId, lastHeartbeatAtRef.current);
          return true;
        } catch {
          applyFailure(buildVenuePresenceFailure("VENUE_PRESENCE_UNAVAILABLE"));
          return false;
        } finally {
          heartbeatInFlightRef.current = null;
          setIsCheckingAccess(false);
        }
      })();

      heartbeatInFlightRef.current = request;
      return request;
    },
    [activeVenueId, applyFailure, enabled, isGodMode, userId]
  );

  const recheckLocation = useCallback(async () => {
    if (!enabled || !userId || !activeVenueId) {
      return false;
    }
    if (isGodMode) {
      return true;
    }
    try {
      setIsCheckingAccess(true);
      const location = await getCurrentLocation();
      locationErrorRef.current = null;
      return await sendHeartbeat(location);
    } catch (error) {
      locationErrorRef.current = error;
      const serverAllowed = await sendHeartbeat(null);
      if (!serverAllowed) {
        applyFailure(buildVenuePresenceFailure("VENUE_LOCATION_UNAVAILABLE"));
      }
      setIsCheckingAccess(false);
      return serverAllowed;
    }
  }, [activeVenueId, applyFailure, enabled, isGodMode, sendHeartbeat, userId]);

  useEffect(() => {
    if (!enabled || !userId || !activeVenueId || isGodMode) {
      setOverlay(null);
      setLastFailure(null);
      setIsCheckingAccess(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNextCheck = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        if (document.visibilityState === "hidden") {
          scheduleNextCheck(PRESENCE_CHECK_INTERVAL_MS);
          return;
        }
        void runPresenceCheck();
      }, delayMs);
    };

    const runPresenceCheck = async () => {
      try {
        const location = await getCurrentLocation();
        if (cancelled) {
          return;
        }
        locationErrorRef.current = null;
        await sendHeartbeat(location);
      } catch (error) {
        if (cancelled) {
          return;
        }
        locationErrorRef.current = error;
        await sendHeartbeat(null);
      } finally {
        if (!cancelled) {
          scheduleNextCheck(PRESENCE_CHECK_INTERVAL_MS);
        }
      }
    };

    const lastCheckAt = readLastPresenceCheckAt(userId, activeVenueId);
    lastHeartbeatAtRef.current = lastCheckAt;
    const msUntilNextCheck = Math.max(0, PRESENCE_CHECK_INTERVAL_MS - (Date.now() - lastCheckAt));
    scheduleNextCheck(msUntilNextCheck);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const nextCheckAt = lastHeartbeatAtRef.current + PRESENCE_CHECK_INTERVAL_MS;
      if (Date.now() >= nextCheckAt) {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        void runPresenceCheck();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeVenueId, enabled, isGodMode, sendHeartbeat, userId]);

  const contextValue = useMemo<VenuePresenceContextValue>(
    () => ({
      capturePresenceFailure,
      isAccessPaused: !isGodMode && Boolean(overlay),
      isInteractionBlocked: !isGodMode && Boolean(overlay),
      isCheckingAccess,
      lastFailure,
      recheckLocation,
    }),
    [capturePresenceFailure, isCheckingAccess, isGodMode, lastFailure, overlay, recheckLocation]
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <VenuePresenceContext.Provider value={contextValue}>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <div
          className={`flex min-h-0 w-full flex-1 flex-col ${overlay ? "pointer-events-none select-none" : ""}`}
          aria-hidden={overlay ? true : undefined}
        >
          {children}
        </div>
        <VenueAccessOverlay
          content={overlay}
          isBusy={isCheckingAccess}
          showSecondaryAction={showSecondaryAction}
          onPrimaryAction={() => {
            if (!overlay) {
              return;
            }
            if (overlay.primaryAction === "home") {
              router.push(venueHomeHref);
              return;
            }
            void recheckLocation();
          }}
          onSecondaryAction={
            overlay?.secondaryAction === "home"
              ? () => {
                  router.push(venueHomeHref);
                }
              : undefined
          }
        />
      </div>
    </VenuePresenceContext.Provider>
  );
}

export function useVenuePresence(): VenuePresenceContextValue {
  return useContext(VenuePresenceContext);
}
