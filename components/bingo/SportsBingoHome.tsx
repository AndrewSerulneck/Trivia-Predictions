"use client";

import { haptic } from "@/lib/haptics";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Download, ListChecks, Maximize2, Minimize2, Plus, Share, Trophy, X } from "lucide-react";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import type { CSSProperties, TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { isInstallPromptEnabled, isIOSSafari, useIsRunningAsInstalledPwa, usePwaInstallPrompt } from "@/lib/pwa";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { consumeBingoPrefetchCache } from "@/lib/bingoPrefetchCache";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { ActionPop, type ActionPopTone } from "@/components/bingo/ActionPop";
import {
  classifyLiveDeltaEvent,
  isRegressedNflLiveStatRow,
  type LivePlayerStatRealtimeRow,
} from "@/lib/sportsBingoLiveEvents";
import { BingoBoardCard } from "@/components/bingo/BingoBoardCard";
import { CreateBoardSheet } from "@/components/bingo/CreateBoardSheet";
import { getLeagueDisplay, toMascotMatchup } from "@/lib/sportsBingoLeagues";
import {
  BINGO_GAME_BUFFER_MS,
  BINGO_HEADER_LETTERS,
  LANDSCAPE_SQUARE_LABEL_MAX_LENGTH,
  getBoardProgress,
  getCardSquareStyle,
  mergeLiveCardUpdates,
  renderSquareStatusGlyph,
  resolveHistoryStackEntry,
  shortenLabel,
  summarizeCardState,
  toCardSquareKey,
  type BingoCard,
  type BingoCardSquare,
} from "@/components/bingo/bingoBoardShared";
// `LiveDot` moved to `BingoBoardCard` with the status row in Phase 2; `ViewTabs` was retired in
// Phase 5d — the date rail plus each board's own result state carries what the tabs carried.
import { DateCalendarPopover, toLocalDateKey, todayDateKey } from "@/components/ui/DateCalendarPopover";
import { GameAppBar } from "@/components/venue/AppBar";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";

type CardsResponse = {
  ok: boolean;
  cards?: BingoCard[];
  /** Local `YYYY-MM-DD` days on which the player holds at least one board (plan 5a). */
  activeDates?: string[];
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

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const FINAL_SCORES_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_LANDSCAPE_VIEWPORT_STYLE = {
  "--bingo-landscape-vw": "100vw",
  "--bingo-landscape-vh": "100svh",
  "--bingo-landscape-left": "0px",
  "--bingo-landscape-top": "0px",
} as CSSProperties;
const FULLSCREEN_HINT_STORAGE_KEY = "hightop-bingo-fullscreen-hint-seen";
const INSTALL_COACH_CARD_STORAGE_KEY = "hightop-bingo-install-coach-seen";

function getFullscreenElement(): Element | null {
  const fullscreenDocument = document as FullscreenCapableDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

function isFullscreenAvailable(element: HTMLElement = document.documentElement): boolean {
  const fullscreenDocument = document as FullscreenCapableDocument;
  const fullscreenElement = element as FullscreenCapableElement;
  return Boolean(
    document.fullscreenEnabled ||
      fullscreenDocument.webkitFullscreenEnabled ||
      fullscreenElement.requestFullscreen ||
      fullscreenElement.webkitRequestFullscreen
  );
}

async function requestElementFullscreen(element: HTMLElement): Promise<void> {
  const fullscreenElement = element as FullscreenCapableElement;
  if (fullscreenElement.requestFullscreen) {
    await fullscreenElement.requestFullscreen();
    return;
  }
  if (fullscreenElement.webkitRequestFullscreen) {
    await fullscreenElement.webkitRequestFullscreen();
  }
}

async function exitDocumentFullscreen(): Promise<void> {
  const fullscreenDocument = document as FullscreenCapableDocument;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (fullscreenDocument.webkitExitFullscreen) {
    await fullscreenDocument.webkitExitFullscreen();
  }
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

// Local-calendar-day comparison for the portrait stack. `toLocalDateKey` / `todayDateKey` are
// the same helpers the date calendar uses, so the client's day filter and the API's
// `date=YYYY-MM-DD` window are guaranteed to agree on where a day starts.
function isCardOnLocalDay(iso: string, dayKey: string): boolean {
  const cardDay = toLocalDateKey(iso);
  return cardDay !== "" && cardDay === dayKey;
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
                    ? "bingo-square-pop ring-2 ring-amber-300 bg-gradient-to-br from-amber-300 via-yellow-300 to-lime-200 text-amber-900 shadow-[0_0_14px_3px_rgba(250,204,21,0.9)] animate-pulse motion-reduce:animate-none"
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
                    ? "bingo-square-pop ring-2 ring-amber-300 bg-gradient-to-br from-amber-300 via-yellow-300 to-lime-200 text-amber-900 shadow-[0_0_14px_3px_rgba(250,204,21,0.9)] animate-pulse motion-reduce:animate-none"
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
              <span className="relative z-[1] line-clamp-4">
                {isFree ? "FREE" : shortenLabel(square.label, LANDSCAPE_SQUARE_LABEL_MAX_LENGTH)}
              </span>
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
  initialDate = "",
  initialCardId = "",
  onBack,
}: {
  initialDate?: string;
  initialCardId?: string;
  onBack?: () => void;
}) {
  const claimPointsPendingRef = useRef(false);
  const collectAllBingoPointsPendingRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { triggerAnimation } = useAnimationTrigger();
  const venuePresence = useVenuePresence();
  const prevCardsRef = useRef<BingoCard[]>([]);
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  // Phase 5 date rail. `todayKey` is captured once per mount and re-synced by the day-rollover
  // effect below, so a page left open past midnight does not keep calling yesterday "Today".
  const [todayKey, setTodayKey] = useState(() => todayDateKey());
  const [selectedDate, setSelectedDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayDateKey()
  );
  const [activeDates, setActiveDates] = useState<string[]>([]);
  // Phase 4: board creation happens in a slide-up sheet over this page, not on three routes.
  // Portrait only — the landscape tree returns well above the portrait render and never mounts it.
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  // A PAST day is fetched separately (server-side `date=` window) instead of narrowing the main
  // fetch: `cards` also feeds the unclaimed-points banner, the claim path and the landscape
  // carousel, all of which are day-agnostic and must keep seeing everything.
  const [historyCards, setHistoryCards] = useState<BingoCard[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pendingScrollCardId, setPendingScrollCardId] = useState("");
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
  const [actionPops, setActionPops] = useState<ActionPopItem[]>([]);
  const [glowCardIds, setGlowCardIds] = useState<Set<string>>(new Set());
  const [glowSquareKeys, setGlowSquareKeys] = useState<Set<string>>(new Set());
  const [recentlyAddedCardIds, setRecentlyAddedCardIds] = useState<Set<string>>(new Set());
  const [isScreenShaking, setIsScreenShaking] = useState(false);
  const [isLandscapeGameView, setIsLandscapeGameView] = useState(false);
  const [landscapeViewportStyle, setLandscapeViewportStyle] = useState<CSSProperties>(DEFAULT_LANDSCAPE_VIEWPORT_STYLE);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const [isLandscapeFullscreen, setIsLandscapeFullscreen] = useState(false);
  const [fullscreenFeedback, setFullscreenFeedback] = useState("");
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const [showInstallCoachCard, setShowInstallCoachCard] = useState(false);
  const [landscapeBoardMode, setLandscapeBoardMode] = useState<LandscapeBoardMode>("active");
  const [landscapeActiveBoardIndex, setLandscapeActiveBoardIndex] = useState(0);
  const [landscapeScoredBoardIndex, setLandscapeScoredBoardIndex] = useState(0);
  const [landscapeActiveCardId, setLandscapeActiveCardId] = useState("");
  const [landscapeScoredCardId, setLandscapeScoredCardId] = useState("");
  const isLandscapeGameViewRef = useRef(false);
  const wasLandscapeFullscreenRef = useRef(false);
  const userExitedLandscapeFullscreenRef = useRef(false);
  const fullscreenRequestInFlightRef = useRef(false);
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
  const isInstalledPwa = useIsRunningAsInstalledPwa();
  const { canInstallOnDevice, promptInstall } = usePwaInstallPrompt();

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  // Phase 14: switching the rail to another PAST day raises the history-loading flag in the SAME
  // commit as the date change. Before this, the flag was set only by the passive fetch effect
  // below — one render later, long enough to paint the previous day's boards under the new day's
  // label for a frame. Switching back to today keeps the flag DOWN (14b): today's boards are
  // already in hand, and the fetch effect's `isViewingToday` early-return only clears it again.
  const selectDate = useCallback(
    (nextDate: string) => {
      setSelectedDate(nextDate);
      if (nextDate !== todayKey) {
        setLoadingHistory(true);
      }
    },
    [todayKey]
  );

  // Deep link into one board (`/bingo/home?cardId=…`). Before Phase 5 this reached a settled
  // board by flipping to the Scored tab; with the tabs retired it selects the board's own
  // calendar DAY, then opens and scrolls to it.
  const deepLinkHandledRef = useRef("");
  useEffect(() => {
    const targetCardId = initialCardId.trim();
    if (!targetCardId || cards.length === 0 || deepLinkHandledRef.current === targetCardId) {
      return;
    }
    const targetCard = cards.find((card) => card.id === targetCardId);
    if (!targetCard) {
      return;
    }
    deepLinkHandledRef.current = targetCardId;
    const cardDay = toLocalDateKey(targetCard.startsAt);
    // A live board stays on today's stack even when its game started yesterday, so only send
    // the rail to another day for a board that is genuinely finished. Route through `selectDate`
    // (Phase 14) so a deep link that lands on a past day flashes the loader in the same commit,
    // exactly like picking that day from the calendar — no stale frame either way.
    if (cardDay && targetCard.status !== "active") {
      selectDate(cardDay);
    }
    if (targetCard.status === "active") {
      setExpandedActiveCardId(targetCard.id);
      setExpandedFinalCardId("");
    } else {
      setExpandedFinalCardId(targetCard.id);
      setExpandedActiveCardId("");
    }
    setPendingScrollCardId(targetCard.id);
  }, [cards, initialCardId, selectDate]);

  // Scrolling is deferred rather than done inline: selecting another calendar day above kicks
  // off the past-day fetch, so the target board does not exist in the DOM yet. Re-running on
  // every stack change means the scroll lands on the render that finally paints the board.
  useEffect(() => {
    if (!pendingScrollCardId) {
      return;
    }
    const element = document.querySelector(`[data-bingo-card-id="${CSS.escape(pendingScrollCardId)}"]`);
    if (!element) {
      return;
    }
    setPendingScrollCardId("");
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // `cards` / `historyCards` are what the stack is rebuilt from, so re-running when either
    // changes is the same as re-running when the stack repaints — without a forward reference.
  }, [cards, historyCards, pendingScrollCardId]);

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

  useEffect(() => {
    if (!isLandscapeGameView) {
      setLandscapeViewportStyle(DEFAULT_LANDSCAPE_VIEWPORT_STYLE);
      return;
    }

    let rafId = 0;
    const updateViewportStyle = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width ?? window.innerWidth);
        const height = Math.round(viewport?.height ?? window.innerHeight);
        const left = Math.round(viewport?.offsetLeft ?? 0);
        const top = Math.round(viewport?.offsetTop ?? 0);

        setLandscapeViewportStyle({
          "--bingo-landscape-vw": `${width}px`,
          "--bingo-landscape-vh": `${height}px`,
          "--bingo-landscape-left": `${left}px`,
          "--bingo-landscape-top": `${top}px`,
        } as CSSProperties);
      });
    };

    updateViewportStyle();
    window.visualViewport?.addEventListener("resize", updateViewportStyle);
    window.visualViewport?.addEventListener("scroll", updateViewportStyle);
    window.addEventListener("resize", updateViewportStyle);
    window.addEventListener("orientationchange", updateViewportStyle);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.visualViewport?.removeEventListener("resize", updateViewportStyle);
      window.visualViewport?.removeEventListener("scroll", updateViewportStyle);
      window.removeEventListener("resize", updateViewportStyle);
      window.removeEventListener("orientationchange", updateViewportStyle);
    };
  }, [isLandscapeGameView]);

  useEffect(() => {
    isLandscapeGameViewRef.current = isLandscapeGameView;
  }, [isLandscapeGameView]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const nowFullscreen = Boolean(getFullscreenElement());
      setIsFullscreenSupported(isFullscreenAvailable(rootRef.current ?? document.documentElement));
      setIsLandscapeFullscreen(nowFullscreen);
      if (!nowFullscreen) {
        setFullscreenFeedback("");
        // Fullscreen only ever ends here without us leaving landscape first when the
        // player closed it themselves (button tap, swipe-up, Android back). That's a
        // deliberate opt-out — don't re-arm the tap-to-fullscreen listener and nag them
        // again for the rest of this landscape session.
        if (wasLandscapeFullscreenRef.current && isLandscapeGameViewRef.current) {
          userExitedLandscapeFullscreenRef.current = true;
        }
      }
      wasLandscapeFullscreenRef.current = nowFullscreen;
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!isLandscapeGameView || !isFullscreenSupported || isLandscapeFullscreen) {
      setShowFullscreenHint(false);
      return;
    }

    try {
      if (window.localStorage.getItem(FULLSCREEN_HINT_STORAGE_KEY) === "true") {
        return;
      }
      window.localStorage.setItem(FULLSCREEN_HINT_STORAGE_KEY, "true");
    } catch {
      // Storage can be unavailable in private browsing; the hint still works for this session.
    }

    setShowFullscreenHint(true);
    const timeoutId = window.setTimeout(() => {
      setShowFullscreenHint(false);
    }, 7000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isFullscreenSupported, isLandscapeFullscreen, isLandscapeGameView]);

  // This is exactly the slot the fullscreen button leaves empty on iPhone
  // (Fullscreen API absent, see `isFullscreenSupported` above) — the single
  // most persuasive moment to offer the PWA install path. Flag-gated inert;
  // see docs/bingo-fullscreen-pwa-phase5.md.
  useEffect(() => {
    if (
      !isLandscapeGameView ||
      isFullscreenSupported ||
      isInstalledPwa ||
      !isInstallPromptEnabled() ||
      !isIOSSafari()
    ) {
      setShowInstallCoachCard(false);
      return;
    }

    try {
      if (window.localStorage.getItem(INSTALL_COACH_CARD_STORAGE_KEY) === "true") {
        return;
      }
      window.localStorage.setItem(INSTALL_COACH_CARD_STORAGE_KEY, "true");
    } catch {
      // Storage can be unavailable in private browsing; the card still works for this session.
    }

    setShowInstallCoachCard(true);
  }, [isFullscreenSupported, isInstalledPwa, isLandscapeGameView]);

  useEffect(() => {
    if (isLandscapeGameView || !isLandscapeFullscreen) {
      return;
    }

    void exitDocumentFullscreen().catch(() => {
      setIsLandscapeFullscreen(false);
    });
  }, [isLandscapeGameView, isLandscapeFullscreen]);

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
          // NFL (Phase 3): a player holds at most two prop squares, so without these the "SACK!"
          // pop can land on that same player's receiving-yards square. Tokens are compared against
          // `normalizeKey` output, which is lowercase words separated by single spaces.
          if (
            (textKey.includes("touchdown") || textKey.includes(" td") || textKey.startsWith("td ")) &&
            !(labelKey.includes("touchdown") || labelKey.includes(" td") || labelKey.includes("scores"))
          ) {
            continue;
          }
          if (textKey.includes("field goal") && !labelKey.includes("field goal")) continue;
          if (textKey.includes("sack") && !labelKey.includes("sack")) continue;
          if (
            (textKey.includes("interception") || textKey.includes("picked off")) &&
            !labelKey.includes("interception")
          ) {
            continue;
          }
          if (textKey.includes("rush yards") && !labelKey.includes("rush")) continue;
          if (
            textKey.includes("rec yards") &&
            !(labelKey.includes("receiv") || labelKey.includes("catch") || labelKey.includes("reception"))
          ) {
            continue;
          }
          return { squareKey: toCardSquareKey(card.id, square.index), cardId: card.id };
        }
      }
      return {};
    },
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
        `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true&refreshProgress=${
          refreshProgress ? "true" : "false"
        }&includeDates=true&tzOffsetMinutes=${encodeURIComponent(String(new Date().getTimezoneOffset()))}`,
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
      if (Array.isArray(payload.activeDates)) {
        setActiveDates(payload.activeDates);
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

  const isViewingToday = selectedDate === todayKey;

  // Keep "today" honest across a midnight rollover without a 1s interval: re-check on focus,
  // on visibility change, and once per minute (cheap — it is a string compare).
  useEffect(() => {
    const syncToday = () => setTodayKey(todayDateKey());
    const interval = window.setInterval(syncToday, 60_000);
    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", syncToday);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", syncToday);
    };
  }, []);

  // A previous day is a server-side query (plan 5a): the main 100-row window would silently
  // drop history for an active player, so the day filter has to run in SQL.
  useEffect(() => {
    if (!userId || isViewingToday) {
      setHistoryCards([]);
      setHistoryError("");
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError("");
    (async () => {
      try {
        const response = await fetch(
          `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true&refreshProgress=false&date=${encodeURIComponent(
            selectedDate
          )}&tzOffsetMinutes=${encodeURIComponent(String(new Date().getTimezoneOffset()))}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as CardsResponse;
        if (cancelled) return;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to load boards for that day.");
        }
        setHistoryCards(payload.cards ?? []);
      } catch (error) {
        if (cancelled) return;
        setHistoryCards([]);
        setHistoryError(error instanceof Error ? error.message : "Failed to load boards for that day.");
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewingToday, selectedDate, userId]);

  // Phase 14.5: write live board updates through to the past-day stack. `historyCards` is the
  // write-once day-scoped fetch above, but a board still running on its own (now past) calendar
  // day is ALSO in the live `cards` window and already subscribed, so `card_updated` broadcasts
  // are already calling `loadCards({ background: true })` — into `cards`, where the past-day
  // stack never looks. Patch those rows through by id so the squares under Phase 13's `Live`
  // badge tick in step with today's stack, and a board that settles while parked here flips to
  // Final in place. `mergeLiveCardUpdates` returns `prev` by identity when nothing overlaps (a
  // past day of only finished boards), so `historyStackCards` does not churn per broadcast; it
  // also never appends, so a dateless `cards` row can't land on a day it doesn't belong to.
  // No interaction with `loadingHistory` — this runs after the fetch has resolved.
  useEffect(() => {
    if (isViewingToday) return;
    setHistoryCards((prev) => mergeLiveCardUpdates(prev, cards));
  }, [cards, isViewingToday]);

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
          void loadCards({ background: true, refreshProgress: false });
        })
        .subscribe()
    );

    return () => {
      active = false;
      channels.forEach((ch) => void client.removeChannel(ch));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCards, subscribedGameIdsKey, userId]);

  // Channel 3 (live stats): subscribe to sport-keyed broadcast channels from Phase 3.
  // gameIdSet is kept current via ref so we don't re-subscribe on every card state update.
  //
  // Depends on subscribedSportKeysKey ONLY, not subscribedSportKeys itself: that
  // array is rebuilt by useMemo(..., [cards]) with a new identity on every card
  // poll (even when the sport-key set is unchanged), so keeping it in the dep
  // array tore the channel down and rebuilt it every poll — dropping
  // liveStatsPrevByPlayerRef's delta-tracking state each time and starving
  // classifyLiveDeltaEvent of the "previous" reading it needs to detect a stat
  // change. The sport-key list to subscribe to is re-derived from the key
  // string itself, exactly like subscribedGameIdsKey does for channels 1 & 2.
  useEffect(() => {
    const sportKeys = subscribedSportKeysKey ? subscribedSportKeysKey.split(",") : [];
    if (!supabase || sportKeys.length === 0) {
      return;
    }
    const client = supabase;
    let active = true;
    const liveStatsPrevByPlayer = liveStatsPrevByPlayerRef.current;

    const channels = sportKeys.map((sportKey) =>
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
          // NFL rows come from the 1-minute sweep, which can run on several warm serverless
          // instances at once; one holding a stale snapshot can deliver *older* totals after
          // newer ones. Storing a rewind as the new baseline would re-fire the pop it already
          // showed as soon as the real row lands, so the rewind is dropped instead.
          if (previous && isRegressedNflLiveStatRow(previous, next)) return;
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
      liveStatsPrevByPlayer.clear();
      channels.forEach((ch) => void client.removeChannel(ch));
    };
  }, [findRelevantSquareForEvent, queueVisualEvents, subscribedSportKeysKey]);

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
  // Portrait stack order (plan 2c): live boards, then upcoming by start time, then the boards
  // that FINISHED TODAY. That last group is the whole point — decision 1 retired the Scored
  // tab, and a board that settles while the player is watching must move down this stack
  // rather than vanish.
  const todaysSettledCards = useMemo(
    () => settledCards.filter((card) => isCardOnLocalDay(card.startsAt, todayKey)),
    [settledCards, todayKey]
  );
  // `activeCards` is already sorted earliest-to-latest, and every live board started before
  // every upcoming one, so that sort already yields live-then-upcoming. Partitioning explicitly
  // keeps the contract readable (and correct if the sort ever changes).
  //
  // DEVIATION from plan 5c, deliberate: the day filter is NOT applied to the active partition.
  // Games are only ever offered from today's local slate, so an active board is today's board —
  // except in the one window that matters, a 10pm game still live at 12:05am. Filtering active
  // boards by `startsAt`'s day would make that live board vanish off today's stack at midnight,
  // which is precisely the disappearing-board failure decision 1 forbids. Settled boards still
  // sort by their own day, so a finished board is found under the day it was played.
  const portraitStackCards = useMemo<Array<{ card: BingoCard; isLive: boolean }>>(() => {
    const now = Date.now();
    const live: Array<{ card: BingoCard; isLive: boolean }> = [];
    const upcoming: Array<{ card: BingoCard; isLive: boolean }> = [];
    for (const card of activeCards) {
      const startsAtMs = Date.parse(card.startsAt);
      if (Number.isFinite(startsAtMs) && startsAtMs <= now) {
        live.push({ card, isLive: true });
      } else {
        upcoming.push({ card, isLive: false });
      }
    }
    return [...live, ...upcoming, ...todaysSettledCards.map((card) => ({ card, isLive: false }))];
  }, [activeCards, todaysSettledCards]);
  // A past day is read-only: newest board first, every board that day, no Add control.
  //
  // Per-card state is decided by `resolveHistoryStackEntry` (stale-row normalization + a
  // DERIVED `isLive`), not by membership in this stack. Plan 13b: a past calendar day is not
  // the same thing as a finished game — the 10pm board that `portraitStackCards` deliberately
  // keeps on today's stack past midnight (see the deviation note above) is ALSO reachable by
  // paging the rail back one day, and it is still running. The old hard-coded `isLive: false`
  // badged it "Starts 10:00 PM" on its own calendar day.
  const historyStackCards = useMemo<Array<{ card: BingoCard; isLive: boolean }>>(() => {
    const now = Date.now();
    return historyCards
      .map((card) => resolveHistoryStackEntry(card, now))
      .sort((a, b) => compareCardsLatestToEarliest(a.card, b.card));
  }, [historyCards]);
  const visibleStackCards = isViewingToday ? portraitStackCards : historyStackCards;
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

  // Enter-only. Kept separate from the toggle because the tap-to-arm listener below must
  // never be able to *exit*: it fires on `pointerdown`, before the fullscreen button's own
  // `onClick`, so a toggle there would enter and then immediately exit — and the exit would
  // latch `userExitedLandscapeFullscreenRef`, killing one-tap fullscreen for the session.
  const enterLandscapeFullscreen = useCallback(async () => {
    if (!isLandscapeGameView || fullscreenRequestInFlightRef.current || getFullscreenElement()) {
      return;
    }

    fullscreenRequestInFlightRef.current = true;
    try {
      await requestElementFullscreen(rootRef.current ?? document.documentElement);
      setFullscreenFeedback("");
      setShowFullscreenHint(false);
    } catch {
      setIsFullscreenSupported(isFullscreenAvailable(rootRef.current ?? document.documentElement));
      setFullscreenFeedback("Fullscreen unavailable in this browser.");
      setShowFullscreenHint(false);
    } finally {
      fullscreenRequestInFlightRef.current = false;
    }
  }, [isLandscapeGameView]);

  const toggleLandscapeFullscreen = useCallback(async () => {
    if (!isLandscapeGameView) {
      return;
    }

    if (getFullscreenElement()) {
      try {
        await exitDocumentFullscreen();
      } catch {
        setIsFullscreenSupported(isFullscreenAvailable(rootRef.current ?? document.documentElement));
      }
      setFullscreenFeedback("");
      setShowFullscreenHint(false);
      return;
    }

    await enterLandscapeFullscreen();
  }, [enterLandscapeFullscreen, isLandscapeGameView]);

  // Arm fullscreen on the first touch after rotating into landscape. This is as close to
  // automatic as `requestFullscreen()` permits — it needs transient user activation, and
  // `orientationchange` doesn't qualify. `pointerdown` covers touch, pen, and mouse in one
  // listener and still counts as a real gesture. It does not call `preventDefault()` or
  // `stopPropagation()`, so whatever the tap actually landed on (a square, a nav arrow, a
  // tab) still runs its own handler normally; this just piggybacks fullscreen on top.
  //
  // Deliberately NOT `{ once: true }`: a rejected request (permission, an iframe without
  // `allowfullscreen`, a browser that lies about support) would otherwise consume the
  // listener and silently disarm the feature for the rest of the landscape session. The
  // effect tears the listener down as soon as fullscreen actually takes.
  useEffect(() => {
    if (
      !isLandscapeGameView ||
      !isFullscreenSupported ||
      isLandscapeFullscreen ||
      userExitedLandscapeFullscreenRef.current
    ) {
      return;
    }

    const shellElement = rootRef.current;
    if (!shellElement) {
      return;
    }

    const armFullscreenOnTap = (event: PointerEvent) => {
      // The fullscreen button owns its own toggle on click — leave that tap entirely to it.
      const target = event.target;
      if (target instanceof Element && target.closest(".tp-bingo-landscape-fullscreen")) {
        return;
      }
      void enterLandscapeFullscreen();
    };

    shellElement.addEventListener("pointerdown", armFullscreenOnTap);
    return () => {
      shellElement.removeEventListener("pointerdown", armFullscreenOnTap);
    };
  }, [isLandscapeGameView, isFullscreenSupported, isLandscapeFullscreen, enterLandscapeFullscreen]);

  const collectAllBingoPoints = useCallback(async () => {
    if (collectAllBingoPointsPendingRef.current) return;
    collectAllBingoPointsPendingRef.current = true;
    try {
      if (!userId || claimPointsPendingRef.current || isCollectingAllBingo || unclaimedWonBingoCards.length === 0 || venuePresence.isInteractionBlocked) return;
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
          const payload = (await response.json()) as ClaimResponse & { code?: string; userMessage?: string };
          const presenceFailure = venuePresence.capturePresenceFailure(payload);
          if (presenceFailure) {
            break;
          }
          if (payload.ok && payload.result) {
            totalAwarded += payload.result.rewardPoints;
          }
        }
        if (totalAwarded > 0) {
          haptic("success");
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

    } finally {
      collectAllBingoPointsPendingRef.current = false;
    }
  }, [isCollectingAllBingo, loadCards, unclaimedWonBingoCards, userId, venuePresence]);

  // A still-running board is reachable from the history stack too (plan 13b/13c), and the
  // history fetch is a separate query — resolve against the union so opening one from a past
  // day cannot land on an empty modal. In practice the main 100-row fetch also carries it, but
  // that overlap is a coincidence of the row window, not a contract.
  const expandedActiveCard = useMemo(
    () =>
      activeCards.find((card) => card.id === expandedActiveCardId) ??
      historyStackCards.find((entry) => entry.card.id === expandedActiveCardId && entry.card.status === "active")
        ?.card ??
      null,
    [activeCards, expandedActiveCardId, historyStackCards]
  );
  // History boards are not in `settledCards` (they come from the past-day fetch), so the
  // expanded-board modal and the claim path both resolve against the union.
  const expandedFinalCard = useMemo(
    () =>
      settledCards.find((card) => card.id === expandedFinalCardId) ??
      historyStackCards.find((entry) => entry.card.id === expandedFinalCardId)?.card ??
      null,
    [expandedFinalCardId, historyStackCards, settledCards]
  );
  const hasReachedBoardLimit = activeCards.length >= 4;

  // Phase 4 triggers. Opening the sheet replaces the three `/bingo/select-*` navigations; the
  // routes still exist and still work (deep links, the landscape empty state, browser back).
  const openCreateBoardSheet = useCallback(() => setIsCreateSheetOpen(true), []);
  const handleBoardCreated = useCallback(() => {
    // A board can only be created for today's slate, so if the player had paged the calendar
    // back, snap forward — otherwise the new board would render on a day nobody is looking at.
    // `todayKey` is re-read rather than reused so the two stay consistent across a midnight
    // rollover that the once-a-minute sync has not caught yet.
    const freshToday = todayDateKey();
    setTodayKey(freshToday);
    setSelectedDate(freshToday);
    // Background refetch, not a route push: the new card arrives in `cards`, lands in
    // `portraitStackCards`, and picks up the `recentlyAddedCardIds` pop for free — the sheet
    // slides down onto a board that is already there.
    void loadCards({ background: true });
  }, [loadCards]);
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
    if (claimPointsPendingRef.current) return;
    claimPointsPendingRef.current = true;
    try {
      if (!userId || collectAllBingoPointsPendingRef.current || claimingCardId || venuePresence.isInteractionBlocked) {
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
        const payload = (await response.json()) as ClaimResponse & { code?: string; userMessage?: string };
        const presenceFailure = venuePresence.capturePresenceFailure(payload);
        if (presenceFailure) {
          throw new Error(presenceFailure.userMessage);
        }
        if (!payload.ok || !payload.result) {
          throw new Error(payload.error ?? "Failed to claim Bingo points.");
        }

        haptic("success");
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

        const claimedAt = new Date().toISOString();
        setCards((prev) =>
          prev.map((item) => (item.id === card.id ? { ...item, rewardClaimedAt: claimedAt } : item))
        );
        // A past-day board lives in `historyCards`, not `cards`, and its Collect button is
        // driven by `rewardClaimedAt` — mirror the claim there or the button stays lit.
        setHistoryCards((prev) =>
          prev.map((item) => (item.id === card.id ? { ...item, rewardClaimedAt: claimedAt } : item))
        );
        void loadCards({ background: true });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim Bingo points.");
      } finally {
        setClaimingCardId("");
      }

    } finally {
      claimPointsPendingRef.current = false;
    }
  };

  // `BingoBoardCard` is memoized with a custom comparator that compares these two props by
  // identity (see the comparator note in `BingoBoardCard.tsx`), so they must be referentially
  // stable for the whole session. The latest-value ref keeps them stable WITHOUT going stale:
  // the ref is re-pointed on every render, so a tap always runs the current closure.
  const boardActionsRef = useRef<{
    open: (cardId: string) => void;
    claim: (cardId: string, sourceElement: HTMLElement | null) => void;
  }>({ open: () => {}, claim: () => {} });
  boardActionsRef.current = {
    open: (cardId: string) => {
      const historyEntry = historyStackCards.find((entry) => entry.card.id === cardId);
      // Settled is decided by the board's own (normalized) status, never by which stack it came
      // out of (plan 13c). Membership in the history stack only means "viewed on a past
      // calendar day" — a board still inside `BINGO_GAME_BUFFER_MS` is running, and must open
      // the live board modal rather than the "Final Board / No bingo this game" one.
      const isSettledBoard = historyEntry
        ? historyEntry.card.status !== "active"
        : settledCards.some((card) => card.id === cardId);
      // The landscape carousel only ever holds cards from the main fetch; a past-day board has
      // no slot there, so leave its selection alone rather than pointing it at index 0.
      if (!historyEntry) {
        selectLandscapeCard(isSettledBoard ? "scored" : "active", cardId);
      }
      if (isSettledBoard) {
        setExpandedFinalCardId(cardId);
        setExpandedActiveCardId("");
      } else {
        setExpandedActiveCardId(cardId);
        setExpandedFinalCardId("");
      }
    },
    claim: (cardId: string, sourceElement: HTMLElement | null) => {
      const card =
        cards.find((item) => item.id === cardId) ??
        historyStackCards.find((entry) => entry.card.id === cardId)?.card;
      if (card) {
        void claimPoints(card, sourceElement);
      }
    },
  };
  const handleOpenBoard = useCallback((cardId: string) => {
    boardActionsRef.current.open(cardId);
  }, []);
  const handleClaimBoard = useCallback((cardId: string, sourceElement: HTMLElement | null) => {
    boardActionsRef.current.claim(cardId, sourceElement);
  }, []);

  // Gate on `actionPops.length` (not just `typeof document`) so the first client render
  // matches the server's (both produce `null` until a pop is queued by user interaction,
  // which only happens well after hydration). Rendering the portal unconditionally on the
  // client was a server/client branch and tripped a hydration mismatch. Mirrors the
  // `limitFeedbackPortal` guard immediately below.
  const actionPopsPortal =
    typeof document !== "undefined" && actionPops.length > 0
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
                initial={reducedMotion ? false : { scale: 0.72, opacity: 0, y: 0 }}
                animate={reducedMotion ? { scale: 1, y: 0, opacity: 1 } : { scale: [0.72, 1.08, 1.02, 0.98], y: [0, -20, -16, -8], opacity: [0, 1, 1, 0] }}
                transition={reducedMotion ? { duration: 0 } : {
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
                initial={reducedMotion ? false : { scale: 0.7, opacity: 0, y: 0 }}
                animate={reducedMotion ? { scale: 1, opacity: 1, y: 0 } : { scale: [0.7, 1.06, 1], opacity: [0, 1, 0], y: [0, -12, -20] }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.55, times: [0, 0.45, 1], ease: "easeOut" }}
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
    const landscapeEyebrow = isActiveLandscapeMode
      ? `Board ${currentBoardNumber || 0} of ${currentBoardTotal}`
      : `Scored ${currentBoardNumber || 0} of ${currentBoardTotal}`;

    const landscapeContent = (
      <div
        ref={rootRef}
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onLandscapeTouchEnd}
        style={landscapeViewportStyle}
        className={`tp-bingo-theme tp-bingo-landscape-shell fixed z-[1300] flex overflow-hidden bg-[#020617] text-slate-100 ${
          isScreenShaking ? "tp-bingo-screen-shake" : ""
        }`} role="status"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(125,211,252,0.15),transparent_24%),radial-gradient(circle_at_70%_100%,rgba(249,115,22,0.12),transparent_30%),linear-gradient(180deg,#020617_0%,#07111f_100%)]" />
        {/* No header row. It was the single largest app-owned band in landscape
            (~49px of a 390px display) and the board is height-bound while the centre
            column has ~240px of horizontal slack — so its contents now live in the
            aside, which was already there and already had the width to absorb them. */}
        <main className="tp-bingo-landscape-main relative z-[1] grid h-full w-full grid-rows-[minmax(0,1fr)]">
          <section className="tp-bingo-landscape-content grid min-h-0 items-center">
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
                <div className="tp-bingo-landscape-board-stage h-full w-full">
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

            <aside className="tp-bingo-landscape-aside grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2">
              <div className="tp-bingo-landscape-headline rounded-[18px] border border-sky-300/55 bg-slate-950/82 p-3 shadow-[0_0_24px_rgba(125,211,252,0.16)]">
                <p className="truncate text-[10px] font-black uppercase leading-none tracking-[0.16em] text-sky-300">
                  {landscapeEyebrow}
                </p>
                <h1 className="mt-1 flex items-center gap-1.5 truncate text-[16px] font-black leading-none text-slate-50 [font-family:'Bree_Serif','Nunito',serif]">
                  {landscapeCurrentCard ? (
                    <>
                      <span aria-hidden="true" className="shrink-0 text-[20px] leading-none">
                        {getLeagueDisplay(landscapeCurrentCard.sportKey).emoji}
                      </span>
                      <span className="truncate">
                        {toMascotMatchup(landscapeCurrentCard.awayTeam, landscapeCurrentCard.homeTeam) ||
                          landscapeCurrentCard.gameLabel}
                      </span>
                    </>
                  ) : (
                    isActiveLandscapeMode ? "No active boards" : "No scored boards"
                  )}
                </h1>
                <div className="tp-bingo-landscape-controls mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => selectLandscapeBoardAt("active", normalizedLandscapeActiveIndex)}
                    aria-label="Active boards"
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
                    aria-label="Scored boards"
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
                      <span className={`h-1.5 w-1.5 rounded-full ${currentCardIsLive && isActiveLandscapeMode ? "animate-pulse motion-reduce:animate-none bg-sky-300" : "bg-slate-400"}`} />
                      {isActiveLandscapeMode ? (currentCardIsLive ? "Live" : "Upcoming") : landscapeCurrentCard.status}
                    </span>
                  ) : null}
                  {isFullscreenSupported ? (
                    <div className="relative">
                      {showFullscreenHint ? (
                        <div className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] right-0 z-10 w-max max-w-[15rem] rounded-full border border-sky-300/45 bg-slate-950/95 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-sky-100 shadow-[0_0_18px_rgba(125,211,252,0.18)]">
                          Tap anywhere for full screen
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void toggleLandscapeFullscreen()}
                        className="tp-clean-button tp-bingo-landscape-fullscreen flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-200/90 bg-sky-300 text-slate-950 shadow-[0_0_0_2px_rgba(14,165,233,0.22),0_0_24px_rgba(125,211,252,0.38)] transition hover:bg-sky-200 active:scale-95"
                        aria-label={isLandscapeFullscreen ? "Exit fullscreen Bingo board" : "Enter fullscreen Bingo board"}
                        title={isLandscapeFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                      >
                        {isLandscapeFullscreen ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : showInstallCoachCard ? (
                    <div className="tp-bingo-install-coach-card inline-flex items-center gap-1.5 rounded-full border border-sky-300/45 bg-slate-950/95 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-sky-100 shadow-[0_0_18px_rgba(125,211,252,0.18)]">
                      <Share aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span>Add to Home Screen for full screen</span>
                      <button
                        type="button"
                        onClick={() => setShowInstallCoachCard(false)}
                        aria-label="Dismiss add to Home Screen tip"
                        className="tp-clean-button flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-sky-200/80 hover:text-sky-100"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}
                  {canInstallOnDevice ? (
                    <button
                      type="button"
                      onClick={promptInstall}
                      className="tp-clean-button tp-bingo-landscape-tab inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-300/45 bg-sky-300/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-sky-200 transition"
                      aria-label="Install app"
                      title="Install app"
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="tp-bingo-landscape-control-label">Install</span>
                    </button>
                  ) : null}
                </div>
                {/* `fullscreenFeedback` is only ever set by a failed
                    `toggleLandscapeFullscreen()` and is cleared on the next
                    `fullscreenchange`, so it already means "a real attempt just
                    failed." The old static "Fullscreen unavailable in this browser."
                    pill rendered on every iPhone — where the API is simply absent and
                    the button therefore never renders — spending landscape chrome to
                    tell players about a control they cannot see. Dropped. */}
                {fullscreenFeedback ? (
                  <p
                    className="mt-1.5 text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-slate-300"
                    role="status"
                  >
                    {fullscreenFeedback}
                  </p>
                ) : null}
              </div>
              <div className="tp-bingo-landscape-panel min-h-0 rounded-[18px] border border-sky-300/35 bg-slate-950/82 p-3 shadow-[0_0_22px_rgba(125,211,252,0.1)]">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">Board Progress</p>
                {landscapeCurrentCard && landscapeProgress ? (
                  <div className="tp-bingo-landscape-progress mt-3 space-y-3">
                    <BingoProgressRing squares={landscapeCurrentCard.squares} size="sm" />
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300"
                        style={{ width: `${landscapeProgress.pctFilled}%` }}
                      />
                    </div>
                    {/* Duplicates BingoProgressRing's own "N to bingo" subtitle; hidden on
                        short landscape displays where the panel has to fit the Collect
                        button too (see .tp-bingo-landscape-to-bingo in globals.css). */}
                    <p className="tp-bingo-landscape-to-bingo text-[11px] font-bold leading-snug text-slate-300">
                      {landscapeProgress.toBingo === null
                        ? "Every line is blocked."
                        : landscapeProgress.toBingo === 0
                        ? "Bingo complete."
                        : `${landscapeProgress.toBingo} squares from bingo.`}
                    </p>
                    {canCollectCurrentCard ? (
                      <button
                        type="button"
                        disabled={Boolean(claimingCardId) || isCollectingAllBingo}
                        aria-busy={claimingCardId === landscapeCurrentCard.id}
                        onClick={(event) => void claimPoints(landscapeCurrentCard, event.currentTarget)}
                        className="tp-clean-button flex h-10 w-full items-center justify-center rounded-[10px] bg-amber-400 px-3 text-[12px] font-black uppercase text-slate-950"
                      >
                        {claimingCardId === landscapeCurrentCard.id ? <><ButtonSpinner /> Collecting…</> : `Collect ${landscapeCurrentCard.rewardPoints} Points`}
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

  // First run is a whole-account state, not a per-day one: it must not re-trigger just because
  // the player paged the calendar back to a day they had no boards on.
  const isFirstRun = !loadingCards && activeCards.length === 0 && settledCards.length === 0;

  return (
    <div ref={rootRef} className={`tp-bingo-theme ${isScreenShaking ? "tp-bingo-screen-shake" : ""}`} role="status">
      <GameAppBar game="bingo" onExit={onBack} />

      <div className="mx-auto w-full max-w-[30rem] px-3 pb-6">
        {errorMessage ? (
          <div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/80 p-3 text-sm text-rose-300" role="alert">{errorMessage}</div>
        ) : null}

        {loadingCards && cards.length === 0 ? (
          <div className="pt-8">
            <LoadingState label="Loading your boards..." />
          </div>
        ) : isFirstRun ? (
          /* ════════ FIRST RUN — no boards yet ════════ */
          <div className="pt-4">
            <div className="relative overflow-hidden rounded-[18px] border-2 border-sky-300 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.12),transparent_60%),#0c3a2e] p-4 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35),0_12px_26px_rgba(0,0,0,0.5)]">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-300">Sports Bingo</p>
              <p className="mt-1.5 text-[26px] leading-[1.08] text-amber-100 [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">
                You don&apos;t have an active board yet.
              </p>
              <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-amber-100/60">
                Click the button below to create a 5×5 board of player props and box-score calls. Plays happen, squares
                light up automatically. Five in a row wins 100 points.
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
              <button
                type="button"
                onClick={openCreateBoardSheet}
                className="tp-clean-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[13px] bg-sky-300 px-4 py-3.5 text-[14.5px] font-black uppercase tracking-[0.03em] text-[#08233a] shadow-[0_0_0_1px_rgba(125,211,252,0.4),0_10px_26px_rgba(125,211,252,0.28)] transition-transform active:scale-95"
              >
                Get your first board
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
              <p className="mt-2.5 text-center text-[10px] font-black tracking-[0.04em] text-sky-300">
                Turn your phone sideways for a better view of your boards.
              </p>
            </div>
          </div>
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
                  disabled={isCollectingAllBingo || Boolean(claimingCardId)}
                  aria-busy={isCollectingAllBingo}
                  className="tp-clean-button inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-500/[0.16] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.04em] text-emerald-300 disabled:opacity-60"
                >
                  {isCollectingAllBingo ? <><ButtonSpinner /> Collecting…</> : `Collect +${totalUnclaimedBingoPoints}`}
                </button>
              </div>
            ) : null}

            <div className="pt-3">
              <DateCalendarPopover
                selectedDate={selectedDate}
                today={todayKey}
                markedDates={activeDates}
                maxDate={todayKey}
                onSelect={selectDate}
                label="Board date"
              />
            </div>

            {historyError ? (
              <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-[12px] font-bold text-rose-300" role="alert">
                {historyError}
              </div>
            ) : null}

            {!isViewingToday && loadingHistory ? (
              <div className="pt-6">
                <LoadingState label="Loading that day's boards..." />
              </div>
            ) : visibleStackCards.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-sky-300/25 bg-slate-900 p-5 text-center">
                <p className="text-[13px] font-bold text-slate-300">
                  {isViewingToday ? "No active boards right now." : "No boards on this day."}
                </p>
                {isViewingToday ? (
                  <button
                    type="button"
                    onClick={openCreateBoardSheet}
                    className="tp-clean-button mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-sky-300 px-5 py-2.5 text-[12.5px] font-black uppercase tracking-[0.03em] text-[#08233a]"
                  >
                    Get a board <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayKey)}
                    className="tp-clean-button mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-sky-300/40 bg-sky-300/[0.12] px-5 py-2.5 text-[12.5px] font-black uppercase tracking-[0.03em] text-sky-300"
                  >
                    Back to today
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Vertical board stack (plan 2c) — every board the player holds for the selected
                    day, one under the next: live, then upcoming, then boards that finished that
                    day. A past day is the same stack, read-only, with no Add control. */}
                <div className="mt-3 flex flex-col gap-4">
                  {visibleStackCards.map(({ card, isLive }) => (
                    <BingoBoardCard
                      key={card.id}
                      card={card}
                      isLive={isLive}
                      recentlyUpdatedSquareKeys={recentlyUpdatedSquareKeys}
                      recentlySucceededSquareKeys={recentlySucceededSquareKeys}
                      glowSquareKeys={glowSquareKeys}
                      glowCardIds={glowCardIds}
                      recentlyAddedCardIds={recentlyAddedCardIds}
                      isClaiming={claimingCardId === card.id}
                      claimDisabled={
                        isCollectingAllBingo ||
                        (Boolean(claimingCardId) && claimingCardId !== card.id) ||
                        venuePresence.isInteractionBlocked
                      }
                      onOpen={handleOpenBoard}
                      onClaim={handleClaimBoard}
                    />
                  ))}
                </div>

                {/* The "+ Add a Board" control. The full-size empty-board tile originally planned
                    for Phase 4 was cancelled (Andrew, 2026-09-07) — this button is the final
                    design. Hidden on a past day: you cannot create a board for a game that has
                    already happened (plan 4f). */}
                {isViewingToday ? (
                  hasReachedBoardLimit ? (
                    <button
                      type="button"
                      onClick={triggerLimitReachedFeedback}
                      className={`tp-clean-button mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-300/40 bg-sky-300/[0.06] px-4 py-3 text-[12px] font-black uppercase tracking-[0.06em] text-sky-300 ${
                        limitPulse ? "pickem-limit-pulse" : ""
                      }`}
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {showBoardLimitMessage ? "Max 4 boards" : "Add a board"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCreateBoardSheet}
                      className="tp-clean-button mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-300/40 bg-sky-300/[0.06] px-4 py-3 text-[12px] font-black uppercase tracking-[0.06em] text-sky-300"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      Add a board
                    </button>
                  )
                ) : null}
              </>
            )}
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

      {/* Board creation, in place (plan 4b/4g). Portrait only — the landscape tree returns above
          this render path, so rotating with the sheet open unmounts it and releases its scroll
          lock. z-[5000] clears GameAppBar's sticky z-30. */}
      {isCreateSheetOpen ? (
        <CreateBoardSheet onClose={() => setIsCreateSheetOpen(false)} onCreated={handleBoardCreated} />
      ) : null}

      {actionPopsPortal}
      {limitFeedbackPortal}
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          .tp-bingo-screen-shake, .pickem-limit-pulse, .bingo-board-pop { animation: none !important; }
        }
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
