const TTL_MS = 2 * 60 * 1000;
const KEY_PREFIX = "tp:bingo-selected-game:v1:";

export type CachedBingoGame = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  gameLabel: string;
  isLocked: boolean;
};

function storageKey(sportKey: string, gameId: string): string {
  return `${KEY_PREFIX}${sportKey}:${gameId}`;
}

const localDateKey = (nowMs: number, tzOffsetMinutes: number): string => {
  const local = new Date(nowMs - tzOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
    local.getUTCDate()
  ).padStart(2, "0")}`;
};

function isValidGame(value: unknown): value is CachedBingoGame {
  if (!value || typeof value !== "object") {
    return false;
  }
  const game = value as Partial<CachedBingoGame>;
  return (
    typeof game.id === "string" &&
    typeof game.sportKey === "string" &&
    typeof game.homeTeam === "string" &&
    typeof game.awayTeam === "string" &&
    typeof game.startsAt === "string" &&
    typeof game.gameLabel === "string"
  );
}

export function writeSelectedBingoGame(
  game: CachedBingoGame,
  tzOffsetMinutes = new Date().getTimezoneOffset()
): void {
  if (typeof window === "undefined" || !game.id || !game.sportKey) return;
  try {
    const now = Date.now();
    window.sessionStorage.setItem(
      storageKey(game.sportKey, game.id),
      JSON.stringify({ t: now, localDate: localDateKey(now, tzOffsetMinutes), tzOffsetMinutes, game })
    );
  } catch {
    // Session storage is an opportunistic handoff; failures should not block navigation.
  }
}

export function readSelectedBingoGame(params: {
  sportKey: string;
  gameId: string;
  tzOffsetMinutes?: number;
}): CachedBingoGame | null {
  if (typeof window === "undefined" || !params.sportKey || !params.gameId) return null;

  const key = storageKey(params.sportKey, params.gameId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      t?: unknown;
      localDate?: unknown;
      tzOffsetMinutes?: unknown;
      game?: unknown;
    };
    const timestamp = Number(parsed.t);
    const tzOffsetMinutes = params.tzOffsetMinutes ?? new Date().getTimezoneOffset();
    const now = Date.now();
    if (
      !Number.isFinite(timestamp) ||
      now - timestamp > TTL_MS ||
      parsed.tzOffsetMinutes !== tzOffsetMinutes ||
      parsed.localDate !== localDateKey(now, tzOffsetMinutes) ||
      !isValidGame(parsed.game)
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    const game = parsed.game;
    if (game.id !== params.gameId || game.sportKey !== params.sportKey) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    const startsAtMs = Date.parse(game.startsAt);
    if (
      !Number.isFinite(startsAtMs) ||
      startsAtMs <= now ||
      localDateKey(startsAtMs, tzOffsetMinutes) !== localDateKey(now, tzOffsetMinutes)
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return {
      ...game,
      isLocked: false,
    };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearSelectedBingoGame(params: { sportKey: string; gameId: string }): void {
  if (typeof window === "undefined" || !params.sportKey || !params.gameId) return;
  try {
    window.sessionStorage.removeItem(storageKey(params.sportKey, params.gameId));
  } catch {
    // Session storage is opportunistic; there is nothing else to clear.
  }
}
