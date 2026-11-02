// The Create Reward wizard's step ids, in flow order. Shared by the wizard
// (components/rewards/CreateRewardWizard.tsx) and by the Partner Dashboard's
// Rewards sheet, which mirrors the wizard's step into `?step=` so the phone's
// Back gesture steps back one question (docs/partner-dashboard-app-redesign-plan.md §4d).
// Pure: no React, no DOM.

// "games" and "when" are the Pick 'Em Prize's own questions (docs/pickem-college-football-and-prize-plan.md
// Phase 5), asked before its "How to win" (the terms step). No other prize shows them.
export const REWARD_WIZARD_STEPS = ["venue", "definition", "games", "when", "terms", "players", "prize", "confirm"] as const;

export type RewardWizardStep = (typeof REWARD_WIZARD_STEPS)[number];

export const isRewardWizardStep = (value: string | null | undefined): value is RewardWizardStep =>
  value !== null && value !== undefined && (REWARD_WIZARD_STEPS as readonly string[]).includes(value);

/** How a step change happened: the wizard's Next, its Back, or a correction nobody asked for. */
export type RewardWizardStepChange = "forward" | "back" | "replace";

/**
 * The step to actually show for a REQUESTED one. Every step after Definition needs
 * the reward the partner picked (and its schedule context); a reload or a
 * hand-edited `?step=` arrives without them, so those fall back to Definition.
 * Players is the "how many players must play?" question, asked only where players
 * compete (`offersMinimum`); a points target has none, so a request for it lands on Prize.
 *
 * `pickem` is present only for the Pick 'Em Prize: whether its Games, When and How to win answers
 * are usable. A later step without them goes back to the first unanswered one. Every other prize
 * has no Games or When step, so a request for one lands on Terms.
 */
export const guardRewardWizardStep = (
  requested: RewardWizardStep,
  have: {
    definition: boolean;
    context: boolean;
    offersMinimum: boolean;
    pickem?: { scope: boolean; window: boolean; terms: boolean } | null;
  },
): RewardWizardStep => {
  if (requested === "venue" || requested === "definition") return requested;
  if (!(have.definition && have.context)) return "definition";
  const order = REWARD_WIZARD_STEPS.indexOf(requested);
  if (have.pickem) {
    if (!have.pickem.scope && order > REWARD_WIZARD_STEPS.indexOf("games")) return "games";
    if (!have.pickem.window && order > REWARD_WIZARD_STEPS.indexOf("when")) return "when";
    if (!have.pickem.terms && order > REWARD_WIZARD_STEPS.indexOf("terms")) return "terms";
  } else if (requested === "games" || requested === "when") {
    return "terms";
  }
  return requested === "players" && !have.offersMinimum ? "prize" : requested;
};
