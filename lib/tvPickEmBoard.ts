// What the TV's Pick 'Em Live Board and All-Time Leaderboard slides say (docs/fire-tv-app-plan.md Phase 10).
//
// Pure: no reads, no clock of its own. The components in components/venue-screen/ draw these views. Scores and pick
// numbers the feed doesn't know are null in the data and show as "–" or nothing here, never as 0 (Standing rule:
// missing data is unknown, not zero). Times are the TV's own clock, the same as the Next Live Trivia line.

import type { TvAllTimeEntry } from "@/lib/venueScreenCarouselShared";
import {
  TV_PICKEM_BOARD_SIZE,
  type TvPickEmGame,
  type TvPickEmLeader,
  type TvSportsGameStatus,
} from "@/lib/tvSportsRelevance";

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** From this local hour a mixed-league board is called "<Day> night". */
const NIGHT_FROM_HOUR = 17;
/** How long a score flash stays available to the slide after the poll that saw the score change. */
export const TV_SCORE_FLASH_KEEP_MS = 90_000;

/** The games on the board: the first four of the ranked list (the ticker carries the rest). */
export const boardGamesOf = (games: readonly TvPickEmGame[]): TvPickEmGame[] =>
  games.slice(0, TV_PICKEM_BOARD_SIZE);

const teamLabel = (abbr: string | null, name: string): string => (abbr?.trim() ? abbr.trim() : name);

const scoreText = (score: number | null): string => (score === null ? "–" : String(score));

export type TvTileSide = {
  label: string;
  /** "–" when unknown. */
  score: string;
  /** Ahead on a known score; both sides false when level or unknown. */
  lead: boolean;
  /** Share of this venue's picks on this side, 0–100; null without picks. */
  pickPct: number | null;
};

export type TvTileView = {
  key: string;
  league: string;
  status: TvSportsGameStatus;
  /** "Q3 4:12", "Half", "Final"; null while scheduled (the slide shows the start time). */
  statusText: string | null;
  startsAt: string;
  /** "29 picks"; null with no picks or an unknown count. */
  picksText: string | null;
  away: TvTileSide;
  home: TvTileSide;
};

export const tileViewOf = (game: TvPickEmGame): TvTileView => {
  const known =
    game.status !== "scheduled" && game.awayScore !== null && game.homeScore !== null;
  const awayLead = known && (game.awayScore as number) > (game.homeScore as number);
  const homeLead = known && (game.homeScore as number) > (game.awayScore as number);
  const homePct = game.homePickPct === null ? null : Math.max(0, Math.min(100, Math.round(game.homePickPct)));
  const picks = game.picks;
  return {
    key: game.key,
    league: game.league,
    status: game.status,
    statusText:
      game.status === "live" ? game.periodLabel?.trim() || "Live" : game.status === "final" ? "Final" : null,
    startsAt: game.startsAt,
    picksText: picks === null || picks <= 0 ? null : picks === 1 ? "1 pick" : `${picks} picks`,
    away: {
      label: teamLabel(game.awayAbbr, game.awayTeam),
      score: scoreText(game.awayScore),
      lead: awayLead,
      pickPct: homePct === null ? null : 100 - homePct,
    },
    home: {
      label: teamLabel(game.homeAbbr, game.homeTeam),
      score: scoreText(game.homeScore),
      lead: homeLead,
      pickPct: homePct,
    },
  };
};

/** "8:20 PM" in the TV's own time. Empty when the time can't be read. */
export const formatGameTime = (startsAt: string): string => {
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/**
 * The board's right-hand label. One league on the board: its name ("NFL"). Mixed leagues: the day ("Tuesday night",
 * or "Saturday" before 5 PM). `hydrated` false (server render): "Today", so the server and the first client render
 * agree before the TV's clock is known.
 */
export const pickEmBoardLabel = (games: readonly TvPickEmGame[], nowMs: number, hydrated: boolean): string => {
  const board = boardGamesOf(games);
  const leagues = [...new Set(board.map((game) => game.league))];
  if (leagues.length === 1) return leagues[0];
  if (!hydrated) return "Today";
  const now = new Date(nowMs);
  const day = WEEKDAY_LONG[now.getDay()];
  return now.getHours() >= NIGHT_FROM_HOUR ? `${day} night` : day;
};

/** "9–3" (en dash). */
export const formatLeaderRecord = (leader: Pick<TvPickEmLeader, "wins" | "losses">): string =>
  `${leader.wins}–${leader.losses}`;

/** 48210 → "48,210". */
export const formatPoints = (points: number): string => Math.round(points).toLocaleString("en-US");

/** The all-time rows split for two columns of five (D11): ranks 1–5 left, 6–10 right. */
export const allTimeColumns = (
  entries: readonly TvAllTimeEntry[],
): { left: TvAllTimeEntry[]; right: TvAllTimeEntry[] } => {
  const top = entries.slice(0, 10);
  return { left: top.slice(0, 5), right: top.slice(5, 10) };
};

/* ------------------------------ score flash ------------------------------ */

export type TvScoreSnapshot = ReadonlyMap<string, { away: number | null; home: number | null }>;

export const scoreSnapshotOf = (games: readonly TvPickEmGame[]): TvScoreSnapshot =>
  new Map(games.map((game) => [game.key, { away: game.awayScore, home: game.homeScore }]));

export type TvScoreFlash = {
  /** Stable identity of this score change: the same change never plays twice (useFxMoment). */
  token: string;
  gameKey: string;
  side: "away" | "home";
  /** "KC +7" */
  ribbon: string;
  /** "71% here picked KC", or "KC scores" when this venue has no picks on the game. */
  caption: string;
};

/**
 * The first board game whose score went up since `previous` (both scores known then and now). Null on the first
 * look (`previous` null): a TV that has just opened flashes nothing. Only games already on the board can flash.
 */
export const detectScoreFlash = (
  previous: TvScoreSnapshot | null,
  games: readonly TvPickEmGame[],
): TvScoreFlash | null => {
  if (!previous) return null;
  for (const game of boardGamesOf(games)) {
    if (game.status !== "live") continue;
    const before = previous.get(game.key);
    if (!before) continue;
    for (const side of ["away", "home"] as const) {
      const now = side === "away" ? game.awayScore : game.homeScore;
      const was = before[side];
      if (now === null || was === null || now <= was) continue;
      const view = tileViewOf(game);
      const label = view[side].label;
      const pct = view[side].pickPct;
      return {
        token: `pickem-score:${game.key}:${game.awayScore ?? "x"}-${game.homeScore ?? "x"}`,
        gameKey: game.key,
        side,
        ribbon: `${label} +${now - was}`,
        caption: pct === null ? `${label} scores` : `${pct}% here picked ${label}`,
      };
    }
  }
  return null;
};
