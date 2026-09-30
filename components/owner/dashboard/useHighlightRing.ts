"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Class for a freshly saved row: a cyan ring that fades back out when `highlighted` clears. */
export const highlightRingClass = (highlighted: boolean): string =>
  highlighted ? "ring-2 ring-ht-cyan-300" : "ring-2 ring-transparent";

/** Ref for a list row: scrolls it into view once when it becomes the highlighted one. */
export const useScrollWhenHighlighted = <T extends HTMLElement>(highlighted: boolean): RefObject<T | null> => {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!highlighted || !ref.current) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    ref.current.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [highlighted]);
  return ref;
};

/** How long the ring stays on (plan §4d). */
export const HIGHLIGHT_MS = 2000;
