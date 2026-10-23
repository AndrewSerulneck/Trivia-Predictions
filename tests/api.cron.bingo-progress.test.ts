import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshSportsBingoProgress: vi.fn(),
  sendPendingNotificationPushes: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  refreshSportsBingoProgress: mocks.refreshSportsBingoProgress,
}));
vi.mock("@/lib/push/outbox", () => ({
  sendPendingNotificationPushes: mocks.sendPendingNotificationPushes,
}));

const pushReport = { claimedRows: 2, sent: 2, failed: 0, muted: 0, disabledDevices: 0 };

import { GET, POST } from "@/app/api/cron/bingo-progress/route";

describe("/api/cron/bingo-progress", () => {
  beforeEach(() => {
    mocks.refreshSportsBingoProgress.mockReset();
    mocks.sendPendingNotificationPushes.mockReset();
    mocks.sendPendingNotificationPushes.mockResolvedValue(pushReport);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "secret";
  });

  it("returns 401 for unauthorized requests", async () => {
    const response = await POST(new Request("http://localhost/api/cron/bingo-progress", { method: "POST" }));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Unauthorized");
    expect(mocks.refreshSportsBingoProgress).not.toHaveBeenCalled();
    expect(mocks.sendPendingNotificationPushes).not.toHaveBeenCalled();
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
    expect((body as unknown as { push: typeof pushReport }).push).toEqual(pushReport);
    // The outbox runs after the refresh, so a Bingo win graded this minute is pushed this minute.
    expect(mocks.refreshSportsBingoProgress.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendPendingNotificationPushes.mock.invocationCallOrder[0],
    );
  });

  it("still pushes when the Bingo refresh throws, and reports both", async () => {
    mocks.refreshSportsBingoProgress.mockRejectedValue(new Error("bingo down"));
    const response = await POST(
      new Request("http://localhost/api/cron/bingo-progress", { method: "POST", headers: { authorization: "Bearer secret" } })
    );
    const body = (await response.json()) as { ok: boolean; error: string; push: typeof pushReport };
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("bingo down");
    expect(body.push).toEqual(pushReport);
  });

  it("a failing outbox never hides a good Bingo refresh, and is reported", async () => {
    mocks.refreshSportsBingoProgress.mockResolvedValue({ scannedCards: 1 });
    mocks.sendPendingNotificationPushes.mockRejectedValue(new Error("rpc missing"));
    const response = await POST(
      new Request("http://localhost/api/cron/bingo-progress", { method: "POST", headers: { authorization: "Bearer secret" } })
    );
    const body = (await response.json()) as { ok: boolean; result: { scannedCards: number }; push: { error: string } };
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.result.scannedCards).toBe(1);
    expect(body.push).toEqual({ error: "rpc missing" });
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
