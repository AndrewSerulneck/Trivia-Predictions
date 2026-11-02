import "server-only";

// The Pick 'Em Prize tiebreaker (docs/pickem-college-football-and-prize-plan.md D8, Phase 4b). A "most
// picks right" prize's leaders who tie are separated by one question per period: "How many total
// points will be scored in the last game?" — the last-starting game with a score in the prize's
// leagues during the period. Same shape as NFL Pick 'Em's (lib/nflPickEmTiebreaker.ts); none of its
// NFL calendar.
//
// THE GAME is found from the provider: the period's last day with any game in the prize's score
// leagues (stepping back at most 7 days), its latest start, ties by game id. A guess stores the game
// it was about; the sweep reads THAT game's final score, so a schedule change after guesses were made
// can't move the question under them. Guesses lock at that game's start (by the server's clock).
//
// pickem_prize_tiebreakers is written ONLY here (saveGuess), read here and by the sweep.
//
// COST: the game lookup is one provider request per score league per day stepped back, cached per
// server instance for TIEBREAKER_GAME_CACHE_TTL_MS; asked only by the tiebreaker route and by the sweep
// when leaders tie. A guess read/write is one small indexed query.

import { listPickEmProviderGames, type PickEmProviderGame } from "@/lib/pickem";
import { addPickEmPrizeDays, pickemScopeLeagueKeys, type PickEmPrizePeriod } from "@/lib/pickemPrizes";
import { pickEmSportOfLeague } from "@/lib/pickemSports";
import { zonedDateTimeToUtcMs } from "@/lib/categoryBlitzScheduleTime";
import type { PickEmPrizeTiebreakGuess } from "@/lib/pickemPrizeStandings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PickEmPrizeScope } from "@/types";

export const PICKEM_PRIZE_TIEBREAKER_MIN_TOTAL = 0;
export const PICKEM_PRIZE_TIEBREAKER_MAX_TOTAL = 400;
export const TIEBREAKER_GAME_CACHE_TTL_MS = 5 * 60_000;
const MAX_DAYS_BACK = 7;
/** A game's final score is looked for within this many hours either side of its start. */
const SCORE_SEARCH_HOURS = 12;

export const PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE = "The tiebreaker game has already started, so guesses are closed.";
export const PICKEM_PRIZE_TIEBREAKER_RANGE_MESSAGE = `Enter a whole number from ${PICKEM_PRIZE_TIEBREAKER_MIN_TOTAL} to ${PICKEM_PRIZE_TIEBREAKER_MAX_TOTAL}.`;

