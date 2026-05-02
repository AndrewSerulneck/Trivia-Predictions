"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import type { FantasyEntry, FantasyGame, FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";

type GamesPayload = {
  ok: boolean;
  games?: FantasyGame[];
  playerPool?: FantasyPlayerPoolItem[];
  leaderboard?: FantasyLeaderboardEntry[];
  dailyGameId?: string;
  error?: string;
};

type EntriesPayload = {
  ok: boolean;
  entries?: FantasyEntry[];
  error?: string;
};

function getTodayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFantasyDailyGameId(date: string): string {
  return `nba-daily-${date}`;
}

function formatLocalDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: FantasyEntry["status"] | FantasyGame["status"]): string {
  if (status === "final") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (status === "live") return "bg-amber-100 text-amber-900 border-amber-300";
  if (status === "canceled") return "bg-slate-200 text-slate-700 border-slate-300";
  return "bg-blue-100 text-blue-900 border-blue-300";
}

function toStatusLabel(status: FantasyEntry["status"] | FantasyGame["status"]): string {
  if (status === "final") return "Final";
  if (status === "live") return "Live";
  if (status === "canceled") return "Canceled";
  return "Scheduled";
}

function computeFantasyClaimablePoints(entry: Pick<FantasyEntry, "points">): number {
  return Math.max(0, Math.round(Number(entry.points ?? 0) * 10));
}

function normalizePlayerKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function FantasyHome() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [games, setGames] = useState<FantasyGame[]>([]);
  const [entries, setEntries] = useState<FantasyEntry[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [playerPool, setPlayerPool] = useState<FantasyPlayerPoolItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [hasStartedGame, setHasStartedGame] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingEntryId, setClaimingEntryId] = useState("");
  const fantasyKickoffRefreshTimerRef = useRef<number | null>(null);
  const todayDate = useMemo(() => getTodayDateInput(), []);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    try {
      const date = todayDate;
      const params = new URLSearchParams({
        date,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        limit: "30",
      });
      const response = await fetch(`/api/fantasy/games?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as GamesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load fantasy games.");
      }

      const nextGames = payload.games ?? [];
      setGames(nextGames);
      const fallbackDailyGameId = buildFantasyDailyGameId(date);
      setSelectedGameId(String(payload.dailyGameId ?? "").trim() || fallbackDailyGameId);
    } catch (error) {
      setGames([]);
      setSelectedGameId("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy games.");
    } finally {
      setLoadingGames(false);
    }
  }, [todayDate]);

  const loadEntries = useCallback(async (refreshSettlement = true, showLoading = refreshSettlement) => {
    if (!userId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }

    if (showLoading) {
      setLoadingEntries(true);
    }
    try {
      const params = new URLSearchParams({
        userId,
        includeSettled: "true",
        refreshProgress: refreshSettlement ? "true" : "false",
        limit: "200",
      });
      const response = await fetch(`/api/fantasy/entries?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as EntriesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load fantasy entries.");
      }
      setEntries(payload.entries ?? []);
    } catch (error) {
      setEntries([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy entries.");
    } finally {
      if (showLoading) {
        setLoadingEntries(false);
      }
    }
  }, [userId]);

  const loadSelectedGameDetails = useCallback(async () => {
    if (!selectedGameId) {
      setPlayerPool([]);
      setLeaderboard([]);
      return;
    }

    try {
      const params = new URLSearchParams({
        gameId: selectedGameId,
        date: todayDate,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
      });
      if (venueId) {
        params.set("venueId", venueId);
      }

      const response = await fetch(`/api/fantasy/games?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as GamesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load player pool.");
      }

      setPlayerPool(payload.playerPool ?? []);
      setLeaderboard(payload.leaderboard ?? []);

      setSelectedPlayers((current) => {
        const poolKeys = new Set((payload.playerPool ?? []).map((item) => item.playerName));
        return current.filter((name) => poolKeys.has(name));
      });
    } catch (error) {
      setPlayerPool([]);
      setLeaderboard([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy player pool.");
    }
  }, [selectedGameId, todayDate, venueId]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void loadEntries(true);
  }, [loadEntries, userId]);

  useEffect(() => {
    void loadSelectedGameDetails();
  }, [loadSelectedGameDetails]);

  const existingEntryForSelectedGame = useMemo(
    () => entries.find((entry) => entry.gameId === selectedGameId),
    [entries, selectedGameId]
  );
  const playerPoolKeys = useMemo(
    () => new Set(playerPool.map((item) => normalizePlayerKey(item.playerName)).filter(Boolean)),
    [playerPool]
  );
  const canEditExistingEntryLineup = useMemo(() => {
    if (!existingEntryForSelectedGame) {
      return false;
    }
    if (existingEntryForSelectedGame.status === "final" || existingEntryForSelectedGame.status === "canceled") {
      return false;
    }
    if (playerPoolKeys.size === 0) {
      return false;
    }
    return existingEntryForSelectedGame.lineup.every((playerName) => playerPoolKeys.has(normalizePlayerKey(playerName)));
  }, [existingEntryForSelectedGame, playerPoolKeys]);
  const nextUnlockedGame = useMemo(() => games.find((game) => !game.isLocked) ?? null, [games]);
  const canSubmitLineup =
    Boolean(userId && venueId && selectedGameId) &&
    selectedPlayers.length === 5 &&
    !submitting &&
    playerPool.length > 0;
  const liveEntries = useMemo(() => entries.filter((entry) => entry.status === "live"), [entries]);
  const hasActiveDraftedEntry = useMemo(
    () => entries.some((entry) => entry.status === "pending" || entry.status === "live"),
    [entries]
  );
  const hasLiveEntry = liveEntries.length > 0;
  const nextPendingEntryStartMs = useMemo(() => {
    const now = Date.now();
    let nextStart: number | null = null;
    for (const entry of entries) {
      if (entry.status !== "pending") {
        continue;
      }
      const startsAtMs = Date.parse(entry.startsAt);
      if (!Number.isFinite(startsAtMs) || startsAtMs <= now) {
        continue;
      }
      if (nextStart === null || startsAtMs < nextStart) {
        nextStart = startsAtMs;
      }
    }
    return nextStart;
  }, [entries]);
  const trackedEntry = useMemo(() => {
    const selected = entries.find((entry) => entry.gameId === selectedGameId);
    if (selected) {
      return selected;
    }
    if (liveEntries.length > 0) {
      return liveEntries[0] ?? null;
    }
    return entries[0] ?? null;
  }, [entries, liveEntries, selectedGameId]);
  const trackedEntryClaimablePoints = useMemo(
    () => (trackedEntry ? computeFantasyClaimablePoints(trackedEntry) : 0),
    [trackedEntry]
  );
  const trackedEntryBasePoints = useMemo(
    () => (trackedEntry ? Math.max(0, Number(trackedEntry.points ?? 0)) : 0),
    [trackedEntry]
  );
  const showTrackedEntryClaimButton = useMemo(
    () => Boolean(trackedEntry && trackedEntry.status === "final" && !trackedEntry.rewardClaimedAt && trackedEntryClaimablePoints > 0),
    [trackedEntry, trackedEntryClaimablePoints]
  );
  const hasResolvedEntries = !loadingEntries;

  useEffect(() => {
    if (!selectedGameId) {
      setHasStartedGame(false);
      return;
    }

    if (existingEntryForSelectedGame) {
      setHasStartedGame(true);
      return;
    }

    setHasStartedGame(false);
  }, [existingEntryForSelectedGame, selectedGameId]);

  useEffect(() => {
    if (!existingEntryForSelectedGame || !canEditExistingEntryLineup) {
      return;
    }
    setSelectedPlayers(existingEntryForSelectedGame.lineup);
  }, [canEditExistingEntryLineup, existingEntryForSelectedGame]);

  useEffect(() => {
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!userId || !hasLiveEntry) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadEntries(true, false);
      void loadSelectedGameDetails();
      void loadGames();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [hasLiveEntry, loadEntries, loadGames, loadSelectedGameDetails, userId]);

  useEffect(() => {
    if (!userId || hasLiveEntry || nextPendingEntryStartMs === null) {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
      return;
    }
    const delayMs = Math.max(0, nextPendingEntryStartMs - Date.now() + 300);
    fantasyKickoffRefreshTimerRef.current = window.setTimeout(() => {
      fantasyKickoffRefreshTimerRef.current = null;
      void loadEntries(true, false);
      void loadSelectedGameDetails();
      void loadGames();
    }, delayMs);
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
    };
  }, [hasLiveEntry, loadEntries, loadGames, loadSelectedGameDetails, nextPendingEntryStartMs, userId]);

  const togglePlayer = useCallback((playerName: string) => {
    setSelectedPlayers((current) => {
      if (current.includes(playerName)) {
        return current.filter((name) => name !== playerName);
      }
      if (current.length >= 5) {
        return current;
      }
      return [...current, playerName];
    });
  }, []);

  const submitLineup = useCallback(async () => {
    if (!canSubmitLineup || !selectedGameId) {
      return;
    }

    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/fantasy/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: existingEntryForSelectedGame ? "update" : "submit",
          userId,
          venueId,
          gameId: selectedGameId,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          lineup: selectedPlayers,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to submit fantasy lineup.");
      }

      setStatusMessage(
        existingEntryForSelectedGame
          ? "Lineup updated. Live scoring will continue automatically."
          : "Lineup submitted. Live scoring will update automatically."
      );
      if (!existingEntryForSelectedGame) {
        setSelectedPlayers([]);
      }
      await Promise.all([loadEntries(true), loadSelectedGameDetails()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit fantasy lineup.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmitLineup, existingEntryForSelectedGame, loadEntries, loadSelectedGameDetails, selectedGameId, selectedPlayers, userId, venueId]);

  const claimReward = useCallback(
    async (entry: FantasyEntry, sourceRect?: DOMRect) => {
      if (!userId || !entry.id || claimingEntryId) {
        return;
      }

      setClaimingEntryId(entry.id);
      setStatusMessage("");
      setErrorMessage("");
      try {
        const response = await fetch("/api/fantasy/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim",
            userId,
            entryId: entry.id,
          }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          result?: { claimed: boolean; pointsAwarded: number };
        };

        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to claim fantasy reward.");
        }

        if (payload.result?.claimed) {
          if (sourceRect && payload.result.pointsAwarded > 0) {
            window.dispatchEvent(
              new CustomEvent("tp:coin-flight", {
                detail: {
                  sourceRect: {
                    left: sourceRect.left,
                    top: sourceRect.top,
                    width: sourceRect.width,
                    height: sourceRect.height,
                  },
                  delta: payload.result.pointsAwarded,
                  coins: Math.min(36, Math.max(12, Math.round(payload.result.pointsAwarded / 2))),
                },
              })
            );
            window.dispatchEvent(
              new CustomEvent("tp:points-updated", {
                detail: {
                  source: "fantasy-claim",
                  delta: payload.result.pointsAwarded,
                },
              })
            );
          }
          setStatusMessage(`Claimed +${payload.result.pointsAwarded} points.`);
        } else {
          setStatusMessage("Reward was already claimed.");
        }

        await loadEntries(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim fantasy reward.");
      } finally {
        setClaimingEntryId("");
      }
    },
    [claimingEntryId, loadEntries, userId]
  );

  if (!userId || !venueId) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Join a venue to create and track fantasy lineups.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VenueEntryRulesPanel gameKey="fantasy" shouldDisplay={entries.length === 0} />

      <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hightop Fantasy™</h2>
            <p className="text-sm text-slate-700">Build a 5-player lineup and compete live with your venue.</p>
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {errorMessage}
          </p>
        ) : null}

        {loadingGames ? (
          <div className="mt-3 text-sm text-slate-600">Loading fantasy games...</div>
        ) : games.length === 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No NBA games available for this date.
          </div>
        ) : null}
      </section>

      {trackedEntry ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Your Team Tracker</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(trackedEntry.status)}`}>
              {toStatusLabel(trackedEntry.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-700">
            {trackedEntry.gameLabel} · {formatLocalDateTime(trackedEntry.startsAt)}
          </p>
          {showTrackedEntryClaimButton ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">Final fantasy score summary</p>
              <div className="mt-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
                <p>Base fantasy score: {trackedEntryBasePoints.toFixed(2)} pts</p>
                <p>Multiplier: x10</p>
                <p className="font-semibold">Total to collect: {trackedEntryClaimablePoints} points</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void claimReward(trackedEntry, rect);
                }}
                disabled={claimingEntryId === trackedEntry.id}
                className="tp-clean-button mt-3 rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-60"
              >
                {claimingEntryId === trackedEntry.id ? "Collecting..." : `Collect ${trackedEntryClaimablePoints} Points`}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Live Points</p>
                  <p className="text-sm font-black text-slate-900">{trackedEntry.points.toFixed(2)} pts</p>
                </div>
                <ul className="mt-2 space-y-1">
                  {trackedEntry.lineup.map((playerName) => {
                    const playerPoints = Number(trackedEntry.scoreBreakdown[playerName] ?? 0);
                    return (
                      <li key={`${trackedEntry.id}-${playerName}`} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                        <span className="font-medium text-slate-800">{playerName}</span>
                        <span className="font-semibold">{playerPoints.toFixed(2)} pts</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {hasLiveEntry ? (
                <p className="mt-2 text-[11px] font-semibold text-emerald-800">Live game detected. Updating every 5 seconds.</p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-600">No live game right now. Automatic updates will resume when your next game starts.</p>
              )}
            </>
          )}
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && !hasActiveDraftedEntry && !existingEntryForSelectedGame && !hasStartedGame ? (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Game Start</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">Hightop Fantasy™ Rules</h3>
          <p className="mt-1 text-sm text-slate-700">
            Build one NBA lineup for today&apos;s slate. Only players in games that have not started are eligible.
          </p>
          <div className="mt-3 space-y-1 rounded-lg border border-cyan-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-700">- Draft a team</p>
            <p className="text-xs text-slate-700">- Earn points based on player stats</p>
            <p className="text-xs text-slate-700">- Teams are locked once games begin</p>
          </div>
          <button
            type="button"
            onClick={() => setHasStartedGame(true)}
            className="tp-clean-button mt-3 rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900"
          >
            Start Fantasy Game
          </button>
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && ((hasStartedGame && !existingEntryForSelectedGame) || canEditExistingEntryLineup) ? (
        <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {existingEntryForSelectedGame ? "Update Lineup" : "Lineup Builder"}
            </h3>
            <div className="text-xs font-semibold text-slate-700">Selected {selectedPlayers.length}/5</div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Scoring: 1 pt per point, 1.2 per rebound, 1.5 per assist, 3 per steal, 3 per block, -1 per turnover.
          </div>
          <p className="mt-2 text-xs text-slate-700">
            Tap a highlighted player to remove them from your lineup. Tap any other player to add them.
          </p>

          {playerPool.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600">
              {nextUnlockedGame ? "Loading player pool..." : "All games have started. No eligible players remain for today."}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {playerPool.map((item) => {
                const selected = selectedPlayers.includes(item.playerName);
                return (
                  <button
                    key={item.playerName}
                    type="button"
                    disabled={selectedPlayers.length >= 5 && !selected}
                    onClick={() => togglePlayer(item.playerName)}
                    className={`tp-clean-button rounded-lg border px-3 py-2 text-left disabled:opacity-60 ${
                      selected
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-violet-200 bg-white/90 hover:border-violet-300"
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{item.playerName}</div>
                    <div className="text-[11px] text-slate-600">
                      Markets: {item.coverage} · Avg line: {item.projectedLine ?? "--"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedPlayers.map((name) => (
              <span key={name} className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                {name}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void submitLineup()}
            disabled={!canSubmitLineup}
            className="tp-clean-button mt-3 rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
          >
            {submitting ? "Saving..." : existingEntryForSelectedGame ? "Save Lineup Changes" : "Submit Lineup"}
          </button>
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && existingEntryForSelectedGame && !canEditExistingEntryLineup ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Lineup Locked</h3>
          <p className="mt-1 text-sm text-slate-700">
            Your team is already set for today. Changes are only allowed before any selected player&apos;s game starts.
          </p>
        </section>
      ) : null}

      
    </div>
  );
}
