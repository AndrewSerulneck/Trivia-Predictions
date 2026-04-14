import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autoSettleResolvedPredictionMarkets: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  autoSettleResolvedPredictionMarkets: mocks.autoSettleResolvedPredictionMarkets,
}));

import { GET, POST } from "@/app/api/cron/predictions-settle/route";

const originalCronSecret = process.env.CRON_SECRET;

describe("/api/cron/predictions-settle", () => {
  beforeEach(() => {
    mocks.autoSettleResolvedPredictionMarkets.mockReset();
    delete process.env.CRON_SECRET;
  });

  afterAll(() => {
    if (typeof originalCronSecret === "string") {
      process.env.CRON_SECRET = originalCronSecret;
      return;
    }
    delete process.env.CRON_SECRET;
  });

  it("returns unauthorized when no auth headers are provided", async () => {
    const response = await POST(new Request("http://localhost/api/cron/predictions-settle", { method: "POST" }));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized cron request." });
    expect(mocks.autoSettleResolvedPredictionMarkets).not.toHaveBeenCalled();
  });

  it("allows Vercel cron header when CRON_SECRET is not configured", async () => {
    mocks.autoSettleResolvedPredictionMarkets.mockResolvedValue({
      scannedMarkets: 3,
      settledMarkets: 2,
      affectedPicks: 9,
      winners: 4,
      losers: 5,
      canceled: 0,
    });

    const response = await POST(
      new Request("http://localhost/api/cron/predictions-settle", {
        method: "POST",
        headers: { "x-vercel-cron": "*/5 * * * *" },
      })
    );
    const body = (await response.json()) as { ok: boolean; result: { settledMarkets: number } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.settledMarkets).toBe(2);
    expect(mocks.autoSettleResolvedPredictionMarkets).toHaveBeenCalledTimes(1);
  });

  it("accepts bearer auth when CRON_SECRET is configured", async () => {
    process.env.CRON_SECRET = "top-secret";
    mocks.autoSettleResolvedPredictionMarkets.mockResolvedValue({
      scannedMarkets: 0,
      settledMarkets: 0,
      affectedPicks: 0,
      winners: 0,
      losers: 0,
      canceled: 0,
    });

    const response = await GET(
      new Request("http://localhost/api/cron/predictions-settle", {
        headers: { Authorization: "Bearer top-secret" },
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.autoSettleResolvedPredictionMarkets).toHaveBeenCalledTimes(1);
  });
});
