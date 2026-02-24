"use client";

import { useEffect, useMemo, useState } from "react";
import { calculatePoints, formatProbability } from "@/lib/predictions";
import { getUserId } from "@/lib/storage";
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
  error?: string;
};

type SortKey = "closing-soon" | "newest" | "volume" | "liquidity";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "closing-soon", label: "Closing Soon" },
  { value: "newest", label: "Newest" },
  { value: "volume", label: "Highest Volume" },
  { value: "liquidity", label: "Highest Liquidity" },
];

export function PredictionMarketList() {
  const [messages, setMessages] = useState<SubmitState>({});
  const [pendingByMarket, setPendingByMarket] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);

  const [markets, setMarkets] = useState<Prediction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("closing-soon");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const hasFilters = useMemo(() => Boolean(search || category), [search, category]);

  useEffect(() => {
    setUserId(getUserId());
  }, []);

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
  }, [page, search, category, sort]);

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
      {!userId && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          You are not joined to a venue in this browser yet. Use the Join page first to place picks.
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
