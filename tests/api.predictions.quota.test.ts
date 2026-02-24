import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPredictionQuota: vi.fn(),
}));

vi.mock("@/lib/userPredictions", () => ({
  getPredictionQuota: mocks.getPredictionQuota,
}));

import { GET } from "@/app/api/predictions/quota/route";

describe("GET /api/predictions/quota", () => {
  beforeEach(() => {
    mocks.getPredictionQuota.mockReset();
  });

  it("returns null quota when userId is missing", async () => {
    const response = await GET(new Request("http://localhost/api/predictions/quota"));
    const body = (await response.json()) as { ok: boolean; quota: null };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, quota: null });
    expect(mocks.getPredictionQuota).not.toHaveBeenCalled();
  });

  it("returns quota for user", async () => {
    mocks.getPredictionQuota.mockResolvedValue({
      limit: 25,
      picksUsed: 4,
      picksRemaining: 21,
      windowSecondsRemaining: 0,
      isAdminBypass: false,
    });

    const response = await GET(new Request("http://localhost/api/predictions/quota?userId=u1"));
    const body = (await response.json()) as {
      ok: boolean;
      quota: { picksRemaining: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.quota.picksRemaining).toBe(21);
  });
});
