"use client";

import { useSyncExternalStore } from "react";

// framer-motion's useReducedMotion() already reads the real preference on the client's first render, but the server
// always renders "no preference". Gating MARKUP on it (`{!reduceMotion && <el/>}`) therefore makes the hydrating
// render differ from the server HTML → React error #418 on every reduced-motion TV. This hook reports `false` while
// hydrating (matching the server) and the real preference right after, so an element can drop out on the next render.
// Use it only to decide whether an element exists; keep framer's hook for animation values.

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSnapshot = () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

const getServerSnapshot = () => false;

export const useReducedMotionAfterHydration = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
