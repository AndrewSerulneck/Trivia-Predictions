"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { getUserId } from "@/lib/storage";
import { consumeBingoPrefetchCache } from "@/lib/bingoPrefetchCache";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";

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
  rewardClaimedAt?: string;
  createdAt: string;
  settledAt?: string;
  squares: BingoCardSquare[];
};

type CardsResponse = {
  ok: boolean;
  cards?: BingoCard[];
  error?: string;
};

type ClaimResponse = {
  ok: boolean;
  result?: {
    cardId: string;
    rewardPoints: number;
  };
  error?: string;
};

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
const BINGO_GAME_BUFFER_MS = 6 * 60 * 60 * 1000;

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortenLabel(label: string, maxLength = 18): string {
  const trimmed = label.trim();
  const supportPrefixMatch = trimmed.match(/^\[(SUPPORTED|POSSIBLE)\]\s*/i);
  const prefix = supportPrefixMatch?.[1]
    ? supportPrefixMatch[1].toUpperCase() === "SUPPORTED"
      ? "S: "
      : "P: "
    : "";
  const body = supportPrefixMatch ? trimmed.replace(/^\[(SUPPORTED|POSSIBLE)\]\s*/i, "") : trimmed;
  const normalized = `${prefix}${body}`;

  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function getCardSquareStyle(status: BingoCardSquare["status"], isFree: boolean): string {
  if (isFree) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  if (status === "hit") {
    return "border-emerald-300 bg-emerald-500 text-white";
  }
  if (status === "miss") {
    return "border-rose-200 bg-rose-100 text-rose-700";
  }
  return "border-slate-200 bg-white text-slate-700";
}

function renderSquareStatusGlyph(square: BingoCardSquare) {
  if (square.isFree || square.status === "hit") {
    return (
      <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-black text-white">
        ✓
      </span>
    );
  }
  if (square.status === "miss") {
    return (
      <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white">
        ✕
      </span>
    );
  }
  return null;
}

function toCardSquareKey(cardId: string, squareIndex: number): string {
  return `${cardId}:${squareIndex}`;
}

function toTimestamp(value?: string): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareCardsEarliestToLatest(a: BingoCard, b: BingoCard): number {
  const startsDelta = toTimestamp(a.startsAt) - toTimestamp(b.startsAt);
  if (startsDelta !== 0) {
    return startsDelta;
  }
  const createdDelta = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
  if (createdDelta !== 0) {
    return createdDelta;
  }
  return a.id.localeCompare(b.id);
}

function collectUpdatedSquareKeys(previousCards: BingoCard[], nextCards: BingoCard[]): string[] {
  const previousByCardId = new Map<string, BingoCard>();
  for (const card of previousCards) {
    previousByCardId.set(card.id, card);
  }

  const updatedKeys: string[] = [];
  for (const nextCard of nextCards) {
    const previousCard = previousByCardId.get(nextCard.id);
    if (!previousCard) {
      continue;
    }
    const previousSquaresByIndex = new Map<number, BingoCardSquare>();
    for (const square of previousCard.squares) {
      previousSquaresByIndex.set(square.index, square);
    }
    for (const nextSquare of nextCard.squares) {
      const previousSquare = previousSquaresByIndex.get(nextSquare.index);
      if (!previousSquare) {
        continue;
      }
      if (previousSquare.status !== nextSquare.status) {
        updatedKeys.push(toCardSquareKey(nextCard.id, nextSquare.index));
      }
    }
  }

  return updatedKeys;
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

function renderCompactGrid(
  cardId: string,
  squares: BingoCardSquare[],
  recentlyUpdatedSquareKeys: ReadonlySet<string>
) {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of squares) {
    byIndex.set(square.index, square);
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 25 }).map((_, index) => {
        const square = byIndex.get(index);
        if (!square) {
          return <div key={index} className="h-10 rounded-md border border-slate-200 bg-slate-50" />;
        }

        const isFree = Boolean(square.isFree);
        const shouldPop = recentlyUpdatedSquareKeys.has(toCardSquareKey(cardId, index));
        return (
          <div
            key={index}
            title={square.label}
            className={`relative flex h-10 items-center justify-center rounded-md border px-1 text-center text-[9px] font-semibold leading-tight ${getCardSquareStyle(
              square.status,
              isFree
            )} ${shouldPop ? "bingo-square-pop ring-2 ring-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.45)]" : ""}`}
          >
            {renderSquareStatusGlyph(square)}
            {isFree ? "FREE" : shortenLabel(square.label)}
          </div>
        );
      })}
    </div>
  );
}

