"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calculatePoints, formatProbability } from "@/lib/predictions";
import { getUserId, getVenueId } from "@/lib/storage";
import type { Prediction } from "@/types";

type SubmitState = Record<string, string>;

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
  error?: string;
};

type PredictionQuota = {
  limit: number;
  picksUsed: number;
  picksRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass: boolean;
};

type SortKey = "closing-soon" | "newest" | "volume" | "liquidity";

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

export function PredictionMarketList() {
  const router = useRouter();
  const [messages, setMessages] = useState<SubmitState>({});
  const [pendingByMarket, setPendingByMarket] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [quota, setQuota] = useState<PredictionQuota | null>(null);

  const [markets, setMarkets] = useState<Prediction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [trendingCategories, setTrendingCategories] = useState<string[]>([]);
  const [broadCategories, setBroadCategories] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [broadCategory, setBroadCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("closing-soon");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const hasFilters = useMemo(() => Boolean(search || category || broadCategory), [search, category, broadCategory]);

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
    if (!userId) {
      setQuota(null);
      return;
    }

    const loadQuota = async () => {
      const response = await fetch(`/api/predictions/quota?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { ok: boolean; quota?: PredictionQuota | null };
      if (payload.ok) {
        setQuota(payload.quota ?? null);
      }
    };

    void loadQuota();
    const interval = window.setInterval(() => {
      void loadQuota();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();

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
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [page, search, category, broadCategory, sort]);

  const submitPick = async (predictionId: string, outcomeId: string) => {
    if (!userId) {
      setMessages((prev) => ({ ...prev, [predictionId]: "Join a venue first to place picks." }));
      return;
    }

    setPendingByMarket((prev) => ({ ...prev, [predictionId]: true }));
    setMessages((prev) => ({ ...prev, [predictionId]: "" }));

    try {
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
      window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "prediction-pick" } }));
      if (userId) {
        const response = await fetch(`/api/predictions/quota?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const quotaPayload = (await response.json()) as { ok: boolean; quota?: PredictionQuota | null };
        if (quotaPayload.ok) {
          setQuota(quotaPayload.quota ?? null);
        }
      }
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        [predictionId]: error instanceof Error ? error.message : "Failed to place pick.",
      }));
    } finally {
      setPendingByMarket((prev) => ({ ...prev, [predictionId]: false }));
    }
  };

  return (
    <div className="space-y-4">
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
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === "" && broadCategory === ""
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                All
              </button>
              {broadCategories.map((item) => (
                <button
                  key={`broad-${item}`}
                  type="button"
                  onClick={() => {
                    setBroadCategory(item);
                    setCategory("");
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    broadCategory === item
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
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
                trendingCategories.map((item) => (
                  <button
                    key={`trend-${item}`}
                    type="button"
                    onClick={() => {
                      setBroadCategory("");
                      setCategory(item);
                      setPage(1);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      category === item
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                    }`}
                  >
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
            {categories.map((item) => (
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
              onClick={() => {
                setSearch(searchInput.trim());
                setPage(1);
              }}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
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
              className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Reset
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Showing {markets.length} of {totalItems} market{totalItems === 1 ? "" : "s"}
          {hasFilters ? " (filtered)" : ""}.
        </p>
      </section>

      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading Polymarket markets...</p> : null}

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        {markets.map((market) => (
          <article key={market.id} className="rounded-lg border border-slate-200 p-3">
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
                        void submitPick(market.id, outcome.id);
                      }}
                      disabled={Boolean(pendingByMarket[market.id])}
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Pick
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {messages[market.id] ? <p className="mt-2 text-xs text-slate-600">{messages[market.id]}</p> : null}
          </article>
        ))}
      </div>

      <section className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
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
          className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
        >
          Next
        </button>
      </section>
    </div>
  );
}
