export const APP_PAGE_NAMES = {
  join: "Join",
  venue: "Venue",
  trivia: "Trivia",
  sportsPredictions: "Pick 'Em (Legacy)",
  sportsBingo: "Sports Bingo",
  sportsPickEm: "Sports Pick 'Em",
  sportsFantasy: "Fantasy",
  activeGames: "Career Stats",
  pendingChallenges: "Pending Challenges",
  redeemPrizes: "Redeem Prizes",
  faqs: "FAQs",
} as const;

export const APP_PAGE_ROUTES = {
  join: ["/", "/join"],
  venue: "/venue/[venueId]",
  trivia: "/trivia",
  sportsPredictions: "/pickem",
  sportsPredictionsLegacy: "/prediction",
  sportsBingo: "/bingo",
  sportsPickEm: "/pickem",
  sportsFantasy: "/fantasy",
  activeGames: "/active-games",
  pendingChallenges: "/pending-challenges",
  redeemPrizes: "/redeem-prizes",
  faqs: "/faqs",
} as const;
