// The Create Reward wizard's step ids, in flow order. Shared by the wizard
// (components/rewards/CreateRewardWizard.tsx) and by the Partner Dashboard's
// Rewards sheet, which mirrors the wizard's step into `?step=` so the phone's
// Back gesture steps back one question (docs/partner-dashboard-app-redesign-plan.md §4d).
// Pure: no React, no DOM.

export const REWARD_WIZARD_STEPS = ["venue", "definition", "terms", "prize", "confirm"] as const;

export type RewardWizardStep = (typeof REWARD_WIZARD_STEPS)[number];

export const isRewardWizardStep = (value: string | null | undefined): value is RewardWizardStep =>
  value !== null && value !== undefined && (REWARD_WIZARD_STEPS as readonly string[]).includes(value);

/** How a step change happened: the wizard's Next, its Back, or a correction nobody asked for. */
export type RewardWizardStepChange = "forward" | "back" | "replace";

/**
 * The step to actually show for a REQUESTED one. Terms, Prize and Confirm need
 * the reward the partner picked (and its schedule context); a reload or a
 * hand-edited `?step=` arrives without them, so those fall back to Definition.
 */
export const guardRewardWizardStep = (
  requested: RewardWizardStep,
  have: { definition: boolean; context: boolean },
): RewardWizardStep =>
  (requested === "terms" || requested === "prize" || requested === "confirm") && !(have.definition && have.context)
    ? "definition"
    : requested;
