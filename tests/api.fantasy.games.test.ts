import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFantasyGames: vi.fn(),
  getFantasyPlayerPoolForDate: vi.fn(),
  getFantasyPlayerPoolForGame: vi.fn(),
  listFantasyLeaderboard: vi.fn(),
}));

vi.mock("@/lib/fantasy", () => ({
  listFantasyGames: mocks.listFantasyGames,
  getFantasyPlayerPoolForDate: mocks.getFantasyPlayerPoolForDate,
  getFantasyPlayerPoolForGame: mocks.getFantasyPlayerPoolForGame,
  listFantasyLeaderboard: mocks.listFantasyLeaderboard,
}));

import { GET } from "@/app/api/fantasy/games/route";

describe("/api/fantasy/games", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T16:00:00.000Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.listFantasyGames.mockReset();
    mocks.getFantasyPlayerPoolForDate.mockReset();
    mocks.getFantasyPlayerPoolForGame.mockReset();
    mocks.listFantasyLeaderboard.mockReset();

    mocks.listFantasyGames.mockResolvedValue([]);
    mocks.getFantasyPlayerPoolForDate.mockResolvedValue([]);
    mocks.getFantasyPlayerPoolForGame.mockResolvedValue([]);
    mocks.listFantasyLeaderboard.mockResolvedValue([]);
  });

  it("parses valid MLB daily game ids and uses the embedded YYYY-MM-DD date", async () => {
    const response = await GET(
      new Request("http://localhost/api/fantasy/games?gameId=mlb-daily-2026-05-27&tzOffsetMinutes=0")
    );

    expect(response.status).toBe(200);
    expect(mocks.getFantasyPlayerPoolForGame).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "mlb-daily-2026-05-27",
        date: "2026-05-27",
      })
    );
  });

  it("rejects malformed MLB daily game id dates and falls back to requested date", async () => {
    const response = await GET(
      new Request("http://localhost/api/fantasy/games?gameId=mlb-daily-2026-5-27&date=2026-05-25&tzOffsetMinutes=0")
    );

    expect(response.status).toBe(200);
    expect(mocks.getFantasyPlayerPoolForGame).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "mlb-daily-2026-5-27",
        date: "2026-05-25",
      })
    );
  });

  it("uses WNBA daily id for leaderboard fallback when sportKey is WNBA", async () => {
    const response = await GET(
      new Request("http://localhost/api/fantasy/games?venueId=v1&sportKey=basketball_wnba&tzOffsetMinutes=0")
    );

    expect(response.status).toBe(200);
    expect(mocks.listFantasyLeaderboard).toHaveBeenCalledWith({
      venueId: "v1",
      gameId: "wnba-daily-2026-05-27",
      limit: 30,
    });
  });

  it("uses MLB daily id for leaderboard fallback when sportKey is MLB", async () => {
    const response = await GET(
      new Request("http://localhost/api/fantasy/games?venueId=v1&sportKey=baseball_mlb&tzOffsetMinutes=0")
    );

    expect(response.status).toBe(200);
    expect(mocks.listFantasyLeaderboard).toHaveBeenCalledWith({
      venueId: "v1",
      gameId: "mlb-daily-2026-05-27",
      limit: 30,
    });
  });
});
