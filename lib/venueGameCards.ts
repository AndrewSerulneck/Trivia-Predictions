export type VenueGameKey =
  | "speed-trivia"
  | "live_trivia"
  | "pickem"
  | "bingo"
  | "fantasy"
  | "category-blitz"
  | "nfl-pickem"
  | "squares"
  | "bracket";

import { CATEGORY_BLITZ_RULES, CATEGORY_BLITZ_TUTORIAL_CARDS } from "@/lib/categoryBlitzHowToPlay";
import { SQUARES_PER_PLAYER_CAP } from "@/lib/seasonalGames";
import { BRACKET_ROUND_POINTS, SQUARES_MOMENT_POINTS } from "@/lib/seasonalPoints";

// ── Seasonal games' on-screen names (docs/squares-and-brackets-plan.md §1 decision 9) ──
// Andrew, 2026-10-19: use the real names for now; a rename must be ONE edit, here. Every screen,
// title map and the Official Rules read these — tests/seasonal-games.test.ts fails on a copy.
export const SQUARES_GAME_NAME = "Super Bowl Squares";
/** The in-game app bar's label: the full name truncates beside the points pill on a 350px phone. */
export const SQUARES_SHORT_NAME = "Squares";
/** The two lines the Venue Home tile breaks the name into. */
export const SQUARES_TITLE_LINES: [string, string] = ["Super Bowl", "Squares"];
export const BRACKET_GAME_NAME = "March Madness";
export const BRACKET_TITLE_LINES: [string, string] = ["March", "Madness"];
/** The bracket card from Mar 1 until Selection Sunday (decision 12). */
export const BRACKET_TEASER_SUBTITLE = "Brackets open Selection Sunday, March 14.";

const bracketRoundPointsLine = BRACKET_ROUND_POINTS.join(", ");

export type GameOnboardingStep = {
  /** Small eyebrow above the card. Only the trivia games have one; statement-layout cards (usesStatementTutorialLayout) have none. */
  stepLabel?: string;
  heading: string;
  body?: string | string[];
};

export type VenueGameCardConfig = {
  key: VenueGameKey;
  title: string;
  path: string;
  cardClassName: string;
  rules: string[];
  steps: GameOnboardingStep[];
  visibleOnVenueHome?: boolean;
};

