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

export function writeSelectedBingoGame(game: CachedBingoGame): void {
  if (typeof window === "undefined" || !game.id || !game.sportKey) return;
  try {
    window.sessionStorage.setItem(
      storageKey(game.sportKey, game.id),
      JSON.stringify({ t: Date.now(), game })
    );
  } catch {
    // Session storage is an opportunistic handoff; failures should not block navigation.
  }
}

export function readSelectedBingoGame(params: {
  sportKey: string;
  gameId: string;
}): CachedBingoGame | null {
  if (typeof window === "undefined" || !params.sportKey || !params.gameId) return null;

  const key = storageKey(params.sportKey, params.gameId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { t?: unknown; game?: unknown };
    const timestamp = Number(parsed.t);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > TTL_MS || !isValidGame(parsed.game)) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    const game = parsed.game;
    if (game.id !== params.gameId || game.sportKey !== params.sportKey) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    const startsAtMs = Date.parse(game.startsAt);
    if (!Number.isFinite(startsAtMs) || startsAtMs <= Date.now()) {
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
