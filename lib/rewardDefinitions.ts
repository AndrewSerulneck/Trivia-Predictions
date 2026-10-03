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

/**
 * Guest-facing description templates, composed at READ time by describeReward /
 * describeRewardWin (lib/rewardDescription.ts) — see
 * docs/reward-descriptions-plan.md §3 for the approved copy. `calendar` picks the
 * structural copy the composer wraps around these sentences (the When and Fine
 * print lines): a reward that runs at the venue's own scheduled games, or one
 * that runs on the NFL season calendar.
 *
 * Placeholders, substituted by the composer:
 *   {prize}     — the prize with its article: "a $100 gift card", "20% off your whole order"
 *   {threshold} — the points / picks target: "500", "1,000"
 *   {nights}    — "Tuesday night", "Tuesday and Thursday nights", "any night"
 *   {date}      — a game date: "Tue, Oct 7"
 *   {period}    — "this week", "today", "this month", "this year"
 *   {fromWeek}  — the first NFL week a season-long reward covers: "5"
 *   {when}      — win lines only: "the week of Oct 6", "in Week 5", "in the 2026 season"
 *
 * Never write "this venue" — the guest is standing in it.
 */
export type RewardDescriptionTemplates =
  | {
      calendar: "venue_schedule";
      /** Game winner, pinned to recurring games. */
      gameWinnerRecurring: string;
      /** Game winner, pinned to one dated game. */
      gameWinnerOneOff: string;
      /** Game winner with no pinned games (legacy "award at every game"). */
      gameWinnerAnyGame: string;
      /** Points target that resets every {period}. */
      pointsRecurring: string;
      /** Points target for one dated game. */
      pointsOneOff: string;
      /** Points target, one-time, with no single game to name. */
      pointsUndated: string;
      /** Prize-wallet coupon: what the guest won a game-winner reward for. */
      wonGameWinner: string;
      /** Prize-wallet coupon: what the guest won a points-target reward for. */
      wonPoints: string;
    }
  | {
      calendar: "nfl_season";
      mostPicksWeekly: string;
      mostPicksSeason: string;
      picksTargetWeekly: string;
      picksTargetSeason: string;
      wonMostPicks: string;
      wonPicksTarget: string;
    };

export type RewardDefinition = {
  id: RewardDefinitionId;
  /** Reward name shown on the card and stored as the campaign name. */
  name: string;
  /** Just the game's name, no "Challenge" — the wizard's "Which game…?" option buttons show this. */
  gameName: string;
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
  /** Guest-facing description sentences — see RewardDescriptionTemplates. */
  description: RewardDescriptionTemplates;
};

export const REWARD_DEFINITIONS: readonly RewardDefinition[] = [
  {
    id: "live_trivia_challenge",
    name: "Live Trivia Challenge",
    gameName: "Live Trivia",
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
    description: {
      calendar: "venue_schedule",
      gameWinnerRecurring: "Win Live Trivia on {nights} and win {prize}.",
      gameWinnerOneOff: "Win Live Trivia on {date} and win {prize}.",
      gameWinnerAnyGame: "Win any Live Trivia game {period} and win {prize}.",
      pointsRecurring: "Earn {threshold} points in Live Trivia {period} and win {prize}.",
      pointsOneOff: "Earn {threshold} points at Live Trivia on {date} and win {prize}.",
      pointsUndated: "Earn {threshold} points in Live Trivia and win {prize}.",
      wonGameWinner: "You won Live Trivia on {date}",
      wonPoints: "You earned {threshold} points in Live Trivia {when}",
    },
  },
  {
    id: "nfl_pickem_challenge",
    name: "NFL Pick 'Em Challenge",
    gameName: "NFL Pick 'Em",
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
    description: {
      calendar: "nfl_season",
      mostPicksWeekly: "Get the most NFL picks right this week and win {prize}.",
      mostPicksSeason:
        "Get the most NFL picks right from Week {fromWeek} through the end of the regular season and win {prize}.",
      picksTargetWeekly: "Get {threshold} NFL picks right this week and win {prize}.",
      picksTargetSeason: "Get {threshold} NFL picks right by the end of the regular season and win {prize}.",
      wonMostPicks: "You got the most NFL picks right {when}",
      wonPicksTarget: "You got {threshold} NFL picks right {when}",
    },
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

// In-sentence nouns for the menu items, lowercase and article-ready. Kept beside
// REWARD_MENU_ITEM_LABEL (the Title Case headline labels) so a new item is one
// edit in one file.
const REWARD_MENU_ITEM_NOUN: Record<Exclude<RewardMenuItem, "other">, { noun: string; phrase: string }> = {
  whole_order: { noun: "whole order", phrase: "your whole order" },
  appetizer: { noun: "appetizer", phrase: "an appetizer" },
  entree: { noun: "entrée", phrase: "an entrée" },
  dessert: { noun: "dessert", phrase: "a dessert" },
  wine_bottle: { noun: "bottle of wine", phrase: "a bottle of wine" },
};

/** "$100", "$12.50" — whole-dollar amounts drop the cents in a sentence. */
const formatPrizeMoney = (amount: number): string =>
  Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;

/**
 * "a" / "an" in front of a noun phrase, by its first letter. A phrase that
 * already starts with an article, a possessive or a number is returned as-is, so
 * a partner's own "2 Tacos" or "The Big Burger" isn't turned into "a 2 Tacos".
 * A plural-looking name ("Chicken Wings", "free Nachos" — last word ends in s,
 * not "ss"/"us", and no "of" phrase like "Order of Wings") takes no article.
 */
export function withIndefiniteArticle(phrase: string): string {
  const text = phrase.trim();
  if (!text) return text;
  if (/^(a|an|the|your|one|two|three)\s/i.test(text) || /^[\d$]/.test(text)) return text;
  if (!/\sof\s/i.test(text) && /[^su]s$/i.test(text)) return text;
  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

/**
 * The prize as it reads INSIDE a sentence — "…and win {prize}." — with its
 * article: "a $100 gift card", "a free appetizer", "20% off your whole order".
 * Same rules and field names as describeRewardPrize (the Title Case headline),
 * which stays unchanged for its own callers. Never empty: a prize with nothing
 * to describe reads "a prize".
 */
export function describeRewardPrizeInSentence(prize: RewardPrizeSummaryInput): string {
  if (prize.prizeKind === "gift_card") {
    const amount = Number(prize.prizeGiftCertificateAmount ?? 0);
    return amount > 0 ? `a ${formatPrizeMoney(amount)} gift card` : "a gift card";
  }
  if (prize.prizeKind === "menu_item") {
    const custom = prize.prizeMenuItem === "other" ? prize.prizeMenuItemName?.trim() ?? "" : "";
    const known =
      prize.prizeMenuItem && prize.prizeMenuItem !== "other" ? REWARD_MENU_ITEM_NOUN[prize.prizeMenuItem] : null;
    const noun = known?.noun ?? (custom || "menu item");
    const phrase = known?.phrase ?? withIndefiniteArticle(custom || "menu item");

    if (prize.prizeDiscountKind === "percent" && prize.prizeDiscountValue != null) {
      if (prize.prizeDiscountValue >= 100) {
        return prize.prizeMenuItem === "whole_order" ? "your whole order free" : withIndefiniteArticle(`free ${noun}`);
      }
      return `${prize.prizeDiscountValue}% off ${phrase}`;
    }
    if (prize.prizeDiscountKind === "dollar" && prize.prizeDiscountValue != null) {
      return `${formatPrizeMoney(prize.prizeDiscountValue)} off ${phrase}`;
    }
    return phrase;
  }
  return "a prize";
}
