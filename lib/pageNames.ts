export const APP_PAGE_NAMES = {
  join: "Join",
  venue: "Venue",
  trivia: "Trivia",
  sportsPredictions: "Sports Predictions",
  sportsBingo: "Sports Bingo",
  sportsPickEm: "Sports Pick 'Em",
  activeGames: "Active and Completed Games",
  pendingChallenges: "Pending Challenges",
  redeemPrizes: "Redeem Prizes",
} as const;

export const APP_PAGE_ROUTES = {
  join: ["/", "/join"],
  venue: "/venue/[venueId]",
  trivia: "/trivia",
  sportsPredictions: "/predictions",
  sportsPredictionsLegacy: "/prediction",
  sportsBingo: "/bingo",
  sportsPickEm: "/pickem",
  activeGames: "/active-games",
  pendingChallenges: "/pending-challenges",
  redeemPrizes: "/redeem-prizes",
} as const;
