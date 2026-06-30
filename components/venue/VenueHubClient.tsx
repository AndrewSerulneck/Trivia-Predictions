"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { browserSupportsWebAuthn, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { Venue, LeaderboardEntry } from "@/types";
import { getAccountId, getUserId, getUsername, getVenueId, saveUserId, saveVenueId, clearVenueSession } from "@/lib/storage";
import { clearLoginInProgress } from "@/lib/authFastPath";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { getPasskeyClientMessage } from "@/lib/passkeyErrors";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
import {
  evaluateLiveTriviaStatePayload,
  resolveLiveTriviaVenueContext,
} from "@/lib/liveTriviaClientState";
import {
  consumeVenueHomeBootstrap,
  consumeVenueHomeEntryHandoff,
  hasRecentVenueHomeRouteIntent,
  type HomeBadgeCounts,
  type TriviaQuotaSnapshot,
  type VenueHomeBootstrapSnapshot,
} from "@/lib/venueHomeBootstrap";
import { VENUE_GAME_CARD_BY_KEY, VENUE_HOME_GAME_KEYS, type VenueGameKey } from "@/lib/venueGameCards";
import { runVenueGameOpenTransition } from "@/lib/venueGameTransition";
import { VenueHubHeaderBar } from "@/components/venue/VenueHubHeaderBar";
import { VenueGamesPanel } from "@/components/venue/VenueGamesPanel";
import { VenueChallengesPanel } from "@/components/venue/VenueChallengesPanel";
import { VenueLeaderboardPanel } from "@/components/venue/VenueLeaderboardPanel";
import {
  formatBadgeCount,
  type ChallengeCampaignCard,
  type HomeScreenIndex,
  type LiveTriviaStatus,
  type VenueArrivalStage,
} from "@/components/venue/venueHubShared";

type BingoBadgePayload = {
  ok: boolean;
  cards?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type PickEmBadgePayload = {
  ok: boolean;
  picks?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type FantasyBadgePayload = {
  ok: boolean;
  entries?: Array<{
    status?: string;
    rewardClaimedAt?: string | null;
    points?: number;
  }>;
};

type UserSummaryPayload = {
  ok?: boolean;
  profile?: {
    username?: string;
    points?: number;
    venueId?: string;
  } | null;
  hasPasskey?: boolean;
};

type PasskeyRegisterOptionsPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  challengeId?: string;
  options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
};

type PasskeyRegisterVerifyPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  verified?: boolean;
};

type ChallengeCampaignPayload = {
  ok?: boolean;
  campaigns?: ChallengeCampaignCard[];
};

type VenueMenuItem = {
  label: string;
  description: string;
  href: string;
};

const VENUE_HUB_GAME_ORDER: VenueGameKey[] = ["live_trivia", "speed-trivia", "bingo", "pickem", "fantasy", "scategories"];
const VENUE_DRAWER_MENU_ITEMS: VenueMenuItem[] = [
  {
    label: "Career Stats",
    description: "Track your lifetime performance across every game.",
    href: "/active-games",
  },
  {
    label: "FAQs",
    description: "Get quick answers about gameplay and prizes.",
    href: "/faqs",
  },
  {
    label: "Advertise With Us",
    description: "Submit the advertiser intake form.",
    href: "/advertise",
  },
  {
    label: "Redeem Prizes",
    description: "See earned rewards and prize redemptions.",
    href: "/redeem-prizes",
  },
];

const SWIPE_SCREEN_COUNT = 3;
const FETCH_TIMEOUT_MS = 4500;
const BADGE_FETCH_TIMEOUT_MS = 3500;
const ARRIVAL_CORE_MAX_WAIT_MS = 1800;
const ARRIVAL_WATCHDOG_TIMEOUT_MS = 8000;
const ARRIVAL_RECOVERY_ATTEMPT_KEY = "tp:venue-arrival-recovery-attempt";
// Enable with ?tpDebug=1 in the URL — off by default so polling logs don't
// fire in dev and saturate the console / log-forwarding overhead.
const SHOULD_DEBUG_LIVE_TRIVIA =
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  (() => {
    try {
      return new URLSearchParams(window.location.search).get("tpDebug") === "1";
    } catch {
      return false;
    }
  })();

function formatLongCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function debugLiveTrivia(message: string, details: Record<string, unknown>) {
  if (!SHOULD_DEBUG_LIVE_TRIVIA) return;
  console.info(`[live-trivia][venue-hub] ${message}`, details);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function areHomeBadgeCountsEqual(left: HomeBadgeCounts, right: HomeBadgeCounts): boolean {
  const leftBingo = Math.max(0, Number(left.bingo ?? 0));
  const leftPickEm = Math.max(0, Number(left.pickem ?? 0));
  const leftFantasy = Math.max(0, Number(left.fantasy ?? 0));
  const rightBingo = Math.max(0, Number(right.bingo ?? 0));
  const rightPickEm = Math.max(0, Number(right.pickem ?? 0));
  const rightFantasy = Math.max(0, Number(right.fantasy ?? 0));
  return leftBingo === rightBingo && leftPickEm === rightPickEm && leftFantasy === rightFantasy;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const safeMs = Math.max(0, Math.floor(ms));
    window.setTimeout(resolve, safeMs);
  });
}

function dateKeyInTimeZone(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return formatter.format(date);
}

function hourInTimeZone(date: Date, timeZone?: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
  const hourPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return Number.isFinite(hour) ? hour : date.getHours();
}

function formatLiveTriviaNextGameLabel(startAt: Date, timeZone?: string): string {
  const now = new Date();
  const startDayKey = dateKeyInTimeZone(startAt, timeZone);
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateKeyInTimeZone(tomorrow, timeZone);
  const startHour = hourInTimeZone(startAt, timeZone);

  const timeLabel = startAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
    timeZoneName: "short",
  });

  if (startDayKey === todayKey) {
    return `Next Game: ${startHour < 17 ? "Today" : "Tonight"} at ${timeLabel}`;
  }

  if (startDayKey === tomorrowKey) {
    return `Next Game: Tomorrow at ${timeLabel}`;
  }

  const dayLabel = startAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
  return `Next Game: ${dayLabel} at ${timeLabel}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS, externalSignal?: AbortSignal): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, Math.max(300, Math.floor(timeoutMs)));
  const onExternalAbort = externalSignal
    ? () => controller.abort()
    : undefined;
  if (externalSignal && onExternalAbort) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (externalSignal?.aborted) return null;
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function pathMatches(expectedPath: string, candidatePath: string): boolean {
  if (!expectedPath) {
    return true;
  }
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`);
}

