import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4: GET /api/challenge-campaigns attaches the weekly standing in BOTH branches — the signed-in
// viewer's (their own rank) and the anonymous list (no viewer) — after the descriptions.

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  listCampaigns: vi.fn(),
  attachLeaderboard: vi.fn(),
  attachDescriptions: vi.fn(),
  attachRanked: vi.fn(),
  resolveRequestUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  getChallengeCampaignSnapshotForUser: mocks.getSnapshot,
  listChallengeCampaigns: mocks.listCampaigns,
  attachLeaderboardSnapshotsToCampaigns: mocks.attachLeaderboard,
}));
vi.mock("@/lib/rewards", () => ({ attachRewardDescriptions: mocks.attachDescriptions }));
vi.mock("@/lib/rankedPlaceCardData", () => ({ attachRankedPlaceCards: mocks.attachRanked }));
vi.mock("@/lib/serverSession", () => ({ resolveRequestUserId: mocks.resolveRequestUserId }));

import { GET } from "@/app/api/challenge-campaigns/route";

const request = (query: string) => new Request(`http://localhost/api/challenge-campaigns?${query}`);

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.attachDescriptions.mockImplementation(async (campaigns: unknown[]) => campaigns);
  mocks.attachLeaderboard.mockImplementation(async (params: { campaigns: unknown[] }) => params.campaigns);
  mocks.attachRanked.mockImplementation(async (campaigns: unknown[]) => campaigns);
});

describe("GET /api/challenge-campaigns — weekly standing", () => {
  it("signed in: the standing is built for THIS viewer, from the described cards", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: "user-1", forbidden: false });
    mocks.getSnapshot.mockResolvedValue([{ id: "c1", isActive: true, winnerUserId: null }]);
    mocks.attachDescriptions.mockResolvedValue([{ id: "c1", isActive: true, description: { summary: "s" } }]);
    mocks.attachRanked.mockResolvedValue([{ id: "c1", rankedPlaces: { phase: "live" } }]);

    const body = await (await GET(request("venueId=venue-1&userId=user-1"))).json();

    expect(mocks.attachRanked).toHaveBeenCalledWith([{ id: "c1", isActive: true, description: { summary: "s" } }], "venue-1", "user-1");
    expect(body.campaigns).toEqual([{ id: "c1", rankedPlaces: { phase: "live" } }]);
  });

  it("a forged or missing viewer gets the public list with no viewer in the standing", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: "someone-else", forbidden: true });
    mocks.listCampaigns.mockResolvedValue([{ id: "c1", isActive: true }]);

    await GET(request("venueId=venue-1&userId=someone-else"));

    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.attachRanked).toHaveBeenCalledWith(expect.anything(), "venue-1", null);
  });

  it("a venue with no ranked reward still answers from the same shape", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: "", forbidden: false });
    mocks.listCampaigns.mockResolvedValue([{ id: "c1", isActive: true }]);
    const body = await (await GET(request("venueId=venue-1"))).json();
    expect(body).toEqual({ ok: true, campaigns: [{ id: "c1", isActive: true, progressPoints: 0 }] });
  });
});
