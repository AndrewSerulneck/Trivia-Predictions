"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Venue, LeaderboardEntry } from "@/types";
import { getUserId, getVenueId, saveUserId, saveVenueId, clearVenueSession } from "@/lib/storage";
import { clearLoginInProgress } from "@/lib/authFastPath";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
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
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

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
    venueId?: string;
  } | null;
};

type ChallengeCampaignCard = {
  id: string;
  name: string;
  imageUrl?: string;
  rules: string;
  pointsRequiredToWin: number;
  progressPoints: number;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  isActive: boolean;
};

type ChallengeCampaignPayload = {
  ok?: boolean;
  campaigns?: ChallengeCampaignCard[];
};

type HomeScreenIndex = 0 | 1 | 2;
type VenueArrivalStage = "identity" | "core" | "warmup" | "ready";

const GAME_ICON_BG_BY_KEY: Record<VenueGameKey, string> = {
  trivia: "bg-[linear-gradient(138deg,#0ea5e9_0%,#2563eb_45%,#7c3aed_100%)]",
  bingo: "bg-[linear-gradient(136deg,#f97316_0%,#ef4444_50%,#ec4899_100%)]",
  pickem: "bg-[linear-gradient(138deg,#2563eb_0%,#7c3aed_58%,#ec4899_100%)]",
  fantasy: "bg-[linear-gradient(136deg,#7c3aed_0%,#2563eb_50%,#06b6d4_100%)]",
  predictions: "bg-[linear-gradient(136deg,#0f172a_0%,#334155_50%,#1e293b_100%)]",
};

const GAME_TITLE_LINES_BY_KEY: Record<VenueGameKey, string[]> = {
  trivia: ["Hightop", "Trivia™"],
  bingo: ["Hightop", "Bingo™"],
  pickem: ["Hightop", "Pick 'Em™"],
  fantasy: ["Hightop", "Fantasy™"],
  predictions: ["Hightop", "Predictions™"],
};

