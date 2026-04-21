import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUserPredictions: vi.fn(),
  getPredictionMarketById: vi.fn(),
}));

vi.mock("@/lib/userPredictions", () => ({
  listUserPredictions: mocks.listUserPredictions,
}));

vi.mock("@/lib/polymarket", () => ({
  getPredictionMarketById: mocks.getPredictionMarketById,
}));

import { GET } from "@/app/api/picks/route";

describe("/api/picks", () => {
  beforeEach(() => {
    mocks.listUserPredictions.mockReset();
    mocks.getPredictionMarketById.mockReset();
  });

  it("uses stored market snapshot when includeMarkets=true", async () => {
    mocks.listUserPredictions.mockResolvedValue({
      totalItems: 1,
      items: [
        {
          id: "pick-1",
          userId: "u1",
          predictionId: "m1",
          outcomeId: "m1-0",
          outcomeTitle: "Yes",
          points: 10,
          status: "pending",
          marketQuestion: "Will Team A win?",
          marketClosesAt: "2026-04-20T12:00:00.000Z",
          marketSport: "Football",
          marketLeague: "NFL",
          createdAt: "2026-04-20T11:00:00.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/picks?userId=u1&status=pending&page=1&pageSize=20&includeMarkets=true")
    );
    const body = (await response.json()) as {
      ok: boolean;
      items: Array<{ marketQuestion: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items[0]?.marketQuestion).toBe("Will Team A win?");
    expect(mocks.getPredictionMarketById).not.toHaveBeenCalled();
  });

  it("falls back to live market lookup when snapshot is missing", async () => {
    mocks.listUserPredictions.mockResolvedValue({
      totalItems: 1,
      items: [
        {
          id: "pick-2",
          userId: "u1",
          predictionId: "m2",
          outcomeId: "m2-0",
          outcomeTitle: "Yes",
          points: 10,
          status: "pending",
          createdAt: "2026-04-20T11:00:00.000Z",
        },
      ],
    });
    mocks.getPredictionMarketById.mockResolvedValue({
      id: "m2",
      question: "Will Team B win?",
      closesAt: "2026-04-20T12:00:00.000Z",
      sport: "Basketball",
      league: "NBA",
      source: "polymarket",
      outcomes: [
        { id: "m2-0", title: "Yes", probability: 60 },
        { id: "m2-1", title: "No", probability: 40 },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/picks?userId=u1&status=pending&page=1&pageSize=20&includeMarkets=true")
    );
    const body = (await response.json()) as {
      ok: boolean;
      items: Array<{ marketQuestion: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items[0]?.marketQuestion).toBe("Will Team B win?");
    expect(mocks.getPredictionMarketById).toHaveBeenCalledWith("m2");
  });
});
