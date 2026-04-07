"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calculatePoints, formatProbability } from "@/lib/predictions";
import { getUserId, getVenueId } from "@/lib/storage";
import type { Prediction, UserPrediction } from "@/types";

type SubmitState = Record<string, string>;
type PopupState = Record<string, string>;

type PredictionListPayload = {
  ok: boolean;
  items?: Prediction[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  categories?: string[];
  trendingCategories?: string[];
  broadCategories?: string[];
  sports?: string[];
  leaguesBySport?: Record<string, string[]>;
  excludeSensitive?: boolean;
  error?: string;
};

type UserPicksPayload = {
  ok: boolean;
  items?: UserPrediction[];
};

type PredictionQuota = {
  limit: number;
  picksUsed: number;
  picksRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass: boolean;
};

type SortKey = "closing-soon" | "newest" | "volume" | "liquidity";
type ViewMode = "grouped" | "all";
type CloseWindowKey = "all" | "today" | "this-week" | "this-month" | "this-year";
const FETCH_PAGE_SIZE = 50;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "closing-soon", label: "Closing Soon" },
  { value: "newest", label: "Newest" },
  { value: "volume", label: "Highest Volume" },
  { value: "liquidity", label: "Highest Liquidity" },
];
const CLOSE_WINDOW_OPTIONS: Array<{ value: CloseWindowKey; label: string }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-year", label: "This Year" },
];

const SPORT_ICON_BY_NAME: Record<string, string> = {
  Football: "🏈",
  Soccer: "⚽",
  Basketball: "🏀",
  Baseball: "⚾",
  Hockey: "🏒",
  Lacrosse: "🥍",
  Tennis: "🎾",
  Golf: "⛳",
  MMA: "🥊",
  Motorsport: "🏎️",
  Cricket: "🏏",
  Rugby: "🏉",
};

function getSportIcon(sport: string): string {
  return SPORT_ICON_BY_NAME[sport] ?? "🏟️";
}

const BUTTON_POP_CLASS =
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
const COLLAPSED_SECTIONS_STORAGE_KEY = "tp:predictions:collapsed-sections:v1";

function toSectionId(label: string): string {
  return `prediction-section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "uncategorized"}`;
}

type RewardToken = {
  id: string;
  label: string;
};

function useRewards() {
  const [rewards, setRewards] = useState<RewardToken[]>([]);

  const addReward = (label: string) => {
    const reward: RewardToken = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
    };

    setRewards((prev) => [...prev.slice(-1), reward]);
    window.setTimeout(() => {
      setRewards((prev) => prev.filter((item) => item.id !== reward.id));
    }, 1100);
  };

  return { rewards, addReward };
}

function triggerHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(pattern);
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getHoursUntilClose(closesAt: string): number {
  const closeTs = +new Date(closesAt);
  if (!Number.isFinite(closeTs)) return Number.POSITIVE_INFINITY;
  return (closeTs - Date.now()) / (1000 * 60 * 60);
}

function marketMatchesCloseWindow(market: Prediction, closeWindow: CloseWindowKey): boolean {
  if (closeWindow === "all") {
    return true;
  }

  const closesAtDate = new Date(market.closesAt);
  if (Number.isNaN(closesAtDate.getTime())) {
    return false;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (closesAtDate < startOfToday) {
    return false;
  }

  if (closeWindow === "today") {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return closesAtDate < endOfToday;
  }

  if (closeWindow === "this-week") {
    const daysUntilEndOfWeek = 7 - now.getDay();
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilEndOfWeek);
    return closesAtDate < endOfWeek;
  }

  if (closeWindow === "this-month") {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return closesAtDate < endOfMonth;
  }

  const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
  return closesAtDate < endOfYear;
}

