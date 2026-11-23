// The idle carousel's data shape (docs/fire-tv-app-plan.md D20, Phase 9) and its `?mode=` fixtures. Pure, so the
// TV components, Try demo and the debug modes can all use it; the reads live in lib/venueScreenCarousel.ts.

import type { TvPickEmGame, TvPickEmLeader } from "@/lib/tvSportsRelevance";

export type TvAllTimeEntry = { rank: number; username: string; points: number };

export type TvPrize = {
  id: string;
  /** "Free Appetizer", "$25 Gift Card" (on screen these are always called Prizes). */
  prize: string;
  /** The partner's name for the prize challenge. */
  name: string;
  /** Points a player needs, for a points-target prize; null otherwise. */
  pointsRequired: number | null;
};

export type VenueScreenCarouselData = {
  /**
   * Today's games, ranked (D18), at most TV_SPORTS_MAX_GAMES. The board is the first TV_PICKEM_BOARD_SIZE; the
   * ticker is `tvTickerGames(games, boardOnScreen)`. `leaders` is today's Pick 'Em top 5 here (null: nobody has a
   * settled pick yet, or unknown). Null when there are no games today, or they are unknown: slide 2 is skipped.
   */
  pickEm: { games: TvPickEmGame[]; leaders: TvPickEmLeader[] | null } | null;
  /** Top 10 by all-time points; null when fewer than 3 players have points, or unknown (D11): slide 3 skipped. */
  allTimeLeaderboard: TvAllTimeEntry[] | null;
  /** Active prizes, at most 3; null when unknown. Empty or null: slide 4 skipped. */
  prizes: TvPrize[] | null;
};

export const EMPTY_CAROUSEL: VenueScreenCarouselData = { pickEm: null, allTimeLeaderboard: null, prizes: null };

const MINUTE_MS = 60_000;

type GameSeed = [
  league: string,
  away: [name: string, abbr: string],
  home: [name: string, abbr: string],
  startOffsetMin: number,
  status: TvPickEmGame["status"],
  scores: [away: number, home: number] | null,
  period: string | null,
  picks: number,
  homePct: number | null,
];

const game = (nowMs: number, index: number, seed: GameSeed): TvPickEmGame => {
  const [league, away, home, startOffsetMin, status, scores, period, picks, homePct] = seed;
  return {
    key: `debug-${index}`,
    league,
    awayTeam: away[0],
    awayAbbr: away[1],
    homeTeam: home[0],
    homeAbbr: home[1],
    startsAt: new Date(nowMs + startOffsetMin * MINUTE_MS).toISOString(),
    status,
    awayScore: scores ? scores[0] : null,
    homeScore: scores ? scores[1] : null,
    periodLabel: period,
    picks,
    homePickPct: homePct,
  };
};

const SUNDAY: GameSeed[] = [
  ["NFL", ["Kansas City Chiefs", "KC"], ["Seattle Seahawks", "SEA"], -95, "live", [21, 17], "Q3 4:12", 41, 39],
  ["NFL", ["Detroit Lions", "DET"], ["Green Bay Packers", "GB"], -80, "live", [14, 14], "Half", 29, 29],
  ["NFL", ["Buffalo Bills", "BUF"], ["Miami Dolphins", "MIA"], -70, "live", [10, 13], "Q2 0:48", 27, 52],
  ["NFL", ["Dallas Cowboys", "DAL"], ["Philadelphia Eagles", "PHI"], -200, "final", [20, 27], "Final", 33, 65],
  ["NFL", ["San Francisco 49ers", "SF"], ["Los Angeles Rams", "LAR"], 230, "scheduled", null, null, 18, 44],
  ["NFL", ["Baltimore Ravens", "BAL"], ["Cincinnati Bengals", "CIN"], 230, "scheduled", null, null, 9, 56],
  ["NBA", ["Los Angeles Lakers", "LAL"], ["Boston Celtics", "BOS"], -40, "live", [54, 61], "Q3", 6, 50],
  ["NHL", ["New York Rangers", "NYR"], ["Toronto Maple Leafs", "TOR"], -30, "live", [2, 1], "P2", 2, 0],
];

