// Client-safe Reward definition registry (Rewards Phase 4). No "server-only"
// import and no Supabase dependency — shared by the Create Reward wizard UI
// (Phase 5) and the server expansion (lib/rewards.ts), mirroring
// lib/ownerCompetitionTemplates.ts. Each definition declares the game whose
// points count, the requirement copy, threshold options, and which scheduled
// live game (if any) gates its creation.
//
// Adding a future reward = ONE entry here (+ a schedule lookup in lib/rewards.ts
// only if it gates on a live game that isn't already handled). See
// docs/rewards-system-plan.md §4/§7.

import type {
  CampaignRecurringType,
  ChallengeGameType,
  ChallengeMode,
  ChallengeWinCondition,
  OwnerScheduleGameType,
  RewardDiscountKind,
  RewardMenuItem,
  RewardPrizeKind,
} from "@/types";

export type RewardDefinitionId = "live_trivia_challenge" | "nfl_pickem_challenge";

export type RewardDefinition = {
  id: RewardDefinitionId;
  /** Reward name shown on the card and stored as the campaign name. */
  name: string;
  /** The game whose points count toward the threshold. */
  gameType: ChallengeGameType;
  /** Rewards are threshold+quantity (progress) only — leaderboard mode is retired. */
  challengeMode: ChallengeMode;
  /**
   * The scheduled live game a venue must already run for this reward to be
   * creatable, or null for a reward that gates on nothing. Powers the "schedule
   * it first" block + cadence derivation in lib/rewards.ts.
   */
  requiresScheduledGame: OwnerScheduleGameType | null;
  /** Player-facing requirement copy; `{threshold}` is substituted at expansion. */
  requirementTemplate: string;
  /**
   * Whether this reward can be offered to the winner of the game outright,
   * ignoring any points target. Only meaningful for definitions backed by a
   * live game that produces a per-occurrence winner (see
   * lib/liveTriviaWinnerRewards.ts).
   */
  supportsGameWinner: boolean;
  /** Requirement copy used when winCondition is "game_winner". */
  gameWinnerRequirement: string;
  /** Suggested point targets the wizard offers (free entry is also allowed). */
  thresholdOptions: number[];
  /** Pre-selected threshold. */
  defaultThreshold: number;
  /**
   * Granularity a custom threshold must land on. Live Trivia questions are worth
   * 10 points, so its targets step by 10; NFL Pick 'Em counts correct PICKS, so
   * "get 25 picks right" must be expressible and its step is 1. Read only through
   * isValidRewardThreshold / rewardThresholdStepMessage.
   */
  thresholdStep: number;
  /** Semantic accent key the UI maps to an `ht-game-*` token. */
  accent: string;
  /** Glyph shown on the reward card / definition tile. */
  glyph: string;
};

export const REWARD_DEFINITIONS: readonly RewardDefinition[] = [
  {
    id: "live_trivia_challenge",
    name: "Live Trivia Challenge",
    gameType: "live-trivia",
    challengeMode: "progress",
    requiresScheduledGame: "live_trivia",
    requirementTemplate: "Earn {threshold} points in Live Trivia",
    supportsGameWinner: true,
    gameWinnerRequirement: "Win the Live Trivia game",
    thresholdOptions: [300, 500, 750, 1000],
    defaultThreshold: 500,
    thresholdStep: 10,
    accent: "trivia",
    glyph: "🧠",
  },
  {
    id: "nfl_pickem_challenge",
    name: "NFL Pick 'Em Challenge",
    gameType: "nfl-pickem",
    challengeMode: "progress",
    // Gates on the NFL season calendar (nfl_pickem_weeks), not on anything the
    // venue schedules — see docs/nfl-pickem-reward-plan.md finding #3. The week
    // scope that replaces the schedule lookup lives in lib/nflPickEmRewardWeeks.ts.
    requiresScheduledGame: null,
    requirementTemplate: "Get {threshold} NFL picks right",
    supportsGameWinner: true,
    gameWinnerRequirement: "Get the most NFL picks right at this venue",
    thresholdOptions: [5, 10, 25, 50],
    defaultThreshold: 10,
    thresholdStep: 1,
    accent: "pickem",
    glyph: "🏈",
  },
] as const;

