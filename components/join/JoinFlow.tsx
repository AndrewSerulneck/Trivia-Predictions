"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PageShell } from "@/components/ui/PageShell";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createUserProfile,
  signInAnonymously,
  signOut,
  validatePin,
  validateUsername,
} from "@/lib/auth";
import { calculateDistanceMeters, getBestCurrentLocation, getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import {
  getUserId,
  getVenueId,
  saveUserId,
  saveUsername,
  saveVenueId,
} from "@/lib/storage";
import {
  abortActiveAuthRequests,
  beginAuthRequest,
  clearLoginInProgress,
  clearSelectedVenueLock,
  endAuthRequest,
  hardClearAuthAndCachePreserveVenue,
  setSelectedVenueLock,
  setLoginInProgress,
} from "@/lib/authFastPath";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getVenueById, listVenues } from "@/lib/venues";
import {
  setVenueHomeRouteIntent,
  setVenueHomeEntryHandoff,
  writeVenueHomeBootstrap,
  type HomeBadgeCounts,
  type TriviaQuotaSnapshot,
} from "@/lib/venueHomeBootstrap";
import { writeBingoPrefetchCache } from "@/lib/bingoPrefetchCache";
import type { Venue } from "@/types";
import { getVenueDisplayName, getVenueVisual as getVenueVisualFromConfig } from "@/lib/venueDisplay";
import { APP_PAGE_NAMES } from "@/lib/pageNames";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";

type Status = "idle" | "loading" | "ready" | "saving" | "error";
type JoinPanel = "venue-list" | "venue-login";
type AuthLoginState = "idle" | "authenticating" | "verifying" | "navigating" | "error";

type TriviaQuotaPayload = {
  ok?: boolean;
  quota?: TriviaQuotaSnapshot | null;
};

type BingoBadgePayload = {
  ok?: boolean;
  cards?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type PickEmBadgePayload = {
  ok?: boolean;
  picks?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type FantasyBadgePayload = {
  ok?: boolean;
  entries?: Array<{
    status?: string;
    rewardClaimedAt?: string | null;
    points?: number;
  }>;
};

function normalizeBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
}

const DISABLE_GEOFENCE_FOR_TESTING = normalizeBooleanEnv(process.env.NEXT_PUBLIC_DISABLE_GEOFENCE, false);

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function isLocationPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 1;
}

const getVenueVisual = (venue: Venue, index: number) => getVenueVisualFromConfig(venue, index);

const ACCESS_DISTANCE_METERS = 200;
const PRELOAD_FETCH_TIMEOUT_MS = 1500;
const LOGIN_WATCHDOG_TIMEOUT_MS = 30000;

function getGeofenceThresholdMeters(venueRadius: number, accuracy?: number): number {
  const normalizedVenueRadius = Number.isFinite(venueRadius) ? Math.max(0, Math.round(venueRadius)) : 0;
  const baseRadius = Math.max(ACCESS_DISTANCE_METERS, normalizedVenueRadius);
  const accuracyBuffer = Number.isFinite(accuracy) ? Math.min(5000, Math.max(120, Math.round(Number(accuracy) * 1.5))) : 320;
  return baseRadius + accuracyBuffer;
}

const ONBOARDING_PANEL_VARIANTS = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 1,
  }),
  center: {
    x: "0%",
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 1,
  }),
};

const SWIPE_SPRING_TRANSITION = {
  type: "tween" as const,
  duration: 0.22,
  ease: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
};

const LOADING_PHRASES = [
  "Lace up...",
  "Checking the stats...",
  "Entering the arena...",
  "Warming up...",
  "Taking the field...",
  "Game time...",
];

type LocationResult = {
  coords: Coordinates | null;
  permissionDenied: boolean;
};

async function getInitialLocation(): Promise<LocationResult> {
  try {
    let current = await getCurrentLocation();
    if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
      current = await getBestCurrentLocation({
        sampleDurationMs: 2800,
        timeoutMs: 4000,
        desiredAccuracyMeters: 220,
      });
    }
    return { coords: current, permissionDenied: false };
  } catch (error) {
    return { coords: null, permissionDenied: isLocationPermissionDenied(error) };
  }
}

function VenueListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-700 bg-slate-800/50" />
      ))}
    </div>
  );
}

type VenueListItemProps = {
  venue: Venue;
  index: number;
  isPending: boolean;
  onSelect: (venue: Venue) => void;
};

const VenueListItem = memo(function VenueListItem({ venue, index, isPending, onSelect }: VenueListItemProps) {
  const visual = getVenueVisual(venue, index);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(venue)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 transition-all hover:border-cyan-400/50 hover:bg-slate-800 active:scale-[0.98]"
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-base font-medium text-white">
            {visual.logoText}
          </span>
          <span className="font-semibold text-white">
            {isPending
              ? `Opening ${getVenueDisplayName(venue)}...`
              : `Join ${getVenueDisplayName(venue)}`}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-xl"
        >
          {visual.icon}
        </span>
      </button>
    </li>
  );
});

