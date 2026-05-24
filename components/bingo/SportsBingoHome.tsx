"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import type { TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { consumeBingoPrefetchCache } from "@/lib/bingoPrefetchCache";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { ActionPop, type ActionPopTone } from "@/components/bingo/ActionPop";

type BingoCardSquare = {
  id: string;
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  status: "pending" | "hit" | "miss" | "void" | "replaced";
  resolvedAt?: string;
  propProgress?: { current: number; target: number; unit: string };
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

type LivePlayerStatRealtimeRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  game_status: string;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnovers: number;
  total_fantasy_points: number;
  sport_key?: string;
  stat_type?: string;
  value?: number;
};

type ActionPopItem = {
  id: string;
  text: string;
  tone: ActionPopTone;
  x: number;
  y: number;
};

type VisualEngagementEvent = {
  text: string;
  tone: ActionPopTone;
  squareKey?: string;
  cardId?: string;
  shouldShake?: boolean;
  majorGlow?: boolean;
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
const FINAL_SCORES_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function toLocalDateInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getDateLabel(value: string, today: string): string {
  if (!value) return "";
  if (value === today) return "Today";
  const d = new Date(`${value}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toLocalDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return toLocalDateInput(date);
}

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
    return "border-emerald-400/60 bg-emerald-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
  }
  if (status === "hit") {
    return "border-orange-300 bg-orange-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]";
  }
  if (status === "miss") {
    return "border-rose-400/60 bg-rose-950/20 text-rose-300";
  }
  if (status === "void") {
    return "border-slate-600 bg-slate-800/50 text-slate-500";
  }
  // pending — board idle canvas
  return "border-orange-900/50 bg-slate-800 text-slate-300";
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

function normalizeKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

function getFinalScoreTimestamp(card: BingoCard): number {
  const settledAtMs = Date.parse(String(card.settledAt ?? ""));
  if (Number.isFinite(settledAtMs)) return settledAtMs;
  const startsAtMs = Date.parse(String(card.startsAt ?? ""));
  if (Number.isFinite(startsAtMs)) return startsAtMs;
  const createdAtMs = Date.parse(String(card.createdAt ?? ""));
  if (Number.isFinite(createdAtMs)) return createdAtMs;
  return Number.NEGATIVE_INFINITY;
}

function compareCardsLatestToEarliest(a: BingoCard, b: BingoCard): number {
  const delta = getFinalScoreTimestamp(b) - getFinalScoreTimestamp(a);
  if (delta !== 0) return delta;
  return b.id.localeCompare(a.id);
}

function collectUpdatedSquareChanges(
  previousCards: BingoCard[],
  nextCards: BingoCard[]
): Array<{ squareKey: string; resolverKey: string; status: BingoCardSquare["status"] }> {
  const previousByCardId = new Map<string, BingoCard>();
  for (const card of previousCards) {
    previousByCardId.set(card.id, card);
  }

  const updates: Array<{ squareKey: string; resolverKey: string; status: BingoCardSquare["status"] }> = [];
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
        updates.push({
          squareKey: toCardSquareKey(nextCard.id, nextSquare.index),
          resolverKey: String(nextSquare.key ?? ""),
          status: nextSquare.status,
        });
      }
    }
  }

  return updates;
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

function classifyLiveDeltaEvent(previous: LivePlayerStatRealtimeRow, next: LivePlayerStatRealtimeRow): VisualEngagementEvent[] {
  const events: VisualEngagementEvent[] = [];
  const sportKey = String(next.sport_key ?? "").toLowerCase();
  const statType = String(next.stat_type ?? "").toLowerCase();
  const prevValue = Number(previous.value ?? previous.total_fantasy_points ?? 0);
  const nextValue = Number(next.value ?? next.total_fantasy_points ?? 0);
  const valueDelta = nextValue - prevValue;

  const ptsDelta = Number(next.pts ?? 0) - Number(previous.pts ?? 0);
  const stlDelta = Number(next.stl ?? 0) - Number(previous.stl ?? 0);
  const blkDelta = Number(next.blk ?? 0) - Number(previous.blk ?? 0);
  const astDelta = Number(next.ast ?? 0) - Number(previous.ast ?? 0);
  const rebDelta = Number(next.reb ?? 0) - Number(previous.reb ?? 0);

  const isHomeRunEvent =
    statType.includes("home_run") ||
    statType.includes("home-run") ||
    (sportKey.includes("baseball") && statType.includes("hr"));
  const isTouchdownEvent = statType.includes("touchdown") || statType.includes("td");
  const isStrikeoutEvent = statType.includes("strikeout") || statType.includes("k");

  if (isHomeRunEvent && valueDelta >= 1) {
    events.push({ text: "HOME RUN!", tone: "gold", shouldShake: true, majorGlow: true });
  }
  if (isTouchdownEvent && valueDelta >= 1) {
    events.push({ text: "TOUCHDOWN!", tone: "gold", majorGlow: true });
  }
  if (ptsDelta >= 3) {
    events.push({ text: "3-POINTER!", tone: "gold", majorGlow: true });
  }
  if (blkDelta >= 1) {
    events.push({ text: "BLOCK!", tone: "cyan" });
  }
  if (stlDelta >= 1) {
    events.push({ text: "STEAL!", tone: "cyan" });
  }
  if (isStrikeoutEvent && valueDelta >= 1) {
    events.push({ text: "STRIKEOUT!", tone: "cyan" });
  }

  if (events.length === 0) {
    const scoreDelta = Math.max(valueDelta, ptsDelta, astDelta * 1.5, rebDelta * 1.2);
    if (scoreDelta >= 0.5) {
      events.push({ text: `+${scoreDelta.toFixed(0)} PTS`, tone: "cyan" });
    }
  }

  return events;
}

const BINGO_HEADER_LETTERS = [
  { letter: "B", color: "text-rose-300" },
  { letter: "I", color: "text-amber-300" },
  { letter: "N", color: "text-emerald-300" },
  { letter: "G", color: "text-cyan-300" },
  { letter: "O", color: "text-violet-300" },
] as const;

function renderCompactGrid(
  cardId: string,
  squares: BingoCardSquare[],
  recentlyUpdatedSquareKeys: ReadonlySet<string>,
  recentlySucceededSquareKeys: ReadonlySet<string>,
  glowingSquareKeys: ReadonlySet<string>
) {
  const byIndex = new Map<number, BingoCardSquare>();
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
          return <div key={index} className="h-10 rounded-md border border-slate-200 bg-slate-50" />;
        }

        const isFree = Boolean(square.isFree);
        const squareKey = toCardSquareKey(cardId, index);
        const shouldPop = recentlyUpdatedSquareKeys.has(squareKey);
        const isSuccessPop = recentlySucceededSquareKeys.has(squareKey);
        const isGlowing = glowingSquareKeys.has(squareKey);
        const progressText =
          square.propProgress && square.status === "pending"
            ? `${Math.min(square.propProgress.current, square.propProgress.target)}/${square.propProgress.target}`
            : "";
        return (
          <div
            key={index}
            title={square.label}
            data-bingo-square-key={squareKey}
            className={`relative flex h-10 items-center justify-center rounded-md border px-1 text-center text-[9px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] ${getCardSquareStyle(
              square.status,
              isFree
            )} ${
              shouldPop
                ? isSuccessPop
                  ? "bingo-square-pop ring-2 ring-amber-300 bg-gradient-to-br from-amber-300 via-yellow-300 to-lime-200 text-amber-900 shadow-[0_0_14px_3px_rgba(250,204,21,0.9)] animate-pulse"
                  : "bingo-square-pop ring-2 ring-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.45)]"
                : ""
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-md bg-cyan-300/35 blur-[1px] transition duration-200 ${
                isGlowing ? "scale-110 opacity-100" : "scale-95 opacity-0"
              }`}
              style={{ willChange: "transform, opacity" }}
            />
            {renderSquareStatusGlyph(square)}
            <span>{isFree ? "FREE" : shortenLabel(square.label)}</span>
            {progressText ? (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-black text-cyan-900/85">
                {progressText}
              </span>
            ) : null}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function renderExpandedGrid(
  cardId: string,
  squares: BingoCardSquare[],
  recentlyUpdatedSquareKeys: ReadonlySet<string>,
  recentlySucceededSquareKeys: ReadonlySet<string>,
  glowingSquareKeys: ReadonlySet<string>
) {
  const byIndex = new Map<number, BingoCardSquare>();
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
          const squareKey = toCardSquareKey(cardId, index);
          const shouldPop = recentlyUpdatedSquareKeys.has(squareKey);
          const isSuccessPop = recentlySucceededSquareKeys.has(squareKey);
          const isGlowing = glowingSquareKeys.has(squareKey);
          const progressText =
            square.propProgress && square.status === "pending"
              ? `${Math.min(square.propProgress.current, square.propProgress.target)}/${square.propProgress.target}`
              : "";
          return (
            <div
              key={index}
                data-bingo-square-key={squareKey}
                className={`relative flex min-h-[72px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] sm:min-h-[82px] sm:px-2 sm:py-2 sm:text-[11px] ${getCardSquareStyle(
                square.status,
                isFree
              )} ${
                shouldPop
                  ? isSuccessPop
                    ? "bingo-square-pop ring-2 ring-amber-300 bg-gradient-to-br from-amber-300 via-yellow-300 to-lime-200 text-amber-900 shadow-[0_0_14px_3px_rgba(250,204,21,0.9)] animate-pulse"
                    : "bingo-square-pop ring-2 ring-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.45)]"
                  : ""
              }`}
            >
              <span
                className={`pointer-events-none absolute inset-0 rounded-lg bg-cyan-300/35 blur-[1px] transition duration-200 ${
                  isGlowing ? "scale-110 opacity-100" : "scale-95 opacity-0"
                }`}
                style={{ willChange: "transform, opacity" }}
              />
              {renderSquareStatusGlyph(square)}
              <span>{isFree ? "FREE" : square.label}</span>
              {progressText ? (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black text-cyan-900/85 sm:text-[10px]">
                  {progressText}
                </span>
              ) : null}
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
  forceRecoverDocumentScroll();
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="mt-3">
      <BouncingBallLoader size="sm" label={label} />
    </div>
  );
}

export function SportsBingoHome() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingCardId, setClaimingCardId] = useState("");
  const [isCollectingAllBingo, setIsCollectingAllBingo] = useState(false);
  const [expandedActiveCardId, setExpandedActiveCardId] = useState("");
  const [expandedFinalCardId, setExpandedFinalCardId] = useState("");
  const [recentlyUpdatedSquareKeys, setRecentlyUpdatedSquareKeys] = useState<Set<string>>(new Set());
  const [recentlySucceededSquareKeys, setRecentlySucceededSquareKeys] = useState<Set<string>>(new Set());
  const [showBoardLimitMessage, setShowBoardLimitMessage] = useState(false);
  const [limitPulse, setLimitPulse] = useState(false);
  const [limitPopAnim, setLimitPopAnim] = useState<{ id: number } | null>(null);
  const [limitEchoAnim, setLimitEchoAnim] = useState<{ id: number } | null>(null);
  const [lastRealtimeMessageAt, setLastRealtimeMessageAt] = useState<number | null>(null);
  const [isRealtimeFresh, setIsRealtimeFresh] = useState(false);
  const [actionPops, setActionPops] = useState<ActionPopItem[]>([]);
  const [glowCardIds, setGlowCardIds] = useState<Set<string>>(new Set());
  const [glowSquareKeys, setGlowSquareKeys] = useState<Set<string>>(new Set());
  const [recentlyAddedCardIds, setRecentlyAddedCardIds] = useState<Set<string>>(new Set());
  const [isScreenShaking, setIsScreenShaking] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateInput(new Date()));
  const prefetchUsedRef = useRef(false);
  const clearSquarePopTimerRef = useRef<number | null>(null);
  const kickoffRefreshTimerRef = useRef<number | null>(null);
  const screenShakeTimerRef = useRef<number | null>(null);
  const glowSquareTimersRef = useRef<Map<string, number>>(new Map());
  const glowCardTimersRef = useRef<Map<string, number>>(new Map());
  const actionPopTimersRef = useRef<number[]>([]);
  const nextActionPopAtRef = useRef<number>(0);
  const liveStatsPrevByPlayerRef = useRef<Map<string, LivePlayerStatRealtimeRow>>(new Map());
  const actionPopCounterRef = useRef(0);
  const limitPopIdRef = useRef(0);
  const boardPopTimersRef = useRef<Map<string, number>>(new Map());
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [activeScreen, setActiveScreen] = useState<BingoScreenIndex>(0);
  const todayDate = useMemo(() => toLocalDateInput(new Date()), []);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
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

  const triggerScreenShake = useCallback(() => {
    setIsScreenShaking(true);
    if (screenShakeTimerRef.current) {
      window.clearTimeout(screenShakeTimerRef.current);
    }
    screenShakeTimerRef.current = window.setTimeout(() => {
      setIsScreenShaking(false);
      screenShakeTimerRef.current = null;
    }, 200);
  }, []);

  const pulseSquareGlow = useCallback((squareKey: string) => {
    if (!squareKey) return;
    setGlowSquareKeys((current) => {
      const next = new Set(current);
      next.add(squareKey);
      return next;
    });
    const existing = glowSquareTimersRef.current.get(squareKey);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      setGlowSquareKeys((current) => {
        const next = new Set(current);
        next.delete(squareKey);
        return next;
      });
      glowSquareTimersRef.current.delete(squareKey);
    }, 700);
    glowSquareTimersRef.current.set(squareKey, timer);
  }, []);

  const pulseCardGlow = useCallback((cardId: string) => {
    if (!cardId) return;
    setGlowCardIds((current) => {
      const next = new Set(current);
      next.add(cardId);
      return next;
    });
    const existing = glowCardTimersRef.current.get(cardId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      setGlowCardIds((current) => {
        const next = new Set(current);
        next.delete(cardId);
        return next;
      });
      glowCardTimersRef.current.delete(cardId);
    }, 700);
    glowCardTimersRef.current.set(cardId, timer);
  }, []);

  const findRelevantSquareForEvent = useCallback(
    (playerName: string, text: string): { squareKey?: string; cardId?: string } => {
      const playerKey = normalizeKey(playerName);
      const playerTokens = playerKey.split(" ").filter(Boolean);
      const lastName = playerTokens[playerTokens.length - 1] ?? "";
      const textKey = normalizeKey(text);

      for (const card of cards) {
        for (const square of card.squares) {
          if (square.status === "hit" || square.status === "miss" || square.status === "void") {
            continue;
          }
          const labelKey = normalizeKey(square.label);
          if (!labelKey) continue;
          const hasPlayerMatch =
            (playerKey && labelKey.includes(playerKey)) || (lastName && labelKey.includes(lastName));
          if (!hasPlayerMatch) {
            continue;
          }
          if (textKey.includes("3 pointer") && !labelKey.includes("3")) continue;
          if (textKey.includes("block") && !labelKey.includes("block")) continue;
          if (textKey.includes("steal") && !labelKey.includes("steal")) continue;
          if (textKey.includes("home run") && !labelKey.includes("home run")) continue;
          return { squareKey: toCardSquareKey(card.id, square.index), cardId: card.id };
        }
      }
      return {};
    },
    [cards]
  );

  const findActionAnchor = useCallback((event: VisualEngagementEvent): { x: number; y: number } => {
    const escapeKey = (value: string) => value.replaceAll('"', '\\"');
    if (event.squareKey) {
      const squareEl = document.querySelector<HTMLElement>(`[data-bingo-square-key="${escapeKey(event.squareKey)}"]`);
      if (squareEl) {
        const rect = squareEl.getBoundingClientRect();
        return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.35 };
      }
    }
    if (event.cardId) {
      const cardEl = document.querySelector<HTMLElement>(`[data-bingo-card-id="${escapeKey(event.cardId)}"]`);
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        return { x: rect.left + rect.width * 0.5, y: rect.top + 34 };
      }
    }
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (rootRect) {
      return { x: rootRect.left + rootRect.width * 0.5, y: rootRect.top + 80 };
    }
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 };
  }, []);

  const queueVisualEvents = useCallback(
    (events: VisualEngagementEvent[]) => {
      if (events.length === 0) {
        return;
      }
      for (const event of events) {
        const now = Date.now();
        const startAt = Math.max(now, nextActionPopAtRef.current);
        const delayMs = Math.max(0, startAt - now);
        nextActionPopAtRef.current = startAt + 100;
        const timerId = window.setTimeout(() => {
          const anchor = findActionAnchor(event);
          actionPopCounterRef.current += 1;
          const id = `bingo-pop-${Date.now()}-${actionPopCounterRef.current}`;
          setActionPops((current) => [
            ...current,
            {
              id,
              text: event.text,
              tone: event.tone,
              x: anchor.x,
              y: anchor.y,
            },
          ]);
          if (event.squareKey) {
            pulseSquareGlow(event.squareKey);
          }
          if (event.cardId && event.majorGlow) {
            pulseCardGlow(event.cardId);
          }
          if (event.shouldShake) {
            triggerScreenShake();
          }
        }, delayMs);
        actionPopTimersRef.current.push(timerId);
      }
    },
    [findActionAnchor, pulseCardGlow, pulseSquareGlow, triggerScreenShake]
  );

  useEffect(() => {
    return () => {
      if (clearSquarePopTimerRef.current) {
        window.clearTimeout(clearSquarePopTimerRef.current);
      }
      if (kickoffRefreshTimerRef.current) {
        window.clearTimeout(kickoffRefreshTimerRef.current);
      }
      if (screenShakeTimerRef.current) {
        window.clearTimeout(screenShakeTimerRef.current);
      }
      for (const timer of actionPopTimersRef.current) {
        window.clearTimeout(timer);
      }
      actionPopTimersRef.current = [];
      for (const timer of glowSquareTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      glowSquareTimersRef.current.clear();
      for (const timer of glowCardTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      glowCardTimersRef.current.clear();
      for (const timer of boardPopTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      boardPopTimersRef.current.clear();
    };
  }, []);

  const queueSquarePop = useCallback(
    (updates: Array<{ squareKey: string; resolverKey: string; status: BingoCardSquare["status"] }>) => {
      if (updates.length === 0) {
        return;
      }
      const keys = updates.map((item) => item.squareKey);
      const successKeys = updates.filter((item) => item.status === "hit").map((item) => item.squareKey);

      setRecentlyUpdatedSquareKeys((current) => {
        const next = new Set(current);
        for (const key of keys) {
          next.add(key);
        }
        return next;
      });
      if (successKeys.length > 0) {
        setRecentlySucceededSquareKeys((current) => {
          const next = new Set(current);
          for (const key of successKeys) {
            next.add(key);
          }
          return next;
        });
        window.dispatchEvent(
          new CustomEvent("tp:success-particles", {
            detail: {
              source: "bingo-square",
              squareKeys: successKeys,
            },
          })
        );
      }

      queueVisualEvents(
        updates.map((item) => {
          const [cardId] = item.squareKey.split(":");
          const isPropSquare = item.resolverKey.startsWith("mlb_webhook_");
          if (item.status === "hit") {
            return {
              text: isPropSquare ? "PROP COMPLETED!" : "BINGO HIT!",
              tone: "gold" as const,
              squareKey: item.squareKey,
              cardId,
              majorGlow: true,
              shouldShake: isPropSquare,
            };
          }
          if (item.status === "miss") {
            return {
              text: "MISS",
              tone: "cyan" as const,
              squareKey: item.squareKey,
              cardId,
            };
          }
          return {
            text: "UPDATE",
            tone: "cyan" as const,
            squareKey: item.squareKey,
            cardId,
          };
        })
      );

      if (clearSquarePopTimerRef.current) {
        window.clearTimeout(clearSquarePopTimerRef.current);
      }
      clearSquarePopTimerRef.current = window.setTimeout(() => {
        setRecentlyUpdatedSquareKeys(new Set());
        setRecentlySucceededSquareKeys(new Set());
        clearSquarePopTimerRef.current = null;
      }, 2200);
    },
    [queueVisualEvents]
  );

  const loadCards = useCallback(async ({ background = false, refreshProgress = true }: { background?: boolean; refreshProgress?: boolean } = {}) => {
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
      const response = await fetch(
        `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true&refreshProgress=${refreshProgress ? "true" : "false"}`,
        {
          cache: "no-store",
        }
      );
      const payload = (await response.json()) as CardsResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load your Sports Bingo cards.");
      }
      if (!background) {
        setErrorMessage("");
      }
      const nextCards = payload.cards ?? [];
      setCards((previousCards) => {
        queueSquarePop(collectUpdatedSquareChanges(previousCards, nextCards));
        const previousActiveIds = new Set(previousCards.filter((card) => card.status === "active").map((card) => card.id));
        const newlyAddedActiveIds = nextCards
          .filter((card) => card.status === "active" && !previousActiveIds.has(card.id))
          .map((card) => card.id);
        if (newlyAddedActiveIds.length > 0) {
          setRecentlyAddedCardIds((current) => {
            const next = new Set(current);
            for (const cardId of newlyAddedActiveIds) {
              next.add(cardId);
              const existingTimer = boardPopTimersRef.current.get(cardId);
              if (existingTimer) {
                window.clearTimeout(existingTimer);
              }
              const timer = window.setTimeout(() => {
                setRecentlyAddedCardIds((latest) => {
                  const cleaned = new Set(latest);
                  cleaned.delete(cardId);
                  return cleaned;
                });
                boardPopTimersRef.current.delete(cardId);
              }, 850);
              boardPopTimersRef.current.set(cardId, timer);
            }
            return next;
          });
        }
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

  useEffect(() => {
    const updateFreshness = () => {
      if (!lastRealtimeMessageAt) {
        setIsRealtimeFresh(false);
        return;
      }
      setIsRealtimeFresh(Date.now() - lastRealtimeMessageAt <= 10_000);
    };
    updateFreshness();
    const interval = window.setInterval(updateFreshness, 1000);
    return () => window.clearInterval(interval);
  }, [lastRealtimeMessageAt]);

  const subscribedCardIds = useMemo(() => Array.from(new Set(cards.map((card) => card.id).filter(Boolean))), [cards]);
  const subscribedGameIds = useMemo(() => Array.from(new Set(cards.map((card) => card.gameId).filter(Boolean))), [cards]);
  const subscribedCardFilter = useMemo(() => {
    if (subscribedCardIds.length === 0) {
      return "";
    }
    return `card_id=in.(${subscribedCardIds.join(",")})`;
  }, [subscribedCardIds]);

  useEffect(() => {
    if (!userId) {
      console.log("[BingoRealtime] waiting for userId before subscribing");
      return;
    }
    if (!supabase) {
      console.log("[BingoRealtime] supabase client not configured");
      return;
    }

    console.log("[BingoRealtime] subscribing", { userId });
    const client = supabase;
    let active = true;
    const cardsChannel = client
      .channel(`bingo-cards:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sports_bingo_cards", filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log("[BingoRealtime] sports_bingo_cards payload", payload);
          if (!active) {
            return;
          }
          setLastRealtimeMessageAt(Date.now());
          void loadCards({ background: true, refreshProgress: false });
        }
      )
      .subscribe((status) => {
        console.log("[BingoRealtime] cards channel status", status, { userId });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setIsRealtimeFresh(false);
        }
      });

    let squaresChannel: ReturnType<typeof client.channel> | null = null;
    if (subscribedCardFilter) {
      squaresChannel = client
        .channel(`bingo-squares:${userId}:${subscribedCardIds.length}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sports_bingo_squares", filter: subscribedCardFilter },
          (payload) => {
            console.log("[BingoRealtime] sports_bingo_squares payload", payload);
            if (!active) {
              return;
            }
            setLastRealtimeMessageAt(Date.now());
            void loadCards({ background: true, refreshProgress: false });
          }
        )
        .subscribe((status) => {
          console.log("[BingoRealtime] squares channel status", status, { userId, subscribedCardFilter });
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setIsRealtimeFresh(false);
          }
        });
    }

    return () => {
      active = false;
      void client.removeChannel(cardsChannel);
      if (squaresChannel) {
        void client.removeChannel(squaresChannel);
      }
    };
  }, [loadCards, subscribedCardFilter, subscribedCardIds.length, userId]);

  useEffect(() => {
    if (!supabase || subscribedGameIds.length === 0) {
      return;
    }
    const client = supabase;
    let active = true;
    const gameIdSet = new Set(subscribedGameIds);

    const liveChannel = client
      .channel(`bingo-live-events:${userId || "anon"}:${subscribedGameIds.length}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_player_stats" }, (payload) => {
        if (!active) return;
        const next = (payload.new ?? null) as LivePlayerStatRealtimeRow | null;
        if (!next) return;
        const gameId = String(next.game_id ?? "").trim();
        if (!gameIdSet.has(gameId)) {
          return;
        }
        const playerId = Number(next.player_id ?? 0);
        if (!Number.isFinite(playerId) || playerId <= 0) {
          return;
        }
        const mapKey = `${gameId}:${playerId}`;
        const previous = liveStatsPrevByPlayerRef.current.get(mapKey);
        liveStatsPrevByPlayerRef.current.set(mapKey, next);
        if (!previous) {
          return;
        }

        const baseEvents = classifyLiveDeltaEvent(previous, next);
        if (baseEvents.length === 0) {
          return;
        }

        const events: VisualEngagementEvent[] = [];
        for (const base of baseEvents) {
          const relevance = findRelevantSquareForEvent(next.player_name, base.text);
          events.push({
            ...base,
            squareKey: relevance.squareKey,
            cardId: relevance.cardId ?? cards[0]?.id,
          });
        }
        queueVisualEvents(events);
      })
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(liveChannel);
      liveStatsPrevByPlayerRef.current.clear();
    };
  }, [cards, findRelevantSquareForEvent, queueVisualEvents, subscribedGameIds, userId]);

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
    const finalized = Array.from(finalById.values())
      .filter((card) => {
        const finalizedAtMs = getFinalScoreTimestamp(card);
        return Number.isFinite(finalizedAtMs) && now - finalizedAtMs <= FINAL_SCORES_RETENTION_MS;
      })
      .sort(compareCardsLatestToEarliest);
    return {
      activeCards: active.sort(compareCardsEarliestToLatest),
      finalizedCards: finalized,
    };
  }, [cards]);
  const selectedDayCards = useMemo(
    () => cards.filter((card) => toLocalDateKey(card.startsAt) === selectedDate),
    [cards, selectedDate]
  );
  const selectedActiveCards = useMemo(
    () =>
      selectedDayCards
        .filter((card) => activeCards.some((activeCard) => activeCard.id === card.id))
        .sort(compareCardsEarliestToLatest),
    [activeCards, selectedDayCards]
  );
  const selectedSettledCards = useMemo(
    () =>
      selectedDayCards
        .filter((card) => finalizedCards.some((finalizedCard) => finalizedCard.id === card.id))
        .sort(compareCardsLatestToEarliest),
    [finalizedCards, selectedDayCards]
  );
  const selectedDayHasUnclaimed = useMemo(
    () =>
      selectedSettledCards.some((card) => card.status === "won" && !card.rewardClaimedAt && card.rewardPoints > 0),
    [selectedSettledCards]
  );
  const hasPreviousUnclaimed = useMemo(
    () =>
      !selectedDayHasUnclaimed &&
      finalizedCards.some((card) => {
        if (card.status !== "won" || card.rewardClaimedAt || card.rewardPoints <= 0) return false;
        const day = toLocalDateKey(card.startsAt);
        return Boolean(day) && day < selectedDate;
      }),
    [finalizedCards, selectedDate, selectedDayHasUnclaimed]
  );
  const hasFutureUnclaimed = useMemo(
    () =>
      !selectedDayHasUnclaimed &&
      finalizedCards.some((card) => {
        if (card.status !== "won" || card.rewardClaimedAt || card.rewardPoints <= 0) return false;
        const day = toLocalDateKey(card.startsAt);
        return Boolean(day) && day > selectedDate;
      }),
    [finalizedCards, selectedDate, selectedDayHasUnclaimed]
  );
  const isSelectedDateToday = selectedDate === todayDate;
  const navigateToPrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(`${prev}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return toLocalDateInput(d);
    });
  }, []);
  const navigateToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      if (prev >= todayDate) return prev;
      const d = new Date(`${prev}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return toLocalDateInput(d);
    });
  }, [todayDate]);
  useEffect(() => {
    if (!isSelectedDateToday) {
      setActiveScreen(1);
    }
  }, [isSelectedDateToday]);
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
  const unclaimedWonBingoCards = useMemo(
    () => settledCards.filter((card) => card.status === "won" && !card.rewardClaimedAt && card.rewardPoints > 0),
    [settledCards]
  );
  const totalUnclaimedBingoPoints = useMemo(
    () => unclaimedWonBingoCards.reduce((sum, card) => sum + card.rewardPoints, 0),
    [unclaimedWonBingoCards]
  );

  const collectAllBingoPoints = useCallback(async () => {
    if (!userId || isCollectingAllBingo || unclaimedWonBingoCards.length === 0) return;
    setIsCollectingAllBingo(true);
    setErrorMessage("");
    let totalAwarded = 0;
    let firstRect: DOMRect | undefined;
    try {
      const collectButton = document.querySelector<HTMLElement>("[data-bingo-collect-all]");
      firstRect = collectButton?.getBoundingClientRect();
      for (const card of unclaimedWonBingoCards) {
        const response = await fetch("/api/bingo/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", userId, cardId: card.id }),
        });
        const payload = (await response.json()) as ClaimResponse;
        if (payload.ok && payload.result) {
          totalAwarded += payload.result.rewardPoints;
        }
      }
      if (totalAwarded > 0) {
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
              sourceRect: firstRect
                ? { left: firstRect.left, top: firstRect.top, width: firstRect.width, height: firstRect.height }
                : undefined,
              delta: totalAwarded,
              coins: Math.min(36, Math.max(14, Math.round(totalAwarded / 4))),
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "bingo-claim", delta: totalAwarded },
          })
        );
      }
    } catch {
      setErrorMessage("Failed to collect some boards. Try individual collect buttons below.");
    } finally {
      setIsCollectingAllBingo(false);
      void loadCards({ background: true });
    }
  }, [isCollectingAllBingo, loadCards, unclaimedWonBingoCards, userId]);

  const expandedActiveCard = useMemo(
    () => activeCards.find((card) => card.id === expandedActiveCardId) ?? null,
    [activeCards, expandedActiveCardId]
  );
  const expandedFinalCard = useMemo(
    () => settledCards.find((card) => card.id === expandedFinalCardId) ?? null,
    [expandedFinalCardId, settledCards]
  );
  const hasReachedBoardLimit = activeCards.length >= 4;
  const triggerLimitReachedFeedback = useCallback(() => {
    setShowBoardLimitMessage(true);
    window.setTimeout(() => setShowBoardLimitMessage(false), 900);

    limitPopIdRef.current += 1;
    setLimitPopAnim({ id: limitPopIdRef.current });
    window.setTimeout(() => {
      limitPopIdRef.current += 1;
      setLimitEchoAnim({ id: limitPopIdRef.current });
    }, 170);
    setLimitPulse(false);
    window.requestAnimationFrame(() => setLimitPulse(true));
    window.setTimeout(() => setLimitPulse(false), 900);
  }, []);

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

  const claimPoints = async (card: BingoCard, sourceElement: HTMLElement | null = null) => {
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

      const buttonRect = sourceElement?.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("tp:coin-flight", {
          detail: {
            sourceRect: buttonRect
              ? { left: buttonRect.left, top: buttonRect.top, width: buttonRect.width, height: buttonRect.height }
              : undefined,
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
    <div ref={rootRef} className={`space-y-3 ${isScreenShaking ? "tp-bingo-screen-shake" : ""}`}>
      <VenueEntryRulesPanel
        gameKey="bingo"
        shouldDisplay={Boolean(userId) && !loadingCards && activeCards.length === 0}
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/80 p-3 text-sm text-rose-300">{errorMessage}</div>
      ) : null}

      {unclaimedWonBingoCards.length > 0 ? (
        <div className="rounded-xl border border-emerald-500/40 bg-[linear-gradient(135deg,#052e16_0%,#064e3b_60%,#065f46_100%)] px-3 py-3 shadow-[0_6px_18px_rgba(5,46,22,0.5)]">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">🎉 Bingo Points Ready</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black leading-none text-white">
                {unclaimedWonBingoCards.length} winning board{unclaimedWonBingoCards.length !== 1 ? "s" : ""}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">
                +{totalUnclaimedBingoPoints} pts waiting to collect
              </p>
            </div>
            <button
              type="button"
              data-bingo-collect-all
              onClick={() => void collectAllBingoPoints()}
              disabled={isCollectingAllBingo}
              className="tp-clean-button inline-flex min-h-[44px] items-center rounded-full border-2 border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-900 shadow-[0_3px_0_rgba(0,0,0,0.25)] transition-all active:scale-95 disabled:opacity-60"
            >
              {isCollectingAllBingo ? "Collecting..." : "Collect Points"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Header — BINGO rainbow title + controls */}
      <div className="rounded-2xl border border-orange-400/40 bg-slate-900 p-4">
        <p className="text-center text-[11px] font-black uppercase tracking-[0.16em] text-orange-400">Hightop Sports</p>
        <div className="mb-1 grid grid-cols-5 gap-1">
          {[
            { letter: "B", cls: "text-rose-400" },
            { letter: "I", cls: "text-amber-400" },
            { letter: "N", cls: "text-emerald-400" },
            { letter: "G", cls: "text-cyan-400" },
            { letter: "O", cls: "text-violet-400" },
          ].map((item) => (
            <div
              key={item.letter}
              className={`text-center text-3xl font-black tracking-[0.1em] drop-shadow-[0_0_8px_currentColor] ${item.cls}`}
            >
              {item.letter}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {hasReachedBoardLimit ? (
            <button
              type="button"
              aria-disabled="true"
              onClick={triggerLimitReachedFeedback}
              className={`inline-flex min-h-[44px] items-center rounded-full bg-orange-100 px-5 py-2 text-sm font-bold text-orange-400 ${
                limitPulse ? "pickem-limit-pulse" : ""
              }`}
            >
              {showBoardLimitMessage ? "Max 4 active boards reached!" : "Generate New Bingo Board"}
            </button>
          ) : (
            <Link
              href="/bingo/select-sport"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-violet-500 to-cyan-500 px-5 py-2 text-sm font-bold text-white shadow-[0_4px_16px_rgba(139,92,246,0.3)] transition-all active:scale-95"
            >
              🎲 Generate New Bingo Board
            </Link>
          )}
        </div>

        <div className="mt-3 flex w-full items-center justify-between rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-2 py-1.5">
          <button
            type="button"
            onClick={navigateToPrevDay}
            className="tp-clean-button relative flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/15 active:scale-90"
            aria-label="Previous day"
          >
            ◀
            {hasPreviousUnclaimed ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">!</span>
            ) : null}
          </button>
          <span className="text-sm font-bold text-white">{getDateLabel(selectedDate, todayDate)}</span>
          <button
            type="button"
            onClick={navigateToNextDay}
            disabled={selectedDate >= todayDate}
            className="tp-clean-button relative flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/15 active:scale-90 disabled:opacity-30"
            aria-label="Next day"
          >
            ▶
            {hasFutureUnclaimed ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">!</span>
            ) : null}
          </button>
        </div>

        <div className="mt-3 flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (venueId) {
                void navigateBackToVenue({
                  venuePath: `/venue/${encodeURIComponent(venueId)}`,
                  fallbackNavigate: () => {
                    window.location.href = `/venue/${encodeURIComponent(venueId)}`;
                  },
                });
              }
            }}
            className="tp-exit-pill tp-clean-button flex flex-1 items-center justify-center gap-1 py-2 text-sm font-black active:scale-95"
            style={{ boxShadow: "0 0 0 2px #020617, 0 1px 3px rgba(28,43,58,0.5)" }}
          >
            ← Back to Venue
          </button>
          <button
            type="button"
            data-bingo-collect-all
            onClick={() => void collectAllBingoPoints()}
            disabled={unclaimedWonBingoCards.length === 0 || isCollectingAllBingo}
            className="tp-clean-button flex flex-1 items-center justify-center gap-1 rounded-full border border-[#3a1c72] bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] py-2 text-sm font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
          >
            {isCollectingAllBingo ? "Collecting..." : "Collect Points"}
          </button>
        </div>
      </div>

      {/* Boards section */}
      <div className="rounded-2xl border border-orange-400/30 bg-slate-900 p-3">
        <div className="mb-3 flex items-center justify-center gap-2">
          {isSelectedDateToday ? (
            <button
            type="button"
            onClick={() => goToScreen(0)}
            className={`tp-clean-button rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] transition-all ${
              activeScreen === 0
                ? "bg-orange-500 text-white shadow-[0_2px_10px_rgba(234,88,12,0.4)]"
                : "bg-slate-800 text-orange-400 hover:bg-slate-700"
            }`}
          >
            Active Boards
          </button>
          ) : null}
          <button
            type="button"
            onClick={() => goToScreen(isSelectedDateToday ? 1 : 0)}
            className={`tp-clean-button rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] transition-all ${
              (isSelectedDateToday ? activeScreen === 1 : true)
                ? "bg-amber-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.4)]"
                : "bg-slate-800 text-orange-400 hover:bg-slate-700"
            }`}
          >
            Scored Boards
          </button>
        </div>

        <div
          ref={swipeViewportRef}
          onTouchStart={onSwipeTouchStart}
          onTouchEnd={onSwipeTouchEnd}
          className="flex w-full touch-pan-y snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Active boards panel */}
          <section className="w-full shrink-0 snap-start">
            <h2 className="text-base font-black text-orange-300">Active Boards</h2>
            <p className="mt-1 text-sm text-slate-400">Tap a board to expand it.</p>
            {loadingCards ? (
              <LoadingState label="Loading your cards..." />
            ) : selectedActiveCards.length === 0 ? (
              <p className="mt-3 rounded-xl border border-orange-400/30 bg-slate-800/50 p-3 text-sm text-slate-400">
                No active cards yet. Tap Generate New Bingo Board to begin.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {selectedActiveCards.map((card) => (
                  <li
                    key={card.id}
                    data-bingo-card-id={card.id}
                    onClick={() => setExpandedActiveCardId(card.id)}
                    className={`relative cursor-pointer rounded-xl border border-orange-400/40 bg-slate-800/60 p-3 transition-all hover:border-orange-400 hover:bg-slate-800 ${
                      recentlyAddedCardIds.has(card.id) ? "bingo-board-pop" : ""
                    }`}
                    style={{ touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                  >
                    <span
                      className={`pointer-events-none absolute inset-0 rounded-xl bg-cyan-300/20 transition duration-200 ${
                        glowCardIds.has(card.id) ? "scale-105 opacity-100" : "scale-95 opacity-0"
                      }`}
                      style={{ willChange: "transform, opacity" }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                      <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-cyan-700">
                        Active
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Starts {formatLocalDateTime(card.startsAt)}</p>
                    <div className="mt-2">
                      {renderCompactGrid(card.id, card.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <InlineSlotAdClient
                slot="leaderboard-sidebar"
                venueId={venueId}
                pageKey="sports-bingo"
                adType="inline"
                displayTrigger="on-load"
                placementKey="bingo-home-active-inline"
              />
            </div>
          </section>

          {/* Final scores panel */}
          <section className="w-full shrink-0 snap-start pl-3">
            <h2 className="text-base font-bold text-orange-900">Scored Boards</h2>
            {loadingCards ? (
              <LoadingState label="Loading scored boards..." />
            ) : selectedSettledCards.length === 0 ? (
              <p className="mt-3 text-sm text-orange-700/70">No scored boards yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {selectedSettledCards.slice(0, 8).map((card) => {
                  const summary = summarizeCardState(card);
                  const showClaimOverlay = card.status === "won" && !card.rewardClaimedAt;
                  return (
                    <li
                      key={card.id}
                      data-bingo-card-id={card.id}
                      className={`rounded-xl border p-3 shadow-sm transition-all ${
                        showClaimOverlay
                          ? "cursor-pointer border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300 animate-pulse"
                          : "border-orange-200 bg-white/70"
                      }`}
                      onClick={showClaimOverlay ? (event) => void claimPoints(card, event.currentTarget) : undefined}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                            card.status === "won"
                              ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                              : card.status === "lost"
                              ? "border border-rose-300 bg-rose-50 text-rose-700"
                              : "border border-orange-200 bg-orange-50 text-orange-600"
                          }`}
                        >
                          {card.status}
                        </span>
                        {showClaimOverlay ? (
                          <span className="rounded-full border border-emerald-400 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-800">
                            Tap to Claim
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatLocalDateTime(card.startsAt)} · Hits {summary.hitCount}/25
                        {card.status === "won" ? ` · +${card.rewardPoints} pts` : ""}
                        {card.status === "won" && card.rewardClaimedAt ? " · Claimed" : ""}
                      </p>
                      {card.status === "won" ? (
                        <div className="relative mt-2">
                          {renderCompactGrid(card.id, card.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
                          {showClaimOverlay ? (
                            <>
                              <div className="pointer-events-none absolute inset-0 rounded-lg bg-slate-900/10" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button
                                  type="button"
                                  disabled={claimingCardId === card.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void claimPoints(card, event.currentTarget);
                                  }}
                                  className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] transition-all active:scale-95 disabled:opacity-60"
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
                            onClick={() => setExpandedFinalCardId(card.id)}
                            className="tp-clean-button inline-flex min-h-[36px] items-center rounded-full border border-orange-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-orange-700 transition-all active:scale-95 hover:border-orange-400"
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
            <div className="mt-3">
              <InlineSlotAdClient
                slot="leaderboard-sidebar"
                venueId={venueId}
                pageKey="sports-bingo"
                adType="inline"
                displayTrigger="on-load"
                placementKey="bingo-home-final-inline"
              />
            </div>
          </section>
        </div>
      </div>

      {/* Expanded active board modal */}
      {expandedActiveCard ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close active board view"
            className="absolute inset-0 bg-orange-950/50"
            onClick={() => setExpandedActiveCardId("")}
          />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-cyan-300 bg-white p-3 shadow-2xl shadow-orange-900/30">
            <div className="sticky top-0 z-10 mb-2 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-cyan-100 bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-sm font-semibold text-slate-900">{expandedActiveCard.gameLabel}</p>
              <button
                type="button"
                onClick={() => setExpandedActiveCardId("")}
                className="tp-clean-button inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-slate-900/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm"
              >
                <span aria-hidden="true">✕</span>
                <span>Close</span>
              </button>
            </div>
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-cyan-600">Active Board</p>
            {renderExpandedGrid(expandedActiveCard.id, expandedActiveCard.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
          </div>
        </div>
      ) : null}

      {/* Expanded final board modal */}
      {expandedFinalCard ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close final board view"
            className="absolute inset-0 bg-orange-950/50"
            onClick={() => setExpandedFinalCardId("")}
          />
          <div className="relative w-full max-w-[900px] max-h-[82vh] overflow-y-auto rounded-2xl border border-amber-300 bg-white p-3 shadow-2xl shadow-orange-900/30">
            <div className="sticky top-0 z-10 mb-2 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-amber-100 bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-sm font-semibold text-slate-900">{expandedFinalCard.gameLabel}</p>
              <button
                type="button"
                onClick={() => setExpandedFinalCardId("")}
                className="tp-clean-button inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-slate-900/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm"
              >
                <span aria-hidden="true">✕</span>
                <span>Close</span>
              </button>
            </div>
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-amber-600">Final Score Board</p>
            {renderExpandedGrid(expandedFinalCard.id, expandedFinalCard.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
          </div>
        </div>
      ) : null}

      {typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[2400]" aria-hidden="true">
              {actionPops.map((pop) => (
                <ActionPop
                  key={pop.id}
                  text={pop.text}
                  x={pop.x}
                  y={pop.y}
                  tone={pop.tone}
                  onDone={() => setActionPops((current) => current.filter((item) => item.id !== pop.id))}
                />
              ))}
            </div>,
            document.body
          )
        : null}
      {typeof document !== "undefined" && (limitPopAnim || limitEchoAnim)
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[7000] flex items-center justify-center">
              {limitPopAnim ? (
                <motion.span
                  key={limitPopAnim.id}
                  className="select-none whitespace-nowrap font-black leading-none text-red-500 transform-gpu will-change-transform"
                  style={{
                    fontSize: "clamp(2.2rem, 10vw, 4.5rem)",
                    textShadow: "0 0 22px rgba(239,68,68,0.42), 0 0 44px rgba(239,68,68,0.24)",
                  }}
                  initial={{ scale: 0.72, opacity: 0, y: 0 }}
                  animate={{ scale: [0.72, 1.08, 1.02, 0.98], y: [0, -20, -16, -8], opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 0.55,
                    times: [0, 0.28, 0.62, 1],
                    ease: ["easeOut", "easeOut", "easeIn", "easeIn"],
                  }}
                  onAnimationComplete={() => setLimitPopAnim(null)}
                >
                  Limit Reached
                </motion.span>
              ) : null}
              {limitEchoAnim ? (
                <motion.span
                  key={limitEchoAnim.id}
                  className="absolute top-[19%] select-none whitespace-nowrap font-black leading-none text-red-500 transform-gpu will-change-transform"
                  style={{
                    fontSize: "clamp(1.8rem, 7vw, 3.2rem)",
                    textShadow: "0 0 18px rgba(239,68,68,0.38), 0 0 34px rgba(239,68,68,0.18)",
                  }}
                  initial={{ scale: 0.7, opacity: 0, y: 0 }}
                  animate={{ scale: [0.7, 1.06, 1], opacity: [0, 1, 0], y: [0, -12, -20] }}
                  transition={{ duration: 0.55, times: [0, 0.45, 1], ease: "easeOut" }}
                  onAnimationComplete={() => setLimitEchoAnim(null)}
                >
                  Limit Reached
                </motion.span>
              ) : null}
            </div>,
            document.body
          )
        : null}
      <style jsx global>{`
        @keyframes tp-bingo-screen-shake {
          0% { transform: translate3d(0, 0, 0); }
          20% { transform: translate3d(-1px, 0, 0); }
          40% { transform: translate3d(1px, 0, 0); }
          60% { transform: translate3d(-1px, 0, 0); }
          80% { transform: translate3d(1px, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .tp-bingo-screen-shake {
          animation: tp-bingo-screen-shake 200ms linear;
          will-change: transform;
        }
        @keyframes pickem-limit-pulse {
          0% { transform: scale(1); opacity: 1; }
          35% { transform: scale(1.08); opacity: 0.92; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pickem-limit-pulse {
          animation: pickem-limit-pulse 420ms ease-in-out;
        }
        @keyframes bingo-board-pop {
          0% { transform: scale(0.92); }
          60% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        .bingo-board-pop {
          animation: bingo-board-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
