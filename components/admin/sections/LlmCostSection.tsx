"use client";

import { useCallback, useEffect, useState } from "react";

type RangeType = "today" | "week" | "month" | "all";

type FeatureBreakdown = {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

type ModelBreakdown = {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

type RecentEntry = {
  id: string;
  provider: string;
  model: string;
  feature: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_at: string;
};

type CostData = {
  totalCostCents: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: FeatureBreakdown[];
  byModel: ModelBreakdown[];
  recent: RecentEntry[];
};

const RANGE_OPTIONS: { value: RangeType; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

function formatCost(cents: number): string {
  const usd = cents / 100;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[0.6rem] text-slate-500">{sub}</p>}
    </div>
  );
}

function BreakdownTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[0.7rem]">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            {columns.map((col) => (
              <th key={col} className="pb-2 pr-4 font-medium uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800 text-slate-300 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LlmCostSection() {
  const [range, setRange] = useState<RangeType>("month");
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (r: RangeType) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/llm-cost?range=${r}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to load cost data.");
        setData(null);
      } else {
        setData(json as CostData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">LLM Cost Observability</h2>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded px-3 py-1 text-[0.7rem] font-medium transition-colors ${
                range === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-[0.75rem] text-slate-400">Loading cost data…</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-4">
          <p className="text-[0.75rem] text-red-400">{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard
              label="Total Cost"
              value={formatCost(data.totalCostCents)}
              sub={`${data.totalCalls} call(s)`}
            />
            <SummaryCard label="Total Calls" value={String(data.totalCalls)} />
            <SummaryCard
              label="Input Tokens"
              value={formatTokens(data.totalInputTokens)}
            />
            <SummaryCard
              label="Output Tokens"
              value={formatTokens(data.totalOutputTokens)}
            />
          </div>

          {/* Breakdown by Feature */}
          {data.byFeature.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-300">
                By Feature
              </h3>
              <BreakdownTable
                columns={["Feature", "Calls", "Input Tokens", "Output Tokens", "Cost"]}
                rows={data.byFeature.map((f) => [
                  f.feature,
                  f.calls,
                  formatTokens(f.inputTokens),
                  formatTokens(f.outputTokens),
                  formatCost(f.costCents),
                ])}
              />
            </section>
          )}

          {/* Breakdown by Model */}
          {data.byModel.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-300">
                By Model
              </h3>
              <BreakdownTable
                columns={["Model", "Calls", "Input Tokens", "Output Tokens", "Cost"]}
                rows={data.byModel.map((m) => [
                  m.model,
                  m.calls,
                  formatTokens(m.inputTokens),
                  formatTokens(m.outputTokens),
                  formatCost(m.costCents),
                ])}
              />
            </section>
          )}

          {/* Recent Calls */}
          {data.recent.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-300">
                Recent Calls
              </h3>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700">
                <table className="w-full text-left text-[0.65rem]">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Time</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Provider</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Model</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Feature</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">In</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Out</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-wider">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-slate-800 text-slate-300 last:border-0 hover:bg-slate-800/50"
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatTime(entry.created_at)}</td>
                        <td className="px-3 py-1.5 uppercase">{entry.provider}</td>
                        <td className="px-3 py-1.5 max-w-[180px] truncate">{entry.model}</td>
                        <td className="px-3 py-1.5">{entry.feature}</td>
                        <td className="px-3 py-1.5 text-right">{entry.input_tokens}</td>
                        <td className="px-3 py-1.5 text-right">{entry.output_tokens}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCost(entry.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.totalCalls === 0 && !loading && (
            <p className="text-[0.75rem] text-slate-500 italic">
              No LLM usage recorded in this period. Calls will appear here once the new `llm_usage_logs` migration
              has been applied and LLM calls are made.
            </p>
          )}
        </>
      )}
    </div>
  );
}
