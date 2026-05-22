"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errors";

type PickEmMatchup = {
  gameId: string;
  sportSlug: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  pickCount: number;
  settled: boolean;
  outcome: "home" | "away" | null;
  status: "unsettled" | "settled" | "canceled";
  statusLabel: string;
  settledWinnerTeam: string | null;
};

type SortField = "matchup" | "sport" | "league" | "startTime" | "status";
type SortDirection = "asc" | "desc";

const SPORT_LABELS: Record<string, string> = {
  nba: "Basketball",
  mlb: "Baseball",
  nhl: "Hockey",
  nfl: "Football",
  soccer: "Soccer",
  mma: "MMA",
};

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortIndicator(active: boolean, direction: SortDirection) {
  if (!active) return "";
  return direction === "asc" ? " ▲" : " ▼";
}

export function PickEmSettlementSection() {
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate);
  const [items, setItems] = useState<PickEmMatchup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("startTime");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [settlingByGameId, setSettlingByGameId] = useState<Record<string, boolean>>({});

  const fetchMatchups = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        resource: "pickem-matchups",
        date,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
      });
      const response = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: PickEmMatchup[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load Pick 'Em matchups.");
      }

      setItems(payload.items ?? []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load Pick 'Em matchups."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMatchups(selectedDate);
  }, [selectedDate, fetchMatchups]);

  const sportOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((item) => item.sportSlug.toLowerCase()))).sort()];
  }, [items]);

  const leagueOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((item) => item.league).filter(Boolean))).sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (sportFilter !== "all" && item.sportSlug.toLowerCase() !== sportFilter) return false;
      if (leagueFilter !== "all" && item.league !== leagueFilter) return false;
      if (!q) return true;
      return item.homeTeam.toLowerCase().includes(q) || item.awayTeam.toLowerCase().includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      const by = (valueA: string | number, valueB: string | number) => {
        if (valueA === valueB) return 0;
        return valueA > valueB ? 1 : -1;
      };

      let result = 0;
      switch (sortField) {
        case "matchup":
          result = by(`${a.homeTeam} vs ${a.awayTeam}`.toLowerCase(), `${b.homeTeam} vs ${b.awayTeam}`.toLowerCase());
          break;
        case "sport":
          result = by(a.sportSlug.toLowerCase(), b.sportSlug.toLowerCase());
          break;
        case "league":
          result = by(a.league.toLowerCase(), b.league.toLowerCase());
          break;
        case "status":
          result = by(a.statusLabel.toLowerCase(), b.statusLabel.toLowerCase());
          break;
        case "startTime":
        default:
          result = by(+new Date(a.startsAt), +new Date(b.startsAt));
          break;
      }

      return sortDirection === "asc" ? result : -result;
    });

    return sorted;
  }, [items, leagueFilter, search, sortDirection, sortField, sportFilter]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  async function settleMatchup(matchup: PickEmMatchup, winnerTeamId: string | null, winnerLabel: string) {
    if (!winnerTeamId) {
      setError(`Missing winning team id for ${matchup.homeTeam} vs ${matchup.awayTeam}.`);
      return;
    }

    setSettlingByGameId((prev) => ({ ...prev, [matchup.gameId]: true }));
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "pickem-settle",
          gameId: matchup.gameId,
          winningTeamId: winnerTeamId,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        result?: {
          affectedPicks: number;
          winners: number;
          losers: number;
        };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to settle matchup.");
      }

      setItems((prev) =>
        prev.map((item) =>
          item.gameId === matchup.gameId
            ? {
                ...item,
                settled: true,
                outcome: winnerTeamId === matchup.homeTeamId ? "home" : winnerTeamId === matchup.awayTeamId ? "away" : null,
                status: "settled",
                statusLabel: `Settled: ${winnerLabel}`,
                settledWinnerTeam: winnerLabel,
              }
            : item
        )
      );

      setSuccess(
        `${winnerLabel} set as winner. Settled ${payload.result?.affectedPicks ?? 0} picks (${payload.result?.winners ?? 0} won / ${payload.result?.losers ?? 0} lost).`
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to settle matchup."));
    } finally {
      setSettlingByGameId((prev) => ({ ...prev, [matchup.gameId]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Pick 'Em Settlement</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a date, review all matchups, and settle unresolved games in-line.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Search Teams</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by team name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Sport</label>
            <select
              value={sportFilter}
              onChange={(event) => setSportFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {sportOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All Sports" : SPORT_LABELS[option] ?? option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">League</label>
            <select
              value={leagueFilter}
              onChange={(event) => setLeagueFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {leagueOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All Leagues" : option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Status Legend</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              Unsettled
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Settled
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Canceled
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  onClick={() => toggleSort("matchup")}
                >
                  Matchup{sortIndicator(sortField === "matchup", sortDirection)}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  onClick={() => toggleSort("sport")}
                >
                  Sport{sortIndicator(sortField === "sport", sortDirection)}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  onClick={() => toggleSort("league")}
                >
                  League{sortIndicator(sortField === "league", sortDirection)}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  onClick={() => toggleSort("startTime")}
                >
                  Start Time{sortIndicator(sortField === "startTime", sortDirection)}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortIndicator(sortField === "status", sortDirection)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Picks</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading matchups...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No matchups found for this date/filter set.</td>
                </tr>
              ) : (
                filteredItems.map((matchup) => {
                  const settling = Boolean(settlingByGameId[matchup.gameId]);
                  return (
                    <tr key={matchup.gameId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{matchup.homeTeam} vs. {matchup.awayTeam}</td>
                      <td className="px-4 py-3 text-slate-600">{matchup.sportSlug.toUpperCase()}</td>
                      <td className="px-4 py-3 text-slate-600">{matchup.league || "-"}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(matchup.startsAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {!matchup.settled ? (
                          <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">Unsettled</span>
                        ) : matchup.status === "canceled" ? (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Canceled</span>
                        ) : matchup.outcome === "home" ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Settled: Home</span>
                        ) : matchup.outcome === "away" ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Settled: Away</span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Settled</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{matchup.pickCount}</td>
                      <td className="px-4 py-3 text-right">
                        {!matchup.settled ? (
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => {
                                void settleMatchup(matchup, matchup.homeTeamId, matchup.homeTeam);
                              }}
                              disabled={settling}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {settling ? "Settling..." : `Settle ${matchup.homeTeam}`}
                            </button>
                            <button
                              onClick={() => {
                                void settleMatchup(matchup, matchup.awayTeamId, matchup.awayTeam);
                              }}
                              disabled={settling}
                              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {settling ? "Settling..." : `Settle ${matchup.awayTeam}`}
                            </button>
                          </div>
                        ) : matchup.status === "canceled" ? (
                          <span className="text-xs text-slate-500">Canceled</span>
                        ) : matchup.outcome === "home" ? (
                          <span className="text-xs text-slate-500">Outcome: Home</span>
                        ) : matchup.outcome === "away" ? (
                          <span className="text-xs text-slate-500">Outcome: Away</span>
                        ) : (
                          <span className="text-xs text-slate-500">Outcome set</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
