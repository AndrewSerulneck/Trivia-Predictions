"use client";

import { useEffect, useMemo, useState } from "react";

type DatePreset = "today" | "last7" | "last30" | "custom";

type CampaignMetric = {
  adId: string;
  advertiserName: string;
  slotKey: string;
  pageKey: string;
  active: boolean;
  impressions: number;
  clicks: number;
  ctr: number;
};

type PlacementMetric = {
  slotKey: string;
  adCount: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

type TrendPoint = {
  bucketStart: string;
  bucketLabel: string;
  impressions: number;
  clicks: number;
};

type AdsDebugSnapshot = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  windowImpressions: number;
  windowClicks: number;
  windowCtr: number;
  campaignMetrics: CampaignMetric[];
  placementMetrics: PlacementMetric[];
  interactionTrend: TrendPoint[];
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeForPreset(preset: Exclude<DatePreset, "custom">): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = toDateInputValue(now);
  if (preset === "today") {
    return { startDate: endDate, endDate };
  }

  const days = preset === "last7" ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { startDate: toDateInputValue(start), endDate };
}

function formatMetricNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
}

function formatCtr(value: number): string {
  return `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
}

function escapeCsvCell(value: string | number): string {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildTrendPath(values: number[], width: number, height: number, maxValue: number): string {
  if (values.length === 0 || maxValue <= 0) {
    return "";
  }
  const horizontalStep = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = horizontalStep * index;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AdAnalyticsDashboard() {
  const defaultLast7 = rangeForPreset("last7");
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [customStartDate, setCustomStartDate] = useState(defaultLast7.startDate);
  const [customEndDate, setCustomEndDate] = useState(defaultLast7.endDate);
  const [queryRange, setQueryRange] = useState(defaultLast7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<AdsDebugSnapshot | null>(null);

  const customRangeInvalid = customStartDate > customEndDate;

  useEffect(() => {
    if (preset === "custom") {
      if (!customStartDate || !customEndDate || customRangeInvalid) {
        return;
      }
      setQueryRange({ startDate: customStartDate, endDate: customEndDate });
      return;
    }
    setQueryRange(rangeForPreset(preset));
  }, [customEndDate, customRangeInvalid, customStartDate, preset]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          resource: "ads-debug",
          startDate: queryRange.startDate,
          endDate: queryRange.endDate,
        });
        const response = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { ok: boolean; error?: string; snapshot?: AdsDebugSnapshot };
        if (!payload.ok || !payload.snapshot) {
          throw new Error(payload.error ?? "Failed to load ad analytics.");
        }
        if (!cancelled) {
          setSnapshot(payload.snapshot);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ad analytics.");
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryRange.endDate, queryRange.startDate]);

  const trendSeries = snapshot?.interactionTrend ?? [];
  const trendImpressions = useMemo(() => trendSeries.map((point) => point.impressions), [trendSeries]);
  const trendClicks = useMemo(() => trendSeries.map((point) => point.clicks), [trendSeries]);
  const trendMaxValue = useMemo(
    () => Math.max(1, ...trendImpressions, ...trendClicks),
    [trendClicks, trendImpressions]
  );
  const placementMaxima = useMemo(() => {
    const items = snapshot?.placementMetrics ?? [];
    return {
      maxImpressions: Math.max(1, ...items.map((item) => item.impressions)),
      maxClicks: Math.max(1, ...items.map((item) => item.clicks)),
    };
  }, [snapshot?.placementMetrics]);

  const exportCsv = () => {
    if (!snapshot) return;

    const lines: string[] = [];
    lines.push("Campaign Performance");
    lines.push(["Ad ID", "Advertiser", "Slot Key", "Page", "Active", "Impressions", "Clicks", "CTR (%)"].join(","));
    for (const row of snapshot.campaignMetrics) {
      lines.push(
        [
          escapeCsvCell(row.adId),
          escapeCsvCell(row.advertiserName),
          escapeCsvCell(row.slotKey),
          escapeCsvCell(row.pageKey),
          escapeCsvCell(row.active ? "yes" : "no"),
          escapeCsvCell(row.impressions),
          escapeCsvCell(row.clicks),
          escapeCsvCell(row.ctr.toFixed(4)),
        ].join(",")
      );
    }

    lines.push("");
    lines.push("Placement Breakdown");
    lines.push(["Slot Key", "Ad Count", "Impressions", "Clicks", "CTR (%)"].join(","));
    for (const row of snapshot.placementMetrics) {
      lines.push(
        [
          escapeCsvCell(row.slotKey),
          escapeCsvCell(row.adCount),
          escapeCsvCell(row.impressions),
          escapeCsvCell(row.clicks),
          escapeCsvCell(row.ctr.toFixed(4)),
        ].join(",")
      );
    }

    lines.push("");
    lines.push("Interaction Trend");
    lines.push(["Bucket Start", "Bucket Label", "Impressions", "Clicks"].join(","));
    for (const row of snapshot.interactionTrend) {
      lines.push(
        [
          escapeCsvCell(row.bucketStart),
          escapeCsvCell(row.bucketLabel),
          escapeCsvCell(row.impressions),
          escapeCsvCell(row.clicks),
        ].join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ad-analytics-${queryRange.startDate}-to-${queryRange.endDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const presetButtonClass = (value: DatePreset) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      preset === value ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPreset("today")} className={presetButtonClass("today")}>
            Today
          </button>
          <button type="button" onClick={() => setPreset("last7")} className={presetButtonClass("last7")}>
            Last 7 Days
          </button>
          <button type="button" onClick={() => setPreset("last30")} className={presetButtonClass("last30")}>
            Last 30 Days
          </button>
          <button type="button" onClick={() => setPreset("custom")} className={presetButtonClass("custom")}>
            Custom
          </button>
          <div className="ml-auto">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!snapshot}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export to CSV
            </button>
          </div>
        </div>
        {preset === "custom" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Start date
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              End date
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {customRangeInvalid ? (
              <p className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Start date must be before or equal to end date.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {loading ? <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading analytics…</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      {snapshot ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Total Impressions</p>
              <p className="mt-2 text-3xl font-bold text-indigo-900">{formatMetricNumber(snapshot.windowImpressions)}</p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Total Clicks</p>
              <p className="mt-2 text-3xl font-bold text-cyan-900">{formatMetricNumber(snapshot.windowClicks)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Global CTR</p>
              <p className="mt-2 text-3xl font-bold text-emerald-900">{formatCtr(snapshot.windowCtr)}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Campaign Performance</h3>
              <p className="text-xs text-slate-500">{snapshot.rangeLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Campaign</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Slot Key</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Impressions</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Clicks</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.campaignMetrics.map((item) => (
                    <tr key={item.adId} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-sm text-slate-800">
                        <div className="font-medium">{item.advertiserName}</div>
                        <div className="text-xs text-slate-500">{item.pageKey}</div>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{item.slotKey}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-700">{formatMetricNumber(item.impressions)}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-700">{formatMetricNumber(item.clicks)}</td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{formatCtr(item.ctr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-slate-900">Placement Slot Breakdown</h3>
              <div className="space-y-3">
                {snapshot.placementMetrics.map((slot) => {
                  const impressionsWidth = (slot.impressions / placementMaxima.maxImpressions) * 100;
                  const clicksWidth = (slot.clicks / placementMaxima.maxClicks) * 100;
                  return (
                    <div key={slot.slotKey} className="rounded-lg border border-slate-100 p-3">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">{slot.slotKey}</span>
                        <span className="text-slate-500">{formatCtr(slot.ctr)}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-xs text-slate-500">Impressions</span>
                          <div className="h-2 flex-1 rounded bg-slate-100">
                            <div className="h-2 rounded bg-indigo-500" style={{ width: `${impressionsWidth}%` }} />
                          </div>
                          <span className="w-16 text-right text-xs text-slate-600">{formatMetricNumber(slot.impressions)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-xs text-slate-500">Clicks</span>
                          <div className="h-2 flex-1 rounded bg-slate-100">
                            <div className="h-2 rounded bg-emerald-500" style={{ width: `${clicksWidth}%` }} />
                          </div>
                          <span className="w-16 text-right text-xs text-slate-600">{formatMetricNumber(slot.clicks)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-slate-900">Hourly/Daily Interaction Trend</h3>
              {trendSeries.length === 0 ? (
                <p className="text-sm text-slate-500">No interaction events in this time range.</p>
              ) : (
                <div className="space-y-3">
                  <div className="h-[260px] w-full rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <svg viewBox="0 0 860 220" className="h-full w-full" preserveAspectRatio="none">
                      <line x1="0" y1="210" x2="860" y2="210" stroke="#cbd5e1" strokeWidth="1" />
                      <path
                        d={buildTrendPath(trendImpressions, 860, 200, trendMaxValue)}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="3"
                      />
                      <path
                        d={buildTrendPath(trendClicks, 860, 200, trendMaxValue)}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-6 rounded bg-indigo-600" />
                      Impressions
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-6 rounded bg-emerald-600" />
                      Clicks
                    </span>
                  </div>
                  <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto text-xs text-slate-500 sm:grid-cols-3">
                    {trendSeries.map((point) => (
                      <div key={point.bucketStart} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                        <div className="font-medium text-slate-700">{point.bucketLabel}</div>
                        <div>{formatMetricNumber(point.impressions)} imp</div>
                        <div>{formatMetricNumber(point.clicks)} clicks</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
