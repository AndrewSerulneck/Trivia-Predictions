import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): every Game Results route goes through
// withOwnerVenue — a signed-in partner AND a venueId they control, checked BEFORE any history is read.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ ownerId: string; venueIds: string[] }> => ({ ownerId: "owner-1", venueIds: ["venue-1"] })),
  listOwnerGameHistory: vi.fn(async (_params: Record<string, unknown>) => ({ games: [], nextBefore: null })),
  listOwnerRewardHistory: vi.fn(async (_params: Record<string, unknown>) => ({ rewards: [], nextBefore: null })),
  getOwnerGameDetail: vi.fn(async (_params: Record<string, unknown>) => ({ scheduleId: "s" })),
  getOwnerRewardDetail: vi.fn(async (_params: Record<string, unknown>) => ({ rewardId: "r" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.auth }));
// The error classes are the real ones (lib/results/errors.ts, pure): the gate checks them by class.
vi.mock("@/lib/ownerHistory", async () => {
  const errors = await import("@/lib/results/errors");
  return {
    OwnerHistoryUnavailableError: errors.ResultsUnavailableError,
    OwnerHistoryNotFoundError: errors.ResultsNotFoundError,
    listOwnerGameHistory: mocks.listOwnerGameHistory,
    listOwnerRewardHistory: mocks.listOwnerRewardHistory,
    getOwnerGameDetail: mocks.getOwnerGameDetail,
    getOwnerRewardDetail: mocks.getOwnerRewardDetail,
  };
});

import { GET as listRoute } from "@/app/api/owner/history/route";
import { GET as gameRoute } from "@/app/api/owner/history/games/[scheduleId]/route";
import { GET as rewardRoute } from "@/app/api/owner/history/rewards/[rewardId]/route";
import { OwnerHistoryNotFoundError, OwnerHistoryUnavailableError } from "@/lib/ownerHistory";

const list = (query: string) => listRoute(new Request(`http://localhost/api/owner/history?${query}`));
const readers = [mocks.listOwnerGameHistory, mocks.listOwnerRewardHistory, mocks.getOwnerGameDetail, mocks.getOwnerRewardDetail];

beforeEach(() => {
  for (const mock of [mocks.auth, ...readers]) mock.mockClear();
});

describe("GET /api/owner/history", () => {
  it("passes a signed-out request's 401 through and reads nothing", async () => {
    mocks.auth.mockImplementationOnce(async () => {
      throw new Response(JSON.stringify({ ok: false, code: "no_session" }), { status: 401 });
    });
    const response = await list("venueId=venue-1&kind=games");
    expect(response.status).toBe(401);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });

  it("refuses another partner's venue with 403 before reading anything", async () => {
    const response = await list("venueId=venue-2&kind=games");
    expect(response.status).toBe(403);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });

  it("needs a venueId and a known kind", async () => {
    expect((await list("kind=games")).status).toBe(400);
    expect((await list("venueId=venue-1&kind=bingo")).status).toBe(400);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });

  it("reads the games or rewards page for the partner's venue, uncached, with the cursor", async () => {
    const games = await list("venueId=venue-1&kind=games&before=2026-10-07");
    expect(games.status).toBe(200);
    expect(games.headers.get("Cache-Control")).toBe("no-store");
    expect(await games.json()).toEqual({ ok: true, games: [], nextBefore: null });
    expect(mocks.listOwnerGameHistory).toHaveBeenCalledWith({ venueId: "venue-1", before: "2026-10-07" });

    const rewards = await list("venueId=venue-1&kind=rewards");
    expect(rewards.status).toBe(200);
    expect(mocks.listOwnerRewardHistory).toHaveBeenCalledWith({ venueId: "venue-1", before: null });
  });

  it("maps not-deployed to 503 and any other failure to a generic 500", async () => {
    mocks.listOwnerGameHistory.mockRejectedValueOnce(new OwnerHistoryUnavailableError("Past games aren't available yet."));
    const unavailable = await list("venueId=venue-1&kind=games");
    expect(unavailable.status).toBe(503);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listOwnerGameHistory.mockRejectedValueOnce(new Error("relation users does not exist"));
    const failed = await list("venueId=venue-1&kind=games");
    expect(failed.status).toBe(500);
    expect(((await failed.json()) as { error: string }).error).toBe("Couldn't load game results.");
    spy.mockRestore();
  });
});

describe("GET /api/owner/history/games/[scheduleId] and /rewards/[rewardId]", () => {
  it("reads one game of the partner's venue by schedule + date", async () => {
    const response = await gameRoute(new Request("http://localhost/api/owner/history/games/sched-1?venueId=venue-1&date=2026-10-09"), {
      params: Promise.resolve({ scheduleId: "sched-1" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getOwnerGameDetail).toHaveBeenCalledWith({ venueId: "venue-1", scheduleId: "sched-1", occurrenceDate: "2026-10-09" });
    expect(await response.json()).toEqual({ ok: true, game: { scheduleId: "s" } });
  });

  it("answers 404 for a game or reward that isn't this venue's", async () => {
    mocks.getOwnerGameDetail.mockRejectedValueOnce(new OwnerHistoryNotFoundError("That game wasn't found."));
    const game = await gameRoute(new Request("http://localhost/x?venueId=venue-1&date=2026-10-09"), {
      params: Promise.resolve({ scheduleId: "other-venue-schedule" }),
    });
    expect(game.status).toBe(404);

    mocks.getOwnerRewardDetail.mockRejectedValueOnce(new OwnerHistoryNotFoundError("That reward wasn't found."));
    const reward = await rewardRoute(new Request("http://localhost/x?venueId=venue-1"), {
      params: Promise.resolve({ rewardId: "other-venue-reward" }),
    });
    expect(reward.status).toBe(404);
  });

  it("refuses another partner's venue with 403 on the detail routes too", async () => {
    const game = await gameRoute(new Request("http://localhost/x?venueId=venue-2&date=2026-10-09"), {
      params: Promise.resolve({ scheduleId: "sched-1" }),
    });
    const reward = await rewardRoute(new Request("http://localhost/x?venueId=venue-2"), {
      params: Promise.resolve({ rewardId: "reward-1" }),
    });
    expect([game.status, reward.status]).toEqual([403, 403]);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });
});
