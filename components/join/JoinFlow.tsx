"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const JOIN_BUTTON_POP_CLASS =
  "transition-all duration-150 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";

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
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50"
        />
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
        className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-100 px-4 py-3 text-base text-slate-700 shadow-sm transition-all ${JOIN_BUTTON_POP_CLASS} hover:from-blue-50 hover:to-cyan-50`}
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-medium text-slate-800">
            {visual.logoText}
          </span>
          <span className="font-medium">
            {isPending ? `Opening ${getVenueDisplayName(venue)}...` : `Join ${getVenueDisplayName(venue)}`}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-xl"
        >
          {visual.icon}
        </span>
      </button>
    </li>
  );
});

const LIGHTS_MAX_WIDTH = 860;
const LIGHTS_ASPECT_RATIO = 1.0;

function getLightsSize(viewportWidth: number) {
  const width = Math.min(LIGHTS_MAX_WIDTH, Math.max(440, Math.round(viewportWidth * 1.65)));
  const height = Math.round(LIGHTS_ASPECT_RATIO * width);
  return { width, height };
}

const JoinHeaderLights = () => {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [hydrated, setHydrated] = useState(false);
  const lightsSize = getLightsSize(viewport.width || 390);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextViewport = { width: window.innerWidth, height: window.innerHeight };
    setViewport(nextViewport);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const handleResize = () => {
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      setViewport(nextViewport);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [hydrated]);

  if (!hydrated || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[1200]">
      <div
        role="presentation"
        className="absolute left-1/2 top-0 select-none"
        style={{
          width: `${lightsSize.width}px`,
          height: `${lightsSize.height}px`,
          transform: `translate(-50%, -${Math.round(lightsSize.height * 0.31)}px)`,
        }}
      >
        <Image
          src="/brand/stadium-lights-overlay-processed.png"
          alt="Stadium lights overlay"
          draggable={false}
          width={lightsSize.width}
          height={lightsSize.height}
          className="h-full w-full object-contain opacity-80 [mix-blend-mode:screen] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.82)_30%,rgba(0,0,0,0.5)_62%,rgba(0,0,0,0.18)_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.82)_30%,rgba(0,0,0,0.5)_62%,rgba(0,0,0,0.18)_82%,transparent_100%)]"
        />
      </div>
    </div>,
    document.body
  );
};
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
      className="flex flex-col pt-4 pb-10"
    >
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
        What&apos;s your username?
      </h1>
      <p className="mb-8 text-lg font-semibold text-slate-900">
        If you&apos;ve never played Hightop Challenge before, make one up!
      </p>

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
        placeholder=""
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="mb-2 w-full border-0 border-b-2 border-slate-200 bg-transparent px-3 py-3 text-3xl font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-slate-900"
      />

      {errorMessage ? (
        <p className="mb-4 text-sm text-rose-500">{errorMessage}</p>
      ) : (
        <div className="mb-4" />
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
        >
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">←</span>
          Back
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!value.trim() || isAdvancingToPin}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90 disabled:opacity-40"
        >
          {isAdvancingToPin ? "Loading..." : "Next"}
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">→</span>
        </button>
      </div>

      {locationLoading ? (
        <p className="mt-4 text-xs text-slate-400">Verifying your location...</p>
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
      className="flex flex-col pt-4 pb-10"
    >
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
        What&apos;s your PIN?
      </h1>
      <p className="mb-10 text-lg font-semibold text-slate-900">
        Returning user? Use your last PIN.<br />
        New user? Pick 4 digits you&apos;ll remember.
      </p>

      <div
        ref={pinContainerRef}
        className={`mb-4 flex cursor-text gap-6 px-3 ${isPinShaking ? "animate-shake" : ""}`}
        onClick={onPinContainerClick}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? "scale-125 border-slate-900 bg-slate-900"
                : "border-slate-300 bg-transparent"
            }`}
          />
        ))}
      </div>

      {isAuthLoading ? (
        <p className="mb-4 animate-pulse text-base text-slate-500">{loadingPhrase}</p>
      ) : errorMessage ? (
        <p className="mb-4 text-sm text-rose-500">{errorMessage}</p>
      ) : connectionRetryMessage ? (
        <p className="mb-4 text-sm text-amber-700">{connectionRetryMessage}</p>
      ) : (
        <div className="mb-4" />
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
        >
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">←</span>
          Back
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canCreate || pin.length !== 4 || isAuthLoading}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90 disabled:opacity-40"
        >
          Enter
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">↵</span>
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

  useEffect(() => {
    const load = async () => {
      if (venueParam && getUserId() && getVenueId() === venueParam) {
        router.replace(`/venue/${venueParam}`);
        return;
      }

      setStatus("loading");
      setErrorMessage("");
      setLocationVerified(false);
      setLastLocationVerifiedAt(null);
      setDistanceMeters(null);
      setLocationNotice("Verifying your location...");
      autoVerificationAttemptedRef.current = false;

      try {
        if (!venueParam) {
          // Fire geolocation immediately so it runs in parallel with the venue fetch.
          let locationPromise: Promise<LocationResult> | null = null;
          if (!DISABLE_GEOFENCE_FOR_TESTING) {
            setLocationLoading(true);
            locationPromise = getInitialLocation();
          }

          const venues = await listVenues();
          setVenueList(venues);
          setActivePanel("venue-list");
          setStatus("ready");

          if (DISABLE_GEOFENCE_FOR_TESTING) {
            setLocationVerified(true);
            setLocationNotice("Testing mode: location checks are disabled.");
            setLocationLoading(false);
            setVenue(null);
            return;
          }

          // Await location — may already be resolved if venues were slow.
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

      // Best-effort keyboard-first flow: move focus to username shortly after panel swap.
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
    // Commit username to root state once on advance; input no longer calls setUsername on every keystroke.
    setUsername(usernameValue);
    setErrorMessage("");
    setPin("");
    setIsAdvancingToPin(true);
    setLoginStepDirection(1);
    setLoginStep("pin");
    setIsReturningUserForVenue(false);
    // Focus while still in the user-gesture call stack so iOS shows the numeric keypad.
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

      // Only fetch what's needed to render game-icon badges immediately.
      // Leaderboard, predictions, sports, and full trivia questions are large
      // and are fetched lazily by the venue home page after it mounts — loading
      // them here would saturate the browser's HTTP pool during navigation.
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
        // Always write bootstrap so VenueHubClient never has to cold-start.
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

    // Step 1: abort any previous in-flight login — activeLoginController is now null.
    abortInFlightLogin();

    const attemptId = loginAttemptIdRef.current + 1;
    loginAttemptIdRef.current = attemptId;

    // Step 2: create a fresh controller without clearing auth state yet.
    // Keeping existing state intact means the app is never in a "null" auth window
    // during the API call, which could cause route guards to redirect to login.
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
      // Abort the stuck request and surface a retry prompt; don't blow away the page.
      if (loginAbortRef.current) {
        loginAbortRef.current.abort();
      }
      setConnectionRetryMessage(
        "Connection is slow. Your venue is still selected — tap Enter Game to retry."
      );
    }, LOGIN_WATCHDOG_TIMEOUT_MS);

    let didNavigate = false;
    try {
      // Run signOut and the profile API call in parallel — the API uses supabaseAdmin
      // and has no dependency on the client-side Supabase session.
      const [, user] = await Promise.all([
        signOut().catch(() => {}),
        createUserProfile({
          username,
          venueId: venue.id,
          selectedVenueId: venue.id,
          pin: effectivePin,
          signal: loginController.signal,
        }),
      ]);

      if (loginAttemptIdRef.current !== attemptId || loginController.signal.aborted) {
        return;
      }
      if (String(user.venueId ?? "").trim() !== venue.id) {
        throw new Error("Session venue mismatch detected. Please try again.");
      }

      // Clear stale auth immediately before atomic writes — zero window of null state.
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
      // Fire anonymous Supabase session without blocking navigation — on slow
      // connections the await was delaying window.location.assign() long enough
      // for redirect guards on the destination page to see an empty auth state.
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
        // Always dismiss the global transition overlay on abort or error.
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
    <>
      <JoinHeaderLights />
      <PageShell
        title={APP_PAGE_NAMES.join}
        showBranding
        showAlerts={false}
        lockViewport
      >
        <div className="flex h-full flex-col gap-4 overflow-hidden text-sm">
          {errorMessage && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-700">
              {errorMessage}
            </div>
          )}
          {connectionRetryMessage && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              {connectionRetryMessage}
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-y-auto [overflow-x:clip]">
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
                  className="relative z-0"
                >
                  {/* Always-mounted hidden input so we can focus it synchronously from handleGoToPinStep (iOS requires focus during user-gesture stack). */}
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
                  className="relative z-0"
                >
                  {venueList.length > 0 ? (
                    <div className="space-y-3">
                      <h2 className="text-xl font-medium text-slate-900">Available Venues:</h2>
                      {locationLoading ? (
                        <p className="text-sm text-slate-600">Finding nearby venues in the background...</p>
                      ) : locationNotice ? (
                        <p className="text-sm text-slate-600">{locationNotice}</p>
                      ) : null}
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
                        slot="leaderboard-sidebar"
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
                    <div className="space-y-3 rounded-2xl border-4 border-slate-900 bg-white p-4 text-sm text-slate-800 shadow-[5px_5px_0_#0f172a]">
                      <p className="font-semibold">Nearby venues only</p>
                      {locationLoading ? (
                        <p>Checking your location to find venues in range...</p>
                      ) : locationNotice ? (
                        <p>{locationNotice}</p>
                      ) : (
                        <p>No venue is currently in range from your location.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          router.refresh();
                        }}
                        className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 font-medium text-white`}
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
      </PageShell>
    </>
  );
}