export function PredictionMarketList() {
  const router = useRouter();
  const [messages, setMessages] = useState<SubmitState>({});
  const [limitPopups, setLimitPopups] = useState<PopupState>({});
  const [pendingByMarket, setPendingByMarket] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [quota, setQuota] = useState<PredictionQuota | null>(null);
  const [quotaSecondsRemaining, setQuotaSecondsRemaining] = useState(0);

  const [allMarkets, setAllMarkets] = useState<Prediction[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [leaguesBySport, setLeaguesBySport] = useState<Record<string, string[]>>({});
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [nextPage, setNextPage] = useState(2);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const hasInitializedRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCloseWindow, setSelectedCloseWindow] = useState<CloseWindowKey>("all");
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("");
  const [sort, setSort] = useState<SortKey>("closing-soon");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [browseFiltersCollapsed, setBrowseFiltersCollapsed] = useState(false);
  const [discoverCollapsed, setDiscoverCollapsed] = useState(true);
  const [recentPicks, setRecentPicks] = useState<UserPrediction[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { rewards, addReward } = useRewards();

  const hasFilters = useMemo(
    () => Boolean(searchQuery || selectedSport || selectedLeague || selectedCloseWindow !== "all"),
    [searchQuery, selectedCloseWindow, selectedSport, selectedLeague]
  );
  const predictionsQuotaLocked = Boolean(quota && !quota.isAdminBypass && quota.picksRemaining <= 0);
  const leagueOptions = useMemo(
    () => (selectedSport ? leaguesBySport[selectedSport] ?? [] : []),
    [leaguesBySport, selectedSport]
  );
  const filteredMarkets = useMemo(
    () =>
      allMarkets.filter((market) => Boolean(market.sport) && marketMatchesCloseWindow(market, selectedCloseWindow)),
    [allMarkets, selectedCloseWindow]
  );
  const markets = filteredMarkets;
  const groupedMarketSections = useMemo(() => {
    const byLeague = new Map<string, Prediction[]>();
    for (const market of filteredMarkets) {
      const label = market.league?.trim() || `Other ${market.sport?.trim() || "Sports"}`;
      const existing = byLeague.get(label) ?? [];
      existing.push(market);
      byLeague.set(label, existing);
    }

    const fallbackOrder = [...byLeague.keys()]
      .sort((a, b) => {
        const countDiff = (byLeague.get(b)?.length ?? 0) - (byLeague.get(a)?.length ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });

    return fallbackOrder.map((label) => ({
      label,
      id: toSectionId(label),
      markets: byLeague.get(label) ?? [],
    }));
  }, [filteredMarkets]);
  const featuredMarkets = useMemo(() => {
    return [...filteredMarkets]
      .sort((a, b) => {
        const aHours = Math.abs(getHoursUntilClose(a.closesAt));
        const bHours = Math.abs(getHoursUntilClose(b.closesAt));
        if (aHours !== bHours) return aHours - bHours;
        return a.question.localeCompare(b.question, undefined, { sensitivity: "base" });
      })
      .slice(0, 6);
  }, [filteredMarkets]);
  const forYouMarkets = useMemo(() => {
    if (recentPicks.length === 0) return [];

    const recentPickMarketIds = new Set(recentPicks.map((pick) => pick.predictionId));
    const categoryScores = new Map<string, number>();

    for (const pick of recentPicks.slice(0, 30)) {
      const matched = allMarkets.find((market) => market.id === pick.predictionId);
      const matchedCategory = matched?.league?.trim() || matched?.sport?.trim();
      if (matchedCategory) {
        categoryScores.set(matchedCategory, (categoryScores.get(matchedCategory) ?? 0) + 1);
      }
    }

    const preferredCategories = [...categoryScores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
      .slice(0, 3)
      .map(([categoryName]) => categoryName);

    const pool = filteredMarkets.filter((market) => !recentPickMarketIds.has(market.id));
    const categoryMatched = preferredCategories.length
      ? pool.filter((market) => preferredCategories.includes(market.league?.trim() || market.sport?.trim() || ""))
      : [];
    const source = categoryMatched.length > 0 ? categoryMatched : pool;
    const unique = new Map<string, Prediction>();
    for (const market of source.length > 0 ? source : pool) {
      unique.set(market.id, market);
    }

    return [...unique.values()]
      .sort((a, b) => {
        const aHours = Math.abs(getHoursUntilClose(a.closesAt));
        const bHours = Math.abs(getHoursUntilClose(b.closesAt));
        if (aHours !== bHours) return aHours - bHours;
        return a.question.localeCompare(b.question, undefined, { sensitivity: "base" });
      })
      .slice(0, 6);
  }, [allMarkets, recentPicks, filteredMarkets]);

  const loadQuota = useCallback(async () => {
    if (!userId) {
      setQuota(null);
      return;
    }
    const response = await fetch(`/api/predictions/quota?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as { ok: boolean; quota?: PredictionQuota | null };
    if (payload.ok) {
      setQuota(payload.quota ?? null);
    }
  }, [userId]);
  const loadRecentPicks = useCallback(async () => {
    if (!userId) {
      setRecentPicks([]);
      return;
    }

    try {
      const response = await fetch(`/api/picks?userId=${encodeURIComponent(userId)}&status=all&pageSize=50&page=1`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as UserPicksPayload;
      if (payload.ok) {
        setRecentPicks(payload.items ?? []);
      }
    } catch {
      // Non-blocking personalization; ignore transient failures.
      setRecentPicks([]);
    }
  }, [userId]);

  useEffect(() => {
    const nextUserId = getUserId();
    const venueId = getVenueId();
    if (!nextUserId || !venueId) {
      router.replace("/");
      return;
    }
    setUserId(nextUserId);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(COLLAPSED_SECTIONS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setCollapsedSections(parsed);
      }
    } catch {
      setCollapsedSections({});
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setRecentPicks([]);
      return;
    }
    void loadRecentPicks();
  }, [loadRecentPicks, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_SECTIONS_STORAGE_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  useEffect(() => {
    if (!selectedSport && selectedLeague) {
      setSelectedLeague("");
      return;
    }

    if (selectedSport && selectedLeague && !leagueOptions.includes(selectedLeague)) {
      setSelectedLeague("");
    }
  }, [leagueOptions, selectedLeague, selectedSport]);

  useEffect(() => {
    if (!userId) {
      setQuota(null);
      return;
    }

    void loadQuota();
    const interval = window.setInterval(() => {
      void loadQuota();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadQuota, userId]);

  useEffect(() => {
    if (!predictionsQuotaLocked) {
      setQuotaSecondsRemaining(0);
      return;
    }

    setQuotaSecondsRemaining(Math.max(0, Math.floor(quota?.windowSecondsRemaining ?? 0)));
  }, [predictionsQuotaLocked, quota?.windowSecondsRemaining]);

  useEffect(() => {
    if (!predictionsQuotaLocked || quotaSecondsRemaining <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setQuotaSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [predictionsQuotaLocked, quotaSecondsRemaining]);

  useEffect(() => {
    if (!predictionsQuotaLocked || quotaSecondsRemaining > 0) {
      return;
    }

    void loadQuota();
  }, [loadQuota, predictionsQuotaLocked, quotaSecondsRemaining]);

  useEffect(() => {
    if (!hasInitializedRef.current || typeof window === "undefined") {
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [searchQuery, selectedCloseWindow, selectedLeague, selectedSport, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    if (!hasInitializedRef.current) {
      setIsInitializing(true);
    }

    const loadFirstPage = async () => {
      setLoading(true);
      setIsLoadingMore(false);
      setErrorMessage("");
      setAllMarkets([]);
      setTotalItems(0);
      setTotalPages(1);
      setNextPage(2);

      try {
        const query = new URLSearchParams({
          page: "1",
          pageSize: String(FETCH_PAGE_SIZE),
          excludeSensitive: "false",
          sort,
        });
        if (selectedSport) {
          query.set("sport", selectedSport);
        }
        if (selectedLeague) {
          query.set("league", selectedLeague);
        }
        if (searchQuery) {
          query.set("search", searchQuery);
        }
        const response = await fetch(`/api/predictions?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as PredictionListPayload;

        if (!payload.ok) {
          throw new Error(payload.error ?? "There is an error with Polymarket right now. Please try again.");
        }

        setAllMarkets((payload.items ?? []).filter((market) => Boolean(market.sport)));
        setSports(payload.sports ?? []);
        setLeaguesBySport(payload.leaguesBySport ?? {});
        setTotalItems(payload.totalItems ?? 0);
        setTotalPages(Math.max(1, payload.totalPages ?? 1));
        setNextPage((payload.page ?? 1) + 1);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setAllMarkets([]);
        setErrorMessage(
          error instanceof Error ? error.message : "There is an error with Polymarket right now. Please try again."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            setIsInitializing(false);
          }
        }
      }
    };

    void loadFirstPage();

    return () => {
      controller.abort();
    };
  }, [searchQuery, selectedLeague, selectedSport, sort]);

  const hasMorePages = nextPage <= totalPages;

  const loadMoreMarkets = useCallback(async () => {
    if (loading || isLoadingMore || !hasMorePages) {
      return;
    }

    const pageToLoad = nextPage;
    setIsLoadingMore(true);
    setErrorMessage("");

    try {
      const query = new URLSearchParams({
        page: String(pageToLoad),
        pageSize: String(FETCH_PAGE_SIZE),
        excludeSensitive: "false",
        sort,
      });
      if (selectedSport) {
        query.set("sport", selectedSport);
      }
      if (selectedLeague) {
        query.set("league", selectedLeague);
      }
      if (searchQuery) {
        query.set("search", searchQuery);
      }

      const response = await fetch(`/api/predictions?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PredictionListPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "There is an error with Polymarket right now. Please try again.");
      }

      const incoming = (payload.items ?? []).filter((market) => Boolean(market.sport));
      setAllMarkets((prev) => {
        const byId = new Set(prev.map((market) => market.id));
        const merged = [...prev];
        for (const market of incoming) {
          if (!byId.has(market.id)) {
            byId.add(market.id);
            merged.push(market);
          }
        }
        return merged;
      });
      setTotalItems(payload.totalItems ?? totalItems);
      setTotalPages(Math.max(1, payload.totalPages ?? totalPages));
      setNextPage(pageToLoad + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "There is an error with Polymarket right now. Please try again."
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMorePages, isLoadingMore, loading, nextPage, searchQuery, selectedLeague, selectedSport, sort, totalItems, totalPages]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMorePages || loading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMoreMarkets();
          }
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMorePages, loadMoreMarkets, loading]);

  if (isInitializing) {
    return (
      <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <div className="absolute inset-2 flex items-center justify-center rounded-full bg-slate-900 text-sm font-black tracking-wider text-white">
            HC
          </div>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-slate-900">Hightop Challenge</p>
          <p className="text-sm text-slate-600">Loading live prediction markets...</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Crunching markets from venue...</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  const submitPick = async (predictionId: string, outcomeId: string) => {
    if (!userId) {
      setMessages((prev) => ({ ...prev, [predictionId]: "Join a venue first to place picks." }));
      triggerHaptic([20, 20]);
      return;
    }
    if (predictionsQuotaLocked) {
      const message = `Hourly prediction limit reached. You can pick again in ${formatCountdown(quotaSecondsRemaining)}.`;
      setMessages((prev) => ({
        ...prev,
        [predictionId]: message,
      }));
      setLimitPopups((prev) => ({ ...prev, [predictionId]: message }));
      window.setTimeout(() => {
        setLimitPopups((prev) => {
          const next = { ...prev };
          delete next[predictionId];
          return next;
        });
      }, 2200);
      triggerHaptic([20, 20]);
      return;
    }

    setPendingByMarket((prev) => ({ ...prev, [predictionId]: true }));
    setMessages((prev) => ({ ...prev, [predictionId]: "" }));
    triggerHaptic(10);

    try {
      const selectedOutcome = allMarkets
        .find((market) => market.id === predictionId)
        ?.outcomes.find((outcome) => outcome.id === outcomeId);
      if (!selectedOutcome) {
        throw new Error("Unable to identify selected option.");
      }

      const response = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, predictionId, outcomeId }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to place pick.");
      }

      setMessages((prev) => ({ ...prev, [predictionId]: "Pick placed successfully." }));
      const points = calculatePoints(selectedOutcome.probability);
      addReward(`+${points} picks`);
      triggerHaptic([25, 40, 25]);
      window.dispatchEvent(
        new CustomEvent("tp:points-updated", {
          detail: { source: "prediction-pick", delta: points },
        })
      );
      await loadQuota();
      await loadRecentPicks();
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        [predictionId]: error instanceof Error ? error.message : "Failed to place pick.",
      }));
    } finally {
      setPendingByMarket((prev) => ({ ...prev, [predictionId]: false }));
    }
  };

  const renderMarketCard = (market: Prediction) => (
    <article key={market.id} className="relative rounded-lg border border-slate-200 p-3">
      <h2 className="font-medium">{market.question}</h2>
      <p className="mt-1 text-xs text-slate-500">
        {[market.sport, market.league].filter(Boolean).join(" · ")}
        {[market.sport, market.league].some(Boolean) ? " · " : ""}
        Closes: {new Date(market.closesAt).toLocaleString()}
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {market.outcomes.map((outcome) => (
          <li
            key={outcome.id}
            className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
          >
            <span>{outcome.title}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {formatProbability(outcome.probability)} · {calculatePoints(outcome.probability)} pts
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  void submitPick(market.id, outcome.id);
                }}
                disabled={Boolean(pendingByMarket[market.id])}
                className={`${BUTTON_POP_CLASS} rounded-md bg-gradient-to-r from-blue-700 to-cyan-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60`}
              >
                Pick
              </button>
            </div>
          </li>
        ))}
      </ul>
      {limitPopups[market.id] ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-[240px] rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 shadow-sm">
          {limitPopups[market.id]}
        </div>
      ) : null}
      {messages[market.id] ? <p className="mt-2 text-xs text-slate-600">{messages[market.id]}</p> : null}
    </article>
  );

  return (
    <div className="space-y-4">
      {rewards.length > 0 ? (
        <div className="pointer-events-none -mt-1 flex flex-wrap justify-center gap-2">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className="tp-pop-in rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-1 text-xs font-bold text-white shadow-lg"
            >
              🎉 {reward.label}
            </div>
          ))}
        </div>
      ) : null}
      {quota && !quota.isAdminBypass ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Predictions Progress This Hour</span>
            <span>
              {quota.picksUsed}/{quota.limit}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${Math.min(100, (quota.picksUsed / quota.limit) * 100)}%` }}
            />
          </div>
          {predictionsQuotaLocked ? (
            <p className="text-xs font-semibold text-rose-700">
              Limit reached. Picks unlock in {formatCountdown(quotaSecondsRemaining)}.
            </p>
          ) : null}
        </div>
      ) : null}
      {!userId && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          You are not joined to a venue in this browser yet. Use Home to join a venue first.
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Browse & Filters</p>
          <button
            type="button"
            onClick={() => setBrowseFiltersCollapsed((value) => !value)}
            className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700`}
          >
            {browseFiltersCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>

        {!browseFiltersCollapsed ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">When Markets Close</p>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max items-center gap-2">
                  {CLOSE_WINDOW_OPTIONS.map((option) => (
                    <button
                      key={`close-window-${option.value}`}
                      type="button"
                      onClick={() => setSelectedCloseWindow(option.value)}
                      className={`inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full border px-4 py-1.5 text-xs font-semibold ${BUTTON_POP_CLASS} ${
                        selectedCloseWindow === option.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sports</p>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSport("");
                      setSelectedLeague("");
                    }}
                    className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold ${BUTTON_POP_CLASS} ${
                      selectedSport === ""
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <span aria-hidden="true" className="text-base">
                      🏟️
                    </span>
                    All Sports
                  </button>
                  {sports.map((item) => (
                    <button
                      key={`sport-${item}`}
                      type="button"
                      onClick={() => {
                        setSelectedSport(item);
                        setSelectedLeague("");
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold ${BUTTON_POP_CLASS} ${
                        selectedSport === item
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      <span aria-hidden="true" className="text-base">
                        {getSportIcon(item)}
                      </span>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leagues</p>
              {!selectedSport ? (
                <span className="text-xs text-slate-500">Select a sport to browse leagues.</span>
              ) : leagueOptions.length === 0 ? (
                <span className="text-xs text-slate-500">No leagues found for this sport right now.</span>
              ) : (
                <div className="-mx-1 overflow-x-auto px-1 pb-1">
                  <div className="flex min-w-max items-center gap-2">
                    <button
                      key={`league-all-${selectedSport}`}
                      type="button"
                      onClick={() => {
                        setSelectedLeague("");
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold ${BUTTON_POP_CLASS} ${
                        selectedLeague === ""
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                      }`}
                    >
                      <span aria-hidden="true" className="text-base">
                        {getSportIcon(selectedSport)}
                      </span>
                      All {selectedSport} Leagues
                    </button>
                    {leagueOptions.map((item) => (
                      <button
                        key={`league-${item}`}
                        type="button"
                        onClick={() => {
                          setSelectedLeague(item);
                        }}
                        className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold ${BUTTON_POP_CLASS} ${
                          selectedLeague === item
                            ? "border-blue-700 bg-blue-700 text-white"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                        }`}
                      >
                        <span aria-hidden="true" className="text-base">
                          🏆
                        </span>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search markets"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={() => triggerHaptic()}
                  onClick={() => {
                    setSearchInput((value) => value.trim());
                  }}
                  className={`${BUTTON_POP_CLASS} rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white`}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSelectedCloseWindow("all");
                    setSelectedSport("");
                    setSelectedLeague("");
                    setSort("closing-soon");
                  }}
                  className={`${BUTTON_POP_CLASS} rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700`}
                >
                  Reset
                </button>
              </div>
            </div>

        <p className="text-xs text-slate-600">
          {loading
            ? "Loading markets..."
            : `Showing ${markets.length} of ${totalItems} market${totalItems === 1 ? "" : "s"}`}
          {hasFilters ? " (filtered)" : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layout</span>
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            className={`${BUTTON_POP_CLASS} rounded-full px-3 py-1.5 text-xs font-semibold ${
              viewMode === "grouped"
                ? "bg-blue-700 text-white"
                : "border border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
            }`}
          >
            Grouped by League
          </button>
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={`${BUTTON_POP_CLASS} rounded-full px-3 py-1.5 text-xs font-semibold ${
              viewMode === "all"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            All Markets
          </button>
        </div>
        {viewMode === "grouped" && groupedMarketSections.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jump To Section</p>
            <div className="flex flex-wrap gap-2">
              {groupedMarketSections.slice(0, 12).map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400`}
                >
                  {section.label} ({section.markets.length})
                </a>
              ))}
            </div>
          </div>
        ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Discover</p>
          <button
            type="button"
            onClick={() => setDiscoverCollapsed((value) => !value)}
            className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700`}
          >
            {discoverCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>

        {!discoverCollapsed ? (
          <div className="space-y-3">
            {featuredMarkets.length > 0 ? (
              <section className="space-y-2 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-amber-900">Featured Markets</h3>
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Hot + Closing Soon</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {featuredMarkets.map((market) => (
                    <button
                      key={`featured-${market.id}`}
                      type="button"
                      onClick={() => {
                        setSearchInput(market.question);
                      }}
                      className={`${BUTTON_POP_CLASS} rounded-xl border border-amber-300 bg-white px-3 py-2 text-left hover:border-amber-400`}
                    >
                      <p className="line-clamp-2 text-xs font-semibold text-slate-900">{market.question}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {[market.sport, market.league].filter(Boolean).join(" · ") || "Sports"} ·{" "}
                        {new Date(market.closesAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {forYouMarkets.length > 0 ? (
              <section className="space-y-2 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-cyan-900">For You</h3>
                  <span className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Based On Recent Picks</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {forYouMarkets.map((market) => (
                    <button
                      key={`for-you-${market.id}`}
                      type="button"
                      onClick={() => {
                        setSearchInput(market.question);
                      }}
                      className={`${BUTTON_POP_CLASS} rounded-xl border border-cyan-300 bg-white px-3 py-2 text-left hover:border-cyan-400`}
                    >
                      <p className="line-clamp-2 text-xs font-semibold text-slate-900">{market.question}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {[market.sport, market.league].filter(Boolean).join(" · ") || "Sports"} ·{" "}
                        {new Date(market.closesAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      {loading ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            Loading live prediction markets...
          </div>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`prediction-skeleton-${index}`} className="rounded-lg border border-slate-200 p-3">
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 space-y-2">
                  <div className="h-10 animate-pulse rounded-md bg-slate-100" />
                  <div className="h-10 animate-pulse rounded-md bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : viewMode === "grouped" ? (
        <div className="space-y-5">
          {groupedMarketSections.map((section) => (
            <section key={section.id} id={section.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="text-base" aria-hidden="true">
                    {getSportIcon(markets.find((market) => market.league === section.label)?.sport || selectedSport || "Sports")}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">{section.label}</h3>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {section.markets.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedSections((prev) => ({
                        ...prev,
                        [section.id]: !prev[section.id],
                      }));
                    }}
                    className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400`}
                  >
                    {collapsedSections[section.id] ? "Expand" : "Collapse"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sectionSport = markets.find((market) => market.league === section.label)?.sport ?? "";
                      setSelectedSport(sectionSport);
                      setSelectedLeague(section.label);
                    }}
                    className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400`}
                  >
                    Filter To This League
                  </button>
                </div>
              </div>
              {collapsedSections[section.id] ? (
                <p className="text-xs text-slate-500">Section collapsed.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                  {section.markets.map((market) => renderMarketCard(market))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {markets.map((market, index) => (
            <div key={market.id} className="contents">
              {renderMarketCard(market)}

              {(index + 1) % 6 === 0 ? (
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-slate-100/70 p-4 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Advertisement</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">Banner Ad Placement</p>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        {isLoadingMore ? (
          <div className="flex items-center gap-2 text-slate-600">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            Loading more markets...
          </div>
        ) : hasMorePages ? (
          <p className="text-slate-600">Scroll down to load more markets.</p>
        ) : (
          <p className="text-slate-600">You&apos;ve reached the end of the market list.</p>
        )}
        <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />
      </section>
    </div>
  );
}
