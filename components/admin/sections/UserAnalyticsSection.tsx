"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import {
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  Map as MapIcon,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";
import type { ChartConfiguration } from "chart.js";
import type { ReactNode } from "react";
import type { Venue } from "@/types";

type GroupBy = "venue" | "zip_code" | "city" | "state_code" | "region_key";
type RangePreset = "7d" | "30d" | "custom";

type UserSessionAnalytics = {
  group: string;
  active_users: number;
  total_sessions: number;
  avg_session_duration_minutes: number;
  peak_hours: Array<{ hour: number; sessions: number }>;
  daily_activity?: Array<{ date: string; active_users: number; sessions: number }>;
  activity_heatmap?: Array<{ day_of_week: number; hour: number; active_users: number; sessions: number }>;
};

type GameStatisticGroup = {
  group: string;
  games: Array<{
    game_type: string;
    total_plays: number;
    avg_duration_minutes: number;
    win_rate: number;
    popularity_rank: number;
  }>;
};

type AdPerformanceGroup = {
  group: string;
  total_impressions: number;
  total_clicks: number;
  ctr: number;
  top_ads: Array<{ ad_id: string; ad_name: string; clicks: number; ctr: number }>;
  ctr_trend?: Array<{ date: string; impressions: number; clicks: number; ctr: number }>;
};

type GeoNode = {
  key: string;
  label: string;
  level: string;
  active_users: number;
  total_sessions: number;
  total_game_sessions: number;
  total_ad_clicks: number;
  total_duration_minutes: number;
  children: GeoNode[];
};

type CohortGroup = {
  cohort_start: string;
  cohort_size: "weekly" | "monthly";
  cohort_users: number;
  retention: Array<{ period_index: number; active_users: number; retention_rate: number }>;
};

type AnalyticsState = {
  sessions: UserSessionAnalytics[];
  games: GameStatisticGroup[];
  ads: AdPerformanceGroup[];
  geography: GeoNode[];
  cohorts: CohortGroup[];
};

type AnalyticsFilters = {
  rangePreset: RangePreset;
  startDate: string;
  endDate: string;
  venueIds: string[];
  groupBy: GroupBy;
};

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "venue", label: "Venue" },
  { value: "zip_code", label: "Zip Code" },
  { value: "city", label: "City" },
  { value: "state_code", label: "State" },
  { value: "region_key", label: "Region" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATE_ORDER = [
  "WA", "OR", "CA", "NV", "ID", "MT", "WY", "UT", "AZ", "CO", "NM", "ND", "SD", "NE", "KS", "OK", "TX",
  "MN", "IA", "MO", "AR", "LA", "WI", "IL", "MS", "MI", "IN", "KY", "TN", "AL", "OH", "GA", "FL",
  "PA", "WV", "VA", "NC", "SC", "NY", "VT", "NH", "ME", "MA", "RI", "CT", "NJ", "DE", "MD", "DC",
];

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4b5563"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function getInitialFilters(): AnalyticsFilters {
  if (typeof window === "undefined") {
    return {
      rangePreset: "30d",
      startDate: daysAgoIso(30),
      endDate: todayIso(),
      venueIds: [],
      groupBy: "venue",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const groupBy = params.get("group_by");
  const start = params.get("start") ?? params.get("startDate") ?? daysAgoIso(30);
  const end = params.get("end") ?? params.get("endDate") ?? todayIso();
  const venueIds = Array.from(new Set(params.getAll("venues").flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean)));
  const validGroupBy = GROUP_OPTIONS.some((option) => option.value === groupBy) ? (groupBy as GroupBy) : "venue";

  return {
    rangePreset: params.has("start") || params.has("startDate") ? "custom" : "30d",
    startDate: start,
    endDate: end,
    venueIds,
    groupBy: validGroupBy,
  };
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "0m";
  if (value < 60) return `${Math.round(value * 10) / 10}m`;
  return `${Math.round((value / 60) * 10) / 10}h`;
}

function buildParams(filters: AnalyticsFilters, overrides?: Record<string, string>) {
  const params = new URLSearchParams();
  const start = filters.rangePreset === "custom" ? filters.startDate : daysAgoIso(filters.rangePreset === "7d" ? 7 : 30);
  const end = filters.rangePreset === "custom" ? filters.endDate : todayIso();
  params.set("start", start);
  params.set("end", end);
  params.set("group_by", overrides?.group_by ?? filters.groupBy);
  for (const venueId of filters.venueIds) params.append("venues", venueId);
  for (const [key, value] of Object.entries(overrides ?? {})) params.set(key, value);
  return params;
}

function ChartCanvas({ config }: { config: ChartConfiguration }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, config);
    return () => chart.destroy();
  }, [config]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

