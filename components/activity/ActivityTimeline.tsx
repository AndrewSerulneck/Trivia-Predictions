"use client";

import { useEffect, useMemo, useState } from "react";
import { getUserId } from "@/lib/storage";
import type { PredictionStatus } from "@/types";

type ActivityItem = {
  id: string;
  timestamp: string;
  type: "trivia" | "prediction";
  title: string;
  detail: string;
  predictionStatus?: PredictionStatus;
  isResolved?: boolean;
};

type Filter = "all" | "pending" | "resolved";

function statusBadgeClass(status?: PredictionStatus): string {
  if (!status) return "bg-slate-100 text-slate-600";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  if (status === "won") return "bg-emerald-100 text-emerald-700";
  if (status === "lost") return "bg-rose-100 text-rose-700";
  if (status === "push") return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-700";
}

export function ActivityTimeline() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const userId = getUserId();
      if (!userId) {
        setItems([]);
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/activity?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as { ok: boolean; items?: ActivityItem[]; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load activity.");
      }
      setItems(payload.items ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void load();
    }, 0);
    const interval = window.setInterval(() => {
      void load();
    }, 20000);
    const refreshOnPointsUpdate = () => {
      void load();
    };
    window.addEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);
    };
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === "all") {
      return items;
    }

    return items.filter((item) => {
      if (item.type !== "prediction") {
        return filter === "resolved";
      }
      return filter === "pending" ? item.predictionStatus === "pending" : item.predictionStatus !== "pending";
    });
  }, [filter, items]);

  const pendingCount = useMemo(
    () => items.filter((item) => item.type === "prediction" && item.predictionStatus === "pending").length,
    [items]
  );
  const resolvedCount = useMemo(
    () => items.filter((item) => item.type === "prediction" && item.predictionStatus !== "pending").length,
    [items]
  );

  if (loading) {
    return <p className="text-sm text-slate-600">Loading activity...</p>;
  }

  if (errorMessage) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        {errorMessage}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        No activity yet. Answer trivia questions and place prediction picks to build your timeline.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            filter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          All ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            filter === "pending" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            filter === "resolved" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Resolved ({resolvedCount})
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          No activity for this filter yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredItems.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{item.type}</p>
                {item.type === "prediction" ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(item.predictionStatus)}`}>
                    {item.predictionStatus}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-700">{item.detail}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(item.timestamp).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
