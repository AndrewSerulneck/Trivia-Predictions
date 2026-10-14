import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/live-trivia-weekly-places-reward-plan.md Phase 3: POST /api/owner/rewards forwards a weekly
// places reward's ladder and the optional minimum to createReward, and a refusal is a 400.

const mocks = vi.hoisted(() => ({
  createReward: vi.fn(async (params: Record<string, unknown>) => ({ id: "reward-1", ...params })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: async () => ({ ownerId: "owner-1", venueIds: ["venue-1"] }),
}));
vi.mock("@/lib/rewards", async () => {
  class RewardTermsError extends Error {}
  return {
    RewardTermsError,
    createReward: mocks.createReward,
    REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE: "a",
    REWARD_INVALID_PRIZE_MESSAGE: "b",
    REWARD_INVALID_QUANTITY_MESSAGE: "c",
    REWARD_INVALID_THRESHOLD_MESSAGE: "d",
    REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE: "e",
    REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE: "f",
    REWARD_UNKNOWN_DEFINITION_MESSAGE: "g",
    REWARD_UNSUPPORTED_CADENCE_MESSAGE: "h",
  };
});

import { POST } from "@/app/api/owner/rewards/route";
import { RewardTermsError } from "@/lib/rewards";

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/owner/rewards", { method: "POST", body: JSON.stringify(body) }));

const LADDER = [
  { prizeKind: "gift_card", amount: 30 },
  { prizeKind: "gift_card", amount: 20 },
];

beforeEach(() => {
  mocks.createReward.mockClear();
});

describe("POST /api/owner/rewards — weekly places", () => {
  it("forwards placePrizes and minPlayers, and returns them on the reward", async () => {
    const response = await post({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      winCondition: "ranked_places",
      placePrizes: LADDER,
      minPlayers: 4,
    });
    expect(response.status).toBe(200);
    expect(mocks.createReward).toHaveBeenCalledWith(
      expect.objectContaining({
        winCondition: "ranked_places",
        placePrizes: LADDER,
        minPlayers: 4,
        createdByOwnerId: "owner-1",
      }),
    );
    const json = (await response.json()) as { reward: { placePrizes: unknown; minPlayers: unknown } };
    expect(json.reward.placePrizes).toEqual(LADDER);
    expect(json.reward.minPlayers).toBe(4);
  });

  it("sends null for both when absent, and drops a non-array ladder", async () => {
    await post({ venueId: "venue-1", definitionId: "live_trivia_challenge", placePrizes: "nope" });
    expect(mocks.createReward).toHaveBeenCalledWith(expect.objectContaining({ placePrizes: null, minPlayers: null }));
  });

  it("maps a refusal to 400", async () => {
    mocks.createReward.mockRejectedValueOnce(new RewardTermsError("Choose a prize for each place, from 1 to 3 places."));
    const response = await post({ venueId: "venue-1", definitionId: "live_trivia_challenge", winCondition: "ranked_places" });
    expect(response.status).toBe(400);
  });
});