const WEEKNIGHT: GameSeed[] = [
  ["NBA", ["Los Angeles Lakers", "LAL"], ["Boston Celtics", "BOS"], -60, "live", [88, 91], "Q3 5:31", 24, 42],
  ["NHL", ["New York Rangers", "NYR"], ["Toronto Maple Leafs", "TOR"], -50, "live", [2, 1], "P2 11:04", 18, 34],
  ["NBA", ["New York Knicks", "NYK"], ["Milwaukee Bucks", "MIL"], -10, "live", [31, 27], "Q1 2:10", 15, 48],
  ["NBA", ["Golden State Warriors", "GSW"], ["Denver Nuggets", "DEN"], 90, "scheduled", null, null, 12, 56],
  ["NBA", ["Phoenix Suns", "PHX"], ["Dallas Mavericks", "DAL"], 120, "scheduled", null, null, 0, null],
  ["NHL", ["Edmonton Oilers", "EDM"], ["Vegas Golden Knights", "VGK"], 150, "scheduled", null, null, 0, null],
  ["NBA", ["Miami Heat", "MIA"], ["Atlanta Hawks", "ATL"], -170, "final", [102, 98], "Final", 4, 25],
];

const LEADERS: Record<"sunday" | "weeknight", TvPickEmLeader[]> = {
  sunday: [
    { rank: 1, username: "Maya R.", wins: 9, losses: 3 },
    { rank: 2, username: "Dre T.", wins: 9, losses: 3 },
    { rank: 3, username: "Jess K.", wins: 8, losses: 4 },
    { rank: 4, username: "Luis P.", wins: 8, losses: 4 },
    { rank: 5, username: "Sam O.", wins: 7, losses: 5 },
  ],
  weeknight: [
    { rank: 1, username: "Dre T.", wins: 7, losses: 2 },
    { rank: 2, username: "Maya R.", wins: 6, losses: 3 },
    { rank: 3, username: "Luis P.", wins: 6, losses: 3 },
    { rank: 4, username: "Jess K.", wins: 5, losses: 4 },
    { rank: 5, username: "Sam O.", wins: 5, losses: 4 },
  ],
};

const ALL_TIME: TvAllTimeEntry[] = [
  ["Maya R.", 48210],
  ["Dre T.", 45975],
  ["Jess K.", 41300],
  ["Luis P.", 38640],
  ["Sam O.", 36015],
  ["Priya N.", 33480],
  ["Big Mike", 31220],
  ["Tasha W.", 29870],
  ["Ken H.", 27455],
  ["Rosie D.", 25190],
].map(([username, points], index) => ({ rank: index + 1, username: String(username), points: Number(points) }));

const PRIZES: TvPrize[] = [
  { id: "debug-prize-1", prize: "Free Appetizer", name: "Trivia regulars", pointsRequired: 500 },
  { id: "debug-prize-2", prize: "$10 Gift Card", name: "Pick 'Em weekly", pointsRequired: null },
  { id: "debug-prize-3", prize: "Free Pint", name: "Game night", pointsRequired: 300 },
];

/** The `?mode=carousel*` data. Times are relative to `nowMs`, so live / soon / final read right on any day. */
export const debugCarousel = (
  variant: "sunday" | "weeknight" | "empty",
  nowMs: number,
): VenueScreenCarouselData => {
  if (variant === "empty") return EMPTY_CAROUSEL;
  const seeds = variant === "sunday" ? SUNDAY : WEEKNIGHT;
  return {
    pickEm: { games: seeds.map((seed, index) => game(nowMs, index, seed)), leaders: LEADERS[variant] },
    allTimeLeaderboard: ALL_TIME,
    prizes: PRIZES,
  };
};
