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

const HEARTBEAT_INTERVAL_MS = 45_000;
const WATCH_HEARTBEAT_MIN_GAP_MS = 15_000;
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
  const [overlay, setOverlay] = useState<VenueAccessOverlayContent | null>(null);
  const [lastFailure, setLastFailure] = useState<VenuePresenceClientFailure | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const latestLocationRef = useRef<Coordinates | null>(null);
  const lastHeartbeatAtRef = useRef(0);
  const heartbeatInFlightRef = useRef<Promise<boolean> | null>(null);
  const locationErrorRef = useRef<unknown>(null);
  const overlayRef = useRef<VenueAccessOverlayContent | null>(null);
  const activeVenueId = String(routeVenueId ?? storedVenueId ?? "").trim();
  const venueHomeHref = activeVenueId ? `/venue/${encodeURIComponent(activeVenueId)}` : "/";
  const showSecondaryAction = pathname !== venueHomeHref;

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    const syncSession = () => {
      setUserId(String(getUserId() ?? "").trim());
      setStoredVenueId(String(getVenueId() ?? "").trim());
    };

    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncSession as EventListener);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncSession as EventListener);
    };
  }, []);

  const applyFailure = useCallback((failure: VenuePresenceClientFailure) => {
    const nextOverlay = mapVenuePresenceFailureToOverlay(failure, {
      permissionDenied: isPermissionDeniedError(locationErrorRef.current),
    });
    setLastFailure(failure);
    setOverlay(nextOverlay);
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
    async (location: Coordinates | null, options: { showChecking?: boolean } = {}) => {
      if (!enabled || !userId || !activeVenueId) {
        return false;
      }
      if (heartbeatInFlightRef.current) {
        return heartbeatInFlightRef.current;
      }

      if (options.showChecking) {
        setOverlay(
          mapVenuePresenceFailureToOverlay(buildVenuePresenceFailure("VENUE_PRESENCE_UNAVAILABLE"), {
            permissionDenied: false,
          })
        );
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
    [activeVenueId, applyFailure, enabled, userId]
  );

  const recheckLocation = useCallback(async () => {
    if (!enabled || !userId || !activeVenueId) {
      return false;
    }
    try {
      setIsCheckingAccess(true);
      const location = await getCurrentLocation();
      latestLocationRef.current = location;
      locationErrorRef.current = null;
      return await sendHeartbeat(location, { showChecking: true });
    } catch (error) {
      locationErrorRef.current = error;
      applyFailure(buildVenuePresenceFailure("VENUE_LOCATION_UNAVAILABLE"));
      setIsCheckingAccess(false);
      return false;
    }
  }, [activeVenueId, applyFailure, enabled, sendHeartbeat, userId]);

  useEffect(() => {
    if (!enabled || !userId || !activeVenueId) {
      setOverlay(null);
      setLastFailure(null);
      setIsCheckingAccess(false);
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;
    let watchId: number | null = null;

    const primeHeartbeat = async () => {
      try {
        const location = await getCurrentLocation();
        if (cancelled) {
          return;
        }
        latestLocationRef.current = location;
        locationErrorRef.current = null;
        await sendHeartbeat(location);
      } catch (error) {
        if (cancelled) {
          return;
        }
        locationErrorRef.current = error;
        applyFailure(buildVenuePresenceFailure("VENUE_LOCATION_UNAVAILABLE"));
      }
    };

    void primeHeartbeat();

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const location: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          latestLocationRef.current = location;
          locationErrorRef.current = null;

          const sinceLastHeartbeat = Date.now() - lastHeartbeatAtRef.current;
          if (sinceLastHeartbeat >= WATCH_HEARTBEAT_MIN_GAP_MS || overlayRef.current) {
            void sendHeartbeat(location, { showChecking: Boolean(overlayRef.current) });
          }
        },
        (error) => {
          if (cancelled) {
            return;
          }
          locationErrorRef.current = error;
          applyFailure(buildVenuePresenceFailure("VENUE_LOCATION_UNAVAILABLE"));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 15_000,
          timeout: 12_000,
        }
      );
    }

    intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      if (latestLocationRef.current) {
        void sendHeartbeat(latestLocationRef.current, { showChecking: Boolean(overlayRef.current) });
        return;
      }
      void recheckLocation();
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void recheckLocation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeVenueId, applyFailure, enabled, recheckLocation, sendHeartbeat, userId]);

  const contextValue = useMemo<VenuePresenceContextValue>(
    () => ({
      capturePresenceFailure,
      isAccessPaused: Boolean(overlay),
      isInteractionBlocked: Boolean(overlay),
      isCheckingAccess,
      lastFailure,
      recheckLocation,
    }),
    [capturePresenceFailure, isCheckingAccess, lastFailure, overlay, recheckLocation]
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
