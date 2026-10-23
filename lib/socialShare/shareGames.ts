import { BRACKET_GAME_NAME, SQUARES_GAME_NAME } from "@/lib/venueGameCards";

/**
 * Every game a player can share a win from (docs/native-app-store-plan.md Phase 9b).
 *
 * A game is a registry entry, not a branch: its name, colours, selfie frames and the result
 * fields its picture shows. Adding a game to sharing = one entry here; nothing under
 * components/social-share/ or the layout code (shareDesigns.ts) may name a game id.
 * Live Trivia and Category Blitz keep the values they had before the registry.
 * `prize` is a prize won (the gift card is the picture), whatever game it came from.
 */

export type StoryShareResultField = "rank" | "points" | "correct";

export interface StoryShareGameColors {
  primary: string;
  secondary: string;
  textSecondary: string;
  champion: string;
}

export interface StoryShareGameEntry {
  /** The game inside a sentence: "I just won Live Trivia at The Pour House!". */
  label: string;
  /** The payload title for a winner / everyone else. */
  championTitle: string;
  runTitle: string;
  /** Small label on the camera preview. */
  badgeLabel: string;
  championBadgeLabel: string;
  ctaLabel: string;
  colors: StoryShareGameColors;
  /** The ready-made background, top-left → bottom-right. Dark enough for white text. */
  gradient: readonly [string, string, string];
  /** Camera-preview CSS theme (app/globals.css `.tp-story-theme-*`). */
  previewClassName: string;
  faceSafeZoneHint: { x: number; y: number; width: number; height: number };
  /** Selfie frame artwork (1080×1920, Story size only); null = the selfie has no frame. */
  frames: { default: string; champion: string } | null;
  resultFields: readonly StoryShareResultField[];
  /** "120 pts" / "9 picks right". */
  pointsUnit: string;
  /** File-name slug: "hightop-live-trivia-ace.png". */
  fileSlug: string;
}

const CHAMPION_GOLD = "#F59E0B";
const DEFAULT_FACE_ZONE = { x: 240, y: 560, width: 600, height: 800 };

