"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, ListChecks, Plus, Trophy } from "lucide-react";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import type { TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { consumeBingoPrefetchCache } from "@/lib/bingoPrefetchCache";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { ActionPop, type ActionPopTone } from "@/components/bingo/ActionPop";
import { SlimTopBar, ViewTabs, FoldLine, LiveDot } from "@/components/venue/GameChrome";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";

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

// Casino-felt square treatment — open squares read as dark "daub-ready" tiles on
// the green felt; hit squares glow orange; the FREE center is gold.
function getCardSquareStyle(status: BingoCardSquare["status"], isFree: boolean): string {
  if (isFree) {
    return "border-amber-300/65 bg-[linear-gradient(135deg,rgba(252,211,77,0.42),rgba(217,119,6,0.32))] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
  }
  if (status === "hit") {
    return "border-orange-400/70 bg-[radial-gradient(circle_at_50%_38%,rgba(249,115,22,0.6),rgba(249,115,22,0.16)_70%,transparent),rgba(249,115,22,0.18)] text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.45)]";
  }
  if (status === "miss") {
    return "border-rose-500/45 bg-rose-950/30 text-rose-300/80";
  }
  if (status === "void") {
    return "border-white/[0.06] bg-slate-900/40 text-slate-600";
  }
  // pending — open square on the felt, awaiting a stat update
  return "border-white/10 bg-white/[0.04] text-white/75";
}

function renderSquareStatusGlyph(square: BingoCardSquare) {
  if (square.isFree || square.status === "hit") {
    return (
      <span className="absolute right-0.5 top-0.5 text-[11px] font-black leading-none text-amber-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
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
  { letter: "G", color: "text-sky-300" },
  { letter: "O", color: "text-violet-300" },
] as const;

// Closest 5-in-a-row remaining for the board: 0 means a line is complete (bingo),
// null means every line is blocked by a miss/void. Drives the "N to bingo" hint.
function getClosestLineRemaining(squares: BingoCardSquare[]): number | null {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of squares) {
    byIndex.set(square.index, square);
  }
  let best: number | null = null;
  for (const line of LINE_PATTERNS) {
    let hits = 0;
    let blocked = false;
    for (const index of line) {
      const square = byIndex.get(index);
      if (square && (square.isFree || square.status === "hit")) {
        hits += 1;
      } else if (square && (square.status === "miss" || square.status === "void")) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      continue;
    }
    const remaining = 5 - hits;
    if (best === null || remaining < best) {
      best = remaining;
    }
  }
  return best;
}

function getBoardProgress(squares: BingoCardSquare[]): {
  hitCount: number;
  pctFilled: number;
  toBingo: number | null;
} {
  const hitCount = squares.reduce(
    (sum, square) => (square.isFree || square.status === "hit" ? sum + 1 : sum),
    0
  );
  return {
    hitCount,
    pctFilled: Math.round((hitCount / 25) * 100),
    toBingo: getClosestLineRemaining(squares),
  };
}

// Casino-felt progress ring — mirrors the conic gauge in the Bingo design mockups.
const BingoProgressRing = ({
  squares,
  size = "md",
}: {
  squares: BingoCardSquare[];
  size?: "sm" | "md";
}) => {
  const { hitCount, pctFilled, toBingo } = getBoardProgress(squares);
  const ringClass = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const innerClass = size === "sm" ? "h-[30px] w-[30px] text-[10px]" : "h-9 w-9 text-[11px]";
  const toBingoLabel =
    toBingo === null ? "every line blocked" : toBingo === 0 ? "Bingo!" : `${toBingo} to bingo`;
  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full ${ringClass}`}
        style={{
          background: `conic-gradient(#f97316 0 ${pctFilled}%, rgba(255,255,255,0.06) ${pctFilled}% 100%)`,
        }}
      >
        <div
          className={`flex items-center justify-center rounded-full bg-slate-900 font-black tabular-nums text-sky-200 ${innerClass}`}
        >
          {hitCount}/25
        </div>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-extrabold text-slate-100">Squares hit</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
          {pctFilled}% filled · {toBingoLabel}
        </p>
      </div>
    </div>
  );
};

