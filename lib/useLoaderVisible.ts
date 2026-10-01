"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Show-delay / minimum-visible timing for `HightopLoader`
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 3).
 *
 * Two problems, one hook:
 *  - a load that finishes in 80 ms must never flash a loader (`delayMs`);
 *  - a loader that *did* appear must stay long enough for its entrance to read,
 *    instead of blinking on and off (`minVisibleMs`).
 *
 * `HightopLoader` uses it internally for the delay (it is mounted only while its
 * caller is loading, so `loading` is `true` for its whole life). A caller that
 * needs the minimum-visible half too — the Partner Dashboard, which waits for
 * three answers before revealing the page (Phase 4) — drives it directly:
 *
 *   const showLoader = useLoaderVisible(!loaded);
 *   if (showLoader) return <HightopLoader delayMs={0} variant="fullScreen" />;
 *
 * Pass `delayMs={0}` to the component in that case, or the delay is paid twice.
 */
export const LOADER_DELAY_MS = 200;
export const LOADER_MIN_VISIBLE_MS = 500;

interface LoaderVisibleOptions {
  /** Wait this long before showing anything. Default 200 ms. */
  delayMs?: number;
  /** Once shown, stay visible at least this long. Default 500 ms. */
  minVisibleMs?: number;
}

export const useLoaderVisible = (loading: boolean, options: LoaderVisibleOptions = {}): boolean => {
  const { delayMs = LOADER_DELAY_MS, minVisibleMs = LOADER_MIN_VISIBLE_MS } = options;
  const [visible, setVisible] = useState(() => loading && delayMs <= 0);
  // Stamped in the effect, never during render (`Date.now()` is impure).
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      if (visible) {
        if (shownAtRef.current === null) shownAtRef.current = Date.now();
        return;
      }
      // Always through a timer, even at delayMs 0: a synchronous setState in an
      // effect cascades a render (the 0-delay first render is covered by useState).
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(timer);
    }

    if (!visible) return;

    const shownAt = shownAtRef.current ?? Date.now();
    const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAt));
    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading, visible, delayMs, minVisibleMs]);

  return visible;
};
