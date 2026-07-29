import React from "react";
import Image from "next/image";
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
  // ── Rewards (Phase 8) ── which pre-set definition created this, for reliably
  // telling e.g. an NFL Pick 'Em reward apart from a regular Pick 'Em one —
  // see inferChallengeGameType.
  rewardDefinitionId?: string | null;
  /**
   * YYYY-MM-DD the reward's first NFL week begins — present ONLY while that
   * date is still in the future (attachNFLRewardUpcomingState, lib/rewards.ts).
   * Its presence is the "upcoming" signal: an NFL reward created before the
   * season has live weekly cycles running immediately, so without this the
   * panel would show "In Progress · 0 / N pts" for weeks.
   */
  upcomingStartDate?: string | null;
};

export const GAME_TITLE_LINES_BY_KEY: Record<VenueGameKey, string[]> = {
  "speed-trivia": ["Speed Trivia", ""],
  live_trivia: ["Live Trivia", ""],
  bingo: ["Prop Bet Bingo", ""],
  pickem: ["Pick 'Em", ""],
  fantasy: ["Fantasy Sports", ""],
  "category-blitz": ["Category Blitz", ""],
  "nfl-pickem": ["NFL", "Pick 'Em"],
};

export const VENUE_HUB_TILE_GRADIENT_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "#0891b2",
  "speed-trivia": "#d97706",
  bingo: "#059669",
  pickem: "#4f46e5",
  fantasy: "#7c3aed",
  "category-blitz": "#701a75",
  "nfl-pickem": "#1a2f72",
};

// Plain sentences, not pre-split lines — the tile lets these wrap naturally so
// each line fills the available width (and clears the corner icon).
export const VENUE_HUB_TILE_SUBTITLE_BY_KEY: Record<VenueGameKey, string> = {
  live_trivia: "Classic bar trivia the whole room plays together.",
  "speed-trivia": "Rapid fire, multiple choice. Play anytime.",
  bingo: "Track your squares as you watch today's games on TV.",
  pickem: "Predict the winners of today's matchups across every major sport.",
  fantasy: "Draft the ultimate roster. The better they perform, the more points you earn.",
  "category-blitz": "Only unique answers get points.",
  "nfl-pickem": "Pick the most winners each week.",
};

// Shared with the venue-home game buttons (VenueGamesPanel) so a reward's icon
// always matches the icon on the game button it's tied to.
export const GAME_CARD_ICON_BY_KEY: Partial<Record<VenueGameKey, { src: string; width: number; height: number }>> = {
  "nfl-pickem": { src: "/brand/nfl-pickem-icon.png", width: 500, height: 500 },
  bingo: { src: "/brand/prop-bet-bingo-icon.png", width: 512, height: 512 },
  live_trivia: { src: "/brand/live-trivia-icon.png", width: 500, height: 500 },
  "speed-trivia": { src: "/brand/speed-trivia-icon.png", width: 500, height: 500 },
  "category-blitz": { src: "/brand/category-blitz-icon.png", width: 500, height: 500 },
  pickem: { src: "/brand/pickem-icon.png", width: 500, height: 500 },
  fantasy: { src: "/brand/fantasy-icon.png", width: 500, height: 500 },
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

export type ChallengeGameType = "live_trivia" | "speed-trivia" | "bingo" | "pickem" | "fantasy" | "nfl-pickem" | "unknown";

/**
 * `rewardDefinitionId` (when present) decides this deterministically — it's
 * how the reward was actually created, unlike a substring match on its
 * display name. Needed because "NFL Pick 'Em Challenge" contains "pick" and
 * would otherwise collapse onto the same icon/badge as a regular Pick 'Em
 * challenge (see docs/nfl-pickem-reward-phase8.md item 2).
 */
export function inferChallengeGameType(name: string, rewardDefinitionId?: string | null): ChallengeGameType {
  if (rewardDefinitionId === "nfl_pickem_challenge") return "nfl-pickem";
  const lower = name.toLowerCase();
  if (lower.includes("live trivia") || lower.includes("live showdown") || lower.includes("showdown")) return "live_trivia";
  if (lower.includes("speed trivia") || lower.includes("trivia")) return "speed-trivia";
  if (lower.includes("bingo")) return "bingo";
  if (lower.includes("nfl") || lower.includes("pick 'em") || lower.includes("pickem") || lower.includes("pick")) {
    return lower.includes("nfl") ? "nfl-pickem" : "pickem";
  }
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
  // Navy/magenta badge matching the NFL Pick 'Em game screen's own palette.
  "nfl-pickem": {
    badgeBg: "linear-gradient(145deg, #1a2f72, #4a1a52, #6b1a4e)",
    borderColor: "rgba(253,230,138,0.45)",
    barGradient: "linear-gradient(90deg, #fde68a, #f59e0b)",
    cardAccent: "rgba(253,230,138,0.2)",
  },
  unknown: {
    badgeBg: "linear-gradient(145deg, #0f766e, #0891b2, #22d3ee)",
    borderColor: "rgba(34,211,238,0.45)",
    barGradient: "linear-gradient(90deg, #0891b2, #22d3ee)",
    cardAccent: "rgba(34,211,238,0.15)",
  },
};

// ChallengeGameType and VenueGameKey are separately-maintained enums (the
// former has no "category-blitz", the latter has no "unknown") — this maps
// the subset they share so a reward's badge can reuse the exact PNG icon
// shown on that game's button (GAME_CARD_ICON_BY_KEY).
const CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY: Record<ChallengeGameType, VenueGameKey | null> = {
  live_trivia: "live_trivia",
  "speed-trivia": "speed-trivia",
  bingo: "bingo",
  pickem: "pickem",
  fantasy: "fantasy",
  "nfl-pickem": "nfl-pickem",
  unknown: null,
};

export function ChallengeIconBadge({ gameType }: { gameType: ChallengeGameType }) {
  const s = CHALLENGE_ICON_STYLE[gameType];
  const venueGameKey = CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY[gameType];
  const icon = venueGameKey ? GAME_CARD_ICON_BY_KEY[venueGameKey] : undefined;
  return (
    <div
      className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg"
      style={{ background: s.badgeBg, border: `2px solid ${s.borderColor}` }}
    >
      {icon ? (
        <Image src={icon.src} alt="" width={icon.width} height={icon.height} className="h-10 w-10 object-contain" />
      ) : (
        <TrophyGlyph className="h-8 w-8" />
      )}
    </div>
  );
}
