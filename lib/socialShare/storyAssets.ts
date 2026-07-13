import type { StoryShareGameType, StorySharePayload, StoryShareTemplateVariant } from "./contracts";

type StoryFrameAssetMap = Record<StoryShareGameType, Partial<Record<StoryShareTemplateVariant, string>>>;

export const DEFAULT_STORY_TEMPLATE_VARIANT: StoryShareTemplateVariant = "default";

export const STORY_FRAME_ASSET_URLS: StoryFrameAssetMap = {
  "live-trivia": {
    default: "/story-frames/live-trivia/default.png",
    champion: "/story-frames/live-trivia/champion.png",
    top3: "/story-frames/live-trivia/default.png",
    funny: "/story-frames/live-trivia/default.png",
    minimal: "/story-frames/live-trivia/default.png",
  },
  "category-blitz": {
    default: "/story-frames/category-blitz/default.png",
    champion: "/story-frames/category-blitz/champion.png",
    top3: "/story-frames/category-blitz/default.png",
    funny: "/story-frames/category-blitz/default.png",
    minimal: "/story-frames/category-blitz/default.png",
  },
};

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

export function getStoryFrameAssetUrl(
  gameType: StoryShareGameType,
  variant: StoryShareTemplateVariant = DEFAULT_STORY_TEMPLATE_VARIANT
): string {
  return (
    STORY_FRAME_ASSET_URLS[gameType][variant] ??
    STORY_FRAME_ASSET_URLS[gameType][DEFAULT_STORY_TEMPLATE_VARIANT] ??
    STORY_FRAME_ASSET_URLS["live-trivia"][DEFAULT_STORY_TEMPLATE_VARIANT]!
  );
}
