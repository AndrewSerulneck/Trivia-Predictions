import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listNFLPickEmGames } from "@/lib/nflPickEm";

/**
 * NFL Pick 'Em week-winner tiebreaker.
 *
 * The week-winner reward is decided by most correct picks at a venue. Ties are
 * broken by a prediction question — "How many total points will be scored in
 * this week's last game?" — closest guess wins. This module owns the data model
 * and settlement; the UI (Phase 2) and the winner resolver (Phase 7) consume it.
 *
 * See docs/nfl-pickem-reward-plan.md and docs/nfl-pickem-reward-phase1.md.
 */

// ============================================
// CONSTANTS
// ============================================

const TIEBREAKER_MIN_TOTAL = 0;
const TIEBREAKER_MAX_TOTAL = 200;

const TIEBREAKER_SELECT =
  "id, user_id, venue_id, week_id, game_id, predicted_total, actual_total, created_at, updated_at";

// ============================================
// TYPES
// ============================================

/** The week's last game — the one the tiebreaker question is asked about. */
export type NFLTiebreakerGame = {
  weekId: string;
  weekNumber: number;
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  /** True once kickoff has passed; guesses are rejected from that moment on. */
  isLocked: boolean;
  /** True once the game is final with both scores present. */
  isFinal: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

/** A user's own guess, fully revealed. */
export type NFLTiebreakerGuess = {
  id: string;
  userId: string;
  venueId: string;
  weekId: string;
  gameId: string;
  predictedTotal: number;
  actualTotal: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A guess as exposed in a venue-wide listing.
 *
 * PRIVACY: `predictedTotal` is *absent* (not null) whenever the guess belongs to
 * another user and the tiebreaker game has not kicked off yet — same rule and
 * rationale as pick privacy (docs/nfl-pickem-phase5.md). The value never reaches
 * the client, so a hostile client has nothing to un-hide.
 */
export type NFLTiebreakerGuessEntry = {
  userId: string;
  weekId: string;
  gameId: string;
  isHidden: boolean;
  predictedTotal?: number;
  actualTotal: number | null;
  updatedAt: string;
};

export type NFLTiebreakerSettlement = {
  settled: boolean;
  gameId: string | null;
  actualTotal: number | null;
  updatedCount: number;
};

/** Input shape for the pure ranking helper; `predictedTotal: null` = no guess. */
export type NFLTiebreakerProximityGuess = {
  userId: string;
  predictedTotal: number | null;
};

type NFLTiebreakerRow = {
  id: string;
  user_id: string;
  venue_id: string;
  week_id: string;
  game_id: string;
  predicted_total: number;
  actual_total: number | null;
  created_at: string;
  updated_at: string;
};

// ============================================
// HELPERS
// ============================================

const mapTiebreakerRow = (row: NFLTiebreakerRow): NFLTiebreakerGuess => ({
  id: row.id,
  userId: row.user_id,
  venueId: row.venue_id,
  weekId: row.week_id,
  gameId: row.game_id,
  predictedTotal: row.predicted_total,
  actualTotal: row.actual_total,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Kickoff comparison, matching isGameLocked in lib/nflPickEm.ts: an unparseable
 * kickoff is treated as locked so a bad timestamp can never open a guess window.
 */
const isKickoffPassed = (startsAt: string): boolean => {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) return true;
  return Date.now() >= startsAtMs;
};

const requireAdmin = (): NonNullable<typeof supabaseAdmin> => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabaseAdmin;
};

// ============================================
// THE TIEBREAKER GAME
// ============================================

/**
 * The week's last game: the latest kickoff in the week, ties on `startsAt`
 * broken by `game_id` ascending. Deterministic and stable across calls — the UI
 * and the winner resolver must both land on the same game.
 *
 * Derived from listNFLPickEmGames, so a seeded/mock week behaves identically to
 * a real one.
 */
export const getWeekTiebreakerGame = async (weekId: string): Promise<NFLTiebreakerGame | null> => {
  const id = String(weekId ?? "").trim();
  if (!id) return null;

  const { week, games } = await listNFLPickEmGames({ weekId: id });
  if (games.length === 0) return null;

  const last = games.reduce((best, game) => {
    const bestMs = Date.parse(best.startsAt);
    const gameMs = Date.parse(game.startsAt);
    // An unparseable kickoff can never win the "latest" comparison.
    if (!Number.isFinite(gameMs)) return best;
    if (!Number.isFinite(bestMs)) return game;
    if (gameMs !== bestMs) return gameMs > bestMs ? game : best;
    return game.id < best.id ? game : best;
  });

  if (!Number.isFinite(Date.parse(last.startsAt))) return null;

  const homeScore = last.homeScore ?? null;
  const awayScore = last.awayScore ?? null;

  return {
    weekId: week.id,
    weekNumber: week.weekNumber,
    gameId: last.id,
    gameLabel: `${last.awayTeam} vs ${last.homeTeam}`,
    homeTeam: last.homeTeam,
    awayTeam: last.awayTeam,
    startsAt: last.startsAt,
    isLocked: isKickoffPassed(last.startsAt),
    isFinal: last.status === "final" && homeScore !== null && awayScore !== null,
    homeScore,
    awayScore,
  };
};

// ============================================
// GUESSES
// ============================================

/**
 * Create or replace a user's tiebreaker guess for a week at a venue.
 * Rejected once the tiebreaker game has kicked off.
 */
export const submitTiebreakerGuess = async (params: {
  userId: string;
  venueId: string;
  weekId: string;
  predictedTotal: number;
}): Promise<NFLTiebreakerGuess> => {
  const admin = requireAdmin();

  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const weekId = String(params.weekId ?? "").trim();
  if (!userId) throw new Error("userId is required");
  if (!venueId) throw new Error("venueId is required");
  if (!weekId) throw new Error("weekId is required");

  const predictedTotal = Number(params.predictedTotal);
  if (!Number.isInteger(predictedTotal)) {
    throw new Error("Your guess must be a whole number of points.");
  }
  if (predictedTotal < TIEBREAKER_MIN_TOTAL || predictedTotal > TIEBREAKER_MAX_TOTAL) {
    throw new Error(
      `Your guess must be between ${TIEBREAKER_MIN_TOTAL} and ${TIEBREAKER_MAX_TOTAL} points.`
    );
  }

  const game = await getWeekTiebreakerGame(weekId);
  if (!game) {
    throw new Error("No tiebreaker game is available for this week.");
  }
  if (game.isLocked) {
    throw new Error("This game has already started. Tiebreaker guesses lock at kickoff.");
  }

  const { data, error } = await admin
    .from("nfl_pickem_tiebreakers")
    .upsert(
      {
        user_id: userId,
        venue_id: venueId,
        week_id: weekId,
        game_id: game.gameId,
        predicted_total: predictedTotal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,venue_id,week_id" }
    )
    .select(TIEBREAKER_SELECT)
    .single<NFLTiebreakerRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save tiebreaker guess.");
  }

  return mapTiebreakerRow(data);
};

/** The requesting user's own guess, for readback in the UI. */
export const getTiebreakerGuess = async (params: {
  userId: string;
  venueId: string;
  weekId: string;
}): Promise<NFLTiebreakerGuess | null> => {
  const admin = requireAdmin();

  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const weekId = String(params.weekId ?? "").trim();
  if (!userId || !venueId || !weekId) return null;

  const { data, error } = await admin
    .from("nfl_pickem_tiebreakers")
    .select(TIEBREAKER_SELECT)
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("week_id", weekId)
    .maybeSingle<NFLTiebreakerRow>();

  if (error) {
    throw new Error(`Failed to load tiebreaker guess: ${error.message}`);
  }
  if (!data) return null;

  return mapTiebreakerRow(data);
};

/**
 * Every guess at one venue for one week.
 *
 * `revealFor` controls the privacy gate: `"all"` is server-internal (the winner
 * resolver), while `{ userId }` is what any user-facing surface passes — other
 * users' guesses stay hidden until the tiebreaker game kicks off.
 */
export const listTiebreakerGuesses = async (params: {
  venueId: string;
  weekId: string;
  revealFor: { userId: string } | "all";
}): Promise<NFLTiebreakerGuessEntry[]> => {
  const admin = requireAdmin();

  const venueId = String(params.venueId ?? "").trim();
  const weekId = String(params.weekId ?? "").trim();
  if (!venueId) throw new Error("venueId is required");
  if (!weekId) throw new Error("weekId is required");

  const { data, error } = await admin
    .from("nfl_pickem_tiebreakers")
    .select(TIEBREAKER_SELECT)
    .eq("venue_id", venueId)
    .eq("week_id", weekId)
    .order("user_id", { ascending: true })
    .returns<NFLTiebreakerRow[]>();

  if (error) {
    throw new Error(`Failed to load tiebreaker guesses: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const revealAll = params.revealFor === "all";
  const ownUserId = params.revealFor === "all" ? "" : String(params.revealFor.userId ?? "").trim();

  // A missing game is treated as "not kicked off": nothing but the caller's own
  // guess is revealed.
  const game = revealAll ? null : await getWeekTiebreakerGame(weekId);
  const gameStarted = game !== null && game.isLocked;

  return rows.map((row) => {
    const isOwnGuess = ownUserId.length > 0 && row.user_id === ownUserId;
    const isHidden = !revealAll && !isOwnGuess && !gameStarted;

    const entry: NFLTiebreakerGuessEntry = {
      userId: row.user_id,
      weekId: row.week_id,
      gameId: row.game_id,
      isHidden,
      actualTotal: row.actual_total,
      updatedAt: row.updated_at,
    };

    // Set the key only when revealed: JSON.stringify omits absent keys entirely.
    if (!isHidden) {
      entry.predictedTotal = row.predicted_total;
    }

    return entry;
  });
};

// ============================================
// SETTLEMENT
// ============================================

/**
 * Write the tiebreaker game's final total onto every guess for that week.
 *
 * Week-wide across venues by design: the tiebreaker game and its final score are
 * national, so there is nothing venue-specific to settle. Every *standings* read
 * (listTiebreakerGuesses, the resolver) still filters venue_id.
 *
 * Idempotent — rows that already carry the same actual_total are left alone, so
 * a re-sweep reports updatedCount 0 rather than rewriting history.
 */
export const settleWeekTiebreaker = async (weekId: string): Promise<NFLTiebreakerSettlement> => {
  const admin = requireAdmin();

  const id = String(weekId ?? "").trim();
  if (!id) throw new Error("weekId is required");

  const game = await getWeekTiebreakerGame(id);
  if (!game) {
    return { settled: false, gameId: null, actualTotal: null, updatedCount: 0 };
  }
  if (!game.isFinal || game.homeScore === null || game.awayScore === null) {
    return { settled: false, gameId: game.gameId, actualTotal: null, updatedCount: 0 };
  }

  const actualTotal = game.homeScore + game.awayScore;

  // Only rows recorded against this game are settled: a guess made against a
  // different game (a schedule change moved which game is last) is not a guess
  // about this score.
  const { data, error } = await admin
    .from("nfl_pickem_tiebreakers")
    .select(TIEBREAKER_SELECT)
    .eq("week_id", id)
    .eq("game_id", game.gameId)
    .returns<NFLTiebreakerRow[]>();

  if (error) {
    throw new Error(`Failed to load tiebreaker guesses for settlement: ${error.message}`);
  }

  const staleIds = (data ?? []).filter((row) => row.actual_total !== actualTotal).map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: updateError } = await admin
      .from("nfl_pickem_tiebreakers")
      .update({ actual_total: actualTotal, updated_at: new Date().toISOString() })
      .in("id", staleIds);

    if (updateError) {
      throw new Error(`Failed to settle tiebreaker guesses: ${updateError.message}`);
    }
  }

  return { settled: true, gameId: game.gameId, actualTotal, updatedCount: staleIds.length };
};

// ============================================
// RANKING (pure)
// ============================================

/**
 * Order tied users best-first by tiebreaker proximity. Pure — no I/O — so the
 * winner resolver's ordering is directly unit-testable.
 *
 * Rules, in order:
 *   1. Smaller |predictedTotal - actualTotal| ranks better.
 *   2. On equal distance, the LOWER guess ranks better ("closest without going
 *      over" instinct).
 *   3. A user with no guess always ranks below every user who guessed.
 *   4. Still tied (identical guesses, or neither guessed) → userId ascending, so
 *      a re-sweep can never award a different player.
 *   5. actualTotal null (game not final) → userId ascending; the caller decides
 *      not to award yet.
 */
export const rankByTiebreakerProximity = (
  userIds: readonly string[],
  guesses: readonly NFLTiebreakerProximityGuess[],
  actualTotal: number | null
): string[] => {
  const unique = [...new Set(userIds.map((userId) => String(userId ?? "").trim()).filter(Boolean))];

  if (actualTotal === null || !Number.isFinite(actualTotal)) {
    return unique.sort((a, b) => a.localeCompare(b));
  }

  const guessByUser = new Map<string, number>();
  for (const guess of guesses) {
    const userId = String(guess.userId ?? "").trim();
    if (!userId) continue;
    if (guess.predictedTotal === null || !Number.isFinite(guess.predictedTotal)) continue;
    guessByUser.set(userId, Number(guess.predictedTotal));
  }

  return unique.sort((a, b) => {
    const guessA = guessByUser.get(a);
    const guessB = guessByUser.get(b);

    // Rule 3: no guess ranks below every guess.
    if (guessA === undefined || guessB === undefined) {
      if (guessA === guessB) return a.localeCompare(b); // Rule 4
      return guessA === undefined ? 1 : -1;
    }

    // Rule 1: closer wins.
    const distanceA = Math.abs(guessA - actualTotal);
    const distanceB = Math.abs(guessB - actualTotal);
    if (distanceA !== distanceB) return distanceA - distanceB;

    // Rule 2: equal distance → lower guess wins.
    if (guessA !== guessB) return guessA - guessB;

    // Rule 4: identical guesses → deterministic by userId.
    return a.localeCompare(b);
  });
};
