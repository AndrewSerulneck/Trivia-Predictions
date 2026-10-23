import type { StoryShareGameType, StorySharePayload, StoryShareTemplateVariant } from "./contracts";
import { storyShareGame } from "./shareGames";

export const DEFAULT_STORY_TEMPLATE_VARIANT: StoryShareTemplateVariant = "default";

export function resolveStoryShareTemplateVariant(
  payload: Pick<StorySharePayload, "finalRank" | "isChampion">,
  requestedVariant?: StoryShareTemplateVariant | null
): StoryShareTemplateVariant {
  if (requestedVariant) {
    return requestedVariant;
  }
  if (payload.isChampion) {
    return "champion";
  }
  if (payload.finalRank != null && payload.finalRank >= 1 && payload.finalRank <= 3) {
    return "top3";
  }
  return DEFAULT_STORY_TEMPLATE_VARIANT;
}

/** The selfie frame for a game (its registry entry); null when the game has none. */
export function getStoryFrameAssetUrl(
  gameType: StoryShareGameType,
  variant: StoryShareTemplateVariant = DEFAULT_STORY_TEMPLATE_VARIANT
): string | null {
  const frames = storyShareGame(gameType).frames;
  if (!frames) return null;
  return variant === "champion" ? frames.champion : frames.default;
}
