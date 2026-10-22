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


// ---- Phase 5 scenarios (Pick 'Em + NFL Pick 'Em states the default shots can't reach) ----
// A shot names a `scenario`; fixtureFor() swaps in the matching answers. The default shots (no
// scenario) are unchanged, so the pre-Phase-5 baseline stays comparable.

const pickemSettledGames = (() => {
  const base = (id, homeTeam, awayTeam, extra) => ({
    ...pickemGame([id, homeTeam, awayTeam, 1]),
    sportSlug: "nhl",
    sportKey: "icehockey_nhl",
    league: "NHL",
    ...extra,
  });
  const picked = (id, team, status) => ({ userPickId: `pick-${id}`, userPickTeam: team, userPickStatus: status, userPickRewardPoints: status === "won" ? 10 : 0, userPickRewardClaimedAt: null });
  return [
    base("nhl-live", "Boston Bruins", "Toronto Maple Leafs", { status: "live", isLocked: true, homeScore: 2, awayScore: 1, periodLabel: "P2 · 8:41", ...picked("nhl-live", "Boston Bruins", "pending") }),
    base("nhl-won", "New York Rangers", "Montreal Canadiens", { status: "final", isLocked: true, homeScore: 4, awayScore: 2, winnerTeam: "New York Rangers", ...picked("nhl-won", "New York Rangers", "won") }),
    base("nhl-lost", "Chicago Blackhawks", "Dallas Stars", { status: "final", isLocked: true, homeScore: 1, awayScore: 3, winnerTeam: "Dallas Stars", ...picked("nhl-lost", "Chicago Blackhawks", "lost") }),
    base("nhl-push", "Vegas Golden Knights", "Seattle Kraken", { status: "final", isLocked: true, homeScore: 3, awayScore: 3, winnerTeam: null, ...picked("nhl-push", "Seattle Kraken", "push") }),
    base("nhl-locked", "Colorado Avalanche", "Edmonton Oilers", { isLocked: true, ...picked("nhl-locked", "Edmonton Oilers", "pending") }),
    base("nhl-open", "Florida Panthers", "Tampa Bay Lightning", {}),
  ];
})();
const pickemSettledResponse = {
  ...pickemGames,
  sport: pickemSports.sports[1],
  games: pickemSettledGames,
  pointsBank: { ...pickemGames.pointsBank, totalPicks: 5, settledPicks: 3, pendingPicks: 2, correctPicks: 1, incorrectPicks: 1, unclaimedCorrectPicks: 1, pendingPoints: 10 },
};
const pickemLimitPicks = {
  ...pickemPicks,
  picks: Array.from({ length: 10 }, (_, index) => ({ ...pickemPicks.picks[index % 2], id: `pick-limit-${index}`, gameId: `limit-${index}` })),
};
const HISTORY_DATE = "2026-10-24";
const historyPick = (id, status, selected, home, away, sport) => ({
  ...pickemPicks.picks[0],
  id,
  gameId: `${id}-game`,
  sportSlug: sport,
  league: sport.toUpperCase(),
  status,
  selectedTeam: selected,
  homeTeam: home,
  awayTeam: away,
  startsAt: `${HISTORY_DATE}T23:00:00.000Z`,
  homeScore: status === "pending" ? null : 101,
  awayScore: status === "pending" ? null : 99,
});
const pickemHistoryPicks = {
  ...pickemPicks,
  picks: [
    historyPick("hist-won", "won", "Boston Celtics", "Boston Celtics", "New York Knicks", "nba"),
    historyPick("hist-lost", "lost", "Miami Heat", "Chicago Bulls", "Miami Heat", "nba"),
    historyPick("hist-pending", "pending", "Seattle Kraken", "Vegas Golden Knights", "Seattle Kraken", "nhl"),
    historyPick("hist-push", "push", "Dallas Stars", "Chicago Blackhawks", "Dallas Stars", "nhl"),
  ],
};

