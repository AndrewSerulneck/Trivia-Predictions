"use client";

const JOIN_PAGE_ENTRY_INTENT_KEY = "tp:join-page-entry-intent:v1";
const JOIN_PAGE_ENTRY_INTENT_TTL_MS = 10_000;

export type JoinPageEntryIntent = {
  source: "leave-venue";
  createdAt: number;
};

function readRawJoinPageEntryIntent(): JoinPageEntryIntent | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(JOIN_PAGE_ENTRY_INTENT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<JoinPageEntryIntent>;
    const source = parsed.source === "leave-venue" ? parsed.source : null;
    const createdAt = Number(parsed.createdAt ?? 0);
    if (!source || !Number.isFinite(createdAt) || createdAt <= 0) {
      return null;
    }
    return { source, createdAt };
  } catch {
    return null;
  }
}

export function setJoinPageEntryIntent(source: JoinPageEntryIntent["source"]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload: JoinPageEntryIntent = {
      source,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(JOIN_PAGE_ENTRY_INTENT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures on privacy-restricted browsers.
  }
}

export function clearJoinPageEntryIntent(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(JOIN_PAGE_ENTRY_INTENT_KEY);
  } catch {
    // Ignore storage failures on privacy-restricted browsers.
  }
}

export function readFreshJoinPageEntryIntent(
  maxAgeMs = JOIN_PAGE_ENTRY_INTENT_TTL_MS
): JoinPageEntryIntent | null {
  const intent = readRawJoinPageEntryIntent();
  if (!intent) {
    return null;
  }
  if (Date.now() - intent.createdAt > Math.max(1_000, Math.floor(maxAgeMs))) {
    clearJoinPageEntryIntent();
    return null;
  }
  return intent;
}
