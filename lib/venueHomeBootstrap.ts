import type { VenueGameKey } from "@/lib/venueGameCards";
import type { LeaderboardEntry } from "@/types";

export type TriviaQuotaSnapshot = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass?: boolean;
};

export type HomeBadgeCounts = Partial<Record<VenueGameKey, number>>;

export type VenueHomeBootstrapSnapshot = {
  fetchedAt: number;
  venueId: string;
  userId: string;
  triviaQuota: TriviaQuotaSnapshot | null;
  homeBadgeCounts: HomeBadgeCounts;
  weeklyPrizeTitle: string;
  weeklyPrizeDescription: string;
  weeklyPrizePoints: number;
  leaderboardEntries: LeaderboardEntry[];
};

const BOOTSTRAP_TTL_MS = 2 * 60 * 1000;
const ENTRY_HANDOFF_KEY = "tp:venue-home-entry-handoff";

function bootstrapKey(venueId: string, userId: string): string {
  return `tp:venue-home-bootstrap:${venueId}:${userId}`;
}

function readSessionStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}

function removeSessionStorage(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

type VenueHomeEntryHandoff = {
  venueId: string;
  userId: string;
  createdAt: number;
};

export function writeVenueHomeBootstrap(snapshot: VenueHomeBootstrapSnapshot): void {
  if (!snapshot.venueId || !snapshot.userId) {
    return;
  }
  writeSessionStorage(bootstrapKey(snapshot.venueId, snapshot.userId), snapshot);
}

export function readVenueHomeBootstrap(params: {
  venueId: string;
  userId: string;
}): VenueHomeBootstrapSnapshot | null {
  if (!params.venueId || !params.userId) {
    return null;
  }
  const key = bootstrapKey(params.venueId, params.userId);
  const snapshot = readSessionStorage<VenueHomeBootstrapSnapshot>(key);
  if (!snapshot) {
    return null;
  }
  if (Date.now() - snapshot.fetchedAt > BOOTSTRAP_TTL_MS) {
    removeSessionStorage(key);
    return null;
  }
  return snapshot;
}

export function consumeVenueHomeBootstrap(params: {
  venueId: string;
  userId: string;
}): VenueHomeBootstrapSnapshot | null {
  const key = bootstrapKey(params.venueId, params.userId);
  const snapshot = readVenueHomeBootstrap(params);
  removeSessionStorage(key);
  return snapshot;
}

export function setVenueHomeEntryHandoff(params: { venueId: string; userId: string }): void {
  const venueId = params.venueId.trim();
  const userId = params.userId.trim();
  if (!venueId || !userId) {
    return;
  }
  const handoff: VenueHomeEntryHandoff = {
    venueId,
    userId,
    createdAt: Date.now(),
  };
  writeSessionStorage(ENTRY_HANDOFF_KEY, handoff);
}

export function consumeVenueHomeEntryHandoff(params: {
  venueId: string;
  userId: string;
  maxAgeMs?: number;
}): boolean {
  const venueId = params.venueId.trim();
  const userId = params.userId.trim();
  if (!venueId || !userId) {
    return false;
  }

  const handoff = readSessionStorage<VenueHomeEntryHandoff>(ENTRY_HANDOFF_KEY);
  removeSessionStorage(ENTRY_HANDOFF_KEY);

  if (!handoff) {
    return false;
  }

  const maxAgeMs = Math.max(500, Math.floor(params.maxAgeMs ?? 15000));
  if (Date.now() - handoff.createdAt > maxAgeMs) {
    return false;
  }
  return handoff.venueId === venueId && handoff.userId === userId;
}
