export type VenueGameKey = "trivia" | "predictions" | "pickem" | "bingo" | "fantasy";

export type VenueGameCardConfig = {
  key: VenueGameKey;
  title: string;
  path: string;
  cardClassName: string;
  rules: string[];
  visibleOnVenueHome?: boolean;
};

export const VENUE_GAME_CARDS: VenueGameCardConfig[] = [
  {
    key: "trivia",
    title: "Hightop Trivia™",
    path: "/trivia",
    cardClassName: "bg-blue-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-15 questions per round",
      "-15 seconds per question",
      "-3 rounds per hour",
      "-2 points per correct answer",
    ],
  },
  {
    key: "predictions",
    title: "Hightop Predictions™",
    path: "/predictions",
    cardClassName: "bg-slate-900 text-white",
    visibleOnVenueHome: false,
    rules: [
      "-Browse live sports prediction markets",
      "-Earn points with correct predictions",
      "-Points are awarded based on probability (less likely outcomes award more points)",
    ],
  },
  {
    key: "fantasy",
    title: "Hightop Fantasy™",
    path: "/fantasy",
    cardClassName: "bg-slate-800 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Draft a team",
      "-Earn points based on player stats",
      "-Rosters are locked once games begin",
    ],
  },
  {
    key: "pickem",
    title: "Hightop Pick 'Em™",
    path: "/pickem",
    cardClassName: "bg-indigo-600 text-white",
    visibleOnVenueHome: true,
    rules: [
      "-Think you can pick the most winners this week? Prove it.",
      "-Challenge another user head-to-head",
      "-Choose a sport and pick more winners than they do",
      "-Add other users to your league to multiply your rewards",
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
  },
];

export const VENUE_GAME_CARD_BY_KEY: Record<VenueGameKey, VenueGameCardConfig> = VENUE_GAME_CARDS.reduce(
  (acc, card) => {
    acc[card.key] = card;
    return acc;
  },
  {} as Record<VenueGameKey, VenueGameCardConfig>
);

export const VENUE_HOME_GAME_KEYS: VenueGameKey[] = ["trivia", "bingo", "pickem", "fantasy"];

export function inferVenueGameKeyFromPath(pathname: string): VenueGameKey | null {
  if (pathname.startsWith("/trivia")) return "trivia";
  if (pathname.startsWith("/predictions")) return "predictions";
  if (pathname.startsWith("/pickem")) return "pickem";
  if (pathname.startsWith("/bingo")) return "bingo";
  if (pathname.startsWith("/fantasy")) return "fantasy";
  if (pathname.startsWith("/pending-challenges")) return "fantasy";
  return null;
}
