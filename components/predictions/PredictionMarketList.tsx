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

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "closing-soon", label: "Closing Soon" },
  { value: "newest", label: "Newest" },
  { value: "volume", label: "Highest Volume" },
  { value: "liquidity", label: "Highest Liquidity" },
];

function formatBroadCategoryLabel(value: string): string {
  return value
    .split(" ")
    .map((part) => {
      if (part === "&") return "&";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

const BROWSER_MENU_ICON_BY_CATEGORY: Record<string, string> = {
  all: "🧭",
  trending: "⚡",
  breaking: "🚨",
  new: "🆕",
  politics: "🏛️",
  sports: "⚽",
  crypto: "🪙",
  finance: "📈",
  geopolitics: "🌍",
  religion: "✝️",
  earnings: "💼",
  tech: "🧠",
  culture: "🎭",
  world: "🗺️",
  economy: "📊",
  "climate & science": "🌤️",
  mentions: "🗣️",
  elections: "🗳️",
};

function getCategoryIcon(category: string): string {
  const normalized = category.toLowerCase();
  return BROWSER_MENU_ICON_BY_CATEGORY[normalized] ?? (normalized.includes("sport") ? "🏟️" : "🏷️");
}

const HIDDEN_BROAD_CATEGORIES = new Set<string>();
const BUTTON_POP_CLASS =
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
const COLLAPSED_SECTIONS_STORAGE_KEY = "tp:predictions:collapsed-sections:v1";

function isSelectableBroadCategory(category: string): boolean {
  const normalized = category.toLowerCase();
  return !HIDDEN_BROAD_CATEGORIES.has(normalized);
}

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

export function PredictionMarketList() {
  const router = useRouter();
  const [messages, setMessages] = useState<SubmitState>({});
  const [limitPopups, setLimitPopups] = useState<PopupState>({});
  const [pendingByMarket, setPendingByMarket] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [quota, setQuota] = useState<PredictionQuota | null>(null);
  const [quotaSecondsRemaining, setQuotaSecondsRemaining] = useState(0);

  const [markets, setMarkets] = useState<Prediction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [trendingCategories, setTrendingCategories] = useState<string[]>([]);
  const [broadCategories, setBroadCategories] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const hasInitializedRef = useRef(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [broadCategory, setBroadCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("closing-soon");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [recentPicks, setRecentPicks] = useState<UserPrediction[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { rewards, addReward } = useRewards();

  const hasFilters = useMemo(() => Boolean(search || category || broadCategory), [search, category, broadCategory]);
  const predictionsQuotaLocked = Boolean(quota && !quota.isAdminBypass && quota.picksRemaining <= 0);
  const groupedMarketSections = useMemo(() => {
    const byCategory = new Map<string, Prediction[]>();
    for (const market of markets) {
      const label = market.category?.trim() || "Uncategorized";
      const existing = byCategory.get(label) ?? [];
      existing.push(market);
      byCategory.set(label, existing);
    }

    const preferredOrder = trendingCategories.filter((item) => byCategory.has(item));
    const fallbackOrder = [...byCategory.keys()]
      .filter((item) => !preferredOrder.includes(item))
      .sort((a, b) => {
        const countDiff = (byCategory.get(b)?.length ?? 0) - (byCategory.get(a)?.length ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });

    return [...preferredOrder, ...fallbackOrder].map((label) => ({
      label,
      id: toSectionId(label),
      markets: byCategory.get(label) ?? [],
    }));
  }, [markets, trendingCategories]);
  const featuredMarkets = useMemo(() => {
    const score = (market: Prediction) => {
      const volume = Math.max(0, market.volume ?? market.liquidity ?? 0);
      const hours = getHoursUntilClose(market.closesAt);
      const closingSoonBoost = Number.isFinite(hours) ? Math.max(0, 24 - Math.max(0, hours)) * 1500 : 0;
      return volume + closingSoonBoost;
    };

    return [...markets]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 6);
  }, [markets]);
  const forYouMarkets = useMemo(() => {
    if (recentPicks.length === 0) return [];

    const recentPickMarketIds = new Set(recentPicks.map((pick) => pick.predictionId));
    const categoryScores = new Map<string, number>();

    for (const pick of recentPicks.slice(0, 30)) {
      const matched = markets.find((market) => market.id === pick.predictionId);
      const matchedCategory = matched?.category?.trim();
      if (matchedCategory) {
        categoryScores.set(matchedCategory, (categoryScores.get(matchedCategory) ?? 0) + 1);
      }
    }

    const preferredCategories = [...categoryScores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
      .slice(0, 3)
      .map(([categoryName]) => categoryName);

    const pool = markets.filter((market) => !recentPickMarketIds.has(market.id));
    const categoryMatched = preferredCategories.length
      ? pool.filter((market) => preferredCategories.includes(market.category?.trim() || ""))
      : [];
    const fallbackTrending = pool.filter((market) => trendingCategories.includes(market.category?.trim() || ""));
    const source = categoryMatched.length > 0 ? categoryMatched : fallbackTrending;
    const unique = new Map<string, Prediction>();
    for (const market of source.length > 0 ? source : pool) {
      unique.set(market.id, market);
    }

    return [...unique.values()]
      .sort((a, b) => {
        const aHours = Math.abs(getHoursUntilClose(a.closesAt));
        const bHours = Math.abs(getHoursUntilClose(b.closesAt));
        if (aHours !== bHours) return aHours - bHours;
        return (b.volume ?? b.liquidity ?? 0) - (a.volume ?? a.liquidity ?? 0);
      })
      .slice(0, 6);
  }, [recentPicks, markets, trendingCategories]);

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
    const controller = new AbortController();
    if (!hasInitializedRef.current) {
      setIsInitializing(true);
    }

    const load = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: "100",
          search,
          category,
          broadCategory,
          excludeSensitive: "false",
          sort,
        });
        const response = await fetch(`/api/predictions?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as PredictionListPayload;

        if (!payload.ok) {
          throw new Error(payload.error ?? "There is an error with Polymarket right now. Please try again.");
        }

        setMarkets(payload.items ?? []);
        setCategories(payload.categories ?? []);
        setTrendingCategories(payload.trendingCategories ?? []);
        setBroadCategories(payload.broadCategories ?? []);
        setTotalItems(payload.totalItems ?? 0);
        setTotalPages(Math.max(1, payload.totalPages ?? 1));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setMarkets([]);
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

    void load();

    return () => controller.abort();
  }, [page, search, category, broadCategory, sort]);

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
      const selectedOutcome = markets
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
        {market.category ? `${market.category} · ` : ""}Closes: {new Date(market.closesAt).toLocaleString()}
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
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Browse Categories</p>
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBroadCategory("");
                  setCategory("");
                  setPage(1);
                }}
                className={`inline-flex min-h-[48px] items-center gap-2 rounded-full border px-6 py-2.5 text-sm font-semibold ${BUTTON_POP_CLASS} ${
                    category === "" && broadCategory === ""
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span aria-hidden="true" className="text-base">
                    {getCategoryIcon("all")}
                  </span>
                  All
                </button>
              {broadCategories.filter(isSelectableBroadCategory).map((item) => (
                <button
                  key={`broad-${item}`}
                  type="button"
                  onClick={() => {
                    setBroadCategory(item);
                    setCategory("");
                    setPage(1);
                  }}
                  className={`inline-flex min-h-[48px] items-center gap-2 rounded-full border px-6 py-2.5 text-sm font-semibold ${BUTTON_POP_CLASS} ${
                    broadCategory === item
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span aria-hidden="true" className="text-base">
                    {getCategoryIcon(item)}
                  </span>
                  {formatBroadCategoryLabel(item)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trending Categories</p>
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-2">
              {trendingCategories.length === 0 ? (
                <span className="text-xs text-slate-500">No trending data yet.</span>
              ) : (
                trendingCategories.filter(isSelectableBroadCategory).map((item) => (
                  <button
                    key={`trend-${item}`}
                    type="button"
                    onClick={() => {
                      setBroadCategory("");
                      setCategory(item);
                      setPage(1);
                    }}
                    className={`inline-flex min-h-[48px] items-center gap-2 rounded-full border px-6 py-2.5 text-sm font-semibold ${BUTTON_POP_CLASS} ${
                      category === item
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                    }`}
                  >
                    <span aria-hidden="true" className="text-base">
                      {getCategoryIcon(item)}
                    </span>
                    {item}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search markets"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(event) => {
              setBroadCategory("");
              setCategory(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {categories.filter(isSelectableBroadCategory).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortKey);
              setPage(1);
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
                setSearch(searchInput.trim());
                setPage(1);
              }}
              className={`${BUTTON_POP_CLASS} rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white`}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setCategory("");
                setBroadCategory("");
                setSort("closing-soon");
                setPage(1);
              }}
              className={`${BUTTON_POP_CLASS} rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700`}
            >
              Reset
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Showing {markets.length} of {totalItems} market{totalItems === 1 ? "" : "s"}
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
            Grouped by Category
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
      </section>

      {featuredMarkets.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-amber-900">Featured Markets</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Hot + Closing Soon</span>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max gap-2">
              {featuredMarkets.map((market) => (
                <button
                  key={`featured-${market.id}`}
                  type="button"
                  onClick={() => {
                    setSearchInput(market.question);
                    setSearch(market.question);
                    setPage(1);
                  }}
                  className={`${BUTTON_POP_CLASS} max-w-[260px] rounded-xl border border-amber-300 bg-white px-3 py-2 text-left hover:border-amber-400`}
                >
                  <p className="line-clamp-2 text-xs font-semibold text-slate-900">{market.question}</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {market.category || "Uncategorized"} · {new Date(market.closesAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {forYouMarkets.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-cyan-900">For You</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Based On Recent Picks</span>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max gap-2">
              {forYouMarkets.map((market) => (
                <button
                  key={`for-you-${market.id}`}
                  type="button"
                  onClick={() => {
                    setSearchInput(market.question);
                    setSearch(market.question);
                    setPage(1);
                  }}
                  className={`${BUTTON_POP_CLASS} max-w-[260px] rounded-xl border border-cyan-300 bg-white px-3 py-2 text-left hover:border-cyan-400`}
                >
                  <p className="line-clamp-2 text-xs font-semibold text-slate-900">{market.question}</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {market.category || "Uncategorized"} · {new Date(market.closesAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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
                    {getCategoryIcon(section.label)}
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
                      setCategory(section.label);
                      setBroadCategory("");
                      setPage(1);
                    }}
                    className={`${BUTTON_POP_CLASS} rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400`}
                  >
                    Filter To This Category
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

      <section className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className={`${BUTTON_POP_CLASS} rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50`}
        >
          Previous
        </button>
        <p>
          Page {page} of {totalPages}
        </p>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page >= totalPages}
          className={`${BUTTON_POP_CLASS} rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50`}
        >
          Next
        </button>
      </section>
    </div>
  );
}
