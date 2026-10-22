/**
 * Fake API answers for scripts/theme-screenshots.cjs (docs/light-theme-plan.md, Phase 2).
 *
 * The harness runs against a scratchpad build with NO .env.local, so nothing can reach Supabase,
 * Stripe or any provider. Every /api/* call the screens make is answered from here instead, and
 * every answer is a pure function of the fixed clock below — the same build always draws the same
 * pixels. Shapes follow the real route handlers (cited per entry); keep them in step when a route
 * changes, or a screen silently falls back to its empty/error state and the diff loses coverage.
 *
 * The venue is `venue-uptown` ("General Saloon"): with no Supabase env, lib/venues.ts serves the
 * built-in lib/defaultVenues.ts list, so the venue page renders with no database at all.
 */

/** Sunday 2026-10-25, 12:00 New York time — before every fake kickoff below. */
const FIXED_NOW_ISO = "2026-10-25T16:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);
const HOUR_MS = 60 * 60 * 1000;
const at = (hoursFromNow) => new Date(FIXED_NOW_MS + hoursFromNow * HOUR_MS).toISOString();

const VENUE_ID = "venue-uptown";
const VENUE = { latitude: 40.73061, longitude: -73.935242 };
const USER_ID = "user-shot";
const USERNAME = "shotplayer";
const LOCAL_DATE = "2026-10-25";

// app/api/users/summary/route.ts
const usersSummary = {
  ok: true,
  profile: { username: USERNAME, points: 1240, venueId: VENUE_ID, accountId: "acct-shot" },
  hasPasskey: true,
};

// app/api/notifications/route.ts (no paging params → getUserNotifications)
const notifications = { ok: true, unreadCount: 0, items: [] };

// app/api/trivia/live/state/route.ts — next game tonight at 7pm.
const triviaLiveState = {
  ok: true,
  state: {
    isGameActive: false,
    nextSchedule: {
      startTime: at(7),
      timezone: "America/New_York",
      recurringType: "weekly",
      recurringDays: ["sun"],
    },
  },
  serverTimestamp: FIXED_NOW_MS,
};

// app/api/leaderboard/route.ts — LeaderboardEntry in types/index.ts.
const LEADERBOARD_NAMES = ["triviaqueen", "hoopsdad", "quizwiz", USERNAME, "barflyer", "gridiron", "pintsize", "lastcall"];
const leaderboard = {
  ok: true,
  entries: LEADERBOARD_NAMES.map((username, index) => ({
    userId: username === USERNAME ? USER_ID : `user-${username}`,
    username,
    venueId: VENUE_ID,
    points: 2400 - index * 230,
    rank: index + 1,
  })),
  currentUserRank: 4,
  timeframe: "all-time",
  game: "all",
  nflWeekId: "",
};

// app/api/challenge-campaigns/route.ts — ChallengeCampaign in types/index.ts.
const campaignBase = {
  createdAt: at(-24 * 10),
  rules: "",
  venueIds: [VENUE_ID],
  scheduleType: "always",
  activeDays: [],
  gameTypes: ["all"],
  challengeMode: "progress",
  leaderboardDisplayLimit: 10,
  leaderboardTiebreaker: "first_to_score",
  pointMultiplier: 1,
  recurringType: "weekly",
  isActive: true,
  winnerUsernames: [],
  viewerWon: false,
};
const challengeCampaigns = {
  ok: true,
  campaigns: [
    {
      ...campaignBase,
      id: "camp-points",
      name: "Free appetizer",
      winCondition: "points_threshold",
      pointsRequiredToWin: 500,
      progressPoints: 320,
      winnerQuota: 5,
      quotaRemaining: 3,
      prizeKind: "menu_item",
      prizeMenuItem: "appetizer",
      prizeMenuItemName: "Appetizer",
      description: { summary: "Earn 500 points this week playing any game.", when: null, fineprint: null, isCustom: false },
    },
    {
      ...campaignBase,
      id: "camp-won",
      name: "$20 gift card",
      winCondition: "points_threshold",
      pointsRequiredToWin: 300,
      progressPoints: 300,
      winnerQuota: 1,
      quotaRemaining: 0,
      viewerWon: true,
      winnerUsernames: [USERNAME],
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 20,
      description: { summary: "First to 300 points wins.", when: null, fineprint: null, isCustom: false },
    },
  ],
};