function HightopNeonLogo() {
  return (
    <div className="flex flex-col items-center py-6 select-none" aria-label="Hightop Challenge">
      <div
        className="font-['Bree_Serif',Georgia,serif] text-[2.75rem] font-normal leading-none tracking-[0.12em] uppercase"
        aria-hidden="true"
        style={{
          color: "#a5f3fc",
          textShadow:
            "0 0 4px #a5f3fc, 0 0 12px #22d3ee, 0 0 28px #06b6d4, 0 0 48px #0891b2",
        }}
      >
        Hightop
      </div>
      <div
        className="my-2 h-px w-32 rounded-full"
        aria-hidden="true"
        style={{
          background: "linear-gradient(90deg, transparent, #fbbf24, #fde68a, #fbbf24, transparent)",
          boxShadow: "0 0 8px #f59e0b, 0 0 18px #d97706",
        }}
      />
      <div
        className="font-['Bree_Serif',Georgia,serif] text-[2.75rem] font-normal leading-none tracking-[0.12em] uppercase"
        aria-hidden="true"
        style={{
          color: "#d8b4fe",
          textShadow:
            "0 0 4px #d8b4fe, 0 0 12px #a855f7, 0 0 28px #7c3aed, 0 0 48px #6d28d9",
        }}
      >
        Challenge
      </div>
    </div>
  );
}

type UsernameStepProps = {
  direction: 1 | -1;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isAdvancingToPin: boolean;
  locationLoading: boolean;
  errorMessage: string;
  onBack: () => void;
  onNext: (username: string) => void;
};

const UsernameStep = memo(function UsernameStep({
  direction,
  inputRef,
  isAdvancingToPin,
  locationLoading,
  errorMessage,
  onBack,
  onNext,
}: UsernameStepProps) {
  const [value, setValue] = useState("");

  const handleNext = useCallback(() => {
    if (!value.trim() || isAdvancingToPin) return;
    onNext(value);
  }, [value, isAdvancingToPin, onNext]);

  return (
    <motion.div
      key="step-username"
      custom={direction}
      variants={ONBOARDING_PANEL_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      transition={SWIPE_SPRING_TRANSITION}
      className="flex flex-col gap-5"
    >
      <div>
        <p className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
          Your Username
        </p>
        <h1 className="text-2xl font-black text-white">What&apos;s your username?</h1>
        <p className="mt-1 text-sm font-semibold text-ht-fg-muted">
          If you&apos;ve never played before, make one up!
        </p>
      </div>

      <input
        ref={inputRef}
        id="username"
        type="text"
        enterKeyHint="next"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleNext();
          }
        }}
        placeholder="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-xl bg-slate-800 p-3 text-2xl font-semibold text-white placeholder:text-slate-500 focus:outline-none"
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/30 p-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          style={{ border: "1px solid #1c2b3a" }}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-5 py-2.5 text-sm font-black text-[#fff7ea] shadow-sm transition-all active:scale-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60"
        >
          <span aria-hidden="true">←</span>
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!value.trim() || isAdvancingToPin}
          className="tp-clean-button inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {isAdvancingToPin ? "Loading..." : "Next →"}
        </button>
      </div>

      {locationLoading ? (
        <p className="text-xs text-ht-fg-muted">Verifying your location...</p>
      ) : null}
    </motion.div>
  );
});

type PinStepProps = {
  direction: 1 | -1;
  pin: string;
  isPinShaking: boolean;
  isAuthLoading: boolean;
  canCreate: boolean;
  loadingPhrase: string;
  errorMessage: string;
  connectionRetryMessage: string;
  pinContainerRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onSubmit: () => void;
  onAnimationComplete: () => void;
  onPinContainerClick: () => void;
};