function useUserAnalytics(filters: AnalyticsFilters, refreshToken: number, autoRefresh: boolean) {
  const [data, setData] = useState<AnalyticsState>({
    sessions: [],
    games: [],
    ads: [],
    geography: [],
    cohorts: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const baseParams = buildParams(filters);
      const geoParams = buildParams(filters, {
        group_by: filters.groupBy === "region_key" ? "region" : filters.groupBy === "state_code" ? "state" : filters.groupBy === "zip_code" ? "zip" : filters.groupBy,
        min_users: "0",
      });
      const [sessionsRes, gamesRes, adsRes, geoRes, cohortsRes] = await Promise.all([
        fetch(`/api/admin/analytics/user-sessions?${baseParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/game-statistics?${baseParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/ad-performance?${baseParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/geographic-breakdown?${geoParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/user-cohorts?${buildParams(filters, { cohort_size: "weekly" }).toString()}`, { cache: "no-store" }),
      ]);
      const [sessions, games, ads, geography, cohorts] = await Promise.all([
        sessionsRes.json(),
        gamesRes.json(),
        adsRes.json(),
        geoRes.json(),
        cohortsRes.json(),
      ]);
      for (const payload of [sessions, games, ads, geography, cohorts]) {
        if (!payload.ok) throw new Error(payload.error ?? "Failed to load analytics.");
      }
      setData({
        sessions: sessions.items ?? [],
        games: games.items ?? [],
        ads: ads.items ?? [],
        geography: geography.hierarchy ?? [],
        cohorts: cohorts.cohorts ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics, refreshToken]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void fetchAnalytics();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchAnalytics]);

  return { data, loading, error, refetch: fetchAnalytics };
}

function MetricCard({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">{icon}</div>
      </div>
      {detail ? <p className="mt-3 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function ActivityTimeline({
  sessions,
  games,
}: {
  sessions: UserSessionAnalytics[];
  games: GameStatisticGroup[];
}) {
  const [selectedCell, setSelectedCell] = useState<{ day: number; hour: number; sessions: number } | null>(null);

  const daily = useMemo(() => {
    const byDate = new Map<string, { activeUsers: number; sessions: number }>();
    for (const group of sessions) {
      for (const item of group.daily_activity ?? []) {
        const current = byDate.get(item.date) ?? { activeUsers: 0, sessions: 0 };
        current.activeUsers += item.active_users;
        current.sessions += item.sessions;
        byDate.set(item.date, current);
      }
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);

  const heatmap = useMemo(() => {
    const cells = new Map<string, { day: number; hour: number; sessions: number; activeUsers: number }>();
    for (const group of sessions) {
      for (const item of group.activity_heatmap ?? []) {
        const key = `${item.day_of_week}:${item.hour}`;
        const current = cells.get(key) ?? { day: item.day_of_week, hour: item.hour, sessions: 0, activeUsers: 0 };
        current.sessions += item.sessions;
        current.activeUsers += item.active_users;
        cells.set(key, current);
      }
    }
    return cells;
  }, [sessions]);

  const maxHeat = Math.max(1, ...Array.from(heatmap.values()).map((cell) => cell.sessions));
  const chartConfig = useMemo<ChartConfiguration>(() => ({
    type: "line",
    data: {
      labels: daily.map(([date]) => date.slice(5)),
      datasets: [
        {
          label: "Active Users",
          data: daily.map(([, item]) => item.activeUsers),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          fill: true,
          tension: 0.35,
        },
        {
          label: "Sessions",
          data: daily.map(([, item]) => item.sessions),
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.1)",
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  }), [daily]);

  const gamesSummary = games.flatMap((group) => group.games).sort((a, b) => b.total_plays - a.total_plays).slice(0, 5);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">User Activity Timeline</h2>
        <span className="text-xs font-medium text-slate-500">UTC</span>
      </div>
      <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div className="h-72 rounded-md border border-slate-200 p-3">
          <ChartCanvas config={chartConfig} />
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[44px_repeat(24,minmax(24px,1fr))] gap-1">
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="text-center text-[10px] font-medium text-slate-400">{hour}</div>
            ))}
            {DAY_LABELS.map((day, dayIndex) => (
              <div key={day} className="contents">
                <div className="flex items-center text-xs font-semibold text-slate-500">{day}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = heatmap.get(`${dayIndex}:${hour}`);
                  const intensity = cell ? Math.max(0.08, cell.sessions / maxHeat) : 0;
                  return (
                    <button
                      key={`${day}-${hour}`}
                      type="button"
                      title={`${day} ${hour}:00 - ${cell?.sessions ?? 0} sessions`}
                      onClick={() => setSelectedCell({ day: dayIndex, hour, sessions: cell?.sessions ?? 0 })}
                      className="h-7 rounded border border-slate-100"
                      style={{ backgroundColor: `rgba(37, 99, 235, ${intensity})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {selectedCell ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">{DAY_LABELS[selectedCell.day]} {selectedCell.hour}:00</span>
              <span className="ml-2">{selectedCell.sessions} sessions</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {gamesSummary.map((game) => (
                  <span key={game.game_type} className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-600">
                    {game.game_type}: {game.total_plays}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GamePopularityChart({ groups }: { groups: GameStatisticGroup[] }) {
  const gameTypes = useMemo(() => Array.from(new Set(groups.flatMap((group) => group.games.map((game) => game.game_type)))), [groups]);
  const chartConfig = useMemo<ChartConfiguration>(() => ({
    type: "bar",
    data: {
      labels: groups.map((group) => group.group),
      datasets: gameTypes.map((gameType, index) => ({
        label: gameType,
        data: groups.map((group) => group.games.find((game) => game.game_type === gameType)?.total_plays ?? 0),
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  }), [gameTypes, groups]);

  const rows = groups
    .flatMap((group) => group.games.map((game) => ({ group: group.group, ...game })))
    .sort((a, b) => b.total_plays - a.total_plays);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Game Popularity Breakdown</h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div className="h-80 rounded-md border border-slate-200 p-3">
          <ChartCanvas config={chartConfig} />
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Game</th>
                  <th className="px-3 py-2 text-right">Plays</th>
                  <th className="px-3 py-2 text-right">Avg</th>
                  <th className="px-3 py-2 text-right">Win</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={`${row.group}-${row.game_type}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.group}</td>
                    <td className="px-3 py-2 text-slate-600">{row.game_type}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{row.total_plays}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatMinutes(row.avg_duration_minutes)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.win_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function GeographicMap({ nodes }: { nodes: GeoNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const stateMetrics = useMemo(() => {
    const byState = new Map<string, GeoNode>();
    const visit = (node: GeoNode) => {
      if (node.level === "state_code" || node.level === "state") byState.set(node.label.toUpperCase(), node);
      node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return byState;
  }, [nodes]);
  const maxUsers = Math.max(1, ...Array.from(stateMetrics.values()).map((node) => node.active_users));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderRows = (items: GeoNode[], depth = 0): ReactNode =>
    items.map((node) => (
      <div key={`${node.level}-${node.key}`}>
        <button
          type="button"
          onClick={() => toggle(`${node.level}-${node.key}`)}
          className="grid w-full grid-cols-[1fr_90px_110px_120px] items-center border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
        >
          <span className="truncate font-medium text-slate-800" style={{ paddingLeft: depth * 16 }}>
            {node.children.length > 0 ? (expanded.has(`${node.level}-${node.key}`) ? "- " : "+ ") : ""}
            {node.label}
          </span>
          <span className="text-right text-slate-700">{node.active_users}</span>
          <span className="text-right text-slate-700">{node.total_sessions}</span>
          <span className="text-right text-slate-700">{formatMinutes(node.total_duration_minutes)}</span>
        </button>
        {expanded.has(`${node.level}-${node.key}`) ? renderRows(node.children, depth + 1) : null}
      </div>
    ));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Geographic Distribution</h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-8 gap-1">
            {STATE_ORDER.map((state) => {
              const node = stateMetrics.get(state);
              const intensity = node ? Math.max(0.1, node.active_users / maxUsers) : 0.03;
              return (
                <button
                  key={state}
                  type="button"
                  className="aspect-square rounded border border-white text-[11px] font-bold text-slate-900 shadow-sm"
                  style={{ backgroundColor: `rgba(22, 163, 74, ${intensity})` }}
                  title={`${state}: ${node?.active_users ?? 0} users`}
                >
                  {state}
                </button>
              );
            })}
          </div>
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="grid grid-cols-[1fr_90px_110px_120px] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
            <span>Location</span>
            <span className="text-right">Users</span>
            <span className="text-right">Sessions</span>
            <span className="text-right">Playtime</span>
          </div>
          <div className="max-h-96 overflow-auto">{renderRows(nodes)}</div>
        </div>
      </div>
    </section>
  );
}

function AdPerformanceTable({ groups }: { groups: AdPerformanceGroup[] }) {
  const chartConfig = useMemo<ChartConfiguration>(() => {
    const topGroups = groups.slice(0, 4);
    const labels = Array.from(new Set(topGroups.flatMap((group) => group.ctr_trend?.map((item) => item.date.slice(5)) ?? []))).sort();
    return {
      type: "line",
      data: {
        labels,
        datasets: topGroups.map((group, index) => ({
          label: group.group,
          data: labels.map((label) => group.ctr_trend?.find((item) => item.date.slice(5) === label)?.ctr ?? 0),
          borderColor: CHART_COLORS[index % CHART_COLORS.length],
          backgroundColor: "transparent",
          tension: 0.35,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => `${value}%` } } },
      },
    };
  }, [groups]);

  const rows = groups.flatMap((group) =>
    group.top_ads.map((ad) => ({
      group: group.group,
      impressions: group.total_impressions,
      ...ad,
    }))
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Ad Performance by Location</h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="h-72 rounded-md border border-slate-200 p-3">
          <ChartCanvas config={chartConfig} />
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="max-h-72 overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2 text-right">Impressions</th>
                  <th className="px-3 py-2 text-right">Clicks</th>
                  <th className="px-3 py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={`${row.group}-${row.ad_id}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.group}</td>
                    <td className="px-3 py-2 text-slate-600">{row.ad_name}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.impressions}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.clicks}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function UserAnalyticsSection({ venues = [] }: { venues?: Venue[] }) {
  const [filters, setFilters] = useState<AnalyticsFilters>(() => getInitialFilters());
  const [refreshToken, setRefreshToken] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data, loading, error } = useUserAnalytics(filters, refreshToken, autoRefresh);

  const metrics = useMemo(() => {
    const totalActiveUsers = data.sessions.reduce((sum, item) => sum + item.active_users, 0);
    const totalSessions = data.sessions.reduce((sum, item) => sum + item.total_sessions, 0);
    const weightedDuration = data.sessions.reduce((sum, item) => sum + item.avg_session_duration_minutes * item.total_sessions, 0);
    const totalGames = data.games.reduce((sum, group) => sum + group.games.reduce((inner, game) => inner + game.total_plays, 0), 0);
    const impressions = data.ads.reduce((sum, group) => sum + group.total_impressions, 0);
    const clicks = data.ads.reduce((sum, group) => sum + group.total_clicks, 0);
    return {
      totalActiveUsers,
      totalSessions,
      avgDuration: totalSessions > 0 ? weightedDuration / totalSessions : 0,
      totalGames,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  }, [data]);

  const selectedVenueSummary = filters.venueIds.length === 0 ? "All venues" : `${filters.venueIds.length} selected`;

  function toggleVenue(venueId: string) {
    setFilters((prev) => ({
      ...prev,
      venueIds: prev.venueIds.includes(venueId)
        ? prev.venueIds.filter((id) => id !== venueId)
        : [...prev.venueIds, venueId],
    }));
  }

  function exportCsv() {
    const rows = [
      ["section", "group", "metric", "value"],
      ...data.sessions.flatMap((item) => [
        ["sessions", item.group, "active_users", String(item.active_users)],
        ["sessions", item.group, "total_sessions", String(item.total_sessions)],
        ["sessions", item.group, "avg_session_duration_minutes", String(item.avg_session_duration_minutes)],
      ]),
      ...data.games.flatMap((group) =>
        group.games.map((game) => ["games", group.group, game.game_type, String(game.total_plays)])
      ),
      ...data.ads.flatMap((group) => [
        ["ads", group.group, "impressions", String(group.total_impressions)],
        ["ads", group.group, "clicks", String(group.total_clicks)],
        ["ads", group.group, "ctr", String(group.ctr)],
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "user-analytics.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyShareLink() {
    const params = buildParams(filters);
    const url = `${window.location.origin}/admin/user-analytics?${params.toString()}`;
    await navigator.clipboard.writeText(url);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <CalendarDays className="h-4 w-4" />
              Time Period
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["7d", "30d", "custom"] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, rangePreset: preset }))}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    filters.rangePreset === preset ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {preset === "7d" ? "Last 7 days" : preset === "30d" ? "Last 30 days" : "Custom"}
                </button>
              ))}
              {filters.rangePreset === "custom" ? (
                <>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Search className="h-4 w-4" />
              Filters
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select
                value={filters.groupBy}
                onChange={(event) => setFilters((prev) => ({ ...prev, groupBy: event.target.value as GroupBy }))}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                {GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <details className="relative">
                <summary className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {selectedVenueSummary}
                </summary>
                <div className="absolute z-20 mt-2 max-h-72 w-72 overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, venueIds: [] }))}
                    className="mb-2 w-full rounded px-2 py-1 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    All venues
                  </button>
                  {venues.map((venue) => (
                    <label key={venue.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={filters.venueIds.includes(venue.id)}
                        onChange={() => toggleVenue(venue.id)}
                      />
                      <span className="truncate">{venue.displayName || venue.name}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, groupBy: "venue" }))} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Top Venues</button>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, groupBy: "state_code" }))} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Top States</button>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, groupBy: "city" }))} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Least Active Cities</button>
              <button type="button" onClick={() => setFilters((prev) => ({ ...prev, groupBy: "region_key" }))} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Regional Ads</button>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-end gap-2">
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              Auto
            </label>
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button type="button" onClick={() => void copyShareLink()} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" />
              Link
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Active Users" value={String(metrics.totalActiveUsers)} icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Total Sessions" value={String(metrics.totalSessions)} icon={<BarChart3 className="h-5 w-5" />} />
        <MetricCard label="Avg Session Duration" value={formatMinutes(metrics.avgDuration)} icon={<CalendarDays className="h-5 w-5" />} />
        <MetricCard label="Total Games Played" value={String(metrics.totalGames)} icon={<Target className="h-5 w-5" />} />
        <MetricCard label="Ad Click-Through Rate" value={`${Math.round(metrics.ctr * 100) / 100}%`} icon={<MapIcon className="h-5 w-5" />} />
      </div>

      <ActivityTimeline sessions={data.sessions} games={data.games} />
      <GamePopularityChart groups={data.games} />
      <GeographicMap nodes={data.geography} />
      <AdPerformanceTable groups={data.ads} />
    </div>
  );
}
