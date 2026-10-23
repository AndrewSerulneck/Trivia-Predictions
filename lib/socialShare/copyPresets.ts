import { APP_DOWNLOAD_URL } from "@/lib/appDownloadLink";
import { withIndefiniteArticle } from "@/lib/rewardDefinitions";
import type { StorySharePayload, StorySharePrize } from "./contracts";
import { storyShareGame } from "./shareGames";

// All words on a share picture live in this file (docs/native-app-store-plan.md Phase 9b).
// On screen it is always "Prize", never "Reward".

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
    "Came for the wings, left a legend at [Venue Name]",
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
    "Undefeated at [Venue Name]",
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

// ── The headline on every share picture (Andrew, 2026-10-22, plan Phases 9a–9f decision 4) ──

/** The app line on every picture, beside the QR code. */
export const SHARE_PLAY_LINE = "Play on Hightop Challenge";

/** Under the QR code. */
export const SHARE_SCAN_LINE = "Scan to play";

const atVenue = (venueName: string | null | undefined): string => {
  const name = venueName?.trim();
  return name ? ` at ${name}` : "";
};

/**
 * A prize inside a sentence, from its card face: "a Free Appetizer", "a Bottle of Wine",
 * "50% off an Appetizer", "$10 off an Entrée". An amount gift card is handled by the caller.
 */
export const sharePrizeInSentence = (prize: StorySharePrize): string => {
  const headline = prize.headline.trim();
  const discount = /^(\d+(?:\.\d+)?% Off|\$[\d.,]+ Off) (.+)$/.exec(headline);
  if (discount) return `${discount[1].replace(/ Off$/, " off")} ${withIndefiniteArticle(discount[2])}`;
  return withIndefiniteArticle(headline);
};

const ordinal = (rank: number): string => {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  return `${rank}${rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th"}`;
};

/**
 * THE headline of a share picture — never re-derived per screen:
 * - a gift card with an amount: "I just won $15 off my tab at The Pour House!" (Andrew's words);
 * - any other prize: "I just won a Free Appetizer at The Pour House!";
 * - a game won with no prize: "I just won Live Trivia at The Pour House!";
 * - a game finished but not won: "I finished 3rd in Live Trivia at …!", else "I just played …".
 * No venue on file → the sentence simply ends without " at …".
 */
export const shareWinHeadline = (
  payload: Pick<StorySharePayload, "gameType" | "venueName" | "prize" | "isChampion" | "finalRank">,
): string => {
  const at = atVenue(payload.venueName);
  const prize = payload.prize;
  if (prize) {
    if (prize.label === "GIFT CARD" && prize.headlineKind === "amount") {
      return `I just won ${prize.headline.trim()} off my tab${at}!`;
    }
    return `I just won ${sharePrizeInSentence(prize)}${at}!`;
  }
  const game = storyShareGame(payload.gameType).label;
  if (payload.isChampion) return `I just won ${game}${at}!`;
  const rank = payload.finalRank;
  if (rank != null && Number.isFinite(rank) && rank >= 1) return `I finished ${ordinal(Math.trunc(rank))} in ${game}${at}!`;
  return `I just played ${game}${at}!`;
};

/** "@thepourhouse" — a handle as the picture and the caption print it. */
export const shareInstagramMention = (handle: string): string => `@${handle.replace(/^@+/, "")}`;

/**
 * The text that travels with the picture (where the target keeps it): the headline, the bar's
 * @handle when the venue shows one (a real mention in an Instagram/Facebook/X caption — Phase 9e,
 * decision 10), then the app link: "… at The Pour House! @thepourhouse Play on Hightop Challenge: <link>".
 */
export const shareWinText = (headline: string, instagram?: string | null): string => {
  const mention = instagram?.trim() ? ` ${shareInstagramMention(instagram.trim())}` : "";
  return `${headline}${mention} ${SHARE_PLAY_LINE}: ${APP_DOWNLOAD_URL}`;
};

/** The design picker's names for the designs (screen copy). */
export const SHARE_DESIGN_NAMES = {
  spotlight: "Spotlight",
  card: "Card",
  night: "Night",
  selfie: "Selfie",
} as const;

/** The size toggle. */
export const SHARE_SIZE_NAMES = { story: "Story", post: "Post" } as const;

// ── The share sheet (Phase 9d) ──

/** The caption box's button. */
export const SHARE_COPY_CAPTION_LABEL = "Copy caption + link";

/**
 * The one quiet line under the destinations (Andrew, 2026-10-22): "Tag @thepourhouse in your post"
 * when the venue shows its handle (Phase 9e), else "Tag The Pour House in your post", else nothing.
 */
export const shareTagNudge = (venueName: string | null | undefined, instagram?: string | null): string | null => {
  const handle = instagram?.trim();
  if (handle) return `Tag ${shareInstagramMention(handle)} in your post`;
  const name = venueName?.trim();
  return name ? `Tag ${name} in your post` : null;
};

/** What each destination is called, and what the sheet says once it has been tapped. */
export const SHARE_DESTINATION_COPY = {
  "instagram-story": {
    label: "Instagram Story",
    direct: "Caption + link copied. Paste the link in a link sticker.",
    viaSheet: "Caption + link copied. Pick Instagram, then Story. Paste the link in a link sticker.",
    // In the app, when the direct Story shortcut didn't open Instagram. The share sheet can't open
    // from here (the tap is spent), so the next tap, on More, opens it.
    directFailed: "Instagram didn't open. Tap More to share the picture.",
  },
  "instagram-post": {
    label: "Instagram post",
    direct: "Caption copied. Pick Instagram, then Feed, and paste the caption.",
    viaSheet: "Caption copied. Pick Instagram, then Feed, and paste the caption.",
  },
  facebook: {
    label: "Facebook",
    direct: "Caption copied. Pick Facebook and paste the caption.",
    viaSheet: "Caption copied. Pick Facebook and paste the caption.",
  },
  x: {
    label: "X",
    direct: "Opening X with your caption.",
    viaSheet: "Pick X. Your caption goes with the picture.",
  },
  messages: {
    label: "Messages",
    direct: "Pick Messages or WhatsApp. Your caption goes with the picture.",
    viaSheet: "Pick Messages or WhatsApp. Your caption goes with the picture.",
  },
  save: {
    label: "Save",
    direct: "Picture saved.",
    viaSheet: "Choose Save Image.",
  },
  more: {
    label: "More",
    direct: "Pick an app. Your caption goes with the picture.",
    viaSheet: "Pick an app. Your caption goes with the picture.",
  },
} as const;

export const SHARE_CAPTION_COPIED = "Caption + link copied.";
/** While the sheet checks what the bar shows on pictures (9f.4): nothing can be sent yet. */
export const SHARE_VENUE_LOADING = "Getting your picture ready…";
export const SHARE_CAPTION_COPY_FAILED = "Couldn't copy. Press and hold the caption to copy it.";
