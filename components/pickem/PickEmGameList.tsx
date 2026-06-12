"use client";
import { cachedFetch } from "@/lib/fetchCache";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { getUserId, getVenueId } from "@/lib/storage";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { CoinFXCanvas } from "@/components/ui/CoinFXCanvas";
import { PickEmCollectAnimation } from "@/components/animations/PickEmCollectAnimation";
import type { AdSlot } from "@/types";

type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "nfl" | "mma" | "tennis";

type PickEmSport = {
  slug: PickEmSportSlug;
  label: string;
  subtitle: string;
  isInSeason: boolean;
  isClickable: boolean;
};

type PickEmGame = {
  id: string;
  sportSlug: PickEmSportSlug;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  periodLabel?: string | null;
  userPickId?: string;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push" | "canceled";
  userPickRewardPoints?: number;
  userPickRewardClaimedAt?: string | null;
};

type SportsResponse = {
  ok: boolean;
  sports?: PickEmSport[];
  error?: string;
};

type GamesResponse = {
  ok: boolean;
  sport?: PickEmSport;
  date?: string;
  games?: PickEmGame[];
  pointsBank?: {
    localDate: string;
    totalPicks: number;
    settledPicks: number;
    pendingPicks: number;
    correctPicks: number;
    incorrectPicks: number;
    unclaimedCorrectPicks: number;
    pendingPoints: number;
    multiplierEligible: boolean;
    multiplierIfSettledNow: 1 | 2 | 3;
    collectedPointsToday: number;
  };
  weekOptions?: Array<{ label: string; value: string }>;
  selectedWeekStartDate?: string;
  debug?: {
    probes?: Array<{
      sportKey: string;
      path: string;
      url: string;
      statusCode: number;
      bodyPreview: string;
    }>;
  };
  error?: string;
};

type PickEmPickHistoryItem = {
  id: string;
  venueId: string;
  sportSlug: PickEmSportSlug;
  league: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  selectedTeam: string;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  rewardPoints: number;
  rewardClaimedAt?: string | null;
};

type SummaryPayload = {
  ok: boolean;
  profile?: {
    username: string;
    points: number;
    venueId: string;
  } | null;
};

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const preview = raw.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(`${label} returned non-JSON (HTTP ${response.status}): ${preview || "<empty>"}`);
  }
}

const SPORT_ICONS: Record<string, string> = {
  nba: "🏀",
  mlb: "⚾",
  soccer: "⚽",
  nfl: "🏈",
  nhl: "🏒",
  mma: "🥊",
  tennis: "🎾",
};
const PICKEM_PICK_LIMIT = 10;
const PICKEM_INLINE_SLOTS: Record<number, AdSlot> = {
  1: "pickem-inline-cards-1-5",
  2: "pickem-inline-cards-6-10",
  3: "pickem-inline-cards-11-15",
  4: "pickem-inline-cards-16-20",
  5: "pickem-inline-cards-21-25",
  6: "pickem-inline-cards-26-30",
};

function GoldCoinIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`${className} drop-shadow-[0_2px_2px_rgba(106,64,0,0.45)]`}>
      <defs>
        <linearGradient id="tp-pickem-coin-rim-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff5bf" />
          <stop offset="28%" stopColor="#ffd769" />
          <stop offset="62%" stopColor="#f2b437" />
          <stop offset="100%" stopColor="#b67612" />
        </linearGradient>
        <linearGradient id="tp-pickem-coin-core-gradient" x1="10%" y1="8%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="#fff9d8" />
          <stop offset="44%" stopColor="#ffdc73" />
          <stop offset="100%" stopColor="#d98b12" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="17" ry="4.8" fill="rgba(74,40,0,0.24)" />
      <circle cx="32" cy="32" r="24.5" fill="url(#tp-pickem-coin-rim-gradient)" stroke="#774600" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="17.5" fill="url(#tp-pickem-coin-core-gradient)" stroke="#8a5200" strokeWidth="1.9" />
      <ellipse cx="26.5" cy="22.5" rx="9.6" ry="5.5" fill="rgba(255,255,255,0.46)" />
      <path d="M23 35h18" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 28h10" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 42h10" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function getSportIcon(slug: string): string {
  return SPORT_ICONS[slug] ?? "🏟️";
}

function formatLocalStartTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getGameStatusLabel(game: PickEmGame): string {
  if (game.status === "live") {
    return game.periodLabel?.trim() || "Live";
  }
  if (game.status === "final") {
    return "Final";
  }
  return formatLocalStartTime(game.startsAt);
}

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parsed = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return dateKey;
  }
  return new Date(parsed + deltaDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isValidPastOrTodayDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value <= getLocalDateKey();
}

function resultLabel(game: PickEmGame): string {
  if (!game.userPickStatus || game.userPickStatus === "pending") {
    return "";
  }
  if (game.userPickStatus === "won") {
    return "Correct pick";
  }
  if (game.userPickStatus === "lost") {
    return "Incorrect pick";
  }
  if (game.userPickStatus === "push") {
    return "Push (tie game)";
  }
  return "Canceled";
}

function getDisplayedScoreCell(game: PickEmGame, teamName: string, score: number | null): string | number {
  if (game.sportSlug !== "mma") {
    return score ?? "–";
  }
  if (game.status !== "final") {
    return "";
  }
  if (!game.winnerTeam) {
    return "";
  }
  return game.winnerTeam === teamName ? "Won" : "";
}

