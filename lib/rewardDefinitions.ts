// Client-safe Reward definition registry (Rewards Phase 4). No "server-only"
// import and no Supabase dependency — shared by the Create Reward wizard UI
// (Phase 5) and the server expansion (lib/rewards.ts), mirroring
// lib/ownerCompetitionTemplates.ts. Each definition declares the game whose
// points count, the requirement copy, threshold options, and which scheduled
// group game (if any) gates its creation.
//
// Adding a future reward = ONE entry here (+ a schedule lookup in lib/rewards.ts
// only if it gates on a group game that isn't already handled). See
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
import { BRACKET_PRIZE_DEFINITION_ID, isBracketPrizeOffered } from "@/lib/bracketPrizes";
import { SQUARES_PRIZE_DEFINITION_ID, isSquaresPrizeOffered } from "@/lib/squaresPrizes";
import { BRACKET_GAME_NAME, SQUARES_EVENT_NAME, SQUARES_GAME_NAME } from "@/lib/venueGameCards";

export type RewardDefinitionId =
  | "live_trivia_challenge"
  | "nfl_pickem_challenge"
  | typeof SQUARES_PRIZE_DEFINITION_ID
  | typeof BRACKET_PRIZE_DEFINITION_ID;

/**
 * The Live Trivia Challenge's definition id. Its two sweeps (game winner, weekly places) pay ONLY
 * prizes with this id: a Squares or NFL prize is also `game_winner`, and must never go to a trivia
 * winner (docs/squares-and-brackets-plan.md §13 F1; tests/prize-sweep-ownership-contract.test.ts).
 */
