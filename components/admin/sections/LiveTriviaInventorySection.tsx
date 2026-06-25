"use client";

import { useEffect, useState } from "react";

type CategoryInventory = {
  category: string;
  total: number;
  seen: number;
  unseen: number;
  pctExhausted: number;
};

type RecentWarning = {
  occurrenceDate: string;
  usedSeen: boolean;
  repeatedQuestions: boolean;
  usedOverflow: boolean;
  seededCount: number;
  neededCount: number;
  createdAt: string;
};

type RecentReset = {
  category: string;
  categoryTotal: number;
  freedCount: number;
  carriedForwardCount: number;
  createdAt: string;
};

type VenueCategoryInventory = {
  venueId: string;
  venueName: string;
  totalActive: number;
  totalSeen: number;
  totalUnseen: number;
  categories: CategoryInventory[];
  warnings: RecentWarning[];
  resets: RecentReset[];
};

type LoadState = "idle" | "loading" | "loaded" | "error";

function ExhaustionBar({ pct }: { pct: number }) {
  const color =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-400"
        : pct >= 50
          ? "bg-yellow-400"
          : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-[11px] text-slate-500">{pct}%</span>
    </div>
  );
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 90) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        Critical
      </span>
    );
  }
  if (pct >= 70) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        Low
      </span>
    );
  }
  if (pct >= 50) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
        Moderate
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      Healthy
    </span>
  );
}

function VenueCard({ venue }: { venue: VenueCategoryInventory }) {
  const [expanded, setExpanded] = useState(false);
  const overallPct =
    venue.totalActive > 0 ? Math.round((venue.totalSeen / venue.totalActive) * 100) : 0;
  const criticalCategories = venue.categories.filter((c) => c.pctExhausted >= 90);
  const lowCategories = venue.categories.filter((c) => c.pctExhausted >= 70 && c.pctExhausted < 90);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{venue.venueName}</p>
            <p className="text-xs text-slate-500">
              {venue.totalSeen.toLocaleString()} seen · {venue.totalUnseen.toLocaleString()} unseen · {venue.totalActive.toLocaleString()} total
            </p>
          </div>
          <StatusBadge pct={overallPct} />
          {criticalCategories.length > 0 && (
            <span className="text-xs text-red-600 font-medium">
              {criticalCategories.length} critical categor{criticalCategories.length === 1 ? "y" : "ies"}
            </span>
          )}
          {criticalCategories.length === 0 && lowCategories.length > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              {lowCategories.length} low categor{lowCategories.length === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ExhaustionBar pct={overallPct} />
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          {/* Per-category table */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Category Breakdown
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-3 py-2 font-semibold text-slate-600">Category</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Seen</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Unseen</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Exhaustion</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {venue.categories.map((cat) => (
                    <tr key={cat.category} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-800">{cat.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{cat.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{cat.seen}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{cat.unseen}</td>
                      <td className="px-3 py-2">
                        <ExhaustionBar pct={cat.pctExhausted} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge pct={cat.pctExhausted} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent warnings */}
          {venue.warnings.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Recent Repeat Events
              </p>
              <div className="space-y-1">
                {venue.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-amber-800">{w.occurrenceDate}</span>
                    <span className="text-amber-700">
                      {w.seededCount}/{w.neededCount} slots filled
                    </span>
                    {w.repeatedQuestions && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Questions repeated
                      </span>
                    )}
                    {w.usedOverflow && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        Cross-category overflow
                      </span>
                    )}
                    {w.usedSeen && !w.repeatedQuestions && !w.usedOverflow && (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Used seen questions
                      </span>
                    )}
                    <span className="ml-auto text-slate-400">
                      {new Date(w.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {venue.warnings.length === 0 && (
            <p className="text-xs text-slate-400">No repeat events recorded yet.</p>
          )}

          {/* Per-category epoch resets */}
          {venue.resets.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Category Resets (full rotation completed)
              </p>
              <div className="space-y-1">
                {venue.resets.map((r, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-emerald-800">{r.category}</span>
                    <span className="text-emerald-700">
                      all {r.categoryTotal} seen → recycled {r.freedCount}, held back {r.carriedForwardCount}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LiveTriviaInventorySection() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [venues, setVenues] = useState<VenueCategoryInventory[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/venues/question-inventory-by-category", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: { ok: boolean; venues?: VenueCategoryInventory[]; error?: string }) => {
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error ?? "Failed to load inventory.");
        setVenues(payload.venues ?? []);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load inventory.");
        setLoadState("error");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Live Trivia Question Inventory</h2>
          {loadState === "loaded" && (
            <span className="text-[11px] text-slate-400">
              Questions exhausted before all others means repeats may occur sooner.
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Per-venue, per-category breakdown of how many Live Trivia questions have been seen vs. remain unseen.
          Categories at 70%+ exhaustion are flagged for attention.
        </p>
      </div>

      {loadState === "loading" && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
          Loading inventory…
        </div>
      )}

      {loadState === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loadState === "loaded" && venues.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
          No venues found.
        </div>
      )}

      {loadState === "loaded" &&
        venues.map((venue) => <VenueCard key={venue.venueId} venue={venue} />)}
    </div>
  );
}
