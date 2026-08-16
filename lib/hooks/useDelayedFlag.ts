"use client";

import { useEffect, useState } from "react";

/**
 * Returns `active`, but only after it has stayed true continuously for
 * `delayMs`. Resets the instant `active` goes false again.
 *
 * For suppressing loading affordances that would otherwise flash. A spinner
 * shown for 300ms doesn't read as "loading" — it reads as a glitch — and once
 * a wait is short enough, the honest thing is to show nothing at all rather
 * than to blink an apology at the player.
 */
export const useDelayedFlag = (active: boolean, delayMs: number): boolean => {
  const [elapsed, setElapsed] = useState(false);
  const [lastActive, setLastActive] = useState(active);

  // Reset during render rather than from an effect (React's documented
  // "adjusting state when a prop changes" pattern). Resetting in the effect
  // instead would set state synchronously in the effect body, which triggers a
  // cascading re-render — and would briefly leak a stale `true` into the frame
  // between `active` going false and the effect running.
  if (lastActive !== active) {
    setLastActive(active);
    setElapsed(false);
  }

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return active && elapsed;
};
