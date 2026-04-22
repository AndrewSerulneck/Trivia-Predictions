"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { getUserId } from "@/lib/storage";

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

function renderCompactGrid(squares: BingoCardSquare[]) {
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
        return (
          <div
            key={index}
            title={square.label}
            className={`flex h-10 items-center justify-center rounded-md border px-1 text-center text-[9px] font-semibold leading-tight ${getCardSquareStyle(
              square.status,
              isFree
            )}`}
          >
            {isFree ? "FREE" : shortenLabel(square.label)}
          </div>
        );
      })}
    </div>
  );
}

function renderExpandedGrid(squares: BingoCardSquare[]) {
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
          return (
            <div
              key={index}
              className={`flex min-h-[72px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight sm:min-h-[82px] sm:px-2 sm:py-2 sm:text-[11px] ${getCardSquareStyle(
                square.status,
                isFree
              )}`}
            >
              {isFree ? "FREE" : square.label}
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [pressedCardId, setPressedCardId] = useState("");
  const [showBoardLimitMessage, setShowBoardLimitMessage] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const lastTouchAtRef = useRef(0);

  const clearPressedCard = useCallback(() => {
    activeTouchIdRef.current = null;
    setPressedCardId("");
  }, []);

  const startTouchHold = useCallback(
    (cardId: string, event: ReactTouchEvent<HTMLLIElement>) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      lastTouchAtRef.current = Date.now();
      activeTouchIdRef.current = touch.identifier;
      setPressedCardId(cardId);
    },
    []
  );

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  const loadCards = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!userId) {
      setCards([]);
      setLoadingCards(false);
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
      setCards(payload.cards ?? []);
    } catch (error) {
      if (!background || cards.length === 0) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load your Sports Bingo cards.");
      }
    } finally {
      if (!background) {
        setLoadingCards(false);
      }
    }
  }, [cards.length, userId]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadCards({ background: true });
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadCards, userId]);

  useEffect(() => {
    if (!pressedCardId) {
      activeTouchIdRef.current = null;
    }
  }, [pressedCardId]);

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      if (!pressedCardId) {
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
        clearPressedCard();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
    };

    window.addEventListener("pointerup", clearPressedCard);
    window.addEventListener("pointercancel", clearPressedCard);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", clearPressedCard, { passive: true });
    window.addEventListener("touchcancel", clearPressedCard, { passive: true });
    window.addEventListener("scroll", clearPressedCard, { passive: true });
    window.addEventListener("blur", clearPressedCard);

    return () => {
      window.removeEventListener("pointerup", clearPressedCard);
      window.removeEventListener("pointercancel", clearPressedCard);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", clearPressedCard);
      window.removeEventListener("touchcancel", clearPressedCard);
      window.removeEventListener("scroll", clearPressedCard);
      window.removeEventListener("blur", clearPressedCard);
    };
  }, [clearPressedCard, pressedCardId]);

  const activeCards = useMemo(() => cards.filter((card) => card.status === "active"), [cards]);
  const settledCards = useMemo(() => cards.filter((card) => card.status !== "active"), [cards]);
  const pressedCard = useMemo(
    () => activeCards.find((card) => card.id === pressedCardId) ?? null,
    [activeCards, pressedCardId]
  );
  const hasReachedBoardLimit = activeCards.length >= 4;

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
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sports Bingo Home</p>
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Active Boards</h2>
        </div>
        <p className="mt-2 text-base font-bold text-slate-700">Press down on a board to expand it!</p>

        {loadingCards ? (
          <LoadingState label="Loading your cards..." />
        ) : activeCards.length === 0 ? (
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No active cards yet. Tap Play Sports Bingo to begin.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activeCards.map((card) => {
              const summary = summarizeCardState(card);
              const isPressed = pressedCardId === card.id;
              return (
                <li
                  key={card.id}
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    if (Date.now() - lastTouchAtRef.current < 800) {
                      return;
                    }
                    setPressedCardId(card.id);
                  }}
                  onMouseUp={clearPressedCard}
                  onMouseLeave={() => {
                    setPressedCardId((current) => (current === card.id ? "" : current));
                  }}
                  onTouchStart={(event) => {
                    startTouchHold(card.id, event);
                  }}
                  onTouchEnd={clearPressedCard}
                  onTouchCancel={clearPressedCard}
                  className={`rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all ${
                    isPressed ? "shadow-md shadow-slate-300/60 ring-2 ring-cyan-300/60" : ""
                  }`}
                  style={{
                    touchAction: isPressed ? "none" : "pan-y",
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
                  <p className="mt-1 text-xs text-slate-600">
                    Starts {formatLocalDateTime(card.startsAt)} · Hits {summary.hitCount}/25 · Lines {summary.completedLines}
                    {summary.nearWin ? " · Near Bingo" : ""}
                  </p>
                  <div className="mt-2">{renderCompactGrid(card.squares)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Recent Results</h2>
        {loadingCards ? (
          <LoadingState label="Loading recent results..." />
        ) : settledCards.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No settled cards yet.</p>
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
                      {renderCompactGrid(card.squares)}
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
                              {claimingCardId === card.id ? "Claiming..." : "Claim Reward"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pressedCard ? (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35" />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-slate-900/40">
            <p className="text-center text-sm font-semibold text-slate-900">{pressedCard.gameLabel}</p>
            <p className="mb-2 mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
              Expanded Board Preview
            </p>
            {renderExpandedGrid(pressedCard.squares)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
