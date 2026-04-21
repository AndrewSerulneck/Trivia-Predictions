"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUserId } from "@/lib/storage";

type BingoGame = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  gameLabel: string;
  isLocked: boolean;
};

type GamesResponse = {
  ok: boolean;
  games?: BingoGame[];
  error?: string;
};

type CardsResponse = {
  ok: boolean;
  cards?: Array<{
    id: string;
    gameId: string;
    status: "active" | "won" | "lost" | "canceled";
  }>;
  error?: string;
};

const SPORT_LABELS: Record<string, string> = {
  basketball_nba: "NBA",
  americanfootball_nfl: "NFL",
  baseball_mlb: "MLB",
};

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SportsBingoSelectGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim() || "basketball_nba";

  const [userId, setUserId] = useState("");
  const [games, setGames] = useState<BingoGame[]>([]);
  const [activeGameIds, setActiveGameIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  const loadGames = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/bingo/games?sportKey=${encodeURIComponent(sportKey)}&includeLocked=false`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as GamesResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load available games.");
      }
      setGames(payload.games ?? []);
    } catch (error) {
      setGames([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load available games.");
    } finally {
      setLoading(false);
    }
  }, [sportKey]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    const loadCards = async () => {
      if (!userId) {
        setActiveGameIds(new Set());
        return;
      }
      try {
        const response = await fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as CardsResponse;
        if (!payload.ok) {
          return;
        }
        const next = new Set(
          (payload.cards ?? [])
            .filter((card) => card.status === "active")
            .map((card) => String(card.gameId ?? "").trim())
            .filter(Boolean)
        );
        setActiveGameIds(next);
      } catch {
        // Keep UX responsive even if cards fetch fails.
      }
    };
    void loadCards();
  }, [userId]);

  const sportLabel = useMemo(() => SPORT_LABELS[sportKey] ?? sportKey, [sportKey]);

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 2 of 3</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Choose A Game</h2>
        <p className="mt-1 text-sm text-slate-700">Showing upcoming {sportLabel} games only.</p>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading games...</p>
        ) : games.length === 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No upcoming games are available right now.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {games.map((game) => {
              const unavailable = activeGameIds.has(game.id);
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => {
                    if (unavailable) {
                      return;
                    }
                    router.push(
                      `/bingo/select-board?sportKey=${encodeURIComponent(sportKey)}&gameId=${encodeURIComponent(game.id)}`
                    );
                  }}
                  disabled={unavailable}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    unavailable
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{game.awayTeam} vs {game.homeTeam}</p>
                    {unavailable ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Unavailable
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">Starts {formatLocalDateTime(game.startsAt)}</p>
                  {unavailable ? (
                    <p className="mt-1 text-[11px] text-slate-500">You already have an active Bingo card for this game.</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
