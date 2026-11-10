import "server-only";

// The server side of Pick 'Em pick windows (docs/cancelled-prizes-pick-windows-away-mode-plan.md B1).
// Every pick write goes through `assertPickEmPickWindowOpen`: regular picks (make, change, clear), NFL
// Pick 'Em picks (make, change, clear) and Pick 'Em Prize tiebreaker guesses. The rules are pure in
// lib/pickemPickWindow.ts; this file only reads the bar's settings and time zone and refuses.
//
// FAIL OPEN: a failed settings read is logged and never blocks a pick (same as the Prize pick limit),
// so our own outage can't close picks. The time zone read is cached and falls back to the default.
// COST: no extra read for a sport without a window beyond the one settings read the pick makes.

import {
  pickWindowViewForGame,
  type PickEmPickWindowView,
  type PickEmPickWindows,
} from "@/lib/pickemPickWindow";
import type { PickEmSportSlug } from "@/lib/pickemSports";
import { getVenueTimezone } from "@/lib/timezone";
import { getVenueGameSettings, type VenueGameSettings } from "@/lib/venueGameSettings";

const CLOSED_ERROR_NAME = "PickEmPickWindowClosedError";

/** A pick refused because its game's window is closed. Routes answer 409 with its message. */
export class PickEmPickWindowClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = CLOSED_ERROR_NAME;
  }
}

export const isPickEmPickWindowClosedError = (error: unknown): error is PickEmPickWindowClosedError =>
  error instanceof Error && error.name === CLOSED_ERROR_NAME;

/** The bar's settings, read fresh for a pick; null when the read fails (logged). */
export const readVenueGameSettingsForPick = async (venueId: string): Promise<VenueGameSettings | null> => {
  try {
    return await getVenueGameSettings(venueId);
  } catch (error) {
    console.warn(`[Pick 'Em] pick-window-read-failed venue=${venueId}; picks stay open.`, error);
    return null;
  }
};

/**
 * Refuse (PickEmPickWindowClosedError) when the sport has a window and the game's window instance is
 * not open now. No window, no settings (null) or an unreadable kickoff = allowed here; the kickoff lock
 * is checked separately by the caller and still refuses a game that started.
 */
export const assertPickEmPickWindowOpen = async (params: {
  venueId: string;
  sportSlug: string;
  startsAt: string;
  windows: PickEmPickWindows | null;
  nowMs?: number;
}): Promise<void> => {
  const window = params.windows?.[params.sportSlug as PickEmSportSlug];
  if (!window) return;
  const kickoffMs = Date.parse(params.startsAt);
  if (!Number.isFinite(kickoffMs)) return;
  const timeZone = await getVenueTimezone(params.venueId);
  // The games list's own line, so the refusal never disagrees with it: "Picks open Mon 12:00 AM." while
  // this game's window is ahead, "Picks closed." once it has passed (Phase R's second review).
  const view = pickWindowViewForGame({ window, kickoffMs, nowMs: params.nowMs ?? Date.now(), timeZone });
  if (!view.isOpen) throw new PickEmPickWindowClosedError(`${view.line}.`);
};

/** `assertPickEmPickWindowOpen` with its own settings read, for paths that make no other one. */
export const assertPickEmPickWindowOpenAtVenue = async (params: {
  venueId: string;
  sportSlug: string;
  startsAt: string;
}): Promise<void> => {
  const settings = await readVenueGameSettingsForPick(params.venueId);
  await assertPickEmPickWindowOpen({ ...params, windows: settings?.pickWindows ?? null });
};

/**
 * For a screen that shows one game's lock (the Pick 'Em Prize tiebreaker GET, B2): the game's window
 * view, or null when the sport has none, the settings can't be read (fail open) or the kickoff is unreadable.
 */
export const pickWindowViewAtVenue = async (params: {
  venueId: string;
  sportSlug: string;
  startsAt: string;
}): Promise<PickEmPickWindowView | null> => {
  const settings = await readVenueGameSettingsForPick(params.venueId);
  const window = settings?.pickWindows?.[params.sportSlug as PickEmSportSlug];
  const kickoffMs = Date.parse(params.startsAt);
  if (!window || !Number.isFinite(kickoffMs)) return null;
  const timeZone = await getVenueTimezone(params.venueId);
  return pickWindowViewForGame({ window, kickoffMs, nowMs: Date.now(), timeZone });
};