const PinStep = memo(function PinStep({
  direction,
  pin,
  isPinShaking,
  isAuthLoading,
  canCreate,
  loadingPhrase,
  errorMessage,
  connectionRetryMessage,
  pinContainerRef,
  onBack,
  onSubmit,
  onAnimationComplete,
  onPinContainerClick,
}: PinStepProps) {
  return (
    <motion.div
      key="step-pin"
      custom={direction}
      variants={ONBOARDING_PANEL_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      transition={SWIPE_SPRING_TRANSITION}
      onAnimationComplete={onAnimationComplete}
      className="flex flex-col gap-5"
    >
      <div>
        <p className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
          Your PIN
        </p>
        <h1 className="text-2xl font-black text-white">What&apos;s your PIN?</h1>
        <p className="mt-1 text-sm font-semibold text-ht-fg-muted">
          Returning? Use your last PIN. New? Pick 4 digits you&apos;ll remember.
        </p>
      </div>

      <div
        ref={pinContainerRef}
        className={`flex cursor-text items-center gap-6 px-2 ${isPinShaking ? "animate-shake" : ""}`}
        onClick={onPinContainerClick}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? "scale-125 border-cyan-400 bg-cyan-400"
                : "border-slate-600 bg-transparent"
            }`}
          />
        ))}
      </div>

      {isAuthLoading ? (
        <p className="animate-pulse text-sm text-ht-fg-muted">{loadingPhrase}</p>
      ) : errorMessage ? (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/30 p-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : connectionRetryMessage ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-200">
          {connectionRetryMessage}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          style={{ border: "1px solid #1c2b3a" }}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-5 py-2.5 text-sm font-black text-[#fff7ea] shadow-sm transition-all active:scale-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60"
        >
          <span aria-hidden="true">←</span>
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canCreate || pin.length !== 4 || isAuthLoading}
          className="tp-clean-button inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          Enter ↵
        </button>
      </div>
    </motion.div>
  );
});

export function JoinFlow({ initialVenueId }: { initialVenueId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state: authSessionState, refresh: refreshAuthSession } = useAuthSession();
  const venueParam = initialVenueId.trim();

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueList, setVenueList] = useState<Venue[]>([]);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [lastLocationVerifiedAt, setLastLocationVerifiedAt] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [panelDirection, setPanelDirection] = useState<1 | -1>(1);
  const [activePanel, setActivePanel] = useState<JoinPanel>(venueParam ? "venue-login" : "venue-list");
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [isOptimisticallyEntering, setIsOptimisticallyEntering] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authLoginState, setAuthLoginState] = useState<AuthLoginState>("idle");
  const [connectionRetryMessage, setConnectionRetryMessage] = useState("");
  const [pendingVenueSelectionId, setPendingVenueSelectionId] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<"username" | "pin">("username");
  const [loginStepDirection, setLoginStepDirection] = useState<1 | -1>(1);
  const [isPinShaking, setIsPinShaking] = useState(false);
  const [isAdvancingToPin, setIsAdvancingToPin] = useState(false);
  const [isReturningUserForVenue, setIsReturningUserForVenue] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("Entering the arena...");
  const autoVerificationAttemptedRef = useRef(false);
  const loginAttemptIdRef = useRef(0);
  const loginAbortRef = useRef<AbortController | null>(null);
  const loginWatchdogRef = useRef<number | null>(null);
  const navigationFallbackRef = useRef<number | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const pinContainerRef = useRef<HTMLDivElement>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const pinFocusTimerRef = useRef<number | null>(null);
  const pinSubmittingRef = useRef(false);
  const createProfileRef = useRef<((pinOverride?: string) => Promise<void>) | null>(null);
  const hasSuccessfulInitialRenderRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      if (venueParam && getUserId() && getVenueId() === venueParam) {
        router.replace(`/venue/${venueParam}`);
        return;
      }

      // Preserve a stable join UI after first successful initialization.
      // Background refreshes should not blank the panel/state.
      if (!hasSuccessfulInitialRenderRef.current) {
        setStatus("loading");
        setErrorMessage("");
        setLocationVerified(false);
        setLastLocationVerifiedAt(null);
        setDistanceMeters(null);
        setLocationNotice("Verifying your location...");
      }
      autoVerificationAttemptedRef.current = false;

      try {
        if (!venueParam) {
          let locationPromise: Promise<LocationResult> | null = null;
          if (!DISABLE_GEOFENCE_FOR_TESTING) {
            setLocationLoading(true);
            locationPromise = getInitialLocation();
          }

          const venues = await listVenues();
          setVenueList(venues);
          setActivePanel("venue-list");
          setStatus("ready");
          hasSuccessfulInitialRenderRef.current = true;

          if (DISABLE_GEOFENCE_FOR_TESTING) {
            setLocationVerified(true);
            setLocationNotice("Testing mode: location checks are disabled.");
            setLocationLoading(false);
            setVenue(null);
            return;
          }

          if (locationPromise) {
            const { coords, permissionDenied } = await locationPromise;
            if (coords) {
              const distanceByVenue = venues.map((item) => ({
                venue: item,
                distance: calculateDistanceMeters(coords, {
                  latitude: item.latitude,
                  longitude: item.longitude,
                }),
              }));
              const sortedByDistance = [...distanceByVenue]
                .sort((a, b) => a.distance - b.distance)
                .map((item) => item.venue);
              const nearbyCount = distanceByVenue.filter(
                (item) => item.distance <= getGeofenceThresholdMeters(item.venue.radius, coords.accuracy)
              ).length;
              setVenueList(sortedByDistance);
              setLocationNotice(
                nearbyCount > 0
                  ? `Found ${nearbyCount} nearby venue(s).`
                  : "Showing all venues. You'll verify location after selecting one."
              );
            } else {
              setLocationNotice(
                permissionDenied
                  ? "Location permission is off. You can still choose a venue and verify afterward."
                  : "Location check unavailable right now. You can still choose a venue and verify afterward."
              );
            }
            setLocationLoading(false);
          }
          setVenue(null);
          return;
        }

        const venues = await listVenues();
        setVenueList(venues);

        const venueData = await getVenueById(venueParam);
        if (!venueData) {
          setStatus("error");
          setErrorMessage(`Venue "${venueParam}" was not found.`);
          return;
        }

        setVenue(venueData);
        setActivePanel("venue-login");
        setStatus("ready");
        hasSuccessfulInitialRenderRef.current = true;

        if (!isSupabaseConfigured) {
          setErrorMessage(
            "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
          );
          return;
        }

        if (!DISABLE_GEOFENCE_FOR_TESTING) {
          setLocationLoading(true);
          try {
            let current = await getCurrentLocation();
            if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
              current = await getBestCurrentLocation({
                sampleDurationMs: 2800,
                timeoutMs: 5500,
                desiredAccuracyMeters: 220,
              });
            }
            const distance = calculateDistanceMeters(current, {
              latitude: venueData.latitude,
              longitude: venueData.longitude,
            });
            setDistanceMeters(distance);
            const allowedDistance = getGeofenceThresholdMeters(venueData.radius, current.accuracy);
            if (distance <= allowedDistance) {
              setLocationVerified(true);
              setLastLocationVerifiedAt(Date.now());
              setLocationNotice("");
            } else {
              setLocationVerified(false);
              setLastLocationVerifiedAt(null);
              setLocationNotice("");
              setErrorMessage(`You are ${Math.round(distance)}m away. Required range is ${Math.round(allowedDistance)}m.`);
            }
          } catch (error) {
            setLocationVerified(false);
            setLastLocationVerifiedAt(null);
            setLocationNotice("");
            if (isLocationPermissionDenied(error)) {
              setErrorMessage("Sorry, you must share your location in order to play!");
            } else {
              setErrorMessage(getErrorMessage(error, "Unable to verify location."));
            }
          } finally {
            setLocationLoading(false);
          }
        } else {
          setLocationVerified(true);
          setLastLocationVerifiedAt(Date.now());
          setLocationNotice("");
        }
      } catch (error) {
        if (hasSuccessfulInitialRenderRef.current) {
          // Keep current panel/list visible and only surface a non-blocking error.
          setStatus("ready");
          setErrorMessage(getErrorMessage(error, "Failed to refresh venue data. Please retry if needed."));
          return;
        }
        setStatus("error");
        setErrorMessage(getErrorMessage(error, "Failed to initialize join flow."));
      }
    };

    void load();
  }, [venueParam, router]);

  const clearLoginWatchdog = useCallback(() => {
    if (loginWatchdogRef.current !== null) {
      window.clearTimeout(loginWatchdogRef.current);
      loginWatchdogRef.current = null;
    }
  }, []);

  const clearNavigationFallback = useCallback(() => {
    if (navigationFallbackRef.current !== null) {
      window.clearTimeout(navigationFallbackRef.current);
      navigationFallbackRef.current = null;
    }
  }, []);

  const abortInFlightLogin = useCallback(() => {
    abortActiveAuthRequests();
    if (loginAbortRef.current) {
      loginAbortRef.current.abort();
      loginAbortRef.current = null;
    }
    clearLoginWatchdog();
    clearNavigationFallback();
  }, [clearLoginWatchdog, clearNavigationFallback]);

  const forceNavigateToVenue = useCallback(
    (venueId: string, userId?: string) => {
      const safeVenueId = venueId.trim();
      if (!safeVenueId) {
        return;
      }
      const target = `/venue/${encodeURIComponent(safeVenueId)}`;
      const targetWithEntry = userId
        ? `${target}?entryUser=${encodeURIComponent(userId)}&entryVenue=${encodeURIComponent(
            safeVenueId
          )}&entryAt=${Date.now()}`
        : target;

      setSelectedVenueLock(safeVenueId);
      setLoginInProgress(safeVenueId);
      clearNavigationFallback();
      router.replace(targetWithEntry);

      navigationFallbackRef.current = window.setTimeout(() => {
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith(target)) {
          window.location.assign(targetWithEntry);
        }
      }, 2000);
    },
    [clearNavigationFallback, router]
  );

  const preflightVenueHomeCriticalData = useCallback(
    async (params: { userId: string; venueId: string; signal: AbortSignal }) => {
      const { userId, venueId, signal } = params;
      const response = await fetch(
        `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
        {
          cache: "no-store",
          signal,
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            profile?: {
              venueId?: string;
            } | null;
          }
        | null;
      if (!response.ok || !payload?.ok || !payload.profile) {
        throw new Error("Unable to verify your venue profile. Please try logging in again.");
      }
      if (String(payload.profile.venueId ?? "").trim() !== venueId) {
        throw new Error("Your profile is linked to a different venue. Please try again.");
      }
    },
    []
  );

  useEffect(() => {
    if (!venueParam) {
      return;
    }
    if (status === "saving" || authLoginState === "navigating") {
      return;
    }
    if (!authSessionState.tokenVerified) {
      return;
    }
    if ((authSessionState.venueId ?? "").trim() !== venueParam) {
      return;
    }
    forceNavigateToVenue(venueParam);
  }, [authLoginState, authSessionState.tokenVerified, authSessionState.venueId, forceNavigateToVenue, status, venueParam]);

  useEffect(() => {
    if (!pathname?.startsWith("/join") && pathname !== "/") {
      clearNavigationFallback();
    }
  }, [clearNavigationFallback, pathname]);

  const verifyVenueAccess = useCallback(
    async (selectedVenue: Venue) => {
      if (DISABLE_GEOFENCE_FOR_TESTING) {
        setLocationLoading(false);
        setLocationVerified(true);
        setLastLocationVerifiedAt(Date.now());
        setLocationNotice("Testing mode: location checks are disabled.");
        setDistanceMeters(null);
        setErrorMessage("");
        return;
      }

      setLocationLoading(true);
      setLocationNotice("Verifying your location...");
      try {
        let current = await getCurrentLocation();
        if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
          current = await getBestCurrentLocation({
            sampleDurationMs: 2800,
            timeoutMs: 5500,
            desiredAccuracyMeters: 220,
          });
        }

        const distance = calculateDistanceMeters(current, {
          latitude: selectedVenue.latitude,
          longitude: selectedVenue.longitude,
        });
        const allowedDistance = getGeofenceThresholdMeters(selectedVenue.radius, current.accuracy);

        setDistanceMeters(distance);
        if (distance <= allowedDistance) {
          setLocationVerified(true);
          setLastLocationVerifiedAt(Date.now());
          setLocationNotice("");
          setErrorMessage("");
          return;
        }

        setLocationVerified(false);
        setLastLocationVerifiedAt(null);
        setLocationNotice("");
        setErrorMessage(`You are ${Math.round(distance)}m away. Required range is ${Math.round(allowedDistance)}m.`);
      } catch (error) {
        setLocationVerified(false);
        setLastLocationVerifiedAt(null);
        setLocationNotice("");
        if (isLocationPermissionDenied(error)) {
          setErrorMessage("Sorry, you must share your location in order to play!");
        } else {
          setErrorMessage(getErrorMessage(error, "Unable to verify location."));
        }
      } finally {
        setLocationLoading(false);
      }
    },
    []
  );

  const handleSelectVenue = useCallback(
    (selectedVenue: Venue) => {
      setPanelDirection(1);
      setActivePanel("venue-login");
      setLoginStep("username");
      setLoginStepDirection(1);
      setPendingVenueSelectionId(selectedVenue.id);
      setVenue(selectedVenue);
      setErrorMessage("");
      setUsername("");
      setPin("");
      setIsTransitioning(false);
      setIsOptimisticallyEntering(false);
      setStatus("ready");

      window.setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 220);

      void verifyVenueAccess(selectedVenue).finally(() => {
        setPendingVenueSelectionId((current) => (current === selectedVenue.id ? null : current));
      });
    },
    [verifyVenueAccess]
  );

  const handleBackToVenueList = useCallback(() => {
    setPanelDirection(-1);
    setActivePanel("venue-list");
    setLoginStep("username");
    setLoginStepDirection(1);
    setVenue(null);
    setErrorMessage("");
    setPin("");
    setIsTransitioning(false);
    setIsOptimisticallyEntering(false);
    setPendingVenueSelectionId(null);
  }, []);

  const handleGoToPinStep = useCallback((usernameValue: string) => {
    if (isAdvancingToPin) {
      return;
    }
    if (!validateUsername(usernameValue)) {
      setErrorMessage("Please enter a valid username.");
      return;
    }
    setUsername(usernameValue);
    setErrorMessage("");
    setPin("");
    setIsAdvancingToPin(true);
    setLoginStepDirection(1);
    setLoginStep("pin");
    setIsReturningUserForVenue(false);
    pinInputRef.current?.focus();
    if (venue && validateUsername(usernameValue)) {
      void fetch(
        `/api/join/profile?username=${encodeURIComponent(usernameValue.trim())}&venueId=${encodeURIComponent(venue.id)}`,
        { cache: "no-store" }
      )
        .then((response) => response.json().catch(() => null))
        .then((payload) => {
          const isReturning = Boolean(payload?.ok && payload?.isReturningUser);
          setIsReturningUserForVenue(isReturning);
        })
        .catch(() => {
          setIsReturningUserForVenue(false);
        });
    }
  }, [isAdvancingToPin, venue]);

  const handlePinAnimationComplete = useCallback(() => {
    setIsAdvancingToPin(false);
  }, []);

  const handlePinContainerClick = useCallback(() => {
    pinInputRef.current?.focus();
  }, []);

  const handleBackFromPin = useCallback(() => {
    if (pinFocusTimerRef.current) {
      window.clearTimeout(pinFocusTimerRef.current);
      pinFocusTimerRef.current = null;
    }
    setIsAdvancingToPin(false);
    setLoginStepDirection(-1);
    setLoginStep("username");
    setPin("");
    setIsReturningUserForVenue(false);
    setErrorMessage("");
  }, []);

  const handlePinDigit = useCallback((value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    setPin(cleaned);
  }, []);

  const handleSubmitPinStep = useCallback(
    (pinOverride?: string) => {
      const candidatePin = String(pinOverride ?? pin).replace(/\D/g, "").slice(0, 4);
      if (loginStep !== "pin" || !validatePin(candidatePin) || pinSubmittingRef.current) {
        return;
      }
      pinSubmittingRef.current = true;
      void createProfileRef.current?.(candidatePin).finally(() => {
        pinSubmittingRef.current = false;
      });
    },
    [loginStep, pin]
  );

  useEffect(() => {
    if (loginStep !== "pin" || !isReturningUserForVenue || pin.length !== 4 || pinSubmittingRef.current) {
      return;
    }
    handleSubmitPinStep(pin);
  }, [handleSubmitPinStep, isReturningUserForVenue, loginStep, pin]);

  const canCreate = useMemo(() => {
    return Boolean(
      isSupabaseConfigured &&
        venue &&
        validateUsername(username) &&
        validatePin(pin) &&
        locationVerified &&
        !locationLoading &&
        !isTransitioning
    );
  }, [isTransitioning, locationLoading, locationVerified, venue, username, pin]);

  const openAdminDashboard = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.assign("/admin");
      return;
    }
    router.push("/admin");
  }, [router]);

  const stopScanLoop = useCallback(() => {
    if (scanRafRef.current) {
      window.cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    if (scanStreamRef.current) {
      for (const track of scanStreamRef.current.getTracks()) {
        track.stop();
      }
      scanStreamRef.current = null;
    }
    if (scanVideoRef.current) {
      scanVideoRef.current.srcObject = null;
    }
    scanCanvasRef.current = null;
  }, []);

  const routeFromQrPayload = useCallback(
    (value: string): boolean => {
      const raw = value.trim();
      if (!raw) {
        return false;
      }

      if (/^venue-[a-z0-9-]+$/i.test(raw)) {
        router.push(`/?v=${encodeURIComponent(raw)}`);
        return true;
      }

      try {
        const parsed = new URL(raw, window.location.origin);
        const venueQuery = parsed.searchParams.get("v")?.trim();
        if (venueQuery) {
          router.push(`/?v=${encodeURIComponent(venueQuery)}`);
          return true;
        }
        const venuePathMatch = parsed.pathname.match(/^\/venue\/([^/?#]+)/i);
        if (venuePathMatch?.[1]) {
          router.push(`/?v=${encodeURIComponent(venuePathMatch[1])}`);
          return true;
        }
      } catch {
        return false;
      }

      return false;
    },
    [router]
  );

  const startQrScan = useCallback(async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    setScanNotice("");
    setIsScanningQr(true);
    stopScanLoop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
      scanStreamRef.current = stream;
      let mountAttempts = 0;
      while (!scanVideoRef.current && mountAttempts < 12) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        mountAttempts += 1;
      }
      if (!scanVideoRef.current) {
        setScanNotice("Unable to initialize camera preview. Please try again.");
        setIsScanningQr(false);
        stopScanLoop();
        return;
      }

      scanVideoRef.current.srcObject = stream;
      await scanVideoRef.current.play();

      const BarcodeDetectorCtor = (
        window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }
      ).BarcodeDetector;

      const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ["qr_code"] }) : null;
      const useBarcodeDetector = Boolean(BarcodeDetectorCtor);
      if (!useBarcodeDetector) {
        setScanNotice("Using compatibility scan mode.");
      }
      let jsQrDecode: ((data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: "attemptBoth" | "dontInvert" | "onlyInvert" }) => { data?: string } | null) | null = null;

      const tick = async () => {
        const video = scanVideoRef.current;
        if (!video || video.readyState < 2) {
          scanRafRef.current = window.requestAnimationFrame(() => {
            void tick();
          });
          return;
        }

        try {
          let rawValue = "";
          if (useBarcodeDetector) {
            const codes = await detector!.detect(video);
            rawValue = codes[0]?.rawValue?.trim() ?? "";
          } else {
            const frameWidth = Math.max(1, Math.floor(video.videoWidth || 0));
            const frameHeight = Math.max(1, Math.floor(video.videoHeight || 0));
            if (frameWidth > 1 && frameHeight > 1) {
              if (!jsQrDecode) {
                const jsQrModule = await import("jsqr");
                jsQrDecode = jsQrModule.default;
              }
              if (!scanCanvasRef.current) {
                scanCanvasRef.current = document.createElement("canvas");
              }
              const canvas = scanCanvasRef.current;
              if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
                canvas.width = frameWidth;
                canvas.height = frameHeight;
              }
              const context = canvas.getContext("2d", { willReadFrequently: true });
              if (context) {
                context.drawImage(video, 0, 0, frameWidth, frameHeight);
                const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
                const code = jsQrDecode?.(imageData.data, frameWidth, frameHeight, {
                  inversionAttempts: "attemptBoth",
                });
                rawValue = code?.data?.trim() ?? "";
              }
            }
          }
          if (rawValue && routeFromQrPayload(rawValue)) {
            setIsScanningQr(false);
            stopScanLoop();
            return;
          }
        } catch {
          // Ignore transient decode misses and continue scanning.
        }

        scanRafRef.current = window.requestAnimationFrame(() => {
          void tick();
        });
      };

      scanRafRef.current = window.requestAnimationFrame(() => {
        void tick();
      });
    } catch {
      setScanNotice("Camera unavailable. You can still join by selecting a venue below.");
      setIsScanningQr(false);
      stopScanLoop();
    }
  }, [routeFromQrPayload, stopScanLoop]);

  useEffect(() => {
    return () => {
      stopScanLoop();
    };
  }, [stopScanLoop]);

  useEffect(() => {
    return () => {
      abortInFlightLogin();
      clearNavigationFallback();
    };
  }, [abortInFlightLogin, clearNavigationFallback]);

  useEffect(() => {
    if (!venue) {
      return;
    }
    router.prefetch(`/venue/${venue.id}`);
  }, [router, venue]);

  useEffect(() => {
    if (activePanel !== "venue-login" || loginStep !== "username") return;
    const t = window.setTimeout(() => { usernameInputRef.current?.focus(); }, 50);
    return () => window.clearTimeout(t);
  }, [activePanel, loginStep]);

  useEffect(() => {
    return () => { if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current); };
  }, []);

  useEffect(() => {
    return () => {
      if (pinFocusTimerRef.current) {
        window.clearTimeout(pinFocusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => { createProfileRef.current = createProfile; });

  const preloadVenueHome = useCallback(
    async (selectedVenue: Venue, userId: string) => {
      const venueId = selectedVenue.id;
      const safeUserId = userId.trim();
      if (!venueId || !safeUserId) {
        return;
      }

      const fetchJson = async <T,>(url: string): Promise<T | null> => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
          controller.abort();
        }, PRELOAD_FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          return (await response.json().catch(() => null)) as T | null;
        } catch {
          return null;
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      let triviaQuota: TriviaQuotaSnapshot | null = null;
      let homeBadgeCounts: HomeBadgeCounts = {};

      try {
        const results = await Promise.allSettled([
          fetchJson<TriviaQuotaPayload>(`/api/trivia/quota?userId=${encodeURIComponent(safeUserId)}`),
          fetchJson<BingoBadgePayload>(`/api/bingo/cards?userId=${encodeURIComponent(safeUserId)}&includeSettled=true`),
          fetchJson<PickEmBadgePayload>(
            `/api/pickem/picks?userId=${encodeURIComponent(safeUserId)}&venueId=${encodeURIComponent(venueId)}&includeSettled=true&limit=200`
          ),
          fetchJson<FantasyBadgePayload>(
            `/api/fantasy/entries?userId=${encodeURIComponent(safeUserId)}&venueId=${encodeURIComponent(venueId)}&includeSettled=true&refreshProgress=true&limit=120`
          ),
        ]);

        const getValue = <T,>(result: PromiseSettledResult<T | null>): T | null =>
          result.status === "fulfilled" ? result.value : null;

        const triviaQuotaPayload = getValue<TriviaQuotaPayload>(results[0]);
        const bingoPayload = getValue<BingoBadgePayload>(results[1]);
        const pickEmPayload = getValue<PickEmBadgePayload>(results[2]);
        const fantasyPayload = getValue<FantasyBadgePayload>(results[3]);

        triviaQuota = triviaQuotaPayload?.ok ? (triviaQuotaPayload.quota ?? null) : null;

        const unclaimedBingoCount = (bingoPayload?.cards ?? []).filter(
          (c) => c.status === "won" && !c.rewardClaimedAt && Number(c.rewardPoints ?? 0) > 0
        ).length;
        if (bingoPayload?.ok && Array.isArray(bingoPayload.cards)) {
          writeBingoPrefetchCache(safeUserId, bingoPayload.cards);
        }
        const unclaimedPickEmCount = (pickEmPayload?.picks ?? []).filter(
          (p) => p.status === "won" && !p.rewardClaimedAt && Number(p.rewardPoints ?? 0) > 0
        ).length;
        const unclaimedFantasyCount = (fantasyPayload?.entries ?? []).filter(
          (entry) => entry.status === "final" && !entry.rewardClaimedAt && Number(entry.points ?? 0) > 0
        ).length;
        homeBadgeCounts = { bingo: unclaimedBingoCount, pickem: unclaimedPickEmCount, fantasy: unclaimedFantasyCount };
      } catch {
        // Non-essential fetch processing failed; bootstrap will use defaults.
      } finally {
        writeVenueHomeBootstrap({
          fetchedAt: Date.now(),
          venueId,
          userId: safeUserId,
          triviaQuota,
          homeBadgeCounts,
          weeklyPrizeTitle: "Weekly Venue Champion Prize",
          weeklyPrizeDescription: "Top the leaderboard by week end to earn this venue's reward.",
          weeklyPrizePoints: 0,
          leaderboardEntries: [],
        });
      }
    },
    []
  );

  const createProfile = async (pinOverride?: string) => {
    const effectivePin = pinOverride ?? pin;
    if (!venue) return;
    setErrorMessage("");
    setConnectionRetryMessage("");
    setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
    if (!validateUsername(username)) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!validatePin(effectivePin)) {
      setErrorMessage("PIN must be exactly 4 digits.");
      return;
    }
    if (!DISABLE_GEOFENCE_FOR_TESTING && !locationVerified) {
      setErrorMessage("Verify your location before creating a profile.");
      return;
    }

    setLocationNotice("");

    const targetVenuePath = `/venue/${venue.id}`;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tp:global-transition-show", {
          detail: { targetPath: targetVenuePath },
        })
      );
    }

    abortInFlightLogin();

    const attemptId = loginAttemptIdRef.current + 1;
    loginAttemptIdRef.current = attemptId;

    const loginController = beginAuthRequest();
    loginAbortRef.current = loginController;
    clearLoginWatchdog();

    setAuthLoginState("authenticating");
    setIsTransitioning(true);
    setIsOptimisticallyEntering(true);
    setStatus("saving");
    setIsAuthLoading(true);
    setLocationNotice("Joining venue...");

    loginWatchdogRef.current = window.setTimeout(() => {
      if (loginAttemptIdRef.current !== attemptId) {
        return;
      }
      if (loginAbortRef.current) {
        loginAbortRef.current.abort();
      }
      setConnectionRetryMessage(
        "Connection is slow. Your venue is still selected — tap Enter Game to retry."
      );
    }, LOGIN_WATCHDOG_TIMEOUT_MS);

    let didNavigate = false;
    try {
      // Never block PIN login on Supabase auth sign-out latency.
      void signOut().catch(() => {});

      const user = await createUserProfile({
        username,
        venueId: venue.id,
        selectedVenueId: venue.id,
        pin: effectivePin,
        signal: loginController.signal,
      });

      if (loginAttemptIdRef.current !== attemptId || loginController.signal.aborted) {
        return;
      }
      if (String(user.venueId ?? "").trim() !== venue.id) {
        throw new Error("Session venue mismatch detected. Please try again.");
      }

      hardClearAuthAndCachePreserveVenue(venue.id);
      saveVenueId(venue.id);
      saveUsername(user.username);
      saveUserId(user.id);
      setSelectedVenueLock(venue.id);
      setLoginInProgress(venue.id);
      refreshAuthSession();
      setVenueHomeRouteIntent({ venueId: venue.id });
      setVenueHomeEntryHandoff({ venueId: venue.id, userId: user.id });

      setAuthLoginState("navigating");
      didNavigate = true;
      const hardTarget = `/venue/${encodeURIComponent(venue.id)}?entryUser=${encodeURIComponent(
        user.id
      )}&entryVenue=${encodeURIComponent(venue.id)}&entryAt=${Date.now()}`;
      void signInAnonymously().catch(() => {});
      window.location.assign(hardTarget);
      void preflightVenueHomeCriticalData({
        userId: user.id,
        venueId: venue.id,
        signal: loginController.signal,
      }).catch(() => {});
      void preloadVenueHome(venue, user.id).catch(() => {});
    } catch (error) {
      if (loginAttemptIdRef.current !== attemptId) {
        return;
      }
      if (error instanceof Error && error.message === "Login request was canceled.") {
        return;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tp:global-transition-hide", { detail: { force: true } }));
      }
      setAuthLoginState("error");
      const message = getErrorMessage(error, "Failed to create profile.");
      if (message === "Join request timed out. Please try again.") {
        setConnectionRetryMessage(
          "Connection is slow. Venue is still selected, and you can retry now without starting over."
        );
      } else {
        setErrorMessage(message);
      }
    } finally {
      if (loginAttemptIdRef.current === attemptId) {
        loginAbortRef.current = null;
        endAuthRequest(loginController);
        clearLoginWatchdog();
        setIsAuthLoading(false);
      }
      if (!didNavigate) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("tp:global-transition-hide", { detail: { force: true } }));
        }
        clearLoginInProgress();
        clearSelectedVenueLock();
        setIsOptimisticallyEntering(false);
        setIsTransitioning(false);
        setStatus("ready");
        if (loginAttemptIdRef.current === attemptId) {
          setAuthLoginState("idle");
        }
      }
    }
  };

  return (
    <PageShell
        title={APP_PAGE_NAMES.join}
        showAlerts={false}
        showPageTitle={false}
        showUserStatus={false}
        lockViewport
        noContainer
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-md px-4 py-5">
              <HightopNeonLogo />

              {/* Dark join card */}
              <div className="rounded-3xl border border-cyan-400/40 bg-slate-900 p-6">

                {/* Panels */}
                <div className="relative [overflow-x:clip]">
                  <AnimatePresence initial={false} custom={panelDirection} mode="wait">

                    {activePanel === "venue-login" && venue ? (
                      <motion.div
                        key={`venue-login-${venue.id}`}
                        custom={panelDirection}
                        variants={ONBOARDING_PANEL_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={SWIPE_SPRING_TRANSITION}
                        className="relative"
                      >
                        {/* Venue name context label */}
                        <p className="mb-5 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
                          {getVenueDisplayName(venue)}
                        </p>

                        {/* Hidden PIN input — always mounted so iOS numeric keypad can be focused synchronously from within the user-gesture stack */}
                        <input
                          ref={pinInputRef}
                          type="tel"
                          inputMode="numeric"
                          enterKeyHint="go"
                          pattern="[0-9]*"
                          value={pin}
                          maxLength={4}
                          autoComplete="one-time-code"
                          onChange={(e) => {
                            if (loginStep !== "pin") return;
                            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSubmitPinStep();
                            }
                          }}
                          className="absolute h-px w-px overflow-hidden opacity-0"
                          aria-label="4-digit PIN"
                        />

                        <AnimatePresence custom={loginStepDirection} mode="wait">
                          {loginStep === "username" ? (
                            <UsernameStep
                              key="step-username"
                              direction={loginStepDirection}
                              inputRef={usernameInputRef}
                              isAdvancingToPin={isAdvancingToPin}
                              locationLoading={locationLoading}
                              errorMessage={errorMessage}
                              onBack={handleBackToVenueList}
                              onNext={handleGoToPinStep}
                            />
                          ) : (
                            <PinStep
                              key="step-pin"
                              direction={loginStepDirection}
                              pin={pin}
                              isPinShaking={isPinShaking}
                              isAuthLoading={isAuthLoading}
                              canCreate={canCreate}
                              loadingPhrase={loadingPhrase}
                              errorMessage={errorMessage}
                              connectionRetryMessage={connectionRetryMessage}
                              pinContainerRef={pinContainerRef}
                              onBack={handleBackFromPin}
                              onSubmit={handleSubmitPinStep}
                              onAnimationComplete={handlePinAnimationComplete}
                              onPinContainerClick={handlePinContainerClick}
                            />
                          )}
                        </AnimatePresence>
                      </motion.div>

                    ) : (

                      <motion.div
                        key="venue-list"
                        custom={panelDirection}
                        variants={ONBOARDING_PANEL_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={SWIPE_SPRING_TRANSITION}
                      >
                        {errorMessage && (
                          <div className="mb-4 rounded-xl border border-rose-400/60 bg-rose-950/30 p-3 text-sm text-rose-200">
                            {errorMessage}
                          </div>
                        )}

                        {venueList.length > 0 ? (
                          <div className="space-y-4">
                            <div>
                              <p className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
                                Choose Your Venue
                              </p>
                              {locationLoading ? (
                                <p className="text-xs text-ht-fg-muted">Finding nearby venues...</p>
                              ) : locationNotice ? (
                                <p className="text-xs text-ht-fg-muted">{locationNotice}</p>
                              ) : null}
                            </div>
                            <ul className="space-y-2">
                              {venueList.map((item, index) => (
                                <VenueListItem
                                  key={item.id}
                                  venue={item}
                                  index={index}
                                  isPending={pendingVenueSelectionId === item.id}
                                  onSelect={handleSelectVenue}
                                />
                              ))}
                            </ul>
                            <InlineSlotAdClient
                              slot="inline-content"
                              venueId={venueParam || undefined}
                              pageKey="join"
                              adType="inline"
                              displayTrigger="on-load"
                              allowAnyVenue
                              showPlaceholder
                            />
                          </div>
                        ) : status === "loading" ? (
                          <VenueListSkeleton />
                        ) : (
                          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                            <p className="font-semibold text-white">Nearby venues only</p>
                            {locationLoading ? (
                              <p className="text-sm text-ht-fg-muted">Checking your location to find venues in range...</p>
                            ) : locationNotice ? (
                              <p className="text-sm text-ht-fg-muted">{locationNotice}</p>
                            ) : (
                              <p className="text-sm text-ht-fg-muted">No venue is currently in range from your location.</p>
                            )}
                            <button
                              type="button"
                              onClick={() => router.refresh()}
                              className="tp-clean-button inline-flex min-h-[42px] items-center rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                            >
                              Retry nearby venue scan
                            </button>
                          </div>
                        )}
                      </motion.div>

                    )}

                  </AnimatePresence>
                </div>

              </div>
            </div>
          </div>
        </div>
  </PageShell>
  );
}
