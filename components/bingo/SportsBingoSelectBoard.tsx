"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUserId, getVenueId } from "@/lib/storage";

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

type BingoCard = {
  id: string;
  gameId: string;
  status: "active" | "won" | "lost" | "canceled";
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
  card?: { id: string };
  error?: string;
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

function shortenLabel(label: string, maxLength = 38): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function compactSquareLabel(label: string): string {
  const cleaned = label.replace(/\s+/g, " ").trim();
  const supportPrefixMatch = cleaned.match(/^\[(SUPPORTED|POSSIBLE)\]\s*/i);
  const supportPrefix = supportPrefixMatch?.[1]
    ? supportPrefixMatch[1].toUpperCase() === "SUPPORTED"
      ? "S: "
      : "P: "
    : "";
  const body = supportPrefixMatch ? cleaned.replace(/^\[(SUPPORTED|POSSIBLE)\]\s*/i, "") : cleaned;

  let match = body.match(/^There will be more than ([\d.]+) points scored/i);
  if (match?.[1]) {
    return `${supportPrefix}Over ${match[1]} total points`;
  }

  match = body.match(/^There will be less than ([\d.]+) points scored/i);
  if (match?.[1]) {
    return `${supportPrefix}Under ${match[1]} total points`;
  }

  match = body.match(/^(.+?) will win by more than ([\d.]+) points/i);
  if (match?.[1] && match?.[2]) {
    return `${supportPrefix}${match[1]} wins by ${match[2]}+`;
  }

  match = body.match(/^(.+?) will win the game or lose by less than ([\d.]+) points/i);
  if (match?.[1] && match?.[2]) {
    return `${supportPrefix}${match[1]} win or lose by <${match[2]}`;
  }

  match = body.match(/^(.+?) will score more than ([\d.]+) points/i);
  if (match?.[1] && match?.[2]) {
    return `${supportPrefix}${match[1]} over ${match[2]} pts`;
  }

  match = body.match(/^(.+?) will score less than ([\d.]+) points/i);
  if (match?.[1] && match?.[2]) {
    return `${supportPrefix}${match[1]} under ${match[2]} pts`;
  }

  match = body.match(/^(.+?) will beat the (.+?)\.?$/i);
  if (match?.[1] && match?.[2]) {
    return `${supportPrefix}${match[1]} beats ${match[2]}`;
  }

  match = body.match(/^(.+?) will record more than ([\d.]+) (.+?)\.?$/i);
  if (match?.[1] && match?.[2] && match?.[3]) {
    return `${supportPrefix}${match[1]} over ${match[2]} ${match[3]}`;
  }

  match = body.match(/^(.+?) will record less than ([\d.]+) (.+?)\.?$/i);
  if (match?.[1] && match?.[2] && match?.[3]) {
    return `${supportPrefix}${match[1]} under ${match[2]} ${match[3]}`;
  }

  return `${supportPrefix}${body.replace(/\.$/, "")}`;
}

function getPreviewSquareStyle(isFree: boolean): string {
  if (isFree) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getExpandedSquareStyle(isFree: boolean): string {
  if (isFree) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  return "border-slate-200 bg-white text-slate-700";
}

function toMascotDisplayName(team: string): string {
  const trimmed = team.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return trimmed;
  }

  const lastTwo = parts.slice(-2).join(" ");
  const keepLastTwo = new Set([
    "Red Sox",
    "White Sox",
    "Blue Jays",
    "Trail Blazers",
    "Golden Knights",
    "Maple Leafs",
  ]);

  if (keepLastTwo.has(lastTwo)) {
    return lastTwo;
  }

  return parts[parts.length - 1] ?? trimmed;
}

export function SportsBingoSelectBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim() || "basketball_nba";
  const gameId = (searchParams.get("gameId") ?? "").trim();

  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [game, setGame] = useState<BingoGame | null>(null);
  const [preview, setPreview] = useState<BingoBoardPreview | null>(null);
  const [activeCards, setActiveCards] = useState<BingoCard[]>([]);
  const [loadingGame, setLoadingGame] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [autoGeneratedForGameId, setAutoGeneratedForGameId] = useState("");
  const [isPreviewPressed, setIsPreviewPressed] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const lastTouchAtRef = useRef(0);

  const clearPreviewPress = useCallback(() => {
    activeTouchIdRef.current = null;
    setIsPreviewPressed(false);
  }, []);

  const startTouchHold = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      lastTouchAtRef.current = Date.now();
      activeTouchIdRef.current = touch.identifier;
      setIsPreviewPressed(true);
    },
    []
  );

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      if (!isPreviewPressed) {
        activeTouchIdRef.current = null;
        return;
      }

      const trackedTouchId = activeTouchIdRef.current;
      if (trackedTouchId === null) {
        return;
      }

      let trackedTouch: Touch | null = null;
      for (let index = 0; index < event.touches.length; index += 1) {
        const touch = event.touches.item(index);
        if (touch && touch.identifier === trackedTouchId) {
          trackedTouch = touch;
          break;
        }
      }

      if (!trackedTouch) {
        clearPreviewPress();
        return;
      }
    };

    window.addEventListener("pointerup", clearPreviewPress);
    window.addEventListener("pointercancel", clearPreviewPress);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", clearPreviewPress, { passive: true });
    window.addEventListener("touchcancel", clearPreviewPress, { passive: true });
    window.addEventListener("scroll", clearPreviewPress, { passive: true });
    window.addEventListener("blur", clearPreviewPress);

    return () => {
      window.removeEventListener("pointerup", clearPreviewPress);
      window.removeEventListener("pointercancel", clearPreviewPress);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", clearPreviewPress);
      window.removeEventListener("touchcancel", clearPreviewPress);
      window.removeEventListener("scroll", clearPreviewPress);
      window.removeEventListener("blur", clearPreviewPress);
    };
  }, [clearPreviewPress, isPreviewPressed]);

  const loadGame = useCallback(async () => {
    if (!gameId) {
      setGame(null);
      setLoadingGame(false);
      return;
    }

    setLoadingGame(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/bingo/games?sportKey=${encodeURIComponent(sportKey)}&includeLocked=false`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as GamesResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load game.");
      }

      const selected = (payload.games ?? []).find((item) => item.id === gameId) ?? null;
      setGame(selected);
    } catch (error) {
      setGame(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load game.");
    } finally {
      setLoadingGame(false);
    }
  }, [gameId, sportKey]);

  const loadCards = useCallback(async () => {
    if (!userId) {
      setActiveCards([]);
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
        throw new Error(payload.error ?? "Failed to load your cards.");
      }
      setActiveCards((payload.cards ?? []).filter((card) => card.status === "active"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load your cards.");
    } finally {
      setLoadingCards(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    setAutoGeneratedForGameId("");
  }, [gameId]);

  useEffect(() => {
    if (!isPreviewPressed) {
      activeTouchIdRef.current = null;
    }
  }, [isPreviewPressed]);

  const hasCardForGame = useMemo(() => activeCards.some((card) => card.gameId === gameId), [activeCards, gameId]);

  const canGenerate = Boolean(game && gameId) && !hasCardForGame && !generating && !playing;
  const canPlay =
    Boolean(preview) &&
    Boolean(userId) &&
    Boolean(venueId) &&
    !hasCardForGame &&
    activeCards.length < 4 &&
    !playing;

  const generateBoard = useCallback(async () => {
    if (!gameId) {
      setErrorMessage("Missing game selection.");
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
          gameId,
          sportKey,
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
  }, [gameId, sportKey]);

  const playBoard = useCallback(async () => {
    if (!preview) {
      setErrorMessage("Generate a board first.");
      return;
    }
    if (!userId || !venueId) {
      setErrorMessage("Join a venue before locking this card.");
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

      router.push("/bingo/home");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to lock your bingo card.");
    } finally {
      setPlaying(false);
    }
  }, [preview, router, userId, venueId]);

  const renderPreviewGrid = (squares: BingoBoardSquare[]) => {
    const byIndex = new Map<number, BingoBoardSquare>();
    for (const square of squares) {
      byIndex.set(square.index, square);
    }

    return (
      <div className="rounded-xl border-2 border-slate-300 bg-slate-100 p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }).map((_, index) => {
            const square = byIndex.get(index);
            if (!square) {
              return <div key={index} className="aspect-square rounded-md border border-slate-200 bg-white" />;
            }

            const isFree = Boolean(square.isFree);
            return (
              <div
                key={index}
                title={square.label}
                className={`flex aspect-square items-center justify-center rounded-md border px-1 text-center text-[8px] font-semibold leading-tight ${getPreviewSquareStyle(
                  isFree
                )}`}
              >
                <span className="whitespace-normal break-words">
                  {isFree ? "FREE" : shortenLabel(compactSquareLabel(square.label), 70)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderExpandedGrid = (squares: BingoBoardSquare[]) => {
    const byIndex = new Map<number, BingoBoardSquare>();
    for (const square of squares) {
      byIndex.set(square.index, square);
    }

    return (
      <div className="pb-1">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {Array.from({ length: 25 }).map((_, index) => {
            const square = byIndex.get(index);
            if (!square) {
              return <div key={index} className="min-h-[72px] rounded-lg border border-slate-200 bg-slate-50 sm:min-h-[82px]" />;
            }

            const isFree = Boolean(square.isFree);
            return (
              <div
                key={index}
                className={`flex min-h-[72px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight sm:min-h-[82px] sm:px-2 sm:py-2 sm:text-[11px] ${getExpandedSquareStyle(
                  isFree
                )}`}
              >
                <span className="whitespace-normal break-words">{isFree ? "FREE" : square.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (loadingGame || loadingCards) {
      return;
    }
    if (!game || !gameId || preview || generating || playing) {
      return;
    }
    if (hasCardForGame) {
      return;
    }
    if (autoGeneratedForGameId === gameId) {
      return;
    }
    setAutoGeneratedForGameId(gameId);
    void generateBoard();
  }, [
    autoGeneratedForGameId,
    game,
    gameId,
    generateBoard,
    generating,
    hasCardForGame,
    loadingCards,
    loadingGame,
    playing,
    preview,
  ]);

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 3 of 3</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Generate And Lock Board</h2>

        {loadingGame ? (
          <p className="mt-2 text-sm text-slate-600">Loading game...</p>
        ) : !game ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            That game is no longer available. Please pick another game.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">
              {toMascotDisplayName(game.awayTeam)} vs {toMascotDisplayName(game.homeTeam)}
            </p>
            <p className="mt-1">Starts {formatLocalDateTime(game.startsAt)} · Cards lock at game start.</p>
            <p className="mt-1">One card per game. Up to four active cards total.</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
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

        {loadingCards ? <p className="mt-2 text-xs text-slate-500">Checking your active cards...</p> : null}
        {hasCardForGame ? <p className="mt-2 text-xs text-slate-600">You already have an active card for this game.</p> : null}
        {!userId || !venueId ? <p className="mt-2 text-xs text-amber-700">Join a venue before locking this board.</p> : null}
        {preview ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-sm font-semibold text-blue-800">
              Press down on the board to expand it!
            </p>
            <p className="text-xs text-slate-600">
              Keep generating new bingo cards until you find one you like, then press play!
            </p>
            <p className="text-[11px] text-slate-500">
              Legend: <span className="font-semibold text-emerald-700">S:</span> feed-verified square,{" "}
              <span className="font-semibold text-amber-700">P:</span> implemented but needs deeper live validation.
            </p>
            <div
              className={`mx-auto w-full max-w-[560px] transition-all duration-200 ${isPreviewPressed ? "scale-[1.01]" : ""}`}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                if (Date.now() - lastTouchAtRef.current < 800) {
                  return;
                }
                setIsPreviewPressed(true);
              }}
              onMouseUp={clearPreviewPress}
              onMouseLeave={() => {
                setIsPreviewPressed(false);
              }}
              onTouchStart={(event) => {
                startTouchHold(event);
              }}
              onTouchEnd={clearPreviewPress}
              onTouchCancel={clearPreviewPress}
              style={{
                touchAction: "pan-y",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
            >
              {renderPreviewGrid(preview.squares)}
            </div>
          </div>
        ) : null}
      </div>

      {preview && isPreviewPressed ? (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35" />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-slate-900/40">
            <p className="text-center text-sm font-semibold text-slate-900">{preview.game.gameLabel}</p>
            <p className="mb-2 mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
              Expanded Board Preview
            </p>
            {renderExpandedGrid(preview.squares)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
