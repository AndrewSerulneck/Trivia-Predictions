import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  resolvePendingPredictionMarket: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/admin", () => ({
  createAdminAdvertisement: vi.fn(),
  createAdminTriviaQuestion: vi.fn(),
  deleteAdminAdvertisement: vi.fn(),
  deleteAdminTriviaQuestion: vi.fn(),
  getAdminAdsDebugSnapshot: vi.fn(),
  listPendingPredictionSummaries: vi.fn(),
  listAdminAdvertisements: vi.fn(),
  listAdminTriviaQuestions: vi.fn(),
  resolvePendingPredictionMarket: mocks.resolvePendingPredictionMarket,
  updateAdminAdvertisement: vi.fn(),
  updateAdminTriviaQuestion: vi.fn(),
}));

vi.mock("@/lib/ads", () => ({
  recordAdClick: vi.fn(),
  recordAdImpression: vi.fn(),
}));

import { POST } from "@/app/api/admin/route";

describe("POST /api/admin predictions-settle", () => {
  beforeEach(() => {
    mocks.requireAdminAuth.mockReset();
    mocks.resolvePendingPredictionMarket.mockReset();
  });

  it("returns auth error when caller is not admin", async () => {
    mocks.requireAdminAuth.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const request = new Request("http://localhost/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "predictions-settle",
        predictionId: "market-1",
        winningOutcomeId: "outcome-a",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.resolvePendingPredictionMarket).not.toHaveBeenCalled();
  });

  it("returns settlement result on success", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.resolvePendingPredictionMarket.mockResolvedValue({
      affectedPicks: 5,
      winners: 2,
      losers: 3,
      canceled: 0,
    });

    const request = new Request("http://localhost/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "predictions-settle",
        predictionId: "market-2",
        winningOutcomeId: "outcome-b",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      result: { affectedPicks: number; winners: number; losers: number; canceled: number };
    };

    expect(response.status).toBe(200);
    expect(mocks.resolvePendingPredictionMarket).toHaveBeenCalledWith({
      predictionId: "market-2",
      winningOutcomeId: "outcome-b",
      settleAsCanceled: undefined,
    });
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({
      affectedPicks: 5,
      winners: 2,
      losers: 3,
      canceled: 0,
    });
  });

  it("returns 500 when settlement throws", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.resolvePendingPredictionMarket.mockRejectedValue(
      new Error("Failed to settle prediction market.")
    );

    const request = new Request("http://localhost/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "predictions-settle",
        predictionId: "market-3",
        winningOutcomeId: "outcome-c",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Failed to settle prediction market." });
  });
});
