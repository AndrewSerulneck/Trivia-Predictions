"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";

type BingoGame = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  gameLabel: string;
  isLocked: boolean;
};

type BingoBoardSquare = {
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
};

type BingoBoardPreview = {
  game: BingoGame;
  boardProbability: number;
  squares: BingoBoardSquare[];
};

type BingoCardSquare = {
  id: string;
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  status: "pending" | "hit" | "miss" | "void" | "replaced";
  resolvedAt?: string;
};

type BingoCard = {
  id: string;
  userId: string;
  venueId: string;
  gameId: string;
  gameLabel: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: "active" | "won" | "lost" | "canceled";
  boardProbability: number;
  rewardPoints: number;
  createdAt: string;
  settledAt?: string;
  squares: BingoCardSquare[];
};

type GamesResponse = {
  ok: boolean;
  games?: BingoGame[];
  error?: string;
};

type GenerateResponse = {
  ok: boolean;
  board?: BingoBoardPreview;
  error?: string;
};

type CardsResponse = {
  ok: boolean;
  cards?: BingoCard[];
  error?: string;
};

type PlayResponse = {
  ok: boolean;
  card?: BingoCard;
  error?: string;
};

type SportOption = {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  note?: string;
};

const SPORT_OPTIONS: SportOption[] = [
  { key: "basketball_nba", label: "NBA", icon: "🏀", enabled: true },
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈", enabled: true, note: "Beta" },
  { key: "baseball_mlb", label: "MLB", icon: "⚾", enabled: false, note: "Coming soon" },
];

const LINE_PATTERNS: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortenLabel(label: string, maxLength = 38): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function getCardSquareStyle(status: BingoCardSquare["status"], isFree: boolean): string {
  if (isFree) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  if (status === "hit") {
    return "border-cyan-300 bg-cyan-500 text-white";
  }
  if (status === "miss") {
    return "border-rose-200 bg-rose-100 text-rose-700";
  }
  return "border-slate-200 bg-white text-slate-700";
}

function getPreviewSquareStyle(isFree: boolean): string {
  if (isFree) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function summarizeCardState(card: BingoCard): {
  hitCount: number;
  nearWin: boolean;
  completedLines: number;
} {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of card.squares) {
    byIndex.set(square.index, square);
  }

  const hitCount = card.squares.reduce((sum, square) => {
    if (square.isFree || square.status === "hit") {
      return sum + 1;
    }
    return sum;
  }, 0);

  let nearWin = false;
  let completedLines = 0;

  for (const line of LINE_PATTERNS) {
    let hits = 0;
    let misses = 0;
    let pending = 0;

    for (const index of line) {
      const square = byIndex.get(index);
      if (!square) {
        pending += 1;
        continue;
      }
      if (square.isFree || square.status === "hit") {
        hits += 1;
      } else if (square.status === "miss") {
        misses += 1;
      } else {
        pending += 1;
      }
    }

    if (hits === 5) {
      completedLines += 1;
    }
    if (hits === 4 && misses === 0 && pending === 1) {
      nearWin = true;
    }
  }

  return { hitCount, nearWin, completedLines };
}