const SWIPE_SCREEN_COUNT = 3;
const FETCH_TIMEOUT_MS = 4500;
const ARRIVAL_CORE_MAX_WAIT_MS = 2800;
const ARRIVAL_WATCHDOG_TIMEOUT_MS = 8000;
const ARRIVAL_RECOVERY_ATTEMPT_KEY = "tp:venue-arrival-recovery-attempt";

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBadgeCount(value: number): string {
  const safeCount = Math.max(0, Math.floor(value));
  if (safeCount > 99) {
    return "99+";
  }
  return String(safeCount);
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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, Math.max(300, Math.floor(timeoutMs)));
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function pathMatches(expectedPath: string, candidatePath: string): boolean {
  if (!expectedPath) {
    return true;
  }
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`);
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

function TriviaGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="24" fill="#f59e0b" stroke="#0f172a" strokeWidth="4" />
      <path d="M16 32h32M32 16v32" stroke="#0f172a" strokeWidth="3.4" opacity="0.28" />
      <path d="M32 20c6 0 10 4 10 8 0 3-2 5-4 7-2 2-3 3-3 6" stroke="#0f172a" strokeWidth="4.2" fill="none" strokeLinecap="round" />
      <circle cx="35" cy="47" r="2.6" fill="#0f172a" />
    </svg>
  );
}

function BingoGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="24" fill="#fb923c" stroke="#0f172a" strokeWidth="4" />
      <path d="M10 32h44M32 10v44" stroke="#0f172a" strokeWidth="3" opacity="0.28" />
      <path d="M16 20c10 8 22 17 32 24" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M16 44c10-8 22-17 32-24" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function PickEmGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M19 14h26v8l-5 8H24l-5-8z" fill="#fde68a" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 30h20v6c0 6-4 12-10 12s-10-6-10-12z" fill="#facc15" stroke="#0f172a" strokeWidth="4" />
      <path d="M15 18c-3 0-6 2-6 5 0 4 3 8 8 8" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M49 18c3 0 6 2 6 5 0 4-3 8-8 8" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="m26 36 4 4 8-9" fill="none" stroke="#1d4ed8" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FantasyGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M32 8 50 16v14c0 12-7 21-18 26C21 51 14 42 14 30V16z" fill="#34d399" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
      <path d="m32 20 3.8 7.6 8.4 1.2-6.1 5.9 1.4 8.3-7.5-3.9-7.5 3.9 1.4-8.3-6.1-5.9 8.4-1.2z" fill="#fef08a" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M20 10h24v10c0 8-5 15-12 18-7-3-12-10-12-18z" fill="#fcd34d" stroke="#0f172a" strokeWidth="4" />
      <path d="M24 38h16v8H24z" fill="#f59e0b" stroke="#0f172a" strokeWidth="4" />
      <path d="M18 46h28v8H18z" fill="#facc15" stroke="#0f172a" strokeWidth="4" />
      <path d="M44 14h8c0 7-4 12-10 13" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 14h-8c0 7 4 12 10 13" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="21" r="4" fill="#fef9c3" stroke="#0f172a" strokeWidth="3" />
    </svg>
  );
}

function GameGlyph({ gameKey }: { gameKey: VenueGameKey }) {
  if (gameKey === "trivia") return <TriviaGlyph />;
  if (gameKey === "bingo") return <BingoGlyph />;
  if (gameKey === "pickem") return <PickEmGlyph />;
  if (gameKey === "fantasy") return <FantasyGlyph />;
  return <TriviaGlyph />;
}

function VenueHubClientInner({ venue, initialEntries = [] }: { venue: Venue; initialEntries?: LeaderboardEntry[] }) {
  const router = useRouter();
  // Bootstrap snapshot and entry handoff are read from sessionStorage ONLY after
  // mount (in useEffect). Reading them during render would produce different values
  // on the server (no sessionStorage) vs. the client, causing a hydration mismatch.
  const bootstrapSnapshotRef = useRef<VenueHomeBootstrapSnapshot | null>(null);
  const entryHandoffRef = useRef(false);
  const [pendingDestination, setPendingDestination] = useState<VenueGameKey | null>(null);
  // All state below is initialized to server-safe "no bootstrap" defaults.
  // The useEffect at the top of the effect list reads sessionStorage and corrects
  // these values on the client immediately after mount.
  const [triviaQuota, setTriviaQuota] = useState<TriviaQuotaSnapshot | null>(null);
  const [triviaUnlockSeconds, setTriviaUnlockSeconds] = useState(0);
  const [triviaGateNotice, setTriviaGateNotice] = useState("");
  const [homeBadgeCounts, setHomeBadgeCounts] = useState<HomeBadgeCounts>({});
  const [dismissedBadgeGames, setDismissedBadgeGames] = useState<Set<VenueGameKey>>(new Set());
  const [challengeCards, setChallengeCards] = useState<ChallengeCampaignCard[]>([]);
  const [isChallengesLoading, setIsChallengesLoading] = useState(true);
  const [challengesError, setChallengesError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [isBadgeLoading, setIsBadgeLoading] = useState(true);
  const [badgeError, setBadgeError] = useState("");
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
    const handoff = consumeVenueHomeEntryHandoff({ venueId: venue.id, userId });

    bootstrapSnapshotRef.current = snapshot;
    entryHandoffRef.current = handoff;

    if (snapshot) {
      setTriviaQuota(snapshot.triviaQuota ?? null);
      const quota = snapshot.triviaQuota ?? null;
      const isLocked = Boolean(quota && !quota.isAdminBypass && quota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(quota?.windowSecondsRemaining ?? 0)) : 0);
      setHomeBadgeCounts(snapshot.homeBadgeCounts ?? {});
      if (snapshot.homeBadgeCounts) setIsBadgeLoading(false);
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
    if (entryHandoffRef.current) return;
    if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
      return;
    }
    const storedUserId = (getUserId() ?? "").trim();
    const storedVenueId = (getVenueId() ?? "").trim();
    if (storedUserId) {
      if (storedVenueId && storedVenueId !== venue.id) router.replace(`/?v=${venue.id}`);
      return;
    }
    const timer = window.setTimeout(() => {
      if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
        return;
      }
      const lateUserId = (getUserId() ?? "").trim();
      const lateVenueId = (getVenueId() ?? "").trim();
      if (lateUserId) {
        if (lateVenueId && lateVenueId !== venue.id) router.replace(`/?v=${venue.id}`);
        return;
      }
      if (!hasUserTokenInCookie()) {
        router.replace(`/?v=${venue.id}`);
      }
    }, 5000);
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

  const triggerPulse = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      (navigator as any).vibrate?.(14);
    } catch {}
  };

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

  const loadTriviaQuota = useCallback(async (): Promise<TriviaQuotaSnapshot | null> => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setTriviaQuota(null);
      setTriviaUnlockSeconds(0);
      return null;
    }
    try {
      const payload = await fetchJsonWithTimeout<{ ok?: boolean; quota?: TriviaQuotaSnapshot | null }>(
        `/api/trivia/quota?userId=${encodeURIComponent(userId)}`
      );
      if (!payload?.ok) return null;
      const nextQuota = payload.quota ?? null;
      setTriviaQuota(nextQuota);
      const isLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      return nextQuota;
    } catch {
      return null;
    }
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
    if (!silent) {
      setIsBadgeLoading(true);
    }
    setBadgeError((current) => (current ? "" : current));
    try {
      const results = await Promise.allSettled([
        fetchJsonWithTimeout<BingoBadgePayload>(
          `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`
        ).then((payload) => payload ?? ({ ok: false } as BingoBadgePayload)),
        fetchJsonWithTimeout<PickEmBadgePayload>(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=200`
        ).then((payload) => payload ?? ({ ok: false } as PickEmBadgePayload)),
        fetchJsonWithTimeout<FantasyBadgePayload>(
          `/api/fantasy/entries?userId=${encodeURIComponent(userId)}&includeSettled=true&refreshProgress=true&limit=120`
        ).then((payload) => payload ?? ({ ok: false } as FantasyBadgePayload)),
      ]);
      const bingoPayload = results[0].status === "fulfilled" ? results[0].value : { ok: false as const };
      const pickEmPayload = results[1].status === "fulfilled" ? results[1].value : { ok: false as const };
      const fantasyPayload = results[2].status === "fulfilled" ? results[2].value : { ok: false as const };
      const unclaimedBingoCount = bingoPayload.ok
        ? (bingoPayload.cards ?? []).filter(
            (card) => card.status === "won" && !card.rewardClaimedAt && Math.max(0, Number(card.rewardPoints ?? 0)) > 0
          ).length
        : 0;
      const unclaimedPickEmCount = pickEmPayload.ok
        ? (pickEmPayload.picks ?? []).filter((pick) => pick.status === "won" && !pick.rewardClaimedAt).length
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
      setBadgeError((current) => (current === "Offline: badge counts unavailable." ? current : "Offline: badge counts unavailable."));
    } finally {
      if (!silent) {
        setIsBadgeLoading(false);
      }
    }
  }, []);

  const loadChallengeCampaigns = useCallback(
    async (options?: { silent?: boolean }) => {
      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
      const silent = Boolean(options?.silent);
      if (!venueId) {
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
        const body = await fetchJsonWithTimeout<ChallengeCampaignPayload>(`/api/challenge-campaigns?${query.toString()}`);
        if (!body?.ok) {
          throw new Error("Challenges unavailable.");
        }
        setChallengeCards(Array.isArray(body.campaigns) ? body.campaigns : []);
      } catch {
        setChallengesError("Offline: challenges unavailable.");
      } finally {
        if (!silent) {
          setIsChallengesLoading(false);
        }
      }
    },
    []
  );

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
          setTriviaQuota(warmedTriviaQuota);
          const isLocked = Boolean(warmedTriviaQuota && !warmedTriviaQuota.isAdminBypass && warmedTriviaQuota.questionsRemaining <= 0);
          setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(warmedTriviaQuota?.windowSecondsRemaining ?? 0)) : 0);
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
      await Promise.allSettled([loadChallengeCampaigns(), loadHomeBadges()]);
    })();
    warmupPromiseRef.current = p;
    return p;
  }, [loadChallengeCampaigns, loadHomeBadges]);

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
      if (!bootstrapSnapshotRef.current) {
        // Validate credentials from local storage/cookie only — no blocking network call.
        // A network timeout returning null was being treated as "invalid session" and
        // wiping auth for users who had a perfectly valid cookie.
        const localUserId = (getUserId() ?? "").trim();
        const localVenueId = (getVenueId() ?? "").trim();
        if (!localUserId || !localVenueId || localVenueId !== venue.id || !hasUserTokenInCookie()) {
          if (!cancelled) router.replace(`/?v=${encodeURIComponent(venue.id)}`);
          return;
        }
        const coreLoadPromise = Promise.allSettled([loadTriviaQuota(), loadHomeBadges()]);
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
  }, [arrivalInProgress, hasUserTokenInCookie, loadHomeBadges, loadTriviaQuota, router, runWarmup, venue.id]);

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
      router.replace(`/?v=${encodeURIComponent(venue.id)}`);
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
    if (triviaUnlockSeconds <= 0) return;
    const timer = window.setTimeout(() => setTriviaUnlockSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [triviaUnlockSeconds]);

  useEffect(() => {
    if (!triviaGateNotice) return;
    const timer = window.setTimeout(() => setTriviaGateNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [triviaGateNotice]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    const userId = (getUserId() ?? "").trim();
    if (!userId) return;
    const interval = window.setInterval(() => void loadHomeBadges({ silent: true }), 20000);
    return () => window.clearInterval(interval);
  }, [homeRevealComplete, loadHomeBadges]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    void loadChallengeCampaigns();
    const interval = window.setInterval(() => void loadChallengeCampaigns({ silent: true }), 30000);
    return () => window.clearInterval(interval);
  }, [homeRevealComplete, loadChallengeCampaigns]);


  useEffect(() => {
    if (!homeRevealComplete) return;
    router.prefetch("/trivia");
    router.prefetch("/predictions");
    router.prefetch("/pickem");
    router.prefetch("/bingo");
    router.prefetch("/fantasy");
    router.prefetch("/pending-challenges");
    router.prefetch("/active-games");
    router.prefetch("/redeem-prizes");
    router.prefetch("/activity");
    if (!warmupStartedRef.current && !bootstrapSnapshotRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [homeRevealComplete, runWarmup, router]);

  const goTo = useCallback(
    async (dest: VenueGameKey, sourceElement: HTMLElement | null) => {
      const destination = VENUE_GAME_CARD_BY_KEY[dest];
      if (!destination) return;
      triggerPulse();
      if (dest === "trivia") {
        // Only block navigation when trivia is already known to be locked.
        // If quota is null (not yet loaded), navigate immediately — the trivia page
        // enforces limits itself. Awaiting a network call here caused the UI to freeze
        // for up to 4.5 s and opened a window where the arrival pipeline could clear
        // the session and bounce the user to login.
        const knownLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
        if (knownLocked) {
          const latestQuota = await loadTriviaQuota();
          const stillLocked = Boolean(latestQuota && !latestQuota.isAdminBypass && latestQuota.questionsRemaining <= 0);
          if (stillLocked) {
            const unlockIn = Math.max(0, Math.floor(latestQuota?.windowSecondsRemaining ?? triviaUnlockSeconds));
            setTriviaUnlockSeconds(unlockIn);
            setTriviaGateNotice(unlockIn > 0 ? `Trivia is locked for now. Try again in ${formatCountdown(unlockIn)}.` : "Trivia is locked for now. Please try again soon.");
            return;
          }
          // Quota has reset — fall through and navigate
        }
      }
      setTriviaGateNotice("");
      setPendingDestination(dest);
      try {
        await runVenueGameOpenTransition({
          gameKey: dest,
          sourceElement,
          targetPath: destination.path,
          navigate: () => router.push(destination.path),
        });
      } catch {
        setPendingDestination(null);
      }
    },
  [loadTriviaQuota, router, triviaUnlockSeconds, triviaQuota]
  );

  const homeCards = useMemo(() => VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]), []);
  const leaderboardInitialEntries = leaderboardBootstrapEntries.length > 0 ? leaderboardBootstrapEntries : initialEntries;
  const triviaIsLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
  const triviaUnlockCountdown = triviaUnlockSeconds > 0 ? triviaUnlockSeconds : triviaIsLocked ? Math.max(0, Math.floor(triviaQuota?.windowSecondsRemaining ?? 0)) : 0;

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

  const showFastPathSkeleton = arrivalInProgress && !arrivalCoreReady;
  const contentReady = !arrivalInProgress && homeRevealComplete && carouselBootstrapped;

  return (
    <div
      className="relative z-[60] flex flex-col isolation-isolate"
    >
      <section className="relative shrink-0 px-2 pb-3">
        <div className="relative min-h-[7.2rem] overflow-hidden rounded-[1.4rem] border-[2px] border-[#cbd5e1]/70 bg-[linear-gradient(172deg,#2f241d_0%,#2a1f19_45%,#211712_100%)] p-[18px] shadow-[0_8px_0_rgba(15,23,42,0.28),0_12px_24px_rgba(15,23,42,0.26)]">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(14deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_2px,rgba(255,255,255,0)_2px,rgba(255,255,255,0)_9px)]" />
          <div className="pointer-events-none absolute inset-[7px] rounded-[1rem] border border-[#94a3b8]/30" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[clamp(1.6rem,7.2vw,3.45rem)] font-black leading-[0.96] text-cyan-200 [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_0_10px_rgba(34,211,238,0.5),0_0_24px_rgba(34,211,238,0.35),0_2px_0_rgba(8,47,73,0.9)]">
                {venueDisplayName}
              </h2>
            </div>
            <button
              onMouseDown={triggerPulse}
              onClick={leaveVenue}
              className="tp-clean-button inline-flex items-center justify-center rounded-md border-[2px] border-white bg-[linear-gradient(180deg,#dc2626_0%,#b91c1c_100%)] px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-white shadow-[0_0_0_1px_rgba(127,29,29,0.7)_inset,0_3px_0_rgba(127,29,29,0.9),0_10px_18px_rgba(15,23,42,0.35)] transition hover:brightness-110 active:translate-y-[1px]"
              aria-label="Exit venue"
            >
              <span className="leading-none">Exit</span>
            </button>
          </div>
        </div>

        <div className="relative z-40 mt-4 flex items-center justify-center gap-2">
          <button type="button" onClick={() => goToScreen(0)} className={`tp-clean-button min-w-[6.9rem] rounded-full px-4 py-2 text-base font-bold text-center ${activeScreen === 0 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"}`} aria-current={activeScreen === 0 ? "page" : undefined}>Games</button>
          <button type="button" onClick={() => goToScreen(1)} className={`tp-clean-button min-w-[6.9rem] rounded-full px-4 py-2 text-base font-bold text-center ${activeScreen === 1 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"}`} aria-current={activeScreen === 1 ? "page" : undefined}>Leaderboard</button>
          <button type="button" onClick={() => goToScreen(2)} className={`tp-clean-button min-w-[6.9rem] rounded-full px-4 py-2 text-base font-bold text-center ${activeScreen === 2 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"}`} aria-current={activeScreen === 2 ? "page" : undefined}>Challenges</button>
        </div>
      </section>

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
        <section className="venue-screen relative m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
            <div className={`venue-home-panel-content venue-home-games-fit w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-3 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.3)_0%,rgba(14,165,233,0)_36%),radial-gradient(circle_at_84%_22%,rgba(251,146,60,0.35)_0%,rgba(251,146,60,0)_35%),radial-gradient(circle_at_52%_84%,rgba(236,72,153,0.3)_0%,rgba(236,72,153,0)_43%)]" />
            {showFastPathSkeleton ? (
              <div className="mx-auto mb-2 w-full max-w-[24rem] rounded-2xl border border-cyan-200/80 bg-cyan-50/85 px-3 py-2 text-center text-xs font-semibold text-cyan-900">
                <p>{arrivalStatusText}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-cyan-800/90">
                  {arrivalStage} · {Math.round(arrivalProgress)}%
                </p>
              </div>
            ) : null}
            <div className="relative mx-auto min-h-0 w-full max-w-[24rem] flex-1 pt-1 sm:max-w-md">
              <div className="grid w-full grid-cols-2 gap-[clamp(0.55rem,2.4vw,1rem)] pb-2">
                {homeCards.map((card) => {
                  const isOpening = pendingDestination === card.key;
                  const badge = visibleBadgeByGame.get(card.key);
                  const titleLines = GAME_TITLE_LINES_BY_KEY[card.key];
                  return (
                    <button key={card.key} type="button" onMouseDown={triggerPulse} onClick={(event) => { void goTo(card.key, event.currentTarget); }} disabled={pendingDestination !== null} data-venue-game-card={card.key} className={`tp-clean-button tp-game-card-btn group relative aspect-square w-full max-w-[clamp(8.2rem,40vw,11.5rem)] justify-self-center overflow-hidden !rounded-[22%] !border-[2px] !border-white/90 !shadow-[0_10px_20px_rgba(15,23,42,0.35)] p-0 text-left${isOpening ? " is-opening" : ""}`}>
                      <div className={`absolute inset-0 ${GAME_ICON_BG_BY_KEY[card.key]}`} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.1)_40%,rgba(255,255,255,0)_72%)]" />
                      <div className="relative flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/65 bg-white/20 shadow-[0_3px_10px_rgba(2,6,23,0.35)]"><GameGlyph gameKey={card.key} /></span>
                        <span className="text-[clamp(1.7rem,6.9vw,2.5rem)] font-black leading-[0.8] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive] [text-shadow:0_2px_0_rgba(15,23,42,0.58),0_4px_10px_rgba(2,6,23,0.45)]">
                          {titleLines.map((line) => <span key={`${card.key}-${line}`} className="block">{line}</span>)}
                        </span>
                      </div>
                      {badge ? <span className="absolute right-1.5 top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.45)]">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {triviaUnlockCountdown > 0 ? <div className="mx-auto mt-2 max-w-[22rem] rounded-full border border-amber-200/80 bg-amber-100/95 px-3 py-1.5 text-center text-[11px] font-black tracking-[0.08em] text-amber-900">Trivia unlocks in {formatCountdown(triviaUnlockCountdown)}</div> : null}
            {triviaGateNotice ? <div className="mx-auto mt-2 max-w-[22rem] rounded-xl border border-rose-200/80 bg-rose-100/95 px-3 py-2 text-center text-xs font-semibold text-rose-900">{triviaGateNotice}</div> : null}
            {isBadgeLoading ? <div className="mx-auto mt-2 max-w-[22rem] rounded-full border border-slate-200/80 bg-slate-50/90 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-700">Loading activity badges...</div> : null}
            {badgeError ? (
              <button
                type="button"
                onClick={() => void loadHomeBadges()}
                className="mx-auto mt-2 block max-w-[22rem] rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-800"
              >
                {badgeError} Tap to retry
              </button>
            ) : null}
            </div>
        </section>

        <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
            <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-8 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            <div className="mx-auto w-full max-w-[26rem] space-y-3">
              <div className="rounded-[1.6rem] border-[3px] border-[#3b2412] bg-[#4a2e18] p-3 shadow-[0_8px_0_rgba(15,23,42,0.3)]">
                <div className="inline-flex rounded-xl border-2 border-[#3b2412] bg-[#1f5136] px-3 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.25)]">
                  <h3 className="text-2xl font-semibold text-[#ecf8f1] [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">Leaderboard</h3>
                </div>
                <div className="mt-3">
                  <LeaderboardTable
                    venueId={venue.id}
                    initialEntries={leaderboardInitialEntries}
                    isEnabled={homeRevealComplete}
                  />
                </div>
              </div>
            </div>
            </div>
        </section>

        <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
            <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-3 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            <div className="mx-auto w-full max-w-[26rem] space-y-3">
              <div className="rounded-[1.6rem] border-[3px] border-[#3b2412] bg-[#4a2e18] p-3 shadow-[0_8px_0_rgba(15,23,42,0.3)]">
                <div className="inline-flex rounded-xl border-2 border-[#3b2412] bg-[#1f5136] px-3 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.25)]">
                  <h3 className="text-2xl font-semibold text-[#ecf8f1] [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">Challenges</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {isChallengesLoading ? (
                    <div className="space-y-2 rounded-[1.2rem] border-[3px] border-[#0f172a]/80 bg-[linear-gradient(146deg,#0f766e_0%,#06b6d4_50%,#22d3ee_100%)] p-3 shadow-[0_8px_0_rgba(15,23,42,0.35)]">
                      <div className="h-4 w-32 animate-pulse rounded bg-white/40" />
                      <div className="h-3 w-full animate-pulse rounded bg-white/25" />
                    </div>
                  ) : null}

                  {!isChallengesLoading && challengeCards.length === 0 ? (
                    <div className="rounded-[1.2rem] border-[3px] border-[#0f172a]/70 bg-[#0f172a]/50 p-3 text-center text-sm font-semibold text-cyan-50">
                      No active challenges for this venue yet.
                    </div>
                  ) : null}

                  {challengeCards.map((challenge) => {
                    const progress = Math.max(0, Number(challenge.progressPoints ?? 0));
                    const target = Math.max(1, Number(challenge.pointsRequiredToWin ?? 1));
                    const percent = Math.min(100, Math.round((progress / target) * 100));
                    const isWon = Boolean(challenge.winnerUserId);
                    return (
                      <button
                        key={challenge.id}
                        type="button"
                        onClick={() => setSelectedChallengeId(challenge.id)}
                        className="tp-clean-button relative flex w-full items-center gap-3 overflow-hidden rounded-[1.2rem] border-[3px] border-[#0f172a]/80 bg-[linear-gradient(146deg,#0f766e_0%,#06b6d4_50%,#22d3ee_100%)] p-3 text-left shadow-[0_8px_0_rgba(15,23,42,0.35)]"
                      >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(254,240,138,0.35)_0%,rgba(254,240,138,0)_34%)]" />
                        <div className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/25 shadow-[0_2px_8px_rgba(2,6,23,0.35)]">
                          {challenge.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={challenge.imageUrl} alt={challenge.name} className="h-full w-full object-cover" />
                          ) : (
                            <TrophyGlyph className="h-10 w-10 scale-[3.6]" />
                          )}
                        </div>
                        <div className="relative min-w-0 flex-1">
                          <div className="truncate text-sm font-black uppercase tracking-[0.08em] text-cyan-50">{challenge.name}</div>
                          {isWon ? (
                            <div className="mt-1 text-xs font-black text-amber-100">
                              {challenge.winnerUsername ? `${challenge.winnerUsername} has won this challenge.` : "A winner has been declared."}
                            </div>
                          ) : (
                            <>
                              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-950/35">
                                <div className="h-full rounded-full bg-amber-300 transition-all duration-300" style={{ width: `${percent}%` }} />
                              </div>
                              <div className="mt-1 text-[11px] font-semibold text-cyan-50/95">
                                {progress} / {target} points
                              </div>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {challengesError ? (
                    <button
                      type="button"
                      onClick={() => void loadChallengeCampaigns()}
                      className="rounded-md border border-cyan-100/80 bg-cyan-50/20 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-50"
                    >
                      {challengesError} Tap to retry
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            </div>
        </section>
        </div>
      </div>

      <AnimatePresence>
        {selectedChallenge ? (
          <motion.div
            className="fixed inset-0 z-[990] flex items-end justify-center bg-black/45 px-3 pb-4 pt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedChallengeId(null)}
          >
            <motion.div
              className="relative w-full max-w-[28rem] rounded-[1.4rem] border-[2px] border-slate-900/20 bg-[#fff7ea] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.45)]"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="tp-clean-button absolute right-3 top-3 inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
                onClick={() => setSelectedChallengeId(null)}
                aria-label="Close challenge rules"
              >
                Close
              </button>
              <h4 className="pr-16 text-lg font-black text-slate-900">{selectedChallenge.name}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">{selectedChallenge.rules}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const VenueHubClient = React.memo(VenueHubClientInner);
VenueHubClient.displayName = "VenueHubClient";
