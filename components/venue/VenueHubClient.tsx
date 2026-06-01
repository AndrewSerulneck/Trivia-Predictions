"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { browserSupportsWebAuthn, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { Venue, LeaderboardEntry } from "@/types";
import { getAccountId, getUserId, getUsername, getVenueId, saveUserId, saveVenueId, clearVenueSession } from "@/lib/storage";
import { clearLoginInProgress } from "@/lib/authFastPath";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { getPasskeyClientMessage } from "@/lib/passkeyErrors";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
import {
  evaluateLiveTriviaStatePayload,
  resolveLiveTriviaVenueContext,
  type LiveTriviaPayloadFailureReason,
} from "@/lib/liveTriviaClientState";
import {
  consumeVenueHomeBootstrap,
  consumeVenueHomeEntryHandoff,
  hasRecentVenueHomeRouteIntent,
  type HomeBadgeCounts,
  type TriviaQuotaSnapshot,
  type VenueHomeBootstrapSnapshot,
} from "@/lib/venueHomeBootstrap";
import { VENUE_GAME_CARD_BY_KEY, VENUE_HOME_GAME_KEYS, type VenueGameKey } from "@/lib/venueGameCards";
import { runVenueGameOpenTransition } from "@/lib/venueGameTransition";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { NotificationBell } from "@/components/ui/NotificationBell";

type BingoBadgePayload = {
  ok: boolean;
  cards?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type PickEmBadgePayload = {
  ok: boolean;
  picks?: Array<{ status?: string; rewardClaimedAt?: string | null; rewardPoints?: number }>;
};

type FantasyBadgePayload = {
  ok: boolean;
  entries?: Array<{
    status?: string;
    rewardClaimedAt?: string | null;
    points?: number;
  }>;
};

type UserSummaryPayload = {
  ok?: boolean;
  profile?: {
    username?: string;
    points?: number;
    venueId?: string;
  } | null;
  hasPasskey?: boolean;
};

type PasskeyRegisterOptionsPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  challengeId?: string;
  options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
};

type PasskeyRegisterVerifyPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  verified?: boolean;
};

type ChallengeCampaignCard = {
  id: string;
  name: string;
  imageUrl?: string;
  imageScale?: number;
  imageFocusX?: number;
  imageFocusY?: number;
  imageFit?: "cover" | "contain";
  rules: string;
  challengeMode?: "progress" | "leaderboard";
  leaderboard?: {
    topEntries: Array<{ rank: number; userId: string; username: string; points: number }>;
    viewer: { rank: number | null; userId: string; username?: string | null; points: number; inTop: boolean } | null;
  };
  pointsRequiredToWin: number;
  progressPoints: number;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  prizeClaimedAt?: string | null;
  isActive: boolean;
};

type ChallengeCampaignPayload = {
  ok?: boolean;
  campaigns?: ChallengeCampaignCard[];
};

type HomeScreenIndex = 0 | 1 | 2;
type VenueArrivalStage = "identity" | "core" | "warmup" | "ready";

type VenueMenuItem = {
  label: string;
  description: string;
  href: string;
};

// Background fill per game — each uses a distinct texture strategy
const GAME_CARD_BG_BY_KEY: Record<VenueGameKey, string> = {
  // Live Trivia: smooth broadcast gradient (The Anchor)
  live_trivia: "bg-[linear-gradient(132deg,#06b6d4_0%,#0ea5e9_40%,#2563eb_100%)]",
  // Speed Trivia: near-black navy — neon border provides the accent (The Sprint)
  "speed-trivia": "bg-[linear-gradient(160deg,#080f1f_0%,#0c1535_100%)]",
  // Bingo: solid stadium orange with dark ink bottom edge (The Wild Card)
  bingo:       "bg-[linear-gradient(to_bottom,#ea580c_0%,#ea580c_85%,#1c0400_85%,#1c0400_100%)]",
  // Pick 'Em: dark field with indigo left stripe — head-to-head split (The Rival)
  pickem:      "bg-[linear-gradient(to_right,#4338ca_0%,#4338ca_6%,#0f172a_6%,#0f172a_100%)]",
  // Fantasy: deep violet — premium collectible (The Dynasty)
  fantasy:     "bg-[linear-gradient(145deg,#2e1065_0%,#1e0a4e_55%,#3b0764_100%)]",
};

// Per-game button border replaces the universal white/90 border
const GAME_CARD_BORDER_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "!border-cyan-300/70",
  "speed-trivia": "!border-blue-400",
  bingo:       "!border-white/90",
  pickem:      "!border-indigo-400/70",
  fantasy:     "!border-violet-400/50",
};

// Only Live Trivia and Fantasy get the radial sheen (premium / broadcast); flat-texture games skip it
const GAME_CARD_SHEEN_BY_KEY: Record<VenueGameKey, boolean> = {
  live_trivia: true,
  "speed-trivia": false,
  bingo:       false,
  pickem:      false,
  fantasy:     true,
};

const GAME_TITLE_LINES_BY_KEY: Record<VenueGameKey, string[]> = {
  "speed-trivia": ["Hightop", "Speed Trivia"],
  live_trivia: ["Hightop", "Live Trivia"],
  bingo: ["Hightop", "Sports Bingo™"],
  pickem: ["Hightop", "Pick 'Em™"],
  fantasy: ["Hightop", "Fantasy™"],
};
const VENUE_HUB_TILE_GRADIENT_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "linear-gradient(132deg,#06b6d4 0%,#0ea5e9 48%,#2563eb 100%)",
  "speed-trivia": "linear-gradient(132deg,#f59e0b 0%,#f97316 52%,#ea580c 100%)",
  bingo: "linear-gradient(128deg,#10b981 0%,#14b8a6 52%,#0f766e 100%)",
  pickem: "linear-gradient(134deg,#3b82f6 0%,#6366f1 55%,#4f46e5 100%)",
  fantasy: "linear-gradient(134deg,#a855f7 0%,#8b5cf6 52%,#7c3aed 100%)",
};
const VENUE_HUB_TILE_SUBTITLE_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "Synchronized bar trivia played against everyone else around you. Don't let them see your answers!",
  "speed-trivia": "It's just you versus the clock. 15 seconds per question, 15 questions per round, and 3 rounds per hour. Good luck! ",
  bingo: "Bingo boards align with the games on TV. Watch the game, track your squares in real time, and earn points as the live action unfolds!",
  pickem: "Predict the winners of today's top matchups before the games start. Every correct call gets you one step closer to prizes and discounts!",
  fantasy: "Draft the ultimate roster from the star athletes in today's games. The better they perform, the more points you earn! ",
};
const VENUE_HUB_GAME_ORDER: VenueGameKey[] = ["live_trivia", "speed-trivia", "bingo", "pickem", "fantasy"];
const VENUE_DRAWER_MENU_ITEMS: VenueMenuItem[] = [
  {
    label: "Career Stats",
    description: "Track your lifetime performance across every game.",
    href: "/active-games",
  },
  {
    label: "FAQs",
    description: "Get quick answers about gameplay and prizes.",
    href: "/faqs",
  },
  {
    label: "Advertise With Us",
    description: "Submit the advertiser intake form.",
    href: "/advertise",
  },
  {
    label: "Redeem Prizes",
    description: "See earned rewards and prize redemptions.",
    href: "/redeem-prizes",
  },
];

const SWIPE_SCREEN_COUNT = 3;
const FETCH_TIMEOUT_MS = 4500;
const BADGE_FETCH_TIMEOUT_MS = 3500;
const ARRIVAL_CORE_MAX_WAIT_MS = 1800;
const ARRIVAL_WATCHDOG_TIMEOUT_MS = 8000;
const ARRIVAL_RECOVERY_ATTEMPT_KEY = "tp:venue-arrival-recovery-attempt";
const BOOTSTRAP_QUOTA_FRESH_MS = 30_000;
const SHOULD_DEBUG_LIVE_TRIVIA = process.env.NODE_ENV !== "production";

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatLongCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function debugLiveTrivia(message: string, details: Record<string, unknown>) {
  if (!SHOULD_DEBUG_LIVE_TRIVIA) return;
  console.info(`[live-trivia][venue-hub] ${message}`, details);
}

function formatBadgeCount(value: number): string {
  const safeCount = Math.max(0, Math.floor(value));
  if (safeCount > 99) {
    return "99+";
  }
  return String(safeCount);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function areHomeBadgeCountsEqual(left: HomeBadgeCounts, right: HomeBadgeCounts): boolean {
  const leftBingo = Math.max(0, Number(left.bingo ?? 0));
  const leftPickEm = Math.max(0, Number(left.pickem ?? 0));
  const leftFantasy = Math.max(0, Number(left.fantasy ?? 0));
  const rightBingo = Math.max(0, Number(right.bingo ?? 0));
  const rightPickEm = Math.max(0, Number(right.pickem ?? 0));
  const rightFantasy = Math.max(0, Number(right.fantasy ?? 0));
  return leftBingo === rightBingo && leftPickEm === rightPickEm && leftFantasy === rightFantasy;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const safeMs = Math.max(0, Math.floor(ms));
    window.setTimeout(resolve, safeMs);
  });
}

function dateKeyInTimeZone(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return formatter.format(date);
}

function hourInTimeZone(date: Date, timeZone?: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
  const hourPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return Number.isFinite(hour) ? hour : date.getHours();
}

