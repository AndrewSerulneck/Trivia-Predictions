// The ONE source of Category Blitz's "how to play" copy: the 8 tutorial cards
// (components/venue/CategoryBlitzOnboardingOverlay.tsx, via VENUE_GAME_CARDS)
// and the rules list (the in-game "How to play" popup and the legacy lobby).
// Card text is Andrew's, verbatim (docs/category-blitz-how-to-play-plan.md §3) —
// don't reword it. Client-safe: no server-only imports.

import { ALLITERATION_BONUS_POINTS } from "@/lib/categoryBlitzAlliteration";
import { MAJORITY_RULES_EVERY_N_ROUNDS, POINTS_PER_UNIQUE_ANSWER, minPlayersToScoreFor } from "@/lib/categoryBlitzModes";

export type CategoryBlitzTutorialArt =
  | "intro"
  | "board"
  | "answering"
  | "timer"
  | "unique"
  | "duplicate"
  | "alliteration"
  | "majority";

export type CategoryBlitzTutorialCard = {
  art: CategoryBlitzTutorialArt;
  /** The card's large line. */
  statement: string;
  /** Smaller text under the statement (card 6 only). */
  detail?: string;
};

export const CATEGORY_BLITZ_TUTORIAL_CARDS: CategoryBlitzTutorialCard[] = [
  { art: "intro", statement: "Here's how to play Category Blitz" },
  { art: "board", statement: "Each round, a letter and list of categories is randomly generated." },
  { art: "answering", statement: "Your job is to name something in each category that starts with that round's letter." },
  { art: "timer", statement: "Each round lasts 3 minutes! Your responses get graded when time runs out." },
  { art: "unique", statement: "Unique answers score points." },
  { art: "duplicate", statement: "No points for same answers!" },
  { art: "alliteration", statement: "Bonus points are awarded for alliteration!" },
  {
    art: "majority",
    statement: "Be careful!",
    detail:
      "Some rounds are \"Majority Rules\" mode, where the point is to give the answer you think will be most popular in each category. The point is to try and predict what other people in the room will answer. Hope you're good at reading minds!",
  },
];

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

/** The rules list, in card order. Numbers come from the scoring constants so the copy can't drift. */
export const CATEGORY_BLITZ_RULES: string[] = [
  "Each round, a letter and a list of categories is randomly generated.",
  "Name something in each category that starts with that round's letter.",
  "Each round lasts 3 minutes. Your answers are graded when time runs out.",
  `Unique answers score ${POINTS_PER_UNIQUE_ANSWER} points. If anyone else gives the same answer, neither of you scores.`,
  `Alliteration bonus: +${ALLITERATION_BONUS_POINTS} point when every word of your answer starts with the round's letter (e.g. "Prickly Pear" for P).`,
  `Every ${ordinal(MAJORITY_RULES_EVERY_N_ROUNDS)} round is Majority Rules: give the answer you think will be most popular. You score 1 point for every player who gave the same answer.`,
  `Points are only awarded when at least ${minPlayersToScoreFor("standard")} players are in a round (${minPlayersToScoreFor("reverse")} in Majority Rules).`,
];
