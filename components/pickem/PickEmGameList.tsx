"use client";

import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

import { haptic } from "@/lib/haptics";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { GameAppBar } from "@/components/venue/AppBar";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import { getUserId, getVenueId } from "@/lib/storage";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { CoinFXCanvas } from "@/components/ui/CoinFXCanvas";
import { ShareWinButton } from "@/components/social-share/ShareWinButton";
import type { AdSlot } from "@/types";
import { COLLEGE_FOOTBALL_SPREAD_COPY, NFL_PICKEM_SIGNPOST } from "@/lib/pickemCollegeFootball";
import { formatSpreadLine } from "@/lib/spreadLines";
import { PickEmPrizeTiebreakerCard } from "@/components/pickem/PickEmPrizeTiebreakerCard";
import { pickemPrizeLineText, type PickEmGamePrize } from "@/lib/pickemPrizeLine";

// Historical regular Pick 'Em rows can still be NFL rows from before the
// dedicated game split, even though NFL is no longer a selectable sport here.
type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "ncaaf" | "nfl" | "mma" | "tennis";

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
  // College Football only (plan Phase 3): the rule, the line, and "no line yet = can't pick".
  scoringMode?: "standard" | "spread";
  homeSpread?: number | null;
  awaySpread?: number | null;
  lineComingSoon?: boolean;
  // A Pick 'Em Prize's pick limit is used up: a NEW pick is refused (Phase 6).
  pickLimitReached?: boolean;
  pickLimitMessage?: string;
  userPickId?: string;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push" | "canceled";
  userPickRewardPoints?: number;
  userPickRewardClaimedAt?: string | null;
};

// Phase 9f.6: today's shared points = the won games' own pick values (same fallback as the history total).
export const todayWinPointsOf = (games: PickEmGame[]): number =>
  games.reduce(
    (sum, game) => (game.userPickStatus === "won" ? sum + Math.max(0, game.userPickRewardPoints || 10) : sum),
    0
  );

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
  today?: PickEmTodaySummary;
  collegeScoring?: CollegeScoring;
  prizes?: PickEmGamePrize[];
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

type CollegeScoring = { mode: "standard" | "spread"; linesUnavailable: boolean };

// Today's regular picks at this venue; the points are already paid (no Collect, no bonus).
type PickEmTodaySummary = {
  localDate: string;
  picks: number;
  pending: number;
  correct: number;
  points: number;
};

/**
 * Points for the user's won picks that were PAID between two loads of the same list (Phase 7.5.2,
 * F19): grading and payment are separate steps, so a graded-but-unpaid pick shows its result but
 * adds nothing to the header until a later load sees its payment stamp.
 */
export const newlyWonPointsOf = (previous: Map<string, PickEmGame>, next: PickEmGame[]): number =>
  next.reduce((sum, game) => {
    const before = previous.get(game.id);
    if (!before || before.userPickRewardClaimedAt || game.userPickStatus !== "won" || !game.userPickRewardClaimedAt) {
      return sum;
    }
    return sum + Math.max(0, game.userPickRewardPoints || 10);
  }, 0);

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
  nhl: "🏒",
  ncaaf: "🏈",
  mma: "🥊",
  tennis: "🎾",
};
const PICKEM_INLINE_SLOTS: Record<number, AdSlot> = {
  1: "pickem-inline-cards-1-5",
  2: "pickem-inline-cards-6-10",
  3: "pickem-inline-cards-11-15",
  4: "pickem-inline-cards-16-20",
  5: "pickem-inline-cards-21-25",
  6: "pickem-inline-cards-26-30",
};

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
    return game.scoringMode === "spread" ? COLLEGE_FOOTBALL_SPREAD_COPY.push : "Push (tie game)";
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

