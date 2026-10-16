import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/partner-results-page-plan.md: the one remaining history route, the reward detail, goes through
// withOwnerVenue — a signed-in partner AND a venueId they control, checked BEFORE any history is read.
// (The timeline, standings and breakdown routes are covered by tests/api.owner.results.test.ts.)

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ ownerId: string; venueIds: string[] }> => ({ ownerId: "owner-1", venueIds: ["venue-1"] })),
  getOwnerRewardDetail: vi.fn(async (_params: Record<string, unknown>) => ({ rewardId: "r" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.auth }));
vi.mock("@/lib/ownerHistory", () => ({ getOwnerRewardDetail: mocks.getOwnerRewardDetail }));

import { GET as rewardRoute } from "@/app/api/owner/history/rewards/[rewardId]/route";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";

const reward = (query: string, rewardId = "reward-1") =>
  rewardRoute(new Request(`http://localhost/api/owner/history/rewards/${rewardId}?${query}`), {
    params: Promise.resolve({ rewardId }),
  });

beforeEach(() => {
  mocks.auth.mockClear();
  mocks.getOwnerRewardDetail.mockClear();
});

describe("GET /api/owner/history/rewards/[rewardId]", () => {
  it("passes a signed-out request's 401 through and reads nothing", async () => {
    mocks.auth.mockImplementationOnce(async () => {
      throw new Response(JSON.stringify({ ok: false, code: "no_session" }), { status: 401 });
    });
    expect((await reward("venueId=venue-1")).status).toBe(401);
    expect(mocks.getOwnerRewardDetail).not.toHaveBeenCalled();
  });

  it("needs a venueId, and refuses another partner's venue with 403 before reading anything", async () => {
    expect((await reward("")).status).toBe(400);
    expect((await reward("venueId=venue-2")).status).toBe(403);
    expect(mocks.getOwnerRewardDetail).not.toHaveBeenCalled();
  });

  it("reads one reward for the partner's venue, uncached", async () => {
    const response = await reward("venueId=venue-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getOwnerRewardDetail).toHaveBeenCalledWith({ venueId: "venue-1", rewardId: "reward-1" });
    expect(await response.json()).toEqual({ ok: true, reward: { rewardId: "r" } });
  });

  it("answers 404 for a reward that isn't this venue's and 503 when a database function is missing", async () => {
    mocks.getOwnerRewardDetail.mockRejectedValueOnce(new ResultsNotFoundError("That reward wasn't found."));
    expect((await reward("venueId=venue-1", "other-venue-reward")).status).toBe(404);

    mocks.getOwnerRewardDetail.mockRejectedValueOnce(new ResultsUnavailableError("Past rewards aren't available yet."));
    expect((await reward("venueId=venue-1")).status).toBe(503);
  });

  it("maps any other failure to a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getOwnerRewardDetail.mockRejectedValueOnce(new Error("relation users does not exist"));
    const failed = await reward("venueId=venue-1");
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("relation users");
    spy.mockRestore();
  });
});
