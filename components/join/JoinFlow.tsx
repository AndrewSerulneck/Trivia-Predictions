"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { PageShell } from "@/components/ui/PageShell";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createOrLoginAccount,
  createUserProfile,
  resolveVenueProfile,
  signInAnonymously,
  signOut,
  validatePin,
  validateUsername,
} from "@/lib/auth";
import { calculateDistanceMeters, getBestCurrentLocation, getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import {
  getAccountId,
  saveAccountId,
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
  hardClearAuthAndCache,
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
import { ensureSiteSession, syncUserGeographicData } from "@/lib/analytics";
import { normalizePin } from "@/lib/pin";
import { getPasskeyClientMessage } from "@/lib/passkeyErrors";

type Status = "idle" | "loading" | "ready" | "saving" | "error";
type JoinPanel =
  | "auth-method-selection"
  | "account-creation"
  | "account-sign-in"
  | "passkey-enrollment-offer"
  | "venue-list"
  | "venue-login";
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
  account?: { id: string; username?: string };
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
const NO_LOCAL_PASSKEY_MESSAGE =
  "We're sorry, we don't have a passkey saved for your device! Please log in using your username and PIN, or create a new account.";
const LOCAL_PASSKEY_USERNAMES_STORAGE_KEY = "tp_local_passkey_usernames";

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
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  const name = String(err.name ?? "");
  const code = String(err.code ?? "");
  // DOMException / plain-object name check
  if (name === "NotAllowedError" || name === "AbortError") return true;
  // @simplewebauthn/browser WebAuthnError code (works even if instanceof fails across module boundaries)
  if (code === "ERROR_CEREMONY_ABORTED") return true;
  // instanceof fallbacks for when module identity is intact
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  if (error instanceof WebAuthnError) {
    return error.code === "ERROR_CEREMONY_ABORTED";
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

function readLocalPasskeyUsernameSet(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_PASSKEY_USERNAMES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((entry) => String(entry ?? "").trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function hasLocalPasskeyForUsername(username: string): boolean {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return readLocalPasskeyUsernameSet().has(normalized);
}

function rememberLocalPasskeyForUsername(username: string): void {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized) return;
  const next = readLocalPasskeyUsernameSet();
  next.add(normalized);
  try {
    localStorage.setItem(LOCAL_PASSKEY_USERNAMES_STORAGE_KEY, JSON.stringify(Array.from(next)));
  } catch {
    // Ignore storage failures.
  }
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
  tagline?: string;
  heading?: string;
  subheading?: string;
};

const UsernameStep = memo(function UsernameStep({
  direction,
  inputRef,
  isAdvancingToPin,
  locationLoading,
  errorMessage,
  onBack,
  onNext,
  tagline = "Your Username",
  heading = "What’s your username?",
  subheading = "If this is your first time playing, make one up!",
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
          {tagline}
        </p>
        <h1 className="text-2xl font-black text-white">{heading}</h1>
        <p className="mt-1 text-sm font-semibold text-ht-fg-muted">
          {subheading}
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
  // null when the options fetch failed — prompt still shows but Set Up fails gracefully
  challengeId: string | null;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"] | null;
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
        <div className="text-center space-y-3">
          <div className="text-4xl select-none">🔑</div>
          <h2 className="text-xl font-black text-white">Never remember your PIN again</h2>
          <p className="text-sm leading-relaxed"
            style={{ color: "#fbbf24" }}>
            Setting up a passkey now means you don&apos;t have to remember your PIN later!
          </p>
          <p className="text-sm text-ht-fg-muted leading-relaxed">
            Use Face ID, Touch ID, or your device PIN to log in instantly next time.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onSetUp}
            className="tp-clean-button inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Set Up PIN →
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="tp-clean-button inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-transparent py-2 px-6 text-sm font-semibold text-ht-fg-muted transition-all active:opacity-70 focus-visible:outline-none"
          >
            I&apos;ll remember my PIN — skip
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
  const [activePanel, setActivePanel] = useState<JoinPanel>("auth-method-selection");
  const [isOptimisticallyEntering, setIsOptimisticallyEntering] = useState(false);
  const [passkeyEnrollmentStep, setPasskeyEnrollmentStep] = useState<PasskeyEnrollmentStepData | null>(null);
  // Account-first auth state
  const [accountId, setAccountIdState] = useState<string | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [accountAuthLoading, setAccountAuthLoading] = useState(false);
  const [accountAuthError, setAccountAuthError] = useState("");
  const [passkeyAuthError, setPasskeyAuthError] = useState("");
  const [isEnrollmentLoading, setIsEnrollmentLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState("");
  const [isAccountPasskeyLoading, setIsAccountPasskeyLoading] = useState(false);
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
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
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
  const enrollmentOptionsRef = useRef<{
    challengeId: string;
    options: Parameters<typeof startRegistration>[0]["optionsJSON"];
  } | null>(null);
  useEffect(() => {
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);

  useEffect(() => {
    const load = async () => {
      // If accountId is stored, load venues and show the venue-list so the user can explicitly choose.
      const storedAccountId = getAccountId();
      if (venueParam && storedAccountId) {
        setStatus("loading");
        try {
          const [venues, venueData] = await Promise.all([listVenues(), getVenueById(venueParam)]);
          setVenueList(venues);
          if (!venueData) {
            setStatus("error");
            setErrorMessage(`Venue "${venueParam}" was not found.`);
            return;
          }
          setVenue(venueData);
          setAccountIdState(storedAccountId);
          setActivePanel("venue-list");
          setStatus("ready");
          hasSuccessfulInitialRenderRef.current = true;
        } catch {
          setAccountIdState(null);
          setStatus("ready");
          setActivePanel("auth-method-selection");
          hasSuccessfulInitialRenderRef.current = true;
        }
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
          // Skip auth selection if account is already stored.
          const resolvedId = getAccountId();
          if (resolvedId) {
            setAccountIdState(resolvedId);
            setActivePanel("venue-list");
          } else {
            setActivePanel("auth-method-selection");
          }
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
        setActivePanel("auth-method-selection");
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

  const resolveAndNavigate = useCallback(
    async (resolvedAccountId: string, selectedVenue: Venue) => {
      setErrorMessage("");
      setPendingVenueSelectionId(selectedVenue.id);
      setStatus("saving");
      setIsTransitioning(true);
      setIsOptimisticallyEntering(true);
      setAuthLoginState("authenticating");
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tp:global-transition-show", {
            detail: { targetPath: `/venue/${selectedVenue.id}` },
          })
        );
      }

      let didNavigate = false;
      try {
        const user = await resolveVenueProfile({ accountId: resolvedAccountId, venueId: selectedVenue.id });
        hardClearAuthAndCachePreserveVenue(selectedVenue.id);
        saveVenueId(selectedVenue.id);
        saveUsername(user.username);
        saveUserId(user.id);
        ensureSiteSession();
        syncUserGeographicData({
          zipCode: selectedVenue.zipCode,
          city: selectedVenue.city,
          stateCode: selectedVenue.state,
          regionKey: selectedVenue.region,
          country: selectedVenue.country,
          dataSource: "geolocation",
        });
        setSelectedVenueLock(selectedVenue.id);
        setLoginInProgress(selectedVenue.id);
        refreshAuthSession();
        setVenueHomeRouteIntent({ venueId: selectedVenue.id });
        setVenueHomeEntryHandoff({ venueId: selectedVenue.id, userId: user.id });
        const hardTarget = `/venue/${encodeURIComponent(selectedVenue.id)}?entryUser=${encodeURIComponent(user.id)}&entryVenue=${encodeURIComponent(selectedVenue.id)}&entryAt=${Date.now()}`;
        void signInAnonymously().catch(() => {});
        setAuthLoginState("navigating");
        didNavigate = true;
        window.location.assign(hardTarget);
      } catch (error) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("tp:global-transition-hide", { detail: { force: true } }));
        }
        setAuthLoginState("error");
        setErrorMessage(getErrorMessage(error, "Failed to join venue. Please try again."));
      } finally {
        setPendingVenueSelectionId(null);
        if (!didNavigate) {
          clearLoginInProgress();
          clearSelectedVenueLock();
          setIsOptimisticallyEntering(false);
          setIsTransitioning(false);
          setStatus("ready");
          setAuthLoginState("idle");
        }
      }
    },
    [refreshAuthSession]
  );

  const handleSelectVenue = useCallback(
    (selectedVenue: Venue) => {
      setVenue(selectedVenue);
      setErrorMessage("");
      setConnectionRetryMessage("");

      // Account-first path: resolve venue profile and navigate.
      const resolvedAccountId = accountId || getAccountId();
      if (resolvedAccountId) {
        void resolveAndNavigate(resolvedAccountId, selectedVenue);
        return;
      }

      // Legacy path (no accountId): show username/PIN login for this venue.
      setPanelDirection(1);
      setActivePanel("venue-login");
      setLoginStep("username");
      setLoginStepDirection(1);
      setPendingVenueSelectionId(selectedVenue.id);
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
    [accountId, resolveAndNavigate, verifyVenueAccess]
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
    (usernameValue: string, nextErrorMessage?: string) => {
      if (!validateUsername(usernameValue)) {
        setErrorMessage("Please enter a valid username.");
        return;
      }
      const normalizedUsername = usernameValue.trim();
      setUsername(normalizedUsername);
      setErrorMessage(nextErrorMessage ?? "");
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

      const fallbackToPin = (message?: string) => {
        transitionToPinStep(normalizedUsername, message);
      };

      try {
        if (!browserSupportsWebAuthn()) {
          fallbackToPin("Passkey is unavailable on this browser. Use your PIN to continue.");
          return;
        }
        if (!hasLocalPasskeyForUsername(normalizedUsername)) {
          fallbackToPin("");
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
          fallbackToPin(getPasskeyClientMessage(optionsPayload.reasonCode, ""));
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
          fallbackToPin(getPasskeyClientMessage(verifyPayload?.errorCode, ""));
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
        rememberLocalPasskeyForUsername(verifyPayload.user.username);
        saveUserId(verifyPayload.user.id);
        ensureSiteSession();
        syncUserGeographicData({
          zipCode: venue.zipCode,
          city: venue.city,
          stateCode: venue.state,
          regionKey: venue.region,
          country: venue.country,
          dataSource: "geolocation",
        });
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
          fallbackToPin("");
          return;
        }
        fallbackToPin("");
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

  // Pre-fetch passkey registration options when the enrollment offer panel mounts.
  // Options land in enrollmentOptionsRef before the user clicks "Set Up" so that
  // startRegistration() fires synchronously from the click handler (iOS Safari).
  useEffect(() => {
    if (activePanel !== "passkey-enrollment-offer" || !accountId || !accountUsername) return;

    enrollmentOptionsRef.current = null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6000);

    fetch("/api/auth/passkey/register/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, username: accountUsername }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as PasskeyRegisterOptionsPayload | null;
        if (res.ok && payload?.ok && payload.options && payload.challengeId) {
          enrollmentOptionsRef.current = { challengeId: payload.challengeId, options: payload.options };
        }
      })
      .catch(() => { /* non-critical — Set Up navigates gracefully without options */ })
      .finally(() => { window.clearTimeout(timeoutId); });

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [activePanel, accountId, accountUsername]);


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

  // ── Account-first handlers ──────────────────────────────────────────────────

  const handleBackToAuthMethodSelection = useCallback(() => {
    setPanelDirection(-1);
    setActivePanel("auth-method-selection");
    setLoginStep("username");
    setLoginStepDirection(1);
    setPin("");
    setAccountAuthError("");
    setIsAdvancingToPin(false);
  }, []);

  const handleAccountGoToPinStep = useCallback(
    async (usernameValue: string) => {
      if (isAccountPasskeyLoading) {
        return;
      }
      if (!validateUsername(usernameValue)) {
        setAccountAuthError("Please enter a valid username.");
        return;
      }
      const normalizedUsername = usernameValue.trim();
      setUsername(normalizedUsername);
      setAccountAuthError("");

      const moveToPinStep = (message?: string) => {
        setAccountAuthError(message ?? "");
        setPin("");
        setLoginStepDirection(1);
        setLoginStep("pin");
      };

      // For sign-in, verify the username exists before advancing to PIN.
      if (activePanel === "account-sign-in") {
        setIsAccountPasskeyLoading(true);
        try {
          const checkResponse = await fetch(
            `/api/join/account?username=${encodeURIComponent(normalizedUsername)}`,
            { cache: "no-store" }
          );
          const checkPayload = (await checkResponse.json().catch(() => null)) as { ok?: boolean; exists?: boolean } | null;
          if (!checkPayload?.exists) {
            setAccountAuthError(
              "We're sorry, we do not recognize that username. Please go back and create an account."
            );
            return;
          }
        } catch {
          // Network error — allow proceeding so the PIN attempt can surface the real failure.
        } finally {
          setIsAccountPasskeyLoading(false);
        }
      }

      // For account sign-in, only attempt passkey when this device has previously
      // enrolled/used a local passkey for the username.
      if (activePanel === "account-sign-in" && browserSupportsWebAuthn()) {
        if (!hasLocalPasskeyForUsername(normalizedUsername)) {
          moveToPinStep();
          return;
        }
        setIsAccountPasskeyLoading(true);
        try {
          const optionsResponse = await fetch("/api/auth/passkey/authenticate/options", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: normalizedUsername }),
          });
          const optionsPayload = (await optionsResponse.json().catch(() => null)) as PasskeyAuthOptionsPayload | null;
          if (!optionsResponse.ok || !optionsPayload?.ok) {
            moveToPinStep();
            return;
          }
          if (optionsPayload.requiresPinFallback || !optionsPayload.options || !optionsPayload.challengeId) {
            moveToPinStep(getPasskeyClientMessage(optionsPayload.reasonCode, ""));
            return;
          }

          const assertionResponse = await startAuthentication({ optionsJSON: optionsPayload.options });
          const verifyResponse = await fetch("/api/auth/passkey/authenticate/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challengeId: optionsPayload.challengeId, response: assertionResponse }),
          });
          type AccountVerifyPayload = PasskeyAuthVerifyPayload & { account?: { id: string; username: string } };
          const verifyPayload = (await verifyResponse.json().catch(() => null)) as AccountVerifyPayload | null;

          if (!verifyResponse.ok || !verifyPayload?.ok || !verifyPayload.account?.id) {
            moveToPinStep(getPasskeyClientMessage(verifyPayload?.errorCode, ""));
            return;
          }

          rememberLocalPasskeyForUsername(verifyPayload.account.username ?? normalizedUsername);
          saveAccountId(verifyPayload.account.id);
          setAccountIdState(verifyPayload.account.id);
          setAccountUsername(verifyPayload.account.username ?? normalizedUsername);
          setIsNewAccount(false);
          setPanelDirection(1);
          setActivePanel("venue-list");
          return;
        } catch (error) {
          if (isPasskeyUserCancel(error)) {
            moveToPinStep("Passkey prompt canceled. Use your PIN to continue.");
            return;
          }
          moveToPinStep();
          return;
        } finally {
          setIsAccountPasskeyLoading(false);
        }
      }

      moveToPinStep();
    },
    [activePanel, isAccountPasskeyLoading]
  );

  const handleBackFromAccountPin = useCallback(() => {
    if (pinFocusTimerRef.current) {
      window.clearTimeout(pinFocusTimerRef.current);
      pinFocusTimerRef.current = null;
    }
    setLoginStepDirection(-1);
    setLoginStep("username");
    setPin("");
    setAccountAuthError("");
    setIsAdvancingToPin(false);
  }, []);

  const handleAccountSubmitPin = useCallback(
    async (pinOverride?: string) => {
      const candidatePin = normalizePin(String(pinOverride ?? getCurrentPinCandidate()));
      if (!validatePin(candidatePin)) {
        setAccountAuthError(INVALID_PIN_MESSAGE);
        setIsPinShaking(true);
        return;
      }
      if (accountAuthLoading) return;

      setAccountAuthError("");
      setAccountAuthLoading(true);
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);

      try {
        const account = await createOrLoginAccount({
          username,
          pin: candidatePin,
          mode: activePanel === "account-sign-in" ? "login" : "create",
        });
        saveAccountId(account.id);
        setAccountIdState(account.id);
        setAccountUsername(account.username);

        const alreadyEnrolled = (() => {
          try { return Boolean(localStorage.getItem(PASSKEY_ENROLLMENT_STORAGE_KEY)); } catch { return false; }
        })();
        const isCreate = activePanel === "account-creation";
        const shouldOffer = isCreate && !alreadyEnrolled && !passkeyRegistrationPromptedRef.current && browserSupportsWebAuthn();

        setPanelDirection(1);
        if (shouldOffer) {
          setIsNewAccount(true);
          setActivePanel("passkey-enrollment-offer");
        } else {
          setIsNewAccount(false);
          setActivePanel("venue-list");
        }
      } catch (error) {
        let msg = getErrorMessage(error, "Authentication failed. Please try again.");
        if (msg === "Incorrect PIN.") {
          msg = "That PIN doesn't match the username you entered. Try again, or create a new account with a passkey so you never have to remember this info again.";
          setIsPinShaking(true);
          setPin("");
        }
        setAccountAuthError(msg);
      } finally {
        setAccountAuthLoading(false);
      }
    },
    [accountAuthLoading, activePanel, username, getCurrentPinCandidate]
  );

  const handleAccountPasskeySignIn = useCallback(async () => {
    if (isAccountPasskeyLoading) return;
    setPasskeyAuthError("");
    setAccountAuthError("");
    if (!browserSupportsWebAuthn()) {
      setPasskeyAuthError(NO_LOCAL_PASSKEY_MESSAGE);
      return;
    }
    setIsAccountPasskeyLoading(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const optionsPayload = (await optionsResponse.json().catch(() => null)) as PasskeyAuthOptionsPayload | null;
      if (!optionsResponse.ok || !optionsPayload?.ok) {
        setPasskeyAuthError(NO_LOCAL_PASSKEY_MESSAGE);
        return;
      }
      if (optionsPayload.requiresPinFallback || !optionsPayload.options || !optionsPayload.challengeId) {
        setPasskeyAuthError(getPasskeyClientMessage(optionsPayload.reasonCode, NO_LOCAL_PASSKEY_MESSAGE));
        return;
      }

      let assertionResponse: Awaited<ReturnType<typeof startAuthentication>>;
      try {
        assertionResponse = await startAuthentication({ optionsJSON: optionsPayload.options });
      } catch (error) {
        if (isPasskeyUserCancel(error)) {
          return;
        }
        if (isPasskeyUnavailable(error)) {
          setPasskeyAuthError(NO_LOCAL_PASSKEY_MESSAGE);
          return;
        }
        setPasskeyAuthError(getErrorMessage(error, NO_LOCAL_PASSKEY_MESSAGE));
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: optionsPayload.challengeId, response: assertionResponse }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyAuthVerifyPayload | null;
      if (!verifyResponse.ok || !verifyPayload?.ok || !verifyPayload.account?.id) {
        setPasskeyAuthError(getPasskeyClientMessage(verifyPayload?.errorCode, NO_LOCAL_PASSKEY_MESSAGE));
        return;
      }

      const resolvedUsername = verifyPayload.account.username ?? "";
      if (resolvedUsername) {
        setAccountUsername(resolvedUsername);
      }
      saveAccountId(verifyPayload.account.id);
      setAccountIdState(verifyPayload.account.id);
      setIsNewAccount(false);
      setPanelDirection(1);
      setActivePanel("venue-list");
    } catch (error) {
      if (!isPasskeyUserCancel(error)) {
        setPasskeyAuthError(getErrorMessage(error, NO_LOCAL_PASSKEY_MESSAGE));
      }
    } finally {
      setIsAccountPasskeyLoading(false);
    }
  }, [isAccountPasskeyLoading]);

  const handleEnrollSetUp = useCallback(async () => {
    const stored = enrollmentOptionsRef.current;
    if (!stored) {
      passkeyRegistrationPromptedRef.current = true;
      setPanelDirection(1);
      setActivePanel("venue-list");
      return;
    }

    setIsEnrollmentLoading(true);
    setEnrollmentError("");

    try {
      const registrationResponse = await startRegistration({ optionsJSON: stored.options });
      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: stored.challengeId, response: registrationResponse, accountId }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyRegisterVerifyPayload | null;
      if (verifyResponse.ok && verifyPayload?.ok) {
        try { localStorage.setItem(PASSKEY_ENROLLMENT_STORAGE_KEY, "1"); } catch { /* non-critical */ }
        rememberLocalPasskeyForUsername(accountUsername);
      }
      passkeyRegistrationPromptedRef.current = true;
      setPanelDirection(1);
      setActivePanel("venue-list");
    } catch (error) {
      if (isPasskeyUserCancel(error)) {
        passkeyRegistrationPromptedRef.current = true;
        setPanelDirection(1);
        setActivePanel("venue-list");
        return;
      }
      setEnrollmentError("Setup failed. You can enable Face ID from your account settings later.");
    } finally {
      setIsEnrollmentLoading(false);
    }
  }, [accountId, accountUsername]);

  const handleEnrollSkip = useCallback(() => {
    passkeyRegistrationPromptedRef.current = true;
    setPanelDirection(1);
    setActivePanel("venue-list");
  }, []);

  const handleSignOut = useCallback(() => {
    hardClearAuthAndCache();
    setAccountIdState(null);
    setAccountUsername("");
    void signOut().catch(() => {});
    refreshAuthSession();
    setPanelDirection(-1);
    setActivePanel("auth-method-selection");
  }, [refreshAuthSession]);

  // ── End account-first handlers ──────────────────────────────────────────────

  // Called when the user taps "Set Up →" in the passkey enrollment overlay.
  // This fires directly from a button click so iOS/Safari user-activation is preserved
  // when startRegistration() is called — no async work happens before it.
  const handlePasskeyEnrollSetUp = useCallback(async () => {
    if (!passkeyEnrollmentStep) return;
    const { challengeId, options, user, venueTarget } = passkeyEnrollmentStep;
    // Options unavailable (server not configured yet) — navigate without enrolling.
    if (!options || !challengeId) {
      window.location.assign(venueTarget);
      return;
    }
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
        rememberLocalPasskeyForUsername(user.username);
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

      // Determine whether to show the passkey enrollment prompt.
      // We always show it for unenrolled users who support WebAuthn — even if the
      // options fetch fails (options will be null and Set Up navigates gracefully).
      const alreadyEnrolled = (() => {
        try { return Boolean(localStorage.getItem(PASSKEY_ENROLLMENT_STORAGE_KEY)); } catch { return false; }
      })();
      const shouldPromptPasskey =
        !alreadyEnrolled &&
        !passkeyRegistrationPromptedRef.current &&
        browserSupportsWebAuthn();

      // Pre-fetch options so the "Set Up" button click can call startRegistration()
      // with no async gap — required for iOS Safari user-activation.
      let enrollmentOptions: PasskeyRegisterOptionsPayload | null = null;
      if (shouldPromptPasskey) {
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
        } catch { /* non-critical — prompt still shows, Set Up falls back gracefully */ }
      }

      hardClearAuthAndCachePreserveVenue(venue.id);
      saveVenueId(venue.id);
      saveUsername(user.username);
      saveUserId(user.id);
      ensureSiteSession();
      syncUserGeographicData({
        zipCode: venue.zipCode,
        city: venue.city,
        stateCode: venue.state,
        regionKey: venue.region,
        country: venue.country,
        dataSource: "geolocation",
      });
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

      if (shouldPromptPasskey) {
        // Show the passkey enrollment overlay — PasskeyEnrollmentPrompt handles navigation.
        // options/challengeId may be null if the fetch failed; the handler navigates gracefully.
        passkeyRegistrationPromptedRef.current = true;
        setPasskeyEnrollmentStep({
          user,
          challengeId: enrollmentOptions?.challengeId ?? null,
          options: enrollmentOptions?.options ?? null,
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
        message = "That PIN doesn't match the username you entered. Try again, or create a new account with a passkey so you never have to remember this info again.";
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
        {/* Legacy overlay enrollment prompt — used only by the venue-login path. */}
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
            <div className="relative [overflow-x:clip]">
              <AnimatePresence initial={false} custom={panelDirection} mode="wait">

                {/* ── Auth method selection (Chase-style first screen) ── */}
                {activePanel === "auth-method-selection" && (
                  <motion.div
                    key="auth-method-selection"
                    custom={panelDirection}
                    variants={ONBOARDING_PANEL_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={SWIPE_SPRING_TRANSITION}
                    className="flex flex-col gap-6"
                  >
                    <div>
                      <p className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
                        Welcome
                      </p>
                      <h1 className="text-2xl font-black text-white">How do you want to continue?</h1>
                    </div>

                    {/* Circular icon buttons — biometric and password */}
                    <div className="flex justify-center gap-10 py-2">
                      {webAuthnSupported && (
                        <div className="flex flex-col items-center gap-2">
                          <button
                            type="button"
                            onClick={handleAccountPasskeySignIn}
                            disabled={isAccountPasskeyLoading}
                            aria-label="Sign in with Face ID or Touch ID"
                            className="tp-clean-button flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-800 text-3xl shadow-sm transition-all active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                          >
                            {isAccountPasskeyLoading ? (
                              <span className="animate-spin text-xl text-cyan-300">⟳</span>
                            ) : (
                              "🔑"
                            )}
                          </button>
                            <span className="text-base font-semibold text-ht-fg-muted">
                            {isAccountPasskeyLoading ? "Signing in..." : "Face ID / Touch ID"}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-2">
                        <button
                          type="button"
                          aria-label="Sign in with username and PIN"
                          onClick={() => {
                            setPanelDirection(1);
                            setLoginStep("username");
                            setLoginStepDirection(1);
                            setPin("");
                            setAccountAuthError("");
                            setActivePanel("account-sign-in");
                          }}
                          className="tp-clean-button flex h-20 w-20 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-3xl shadow-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                        >
                          🔒
                        </button>
                        <span className="text-base font-semibold text-ht-fg-muted">Enter Username/PIN</span>
                      </div>
                    </div>

                    {passkeyAuthError ? (
                      <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-200">
                        {passkeyAuthError}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-700" />
                      <span className="text-2xl font-semibold uppercase tracking-widest text-ht-fg-muted">new here?</span>
                      <div className="flex-1 h-px bg-slate-700" />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPanelDirection(1);
                        setLoginStep("username");
                        setLoginStepDirection(1);
                        setPin("");
                        setAccountAuthError("");
                        setActivePanel("account-creation");
                      }}
                      className="tp-clean-button inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-cyan-400 py-3 px-6 text-base font-black text-slate-950 transition-all active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                    >
                      <span className="text-2xl">Create Account →</span>
                    </button>
                  </motion.div>
                )}

                {/* ── Account creation / sign-in (username → PIN two-step) ── */}
                {(activePanel === "account-creation" || activePanel === "account-sign-in") && (
                  <motion.div
                    key={activePanel}
                    custom={panelDirection}
                    variants={ONBOARDING_PANEL_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={SWIPE_SPRING_TRANSITION}
                    className="relative"
                  >
                    {/* Hidden real PIN input — keeps mobile keyboard stable. */}
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
                          void handleAccountSubmitPin();
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
                        if (pasted) setPin(pasted);
                        e.preventDefault();
                      }}
                      className="absolute h-px w-px overflow-hidden opacity-0"
                      aria-label="4-digit PIN"
                      placeholder="Enter 4-digit PIN"
                    />

                    <AnimatePresence custom={loginStepDirection} mode="wait">
                      {loginStep === "username" ? (
                        <UsernameStep
                          key="account-username"
                          direction={loginStepDirection}
                          inputRef={usernameInputRef}
                          isAdvancingToPin={isAccountPasskeyLoading}
                          locationLoading={false}
                          errorMessage={accountAuthError}
                          onBack={handleBackToAuthMethodSelection}
                          onNext={handleAccountGoToPinStep}
                          tagline={activePanel === "account-creation" ? "Create Account" : "Sign In"}
                          heading={activePanel === "account-creation" ? "Choose your username" : "What's your username?"}
                          subheading={activePanel === "account-creation" ? "Pick a name you'll be known by at every venue." : "Enter the username linked to your account."}
                        />
                      ) : (
                        <PinStep
                          key="account-pin"
                          direction={loginStepDirection}
                          pin={pin}
                          isPinShaking={isPinShaking}
                          isAuthLoading={accountAuthLoading}
                          canCreate={!accountAuthLoading && Boolean(username) && pin.length === 4}
                          loadingPhrase={loadingPhrase}
                          errorMessage={accountAuthError}
                          connectionRetryMessage=""
                          blockedReason=""
                          pinContainerRef={pinContainerRef}
                          onBack={handleBackFromAccountPin}
                          onSubmit={handleAccountSubmitPin}
                          onAnimationComplete={handlePinAnimationComplete}
                          onPinContainerClick={handlePinContainerClick}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ── Passkey enrollment offer (inline, shown after new account creation) ── */}
                {activePanel === "passkey-enrollment-offer" && (
                  <motion.div
                    key="passkey-enrollment-offer"
                    custom={panelDirection}
                    variants={ONBOARDING_PANEL_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={SWIPE_SPRING_TRANSITION}
                    className="flex flex-col gap-5"
                  >
                    <div className="text-center space-y-3">
                      <div className="text-5xl select-none" aria-hidden>🔑</div>
                      <h1 className="text-2xl font-black text-white">Worried you&apos;ll forget your username and PIN?</h1>
                      <p className="text-lg leading-relaxed" style={{ color: "#fbbf24" }}>
                        You definitely will. Set up a passkey now so you can sign in to Hightop Challenge the same way you sign into your phone. This saves time and you don&apos;t have to remember anything.
                      </p>
                      <p className="text-lg text-ht-fg-muted leading-relaxed">
                         This process does not share any of your data with us. Your information stays secure on your device.
                      </p>
                    </div>

                    {enrollmentError ? (
                      <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-200">
                        {enrollmentError}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={handleEnrollSetUp}
                        disabled={isEnrollmentLoading}
                        className="tp-clean-button inline-flex min-h-[64px] w-full items-center justify-center rounded-xl bg-cyan-400 py-4 px-6 text-xl font-black text-slate-950 transition-all active:translate-y-[1px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                      >
                        {isEnrollmentLoading ? "Setting up..." : "Set Up a Passkey →"}
                      </button>
                      <button
                        type="button"
                        onClick={handleEnrollSkip}
                        disabled={isEnrollmentLoading}
                        className="tp-clean-button inline-flex min-h-[64px] w-full items-center justify-center rounded-xl bg-slate-800 py-4 px-6 text-xl font-black text-ht-fg-muted transition-all active:opacity-70 focus-visible:outline-none"
                      >
                        No thanks! What kind of an IDIOT forgets their username and PIN?
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Venue list ── */}
                {activePanel === "venue-list" && (
                  <motion.div
                    key="venue-list"
                    custom={panelDirection}
                    variants={ONBOARDING_PANEL_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={SWIPE_SPRING_TRANSITION}
                  >
                    <div className="mb-4 flex items-center">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-1.5 text-sm font-black text-[#fff7ea] shadow-sm transition-all active:scale-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60"
                      >
                        ← Sign Out
                      </button>
                    </div>

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

                {/* ── Legacy venue-login panel (username+PIN for a specific venue) ── */}
                {activePanel === "venue-login" && venue && (
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
                    <p className="mb-5 text-xl font-black uppercase tracking-[0.12em]"
                      style={{ color: "#fbbf24", textShadow: "0 0 10px #f59e0b, 0 0 24px #d97706" }}>
                      {getVenueDisplayName(venue)}
                    </p>

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
                        if (pasted) setPin(pasted);
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
                )}

              </AnimatePresence>
            </div>
          </div>
        </div>
  </PageShell>
  );
}
