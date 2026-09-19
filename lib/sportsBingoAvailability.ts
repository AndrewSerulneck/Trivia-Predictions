import "server-only";

import type { BallDontLieFailureBox } from "@/lib/ballDontLieClient";
import { listSportsBingoGames, type SportsBingoGame } from "@/lib/sportsBingo";
import { SPORTS_BINGO_LEAGUES, type LeagueDisplay } from "@/lib/sportsBingoLeagues";

export const BINGO_AVAILABILITY_RETRY_MESSAGE =
  "Some leagues could not be checked right now. Try again in a moment.";
export const BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE =
  "We could not check available Bingo games right now. Try again in a moment.";
export const BINGO_GAME_STALE_MESSAGE = "That game is no longer available. Please pick another game.";

export type SportsBingoAvailabilityErrorCode =
  | "unsupported_league"
  | "provider_unavailable"
  | "game_unavailable";

export class SportsBingoAvailabilityError extends Error {
  readonly code: SportsBingoAvailabilityErrorCode;

  constructor(code: SportsBingoAvailabilityErrorCode, message: string) {
    super(message);
    this.name = "SportsBingoAvailabilityError";
    this.code = code;
  }
}

export type SportsBingoLeagueAvailability = LeagueDisplay & {
  games: SportsBingoGame[];
  complete: boolean;
};

export type SportsBingoCreationAvailability = {
  evaluatedAt: string;
  tzOffsetMinutes: number;
  leagues: SportsBingoLeagueAvailability[];
  incomplete: boolean;
  allFailed: boolean;
};

const SUPPORTED_LEAGUES_BY_KEY = new Map(SPORTS_BINGO_LEAGUES.map((league) => [league.sportKey, league]));

export const normalizeSportsBingoTimezoneOffset = (value: number | string | null | undefined): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(-14 * 60, Math.min(14 * 60, parsed)) : 0;
};

export const isSupportedSportsBingoLeague = (sportKey: string): boolean =>
  SUPPORTED_LEAGUES_BY_KEY.has(sportKey.trim().toLowerCase());

/**
 * The sole server-side definition of what can be offered for new board creation. It deliberately
 * delegates boardability, local-day and kickoff filtering to `listSportsBingoGames`, so later
 * candidate-capability changes automatically flow through every creation entry point.
 */
export const resolveSportsBingoCreationAvailability = async (params: {
  tzOffsetMinutes?: number | string | null;
  sportKeys?: string[];
  evaluationTimeMs?: number;
} = {}): Promise<SportsBingoCreationAvailability> => {
  const tzOffsetMinutes = normalizeSportsBingoTimezoneOffset(params.tzOffsetMinutes);
  const evaluationTimeMs = Number.isFinite(params.evaluationTimeMs)
    ? Number(params.evaluationTimeMs)
    : Date.now();
  const requestedKeys = params.sportKeys?.length
    ? [...new Set(params.sportKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))]
    : SPORTS_BINGO_LEAGUES.map((league) => league.sportKey);

  const unsupported = requestedKeys.find((key) => !SUPPORTED_LEAGUES_BY_KEY.has(key));
  if (unsupported) {
    throw new SportsBingoAvailabilityError("unsupported_league", "That Sports Bingo league is not supported.");
  }

  const results = await Promise.all(
    requestedKeys.map(async (sportKey): Promise<SportsBingoLeagueAvailability> => {
      const league = SUPPORTED_LEAGUES_BY_KEY.get(sportKey)!;
      const failure: BallDontLieFailureBox = { failed: false };
      try {
        const games = await listSportsBingoGames({
          sportKey,
          includeLocked: false,
          tzOffsetMinutes,
          evaluationTimeMs,
          failure,
        });
        return { ...league, games, complete: !failure.failed };
      } catch (error) {
        console.error(`[bingo][availability] failed to evaluate ${league.label}`, error);
        return { ...league, games: [], complete: false };
      }
    })
  );

  return {
    evaluatedAt: new Date(evaluationTimeMs).toISOString(),
    tzOffsetMinutes,
    leagues: results,
    incomplete: results.some((result) => !result.complete),
    allFailed:
      results.length > 0 && results.every((result) => !result.complete && result.games.length === 0),
  };
};

export const requireSportsBingoCreationGame = async (params: {
  sportKey: string;
  gameId: string;
  tzOffsetMinutes?: number | string | null;
  evaluationTimeMs?: number;
}): Promise<SportsBingoGame> => {
  const sportKey = params.sportKey.trim().toLowerCase();
  const gameId = params.gameId.trim();
  const availability = await resolveSportsBingoCreationAvailability({
    sportKeys: [sportKey],
    tzOffsetMinutes: params.tzOffsetMinutes,
    evaluationTimeMs: params.evaluationTimeMs,
  });
  const league = availability.leagues[0];
  const game = league?.games.find((candidate) => candidate.id === gameId);
  if (game) {
    return game;
  }
  if (!league?.complete) {
    throw new SportsBingoAvailabilityError("provider_unavailable", BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE);
  }
  throw new SportsBingoAvailabilityError("game_unavailable", BINGO_GAME_STALE_MESSAGE);
};

export const sportsBingoAvailabilityErrorStatus = (error: unknown): number | null => {
  if (!(error instanceof SportsBingoAvailabilityError)) return null;
  if (error.code === "unsupported_league") return 400;
  if (error.code === "provider_unavailable") return 503;
  return 409;
};
