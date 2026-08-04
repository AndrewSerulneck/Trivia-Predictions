import React from "react";
import Image from "next/image";
import type { VenueGameKey } from "@/lib/venueGameCards";
import type { LiveTriviaPayloadFailureReason } from "@/lib/liveTriviaClientState";
import type {
  RewardPrizeKind,
  RewardMenuItem,
  RewardDiscountKind,
  ChallengeGameType as RewardDefinitionGameType,
} from "@/types";
import { describeRewardPrize, REWARD_DEFINITIONS } from "@/lib/rewardDefinitions";

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
  // ── Prize-first redesign (Phase 1) ── same fields as ChallengeCampaign;
  // needed here so the card/modal can render the prize headline directly
  // instead of the game name. See lib/rewardDefinitions.ts:describeRewardPrize.
  prizeKind?: RewardPrizeKind | null;
  prizeMenuItem?: RewardMenuItem | null;
  prizeMenuItemName?: string | null;
  prizeDiscountKind?: RewardDiscountKind | null;
  prizeDiscountValue?: number | null;
  prizeGiftCertificateAmount?: number | null;
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
 * The Reward registry's own game-type enum (`@/types`) into this module's —
 * they are separately maintained and disagree on spelling ("live-trivia" vs
 * "live_trivia") and membership ("trivia" is a legacy alias for Speed Trivia;
 * this enum adds "unknown"). Exhaustive by construction, so adding a member to
 * the registry enum is a type error here rather than a silently-missed reward.
 */
const REWARD_DEFINITION_GAME_TYPE: Record<RewardDefinitionGameType, ChallengeGameType> = {
  "live-trivia": "live_trivia",
  "speed-trivia": "speed-trivia",
  trivia: "speed-trivia",
  bingo: "bingo",
  pickem: "pickem",
  fantasy: "fantasy",
  "nfl-pickem": "nfl-pickem",
};

/**
 * Built from the registry rather than hand-listed so a new entry in
 * `REWARD_DEFINITIONS` can't be forgotten here (CLAUDE.md § Rewards: adding a
 * reward should be one entry in lib/rewardDefinitions.ts).
 */
const GAME_TYPE_BY_REWARD_DEFINITION_ID: ReadonlyMap<string, ChallengeGameType> = new Map(
  REWARD_DEFINITIONS.map((definition) => [definition.id, REWARD_DEFINITION_GAME_TYPE[definition.gameType]] as const),
);

export type ChallengeGameTypeResolution = {
  gameType: ChallengeGameType;
  /**
   * True only when `rewardDefinitionId` decided it. A name-derived result is a
   * *guess* — good enough for an icon, never good enough to pick a navigation
   * target (see rewardPlayVenueGameKey).
   */
  fromDefinition: boolean;
};

/**
 * `rewardDefinitionId` (when present) decides this deterministically — it's
 * how the reward was actually created, unlike a substring match on its
 * display name. Needed because "NFL Pick 'Em Challenge" contains "pick" and
 * would otherwise collapse onto the same icon/badge as a regular Pick 'Em
 * challenge (see docs/nfl-pickem-reward-phase8.md item 2).
 *
 * The name-substring branch survives only for legacy free-form
 * `challenge_campaigns` rows that predate the registry, and only for display.
 */
export function resolveChallengeGameType(name: string, rewardDefinitionId?: string | null): ChallengeGameTypeResolution {
  const fromRegistry = rewardDefinitionId ? GAME_TYPE_BY_REWARD_DEFINITION_ID.get(rewardDefinitionId) : undefined;
  if (fromRegistry) return { gameType: fromRegistry, fromDefinition: true };
  const lower = name.toLowerCase();
  return { gameType: inferChallengeGameTypeFromName(lower), fromDefinition: false };
}

function inferChallengeGameTypeFromName(lower: string): ChallengeGameType {
  if (lower.includes("live trivia") || lower.includes("live showdown") || lower.includes("showdown")) return "live_trivia";
  if (lower.includes("speed trivia") || lower.includes("trivia")) return "speed-trivia";
  if (lower.includes("bingo")) return "bingo";
  if (lower.includes("nfl") || lower.includes("pick 'em") || lower.includes("pickem") || lower.includes("pick")) {
    return lower.includes("nfl") ? "nfl-pickem" : "pickem";
  }
  if (lower.includes("fantasy")) return "fantasy";
  return "unknown";
}

