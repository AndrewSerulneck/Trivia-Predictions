// Seasonal games' venue points: the ONE home of the scale (Andrew, 2026-10-19, plan §1 decision 11)
// and of the credit rules. Pure, no server-only, so on-screen copy can quote the same numbers.
// The only writer is creditSeasonalPoints() in lib/seasonalPointsCredit.ts, through the
// credit_seasonal_points RPC (migration 20261019*_seasonal_points_credits.sql).
//
// Plan: docs/squares-and-brackets-plan.md, Phase 1.

/** A ledger source. Must match the check constraint on seasonal_points_credits.source. */
export type SeasonalPointsSource = "squares" | "bracket";

export const SEASONAL_POINTS_SOURCES: readonly SeasonalPointsSource[] = ["squares", "bracket"];

/** Squares scoring moments, in game order. Scores are cumulative; overtime counts toward the final. */
export const SQUARES_MOMENTS = ["q1", "half", "q3", "final"] as const;
export type SquaresMoment = (typeof SQUARES_MOMENTS)[number];

/** Venue points for holding a moment's winning square. */
export const SQUARES_MOMENT_POINTS: Record<SquaresMoment, number> = { q1: 25, half: 25, q3: 25, final: 50 };

/** Bracket points per correct pick, by round (Round of 64 → championship). Standard doubling, max 1,920. */
export const BRACKET_ROUND_POINTS: readonly number[] = [10, 20, 40, 80, 160, 320];

/** Bracket points ÷ this = venue points (max 192 main bracket, 128 second chance). */
export const BRACKET_VENUE_POINTS_DIVISOR = 10;

/** Venue points for a bracket score. Bracket points are multiples of 10, so this is exact. */
export const bracketVenuePoints = (bracketPoints: number): number =>
  Math.max(0, Math.floor(bracketPoints / BRACKET_VENUE_POINTS_DIVISOR));

/** Most points one ledger row may carry. Mirrors the SQL check constraint. */
export const SEASONAL_CREDIT_MAX_POINTS = 1000;

/** Longest ledger key. Mirrors the SQL check constraint. */
export const SEASONAL_SOURCE_KEY_MAX_LENGTH = 200;

/** Most credits one RPC call takes. Mirrors the SQL guard; the caller splits larger batches. */
export const SEASONAL_CREDIT_BATCH_MAX = 500;

/**
 * One credit. `sourceKey` is the once-only identity within its source: crediting the same
 * (source, sourceKey) twice pays once, whoever the second call names. Build it from the thing being
 * paid for (e.g. a board + moment), never from a timestamp or attempt number.
 */
export type SeasonalCredit = {
  /** The venue-scoped users.id (one per venue profile). */
  userId: string;
  sourceKey: string;
  points: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a credit is refused before it reaches the database, or null when it is valid. */
export const seasonalCreditProblem = (credit: SeasonalCredit): string | null => {
  if (!UUID_PATTERN.test(credit.userId)) return "userId must be a users.id uuid";
  const key = credit.sourceKey;
  if (typeof key !== "string" || key.trim() === "" || key !== key.trim()) return "sourceKey must be non-empty and trimmed";
  if (key.length > SEASONAL_SOURCE_KEY_MAX_LENGTH) return `sourceKey is longer than ${SEASONAL_SOURCE_KEY_MAX_LENGTH}`;
  if (!Number.isInteger(credit.points) || credit.points < 1 || credit.points > SEASONAL_CREDIT_MAX_POINTS) {
    return `points must be a whole number from 1 to ${SEASONAL_CREDIT_MAX_POINTS}`;
  }
  return null;
};
