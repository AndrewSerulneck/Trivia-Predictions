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
} from "@/types";

export type RewardDefinitionId = "live_trivia_challenge";

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
    accent: "trivia",
    glyph: "🧠",
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

/** Live Trivia questions are worth 10 points, so every target must land on a multiple of 10. */
export const REWARD_THRESHOLD_STEP = 10;

export function isValidRewardThreshold(threshold: number): boolean {
  return Number.isFinite(threshold) && threshold >= 1 && threshold % REWARD_THRESHOLD_STEP === 0;
}

// The cadences Rewards can express on the current challenge_campaigns engine.
// "weekly" is the flagship recurring cycle — computeCycleStart is weekly-anchored
// on the reward's active day(s) — and "none" is a one-off. daily/monthly/yearly
// await the computeCycleStart/computeCycleEnd extension noted in
// docs/rewards-system-plan.md §7, so they are intentionally NOT offered yet.
export const SUPPORTED_REWARD_CADENCES: readonly CampaignRecurringType[] = ["none", "weekly"];

export function isSupportedRewardCadence(value: string): value is CampaignRecurringType {
  return (SUPPORTED_REWARD_CADENCES as readonly string[]).includes(value);
}