export const STORY_SHARE_GAMES = {
  "live-trivia": {
    label: "Live Trivia",
    championTitle: "Trivia Champion",
    runTitle: "Live Trivia Victory",
    badgeLabel: "Live Trivia",
    championBadgeLabel: "Trivia Champion",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#8B5CF6", secondary: "#06B6D4", textSecondary: "#E9D5FF", champion: CHAMPION_GOLD },
    gradient: ["#4C1D95", "#6D28D9", "#0E7490"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: { default: "/story-frames/live-trivia/default.png", champion: "/story-frames/live-trivia/champion.png" },
    resultFields: ["rank", "points", "correct"],
    pointsUnit: "pts",
    fileSlug: "live-trivia",
  },
  "category-blitz": {
    label: "Category Blitz",
    championTitle: "Blitz Champion",
    runTitle: "Category Blitz Run",
    badgeLabel: "Category Blitz",
    championBadgeLabel: "Blitz Champion",
    ctaLabel: "Play Category Blitz",
    colors: { primary: "#EC4899", secondary: "#84CC16", textSecondary: "#FCE7F3", champion: CHAMPION_GOLD },
    gradient: ["#065F46", "#047857", "#0F766E"],
    previewClassName: "tp-story-theme-blitz",
    faceSafeZoneHint: { x: 240, y: 430, width: 600, height: 700 },
    frames: { default: "/story-frames/category-blitz/default.png", champion: "/story-frames/category-blitz/champion.png" },
    resultFields: ["rank", "points", "correct"],
    pointsUnit: "pts",
    fileSlug: "category-blitz",
  },
  bingo: {
    label: "Prop Bingo",
    championTitle: "Bingo!",
    runTitle: "Prop Bingo",
    badgeLabel: "Prop Bingo",
    championBadgeLabel: "Bingo!",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#F97316", secondary: "#EC4899", textSecondary: "#FFEDD5", champion: CHAMPION_GOLD },
    gradient: ["#9A3412", "#B91C1C", "#9D174D"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: [],
    pointsUnit: "pts",
    fileSlug: "bingo",
  },
  pickem: {
    label: "Pick 'Em",
    championTitle: "Pick 'Em Champion",
    runTitle: "Pick 'Em",
    badgeLabel: "Pick 'Em",
    championBadgeLabel: "Pick 'Em Champion",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#818CF8", secondary: "#22D3EE", textSecondary: "#E0E7FF", champion: CHAMPION_GOLD },
    gradient: ["#1E40AF", "#5B21B6", "#9D174D"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: ["rank", "points"],
    pointsUnit: "pts",
    fileSlug: "pickem",
  },
  "nfl-pickem": {
    label: "NFL Pick 'Em",
    championTitle: "NFL Pick 'Em Champion",
    runTitle: "NFL Pick 'Em",
    badgeLabel: "NFL Pick 'Em",
    championBadgeLabel: "NFL Pick 'Em Champion",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#60A5FA", secondary: "#F87171", textSecondary: "#DBEAFE", champion: CHAMPION_GOLD },
    gradient: ["#172554", "#1D4ED8", "#991B1B"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: ["rank", "points"],
    pointsUnit: "picks right",
    fileSlug: "nfl-pickem",
  },
  fantasy: {
    label: "Fantasy Sports",
    championTitle: "Fantasy Champion",
    runTitle: "Fantasy Sports",
    badgeLabel: "Fantasy Sports",
    championBadgeLabel: "Fantasy Champion",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#A78BFA", secondary: "#22D3EE", textSecondary: "#EDE9FE", champion: CHAMPION_GOLD },
    gradient: ["#4C1D95", "#1D4ED8", "#0E7490"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: ["rank", "points"],
    pointsUnit: "pts",
    fileSlug: "fantasy",
  },
  squares: {
    label: SQUARES_GAME_NAME,
    championTitle: "Squares Winner",
    runTitle: SQUARES_GAME_NAME,
    badgeLabel: SQUARES_GAME_NAME,
    championBadgeLabel: "Squares Winner",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#4ADE80", secondary: "#FACC15", textSecondary: "#DCFCE7", champion: CHAMPION_GOLD },
    gradient: ["#14532D", "#166534", "#115E59"],
    previewClassName: "tp-story-theme-blitz",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: ["points"],
    pointsUnit: "pts",
    fileSlug: "squares",
  },
  bracket: {
    label: BRACKET_GAME_NAME,
    championTitle: "Bracket Champion",
    runTitle: BRACKET_GAME_NAME,
    badgeLabel: BRACKET_GAME_NAME,
    championBadgeLabel: "Bracket Champion",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#FB923C", secondary: "#60A5FA", textSecondary: "#FFEDD5", champion: CHAMPION_GOLD },
    gradient: ["#7C2D12", "#C2410C", "#1E3A8A"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: ["rank", "points"],
    pointsUnit: "pts",
    fileSlug: "bracket",
  },
  prize: {
    label: "Prize",
    championTitle: "Prize Won",
    runTitle: "Prize Won",
    badgeLabel: "Prize",
    championBadgeLabel: "Prize Won",
    ctaLabel: "Play at Hightop",
    colors: { primary: "#22D3EE", secondary: "#A78BFA", textSecondary: "#CFFAFE", champion: CHAMPION_GOLD },
    gradient: ["#0F172A", "#3730A3", "#0E7490"],
    previewClassName: "tp-story-theme-live",
    faceSafeZoneHint: DEFAULT_FACE_ZONE,
    frames: null,
    resultFields: [],
    pointsUnit: "pts",
    fileSlug: "prize",
  },
} as const satisfies Record<string, StoryShareGameEntry>;

export type StoryShareGameType = keyof typeof STORY_SHARE_GAMES;

export const STORY_SHARE_GAME_TYPES = Object.keys(STORY_SHARE_GAMES) as StoryShareGameType[];

export const storyShareGame = (gameType: StoryShareGameType): StoryShareGameEntry => STORY_SHARE_GAMES[gameType];
