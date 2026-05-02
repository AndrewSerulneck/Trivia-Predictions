"use client";

import { getUserId, getVenueId } from "@/lib/storage";
import type { VenueGameKey } from "@/lib/venueGameCards";

const TRIVIA_LIVE_PREVIEW_STORAGE_KEY = "tp:trivia:live-preview:v1";
const TRIVIA_LIVE_PREVIEW_MAX_AGE_MS = 60 * 60 * 1000;

type TriviaLivePreviewSnapshot = {
  updatedAt?: number;
  isRoundStarted?: boolean;
  questionId?: string;
  questionIndex?: number;
  questions?: Array<{ id?: string }>;
  userId?: string;
  venueId?: string;
};

function parseTriviaSnapshot(raw: string | null): TriviaLivePreviewSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TriviaLivePreviewSnapshot;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hasResumableTriviaSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const currentUserId = (getUserId() ?? "").trim();
  const currentVenueId = (getVenueId() ?? "").trim();
  if (!currentUserId || !currentVenueId) {
    return false;
  }

  const localSnapshot = parseTriviaSnapshot(window.localStorage.getItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY));
  const sessionSnapshot = parseTriviaSnapshot(window.sessionStorage.getItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY));
  const snapshot = localSnapshot ?? sessionSnapshot;
  if (!snapshot || !snapshot.isRoundStarted) {
    return false;
  }

  const questionId = String(snapshot.questionId ?? "").trim();
  const updatedAt = Number(snapshot.updatedAt ?? 0);
  const questionIndex = Number(snapshot.questionIndex ?? 0);
  const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  const snapshotUserId = String(snapshot.userId ?? "").trim();
  const snapshotVenueId = String(snapshot.venueId ?? "").trim();
  const ageMs = Date.now() - updatedAt;

  if (!questionId || !Number.isFinite(updatedAt) || !Number.isFinite(questionIndex) || questions.length === 0) {
    return false;
  }
  if (questionIndex < 1 || questionIndex > questions.length) {
    return false;
  }
  if (snapshotUserId !== currentUserId || snapshotVenueId !== currentVenueId) {
    return false;
  }
  if (ageMs < 0 || ageMs > TRIVIA_LIVE_PREVIEW_MAX_AGE_MS) {
    return false;
  }

  return true;
}

async function hasActiveBingoCards(userId: string): Promise<boolean> {
  const response = await fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, { cache: "no-store" });
  const payload = (await response.json()) as {
    ok?: boolean;
    cards?: Array<{ status?: string }>;
  };
  if (!payload?.ok) {
    return false;
  }
  return (payload.cards ?? []).some((card) => card.status === "active");
}

async function hasActivePickEmPicks(userId: string): Promise<boolean> {
  const response = await fetch(`/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=200`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    picks?: Array<{ status?: string }>;
  };
  if (!payload?.ok) {
    return false;
  }
  return (payload.picks ?? []).some((pick) => pick.status === "pending");
}

async function hasActiveFantasyEntries(userId: string): Promise<boolean> {
  const response = await fetch(`/api/fantasy/entries?userId=${encodeURIComponent(userId)}&includeSettled=true&refreshProgress=false&limit=200`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    entries?: Array<{ status?: string }>;
  };
  if (!payload?.ok) {
    return false;
  }
  return (payload.entries ?? []).some((entry) => entry.status === "pending" || entry.status === "live");
}

export async function hasResumableSession(gameKey: VenueGameKey): Promise<boolean> {
  const userId = (getUserId() ?? "").trim();
  if (!userId && gameKey !== "trivia") {
    return false;
  }

  try {
    if (gameKey === "trivia") {
      return hasResumableTriviaSession();
    }
    if (gameKey === "bingo") {
      return hasActiveBingoCards(userId);
    }
    if (gameKey === "pickem") {
      return hasActivePickEmPicks(userId);
    }
    if (gameKey === "fantasy") {
      return hasActiveFantasyEntries(userId);
    }
  } catch {
    return false;
  }

  return false;
}
