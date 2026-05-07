"use client";

const COUNTER_PREFIX = "tp:ad-counter:v1:";

/**
 * Read the current page-load counter for a given slot key from localStorage.
 * Returns 0 when localStorage is unavailable or the key doesn't exist yet.
 */
export function readAdCounter(slotKey: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const raw = window.localStorage.getItem(`${COUNTER_PREFIX}${slotKey}`);
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the counter for the given slot key and return the NEW value.
 * The counter persists across sessions so "every 3rd person" works globally for that user.
 */
export function incrementAdCounter(slotKey: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const next = readAdCounter(slotKey) + 1;
    window.localStorage.setItem(`${COUNTER_PREFIX}${slotKey}`, String(next));
    return next;
  } catch {
    return 1;
  }
}
