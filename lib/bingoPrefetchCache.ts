const TTL_MS = 5 * 60 * 1000;
const KEY_PREFIX = "tp:bingo-cards-prefetch:";

export function writeBingoPrefetchCache(userId: string, cards: unknown[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.sessionStorage.setItem(
      `${KEY_PREFIX}${userId}`,
      JSON.stringify({ t: Date.now(), cards })
    );
  } catch {
    // ignore storage errors
  }
}

export function consumeBingoPrefetchCache(userId: string): unknown[] | null {
  if (typeof window === "undefined" || !userId) return null;
  const key = `${KEY_PREFIX}${userId}`;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as { t: number; cards: unknown[] };
    if (Date.now() - parsed.t > TTL_MS) return null;
    return Array.isArray(parsed.cards) ? parsed.cards : null;
  } catch {
    return null;
  }
}
