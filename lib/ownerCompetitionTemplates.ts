// Pure, client-safe Venue Competition template registry (Phase 9). No
// "server-only" import — both the server boundary (lib/ownerCompetitions.ts,
// which re-exports this and expands templates into engine input) and the
// dashboard UI (the template gallery) share ONE registry instead of the client
// re-fetching it. Same pattern as lib/tvPairingShared.ts / liveTriviaShared.ts.

import type { ChallengeGameType, ChallengeMode } from "@/types";

// The async games a competition can run over. Live games (Category Blitz / Live
// Trivia) are scheduled via the Phase 4/4b surface, not here.
export type CompetitionGameType = Exclude<ChallengeGameType, "trivia">;

export const ALL_ASYNC_GAME_TYPES: CompetitionGameType[] = [
  "pickem",
  "fantasy",
  "speed-trivia",
  "bingo",
  "live-trivia",
];

export type OwnerCompetitionTemplateId =
  | "pickem_race"
  | "prop_bingo_night"
  | "fantasy_night"
  | "trivia_gauntlet"
  | "house_party";

/** Default window shape the UI pre-fills the date pickers from. */
export type OwnerCompetitionWindowShape = "tonight" | "this_week";

export type OwnerCompetitionTemplate = {
  id: OwnerCompetitionTemplateId;
  /** Default competition name (owner can override with `title`). */
  name: string;
  /** One-line pitch shown on the template card. */
  pitch: string;
  /** Semantic accent key the UI maps to an `ht-game-*` token. */
  accent: string;
  /** Which default window the UI pre-fills. */
  defaultWindow: OwnerCompetitionWindowShape;
  /** Boilerplate rules text (auto-filled, editable in the UI). */
  rulesText: string;
  // ── engine expansion ──
  gameTypes: CompetitionGameType[];
  challengeMode: ChallengeMode;
  /** progress mode only: default points threshold to win. */
  pointsRequiredToWin?: number;
};

// Adding a future competition type = one entry here, zero new plumbing.
export const OWNER_COMPETITION_TEMPLATES: readonly OwnerCompetitionTemplate[] = [
  {
    id: "pickem_race",
    name: "Pick'em Race",
    pitch: "Most Pick'em points wins. Runs a full week.",
    accent: "pickem",
    defaultWindow: "this_week",
    rulesText: "Make your Pick'em picks all week. Whoever racks up the most Pick'em points by the end of the week wins.",
    gameTypes: ["pickem"],
    challengeMode: "leaderboard",
  },
  {
    id: "prop_bingo_night",
    name: "Prop Bingo Night",
    pitch: "Big slate tonight? Most Bingo points by close wins.",
    accent: "bingo",
    defaultWindow: "tonight",
    rulesText: "Play Bingo during tonight's games. Whoever earns the most Bingo points before close takes it.",
    gameTypes: ["bingo"],
    challengeMode: "leaderboard",
  },
  {
    id: "fantasy_night",
    name: "Fantasy Night",
    pitch: "Most Fantasy points tonight wins.",
    accent: "fantasy",
    defaultWindow: "tonight",
    rulesText: "Set your Fantasy lineup for tonight. Most Fantasy points when the night ends wins.",
    gameTypes: ["fantasy"],
    challengeMode: "leaderboard",
  },
  {
    id: "trivia_gauntlet",
    name: "Trivia Gauntlet",
    pitch: "Sharpest trivia brain of the week.",
    accent: "trivia",
    defaultWindow: "this_week",
    rulesText: "Play Speed Trivia all week. The highest Speed Trivia point total by week's end is crowned champion.",
    gameTypes: ["speed-trivia"],
    challengeMode: "leaderboard",
  },
  {
    id: "house_party",
    name: "House Party",
    pitch: "Everyone who hits the target this week gets the prize.",
    accent: "blitz",
    defaultWindow: "this_week",
    rulesText: "Earn points across any game this week. Everyone who reaches the target wins the prize.",
    gameTypes: ALL_ASYNC_GAME_TYPES,
    challengeMode: "progress",
    pointsRequiredToWin: 500,
  },
] as const;

export function getOwnerCompetitionTemplate(id: string): OwnerCompetitionTemplate | null {
  return OWNER_COMPETITION_TEMPLATES.find((t) => t.id === id) ?? null;
}