// NFL week with every kind of card: Thursday night final (won), Sunday final (lost), a tie (push),
// a live game with a pick, upcoming games, spreads, a prize banner, tiebreaker and leaderboard.
const nflFullGames = (() => {
  const make = (args, extra) => ({ ...nflGame(args), ...extra });
  const picked = (team, status) => ({ userPickId: `p-${team}`, userPickTeam: team, userPickStatus: status, userPickRewardPoints: status === "won" ? 10 : 0, userPickRewardClaimedAt: null });
  return [
    make(["nfl-t1", "Cincinnati Bengals", "Pittsburgh Steelers", -72, null], {
      status: "final", isLocked: true, homeScore: 20, awayScore: 24, winnerTeam: "Pittsburgh Steelers",
      isThursdayGame: true, isThursdayNightSection: true, dayGroupKey: "2026-10-22", dayGroupLabel: "Thursday Night Football · Oct 22",
      homeSpread: 3, awaySpread: -3, ...picked("Pittsburgh Steelers", "won"),
    }),
    make(["nfl-s1", "Las Vegas Raiders", "Kansas City Chiefs", -1, null], {
      status: "final", isLocked: true, homeScore: 17, awayScore: 31, winnerTeam: "Kansas City Chiefs", homeSpread: 9.5, awaySpread: -9.5, ...picked("Las Vegas Raiders", "lost"),
    }),
    make(["nfl-s2", "Dallas Cowboys", "Philadelphia Eagles", -1, null], {
      status: "final", isLocked: true, homeScore: 24, awayScore: 24, winnerTeam: null, homeSpread: 1, awaySpread: -1, ...picked("Dallas Cowboys", "push"),
    }),
    make(["nfl-s3", "Seattle Seahawks", "Green Bay Packers", 0, null], {
      status: "live", isLocked: true, homeScore: 10, awayScore: 7, winnerTeam: null, homeSpread: -2.5, awaySpread: 2.5, ...picked("Green Bay Packers", "pending"),
    }),
    make(["nfl-s4", "San Francisco 49ers", "Atlanta Falcons", 4.4, null], { homeSpread: -6.5, awaySpread: 6.5, ...picked("San Francisco 49ers", "pending") }),
    make(["nfl-s5", "Minnesota Vikings", "Detroit Lions", 8.3, null], { homeSpread: 3, awaySpread: -3 }),
  ].map((game) => ({ ...game, dayGroupKey: game.isThursdayNightSection ? "2026-10-22" : LOCAL_DATE, dayGroupLabel: game.isThursdayNightSection ? game.dayGroupLabel : "Sunday, Oct 25" }));
})();
const nflFullGamesResponse = {
  ...nflGames,
  scoringMode: "spread",
  spreadLinesUnavailable: true,
  spreadsUnavailable: true,
  games: nflFullGames,
  userSummary: { picksCount: 5, correctPicks: 1, incorrectPicks: 1, totalPoints: 10, isComplete: false },
};
const nflRewards = {
  ok: true,
  campaigns: [
    {
      ...campaignBase,
      id: "camp-nfl-most",
      name: "Most picks right",
      winCondition: "game_winner",
      pointsRequiredToWin: 1,
      progressPoints: 1,
      winnerQuota: 1,
      quotaRemaining: 1,
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 25,
      description: { summary: "Most picks right this week wins a $25 gift card.", when: null, fineprint: null, isCustom: false },
    },
  ],
  winners: [],
  participantCount: 6,
  hasActiveGameWinnerReward: true,
  rewardMinPlayers: 3,
};
const nflTiebreaker = {
  ok: true,
  game: { gameId: "nfl-s5", homeTeam: "Minnesota Vikings", awayTeam: "Detroit Lions", startsAt: at(8.3), isLocked: false },
  guess: { predictedTotal: 44 },
};
const nflLeaderboardPick = (gameId, label, team, status) => ({
  gameId, gameLabel: label, homeTeam: label.split(" at ")[1], awayTeam: label.split(" at ")[0], startsAt: at(-1),
  isHidden: false, selectedTeam: team, status, winnerTeam: null, homeScore: 24, awayScore: 17,
});
const nflLeaderboard = {
  ok: true,
  entries: [
    { userId: "user-gridiron", username: "gridiron", picksCount: 14, correctPicks: 11, incorrectPicks: 3, totalPoints: 110, rank: 1, isCurrentUser: false, isTiebreakerWinner: true, tiebreaker: { isHidden: false, predictedTotal: 47, actualTotal: null }, picks: [] },
    {
      userId: USER_ID, username: USERNAME, picksCount: 5, correctPicks: 1, incorrectPicks: 1, totalPoints: 10, rank: 2, isCurrentUser: true,
      tiebreaker: { isHidden: false, predictedTotal: 44, actualTotal: null },
      picks: [
        nflLeaderboardPick("a", "Pittsburgh Steelers at Cincinnati Bengals", "Pittsburgh Steelers", "won"),
        nflLeaderboardPick("b", "Kansas City Chiefs at Las Vegas Raiders", "Las Vegas Raiders", "lost"),
        nflLeaderboardPick("c", "Green Bay Packers at Seattle Seahawks", "Green Bay Packers", "pending"),
      ],
    },
    { userId: "user-barflyer", username: "barflyer", picksCount: 12, correctPicks: 8, incorrectPicks: 4, totalPoints: 80, rank: 3, isCurrentUser: false, picks: [] },
  ],
};