export function PickEmGameList({ initialSportSlug = "", initialDate = "" }: { initialSportSlug?: string; initialDate?: string }) {
  const normalizedInitialSportSlug = String(initialSportSlug ?? "").trim().toLowerCase();
  const todayDateKey = getLocalDateKey();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [nflWeekStartDate, setNflWeekStartDate] = useState("");
  const [nflWeekOptions, setNflWeekOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [optimisticPickByGame, setOptimisticPickByGame] = useState<Record<string, string | undefined>>({});
  const [sports, setSports] = useState<PickEmSport[]>([]);
  const [selectedSportSlug, setSelectedSportSlug] = useState("");
  const normalizedInitialDate = String(initialDate ?? "").trim();
  const [selectedDate, setSelectedDate] = useState(
    isValidPastOrTodayDateKey(normalizedInitialDate) ? normalizedInitialDate : todayDateKey
  );
  const [sport, setSport] = useState<PickEmSport | null>(null);
  const [games, setGames] = useState<PickEmGame[]>([]);
  const latestGameMapRef = useRef<Map<string, PickEmGame>>(new Map());
  const gamesRef = useRef<PickEmGame[]>([]);
  const loadedSportSlugRef = useRef<string>("");
  const loadGamesRef = useRef<((opts?: { background?: boolean }) => Promise<void>) | null>(null);
  const hasLiveGamesRef = useRef(false);
  const inFlightGameIdsRef = useRef<Record<string, boolean>>({});
  const queuedPickByGameRef = useRef<Record<string, string>>({});
  const refreshTimerRef = useRef<number | null>(null);
  const [pickPulseByGameId, setPickPulseByGameId] = useState<Record<string, string | undefined>>({});
  const [dailyPickCount, setDailyPickCount] = useState(0);
  const [dailyPickCountDelta, setDailyPickCountDelta] = useState(0);
  const [pointsBank, setPointsBank] = useState<GamesResponse["pointsBank"] | null>(null);
  const [collectResult, setCollectResult] = useState<{
    pointsCollected: number;
    correctPicks: number;
    totalSettledPicks: number;
    multiplierApplied: 1 | 2 | 3;
  } | null>(null);
  const hasAutoCollectedRef = useRef(false);
  const [goldFlash, setGoldFlash] = useState(false);
  const [flashingSportSlug, setFlashingSportSlug] = useState("");
  const [lastDebugProbes, setLastDebugProbes] = useState<
    Array<{ sportKey: string; path: string; url: string; statusCode: number; bodyPreview: string }>
  >([]);
  const [popAnim, setPopAnim] = useState<{ count: number; shake: boolean; id: number } | null>(null);
  const [limitEchoAnim, setLimitEchoAnim] = useState<{ id: number } | null>(null);
  const [multiplierAnim, setMultiplierAnim] = useState<{ label: "Double Points!" | "Triple Points!"; id: number } | null>(null);
  const [limitPulse, setLimitPulse] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [pickHistory, setPickHistory] = useState<PickEmPickHistoryItem[]>([]);
  const [loadingPickHistory, setLoadingPickHistory] = useState(false);
  const [headerPoints, setHeaderPoints] = useState(0);
  const [headerPointsGain, setHeaderPointsGain] = useState<number | null>(null);
  const [headerPointsPulse, setHeaderPointsPulse] = useState(false);
  const headerPointsGainTimerRef = useRef<number | null>(null);
  const headerPointsPulseTimerRef = useRef<number | null>(null);
  const popIdRef = useRef(0);
  const animatedWinDatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    const fromBell = sessionStorage.getItem("tp:celebrate") === "pickem";
    const bellDelta = Number(sessionStorage.getItem("tp:celebrate:delta") ?? 0);
    if (fromBell) {
      sessionStorage.removeItem("tp:celebrate");
      sessionStorage.removeItem("tp:celebrate:delta");
      if (bellDelta > 0) {
        window.dispatchEvent(new CustomEvent("tp:coin-flight", { detail: { delta: bellDelta, coins: Math.min(36, Math.max(12, Math.round(bellDelta / 2))) } }));
        window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "pickem-celebrate", delta: bellDelta } }));
      }
    }
    const uid = getUserId() ?? "";
    if (!uid) return;
    void fetch("/api/notifications/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, game: "pickem" }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { celebrate: boolean; delta: number };
        if (!fromBell && data.celebrate && data.delta > 0) {
          window.dispatchEvent(new CustomEvent("tp:coin-flight", { detail: { delta: data.delta, coins: Math.min(36, Math.max(12, Math.round(data.delta / 2))) } }));
          window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "pickem-celebrate", delta: data.delta } }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    latestGameMapRef.current = new Map(games.map((game) => [game.id, game]));
    gamesRef.current = games;
    hasLiveGamesRef.current = games.some((g) => g.status === "live");
  }, [games]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (hasLiveGamesRef.current && loadGamesRef.current) {
        void loadGamesRef.current({ background: true });
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      if (headerPointsGainTimerRef.current !== null) {
        window.clearTimeout(headerPointsGainTimerRef.current);
      }
      if (headerPointsPulseTimerRef.current !== null) {
        window.clearTimeout(headerPointsPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!selectedSportSlug) return;
    const params = new URLSearchParams();
    params.set("date", selectedDate);
    params.set("sport", selectedSportSlug);
    router.replace(`/pickem?${params.toString()}`, { scroll: false });
  }, [selectedDate, selectedSportSlug, router]);

  useEffect(() => {
    const run = async () => {
      setLoadingSports(true);
      try {
        const response = await fetch("/api/pickem/sports", { cache: "no-store" });
        const payload = await readJsonResponse<SportsResponse>(response, "/api/pickem/sports");
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load Pick 'Em sports right now.");
        }
        const nextSports = payload.sports ?? [];
        setSports(nextSports);

        const initialMatch = nextSports.find((item) => item.slug === normalizedInitialSportSlug);
        const nextDefault = initialMatch?.slug ?? nextSports.find((item) => item.isClickable)?.slug ?? nextSports[0]?.slug ?? "";
        setSelectedSportSlug((current) => current || nextDefault);
      } catch (error) {
        setSports([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load Pick 'Em sports right now.");
      } finally {
        setLoadingSports(false);
      }
    };

    void run();
  }, [normalizedInitialSportSlug]);

  const loadGames = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!selectedSportSlug) {
        setGames([]);
        setSport(null);
        setLoadingGames(false);
        return;
      }

      const isSportChange = selectedSportSlug !== loadedSportSlugRef.current;
      const effectiveBackground = background || (!isSportChange && gamesRef.current.length > 0);

      if (!effectiveBackground) {
        setLoadingGames(true);
        loadedSportSlugRef.current = selectedSportSlug;
      }

      try {
        const params = new URLSearchParams({
          sportSlug: selectedSportSlug,
          date: selectedDate,
          tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        });
        if (selectedSportSlug === "nfl" && nflWeekStartDate) {
          params.set("weekStartDate", nflWeekStartDate);
        }

        if (userId) {
          params.set("userId", userId);
        }
        if (venueId) {
          params.set("venueId", venueId);
        }

        const response = await fetch(`/api/pickem/games?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await readJsonResponse<GamesResponse>(response, "/api/pickem/games");
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to load Pick 'Em games.");
        }

        const nextGames = payload.games ?? [];
        const shouldPreserveExistingGames = background && nextGames.length === 0 && gamesRef.current.length > 0;

        setSport(payload.sport ?? null);
        if (!shouldPreserveExistingGames) {
          setGames(nextGames);
        }
        setPointsBank(payload.pointsBank ?? null);
        setLastDebugProbes(payload.debug?.probes ?? []);
        setNflWeekOptions(payload.weekOptions ?? []);
        if (selectedSportSlug === "nfl" && payload.selectedWeekStartDate) {
          setNflWeekStartDate(payload.selectedWeekStartDate);
        }
        if (!background) {
          setErrorMessage("");
        }
      } catch (error) {
        setLastDebugProbes([]);
        setPointsBank(null);
        const message = error instanceof Error ? error.message : "Failed to load Pick 'Em games.";
        const looksLikeNflOutOfSeason =
          selectedSportSlug === "nfl" && (message.includes("422") || message.toLowerCase().includes("odds api"));
        if (looksLikeNflOutOfSeason) {
          setErrorMessage("");
          setGames([]);
          setSport((current) => {
            if (current && current.slug === "nfl") {
              return { ...current, isClickable: true };
            }
            const nfl = sports.find((item) => item.slug === "nfl");
            return nfl ? { ...nfl, isClickable: true } : current;
          });
          return;
        }
        if (!background || gamesRef.current.length === 0) {
          setErrorMessage(message);
        }
      } finally {
        if (!effectiveBackground) {
          setLoadingGames(false);
        }
      }
    },
    [nflWeekStartDate, selectedDate, selectedSportSlug, sports, userId, venueId]
  );

  useEffect(() => {
    loadGamesRef.current = loadGames;
  }, [loadGames]);

  useEffect(() => {
    // Always refresh when the user lands on Pick 'Em.
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    const refreshNow = () => {
      if (loadGamesRef.current) {
        void loadGamesRef.current({ background: true });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const loadHeaderPoints = useCallback(async () => {
    if (!userId) {
      setHeaderPoints(0);
      return;
    }
    try {
      const cacheKey = `summary:${userId}:${venueId}`;
      const payload = await cachedFetch<SummaryPayload>(
        cacheKey,
        async () => {
          const response = await fetch(
            `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
            { cache: "no-store" }
          );
          return readJsonResponse<SummaryPayload>(response, "/api/users/summary");
        },
        4_000
      );
      if (!payload.ok || !payload.profile) {
        return;
      }
      setHeaderPoints(Math.max(0, Number(payload.profile.points ?? 0)));
    } catch {
      // no-op: we keep previous value on transient network errors
    }
  }, [userId, venueId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const initial = window.setTimeout(() => {
      void loadHeaderPoints();
    }, 0);
    const interval = window.setInterval(() => {
      void loadHeaderPoints();
    }, 20_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadHeaderPoints, userId]);

  useEffect(() => {
    const onPointsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ delta?: number }>;
      const delta = Number(custom.detail?.delta ?? 0);
      if (!Number.isFinite(delta) || delta <= 0) {
        return;
      }
      setHeaderPoints((current) => current + delta);
      setHeaderPointsGain((current) => (current ?? 0) + delta);
      setHeaderPointsPulse(true);

      if (headerPointsGainTimerRef.current !== null) {
        window.clearTimeout(headerPointsGainTimerRef.current);
      }
      headerPointsGainTimerRef.current = window.setTimeout(() => {
        setHeaderPointsGain(null);
      }, 1300);

      if (headerPointsPulseTimerRef.current !== null) {
        window.clearTimeout(headerPointsPulseTimerRef.current);
      }
      headerPointsPulseTimerRef.current = window.setTimeout(() => {
        setHeaderPointsPulse(false);
      }, 550);

      void loadHeaderPoints();
    };

    window.addEventListener("tp:points-updated", onPointsUpdated as EventListener);
    return () => {
      window.removeEventListener("tp:points-updated", onPointsUpdated as EventListener);
    };
  }, [loadHeaderPoints]);


  const grouped = useMemo(() => {
    const byLeague = new Map<string, PickEmGame[]>();
    for (const game of games) {
      const key = game.league || "Other";
      const list = byLeague.get(key) ?? [];
      list.push(game);
      byLeague.set(key, list);
    }
    return Array.from(byLeague.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
  }, [games]);

  const pickCount = Math.max(0, dailyPickCount + dailyPickCountDelta);
  const picksRemaining = Math.max(0, PICKEM_PICK_LIMIT - pickCount);
  const isViewingToday = selectedDate === todayDateKey;

  const toLocalDateKey = useCallback((iso: string) => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "";
    const localMs = ms - new Date().getTimezoneOffset() * 60_000;
    const d = new Date(localMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }, []);

  const historicalPicks = useMemo(
    () =>
      pickHistory
        .filter((pick) => toLocalDateKey(pick.startsAt) === selectedDate)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [pickHistory, selectedDate, toLocalDateKey]
  );

  useEffect(() => {
    if (!selectedSportSlug || historicalPicks.length === 0) return;

    const isToday = selectedDate === todayDateKey;
    const sessionKey = isToday ? `${selectedDate}:${selectedSportSlug}` : selectedDate;

    if (animatedWinDatesRef.current.has(sessionKey)) return;

    const wonPicks = isToday
      ? historicalPicks.filter((pick) => pick.status === "won" && pick.sportSlug === selectedSportSlug)
      : historicalPicks.filter((pick) => pick.status === "won");

    if (wonPicks.length === 0) return;

    animatedWinDatesRef.current.add(sessionKey);

    const totalPoints = wonPicks.reduce((sum, pick) => sum + Math.max(0, pick.rewardPoints || 10), 0);

    window.dispatchEvent(
      new CustomEvent("tp:coin-flight", {
        detail: {
          delta: totalPoints,
          coins: Math.min(24, Math.max(8, wonPicks.length * 4)),
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent("tp:points-updated", {
        detail: { source: "pickem-wins", delta: totalPoints },
      })
    );
  }, [historicalPicks, selectedDate, selectedSportSlug, todayDateKey]);

  const scheduleBackgroundRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadGames({ background: true });
    }, 250);
  }, [loadGames]);

  const loadDailyPickCount = useCallback(async () => {
    if (!userId || !venueId) {
      setDailyPickCount(0);
      setDailyPickCountDelta(0);
      return;
    }
    const response = await fetch(`/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=300`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      ok: boolean;
      picks?: Array<{ startsAt: string; venueId: string }>;
    };
    if (!payload.ok) {
      return;
    }
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    const toLocalDateKey = (iso: string) => {
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) return "";
      const localMs = ms - tzOffsetMinutes * 60_000;
      const d = new Date(localMs);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    };
    const todayKey = toLocalDateKey(new Date().toISOString());
    const count = (payload.picks ?? []).filter((pick) => pick.venueId === venueId && toLocalDateKey(pick.startsAt) === todayKey).length;
    setDailyPickCount(count);
    setDailyPickCountDelta(0);
  }, [userId, venueId]);

  const submitPickRequest = useCallback(
    async (gameId: string, pickTeam: string) => {
      const response = await fetch("/api/pickem/picks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          venueId,
          sportSlug: selectedSportSlug,
          gameId,
          pickTeam,
          date: selectedDate,
          weekStartDate: selectedSportSlug === "nfl" ? nflWeekStartDate : undefined,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to save your pick.");
      }
    },
    [nflWeekStartDate, selectedDate, selectedSportSlug, userId, venueId]
  );

  const clearPickRequest = useCallback(
    async (gameId: string) => {
      const response = await fetch("/api/pickem/picks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "clear",
          userId,
          gameId,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to clear your pick.");
      }
    },
    [userId]
  );

  const flushGamePick = useCallback(
    async (gameId: string, pickTeam: string): Promise<void> => {
      if (inFlightGameIdsRef.current[gameId]) {
        queuedPickByGameRef.current[gameId] = pickTeam;
        return;
      }

      inFlightGameIdsRef.current[gameId] = true;
      try {
        await submitPickRequest(gameId, pickTeam);
        scheduleBackgroundRefresh();
        await loadDailyPickCount();
      } catch (error) {
        delete queuedPickByGameRef.current[gameId];
        const serverPick = latestGameMapRef.current.get(gameId)?.userPickTeam;
        setOptimisticPickByGame((current) => {
          const next = { ...current };
          if (serverPick) {
            next[gameId] = serverPick;
          } else {
            delete next[gameId];
          }
          return next;
        });
        await loadDailyPickCount();
        setSubmitMessage(error instanceof Error ? error.message : "Failed to save your pick.");
      } finally {
        inFlightGameIdsRef.current[gameId] = false;
        const queuedTeam = queuedPickByGameRef.current[gameId];
        if (queuedTeam && queuedTeam !== pickTeam) {
          delete queuedPickByGameRef.current[gameId];
          void flushGamePick(gameId, queuedTeam);
        }
      }
    },
    [loadDailyPickCount, scheduleBackgroundRefresh, submitPickRequest]
  );

  const submitPick = useCallback(
    async (game: PickEmGame, pickTeam: string) => {
      const triggerLimitReachedPop = () => {
        setSubmitMessage(`Pick limit reached (${PICKEM_PICK_LIMIT}/${PICKEM_PICK_LIMIT}). Remove one pick to change your slate.`);
        popIdRef.current += 1;
        setPopAnim({ count: PICKEM_PICK_LIMIT, shake: true, id: popIdRef.current });
        window.setTimeout(() => {
          popIdRef.current += 1;
          setLimitEchoAnim({ id: popIdRef.current });
        }, 170);
        setLimitPulse(false);
        window.requestAnimationFrame(() => setLimitPulse(true));
        window.setTimeout(() => setLimitPulse(false), 900);
      };
      if (!userId || !venueId) {
        setSubmitMessage("Join a venue first to submit Pick 'Em selections.");
        return;
      }
      if (!isViewingToday) {
        setSubmitMessage("You can only place picks for today. Switch back to today to make picks.");
        return;
      }
      const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
      const isDeselect = displayedPickTeam === pickTeam;
      const isSwitch = !!displayedPickTeam && !isDeselect;
      setSubmitMessage("");
      if (!isDeselect && !isSwitch && pickCount >= PICKEM_PICK_LIMIT) {
        triggerLimitReachedPop();
        return;
      }
      if (isDeselect) {
        setDailyPickCountDelta((current) => current - 1);
      } else if (!displayedPickTeam) {
        setDailyPickCountDelta((current) => current + 1);
        popIdRef.current += 1;
        setPopAnim({ count: pickCount + 1, shake: false, id: popIdRef.current });
      }
      setGames((current) =>
        current.map((row) =>
          row.id === game.id
            ? {
                ...row,
                userPickTeam: isDeselect ? undefined : pickTeam,
                userPickStatus: "pending",
              }
            : row
        )
      );
      setOptimisticPickByGame((current) => {
        const next = { ...current };
        if (isDeselect) {
          delete next[game.id];
        } else {
          next[game.id] = pickTeam;
        }
        return next;
      });
      setPickPulseByGameId((current) => ({ ...current, [game.id]: isDeselect ? undefined : pickTeam }));
      window.setTimeout(() => {
        setPickPulseByGameId((current) => {
          if (current[game.id] !== (isDeselect ? undefined : pickTeam)) return current;
          const next = { ...current };
          delete next[game.id];
          return next;
        });
      }, 420);
      if (isDeselect) {
        void (async () => {
          try {
            await clearPickRequest(game.id);
            scheduleBackgroundRefresh();
            await loadDailyPickCount();
          } catch (error) {
            const serverPick = latestGameMapRef.current.get(game.id)?.userPickTeam;
            setOptimisticPickByGame((current) => {
              const next = { ...current };
              if (serverPick) next[game.id] = serverPick;
              return next;
            });
            setDailyPickCountDelta((current) => current + 1);
            setSubmitMessage(error instanceof Error ? error.message : "Failed to clear your pick.");
          }
        })();
      } else {
        void flushGamePick(game.id, pickTeam);
      }
    },
    [clearPickRequest, flushGamePick, isViewingToday, loadDailyPickCount, optimisticPickByGame, pickCount, scheduleBackgroundRefresh, userId, venueId]
  );

  useEffect(() => {
    if (!userId || !venueId) return;
    if (!pointsBank || pointsBank.unclaimedCorrectPicks <= 0) return;
    if (hasAutoCollectedRef.current) return;
    hasAutoCollectedRef.current = true;

    const run = async () => {
      try {
        const response = await fetch("/api/pickem/picks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim_points",
            userId,
            venueId,
            localDate: selectedDate,
            tzOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          result?: {
            claimed: boolean;
            pointsAwarded: number;
            claimedPickCount: number;
            multiplierApplied: 1 | 2 | 3;
            correctPicks: number;
            settledPicks: number;
          };
          error?: string;
        };
        if (!payload.ok || !payload.result || !payload.result.claimed || payload.result.pointsAwarded <= 0) {
          return;
        }
        const { pointsAwarded, multiplierApplied, correctPicks, settledPicks } = payload.result;
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
              delta: pointsAwarded,
              coins: Math.min(36, Math.max(12, Math.round(pointsAwarded / 2))),
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "pickem-claim", delta: pointsAwarded },
          })
        );
        setCollectResult({
          pointsCollected: pointsAwarded,
          correctPicks,
          totalSettledPicks: settledPicks,
          multiplierApplied,
        });
        void loadGames({ background: true });
        void loadDailyPickCount();
      } catch {
        // silent — user still sees their picks, just no animation
      }
    };
    void run();
  }, [loadDailyPickCount, loadGames, pointsBank, selectedDate, userId, venueId]);

  useEffect(() => {
    void loadDailyPickCount();
  }, [loadDailyPickCount]);

  useEffect(() => {
    const run = async () => {
      if (!userId || !venueId) {
        setPickHistory([]);
        setLoadingPickHistory(false);
        return;
      }
      setLoadingPickHistory(true);
      try {
        const response = await fetch(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}&includeSettled=true&refreshSettlement=true&limit=500`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          ok: boolean;
          picks?: PickEmPickHistoryItem[];
          error?: string;
        };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to load pick history.");
        }
        setPickHistory(payload.picks ?? []);
      } catch (error) {
        setPickHistory([]);
        setSubmitMessage(error instanceof Error ? error.message : "Failed to load pick history.");
      } finally {
        setLoadingPickHistory(false);
      }
    };
    void run();
  }, [userId, venueId]);

  useEffect(() => {
    if (!pointsBank || !userId || !venueId) return;
    if (pointsBank.totalPicks !== PICKEM_PICK_LIMIT || pointsBank.pendingPicks !== 0) return;
    if (pointsBank.correctPicks < 7) return;
    const label: "Double Points!" | "Triple Points!" =
      pointsBank.correctPicks >= PICKEM_PICK_LIMIT ? "Triple Points!" : "Double Points!";
    const shownKey = `tp:pickem-multiplier-pop:${userId}:${venueId}:${pointsBank.localDate}:${label}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(shownKey) === "1") return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(shownKey, "1");
    }
    popIdRef.current += 1;
    setMultiplierAnim({ label, id: popIdRef.current });
  }, [pointsBank, userId, venueId]);


  const totalPickEmGames = grouped.reduce((sum, [, leagueGames]) => sum + leagueGames.length, 0);
  let renderedPickEmCardCount = 0;

  return (
    <div className="tp-pickem-compact min-h-[100dvh] touch-pan-y pb-[max(env(safe-area-inset-bottom),6px)]">
      <CoinFXCanvas />
      {collectResult ? (
        <PickEmCollectAnimation
          pointsCollected={collectResult.pointsCollected}
          correctPicks={collectResult.correctPicks}
          totalSettledPicks={collectResult.totalSettledPicks}
          multiplierApplied={collectResult.multiplierApplied}
          onComplete={() => setCollectResult(null)}
        />
      ) : null}
      <style>{`
        @keyframes sport-pop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.08); box-shadow: 0 0 0 5px rgba(253,230,138,0.34); }
          65%  { transform: scale(0.98); }
          100% { transform: scale(1); }
        }
        @keyframes pickem-gold-flash {
          0% { box-shadow: 0 0 0 rgba(250,204,21,0); }
          25% { box-shadow: 0 0 0 6px rgba(250,204,21,0.45), 0 0 32px rgba(250,204,21,0.35); }
          100% { box-shadow: 0 0 0 rgba(250,204,21,0); }
        }
        @keyframes pickem-limit-pulse {
          0% { transform: scale(1); opacity: 1; }
          35% { transform: scale(1.08); opacity: 0.92; }
          100% { transform: scale(1); opacity: 1; }
        }
        .sport-pop { animation: sport-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
        .pickem-gold-flash { animation: pickem-gold-flash 700ms ease-out; }
        .pickem-limit-pulse { animation: pickem-limit-pulse 420ms ease-in-out; }
      `}</style>

      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#020617]/95 px-2 pb-2 pt-[max(env(safe-area-inset-top),6px)] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (!venueId) return;
              navigateBackToVenue({
                venuePath: `/venue/${encodeURIComponent(venueId)}`,
                fallbackNavigate: () => {
                  window.location.href = `/venue/${encodeURIComponent(venueId)}`;
                },
              });
            }}
            disabled={!venueId}
            className="tp-clean-button tp-exit-pill inline-flex h-9 w-10 items-center justify-center rounded-full p-0 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Back to venue"
          >
            <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-[12px]">←</span>
          </button>
          <div
            className="text-[15px] uppercase tracking-[0.04em] text-[#fde68a] [text-shadow:0_1px_0_rgba(0,0,0,.45)]"
            style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
          >
            Pick &apos;Em
          </div>
          <div className="relative flex items-center gap-1.5">
            <div
              id="tp-points-pill"
              className={`relative inline-flex h-9 min-w-[6.3rem] items-center justify-center gap-1.5 rounded-[10px] border px-2 text-sm font-black tabular-nums transition-all duration-300 ${
                headerPointsPulse
                  ? "border-amber-300/60 bg-amber-300/20 text-amber-200 scale-105"
                  : "border-amber-300/40 bg-amber-300/10 text-amber-300"
              }`}
            >
              {headerPointsGain ? (
                <span className="pointer-events-none absolute -top-3 right-0 rounded-full border border-emerald-700 bg-emerald-300 px-1.5 py-0.5 text-[10px] font-black leading-none text-emerald-900 shadow">
                  +{headerPointsGain}
                </span>
              ) : null}
              <GoldCoinIcon className="h-4 w-4" />
              <span>{headerPoints.toLocaleString()}</span>
            </div>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="space-y-3 px-2 pt-2">
        <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-3 py-3">
          <h2
            className="text-[20px] leading-none text-[#fde68a]"
            style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
          >
            Hightop Pick &apos;Em
          </h2>
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-400">
            Select winners by checking a team. Picks lock at scheduled start time and are final.
          </p>

          <motion.div
            animate={limitPulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 0.35 }}
            className={`mt-3 overflow-hidden rounded-xl border ${
              pickCount >= PICKEM_PICK_LIMIT
                ? "border-rose-400/60 bg-rose-950/20"
                : "border-[#fde68a]/30 bg-[#020617]/55"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#fde68a]/20 bg-black/20 px-3 py-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Pick Tracker</span>
              <span
                className={`text-[9px] font-black uppercase tracking-[0.16em] ${
                  pickCount >= PICKEM_PICK_LIMIT ? "text-rose-400" : "text-[#fde68a]"
                } ${pickCount >= PICKEM_PICK_LIMIT && limitPulse ? "pickem-limit-pulse" : ""}`}
              >
                {pickCount >= PICKEM_PICK_LIMIT ? "Limit Reached" : "Daily Picks"}
              </span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex flex-1 items-center gap-[3px]">
                {Array.from({ length: PICKEM_PICK_LIMIT }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-[7px] flex-1 rounded-full ${
                      i < pickCount
                        ? pickCount >= PICKEM_PICK_LIMIT
                          ? `bg-rose-500 ${limitPulse ? "pickem-limit-pulse" : ""}`
                          : "bg-[#fde68a]"
                        : "bg-white/12"
                    }`}
                  />
                ))}
              </div>
              <motion.span
                key={pickCount}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.16, 1] }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={`shrink-0 text-[19px] font-black leading-none tabular-nums ${
                  pickCount >= PICKEM_PICK_LIMIT ? "text-rose-400" : "text-[#fde68a]"
                }`}
              >
                {pickCount}
                <span className="text-[11px] font-semibold text-slate-400">/{PICKEM_PICK_LIMIT}</span>
              </motion.span>
            </div>
          </motion.div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex w-full items-center justify-between rounded-xl border border-[#fde68a]/35 bg-[#fde68a]/10 px-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate((current) => shiftDateKey(current, -1));
                  setSubmitMessage("");
                  setErrorMessage("");
                }}
                className="tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fde68a]/45 bg-slate-950/65 text-[#fde68a]"
                aria-label="Previous day"
              >
                ◀
              </button>
              <span className="text-xs font-extrabold tracking-[0.02em] text-slate-50">
                {new Date(`${selectedDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
                  weekday: "short",
                  timeZone: "UTC",
                })}{" · "}
                {new Date(`${selectedDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
                {isViewingToday ? " (Today)" : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (isViewingToday) return;
                  setSelectedDate((current) => shiftDateKey(current, 1));
                  setSubmitMessage("");
                  setErrorMessage("");
                }}
                disabled={isViewingToday}
                className="tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fde68a]/30 bg-slate-950/55 text-[#fde68a] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Next day"
              >
                ▶
              </button>
            </div>

            {selectedSportSlug === "nfl" && nflWeekOptions.length > 0 ? (
              <>
                <label htmlFor="pickem-nfl-week" className="text-xs font-medium text-slate-400">
                  NFL Week:
                </label>
                <select
                  id="pickem-nfl-week"
                  value={nflWeekStartDate}
                  onChange={(event) => {
                    setNflWeekStartDate(event.target.value);
                    setSubmitMessage("");
                  }}
                  className="tp-clean-button rounded-lg border border-[#fde68a]/30 bg-slate-900 px-2 py-1 text-xs text-slate-200 sm:text-sm"
                >
                  {nflWeekOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {!userId || !venueId ? (
              <span className="rounded-full border border-amber-300/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
                Browse only
              </span>
            ) : null}
          </div>

          {isViewingToday ? (
            <div className="mt-3 w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
              <div className="grid min-w-full grid-cols-7 gap-2">
                {loadingSports ? (
                  <BouncingBallLoader size="sm" label="Loading sports..." />
                ) : sports.length === 0 ? (
                  <p className="text-xs text-slate-400">No sports available.</p>
                ) : (
                  sports.map((item) => {
                    const isSelected = selectedSportSlug === item.slug;
                    const isDisabled = !item.isClickable && item.slug !== "nfl";
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) {
                            setSelectedSportSlug(item.slug);
                            setSubmitMessage("");
                            setErrorMessage("");
                            setFlashingSportSlug(item.slug);
                            setTimeout(() => setFlashingSportSlug(""), 500);
                          }
                        }}
                        className={`tp-clean-button inline-flex h-12 w-full items-center justify-center rounded-full border p-0 text-2xl leading-none ${
                          isSelected
                            ? "border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
                            : isDisabled
                            ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-slate-600 opacity-60"
                            : "border-white/15 bg-white/[0.03] text-slate-400"
                        } ${flashingSportSlug === item.slug ? "sport-pop" : ""}`}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <span aria-hidden="true">{getSportIcon(item.slug)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <div className="rounded-xl border border-rose-500/45 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        {submitMessage ? (
          <div className="rounded-xl border border-amber-400/45 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-300">
            {submitMessage}
          </div>
        ) : null}

        {!isViewingToday ? (
          loadingPickHistory ? (
            <BouncingBallLoader size="sm" label="Loading your picks..." />
          ) : historicalPicks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
              No picks found for this date.
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">Your Picks</h3>
                <span className="text-[10px] font-bold tracking-[0.03em] text-slate-500">{historicalPicks.length} picks</span>
              </div>
              <ul className="space-y-2.5">
                {historicalPicks.map((pick) => {
                  const statusClass =
                    pick.status === "won"
                      ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                      : pick.status === "lost"
                      ? "border-rose-500/45 bg-rose-500/15 text-rose-300"
                      : pick.status === "pending"
                      ? "border-amber-400/45 bg-amber-500/15 text-amber-300"
                      : "border-white/10 bg-white/[0.04] text-slate-400";
                  return (
                    <li key={pick.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-slate-100">
                          <span className="mr-1" aria-hidden="true">{getSportIcon(pick.sportSlug)}</span>
                          {pick.league}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusClass}`}>
                          {pick.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-300">{pick.awayTeam} at {pick.homeTeam}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatLocalStartTime(pick.startsAt)}</p>
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Your pick: {pick.selectedTeam}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        ) : loadingGames ? (
          <BouncingBallLoader size="sm" label="Loading games..." />
        ) : !sport ? (
          <div className="rounded-xl border border-amber-400/45 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            Choose a sport to load today&apos;s games.
          </div>
        ) : !sport.isClickable && sport.slug !== "nfl" ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
            {sport.label} Pick &apos;Em is coming soon.
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
            Sorry, no games available. Check back later!
          </div>
        ) : (
          <div className="space-y-4 pb-1">
            {grouped.map(([league, leagueGames]) => (
              <section key={league}>
                <div className="mb-2 flex items-end justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">{league}</h3>
                  <span className="text-[10px] font-bold tracking-[0.03em] text-slate-500">{leagueGames.length} games</span>
                </div>

                <ul className="space-y-2.5">
                  {leagueGames.map((game) => {
                    renderedPickEmCardCount += 1;
                    const isLastGame = renderedPickEmCardCount === totalPickEmGames;
                    const shouldRenderAdBreak =
                      renderedPickEmCardCount <= 30 &&
                      (renderedPickEmCardCount % 5 === 0 || (isLastGame && renderedPickEmCardCount % 5 !== 0));
                    const sequenceIndex = shouldRenderAdBreak ? Math.ceil(renderedPickEmCardCount / 5) : 1;
                    const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
                    const baseDisabled = !sport.isClickable || !userId || !venueId || !isViewingToday;
                    const awaySelected = displayedPickTeam === game.awayTeam;
                    const homeSelected = displayedPickTeam === game.homeTeam;
                    const pickLimitReached = pickCount >= PICKEM_PICK_LIMIT;
                    const disableAwaySelection = baseDisabled || (pickLimitReached && !awaySelected && !homeSelected);
                    const disableHomeSelection = baseDisabled || (pickLimitReached && !awaySelected && !homeSelected);
                    const isAwayWinner = game.winnerTeam === game.awayTeam;
                    const isHomeWinner = game.winnerTeam === game.homeTeam;
                    const statusLabel = getGameStatusLabel(game);

                    return (
                      <Fragment key={game.id}>
                        <li className="overflow-hidden rounded-xl border border-[#fde68a]/45 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]">
                          <div className="flex items-center justify-between border-b border-dashed border-[#fde68a]/45 px-4 py-2">
                            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">{league}</span>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${
                                game.status === "live" ? "text-emerald-300" : "text-slate-300"
                              }`}
                            >
                              {game.status === "live" ? (
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              ) : null}
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex overflow-hidden bg-[#020617]/45">
                            <button
                              type="button"
                              aria-disabled={disableAwaySelection}
                              onClick={() => {
                                if (disableAwaySelection) {
                                  if (!awaySelected && !homeSelected && pickCount >= PICKEM_PICK_LIMIT) {
                                    setSubmitMessage(`Pick limit reached (${PICKEM_PICK_LIMIT}/${PICKEM_PICK_LIMIT}). Remove one pick to change your slate.`);
                                    popIdRef.current += 1;
                                    setPopAnim({ count: PICKEM_PICK_LIMIT, shake: true, id: popIdRef.current });
                                    window.setTimeout(() => {
                                      popIdRef.current += 1;
                                      setLimitEchoAnim({ id: popIdRef.current });
                                    }, 170);
                                    setLimitPulse(false);
                                    window.requestAnimationFrame(() => setLimitPulse(true));
                                    window.setTimeout(() => setLimitPulse(false), 900);
                                  }
                                  return;
                                }
                                if (game.isLocked) {
                                  setSubmitMessage("This game is locked because it has already started.");
                                  return;
                                }
                                void submitPick(game, game.awayTeam);
                              }}
                              style={{ touchAction: "manipulation" }}
                              className={`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
                                disableAwaySelection ? "cursor-not-allowed opacity-45" : ""
                              } ${
                                awaySelected ? "bg-[#fde68a]/15" : ""
                              } ${pickPulseByGameId[game.id] === game.awayTeam ? "scale-[1.01]" : ""}`}
                            >
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
                                  awaySelected
                                    ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
                                    : "border border-[#fde68a]/45 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
                                {game.awayTeam}
                              </span>
                              <span className={`text-[16px] font-black tabular-nums ${isAwayWinner ? "text-emerald-300" : "text-slate-200"}`}>
                                {getDisplayedScoreCell(game, game.awayTeam, game.awayScore)}
                              </span>
                            </button>
                            <div className="w-px shrink-0 bg-[#fde68a]/20" />
                            <button
                              type="button"
                              aria-disabled={disableHomeSelection}
                              onClick={() => {
                                if (disableHomeSelection) {
                                  if (!awaySelected && !homeSelected && pickCount >= PICKEM_PICK_LIMIT) {
                                    setSubmitMessage(`Pick limit reached (${PICKEM_PICK_LIMIT}/${PICKEM_PICK_LIMIT}). Remove one pick to change your slate.`);
                                    popIdRef.current += 1;
                                    setPopAnim({ count: PICKEM_PICK_LIMIT, shake: true, id: popIdRef.current });
                                    window.setTimeout(() => {
                                      popIdRef.current += 1;
                                      setLimitEchoAnim({ id: popIdRef.current });
                                    }, 170);
                                    setLimitPulse(false);
                                    window.requestAnimationFrame(() => setLimitPulse(true));
                                    window.setTimeout(() => setLimitPulse(false), 900);
                                  }
                                  return;
                                }
                                if (game.isLocked) {
                                  setSubmitMessage("This game is locked because it has already started.");
                                  return;
                                }
                                void submitPick(game, game.homeTeam);
                              }}
                              style={{ touchAction: "manipulation" }}
                              className={`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
                                disableHomeSelection ? "cursor-not-allowed opacity-45" : ""
                              } ${
                                homeSelected ? "bg-[#fde68a]/15" : ""
                              } ${pickPulseByGameId[game.id] === game.homeTeam ? "scale-[1.01]" : ""}`}
                            >
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
                                  homeSelected
                                    ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
                                    : "border border-[#fde68a]/45 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
                                {game.homeTeam}
                              </span>
                              <span className={`text-[16px] font-black tabular-nums ${isHomeWinner ? "text-emerald-300" : "text-slate-200"}`}>
                                {getDisplayedScoreCell(game, game.homeTeam, game.homeScore)}
                              </span>
                            </button>
                          </div>

                          {resultLabel(game) ? (
                            <div
                              className={`px-4 py-1.5 text-[11px] font-extrabold tracking-[0.04em] ${
                                game.userPickStatus === "won"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-rose-500/15 text-rose-300"
                              }`}
                            >
                              {game.userPickStatus === "won"
                                ? "✓ Correct pick · +10 points"
                                : game.userPickStatus === "lost"
                                  ? "Incorrect pick · 0 points"
                                  : resultLabel(game)}
                            </div>
                          ) : null}
                        </li>

                        {shouldRenderAdBreak ? (
                          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-2">
                            <InlineSlotAdClient
                              slot={PICKEM_INLINE_SLOTS[sequenceIndex] ?? "pickem-inline-cards-1-5"}
                              venueId={venueId}
                              pageKey="pickem"
                              adType="inline"
                              displayTrigger="on-load"
                              placementKey="pickem-inline"
                              sequenceIndex={sequenceIndex}
                              showPlaceholder
                            />
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      {isMounted && (popAnim || multiplierAnim || limitEchoAnim)
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[7000] flex items-center justify-center">
              {(() => {
                if (multiplierAnim) {
                  return (
                    <motion.span
                      key={multiplierAnim.id}
                      className="select-none whitespace-nowrap font-black leading-none transform-gpu will-change-transform"
                      style={{
                        color: "#fde68a",
                        fontSize: "clamp(2.1rem, 10vw, 4.6rem)",
                        textShadow: "0 0 30px rgba(250,204,21,0.62), 0 0 62px rgba(250,204,21,0.42)",
                        filter: "drop-shadow(0 0 14px rgba(250,204,21,0.75))",
                      }}
                      initial={{ scale: 0, y: 0, x: 0, rotate: 0, opacity: 0 }}
                      animate={{
                        scale: [0, 1.65, 1.25, 1.25, 0.9],
                        y: [0, -35, -35, -35, 340],
                        rotate: [0, 0, 0, 0, 13],
                        opacity: [0, 1, 1, 1, 0],
                      }}
                      transition={{
                        duration: 0.8,
                        times: [0, 0.13, 0.23, 0.62, 1],
                        ease: ["easeOut", "easeOut", "linear", "easeIn"],
                      }}
                      onAnimationComplete={() => setMultiplierAnim(null)}
                    >
                      {multiplierAnim.label}
                    </motion.span>
                  );
                }
                if (!popAnim) {
                  if (!limitEchoAnim) return null;
                  return (
                    <motion.span
                      key={limitEchoAnim.id}
                      className="absolute top-[19%] select-none whitespace-nowrap font-black leading-none text-red-500 transform-gpu will-change-transform"
                      style={{
                        fontSize: "clamp(1.8rem, 7vw, 3.2rem)",
                        textShadow: "0 0 18px rgba(239,68,68,0.38), 0 0 34px rgba(239,68,68,0.18)",
                      }}
                      initial={{ scale: 0.7, opacity: 0, y: 0 }}
                      animate={{ scale: [0.7, 1.06, 1], opacity: [0, 1, 0], y: [0, -12, -20] }}
                      transition={{ duration: 0.55, times: [0, 0.45, 1], ease: "easeOut" }}
                      onAnimationComplete={() => setLimitEchoAnim(null)}
                    >
                      Limit Reached
                    </motion.span>
                  );
                }

                const isLimitReached = popAnim.count >= PICKEM_PICK_LIMIT;
                const useShake = popAnim.shake && !isLimitReached;
                return (
                  <>
                    <motion.span
                      key={popAnim.id}
                      className="select-none whitespace-nowrap font-black leading-none transform-gpu will-change-transform"
                      style={{
                        color: isLimitReached ? "#ef4444" : "#22c55e",
                        fontSize:
                          isLimitReached
                            ? "clamp(2.2rem, 10vw, 4.5rem)"
                            : "clamp(5rem, 22vw, 11rem)",
                        textShadow:
                          isLimitReached
                            ? "0 0 22px rgba(239,68,68,0.42), 0 0 44px rgba(239,68,68,0.24)"
                            : "0 0 60px rgba(34,197,94,0.55), 0 0 120px rgba(34,197,94,0.3)",
                      }}
                      initial={{ scale: 0, y: 0, x: 0, rotate: 0, opacity: 0 }}
                      animate={
                        isLimitReached
                          ? {
                              scale: [0.72, 1.08, 1.02, 0.98],
                              y: [0, -20, -16, -8],
                              opacity: [0, 1, 1, 0],
                            }
                          : useShake
                            ? {
                                scale: [0, 1.65, 1.3, 1.3, 1.3, 1.3, 1.3, 0.9],
                                x: [0, 0, -30, 30, -22, 22, 0, 0],
                                y: [0, -35, -35, -35, -35, -35, -35, 360],
                                rotate: [0, 0, 0, 0, 0, 0, 0, 18],
                                opacity: [0, 1, 1, 1, 1, 1, 1, 0],
                              }
                            : {
                                scale: [0, 1.65, 1.25, 1.25, 0.9],
                                y: [0, -35, -35, -35, 340],
                                rotate: [0, 0, 0, 0, 13],
                                opacity: [0, 1, 1, 1, 0],
                              }
                      }
                      transition={
                        isLimitReached
                          ? {
                              duration: 0.55,
                              times: [0, 0.28, 0.62, 1],
                              ease: ["easeOut", "easeOut", "easeIn", "easeIn"],
                            }
                          : useShake
                            ? {
                                duration: 0.9,
                                times: [0, 0.14, 0.27, 0.4, 0.53, 0.66, 0.76, 1],
                                ease: ["easeOut", "easeOut", "easeOut", "easeOut", "easeOut", "easeOut", "easeIn"],
                              }
                            : {
                                duration: 0.8,
                                times: [0, 0.13, 0.23, 0.62, 1],
                                ease: ["easeOut", "easeOut", "linear", "easeIn"],
                              }
                      }
                    >
                      {isLimitReached ? "Limit Reached" : popAnim.count}
                    </motion.span>
                    {limitEchoAnim ? (
                      <motion.span
                        key={limitEchoAnim.id}
                        className="absolute top-[19%] select-none whitespace-nowrap font-black leading-none text-red-500 transform-gpu will-change-transform"
                        style={{
                          fontSize: "clamp(1.8rem, 7vw, 3.2rem)",
                          textShadow: "0 0 18px rgba(239,68,68,0.38), 0 0 34px rgba(239,68,68,0.18)",
                        }}
                        initial={{ scale: 0.7, opacity: 0, y: 0 }}
                        animate={{ scale: [0.7, 1.06, 1], opacity: [0, 1, 0], y: [0, -12, -20] }}
                        transition={{ duration: 0.55, times: [0, 0.45, 1], ease: "easeOut" }}
                        onAnimationComplete={() => setLimitEchoAnim(null)}
                      >
                        Limit Reached
                      </motion.span>
                    ) : null}
                  </>
                );
              })()}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
