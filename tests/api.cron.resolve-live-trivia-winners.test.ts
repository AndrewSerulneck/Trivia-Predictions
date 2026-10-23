import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/cron/resolve-live-trivia-winners runs the game-winner sweep, then the weekly
// ranked-places sweep (docs/live-trivia-weekly-places-reward-plan.md Phase 2). Each
// is in its own try/catch so one throwing never stops the other. It also sends the "Live Trivia starts
// soon" phone pushes (docs/native-app-store-plan.md Phase 5.1), again in its own try/catch.

const resolveGameWinnerRewards = vi.hoisted(() => vi.fn());
const resolveRankedPlaceRewards = vi.hoisted(() => vi.fn());
const isCronAuthorized = vi.hoisted(() => vi.fn(() => true));
const sendLiveGameStartPushes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/liveTriviaWinnerRewards", () => ({ resolveGameWinnerRewards }));
vi.mock("@/lib/liveTriviaRankedRewards", () => ({ resolveRankedPlaceRewards }));
vi.mock("@/lib/cronAuth", () => ({ isCronAuthorized }));
vi.mock("@/lib/push/gameReminders", () => ({ sendLiveGameStartPushes }));

import { GET, POST } from "@/app/api/cron/resolve-live-trivia-winners/route";

const gameReport = { occurrencesExamined: 2, campaignsExamined: 1, resolutions: [], belowMinimum: [], errors: [] };
const rankedReport = { campaignsExamined: 1, weeksDue: 1, weeksSettled: 1, settlements: [], errors: [] };
const pushReport = { skipped: "not-configured", upcoming: 0, claimed: 0, sent: 0, failed: 0, disabledDevices: 0 };
const request = () => new Request("https://example.test/api/cron/resolve-live-trivia-winners", { method: "POST" });

beforeEach(() => {
  isCronAuthorized.mockReturnValue(true);
  resolveGameWinnerRewards.mockResolvedValue(gameReport);
  resolveRankedPlaceRewards.mockResolvedValue(rankedReport);
  sendLiveGameStartPushes.mockResolvedValue(pushReport);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("resolve-live-trivia-winners cron", () => {
  it("rejects an unauthorized request without running either sweep", async () => {
    isCronAuthorized.mockReturnValue(false);
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(resolveGameWinnerRewards).not.toHaveBeenCalled();
    expect(resolveRankedPlaceRewards).not.toHaveBeenCalled();
    expect(sendLiveGameStartPushes).not.toHaveBeenCalled();
  });

  it("runs both sweeps on the same clock, game winners first, and keeps the old top-level shape", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, ...gameReport, rankedPlaces: rankedReport, gameStartPushes: pushReport });
    const gameNow = resolveGameWinnerRewards.mock.calls[0][0];
    expect(resolveRankedPlaceRewards).toHaveBeenCalledWith(gameNow);
    expect(sendLiveGameStartPushes).toHaveBeenCalledWith(gameNow);
    expect(resolveGameWinnerRewards.mock.invocationCallOrder[0]).toBeLessThan(
      resolveRankedPlaceRewards.mock.invocationCallOrder[0],
    );
  });

  it("still runs the weekly sweep when the game-winner sweep throws", async () => {
    resolveGameWinnerRewards.mockRejectedValue(new Error("schedules down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("schedules down");
    expect(body.rankedPlaces).toEqual(rankedReport);
  });

  it("still reports the game-winner sweep when the weekly sweep throws", async () => {
    resolveRankedPlaceRewards.mockRejectedValue(new Error("ranked read failed"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      ...gameReport,
      rankedPlaces: { error: "ranked read failed" },
      gameStartPushes: pushReport,
    });
  });

  it("a failing game-start push never stops the prize sweeps, and is reported", async () => {
    sendLiveGameStartPushes.mockRejectedValue(new Error("fcm down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, ...gameReport, rankedPlaces: rankedReport, gameStartPushes: { error: "fcm down" } });
    expect(resolveGameWinnerRewards).toHaveBeenCalled();
    expect(resolveRankedPlaceRewards).toHaveBeenCalled();
  });
});
