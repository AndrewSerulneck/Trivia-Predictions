// Pure helpers shared between server-only code (lib/categoryBlitz.ts) and
// client components (CategoryBlitzGame.tsx, categoryBlitzRealtime.ts, the
// admin scheduling UI). No "server-only" import and no Supabase dependency —
// keep it that way so both sides can import from one place instead of
// hand-syncing duplicate copies.

/** Seconds of active play per round. */
export const ROUND_DURATION_SECONDS = 180;

/** Seconds between one round's start and the next (play time + intermission). */
export const ROUND_INTERVAL_SECONDS = 600;

/** Seconds of intermission between rounds (derived, not a separate source of truth). */
export const INTERMISSION_SECONDS = ROUND_INTERVAL_SECONDS - ROUND_DURATION_SECONDS;

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