// app/api/pickem/sports/route.ts — PickEmSport in lib/pickem.ts.
const pickemSports = {
  ok: true,
  sports: [
    { slug: "nba", label: "NBA", subtitle: "Basketball", isInSeason: true, isClickable: true },
    { slug: "nhl", label: "NHL", subtitle: "Hockey", isInSeason: true, isClickable: true },
    { slug: "soccer", label: "Soccer", subtitle: "Premier League", isInSeason: true, isClickable: true },
    { slug: "mlb", label: "MLB", subtitle: "Baseball", isInSeason: false, isClickable: false },
  ],
};

const NBA_GAMES = [
  ["nba-g1", "Boston Celtics", "New York Knicks", 3.5],
  ["nba-g2", "Denver Nuggets", "Los Angeles Lakers", 4],
  ["nba-g3", "Miami Heat", "Chicago Bulls", 4],
  ["nba-g4", "Phoenix Suns", "Golden State Warriors", 6.5],
];
// PickEmGame in lib/pickem.ts. g1 is picked (home), g3 picked (away).
const pickemGame = ([id, homeTeam, awayTeam, hours]) => {
  const pick = id === "nba-g1" ? homeTeam : id === "nba-g3" ? awayTeam : null;
  return {
    id,
    sportSlug: "nba",
    sportKey: "basketball_nba",
    league: "NBA",
    homeTeamId: `${id}-home`,
    awayTeamId: `${id}-away`,
    homeTeam,
    awayTeam,
    startsAt: at(hours),
    isLocked: false,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    winnerTeam: null,
    periodLabel: null,
    ...(pick
      ? { userPickId: `pick-${id}`, userPickTeam: pick, userPickStatus: "pending", userPickRewardPoints: 0, userPickRewardClaimedAt: null }
      : {}),
  };
};
const pickemGames = {
  ok: true,
  sport: pickemSports.sports[0],
  date: LOCAL_DATE,
  games: NBA_GAMES.map(pickemGame),
  pointsBank: {
    localDate: LOCAL_DATE,
    totalPicks: 2,
    settledPicks: 0,
    pendingPicks: 2,
    correctPicks: 0,
    incorrectPicks: 0,
    unclaimedCorrectPicks: 0,
    pendingPoints: 0,
    multiplierEligible: false,
    multiplierIfSettledNow: 1,
    collectedPointsToday: 0,
  },
  settlement: null,
};
// app/api/pickem/picks/route.ts — PickEmPick in lib/pickem.ts.
const pickemPicks = {
  ok: true,
  picks: pickemGames.games
    .filter((game) => game.userPickTeam)
    .map((game) => ({
      id: game.userPickId,
      userId: USER_ID,
      venueId: VENUE_ID,
      sportSlug: "nba",
      sportKey: game.sportKey,
      league: "NBA",
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      selectedTeamId: game.userPickTeam === game.homeTeam ? game.homeTeamId : game.awayTeamId,
      winningTeamId: null,
      gameLabel: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      startsAt: game.startsAt,
      selectedTeam: game.userPickTeam,
      selectedSide: game.userPickTeam === game.homeTeam ? "home" : "away",
      status: "pending",
      homeScore: null,
      awayScore: null,
      createdAt: at(-2),
      updatedAt: at(-2),
      resolvedAt: null,
      rewardPoints: 0,
      rewardClaimedAt: null,
    })),
  settlement: null,
};

// app/api/nfl-pickem/weeks/route.ts — NFLWeekOption in lib/nflPickEm.ts.
const nflWeekOption = (weekNumber, weekStartDate, weekEndDate, status, isCurrent) => ({
  id: `nfl-2026-w${weekNumber}`,
  weekNumber,
  weekType: "regular",
  label: `Week ${weekNumber}`,
  weekStartDate,
  weekEndDate,
  status,
  isLocked: status === "complete",
  isCurrent,
  gamesCount: 14,
  isUpcomingPreview: false,
});
const NFL_WEEKS = [
  nflWeekOption(7, "2026-10-15", "2026-10-19", "complete", false),
  nflWeekOption(8, "2026-10-22", "2026-10-26", "open", true),
  nflWeekOption(9, "2026-10-29", "2026-11-02", "upcoming", false),
];
const nflWeeks = { ok: true, weeks: NFL_WEEKS, currentWeekId: "nfl-2026-w8", defaultWeekId: "nfl-2026-w8", season: 2026, mode: "week" };