// ---- Phase 6 scenarios (Fantasy states the default shots can't reach) ----
// fantasy-live: a live NBA roster today (4 of 5 scoring) + a venue leaderboard (My Sweat / Leaderboard).
// fantasy-final: the same roster, final. fantasy-banners: a live MLB roster while NBA is selected (the
// cross-sport nudge), the games list failing (error notice + "No NBA games scheduled").
// fantasy-mlb: an MLB slate with pitchers and hitters (the draft builder's MLB sections).
const NBA_DAILY_ID = `nba-daily-${LOCAL_DATE}`;
const MLB_DAILY_ID = `mlb-daily-${LOCAL_DATE}`;
const fantasyEntry = (id, sportKey, gameId, status, players, breakdown) => {
  const points = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    id,
    userId: USER_ID,
    venueId: VENUE_ID,
    sportKey,
    gameId,
    gameLabel: "Daily slate",
    homeTeam: "",
    awayTeam: "",
    startsAt: at(-1),
    lineup: players.map(([name]) => name),
    lineupPlayers: players.map(([playerName, playerId]) => ({ playerId, playerName, headshotUrl: null, jerseyNumber: null })),
    status,
    points,
    scoreBreakdown: breakdown,
    rewardPoints: 0,
    rewardClaimedAt: null,
    liveCollectedPoints: points,
    statsLastSourceUpdatedAt: null,
    settledAt: status === "final" ? at(-0.1) : null,
    createdAt: at(-3),
    updatedAt: at(-0.2),
  };
};
// Ids match fantasyGames.playerPool (1000 + index), so positions and teams resolve from the pool.
const NBA_ROSTER = [["Nikola Jokic", 1002], ["Jayson Tatum", 1000], ["Anthony Davis", 1006], ["Jalen Brunson", 1001], ["LeBron James", 1003]];
const NBA_BREAKDOWN = { 1002: 48.5, 1000: 39, 1006: 31.5, 1001: 9.5 };
const fantasyLiveEntries = { ok: true, entries: [fantasyEntry("entry-live", "basketball_nba", NBA_DAILY_ID, "live", NBA_ROSTER, NBA_BREAKDOWN)] };
const fantasyFinalEntries = { ok: true, entries: [fantasyEntry("entry-final", "basketball_nba", NBA_DAILY_ID, "final", NBA_ROSTER, { ...NBA_BREAKDOWN, 1003: 14 })] };
const fantasyBannerEntries = {
  ok: true,
  entries: [fantasyEntry("entry-mlb", "baseball_mlb", MLB_DAILY_ID, "live", [["Gerrit Cole", 2000], ["Aaron Judge", 2003]], { 2000: 12, 2003: 9 })],
};
const fantasyLeaderboard = ["hoopsdad", USERNAME, "quizwiz", "barflyer"].map((username, index) => ({
  entryId: `lb-${index}`,
  userId: username === USERNAME ? USER_ID : `user-${username}`,
  username,
  points: 151 - index * 17.5,
  status: "live",
  rank: index + 1,
  lineup: [],
  rewardPoints: 0,
}));
const fantasyLiveGames = { ...fantasyGames, leaderboard: fantasyLeaderboard };
const MLB_PLAYERS = [
  ["Gerrit Cole", "SP", "NYY", 46],
  ["Shohei Ohtani", "DH", "LAD", 41],
  ["Tarik Skubal", "SP", "DET", 39],
  ["Aaron Judge", "RF", "NYY", 37.5],
  ["Emmanuel Clase", "RP", "CLE", 30],
  ["Bobby Witt Jr.", "SS", "KC", 29],
  ["Mookie Betts", "2B", "LAD", 27.5],
];
const fantasyMlbGames = {
  ...fantasyGames,
  games: [["mlb-g1", "New York Yankees", "Boston Red Sox", 3], ["mlb-g2", "Los Angeles Dodgers", "San Diego Padres", 6]].map(([id, homeTeam, awayTeam, hours]) => ({
    id: `fantasy-${id}`, sportKey: "baseball_mlb", league: "MLB", startsAt: at(hours), gameLabel: `${awayTeam} @ ${homeTeam}`,
    homeTeam, awayTeam, status: "scheduled", homeScore: null, awayScore: null, isLocked: false,
  })),
  playerPool: MLB_PLAYERS.map(([playerName, position, team, projectedLine], index) => ({
    playerId: 2000 + index, playerName, headshotUrl: null, jerseyNumber: String(index + 11), coverage: 1, projectedLine, position, team,
  })),
  dailyGameId: MLB_DAILY_ID,
};