function formatLiveTriviaNextGameLabel(startAt: Date, timeZone?: string): string {
  const now = new Date();
  const startDayKey = dateKeyInTimeZone(startAt, timeZone);
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateKeyInTimeZone(tomorrow, timeZone);
  const startHour = hourInTimeZone(startAt, timeZone);

  const timeLabel = startAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
    timeZoneName: "short",
  });

  if (startDayKey === todayKey) {
    return `Next Game: ${startHour < 17 ? "Today" : "Tonight"} at ${timeLabel}`;
  }

  if (startDayKey === tomorrowKey) {
    return `Next Game: Tomorrow at ${timeLabel}`;
  }

  const dayLabel = startAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
  return `Next Game: ${dayLabel} at ${timeLabel}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS, externalSignal?: AbortSignal): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, Math.max(300, Math.floor(timeoutMs)));
  const onExternalAbort = externalSignal
    ? () => controller.abort()
    : undefined;
  if (externalSignal && onExternalAbort) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (externalSignal?.aborted) return null;
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function pathMatches(expectedPath: string, candidatePath: string): boolean {
  if (!expectedPath) {
    return true;
  }
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`);
}

function isActiveMenuPath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }
  if (href.startsWith("/venue/")) {
    return pathname.startsWith("/venue/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isPasskeyUserCancel(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  const name = String(err.name ?? "");
  const code = String(err.code ?? "");
  // Name/code checks work across module boundaries (no instanceof required)
  if (name === "NotAllowedError" || name === "AbortError") return true;
  if (code === "ERROR_CEREMONY_ABORTED") return true;
  // instanceof fallbacks when module identity is intact
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  if (error instanceof WebAuthnError) {
    return error.code === "ERROR_CEREMONY_ABORTED";
  }
  return false;
}

function hasFreshBootstrapTriviaQuota(snapshot: VenueHomeBootstrapSnapshot | null): boolean {
  if (!snapshot?.triviaQuota) {
    return false;
  }
  const fetchedAt = Number(snapshot.fetchedAt ?? 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return false;
  }
  return Date.now() - fetchedAt <= BOOTSTRAP_QUOTA_FRESH_MS;
}

const venueDebugEnabled =
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  (() => {
    try {
      const search = new URLSearchParams(window.location.search);
      return search.get("tpDebug") === "1";
    } catch {
      return false;
    }
  })();

function venueDebugLog(message: string, details?: Record<string, unknown>) {
  if (!venueDebugEnabled) {
    return;
  }
   
  console.log(`[tp-debug][venue-home] ${message}`, details ?? {});
}

const GAME_LOCKUP_SRC: Record<VenueGameKey, string> = {
  "speed-trivia": "/brand/speed_trivia_icon.png",
  live_trivia: "/brand/live_trivia_icon.png",
  bingo: "/brand/bingo_icon.png",
  pickem: "/brand/pickem_icon.png",
  fantasy: "/brand/fantasy_icon.png",
};

function GameLockup({ gameKey, className = "" }: { gameKey: VenueGameKey; className?: string }) {
  return (
    <img
      src={GAME_LOCKUP_SRC[gameKey]}
      alt=""
      aria-hidden="true"
      className={`w-full h-full object-contain ${className}`}
    />
  );
}

function TriviaGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="24" fill="#f59e0b" stroke="#0f172a" strokeWidth="4" />
      <path d="M16 32h32M32 16v32" stroke="#0f172a" strokeWidth="3.4" opacity="0.28" />
      <path d="M32 20c6 0 10 4 10 8 0 3-2 5-4 7-2 2-3 3-3 6" stroke="#0f172a" strokeWidth="4.2" fill="none" strokeLinecap="round" />
      <circle cx="35" cy="47" r="2.6" fill="#0f172a" />
    </svg>
  );
}

function BingoGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="24" fill="#fb923c" stroke="#0f172a" strokeWidth="4" />
      <path d="M10 32h44M32 10v44" stroke="#0f172a" strokeWidth="3" opacity="0.28" />
      <path d="M16 20c10 8 22 17 32 24" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M16 44c10-8 22-17 32-24" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function PickEmGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M19 14h26v8l-5 8H24l-5-8z" fill="#fde68a" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 30h20v6c0 6-4 12-10 12s-10-6-10-12z" fill="#facc15" stroke="#0f172a" strokeWidth="4" />
      <path d="M15 18c-3 0-6 2-6 5 0 4 3 8 8 8" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M49 18c3 0 6 2 6 5 0 4-3 8-8 8" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="m26 36 4 4 8-9" fill="none" stroke="#1d4ed8" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FantasyGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M32 8 50 16v14c0 12-7 21-18 26C21 51 14 42 14 30V16z" fill="#34d399" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
      <path d="m32 20 3.8 7.6 8.4 1.2-6.1 5.9 1.4 8.3-7.5-3.9-7.5 3.9 1.4-8.3-6.1-5.9 8.4-1.2z" fill="#fef08a" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d="M20 10h24v10c0 8-5 15-12 18-7-3-12-10-12-18z" fill="#fcd34d" stroke="#0f172a" strokeWidth="4" />
      <path d="M24 38h16v8H24z" fill="#f59e0b" stroke="#0f172a" strokeWidth="4" />
      <path d="M18 46h28v8H18z" fill="#facc15" stroke="#0f172a" strokeWidth="4" />
      <path d="M44 14h8c0 7-4 12-10 13" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 14h-8c0 7 4 12 10 13" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="21" r="4" fill="#fef9c3" stroke="#0f172a" strokeWidth="3" />
    </svg>
  );
}

function SpeedTriviaGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <polygon
        points="38,4 16,36 30,36 26,60 48,28 34,28"
        fill="#fbbf24"
        stroke="#78350f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="38,4 16,36 30,36 26,60 48,28 34,28"
        fill="none"
        stroke="#fef08a"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}

function LiveTriviaGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path
        d="M32 18c7 0 12 4.5 12 10 0 3.5-2.5 6.5-5.5 8.5-2.5 1.5-3.5 3-3.5 6.5"
        stroke="white"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="35" cy="49.5" r="3.5" fill="white" />
    </svg>
  );
}

function GameGlyph({ gameKey }: { gameKey: VenueGameKey }) {
  if (gameKey === "speed-trivia") return <TriviaGlyph />;
  if (gameKey === "live_trivia") return <TriviaGlyph />;
  if (gameKey === "bingo") return <BingoGlyph />;
  if (gameKey === "pickem") return <PickEmGlyph />;
  if (gameKey === "fantasy") return <FantasyGlyph />;
  return <TriviaGlyph />;
}

type ChallengeGameType = "live_trivia" | "speed-trivia" | "bingo" | "pickem" | "fantasy" | "unknown";

function inferChallengeGameType(name: string): ChallengeGameType {
  const lower = name.toLowerCase();
  if (lower.includes("live trivia") || lower.includes("live showdown") || lower.includes("showdown")) return "live_trivia";
  if (lower.includes("speed trivia") || lower.includes("trivia")) return "speed-trivia";
  if (lower.includes("bingo")) return "bingo";
  if (lower.includes("pick") || lower.includes("pick 'em") || lower.includes("pickem")) return "pickem";
  if (lower.includes("fantasy")) return "fantasy";
  return "unknown";
}

const CHALLENGE_ICON_STYLE: Record<
  ChallengeGameType,
  { badgeBg: string; borderColor: string; barGradient: string; cardAccent: string }
> = {
  // Dark navy → blue, white ? mark — matches Live Trivia badge in mockup
  live_trivia: {
    badgeBg: "linear-gradient(145deg, #0c1445, #1d4ed8, #3b82f6)",
    borderColor: "rgba(59,130,246,0.55)",
    barGradient: "linear-gradient(90deg, #0891b2, #22d3ee)",
    cardAccent: "rgba(59,130,246,0.25)",
  },
  // Very dark bg, bright amber lightning bolt — matches Speed Trivia badge in mockup
  "speed-trivia": {
    badgeBg: "linear-gradient(145deg, #0d0900, #1a1200, #261900)",
    borderColor: "rgba(251,191,36,0.55)",
    barGradient: "linear-gradient(90deg, #d97706, #fbbf24, #84cc16)",
    cardAccent: "rgba(251,191,36,0.2)",
  },
  // Orange gradient — Bingo
  bingo: {
    badgeBg: "linear-gradient(145deg, #7c2d12, #c2410c, #f97316)",
    borderColor: "rgba(249,115,22,0.55)",
    barGradient: "linear-gradient(90deg, #ea580c, #fb923c)",
    cardAccent: "rgba(249,115,22,0.2)",
  },
  // Amber/yellow gradient badge, fuchsia/purple progress — matches Pick 'Em badge in mockup
  pickem: {
    badgeBg: "linear-gradient(145deg, #78350f, #b45309, #f59e0b)",
    borderColor: "rgba(245,158,11,0.55)",
    barGradient: "linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)",
    cardAccent: "rgba(245,158,11,0.2)",
  },
  // Purple badge, purple→emerald progress — matches Fantasy badge in mockup
  fantasy: {
    badgeBg: "linear-gradient(145deg, #2d1b69, #4c1d95, #6d28d9)",
    borderColor: "rgba(109,40,217,0.55)",
    barGradient: "linear-gradient(90deg, #7c3aed, #8b5cf6, #10b981)",
    cardAccent: "rgba(109,40,217,0.25)",
  },
  unknown: {
    badgeBg: "linear-gradient(145deg, #0f766e, #0891b2, #22d3ee)",
    borderColor: "rgba(34,211,238,0.45)",
    barGradient: "linear-gradient(90deg, #0891b2, #22d3ee)",
    cardAccent: "rgba(34,211,238,0.15)",
  },
};

function ChallengeIconBadge({ gameType }: { gameType: ChallengeGameType }) {
  const s = CHALLENGE_ICON_STYLE[gameType];
  return (
    <div
      className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg"
      style={{ background: s.badgeBg, border: `2px solid ${s.borderColor}` }}
    >
      {gameType === "live_trivia" ? <LiveTriviaGlyph className="h-8 w-8" /> : null}
      {gameType === "speed-trivia" ? <SpeedTriviaGlyph className="h-8 w-8" /> : null}
      {gameType === "bingo" ? <BingoGlyph className="h-8 w-8" /> : null}
      {gameType === "pickem" ? <PickEmGlyph className="h-8 w-8" /> : null}
      {gameType === "fantasy" ? <FantasyGlyph className="h-8 w-8" /> : null}
      {gameType === "unknown" ? <TrophyGlyph className="h-8 w-8" /> : null}
    </div>
  );
}

