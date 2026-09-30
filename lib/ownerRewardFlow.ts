import { isRewardWizardStep, REWARD_WIZARD_STEPS, type RewardWizardStep } from "@/lib/rewardWizardSteps";
import { parseStepParam } from "@/lib/ownerSheetParams";

// The Offer Rewards sheet's screens and request bodies (docs/partner-dashboard-app-redesign-plan.md
// §4f). Pure: no React, no DOM. The wizard's own steps (definition → terms → prize →
// confirm) come from lib/rewardWizardSteps.ts; this adds the screens around it.

/** Screens outside the wizard: the list, one reward, ending it, and ended rewards. */
export const REWARD_LIST_STEPS = ["all", "detail", "end", "history"] as const;
export type RewardListStep = (typeof REWARD_LIST_STEPS)[number];

/** Every `?step=` the Rewards sheet understands. */
export type RewardSheetStep = RewardListStep | RewardWizardStep;

/** The four panes SlideSteps moves between; the whole wizard is one pane (it slides its own steps). */
export type RewardScreen = RewardListStep | "wizard";

/**
 * Left-to-right ranking for the pane slide: the list, one reward, ending it,
 * the create wizard, then ended rewards at the far end. Every pane needs a rank
 * — an unranked one always counts as "forward".
 */
export const REWARD_SLIDE_ORDER: readonly RewardScreen[] = ["all", "detail", "end", "wizard", "history"];

/** The wizard steps an owner can be on (the venue step never shows: the dashboard has one venue). */
export const OWNER_WIZARD_STEPS: readonly RewardWizardStep[] = REWARD_WIZARD_STEPS.filter((step) => step !== "venue");

export const isRewardListStep = (value: string | null | undefined): value is RewardListStep =>
  value !== null && value !== undefined && (REWARD_LIST_STEPS as readonly string[]).includes(value);

/**
 * The screen for the URL's `?step=`. No step (a bare `?sheet=rewards`, e.g. the
 * old /owner/competitions redirect) shows the list. A screen about one reward
 * with no reward to show (a reload lost it) falls back to the list; the venue
 * step (never used here) and anything unknown land on the list / Definition.
 */
export const resolveRewardSheetStep = ({
  rawStep,
  hasReward,
}: {
  rawStep: string | null | undefined;
  hasReward: boolean;
}): RewardSheetStep => {
  const parsed = parseStepParam(rawStep);
  if (parsed === null) return "all";
  if (isRewardListStep(parsed)) return (parsed === "detail" || parsed === "end") && !hasReward ? "all" : parsed;
  if (isRewardWizardStep(parsed)) return parsed === "venue" ? "definition" : parsed;
  return "all";
};

export const rewardScreenFor = (step: RewardSheetStep): RewardScreen => (isRewardListStep(step) ? step : "wizard");

/** How many prizes a reward has paid out — mirrors ChallengeCampaignRedemptionCounts. */
export type RedemptionCounts = { awarded: number; unredeemed: number; redeemed: number };

export type RemoveMode = "archive" | "delete";

/**
 * What the partner is told after removing a reward. Reports what actually
 * happened (the server's `outcome`), not the mode that was asked for — a delete
 * of a reward with redeemed prizes is kept for the records.
 */
export const removeOutcomeMessage = (outcome: "archived" | "deleted" | undefined, redeemedKept: number | undefined): string =>
  outcome === "deleted"
    ? redeemedKept
      ? `Reward deleted. ${redeemedKept} already-redeemed ${redeemedKept === 1 ? "prize" : "prizes"} kept for your records.`
      : "Reward deleted."
    : "Reward archived. Prizes already awarded still work.";