export const VENUE_GAME_CARDS: VenueGameCardConfig[] = [
  {
    key: "speed-trivia",
    title: "Speed Trivia",
    path: "/trivia",
    cardClassName: "bg-blue-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-15 questions per round",
      "-15 seconds per question",
      "-3 rounds per hour",
      "-2 points per correct answer",
    ],
    steps: [
      {
        stepLabel: "What is it?",
        heading: "15 seconds. One question. Don't overthink it.",
        body: "Fast-paced trivia rounds, live at the bar. New rounds run 3× per hour.",
      },
      {
        stepLabel: "How it works",
        heading: "Answer fast. Answer right.",
        body: "15 questions per round, 15 seconds each. Every correct answer earns points.",
      },
      {
        stepLabel: "How to win",
        heading: "2 points per correct answer.",
        body: "15 questions × 3 rounds = up to 90 points per hour. Keep showing up.",
      },
    ],
  },
  {
    key: "live_trivia",
    title: "Live Trivia",
    path: "/trivia/live",
    cardClassName: "bg-blue-700 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Synchronized Live Venue Play",
      "-30-second write-in answer windows",
      "-Server-timed rounds with screen-lock forfeits on tab/browser switches",
      "-2 points per correct answer",
    ],
    steps: [
      {
        stepLabel: "What is it?",
        heading: "Everyone plays. One screen. Synchronized.",
        body: "Live trivia hosted right here. The whole venue plays together in real time.",
      },
      {
        stepLabel: "How it works",
        heading: "Write in your answer. 30 seconds.",
        body: "The host controls the pace. Switch tabs during a question and you forfeit that round.",
      },
      {
        stepLabel: "How to win",
        heading: "2 points per correct answer.",
        body: "Stay locked in — every question counts.",
      },
    ],
  },
  {
    key: "fantasy",
    title: "Fantasy Sports",
    path: "/fantasy",
    cardClassName: "bg-slate-800 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Build one NBA lineup with players from today's games and win points based on how well they perform!",
      "-Only players in games that have not started yet are eligible to be drafted.",
      "-Fantasy scores are updated in real time once games begin.",
    ],
    steps: [
      {
        heading: "Build a roster. Earn points as they play.",
        body: "Draft real players from today's games and watch your score climb live.",
      },
      {
        heading: "Pick players before tip-off.",
        body: "Only players in games that haven't started are eligible. Lock in your picks before game time.",
      },
      {
        heading: "Your total climbs with every stat.",
        body: "Points accumulate from real game stats in real time. Stay at the venue — points pause the moment you leave.",
      },
    ],
  },
  {
    key: "pickem",
    title: "Pick 'Em™",
    path: "/pickem",
    cardClassName: "bg-indigo-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-10 picks total",
      "-10 points per correct pick",
      "-7 correct picks wins double",
      "-10 correct picks wins triple",
    ],
    steps: [
      {
        heading: "Think you know sports? Prove it.",
        body: "This is a very simple game. Just pick who you think will win each of today's matchups. Tap a team to lock in your pick.",
      },
      {
        heading: "Correct picks earn you points.",
        body: "But choose wisely — you only get 10 picks per day. Predictions are graded minutes after the final whistle. ",
      },
      {
        heading: "10 points per correct pick.",
        body: [
          "Hit 7 correct → 2× bonus.",
          "A perfect score (10/10) → 3× bonus.",
          "Max: 300 points.",
        ],
      },
    ],
  },
  {
    key: "category-blitz",
    title: "Category Blitz",
    path: "/category-blitz",
    cardClassName: "bg-emerald-600 text-white",
    visibleOnVenueHome: false,  // unread: VENUE_HOME_GAME_KEYS always shows this card; a "LIVE" badge appears only while a round is awake (peek=1)
    rules: CATEGORY_BLITZ_RULES,
    steps: CATEGORY_BLITZ_TUTORIAL_CARDS.map(({ statement, detail }) => ({ heading: statement, body: detail })),
  },
  {
    key: "bingo",
    title: "Prop Bingo",
    path: "/bingo",
    cardClassName: "bg-amber-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Bingo cards feature specific player stats and game scores",
      "-Watch live as squares update in real-time.",
      "-Up to 4 active boards at a time",
      "-50 points for boards that hit Bingo",
      "-Click \"Collect Points\" to add them to your score",
    ],
    steps: [
      {
        heading: "Real sports. Real stats.",
        body: "Each square is a live player stat. Squares mark themselves as plays happen.",
      },
      {
        heading: "Browse boards. Find the ones you like.",
        body: "Generate new boards until you spot a lineup worth activating. Hold up to 4 live at once.",
      },
      {
        heading: "Five in a row hits Bingo.",
        body: "Line, column, or diagonal earns you 100 points.",
      },
    ],
  },
  {
    key: "nfl-pickem",
    title: "NFL Pick 'Em",
    path: "/nfl-pickem",
    cardClassName: "[background:linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)] text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Pick winners for all NFL games each week",
      "-Picks lock at Thursday Night Football kickoff",
      "-10 points per correct pick",
      "-View past weeks to see your results",
    ],
    steps: [
      {
        heading: "Think you know ball? Prove it.",
        body: "This is a weekly contest to see who can pick the most winners each week of the NFL season.",
      },
      {
        heading: "Make your picks before kickoff.",
        body: "Once the game starts, everyone's picks are locked in.",
      },
      {
        heading: "Keep track of your picks (and everyone else's) on the venue leaderboard.",
        body: "Play for bragging rights, or check the Prizes tab to see if your venue offers one for NFL Pick 'Em!",
      },
    ],
  },
  {
    key: "squares",
    title: SQUARES_GAME_NAME,
    path: "/squares",
    cardClassName: "bg-emerald-800 text-white",
    visibleOnVenueHome: true,
    rules: [
      `-Claim up to ${SQUARES_PER_PLAYER_CAP} squares on your venue's board`,
      "-Numbers are drawn at random 30 minutes before kickoff",
      `-${SQUARES_MOMENT_POINTS.q1} points at the end of Q1, halftime and Q3`,
      `-${SQUARES_MOMENT_POINTS.final} points for the final score`,
    ],
    steps: [
      {
        heading: "One board. 100 squares. The whole bar plays.",
        body: `Claim up to ${SQUARES_PER_PLAYER_CAP} squares on your venue's Super Bowl board. Everyone can see who holds each one.`,
      },
      {
        heading: "The numbers are drawn just before kickoff.",
        body: "Every row and column gets a random number from 0 to 9. Your square wins when they match the last digit of each team's score.",
      },
      {
        heading: "Match the score. Win points.",
        body: [
          `End of Q1, halftime and end of Q3: ${SQUARES_MOMENT_POINTS.q1} points.`,
          `Final score: ${SQUARES_MOMENT_POINTS.final} points.`,
          "Check the Prizes tab to see if your venue offers one.",
        ],
      },
    ],
  },
  {
    key: "bracket",
    title: BRACKET_GAME_NAME,
    path: "/bracket",
    cardClassName: "bg-orange-700 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-One bracket per tournament at each venue: men's and women's",
      "-Picks lock at the first tip-off of the Round of 64",
      "-Missed it? A second-chance bracket opens at the Sweet 16",
      `-${bracketRoundPointsLine} points per correct pick by round`,
    ],
    steps: [
      {
        heading: "Fill out your bracket. Beat the bar.",
        body: "Pick every game of the tournament. Your bracket goes up against everyone at this venue.",
      },
      {
        heading: "Picks lock at the first tip-off.",
        body: "Men's and women's brackets lock separately. Missed it? A second-chance bracket opens at the Sweet 16.",
      },
      {
        heading: "Points double every round.",
        body: [
          `${bracketRoundPointsLine} points per correct pick, round by round.`,
          "Check the Prizes tab to see if your venue offers one.",
        ],
      },
    ],
  },
];