export function SportsBingoBoard() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [selectedSportKey, setSelectedSportKey] = useState(
    SPORT_OPTIONS.find((sport) => sport.enabled)?.key ?? "basketball_nba"
  );
  const [games, setGames] = useState<BingoGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [preview, setPreview] = useState<BingoBoardPreview | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/bingo/games?sportKey=${encodeURIComponent(selectedSportKey)}&includeLocked=false`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as GamesResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load available games.");
      }

      const nextGames = payload.games ?? [];
      setGames(nextGames);
      setSelectedGameId((previous) => {
        if (previous && nextGames.some((game) => game.id === previous)) {
          return previous;
        }
        return nextGames[0]?.id ?? "";
      });
    } catch (error) {
      setGames([]);
      setSelectedGameId("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load Sports Bingo games.");
    } finally {
      setLoadingGames(false);
    }
  }, [selectedSportKey]);

  const loadCards = useCallback(async () => {
    if (!userId) {
      setCards([]);
      setLoadingCards(false);
      return;
    }

    setLoadingCards(true);
    try {
      const response = await fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CardsResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load your Sports Bingo cards.");
      }
      setCards(payload.cards ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load your Sports Bingo cards.");
    } finally {
      setLoadingCards(false);
    }
  }, [userId]);

  useEffect(() => {
    setPreview(null);
    setSelectedGameId("");
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadCards();
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadCards, userId]);

  const selectedGame = useMemo(() => games.find((game) => game.id === selectedGameId) ?? null, [games, selectedGameId]);
  const activeCards = useMemo(() => cards.filter((card) => card.status === "active"), [cards]);
  const settledCards = useMemo(() => cards.filter((card) => card.status !== "active"), [cards]);

  const hasCardForSelectedGame = useMemo(
    () => Boolean(selectedGame && activeCards.some((card) => card.gameId === selectedGame.id)),
    [activeCards, selectedGame]
  );

  const canGenerate = Boolean(selectedGame) && !selectedGame?.isLocked && !generating && !playing;
  const canPlay =
    Boolean(preview) &&
    Boolean(userId) &&
    Boolean(venueId) &&
    !selectedGame?.isLocked &&
    !hasCardForSelectedGame &&
    activeCards.length < 4 &&
    !playing;

  const generateBoard = useCallback(async () => {
    if (!selectedGameId) {
      setErrorMessage("Choose a game before generating a card.");
      return;
    }

    setGenerating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          gameId: selectedGameId,
          sportKey: selectedSportKey,
        }),
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!payload.ok || !payload.board) {
        throw new Error(payload.error ?? "Failed to generate a new bingo card.");
      }

      setPreview(payload.board);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to generate a new bingo card.");
    } finally {
      setGenerating(false);
    }
  }, [selectedGameId, selectedSportKey]);

  const playBoard = useCallback(async () => {
    if (!preview) {
      setErrorMessage("Generate a board first.");
      return;
    }
    if (!userId || !venueId) {
      setErrorMessage("Join a venue before playing Sports Bingo.");
      return;
    }

    setPlaying(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "play",
          userId,
          venueId,
          gameId: preview.game.id,
          sportKey: preview.game.sportKey,
          squares: preview.squares.map((square) => ({
            index: square.index,
            key: square.key,
            isFree: square.isFree,
          })),
        }),
      });
      const payload = (await response.json()) as PlayResponse;
      if (!payload.ok || !payload.card) {
        throw new Error(payload.error ?? "Failed to lock your bingo card.");
      }

      setPreview(null);
      setSelectedGameId(payload.card.gameId);
      await loadCards();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to lock your bingo card.");
    } finally {
      setPlaying(false);
    }
  }, [loadCards, preview, userId, venueId]);

  const renderBoardGrid = (
    squares: Array<BingoBoardSquare | BingoCardSquare>,
    mode: "preview" | "card",
    compact = false
  ) => {
    const byIndex = new Map<number, BingoBoardSquare | BingoCardSquare>();
    for (const square of squares) {
      byIndex.set(square.index, square);
    }

    const heightClass = compact ? "h-10" : "h-16";
    const textClass = compact ? "text-[9px]" : "text-[10px]";
    const labelMax = compact ? 18 : 38;

    return (
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }).map((_, index) => {
          const square = byIndex.get(index);
          if (!square) {
            return <div key={index} className={`${heightClass} rounded-md border border-slate-200 bg-slate-50`} />;
          }

          const isFree = Boolean(square.isFree);
          const cellLabel = shortenLabel(square.label, labelMax);
          const className =
            mode === "preview"
              ? getPreviewSquareStyle(isFree)
              : getCardSquareStyle((square as BingoCardSquare).status, isFree);

          return (
            <div
              key={index}
              title={square.label}
              className={`flex ${heightClass} items-center justify-center rounded-md border px-1 text-center ${textClass} font-semibold leading-tight ${className}`}
            >
              {isFree ? "FREE" : cellLabel}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Play Sports Bingo</p>
            <p className="mt-1 text-sm text-slate-700">Pick a sport, pick a game that has not started, then lock in your board.</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            Active Cards: {activeCards.length}/4
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Step 1: Choose a sport</p>
          <div className="flex flex-wrap gap-2">
            {SPORT_OPTIONS.map((sport) => {
              const isSelected = selectedSportKey === sport.key;
              return (
                <button
                  key={sport.key}
                  type="button"
                  onClick={() => {
                    if (!sport.enabled) {
                      return;
                    }
                    setSelectedSportKey(sport.key);
                  }}
                  disabled={!sport.enabled}
                  className={`inline-flex min-h-[38px] items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : sport.enabled
                        ? "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  }`}
                >
                  <span aria-hidden="true" className="text-sm">
                    {sport.icon}
                  </span>
                  <span>{sport.label}</span>
                  {sport.note ? <span className="text-[10px] opacity-80">{sport.note}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Step 2: Choose a game</p>
          {loadingGames ? (
            <p className="text-sm text-slate-600">Loading games...</p>
          ) : games.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No upcoming games are available for this sport right now.
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((game) => {
                const isSelected = game.id === selectedGameId;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      setSelectedGameId(game.id);
                      setPreview(null);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{game.awayTeam} vs {game.homeTeam}</p>
                    <p className="mt-1 text-xs text-slate-600">Starts {formatLocalDateTime(game.startsAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedGame ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">{selectedGame.gameLabel}</p>
            <p className="mt-1">Cards lock at game start. One card per game, up to four active cards.</p>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Step 3: Generate and lock your board</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void generateBoard();
              }}
              disabled={!canGenerate}
              className="inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating..." : "New Bingo Card"}
            </button>
            <button
              type="button"
              onClick={() => {
                void playBoard();
              }}
              disabled={!canPlay}
              className="inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {playing ? "Locking..." : "Play!"}
            </button>
          </div>
          {!userId || !venueId ? (
            <p className="text-xs text-amber-700">Join a venue first to lock a Sports Bingo card.</p>
          ) : null}
          {hasCardForSelectedGame ? (
            <p className="text-xs text-slate-600">You already have an active card for this game.</p>
          ) : null}
        </div>

        {preview ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-700">
              Board estimate: <span className="font-semibold text-slate-900">{(preview.boardProbability * 100).toFixed(1)}%</span> chance of at
              least one Bingo line.
            </p>
            <p className="text-xs text-slate-600">Keep generating until you like it, then press Play.</p>
            {renderBoardGrid(preview.squares, "preview")}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Live Board Preview</h2>
          <span className="text-xs text-slate-500">No click needed</span>
        </div>

        {loadingCards ? (
          <p className="mt-3 text-sm text-slate-600">Loading your cards...</p>
        ) : activeCards.length === 0 ? (
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No active cards yet. Pick a sport and game above to start.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activeCards.map((card) => {
              const summary = summarizeCardState(card);
              return (
                <li key={card.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                      Active
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Starts {formatLocalDateTime(card.startsAt)} · Hits {summary.hitCount}/25 · Lines {summary.completedLines}
                    {summary.nearWin ? " · Near Bingo" : ""}
                  </p>
                  <div className="mt-2">{renderBoardGrid(card.squares, "card", true)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InlineSlotAdClient
        slot="leaderboard-sidebar"
        pageKey="sports-bingo"
        adType="inline"
        displayTrigger="on-load"
        allowAnyVenue
        showPlaceholder
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Recent Cards</h2>
        {loadingCards ? (
          <p className="mt-3 text-sm text-slate-600">Loading...</p>
        ) : settledCards.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No settled cards yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {settledCards.slice(0, 8).map((card) => {
              const summary = summarizeCardState(card);
              return (
                <li key={card.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                        card.status === "won"
                          ? "bg-emerald-100 text-emerald-700"
                          : card.status === "lost"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {card.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatLocalDateTime(card.startsAt)} · Hits {summary.hitCount}/25
                    {card.status === "won" ? ` · +${card.rewardPoints} points` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
