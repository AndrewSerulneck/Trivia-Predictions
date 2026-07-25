import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isPopupBlocking,
  isPopupVisible,
  setPopupPending,
  setPopupVisible,
  subscribePopupBlockingChange,
} from "@/components/ui/popupBlocking";

// The module is browser-only and stores its state on `window`, so the node
// test environment needs a minimal stand-in. Timers delegate to globalThis at
// call time so vitest's fake timers still apply.
const createWindowStub = () => {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
  };
};

const globalWithWindow = globalThis as unknown as { window?: unknown };

beforeEach(() => {
  globalWithWindow.window = createWindowStub();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalWithWindow.window;
});

describe("popup blocking state", () => {
  it("is not blocking when no popup is visible or pending", () => {
    expect(isPopupBlocking()).toBe(false);
  });

  it("blocks while a popup is visible and clears when it goes away", () => {
    setPopupVisible(true);
    expect(isPopupBlocking()).toBe(true);

    setPopupVisible(false);
    expect(isPopupBlocking()).toBe(false);
  });

  it("blocks while a popup is merely pending, before anything is painted", () => {
    // This is the window between deciding to show an ad and the ad landing.
    // Without it the tally would release into the gap and get painted over.
    setPopupPending(true);
    expect(isPopupBlocking()).toBe(true);

    setPopupPending(false);
    expect(isPopupBlocking()).toBe(false);
  });

  it("keeps blocking when a visible popup closes but a retry is still queued", () => {
    // The Leak A hand-off: an on-scroll popup is dismissed while a round-end
    // ad sits in the retry queue. Releasing here would let the tally start
    // moments before the queued ad opens on top of it.
    setPopupVisible(true);
    setPopupPending(true);

    setPopupVisible(false);
    expect(isPopupBlocking()).toBe(true);

    setPopupPending(false);
    expect(isPopupBlocking()).toBe(false);
  });

  it("notifies subscribers on transitions and ignores redundant sets", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePopupBlockingChange(listener);

    setPopupVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setPopupVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setPopupVisible(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setPopupVisible(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("self-clears a pending popup that never resolves, so consumers cannot strand", () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    subscribePopupBlockingChange(listener);

    setPopupPending(true);
    expect(isPopupBlocking()).toBe(true);

    vi.advanceTimersByTime(8000);

    expect(isPopupBlocking()).toBe(false);
    // The consumer must be told, not just left to poll.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not fire a stale watchdog after pending resolves normally", () => {
    vi.useFakeTimers();

    setPopupPending(true);
    setPopupPending(false);
    setPopupVisible(true);

    vi.advanceTimersByTime(8000);

    // The visible popup must survive the earlier pending's watchdog window.
    expect(isPopupBlocking()).toBe(true);
  });

  it("stays blocking across the opening-to-visible handoff, with no false tick", () => {
    // Mirrors PopupAds' actual call sequence after the fix: syncPopupPending
    // ORs in popupOpenRef, so pending stays true from "decided to open"
    // through "ad is on screen," and only clears once closePopup explicitly
    // recomputes it — never in the gap before the visible-effect commits.
    setPopupPending(true); // showPopup sets popupOpeningRef, syncs pending
    expect(isPopupBlocking()).toBe(true);

    // showPopup's `finally` re-syncs pending: popupOpeningRef is now false,
    // but popupOpenRef is true (the ad opened), so pending stays true.
    setPopupPending(true);
    expect(isPopupBlocking()).toBe(true);

    // The visible-effect commits after React's next render.
    setPopupVisible(true);
    expect(isPopupBlocking()).toBe(true);

    // closePopup clears popupOpenRef and re-syncs pending synchronously,
    // before the visible-effect has a chance to flip visible to false.
    setPopupPending(false);
    expect(isPopupBlocking()).toBe(true); // still visible

    setPopupVisible(false);
    expect(isPopupBlocking()).toBe(false);
  });

  it("isPopupVisible is true only when actually painted, never for a mere pending fetch", () => {
    // This is the distinction TriviaGame's hard-stop timer relies on: it may
    // force through a stuck `pending`, but must never override a real ad.
    setPopupPending(true);
    expect(isPopupBlocking()).toBe(true);
    expect(isPopupVisible()).toBe(false);

    setPopupPending(false);
    setPopupVisible(true);
    expect(isPopupVisible()).toBe(true);

    setPopupVisible(false);
    expect(isPopupVisible()).toBe(false);
  });
});
