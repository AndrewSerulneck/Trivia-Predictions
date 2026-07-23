import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";

// ── Mocks ────────────────────────────────────────────────────────────────────
// rewards.ts is server-only and leans on two module boundaries: the schedule
// reader (listAdminLiveShowdownSchedules) and the engine (createChallengeCampaign).
// We stub both — the schedule reader returns fixtures, and createChallengeCampaign
// captures the expansion input so we can assert the engine field mapping without a DB.
const mocks = vi.hoisted(() => ({
  listAdminLiveShowdownSchedules: vi.fn(async (): Promise<AdminLiveShowdownSchedule[]> => []),
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "reward-1", ...input })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listAdminLiveShowdownSchedules: mocks.listAdminLiveShowdownSchedules,
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: mocks.createChallengeCampaign,
}));

import {
  REWARD_DEFINITIONS,
  SUPPORTED_REWARD_CADENCES,
  getRewardDefinition,
  renderRewardRequirement,
} from "@/lib/rewardDefinitions";
import {
  REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE,
  REWARD_UNKNOWN_DEFINITION_MESSAGE,
  REWARD_UNSUPPORTED_CADENCE_MESSAGE,
  REWARD_INVALID_PRIZE_MESSAGE,
  REWARD_INVALID_QUANTITY_MESSAGE,
  createReward,
  resolveRewardCreationContext,
  type RewardPrizeInput,
} from "@/lib/rewards";

function makeSchedule(overrides: Partial<AdminLiveShowdownSchedule> = {}): AdminLiveShowdownSchedule {
  return {
    id: "sched-1",
    title: "Tuesday Trivia",
    // 2026-07-21 is a Tuesday; 19:00 America/New_York.
    startTime: "2026-07-21T23:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["tue"],
    numRounds: 5,
    venueId: "venue-1",
    intermissionAdDelaySeconds: 0,
    lobbyAdEnabled: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const APPETIZER_PRIZE: RewardPrizeInput = {
  prizeKind: "menu_item",
  menuItem: "appetizer",
  discountKind: "percent",
  discountValue: 50,
};

beforeEach(() => {
  mocks.listAdminLiveShowdownSchedules.mockReset();
  mocks.createChallengeCampaign.mockClear();
});

describe("reward definition registry", () => {
  it("exposes the Live Trivia Challenge definition and renders its requirement copy", () => {
    const def = getRewardDefinition("live_trivia_challenge");
    expect(def).not.toBeNull();
    expect(def?.gameType).toBe("live-trivia");
    expect(def?.challengeMode).toBe("progress");
    expect(def?.requiresScheduledGame).toBe("live_trivia");
    expect(renderRewardRequirement(def!, 500)).toBe("Earn 500 points in Live Trivia");
    expect(getRewardDefinition("nope")).toBeNull();
  });

  it("only offers cadences the engine actually supports", () => {
    expect([...SUPPORTED_REWARD_CADENCES]).toEqual(["none", "weekly"]);
    // Every definition is progress mode (leaderboard is retired from creation).
    expect(REWARD_DEFINITIONS.every((d) => d.challengeMode === "progress")).toBe(true);
  });
});

describe("resolveRewardCreationContext", () => {
  it("blocks when Live Trivia is not scheduled at the venue", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
    expect(ctx.allowedCadences).toEqual([]);
  });

  it("offers one-off + weekly for a recurring schedule and anchors on its days", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(true);
    expect(ctx.hasRecurringSchedule).toBe(true);
    expect(ctx.allowedCadences).toEqual(["none", "weekly"]);
    expect(ctx.scheduleDays).toEqual(["tue"]);
  });

  it("offers only a one-off for a non-recurring schedule, anchoring on the start_time weekday", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [] }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.hasRecurringSchedule).toBe(false);
    expect(ctx.allowedCadences).toEqual(["none"]);
    // 2026-07-21T23:00Z is Tuesday 19:00 in America/New_York.
    expect(ctx.scheduleDays).toEqual(["tue"]);
  });

  it("filters schedules to the requested venue only", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ venueId: "other-venue" }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
  });

  it("does not offer weekly when a recurring schedule resolves to no weekday anchor", async () => {
    // recurringDays empty AND an unparseable startTime — scheduleWeekdays()
    // falls through to []. Without the gate, this would silently offer
    // "weekly" and later expand into activeDays: [], which computeCycleStart
    // treats as the epoch sentinel (quota never resets).
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "weekly", recurringDays: [], startTime: "not-a-date" }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.hasRecurringSchedule).toBe(true);
    expect(ctx.scheduleDays).toEqual([]);
    expect(ctx.allowedCadences).toEqual(["none"]);
  });
});

describe("createReward — expansion + validation", () => {
  it("expands a weekly Live Trivia Challenge into the proven engine field shape", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);

    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      threshold: 500,
      winnerQuota: 5,
      prize: APPETIZER_PRIZE,
      createdByOwnerId: "owner-9",
    });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledTimes(1);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Live Trivia Challenge",
        rules: "Earn 500 points in Live Trivia",
        venueIds: ["venue-1"],
        gameTypes: ["live-trivia"],
        challengeMode: "progress",
        pointsRequiredToWin: 500,
        scheduleType: "single_day",
        recurringType: "weekly",
        activeDays: ["tue"], // weekly cycle anchored on the Live Trivia day
        winnerQuota: 5,
        rewardDefinitionId: "live_trivia_challenge",
        prizeKind: "menu_item",
        prizeMenuItem: "appetizer",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 50,
        prizeGiftCertificateAmount: null,
        createdByOwnerId: "owner-9",
      }),
    );
  });

  it("expands a one-off reward with no day restriction", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);

    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "none",
      threshold: 750,
      winnerQuota: 1,
      prize: { prizeKind: "gift_card", amount: 25 },
    });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "none",
        activeDays: [],
        winnerQuota: 1,
        prizeKind: "gift_card",
        prizeGiftCertificateAmount: 25,
        prizeMenuItem: null,
        createdByOwnerId: null,
      }),
    );
  });

  it("rejects an unknown definition", async () => {
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "nope",
        cadence: "none",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_UNKNOWN_DEFINITION_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("blocks creation when Live Trivia is not scheduled", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "none",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects a weekly cadence when the venue's schedule is a one-off", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [] }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_UNSUPPORTED_CADENCE_MESSAGE);
  });

  it("rejects a weekly cadence when the recurring schedule has no resolvable weekday", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "weekly", recurringDays: [], startTime: "not-a-date" }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_UNSUPPORTED_CADENCE_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range winner quantity", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 0,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_INVALID_QUANTITY_MESSAGE);
  });

  it("rejects an invalid menu-item prize (percent over 100)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: { prizeKind: "menu_item", menuItem: "appetizer", discountKind: "percent", discountValue: 150 },
      }),
    ).rejects.toThrow(REWARD_INVALID_PRIZE_MESSAGE);
  });

  it("allows a game_winner reward", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "game_winner",
      threshold: 500,
      winnerQuota: 1,
      prize: APPETIZER_PRIZE,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ winCondition: "game_winner" }),
    );
  });

  it("requires a free-text name when the menu item is 'other'", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: { prizeKind: "menu_item", menuItem: "other", discountKind: "dollar", discountValue: 10 },
      }),
    ).rejects.toThrow(REWARD_INVALID_PRIZE_MESSAGE);
  });
});
