"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  createdAt: string;
  settledAt?: string;
  squares: BingoCardSquare[];
};

type CardsResponse = {
  ok: boolean;
  cards?: BingoCard[];
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

export function SportsBingoHome() {
  const [userId, setUserId] = useState("");
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

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

  const activeCards = useMemo(() => cards.filter((card) => card.status === "active"), [cards]);
  const settledCards = useMemo(() => cards.filter((card) => card.status !== "active"), [cards]);

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sports Bingo Home</p>
            <p className="mt-1 text-sm text-slate-700">Track active boards here and start a new board flow anytime.</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            Active Cards: {activeCards.length}/4
          </span>
        </div>

        <div className="mt-4">
          <Link
            href="/bingo/select-sport"
            className="inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
          >
            Play Sports Bingo
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Active Board Preview</h2>
          <span className="text-xs text-slate-500">No extra tap needed</span>
        </div>

        {loadingCards ? (
          <p className="mt-3 text-sm text-slate-600">Loading your cards...</p>
        ) : activeCards.length === 0 ? (
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No active cards yet. Tap Play Sports Bingo to begin.
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