/**
 * Answer for one request, or null to fall through to the default (404 `{ ok: false }`, which every
 * screen treats as "nothing to show" — ads, analytics, presence and the other games' feeds).
 */
const fixtureFor = (method, pathname, search, scenario) => {
  if (method !== "GET") {
    return { ok: true };
  }
  const sport = search ? search.get("sportSlug") : null;
  if (scenario === "pickem-settled" && pathname === "/api/pickem/games" && sport === "nhl") return pickemSettledResponse;
  if (scenario === "pickem-limit" && pathname === "/api/pickem/picks") return pickemLimitPicks;
  if (scenario === "pickem-history" && pathname === "/api/pickem/picks") return pickemHistoryPicks;
  if (scenario === "nfl-full") {
    if (pathname === "/api/nfl-pickem/games") return nflFullGamesResponse;
    if (pathname === "/api/nfl-pickem/rewards") return nflRewards;
    if (pathname === "/api/nfl-pickem/tiebreaker") return nflTiebreaker;
    if (pathname === "/api/nfl-pickem/leaderboard") return nflLeaderboard;
  }
  const poolRequest = Boolean(search && search.get("gameId"));
  if (scenario === "fantasy-live" || scenario === "fantasy-final") {
    if (pathname === "/api/fantasy/entries") return scenario === "fantasy-live" ? fantasyLiveEntries : fantasyFinalEntries;
    if (pathname === "/api/fantasy/games") return fantasyLiveGames;
  }
  if (scenario === "fantasy-banners") {
    if (pathname === "/api/fantasy/entries") return fantasyBannerEntries;
    if (pathname === "/api/fantasy/games" && !poolRequest) return { ok: false, error: "Couldn't load today's games. Pull to retry." };
  }
  if (scenario === "fantasy-mlb" && pathname === "/api/fantasy/games") return fantasyMlbGames;
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

module.exports = { HISTORY_DATE, FIXED_NOW_ISO, FIXED_NOW_MS, VENUE, VENUE_ID, USER_ID, USERNAME, fixtureFor };
