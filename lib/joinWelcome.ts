const WELCOME_SEEN_KEY = "tp_welcome_seen";
const WELCOME_REPROMPT_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function shouldShowJoinWelcome(now = Date.now()): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(WELCOME_SEEN_KEY);
    if (!raw) return true;
    const ts = Number.parseInt(raw, 10);
    return Number.isNaN(ts) || now - ts >= WELCOME_REPROMPT_MS;
  } catch {
    return true;
  }
}

export function markJoinWelcomeSeen(now = Date.now()): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, String(now));
  } catch {
    // Ignore browser storage failures.
  }
}

export function getJoinWelcomeStorageKey(): string {
  return WELCOME_SEEN_KEY;
}