export const LIVE_TRIVIA_REWARD_DEFINITION_ID = "live_trivia_challenge" satisfies RewardDefinitionId;

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
 *   {week}      — the one NFL week a single-week reward covers: "9"
 *   {when}      — win lines only: "the week of Oct 6", "in Week 5", "in the 2026 season"
 *   {top}       — weekly places: "top 3", "top 2", "1st"
 *   {across}    — weekly places: "across Wednesday, Thursday and Friday nights", "on Tuesday night"
 *   {ladder}    — weekly places: "1st place wins a $30 gift card, 2nd place wins a $20 gift card and 3rd place wins a $10 gift card."
 *   {place}     — weekly places win line: "1st"
 *   {moments}   — Squares: the moments that pay, "halftime or the end of the game"
 *   {moment}    — Squares win line: "halftime"
 *   {brackets}  — March Madness: the brackets that pay, "the men's bracket or the women's bracket"
 *   {bracket}   — March Madness win line: "men's bracket"
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
      /** Weekly 1st / 2nd / 3rd places over the week's games ("ranked_places"). */
      rankedPlacesWeekly: string;
      /** Prize-wallet coupon: the place a guest finished in a weekly places reward. */
      wonRankedPlace: string;
    }
  | {
      calendar: "nfl_season";
      mostPicksWeekly: string;
      mostPicksSeason: string;
      mostPicksSingleWeek: string;
      picksTargetWeekly: string;
      picksTargetSingleWeek: string;
      picksTargetSeason: string;
      wonMostPicks: string;
      wonPicksTarget: string;
    }
  | {
      /** Super Bowl Squares: one prize per chosen scoring moment (lib/squaresPrizes.ts). */
      calendar: "super_bowl_squares";
      /** "Hold the winning … square at {moments} and win {prize}." */
      moments: string;
      /** Prize-wallet coupon: "You held the winning … square at {moment}". */
      wonMoment: string;
    }
  | {
      /** March Madness brackets: 1st / 2nd / 3rd in each chosen bracket (lib/bracketPrizes.ts). */
      calendar: "march_madness";
      /** "Finish {top} in {brackets}. {ladder}" */
      places: string;
      /** Prize-wallet coupon: "You finished {place} in your {bracket}". */
      wonPlace: string;
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
   * The scheduled group game a venue must already run for this reward to be
   * creatable, or null for a reward that gates on nothing. Powers the "schedule
   * it first" block + cadence derivation in lib/rewards.ts.
   */
  requiresScheduledGame: OwnerScheduleGameType | null;
  /** Player-facing requirement copy; `{threshold}` is substituted at expansion. */
  requirementTemplate: string;
  /**
   * Whether this reward can be offered to the winner of the game outright,
   * ignoring any points target. Only meaningful for definitions backed by a
   * group game that produces a per-occurrence winner (see
   * lib/liveTriviaWinnerRewards.ts).
   */
  supportsGameWinner: boolean;
  /** Requirement copy used when winCondition is "game_winner". */
  gameWinnerRequirement: string;
  /**
   * Whether this reward can pay 1st / 2nd / 3rd place over a week of the game's points
   * ("ranked_places", docs/live-trivia-weekly-places-reward-plan.md). Needs a weekly game
   * the venue schedules itself, so only Live Trivia has it — never NFL Pick 'Em.
   */
  supportsRankedPlaces: boolean;
  /** Requirement copy used when winCondition is "ranked_places". Null when unsupported. */
  rankedPlacesRequirement: string | null;
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
    id: LIVE_TRIVIA_REWARD_DEFINITION_ID,
    name: "Live Trivia Challenge",
    gameName: "Live Trivia",
    gameType: "live-trivia",
    challengeMode: "progress",
    requiresScheduledGame: "live_trivia",
    requirementTemplate: "Earn {threshold} points in Live Trivia",
    supportsGameWinner: true,
    gameWinnerRequirement: "Win the Live Trivia game",
    supportsRankedPlaces: true,
    rankedPlacesRequirement: "Finish at the top of Live Trivia this week",
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
      rankedPlacesWeekly: "Finish {top} in Live Trivia {across} each week. {ladder}",
      wonRankedPlace: "You finished {place} in Live Trivia {when}",
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
    supportsRankedPlaces: false,
    rankedPlacesRequirement: null,
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
      mostPicksSingleWeek: "Get the most NFL picks right in Week {week} and win {prize}.",
      picksTargetWeekly: "Get {threshold} NFL picks right this week and win {prize}.",
      picksTargetSingleWeek: "Get {threshold} NFL picks right in Week {week} and win {prize}.",
      picksTargetSeason: "Get {threshold} NFL picks right by the end of the regular season and win {prize}.",
      wonMostPicks: "You got the most NFL picks right {when}",
      wonPicksTarget: "You got {threshold} NFL picks right {when}",
    },
  },
  {
    // Super Bowl Squares (docs/squares-and-brackets-plan.md Phase 4). Won only by holding a moment's
    // winning square — no points target, no minimum players. The partner picks which moments pay
    // (challenge_campaigns.squares_moments); gated on the Squares flag + season, not a schedule.
    // Offered only while isSquaresPrizeOffered (offeredRewardDefinitions below).
    id: SQUARES_PRIZE_DEFINITION_ID,
    name: `${SQUARES_GAME_NAME} Challenge`,
    gameName: SQUARES_GAME_NAME,
    gameType: "squares",
    challengeMode: "progress",
    requiresScheduledGame: null,
    requirementTemplate: "Hold the winning square",
    supportsGameWinner: true,
    gameWinnerRequirement: "Hold the winning square",
    supportsRankedPlaces: false,
    rankedPlacesRequirement: null,
    thresholdOptions: [],
    defaultThreshold: 1,
    thresholdStep: 1,
    accent: "squares",
    glyph: "🔢",
    description: {
      calendar: "super_bowl_squares",
      moments: `Hold the winning ${SQUARES_EVENT_NAME} square at {moments} and win {prize}.`,
      wonMoment: `You held the winning ${SQUARES_EVENT_NAME} square at {moment}`,
    },
  },
  {
    // March Madness brackets (docs/squares-and-brackets-plan.md Phase 9a). Won only by finishing 1st /
    // 2nd / 3rd in a chosen bracket at the venue ("ranked_places", one cycle per bracket), with the
    // partner's optional minimum. Gated on the brackets flag + season, not a schedule. Offered only
    // while isBracketPrizeOffered (offeredRewardDefinitions below).
    id: BRACKET_PRIZE_DEFINITION_ID,
    name: `${BRACKET_GAME_NAME} Challenge`,
    gameName: BRACKET_GAME_NAME,
    gameType: "bracket",
    challengeMode: "progress",
    requiresScheduledGame: null,
    requirementTemplate: "Finish at the top of your bracket",
    supportsGameWinner: false,
    gameWinnerRequirement: "Finish at the top of your bracket",
    supportsRankedPlaces: true,
    rankedPlacesRequirement: "Finish at the top of your bracket",
    thresholdOptions: [],
    defaultThreshold: 1,
    thresholdStep: 1,
    accent: "bracket",
    glyph: "🏀",
    description: {
      calendar: "march_madness",
      places: "Finish {top} in {brackets}. {ladder}",
      wonPlace: "You finished {place} in your {bracket}",
    },
  },
] as const;

/**
 * The definitions the Create Prize wizard offers today. Every definition is always readable
 * (getRewardDefinition — old prizes must still describe themselves); this only hides a seasonal
 * one out of season: Squares or March Madness while its flag is off or after its card window.
 */
export function offeredRewardDefinitions(now: Date = new Date()): RewardDefinition[] {
  return REWARD_DEFINITIONS.filter((definition) =>
    definition.id === SQUARES_PRIZE_DEFINITION_ID
      ? isSquaresPrizeOffered(now)
      : definition.id === BRACKET_PRIZE_DEFINITION_ID
        ? isBracketPrizeOffered(now)
        : true,
  );
}

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
  if (winCondition === "ranked_places" && definition.rankedPlacesRequirement) {
    return definition.rankedPlacesRequirement;
  }
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