function renderExpandedGrid(
  cardId: string,
  squares: BingoCardSquare[],
  recentlyUpdatedSquareKeys: ReadonlySet<string>
) {
  const byIndex = new Map<number, BingoCardSquare>();
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
          const shouldPop = recentlyUpdatedSquareKeys.has(toCardSquareKey(cardId, index));
          return (
            <div
              key={index}
              className={`relative flex min-h-[72px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight sm:min-h-[82px] sm:px-2 sm:py-2 sm:text-[11px] ${getCardSquareStyle(
                square.status,
                isFree
              )} ${shouldPop ? "bingo-square-pop ring-2 ring-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.45)]" : ""}`}
            >
              {renderSquareStatusGlyph(square)}
              {isFree ? "FREE" : square.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type BingoScreenIndex = 0 | 1;

function clampScreen(value: number): BingoScreenIndex {
  return Math.min(1, Math.max(0, value)) as BingoScreenIndex;
}

function recoverBingoPageScrollState() {
  if (typeof document === "undefined") {
    return;
  }

  const body = document.body;
  const root = document.documentElement;

  body.classList.remove("tp-modal-open", "tp-popup-open");
  root.classList.remove("tp-modal-open", "tp-popup-open");

  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "unset";
  root.style.overflow = "unset";
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600" />
      {label}
    </div>
  );
}

export function SportsBingoHome() {
  const [userId, setUserId] = useState("");
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingCardId, setClaimingCardId] = useState("");
  const [expandedActiveCardId, setExpandedActiveCardId] = useState("");
  const [expandedFinalCardId, setExpandedFinalCardId] = useState("");
  const [recentlyUpdatedSquareKeys, setRecentlyUpdatedSquareKeys] = useState<Set<string>>(new Set());
  const [showBoardLimitMessage, setShowBoardLimitMessage] = useState(false);
  const prefetchUsedRef = useRef(false);
  const clearSquarePopTimerRef = useRef<number | null>(null);
  const kickoffRefreshTimerRef = useRef<number | null>(null);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [activeScreen, setActiveScreen] = useState<BingoScreenIndex>(0);

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  useEffect(() => {
    const uid = getUserId()?.trim() ?? "";
    if (!uid) return;
    const cached = consumeBingoPrefetchCache(uid);
    if (cached) {
      prefetchUsedRef.current = true;
      setCards(cached as BingoCard[]);
      setLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    recoverBingoPageScrollState();
    const rafId = window.requestAnimationFrame(() => {
      recoverBingoPageScrollState();
    });
    const timeoutId = window.setTimeout(() => {
      recoverBingoPageScrollState();
    }, 120);

    const onPageShow = () => {
      recoverBingoPageScrollState();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clearSquarePopTimerRef.current) {
        window.clearTimeout(clearSquarePopTimerRef.current);
      }
      if (kickoffRefreshTimerRef.current) {
        window.clearTimeout(kickoffRefreshTimerRef.current);
      }
    };
  }, []);

  const queueSquarePop = useCallback((keys: string[]) => {
    if (keys.length === 0) {
      return;
    }

    setRecentlyUpdatedSquareKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        next.add(key);
      }
      return next;
    });

    if (clearSquarePopTimerRef.current) {
      window.clearTimeout(clearSquarePopTimerRef.current);
    }
    clearSquarePopTimerRef.current = window.setTimeout(() => {
      setRecentlyUpdatedSquareKeys(new Set());
      clearSquarePopTimerRef.current = null;
    }, 2200);
  }, []);

  const loadCards = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!userId) {
      if (!prefetchUsedRef.current) {
        setCards([]);
      }
      return;
    }

    if (!background && prefetchUsedRef.current) {
      prefetchUsedRef.current = false;
      return;
    }

    if (!background) {
      setLoadingCards(true);
    }
    try {
      const response = await fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CardsResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load your Sports Bingo cards.");
      }
      if (!background) {
        setErrorMessage("");
      }
      const nextCards = payload.cards ?? [];
      setCards((previousCards) => {
        queueSquarePop(collectUpdatedSquareKeys(previousCards, nextCards));
        return nextCards;
      });
    } catch (error) {
      if (!background || cards.length === 0) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load your Sports Bingo cards.");
      }
    } finally {
      if (!background) {
        setLoadingCards(false);
      }
    }
  }, [cards.length, queueSquarePop, userId]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const goToScreen = useCallback((screen: BingoScreenIndex) => {
    const viewport = swipeViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTo({
      left: viewport.clientWidth * screen,
      behavior: "smooth",
    });
  }, []);

  const onSwipeTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartXRef.current = touch?.clientX ?? null;
    touchStartYRef.current = touch?.clientY ?? null;
  }, []);

  const onSwipeTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const startX = touchStartXRef.current;
      const startY = touchStartYRef.current;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      if (startX === null || startY === null) {
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 18 || Math.abs(dx) < Math.abs(dy) * 0.5) {
        return;
      }
      if (dx < 0 && activeScreen === 0) {
        goToScreen(1);
      } else if (dx > 0 && activeScreen === 1) {
        goToScreen(0);
      }
    },
    [activeScreen, goToScreen]
  );

  useEffect(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport || typeof window === "undefined") {
      return;
    }

    let rafId: number | null = null;
    const updateScreen = () => {
      const width = Math.max(1, viewport.clientWidth);
      const next = clampScreen(Math.round(viewport.scrollLeft / width));
      setActiveScreen(next);
    };
    const onScroll = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateScreen();
      });
    };
    const onResize = () => {
      viewport.scrollTo({ left: viewport.clientWidth * activeScreen });
      updateScreen();
    };

    updateScreen();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [activeScreen]);

  const { activeCards, finalizedCards } = useMemo(() => {
    const now = Date.now();
    const active: BingoCard[] = [];
    const finalById = new Map<string, BingoCard>();
    for (const card of cards) {
      if (card.status !== "active") {
        finalById.set(card.id, card);
        continue;
      }
      const startsAtMs = Date.parse(card.startsAt);
      const looksInactiveByTime = Number.isFinite(startsAtMs) && now - startsAtMs >= BINGO_GAME_BUFFER_MS;
      if (looksInactiveByTime) {
        finalById.set(card.id, {
          ...card,
          status: "lost",
        });
      } else {
        active.push(card);
      }
    }
    const finalized = Array.from(finalById.values()).sort(compareCardsEarliestToLatest);
    return {
      activeCards: active.sort(compareCardsEarliestToLatest),
      finalizedCards: finalized,
    };
  }, [cards]);
  const hasStartedActiveCard = useMemo(() => {
    const now = Date.now();
    return activeCards.some((card) => {
      const startsAtMs = Date.parse(card.startsAt);
      return Number.isFinite(startsAtMs) && startsAtMs <= now;
    });
  }, [activeCards]);
  const nextActiveCardStartMs = useMemo(() => {
    const now = Date.now();
    let nextStart: number | null = null;
    for (const card of activeCards) {
      const startsAtMs = Date.parse(card.startsAt);
      if (!Number.isFinite(startsAtMs) || startsAtMs <= now) {
        continue;
      }
      if (nextStart === null || startsAtMs < nextStart) {
        nextStart = startsAtMs;
      }
    }
    return nextStart;
  }, [activeCards]);
  const settledCards = finalizedCards;
  const expandedActiveCard = useMemo(
    () => activeCards.find((card) => card.id === expandedActiveCardId) ?? null,
    [activeCards, expandedActiveCardId]
  );
  const expandedFinalCard = useMemo(
    () => settledCards.find((card) => card.id === expandedFinalCardId) ?? null,
    [expandedFinalCardId, settledCards]
  );
  const hasReachedBoardLimit = activeCards.length >= 4;

  useEffect(() => {
    if (!userId || !hasStartedActiveCard) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadCards({ background: true });
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [hasStartedActiveCard, loadCards, userId]);

  useEffect(() => {
    if (!userId || hasStartedActiveCard || nextActiveCardStartMs === null) {
      if (kickoffRefreshTimerRef.current) {
        window.clearTimeout(kickoffRefreshTimerRef.current);
        kickoffRefreshTimerRef.current = null;
      }
      return;
    }
    const delayMs = Math.max(0, nextActiveCardStartMs - Date.now() + 250);
    kickoffRefreshTimerRef.current = window.setTimeout(() => {
      kickoffRefreshTimerRef.current = null;
      void loadCards({ background: true });
    }, delayMs);
    return () => {
      if (kickoffRefreshTimerRef.current) {
        window.clearTimeout(kickoffRefreshTimerRef.current);
        kickoffRefreshTimerRef.current = null;
      }
    };
  }, [hasStartedActiveCard, loadCards, nextActiveCardStartMs, userId]);

  const claimPoints = async (card: BingoCard, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!userId || claimingCardId) {
      return;
    }

    setClaimingCardId(card.id);
    setErrorMessage("");
    try {
      const response = await fetch("/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          userId,
          cardId: card.id,
        }),
      });
      const payload = (await response.json()) as ClaimResponse;
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Failed to claim Bingo points.");
      }

      const buttonRect = event.currentTarget.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("tp:coin-flight", {
          detail: {
            sourceRect: {
              left: buttonRect.left,
              top: buttonRect.top,
              width: buttonRect.width,
              height: buttonRect.height,
            },
            delta: payload.result.rewardPoints,
            coins: Math.min(32, Math.max(12, Math.round(payload.result.rewardPoints / 4))),
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent("tp:points-updated", {
          detail: {
            source: "bingo-claim",
            delta: payload.result.rewardPoints,
          },
        })
      );

      setCards((prev) =>
        prev.map((item) =>
          item.id === card.id
            ? {
                ...item,
                rewardClaimedAt: new Date().toISOString(),
              }
            : item
        )
      );
      void loadCards({ background: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to claim Bingo points.");
    } finally {
      setClaimingCardId("");
    }
  };

  return (
    <div className="space-y-4">
      <VenueEntryRulesPanel
        gameKey="bingo"
        shouldDisplay={Boolean(userId) && !loadingCards && activeCards.length === 0}
      />
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Hightop Sports Bingo™</p>
        <p className="mt-1 text-center text-sm text-slate-700">Track active bingo boards here.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {hasReachedBoardLimit ? (
            <button
              type="button"
              aria-disabled="true"
              onMouseDown={() => {
                setShowBoardLimitMessage(true);
              }}
              onMouseUp={() => {
                setShowBoardLimitMessage(false);
              }}
              onMouseLeave={() => {
                setShowBoardLimitMessage(false);
              }}
              onTouchStart={() => {
                setShowBoardLimitMessage(true);
              }}
              onTouchEnd={() => {
                setShowBoardLimitMessage(false);
              }}
              onTouchCancel={() => {
                setShowBoardLimitMessage(false);
              }}
              className="inline-flex min-h-[42px] items-center rounded-full bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {showBoardLimitMessage ? "Cannot exceed 4 active bingo boards!" : "Choose New Bingo Board"}
            </button>
          ) : (
            <Link
              href="/bingo/select-sport"
              className="inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
            >
              Choose New Bingo Board
            </Link>
          )}
          <span className="inline-flex min-h-[42px] items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[12px] font-semibold text-blue-700">
            Active Cards: {activeCards.length}/4
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => goToScreen(0)}
            className={`tp-clean-button rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${
              activeScreen === 0 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"
            }`}
          >
            Active Boards
          </button>
          <button
            type="button"
            onClick={() => goToScreen(1)}
            className={`tp-clean-button rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${
              activeScreen === 1 ? "bg-white text-slate-900" : "bg-white/70 text-slate-700"
            }`}
          >
            Final Scores
          </button>
        </div>

        <div
          ref={swipeViewportRef}
          onTouchStart={onSwipeTouchStart}
          onTouchEnd={onSwipeTouchEnd}
          className="flex w-full touch-pan-y snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <section className="w-full shrink-0 snap-start">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Active Boards</h2>
            </div>
            <p className="mt-2 text-base font-bold text-slate-700">Tap a board to expand it.</p>
            {loadingCards ? (
              <LoadingState label="Loading your cards..." />
            ) : activeCards.length === 0 ? (
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No active cards yet. Tap Play Sports Bingo to begin.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {activeCards.map((card) => {
                  return (
                    <li
                      key={card.id}
                      onClick={() => {
                        setExpandedActiveCardId(card.id);
                      }}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:shadow-md hover:shadow-slate-300/60"
                      style={{
                        touchAction: "pan-y",
                        WebkitTouchCallout: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                          Active
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Starts {formatLocalDateTime(card.startsAt)}</p>
                      <div className="mt-2">{renderCompactGrid(card.id, card.squares, recentlyUpdatedSquareKeys)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="w-full shrink-0 snap-start pl-3">
            <h2 className="text-base font-semibold text-slate-900">Final Scores</h2>
            {loadingCards ? (
              <LoadingState label="Loading final scores..." />
            ) : settledCards.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No final scores yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
            {settledCards.slice(0, 8).map((card) => {
              const summary = summarizeCardState(card);
              const showClaimOverlay = card.status === "won" && !card.rewardClaimedAt;
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
                    {card.status === "won" && card.rewardClaimedAt ? " · Claimed" : ""}
                  </p>
                  {card.status === "won" ? (
                    <div className="relative mt-2">
                      {renderCompactGrid(card.id, card.squares, recentlyUpdatedSquareKeys)}
                      {showClaimOverlay ? (
                        <>
                          <div className="pointer-events-none absolute inset-0 rounded-lg bg-slate-900/10" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <button
                              type="button"
                              disabled={claimingCardId === card.id}
                              onClick={(event) => {
                                void claimPoints(card, event);
                              }}
                              className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
                            >
                              {claimingCardId === card.id ? "Collecting..." : "Collect Points"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedFinalCardId(card.id);
                        }}
                        className="tp-clean-button inline-flex min-h-[36px] items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all active:scale-95"
                      >
                        View Final Board
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {expandedActiveCard ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close active board view"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => {
              setExpandedActiveCardId("");
            }}
          />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-slate-900/40">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{expandedActiveCard.gameLabel}</p>
              <button
                type="button"
                onClick={() => {
                  setExpandedActiveCardId("");
                }}
                className="tp-clean-button inline-flex min-h-[32px] items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">Active Board</p>
            {renderExpandedGrid(expandedActiveCard.id, expandedActiveCard.squares, recentlyUpdatedSquareKeys)}
          </div>
        </div>
      ) : null}

      {expandedFinalCard ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close final board view"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => {
              setExpandedFinalCardId("");
            }}
          />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-slate-900/40">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{expandedFinalCard.gameLabel}</p>
              <button
                type="button"
                onClick={() => {
                  setExpandedFinalCardId("");
                }}
                className="tp-clean-button inline-flex min-h-[32px] items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
              Final Score Board
            </p>
            {renderExpandedGrid(expandedFinalCard.id, expandedFinalCard.squares, recentlyUpdatedSquareKeys)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
