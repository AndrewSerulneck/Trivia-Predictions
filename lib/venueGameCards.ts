export type VenueGameKey = "speed-trivia" | "live_trivia" | "pickem" | "bingo" | "fantasy" | "scategories";

export type GameOnboardingStep = {
  stepLabel: string;
  heading: string;
  body: string | string[];
};

export type VenueGameCardConfig = {
  key: VenueGameKey;
  title: string;
  path: string;
  cardClassName: string;
  rules: string[];
  steps: [GameOnboardingStep, GameOnboardingStep, GameOnboardingStep];
  visibleOnVenueHome?: boolean;
};

export const VENUE_GAME_CARDS: VenueGameCardConfig[] = [
  {
    key: "speed-trivia",
    title: "Hightop Speed Trivia",
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
    title: "Hightop Live Trivia",
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
    title: "Hightop Fantasy™",
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
        stepLabel: "Your lineup",
        heading: "Build a roster. Earn points as they play.",
        body: "Draft real players from today's games and watch your score climb live.",
      },
      {
        stepLabel: "Draft your players",
        heading: "Pick players before tip-off.",
        body: "Only players in games that haven't started are eligible. Lock in your picks before game time.",
      },
      {
        stepLabel: "Scoring",
        heading: "Your total climbs with every stat.",
        body: "Points accumulate from real game stats in real time. Stay at the venue — points pause the moment you leave.",
      },
    ],
  },
  {
    key: "pickem",
    title: "Hightop Pick 'Em™",
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
        stepLabel: "How to Play",
        heading: "Think you know sports? Prove it.",
        body: "This is a very simple game. Just pick who you think will win each of today's matchups. Tap a team to lock in your pick.",
      },
      {
        stepLabel: "The Rules",
        heading: "Correct picks earn you points.",
        body: "But choose wisely — you only get 10 picks per day. Predictions are graded minutes after the final whistle. ",
      },
      {
        stepLabel: "Scoring",
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
    key: "scategories",
    title: "Hightop S'Categories",
    path: "/scategories",
    cardClassName: "bg-emerald-600 text-white",
    visibleOnVenueHome: false,  // card only shown when a live session exists
    rules: [
      "-A letter is drawn for the whole venue",
      "-Name something in each category starting with that letter",
      "-3 minutes to fill all 12 categories",
      "-Unique answers score 2 points — duplicate answers cancel",
    ],
    steps: [
      {
        stepLabel: "What is it?",
        heading: "One letter. 12 categories. Go.",
        body: "A live word game for the whole venue. A letter drops — fill every category with something that starts with it.",
      },
      {
        stepLabel: "How it works",
        heading: "Think fast. Type faster.",
        body: "You get 3 minutes to fill all 12 categories. Your answers lock when the timer expires.",
      },
      {
        stepLabel: "Scoring",
        heading: "Unique answers score. Copies cancel.",
        body: [
          "2 points for every answer nobody else wrote.",
          "If two players write the same thing — both score zero.",
          "Max 24 points per round.",
        ],
      },
    ],
  },
  {
    key: "bingo",
    title: "Hightop Sports Bingo™",
    path: "/bingo",
    cardClassName: "bg-amber-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Bingo cards feature specific player stats and game scores",
      "-Watch live as squares update in real-time.",
      "-Up to 4 active boards at a time",
      "-50 points for boards that hit Bingo",
      "-Click \"Collect Points\" to claim your reward",
    ],
    steps: [
      {
        stepLabel: "Your board",
        heading: "Real sports. Real stats.",
        body: "Each square is a live player stat. Squares mark themselves as plays happen.",
      },
      {
        stepLabel: "Pick your boards",
        heading: "Browse boards. Find the ones you like.",
        body: "Generate new boards until you spot a lineup worth activating. Hold up to 4 live at once.",
      },
      {
        stepLabel: "Scoring",
        heading: "Five in a row hits Bingo.",
        body: "Line, column, or diagonal earns you 100 points.",
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

export const VENUE_HOME_GAME_KEYS: VenueGameKey[] = ["speed-trivia", "live_trivia", "bingo", "pickem", "fantasy", "scategories"];

export function inferVenueGameKeyFromPath(pathname: string): VenueGameKey | null {
  if (pathname.startsWith("/trivia/live")) return "live_trivia";
  if (pathname.startsWith("/trivia")) return "speed-trivia";
  if (pathname.startsWith("/pickem")) return "pickem";
  if (pathname.startsWith("/bingo")) return "bingo";
  if (pathname.startsWith("/fantasy")) return "fantasy";
  if (pathname.startsWith("/pending-challenges")) return "fantasy";
  if (pathname.startsWith("/scategories")) return "scategories";
  return null;
}
