import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSportsBingoSquareTemplates: vi.fn(),
  requireCreationGame: vi.fn(),
  availabilityErrorStatus: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  listSportsBingoSquareTemplates: mocks.listSportsBingoSquareTemplates,
}));

vi.mock("@/lib/sportsBingoAvailability", () => ({
  requireSportsBingoCreationGame: mocks.requireCreationGame,
  sportsBingoAvailabilityErrorStatus: mocks.availabilityErrorStatus,
}));

import { GET } from "@/app/api/bingo/squares/route";

describe("/api/bingo/squares", () => {
  beforeEach(() => {
    mocks.listSportsBingoSquareTemplates.mockReset();
    mocks.requireCreationGame.mockReset();
    mocks.requireCreationGame.mockResolvedValue({ id: "game-1" });
    mocks.availabilityErrorStatus.mockReset();
    mocks.availabilityErrorStatus.mockReturnValue(null);
  });

  it("returns 400 when gameId is missing", async () => {
    const response = await GET(new Request("http://localhost/api/bingo/squares?sportKey=basketball_nba"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("gameId");
  });

  it("returns support summary for requested game", async () => {
    mocks.listSportsBingoSquareTemplates.mockResolvedValue({
      game: { id: "game-1", sportKey: "basketball_nba" },
      squares: [
        {
          key: "k1",
          label: "[SUPPORTED] Test",
          bucket: "achievement",
          probability: 0.5,
          supportLevel: "supported",
          resolverKind: "nba_player_stat_at_least",
        },
        {
          key: "k2",
          label: "[POSSIBLE] Test",
          bucket: "achievement",
          probability: 0.2,
          supportLevel: "possible",
          resolverKind: "nba_team_stat_at_least",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/bingo/squares?gameId=game-1&sportKey=basketball_nba&tzOffsetMinutes=240")
    );
    const body = (await response.json()) as {
      ok: boolean;
      supportSummary: { supported: number; possible: number };
      squares: Array<{ key: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.supportSummary).toEqual({ supported: 1, possible: 1 });
    expect(body.squares).toHaveLength(2);
    expect(mocks.listSportsBingoSquareTemplates).toHaveBeenCalledWith({
      gameId: "game-1",
      sportKey: "basketball_nba",
      includePlayerProps: true,
    });
    expect(mocks.requireCreationGame).toHaveBeenCalledWith({
      gameId: "game-1",
      sportKey: "basketball_nba",
      tzOffsetMinutes: "240",
      evaluationTimeMs: expect.any(Number),
    });
  });
});