/** Display-only accessor (icon, badge, eyebrow). Never use this to navigate. */
export function inferChallengeGameType(name: string, rewardDefinitionId?: string | null): ChallengeGameType {
  return resolveChallengeGameType(name, rewardDefinitionId).gameType;
}

/**
 * A prize is headline-worthy only when it's fully specified — a legacy
 * `gift_card` row with a NULL amount or a `menu_item` row with a NULL item
 * (or `"other"` with a blank name) returns a non-empty but useless
 * `describeRewardPrize` string (e.g. "Gift card", "Menu Item") that silently
 * drops the detail the campaign `name` used to carry. Do not change
 * `describeRewardPrize` itself — its other callers (NFLPickEmLeaderboard,
 * NFLPickEmRewardBanner) legitimately want that degraded label for
 * already-won coupons.
 */
function isCompletePrize(card: ChallengeCampaignCard): boolean {
  switch (card.prizeKind) {
    case "gift_card":
      return Number(card.prizeGiftCertificateAmount) > 0;
    case "menu_item":
      if (!card.prizeMenuItem) return false;
      if (card.prizeMenuItem === "other") return Boolean(card.prizeMenuItemName?.trim());
      return true;
    default:
      return false;
  }
}

/**
 * The prize is the headline now, not the game name (Prize-First redesign,
 * docs/rewards-panel-prize-first-plan.md). Every Reward has a structured
 * prize by definition; the `card.name` fallback covers legacy pre-Rewards
 * `challenge_campaigns` rows that predate the prize fields, and incomplete
 * prize data (see isCompletePrize) that would otherwise degrade to a vague
 * label like "Gift card".
 */
export function rewardHeadline(card: ChallengeCampaignCard): string {
  if (!isCompletePrize(card)) return card.name;
  const described = describeRewardPrize(card);
  return described || card.name;
}

/** Eyebrow copy above the prize headline — "" for `unknown` so it renders nothing. */
export function rewardGameLabel(gameType: ChallengeGameType): string {
  const venueGameKey = CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY[gameType];
  if (!venueGameKey) return "";
  return GAME_TITLE_LINES_BY_KEY[venueGameKey].join(" ").trim();
}

/**
 * Where "Play Now!" sends a reward. `null` means there is no destination
 * (`unknown` game type) and the button must not render at all — never guess a
 * default game. Thin accessor over the existing badge/icon mapping so the
 * button and the badge can never disagree about which game a reward belongs to.
 */
export function challengeGameTypeToVenueGameKey(gameType: ChallengeGameType): VenueGameKey | null {
  return CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY[gameType];
}

/**
 * Where "Play Now!" sends a reward — the ONLY function navigation may consult.
 * Returns `null` (button doesn't render) unless `rewardDefinitionId` identified
 * the game: a legacy free-form campaign named e.g. "Trivia Champion" that
 * actually tracked Live Trivia would otherwise send the player to Speed Trivia,
 * where its points don't accrue. A missing button is strictly better than a
 * wrong one; the icon/badge still shows the name-derived guess
 * (inferChallengeGameType), which costs nothing if wrong.
 */
export function rewardPlayVenueGameKey(name: string, rewardDefinitionId?: string | null): VenueGameKey | null {
  const { gameType, fromDefinition } = resolveChallengeGameType(name, rewardDefinitionId);
  if (!fromDefinition) return null;
  return challengeGameTypeToVenueGameKey(gameType);
}

/**
 * Multi-winner quota copy for the reward detail modal. `""` for single-winner
 * rewards (quota 1, e.g. the NFL "most picks right" reward, which is locked to
 * one winner) so the line simply doesn't render. Counts come from the
 * current-cycle ledger snapshot — never recompute quota client-side
 * (CLAUDE.md § Rewards: `award_cycle_winner` is the atomic authority).
 */
