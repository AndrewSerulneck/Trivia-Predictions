import type { Prediction, TriviaQuestion } from "@/types";

type TriviaQuotaSnapshot = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass?: boolean;
};

type WarmTriviaSnapshot = {
  fetchedAt: number;
  userId: string;
  venueId: string;
  questions: TriviaQuestion[];
  quota?: TriviaQuotaSnapshot | null;
};

type WarmPredictionsSnapshot = {
  fetchedAt: number;
  venueId: string;
  payload: {
    items?: Prediction[];
    page?: number;
    pageSize?: number;
    totalItems?: number;
    totalPages?: number;
    sports?: string[];
    leaguesBySport?: Record<string, string[]>;
  };
};

const TRIVIA_CACHE_TTL_MS = 5 * 60 * 1000;
const PREDICTIONS_CACHE_TTL_MS = 3 * 60 * 1000;

function readSessionStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore session storage failures.
  }
}

function triviaCacheKey(userId: string, venueId: string): string {
  return `tp:warm:trivia:${venueId}:${userId}`;
}

function predictionsCacheKey(venueId: string): string {
  return `tp:warm:predictions:${venueId}`;
}

export function writeWarmTriviaCache(input: {
  userId: string;
  venueId: string;
  questions: TriviaQuestion[];
  quota?: TriviaQuotaSnapshot | null;
}): void {
  if (!input.userId || !input.venueId || input.questions.length === 0) return;
  const snapshot: WarmTriviaSnapshot = {
    fetchedAt: Date.now(),
    userId: input.userId,
    venueId: input.venueId,
    questions: input.questions,
    quota: input.quota ?? null,
  };
  writeSessionStorage(triviaCacheKey(input.userId, input.venueId), snapshot);
}

export function readWarmTriviaCache(userId: string, venueId: string): WarmTriviaSnapshot | null {
  if (!userId || !venueId) return null;
  const snapshot = readSessionStorage<WarmTriviaSnapshot>(triviaCacheKey(userId, venueId));
  if (!snapshot) return null;
  if (Date.now() - snapshot.fetchedAt > TRIVIA_CACHE_TTL_MS) return null;
  return snapshot;
}

export function writeWarmPredictionsCache(input: {
  venueId: string;
  payload: WarmPredictionsSnapshot["payload"];
}): void {
  if (!input.venueId || !input.payload.items || input.payload.items.length === 0) return;
  const snapshot: WarmPredictionsSnapshot = {
    fetchedAt: Date.now(),
    venueId: input.venueId,
    payload: input.payload,
  };
  writeSessionStorage(predictionsCacheKey(input.venueId), snapshot);
}

export function readWarmPredictionsCache(venueId: string): WarmPredictionsSnapshot | null {
  if (!venueId) return null;
  const snapshot = readSessionStorage<WarmPredictionsSnapshot>(predictionsCacheKey(venueId));
  if (!snapshot) return null;
  if (Date.now() - snapshot.fetchedAt > PREDICTIONS_CACHE_TTL_MS) return null;
  return snapshot;
}
