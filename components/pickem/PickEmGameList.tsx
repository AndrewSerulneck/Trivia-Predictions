"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";

type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "nfl";

type PickEmSport = {
  slug: PickEmSportSlug;
  label: string;
  subtitle: string;
  isInSeason: boolean;
  isClickable: boolean;
};

type PickEmGame = {
  id: string;
  sportSlug: PickEmSportSlug;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickId?: string;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push" | "canceled";
  userPickRewardPoints?: number;
  userPickRewardClaimedAt?: string | null;
};

type GamesResponse = {
  ok: boolean;
  sport?: PickEmSport;
  date?: string;
  games?: PickEmGame[];
  error?: string;
};

function toLocalDateInputValue(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalStartTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resultLabel(game: PickEmGame): string {
  if (!game.userPickStatus || game.userPickStatus === "pending") {
    return "";
  }
  if (game.userPickStatus === "won") {
    return "Correct pick";
  }
  if (game.userPickStatus === "lost") {
    return "Incorrect pick";
  }
  if (game.userPickStatus === "push") {
    return "Push (tie game)";
  }
  return "Canceled";
}

export function PickEmGameList({ sportSlug }: { sportSlug: string }) {
  const normalizedSportSlug = String(sportSlug ?? "").trim().toLowerCase();
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(() => toLocalDateInputValue());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [claimingByGameId, setClaimingByGameId] = useState<Record<string, boolean>>({});
  const [optimisticPickByGame, setOptimisticPickByGame] = useState<Record<string, string | undefined>>({});
  const [sport, setSport] = useState<PickEmSport | null>(null);
  const [games, setGames] = useState<PickEmGame[]>([]);
  const latestGameMapRef = useRef<Map<string, PickEmGame>>(new Map());
  const inFlightGameIdsRef = useRef<Record<string, boolean>>({});
  const queuedPickByGameRef = useRef<Record<string, string>>({});
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    latestGameMapRef.current = new Map(games.map((game) => [game.id, game]));
  }, [games]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const loadGames = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!background) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          sportSlug: normalizedSportSlug,
          date,
          tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        });

        if (userId) {
          params.set("userId", userId);
          params.set("refreshSettlement", "true");
        }

        const response = await fetch(`/api/pickem/games?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as GamesResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to load Pick 'Em games.");
        }

        setSport(payload.sport ?? null);
        setGames(payload.games ?? []);
        if (!background) {
          setErrorMessage("");
        }
      } catch (error) {
        if (!background || games.length === 0) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load Pick 'Em games.");
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [date, games.length, normalizedSportSlug, userId]
  );

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadGames({ background: true });
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadGames]);

  const grouped = useMemo(() => {
    const byLeague = new Map<string, PickEmGame[]>();
    for (const game of games) {
      const key = game.league || "Other";
      const list = byLeague.get(key) ?? [];
      list.push(game);
      byLeague.set(key, list);
    }
    return Array.from(byLeague.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
  }, [games]);

  const scheduleBackgroundRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadGames({ background: true });
    }, 250);
  }, [loadGames]);

  const submitPickRequest = useCallback(
    async (gameId: string, pickTeam: string) => {
      const response = await fetch("/api/pickem/picks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          venueId,
          sportSlug: normalizedSportSlug,
          gameId,
          pickTeam,
          date,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to save your pick.");
      }
    },
    [date, normalizedSportSlug, userId, venueId]
  );

  const flushGamePick = useCallback(
    async (gameId: string, pickTeam: string): Promise<void> => {
      if (inFlightGameIdsRef.current[gameId]) {
        queuedPickByGameRef.current[gameId] = pickTeam;
        return;
      }

      inFlightGameIdsRef.current[gameId] = true;
      try {
        await submitPickRequest(gameId, pickTeam);
        scheduleBackgroundRefresh();
      } catch (error) {
        delete queuedPickByGameRef.current[gameId];
        const serverPick = latestGameMapRef.current.get(gameId)?.userPickTeam;
        setOptimisticPickByGame((current) => {
          const next = { ...current };
          if (serverPick) {
            next[gameId] = serverPick;
          } else {
            delete next[gameId];
          }
          return next;
        });
        setSubmitMessage(error instanceof Error ? error.message : "Failed to save your pick.");
      } finally {
        inFlightGameIdsRef.current[gameId] = false;
        const queuedTeam = queuedPickByGameRef.current[gameId];
        if (queuedTeam && queuedTeam !== pickTeam) {
          delete queuedPickByGameRef.current[gameId];
          void flushGamePick(gameId, queuedTeam);
        }
      }
    },
    [scheduleBackgroundRefresh, submitPickRequest]
  );

  const submitPick = useCallback(
    async (game: PickEmGame, pickTeam: string) => {
      if (!userId || !venueId) {
        setSubmitMessage("Join a venue first to submit Pick 'Em selections.");
        return;
      }
      setSubmitMessage("");
      setGames((current) =>
        current.map((row) =>
          row.id === game.id
            ? {
                ...row,
                userPickTeam: pickTeam,
                userPickStatus: "pending",
              }
            : row
        )
      );
      setOptimisticPickByGame((current) => ({ ...current, [game.id]: pickTeam }));
      void flushGamePick(game.id, pickTeam);
    },
    [flushGamePick, userId, venueId]
  );

  const claimPoints = useCallback(
    async (game: PickEmGame) => {
      if (!userId || !game.userPickId) {
        setSubmitMessage("Join a venue first to collect Pick 'Em points.");
        return;
      }
      setSubmitMessage("");
      setClaimingByGameId((current) => ({ ...current, [game.id]: true }));

      try {
        const response = await fetch("/api/pickem/picks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "claim",
            userId,
            pickId: game.userPickId,
          }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          result?: { claimed: boolean; pointsAwarded: number };
          error?: string;
        };
        if (!payload.ok || !payload.result) {
          throw new Error(payload.error ?? "Failed to collect Pick 'Em points.");
        }

        if (payload.result.claimed) {
          window.dispatchEvent(
            new CustomEvent("tp:coin-flight", {
              detail: {
                delta: payload.result.pointsAwarded,
                coins: Math.min(30, Math.max(12, Math.round(payload.result.pointsAwarded / 2))),
              },
            })
          );
          window.dispatchEvent(
            new CustomEvent("tp:points-updated", {
              detail: { source: "pickem-claim", delta: payload.result.pointsAwarded },
            })
          );
          setSubmitMessage(`Collected +${payload.result.pointsAwarded} points.`);
        } else {
          setSubmitMessage("Points already collected for this pick.");
        }
        await loadGames({ background: true });
      } catch (error) {
        setSubmitMessage(error instanceof Error ? error.message : "Failed to collect Pick 'Em points.");
      } finally {
        setClaimingByGameId((current) => {
          const next = { ...current };
          delete next[game.id];
          return next;
        });
      }
    },
    [loadGames, userId]
  );

  return (
    <div className="space-y-4">
      {sport ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 2 of 2</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{sport.label} Games</h2>
          <p className="mt-1 text-sm text-slate-700">
            Pick the winner for each matchup. Picks are saved as soon as you click. Change your selections any time
            before the game starts.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="pickem-date" className="text-xs font-medium text-slate-700">
              Date:
            </label>
            <input
              id="pickem-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || toLocalDateInputValue())}
              className="tp-clean-button rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                sport.isClickable ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {sport.isClickable ? "Open" : "Coming Soon"}
            </span>
          </div>

          {!userId || !venueId ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You can browse matchups, but you must join a venue to lock in picks.
            </p>
          ) : null}
        </section>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      {submitMessage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{submitMessage}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading games...</div>
      ) : !sport ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Sport not found.
        </div>
      ) : !sport.isClickable ? (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
          {sport.label} Pick &apos;Em is coming soon.
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          No scheduled games found for this date.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([league, leagueGames]) => (
            <section key={league} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-700">{league}</h3>

              <ul className="mt-3 space-y-3">
                {leagueGames.map((game) => {
                  const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
                  const baseDisabled =
                    game.isLocked ||
                    !sport.isClickable ||
                    !userId ||
                    !venueId;

                  return (
                    <li key={game.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {game.awayTeam} vs {game.homeTeam}
                        </p>
                        <span className="text-[11px] font-medium text-slate-600">{formatLocalStartTime(game.startsAt)}</span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={baseDisabled}
                          onClick={() => void submitPick(game, game.awayTeam)}
                          className={`tp-clean-button flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
                            displayedPickTeam === game.awayTeam
                              ? "border-blue-300 bg-blue-100 text-blue-800"
                              : "border-slate-300 bg-white text-slate-800"
                          }`}
                        >
                          {game.awayTeam}
                        </button>
                        <button
                          type="button"
                          disabled={baseDisabled}
                          onClick={() => void submitPick(game, game.homeTeam)}
                          className={`tp-clean-button flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
                            displayedPickTeam === game.homeTeam
                              ? "border-blue-300 bg-blue-100 text-blue-800"
                              : "border-slate-300 bg-white text-slate-800"
                          }`}
                        >
                          {game.homeTeam}
                        </button>
                      </div>

                      <div className="mt-2 text-xs text-slate-600">
                        <span className="font-semibold uppercase tracking-[0.08em] text-slate-700">
                          {game.status === "final" ? "Final" : game.status === "live" ? "Live" : "Scheduled"}
                        </span>
                        {game.isLocked ? <span className="ml-2">Picks locked</span> : <span className="ml-2">Picks open</span>}
                      </div>

                      {game.homeScore !== null && game.awayScore !== null ? (
                        <p className="mt-1 text-xs text-slate-700">
                          Score: {game.awayTeam} {game.awayScore} - {game.homeTeam} {game.homeScore}
                        </p>
                      ) : null}

                      {resultLabel(game) ? (
                        <p
                          className={`mt-1 text-xs font-semibold ${
                            game.userPickStatus === "won"
                              ? "text-emerald-700"
                              : game.userPickStatus === "lost"
                              ? "text-rose-700"
                              : "text-slate-700"
                          }`}
                        >
                          {resultLabel(game)}
                        </p>
                      ) : null}

                      {game.userPickStatus === "won" && !game.userPickRewardClaimedAt ? (
                        <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
                          <p className="text-xs font-semibold text-emerald-800">
                            Correct pick. Click below to collect {(game.userPickRewardPoints ?? 50).toLocaleString()} points.
                          </p>
                          <button
                            type="button"
                            onClick={() => void claimPoints(game)}
                            disabled={Boolean(claimingByGameId[game.id])}
                            className="mt-2 tp-clean-button rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-60"
                          >
                            {claimingByGameId[game.id]
                              ? "Collecting..."
                              : `Collect ${(game.userPickRewardPoints ?? 50).toLocaleString()} Points`}
                          </button>
                        </div>
                      ) : null}

                      {game.userPickStatus === "won" && game.userPickRewardClaimedAt ? (
                        <p className="mt-2 text-xs font-semibold text-emerald-700">
                          Points collected: +{(game.userPickRewardPoints ?? 50).toLocaleString()}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