export function PickEmGameList({ initialSportSlug = "", initialDate = "", onBack }: { initialSportSlug?: string; initialDate?: string; onBack?: () => void }) {
  const reducedMotion = useReducedMotion();
  const normalizedInitialSportSlug = String(initialSportSlug ?? "").trim().toLowerCase();
  const todayDateKey = getLocalDateKey();
  const router = useRouter();
  const venuePresence = useVenuePresence();
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const savingGamesRef = useRef(new Set<string>());
  const [savingGames, setSavingGames] = useState<Set<string>>(new Set());
  const [savedMessage, setSavedMessage] = useState("");
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
  const refreshTimerRef = useRef<number | null>(null);
  const [pickPulseByGameId, setPickPulseByGameId] = useState<Record<string, string | undefined>>({});
  const [today, setToday] = useState<PickEmTodaySummary | null>(null);
  const [collegeScoring, setCollegeScoring] = useState<CollegeScoring | null>(null);
  const [prizes, setPrizes] = useState<PickEmGamePrize[]>([]);
  const [gradedToast, setGradedToast] = useState<{ points: number; id: number } | null>(null);
  const [flashingSportSlug, setFlashingSportSlug] = useState("");
  const [lastDebugProbes, setLastDebugProbes] = useState<
    Array<{ sportKey: string; path: string; url: string; statusCode: number; bodyPreview: string }>
  >([]);
  const [isMounted, setIsMounted] = useState(false);
  const [pickHistory, setPickHistory] = useState<PickEmPickHistoryItem[]>([]);
  const [loadingPickHistory, setLoadingPickHistory] = useState(false);
  const toastIdRef = useRef(0);
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
    const linkUrl = `${window.location.pathname}${window.location.search}`;
    void fetch("/api/notifications/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, game: "pickem", linkUrl }),
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

        const initialMatch = nextSports.find(
          (item) => item.slug === normalizedInitialSportSlug && item.isClickable
        );
        const nextDefault = initialMatch?.slug ?? nextSports.find((item) => item.isClickable)?.slug ?? "";
        setSelectedSportSlug((current) =>
          nextSports.some((item) => item.slug === current && item.isClickable) ? current : nextDefault
        );
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
          // A pick paid while the screen is open (no Collect): show "+10" and let the header
          // catch up. Graded but not yet paid = no toast until the payment lands.
          const gradedPoints = background ? newlyWonPointsOf(latestGameMapRef.current, nextGames) : 0;
          setGames(nextGames);
          if (gradedPoints > 0) {
            toastIdRef.current += 1;
            setGradedToast({ points: gradedPoints, id: toastIdRef.current });
            window.dispatchEvent(
              new CustomEvent("tp:points-updated", { detail: { source: "pickem-graded", delta: gradedPoints } })
            );
          }
        }
        setToday(payload.today ?? null);
        setCollegeScoring(payload.collegeScoring ?? null);
        setPrizes(payload.prizes ?? []);
        setLastDebugProbes(payload.debug?.probes ?? []);
        if (!background) {
          setErrorMessage("");
        }
      } catch (error) {
        setLastDebugProbes([]);
        const message = error instanceof Error ? error.message : "Failed to load Pick 'Em games.";
        if (!background || gamesRef.current.length === 0) {
          setErrorMessage(message);
        }
      } finally {
        if (!effectiveBackground) {
          setLoadingGames(false);
        }
      }
    },
    [selectedDate, selectedSportSlug, userId, venueId]
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

  // Phase 9c: the points of the picks already graded correct on the screen (no new request).
  const historyWinPoints = useMemo(
    () =>
      historicalPicks
        .filter((pick) => pick.status === "won")
        .reduce((sum, pick) => sum + Math.max(0, pick.rewardPoints || 10), 0),
    [historicalPicks]
  );
  const todayWinPoints = useMemo(() => todayWinPointsOf(games), [games]);
  const FALLBACK_PRIZE_LIMIT_MESSAGE = "You've used all your prize picks.";

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
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      const payload = (await response.json()) as { ok: boolean; code?: string; error?: string; userMessage?: string };
      const presenceFailure = venuePresence.capturePresenceFailure(payload);
      if (presenceFailure) {
        throw new Error(presenceFailure.userMessage);
      }
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to save your pick.");
      }
    },
    [selectedDate, selectedSportSlug, userId, venueId, venuePresence]
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

      const payload = (await response.json()) as { ok: boolean; code?: string; error?: string; userMessage?: string };
      const presenceFailure = venuePresence.capturePresenceFailure(payload);
      if (presenceFailure) {
        throw new Error(presenceFailure.userMessage);
      }
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to clear your pick.");
      }
    },
    [userId, venuePresence]
  );

  const submitPick = useCallback(
    async (game: PickEmGame, pickTeam: string) => {
      if (savingGamesRef.current.has(game.id)) return;
      if (!userId || !venueId) { setSubmitMessage("Join a venue first to submit Pick 'Em selections."); return; }
      if (!isViewingToday) { setSubmitMessage("You can only place picks for today. Switch back to today to make picks."); return; }
      if (venuePresence.isInteractionBlocked) return;
      const previousTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
      const isDeselect = previousTeam === pickTeam;
      savingGamesRef.current.add(game.id);
      setSavingGames(new Set(savingGamesRef.current));
      setSavedMessage("");
      setSubmitMessage("");
      haptic("selection");
      const applySelection = (team: string | undefined) => {
        setGames((current) => current.map((row) => row.id === game.id ? { ...row, userPickTeam: team, userPickStatus: "pending" } : row));
        setOptimisticPickByGame((current) => {
          const next = { ...current };
          if (team) next[game.id] = team; else delete next[game.id];
          return next;
        });
      };
      applySelection(isDeselect ? undefined : pickTeam);
      setPickPulseByGameId((current) => ({ ...current, [game.id]: isDeselect ? undefined : pickTeam }));
      window.setTimeout(() => setPickPulseByGameId((current) => ({ ...current, [game.id]: undefined })), 420);
      try {
        if (isDeselect) await clearPickRequest(game.id); else await submitPickRequest(game.id, pickTeam);
        setSavedMessage("Pick saved");
        scheduleBackgroundRefresh();
      } catch (error) {
        applySelection(previousTeam);
        setSubmitMessage(error instanceof Error ? error.message : "Failed to save your pick.");
      } finally {
        savingGamesRef.current.delete(game.id);
        setSavingGames(new Set(savingGamesRef.current));
      }
    },
    [clearPickRequest, submitPickRequest, isViewingToday, optimisticPickByGame, scheduleBackgroundRefresh, userId, venueId, venuePresence.isInteractionBlocked]
  );

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

  const totalPickEmGames = grouped.reduce((sum, [, leagueGames]) => sum + leagueGames.length, 0);
  let renderedPickEmCardCount = 0;

  return (
    <div className="tp-pickem-compact min-h-[100dvh] touch-pan-y pb-[max(env(safe-area-inset-bottom),6px)]">
      <CoinFXCanvas />
      <style>{`
        @keyframes sport-pop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.08); box-shadow: 0 0 0 5px rgb(var(--ht-pickem-accent-rgb) / 0.34); }
          65%  { transform: scale(0.98); }
          100% { transform: scale(1); }
        }
        @keyframes pickem-gold-flash {
          0% { box-shadow: 0 0 0 rgba(250,204,21,0); }
          25% { box-shadow: 0 0 0 6px rgba(250,204,21,0.45), 0 0 32px rgba(250,204,21,0.35); }
          100% { box-shadow: 0 0 0 rgba(250,204,21,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sport-pop, .pickem-gold-flash { animation: none !important; }
        }
        .sport-pop { animation: sport-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
        .pickem-gold-flash { animation: pickem-gold-flash 700ms ease-out; }
      `}</style>

      <GameAppBar game="pickem" onExit={onBack} />

      <div className="space-y-3 px-2 pt-2">
        <section className="rounded-2xl border border-ht-pickem-card-edge bg-ht-surface px-3 py-3 shadow-ht-panel">
          <h2
            className="text-[20px] leading-none text-ht-pickem-accent"
            style={{ fontFamily: "var(--ht-font-display)" }}
          >
            Hightop Pick &apos;Em
          </h2>
          <p className="mt-2 text-footnote font-semibold leading-relaxed text-ht-fg-muted">
            Select winners by checking a team. Picks lock at scheduled start time and are final.
          </p>

          {isViewingToday ? (
            <p className="mt-1 text-footnote font-semibold text-ht-fg-muted" aria-live="polite">
              {today && today.picks > 0
                ? `Today: ${today.correct} right · +${today.points} points`
                : "Every correct pick is worth 10 points, added automatically."}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex w-full items-center justify-between rounded-xl border border-ht-pickem-bar-edge bg-ht-pickem-bar-bg px-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate((current) => shiftDateKey(current, -1));
                  setSubmitMessage("");
                  setErrorMessage("");
                }}
                className="tp-player-hit-target tp-player-pressable tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-ht-pickem-accent/45 bg-ht-chip-fill/65 text-ht-pickem-accent"
                aria-label="Previous day"
              >
                ◀
              </button>
              <span className="text-xs font-extrabold tracking-[0.02em] text-ht-fg-primary">
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
                className="tp-player-hit-target tp-player-pressable tp-clean-button relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-ht-pickem-accent/30 bg-ht-chip-fill/55 text-ht-pickem-accent disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Next day"
              >
                ▶
              </button>
            </div>

            {!userId || !venueId ? (
              <span className="rounded-full border border-amber-300/35 bg-amber-400/10 px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.08em] text-ht-warn-fg">
                Browse only
              </span>
            ) : null}
          </div>

          {isViewingToday ? (
            <div className="mt-3 w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
              <div className="grid min-w-full grid-cols-7 gap-2">
                {loadingSports ? (
                  <HightopLoader size="sm" variant="card" showLabel label="Loading sports..." />
                ) : sports.length === 0 ? (
                  <p className="text-xs text-ht-fg-muted">No sports available.</p>
                ) : (
                  sports.map((item) => {
                    const isSelected = selectedSportSlug === item.slug;
                    const isDisabled = !item.isClickable;
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
                        className={"tp-player-hit-target tp-player-pressable " + (`tp-clean-button inline-flex h-12 w-full items-center justify-center rounded-full border p-0 text-2xl leading-none ${
                          isSelected
                            ? "border-ht-pickem-accent bg-ht-pickem-accent text-ht-pickem-on-fill"
                            : isDisabled
                            ? "cursor-not-allowed border-ht-overlay/10 bg-ht-overlay/[0.03] text-slate-600 opacity-60"
                            : "border-ht-overlay/15 bg-ht-overlay/[0.03] text-ht-fg-muted"
                        } ${flashingSportSlug === item.slug ? "sport-pop" : ""}`)}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <span aria-hidden="true">{getSportIcon(item.slug)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-caption text-ht-fg-muted" data-testid="pickem-nfl-signpost">
                {NFL_PICKEM_SIGNPOST.text}{" "}
                <Link href={NFL_PICKEM_SIGNPOST.href} className="font-semibold text-ht-pickem-accent underline-offset-2 hover:underline">
                  {NFL_PICKEM_SIGNPOST.linkLabel}
                </Link>
              </p>
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <div className="rounded-xl border border-rose-500/45 bg-ht-danger-wash px-3 py-2 text-xs font-semibold text-ht-danger-fg" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <span role="status" className="sr-only">{savedMessage}</span>
      {submitMessage ? (
          <div className="rounded-xl border border-amber-400/45 bg-ht-warn-wash px-3 py-2 text-xs font-semibold text-ht-warn-fg" role="alert">
            {submitMessage}
          </div>
        ) : null}

        {!isViewingToday ? (
          loadingPickHistory ? (
            <HightopLoader size="sm" variant="card" showLabel label="Loading your picks..." />
          ) : historicalPicks.length === 0 ? (
            <div className="rounded-xl border border-ht-overlay/10 bg-ht-overlay/[0.03] px-3 py-2 text-xs text-ht-fg-muted">
              No picks found for this date.
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <h3 className="text-caption font-black uppercase tracking-[0.16em] text-ht-pickem-accent">Your Picks</h3>
                <span className="text-caption font-bold tracking-[0.03em] text-ht-fg-faint">{historicalPicks.length} picks</span>
              </div>
              {historyWinPoints > 0 ? (
                <ShareWinButton gameType="pickem" result={{ finalPoints: historyWinPoints, isChampion: true }} />
              ) : null}
              <ul className="space-y-2.5">
                {historicalPicks.map((pick) => {
                  const statusClass =
                    pick.status === "won"
                      ? "border-emerald-500/45 bg-emerald-500/15 text-ht-success-fg"
                      : pick.status === "lost"
                      ? "border-rose-500/45 bg-rose-500/15 text-ht-danger-fg"
                      : pick.status === "pending"
                      ? "border-amber-400/45 bg-amber-500/15 text-ht-warn-fg"
                      : "border-ht-overlay/10 bg-ht-overlay/[0.04] text-ht-fg-muted";
                  return (
                    <li key={pick.id} className="rounded-xl border border-ht-overlay/10 bg-ht-overlay/[0.03] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-ht-fg-strong">
                          <span className="mr-1" aria-hidden="true">{getSportIcon(pick.sportSlug)}</span>
                          {pick.league}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-caption font-black uppercase tracking-[0.08em] ${statusClass}`}>
                          {pick.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-ht-fg-soft">{pick.awayTeam} at {pick.homeTeam}</p>
                      <p className="mt-1 text-caption text-ht-fg-faint">{formatLocalStartTime(pick.startsAt)}</p>
                      <p className="mt-1.5 text-caption font-semibold text-ht-fg-muted">Your pick: {pick.selectedTeam}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        ) : loadingGames ? (
          <HightopLoader size="sm" variant="card" showLabel label="Loading games..." />
        ) : !sport ? (
          <div className="rounded-xl border border-amber-400/45 bg-ht-warn-wash px-3 py-2 text-xs text-ht-warn-fg">
            Choose a sport to load today&apos;s games.
          </div>
        ) : !sport.isClickable ? (
          <div className="rounded-xl border border-ht-overlay/10 bg-ht-overlay/[0.03] px-3 py-2 text-xs text-ht-fg-muted">
            {sport.label} Pick &apos;Em is coming soon.
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-ht-overlay/10 bg-ht-overlay/[0.03] px-3 py-2 text-xs text-ht-fg-muted">
            Sorry, no games available. Check back later!
          </div>
        ) : (
          <div className="space-y-4 pb-1">
            {sport.slug === "ncaaf" && collegeScoring?.mode === "spread" ? (
              <p className="px-1 text-caption font-semibold text-ht-fg-muted" data-testid="pickem-spread-explainer">
                {COLLEGE_FOOTBALL_SPREAD_COPY.explainer}
              </p>
            ) : null}
            {prizes.length > 0 ? (
              <div className="space-y-1 px-1" data-testid="pickem-prize-lines">
                {prizes.map((prize) => (
                  <div key={prize.campaignId}>
                    <p className="text-caption font-bold text-ht-pickem-accent">{pickemPrizeLineText(prize)}</p>
                    {prize.limitMessage ? (
                      <p className="text-caption font-semibold text-ht-fg-muted" role="status">
                        {prize.limitMessage}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {userId && venueId && isViewingToday
              ? prizes
                  .filter((prize) => prize.hasTiebreaker)
                  .map((prize) => (
                    <PickEmPrizeTiebreakerCard key={prize.campaignId} venueId={venueId} userId={userId} campaignId={prize.campaignId} />
                  ))
              : null}
            {todayWinPoints > 0 ? (
              <ShareWinButton gameType="pickem" result={{ finalPoints: todayWinPoints, isChampion: true }} />
            ) : null}
            {grouped.map(([league, leagueGames]) => (
              <section key={league}>
                <div className="mb-2 flex items-end justify-between">
                  <h3 className="text-caption font-black uppercase tracking-[0.16em] text-ht-pickem-accent">{league}</h3>
                  <span className="text-caption font-bold tracking-[0.03em] text-ht-fg-faint">{leagueGames.length} games</span>
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
                    const lineComingSoon = game.lineComingSoon === true;
                    // A used-up prize limit refuses only a NEW pick; changing or clearing one is always allowed.
                    const limitReached = game.pickLimitReached === true && !displayedPickTeam;
                    const blockedMessage = lineComingSoon
                      ? COLLEGE_FOOTBALL_SPREAD_COPY.noLineYet
                      : limitReached
                        ? game.pickLimitMessage ?? FALLBACK_PRIZE_LIMIT_MESSAGE
                        : null;
                    const disableAwaySelection = baseDisabled || lineComingSoon || limitReached;
                    const disableHomeSelection = baseDisabled || lineComingSoon || limitReached;
                    const awayLine = game.scoringMode === "spread" ? formatSpreadLine(game.awaySpread) : null;
                    const homeLine = game.scoringMode === "spread" ? formatSpreadLine(game.homeSpread) : null;
                    const isAwayWinner = game.winnerTeam === game.awayTeam;
                    const isHomeWinner = game.winnerTeam === game.homeTeam;
                    const statusLabel = getGameStatusLabel(game);

                    return (
                      <Fragment key={game.id}>
                        <li className="overflow-hidden rounded-xl border border-ht-ticket-edge shadow-ht-panel [background:var(--ht-ticket-bg)]">
                          <div className="flex items-center justify-between border-b border-ht-ticket-rule [border-bottom-style:var(--ht-ticket-rule-style)] px-4 py-2">
                            <span className="text-caption font-black uppercase tracking-[0.16em] text-ht-pickem-accent">{league}</span>
                            <span
                              className={`inline-flex items-center gap-1 text-caption font-extrabold ${
                                game.status === "live" ? "text-ht-success-fg" : "text-ht-ticket-meta"
                              }`}
                            >
                              {game.status === "live" ? (
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
                              ) : null}
                              {savingGames.has(game.id) ? <><ButtonSpinner /> Saving…</> : statusLabel}
                            </span>
                          </div>
                          <span role="status" className="sr-only">{savingGames.has(game.id) ? "Saving…" : ""}</span>
                          <div className="flex overflow-hidden bg-ht-ticket-halves">
                            <button
                              type="button"
                              aria-disabled={disableAwaySelection}
                              disabled={savingGames.has(game.id)}
                              aria-busy={savingGames.has(game.id)}
                              onClick={() => {
                                if (blockedMessage && !baseDisabled) {
                                  setSubmitMessage(blockedMessage);
                                  return;
                                }
                                if (disableAwaySelection) {
                                  return;
                                }
                                if (game.isLocked) {
                                  setSubmitMessage("This game is locked because it has already started.");
                                  return;
                                }
                                void submitPick(game, game.awayTeam);
                              }}
                              style={{ touchAction: "manipulation" }}
                              className={"tp-player-hit-target tp-player-pressable " + (`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
                                disableAwaySelection ? "cursor-not-allowed opacity-45" : ""
                              } ${
                                awaySelected ? "bg-ht-pickem-picked" : "bg-ht-ticket-away"
                              } ${pickPulseByGameId[game.id] === game.awayTeam ? "scale-[1.01]" : ""}`)}
                            >
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
                                  awaySelected
                                    ? "rotate-[-7deg] border border-ht-pickem-accent bg-ht-pickem-accent text-ht-pickem-on-fill"
                                    : "border border-ht-ticket-box-edge bg-ht-ticket-box-bg text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-ht-fg-bright">
                                {game.awayTeam}
                              </span>
                              {awayLine ? (
                                <span className="text-footnote font-extrabold tabular-nums text-ht-pickem-accent" aria-label={`Spread ${awayLine}`}>
                                  {awayLine}
                                </span>
                              ) : null}
                              <span className={`text-[16px] font-black tabular-nums ${isAwayWinner ? "text-ht-success-fg" : "text-ht-fg-secondary"}`}>
                                {getDisplayedScoreCell(game, game.awayTeam, game.awayScore)}
                              </span>
                            </button>
                            <div className="w-px shrink-0 bg-ht-ticket-divider" />
                            <button
                              type="button"
                              aria-disabled={disableHomeSelection}
                              disabled={savingGames.has(game.id)}
                              aria-busy={savingGames.has(game.id)}
                              onClick={() => {
                                if (blockedMessage && !baseDisabled) {
                                  setSubmitMessage(blockedMessage);
                                  return;
                                }
                                if (disableHomeSelection) {
                                  return;
                                }
                                if (game.isLocked) {
                                  setSubmitMessage("This game is locked because it has already started.");
                                  return;
                                }
                                void submitPick(game, game.homeTeam);
                              }}
                              style={{ touchAction: "manipulation" }}
                              className={"tp-player-hit-target tp-player-pressable " + (`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
                                disableHomeSelection ? "cursor-not-allowed opacity-45" : ""
                              } ${
                                homeSelected ? "bg-ht-pickem-picked" : "bg-ht-ticket-home"
                              } ${pickPulseByGameId[game.id] === game.homeTeam ? "scale-[1.01]" : ""}`)}
                            >
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
                                  homeSelected
                                    ? "rotate-[-7deg] border border-ht-pickem-accent bg-ht-pickem-accent text-ht-pickem-on-fill"
                                    : "border border-ht-ticket-box-edge bg-ht-ticket-box-bg text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-ht-fg-bright">
                                {game.homeTeam}
                              </span>
                              {homeLine ? (
                                <span className="text-footnote font-extrabold tabular-nums text-ht-pickem-accent" aria-label={`Spread ${homeLine}`}>
                                  {homeLine}
                                </span>
                              ) : null}
                              <span className={`text-[16px] font-black tabular-nums ${isHomeWinner ? "text-ht-success-fg" : "text-ht-fg-secondary"}`}>
                                {getDisplayedScoreCell(game, game.homeTeam, game.homeScore)}
                              </span>
                            </button>
                          </div>

                          {lineComingSoon ? (
                            <div className="px-4 py-1.5 text-center text-caption font-extrabold tracking-[0.04em] text-ht-fg-muted" data-testid="pickem-line-coming-soon">
                              {COLLEGE_FOOTBALL_SPREAD_COPY.lineComingSoon}
                            </div>
                          ) : null}

                          {resultLabel(game) ? (
                            <div
                              className={`px-4 py-1.5 text-caption font-extrabold tracking-[0.04em] ${
                                game.userPickStatus === "won"
                                  ? "bg-emerald-500/15 text-ht-success-fg"
                                  : "bg-rose-500/15 text-ht-danger-fg"
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
                          <div className="rounded-xl border border-dashed border-ht-overlay/15 bg-ht-overlay/[0.03] p-2">
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
      {isMounted && gradedToast
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-20 z-[7000] flex justify-center px-4">
              <motion.div
                key={gradedToast.id}
                role="status"
                className="rounded-full bg-ht-pickem-accent px-4 py-2 text-footnote font-black text-ht-pickem-on-fill shadow-ht-panel"
                initial={reducedMotion ? false : { opacity: 0, y: -8 }}
                animate={reducedMotion ? { opacity: [1, 1, 0] } : { opacity: [0, 1, 1, 0], y: [-8, 0, 0, -4] }}
                transition={reducedMotion ? { duration: 2.4, times: [0, 0.9, 1] } : { duration: 2.4, times: [0, 0.12, 0.85, 1] }}
                onAnimationComplete={() => setGradedToast(null)}
              >
                {`+${gradedToast.points} points`}
              </motion.div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
