"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

type CareerStatsSummary = {
  generatedAt: string;
  trivia: {
    totalAnswered: number;
    correct: number;
    incorrect: number;
    accuracyPct: number;
  };
  bingo: {
    totalBoards: number;
    active: number;
    won: number;
    lost: number;
    canceled: number;
    winRatePct: number;
    totalClaimedPoints: number;
  };
  pickem: {
    totalPicks: number;
    pending: number;
    won: number;
    lost: number;
    push: number;
    canceled: number;
    winRatePct: number;
    totalClaimedPoints: number;
  };
  fantasy: {
    totalLineups: number;
    pending: number;
    live: number;
    final: number;
    canceled: number;
    bestScore: number;
    averageScore: number;
    venueAverageScore: number;
    globalAverageScore: number;
    vsVenueAverage: number;
    vsGlobalAverage: number;
    totalClaimedPoints: number;
  };
};

type CareerStatsPayload = {
  ok: boolean;
  stats?: CareerStatsSummary;
  error?: string;
};

function formatSigned(value: number): string {
  if (value > 0) {
    return `+${value.toFixed(2)}`;
  }
  return value.toFixed(2);
}

function metricRow(label: string, value: string | number) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</span>
      <span className="text-sm font-black tabular-nums text-slate-100">{value}</span>
    </div>
  );
}

function statCell(value: string | number, label: string) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3">
      <div className="text-2xl font-black tabular-nums text-slate-50">{value}</div>
      <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 leading-tight">{label}</div>
    </div>
  );
}

function progressBar(pct: number, color = "bg-cyan-500") {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function sectionHeader(label: string) {
  return <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-400">{label}</p>;
}

export function CareerStatsPanel() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [stats, setStats] = useState<CareerStatsSummary | null>(null);

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/career-stats?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as CareerStatsPayload;
      if (!payload.ok || !payload.stats) {
        throw new Error(payload.error ?? "Failed to load career stats.");
      }
      setStats(payload.stats);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load career stats.");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const refreshTimer = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [load, userId]);

  if (!userId) {
    return (
      <div className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-4 text-sm text-ht-fg-secondary">
        Join a venue to view your career stats.
      </div>
    );
  }

  if (loading) {
    return <BouncingBallLoader size="sm" label="Loading career stats..." />;
  }

  if (errorMessage) {
    return (
      <div className="rounded-ht-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-400">
        {errorMessage}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-4 text-sm text-ht-fg-secondary">
        No career stats found yet.
      </div>
    );
  }

  const overallWinRate =
    stats.bingo.totalBoards + stats.pickem.totalPicks > 0
      ? Math.round(
          ((stats.bingo.won + stats.pickem.won) /
            (stats.bingo.totalBoards + stats.pickem.totalPicks)) *
            100
        )
      : 0;

  return (
    <div className="space-y-3">
      {/* Overview card — matches mockup 2×2 grid layout */}
      <div className="rounded-2xl border border-cyan-400/20 bg-[#111827] p-4">
        {sectionHeader("Career Stats")}
        <div className="grid grid-cols-2 gap-2">
          {statCell(
            stats.fantasy.bestScore > 0 ? Math.round(stats.fantasy.bestScore) : stats.trivia.correct,
            stats.fantasy.bestScore > 0 ? "Top Points · Single Game" : "Correct Answers"
          )}
          {statCell(
            stats.bingo.totalClaimedPoints + stats.pickem.totalClaimedPoints + stats.fantasy.totalClaimedPoints,
            "All-Time Points"
          )}
          {statCell(
            `${stats.trivia.accuracyPct.toFixed(0)}%`,
            "Live Trivia Correct Rate"
          )}
          {statCell(stats.bingo.won, "Boards Bingo'd")}
        </div>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Win Rate · Last 50</span>
            <span className="text-[10px] font-black tabular-nums text-slate-300">{overallWinRate}%</span>
          </div>
          {progressBar(overallWinRate)}
        </div>
      </div>

      {/* Trivia */}
      <div className="rounded-2xl border border-cyan-400/20 bg-[#111827] p-4">
        {sectionHeader("Trivia")}
        {metricRow("Questions answered", stats.trivia.totalAnswered)}
        {metricRow("Correct", stats.trivia.correct)}
        {metricRow("Incorrect", stats.trivia.incorrect)}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Accuracy</span>
            <span className="text-[10px] font-black tabular-nums text-slate-300">{stats.trivia.accuracyPct.toFixed(1)}%</span>
          </div>
          {progressBar(stats.trivia.accuracyPct, "bg-cyan-500")}
        </div>
      </div>

      {/* Bingo */}
      <div className="rounded-2xl border border-amber-400/20 bg-[#111827] p-4">
        {sectionHeader("Bingo")}
        {metricRow("Total boards", stats.bingo.totalBoards)}
        {metricRow("Won", stats.bingo.won)}
        {metricRow("Lost", stats.bingo.lost)}
        {stats.bingo.canceled > 0 ? metricRow("Canceled", stats.bingo.canceled) : null}
        {metricRow("Claimed points", stats.bingo.totalClaimedPoints)}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Win Rate</span>
            <span className="text-[10px] font-black tabular-nums text-slate-300">{stats.bingo.winRatePct.toFixed(1)}%</span>
          </div>
          {progressBar(stats.bingo.winRatePct, "bg-amber-500")}
        </div>
      </div>

      {/* Pick 'Em */}
      <div className="rounded-2xl border border-violet-400/20 bg-[#111827] p-4">
        {sectionHeader("Pick 'Em")}
        {metricRow("Total picks", stats.pickem.totalPicks)}
        {metricRow("Won", stats.pickem.won)}
        {metricRow("Lost", stats.pickem.lost)}
        {stats.pickem.push > 0 ? metricRow("Push", stats.pickem.push) : null}
        {stats.pickem.canceled > 0 ? metricRow("Canceled", stats.pickem.canceled) : null}
        {metricRow("Claimed points", stats.pickem.totalClaimedPoints)}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Win Rate</span>
            <span className="text-[10px] font-black tabular-nums text-slate-300">{stats.pickem.winRatePct.toFixed(1)}%</span>
          </div>
          {progressBar(stats.pickem.winRatePct, "bg-violet-500")}
        </div>
      </div>

      {/* Fantasy */}
      <div className="rounded-2xl border border-violet-400/20 bg-[#111827] p-4">
        {sectionHeader("Fantasy")}
        {metricRow("Total lineups", stats.fantasy.totalLineups)}
        {stats.fantasy.live > 0 ? metricRow("Live", stats.fantasy.live) : null}
        {metricRow("Best score", Math.round(stats.fantasy.bestScore))}
        {metricRow("Your avg score", stats.fantasy.averageScore.toFixed(1))}
        {metricRow("Venue avg", stats.fantasy.venueAverageScore.toFixed(1))}
        {metricRow("vs Venue avg", formatSigned(stats.fantasy.vsVenueAverage))}
        {metricRow("vs Global avg", formatSigned(stats.fantasy.vsGlobalAverage))}
        {metricRow("Claimed points", stats.fantasy.totalClaimedPoints)}
      </div>

      <p className="px-1 text-[10px] text-slate-600">
        Updated {new Date(stats.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