export function rewardQuotaLine(winnerQuota?: number | null, quotaRemaining?: number | null): string {
  const quota = Math.floor(Number(winnerQuota ?? 1));
  if (!Number.isFinite(quota) || quota <= 1) return "";
  const remainingRaw = quotaRemaining ?? quota;
  const remaining = Math.max(0, Math.min(quota, Math.floor(Number(remainingRaw))));
  if (!Number.isFinite(remaining)) return "";
  if (remaining <= 0) return `All ${quota} claimed`;
  return `${remaining} of ${quota} reward${remaining === 1 ? "" : "s"} left`;
}

export const CHALLENGE_ICON_STYLE: Record<
  ChallengeGameType,
  // ctaTextColor: foreground for the modal's "Play Now!" button, which is
  // painted with barGradient — several of those gradients (NFL's pale amber,
  // Speed Trivia's amber→lime) are far too light for white text.
  { badgeBg: string; borderColor: string; barGradient: string; cardAccent: string; ctaTextColor: string }
> = {
  // Dark navy → blue, white ? mark — matches Live Trivia badge in mockup
  live_trivia: {
    badgeBg: "linear-gradient(145deg, #0c1445, #1d4ed8, #3b82f6)",
    borderColor: "rgba(59,130,246,0.55)",
    barGradient: "linear-gradient(90deg, #0891b2, #22d3ee)",
    cardAccent: "rgba(59,130,246,0.25)",
    ctaTextColor: "#082f49",
  },
  // Very dark bg, bright amber lightning bolt — matches Speed Trivia badge in mockup
  "speed-trivia": {
    badgeBg: "linear-gradient(145deg, #0d0900, #1a1200, #261900)",
    borderColor: "rgba(251,191,36,0.55)",
    barGradient: "linear-gradient(90deg, #d97706, #fbbf24, #84cc16)",
    cardAccent: "rgba(251,191,36,0.2)",
    ctaTextColor: "#1c1200",
  },
  // Orange gradient — Bingo
  bingo: {
    badgeBg: "linear-gradient(145deg, #7c2d12, #c2410c, #f97316)",
    borderColor: "rgba(249,115,22,0.55)",
    barGradient: "linear-gradient(90deg, #ea580c, #fb923c)",
    cardAccent: "rgba(249,115,22,0.2)",
    ctaTextColor: "#431407",
  },
  // Amber/yellow gradient badge, fuchsia/purple progress — matches Pick 'Em badge in mockup
  pickem: {
    badgeBg: "linear-gradient(145deg, #78350f, #b45309, #f59e0b)",
    borderColor: "rgba(245,158,11,0.55)",
    barGradient: "linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)",
    cardAccent: "rgba(245,158,11,0.2)",
    ctaTextColor: "#ffffff",
  },
  // Purple badge, purple→emerald progress — matches Fantasy badge in mockup
  fantasy: {
    badgeBg: "linear-gradient(145deg, #2d1b69, #4c1d95, #6d28d9)",
    borderColor: "rgba(109,40,217,0.55)",
    barGradient: "linear-gradient(90deg, #7c3aed, #8b5cf6, #10b981)",
    cardAccent: "rgba(109,40,217,0.25)",
    ctaTextColor: "#ffffff",
  },
  // Navy/magenta badge matching the NFL Pick 'Em game screen's own palette.
  "nfl-pickem": {
    badgeBg: "linear-gradient(145deg, #1a2f72, #4a1a52, #6b1a4e)",
    borderColor: "rgba(253,230,138,0.45)",
    barGradient: "linear-gradient(90deg, #fde68a, #f59e0b)",
    cardAccent: "rgba(253,230,138,0.2)",
    ctaTextColor: "#1a2f72",
  },
  unknown: {
    badgeBg: "linear-gradient(145deg, #0f766e, #0891b2, #22d3ee)",
    borderColor: "rgba(34,211,238,0.45)",
    barGradient: "linear-gradient(90deg, #0891b2, #22d3ee)",
    cardAccent: "rgba(34,211,238,0.15)",
    ctaTextColor: "#082f49",
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