function isActiveMenuPath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }
  if (href.startsWith("/venue/")) {
    return pathname.startsWith("/venue/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isPasskeyUserCancel(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  const name = String(err.name ?? "");
  const code = String(err.code ?? "");
  // Name/code checks work across module boundaries (no instanceof required)
  if (name === "NotAllowedError" || name === "AbortError") return true;
  if (code === "ERROR_CEREMONY_ABORTED") return true;
  // instanceof fallbacks when module identity is intact
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  if (error instanceof WebAuthnError) {
    return error.code === "ERROR_CEREMONY_ABORTED";
  }
  return false;
}

const venueDebugEnabled =
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  (() => {
    try {
      const search = new URLSearchParams(window.location.search);
      return search.get("tpDebug") === "1";
    } catch {
      return false;
    }
  })();

function venueDebugLog(message: string, details?: Record<string, unknown>) {
  if (!venueDebugEnabled) {
    return;
  }
   
  console.log(`[tp-debug][venue-home] ${message}`, details ?? {});
}

function VenueHubClientInner({ venue, initialEntries = [] }: { venue: Venue; initialEntries?: LeaderboardEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Bootstrap snapshot and entry handoff are read from sessionStorage ONLY after
  // mount (in useEffect). Reading them during render would produce different values
  // on the server (no sessionStorage) vs. the client, causing a hydration mismatch.
  const bootstrapSnapshotRef = useRef<VenueHomeBootstrapSnapshot | null>(null);
  const entryHandoffRef = useRef(false);
  const [pendingDestination, setPendingDestination] = useState<VenueGameKey | null>(null);
  const [pendingChallengeRedeemId, setPendingChallengeRedeemId] = useState<string | null>(null);
  // All state below is initialized to server-safe "no bootstrap" defaults.
  // The useEffect at the top of the effect list reads sessionStorage and corrects
  // these values on the client immediately after mount.
  const [homeBadgeCounts, setHomeBadgeCounts] = useState<HomeBadgeCounts>({});
  const [dismissedBadgeGames, setDismissedBadgeGames] = useState<Set<VenueGameKey>>(new Set());
  const [challengeCards, setChallengeCards] = useState<ChallengeCampaignCard[]>([]);
  const [isChallengesLoading, setIsChallengesLoading] = useState(true);
  const [challengesError, setChallengesError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuUsername, setMenuUsername] = useState("");
  const [menuPoints, setMenuPoints] = useState(0);
  const [isPasskeySetupLoading, setIsPasskeySetupLoading] = useState(false);
  const [passkeySetupMessage, setPasskeySetupMessage] = useState("");
  const [passkeySetupError, setPasskeySetupError] = useState("");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isBadgeLoading, setIsBadgeLoading] = useState(true);
  const [badgeError, setBadgeError] = useState("");
  const [liveTriviaStatus, setLiveTriviaStatus] = useState<LiveTriviaStatus>({
    live: false,
    label: "",
    nextStartAtMs: null,
    failureReason: null,
    recurringType: null,
    recurringDays: [],
  });
  const [scategoriesSessionActive, setScategoriesSessionActive] = useState(false);
  const [scategoriesNextWindowAtMs, setScategoriesNextWindowAtMs] = useState<number | null>(null);
  const [liveCountdownNowMs, setLiveCountdownNowMs] = useState(() => Date.now());
  const [leaderboardBootstrapEntries, setLeaderboardBootstrapEntries] = useState<LeaderboardEntry[]>([]);
  const [activeScreen, setActiveScreen] = useState<HomeScreenIndex>(0);
  const [homeRevealComplete, setHomeRevealComplete] = useState(true);
  // Arrival flow always runs initially (consistent with SSR); corrected after mount.
  const [arrivalStage, setArrivalStage] = useState<VenueArrivalStage>("identity");
  const [arrivalProgress, setArrivalProgress] = useState(8);
  const [arrivalStatusText, setArrivalStatusText] = useState("Securing your venue access...");
  const [arrivalOverlayCleared, setArrivalOverlayCleared] = useState(true);
  const [arrivalCoreReady, setArrivalCoreReady] = useState(false);
  const [arrivalInProgress, setArrivalInProgress] = useState(true);
  const [carouselBootstrapped, setCarouselBootstrapped] = useState(false);
  const venueReadyDispatchedRef = useRef(false);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollTickingRef = useRef(false);
  const activeScreenRef = useRef<HomeScreenIndex>(0);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);
  const badgeRequestRef = useRef<AbortController | null>(null);
  const campaignRequestRef = useRef<AbortController | null>(null);
  const liveTriviaRequestRef = useRef<AbortController | null>(null);
  const scategoriesRequestRef = useRef<AbortController | null>(null);
  const contentReady = !arrivalInProgress && homeRevealComplete && carouselBootstrapped;

  const hasUserTokenInCookie = useCallback((): boolean => {
    if (typeof document === "undefined") return false;
    try {
      return document.cookie.split(";").some((chunk) => chunk.trim().startsWith("tp_user_id="));
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const entryUser = (params.get("entryUser") ?? "").trim();
    const entryVenue = (params.get("entryVenue") ?? "").trim();
    if (!entryUser) {
      return;
    }
    if (entryVenue && entryVenue !== venue.id) {
      return;
    }

    // URL handoff fallback: if storage/cookie writes were flaky on join,
    // recover identity here before redirect checks run.
    saveUserId(entryUser);
    saveVenueId(venue.id);

    const cleanPath = `/venue/${encodeURIComponent(venue.id)}`;
    router.replace(cleanPath);
  }, [router, venue.id]);

  // This effect runs first on mount and must be declared before any effect that
  // reads entryHandoffRef or bootstrapSnapshotRef.
  useEffect(() => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setArrivalOverlayCleared(true);
      return;
    }

    const snapshot = consumeVenueHomeBootstrap({ venueId: venue.id, userId });
    const sessionHandoff = consumeVenueHomeEntryHandoff({ venueId: venue.id, userId });

    // Fall back to URL params as a secondary handoff signal when sessionStorage
    // was cleared or expired before this effect ran (e.g. on slow connections).
    let handoff = sessionHandoff;
    if (!handoff) {
      const params = new URLSearchParams(window.location.search);
      const urlEntryUser = (params.get("entryUser") ?? "").trim();
      const urlEntryVenue = (params.get("entryVenue") ?? "").trim();
      const urlEntryAt = Number(params.get("entryAt") ?? "");
      handoff = Boolean(
        urlEntryUser &&
        (!urlEntryVenue || urlEntryVenue === venue.id) &&
        Number.isFinite(urlEntryAt) &&
        Date.now() - urlEntryAt <= 60_000
      );
    }

    bootstrapSnapshotRef.current = snapshot;
    entryHandoffRef.current = handoff;

    if (snapshot) {
      // Ignore cached badge snapshots so stale red bubbles never appear.
      // Badges are populated only from fresh unclaimed-points fetches.
      setHomeBadgeCounts({});
      if (snapshot.leaderboardEntries && snapshot.leaderboardEntries.length > 0) {
        setLeaderboardBootstrapEntries(snapshot.leaderboardEntries);
      }
      setArrivalCoreReady(true);
    }

    if (!handoff) {
      setArrivalOverlayCleared(true);
      return;
    }

    // Fresh login: wait for the join-flow's global transition overlay to clear.
    const expectedPath = window.location.pathname;
    const onOverlayHidden = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string } | undefined>).detail;
      const hiddenPath = String(detail?.path ?? "").trim();
      if (!pathMatches(expectedPath, hiddenPath)) return;
      setArrivalOverlayCleared(true);
    };
    window.addEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
    const fallbackTimer = window.setTimeout(() => {
      setArrivalOverlayCleared(true);
    }, 2500);

    return () => {
      window.removeEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
      window.clearTimeout(fallbackTimer);
    };
     
  }, [venue.id]);

  useEffect(() => {
    // entryHandoffRef is set by the bootstrap effect above, which runs first.
    // Skip the redirect guard entirely when the user just came through the join flow.
    if (entryHandoffRef.current) {
      logAuthIncident("venue-hub-guard", "skip-redirect-guard-entry-handoff", { venueId: venue.id });
      return;
    }
    if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
      logAuthIncident("venue-hub-guard", "skip-redirect-guard-recent-intent", { venueId: venue.id });
      return;
    }
    const storedUserId = (getUserId() ?? "").trim();
    const storedVenueId = (getVenueId() ?? "").trim();
    if (storedUserId) {
      if (storedVenueId && storedVenueId !== venue.id) {
        const target = `/?v=${venue.id}`;
        logAuthIncident("venue-hub-guard", "redirect-stored-venue-mismatch", {
          venueId: venue.id,
          storedVenueId,
          target,
        });
        router.replace(target);
      }
      return;
    }
    // On slow connections the entryAt URL param may still be present at mount
    // time even though the handoff wasn't found in sessionStorage. Use it as a
    // proxy for "a login transition just happened" and double the patience window.
    const mountParams = new URLSearchParams(window.location.search);
    const mountEntryAt = Number(mountParams.get("entryAt") ?? "");
    const isLoginTransition = Number.isFinite(mountEntryAt) && Date.now() - mountEntryAt <= 60_000;
    const redirectDelay = isLoginTransition ? 10_000 : 5_000;
    const timer = window.setTimeout(() => {
      if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
        return;
      }
      const lateUserId = (getUserId() ?? "").trim();
      const lateVenueId = (getVenueId() ?? "").trim();
      if (lateUserId) {
        if (lateVenueId && lateVenueId !== venue.id) {
          const target = `/?v=${venue.id}`;
          logAuthIncident("venue-hub-guard", "redirect-late-venue-mismatch", {
            venueId: venue.id,
            lateVenueId,
            target,
          });
          router.replace(target);
        }
        return;
      }
      if (!hasUserTokenInCookie()) {
        const target = `/?v=${venue.id}`;
        logAuthIncident("venue-hub-guard", "redirect-missing-user-cookie", {
          venueId: venue.id,
          redirectDelay,
          isLoginTransition,
          target,
        });
        console.warn(`[VenueHub] Redirecting to login: no user token found after ${redirectDelay}ms guard (loginTransition=${isLoginTransition})`);
        router.replace(target);
      }
    }, redirectDelay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUserTokenInCookie, venue.id]);

  const venueDisplayName = getVenueDisplayName(venue as any);

  useEffect(() => {
    if (venueReadyDispatchedRef.current || typeof window === "undefined" || !homeRevealComplete) {
      return;
    }
    clearLoginInProgress();
    venueReadyDispatchedRef.current = true;
    const rafId = window.requestAnimationFrame(() => {
      try {
        window.sessionStorage.setItem(
          "tp:venue-home-ready:v1",
          JSON.stringify({ path: window.location.pathname, at: Date.now() })
        );
      } catch {
        // Ignore storage failures on restricted browsers.
      }
      window.dispatchEvent(
        new CustomEvent("tp:venue-home-ready", {
          detail: { path: window.location.pathname },
        })
      );
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [homeRevealComplete]);

  const triggerPulse = useCallback(() => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      (navigator as any).vibrate?.(14);
    } catch {}
  }, []);

  const openMenu = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const leaveVenue = () => {
    try {
      (navigator as any).vibrate?.([22, 40, 22]);
    } catch {}
    clearVenueSession();
    router.push("/");
  };

  const goToScreen = useCallback((screenIndex: HomeScreenIndex) => {
    const viewport = swipeViewportRef.current;
    if (!viewport) return;
    const nextIndex = clamp(screenIndex, 0, SWIPE_SCREEN_COUNT - 1) as HomeScreenIndex;
    if (nextIndex === activeScreenRef.current) return;
    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior: "smooth" });
    setActiveScreen(nextIndex);
    activeScreenRef.current = nextIndex;
  }, []);

  const onCarouselScroll = useCallback(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport || scrollTickingRef.current) return;
    scrollTickingRef.current = true;
    window.requestAnimationFrame(() => {
      scrollTickingRef.current = false;
      const panelWidth = Math.max(1, viewport.clientWidth);
      const nextIndex = clamp(Math.round(viewport.scrollLeft / panelWidth), 0, SWIPE_SCREEN_COUNT - 1) as HomeScreenIndex;
      if (nextIndex === activeScreenRef.current) return;
      activeScreenRef.current = nextIndex;
      setActiveScreen(nextIndex);
    });
  }, []);

  useLayoutEffect(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = viewport.clientWidth * activeScreenRef.current;
    setCarouselBootstrapped(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const viewport = swipeViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ left: viewport.clientWidth * activeScreenRef.current, behavior: "auto" });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const verifyActiveVenueSession = useCallback(async (): Promise<boolean> => {
    const userId = (getUserId() ?? "").trim();
    const venueId = (getVenueId() ?? "").trim();
    if (!userId || !venueId || venueId !== venue.id) {
      return false;
    }
    const payload = await fetchJsonWithTimeout<UserSummaryPayload>(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}`,
      3600
    );
    if (!payload?.ok || !payload.profile) {
      return false;
    }
    return String(payload.profile.venueId ?? "").trim() === venue.id;
  }, [venue.id]);

  const loadMenuSummary = useCallback(async () => {
    const userId = (getUserId() ?? "").trim();
    const venueId = (getVenueId() ?? "").trim();
    if (!userId) {
      setMenuUsername("");
      setMenuPoints(0);
      return;
    }

    const fallbackUsername = (getUsername() ?? "").trim();
    if (fallbackUsername) {
      setMenuUsername(fallbackUsername);
    }

    const payload = await fetchJsonWithTimeout<UserSummaryPayload>(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
      3600
    );
    if (!payload?.ok || !payload.profile) {
      return;
    }
    const nextUsername = String(payload.profile.username ?? "").trim();
    const nextPoints = Math.max(0, Math.round(Number(payload.profile.points ?? 0)));
    if (nextUsername) {
      setMenuUsername(nextUsername);
    }
    setMenuPoints(nextPoints);
    setHasPasskey(Boolean(payload.hasPasskey));
  }, []);

  const handlePasskeySetup = useCallback(async () => {
    setPasskeySetupError("");
    setPasskeySetupMessage("");

    if (!browserSupportsWebAuthn()) {
      setPasskeySetupError("This browser does not support passkey setup.");
      return;
    }

    const userId = (getUserId() ?? "").trim();
    const venueId = venue.id;
    const username = (getUsername() ?? menuUsername).trim();
    const accountId = (getAccountId() ?? "").trim();
    if (!userId || !venueId || (!username && !accountId)) {
      setPasskeySetupError("Please sign in again before setting up a passkey.");
      return;
    }

    setIsPasskeySetupLoading(true);
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    logAuthIncident("venue-passkey", "setup-start", {
      venueId,
      userId,
      username,
      userAgent,
    });

    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(accountId ? { accountId } : {}),
          userId,
          venueId,
          username,
        }),
      });
      const optionsPayload = (await optionsResponse.json().catch(() => null)) as PasskeyRegisterOptionsPayload | null;
      if (!optionsResponse.ok || !optionsPayload?.ok || !optionsPayload.options || !optionsPayload.challengeId) {
        const mappedMessage = getPasskeyClientMessage(
          optionsPayload?.errorCode,
          optionsPayload?.error || "Passkey setup could not be started."
        );
        setPasskeySetupError(mappedMessage);
        logAuthIncident("venue-passkey", "setup-options-failed", {
          venueId,
          userId,
          code: optionsPayload?.errorCode ?? null,
          message: optionsPayload?.error ?? null,
        });
        return;
      }

      const registrationResponse = await startRegistration({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: optionsPayload.challengeId,
          response: registrationResponse,
          userId,
          venueId,
        }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyRegisterVerifyPayload | null;
      if (!verifyResponse.ok || !verifyPayload?.ok) {
        const mappedMessage = getPasskeyClientMessage(
          verifyPayload?.errorCode,
          verifyPayload?.error || "Passkey setup verification failed."
        );
        setPasskeySetupError(mappedMessage);
        logAuthIncident("venue-passkey", "setup-verify-failed", {
          venueId,
          userId,
          code: verifyPayload?.errorCode ?? null,
          message: verifyPayload?.error ?? null,
        });
        return;
      }

      setPasskeySetupMessage("Passkey enabled. Next login can use Face ID, Touch ID, or device PIN.");
      setHasPasskey(true);
      logAuthIncident("venue-passkey", "setup-success", { venueId, userId });
    } catch (error) {
      if (isPasskeyUserCancel(error)) {
        setPasskeySetupError("");
        logAuthIncident("venue-passkey", "setup-canceled", { venueId, userId });
      } else {
        const fallback = error instanceof Error ? error.message : "Passkey setup failed.";
        setPasskeySetupError(getPasskeyClientMessage(undefined, fallback));
        logAuthIncident("venue-passkey", "setup-error", {
          venueId,
          userId,
          message: fallback,
        });
      }
    } finally {
      setIsPasskeySetupLoading(false);
    }
  }, [menuUsername, venue.id]);

  const loadHomeBadges = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setHomeBadgeCounts((current) => (areHomeBadgeCountsEqual(current, {}) ? current : {}));
      if (!silent) {
        setIsBadgeLoading(false);
      }
      return;
    }
    badgeRequestRef.current?.abort();
    const controller = new AbortController();
    badgeRequestRef.current = controller;
    const signal = controller.signal;
    if (!silent) {
      setIsBadgeLoading(true);
    }
    setBadgeError((current) => (current ? "" : current));
    try {
      const results = await Promise.allSettled([
        fetchJsonWithTimeout<BingoBadgePayload>(
          `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as BingoBadgePayload)),
        fetchJsonWithTimeout<PickEmBadgePayload>(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}&includeSettled=true&limit=200`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as PickEmBadgePayload)),
        fetchJsonWithTimeout<FantasyBadgePayload>(
          `/api/fantasy/entries?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}&includeSettled=true&refreshProgress=true&limit=120`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as FantasyBadgePayload)),
      ]);
      if (signal.aborted) return;
      const bingoPayload = results[0].status === "fulfilled" ? results[0].value : { ok: false as const };
      const pickEmPayload = results[1].status === "fulfilled" ? results[1].value : { ok: false as const };
      const fantasyPayload = results[2].status === "fulfilled" ? results[2].value : { ok: false as const };
      const unclaimedBingoCount = bingoPayload.ok
        ? (bingoPayload.cards ?? []).filter(
            (card) => card.status === "won" && !card.rewardClaimedAt && Math.max(0, Number(card.rewardPoints ?? 0)) > 0
          ).length
        : 0;
      const unclaimedPickEmCount = pickEmPayload.ok
        ? (pickEmPayload.picks ?? []).filter(
            (pick) =>
              pick.status === "won" &&
              !pick.rewardClaimedAt &&
              Math.max(0, Number(pick.rewardPoints ?? 0)) > 0
          ).length
        : 0;
      const unclaimedFantasyCount = fantasyPayload.ok
        ? (fantasyPayload.entries ?? []).filter(
            (entry) =>
              entry.status === "final" &&
              !entry.rewardClaimedAt &&
              Math.max(0, Number(entry.points ?? 0)) > 0
          ).length
        : 0;
      const nextCounts: HomeBadgeCounts = {
        bingo: unclaimedBingoCount,
        pickem: unclaimedPickEmCount,
        fantasy: unclaimedFantasyCount,
      };
      setHomeBadgeCounts((current) => (areHomeBadgeCountsEqual(current, nextCounts) ? current : nextCounts));
    } catch {
      if (!signal.aborted) {
        setBadgeError((current) => (current === "Offline: badge counts unavailable." ? current : "Offline: badge counts unavailable."));
      }
    } finally {
      if (badgeRequestRef.current === controller) {
        badgeRequestRef.current = null;
      }
      if (!silent && !signal.aborted) {
        setIsBadgeLoading(false);
      }
    }
  }, [venue.id]);

  const loadChallengeCampaigns = useCallback(
    async (options?: { silent?: boolean }) => {
      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
      const silent = Boolean(options?.silent);
      campaignRequestRef.current?.abort();
      const controller = new AbortController();
      campaignRequestRef.current = controller;
      const signal = controller.signal;
      if (!venueId) {
        if (campaignRequestRef.current === controller) {
          campaignRequestRef.current = null;
        }
        setIsChallengesLoading(false);
        return;
      }
      if (!silent) {
        setIsChallengesLoading(true);
      }
      setChallengesError("");
      try {
        const query = new URLSearchParams({
          venueId,
          includeInactive: "true",
          includeResolved: "true",
        });
        if (userId) {
          query.set("userId", userId);
        }
        const body = await fetchJsonWithTimeout<ChallengeCampaignPayload>(
          `/api/challenge-campaigns?${query.toString()}`,
          FETCH_TIMEOUT_MS,
          signal
        );
        if (signal.aborted) return;
        if (!body?.ok) {
          throw new Error("Challenges unavailable.");
        }
        setChallengeCards(Array.isArray(body.campaigns) ? body.campaigns : []);
      } catch {
        if (!signal.aborted) {
          setChallengesError("Offline: challenges unavailable.");
        }
      } finally {
        if (campaignRequestRef.current === controller) {
          campaignRequestRef.current = null;
        }
        if (!silent && !signal.aborted) {
          setIsChallengesLoading(false);
        }
      }
    },
    []
  );

  const loadLiveTriviaStatus = useCallback(async () => {
    liveTriviaRequestRef.current?.abort();
    const controller = new AbortController();
    liveTriviaRequestRef.current = controller;
    const signal = controller.signal;
    try {
      const storedVenueId = String(getVenueId() ?? "").trim();
      const venueContext = resolveLiveTriviaVenueContext({
        routeVenueId: venue.id,
        storedVenueId,
      });
      const query = venueContext.venueId ? `?venueId=${encodeURIComponent(venueContext.venueId)}` : "";
      debugLiveTrivia("requesting_state", {
        venueId: venueContext.venueId,
        venueSource: venueContext.source,
      });
      const payload = await fetchJsonWithTimeout<{
        ok?: boolean;
        state?: {
          isGameActive?: boolean;
          nextSchedule?: {
            startTime?: string;
            timezone?: string;
            recurringType?: string;
            recurringDays?: string[];
          } | null;
        };
      }>(`/api/trivia/live/state${query}`, 3600, signal);
      if (signal.aborted) return;

      const evaluation = evaluateLiveTriviaStatePayload(payload);
      debugLiveTrivia("state_summary", {
        venueId: venueContext.venueId,
        venueSource: venueContext.source,
        ok: Boolean(payload?.ok),
        isGameActive: Boolean(payload?.state?.isGameActive),
        hasNextSchedule: Boolean(payload?.state?.nextSchedule),
        nextStartTime: String(payload?.state?.nextSchedule?.startTime ?? "").trim() || null,
        resultKind: evaluation.kind,
        failureReason: evaluation.failureReason,
      });

      if (evaluation.kind === "live") {
        setLiveTriviaStatus({
          live: true,
          label: evaluation.label,
          nextStartAtMs: null,
          failureReason: null,
          recurringType: evaluation.scheduleRecurringType || null,
          recurringDays: evaluation.scheduleRecurringDays,
        });
        return;
      }

      if (evaluation.kind === "upcoming") {
        const nextStart = new Date(evaluation.nextStartAtMs);
        setLiveTriviaStatus({
          live: false,
          label: formatLiveTriviaNextGameLabel(nextStart, evaluation.scheduleTimezone || undefined),
          nextStartAtMs: evaluation.nextStartAtMs,
          failureReason: null,
          recurringType: evaluation.scheduleRecurringType || null,
          recurringDays: evaluation.scheduleRecurringDays,
        });
        return;
      }

      setLiveTriviaStatus({
        live: false,
        label: evaluation.label,
        nextStartAtMs: null,
        failureReason: evaluation.failureReason,
        recurringType: null,
        recurringDays: [],
      });
    } catch {
      if (!signal.aborted) {
        debugLiveTrivia("state_fetch_failed", {
          venueId: venue.id,
          reason: "network",
        });
        setLiveTriviaStatus({
          live: false,
          label: "Status unavailable",
          nextStartAtMs: null,
          failureReason: "network",
          recurringType: null,
          recurringDays: [],
        });
      }
    } finally {
      if (liveTriviaRequestRef.current === controller) {
        liveTriviaRequestRef.current = null;
      }
    }
  }, [venue.id]);

  const loadScategoriesStatus = useCallback(async () => {
    scategoriesRequestRef.current?.abort();
    const controller = new AbortController();
    scategoriesRequestRef.current = controller;
    const signal = controller.signal;
    try {
      const payload = await fetchJsonWithTimeout<{
        ok: boolean;
        session?: { status?: string } | null;
        nextWindowAt?: string | null;
      }>(
        `/api/scategories/sessions?venueId=${encodeURIComponent(venue.id)}`,
        3600,
        signal
      );
      if (signal.aborted) return;
      const status = payload?.session?.status ?? null;
      const active = status === "lobby" || status === "active" || status === "scoring";
      setScategoriesSessionActive(active);
      const nextWin = payload?.nextWindowAt ? new Date(payload.nextWindowAt).getTime() : null;
      setScategoriesNextWindowAtMs(nextWin);
    } catch {
      // Non-fatal — scategories card simply won't appear.
    } finally {
      if (scategoriesRequestRef.current === controller) {
        scategoriesRequestRef.current = null;
      }
    }
  }, [venue.id]);

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) return warmupPromiseRef.current;
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) return;
    const p = (async () => {
      let warmedTriviaQuota: TriviaQuotaSnapshot | null = null;
      try {
        const [body, quotaBody] = await Promise.all([
          fetchJsonWithTimeout<{ ok?: boolean; questions?: unknown[] }>(`/api/trivia?userId=${encodeURIComponent(userId)}`),
          fetchJsonWithTimeout<{ ok?: boolean; quota?: TriviaQuotaSnapshot | null }>(
            `/api/trivia/quota?userId=${encodeURIComponent(userId)}`
          ),
        ]);
        if (quotaBody?.ok) {
          warmedTriviaQuota = quotaBody.quota ?? null;
        }
        if (body?.ok && Array.isArray(body.questions)) {
          try {
            writeWarmTriviaCache({ userId, venueId, questions: body.questions as any, quota: warmedTriviaQuota });
          } catch {}
        }
      } catch {}
      try {
        const pb = await fetchJsonWithTimeout<any>("/api/predictions?page=1&pageSize=24&excludeSensitive=false");
        if (pb?.ok) {
          try {
            writeWarmPredictionsCache({ venueId, payload: pb });
          } catch {}
        }
      } catch {}
      try {
        await fetchJsonWithTimeout<{ ok?: boolean }>("/api/pickem/sports");
      } catch {}
      void loadHomeBadges({ silent: true });
    })();
    warmupPromiseRef.current = p;
    return p;
  }, [loadHomeBadges]);

  useEffect(() => {
    if (!arrivalInProgress) {
      return;
    }
    let cancelled = false;

    const loadArrivalPipeline = async () => {
      const startTime = Date.now();
      setArrivalStage("identity");
      setArrivalProgress(14);
      setArrivalStatusText("Checking your player session...");
      await wait(220);
      if (cancelled) {
        return;
      }

      setArrivalStage("core");
      setArrivalProgress(42);
      setArrivalStatusText("Loading your venue dashboard...");
      const bootstrapSnapshot = bootstrapSnapshotRef.current;
      if (!bootstrapSnapshot) {
        // Validate credentials from local storage/cookie only — no blocking network call.
        // A network timeout returning null was being treated as "invalid session" and
        // wiping auth for users who had a perfectly valid cookie.
        const localUserId = (getUserId() ?? "").trim();
        const localVenueId = (getVenueId() ?? "").trim();
        if (!localUserId || !localVenueId || localVenueId !== venue.id || !hasUserTokenInCookie()) {
          if (!cancelled) {
            const target = `/?v=${encodeURIComponent(venue.id)}`;
            logAuthIncident("venue-hub-guard", "redirect-arrival-missing-identity", {
              venueId: venue.id,
              hasLocalUser: Boolean(localUserId),
              localVenueMatches: localVenueId === venue.id,
              hasCookie: hasUserTokenInCookie(),
              target,
            });
            console.warn(`[VenueHub] Redirecting to login during arrival: missing identity (userId=${!!localUserId}, venueMatch=${localVenueId === venue.id}, cookie=${hasUserTokenInCookie()})`);
            router.replace(target);
          }
          return;
        }
        const coreLoadTasks: Array<Promise<unknown>> = [loadHomeBadges()];
        const coreLoadPromise = Promise.allSettled(coreLoadTasks);
        await Promise.race([coreLoadPromise, wait(ARRIVAL_CORE_MAX_WAIT_MS)]);
        void coreLoadPromise.catch(() => {});
      } else {
        await wait(260);
      }
      if (cancelled) {
        return;
      }

      setArrivalCoreReady(true);
      setArrivalStage("warmup");
      setArrivalProgress(74);
      setArrivalStatusText("Warming up games and scores...");
      if (!warmupStartedRef.current) {
        warmupStartedRef.current = true;
        void runWarmup();
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        await wait(1200 - elapsed);
      }
      if (cancelled) {
        return;
      }

      setArrivalProgress(92);
      setArrivalStatusText("Finalizing your venue home...");
    };

    void loadArrivalPipeline();

    return () => {
      cancelled = true;
    };
  }, [arrivalInProgress, hasUserTokenInCookie, loadHomeBadges, router, runWarmup, venue.id]);

  useEffect(() => {
    if (!arrivalInProgress) {
      try {
        window.sessionStorage.removeItem(ARRIVAL_RECOVERY_ATTEMPT_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }
    const timer = window.setTimeout(() => {
      let recoveryAttempts = 0;
      try {
        recoveryAttempts = Number(window.sessionStorage.getItem(ARRIVAL_RECOVERY_ATTEMPT_KEY) ?? "0") || 0;
        window.sessionStorage.setItem(ARRIVAL_RECOVERY_ATTEMPT_KEY, String(recoveryAttempts + 1));
      } catch {
        recoveryAttempts = 0;
      }

      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
      if (recoveryAttempts < 1 && userId && venueId === venue.id) {
        window.location.replace(`/venue/${encodeURIComponent(venue.id)}?recoverAt=${Date.now()}`);
        return;
      }
      clearVenueSession();
      const target = `/?v=${encodeURIComponent(venue.id)}`;
      logAuthIncident("venue-hub-guard", "redirect-arrival-watchdog-reset", {
        venueId: venue.id,
        recoveryAttempts,
        hasUserId: Boolean(userId),
        venueMatches: venueId === venue.id,
        target,
      });
      router.replace(target);
    }, ARRIVAL_WATCHDOG_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [arrivalInProgress, router, venue.id]);

  useEffect(() => {
    if (!arrivalInProgress) {
      return;
    }
    if (!arrivalCoreReady || !arrivalOverlayCleared) {
      return;
    }
    const revealTimer = window.setTimeout(() => {
      setArrivalStage("ready");
      setArrivalProgress(100);
      setArrivalStatusText("Venue ready.");
      setArrivalInProgress(false);
      setHomeRevealComplete(true);
    }, 180);
    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [arrivalCoreReady, arrivalInProgress, arrivalOverlayCleared]);

  useEffect(() => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setIsBadgeLoading(false);
      return;
    }
    void loadHomeBadges();
    const interval = window.setInterval(() => void loadHomeBadges({ silent: true }), 20000);
    return () => window.clearInterval(interval);
  }, [loadHomeBadges]);

  useEffect(() => {
    void loadMenuSummary();
    const interval = window.setInterval(() => {
      void loadMenuSummary();
    }, 20000);
    const onPointsUpdated = () => {
      void loadMenuSummary();
    };
    const onAuthStateChanged = () => {
      void loadMenuSummary();
    };
    window.addEventListener("tp:points-updated", onPointsUpdated);
    window.addEventListener("tp:auth-state-changed", onAuthStateChanged as EventListener);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPointsUpdated);
      window.removeEventListener("tp:auth-state-changed", onAuthStateChanged as EventListener);
    };
  }, [loadMenuSummary]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const deferTimer = window.setTimeout(() => {
      void loadChallengeCampaigns();
      void loadLiveTriviaStatus();
    }, 100);
    return () => window.clearTimeout(deferTimer);
  }, [contentReady, homeRevealComplete, loadChallengeCampaigns, loadLiveTriviaStatus]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const interval = window.setInterval(() => void loadChallengeCampaigns({ silent: true }), 30000);
    return () => window.clearInterval(interval);
  }, [contentReady, homeRevealComplete, loadChallengeCampaigns]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const interval = window.setInterval(() => void loadLiveTriviaStatus(), 15000);
    return () => window.clearInterval(interval);
  }, [contentReady, homeRevealComplete, loadLiveTriviaStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveCountdownNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Fetch live trivia status immediately on mount so the countdown clock
  // appears right away instead of waiting for the full arrival pipeline.
  useEffect(() => {
    void loadLiveTriviaStatus();
  }, [loadLiveTriviaStatus]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    void loadScategoriesStatus();
    const interval = window.setInterval(() => void loadScategoriesStatus(), 30000);
    return () => window.clearInterval(interval);
  }, [contentReady, homeRevealComplete, loadScategoriesStatus]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    router.prefetch("/trivia");
    router.prefetch("/trivia/live");
    router.prefetch("/predictions");
    router.prefetch("/pickem");
    router.prefetch("/bingo");
    router.prefetch("/fantasy");
    router.prefetch("/pending-challenges");
    router.prefetch("/active-games");
    router.prefetch("/redeem-prizes");
    router.prefetch("/scategories");
    if (!warmupStartedRef.current && !bootstrapSnapshotRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [contentReady, homeRevealComplete, runWarmup, router]);

  useEffect(() => {
    return () => {
      badgeRequestRef.current?.abort();
      campaignRequestRef.current?.abort();
      liveTriviaRequestRef.current?.abort();
      scategoriesRequestRef.current?.abort();
    };
  }, []);

  const goTo = useCallback(
    async (dest: VenueGameKey, sourceElement: HTMLElement | null) => {
      const destination = VENUE_GAME_CARD_BY_KEY[dest];
      if (!destination) return;
      const targetPath =
        dest === "live_trivia" ? `${destination.path}?venueId=${encodeURIComponent(venue.id)}` : destination.path;
      triggerPulse();
      setPendingDestination(dest);
      try {
        await runVenueGameOpenTransition({
          gameKey: dest,
          sourceElement,
          targetPath,
          navigate: () => router.push(targetPath),
        });
      } catch {
        setPendingDestination(null);
      }
    },
  [router, triggerPulse, venue.id]
  );

  const homeCards = useMemo(() => VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]), []);
  const currentUserId = useMemo(() => (getUserId() ?? "").trim(), []);
  const goToChallengeRedeem = useCallback(
    async (challengeId: string, sourceElement: HTMLElement | null) => {
      setPendingChallengeRedeemId(challengeId);
      try {
        await runVenueGameOpenTransition({
          gameKey: "fantasy",
          sourceElement,
          targetPath: `/venue/${encodeURIComponent(venue.id)}/redeem`,
          navigate: () => router.push(`/venue/${encodeURIComponent(venue.id)}/redeem`),
        });
      } catch {
        setPendingChallengeRedeemId(null);
      }
    },
    [router, venue.id]
  );
  const retryBadges = useCallback(() => {
    void loadHomeBadges();
  }, [loadHomeBadges]);
  const retryChallenges = useCallback(() => {
    void loadChallengeCampaigns();
  }, [loadChallengeCampaigns]);
  const handleGoTo = useCallback(
    (dest: VenueGameKey, sourceElement: HTMLElement | null) => {
      void goTo(dest, sourceElement);
    },
    [goTo]
  );
  const leaderboardInitialEntries = leaderboardBootstrapEntries.length > 0 ? leaderboardBootstrapEntries : initialEntries;
  const nextLiveTriviaCountdownSeconds =
    liveTriviaStatus.nextStartAtMs != null
      ? Math.max(0, Math.floor((liveTriviaStatus.nextStartAtMs - liveCountdownNowMs) / 1000))
      : null;
  const scategoriesNextWindowSeconds =
    !scategoriesSessionActive && scategoriesNextWindowAtMs != null
      ? Math.max(0, Math.floor((scategoriesNextWindowAtMs - liveCountdownNowMs) / 1000))
      : null;
  const nextLiveTriviaCountdownLabel = liveTriviaStatus.live
    ? "Live Now"
    : nextLiveTriviaCountdownSeconds != null
    ? formatLongCountdown(nextLiveTriviaCountdownSeconds)
    : liveTriviaStatus.label || "Loading...";
  const showLiveBadge = liveTriviaStatus.live;
  const lobbyButtonShouldPulse =
    liveTriviaStatus.live ||
    (nextLiveTriviaCountdownSeconds != null &&
      nextLiveTriviaCountdownSeconds > 0 &&
      nextLiveTriviaCountdownSeconds <= 120);

  const visibleBadgeByGame = useMemo(() => {
    const badges = new Map<VenueGameKey, string>();
    for (const [gameKey, count] of Object.entries(homeBadgeCounts) as Array<[VenueGameKey, number | undefined]>) {
      if (!count || count <= 0) continue;
      badges.set(gameKey, formatBadgeCount(count));
    }
    return badges;
  }, [homeBadgeCounts]);

  const selectedChallenge = useMemo(
    () => challengeCards.find((card) => card.id === selectedChallengeId) ?? null,
    [challengeCards, selectedChallengeId]
  );
  const orderedHomeCards = useMemo(() => {
    const byKey = new Map(homeCards.map((card) => [card.key, card] as const));
    return VENUE_HUB_GAME_ORDER.map((key) => byKey.get(key)).filter((card): card is (typeof homeCards)[number] => Boolean(card));
  }, [homeCards]);
  const challengeBadgeCount = challengeCards.filter((challenge) => Boolean(challenge.winnerUserId && challenge.winnerUserId === currentUserId && !challenge.prizeClaimedAt)).length;

  const showFastPathSkeleton = arrivalInProgress && !arrivalCoreReady;

  return (
    <div
      className="relative z-[60] flex flex-col isolation-isolate"
    >
      <VenueHubHeaderBar
        venueDisplayName={venueDisplayName}
        isMenuOpen={isMenuOpen}
        onOpenMenu={openMenu}
        onTriggerPulse={triggerPulse}
        activeScreen={activeScreen}
        onGoToScreen={goToScreen}
        challengeBadgeCount={challengeBadgeCount}
      />

      <div aria-hidden className="shrink-0 h-[calc(max(env(safe-area-inset-top),0px)+8rem)]" />

      <div className="canvas-ribbon m-0 w-full p-0">
        <div
          ref={swipeViewportRef}
          onScroll={onCarouselScroll}
          className="venue-home-carousel relative m-0 flex w-full overflow-x-auto overflow-y-visible p-0 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            overscrollBehaviorX: "contain",
            scrollPadding: 0,
          }}
          aria-label="Venue home screens"
        >
        <VenueGamesPanel
          contentReady={contentReady}
          showFastPathSkeleton={showFastPathSkeleton}
          arrivalStatusText={arrivalStatusText}
          arrivalStage={arrivalStage}
          arrivalProgress={arrivalProgress}
          liveTriviaStatus={liveTriviaStatus}
          nextLiveTriviaCountdownLabel={nextLiveTriviaCountdownLabel}
          nextLiveTriviaCountdownSeconds={nextLiveTriviaCountdownSeconds}
          lobbyButtonShouldPulse={lobbyButtonShouldPulse}
          pendingDestination={pendingDestination}
          orderedHomeCards={orderedHomeCards}
          visibleBadgeByGame={visibleBadgeByGame}
          badgeError={badgeError}
          scategoriesSessionActive={scategoriesSessionActive}
          scategoriesNextWindowSeconds={scategoriesNextWindowSeconds}
          onTriggerPulse={triggerPulse}
          onGoTo={handleGoTo}
          onRetryBadges={retryBadges}
        />

        <VenueChallengesPanel
          contentReady={contentReady}
          isChallengesLoading={isChallengesLoading}
          challengeCards={challengeCards}
          currentUserId={currentUserId}
          pendingChallengeRedeemId={pendingChallengeRedeemId}
          challengesError={challengesError}
          onSelectChallenge={setSelectedChallengeId}
          onGoToChallengeRedeem={goToChallengeRedeem}
          onRetryChallenges={retryChallenges}
        />

        <VenueLeaderboardPanel
          contentReady={contentReady}
          venueId={venue.id}
          initialEntries={leaderboardInitialEntries}
          isEnabled={homeRevealComplete}
        />
        </div>
      </div>

      <div
        data-tp-scroll-lock={isMenuOpen ? "active" : undefined}
        className={`fixed inset-0 z-[1200] ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isMenuOpen}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className={`absolute inset-0 h-full w-full bg-black/40 transition-opacity duration-200 ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Close navigation menu"
        />

        <aside
          className={`absolute inset-y-0 left-0 w-[22rem] max-w-[92vw] border-r border-ht-border-soft bg-ht-surface px-5 py-5 shadow-ht-modal transition-transform duration-200 ${
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-black tracking-wide text-ht-fg-primary">Menu</h3>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-ht-sm border border-ht-border-soft bg-ht-elevated px-3 py-1.5 text-base font-semibold text-ht-fg-muted"
            >
              Close
            </button>
          </div>

          <div className="mb-5 rounded-ht-lg border border-cyan-400/45 bg-cyan-400/10 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[1.15rem] font-black leading-tight text-ht-fg-primary">
                  {menuUsername || "Guest"}
                </p>
                <p className="mt-0.5 truncate text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-cyan-400">
                  {venueDisplayName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-amber-200/85">Points</p>
                <p
                  className="text-[1.02rem] font-black leading-tight"
                  style={{ color: "var(--ht-accent-gold, #fbbf24)", fontVariantNumeric: "tabular-nums" }}
                >
                  {(menuPoints ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {!hasPasskey && (
            <div className="mb-5 rounded-ht-lg border border-ht-border-hairline bg-ht-elevated/50 p-3">
              <div className="text-sm font-black text-ht-fg-primary">Passkey Login</div>
              <p className="mt-1 text-xs text-ht-fg-muted">
                Enable one-tap Face ID, Touch ID, or device PIN login on this device.
              </p>
              <button
                type="button"
                onClick={() => void handlePasskeySetup()}
                disabled={isPasskeySetupLoading}
                className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-400/15 px-3 py-2 text-sm font-black text-cyan-200 disabled:opacity-50"
              >
                {isPasskeySetupLoading ? "Setting up passkey..." : "Set Up Passkey"}
              </button>
              {passkeySetupError ? (
                <p className="mt-2 rounded-lg border border-rose-400/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                  {passkeySetupError}
                </p>
              ) : null}
              {passkeySetupMessage ? (
                <p className="mt-2 rounded-lg border border-emerald-400/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200">
                  {passkeySetupMessage}
                </p>
              ) : null}
            </div>
          )}

          <nav aria-label="Primary navigation">
            <ul className="space-y-3">
              {VENUE_DRAWER_MENU_ITEMS.map((item) => {
                const active = isActiveMenuPath(pathname, item.href);
                return (
                  <li key={`${item.label}:${item.href}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        router.push(item.href);
                      }}
                      className={`w-full rounded-ht-lg border px-4 py-3.5 text-left ${
                        active
                          ? "border-ht-border-strong bg-ht-elevated text-ht-fg-primary"
                          : "border-ht-border-hairline bg-ht-elevated/50 text-ht-fg-secondary hover:border-ht-border-soft hover:bg-ht-elevated"
                      }`}
                    >
                      <div className="text-lg font-black leading-tight">{item.label}</div>
                      <div className={`mt-1 text-sm leading-snug ${active ? "text-ht-fg-secondary" : "text-ht-fg-muted"}`}>
                        {item.description}
                      </div>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    leaveVenue();
                  }}
                  className="w-full rounded-ht-lg border border-rose-400/45 bg-rose-500/10 px-4 py-3 text-left text-base font-black text-rose-300"
                >
                  Leave Venue
                </button>
              </li>
            </ul>
          </nav>
        </aside>
      </div>

      <AnimatePresence>
        {selectedChallenge ? (
          <motion.div
            className="fixed inset-0 z-[99999] flex items-start justify-center bg-black/45 px-3 pb-4 pt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedChallengeId(null)}
          >
            <motion.div
              className="relative w-fit max-w-[calc(100vw-12px)] max-h-[calc(100svh-5rem)] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-slate-900 px-5 pb-6 pt-5 shadow-[0_24px_48px_rgba(0,0,0,0.6)]"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                className="tp-clean-button absolute right-3 top-3 inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-full bg-slate-800 px-4 text-sm font-semibold text-slate-300"
                onClick={() => setSelectedChallengeId(null)}
                aria-label="Close challenge rules"
              >
                Close
              </button>
              <h4 className="mt-2 w-[min(92vw,24rem)] pr-24 text-3xl font-black leading-9 text-white">{selectedChallenge.name}</h4>
              <p className="mt-7 w-[min(92vw,24rem)] pb-1 text-[1.65rem] leading-[2.35rem] text-slate-300">{selectedChallenge.rules}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const VenueHubClient = React.memo(VenueHubClientInner);
VenueHubClient.displayName = "VenueHubClient";
