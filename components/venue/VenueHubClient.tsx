"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Venue, LeaderboardEntry } from "@/types";
import { getUserId, getVenueId, clearVenueSession } from "@/lib/storage";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
import {
  consumeVenueHomeBootstrap,
  consumeVenueHomeEntryHandoff,
  type HomeBadgeCounts,
  type TriviaQuotaSnapshot,
} from "@/lib/venueHomeBootstrap";
import { VENUE_GAME_CARD_BY_KEY, VENUE_HOME_GAME_KEYS, type VenueGameKey } from "@/lib/venueGameCards";
import { runVenueGameOpenTransition } from "@/lib/venueGameTransition";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

type BingoBadgePayload = {
  ok: boolean;
  cards?: Array<{ status?: string }>;
};

type PickEmBadgePayload = {
  ok: boolean;
  picks?: Array<{ status?: string }>;
};

type ChallengesBadgePayload = {
  ok: boolean;
  challenges?: Array<{
    status?: string;
    receiverUserId?: string;
  }>;
};

type HomeScreenIndex = 0 | 1;

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

const SWIPE_SCREEN_COUNT = 2;
const SWIPE_TRIGGER_PX = 10;
const SWIPE_FLICK_TRIGGER_PX = 8;
const SWIPE_FLICK_MAX_DURATION_MS = 220;
const SWIPE_DIRECTION_RATIO = 0.45;

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

