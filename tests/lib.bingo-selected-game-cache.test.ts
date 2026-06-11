import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSelectedBingoGame, writeSelectedBingoGame, type CachedBingoGame } from "@/lib/bingoSelectedGameCache";

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function installWindowStub() {
  Object.defineProperty(globalThis, "window", {
    value: {
      sessionStorage: new MemoryStorage(),
    },
    configurable: true,
  });
}

function makeGame(overrides: Partial<CachedBingoGame> = {}): CachedBingoGame {
  return {
    id: "game-1",
    sportKey: "basketball_nba",
    homeTeam: "New York Knicks",
    awayTeam: "Boston Celtics",
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    gameLabel: "Boston Celtics at New York Knicks",
    isLocked: false,
    ...overrides,
  };
}

describe("bingo selected game cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T18:00:00.000Z"));
    installWindowStub();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("returns a matching selected game handoff", () => {
    const game = makeGame();
    writeSelectedBingoGame(game);

    expect(readSelectedBingoGame({ sportKey: "basketball_nba", gameId: "game-1" })).toEqual(game);
  });

  it("ignores expired selected game handoffs", () => {
    writeSelectedBingoGame(makeGame());

    vi.advanceTimersByTime(2 * 60 * 1000 + 1);

    expect(readSelectedBingoGame({ sportKey: "basketball_nba", gameId: "game-1" })).toBeNull();
  });

  it("ignores handoffs for games that have already locked", () => {
    writeSelectedBingoGame(makeGame({ startsAt: new Date(Date.now() - 1000).toISOString() }));

    expect(readSelectedBingoGame({ sportKey: "basketball_nba", gameId: "game-1" })).toBeNull();
  });

  it("ignores mismatched selected game handoffs", () => {
    writeSelectedBingoGame(makeGame());

    expect(readSelectedBingoGame({ sportKey: "basketball_nba", gameId: "game-2" })).toBeNull();
  });
});
