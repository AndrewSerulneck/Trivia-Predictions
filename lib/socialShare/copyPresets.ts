import type { StorySharePayload } from "./contracts";

export type StoryCaptionCategory = "funny" | "confident" | "polished";

export const STORY_CAPTION_PRESETS: Record<StoryCaptionCategory, readonly string[]> = {
  funny: [
    "My brain is 90% trivia and 10% remembering tabs",
    "Last call for answers. I said hold my beer",
    "IQ test came back positive for bar food",
    "Spent $40 to win $10 and I'd do it again",
    "My trivia score gave me the validation I needed",
    "Currently accepting apologies from doubters",
    "Brain cells depleted. Victory intact.",
    "I came, I saw, I vaguely remembered",
    "Useless knowledge finally paid for nachos",
    "Teams of six? I heard me against the world",
  ],
  confident: [
    "Undisputed. Unbothered. Unstoppable.",
    "Not lucky, just inevitable.",
    "Someone's gotta set the standard",
    "The leaderboard has entered my era",
    "Built different, proven tonight",
    "Knew it before the question finished",
    "This isn't even my final form",
    "Legendary status unlocked",
    "Second place had worse WiFi",
    "Started at the bar, ended on top",
  ],
  polished: [
    "Champion at [Venue Name]",
    "Another unforgettable trivia night",
    "Knowledge met good times tonight",
    "Proof that showing up pays off",
    "Great questions, better people",
    "Trivia night done right at [Venue Name]",
    "Small wins, big memories",
    "Good food, good drinks, great trivia",
    "The best way to spend a night out",
    "Challenging questions, rewarding results",
  ],
} as const;

const MAX_CAPTION_LENGTH = 60;
const FALLBACK_VENUE_NAME = "Hightop";

function normalizeCaption(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableCaptionIndex(payload: StorySharePayload, captionCount: number): number {
  const seed = `${payload.gameType}:${payload.venueId}:${payload.userId}:${payload.finalRank ?? "rank"}:${payload.finalPoints ?? "points"}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return captionCount > 0 ? hash % captionCount : 0;
}

export function truncateStoryCaption(value: string, maxLength = MAX_CAPTION_LENGTH): string {
  const normalized = normalizeCaption(value);
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 32 ? lastSpace : maxLength).trimEnd()}...`;
}

export function selectStoryCaptionCategory(payload: StorySharePayload): StoryCaptionCategory {
  if (payload.isChampion || (payload.finalRank != null && payload.finalRank >= 1 && payload.finalRank <= 3)) {
    return "confident";
  }
  if (payload.venueName) {
    return "polished";
  }
  return "funny";
}

export function resolveStoryCaptionPreset(payload: StorySharePayload): string {
  const category = selectStoryCaptionCategory(payload);
  const options = STORY_CAPTION_PRESETS[category];
  const selected = options[stableCaptionIndex(payload, options.length)] ?? "";
  const venueName = payload.venueName?.trim() || FALLBACK_VENUE_NAME;
  return truncateStoryCaption(selected.replaceAll("[Venue Name]", venueName));
}
