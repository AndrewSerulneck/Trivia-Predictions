import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshSportsBingoProgress: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  refreshSportsBingoProgress: mocks.refreshSportsBingoProgress,
}));

import { GET, POST } from "@/app/api/cron/bingo-progress/route";

describe("/api/cron/bingo-progress", () => {
  beforeEach(() => {
    mocks.refreshSportsBingoProgress.mockReset();
    process.env.CRON_SECRET = "secret";
  });

  it("returns 401 for unauthorized requests", async () => {
    const response = await POST(new Request("http://localhost/api/cron/bingo-progress", { method: "POST" }));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Unauthorized");
    expect(mocks.refreshSportsBingoProgress).not.toHaveBeenCalled();
  });

  it("runs refresh for authorized requests", async () => {
    mocks.refreshSportsBingoProgress.mockResolvedValue({
      scannedCards: 3,
      updatedSquares: 8,
      settledWins: 1,
      settledLosses: 1,
      nearWinAlerts: 1,
    });

    const response = await POST(
      new Request("http://localhost/api/cron/bingo-progress", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      result: { scannedCards: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.scannedCards).toBe(3);
    expect(mocks.refreshSportsBingoProgress).toHaveBeenCalledWith({ limit: 500 });
  });

  it("GET delegates to POST", async () => {
    mocks.refreshSportsBingoProgress.mockResolvedValue({
      scannedCards: 0,
      updatedSquares: 0,
      settledWins: 0,
      settledLosses: 0,
      nearWinAlerts: 0,
    });

    const response = await GET(
      new Request("http://localhost/api/cron/bingo-progress", {
        headers: { authorization: "Bearer secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.refreshSportsBingoProgress).toHaveBeenCalledTimes(1);
  });
});