function VenueHubClientInner({ venue, initialEntries = [] }: { venue: Venue; initialEntries?: LeaderboardEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Bootstrap snapshot and entry handoff are read from sessionStorage ONLY after
  // mount (in useEffect). Reading them during render would produce different values
  // on the server (no sessionStorage) vs. the client, causing a hydration mismatch.
  const bootstrapSnapshotRef = useRef<VenueHomeBootstrapSnapshot | null>(null);
  const entryHandoffRef = useRef(false);
  const [pendingDestination, setPendingDestination] = useState<VenueGameKey | null>(null);
  const [pendingChallengeRedeemId, setPendingChallengeRedeemId] = useState<string | null>(null);
  // All state below is initialized to server-safe "no bootstrap" defaults.
  // The useEffect at the top of the effect list reads sessionStorage and corrects
  // these values on the client immediately after mount.
  const [triviaQuota, setTriviaQuota] = useState<TriviaQuotaSnapshot | null>(null);
  const [triviaUnlockSeconds, setTriviaUnlockSeconds] = useState(0);
  const [triviaGateNotice, setTriviaGateNotice] = useState("");
  const [homeBadgeCounts, setHomeBadgeCounts] = useState<HomeBadgeCounts>({});
  const [dismissedBadgeGames, setDismissedBadgeGames] = useState<Set<VenueGameKey>>(new Set());
  const [challengeCards, setChallengeCards] = useState<ChallengeCampaignCard[]>([]);
  const [isChallengesLoading, setIsChallengesLoading] = useState(true);
  const [challengesError, setChallengesError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuUsername, setMenuUsername] = useState("");
  const [menuPoints, setMenuPoints] = useState(0);
  const [isPasskeySetupLoading, setIsPasskeySetupLoading] = useState(false);
  const [passkeySetupMessage, setPasskeySetupMessage] = useState("");
  const [passkeySetupError, setPasskeySetupError] = useState("");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isBadgeLoading, setIsBadgeLoading] = useState(true);
  const [badgeError, setBadgeError] = useState("");
  const [liveTriviaStatus, setLiveTriviaStatus] = useState<{
    live: boolean;
    label: string;
    nextStartAtMs: number | null;
    failureReason: LiveTriviaPayloadFailureReason | "network" | null;
  }>({ live: false, label: "Status unavailable", nextStartAtMs: null, failureReason: "network" });
  const [liveCountdownNowMs, setLiveCountdownNowMs] = useState(() => Date.now());
  const [leaderboardBootstrapEntries, setLeaderboardBootstrapEntries] = useState<LeaderboardEntry[]>([]);
  const [activeScreen, setActiveScreen] = useState<HomeScreenIndex>(0);
  const [homeRevealComplete, setHomeRevealComplete] = useState(true);
  // Arrival flow always runs initially (consistent with SSR); corrected after mount.
  const [arrivalStage, setArrivalStage] = useState<VenueArrivalStage>("identity");
  const [arrivalProgress, setArrivalProgress] = useState(8);
  const [arrivalStatusText, setArrivalStatusText] = useState("Securing your venue access...");
  const [arrivalOverlayCleared, setArrivalOverlayCleared] = useState(true);
  const [arrivalCoreReady, setArrivalCoreReady] = useState(false);
  const [arrivalInProgress, setArrivalInProgress] = useState(true);
  const [carouselBootstrapped, setCarouselBootstrapped] = useState(false);
  const venueReadyDispatchedRef = useRef(false);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollTickingRef = useRef(false);
  const activeScreenRef = useRef<HomeScreenIndex>(0);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);
  const badgeRequestRef = useRef<AbortController | null>(null);
  const campaignRequestRef = useRef<AbortController | null>(null);
  const liveTriviaRequestRef = useRef<AbortController | null>(null);
  const contentReady = !arrivalInProgress && homeRevealComplete && carouselBootstrapped;

  const hasUserTokenInCookie = useCallback((): boolean => {
    if (typeof document === "undefined") return false;
    try {
      return document.cookie.split(";").some((chunk) => chunk.trim().startsWith("tp_user_id="));
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const entryUser = (params.get("entryUser") ?? "").trim();
    const entryVenue = (params.get("entryVenue") ?? "").trim();
    if (!entryUser) {
      return;
    }
    if (entryVenue && entryVenue !== venue.id) {
      return;
    }

    // URL handoff fallback: if storage/cookie writes were flaky on join,
    // recover identity here before redirect checks run.
    saveUserId(entryUser);
    saveVenueId(venue.id);

    const cleanPath = `/venue/${encodeURIComponent(venue.id)}`;
    router.replace(cleanPath);
  }, [router, venue.id]);

  // This effect runs first on mount and must be declared before any effect that
  // reads entryHandoffRef or bootstrapSnapshotRef.
  useEffect(() => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setArrivalOverlayCleared(true);
      return;
    }

    const snapshot = consumeVenueHomeBootstrap({ venueId: venue.id, userId });
    const sessionHandoff = consumeVenueHomeEntryHandoff({ venueId: venue.id, userId });

    // Fall back to URL params as a secondary handoff signal when sessionStorage
    // was cleared or expired before this effect ran (e.g. on slow connections).
    let handoff = sessionHandoff;
    if (!handoff) {
      const params = new URLSearchParams(window.location.search);
      const urlEntryUser = (params.get("entryUser") ?? "").trim();
      const urlEntryVenue = (params.get("entryVenue") ?? "").trim();
      const urlEntryAt = Number(params.get("entryAt") ?? "");
      handoff = Boolean(
        urlEntryUser &&
        (!urlEntryVenue || urlEntryVenue === venue.id) &&
        Number.isFinite(urlEntryAt) &&
        Date.now() - urlEntryAt <= 60_000
      );
    }

    bootstrapSnapshotRef.current = snapshot;
    entryHandoffRef.current = handoff;

    if (snapshot) {
      setTriviaQuota(snapshot.triviaQuota ?? null);
      const quota = snapshot.triviaQuota ?? null;
      const isLocked = Boolean(quota && !quota.isAdminBypass && quota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(quota?.windowSecondsRemaining ?? 0)) : 0);
      // Ignore cached badge snapshots so stale red bubbles never appear.
      // Badges are populated only from fresh unclaimed-points fetches.
      setHomeBadgeCounts({});
      if (snapshot.leaderboardEntries && snapshot.leaderboardEntries.length > 0) {
        setLeaderboardBootstrapEntries(snapshot.leaderboardEntries);
      }
      setArrivalCoreReady(true);
    }

    if (!handoff) {
      setArrivalOverlayCleared(true);
      return;
    }

    // Fresh login: wait for the join-flow's global transition overlay to clear.
    const expectedPath = window.location.pathname;
    const onOverlayHidden = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string } | undefined>).detail;
      const hiddenPath = String(detail?.path ?? "").trim();
      if (!pathMatches(expectedPath, hiddenPath)) return;
      setArrivalOverlayCleared(true);
    };
    window.addEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
    const fallbackTimer = window.setTimeout(() => {
      setArrivalOverlayCleared(true);
    }, 2500);

    return () => {
      window.removeEventListener("tp:global-transition-overlay-hidden", onOverlayHidden as EventListener);
      window.clearTimeout(fallbackTimer);
    };
     
  }, [venue.id]);

  useEffect(() => {
    // entryHandoffRef is set by the bootstrap effect above, which runs first.
    // Skip the redirect guard entirely when the user just came through the join flow.
    if (entryHandoffRef.current) {
      logAuthIncident("venue-hub-guard", "skip-redirect-guard-entry-handoff", { venueId: venue.id });
      return;
    }
    if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
      logAuthIncident("venue-hub-guard", "skip-redirect-guard-recent-intent", { venueId: venue.id });
      return;
    }
    const storedUserId = (getUserId() ?? "").trim();
    const storedVenueId = (getVenueId() ?? "").trim();
    if (storedUserId) {
      if (storedVenueId && storedVenueId !== venue.id) {
        const target = `/?v=${venue.id}`;
        logAuthIncident("venue-hub-guard", "redirect-stored-venue-mismatch", {
          venueId: venue.id,
          storedVenueId,
          target,
        });
        router.replace(target);
      }
      return;
    }
    // On slow connections the entryAt URL param may still be present at mount
    // time even though the handoff wasn't found in sessionStorage. Use it as a
    // proxy for "a login transition just happened" and double the patience window.
    const mountParams = new URLSearchParams(window.location.search);
    const mountEntryAt = Number(mountParams.get("entryAt") ?? "");
    const isLoginTransition = Number.isFinite(mountEntryAt) && Date.now() - mountEntryAt <= 60_000;
    const redirectDelay = isLoginTransition ? 10_000 : 5_000;
    const timer = window.setTimeout(() => {
      if (hasRecentVenueHomeRouteIntent({ venueId: venue.id, maxAgeMs: 30000 })) {
        return;
      }
      const lateUserId = (getUserId() ?? "").trim();
      const lateVenueId = (getVenueId() ?? "").trim();
      if (lateUserId) {
        if (lateVenueId && lateVenueId !== venue.id) {
          const target = `/?v=${venue.id}`;
          logAuthIncident("venue-hub-guard", "redirect-late-venue-mismatch", {
            venueId: venue.id,
            lateVenueId,
            target,
          });
          router.replace(target);
        }
        return;
      }
      if (!hasUserTokenInCookie()) {
        const target = `/?v=${venue.id}`;
        logAuthIncident("venue-hub-guard", "redirect-missing-user-cookie", {
          venueId: venue.id,
          redirectDelay,
          isLoginTransition,
          target,
        });
        console.warn(`[VenueHub] Redirecting to login: no user token found after ${redirectDelay}ms guard (loginTransition=${isLoginTransition})`);
        router.replace(target);
      }
    }, redirectDelay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUserTokenInCookie, venue.id]);

  const venueDisplayName = getVenueDisplayName(venue as any);

  useEffect(() => {
    if (venueReadyDispatchedRef.current || typeof window === "undefined" || !homeRevealComplete) {
      return;
    }
    clearLoginInProgress();
    venueReadyDispatchedRef.current = true;
    const rafId = window.requestAnimationFrame(() => {
      try {
        window.sessionStorage.setItem(
          "tp:venue-home-ready:v1",
          JSON.stringify({ path: window.location.pathname, at: Date.now() })
        );
      } catch {
        // Ignore storage failures on restricted browsers.
      }
      window.dispatchEvent(
        new CustomEvent("tp:venue-home-ready", {
          detail: { path: window.location.pathname },
        })
      );
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [homeRevealComplete]);

  const triggerPulse = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      (navigator as any).vibrate?.(14);
    } catch {}
  };

  const leaveVenue = () => {
    try {
      (navigator as any).vibrate?.([22, 40, 22]);
    } catch {}
    clearVenueSession();
    router.push("/");
  };

  const goToScreen = useCallback((screenIndex: HomeScreenIndex) => {
    const viewport = swipeViewportRef.current;
    if (!viewport) return;
    const nextIndex = clamp(screenIndex, 0, SWIPE_SCREEN_COUNT - 1) as HomeScreenIndex;
    if (nextIndex === activeScreenRef.current) return;
    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior: "smooth" });
    setActiveScreen(nextIndex);
    activeScreenRef.current = nextIndex;
  }, []);

  const onCarouselScroll = useCallback(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport || scrollTickingRef.current) return;
    scrollTickingRef.current = true;
    window.requestAnimationFrame(() => {
      scrollTickingRef.current = false;
      const panelWidth = Math.max(1, viewport.clientWidth);
      const nextIndex = clamp(Math.round(viewport.scrollLeft / panelWidth), 0, SWIPE_SCREEN_COUNT - 1) as HomeScreenIndex;
      if (nextIndex === activeScreenRef.current) return;
      activeScreenRef.current = nextIndex;
      setActiveScreen(nextIndex);
    });
  }, []);

  useLayoutEffect(() => {
    const viewport = swipeViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = viewport.clientWidth * activeScreenRef.current;
    setCarouselBootstrapped(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const viewport = swipeViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ left: viewport.clientWidth * activeScreenRef.current, behavior: "auto" });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const loadTriviaQuota = useCallback(async (): Promise<TriviaQuotaSnapshot | null> => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setTriviaQuota(null);
      setTriviaUnlockSeconds(0);
      return null;
    }
    try {
      const payload = await fetchJsonWithTimeout<{ ok?: boolean; quota?: TriviaQuotaSnapshot | null }>(
        `/api/trivia/quota?userId=${encodeURIComponent(userId)}`
      );
      if (!payload?.ok) return null;
      const nextQuota = payload.quota ?? null;
      setTriviaQuota(nextQuota);
      const isLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      return nextQuota;
    } catch {
      return null;
    }
  }, []);

  const verifyActiveVenueSession = useCallback(async (): Promise<boolean> => {
    const userId = (getUserId() ?? "").trim();
    const venueId = (getVenueId() ?? "").trim();
    if (!userId || !venueId || venueId !== venue.id) {
      return false;
    }
    const payload = await fetchJsonWithTimeout<UserSummaryPayload>(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}`,
      3600
    );
    if (!payload?.ok || !payload.profile) {
      return false;
    }
    return String(payload.profile.venueId ?? "").trim() === venue.id;
  }, [venue.id]);

  const loadMenuSummary = useCallback(async () => {
    const userId = (getUserId() ?? "").trim();
    const venueId = (getVenueId() ?? "").trim();
    if (!userId) {
      setMenuUsername("");
      setMenuPoints(0);
      return;
    }

    const fallbackUsername = (getUsername() ?? "").trim();
    if (fallbackUsername) {
      setMenuUsername(fallbackUsername);
    }

    const payload = await fetchJsonWithTimeout<UserSummaryPayload>(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
      3600
    );
    if (!payload?.ok || !payload.profile) {
      return;
    }
    const nextUsername = String(payload.profile.username ?? "").trim();
    const nextPoints = Math.max(0, Math.round(Number(payload.profile.points ?? 0)));
    if (nextUsername) {
      setMenuUsername(nextUsername);
    }
    setMenuPoints(nextPoints);
    setHasPasskey(Boolean(payload.hasPasskey));
  }, []);

  const handlePasskeySetup = useCallback(async () => {
    setPasskeySetupError("");
    setPasskeySetupMessage("");

    if (!browserSupportsWebAuthn()) {
      setPasskeySetupError("This browser does not support passkey setup.");
      return;
    }

    const userId = (getUserId() ?? "").trim();
    const venueId = venue.id;
    const username = (getUsername() ?? menuUsername).trim();
    const accountId = (getAccountId() ?? "").trim();
    if (!userId || !venueId || (!username && !accountId)) {
      setPasskeySetupError("Please sign in again before setting up a passkey.");
      return;
    }

    setIsPasskeySetupLoading(true);
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    logAuthIncident("venue-passkey", "setup-start", {
      venueId,
      userId,
      username,
      userAgent,
    });

    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(accountId ? { accountId } : {}),
          userId,
          venueId,
          username,
        }),
      });
      const optionsPayload = (await optionsResponse.json().catch(() => null)) as PasskeyRegisterOptionsPayload | null;
      if (!optionsResponse.ok || !optionsPayload?.ok || !optionsPayload.options || !optionsPayload.challengeId) {
        const mappedMessage = getPasskeyClientMessage(
          optionsPayload?.errorCode,
          optionsPayload?.error || "Passkey setup could not be started."
        );
        setPasskeySetupError(mappedMessage);
        logAuthIncident("venue-passkey", "setup-options-failed", {
          venueId,
          userId,
          code: optionsPayload?.errorCode ?? null,
          message: optionsPayload?.error ?? null,
        });
        return;
      }

      const registrationResponse = await startRegistration({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: optionsPayload.challengeId,
          response: registrationResponse,
          userId,
          venueId,
        }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as PasskeyRegisterVerifyPayload | null;
      if (!verifyResponse.ok || !verifyPayload?.ok) {
        const mappedMessage = getPasskeyClientMessage(
          verifyPayload?.errorCode,
          verifyPayload?.error || "Passkey setup verification failed."
        );
        setPasskeySetupError(mappedMessage);
        logAuthIncident("venue-passkey", "setup-verify-failed", {
          venueId,
          userId,
          code: verifyPayload?.errorCode ?? null,
          message: verifyPayload?.error ?? null,
        });
        return;
      }

      setPasskeySetupMessage("Passkey enabled. Next login can use Face ID, Touch ID, or device PIN.");
      setHasPasskey(true);
      logAuthIncident("venue-passkey", "setup-success", { venueId, userId });
    } catch (error) {
      if (isPasskeyUserCancel(error)) {
        setPasskeySetupError("");
        logAuthIncident("venue-passkey", "setup-canceled", { venueId, userId });
      } else {
        const fallback = error instanceof Error ? error.message : "Passkey setup failed.";
        setPasskeySetupError(getPasskeyClientMessage(undefined, fallback));
        logAuthIncident("venue-passkey", "setup-error", {
          venueId,
          userId,
          message: fallback,
        });
      }
    } finally {
      setIsPasskeySetupLoading(false);
    }
  }, [menuUsername, venue.id]);

  const loadHomeBadges = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setHomeBadgeCounts((current) => (areHomeBadgeCountsEqual(current, {}) ? current : {}));
      if (!silent) {
        setIsBadgeLoading(false);
      }
      return;
    }
    badgeRequestRef.current?.abort();
    const controller = new AbortController();
    badgeRequestRef.current = controller;
    const signal = controller.signal;
    if (!silent) {
      setIsBadgeLoading(true);
    }
    setBadgeError((current) => (current ? "" : current));
    try {
      const results = await Promise.allSettled([
        fetchJsonWithTimeout<BingoBadgePayload>(
          `/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as BingoBadgePayload)),
        fetchJsonWithTimeout<PickEmBadgePayload>(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}&includeSettled=true&limit=200`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as PickEmBadgePayload)),
        fetchJsonWithTimeout<FantasyBadgePayload>(
          `/api/fantasy/entries?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venue.id)}&includeSettled=true&refreshProgress=true&limit=120`,
          BADGE_FETCH_TIMEOUT_MS,
          signal
        ).then((payload) => payload ?? ({ ok: false } as FantasyBadgePayload)),
      ]);
      if (signal.aborted) return;
      const bingoPayload = results[0].status === "fulfilled" ? results[0].value : { ok: false as const };
      const pickEmPayload = results[1].status === "fulfilled" ? results[1].value : { ok: false as const };
      const fantasyPayload = results[2].status === "fulfilled" ? results[2].value : { ok: false as const };
      const unclaimedBingoCount = bingoPayload.ok
        ? (bingoPayload.cards ?? []).filter(
            (card) => card.status === "won" && !card.rewardClaimedAt && Math.max(0, Number(card.rewardPoints ?? 0)) > 0
          ).length
        : 0;
      const unclaimedPickEmCount = pickEmPayload.ok
        ? (pickEmPayload.picks ?? []).filter(
            (pick) =>
              pick.status === "won" &&
              !pick.rewardClaimedAt &&
              Math.max(0, Number(pick.rewardPoints ?? 0)) > 0
          ).length
        : 0;
      const unclaimedFantasyCount = fantasyPayload.ok
        ? (fantasyPayload.entries ?? []).filter(
            (entry) =>
              entry.status === "final" &&
              !entry.rewardClaimedAt &&
              Math.max(0, Number(entry.points ?? 0)) > 0
          ).length
        : 0;
      const nextCounts: HomeBadgeCounts = {
        bingo: unclaimedBingoCount,
        pickem: unclaimedPickEmCount,
        fantasy: unclaimedFantasyCount,
      };
      setHomeBadgeCounts((current) => (areHomeBadgeCountsEqual(current, nextCounts) ? current : nextCounts));
    } catch {
      if (!signal.aborted) {
        setBadgeError((current) => (current === "Offline: badge counts unavailable." ? current : "Offline: badge counts unavailable."));
      }
    } finally {
      if (badgeRequestRef.current === controller) {
        badgeRequestRef.current = null;
      }
      if (!silent && !signal.aborted) {
        setIsBadgeLoading(false);
      }
    }
  }, [venue.id]);

  const loadChallengeCampaigns = useCallback(
    async (options?: { silent?: boolean }) => {
      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
      const silent = Boolean(options?.silent);
      campaignRequestRef.current?.abort();
      const controller = new AbortController();
      campaignRequestRef.current = controller;
      const signal = controller.signal;
      if (!venueId) {
        if (campaignRequestRef.current === controller) {
          campaignRequestRef.current = null;
        }
        setIsChallengesLoading(false);
        return;
      }
      if (!silent) {
        setIsChallengesLoading(true);
      }
      setChallengesError("");
      try {
        const query = new URLSearchParams({
          venueId,
          includeInactive: "true",
          includeResolved: "true",
        });
        if (userId) {
          query.set("userId", userId);
        }
        const body = await fetchJsonWithTimeout<ChallengeCampaignPayload>(
          `/api/challenge-campaigns?${query.toString()}`,
          FETCH_TIMEOUT_MS,
          signal
        );
        if (signal.aborted) return;
        if (!body?.ok) {
          throw new Error("Challenges unavailable.");
        }
        setChallengeCards(Array.isArray(body.campaigns) ? body.campaigns : []);
      } catch {
        if (!signal.aborted) {
          setChallengesError("Offline: challenges unavailable.");
        }
      } finally {
        if (campaignRequestRef.current === controller) {
          campaignRequestRef.current = null;
        }
        if (!silent && !signal.aborted) {
          setIsChallengesLoading(false);
        }
      }
    },
    []
  );

  const loadLiveTriviaStatus = useCallback(async () => {
    liveTriviaRequestRef.current?.abort();
    const controller = new AbortController();
    liveTriviaRequestRef.current = controller;
    const signal = controller.signal;
    try {
      const storedVenueId = String(getVenueId() ?? "").trim();
      const venueContext = resolveLiveTriviaVenueContext({
        routeVenueId: venue.id,
        storedVenueId,
      });
      const query = venueContext.venueId ? `?venueId=${encodeURIComponent(venueContext.venueId)}` : "";
      debugLiveTrivia("requesting_state", {
        venueId: venueContext.venueId,
        venueSource: venueContext.source,
      });
      const payload = await fetchJsonWithTimeout<{
        ok?: boolean;
        state?: {
          isGameActive?: boolean;
          nextSchedule?: { startTime?: string; timezone?: string } | null;
        };
      }>(`/api/trivia/live/state${query}`, 3600, signal);
      if (signal.aborted) return;

      const evaluation = evaluateLiveTriviaStatePayload(payload);
      debugLiveTrivia("state_summary", {
        venueId: venueContext.venueId,
        venueSource: venueContext.source,
        ok: Boolean(payload?.ok),
        isGameActive: Boolean(payload?.state?.isGameActive),
        hasNextSchedule: Boolean(payload?.state?.nextSchedule),
        nextStartTime: String(payload?.state?.nextSchedule?.startTime ?? "").trim() || null,
        resultKind: evaluation.kind,
        failureReason: evaluation.failureReason,
      });

      if (evaluation.kind === "live") {
        setLiveTriviaStatus({
          live: true,
          label: evaluation.label,
          nextStartAtMs: null,
          failureReason: null,
        });
        return;
      }

      if (evaluation.kind === "upcoming") {
        const nextStart = new Date(evaluation.nextStartAtMs);
        setLiveTriviaStatus({
          live: false,
          label: formatLiveTriviaNextGameLabel(nextStart, evaluation.scheduleTimezone || undefined),
          nextStartAtMs: evaluation.nextStartAtMs,
          failureReason: null,
        });
        return;
      }

      setLiveTriviaStatus({
        live: false,
        label: evaluation.label,
        nextStartAtMs: null,
        failureReason: evaluation.failureReason,
      });
    } catch {
      if (!signal.aborted) {
        debugLiveTrivia("state_fetch_failed", {
          venueId: venue.id,
          reason: "network",
        });
        setLiveTriviaStatus({
          live: false,
          label: "Status unavailable",
          nextStartAtMs: null,
          failureReason: "network",
        });
      }
    } finally {
      if (liveTriviaRequestRef.current === controller) {
        liveTriviaRequestRef.current = null;
      }
    }
  }, [venue.id]);

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) return warmupPromiseRef.current;
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) return;
    const p = (async () => {
      let warmedTriviaQuota: TriviaQuotaSnapshot | null = null;
      try {
        const [body, quotaBody] = await Promise.all([
          fetchJsonWithTimeout<{ ok?: boolean; questions?: unknown[] }>(`/api/trivia?userId=${encodeURIComponent(userId)}`),
          fetchJsonWithTimeout<{ ok?: boolean; quota?: TriviaQuotaSnapshot | null }>(
            `/api/trivia/quota?userId=${encodeURIComponent(userId)}`
          ),
        ]);
        if (quotaBody?.ok) {
          warmedTriviaQuota = quotaBody.quota ?? null;
          setTriviaQuota(warmedTriviaQuota);
          const isLocked = Boolean(warmedTriviaQuota && !warmedTriviaQuota.isAdminBypass && warmedTriviaQuota.questionsRemaining <= 0);
          setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(warmedTriviaQuota?.windowSecondsRemaining ?? 0)) : 0);
        }
        if (body?.ok && Array.isArray(body.questions)) {
          try {
            writeWarmTriviaCache({ userId, venueId, questions: body.questions as any, quota: warmedTriviaQuota });
          } catch {}
        }
      } catch {}
      try {
        const pb = await fetchJsonWithTimeout<any>("/api/predictions?page=1&pageSize=24&excludeSensitive=false");
        if (pb?.ok) {
          try {
            writeWarmPredictionsCache({ venueId, payload: pb });
          } catch {}
        }
      } catch {}
      try {
        await fetchJsonWithTimeout<{ ok?: boolean }>("/api/pickem/sports");
      } catch {}
      void loadHomeBadges({ silent: true });
    })();
    warmupPromiseRef.current = p;
    return p;
  }, [loadHomeBadges]);

  useEffect(() => {
    if (!arrivalInProgress) {
      return;
    }
    let cancelled = false;

    const loadArrivalPipeline = async () => {
      const startTime = Date.now();
      setArrivalStage("identity");
      setArrivalProgress(14);
      setArrivalStatusText("Checking your player session...");
      await wait(220);
      if (cancelled) {
        return;
      }

      setArrivalStage("core");
      setArrivalProgress(42);
      setArrivalStatusText("Loading your venue dashboard...");
      const bootstrapSnapshot = bootstrapSnapshotRef.current;
      const hasFreshBootstrapQuota = hasFreshBootstrapTriviaQuota(bootstrapSnapshot);
      if (!bootstrapSnapshot || !hasFreshBootstrapQuota) {
        // Validate credentials from local storage/cookie only — no blocking network call.
        // A network timeout returning null was being treated as "invalid session" and
        // wiping auth for users who had a perfectly valid cookie.
        const localUserId = (getUserId() ?? "").trim();
        const localVenueId = (getVenueId() ?? "").trim();
        if (!localUserId || !localVenueId || localVenueId !== venue.id || !hasUserTokenInCookie()) {
          if (!cancelled) {
            const target = `/?v=${encodeURIComponent(venue.id)}`;
            logAuthIncident("venue-hub-guard", "redirect-arrival-missing-identity", {
              venueId: venue.id,
              hasLocalUser: Boolean(localUserId),
              localVenueMatches: localVenueId === venue.id,
              hasCookie: hasUserTokenInCookie(),
              target,
            });
            console.warn(`[VenueHub] Redirecting to login during arrival: missing identity (userId=${!!localUserId}, venueMatch=${localVenueId === venue.id}, cookie=${hasUserTokenInCookie()})`);
            router.replace(target);
          }
          return;
        }
        const coreLoadTasks: Array<Promise<unknown>> = [loadHomeBadges()];
        if (!hasFreshBootstrapQuota) {
          coreLoadTasks.push(loadTriviaQuota());
        }
        const coreLoadPromise = Promise.allSettled(coreLoadTasks);
        await Promise.race([coreLoadPromise, wait(ARRIVAL_CORE_MAX_WAIT_MS)]);
        void coreLoadPromise.catch(() => {});
      } else {
        await wait(260);
      }
      if (cancelled) {
        return;
      }

      setArrivalCoreReady(true);
      setArrivalStage("warmup");
      setArrivalProgress(74);
      setArrivalStatusText("Warming up games and scores...");
      if (!warmupStartedRef.current) {
        warmupStartedRef.current = true;
        void runWarmup();
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        await wait(1200 - elapsed);
      }
      if (cancelled) {
        return;
      }

      setArrivalProgress(92);
      setArrivalStatusText("Finalizing your venue home...");
    };

    void loadArrivalPipeline();

    return () => {
      cancelled = true;
    };
  }, [arrivalInProgress, hasUserTokenInCookie, loadHomeBadges, loadTriviaQuota, router, runWarmup, venue.id]);

  useEffect(() => {
    if (!arrivalInProgress) {
      try {
        window.sessionStorage.removeItem(ARRIVAL_RECOVERY_ATTEMPT_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }
    const timer = window.setTimeout(() => {
      let recoveryAttempts = 0;
      try {
        recoveryAttempts = Number(window.sessionStorage.getItem(ARRIVAL_RECOVERY_ATTEMPT_KEY) ?? "0") || 0;
        window.sessionStorage.setItem(ARRIVAL_RECOVERY_ATTEMPT_KEY, String(recoveryAttempts + 1));
      } catch {
        recoveryAttempts = 0;
      }

      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
      if (recoveryAttempts < 1 && userId && venueId === venue.id) {
        window.location.replace(`/venue/${encodeURIComponent(venue.id)}?recoverAt=${Date.now()}`);
        return;
      }
      clearVenueSession();
      const target = `/?v=${encodeURIComponent(venue.id)}`;
      logAuthIncident("venue-hub-guard", "redirect-arrival-watchdog-reset", {
        venueId: venue.id,
        recoveryAttempts,
        hasUserId: Boolean(userId),
        venueMatches: venueId === venue.id,
        target,
      });
      router.replace(target);
    }, ARRIVAL_WATCHDOG_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [arrivalInProgress, router, venue.id]);

  useEffect(() => {
    if (!arrivalInProgress) {
      return;
    }
    if (!arrivalCoreReady || !arrivalOverlayCleared) {
      return;
    }
    const revealTimer = window.setTimeout(() => {
      setArrivalStage("ready");
      setArrivalProgress(100);
      setArrivalStatusText("Venue ready.");
      setArrivalInProgress(false);
      setHomeRevealComplete(true);
    }, 180);
    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [arrivalCoreReady, arrivalInProgress, arrivalOverlayCleared]);

  useEffect(() => {
    if (triviaUnlockSeconds <= 0) return;
    const timer = window.setTimeout(() => setTriviaUnlockSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [triviaUnlockSeconds]);

  useEffect(() => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) return;
    const snapshot = bootstrapSnapshotRef.current;
    if (hasFreshBootstrapTriviaQuota(snapshot)) {
      return;
    }
    void loadTriviaQuota();
  }, [loadTriviaQuota]);

  useEffect(() => {
    if (!triviaGateNotice) return;
    const timer = window.setTimeout(() => setTriviaGateNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [triviaGateNotice]);

  useEffect(() => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setIsBadgeLoading(false);
      return;
    }
    void loadHomeBadges();
    const interval = window.setInterval(() => void loadHomeBadges({ silent: true }), 20000);
    return () => window.clearInterval(interval);
  }, [loadHomeBadges]);

  useEffect(() => {
    void loadMenuSummary();
    const interval = window.setInterval(() => {
      void loadMenuSummary();
    }, 20000);
    const onPointsUpdated = () => {
      void loadMenuSummary();
    };
    const onAuthStateChanged = () => {
      void loadMenuSummary();
    };
    window.addEventListener("tp:points-updated", onPointsUpdated);
    window.addEventListener("tp:auth-state-changed", onAuthStateChanged as EventListener);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPointsUpdated);
      window.removeEventListener("tp:auth-state-changed", onAuthStateChanged as EventListener);
    };
  }, [loadMenuSummary]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const deferTimer = window.setTimeout(() => {
      void loadChallengeCampaigns();
      void loadLiveTriviaStatus();
    }, 100);
    return () => window.clearTimeout(deferTimer);
  }, [contentReady, homeRevealComplete, loadChallengeCampaigns, loadLiveTriviaStatus]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const interval = window.setInterval(() => void loadChallengeCampaigns({ silent: true }), 30000);
    return () => window.clearInterval(interval);
  }, [contentReady, homeRevealComplete, loadChallengeCampaigns]);

  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    const interval = window.setInterval(() => void loadLiveTriviaStatus(), 15000);
    return () => window.clearInterval(interval);
  }, [contentReady, homeRevealComplete, loadLiveTriviaStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveCountdownNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);


  useEffect(() => {
    if (!homeRevealComplete) return;
    if (!contentReady) return;
    router.prefetch("/trivia");
    router.prefetch("/trivia/live");
    router.prefetch("/predictions");
    router.prefetch("/pickem");
    router.prefetch("/bingo");
    router.prefetch("/fantasy");
    router.prefetch("/pending-challenges");
    router.prefetch("/active-games");
    router.prefetch("/redeem-prizes");
    router.prefetch("/activity");
    if (!warmupStartedRef.current && !bootstrapSnapshotRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [contentReady, homeRevealComplete, runWarmup, router]);

  useEffect(() => {
    return () => {
      badgeRequestRef.current?.abort();
      campaignRequestRef.current?.abort();
      liveTriviaRequestRef.current?.abort();
    };
  }, []);

  const goTo = useCallback(
    async (dest: VenueGameKey, sourceElement: HTMLElement | null) => {
      const destination = VENUE_GAME_CARD_BY_KEY[dest];
      if (!destination) return;
      const targetPath =
        dest === "live_trivia" ? `${destination.path}?venueId=${encodeURIComponent(venue.id)}` : destination.path;
      triggerPulse();
      if (dest === "speed-trivia") {
        // Only block navigation when trivia is already known to be locked.
        // If quota is null (not yet loaded), navigate immediately — the trivia page
        // enforces limits itself. Awaiting a network call here caused the UI to freeze
        // for up to 4.5 s and opened a window where the arrival pipeline could clear
        // the session and bounce the user to login.
        const knownLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
        if (knownLocked) {
          const latestQuota = await loadTriviaQuota();
          const stillLocked = Boolean(latestQuota && !latestQuota.isAdminBypass && latestQuota.questionsRemaining <= 0);
          if (stillLocked) {
            const unlockIn = Math.max(0, Math.floor(latestQuota?.windowSecondsRemaining ?? triviaUnlockSeconds));
            setTriviaUnlockSeconds(unlockIn);
            setTriviaGateNotice(unlockIn > 0 ? `Trivia is locked for now. Try again in ${formatCountdown(unlockIn)}.` : "Trivia is locked for now. Please try again soon.");
            return;
          }
          // Quota has reset — fall through and navigate
        }
      }
      setTriviaGateNotice("");
      setPendingDestination(dest);
      try {
        await runVenueGameOpenTransition({
          gameKey: dest,
          sourceElement,
          targetPath,
          navigate: () => router.push(targetPath),
        });
      } catch {
        setPendingDestination(null);
      }
    },
  [loadTriviaQuota, router, triviaUnlockSeconds, triviaQuota, venue.id]
  );

  const homeCards = useMemo(() => VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]), []);
  const currentUserId = useMemo(() => (getUserId() ?? "").trim(), []);
  const goToChallengeRedeem = useCallback(
    async (challengeId: string, sourceElement: HTMLElement | null) => {
      setPendingChallengeRedeemId(challengeId);
      try {
        await runVenueGameOpenTransition({
          gameKey: "fantasy",
          sourceElement,
          targetPath: `/venue/${encodeURIComponent(venue.id)}/redeem`,
          navigate: () => router.push(`/venue/${encodeURIComponent(venue.id)}/redeem`),
        });
      } catch {
        setPendingChallengeRedeemId(null);
      }
    },
    [router, venue.id]
  );
  const leaderboardInitialEntries = leaderboardBootstrapEntries.length > 0 ? leaderboardBootstrapEntries : initialEntries;
  const triviaIsLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
  const triviaUnlockCountdown = triviaUnlockSeconds > 0 ? triviaUnlockSeconds : triviaIsLocked ? Math.max(0, Math.floor(triviaQuota?.windowSecondsRemaining ?? 0)) : 0;
  const nextLiveTriviaCountdownSeconds =
    liveTriviaStatus.nextStartAtMs != null
      ? Math.max(0, Math.floor((liveTriviaStatus.nextStartAtMs - liveCountdownNowMs) / 1000))
      : null;
  const nextLiveTriviaCountdownLabel = liveTriviaStatus.live
    ? "Live Now"
    : nextLiveTriviaCountdownSeconds != null
    ? formatLongCountdown(nextLiveTriviaCountdownSeconds)
    : liveTriviaStatus.label || "Status unavailable";
  const showLiveBadge = liveTriviaStatus.live;
  const lobbyButtonShouldPulse =
    liveTriviaStatus.live ||
    (nextLiveTriviaCountdownSeconds != null &&
      nextLiveTriviaCountdownSeconds > 0 &&
      nextLiveTriviaCountdownSeconds <= 120);

  const visibleBadgeByGame = useMemo(() => {
    const badges = new Map<VenueGameKey, string>();
    for (const [gameKey, count] of Object.entries(homeBadgeCounts) as Array<[VenueGameKey, number | undefined]>) {
      if (!count || count <= 0) continue;
      badges.set(gameKey, formatBadgeCount(count));
    }
    return badges;
  }, [homeBadgeCounts]);

  const selectedChallenge = useMemo(
    () => challengeCards.find((card) => card.id === selectedChallengeId) ?? null,
    [challengeCards, selectedChallengeId]
  );
  const orderedHomeCards = useMemo(() => {
    const byKey = new Map(homeCards.map((card) => [card.key, card] as const));
    return VENUE_HUB_GAME_ORDER.map((key) => byKey.get(key)).filter((card): card is (typeof homeCards)[number] => Boolean(card));
  }, [homeCards]);
  const challengeBadgeCount = challengeCards.filter((challenge) => Boolean(challenge.winnerUserId && challenge.winnerUserId === currentUserId && !challenge.prizeClaimedAt)).length;

  const showFastPathSkeleton = arrivalInProgress && !arrivalCoreReady;

  return (
    <div
      className="relative z-[60] flex flex-col isolation-isolate"
    >
      <section className="fixed inset-x-0 top-0 z-[1100] shrink-0 border-b border-white/10 bg-[rgba(2,6,23,0.92)] pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-1.5">
          <button
            type="button"
            onMouseDown={triggerPulse}
            onClick={() => setIsMenuOpen(true)}
            className="tp-clean-button inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-ht-surface text-ht-fg-primary"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <h2
            className="truncate px-3 text-center text-[1.15rem] font-black uppercase tracking-[0.04em] text-cyan-300"
            style={{ fontFamily: "'Bree Serif', 'Nunito', serif" }}
          >
            {venueDisplayName}
          </h2>
          <div className="shrink-0">
            <NotificationBell />
          </div>
        </div>
        <div className="px-4 pb-2">
          <div className="mx-auto w-full max-w-[24rem] sm:max-w-md">
            <div className="rounded-full border border-cyan-400/35 bg-slate-900/90 p-1 shadow-[0_8px_24px_rgba(2,6,23,0.45)]">
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => goToScreen(0)}
                  className={`tp-clean-button rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                    activeScreen === 0 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Games
                </button>
                <button
                  type="button"
                  onClick={() => goToScreen(1)}
                  className={`tp-clean-button relative rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                    activeScreen === 1 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Challenges
                  {challengeBadgeCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
                      {formatBadgeCount(challengeBadgeCount)}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => goToScreen(2)}
                  className={`tp-clean-button rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                    activeScreen === 2 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Leaderboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div aria-hidden className="shrink-0 h-[calc(max(env(safe-area-inset-top),0px)+8rem)]" />

      <div className="canvas-ribbon m-0 w-full p-0">
        <div
          ref={swipeViewportRef}
          onScroll={onCarouselScroll}
          className="venue-home-carousel relative m-0 flex w-full overflow-x-auto overflow-y-visible p-0 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            overscrollBehaviorX: "contain",
            scrollPadding: 0,
          }}
          aria-label="Venue home screens"
        >
        <section className="venue-screen relative m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
          <div className={`venue-home-panel-content venue-home-games-fit w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-4 pt-2 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            {showFastPathSkeleton ? (
              <div className="mx-auto mb-2 w-full max-w-[24rem] rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-center text-xs font-semibold text-slate-300">
                <p>{arrivalStatusText}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-400">
                  {arrivalStage} · {Math.round(arrivalProgress)}%
                </p>
              </div>
            ) : null}

            <div className="mx-auto w-full max-w-[24rem] space-y-3 sm:max-w-md">
              <div className="rounded-2xl border border-amber-400/60 bg-ht-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                      {liveTriviaStatus.live ? "Live Trivia in progress! Join the game now!" : "Next Live Trivia Showdown In"}
                    </p>
                    <p className="mt-1 font-black tabular-nums text-amber-200 text-[2.2rem] leading-none">
                      {nextLiveTriviaCountdownLabel}
                    </p>
                    {liveTriviaStatus.label ? (
                      <p className="mt-1 text-xs font-semibold text-amber-100/90">{liveTriviaStatus.label}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onMouseDown={triggerPulse}
                    onClick={(event) => {
                      void goTo("live_trivia", event.currentTarget);
                    }}
                    disabled={pendingDestination !== null}
                    className={`tp-clean-button min-w-[7.2rem] rounded-[12px] border px-4 py-2 text-lg font-black leading-tight transition-all disabled:opacity-60 ${
                      lobbyButtonShouldPulse
                        ? "animate-pulse border-rose-300/60 bg-rose-400/20 text-rose-200 shadow-[0_0_0_1px_rgba(252,165,165,0.3)]"
                        : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.28)] hover:bg-cyan-400/15"
                    }`}
                  >
                    Enter
                    <br />
                    lobby
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {orderedHomeCards.map((card) => {
                  const isOpening = pendingDestination === card.key;
                  const badge = visibleBadgeByGame.get(card.key);
                  const isLiveTriviaCard = card.key === "live_trivia";
                  const isSpeedTriviaCard = card.key === "speed-trivia";
                  const statusLabel = isLiveTriviaCard && liveTriviaStatus.live ? "LIVE" : null;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onMouseDown={triggerPulse}
                      onClick={(event) => {
                        void goTo(card.key, event.currentTarget);
                      }}
                      disabled={pendingDestination !== null}
                      data-venue-game-card={card.key}
                      className={`tp-clean-button tp-game-card-btn group relative w-full overflow-hidden rounded-[22px] border border-white/75 text-left shadow-[0_12px_26px_rgba(15,23,42,0.5)] ${isOpening ? "is-opening" : ""}`}
                      style={{ backgroundImage: VENUE_HUB_TILE_GRADIENT_BY_KEY[card.key] }}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.12)_40%,rgba(255,255,255,0)_72%)]" />
                      <div className="relative flex min-h-[190px] flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className="text-[2rem] font-black uppercase leading-[0.95] text-white"
                            style={{
                              fontFamily: "'Bree Serif', 'Nunito', serif",
                              letterSpacing: "0.045em",
                              textShadow: "0 1px 0 rgba(12,18,28,.8), 0 3px 0 rgba(12,18,28,.58), 0 0 12px rgba(255,255,255,.5)",
                            }}
                          >
                            {GAME_TITLE_LINES_BY_KEY[card.key][0]}
                            <br />
                            {GAME_TITLE_LINES_BY_KEY[card.key][1]}
                          </div>
                          {statusLabel ? (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-rose-300/60 bg-rose-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-rose-200">
                              <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                              {statusLabel}
                            </span>
                          ) : null}
                        </div>

                        <div className="max-w-[92%] rounded-xl border border-white/40 bg-black/30 px-3 py-2 text-[12px] font-bold text-white/95">
                          {VENUE_HUB_TILE_SUBTITLE_BY_KEY[card.key]}
                        </div>

                      </div>

                      {badge ? (
                        <span className="absolute right-2 top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.45)]">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {triviaUnlockCountdown > 0 ? (
              <div className="mx-auto mt-3 max-w-[24rem] rounded-full border border-amber-400/40 bg-amber-950/30 px-3 py-1.5 text-center text-[11px] font-black tracking-[0.08em] text-amber-200">
                Trivia unlocks in {formatCountdown(triviaUnlockCountdown)}
              </div>
            ) : null}
            {triviaGateNotice ? (
              <div className="mx-auto mt-2 max-w-[24rem] rounded-xl border border-rose-400/60 bg-rose-950/30 px-3 py-2 text-center text-xs font-semibold text-rose-200">
                {triviaGateNotice}
              </div>
            ) : null}
            {badgeError ? (
              <button
                type="button"
                onClick={() => void loadHomeBadges()}
                className="mx-auto mt-2 block max-w-[24rem] rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-300"
              >
                {badgeError} Tap to retry
              </button>
            ) : null}
          </div>
        </section>

        <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
            <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-3 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            <div className="mx-auto w-full max-w-[26rem] space-y-3">
              <div>
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-400">
                  {isChallengesLoading
                    ? "Challenges"
                    : challengeCards.length > 0
                    ? `Active · ${challengeCards.length} Challenge${challengeCards.length !== 1 ? "s" : ""}`
                    : "Challenges"}
                </p>
                <div className="space-y-2">
                  {isChallengesLoading ? (
                    <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-700" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-40 animate-pulse rounded bg-slate-700" />
                          <div className="h-2 w-full animate-pulse rounded bg-slate-700/70" />
                          <div className="h-2 w-24 animate-pulse rounded bg-slate-700/50" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!isChallengesLoading && challengeCards.length === 0 ? (
                    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 text-center text-sm font-semibold text-slate-500">
                      No active challenges for this venue yet.
                    </div>
                  ) : null}

                  {challengeCards.map((challenge) => {
                    const progress = Math.max(0, Number(challenge.progressPoints ?? 0));
                    const target = Math.max(1, Number(challenge.pointsRequiredToWin ?? 1));
                    const percent = Math.min(100, Math.round((progress / target) * 100));
                    const isWon = Boolean(challenge.winnerUserId);
                    const isWinner = Boolean(challenge.winnerUserId && challenge.winnerUserId === currentUserId);
                    const canOpenRules = !isWon;
                    const canOpenRedeem = isWinner;
                    const isBusy = pendingChallengeRedeemId === challenge.id;
                    const gameType = inferChallengeGameType(challenge.name);
                    const iconStyle = CHALLENGE_ICON_STYLE[gameType];
                    const topEntries = challenge.leaderboard?.topEntries ?? [];
                    return (
                      <button
                        key={challenge.id}
                        type="button"
                        onClick={(event) => {
                          if (canOpenRedeem) {
                            void goToChallengeRedeem(challenge.id, event.currentTarget);
                            return;
                          }
                          if (canOpenRules) {
                            setSelectedChallengeId(challenge.id);
                          }
                        }}
                        disabled={!canOpenRules && !canOpenRedeem}
                        aria-disabled={!canOpenRules && !canOpenRedeem}
                        className={`flex w-full flex-col overflow-hidden rounded-2xl p-4 text-left transition-opacity ${
                          !canOpenRules && !canOpenRedeem ? "cursor-default opacity-60" : "hover:opacity-90"
                        }`}
                        style={{
                          background: isWinner ? "linear-gradient(135deg, #1c1400, #2d1f00)" : "#111827",
                          border: `1.5px solid ${isWinner ? "rgba(251,191,36,0.4)" : iconStyle.cardAccent}`,
                        }}
                      >
                        {/* Header row: icon + name + status chip */}
                        <div className="flex items-center gap-3">
                          <ChallengeIconBadge gameType={gameType} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xl font-black leading-snug text-slate-100">
                              {challenge.name}
                            </div>
                            {isWon && isWinner ? (
                              <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-amber-300"
                                style={{ background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.3)" }}>
                                You Won
                              </span>
                            ) : isWon ? (
                              <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400"
                                style={{ background: "rgba(51,65,85,0.5)", border: "1px solid rgba(71,85,105,0.5)" }}>
                                Claimed
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-cyan-400"
                                style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)" }}>
                                {challenge.challengeMode === "leaderboard" ? "Leaderboard" : "Gauge"}
                              </span>
                            )}
                          </div>
                          {canOpenRules && (
                            <span className="shrink-0 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                              Rules ›
                            </span>
                          )}
                        </div>

                        {/* Rules */}
                        {challenge.rules ? (
                          <div className="mt-3 rounded-lg px-3 py-2.5 text-base leading-relaxed text-slate-400"
                            style={{ background: "rgba(30,41,59,0.7)", border: "1px solid rgba(71,85,105,0.4)" }}>
                            {challenge.rules}
                          </div>
                        ) : null}

                        {/* Body: leaderboard, progress bar, or won state */}
                        {isWon && isWinner ? (
                          <div className="mt-3 inline-flex items-center rounded-full px-3 py-1.5 text-sm font-black uppercase tracking-[0.08em] text-amber-300"
                            style={{ border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.12)" }}>
                            {isBusy ? "Opening…" : challenge.prizeClaimedAt ? "Prize Claimed" : "→ Tap to Claim Prize"}
                          </div>
                        ) : isWon ? (
                          <p className="mt-3 text-base text-slate-500">
                            Won by <span className="text-slate-400">{challenge.winnerUsername ?? "Champion"}</span>
                          </p>
                        ) : challenge.challengeMode === "leaderboard" ? (
                          <div className="mt-3">
                            {topEntries.length === 0 ? (
                              <p className="text-base text-slate-500">No scores yet — be the first to play!</p>
                            ) : (
                              <div role="list" aria-label="Challenge leaderboard">
                                {/* Column headers */}
                                <div className="mb-1 flex items-center gap-2 border-b border-slate-700/60 pb-1.5 px-1">
                                  <span className="w-6 shrink-0 text-right text-sm font-black uppercase tracking-[0.1em] text-slate-600">#</span>
                                  <span className="min-w-0 flex-1 text-sm font-black uppercase tracking-[0.1em] text-slate-600">Player</span>
                                  <span className="shrink-0 text-sm font-black uppercase tracking-[0.1em] text-slate-600">Pts</span>
                                </div>
                                {topEntries.map((entry) => {
                                  const isViewer = entry.userId === currentUserId;
                                  return (
                                    <div
                                      key={entry.userId}
                                      role="listitem"
                                      className={`flex items-center gap-2 rounded px-1 py-1.5 ${isViewer ? "bg-cyan-500/10" : ""}`}
                                    >
                                      <span className="w-6 shrink-0 text-right text-base font-black tabular-nums text-slate-500">
                                        {entry.rank}
                                      </span>
                                      <span className={`min-w-0 flex-1 truncate text-lg font-semibold ${isViewer ? "text-cyan-300" : "text-slate-200"}`}>
                                        {entry.username}{isViewer ? " (you)" : ""}
                                      </span>
                                      <span className="shrink-0 text-lg font-black tabular-nums text-amber-200">
                                        {entry.points.toLocaleString()}
                                      </span>
                                    </div>
                                  );
                                })}
                                {challenge.leaderboard?.viewer && !challenge.leaderboard.viewer.inTop ? (
                                  <>
                                    <div aria-hidden className="my-1 border-t border-slate-700/50" />
                                    <div
                                      role="listitem"
                                      className="flex items-center gap-2 rounded bg-cyan-500/10 px-1 py-1.5"
                                    >
                                      <span className="w-6 shrink-0 text-right text-base font-black tabular-nums text-slate-500">
                                        {challenge.leaderboard.viewer.rank ?? "—"}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-base font-semibold text-cyan-300">
                                        {challenge.leaderboard.viewer.username ?? "You"} (you)
                                      </span>
                                      <span className="shrink-0 text-lg font-black tabular-nums text-amber-200">
                                        {challenge.leaderboard.viewer.points.toLocaleString()}
                                      </span>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${percent}%`, background: iconStyle.barGradient }}
                              />
                            </div>
                            <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-500">
                              {progress.toLocaleString()} / {target.toLocaleString()} pts
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {challengesError ? (
                    <button
                      type="button"
                      onClick={() => void loadChallengeCampaigns()}
                      className="rounded-md border border-rose-400/60 bg-rose-950/30 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-rose-300"
                    >
                      {challengesError} Tap to retry
                    </button>
                  ) : null}
                </div>

              </div>
            </div>
            </div>
        </section>

        <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
            <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-8 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
            <div className="mx-auto w-full max-w-[26rem] space-y-3">
              <div className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-4">
                <p className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">Leaderboard</p>
                <LeaderboardTable
                  venueId={venue.id}
                  initialEntries={leaderboardInitialEntries}
                  isEnabled={homeRevealComplete}
                />
              </div>
            </div>
            </div>
        </section>
        </div>
      </div>

      <div
        data-tp-scroll-lock={isMenuOpen ? "active" : undefined}
        className={`fixed inset-0 z-[1200] ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isMenuOpen}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className={`absolute inset-0 h-full w-full bg-black/40 transition-opacity duration-200 ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Close navigation menu"
        />

        <aside
          className={`absolute inset-y-0 left-0 w-[22rem] max-w-[92vw] border-r border-ht-border-soft bg-ht-surface px-5 py-5 shadow-ht-modal transition-transform duration-200 ${
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-black tracking-wide text-ht-fg-primary">Menu</h3>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-ht-sm border border-ht-border-soft bg-ht-elevated px-3 py-1.5 text-base font-semibold text-ht-fg-muted"
            >
              Close
            </button>
          </div>

          <div className="mb-5 rounded-ht-lg border border-cyan-400/45 bg-cyan-400/10 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[1.15rem] font-black leading-tight text-ht-fg-primary">
                  {menuUsername || "Guest"}
                </p>
                <p className="mt-0.5 truncate text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-cyan-400">
                  {venueDisplayName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-amber-200/85">Points</p>
                <p
                  className="text-[1.02rem] font-black leading-tight"
                  style={{ color: "var(--ht-accent-gold, #fbbf24)", fontVariantNumeric: "tabular-nums" }}
                >
                  {(menuPoints ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {!hasPasskey && (
            <div className="mb-5 rounded-ht-lg border border-ht-border-hairline bg-ht-elevated/50 p-3">
              <div className="text-sm font-black text-ht-fg-primary">Passkey Login</div>
              <p className="mt-1 text-xs text-ht-fg-muted">
                Enable one-tap Face ID, Touch ID, or device PIN login on this device.
              </p>
              <button
                type="button"
                onClick={() => void handlePasskeySetup()}
                disabled={isPasskeySetupLoading}
                className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-400/15 px-3 py-2 text-sm font-black text-cyan-200 disabled:opacity-50"
              >
                {isPasskeySetupLoading ? "Setting up passkey..." : "Set Up Passkey"}
              </button>
              {passkeySetupError ? (
                <p className="mt-2 rounded-lg border border-rose-400/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                  {passkeySetupError}
                </p>
              ) : null}
              {passkeySetupMessage ? (
                <p className="mt-2 rounded-lg border border-emerald-400/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200">
                  {passkeySetupMessage}
                </p>
              ) : null}
            </div>
          )}

          <nav aria-label="Primary navigation">
            <ul className="space-y-3">
              {VENUE_DRAWER_MENU_ITEMS.map((item) => {
                const active = isActiveMenuPath(pathname, item.href);
                return (
                  <li key={`${item.label}:${item.href}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        router.push(item.href);
                      }}
                      className={`w-full rounded-ht-lg border px-4 py-3.5 text-left ${
                        active
                          ? "border-ht-border-strong bg-ht-elevated text-ht-fg-primary"
                          : "border-ht-border-hairline bg-ht-elevated/50 text-ht-fg-secondary hover:border-ht-border-soft hover:bg-ht-elevated"
                      }`}
                    >
                      <div className="text-lg font-black leading-tight">{item.label}</div>
                      <div className={`mt-1 text-sm leading-snug ${active ? "text-ht-fg-secondary" : "text-ht-fg-muted"}`}>
                        {item.description}
                      </div>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    leaveVenue();
                  }}
                  className="w-full rounded-ht-lg border border-rose-400/45 bg-rose-500/10 px-4 py-3 text-left text-base font-black text-rose-300"
                >
                  Leave Venue
                </button>
              </li>
            </ul>
          </nav>
        </aside>
      </div>

      <AnimatePresence>
        {selectedChallenge ? (
          <motion.div
            className="fixed inset-0 z-[99999] flex items-start justify-center bg-black/45 px-3 pb-4 pt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedChallengeId(null)}
          >
            <motion.div
              className="relative w-fit max-w-[calc(100vw-12px)] max-h-[calc(100svh-5rem)] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-slate-900 px-5 pb-6 pt-5 shadow-[0_24px_48px_rgba(0,0,0,0.6)]"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                className="tp-clean-button absolute right-3 top-3 inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-full bg-slate-800 px-4 text-sm font-semibold text-slate-300"
                onClick={() => setSelectedChallengeId(null)}
                aria-label="Close challenge rules"
              >
                Close
              </button>
              <h4 className="mt-2 w-[min(92vw,24rem)] pr-24 text-3xl font-black leading-9 text-white">{selectedChallenge.name}</h4>
              <p className="mt-7 w-[min(92vw,24rem)] pb-1 text-[1.65rem] leading-[2.35rem] text-slate-300">{selectedChallenge.rules}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const VenueHubClient = React.memo(VenueHubClientInner);
VenueHubClient.displayName = "VenueHubClient";