function pathMatches(expectedPath: string, candidatePath: string): boolean {
  if (!expectedPath) {
    return true;
  }
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`);
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
  const initialUserId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return (getUserId() ?? "").trim();
  }, []);
  const bootstrapSnapshotRef = useRef(
    initialUserId
      ? consumeVenueHomeBootstrap({
          venueId: venue.id,
          userId: initialUserId,
        })
      : null
  );
  const bootstrapSnapshot = bootstrapSnapshotRef.current;
  const entryHandoffVisibleOnMount = useMemo(() => {
    if (!initialUserId) {
      return false;
    }
    return consumeVenueHomeEntryHandoff({
      venueId: venue.id,
      userId: initialUserId,
    });
  }, [initialUserId, venue.id]);
  const [pendingDestination, setPendingDestination] = useState<VenueGameKey | null>(null);
  const [triviaQuota, setTriviaQuota] = useState<TriviaQuotaSnapshot | null>(bootstrapSnapshot?.triviaQuota ?? null);
  const [triviaUnlockSeconds, setTriviaUnlockSeconds] = useState(() => {
    const quota = bootstrapSnapshot?.triviaQuota ?? null;
    const isLocked = Boolean(quota && !quota.isAdminBypass && quota.questionsRemaining <= 0);
    return isLocked ? Math.max(0, Math.floor(quota?.windowSecondsRemaining ?? 0)) : 0;
  });
  const [triviaGateNotice, setTriviaGateNotice] = useState("");
  const [homeBadgeCounts, setHomeBadgeCounts] = useState<HomeBadgeCounts>(bootstrapSnapshot?.homeBadgeCounts ?? {});
  const [dismissedBadgeGames, setDismissedBadgeGames] = useState<Set<VenueGameKey>>(new Set());
  const [weeklyPrizeTitle, setWeeklyPrizeTitle] = useState(
    bootstrapSnapshot?.weeklyPrizeTitle ?? "Weekly Venue Champion Prize"
  );
  const [weeklyPrizeDescription, setWeeklyPrizeDescription] = useState(
    bootstrapSnapshot?.weeklyPrizeDescription ?? "Top the leaderboard by week end to earn this venue's reward."
  );
  const [weeklyPrizePoints, setWeeklyPrizePoints] = useState(bootstrapSnapshot?.weeklyPrizePoints ?? 0);
  const [activeScreen, setActiveScreen] = useState<HomeScreenIndex>(0);
  const [homeRevealComplete, setHomeRevealComplete] = useState(!entryHandoffVisibleOnMount);
  const venueReadyDispatchedRef = useRef(false);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartAtRef = useRef<number | null>(null);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);

  useEffect(() => {
    const storedUserId = getUserId() ?? "";
    const storedVenueId = getVenueId() ?? "";
    if (!storedUserId) return void router.replace(`/?v=${venue.id}`);
    if (storedVenueId !== venue.id) router.replace(`/?v=${venue.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const venueDisplayName = getVenueDisplayName(venue as any);

  useEffect(() => {
    if (!entryHandoffVisibleOnMount || typeof window === "undefined") {
      setHomeRevealComplete(true);
      return;
    }
    const expectedPath = window.location.pathname;
    const onOverlayHidden = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string } | undefined>).detail;
      const hiddenPath = String(detail?.path ?? "").trim();
      if (!pathMatches(expectedPath, hiddenPath)) {
        return;
      }
      setHomeRevealComplete(true);
    };
    window.addEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
    const fallbackTimer = window.setTimeout(() => {
      setHomeRevealComplete(true);
    }, 1800);

    return () => {
      window.removeEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
      window.clearTimeout(fallbackTimer);
    };
  }, [entryHandoffVisibleOnMount]);

  useEffect(() => {
    if (venueReadyDispatchedRef.current || typeof window === "undefined") {
      return;
    }
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
  }, []);

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
    if (!viewport) {
      return;
    }
    const nextIndex = clamp(screenIndex, 0, SWIPE_SCREEN_COUNT - 1);
    viewport.scrollTo({
      left: viewport.clientWidth * nextIndex,
      behavior: "smooth",
    });
  }, []);

  const onSwipeTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartXRef.current = touch?.clientX ?? null;
    touchStartYRef.current = touch?.clientY ?? null;
    touchStartAtRef.current = Date.now();
  }, []);

  const onSwipeTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const startX = touchStartXRef.current;
      const startY = touchStartYRef.current;
      const startedAt = touchStartAtRef.current;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      touchStartAtRef.current = null;
      if (startX === null || startY === null) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsedMs = startedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, Date.now() - startedAt);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isQuickFlick = elapsedMs <= SWIPE_FLICK_MAX_DURATION_MS && absDx >= SWIPE_FLICK_TRIGGER_PX;
      const passesDirectionalRatio = absDx >= absDy * SWIPE_DIRECTION_RATIO;
      if ((!isQuickFlick && absDx < SWIPE_TRIGGER_PX) || (!isQuickFlick && !passesDirectionalRatio)) return;

      if (dx < 0 && activeScreen === 0) {
        goToScreen(1);
        return;
      }
      if (dx > 0 && activeScreen === 1) {
        goToScreen(0);
      }
    },
    [activeScreen, goToScreen]
  );

  const loadTriviaQuota = useCallback(async (): Promise<TriviaQuotaSnapshot | null> => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setTriviaQuota(null);
      setTriviaUnlockSeconds(0);
      return null;
    }
    try {
      const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; quota?: TriviaQuotaSnapshot | null };
      if (!payload.ok) return null;
      const nextQuota = payload.quota ?? null;
      setTriviaQuota(nextQuota);
      const isLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      return nextQuota;
    } catch {
      return null;
    }
  }, []);

  const loadHomeBadges = useCallback(async () => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setHomeBadgeCounts({});
      return;
    }
    try {
      const [bingoResponse, pickEmResponse, challengesResponse] = await Promise.all([
        fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, { cache: "no-store" }),
        fetch(`/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=200`, { cache: "no-store" }),
        fetch(`/api/challenges?userId=${encodeURIComponent(userId)}&includeResolved=true`, { cache: "no-store" }),
      ]);
      const [bingoPayload, pickEmPayload, challengesPayload] = (await Promise.all([
        bingoResponse.json(),
        pickEmResponse.json(),
        challengesResponse.json(),
      ])) as [BingoBadgePayload, PickEmBadgePayload, ChallengesBadgePayload];
      if (!bingoPayload.ok || !pickEmPayload.ok || !challengesPayload.ok) return;
      const activeBingoCount = (bingoPayload.cards ?? []).filter((card) => card.status === "active").length;
      const pendingPickEmCount = (pickEmPayload.picks ?? []).filter((pick) => pick.status === "pending").length;
      const pendingFantasyCount = (challengesPayload.challenges ?? []).filter(
        (challenge) => challenge.status === "pending" && challenge.receiverUserId === userId
      ).length;
      setHomeBadgeCounts({ bingo: activeBingoCount, pickem: pendingPickEmCount, fantasy: pendingFantasyCount });
    } catch {}
  }, []);

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) return warmupPromiseRef.current;
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) return;
    const p = (async () => {
      let warmedTriviaQuota: TriviaQuotaSnapshot | null = null;
      try {
        const [tRes, tQuotaRes] = await Promise.all([
          fetch(`/api/trivia?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
          fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
        ]);
        const body = await tRes.json().catch(() => null);
        const quotaBody = (await tQuotaRes.json().catch(() => null)) as { ok?: boolean; quota?: TriviaQuotaSnapshot | null } | null;
        if (quotaBody?.ok) {
          warmedTriviaQuota = quotaBody.quota ?? null;
          setTriviaQuota(warmedTriviaQuota);
          const isLocked = Boolean(warmedTriviaQuota && !warmedTriviaQuota.isAdminBypass && warmedTriviaQuota.questionsRemaining <= 0);
          setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(warmedTriviaQuota?.windowSecondsRemaining ?? 0)) : 0);
        }
        if (body?.ok && Array.isArray(body.questions)) {
          try {
            writeWarmTriviaCache({ userId, venueId, questions: body.questions, quota: warmedTriviaQuota });
          } catch {}
        }
      } catch {}
      try {
        const pr = await fetch("/api/predictions?page=1&pageSize=24&excludeSensitive=false", { cache: "no-store" });
        const pb = await pr.json().catch(() => null);
        if (pb?.ok) {
          try {
            writeWarmPredictionsCache({ venueId, payload: pb });
          } catch {}
        }
      } catch {}
      try {
        await fetch("/api/pickem/sports", { cache: "no-store" });
      } catch {}
      try {
        const prizeRes = await fetch(`/api/prizes?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
        const prizeBody = await prizeRes.json().catch(() => null);
        if (prizeBody?.ok && prizeBody.weeklyPrize) {
          setWeeklyPrizeTitle(String(prizeBody.weeklyPrize.prizeTitle ?? "Weekly Venue Champion Prize"));
          setWeeklyPrizeDescription(String(prizeBody.weeklyPrize.prizeDescription ?? "Top the leaderboard by week end to earn this venue's reward."));
          setWeeklyPrizePoints(Math.max(0, Number(prizeBody.weeklyPrize.rewardPoints ?? 0)));
        }
      } catch {}
      await loadHomeBadges();
    })();
    warmupPromiseRef.current = p;
    return p;
  }, [loadHomeBadges]);

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
    const interval = window.setInterval(() => void loadHomeBadges(), 20000);
    return () => window.clearInterval(interval);
  }, [homeRevealComplete, loadHomeBadges]);

  useEffect(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport || typeof window === "undefined") return;
    let rafId: number | null = null;
    const measureActiveScreen = () => {
      const width = Math.max(1, viewport.clientWidth);
      const rawIndex = viewport.scrollLeft / width;
      const next = clamp(Math.round(rawIndex), 0, SWIPE_SCREEN_COUNT - 1) as HomeScreenIndex;
      setActiveScreen(next);
    };
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measureActiveScreen();
      });
    };
    const onResize = () => {
      const nextLeft = viewport.clientWidth * activeScreen;
      viewport.scrollTo({ left: nextLeft });
      measureActiveScreen();
    };
    measureActiveScreen();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [activeScreen]);

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
        const latestQuota = await loadTriviaQuota();
        const triviaLocked = Boolean(latestQuota && !latestQuota.isAdminBypass && latestQuota.questionsRemaining <= 0);
        if (triviaLocked) {
          const unlockIn = Math.max(0, Math.floor(latestQuota?.windowSecondsRemaining ?? triviaUnlockSeconds));
          setTriviaUnlockSeconds(unlockIn);
          setTriviaGateNotice(unlockIn > 0 ? `Trivia is locked for now. Try again in ${formatCountdown(unlockIn)}.` : "Trivia is locked for now. Please try again soon.");
          return;
        }
      }
      setTriviaGateNotice("");
      setDismissedBadgeGames((previous) => {
        if (previous.has(dest)) return previous;
        const next = new Set(previous);
        next.add(dest);
        return next;
      });
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
    [loadTriviaQuota, router, triviaUnlockSeconds]
  );

  const homeCards = useMemo(() => VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]), []);
  const leaderboardInitialEntries =
    bootstrapSnapshot?.leaderboardEntries && bootstrapSnapshot.leaderboardEntries.length > 0
      ? bootstrapSnapshot.leaderboardEntries
      : initialEntries;
  const triviaIsLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
  const triviaUnlockCountdown = triviaUnlockSeconds > 0 ? triviaUnlockSeconds : triviaIsLocked ? Math.max(0, Math.floor(triviaQuota?.windowSecondsRemaining ?? 0)) : 0;

  const visibleBadgeByGame = useMemo(() => {
    const badges = new Map<VenueGameKey, string>();
    if (triviaUnlockCountdown > 0) badges.set("trivia", "!");
    for (const [gameKey, count] of Object.entries(homeBadgeCounts) as Array<[VenueGameKey, number | undefined]>) {
      if (!count || count <= 0) continue;
      badges.set(gameKey, formatBadgeCount(count));
    }
    for (const dismissedGame of dismissedBadgeGames) badges.delete(dismissedGame);
    return badges;
  }, [dismissedBadgeGames, homeBadgeCounts, triviaUnlockCountdown]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="relative shrink-0 px-2 pb-3">
        <div className="relative min-h-[7.2rem] overflow-hidden rounded-[1.4rem] border-[2px] border-[#cbd5e1]/70 bg-[linear-gradient(172deg,#2f241d_0%,#2a1f19_45%,#211712_100%)] p-[18px] shadow-[0_8px_0_rgba(15,23,42,0.28),0_12px_24px_rgba(15,23,42,0.26)]">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(14deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_2px,rgba(255,255,255,0)_2px,rgba(255,255,255,0)_9px)]" />
          <div className="pointer-events-none absolute inset-[7px] rounded-[1rem] border border-[#94a3b8]/30" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[clamp(2.25rem,8.6vw,3.45rem)] font-black leading-[0.96] text-cyan-200 [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_0_10px_rgba(34,211,238,0.5),0_0_24px_rgba(34,211,238,0.35),0_2px_0_rgba(8,47,73,0.9)]">
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

        <div className="relative z-20 mt-4 flex items-center justify-center gap-2">
          <button type="button" onClick={() => goToScreen(0)} className={`tp-clean-button rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${activeScreen === 0 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"}`} aria-pressed={activeScreen === 0}>Games</button>
          <button type="button" onClick={() => goToScreen(1)} className={`tp-clean-button rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${activeScreen === 1 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"}`} aria-pressed={activeScreen === 1}>Leaderboard</button>
        </div>
      </section>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={swipeViewportRef} onTouchStart={onSwipeTouchStart} onTouchEnd={onSwipeTouchEnd} className="flex h-full w-full touch-pan-y snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Venue home screens">
          <section className="relative h-full w-full shrink-0 snap-start overflow-y-auto px-3 pb-3 pt-1">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.3)_0%,rgba(14,165,233,0)_36%),radial-gradient(circle_at_84%_22%,rgba(251,146,60,0.35)_0%,rgba(251,146,60,0)_35%),radial-gradient(circle_at_52%_84%,rgba(236,72,153,0.3)_0%,rgba(236,72,153,0)_43%)]" />
            <div className="relative mx-auto w-full max-w-[24rem] pt-1">
              <div className="grid w-full grid-cols-2 gap-3 pb-2 sm:gap-4">
                {homeCards.map((card) => {
                  const isOpening = pendingDestination === card.key;
                  const badge = visibleBadgeByGame.get(card.key);
                  const titleLines = GAME_TITLE_LINES_BY_KEY[card.key];
                  return (
                    <button key={card.key} type="button" onMouseDown={triggerPulse} onClick={(event) => { void goTo(card.key, event.currentTarget); }} disabled={pendingDestination !== null} data-venue-game-card={card.key} className={`tp-clean-button tp-game-card-btn group relative aspect-square w-full overflow-hidden !rounded-[22%] !border-[2px] !border-white/90 !shadow-[0_10px_20px_rgba(15,23,42,0.35)] p-0 text-left${isOpening ? " is-opening" : ""}`}>
                      <div className={`absolute inset-0 ${GAME_ICON_BG_BY_KEY[card.key]}`} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.1)_40%,rgba(255,255,255,0)_72%)]" />
                      <div className="relative flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/65 bg-white/20 shadow-[0_3px_10px_rgba(2,6,23,0.35)]"><GameGlyph gameKey={card.key} /></span>
                        <span className="text-[clamp(2.16rem,8vw,2.76rem)] font-black leading-[0.8] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive] [text-shadow:0_2px_0_rgba(15,23,42,0.58),0_4px_10px_rgba(2,6,23,0.45)]">
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
          </section>

          <section className="h-full w-full shrink-0 snap-start overflow-y-auto px-3 pb-3 pt-1">
            <div className="mx-auto w-full max-w-[26rem] space-y-3">
              <div className="relative overflow-hidden rounded-[1.4rem] border-[3px] border-[#0f172a]/80 bg-[linear-gradient(146deg,#0f766e_0%,#06b6d4_50%,#22d3ee_100%)] p-3 shadow-[0_8px_0_rgba(15,23,42,0.35)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(254,240,138,0.35)_0%,rgba(254,240,138,0)_34%)]" />
                <div className="relative flex items-start gap-2">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/25 shadow-[0_2px_8px_rgba(2,6,23,0.35)]"><TrophyGlyph className="h-10 w-10 scale-[4]" /></div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-50">This Week&apos;s Prize</div>
                    <div className="text-base font-black leading-tight text-white">{weeklyPrizeTitle}</div>
                    <div className="text-xs text-cyan-50/95">{weeklyPrizeDescription}</div>
                    {weeklyPrizePoints > 0 ? <div className="mt-1 text-xs font-black text-amber-100">Bonus reward: +{weeklyPrizePoints} points</div> : null}
                  </div>
                </div>
              </div>
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
          </section>
        </div>
      </div>
    </div>
  );
}

export const VenueHubClient = React.memo(VenueHubClientInner);
VenueHubClient.displayName = "VenueHubClient";