// Legend panel — explains the three square states on the felt board.
const BingoLegend = () => (
  <ul className="space-y-2 text-[11.5px] font-semibold text-slate-200">
    <li className="flex items-center gap-2">
      <span className="h-3.5 w-3.5 shrink-0 rounded border border-amber-300/60 bg-[linear-gradient(135deg,rgba(252,211,77,0.4),rgba(217,119,6,0.3))]" />
      Center FREE — auto-filled
    </li>
    <li className="flex items-center gap-2">
      <span className="h-3.5 w-3.5 shrink-0 rounded border border-orange-400/70 bg-orange-500/35 shadow-[0_0_6px_rgba(249,115,22,0.45)]" />
      Hit · square completed live
    </li>
    <li className="flex items-center gap-2">
      <span className="h-3.5 w-3.5 shrink-0 rounded border border-white/10 bg-white/[0.04]" />
      Open · awaiting stat update
    </li>
  </ul>
);

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
    <div className="relative rounded-[18px] border-2 border-sky-300/90 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.10),transparent_60%),radial-gradient(circle_at_20%_80%,rgba(0,0,0,0.45),transparent_60%),#0c3a2e] p-3 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4),0_12px_26px_rgba(0,0,0,0.55),0_0_28px_rgba(125,211,252,0.18)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-[14px] border border-[#c89b3a]/55" />
      <div className="relative z-[2] mb-2 grid grid-cols-5 gap-1.5">
        {BINGO_HEADER_LETTERS.map((item) => (
          <div
            key={item.letter}
            className={`text-center text-lg font-black tracking-[0.1em] [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5),0_0_12px_currentColor] ${item.color}`}
          >
            {item.letter}
          </div>
        ))}
      </div>
      <div className="relative z-[2] grid grid-cols-5 gap-1.5">
      {Array.from({ length: 25 }).map((_, index) => {
        const square = byIndex.get(index);
        if (!square) {
          return <div key={index} className="h-10 rounded-md border border-white/[0.06] bg-slate-900/40" />;
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
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-black text-sky-200/90">
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
    <div className="relative rounded-[18px] border-2 border-sky-300/90 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.10),transparent_60%),radial-gradient(circle_at_20%_80%,rgba(0,0,0,0.45),transparent_60%),#0c3a2e] p-3 pb-2 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4),0_12px_26px_rgba(0,0,0,0.55),0_0_28px_rgba(125,211,252,0.18)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-[14px] border border-[#c89b3a]/55" />
      <div className="relative z-[2] mb-2 grid grid-cols-5 gap-1.5 sm:gap-2">
        {BINGO_HEADER_LETTERS.map((item) => (
          <div
            key={item.letter}
            className={`text-center text-xl font-black tracking-[0.1em] [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5),0_0_12px_currentColor] sm:text-2xl ${item.color}`}
          >
            {item.letter}
          </div>
        ))}
      </div>
      <div className="relative z-[2] grid grid-cols-5 gap-1.5 sm:gap-2">
        {Array.from({ length: 25 }).map((_, index) => {
          const square = byIndex.get(index);
          if (!square) {
            return <div key={index} className="min-h-[72px] rounded-lg border border-white/[0.06] bg-slate-900/40 sm:min-h-[82px]" />;
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
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black text-sky-200/90 sm:text-[10px]">
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

type LandscapeBoardMode = "active" | "scored";

function wrapIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

function renderLandscapeGrid(
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
    <div className="tp-bingo-landscape-board relative flex h-full w-full flex-col rounded-[18px] border-2 border-sky-300/90 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.10),transparent_60%),radial-gradient(circle_at_20%_80%,rgba(0,0,0,0.45),transparent_60%),#0c3a2e] p-2 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4),0_12px_26px_rgba(0,0,0,0.55),0_0_28px_rgba(125,211,252,0.18)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-[14px] border border-[#c89b3a]/55" />
      <div className="relative z-[2] mb-1.5 grid grid-cols-5 gap-1.5">
        {BINGO_HEADER_LETTERS.map((item) => (
          <div
            key={item.letter}
            className={`text-center text-lg font-black leading-none tracking-[0.1em] [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5),0_0_12px_currentColor] ${item.color}`}
          >
            {item.letter}
          </div>
        ))}
      </div>
      <div className="relative z-[2] grid min-h-0 flex-1 grid-cols-5 grid-rows-5 gap-1.5">
        {Array.from({ length: 25 }).map((_, index) => {
          const square = byIndex.get(index);
          if (!square) {
            return <div key={index} className="min-h-0 rounded-md border border-white/[0.06] bg-slate-900/40" />;
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
              className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 py-1 text-center text-[10px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] ${getCardSquareStyle(
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
              <span className="relative z-[1] line-clamp-3">{isFree ? "FREE" : shortenLabel(square.label, 16)}</span>
              {progressText ? (
                <span className="absolute bottom-0.5 left-1/2 z-[2] -translate-x-1/2 rounded bg-slate-950/55 px-1 text-[8px] font-black text-sky-200/90">
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

export function SportsBingoHome({
  initialCardId = "",
  onBack,
}: {
  initialDate?: string;
  initialCardId?: string;
  onBack?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { triggerAnimation } = useAnimationTrigger();
  const prevCardsRef = useRef<BingoCard[]>([]);
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
  const [isLandscapeGameView, setIsLandscapeGameView] = useState(false);
  const [landscapeBoardMode, setLandscapeBoardMode] = useState<LandscapeBoardMode>("active");
  const [landscapeActiveBoardIndex, setLandscapeActiveBoardIndex] = useState(0);
  const [landscapeScoredBoardIndex, setLandscapeScoredBoardIndex] = useState(0);
  const [landscapeActiveCardId, setLandscapeActiveCardId] = useState("");
  const [landscapeScoredCardId, setLandscapeScoredCardId] = useState("");
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
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "scored">("active");
  const [selectedActiveBoardId, setSelectedActiveBoardId] = useState("");

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    const targetCardId = initialCardId.trim();
    if (!targetCardId || cards.length === 0) {
      return;
    }
    const targetCard = cards.find((card) => card.id === targetCardId);
    if (!targetCard) {
      return;
    }
    if (targetCard.status === "active") {
      setActiveTab("active");
      setExpandedActiveCardId(targetCard.id);
      setExpandedFinalCardId("");
    } else {
      setActiveTab("scored");
      setExpandedFinalCardId(targetCard.id);
      setExpandedActiveCardId("");
    }
  }, [cards, initialCardId]);

  useEffect(() => {
    const fromBell = sessionStorage.getItem("tp:celebrate") === "bingo";
    const bellDelta = Number(sessionStorage.getItem("tp:celebrate:delta") ?? 0);
    if (fromBell) {
      sessionStorage.removeItem("tp:celebrate");
      sessionStorage.removeItem("tp:celebrate:delta");
      triggerAnimation("BINGO_WIN");
      if (bellDelta > 0) {
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: { delta: bellDelta, coins: Math.min(36, Math.max(12, Math.round(bellDelta / 4))) },
          })
        );
      }
    }
    const uid = getUserId() ?? "";
    if (!uid) return;
    const linkUrl = `${window.location.pathname}${window.location.search}`;
    void fetch("/api/notifications/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, game: "bingo", linkUrl }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { celebrate: boolean; delta: number };
        if (!fromBell && data.celebrate) {
          triggerAnimation("BINGO_WIN");
        }
      })
      .catch(() => {});
  }, [triggerAnimation]);

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
    const mediaQuery = window.matchMedia("(orientation: landscape) and (max-height: 560px)");
    const updateLandscapeMode = () => {
      setIsLandscapeGameView(mediaQuery.matches);
    };

    updateLandscapeMode();
    mediaQuery.addEventListener("change", updateLandscapeMode);
    window.addEventListener("resize", updateLandscapeMode);
    window.addEventListener("orientationchange", updateLandscapeMode);
    return () => {
      mediaQuery.removeEventListener("change", updateLandscapeMode);
      window.removeEventListener("resize", updateLandscapeMode);
      window.removeEventListener("orientationchange", updateLandscapeMode);
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

      for (const card of currentCardsRef.current) {
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
    // currentCardsRef is a stable ref — no dep needed; reads .current inside callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
    const glowSquareTimers = glowSquareTimersRef.current;
    const glowCardTimers = glowCardTimersRef.current;
    const boardPopTimers = boardPopTimersRef.current;

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
      for (const timer of glowSquareTimers.values()) {
        window.clearTimeout(timer);
      }
      glowSquareTimers.clear();
      for (const timer of glowCardTimers.values()) {
        window.clearTimeout(timer);
      }
      glowCardTimers.clear();
      for (const timer of boardPopTimers.values()) {
        window.clearTimeout(timer);
      }
      boardPopTimers.clear();
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
        triggerAnimation("BINGO_SQUARE");
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
    [queueVisualEvents, triggerAnimation]
  );

  const loadCards = useCallback(async ({ background = false, refreshProgress = false }: { background?: boolean; refreshProgress?: boolean } = {}) => {
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

  // Detect card-level transitions (won, near-win) by comparing to previous snapshot.
  useEffect(() => {
    const prev = prevCardsRef.current;
    prevCardsRef.current = cards;

    const prevWonIds = new Set(prev.filter((c) => c.status === "won").map((c) => c.id));
    const newlyWon = cards.some((c) => c.status === "won" && !prevWonIds.has(c.id));
    if (newlyWon) {
      triggerAnimation("BINGO_WIN");
    }

    const prevNearWinIds = new Set(
      prev.filter((c) => summarizeCardState(c).nearWin).map((c) => c.id)
    );
    const newlyNearWin = cards.some(
      (c) => c.status === "active" && summarizeCardState(c).nearWin && !prevNearWinIds.has(c.id)
    );
    if (newlyNearWin) {
      triggerAnimation("BINGO_NEAR_WIN");
    }
  }, [cards, triggerAnimation]);

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

  const subscribedGameIds = useMemo(() => Array.from(new Set(cards.map((card) => card.gameId).filter(Boolean))), [cards]);
  // Stable string key so subscription deps only change when game composition changes.
  const subscribedGameIdsKey = [...subscribedGameIds].sort().join(",");

  // Sport keys for the live stats broadcast subscription.
  const subscribedSportKeys = useMemo(
    () => Array.from(new Set(cards.map((card) => card.sportKey).filter(Boolean))),
    [cards]
  );
  const subscribedSportKeysKey = [...subscribedSportKeys].sort().join(",");

  // Keep gameIdSet current via ref so the live subscription doesn't need to re-run on every card update.
  const liveSubscriptionGameIdsRef = useRef<Set<string>>(new Set(subscribedGameIds));
  useEffect(() => {
    liveSubscriptionGameIdsRef.current = new Set(subscribedGameIds);
  }, [subscribedGameIds]);

  // Keep cards current via ref so live-stats subscription callback reads fresh card state
  // without needing to rebuild the channel on every card update.
  const currentCardsRef = useRef<BingoCard[]>(cards);
  useEffect(() => {
    currentCardsRef.current = cards;
  }, [cards]);

  // Channels 1 & 2 (cards + squares): one broadcast channel per active game.
  // Server broadcasts to bingo-game:{gameId} after resolving squares or settling cards.
  useEffect(() => {
    if (!userId || !supabase || subscribedGameIds.length === 0) {
      return;
    }
    const client = supabase;
    let active = true;
    const gameIds = subscribedGameIdsKey ? subscribedGameIdsKey.split(",") : [];

    const channels = gameIds.map((gameId) =>
      client
        .channel(`bingo-game:${gameId}`)
        .on("broadcast", { event: "card_updated" }, () => {
          if (!active) return;
          setLastRealtimeMessageAt(Date.now());
          void loadCards({ background: true, refreshProgress: false });
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setIsRealtimeFresh(false);
          }
        })
    );

    return () => {
      active = false;
      channels.forEach((ch) => void client.removeChannel(ch));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCards, subscribedGameIdsKey, userId]);

  // Channel 3 (live stats): subscribe to sport-keyed broadcast channels from Phase 3.
  // gameIdSet is kept current via ref so we don't re-subscribe on every card state update.
  useEffect(() => {
    if (!supabase || subscribedSportKeys.length === 0) {
      return;
    }
    const client = supabase;
    let active = true;

    const channels = subscribedSportKeys.map((sportKey) =>
      client
        .channel(`live-stats:${sportKey}`)
        .on("broadcast", { event: "stat_update" }, (payload) => {
          if (!active) return;
          const next = (payload.payload ?? null) as LivePlayerStatRealtimeRow | null;
          if (!next) return;
          const gameId = String(next.game_id ?? "").trim();
          if (!liveSubscriptionGameIdsRef.current.has(gameId)) return;
          const playerId = Number(next.player_id ?? 0);
          if (!Number.isFinite(playerId) || playerId <= 0) return;

          const mapKey = `${gameId}:${playerId}`;
          const previous = liveStatsPrevByPlayerRef.current.get(mapKey);
          liveStatsPrevByPlayerRef.current.set(mapKey, next);
          if (!previous) return;

          const baseEvents = classifyLiveDeltaEvent(previous, next);
          if (baseEvents.length === 0) return;

          const events: VisualEngagementEvent[] = [];
          for (const base of baseEvents) {
            const relevance = findRelevantSquareForEvent(next.player_name, base.text);
            events.push({
              ...base,
              squareKey: relevance.squareKey,
              cardId: relevance.cardId ?? currentCardsRef.current[0]?.id,
            });
          }
          queueVisualEvents(events);
        })
        .subscribe()
    );

    return () => {
      active = false;
      liveStatsPrevByPlayerRef.current.clear();
      channels.forEach((ch) => void client.removeChannel(ch));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueVisualEvents, subscribedSportKeysKey]);

  const onSwipeTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartXRef.current = touch?.clientX ?? null;
    touchStartYRef.current = touch?.clientY ?? null;
  }, []);

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
  const selectedActiveCard = useMemo(
    () => activeCards.find((card) => card.id === selectedActiveBoardId) ?? activeCards[0] ?? null,
    [activeCards, selectedActiveBoardId]
  );
  // Keep the selected active board valid as the active list changes; default to the first.
  useEffect(() => {
    if (activeCards.length === 0) {
      if (selectedActiveBoardId) {
        setSelectedActiveBoardId("");
      }
      return;
    }
    if (!activeCards.some((card) => card.id === selectedActiveBoardId)) {
      setSelectedActiveBoardId(activeCards[0].id);
    }
  }, [activeCards, selectedActiveBoardId]);
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
  const landscapeScoredCards = useMemo(() => settledCards.slice(0, 8), [settledCards]);
  const selectedLandscapeActiveIndex = activeCards.findIndex((card) => card.id === landscapeActiveCardId);
  const selectedLandscapeScoredIndex = landscapeScoredCards.findIndex((card) => card.id === landscapeScoredCardId);
  const normalizedLandscapeActiveIndex =
    selectedLandscapeActiveIndex >= 0 ? selectedLandscapeActiveIndex : wrapIndex(landscapeActiveBoardIndex, activeCards.length);
  const normalizedLandscapeScoredIndex =
    selectedLandscapeScoredIndex >= 0
      ? selectedLandscapeScoredIndex
      : wrapIndex(landscapeScoredBoardIndex, landscapeScoredCards.length);
  const landscapeCards = landscapeBoardMode === "active" ? activeCards : landscapeScoredCards;
  const landscapeCurrentIndex =
    landscapeBoardMode === "active" ? normalizedLandscapeActiveIndex : normalizedLandscapeScoredIndex;
  const landscapeCurrentCard = landscapeCards[landscapeCurrentIndex] ?? null;
  const landscapeProgress = landscapeCurrentCard ? getBoardProgress(landscapeCurrentCard.squares) : null;

  useEffect(() => {
    const nextIndex = wrapIndex(normalizedLandscapeActiveIndex, activeCards.length);
    setLandscapeActiveBoardIndex(nextIndex);
    setLandscapeActiveCardId(activeCards[nextIndex]?.id ?? "");
  }, [activeCards, normalizedLandscapeActiveIndex]);

  useEffect(() => {
    const nextIndex = wrapIndex(normalizedLandscapeScoredIndex, landscapeScoredCards.length);
    setLandscapeScoredBoardIndex(nextIndex);
    setLandscapeScoredCardId(landscapeScoredCards[nextIndex]?.id ?? "");
  }, [landscapeScoredCards, normalizedLandscapeScoredIndex]);

  useEffect(() => {
    if (!isLandscapeGameView) {
      return;
    }
    setExpandedActiveCardId("");
    setExpandedFinalCardId("");
  }, [isLandscapeGameView]);

  useEffect(() => {
    document.documentElement.classList.toggle("tp-bingo-landscape-active", isLandscapeGameView);
    document.body.classList.toggle("tp-bingo-landscape-active", isLandscapeGameView);
    return () => {
      document.documentElement.classList.remove("tp-bingo-landscape-active");
      document.body.classList.remove("tp-bingo-landscape-active");
    };
  }, [isLandscapeGameView]);

  const selectLandscapeBoardAt = useCallback(
    (mode: LandscapeBoardMode, index: number) => {
      if (mode === "active") {
        const nextIndex = wrapIndex(index, activeCards.length);
        setLandscapeBoardMode("active");
        setLandscapeActiveBoardIndex(nextIndex);
        setLandscapeActiveCardId(activeCards[nextIndex]?.id ?? "");
        return;
      }

      const nextIndex = wrapIndex(index, landscapeScoredCards.length);
      setLandscapeBoardMode("scored");
      setLandscapeScoredBoardIndex(nextIndex);
      setLandscapeScoredCardId(landscapeScoredCards[nextIndex]?.id ?? "");
    },
    [activeCards, landscapeScoredCards]
  );

  const selectLandscapeCard = useCallback(
    (mode: LandscapeBoardMode, cardId: string) => {
      const sourceCards = mode === "active" ? activeCards : landscapeScoredCards;
      const nextIndex = sourceCards.findIndex((card) => card.id === cardId);
      selectLandscapeBoardAt(mode, nextIndex >= 0 ? nextIndex : 0);
    },
    [activeCards, landscapeScoredCards, selectLandscapeBoardAt]
  );

  const goToLandscapeBoard = useCallback(
    (delta: number) => {
      if (landscapeBoardMode === "active") {
        selectLandscapeBoardAt("active", landscapeCurrentIndex + delta);
        return;
      }
      selectLandscapeBoardAt("scored", landscapeCurrentIndex + delta);
    },
    [landscapeBoardMode, landscapeCurrentIndex, selectLandscapeBoardAt]
  );

  const onLandscapeTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const startX = touchStartXRef.current;
      const startY = touchStartYRef.current;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      if (startX === null || startY === null || landscapeCards.length <= 1) {
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 0.75) {
        return;
      }
      goToLandscapeBoard(dx < 0 ? 1 : -1);
    },
    [goToLandscapeBoard, landscapeCards.length]
  );

  useEffect(() => {
    if (!isLandscapeGameView) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (landscapeCards.length <= 1) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToLandscapeBoard(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToLandscapeBoard(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goToLandscapeBoard, isLandscapeGameView, landscapeCards.length]);

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

  const actionPopsPortal =
    typeof document !== "undefined"
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
      : null;
  const limitFeedbackPortal =
    typeof document !== "undefined" && (limitPopAnim || limitEchoAnim)
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
      : null;

  if (isLandscapeGameView) {
    const isActiveLandscapeMode = landscapeBoardMode === "active";
    const hasLandscapeCards = landscapeCards.length > 0;
    const currentBoardNumber = hasLandscapeCards ? landscapeCurrentIndex + 1 : 0;
    const currentBoardTotal = landscapeCards.length;
    const currentCardIsLive = landscapeCurrentCard ? Date.parse(landscapeCurrentCard.startsAt) <= Date.now() : false;
    const canCollectCurrentCard =
      landscapeCurrentCard?.status === "won" &&
      !landscapeCurrentCard.rewardClaimedAt &&
      landscapeCurrentCard.rewardPoints > 0;

    const landscapeContent = (
      <div
        ref={rootRef}
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onLandscapeTouchEnd}
        className={`tp-bingo-theme tp-bingo-landscape-shell fixed inset-0 z-[1300] flex h-[100svh] w-screen overflow-hidden bg-[#020617] text-slate-100 ${
          isScreenShaking ? "tp-bingo-screen-shake" : ""
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.15),transparent_24%),radial-gradient(circle_at_70%_100%,rgba(249,115,22,0.12),transparent_30%),linear-gradient(180deg,#020617_0%,#07111f_100%)]" />
        <main className="tp-bingo-landscape-main relative z-[1] grid h-full w-full grid-rows-[auto_minmax(0,1fr)] gap-2 px-[max(env(safe-area-inset-left),0.6rem)] py-[max(env(safe-area-inset-top),0.35rem)] pr-[max(env(safe-area-inset-right),0.6rem)]">
          <header className="tp-bingo-landscape-header flex min-h-0 items-center justify-between rounded-[14px] border border-sky-300/55 bg-slate-950/82 px-3 py-1.5 shadow-[0_0_24px_rgba(125,211,252,0.16)]">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase leading-none tracking-[0.16em] text-sky-300">
                Sports Bingo · {isActiveLandscapeMode ? `Board ${currentBoardNumber || 0} of ${currentBoardTotal}` : `Scored ${currentBoardNumber || 0} of ${currentBoardTotal}`}
              </p>
              <h1 className="mt-1 truncate text-[18px] font-black leading-none text-slate-50 [font-family:'Bree_Serif','Nunito',serif]">
                {landscapeCurrentCard?.gameLabel ?? (isActiveLandscapeMode ? "No active boards" : "No scored boards")}
              </h1>
            </div>
            <div className="tp-bingo-landscape-controls flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => selectLandscapeBoardAt("active", normalizedLandscapeActiveIndex)}
                className={`tp-clean-button tp-bingo-landscape-tab inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                  isActiveLandscapeMode
                    ? "border-sky-300/70 bg-sky-300/15 text-sky-200"
                    : "border-white/10 bg-white/[0.04] text-slate-300"
                }`}
              >
                <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="tp-bingo-landscape-control-label">Active</span>
              </button>
              <button
                type="button"
                onClick={() => selectLandscapeBoardAt("scored", normalizedLandscapeScoredIndex)}
                className={`tp-clean-button tp-bingo-landscape-tab inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                  !isActiveLandscapeMode
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300"
                }`}
              >
                <Trophy aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="tp-bingo-landscape-control-label">Scored</span>
              </button>
              {landscapeCurrentCard ? (
                <span className="tp-bingo-landscape-status inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-300/45 bg-sky-300/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-sky-200">
                  <span className={`h-1.5 w-1.5 rounded-full ${currentCardIsLive && isActiveLandscapeMode ? "animate-pulse bg-sky-300" : "bg-slate-400"}`} />
                  {isActiveLandscapeMode ? (currentCardIsLive ? "Live" : "Upcoming") : landscapeCurrentCard.status}
                </span>
              ) : null}
            </div>
          </header>

          <section className="tp-bingo-landscape-content grid min-h-0 grid-cols-[2.7rem_minmax(0,1fr)_minmax(13rem,17rem)_2.7rem] items-center gap-2">
            <button
              type="button"
              onClick={() => goToLandscapeBoard(-1)}
              disabled={landscapeCards.length <= 1}
              className="tp-clean-button tp-bingo-landscape-arrow flex h-12 w-12 items-center justify-center rounded-full border border-sky-300/50 bg-slate-950/82 text-sky-200 shadow-[0_0_18px_rgba(125,211,252,0.16)] transition active:scale-95 disabled:opacity-30"
              aria-label="Previous Bingo board"
            >
              <ChevronLeft aria-hidden="true" className="h-7 w-7" />
            </button>

            <div className="flex h-full min-h-0 items-center justify-center">
              {landscapeCurrentCard ? (
                <div className="tp-bingo-landscape-board-stage aspect-square h-full max-h-[calc(100svh-5.7rem)] w-full max-w-[calc(100vw-21rem)]">
                  {renderLandscapeGrid(
                    landscapeCurrentCard.id,
                    landscapeCurrentCard.squares,
                    recentlyUpdatedSquareKeys,
                    recentlySucceededSquareKeys,
                    glowSquareKeys
                  )}
                </div>
              ) : (
                <div className="tp-bingo-landscape-empty flex h-full w-full items-center justify-center rounded-[18px] border border-sky-300/45 bg-slate-950/82 px-5 text-center shadow-[0_0_24px_rgba(125,211,252,0.12)]">
                  <div className="max-w-[24rem]">
                    <p className="text-[12px] font-black uppercase tracking-[0.16em] text-sky-300">
                      {isActiveLandscapeMode ? "No active boards" : "No scored boards"}
                    </p>
                    <p className="mt-2 text-[22px] font-black leading-tight text-slate-50 [font-family:'Bree_Serif','Nunito',serif]">
                      {isActiveLandscapeMode ? "Create a board to play live." : "Scored boards will appear after games finish."}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Link
                        href="/bingo/select-sport"
                        className="tp-clean-button inline-flex h-10 items-center gap-2 rounded-full border border-sky-300/55 bg-sky-300/14 px-4 text-[12px] font-black text-sky-100"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        Create Board
                      </Link>
                      {isActiveLandscapeMode ? (
                        <button
                          type="button"
                          onClick={() => selectLandscapeBoardAt("scored", normalizedLandscapeScoredIndex)}
                          className="tp-clean-button inline-flex h-10 items-center gap-2 rounded-full border border-amber-300/45 bg-amber-300/12 px-4 text-[12px] font-black text-amber-100 disabled:opacity-40"
                          disabled={landscapeScoredCards.length === 0}
                        >
                          <Trophy aria-hidden="true" className="h-4 w-4" />
                          Scored Boards
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="tp-bingo-landscape-aside grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
              <div className="tp-bingo-landscape-panel min-h-0 rounded-[18px] border border-sky-300/35 bg-slate-950/82 p-3 shadow-[0_0_22px_rgba(125,211,252,0.1)]">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">Board Progress</p>
                {landscapeCurrentCard && landscapeProgress ? (
                  <div className="tp-bingo-landscape-progress mt-3 space-y-3">
                    <BingoProgressRing squares={landscapeCurrentCard.squares} />
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300"
                        style={{ width: `${landscapeProgress.pctFilled}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-bold leading-snug text-slate-300">
                      {landscapeProgress.toBingo === null
                        ? "Every line is blocked."
                        : landscapeProgress.toBingo === 0
                        ? "Bingo complete."
                        : `${landscapeProgress.toBingo} squares from bingo.`}
                    </p>
                    {canCollectCurrentCard ? (
                      <button
                        type="button"
                        onClick={(event) => void claimPoints(landscapeCurrentCard, event.currentTarget)}
                        className="tp-clean-button flex h-10 w-full items-center justify-center rounded-[10px] bg-amber-400 px-3 text-[12px] font-black uppercase text-slate-950"
                      >
                        Collect {landscapeCurrentCard.rewardPoints} Points
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] font-bold leading-snug text-slate-300">
                    Active boards show live progress here once you create one.
                  </p>
                )}
              </div>
              <div className="tp-bingo-landscape-panel tp-bingo-landscape-legend rounded-[18px] border border-sky-300/35 bg-slate-950/82 p-3 shadow-[0_0_22px_rgba(125,211,252,0.1)]">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">Legend</p>
                <BingoLegend />
              </div>
            </aside>

            <button
              type="button"
              onClick={() => goToLandscapeBoard(1)}
              disabled={landscapeCards.length <= 1}
              className="tp-clean-button tp-bingo-landscape-arrow flex h-12 w-12 items-center justify-center rounded-full border border-sky-300/50 bg-slate-950/82 text-sky-200 shadow-[0_0_18px_rgba(125,211,252,0.16)] transition active:scale-95 disabled:opacity-30"
              aria-label="Next Bingo board"
            >
              <ChevronRight aria-hidden="true" className="h-7 w-7" />
            </button>
          </section>
        </main>
        {actionPopsPortal}
        {limitFeedbackPortal}
      </div>
    );

    return typeof document !== "undefined"
      ? createPortal(landscapeContent, document.body)
      : landscapeContent;
  }

  const isFirstRun = !loadingCards && activeCards.length === 0 && settledCards.length === 0;
  const selectedBoardProgress = selectedActiveCard ? getBoardProgress(selectedActiveCard.squares) : null;
  const selectedBoardIsLive = selectedActiveCard ? Date.parse(selectedActiveCard.startsAt) <= Date.now() : false;
  const scoredWonCount = settledCards.filter((card) => card.status === "won").length;
  const scoredPointsWon = settledCards.reduce(
    (sum, card) => (card.status === "won" ? sum + card.rewardPoints : sum),
    0
  );

  return (
    <div ref={rootRef} className={`tp-bingo-theme ${isScreenShaking ? "tp-bingo-screen-shake" : ""}`}>
      <SlimTopBar game="bingo" onExit={onBack} />

      <div className="mx-auto w-full max-w-[30rem] px-3 pb-6">
        {errorMessage ? (
          <div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/80 p-3 text-sm text-rose-300">{errorMessage}</div>
        ) : null}

        {loadingCards && cards.length === 0 ? (
          <div className="pt-8">
            <LoadingState label="Loading your boards..." />
          </div>
        ) : isFirstRun ? (
          /* ════════ FIRST RUN — no boards yet ════════ */
          <>
            <div className="pt-4">
              <div className="relative overflow-hidden rounded-[18px] border-2 border-sky-300 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.12),transparent_60%),#0c3a2e] p-4 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35),0_12px_26px_rgba(0,0,0,0.5)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-300">Sports Bingo · live right now</p>
                <p className="mt-1.5 text-[26px] leading-[1.08] text-amber-100 [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">
                  Your squares fill themselves.
                </p>
                <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-amber-100/60">
                  We turn tonight&apos;s games into a 5×5 board of player props and box-score calls. Plays happen, squares
                  light up automatically. Five in a row wins the venue prize.
                </p>
                <div className="mt-3.5 grid grid-cols-5 gap-1 opacity-90">
                  {Array.from({ length: 25 }).map((_, i) => {
                    const hit = [2, 6, 8, 16, 20].includes(i);
                    const free = i === 12;
                    return (
                      <div
                        key={i}
                        className={`aspect-square rounded ${
                          free
                            ? "border border-amber-200 bg-[linear-gradient(135deg,#c89b3a,#f59e0b)]"
                            : hit
                            ? "border border-amber-200 bg-[linear-gradient(135deg,#f97316,#fbbf24)]"
                            : "border border-[#fff7ea]/20 bg-[#fff7ea]/[0.16]"
                        }`}
                      />
                    );
                  })}
                </div>
                <Link
                  href="/bingo/select-sport"
                  className="tp-clean-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[13px] bg-sky-300 px-4 py-3.5 text-[14.5px] font-black uppercase tracking-[0.03em] text-[#08233a] shadow-[0_0_0_1px_rgba(125,211,252,0.4),0_10px_26px_rgba(125,211,252,0.28)] transition-transform active:scale-95"
                >
                  Get your first board
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <p className="mt-2.5 text-center text-[10px] font-black tracking-[0.04em] text-sky-300">
                  Free to play · no entry needed
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {[
                { n: "1", t: "Pick a game", d: "From tonight's slate" },
                { n: "2", t: "We build it", d: "25 live squares" },
                { n: "3", t: "Match 5", d: "Row, column or diagonal" },
              ].map((step) => (
                <div key={step.n} className="flex-1 rounded-xl border border-white/[0.07] bg-slate-900 p-2.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-[7px] border border-sky-300/40 bg-sky-300/[0.14] text-[10px] font-black text-sky-300 [font-family:ui-monospace,monospace]">
                    {step.n}
                  </span>
                  <div className="mt-1.5 text-[11.5px] font-black text-slate-50">{step.t}</div>
                  <div className="mt-0.5 text-[9.5px] font-bold leading-tight text-slate-400">{step.d}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[10px] border border-sky-300/25 bg-sky-300/[0.06] px-3 py-2.5 text-[10px] font-bold leading-snug text-sky-300">
              Hold up to 4 boards at once across tonight&apos;s games. Squares auto-mark as plays happen — you just watch them
              fill.
            </div>

            <div className="pt-3">
              <FoldLine />
            </div>
            <div className="pt-2.5">
              <InlineSlotAdClient
                slot="inline-content"
                venueId={venueId}
                pageKey="sports-bingo"
                adType="inline"
                displayTrigger="on-load"
                placementKey="bingo-home-firstrun-inline"
              />
            </div>
          </>
        ) : (
          /* ════════ ACTIVE / SCORED ════════ */
          <>
            {unclaimedWonBingoCards.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-[linear-gradient(180deg,rgba(251,191,36,0.10),#0f172a)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-300">🎉 Points ready</p>
                  <p className="mt-0.5 text-[12px] font-bold text-slate-200">
                    {unclaimedWonBingoCards.length} winning board{unclaimedWonBingoCards.length !== 1 ? "s" : ""} · +
                    {totalUnclaimedBingoPoints} pts
                  </p>
                </div>
                <button
                  type="button"
                  data-bingo-collect-all
                  onClick={() => void collectAllBingoPoints()}
                  disabled={isCollectingAllBingo}
                  className="tp-clean-button inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-500/[0.16] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.04em] text-emerald-300 disabled:opacity-60"
                >
                  {isCollectingAllBingo ? "Collecting…" : `Collect +${totalUnclaimedBingoPoints}`}
                </button>
              </div>
            ) : null}

            <div className="pt-3">
              <ViewTabs
                game="bingo"
                active={activeTab}
                onPick={(id) => setActiveTab(id === "scored" ? "scored" : "active")}
                tabs={[
                  { id: "active", label: "Active", count: activeCards.length, live: activeCards.length > 0 },
                  { id: "scored", label: "Scored", count: settledCards.length },
                ]}
              />
            </div>

            {activeTab === "active" ? (
              activeCards.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-sky-300/25 bg-slate-900 p-5 text-center">
                  <p className="text-[13px] font-bold text-slate-300">No active boards right now.</p>
                  <Link
                    href="/bingo/select-sport"
                    className="tp-clean-button mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-sky-300 px-5 py-2.5 text-[12.5px] font-black uppercase tracking-[0.03em] text-[#08233a]"
                  >
                    Get a board <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <>
                  {/* Up-to-4 active board switcher */}
                  <div className="mt-3 flex items-stretch gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {activeCards.map((card) => {
                      const on = selectedActiveCard?.id === card.id;
                      const live = Date.parse(card.startsAt) <= Date.now();
                      const remaining = getClosestLineRemaining(card.squares);
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setSelectedActiveBoardId(card.id);
                            selectLandscapeCard("active", card.id);
                          }}
                          className={`tp-clean-button flex shrink-0 flex-col items-start gap-0.5 rounded-[11px] px-2.5 py-1.5 ${
                            on ? "border border-sky-300/55 bg-sky-300/[0.12]" : "border border-white/[0.08] bg-white/[0.025]"
                          } ${recentlyAddedCardIds.has(card.id) ? "bingo-board-pop" : ""}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                card.status === "won" ? "bg-amber-400" : live ? "animate-pulse bg-emerald-400" : "bg-slate-500"
                              }`}
                            />
                            <span className={`text-[11px] font-black tracking-[0.02em] ${on ? "text-sky-300" : "text-slate-300"}`}>
                              {card.gameLabel}
                            </span>
                          </span>
                          <span
                            className={`text-[9px] font-bold [font-family:ui-monospace,monospace] ${
                              on ? "text-sky-300" : "text-slate-500"
                            }`}
                          >
                            {remaining === null ? "blocked" : remaining === 0 ? "bingo!" : `${remaining} to go`}
                          </span>
                        </button>
                      );
                    })}
                    {hasReachedBoardLimit ? (
                      <button
                        type="button"
                        onClick={triggerLimitReachedFeedback}
                        className={`tp-clean-button flex min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[11px] border border-dashed border-sky-300/40 bg-sky-300/[0.06] px-2 text-sky-300 ${
                          limitPulse ? "pickem-limit-pulse" : ""
                        }`}
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        <span className="text-[7.5px] font-black uppercase tracking-[0.08em]">
                          {showBoardLimitMessage ? "Max 4" : "Add"}
                        </span>
                      </button>
                    ) : (
                      <Link
                        href="/bingo/select-sport"
                        className="tp-clean-button flex min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[11px] border border-dashed border-sky-300/40 bg-sky-300/[0.06] px-2 text-sky-300"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        <span className="text-[7.5px] font-black uppercase tracking-[0.08em]">Add</span>
                      </Link>
                    )}
                  </div>

                  {selectedActiveCard ? (
                    <>
                      {/* Live + freshness status for the selected board */}
                      <div className="mt-2.5 flex items-center gap-2">
                        {selectedBoardIsLive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/[0.14] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300">
                            <LiveDot />
                            Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-300/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-300">
                            Starts {formatLocalDateTime(selectedActiveCard.startsAt)}
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-300/10 px-2.5 py-1 text-[9.5px] font-bold text-sky-300 [font-family:ui-monospace,monospace]">
                          {selectedBoardProgress?.hitCount ?? 0}/25 marked
                        </span>
                        <span className="ml-auto text-[9px] font-bold tracking-[0.04em] text-slate-500">
                          {isRealtimeFresh ? "live updates" : "synced"}
                        </span>
                      </div>

                      {/* PRIMARY ZONE — the selected board */}
                      <div
                        data-bingo-card-id={selectedActiveCard.id}
                        onClick={() => {
                          selectLandscapeCard("active", selectedActiveCard.id);
                          setExpandedActiveCardId(selectedActiveCard.id);
                        }}
                        className={`relative mt-2.5 cursor-pointer ${
                          recentlyAddedCardIds.has(selectedActiveCard.id) ? "bingo-board-pop" : ""
                        }`}
                      >
                        <span
                          className={`pointer-events-none absolute inset-0 z-[3] rounded-[18px] bg-cyan-300/20 transition duration-200 [will-change:transform,opacity] ${
                            glowCardIds.has(selectedActiveCard.id) ? "scale-105 opacity-100" : "scale-95 opacity-0"
                          }`}
                        />
                        {renderCompactGrid(
                          selectedActiveCard.id,
                          selectedActiveCard.squares,
                          recentlyUpdatedSquareKeys,
                          recentlySucceededSquareKeys,
                          glowSquareKeys
                        )}
                      </div>

                      {/* Closest line + expand */}
                      <div className="mt-2.5 flex items-stretch gap-2">
                        <div className="flex-1 rounded-xl border border-sky-300/35 bg-slate-900 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-300">Closest line</p>
                          <p className="mt-0.5 text-[13px] font-black text-amber-400 [font-family:ui-monospace,monospace]">
                            {selectedBoardProgress?.toBingo === null
                              ? "Every line blocked"
                              : selectedBoardProgress?.toBingo === 0
                              ? "Bingo!"
                              : `${selectedBoardProgress?.toBingo} to go`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectLandscapeCard("active", selectedActiveCard.id);
                            setExpandedActiveCardId(selectedActiveCard.id);
                          }}
                          className="tp-clean-button inline-flex shrink-0 items-center rounded-xl border border-sky-300/45 bg-sky-300/10 px-4 text-[11px] font-black uppercase tracking-[0.04em] text-sky-300"
                        >
                          Expand
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )
            ) : settledCards.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-sky-300/20 bg-slate-900 p-5 text-center text-[13px] font-bold text-slate-300">
                No scored boards yet.
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="mt-3 flex gap-2">
                  <div className="flex-1 rounded-xl border border-white/[0.08] bg-slate-900 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">Boards won</p>
                    <p className="mt-0.5 text-[16px] font-black text-slate-50 [font-family:ui-monospace,monospace]">
                      {scoredWonCount} / {settledCards.length}
                    </p>
                  </div>
                  <div className="flex-1 rounded-xl border border-white/[0.08] bg-slate-900 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Points won</p>
                    <p className="mt-0.5 text-[16px] font-black text-amber-400 [font-family:ui-monospace,monospace]">
                      {scoredPointsWon}
                    </p>
                  </div>
                </div>

                <div className="mb-1.5 mt-3 flex items-baseline justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">All boards</p>
                  <span className="text-[9.5px] font-bold tracking-[0.04em] text-slate-500">
                    Recent · {settledCards.length} board{settledCards.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Flat list — every recent board, newest first, no week grouping */}
                <ul className="flex flex-col gap-1.5">
                  {settledCards.slice(0, 12).map((card) => {
                    const summary = summarizeCardState(card);
                    const won = card.status === "won";
                    const showClaim = won && !card.rewardClaimedAt;
                    return (
                      <li
                        key={card.id}
                        data-bingo-card-id={card.id}
                        onClick={
                          showClaim
                            ? (event) => {
                                selectLandscapeCard("scored", card.id);
                                void claimPoints(card, event.currentTarget);
                              }
                            : () => {
                                selectLandscapeCard("scored", card.id);
                                setExpandedFinalCardId(card.id);
                              }
                        }
                        className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                          won
                            ? "border border-emerald-400/40 bg-[linear-gradient(180deg,rgba(16,185,129,0.10),#0f172a)]"
                            : "border border-white/[0.07] bg-slate-900"
                        } ${showClaim ? "animate-pulse ring-2 ring-amber-300/40" : ""}`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-black ${
                            won
                              ? "border border-emerald-300/45 bg-emerald-500/[0.16] text-emerald-300"
                              : "border border-white/[0.08] bg-white/[0.04] text-slate-500"
                          }`}
                        >
                          {won ? "✓" : "—"}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-black text-slate-50">{card.gameLabel}</div>
                          <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                            {formatLocalDateTime(card.startsAt)} · {summary.hitCount}/25 hits
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className={`text-[15px] font-black [font-family:ui-monospace,monospace] ${
                              won ? "text-emerald-300" : "text-slate-600"
                            }`}
                          >
                            {won ? `+${card.rewardPoints}` : "0"}
                          </div>
                          <div
                            className={`mt-0.5 text-[8.5px] font-black uppercase tracking-[0.06em] ${
                              showClaim ? "text-amber-300" : won ? "text-slate-500" : "text-slate-600"
                            }`}
                          >
                            {showClaim ? "Tap to claim" : won && card.rewardClaimedAt ? "Claimed" : won ? "Won" : card.status}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="pt-3">
              <FoldLine />
            </div>
            <div className="pt-2.5">
              <InlineSlotAdClient
                slot="inline-content"
                venueId={venueId}
                pageKey="sports-bingo"
                adType="inline"
                displayTrigger="on-load"
                placementKey={activeTab === "active" ? "bingo-home-active-inline" : "bingo-home-final-inline"}
              />
            </div>
          </>
        )}
      </div>

      {/* Expanded active board modal — landscape becomes the enhanced two-pane view */}
      {expandedActiveCard ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4">
          <button
            type="button"
            aria-label="Close active board view"
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setExpandedActiveCardId("")}
          />
          <div className="relative max-h-[92vh] w-full max-w-[1000px] overflow-y-auto rounded-2xl border border-sky-300/45 bg-slate-950 p-3 shadow-2xl shadow-black/60">
            <div className="sticky top-0 z-10 mb-3 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Sports Bingo · Live Board</p>
                <p className="truncate text-sm font-black text-slate-100 [font-family:'Bree_Serif','Nunito',serif]">
                  {expandedActiveCard.gameLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedActiveCardId("")}
                className="tp-clean-button inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-200 shadow-sm"
              >
                <span aria-hidden="true">✕</span>
                <span>Close</span>
              </button>
            </div>
            <div className="grid gap-3 landscape:grid-cols-[1.5fr_1fr] landscape:items-start">
              <div>
                {renderExpandedGrid(expandedActiveCard.id, expandedActiveCard.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
              </div>
              <aside className="space-y-3">
                <div className="rounded-2xl border border-sky-300/30 bg-slate-900 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Board progress</p>
                  <BingoProgressRing squares={expandedActiveCard.squares} />
                </div>
                <div className="rounded-2xl border border-sky-300/30 bg-slate-900 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Legend</p>
                  <BingoLegend />
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-[11px] font-semibold leading-relaxed text-slate-300">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">How to win</p>
                  Squares auto-mark as plays happen. Complete five in a row — line, column, or diagonal — to win points.
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {/* Expanded final board modal */}
      {expandedFinalCard ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close final board view"
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setExpandedFinalCardId("")}
          />
          <div className="relative max-h-[92vh] w-full max-w-[1000px] overflow-y-auto rounded-2xl border border-sky-300/35 bg-slate-950 p-3 shadow-2xl shadow-black/60">
            <div className="sticky top-0 z-10 mb-3 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Sports Bingo · Final Board</p>
                <p className="truncate text-sm font-black text-slate-100 [font-family:'Bree_Serif','Nunito',serif]">
                  {expandedFinalCard.gameLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedFinalCardId("")}
                className="tp-clean-button inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-200 shadow-sm"
              >
                <span aria-hidden="true">✕</span>
                <span>Close</span>
              </button>
            </div>
            <div className="grid gap-3 landscape:grid-cols-[1.5fr_1fr] landscape:items-start">
              <div>
                {renderExpandedGrid(expandedFinalCard.id, expandedFinalCard.squares, recentlyUpdatedSquareKeys, recentlySucceededSquareKeys, glowSquareKeys)}
              </div>
              <aside className="space-y-3">
                <div className="rounded-2xl border border-sky-300/25 bg-slate-900 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Final progress</p>
                  <BingoProgressRing squares={expandedFinalCard.squares} />
                  <p className="mt-3 text-[11px] font-semibold text-slate-400">
                    {expandedFinalCard.status === "won"
                      ? `Winning board · +${expandedFinalCard.rewardPoints} pts`
                      : "No bingo this game — better luck next board."}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-300/25 bg-slate-900 p-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">Legend</p>
                  <BingoLegend />
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {actionPopsPortal}
      {limitFeedbackPortal}
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
