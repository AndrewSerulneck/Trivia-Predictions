"use client";

/**
 * Tracks whether a popup ad is currently covering the screen, or is about to.
 *
 * Consumers (today: the Speed Trivia round tally) use this to hold back UI that
 * would otherwise animate underneath an ad the player can't see past. This is
 * deliberately ad-agnostic: it does not care which trigger opened the popup,
 * only that something is in front of the player.
 *
 * `pending` covers the window between "we decided to show a popup" and "the
 * popup is on screen" — a network round trip to /api/ads/slot, plus any
 * round-end popups sitting in the retry queue. Without it, a consumer would
 * release the instant a round ends and get painted over when the ad lands.
 */

type PopupBlockingState = {
  visible: boolean;
  pending: boolean;
  pendingWatchdogId: number | null;
};

type WindowWithPopupBlockingState = Window & {
  __tpPopupBlockingState?: PopupBlockingState;
};

const CHANGE_EVENT = "tp:popup-blocking-change";

/**
 * A pending popup that never resolves must never strand a consumer that is
 * holding UI back. Pending always self-clears, so the worst case is a late
 * ad painting over the tally — never a player stuck on a spinner forever.
 */
const PENDING_WATCHDOG_MS = 8000;

const getWindowState = (): PopupBlockingState => {
  if (typeof window === "undefined") {
    return { visible: false, pending: false, pendingWatchdogId: null };
  }
  const typedWindow = window as WindowWithPopupBlockingState;
  if (!typedWindow.__tpPopupBlockingState) {
    typedWindow.__tpPopupBlockingState = { visible: false, pending: false, pendingWatchdogId: null };
  }
  return typedWindow.__tpPopupBlockingState;
};

const emitChange = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const clearPendingWatchdog = (state: PopupBlockingState): void => {
  if (state.pendingWatchdogId !== null && typeof window !== "undefined") {
    window.clearTimeout(state.pendingWatchdogId);
  }
  state.pendingWatchdogId = null;
};

export const setPopupVisible = (visible: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }
  const state = getWindowState();
  const next = Boolean(visible);
  if (state.visible === next) {
    return;
  }
  state.visible = next;
  emitChange();
};

export const setPopupPending = (pending: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }
  const state = getWindowState();
  const next = Boolean(pending);
  if (state.pending === next) {
    return;
  }
  state.pending = next;
  clearPendingWatchdog(state);
  if (next) {
    state.pendingWatchdogId = window.setTimeout(() => {
      const current = getWindowState();
      current.pendingWatchdogId = null;
      if (!current.pending) {
        return;
      }
      current.pending = false;
      emitChange();
    }, PENDING_WATCHDOG_MS);
  }
  emitChange();
};

/** True while a popup is on screen, or is expected to arrive imminently. */
export const isPopupBlocking = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const state = getWindowState();
  return state.visible || state.pending;
};

/**
 * True only while a popup is actually painted on screen — never true for a
 * mere pending fetch/retry. Consumers that need a bounded worst-case wait
 * (rather than trusting the watchdog above) can use this to distinguish "an
 * ad is genuinely blocking the view" from "we're still waiting to find out."
 * Never force-release UI while this is true; it's fine to force-release
 * while only `pending` is stuck.
 */
export const isPopupVisible = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return getWindowState().visible;
};

export const subscribePopupBlockingChange = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
  };
};
