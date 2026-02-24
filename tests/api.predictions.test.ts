import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPredictionMarkets: vi.fn(),
  submitPredictionPick: vi.fn(),
  getPredictionQuota: vi.fn(),
}));

vi.mock("@/lib/polymarket", () => ({
  listPredictionMarkets: mocks.listPredictionMarkets,
}));

vi.mock("@/lib/userPredictions", () => ({
  submitPredictionPick: mocks.submitPredictionPick,
  getPredictionQuota: mocks.getPredictionQuota,
}));

import { GET, POST } from "@/app/api/predictions/route";

describe("/api/predictions", () => {
  beforeEach(() => {
    mocks.listPredictionMarkets.mockReset();
    mocks.submitPredictionPick.mockReset();
    mocks.getPredictionQuota.mockReset();
  });

  it("returns paginated market payload", async () => {
    mocks.listPredictionMarkets.mockResolvedValue({
      items: [{ id: "m1", question: "Q", source: "polymarket", closesAt: new Date().toISOString(), outcomes: [] }],
      page: 2,
      pageSize: 100,
      totalItems: 250,
      totalPages: 3,
      categories: ["Politics"],
    });

    const response = await GET(new Request("http://localhost/api/predictions?page=2&pageSize=100"));
    const body = (await response.json()) as { ok: boolean; page: number; totalPages: number };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.page).toBe(2);
    expect(body.totalPages).toBe(3);
  });

  it("returns 502 when polymarket load fails", async () => {
    mocks.listPredictionMarkets.mockRejectedValue(new Error("Polymarket request failed with status 500."));

    const response = await GET(new Request("http://localhost/api/predictions"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Polymarket");
  });

  it("returns 400 for invalid pick payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", predictionId: "" }),
      })
    );

    const body = (await response.json()) as { ok: boolean; error: string };
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("required");
  });

  it("returns pick + quota on success", async () => {
    mocks.submitPredictionPick.mockResolvedValue({ id: "p1" });
    mocks.getPredictionQuota.mockResolvedValue({
      limit: 25,
      picksUsed: 1,
      picksRemaining: 24,
      windowSecondsRemaining: 0,
      isAdminBypass: false,
    });

    const response = await POST(
      new Request("http://localhost/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", predictionId: "m1", outcomeId: "m1-0" }),
      })
    );

    const body = (await response.json()) as {
      ok: boolean;
      pick: { id: string };
      quota: { picksRemaining: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pick.id).toBe("p1");
    expect(body.quota.picksRemaining).toBe(24);
  });
});
