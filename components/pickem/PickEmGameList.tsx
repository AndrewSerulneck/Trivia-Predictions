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

type SportsResponse = {
  ok: boolean;
  sports?: PickEmSport[];
  error?: string;
};

type GamesResponse = {
  ok: boolean;
  sport?: PickEmSport;
  date?: string;
  games?: PickEmGame[];
  error?: string;
};

const SPORT_ICONS: Record<string, string> = {
  nba: "🏀",
  mlb: "⚾",
  soccer: "⚽",
  nfl: "🏈",
  nhl: "🏒",
};

function getSportIcon(slug: string): string {
  return SPORT_ICONS[slug] ?? "🏟️";
}

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

export function PickEmGameList({ initialSportSlug = "" }: { initialSportSlug?: string }) {
  const normalizedInitialSportSlug = String(initialSportSlug ?? "").trim().toLowerCase();
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(() => toLocalDateInputValue());
  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [claimingByGameId, setClaimingByGameId] = useState<Record<string, boolean>>({});
  const [optimisticPickByGame, setOptimisticPickByGame] = useState<Record<string, string | undefined>>({});
  const [sports, setSports] = useState<PickEmSport[]>([]);
  const [selectedSportSlug, setSelectedSportSlug] = useState("");
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

  useEffect(() => {
    const run = async () => {
      setLoadingSports(true);
      try {
        const response = await fetch("/api/pickem/sports", { cache: "no-store" });
        const payload = (await response.json()) as SportsResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load Pick 'Em sports right now.");
        }
        const nextSports = payload.sports ?? [];
        setSports(nextSports);

        const initialMatch = nextSports.find((item) => item.slug === normalizedInitialSportSlug);
        const nextDefault = initialMatch?.slug ?? nextSports.find((item) => item.isClickable)?.slug ?? nextSports[0]?.slug ?? "";
        setSelectedSportSlug((current) => current || nextDefault);
      } catch (error) {
        setSports([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load Pick 'Em sports right now.");
      } finally {
        setLoadingSports(false);
      }
    };

    void run();
  }, [normalizedInitialSportSlug]);

  const loadGames = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!selectedSportSlug) {
        setGames([]);
        setSport(null);
        setLoadingGames(false);
        return;
      }

      if (!background) {
        setLoadingGames(true);
      }

      try {
        const params = new URLSearchParams({
          sportSlug: selectedSportSlug,
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
          setLoadingGames(false);
        }
      }
    },
    [date, games.length, selectedSportSlug, userId]
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

  const leaguesForSport = useMemo(() => grouped.map(([league]) => league), [grouped]);

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
          sportSlug: selectedSportSlug,
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
    [date, selectedSportSlug, userId, venueId]
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
    <div className="tp-pickem-compact space-y-3 sm:space-y-4">
      <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-3 shadow-sm sm:p-4">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Hightop Pick &apos;Em™</h2>
        <p className="mt-1 text-xs text-slate-700 sm:text-sm">
          Select winners by checking a team. Picks lock at scheduled start time and are final.
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
            className="tp-clean-button rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 sm:text-sm"
          />
          {!userId || !venueId ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
              Browse only
            </span>
          ) : null}
        </div>

        <div className="mt-4 w-full overflow-x-auto pb-1">
          <div className="inline-flex w-max min-w-0 gap-2 pr-1">
            {loadingSports ? (
              <p className="text-sm text-slate-600">Loading sports...</p>
            ) : sports.length === 0 ? (
              <p className="text-sm text-slate-600">No sports available.</p>
            ) : (
              sports.map((item) => {
                const isSelected = selectedSportSlug === item.slug;
                const isDisabled = !item.isClickable;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedSportSlug(item.slug);
                        setSubmitMessage("");
                      }
                    }}
                    className={`tp-clean-button inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-semibold sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                        : isDisabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    <span aria-hidden="true">{getSportIcon(item.slug)}</span>
                    {item.label}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {selectedSportSlug && leaguesForSport.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Available leagues</p>
            <div className="flex flex-wrap gap-1.5">
              {leaguesForSport.map((league) => (
                <span key={league} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {league}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-700 sm:p-3 sm:text-sm">{errorMessage}</div>
      ) : null}

      {submitMessage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 sm:p-3 sm:text-sm">{submitMessage}</div>
      ) : null}

      {loadingGames ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 sm:p-3 sm:text-sm">Loading games...</div>
      ) : !sport ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:p-3 sm:text-sm">
          Choose a sport to load today&apos;s games.
        </div>
      ) : !sport.isClickable ? (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-700 sm:p-3 sm:text-sm">
          {sport.label} Pick &apos;Em is coming soon.
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 sm:p-3 sm:text-sm">
          No scheduled games found for this date.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([league, leagueGames]) => (
            <section key={league} className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-3 shadow-sm sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 sm:text-sm">{league}</h3>
                <span className="text-[11px] font-medium text-slate-500">{leagueGames.length} games</span>
              </div>

              <ul className="mt-3 space-y-3">
                {leagueGames.map((game) => {
                  const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
                  const baseDisabled = game.isLocked || !sport.isClickable || !userId || !venueId;
                  const awaySelected = displayedPickTeam === game.awayTeam;
                  const homeSelected = displayedPickTeam === game.homeTeam;

                  return (
                    <li key={game.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-xs font-semibold text-slate-900 break-words sm:text-sm">
                          {game.awayTeam} vs {game.homeTeam}
                        </p>
                        <span className="text-[10px] font-medium text-slate-600 sm:text-[11px]">{formatLocalStartTime(game.startsAt)}</span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                        <button
                          type="button"
                          disabled={baseDisabled}
                          onClick={() => void submitPick(game, game.awayTeam)}
                          className={`tp-clean-button flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs font-semibold sm:gap-2 sm:px-2.5 sm:py-2 sm:text-sm ${
                            awaySelected
                              ? "border-blue-300 bg-blue-100 text-blue-900"
                              : "border-slate-300 bg-white text-slate-800"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] font-black sm:h-4 sm:w-4 sm:text-[10px] ${
                              awaySelected
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-slate-400 bg-white text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span className="min-w-0 break-words">{game.awayTeam}</span>
                        </button>
                        <button
                          type="button"
                          disabled={baseDisabled}
                          onClick={() => void submitPick(game, game.homeTeam)}
                          className={`tp-clean-button flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs font-semibold sm:gap-2 sm:px-2.5 sm:py-2 sm:text-sm ${
                            homeSelected
                              ? "border-blue-300 bg-blue-100 text-blue-900"
                              : "border-slate-300 bg-white text-slate-800"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] font-black sm:h-4 sm:w-4 sm:text-[10px] ${
                              homeSelected
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-slate-400 bg-white text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span className="min-w-0 break-words">{game.homeTeam}</span>
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
