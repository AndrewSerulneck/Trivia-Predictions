"use client";

import { useEffect, useState } from "react";
import { useIsRunningAsInstalledPwa } from "@/lib/pwa";
import { hasActiveScrollLocks } from "@/lib/scrollLock";

/**
 * Everything the app needs to behave when it is launched from the home screen
 * instead of a browser tab. It is deliberately one headless sentinel in the
 * root layout — the same shape as LoginStuckStateBreaker / ScrollRecoverySentinel
 * / ScrollRescueGuard — rather than several new mechanisms.
 *
 * Two jobs:
 *
 * 1. Marks `<html>` with `tp-standalone` so CSS can pay for the iOS status bar
 *    and home indicator only when the app actually owns those strips. The
 *    `(display-mode: standalone)` media query alone is not enough: iOS only
 *    started reporting it reliably in recent versions, while `navigator.standalone`
 *    (checked by isRunningAsInstalledPwa) has always been accurate there.
 *
 * 2. Restores pull-to-refresh. Standalone has no address bar, no reload button
 *    and no pull-to-refresh, so a wedged page is unrecoverable short of
 *    force-quitting. This re-implements the one gesture players already reach
 *    for, and nothing else: it renders no chrome at rest, and its listeners are
 *    all passive, so it can never interfere with a real scroll or with
 *    ScrollRescueGuard's own capture-phase handling.
 */

type PullState = "idle" | "armed" | "ready";

// Far enough that a lazy flick past the top of a page never shows the hint,
// and the hint itself is on screen well before the reload distance is met.
const PULL_ARM_DISTANCE_PX = 30;
const PULL_RELOAD_DISTANCE_PX = 110;
// Distance alone is not enough of a filter: a fast flick from the top of a long page can
// clear 110px in a couple of frames without the player ever intending to reload, and a
// reload throws away whatever unsaved game state the page was holding. Requiring the pull
// to be *held* makes it a deliberate gesture — a flick is over long before this elapses,
// while the real gesture (pull, look at the hint, release) always outlasts it.
const PULL_HOLD_MS = 350;

function isSurfaceLocked(): boolean {
  const root = document.documentElement;
  const body = document.body;
  // The Bingo landscape board owns the whole display and holds the document
  // scroll lock with `!important` (see docs/bingo-fullscreen-pwa-phase0-findings.md).
  if (root.classList.contains("tp-bingo-landscape-active")) {
    return true;
  }
  if (hasActiveScrollLocks() || document.querySelector("[data-tp-scroll-lock='active']")) {
    return true;
  }
  // Mirrors ScrollRescueGuard's rootLooksScrollLocked: any surface that has
  // taken the document scroll (Category Blitz gameplay, admin, an open modal)
  // is driving its own touch behaviour and must not be second-guessed.
  const rootStyle = window.getComputedStyle(root);
  const bodyStyle = window.getComputedStyle(body);
  return (
    rootStyle.overflowY === "hidden" ||
    bodyStyle.overflowY === "hidden" ||
    bodyStyle.position === "fixed"
  );
}

// A focused field means the player is mid-entry — a PIN, a username, a write-in trivia
// answer — and on iOS it also means an open keyboard whose dismissal drag starts at the
// top of the page and travels straight down, i.e. exactly the shape of this gesture.
// Reloading there would discard what they typed.
function hasEditableFocus(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return false;
  }
  if (active.isContentEditable) {
    return true;
  }
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
}

function hasScrolledAncestor(target: EventTarget | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    if (node.scrollTop > 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function StandalonePwaRuntime() {
  const isStandalone = useIsRunningAsInstalledPwa();
  const [pullState, setPullState] = useState<PullState>("idle");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tp-standalone", isStandalone);
    return () => {
      root.classList.remove("tp-standalone");
    };
  }, [isStandalone]);

  useEffect(() => {
    if (!isStandalone) {
      return;
    }

    let startY = 0;
    let startX = 0;
    let startedAt = 0;
    let lastDeltaY = 0;
    let holdTimer: number | null = null;
    let tracking = false;
    let state: PullState = "idle";

    const clearHoldTimer = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const applyState = (next: PullState) => {
      if (next === state) {
        return;
      }
      state = next;
      setPullState(next);
    };

    const reset = () => {
      tracking = false;
      lastDeltaY = 0;
      clearHoldTimer();
      applyState("idle");
    };

    const handleTouchStart = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      if (
        window.scrollY > 0 ||
        isSurfaceLocked() ||
        hasEditableFocus() ||
        hasScrolledAncestor(event.target)
      ) {
        return;
      }
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
      startedAt = Date.now();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking) {
        return;
      }
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        reset();
        return;
      }

      const deltaY = touch.clientY - startY;
      const deltaX = Math.abs(touch.clientX - startX);
      // A horizontal swipe (carousel, tab strip) is not a refresh, and neither
      // is an upward drag — either one ends the gesture for this touch.
      if (deltaY < 0 || deltaX > Math.abs(deltaY)) {
        reset();
        return;
      }
      // The page started scrolling under the finger, so this was an ordinary
      // scroll that happened to begin at the top.
      if (window.scrollY > 0) {
        reset();
        return;
      }

      lastDeltaY = deltaY;

      if (deltaY < PULL_ARM_DISTANCE_PX) {
        clearHoldTimer();
        applyState("idle");
        return;
      }
      if (deltaY < PULL_RELOAD_DISTANCE_PX) {
        clearHoldTimer();
        applyState("armed");
        return;
      }

      // Far enough — now it also has to have taken long enough. `touchmove` stops
      // firing once the finger holds still, so the promotion to "ready" is armed on a
      // timer rather than waiting for another move event that may never come.
      const remainingHoldMs = PULL_HOLD_MS - (Date.now() - startedAt);
      if (remainingHoldMs <= 0) {
        clearHoldTimer();
        applyState("ready");
        return;
      }
      applyState("armed");
      if (holdTimer === null) {
        holdTimer = window.setTimeout(() => {
          holdTimer = null;
          if (tracking && lastDeltaY >= PULL_RELOAD_DISTANCE_PX) {
            applyState("ready");
          }
        }, remainingHoldMs);
      }
    };

    const handleTouchEnd = () => {
      const shouldReload = tracking && state === "ready";
      reset();
      if (shouldReload) {
        window.location.reload();
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", reset);
      reset();
    };
  }, [isStandalone]);

  if (pullState === "idle") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0px)] z-[2000] flex justify-center px-4 pt-2"
    >
      <span
        className={`rounded-full border px-4 py-1.5 text-xs font-semibold shadow-lg backdrop-blur transition-colors ${
          pullState === "ready"
            ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
            : "border-white/15 bg-slate-950/80 text-slate-300"
        }`}
      >
        {pullState === "ready" ? "Release to reload" : "Keep pulling to reload"}
      </span>
    </div>
  );
}
