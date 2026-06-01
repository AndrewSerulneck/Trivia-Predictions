"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

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
  basketball_wnba: "WNBA",
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
        `/api/bingo/games?sportKey=${encodeURIComponent(sportKey)}&includeLocked=false&tzOffsetMinutes=${encodeURIComponent(
          String(new Date().getTimezoneOffset())
        )}`,
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
    <div className="tp-bingo-theme space-y-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-300">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-sky-300/30 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 2 of 3</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-200">Choose A Game</h2>
          </div>
          <span className="shrink-0 rounded-full border border-sky-300/40 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-200">
            {activeGameIds.size} of 4 boards active
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">Showing upcoming {sportLabel} games only.</p>

        {loading ? (
          <div className="mt-3">
            <BouncingBallLoader size="sm" label="Loading games..." />
          </div>
        ) : games.length === 0 ? (
          <div className="mt-3 rounded-md border border-sky-300/25 bg-slate-800/60 p-3 text-sm text-sky-200">
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
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    unavailable
                      ? "cursor-not-allowed border-slate-700/60 bg-slate-800/40 text-slate-400"
                      : "border-sky-300/25 bg-slate-800/60 hover:border-sky-300/60 active:scale-[0.99]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-100">{game.awayTeam} vs {game.homeTeam}</p>
                    {unavailable ? (
                      <span className="shrink-0 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        Active
                      </span>
                    ) : (
                      <span aria-hidden="true" className="shrink-0 text-lg font-black text-sky-300">
                        ›
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Starts {formatLocalDateTime(game.startsAt)}</p>
                  {unavailable ? (
                    <p className="mt-1 text-[11px] text-slate-400">You already have an active Bingo card for this game.</p>
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
