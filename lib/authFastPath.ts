"use client";

import { clearClientState } from "@/lib/storage";

const LOGIN_IN_PROGRESS_KEY = "tp:is-logging-in:v1";
const VENUE_LOCK_KEY = "tp:login-selected-venue:v1";

type LoginProgressSnapshot = {
  startedAt: number;
  venueId: string;
};

let activeLoginController: AbortController | null = null;

export function abortActiveAuthRequests(): void {
  if (activeLoginController) {
    activeLoginController.abort();
    activeLoginController = null;
  }
}

export function beginAuthRequest(): AbortController {
  abortActiveAuthRequests();
  activeLoginController = new AbortController();
  return activeLoginController;
}

export function endAuthRequest(controller?: AbortController | null): void {
  if (!controller) {
    return;
  }
  if (activeLoginController === controller) {
    activeLoginController = null;
  }
}

export function hardClearAuthAndCache(): void {
  abortActiveAuthRequests();
  clearClientState();
}

export function setSelectedVenueLock(venueId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const safeVenueId = venueId.trim();
  if (!safeVenueId) {
    return;
  }
  try {
    window.sessionStorage.setItem(VENUE_LOCK_KEY, safeVenueId);
  } catch {
    // Ignore storage failures.
  }
}

export function getSelectedVenueLock(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return (window.sessionStorage.getItem(VENUE_LOCK_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function clearSelectedVenueLock(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(VENUE_LOCK_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function hardClearAuthAndCachePreserveVenue(venueId: string): void {
  const safeVenueId = venueId.trim();
  hardClearAuthAndCache();
  if (!safeVenueId) {
    return;
  }
  setSelectedVenueLock(safeVenueId);
}

export function setLoginInProgress(venueId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: LoginProgressSnapshot = {
    startedAt: Date.now(),
    venueId: venueId.trim(),
  };
  try {
    window.sessionStorage.setItem(LOGIN_IN_PROGRESS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

export function clearLoginInProgress(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function readLoginInProgress(): LoginProgressSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LOGIN_IN_PROGRESS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LoginProgressSnapshot;
    const startedAt = Number(parsed.startedAt);
    const venueId = String(parsed.venueId ?? "").trim();
    if (!Number.isFinite(startedAt) || !venueId) {
      return null;
    }
    return {
      startedAt,
      venueId,
    };
  } catch {
    return null;
  }
}