export function getRewardDefinition(id: string): RewardDefinition | null {
  return REWARD_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

/**
 * Substitute the chosen threshold into a definition's requirement copy. A
 * "game_winner" reward has no threshold to substitute — it renders the
 * definition's fixed game-winner copy instead.
 */
export function renderRewardRequirement(
  definition: RewardDefinition,
  threshold: number,
  winCondition: ChallengeWinCondition = "points_threshold",
): string {
  if (winCondition === "game_winner") return definition.gameWinnerRequirement;
  const safeThreshold = Math.max(1, Math.round(Number(threshold)));
  return definition.requirementTemplate.replace("{threshold}", safeThreshold.toLocaleString("en-US"));
}

/**
 * Default granularity for a definition that doesn't state one — Live Trivia
 * questions are worth 10 points, so its targets land on multiples of 10. A
 * definition whose unit is a COUNT (NFL correct picks) sets thresholdStep: 1;
 * the step is per-definition rather than global for exactly that reason.
 */
export const REWARD_THRESHOLD_STEP = 10;

export function rewardThresholdStep(definition: RewardDefinition): number {
  const step = Math.round(Number(definition.thresholdStep));
  return Number.isFinite(step) && step >= 1 ? step : REWARD_THRESHOLD_STEP;
}

export function isValidRewardThreshold(threshold: number, definition: RewardDefinition): boolean {
  return Number.isFinite(threshold) && threshold >= 1 && threshold % rewardThresholdStep(definition) === 0;
}

/**
 * The refusal copy for a threshold that misses the definition's step. Lives here
 * rather than in lib/rewards.ts so the wizard (client) and createReward (server)
 * say the same thing, and so it names the definition's real step instead of a
 * hardcoded 10.
 */
export function rewardThresholdStepMessage(definition: RewardDefinition): string {
  const step = rewardThresholdStep(definition);
  if (step === 1) return "Enter a whole-number target.";
  return `Custom target must be a multiple of ${step}.`;
}

// The cadences Rewards can express on the challenge_campaigns engine. "none" is a
// one-off (a single scheduled game); "weekly" is anchored on the reward's active
// day(s); daily/monthly/yearly are calendar-anchored. All four recurrences have
// real cycle windows as of the terms-sentence rebuild — see
// computeCycleStart/computeCycleEnd in lib/challengeCampaigns.ts and
// docs/rewards-terms-sentence-plan.md Phase 1. Which of these a given venue may
// actually pick is a separate question answered by its Live Trivia schedule
// (lib/rewardTerms.ts) — a venue with Tuesday-only trivia can't offer a daily reward.
export const SUPPORTED_REWARD_CADENCES: readonly CampaignRecurringType[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

export function isSupportedRewardCadence(value: string): value is CampaignRecurringType {
  return (SUPPORTED_REWARD_CADENCES as readonly string[]).includes(value);
}

const REWARD_MENU_ITEM_LABEL: Record<RewardMenuItem, string> = {
  whole_order: "Whole Order",
  appetizer: "Appetizer",
  entree: "Entrée",
  dessert: "Dessert",
  wine_bottle: "Bottle of Wine",
  other: "Menu Item",
};

export type RewardPrizeSummaryInput = {
  prizeKind?: RewardPrizeKind | null;
  prizeMenuItem?: RewardMenuItem | null;
  prizeMenuItemName?: string | null;
  prizeDiscountKind?: RewardDiscountKind | null;
  prizeDiscountValue?: number | null;
  prizeGiftCertificateAmount?: number | null;
};

/**
 * Player-facing prize copy for a not-yet-won reward. Mirrors the wording
 * PrizeWalletPanel uses for already-won coupons (same field names, same rules)
 * so a guest sees consistent language before and after winning; kept here
 * rather than imported from that component since it renders a different
 * (post-win) record shape.
 */
export function describeRewardPrize(prize: RewardPrizeSummaryInput): string {
  if (prize.prizeKind === "gift_card") {
    const amount = Number(prize.prizeGiftCertificateAmount ?? 0);
    return amount > 0 ? `$${amount.toFixed(2)} gift card` : "Gift card";
  }
  if (prize.prizeKind === "menu_item") {
    const itemLabel =
      prize.prizeMenuItem === "other"
        ? prize.prizeMenuItemName?.trim() || "Menu Item"
        : prize.prizeMenuItem
          ? REWARD_MENU_ITEM_LABEL[prize.prizeMenuItem]
          : "Menu Item";
    if (prize.prizeDiscountKind === "percent" && prize.prizeDiscountValue != null) {
      return prize.prizeDiscountValue >= 100 ? `Free ${itemLabel}` : `${prize.prizeDiscountValue}% off ${itemLabel}`;
    }
    if (prize.prizeDiscountKind === "dollar" && prize.prizeDiscountValue != null) {
      return `$${prize.prizeDiscountValue.toFixed(2)} off ${itemLabel}`;
    }
    return itemLabel;
  }
  return "";
}
