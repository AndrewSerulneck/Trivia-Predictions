// Pure, client-safe Live Trivia timing helpers — a mirror of the private timing
// constants in lib/liveShowdownEngine.ts. That engine file is "server-only"
// (it pulls in fs + Supabase), so the owner scheduling FORM can't import from it
// for its end-time preview. This module has no "server-only" import and no
// Supabase dependency, so the server adapter (lib/ownerSchedule.ts) and the
// client form (app/owner/schedule/page.tsx) can share ONE duration formula
// instead of hand-syncing two copies — same pattern as lib/categoryBlitzShared.ts.
//
// ⚠️ MUST stay in sync with ROUND_MS / QUESTIONS_PER_ROUND in
// lib/liveShowdownEngine.ts. The guard test tests/lib.liveTriviaShared.test.ts
// imports the engine's LIVE_SHOWDOWN_TIMING and asserts these match, so drift
// fails CI rather than silently mis-sizing scheduled windows.

const QUESTIONS_PER_ROUND = 15;
const ANSWERING_MS = 60_000;
const REST_WARNING_MS = 15_000;
const QUESTION_BLOCK_MS = ANSWERING_MS + REST_WARNING_MS; // 75 sec
const QUESTION_WINDOW_MS = QUESTIONS_PER_ROUND * QUESTION_BLOCK_MS; // 18 min 45 sec
const MID_GAME_BREAK_MS = 525_000; // 8 min 45 sec

/** One Live Trivia round including its mid-game break: 27 min 30 sec. */
export const LIVE_TRIVIA_ROUND_MS = QUESTION_WINDOW_MS + MID_GAME_BREAK_MS;

/**
 * Length of the answer-reveal hold (engine's rest_warning window), in seconds.
 * The venue TV's <LiveTriviaRevealScreen> imports this instead of a locally
 * hand-copied magic number — same mirror-and-guard pattern as the constants
 * above, so a change to REST_WARNING_MS in the engine can't silently drift
 * out of sync with the TV's depleting-rail total.
 */
export const REVEAL_HOLD_SECONDS = REST_WARNING_MS / 1000;

/** Rounds usable for a Live Trivia schedule — matches clampRounds() in the engine. */
export const clampLiveTriviaRounds = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
};

/**
 * Total wall-clock length of an N-round Live Trivia game, in minutes. Matches the
 * engine's occurrence math exactly: `endMs = startMs + rounds * ROUND_MS`
 * (enumerateScheduleOccurrences in lib/liveShowdownEngine.ts) — Live Trivia's
 * ROUND_MS already bakes in the mid-game break, so there is no "no break after
 * the last round" subtraction like Category Blitz has.
 */
export const liveTriviaDurationMinutes = (rounds: number): number => {
  const safeRounds = clampLiveTriviaRounds(rounds);
  return (safeRounds * LIVE_TRIVIA_ROUND_MS) / 60_000;
};

/** Exact inverse of liveTriviaDurationMinutes, for prefilling the edit form from a stored window. */
export const roundsFromLiveTriviaWindowMinutes = (windowMinutes: number): number => {
  const rounds = (windowMinutes * 60_000) / LIVE_TRIVIA_ROUND_MS;
  return clampLiveTriviaRounds(Math.round(rounds));
};
