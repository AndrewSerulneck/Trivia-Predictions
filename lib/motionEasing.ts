/**
 * Shared easing tokens for the Category Blitz intermission transition
 * (results → leaderboard → next-round countdown). Values come 1:1 from the
 * Phase 4 animation prototype — see docs/category-blitz-scoring-and-bugfix-plan.md.
 */

/** ease-in — for anything LEAVING the screen (results rows, leaderboard rows). */
export const EASE_ACCEL: [number, number, number, number] = [0.4, 0, 1, 1];

/** ease-out quint — for anything ENTERING the screen (leaderboard rows). */
export const EASE_SNAP: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** ease-out-back — countdown digits only; the small overshoot reads as a "pop". */
export const EASE_POP: [number, number, number, number] = [0.34, 1.4, 0.64, 1];
