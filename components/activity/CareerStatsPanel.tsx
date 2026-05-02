"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserId } from "@/lib/storage";

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
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
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
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Join a venue to view your career stats.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading career stats...</p>;
  }

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
        {errorMessage}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        No career stats found yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Career Stats</h2>
        <p className="mt-1 text-xs text-slate-500">
          Last updated {new Date(stats.generatedAt).toLocaleString()}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Trivia</h3>
        <div className="mt-3 space-y-2">
          {metricRow("Questions answered", stats.trivia.totalAnswered)}
          {metricRow("Correct", stats.trivia.correct)}
          {metricRow("Incorrect", stats.trivia.incorrect)}
          {metricRow("Accuracy", `${stats.trivia.accuracyPct.toFixed(1)}%`)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Bingo</h3>
        <div className="mt-3 space-y-2">
          {metricRow("Total boards", stats.bingo.totalBoards)}
          {metricRow("Active", stats.bingo.active)}
          {metricRow("Won", stats.bingo.won)}
          {metricRow("Lost", stats.bingo.lost)}
          {metricRow("Canceled", stats.bingo.canceled)}
          {metricRow("Win rate", `${stats.bingo.winRatePct.toFixed(1)}%`)}
          {metricRow("Claimed points", stats.bingo.totalClaimedPoints)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Pick 'Em</h3>
        <div className="mt-3 space-y-2">
          {metricRow("Total picks", stats.pickem.totalPicks)}
          {metricRow("Pending", stats.pickem.pending)}
          {metricRow("Won", stats.pickem.won)}
          {metricRow("Lost", stats.pickem.lost)}
          {metricRow("Push", stats.pickem.push)}
          {metricRow("Canceled", stats.pickem.canceled)}
          {metricRow("Win rate", `${stats.pickem.winRatePct.toFixed(1)}%`)}
          {metricRow("Claimed points", stats.pickem.totalClaimedPoints)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Fantasy</h3>
        <div className="mt-3 space-y-2">
          {metricRow("Total lineups", stats.fantasy.totalLineups)}
          {metricRow("Pending", stats.fantasy.pending)}
          {metricRow("Live", stats.fantasy.live)}
          {metricRow("Final", stats.fantasy.final)}
          {metricRow("Canceled", stats.fantasy.canceled)}
          {metricRow("Best score", stats.fantasy.bestScore.toFixed(2))}
          {metricRow("Your average score", stats.fantasy.averageScore.toFixed(2))}
          {metricRow("Venue average", stats.fantasy.venueAverageScore.toFixed(2))}
          {metricRow("Global average", stats.fantasy.globalAverageScore.toFixed(2))}
          {metricRow("Vs venue average", formatSigned(stats.fantasy.vsVenueAverage))}
          {metricRow("Vs global average", formatSigned(stats.fantasy.vsGlobalAverage))}
          {metricRow("Claimed points", stats.fantasy.totalClaimedPoints)}
        </div>
      </section>
    </div>
  );
}