export type PickEmPrizeTiebreakerGame = {
  gameId: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  isFinal: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

const gameCache = new Map<string, { value: Promise<PickEmProviderGame[]>; expiresAtMs: number }>();

/** Test hook. */
export function clearPickEmPrizeTiebreakerCache(): void {
  gameCache.clear();
}

const localMidnightMs = (date: string, timeZone: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return zonedDateTimeToUtcMs(year, month, day, 0, 0, 0, timeZone);
};

function gamesOnDay(leagueKeys: readonly string[], date: string, timeZone: string): Promise<PickEmProviderGame[]> {
  const key = `${leagueKeys.join(",")}|${date}|${timeZone}`;
  const nowMs = Date.now();
  const cached = gameCache.get(key);
  if (cached && cached.expiresAtMs > nowMs) return cached.value;
  for (const [entryKey, entry] of gameCache) if (entry.expiresAtMs <= nowMs) gameCache.delete(entryKey);
  const fromIso = new Date(localMidnightMs(date, timeZone)).toISOString();
  const toIso = new Date(localMidnightMs(addPickEmPrizeDays(date, 1), timeZone)).toISOString();
  const value = listPickEmProviderGames(leagueKeys, fromIso, toIso);
  gameCache.set(key, { value, expiresAtMs: nowMs + TIEBREAKER_GAME_CACHE_TTL_MS });
  value.catch(() => gameCache.delete(key));
  return value;
}

/** The latest start, ties by game id ascending. Pure; exported for tests. */
export const lastPickEmPrizeGame = (games: readonly PickEmProviderGame[]): PickEmProviderGame | null => {
  let best: PickEmProviderGame | null = null;
  for (const game of games) {
    const ms = Date.parse(game.startsAt);
    if (!Number.isFinite(ms)) continue;
    if (!best) {
      best = game;
      continue;
    }
    const bestMs = Date.parse(best.startsAt);
    if (ms > bestMs || (ms === bestMs && game.id < best.id)) best = game;
  }
  return best;
};

const toTiebreakerGame = (game: PickEmProviderGame, nowMs: number): PickEmPrizeTiebreakerGame => {
  const startsMs = Date.parse(game.startsAt);
  return {
    gameId: game.id,
    sportKey: game.sportKey,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    startsAt: game.startsAt,
    // An unreadable start counts as started: a bad timestamp never opens a guess window.
    isLocked: !Number.isFinite(startsMs) || nowMs >= startsMs,
    isFinal: game.isFinal && game.homeScore !== null && game.awayScore !== null,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  };
};

/**
 * The period's tiebreaker game, or null when the prize's score leagues have no game in the period's
 * last 7 days (or the provider answered nothing — it can't tell us which).
 */
export async function findPickEmPrizeTiebreakerGame(params: {
  scope: PickEmPrizeScope;
  period: Pick<PickEmPrizePeriod, "startDate" | "endDate">;
  timeZone: string;
  nowMs?: number;
}): Promise<PickEmPrizeTiebreakerGame | null> {
  const leagueKeys = pickemScopeLeagueKeys(params.scope).filter((key) => pickEmSportOfLeague(key)?.hasScores);
  if (leagueKeys.length === 0) return null;
  for (let back = 0; back < MAX_DAYS_BACK; back += 1) {
    const date = addPickEmPrizeDays(params.period.endDate, -back);
    if (date < params.period.startDate) break;
    const last = lastPickEmPrizeGame(await gamesOnDay(leagueKeys, date, params.timeZone));
    if (last) return toTiebreakerGame(last, params.nowMs ?? Date.now());
  }
  return null;
}

/**
 * The final total (home + away) of the game a guess was about, or null while it isn't final with both
 * scores (or the provider didn't answer). Matches the Pick 'Em game id, else the same provider event
 * (a rescheduled game keeps its provider id).
 */
export async function pickemPrizeGameTotal(game: { sportKey: string; gameId: string; startsAt: string }): Promise<number | null> {
  const startsMs = Date.parse(game.startsAt);
  if (!Number.isFinite(startsMs)) return null;
  const span = SCORE_SEARCH_HOURS * 3_600_000;
  const games = await listPickEmProviderGames(
    [game.sportKey],
    new Date(startsMs - span).toISOString(),
    new Date(startsMs + span).toISOString(),
  );
  const providerId = game.gameId.split("__")[0];
  const match =
    games.find((candidate) => candidate.id === game.gameId) ??
    games.find((candidate) => providerId !== "" && candidate.id.split("__")[0] === providerId);
  if (!match || !match.isFinal || match.homeScore === null || match.awayScore === null) return null;
  return match.homeScore + match.awayScore;
}

// ── Guesses ────────────────────────────────────────────────────────────────────────────────────

export type PickEmPrizeStoredGuess = PickEmPrizeTiebreakGuess & { sportKey: string; gameId: string; gameStartsAt: string };

type GuessRow = {
  user_id: string;
  sport_key: string;
  game_id: string;
  game_starts_at: string;
  predicted_total: number;
  updated_at: string;
};

const GUESS_COLUMNS = "user_id, sport_key, game_id, game_starts_at, predicted_total, updated_at";

const mapGuess = (row: GuessRow): PickEmPrizeStoredGuess => ({
  userId: row.user_id,
  sportKey: row.sport_key,
  gameId: row.game_id,
  gameStartsAt: row.game_starts_at,
  predictedTotal: Number(row.predicted_total),
  savedAt: row.updated_at,
});

const requireAdmin = (): NonNullable<typeof supabaseAdmin> => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

/** One player's guess for one period of one prize, or null. */
export async function getPickEmPrizeGuess(params: {
  challengeId: string;
  periodStart: Date;
  userId: string;
}): Promise<PickEmPrizeStoredGuess | null> {
  const { data, error } = await requireAdmin()
    .from("pickem_prize_tiebreakers")
    .select(GUESS_COLUMNS)
    .eq("challenge_id", params.challengeId)
    .eq("period_start", params.periodStart.toISOString())
    .eq("user_id", params.userId)
    .maybeSingle<GuessRow>();
  if (error) throw new Error(error.message ?? "Failed to load the tiebreaker guess.");
  return data ? mapGuess(data) : null;
}

/** The guesses of these players for one period of one prize (the sweep, on a tie). Throws on error. */
export async function listPickEmPrizeGuesses(params: {
  challengeId: string;
  periodStart: Date;
  userIds: readonly string[];
}): Promise<PickEmPrizeStoredGuess[]> {
  if (params.userIds.length === 0) return [];
  const { data, error } = await requireAdmin()
    .from("pickem_prize_tiebreakers")
    .select(GUESS_COLUMNS)
    .eq("challenge_id", params.challengeId)
    .eq("period_start", params.periodStart.toISOString())
    .in("user_id", [...params.userIds])
    .returns<GuessRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load tiebreaker guesses.");
  return (data ?? []).map(mapGuess);
}

/** Is this a total a player may guess? Whole number, 0–400. */
export const isPickEmPrizeTiebreakerTotal = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= PICKEM_PRIZE_TIEBREAKER_MIN_TOTAL &&
  value <= PICKEM_PRIZE_TIEBREAKER_MAX_TOTAL;

/**
 * Create or replace a player's guess. Refused (throws with a message the route shows) for a total out
 * of range or once the game has started. The caller has already checked the prize and the period.
 */
export async function savePickEmPrizeGuess(params: {
  challengeId: string;
  periodStart: Date;
  userId: string;
  venueId: string;
  game: Pick<PickEmPrizeTiebreakerGame, "gameId" | "sportKey" | "startsAt">;
  predictedTotal: unknown;
  nowMs?: number;
}): Promise<PickEmPrizeStoredGuess> {
  if (!isPickEmPrizeTiebreakerTotal(params.predictedTotal)) throw new Error(PICKEM_PRIZE_TIEBREAKER_RANGE_MESSAGE);
  const startsMs = Date.parse(params.game.startsAt);
  if (!Number.isFinite(startsMs) || (params.nowMs ?? Date.now()) >= startsMs) {
    throw new Error(PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE);
  }
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
  const { data, error } = await requireAdmin()
    .from("pickem_prize_tiebreakers")
    .upsert(
      {
        challenge_id: params.challengeId,
        period_start: params.periodStart.toISOString(),
        user_id: params.userId,
        venue_id: params.venueId,
        sport_key: params.game.sportKey,
        game_id: params.game.gameId,
        game_starts_at: params.game.startsAt,
        predicted_total: params.predictedTotal,
        updated_at: nowIso,
      },
      { onConflict: "challenge_id,period_start,user_id" },
    )
    .select(GUESS_COLUMNS)
    .single<GuessRow>();
  if (error || !data) throw new Error(error?.message ?? "Failed to save the tiebreaker guess.");
  return mapGuess(data);
}
