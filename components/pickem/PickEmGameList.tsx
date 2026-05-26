"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { getUserId, getVenueId } from "@/lib/storage";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
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
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function PickEmGameList({ initialSportSlug = "" }: { initialSportSlug?: string }) {
  const normalizedInitialSportSlug = String(initialSportSlug ?? "").trim().toLowerCase();
  const todayDateKey = getLocalDateKey();
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
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
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
  const [isCollectingBank, setIsCollectingBank] = useState(false);
  const [pointsBank, setPointsBank] = useState<GamesResponse["pointsBank"] | null>(null);
  const [goldFlash, setGoldFlash] = useState(false);
  const [flashingSportSlug, setFlashingSportSlug] = useState("");
  const [lastDebugProbes, setLastDebugProbes] = useState<
    Array<{ sportKey: string; path: string; url: string; statusCode: number; bodyPreview: string }>
  >([]);
  const [popAnim, setPopAnim] = useState<{ count: number; shake: boolean; id: number } | null>(null);
  const [limitEchoAnim, setLimitEchoAnim] = useState<{ id: number } | null>(null);
  const [multiplierAnim, setMultiplierAnim] = useState<{ label: "Double Points!" | "Triple Points!"; id: number } | null>(null);
  const [limitPulse, setLimitPulse] = useState(false);
  const [hasPreviousUnclaimedPicks, setHasPreviousUnclaimedPicks] = useState(false);
  const [hasFutureUnclaimedPicks, setHasFutureUnclaimedPicks] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [pickHistory, setPickHistory] = useState<PickEmPickHistoryItem[]>([]);
  const [loadingPickHistory, setLoadingPickHistory] = useState(false);
  const popIdRef = useRef(0);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
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
    };
  }, []);

  useEffect(() => { setIsMounted(true); }, []);

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

  const fallbackCollectPoints = useMemo(
    () =>
      historicalPicks.reduce((sum, pick) => {
        if (pick.status !== "won" || pick.rewardClaimedAt) {
          return sum;
        }
        return sum + Math.max(0, Number(pick.rewardPoints || 10));
      }, 0),
    [historicalPicks]
  );

  const collectablePoints = Math.max(0, Math.max(pointsBank?.pendingPoints ?? 0, fallbackCollectPoints));

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

  useEffect(() => {
    const run = async () => {
      if (!userId || !venueId) {
        setHasPreviousUnclaimedPicks(false);
        setHasFutureUnclaimedPicks(false);
        return;
      }
      try {
        const response = await fetch(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}&includeSettled=true&limit=500`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          ok: boolean;
          picks?: Array<{
            startsAt: string;
            venueId: string;
            status: "pending" | "won" | "lost" | "push" | "canceled";
            rewardClaimedAt?: string | null;
          }>;
        };
        if (!payload.ok) {
          setHasPreviousUnclaimedPicks(false);
          return;
        }
        const hasOlderUnclaimed = (payload.picks ?? []).some((pick) => {
          if (pick.venueId !== venueId) return false;
          if (pick.status !== "won") return false;
          if (pick.rewardClaimedAt) return false;
          const pickDateKey = toLocalDateKey(pick.startsAt);
          return Boolean(pickDateKey) && pickDateKey < selectedDate;
        });
        const hasLaterUnclaimed = (payload.picks ?? []).some((pick) => {
          if (pick.venueId !== venueId) return false;
          if (pick.status !== "won") return false;
          if (pick.rewardClaimedAt) return false;
          const pickDateKey = toLocalDateKey(pick.startsAt);
          return Boolean(pickDateKey) && pickDateKey > selectedDate;
        });
        const hasCurrentUnclaimed = (payload.picks ?? []).some((pick) => {
          if (pick.venueId !== venueId) return false;
          if (pick.status !== "won") return false;
          if (pick.rewardClaimedAt) return false;
          const pickDateKey = toLocalDateKey(pick.startsAt);
          return Boolean(pickDateKey) && pickDateKey === selectedDate;
        });
        setHasPreviousUnclaimedPicks(hasCurrentUnclaimed ? false : hasOlderUnclaimed);
        setHasFutureUnclaimedPicks(hasCurrentUnclaimed ? false : hasLaterUnclaimed);
      } catch {
        setHasPreviousUnclaimedPicks(false);
        setHasFutureUnclaimedPicks(false);
      }
    };
    void run();
  }, [selectedDate, toLocalDateKey, userId, venueId]);

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

  const collectBankPoints = useCallback(async () => {
    if (!userId || !venueId || isCollectingBank) {
      return;
    }
    setIsCollectingBank(true);
    setSubmitMessage("");
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
        };
        error?: string;
      };
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Failed to collect Pick 'Em points.");
      }
      if (!payload.result.claimed || payload.result.pointsAwarded <= 0) {
        setSubmitMessage("No unclaimed settled points are available right now.");
      } else {
        const collectButton = document.querySelector<HTMLElement>("[data-pickem-bank-collect]");
        const rect = collectButton?.getBoundingClientRect();
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
              sourceRect: rect
                ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                : undefined,
              delta: payload.result.pointsAwarded,
              coins: Math.min(36, Math.max(12, Math.round(payload.result.pointsAwarded / 2))),
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "pickem-claim", delta: payload.result.pointsAwarded },
          })
        );
        window.dispatchEvent(new CustomEvent("tp:success-particles"));
        setGoldFlash(true);
        window.setTimeout(() => setGoldFlash(false), 750);
        setSubmitMessage(
          `Collected +${payload.result.pointsAwarded} points (${payload.result.claimedPickCount} picks, ${payload.result.multiplierApplied}x multiplier).`
        );
      }
      await loadGames({ background: true });
      const historyResponse = await fetch(
        `/api/pickem/picks?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}&includeSettled=true&refreshSettlement=true&limit=500`,
        { cache: "no-store" }
      );
      const historyPayload = (await historyResponse.json()) as { ok: boolean; picks?: PickEmPickHistoryItem[] };
      if (historyPayload.ok) {
        setPickHistory(historyPayload.picks ?? []);
      }
      await loadDailyPickCount();
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "Failed to collect Pick 'Em points.");
    } finally {
      setIsCollectingBank(false);
    }
  }, [isCollectingBank, loadDailyPickCount, loadGames, selectedDate, userId, venueId]);

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
    <div className="tp-pickem-compact min-h-[100dvh] touch-pan-y space-y-3 sm:space-y-4">
      <style>{`
        @keyframes sport-pop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.14); box-shadow: 0 0 0 5px rgba(99,102,241,0.30); }
          65%  { transform: scale(0.97); }
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
      <section className="rounded-2xl border border-indigo-400/40 bg-slate-900 p-3 sm:p-4">
        <h2 className="text-base font-black text-indigo-300 sm:text-lg">Hightop Pick &apos;Em™</h2>
        <p className="mt-1 text-xs text-slate-400 sm:text-sm">
          Select winners by checking a team. Picks lock at scheduled start time and are final.
        </p>

        <motion.div
          animate={limitPulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
          className={`mt-3 overflow-hidden rounded-xl border ${
            pickCount >= PICKEM_PICK_LIMIT
              ? "border-rose-400/60 bg-rose-950/20"
              : "border-slate-700 bg-slate-800/60"
          }`}
        >
          {/* Label row */}
          <div className={`flex items-center justify-between border-b px-3 py-1.5 ${
            pickCount >= PICKEM_PICK_LIMIT ? "border-rose-400/40 bg-rose-950/30" : "border-slate-700 bg-slate-800"
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ht-fg-muted">
              Pick Tracker
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${
              pickCount >= PICKEM_PICK_LIMIT ? "text-rose-400" : "text-ht-fg-muted"
            } ${pickCount >= PICKEM_PICK_LIMIT && limitPulse ? "pickem-limit-pulse" : ""}`}>
              {pickCount >= PICKEM_PICK_LIMIT ? "Limit Reached" : "Daily Picks"}
            </span>
          </div>

          {/* Progress row */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            {/* Pip track */}
            <div className="flex flex-1 items-center gap-[3px]">
              {Array.from({ length: PICKEM_PICK_LIMIT }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-colors duration-200 ${
                    i < pickCount
                      ? pickCount >= PICKEM_PICK_LIMIT
                        ? `bg-red-500 ${limitPulse ? "pickem-limit-pulse" : ""}`
                        : "bg-emerald-500"
                      : "bg-ht-border-soft"
                  }`}
                />
              ))}
            </div>

            {/* Numeric readout */}
            <motion.span
              key={pickCount}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`shrink-0 text-lg font-black tabular-nums leading-none ${
                pickCount >= PICKEM_PICK_LIMIT ? "text-red-500" : "text-ht-fg-primary"
              } ${pickCount >= PICKEM_PICK_LIMIT && limitPulse ? "pickem-limit-pulse" : ""}`}
            >
              {pickCount}
              <span className={`text-xs font-semibold ${
                pickCount >= PICKEM_PICK_LIMIT ? "text-red-400" : "text-slate-400"
              }`}>/10</span>
            </motion.span>
          </div>
        </motion.div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex w-full items-center justify-between rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-2 py-1.5 text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35">
            <button
              type="button"
              onClick={() => {
                setSelectedDate((current) => shiftDateKey(current, -1));
                setSubmitMessage("");
                setErrorMessage("");
              }}
              className="tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff7ea]/24 text-base font-black text-[#fff7ea] transition-all active:scale-95 active:brightness-90"
              aria-label="Previous day"
            >
              ◀
              {hasPreviousUnclaimedPicks ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">
                  !
                </span>
              ) : null}
            </button>
            <span className="text-center text-xs font-semibold sm:text-sm">
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
              className="tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff7ea]/24 text-base font-black text-[#fff7ea] transition-all active:scale-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next day"
            >
              ▶
              {hasFutureUnclaimedPicks ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">
                  !
                </span>
              ) : null}
            </button>
          </div>
          {selectedSportSlug === "nfl" && nflWeekOptions.length > 0 ? (
            <>
              <label htmlFor="pickem-nfl-week" className="text-xs font-medium text-ht-fg-secondary">
                NFL Week:
              </label>
              <select
                id="pickem-nfl-week"
                value={nflWeekStartDate}
                onChange={(event) => {
                  setNflWeekStartDate(event.target.value);
                  setSubmitMessage("");
                }}
                className="tp-clean-button rounded-lg border border-ht-border-soft bg-ht-surface px-2 py-1 text-xs text-ht-fg-primary sm:text-sm"
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
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300 border border-amber-400/30">
              Browse only
            </span>
          ) : null}
        </div>

        {isViewingToday ? (
          <div className="mt-4 w-full overflow-x-auto pb-1 [scrollbar-width:thin] touch-pan-x overscroll-x-contain">
            <div className="inline-flex w-max min-w-full gap-2 pr-1">
              {loadingSports ? (
                <BouncingBallLoader size="sm" label="Loading sports..." />
              ) : sports.length === 0 ? (
                <p className="text-sm text-ht-fg-muted">No sports available.</p>
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
                      className={`tp-clean-button inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                        isSelected
                          ? "border-indigo-700 bg-indigo-600 text-white shadow-md shadow-indigo-300"
                          : isDisabled
                          ? "cursor-not-allowed border-ht-border-hairline bg-ht-surface text-ht-fg-muted opacity-50"
                          : "border-ht-border-soft bg-ht-elevated text-ht-fg-secondary hover:border-indigo-400/60"
                      } ${flashingSportSlug === item.slug ? "sport-pop" : ""}`}
                    >
                      <span aria-label={item.label} className="text-3xl sm:text-4xl">{getSportIcon(item.slug)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

      </section>

      <div className="sticky top-0 z-30 mb-3 flex w-full items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (venueId) {
              navigateBackToVenue({
                venuePath: `/venue/${encodeURIComponent(venueId)}`,
                fallbackNavigate: () => { window.location.href = `/venue/${encodeURIComponent(venueId)}`; },
              });
            }
          }}
          className="tp-clean-button inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
        >
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">←</span>
          Back to Venue
        </button>
        <button
          type="button"
          data-pickem-bank-collect
          onClick={() => void collectBankPoints()}
          disabled={isCollectingBank || !userId || !venueId || collectablePoints === 0}
          className={`tp-clean-button inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border border-[#2b1c57] bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] px-4 py-2.5 text-sm font-semibold text-[#f7f1ff] shadow-sm shadow-[#2b1c57]/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f4de8]/60 active:scale-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-55 ${goldFlash ? "pickem-gold-flash" : ""}`}
        >
          <GoldCoinIcon className="h-5 w-5" />
          {isCollectingBank
            ? "Collecting..."
            : `Collect Points (${collectablePoints.toLocaleString()})`}
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-ht-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-400 sm:p-3 sm:text-sm">{errorMessage}</div>
      ) : null}

      {submitMessage ? (
        <div className="rounded-ht-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs text-amber-300 sm:p-3 sm:text-sm">{submitMessage}</div>
      ) : null}

      {!isViewingToday ? (
        loadingPickHistory ? (
          <BouncingBallLoader size="sm" label="Loading your picks..." />
        ) : historicalPicks.length === 0 ? (
          <div className="rounded-ht-xl border border-ht-border-hairline bg-ht-surface p-2.5 text-xs text-ht-fg-muted sm:p-3 sm:text-sm">
            No picks found for this date.
          </div>
        ) : (
          <section className="rounded-ht-2xl border border-indigo-400/40 bg-ht-surface p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ht-fg-secondary sm:text-sm">Your Picks</h3>
              <span className="text-[11px] font-medium text-ht-fg-muted">{historicalPicks.length} picks</span>
            </div>
            <ul className="space-y-3">
              {historicalPicks.map((pick) => {
                const statusClass =
                  pick.status === "won"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                    : pick.status === "lost"
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-400"
                    : pick.status === "pending"
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                    : "border-ht-border-soft bg-ht-surface text-ht-fg-muted";
                return (
                  <li key={pick.id} className="rounded-ht-xl border border-ht-border-hairline bg-ht-elevated p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ht-fg-primary">
                        <span className="mr-1.5" aria-hidden="true">{getSportIcon(pick.sportSlug)}</span>
                        {pick.league}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusClass}`}>
                        {pick.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-ht-fg-secondary">{pick.awayTeam} at {pick.homeTeam}</p>
                    <p className="mt-1 text-xs text-ht-fg-muted">
                      {new Date(pick.startsAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-ht-fg-secondary">Your pick: {pick.selectedTeam}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : loadingGames ? (
        <BouncingBallLoader size="sm" label="Loading games..." />
      ) : !sport ? (
        <div className="rounded-ht-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs text-amber-300 sm:p-3 sm:text-sm">
          Choose a sport to load today&apos;s games.
        </div>
      ) : !sport.isClickable && sport.slug !== "nfl" ? (
        <div className="rounded-ht-xl border border-ht-border-soft bg-ht-surface p-2.5 text-xs text-ht-fg-muted sm:p-3 sm:text-sm">
          {sport.label} Pick &apos;Em is coming soon.
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-ht-xl border border-ht-border-hairline bg-ht-surface p-2.5 text-xs text-ht-fg-muted sm:p-3 sm:text-sm">
          Sorry, no games available. Check back later!
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([league, leagueGames]) => (
            <section key={league} className="rounded-2xl border border-indigo-400/40 bg-slate-900 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ht-fg-secondary sm:text-sm">{league}</h3>
                <span className="text-[11px] font-medium text-ht-fg-muted">{leagueGames.length} games</span>
              </div>

              <ul className="mt-4 space-y-4">
                {leagueGames.map((game) => {
                  renderedPickEmCardCount += 1;
                  const isLastGame = renderedPickEmCardCount === totalPickEmGames;
                  const shouldRenderAdBreak =
                    renderedPickEmCardCount <= 30 &&
                    (
                      renderedPickEmCardCount % 5 === 0 ||
                      (isLastGame && renderedPickEmCardCount % 5 !== 0)
                    );
                  const sequenceIndex = shouldRenderAdBreak ? Math.ceil(renderedPickEmCardCount / 5) : 1;
                  const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
                  const baseDisabled = !sport.isClickable || !userId || !venueId || !isViewingToday;
                  const awaySelected = displayedPickTeam === game.awayTeam;
                  const homeSelected = displayedPickTeam === game.homeTeam;
                  const pickLimitReached = pickCount >= PICKEM_PICK_LIMIT;
                  const disableAwaySelection = baseDisabled || (pickLimitReached && !awaySelected && !homeSelected);
                  const disableHomeSelection = baseDisabled || (pickLimitReached && !awaySelected && !homeSelected);

                  return (
                    <Fragment key={game.id}>
                      <li className="rounded-xl border border-indigo-400/60 bg-slate-900 border-l-4 border-l-indigo-500 p-4 sm:p-5">
                        {/* Scoreboard — team name rows are the pick action */}
                        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-ht-fg-muted">Tap to pick</span>
                            <span className="text-sm font-semibold text-slate-300 sm:text-base">
                              {formatLocalStartTime(game.startsAt)}
                            </span>
                          </div>
                          <div className="divide-y divide-slate-700">
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
                              className={`tp-clean-button w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3.5 text-left transition-all sm:py-4 ${
                                disableAwaySelection ? "cursor-not-allowed opacity-40" : ""
                              } ${
                                awaySelected
                                  ? "bg-cyan-500/15"
                                  : "hover:bg-slate-700/50"
                              } ${pickPulseByGameId[game.id] === game.awayTeam ? "scale-[1.01] shadow-[inset_0_0_0_2px_rgba(34,211,238,0.3)]" : ""}`}
                            >
                              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${awaySelected ? "border-cyan-400 bg-cyan-400" : "border-slate-600 bg-transparent"}`}>
                                {awaySelected ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-slate-950" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                  </svg>
                                ) : null}
                              </span>
                              <span className={`text-sm font-bold sm:text-base ${awaySelected ? "text-cyan-100" : "text-slate-200"}`}>{game.awayTeam}</span>
                              <span className={`text-base font-black tabular-nums sm:text-lg ${awaySelected ? "text-cyan-200" : "text-slate-400"}`}>{getDisplayedScoreCell(game, game.awayTeam, game.awayScore)}</span>
                            </button>
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
                              className={`tp-clean-button w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3.5 text-left transition-all sm:py-4 ${
                                disableHomeSelection ? "cursor-not-allowed opacity-40" : ""
                              } ${
                                homeSelected
                                  ? "bg-cyan-500/15"
                                  : "hover:bg-slate-700/50"
                              } ${pickPulseByGameId[game.id] === game.homeTeam ? "scale-[1.01] shadow-[inset_0_0_0_2px_rgba(34,211,238,0.3)]" : ""}`}
                            >
                              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${homeSelected ? "border-cyan-400 bg-cyan-400" : "border-slate-600 bg-transparent"}`}>
                                {homeSelected ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-slate-950" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                  </svg>
                                ) : null}
                              </span>
                              <span className={`text-sm font-bold sm:text-base ${homeSelected ? "text-cyan-100" : "text-slate-200"}`}>{game.homeTeam}</span>
                              <span className={`text-base font-black tabular-nums sm:text-lg ${homeSelected ? "text-cyan-200" : "text-slate-400"}`}>{getDisplayedScoreCell(game, game.homeTeam, game.homeScore)}</span>
                            </button>
                          </div>
                        </div>
                        {displayedPickTeam ? (
                          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-400">
                            Pick locked in
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {game.status === "live" ? (
                            <>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-white">
                                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                Live
                              </span>
                              {game.periodLabel ? (
                                <span className="text-[11px] font-semibold text-ht-fg-muted">{game.periodLabel}</span>
                              ) : null}
                            </>
                          ) : game.status === "final" ? (
                            <span className="inline-flex items-center rounded-full border border-ht-border-soft bg-ht-elevated-2 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-ht-fg-muted">
                              Final
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-ht-fg-muted">Picks open</span>
                          )}
                          {game.isLocked && game.status === "live" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-400">
                              <span aria-hidden="true">🔒</span> Picks locked
                            </span>
                          ) : null}
                        </div>

                        {resultLabel(game) ? (
                          <p
                            className={`mt-1 text-xs font-semibold ${
                              game.userPickStatus === "won"
                                ? "text-emerald-400"
                                : game.userPickStatus === "lost"
                                ? "text-rose-400"
                                : "text-ht-fg-muted"
                            }`}
                          >
                            {resultLabel(game)}
                          </p>
                        ) : null}
                        {game.userPickStatus === "pending" ? (
                          <p className="mt-1 text-xs font-semibold text-ht-fg-muted">Pick submitted. Awaiting final result.</p>
                        ) : null}

                        {game.userPickStatus === "won" && !game.userPickRewardClaimedAt ? (
                          <p className="mt-2 text-xs font-semibold text-ht-cyan-400">
                            Settled correct pick. Points are available in your Points Bank.
                          </p>
                        ) : null}
                        {game.userPickStatus === "won" && game.userPickRewardClaimedAt ? (
                          <p className="mt-2 text-xs font-semibold text-ht-cyan-400">
                            Points collected via Points Bank.
                          </p>
                        ) : null}
                      </li>
                      {shouldRenderAdBreak ? (
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
                      ) : null}
                    </Fragment>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

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
