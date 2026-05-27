"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
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
import type { User, Venue } from "@/types";
import { getVenueDisplayName, getVenueVisual as getVenueVisualFromConfig } from "@/lib/venueDisplay";
import { APP_PAGE_NAMES } from "@/lib/pageNames";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { normalizePin } from "@/lib/pin";
import { getPasskeyClientMessage } from "@/lib/passkeyErrors";

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

type PasskeyAuthOptionsPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  reason?: string;
  reasonCode?: string;
  requiresPinFallback?: boolean;
  challengeId?: string;
  options?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  user?: User;
};

type PasskeyAuthVerifyPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  user?: User;
};

type PasskeyRegisterOptionsPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  challengeId?: string;
  options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
  user?: User;
};

type PasskeyRegisterVerifyPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  verified?: boolean;
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
const INVALID_PIN_MESSAGE = "Enter a valid 4-digit PIN.";

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

function isPasskeyUserCancel(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  if (error instanceof WebAuthnError) {
    return error.code === "ERROR_CEREMONY_ABORTED";
  }
  if (typeof error === "object" && error && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "");
    return name === "NotAllowedError" || name === "AbortError";
  }
  return false;
}

function isPasskeyUnavailable(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException) {
    return error.name === "NotSupportedError" || error.name === "InvalidStateError";
  }
  if (error instanceof WebAuthnError) {
    return (
      error.code === "ERROR_INVALID_DOMAIN" ||
      error.code === "ERROR_INVALID_RP_ID" ||
      error.code === "ERROR_AUTHENTICATOR_GENERAL_ERROR"
    );
  }
  if (typeof error === "object" && error && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "");
    return name === "NotSupportedError" || name === "InvalidStateError" || name === "SecurityError";
  }
  return false;
}

// Codes that are server-config or environment issues — fall back to PIN silently
// without showing a confusing technical message to the user.
const SILENT_PASSKEY_FALLBACK_CODES = new Set([
  "ORIGIN_NOT_ALLOWED",
  "RP_ID_NOT_ALLOWED",
  "SERVER_MISCONFIG",
  "PASSKEY_DISABLED",
]);

function isSilentPasskeyFallbackCode(code: string | undefined): boolean {
  return SILENT_PASSKEY_FALLBACK_CODES.has(String(code ?? "").trim());
}

