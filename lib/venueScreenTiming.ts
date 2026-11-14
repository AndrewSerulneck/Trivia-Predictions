import type { VenueScreenState } from "@/lib/venueScreen";

export type VenueScreenDebugMode = VenueScreenState["mode"];

export const VENUE_SCREEN_DEBUG_MODES: VenueScreenDebugMode[] = [
  "live-trivia",
  "live-trivia-pregame",
  "category-blitz",
  "idle",
];

/** The display switches to the Live Trivia pre-game screen this long before the scheduled start. */
export const LIVE_TRIVIA_PREGAME_LEAD_MS = 15 * 60_000;
/** Pre-game poll pace; the last {@link PREGAME_FINAL_STRETCH_MS} polls faster so go-live lands on time. */
export const PREGAME_POLL_MS = 10_000;
export const PREGAME_FINAL_STRETCH_MS = 60_000;
export const PREGAME_FINAL_STRETCH_POLL_MS = 2_000;
const IDLE_POLL_MS = 20_000;

/**
 * The go-live takeover fires only when a poll sees the display move from a waiting screen
 * (idle or the Live Trivia pre-game) into a live game. Never on the first render, so a reload
 * mid-game stays quiet, and never on idle → pre-game.
 */
export function isGoLiveTransition(
  previous: VenueScreenState["mode"],
  next: VenueScreenState["mode"],
): boolean {
  const wasWaiting = previous === "idle" || previous === "live-trivia-pregame";
  return wasWaiting && (next === "live-trivia" || next === "category-blitz");
}

export function parseVenueScreenDebugMode(value: unknown): VenueScreenDebugMode | null {
  const mode = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  return VENUE_SCREEN_DEBUG_MODES.includes(mode as VenueScreenDebugMode)
    ? (mode as VenueScreenDebugMode)
    : null;
}

export function getVenueScreenPollIntervalMs(state: VenueScreenState): number {
  if (state.mode === "live-trivia") {
    // Question and reveal are both live, ticking beats — poll fast so the
    // countdown stays smooth and the question→reveal→intermission handoffs
    // land promptly. Intermission/final change slowly.
    return state.liveTrivia.phase === "question" || state.liveTrivia.phase === "reveal" ? 1_000 : 4_000;
  }
  if (state.mode === "category-blitz") {
    return state.categoryBlitz.phase === "round" ? 1_000 : 4_000;
  }
  // Squares re-reads the board server-side at most every 15 s, so polling faster only repeats it.
  if (state.mode === "squares") return 15_000;
  // March Madness results land at most every couple of minutes (the bracket sync's pace).
  if (state.mode === "bracket") return 30_000;
  if (state.mode === "live-trivia-pregame") {
    const msToStart = Date.parse(state.pregame.startsAt) - state.updatedAt;
    return Number.isFinite(msToStart) && msToStart <= PREGAME_FINAL_STRETCH_MS
      ? PREGAME_FINAL_STRETCH_POLL_MS
      : PREGAME_POLL_MS;
  }
  // Idle: wake up exactly when the pre-game window opens instead of up to one idle poll late.
  const nextStartMs = Date.parse(state.idle.nextLiveTrivia?.startsAt ?? "");
  if (Number.isFinite(nextStartMs)) {
    const msToPregame = nextStartMs - LIVE_TRIVIA_PREGAME_LEAD_MS - state.updatedAt;
    if (msToPregame > 0 && msToPregame < IDLE_POLL_MS) return Math.max(1_000, msToPregame);
  }
  return IDLE_POLL_MS;
}

export function getVenueScreenRetryDelayMs(failureCount: number): number {
  const safeFailures = Math.max(1, Math.floor(Number(failureCount) || 1));
  return Math.min(15_000, 1_000 * 2 ** Math.min(safeFailures - 1, 4));
}

export function getVenueScreenBurnInTransform(nowMs: number): string {
  const offsets = [
    [0, 0],
    [6, -4],
    [-5, 5],
    [4, 6],
    [-6, -3],
    [3, -6],
    [-4, 2],
    [5, 4],
  ];
  const index = Math.floor(Math.max(0, nowMs) / 300_000) % offsets.length;
  const [x, y] = offsets[index] ?? [0, 0];
  return `translate3d(${x}px, ${y}px, 0)`;
}
