import React from "react";
import type { VenueGameKey } from "@/lib/venueGameCards";
import type { LiveTriviaPayloadFailureReason } from "@/lib/liveTriviaClientState";

// Shared types, constants, helpers, and presentational sub-components used by
// VenueHubClient and its extracted memoized panels. Kept in a dependency-free
// module so the parent and child panels can import without a circular reference.

export type HomeScreenIndex = 0 | 1 | 2;
export type VenueArrivalStage = "identity" | "core" | "warmup" | "ready";

export type LiveTriviaStatus = {
  live: boolean;
  label: string;
  nextStartAtMs: number | null;
  failureReason: LiveTriviaPayloadFailureReason | "network" | null;
  recurringType: string | null;
  recurringDays: string[];
};

export type ChallengeCampaignCard = {
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
    isBetweenCycles?: boolean;
    nextCycleStart?: string;
  };
  winCondition?: "points_threshold" | "game_winner";
  pointsRequiredToWin: number;
  progressPoints: number;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  prizeClaimedAt?: string | null;
  isActive: boolean;
  // ── Rewards (Phase 6) ── current-cycle multi-winner state, viewer-scoped.
  winnerQuota?: number;
  winnerUsernames?: string[];
  quotaRemaining?: number;
  viewerWon?: boolean;
};

export const GAME_TITLE_LINES_BY_KEY: Record<VenueGameKey, string[]> = {
  "speed-trivia": ["Speed Trivia", ""],
  live_trivia: ["Hightop", "Live Trivia"],
  bingo: ["Prop Bingo", ""],
  pickem: ["Hightop", "Pick 'Em™"],
  fantasy: ["Hightop", "Fantasy Sports"],
  "category-blitz": ["Category Blitz", ""],
  "nfl-pickem": ["NFL", "Pick 'Em"],
};

export const VENUE_HUB_TILE_GRADIENT_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "linear-gradient(132deg,#06b6d4 0%,#0ea5e9 48%,#2563eb 100%)",
  "speed-trivia": "linear-gradient(132deg,#f59e0b 0%,#f97316 52%,#ea580c 100%)",
  bingo: "linear-gradient(128deg,#10b981 0%,#14b8a6 52%,#0f766e 100%)",
  pickem: "linear-gradient(134deg,#3b82f6 0%,#6366f1 55%,#4f46e5 100%)",
  fantasy: "linear-gradient(134deg,#a855f7 0%,#8b5cf6 52%,#7c3aed 100%)",
  "category-blitz": "linear-gradient(132deg,#a10d63 0%,#7c0a4a 50%,#4a052c 100%)",
  "nfl-pickem": "linear-gradient(115deg,#1a2f72 0%,#1a2f72 46%,#6b1a4e 54%,#6b1a4e 100%)",
};

export const VENUE_HUB_TILE_SUBTITLE_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "Classic bar trivia played against everyone else around you.",
  "speed-trivia": "It's just you versus the clock. 15 seconds per question, 15 questions per round, and 3 rounds per hour. Good luck! ",
  bingo: "Bingo boards align with the games on TV. Watch the game, track your squares in real time, and earn points as the live action unfolds!",
  pickem: "Predict the winners of today's top matchups before the games start. Every correct call gets you one step closer to prizes and discounts!",
  fantasy: "Draft the ultimate roster of star athletes in today's games. The better they perform, the more points you earn! ",
  "category-blitz": "One letter. Twelve categories. Unique answers get points.",
  "nfl-pickem": "A weekly contest to see who can pick the most winners each week of the NFL season.",
};

export function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatBadgeCount(value: number): string {
  const safeCount = Math.max(0, Math.floor(value));
  if (safeCount > 99) {
    return "99+";
  }
  return String(safeCount);
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

export type ChallengeGameType = "live_trivia" | "speed-trivia" | "bingo" | "pickem" | "fantasy" | "unknown";

export function inferChallengeGameType(name: string): ChallengeGameType {
  const lower = name.toLowerCase();
  if (lower.includes("live trivia") || lower.includes("live showdown") || lower.includes("showdown")) return "live_trivia";
  if (lower.includes("speed trivia") || lower.includes("trivia")) return "speed-trivia";
  if (lower.includes("bingo")) return "bingo";
  if (lower.includes("pick") || lower.includes("pick 'em") || lower.includes("pickem")) return "pickem";
  if (lower.includes("fantasy")) return "fantasy";
  return "unknown";
}

export const CHALLENGE_ICON_STYLE: Record<
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

export function ChallengeIconBadge({ gameType }: { gameType: ChallengeGameType }) {
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