const PASSKEY_ENROLLMENT_STORAGE_KEY = "tp_passkey_enrolled";

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
    if (isAdvancingToPin) return;
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
          If this is your first time playing, make one up!
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
  blockedReason: string;
  pinContainerRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onSubmit: (pinOverride?: string) => void;
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
  blockedReason,
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
            className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all duration-150 ${
              i < pin.length
                ? "border-cyan-300 bg-cyan-500/25"
                : "border-slate-600 bg-transparent"
            }`}
          >
            <span className="text-xl font-black leading-none text-white">{pin[i] ?? ""}</span>
          </div>
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
          onClick={() => onSubmit()}
          disabled={!canCreate || pin.length !== 4 || isAuthLoading}
          className="tp-clean-button inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          Enter ↵
        </button>
      </div>
      {!isAuthLoading && !canCreate && !errorMessage && !connectionRetryMessage ? (
        <p className="text-xs font-semibold text-amber-300">{blockedReason}</p>
      ) : null}
    </motion.div>
  );
});

type PasskeyEnrollmentStepData = {
  user: User;
  challengeId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
  venueTarget: string;
};

type PasskeyEnrollmentPromptProps = {
  onSetUp: () => void;
  onSkip: () => void;
};

function PasskeyEnrollmentPrompt({ onSetUp, onSkip }: PasskeyEnrollmentPromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-3xl border border-cyan-400/40 bg-slate-900 p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="text-4xl select-none">🔑</div>
          <h2 className="text-xl font-black text-white">Log in faster next time</h2>
          <p className="text-sm text-ht-fg-muted leading-relaxed">
            Use Face ID, Touch ID, or your device PIN instead of your 4-digit code next time.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onSetUp}
            className="tp-clean-button inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Set Up →
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="tp-clean-button inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-transparent py-2 px-6 text-sm font-semibold text-ht-fg-muted transition-all active:opacity-70 focus-visible:outline-none"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [isOptimisticallyEntering, setIsOptimisticallyEntering] = useState(false);
  const [passkeyEnrollmentStep, setPasskeyEnrollmentStep] = useState<PasskeyEnrollmentStepData | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPasskeyAttempting, setIsPasskeyAttempting] = useState(false);
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
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const pinContainerRef = useRef<HTMLDivElement>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const pinFocusTimerRef = useRef<number | null>(null);
  const pinSubmittingRef = useRef(false);
  const passkeyRegistrationPromptedRef = useRef(false);
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
      setConnectionRetryMessage("");
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
    setConnectionRetryMessage("");
    setPin("");
    setIsTransitioning(false);
    setIsOptimisticallyEntering(false);
    setPendingVenueSelectionId(null);
  }, []);

  const transitionToPinStep = useCallback(
    (usernameValue: string) => {
      if (!validateUsername(usernameValue)) {
        setErrorMessage("Please enter a valid username.");
        return;
      }
      const normalizedUsername = usernameValue.trim();
      setUsername(normalizedUsername);
      setErrorMessage("");
      setConnectionRetryMessage("");
      setPin("");
      setIsAdvancingToPin(true);
      setLoginStepDirection(1);
      setLoginStep("pin");
      setIsReturningUserForVenue(false);
      pinInputRef.current?.focus();
      if (venue) {
        void fetch(
          `/api/join/profile?username=${encodeURIComponent(normalizedUsername)}&venueId=${encodeURIComponent(venue.id)}`,
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
    },
    [venue]
  );

  const handleGoToPinStep = useCallback(
    async (usernameValue: string) => {
      if (isAdvancingToPin || isPasskeyAttempting) {
        return;
      }
      if (!validateUsername(usernameValue)) {
        setErrorMessage("Please enter a valid username.");
        return;
      }
      if (!venue) {
        setErrorMessage("Please select a venue first.");
        return;
      }

      const normalizedUsername = usernameValue.trim();
      setUsername(normalizedUsername);
      setErrorMessage("");
      setConnectionRetryMessage("");
      setIsPasskeyAttempting(true);
      setIsAdvancingToPin(true);

      const fallbackToPin = (_message?: string) => {
        transitionToPinStep(normalizedUsername);
      };

      try {
        if (!browserSupportsWebAuthn()) {
          fallbackToPin("Passkey is unavailable on this browser. Use your PIN to continue.");
          return;
        }

        const optionsResponse = await fetch("/api/auth/passkey/authenticate/options", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: normalizedUsername,
            venueId: venue.id,
          }),
        });

        const optionsPayload = (await optionsResponse.json().catch(() => null)) as PasskeyAuthOptionsPayload | null;
        if (!optionsResponse.ok || !optionsPayload?.ok) {
          const code = optionsPayload?.errorCode;
          if (isSilentPasskeyFallbackCode(code)) {
            // Server config / environment issue — fall back to PIN with no user-visible message.
            if (code) console.warn("[Passkey] Auth options silent fallback:", code);
            fallbackToPin("");
          } else {
            fallbackToPin(getPasskeyClientMessage(code, "Passkey sign-in wasn't available. Use your PIN to continue."));
          }
          return;
        }

        if (optionsPayload.requiresPinFallback || !optionsPayload.options || !optionsPayload.challengeId) {
          fallbackToPin(getPasskeyClientMessage(optionsPayload.reasonCode, "No passkey found on this device. Use your PIN to continue."));
          return;
        }

        const assertionResponse = await startAuthentication({
          optionsJSON: optionsPayload.options,
        });

        const verifyResponse = await fetch("/api/auth/passkey/authenticate/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeId: optionsPayload.challengeId,
            response: assertionResponse,
            venueId: venue.id,
          }),
        });

        const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyAuthVerifyPayload | null;
        if (!verifyResponse.ok || !verifyPayload?.ok || !verifyPayload.user?.id) {
          fallbackToPin(getPasskeyClientMessage(verifyPayload?.errorCode, "Passkey verification failed. Use your PIN to continue."));
          return;
        }

        if (!DISABLE_GEOFENCE_FOR_TESTING && !locationVerified) {
          setErrorMessage("Verify your location before entering the venue.");
          fallbackToPin("");
          return;
        }

        hardClearAuthAndCachePreserveVenue(venue.id);
        saveVenueId(venue.id);
        saveUsername(verifyPayload.user.username);
        saveUserId(verifyPayload.user.id);
        setSelectedVenueLock(venue.id);
        setLoginInProgress(venue.id);
        refreshAuthSession();
        setVenueHomeRouteIntent({ venueId: venue.id });
        setVenueHomeEntryHandoff({ venueId: venue.id, userId: verifyPayload.user.id });
        setAuthLoginState("navigating");
        setStatus("saving");
        setIsTransitioning(true);
        setIsOptimisticallyEntering(true);
        const hardTarget = `/venue/${encodeURIComponent(venue.id)}?entryUser=${encodeURIComponent(
          verifyPayload.user.id
        )}&entryVenue=${encodeURIComponent(venue.id)}&entryAt=${Date.now()}`;
        void signInAnonymously().catch(() => {});
        window.location.assign(hardTarget);
      } catch (error) {
        if (isPasskeyUserCancel(error)) {
          fallbackToPin("Passkey prompt canceled. Use your PIN to continue.");
          return;
        }
        if (isPasskeyUnavailable(error)) {
          fallbackToPin("Passkey is unavailable on this device right now. Use your PIN to continue.");
          return;
        }
        fallbackToPin("Passkey sign-in failed. Use your PIN to continue.");
      } finally {
        setIsPasskeyAttempting(false);
        setIsAdvancingToPin(false);
      }
    },
    [
      isAdvancingToPin,
      isPasskeyAttempting,
      venue,
      transitionToPinStep,
      locationVerified,
      refreshAuthSession,
    ]
  );

  const handlePinAnimationComplete = useCallback(() => {
    setIsAdvancingToPin(false);
  }, []);

  const handlePinContainerClick = useCallback(() => {
    pinInputRef.current?.focus();
  }, []);

  const getCurrentPinCandidate = useCallback(() => {
    const liveValue = pinInputRef.current?.value ?? pin;
    return normalizePin(String(liveValue ?? ""));
  }, [pin]);

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
    setConnectionRetryMessage("");
  }, []);
  const handleSubmitPinStep = useCallback(
    (pinOverride?: string) => {
      const override = typeof pinOverride === "string" ? pinOverride : undefined;
      const candidatePin = normalizePin(String(override ?? getCurrentPinCandidate()));
      logAuthIncident("join-flow", "pin-submit-attempt", {
        venueId: venue?.id ?? null,
        loginStep,
        pinLength: candidatePin.length,
        alreadySubmitting: pinSubmittingRef.current,
      });
      if (loginStep !== "pin" || pinSubmittingRef.current) {
        logAuthIncident("join-flow", "pin-submit-blocked", {
          venueId: venue?.id ?? null,
          loginStep,
          pinLength: candidatePin.length,
          alreadySubmitting: pinSubmittingRef.current,
        });
        return;
      }
      if (!validatePin(candidatePin)) {
        setConnectionRetryMessage("");
        setErrorMessage(INVALID_PIN_MESSAGE);
        setIsPinShaking(true);
        return;
      }
      setErrorMessage("");
      pinSubmittingRef.current = true;
      logAuthIncident("join-flow", "pin-submit-dispatched", {
        venueId: venue?.id ?? null,
        pinLength: candidatePin.length,
      });
      void createProfile(candidatePin).finally(() => {
        pinSubmittingRef.current = false;
        logAuthIncident("join-flow", "pin-submit-finished", {
          venueId: venue?.id ?? null,
        });
      });
    },
    [getCurrentPinCandidate, loginStep, venue?.id, createProfile]
  );

  useEffect(() => {
    if (loginStep !== "pin" || !isReturningUserForVenue || pin.length !== 4 || pinSubmittingRef.current) {
      return;
    }
    handleSubmitPinStep(pin);
  }, [handleSubmitPinStep, isReturningUserForVenue, loginStep, pin]);

  useEffect(() => {
    if (loginStep !== "pin") return;
    if (pin.length === 4 && errorMessage === INVALID_PIN_MESSAGE) {
      setErrorMessage("");
    }
  }, [errorMessage, loginStep, pin]);

  const canCreate = useMemo(() => {
    const locationOk = DISABLE_GEOFENCE_FOR_TESTING ? true : locationVerified;
    return Boolean(
      isSupabaseConfigured &&
        venue &&
        validateUsername(username) &&
        validatePin(pin) &&
        locationOk &&
        !locationLoading &&
        !isTransitioning
    );
  }, [isTransitioning, locationLoading, locationVerified, venue, username, pin]);

  const blockedReason = useMemo(() => {
    if (!isSupabaseConfigured) return "Login is temporarily unavailable. Please try again shortly.";
    if (!venue) return "Select a venue to continue.";
    if (!validateUsername(username)) return "Enter a username to continue.";
  if (!validatePin(pin)) return INVALID_PIN_MESSAGE;
    if (!DISABLE_GEOFENCE_FOR_TESTING && locationLoading) return "Verifying your location...";
    if (!DISABLE_GEOFENCE_FOR_TESTING && !locationVerified) return "Location verification is required to enter.";
    if (isTransitioning) return "Finishing your login...";
    return "";
  }, [isTransitioning, locationLoading, locationVerified, pin, username, venue]);

  const openAdminDashboard = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.assign("/admin");
      return;
    }
    router.push("/admin");
  }, [router]);

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

  // Called when the user taps "Set Up →" in the passkey enrollment overlay.
  // This fires directly from a button click so iOS/Safari user-activation is preserved
  // when startRegistration() is called — no async work happens before it.
  const handlePasskeyEnrollSetUp = useCallback(async () => {
    if (!passkeyEnrollmentStep) return;
    const { challengeId, options, user, venueTarget } = passkeyEnrollmentStep;
    try {
      const registrationResponse = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          response: registrationResponse,
          userId: user.id,
          venueId: venue?.id,
        }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyRegisterVerifyPayload | null;
      if (verifyResponse.ok && verifyPayload?.ok) {
        try { localStorage.setItem(PASSKEY_ENROLLMENT_STORAGE_KEY, "1"); } catch { /* non-critical */ }
      } else {
        console.info("[Passkey] Enrollment verify failed", { code: verifyPayload?.errorCode });
      }
    } catch (error) {
      // User canceled or device unavailable — still navigate.
      if (!isPasskeyUserCancel(error)) {
        console.info("[Passkey] Enrollment setup failed:", getErrorMessage(error, "unknown"));
      }
    } finally {
      window.location.assign(venueTarget);
    }
  }, [passkeyEnrollmentStep, venue?.id]);

  const handlePasskeyEnrollSkip = useCallback(() => {
    if (!passkeyEnrollmentStep) return;
    // Remember the skip so we don't ask again this session.
    passkeyRegistrationPromptedRef.current = true;
    window.location.assign(passkeyEnrollmentStep.venueTarget);
  }, [passkeyEnrollmentStep]);

  async function createProfile(pinOverride?: string) {
    const effectivePin = normalizePin(String(pinOverride ?? getCurrentPinCandidate()));
    if (!venue) return;
    const submitStartedAt = Date.now();
    setErrorMessage("");
    setConnectionRetryMessage("");
    setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
    if (!validateUsername(username)) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!validatePin(effectivePin)) {
      setErrorMessage(INVALID_PIN_MESSAGE);
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
    const traceId = `join-${attemptId}-${submitStartedAt}`;
    logAuthIncident("join-flow", "create-profile-start", {
      traceId,
      attemptId,
      venueId: venue.id,
      username,
      locationVerified,
    });

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
      logAuthIncident("join-flow", "create-profile-watchdog-timeout", {
        attemptId,
        venueId: venue.id,
        timeoutMs: LOGIN_WATCHDOG_TIMEOUT_MS,
      });
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
        traceId,
      });
      logAuthIncident("join-flow", "create-user-profile-success", {
        traceId,
        attemptId,
        venueId: venue.id,
        userId: user.id,
        elapsedMs: Date.now() - submitStartedAt,
      });

      if (loginAttemptIdRef.current !== attemptId || loginController.signal.aborted) {
        return;
      }
      if (String(user.venueId ?? "").trim() !== venue.id) {
        throw new Error("Session venue mismatch detected. Please try again.");
      }

      // Fetch passkey enrollment options now (before any UI) so the button click
      // can call startRegistration() directly with no async gap — required for iOS.
      let enrollmentOptions: PasskeyRegisterOptionsPayload | null = null;
      if (!passkeyRegistrationPromptedRef.current && browserSupportsWebAuthn()) {
        const alreadyEnrolled = (() => {
          try { return Boolean(localStorage.getItem(PASSKEY_ENROLLMENT_STORAGE_KEY)); } catch { return false; }
        })();
        if (!alreadyEnrolled) {
          try {
            const optRes = await fetch("/api/auth/passkey/register/options", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user.id, venueId: venue.id, username: user.username }),
            });
            const optPayload = (await optRes.json().catch(() => null)) as PasskeyRegisterOptionsPayload | null;
            if (optRes.ok && optPayload?.ok && optPayload.options && optPayload.challengeId) {
              enrollmentOptions = optPayload;
            } else if (optPayload?.errorCode && !isSilentPasskeyFallbackCode(optPayload.errorCode)) {
              console.warn("[Passkey] Enrollment options failed:", optPayload.errorCode);
            }
          } catch { /* non-critical */ }
        }
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

      const hardTarget = `/venue/${encodeURIComponent(venue.id)}?entryUser=${encodeURIComponent(
        user.id
      )}&entryVenue=${encodeURIComponent(venue.id)}&entryAt=${Date.now()}`;
      logAuthIncident("join-flow", "redirect-to-venue", {
        traceId,
        attemptId,
        venueId: venue.id,
        target: hardTarget,
        elapsedMs: Date.now() - submitStartedAt,
      });
      void signInAnonymously().catch(() => {});
      void preflightVenueHomeCriticalData({
        userId: user.id,
        venueId: venue.id,
        signal: loginController.signal,
      }).catch(() => {});
      void preloadVenueHome(venue, user.id).catch(() => {});

      setAuthLoginState("navigating");
      didNavigate = true;

      if (enrollmentOptions?.options && enrollmentOptions.challengeId) {
        // Show the passkey enrollment overlay — PasskeyEnrollmentPrompt handles navigation.
        passkeyRegistrationPromptedRef.current = true;
        setPasskeyEnrollmentStep({
          user,
          challengeId: enrollmentOptions.challengeId,
          options: enrollmentOptions.options,
          venueTarget: hardTarget,
        });
      } else {
        window.location.assign(hardTarget);
      }
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
      let message = getErrorMessage(error, "Failed to create profile.");
      if (message === "PIN must be exactly 4 digits.") {
        message = INVALID_PIN_MESSAGE;
      }
      if (message === "Incorrect PIN.") {
        setIsPinShaking(true);
        setPin("");
        setConnectionRetryMessage("");
      }
      logAuthIncident("join-flow", "create-profile-error", {
        traceId,
        attemptId,
        venueId: venue.id,
        message,
        elapsedMs: Date.now() - submitStartedAt,
      });
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
        noContainer
      >
        {passkeyEnrollmentStep && (
          <PasskeyEnrollmentPrompt
            onSetUp={handlePasskeyEnrollSetUp}
            onSkip={handlePasskeyEnrollSkip}
          />
        )}
        <div className="mx-auto w-full max-w-md px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
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
                        <p className="mb-5 text-xl font-black uppercase tracking-[0.12em]"
                          style={{ color: "#fbbf24", textShadow: "0 0 10px #f59e0b, 0 0 24px #d97706" }}>
                          {getVenueDisplayName(venue)}
                        </p>

                        {/* Keep input mounted for reliable mobile keypad behavior, but visually hide it. */}
                        <input
                          ref={pinInputRef}
                          type="text"
                          inputMode="numeric"
                          enterKeyHint="go"
                          pattern="[0-9]*"
                          value={pin}
                          maxLength={4}
                          autoComplete="one-time-code"
                          onChange={(e) => {
                            if (loginStep !== "pin") return;
                            setPin(normalizePin(e.target.value));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSubmitPinStep();
                              return;
                            }
                            if (normalizePin(e.key).length === 1 && pin.length >= 4) {
                              e.preventDefault();
                              return;
                            }
                          }}
                          onPaste={(e) => {
                            if (loginStep !== "pin") return;
                            const pasted = normalizePin(e.clipboardData.getData("text"));
                            if (pasted) {
                              setPin(pasted);
                            }
                            e.preventDefault();
                          }}
                          className="absolute h-px w-px overflow-hidden opacity-0"
                          aria-label="4-digit PIN"
                          placeholder="Enter 4-digit PIN"
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
                              blockedReason={blockedReason}
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
  </PageShell>
  );
}
