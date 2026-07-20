import type { VenueScreenState } from "@/lib/venueScreen";

export type VenueScreenDebugMode = VenueScreenState["mode"];

export const VENUE_SCREEN_DEBUG_MODES: VenueScreenDebugMode[] = [
  "live-trivia",
  "category-blitz",
  "idle",
];

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
  return 20_000;
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
