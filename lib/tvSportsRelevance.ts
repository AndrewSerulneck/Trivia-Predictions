// Which of today's games the venue TV shows first (docs/fire-tv-app-plan.md D18, Phase 9 step 4).
//
// Pure: no reads, no clock of its own. The state request hands it the shared copy of today's games
// (tv_sports_games), this venue's pick count per game and the venue's time zone, and gets the games in order.
// The Pick 'Em board shows the first TV_PICKEM_BOARD_SIZE; the ticker carries the rest (and all of them on slides
// other than the board). Game ranking lives only here (plan Phase 15 standing rule).
//
// Score = venue interest + league weight (by the game's local day and time) + status + big game.
// A league with no games today never shows, so seasons need no calendar.

export type TvSportsGameStatus = "scheduled" | "live" | "final";

/** One game as the state request reads it from the shared copy. */
export type TvSportsGameInput = {
  key: string;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  startsAt: string;
  isFinal: boolean;
  /** The feed's own state; null when it doesn't say (then the clock decides). */
  feedState?: TvSportsGameStatus | null;
  /** When a refresh first saw the game final (null while it isn't). */
  finalSeenAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  periodLabel: string | null;
  isPostseason: boolean | null;
};

/** One game as the TV gets it. Scores and pick numbers are null when unknown, never 0. */
export type TvPickEmGame = {
  key: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  startsAt: string;
  status: TvSportsGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  periodLabel: string | null;
  /** Picks at this venue; null when the pick read failed. */
  picks: number | null;
  /** Share of this venue's picks on the home side, 0–100; null with no picks (or unknown). */
  homePickPct: number | null;
};

export type TvVenuePickCount = { home: number; away: number };

export type TvPickEmLeader = { rank: number; username: string; wins: number; losses: number };

export const TV_PICKEM_BOARD_SIZE = 4;
export const TV_TICKER_MAX_GAMES = 12;
/** Board + ticker: the most games one idle response carries. */
export const TV_SPORTS_MAX_GAMES = TV_PICKEM_BOARD_SIZE + TV_TICKER_MAX_GAMES;

const HOUR_MS = 60 * 60 * 1000;
/** A game "starts soon" inside this window. */
export const TV_STARTS_SOON_MS = 2 * HOUR_MS;
/** Finals stay this long after a refresh first saw them final. */
export const TV_FINAL_KEEP_MS = HOUR_MS;
/** A "live" game older than this is stale data (a missed final, a suspended game): unknown, so it's dropped. */
export const TV_LIVE_STALE_MS = 8 * HOUR_MS;

type LeagueFamily = "nfl" | "ncaaf" | "nba" | "wnba" | "nhl" | "mlb" | "soccer" | "ufc" | "tennis" | "other";

export const leagueFamilyOf = (sportKey: string): LeagueFamily => {
  const key = String(sportKey ?? "").toLowerCase();
  if (key === "nfl" || key === "americanfootball_nfl") return "nfl";
  if (key.includes("ncaaf")) return "ncaaf";
  if (key === "nba" || key === "basketball_nba") return "nba";
  if (key === "wnba" || key === "basketball_wnba") return "wnba";
  if (key === "nhl" || key === "icehockey_nhl") return "nhl";
  if (key === "mlb" || key === "baseball_mlb") return "mlb";
  if (key.startsWith("soccer")) return "soccer";
  if (key.startsWith("mma")) return "ufc";
  if (key.startsWith("tennis") || key === "atp" || key === "wta") return "tennis";
  return "other";
};

// 0 = Sunday … 6 = Saturday, hours 0–23 in the venue's time zone (the game's start).
type Slot = { days: readonly number[]; from: number; to: number; weight: number };
type LeagueWeights = { base: number; slots: readonly Slot[] };

const WEEKNIGHTS = [1, 2, 3, 4, 5] as const;

/**
 * The hand-tuned league weights. A game takes the highest matching slot, else the base.
 * Starting values from the plan (D18); tune here only.
 */
export const TV_LEAGUE_WEIGHTS: Record<LeagueFamily, LeagueWeights> = {
  nfl: {
    base: 7,
    slots: [
      { days: [0], from: 12, to: 23, weight: 10 },
      { days: [1, 4], from: 19, to: 23, weight: 10 },
    ],
  },
  ncaaf: { base: 5, slots: [{ days: [6], from: 11, to: 23, weight: 9 }] },
  nba: { base: 5, slots: [{ days: WEEKNIGHTS, from: 18, to: 23, weight: 7 }] },
  nhl: { base: 4.5, slots: [{ days: WEEKNIGHTS, from: 18, to: 23, weight: 6.5 }] },
  soccer: { base: 3, slots: [{ days: [0, 6], from: 6, to: 13, weight: 6 }] },
  ufc: { base: 3, slots: [{ days: [6], from: 19, to: 23, weight: 7 }] },
  wnba: { base: 4, slots: [] },
  mlb: { base: 4, slots: [] },
  tennis: { base: 3, slots: [] },
  other: { base: 2, slots: [] },
};

const STATUS_POINTS: Record<"live" | "soon" | "final" | "later", number> = { live: 6, soon: 4, final: 2, later: 0 };
const BIG_GAME_POINTS = 3;
/** Venue interest: 1 pick ≈ +4, 3 ≈ +8, 7 ≈ +12, 15 ≈ +16 (diminishing, and the strongest signal). */
const interestPoints = (picks: number): number => (picks > 0 ? 4 * Math.log2(1 + picks) : 0);

type LocalParts = { dayKey: string; weekday: number; hour: number };

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
};

export const localPartsOf = (ms: number, timeZone: string): LocalParts => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatterFor(timeZone).formatToParts(new Date(ms));
  } catch {
    parts = formatterFor("America/New_York").formatToParts(new Date(ms));
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour: Number(get("hour")) % 24,
  };
};

