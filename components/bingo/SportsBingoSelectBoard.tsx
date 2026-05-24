"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { getUserId, getVenueId } from "@/lib/storage";
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

const BINGO_HEADER_LETTERS = [
  { letter: "B", color: "text-rose-300" },
  { letter: "I", color: "text-amber-300" },
  { letter: "N", color: "text-emerald-300" },
  { letter: "G", color: "text-cyan-300" },
  { letter: "O", color: "text-violet-300" },
] as const;

function getPreviewSquareStyle(isFree: boolean): string {
  if (isFree) {
    return "border-emerald-300 bg-[linear-gradient(165deg,#bbf7d0_0%,#86efac_50%,#4ade80_100%)] text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]";
  }
  return "border-cyan-200 bg-[linear-gradient(165deg,#ecfeff_0%,#e0f2fe_55%,#bae6fd_100%)] text-slate-800";
}

function getExpandedSquareStyle(isFree: boolean): string {
  if (isFree) {
    return "border-emerald-300 bg-[linear-gradient(165deg,#bbf7d0_0%,#86efac_50%,#4ade80_100%)] text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]";
  }
  return "border-cyan-200 bg-[linear-gradient(165deg,#ecfeff_0%,#e0f2fe_55%,#bae6fd_100%)] text-slate-800";
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

function getGeneratingLoaderVariant(sportKey: string): {
  emoji: string;
  title: string;
  subtitle: string;
  panelClassName: string;
  badgeClassName: string;
  barTrackClassName: string;
  barClassName: string;
} {
  const normalized = sportKey.trim().toLowerCase();
  if (normalized.includes("wnba")) {
    return {
      emoji: "🏀",
      title: "Generating WNBA board...",
      subtitle: "Calibrating pace-aware player and team squares.",
      panelClassName: "border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50",
      badgeClassName: "bg-orange-100 text-orange-700 border border-orange-200",
      barTrackClassName: "bg-orange-100",
      barClassName: "bg-gradient-to-r from-orange-500 to-amber-500",
    };
  }
  if (normalized.includes("baseball") || normalized.includes("mlb")) {
    return {
      emoji: "⚾",
      title: "Generating MLB board...",
      subtitle: "Building balanced prop and team-event squares.",
      panelClassName: "border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50",
      badgeClassName: "bg-rose-100 text-rose-700 border border-rose-200",
      barTrackClassName: "bg-rose-100",
      barClassName: "bg-gradient-to-r from-rose-500 to-orange-500",
    };
  }
  return {
    emoji: "🏀",
    title: "Generating NBA board...",
    subtitle: "Optimizing a fresh mix of team and player squares.",
    panelClassName: "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50",
    badgeClassName: "bg-blue-100 text-blue-700 border border-blue-200",
    barTrackClassName: "bg-blue-100",
    barClassName: "bg-gradient-to-r from-blue-600 to-cyan-500",
  };
}

export function SportsBingoSelectBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim() || "basketball_nba";
  const gameId = (searchParams.get("gameId") ?? "").trim();
  const cardsView = (searchParams.get("cardsView") ?? searchParams.get("view") ?? "active").trim().toLowerCase();
  const isHistoricalCardsView = cardsView === "settled" || cardsView === "past" || cardsView === "history";

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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [previewPopKey, setPreviewPopKey] = useState(0);
  const [didLoadSettledCards, setDidLoadSettledCards] = useState(false);
  const generatingLoader = useMemo(() => getGeneratingLoaderVariant(sportKey), [sportKey]);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

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

  const loadActiveCards = useCallback(async () => {
    if (!userId) {
      setActiveCards([]);
      setLoadingCards(false);
      return;
    }

    setLoadingCards(true);
    try {
      const response = await fetch(
        `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=false&activeView=true`,
        {
          cache: "no-store",
        }
      );
      const payload = (await response.json()) as CardsResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load your cards.");
      }
      setActiveCards(payload.cards ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load your cards.");
    } finally {
      setLoadingCards(false);
    }
  }, [userId]);

  const loadSettledCardsDeferred = useCallback(async () => {
    if (!userId || didLoadSettledCards) {
      return;
    }
    try {
      const response = await fetch(
        `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true&activeView=false`,
        {
        cache: "no-store",
        }
      );
      const payload = (await response.json()) as CardsResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load your cards.");
      }
      setDidLoadSettledCards(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to prefetch settled cards.");
    }
  }, [didLoadSettledCards, userId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  useEffect(() => {
    void loadActiveCards();
  }, [loadActiveCards]);

  useEffect(() => {
    if (isHistoricalCardsView) {
      void loadSettledCardsDeferred();
    }
  }, [isHistoricalCardsView, loadSettledCardsDeferred]);

  useEffect(() => {
    setAutoGeneratedForGameId("");
  }, [gameId]);

  useEffect(() => {
    setDidLoadSettledCards(false);
  }, [userId]);

  const hasCardForGame = useMemo(() => activeCards.some((card) => card.gameId === gameId), [activeCards, gameId]);

  const canGenerate = Boolean(game && gameId) && !generating && !playing;
  const canPlay =
    Boolean(preview) &&
    Boolean(userId) &&
    Boolean(venueId) &&
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
      setPreviewPopKey((value) => value + 1);
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
      <div className="rounded-xl border-2 border-cyan-300/80 bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] p-2 shadow-[0_8px_20px_rgba(15,23,42,0.28)]">
        <div className="mb-1.5 grid grid-cols-5 gap-1.5">
          {BINGO_HEADER_LETTERS.map((item) => (
            <div
              key={item.letter}
              className={`text-center text-base font-black tracking-[0.18em] [text-shadow:0_0_8px_rgba(255,255,255,0.35)] ${item.color}`}
            >
              {item.letter}
            </div>
          ))}
        </div>
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
                className={`flex aspect-square items-center justify-center rounded-md border px-1 text-center text-[8px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] ${getPreviewSquareStyle(
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
      <div className="rounded-xl border-2 border-cyan-300/80 bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] p-2 pb-1 shadow-[0_8px_20px_rgba(15,23,42,0.3)]">
        <div className="mb-2 grid grid-cols-5 gap-1.5 sm:gap-2">
          {BINGO_HEADER_LETTERS.map((item) => (
            <div
              key={item.letter}
              className={`text-center text-lg font-black tracking-[0.2em] [text-shadow:0_0_8px_rgba(255,255,255,0.35)] sm:text-xl ${item.color}`}
            >
              {item.letter}
            </div>
          ))}
        </div>
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
                className={`flex min-h-[72px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] sm:min-h-[82px] sm:px-2 sm:py-2 sm:text-[11px] ${getExpandedSquareStyle(
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
          <div className="mt-2">
            <BouncingBallLoader size="sm" label="Loading game..." />
          </div>
        ) : !game ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            That game is no longer available. Please pick another game.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:text-base">
            <p className="font-bold text-slate-900">
              {toMascotDisplayName(game.awayTeam)} vs {toMascotDisplayName(game.homeTeam)}
            </p>
            <p className="mt-1 font-medium">Starts {formatLocalDateTime(game.startsAt)} · Cards lock at game start.</p>
            <p className="mt-1 font-medium">One card per game. Up to four active cards total.</p>
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
            {generating ? "Generating..." : "Change Bingo Boards"}
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
        {generating ? (
          <div className={`mt-3 rounded-xl p-3 shadow-sm ${generatingLoader.panelClassName}`}>
            <div className="flex items-center gap-3">
              <span className="tp-bingo-sport-loader text-2xl" aria-hidden="true">
                {generatingLoader.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{generatingLoader.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{generatingLoader.subtitle}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${generatingLoader.badgeClassName}`}>
                Loading
              </span>
            </div>
            <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${generatingLoader.barTrackClassName}`}>
              <span className={`tp-bingo-loader-bar block h-full w-2/5 rounded-full ${generatingLoader.barClassName}`} />
            </div>
          </div>
        ) : null}

        {loadingCards ? <p className="mt-2 text-xs text-slate-500">Checking your active cards...</p> : null}
        {hasCardForGame ? <p className="mt-2 text-xs text-slate-600">You already have an active card for this game.</p> : null}
        {!userId || !venueId ? <p className="mt-2 text-xs text-amber-700">Join a venue before locking this board.</p> : null}
        {preview ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-sm font-semibold text-blue-800">
              Tap the board to expand it.
            </p>
            <p className="text-xs text-slate-600">
              Keep generating new bingo cards until you find one you like, then press play!
            </p>
            <motion.div
              key={previewPopKey}
              className="mx-auto w-full max-w-[560px] cursor-pointer transition-all duration-200"
              initial={{ scale: 0.92 }}
              animate={{ scale: [0.92, 1.04, 1] }}
              transition={{ duration: 0.42, times: [0, 0.6, 1], ease: ["easeOut", "easeOut", "easeInOut"] }}
              onClick={() => {
                setIsPreviewExpanded(true);
              }}
              style={{
                touchAction: "pan-y",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
            >
              {renderPreviewGrid(preview.squares)}
            </motion.div>
          </div>
        ) : null}
      </div>

      {preview && isPreviewExpanded ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close expanded board preview"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => {
              setIsPreviewExpanded(false);
            }}
          />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-slate-900/40">
            <div className="sticky top-0 z-10 mb-2 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-cyan-100 bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-sm font-semibold text-slate-900">{preview.game.gameLabel}</p>
              <button
                type="button"
                onClick={() => {
                  setIsPreviewExpanded(false);
                }}
                className="tp-clean-button inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-slate-900/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm"
              >
                <span aria-hidden="true">✕</span>
                <span>Close</span>
              </button>
            </div>
            <p className="mb-2 mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
              Expanded Board Preview
            </p>
            {renderExpandedGrid(preview.squares)}
          </div>
        </div>
      ) : null}
      <style jsx>{`
        @keyframes tp-bingo-loader-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes tp-bingo-loader-slide {
          0% { transform: translateX(-130%); }
          100% { transform: translateX(320%); }
        }
        .tp-bingo-sport-loader {
          animation: tp-bingo-loader-bounce 820ms ease-in-out infinite;
          will-change: transform;
        }
        .tp-bingo-loader-bar {
          animation: tp-bingo-loader-slide 1.15s ease-in-out infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