const NFL_GAMES = [
  ["nfl-g1", "Kansas City Chiefs", "Seattle Seahawks", 1, "home"],
  ["nfl-g2", "Buffalo Bills", "Miami Dolphins", 1, "away"],
  ["nfl-g3", "Philadelphia Eagles", "Dallas Cowboys", 1, null],
  ["nfl-g4", "San Francisco 49ers", "Green Bay Packers", 4.42, null],
  ["nfl-g5", "Detroit Lions", "Minnesota Vikings", 8.33, null],
];
// NFLPickEmGame in lib/nflPickEm.ts.
const nflGame = ([id, homeTeam, awayTeam, hours, pickSide]) => ({
  ...pickemGame([id, homeTeam, awayTeam, hours]),
  sportSlug: "nfl",
  sportKey: "americanfootball_nfl",
  league: "NFL",
  ...(pickSide
    ? { userPickId: `pick-${id}`, userPickTeam: pickSide === "home" ? homeTeam : awayTeam, userPickStatus: "pending", userPickRewardPoints: 0, userPickRewardClaimedAt: null }
    : { userPickId: undefined, userPickTeam: undefined, userPickStatus: undefined }),
  nflWeekId: "nfl-2026-w8",
  weekNumber: 8,
  isThursdayGame: false,
  isSundayGame: true,
  isMondayGame: false,
  dayGroupKey: LOCAL_DATE,
  dayGroupLabel: "Sunday, Oct 25",
  isThursdayNightSection: false,
});
// app/api/nfl-pickem/games/route.ts
const nflGames = {
  ok: true,
  scoringMode: "standard",
  week: {
    id: "nfl-2026-w8",
    weekNumber: 8,
    weekStartDate: "2026-10-22",
    weekEndDate: "2026-10-26",
    thursdayKickoff: "2026-10-23T00:15:00.000Z",
    status: "open",
    isLocked: false,
  },
  games: NFL_GAMES.map(nflGame),
  userSummary: null,
};

// app/api/fantasy/games/route.ts — FantasyGame / FantasyPlayerPoolItem in lib/fantasy.ts.
const FANTASY_PLAYERS = [
  ["Jayson Tatum", "F", "BOS", 48.5],
  ["Jalen Brunson", "G", "NYK", 44.0],
  ["Nikola Jokic", "C", "DEN", 58.5],
  ["LeBron James", "F", "LAL", 47.0],
  ["Jaylen Brown", "G", "BOS", 39.5],
  ["Karl-Anthony Towns", "C", "NYK", 42.5],
  ["Anthony Davis", "F", "LAL", 50.0],
  ["Jamal Murray", "G", "DEN", 36.5],
  ["Bam Adebayo", "C", "MIA", 40.0],
  ["Coby White", "G", "CHI", 31.5],
];
const fantasyGames = {
  ok: true,
  games: NBA_GAMES.slice(0, 3).map(([id, homeTeam, awayTeam, hours]) => ({
    id: `fantasy-${id}`,
    sportKey: "basketball_nba",
    league: "NBA",
    startsAt: at(hours),
    gameLabel: `${awayTeam} @ ${homeTeam}`,
    homeTeam,
    awayTeam,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    isLocked: false,
  })),
  playerPool: FANTASY_PLAYERS.map(([playerName, position, team, projectedLine], index) => ({
    playerId: 1000 + index,
    playerName,
    headshotUrl: null,
    jerseyNumber: String(index + 3),
    coverage: 1,
    projectedLine,
    position,
    team,
  })),
  playerPoolEmptyReason: null,
  leaderboard: [],
  dailyGameId: `nba-daily-${LOCAL_DATE}`,
};
// app/api/fantasy/entries/route.ts
const fantasyEntries = { ok: true, entries: [] };

/**
 * Answer for one request, or null to fall through to the default (404 `{ ok: false }`, which every
 * screen treats as "nothing to show" — ads, analytics, presence and the other games' feeds).
 */
const fixtureFor = (method, pathname) => {
  if (method !== "GET") {
    return { ok: true };
  }
  switch (pathname) {
    case "/api/users/summary": return usersSummary;
    case "/api/notifications": return notifications;
    case "/api/trivia/live/state": return triviaLiveState;
    case "/api/leaderboard": return leaderboard;
    case "/api/challenge-campaigns": return challengeCampaigns;
    case "/api/pickem/sports": return pickemSports;
    case "/api/pickem/games": return pickemGames;
    case "/api/pickem/picks": return pickemPicks;
    case "/api/nfl-pickem/weeks": return nflWeeks;
    case "/api/nfl-pickem/games": return nflGames;
    case "/api/fantasy/games": return fantasyGames;
    case "/api/fantasy/entries": return fantasyEntries;
    default: return null;
  }
};

module.exports = { FIXED_NOW_ISO, FIXED_NOW_MS, VENUE, VENUE_ID, USER_ID, USERNAME, fixtureFor };
