import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUserSportsBingoCards: vi.fn(),
  generateSportsBingoBoard: vi.fn(),
  createSportsBingoCard: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  listUserSportsBingoCards: mocks.listUserSportsBingoCards,
  generateSportsBingoBoard: mocks.generateSportsBingoBoard,
  createSportsBingoCard: mocks.createSportsBingoCard,
}));

import { GET, POST } from "@/app/api/bingo/cards/route";

describe("/api/bingo/cards", () => {
  beforeEach(() => {
    mocks.listUserSportsBingoCards.mockReset();
    mocks.generateSportsBingoBoard.mockReset();
    mocks.createSportsBingoCard.mockReset();
  });

  it("GET returns empty list when userId missing", async () => {
    const response = await GET(new Request("http://localhost/api/bingo/cards"));
    const body = (await response.json()) as { ok: boolean; cards: unknown[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual([]);
    expect(mocks.listUserSportsBingoCards).not.toHaveBeenCalled();
  });

  it("GET returns card list for user", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);

    const response = await GET(new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=true"));
    const body = (await response.json()) as { ok: boolean; cards: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.id).toBe("card-1");
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: true,
    });
  });

  it("POST generate returns board preview", async () => {
    mocks.generateSportsBingoBoard.mockResolvedValue({ game: { id: "game-1" }, squares: [] });

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", gameId: "game-1", sportKey: "basketball_nba" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; board: { game: { id: string } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.board.game.id).toBe("game-1");
    expect(mocks.generateSportsBingoBoard).toHaveBeenCalledWith({
      gameId: "game-1",
      sportKey: "basketball_nba",
    });
  });

  it("POST play returns 400 when payload missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play", userId: "u1", venueId: "venue-1" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("required");
  });

  it("POST play creates card", async () => {
    mocks.createSportsBingoCard.mockResolvedValue({ id: "card-2" });

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "play",
          userId: "u1",
          venueId: "venue-1",
          gameId: "game-1",
          sportKey: "basketball_nba",
          squares: [{ index: 0, key: "moneyline:home", isFree: false }],
        }),
      })
    );

    const body = (await response.json()) as { ok: boolean; card: { id: string } };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.card.id).toBe("card-2");
    expect(mocks.createSportsBingoCard).toHaveBeenCalledWith({
      userId: "u1",
      venueId: "venue-1",
      gameId: "game-1",
      sportKey: "basketball_nba",
      squares: [{ index: 0, key: "moneyline:home", isFree: false }],
    });
  });
});