export const VENUE_GAME_CARD_BY_KEY: Record<VenueGameKey, VenueGameCardConfig> = VENUE_GAME_CARDS.reduce(
  (acc, card) => {
    acc[card.key] = card;
    return acc;
  },
  {} as Record<VenueGameKey, VenueGameCardConfig>
);

// The seasonal cards (squares, bracket) show only inside their window with their flag on:
// venueHomeCardState in lib/seasonalGames.ts.
export const VENUE_HOME_GAME_KEYS: VenueGameKey[] = [
  "category-blitz",
  "speed-trivia",
  "live_trivia",
  "bingo",
  "fantasy",
  "pickem",
  "nfl-pickem",
  "squares",
  "bracket",
];

export function inferVenueGameKeyFromPath(pathname: string): VenueGameKey | null {
  if (pathname.startsWith("/trivia/live")) return "live_trivia";
  if (pathname.startsWith("/trivia")) return "speed-trivia";
  if (pathname.startsWith("/nfl-pickem")) return "nfl-pickem";
  if (pathname.startsWith("/pickem")) return "pickem";
  if (pathname.startsWith("/bingo")) return "bingo";
  if (pathname.startsWith("/fantasy")) return "fantasy";
  if (pathname.startsWith("/pending-challenges")) return "fantasy";
  if (pathname.startsWith("/category-blitz")) return "category-blitz";
  if (pathname.startsWith("/squares")) return "squares";
  if (pathname.startsWith("/bracket")) return "bracket";
  return null;
}
