"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import type { FantasyEntry, FantasyGame, FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";

type GamesPayload = {
  ok: boolean;
  games?: FantasyGame[];
  playerPool?: FantasyPlayerPoolItem[];
  leaderboard?: FantasyLeaderboardEntry[];
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

export function FantasyHome() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(getTodayDateInput);
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

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    try {
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

      setSelectedGameId((current) => {
        if (current && nextGames.some((game) => game.id === current)) {
          return current;
        }
        const firstUnlocked = nextGames.find((game) => !game.isLocked);
        return firstUnlocked?.id ?? nextGames[0]?.id ?? "";
      });
    } catch (error) {
      setGames([]);
      setSelectedGameId("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy games.");
    } finally {
      setLoadingGames(false);
    }
  }, [date]);

  const loadEntries = useCallback(async (refreshSettlement = true) => {
    if (!userId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }

    if (refreshSettlement) {
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
      setLoadingEntries(false);
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
  }, [selectedGameId, venueId]);

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

  useEffect(() => {
    if (!userId) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadEntries(false);
      void loadSelectedGameDetails();
    }, 25000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries, loadSelectedGameDetails, userId]);

  const selectedGame = useMemo(() => games.find((game) => game.id === selectedGameId) ?? null, [games, selectedGameId]);

  const canSubmitLineup =
    Boolean(userId && venueId && selectedGame && !selectedGame.isLocked) && selectedPlayers.length === 5 && !submitting;

  const existingEntryForSelectedGame = useMemo(
    () => entries.find((entry) => entry.gameId === selectedGameId),
    [entries, selectedGameId]
  );

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
    if (!canSubmitLineup || !selectedGame) {
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
          action: "submit",
          userId,
          venueId,
          gameId: selectedGame.id,
          lineup: selectedPlayers,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to submit fantasy lineup.");
      }

      setStatusMessage("Lineup submitted. Live scoring will update automatically.");
      setSelectedPlayers([]);
      await Promise.all([loadEntries(true), loadSelectedGameDetails()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit fantasy lineup.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmitLineup, loadEntries, loadSelectedGameDetails, selectedGame, selectedPlayers, userId, venueId]);

  const claimReward = useCallback(
    async (entryId: string) => {
      if (!userId || !entryId || claimingEntryId) {
        return;
      }

      setClaimingEntryId(entryId);
      setStatusMessage("");
      setErrorMessage("");
      try {
        const response = await fetch("/api/fantasy/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim",
            userId,
            entryId,
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
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="tp-clean-button rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
          />
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
        ) : (
          <div className="mt-3 grid gap-2">
            {games.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => setSelectedGameId(game.id)}
                className={`tp-clean-button rounded-xl border px-3 py-2 text-left ${
                  selectedGameId === game.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-violet-200 bg-white/90 hover:border-violet-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{game.gameLabel}</div>
                    <div className="text-xs text-slate-600">{formatLocalDateTime(game.startsAt)}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(game.status)}`}>
                    {toStatusLabel(game.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedGame && !existingEntryForSelectedGame && !hasStartedGame ? (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Game Start</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">Hightop Fantasy™ Rules</h3>
          <p className="mt-1 text-sm text-slate-700">
            You are starting a live mini-fantasy matchup for <span className="font-semibold">{selectedGame.gameLabel}</span>.
          </p>
          <div className="mt-3 space-y-1 rounded-lg border border-cyan-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-700">- Build exactly 5 unique players from the available pool.</p>
            <p className="text-xs text-slate-700">- Lineups lock at game start.</p>
            <p className="text-xs text-slate-700">- Live points refresh automatically during the game.</p>
            <p className="text-xs text-slate-700">- Top lineup in your venue wins the featured reward points.</p>
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

      {selectedGame && hasStartedGame ? (
        <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Lineup Builder</h3>
            <div className="text-xs font-semibold text-slate-700">Selected {selectedPlayers.length}/5</div>
          </div>

          {existingEntryForSelectedGame ? (
            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              You already entered this game. Track your lineup in the Entries section below.
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Scoring: 1 pt per point, 1.2 per rebound, 1.5 per assist, 3 per steal, 3 per block, -1 per turnover.
          </div>

          {playerPool.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600">Loading player pool...</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {playerPool.map((item) => {
                const selected = selectedPlayers.includes(item.playerName);
                return (
                  <button
                    key={item.playerName}
                    type="button"
                    disabled={Boolean(existingEntryForSelectedGame) || (selectedPlayers.length >= 5 && !selected)}
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
            disabled={!canSubmitLineup || Boolean(existingEntryForSelectedGame)}
            className="tp-clean-button mt-3 rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Lineup"}
          </button>
        </section>
      ) : null}

      {selectedGame ? (
        <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Game Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No lineups submitted yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {leaderboard.map((entry) => (
                <li key={entry.entryId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        #{entry.rank} {entry.username}
                      </p>
                      <p className="text-[11px] text-slate-600">{entry.lineup.join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">{entry.points.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-600">pts</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Your Entries</h3>
        {loadingEntries ? (
          <p className="mt-2 text-sm text-slate-600">Loading entries...</p>
        ) : entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No entries yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {entries.map((entry) => {
              const canClaim = entry.status === "final" && entry.rewardPoints > 0 && !entry.rewardClaimedAt;
              return (
                <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{entry.gameLabel}</p>
                      <p className="text-[11px] text-slate-600">{formatLocalDateTime(entry.startsAt)}</p>
                      <p className="mt-1 text-[11px] text-slate-700">{entry.lineup.join(", ")}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(entry.status)}`}>
                      {toStatusLabel(entry.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm font-black text-slate-900">{entry.points.toFixed(2)} pts</div>
                    <div className="text-xs text-slate-700">
                      Reward: {entry.rewardPoints > 0 ? `+${entry.rewardPoints}` : "--"}
                    </div>
                  </div>
                  {canClaim ? (
                    <button
                      type="button"
                      onClick={() => void claimReward(entry.id)}
                      disabled={claimingEntryId === entry.id}
                      className="tp-clean-button mt-2 rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-60"
                    >
                      {claimingEntryId === entry.id ? "Claiming..." : `Claim +${entry.rewardPoints} points`}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
