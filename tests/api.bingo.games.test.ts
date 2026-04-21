import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSportsBingoGames: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  listSportsBingoGames: mocks.listSportsBingoGames,
}));

import { GET } from "@/app/api/bingo/games/route";

describe("GET /api/bingo/games", () => {
  beforeEach(() => {
    mocks.listSportsBingoGames.mockReset();
  });

  it("returns NBA game list", async () => {
    mocks.listSportsBingoGames.mockResolvedValue([
      {
        id: "game-1",
        sportKey: "basketball_nba",
        homeTeam: "Boston Celtics",
        awayTeam: "New York Knicks",
        startsAt: "2026-04-20T23:30:00.000Z",
        gameLabel: "New York Knicks vs. Boston Celtics",
        isLocked: false,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/bingo/games?sportKey=basketball_nba"));
    const body = (await response.json()) as { ok: boolean; games: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.games).toHaveLength(1);
    expect(mocks.listSportsBingoGames).toHaveBeenCalledWith({
      sportKey: "basketball_nba",
      includeLocked: true,
    });
  });

  it("returns 500 on upstream error", async () => {
    mocks.listSportsBingoGames.mockRejectedValue(new Error("ODDS_API_KEY is not configured."));

    const response = await GET(new Request("http://localhost/api/bingo/games"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("ODDS_API_KEY");
  });
});
