export const APP_PAGE_NAMES = {
  join: "Join",
  venue: "Venue",
  trivia: "Trivia",
  sportsPredictions: "Sports Predictions",
  sportsBingo: "Sports Bingo",
} as const;

export const APP_PAGE_ROUTES = {
  join: ["/", "/join"],
  venue: "/venue/[venueId]",
  trivia: "/trivia",
  sportsPredictions: "/predictions",
  sportsPredictionsLegacy: "/prediction",
  sportsBingo: "/bingo",
} as const;
