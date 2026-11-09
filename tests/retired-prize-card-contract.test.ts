import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countActivePrizeCards, type ChallengeCampaignCard } from "@/components/venue/venueHubShared";
import { isRetiredPrize, prizeCardEndState } from "@/lib/prizeCardEndState";

// docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase A1: a retired prize (is_active false,
// winner_user_id null) never reaches VenueChallengesPanel unless the viewer won it this cycle, by ONE
// rule (lib/prizeCardEndState.ts) shared by the signed-in snapshot and the public listing. Card-level
// cases live in tests/lib.rewards-cycle-snapshot.test.ts ("retired prizes leave the panel").

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  listCampaigns: vi.fn(),
  resolveRequestUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  getChallengeCampaignSnapshotForUser: mocks.getSnapshot,
  listChallengeCampaigns: mocks.listCampaigns,
  attachLeaderboardSnapshotsToCampaigns: async (params: { campaigns: unknown[] }) => params.campaigns,
}));
vi.mock("@/lib/rewards", () => ({ attachRewardDescriptions: async (campaigns: unknown[]) => campaigns }));
vi.mock("@/lib/rankedPlaceCardData", () => ({ attachRankedPlaceCards: async (campaigns: unknown[]) => campaigns }));
vi.mock("@/lib/serverSession", () => ({ resolveRequestUserId: mocks.resolveRequestUserId }));

import { GET } from "@/app/api/challenge-campaigns/route";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe("prizeCardEndState — the one rule", () => {
  const retired = { isActive: false, winnerUserId: null };

  it("retired = inactive with no winner; won out and active are not retired", () => {
    expect(isRetiredPrize(retired)).toBe(true);
    expect(isRetiredPrize({ isActive: false, winnerUserId: "u1" })).toBe(false);
    expect(isRetiredPrize({ isActive: true, winnerUserId: null })).toBe(false);
  });

  it("a retired prize drops unless the viewer won it this cycle", () => {
    expect(prizeCardEndState({ campaign: retired, viewerWon: false })).toEqual({ prizeEnded: true, dropCard: true });
    expect(prizeCardEndState({ campaign: retired, viewerWon: true })).toEqual({ prizeEnded: true, dropCard: false });
  });

  it("won-out and active prizes are not ended", () => {
    const live = { prizeEnded: false, dropCard: false };
    expect(prizeCardEndState({ campaign: { isActive: false, winnerUserId: "u1" }, viewerWon: false })).toEqual(live);
    expect(prizeCardEndState({ campaign: { isActive: true }, viewerWon: false })).toEqual(live);
  });

  it("a Pick 'Em Prize's own state wins (its Ended grace period)", () => {
    const ended = { prizeEnded: true, dropCard: false };
    expect(prizeCardEndState({ campaign: retired, viewerWon: false, pickemPrize: ended })).toEqual(ended);
  });
});

describe("GET /api/challenge-campaigns — the public listing drops retired prizes too", () => {
  it("no viewer: retired gone, won-out and active kept", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: "", forbidden: false });
    mocks.listCampaigns.mockResolvedValue([
      { id: "active", isActive: true, winnerUserId: null },
      { id: "retired", isActive: false, winnerUserId: null },
      { id: "won-out", isActive: false, winnerUserId: "u1" },
    ]);
    const body = await (
      await GET(new Request("http://localhost/api/challenge-campaigns?venueId=v&includeInactive=true&includeResolved=true"))
    ).json();
    expect(body.campaigns.map((card: { id: string }) => card.id)).toEqual(["active", "won-out"]);
  });
});

describe("source contract", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("the snapshot and the public listing both decide through prizeCardEndState", () => {
    expect(read("lib/challengeCampaigns.ts")).toMatch(/prizeCardEndState\(\{ campaign, viewerWon: viewerWin !== null, pickemPrize:/);
    expect(read("app/api/challenge-campaigns/route.ts")).toMatch(/prizeCardEndState\(\{ campaign, viewerWon: false \}\)\.dropCard/);
  });

  it("no second drop rule: the snapshot never filters on the Pick 'Em state's dropCard directly", () => {
    expect(read("lib/challengeCampaigns.ts")).not.toMatch(/pickemStateById\.get\([^)]*\)\?\.dropCard/);
  });

  it("Venue Home still reads its cards from /api/challenge-campaigns", () => {
    expect(read("components/venue/VenueHubClient.tsx")).toMatch(/`\/api\/challenge-campaigns\?\$\{query\.toString\(\)\}`/);
  });
});

describe("countActivePrizeCards follows", () => {
  const card = (overrides: Partial<ChallengeCampaignCard>): ChallengeCampaignCard =>
    ({ id: "c", winnerQuota: 1, quotaRemaining: 1, ...overrides }) as ChallengeCampaignCard;

  it("a retired prize the viewer won still counts (it shows You Won, not Ended)", () => {
    expect(countActivePrizeCards([card({ prizeEnded: true, viewerWon: true }), card({})])).toBe(2);
  });
});
