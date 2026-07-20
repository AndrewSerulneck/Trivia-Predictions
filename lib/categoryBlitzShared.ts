// Pure helpers shared between server-only code (lib/categoryBlitz.ts) and
// client components (CategoryBlitzGame.tsx, categoryBlitzRealtime.ts, the
// admin scheduling UI). No "server-only" import and no Supabase dependency —
// keep it that way so both sides can import from one place instead of
// hand-syncing duplicate copies.

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for the "continuous is the default everywhere" rollout (see
 * `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`). Lives here (not
 * `lib/categoryBlitzPool.ts`, which is `server-only`) so both the server
 * engine and client-facing admin/owner UI can read the same flag to decide
 * whether to still offer schedule-based Category Blitz creation.
 */
export const isContinuousDefaultEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT);

/** Seconds of active play per round. */
export const ROUND_DURATION_SECONDS = 180;

/** Seconds between one round's start and the next (play time + intermission). */
export const ROUND_INTERVAL_SECONDS = 360;

/** Seconds of intermission between rounds (derived, not a separate source of truth). */
export const INTERMISSION_SECONDS = ROUND_INTERVAL_SECONDS - ROUND_DURATION_SECONDS;

/** Seconds a freshly auto-created session dwells in the lobby before its first round starts. */
export const LOBBY_DWELL_SECONDS = 60;

/**
 * Milliseconds of tolerance past a round's `ends_at` before the server treats
 * the round as truly expired, and before any client/poll/cron path is allowed
 * to lock it into scoring. Absorbs network latency and client clock drift on
 * the auto-submit-at-zero path so an in-flight submission isn't dropped just
 * because it lands a few hundred ms after the deadline.
 */
export const SUBMISSION_GRACE_MS = 2000;

/**
 * Test mode (see lib/categoryBlitzTestMode.ts) shortens lobby dwell and the
 * gap before the next round to this many seconds, so a solo tester isn't
 * stuck waiting on production-length timers. Never applied to the
 * cron-driven engine, only to per-request/client math that a tester
 * explicitly opts into.
 */
export const TEST_MODE_SECONDS = 10;

/** Seconds of active play per round in test mode (kept generous enough to actually answer). */
export const TEST_MODE_ROUND_DURATION_SECONDS = 30;

/** Seconds of active play per round, shortened in test mode. */
export const roundDurationSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_ROUND_DURATION_SECONDS : ROUND_DURATION_SECONDS;

/** Seconds between one round's start and the next, shortened in test mode. */
export const roundIntervalSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_ROUND_DURATION_SECONDS + TEST_MODE_SECONDS : ROUND_INTERVAL_SECONDS;

/**
 * Seconds of intermission AFTER a round finishes scoring before the next round
 * starts. The next round is anchored on `scored_at + intermissionSeconds`, not
 * `started_at + interval`, so grading latency never eats into the review window
 * (see supabase/migrations/…_category_blitz_round_scored_at.sql). Equals the
 * nominal interval minus the round duration, so with instant grading the
 * overall cadence is unchanged from the old `started_at + interval` model.
 */
export const intermissionSeconds = (testMode: boolean): number =>
  roundIntervalSeconds(testMode) - roundDurationSeconds(testMode);

/** Seconds a freshly auto-created session dwells in the lobby, shortened in test mode. */
export const lobbyDwellSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_SECONDS : LOBBY_DWELL_SECONDS;

/** Continuous-mode pacing for a venue (round length + intermission), in seconds. */
export type CategoryBlitzContinuousTiming = {
  roundDurationSeconds: number;
  intermissionSeconds: number;
};

/**
 * When the next round starts, in epoch ms. Mirrors the server engine's anchor
 * (lib/categoryBlitz.ts → driveContinuousCategoryBlitz): once a round is scored,
 * the next round starts a full intermission AFTER `scoredAt`, so grading latency
 * never shortens the review window; before that (or a pre-migration round with
 * no `scoredAt`) fall back to the `startedAt + interval` estimate. Continuous
 * sessions pass their per-venue timing; scheduled sessions pass none and use the
 * shared constants. Shared by the client "next round in" countdown
 * (categoryBlitzRealtime) and the venue TV screen (lib/venueScreen) so the two
 * can't drift.
 */
export const nextRoundStartAtMs = (
  round: { scoredAt: string | null; startedAt: string },
  testMode: boolean,
  continuousTiming?: CategoryBlitzContinuousTiming | null,
): number => {
  // roundIntervalSeconds(testMode) === roundDurationSeconds(testMode) +
  // intermissionSeconds(testMode) for the shared constants, so this collapse
  // is lossless against the previous 4-branch version.
  const timing = continuousTiming ?? {
    roundDurationSeconds: roundDurationSeconds(testMode),
    intermissionSeconds: intermissionSeconds(testMode),
  };

  if (round.scoredAt) {
    return new Date(round.scoredAt).getTime() + timing.intermissionSeconds * 1000;
  }
  return new Date(round.startedAt).getTime() + (timing.roundDurationSeconds + timing.intermissionSeconds) * 1000;
};

/**
 * True when `answer` starts with `letter`, ignoring a leading "the"/"a"/"an"
 * and case. A bare article with nothing after it ("a", "the") is rejected
 * rather than treated as starting with the article's own letter.
 */
export const answerStartsWithLetter = (answer: string, letter: string): boolean => {
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed || /^(the|a|an)$/.test(trimmed)) return false; // bare article isn't an answer
  const stripped = trimmed.replace(/^(the|a|an)\s+/, "");
  if (!stripped) return false;
  return stripped.charAt(0).toUpperCase() === letter.toUpperCase();
};

/** Total game length for N rounds: each round plus an intermission after it, except the last. */
export const gameDurationMinutes = (rounds: number): number => {
  const safeRounds = Math.max(1, Math.floor(rounds) || 1);
  const roundMinutes = ROUND_DURATION_SECONDS / 60;
  const intermissionMinutes = INTERMISSION_SECONDS / 60;
  return safeRounds * roundMinutes + Math.max(0, safeRounds - 1) * intermissionMinutes;
};

/** Best-effort inverse of gameDurationMinutes, for prefilling the edit form from a stored window. */
export const roundsFromWindowMinutes = (windowMinutes: number): number => {
  const roundMinutes = ROUND_DURATION_SECONDS / 60;
  const intermissionMinutes = INTERMISSION_SECONDS / 60;
  const cycleMinutes = roundMinutes + intermissionMinutes;
  const estimate = (windowMinutes + intermissionMinutes) / cycleMinutes;
  return Math.max(1, Math.round(estimate));
};