export const leagueWeightAt = (sportKey: string, startsAtMs: number, timeZone: string): number => {
  const weights = TV_LEAGUE_WEIGHTS[leagueFamilyOf(sportKey)];
  const { weekday, hour } = localPartsOf(startsAtMs, timeZone);
  let best = weights.base;
  for (const slot of weights.slots) {
    if (slot.days.includes(weekday) && hour >= slot.from && hour <= slot.to) best = Math.max(best, slot.weight);
  }
  return best;
};

const finiteScore = (value: number | null): number | null =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.floor(Number(value));

type Classified = { status: TvSportsGameStatus; bucket: keyof typeof STATUS_POINTS } | null;

/** Live, starting soon, a recent final, later today, or null (not shown: tomorrow, an old final, stale). */
export const classifyTvGame = (game: TvSportsGameInput, nowMs: number, timeZone: string): Classified => {
  const startMs = Date.parse(game.startsAt);
  if (!Number.isFinite(startMs)) return null;
  if (game.isFinal) {
    const seenMs = Date.parse(game.finalSeenAt ?? "");
    const recent = Number.isFinite(seenMs) && nowMs - seenMs <= TV_FINAL_KEEP_MS;
    return recent && nowMs - startMs <= TV_LIVE_STALE_MS ? { status: "final", bucket: "final" } : null;
  }
  // The feed says it's on (an early puck drop, a game whose start time is off): live, if not stale.
  if (game.feedState === "live" || (startMs <= nowMs && game.feedState !== "scheduled")) {
    return nowMs - startMs <= TV_LIVE_STALE_MS ? { status: "live", bucket: "live" } : null;
  }
  // Past its start but the feed says it hasn't begun (a delay): it is about to start.
  if (startMs <= nowMs) return { status: "scheduled", bucket: "soon" };
  if (startMs - nowMs <= TV_STARTS_SOON_MS) return { status: "scheduled", bucket: "soon" };
  // Later: only games on the venue's own today.
  return localPartsOf(startMs, timeZone).dayKey === localPartsOf(nowMs, timeZone).dayKey
    ? { status: "scheduled", bucket: "later" }
    : null;
};

/**
 * Today's games in the order the TV shows them, at most `limit`. `pickCounts` null = the pick read failed (pick
 * numbers unknown, not zero); a game missing from a known map has 0 picks here.
 */
export const rankTvSportsGames = (params: {
  games: readonly TvSportsGameInput[];
  pickCounts: ReadonlyMap<string, TvVenuePickCount> | null;
  timeZone: string;
  nowMs: number;
  limit?: number;
}): TvPickEmGame[] => {
  const { games, pickCounts, timeZone, nowMs } = params;
  const limit = Math.max(0, Math.floor(params.limit ?? TV_SPORTS_MAX_GAMES));
  const seen = new Set<string>();
  const scored: Array<{ game: TvPickEmGame; score: number; startMs: number }> = [];

  for (const game of games) {
    if (!game.key || seen.has(game.key)) continue;
    seen.add(game.key);
    const classified = classifyTvGame(game, nowMs, timeZone);
    if (!classified) continue;
    const startMs = Date.parse(game.startsAt);
    const count = pickCounts ? pickCounts.get(game.key) ?? { home: 0, away: 0 } : null;
    const picks = count ? count.home + count.away : null;
    const score =
      interestPoints(picks ?? 0) +
      leagueWeightAt(game.sportKey, startMs, timeZone) +
      STATUS_POINTS[classified.bucket] +
      (game.isPostseason === true ? BIG_GAME_POINTS : 0);
    const started = classified.status !== "scheduled";
    scored.push({
      score,
      startMs,
      game: {
        key: game.key,
        league: game.league,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeAbbr: game.homeAbbr,
        awayAbbr: game.awayAbbr,
        startsAt: new Date(startMs).toISOString(),
        status: classified.status,
        // A scheduled game has no score yet: unknown, not 0-0.
        homeScore: started ? finiteScore(game.homeScore) : null,
        awayScore: started ? finiteScore(game.awayScore) : null,
        periodLabel: started ? game.periodLabel : null,
        picks,
        homePickPct: count && picks ? Math.round((count.home / picks) * 100) : null,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score || a.startMs - b.startMs || a.game.key.localeCompare(b.game.key));
  return scored.slice(0, limit).map((entry) => entry.game);
};

/** The ticker's games (at most 12): the top ones, skipping the board's while the Pick 'Em board is on screen (D15). */
export const tvTickerGames = (ranked: readonly TvPickEmGame[], boardOnScreen: boolean): TvPickEmGame[] =>
  ranked.slice(boardOnScreen ? TV_PICKEM_BOARD_SIZE : 0).slice(0, TV_TICKER_MAX_GAMES);

/** Today's Pick 'Em top 5 at the venue by record (wins, then fewest losses). Null when nobody has a settled pick. */
export const rankTvPickEmLeaders = (
  picks: ReadonlyArray<{ userId: string; username: string | null; status: string }>,
  limit = 5,
): TvPickEmLeader[] | null => {
  const byUser = new Map<string, { username: string; wins: number; losses: number }>();
  for (const pick of picks) {
    if (pick.status !== "won" && pick.status !== "lost") continue;
    const entry = byUser.get(pick.userId) ?? { username: pick.username?.trim() || "Player", wins: 0, losses: 0 };
    if (pick.status === "won") entry.wins += 1;
    else entry.losses += 1;
    byUser.set(pick.userId, entry);
  }
  if (byUser.size === 0) return null;
  return [...byUser.values()]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.username.localeCompare(b.username))
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
};
